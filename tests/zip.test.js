/* zip.js: a tree of text files as one zip, and back. Run with: node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zip, unzip } from '../zip.js';

const FILES = [
  { path: 'project.json', text: '{ "format": "smart-factory/project" }\n' },
  { path: 'Keys.json', text: '{ "name": "Keys" }\n' },
  { path: 'Keys/Key Weights.json', text: '{ "name": "Key Weights", "value": "√2 · ∜30 — ∞" }\n' },
  { path: 'Größe/形.json', text: 'ünïcödé 形 🙂\n' },
  { path: '.config', text: '' },
  { path: 'long.json', text: 'abcdefghij'.repeat(20000) },
];
const has = cmd => !spawnSync(cmd, ['--version']).error;
const inTemp = work => { const dir = mkdtempSync(join(tmpdir(), 'smart-factory-zip-')); try { return work(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test('files zipped come back as they went: paths, text, and order', async () => {
  assert.deepEqual(await unzip(zip(FILES)), FILES);
});

test('no files at all is still a zip', async () => {
  const bytes = zip([]);
  assert.equal(bytes.length, 22); assert.deepEqual(await unzip(bytes), []);
});

test('a zip is a Uint8Array that starts as zip files do, holding the text as it is', () => {
  const bytes = zip([{ path: 'a.json', text: 'plain text here' }]);
  assert.ok(bytes instanceof Uint8Array); assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 3, 4]);
  assert.ok(Buffer.from(bytes).includes('plain text here'));      /* stored, not compressed */
});

test('a zip is read wherever it sits in its buffer', async () => {
  const bytes = zip(FILES), wide = new Uint8Array(bytes.length + 100); wide.set(bytes, 60);
  assert.deepEqual(await unzip(wide.subarray(60, 60 + bytes.length)), FILES);
});

test('what is not a zip is refused', async () => {
  await assert.rejects(unzip(new Uint8Array(0)), /not a zip file/);
  await assert.rejects(unzip(new TextEncoder().encode('this is only some text, and long enough to look through')), /not a zip file/);
});

test('a damaged zip is refused', async () => {
  const bytes = zip(FILES.slice(0, 2)), end = bytes.length - 22;
  const at = new DataView(bytes.buffer).getUint32(end + 16, true);      /* where the list of files begins */
  bytes[at] = 0;
  await assert.rejects(unzip(bytes), /damaged zip file/);
  const badOffset = zip(FILES.slice(0, 1));
  new DataView(badOffset.buffer).setUint32(badOffset.length - 22 + 16, badOffset.length + 100, true);
  await assert.rejects(unzip(badOffset), /damaged zip file/);
  const badLocal = zip(FILES.slice(0, 1));
  const cd = new DataView(badLocal.buffer).getUint32(badLocal.length - 22 + 16, true);
  new DataView(badLocal.buffer).setUint32(cd + 42, badLocal.length + 100, true);
  await assert.rejects(unzip(badLocal), /damaged zip file/);
});

test('a zip made here opens with a computer\'s own tools', { skip: !has('python3') && 'python3 is not installed' }, () => inTemp(dir => {
  writeFileSync(join(dir, 'made.zip'), zip(FILES));
  const out = execFileSync('python3', ['-c', `
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
print(json.dumps([{'path': n, 'text': z.read(n).decode('utf8')} for n in z.namelist()]))`, join(dir, 'made.zip')], { encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.deepEqual(JSON.parse(out), FILES);
}));

test('a zip remade by a computer\'s own tools opens here: packed files are unpacked, directories passed over', { skip: !has('zip') && 'zip is not installed' }, async () => {
  const bytes = inTemp(dir => {
    for (const f of FILES){ mkdirSync(join(dir, 'tree', f.path, '..'), { recursive: true }); writeFileSync(join(dir, 'tree', f.path), f.text); }
    execFileSync('zip', ['-q', '-r', '../remade.zip', '.'], { cwd: join(dir, 'tree') });
    return new Uint8Array(readFileSync(join(dir, 'remade.zip')));
  });
  const got = await unzip(bytes), byPath = list => [...list].sort((a, b) => a.path < b.path ? -1 : 1);
  assert.deepEqual(byPath(got), byPath(FILES));
});
