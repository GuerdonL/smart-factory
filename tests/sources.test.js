/* sources.js: blocks that have values at any size without storing them. Run with: node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, DATA, DISTS, kept, kindOf, remote, labelOf, faceOf, noise, seedOf, dataPath, dataName, tooSmall, smallSays, entry, values, typable, holds, sizable } from '../sources.js';

const rows = (kind, cols, rows_) => Array.from({ length: rows_ }, (_, r) => Array.from({ length: cols }, (_, c) => values(kind, cols, rows_).get((c + 1) + ',' + (r + 1))).join(' '));

test('the three kinds, in the order they are offered, each with what is written on its face', () => {
  assert.deepEqual(SOURCES.map(s => [s.kind, s.label, s.face]), [['zeros', 'Zeros', '0'], ['ones', 'Ones', '1'], ['identity', 'Identity', 'I']]);
  assert.equal(faceOf('zeros'), '0'); assert.equal(faceOf('ones'), '1'); assert.equal(faceOf('identity'), 'I');
  assert.equal(faceOf(null), null); assert.equal(faceOf('noise'), null);
});

test('zeros is 0 and ones is 1, everywhere', () => {
  assert.deepEqual(rows('zeros', 3, 2), ['0 0 0', '0 0 0']);
  assert.deepEqual(rows('ones', 2, 3), ['1 1', '1 1', '1 1']);
  assert.equal(entry('zeros', 400, 9), 0); assert.equal(entry('ones', 1, 1), 1);
});

test('identity is 1 where the column is the row and 0 elsewhere: 3 by 3 has three ones, 5 by 5 has five', () => {
  assert.deepEqual(rows('identity', 3, 3), ['1 0 0', '0 1 0', '0 0 1']);
  const ones = n => [...values('identity', n, n).values()].filter(v => v === 1).length;
  assert.equal(ones(3), 3); assert.equal(ones(5), 5);
  assert.equal(values('identity', 5, 5).get('5,5'), 1); assert.equal(values('identity', 5, 5).get('5,4'), 0);
});

test('identity need not be square: the ones run down the diagonal as far as the shorter side', () => {
  assert.deepEqual(rows('identity', 4, 2), ['1 0 0 0', '0 1 0 0']);
  assert.deepEqual(rows('identity', 2, 3), ['1 0', '0 1', '0 0']);
  assert.deepEqual(rows('identity', 1, 1), ['1']);
  assert.deepEqual(rows('identity', 1, 3), ['1', '0', '0']);
});

test('resizing changes how many entries there are, never what they are', () => {
  const small = values('identity', 2, 2), large = values('identity', 4, 3);
  assert.equal(small.size, 4); assert.equal(large.size, 12);
  for (const [key, v] of small) assert.equal(large.get(key), v);
});

test('a place that is no entry, and a kind that is no source, have no value', () => {
  assert.equal(entry('identity', 0, 1), undefined); assert.equal(entry('zeros', 1, 0), undefined); assert.equal(entry('ones', 1.5, 1), undefined);
  assert.equal(entry('noise', 1, 1), undefined); assert.equal(entry(null, 1, 1), undefined);
  assert.equal(values('noise', 2, 2).size, 0); assert.equal(values('zeros', 0, 2).size, 0); assert.equal(values('zeros', 2, 1.5).size, 0);
});

test('only a kind this program has is kept: anything else read from a file is no source', () => {
  assert.equal(kept('zeros'), 'zeros'); assert.equal(kept('ones'), 'ones'); assert.equal(kept('identity'), 'identity');
  for (const other of [null, undefined, '', 'Zeros', 'noise', { seed: 1 }, [], 1, true]) assert.equal(kept(other), null);
});

test('entries cannot be typed into a source, and nothing stands in its matrix; any other block takes both', () => {
  assert.deepEqual(typable(null, 'Keys'), { ok: true }); assert.deepEqual(holds(null, 'Keys'), { ok: true });
  assert.deepEqual(typable('noise', 'Keys'), { ok: true });      /* not a source here */
  assert.match(typable('zeros', 'Bias').refused, /^Bias is zeros: a source stores no entries/);
  assert.match(typable('identity', 'Eye').refused, /^Eye is an identity: a source/);
  assert.match(holds('ones', 'One').refused, /^One is ones: a source is defined by its kind alone/);
  assert.match(typable('zeros', '').refused, /^It is zeros/);
});

/* ---- phase 7: noise and data files, whose numbers only the backend has ---- */
test('noise is kept as its seed and its distribution, and nothing else', () => {
  assert.deepEqual(DATA.map(s => [s.kind, s.label]), [['noise', 'Noise'], ['file', 'File']]); assert.deepEqual(DISTS, ['uniform', 'normal']);
  assert.deepEqual(kept({ noise: { seed: 7, dist: 'normal' } }), { noise: { seed: 7, dist: 'normal' } });
  assert.deepEqual(kept({ noise: { seed: 7, dist: 'normal', more: 1 }, x: 2 }), { noise: { seed: 7, dist: 'normal' } });
  assert.deepEqual(kept({ noise: {} }), { noise: { seed: 0, dist: 'uniform' } });      /* the defaults */
  assert.deepEqual(kept({ noise: { seed: 1.5, dist: 'cauchy' } }), { noise: { seed: 0, dist: 'uniform' } });
  assert.deepEqual(kept({ noise: { seed: -3 } }), { noise: { seed: -3, dist: 'uniform' } });
  assert.deepEqual(noise(), { noise: { seed: 0, dist: 'uniform' } });
  assert.equal(kindOf({ noise: {} }), 'noise'); assert.equal(kindOf('ones'), 'ones'); assert.equal(kindOf(null), null); assert.equal(kindOf({ file: null }), 'file');
  assert.equal(remote({ noise: {} }), true); assert.equal(remote({ file: 'data/a.csv' }), true); assert.equal(remote('identity'), false); assert.equal(remote(null), false);
  assert.equal(faceOf({ noise: {} }), '~'); assert.equal(faceOf({ file: null }), 'csv'); assert.equal(labelOf({ noise: {} }), 'noise'); assert.equal(labelOf('identity'), 'an identity');
  assert.equal(values({ noise: {} }, 2, 2).size, 0);      /* nothing here can say its numbers */
  assert.match(typable({ noise: {} }, 'N').refused, /^N is noise: a source stores no entries/); assert.match(holds({ file: 'data/a.csv' }, 'W').refused, /^W is a data file: a source/);
});
test('a seed is a whole number: the boundary', () => {
  assert.deepEqual(seedOf(0), { seed: 0 }); assert.deepEqual(seedOf(-12), { seed: -12 }); assert.deepEqual(seedOf(Number.MAX_SAFE_INTEGER), { seed: Number.MAX_SAFE_INTEGER });
  for (const no of [1.5, { n: 1, d: 2, k: 0 }, Infinity, null, true, '3', 2 ** 53, { f: 1 }]) assert.equal(seedOf(no).refused, 'A seed is a whole number');
});
test('a data file is at data/ and one .csv name, and nowhere else', () => {
  for (const ok of ['data/a.csv', 'data/My Weights-2.v1.csv', 'data/0.csv']) assert.equal(dataPath(ok), ok);
  for (const no of ['a.csv', 'data/a.json', 'data/../a.csv', 'data/..csv', 'data/sub/a.csv', '/data/a.csv', 'data/.a.csv', 'data\\a.csv', 'data/a.csv\0', 'data/a\0.csv', 'DATA/a.csv', 'data/.csv', 'data/' + 'a'.repeat(81) + '.csv', null, 7, {}])
    assert.equal(dataPath(no), null, String(no));
  assert.deepEqual(kept({ file: 'data/a.csv' }), { file: 'data/a.csv' });
  assert.deepEqual(kept({ file: '../../etc/passwd' }), { file: null });      /* a file source still, with no file chosen */
  assert.deepEqual(kept({ file: null }), { file: null });
});
test('the numbers of a file too small for 32 bits are counted, as the backend counts them', () => {
  /* the cases of backend/tests/test_data.py: written as other than nought, and nought in 32 bits */
  assert.equal(tooSmall('3.4e38,-3.4e38\n1e-60,' + '9'.repeat(38) + '\n'), 1);
  assert.equal(tooSmall('a,b,c\n1e-46, "-7e-46" ,1e-400\n0e-99,0.0,1.5e-45\n0.' + '0'.repeat(50) + '1,-0,7.1e-46\n'), 4);
  assert.equal(tooSmall('1,2\r\n3,4\r\n'), 0); assert.equal(tooSmall(''), 0); assert.equal(tooSmall(null), 0);
  assert.equal(tooSmall('1e-60\r\n1E-99\r2e-50'), 3);
  assert.equal(smallSays(0), null); assert.equal(smallSays(undefined), null);
  assert.equal(smallSays(1), '1 number too small for 32 bits was read as 0');
  assert.equal(smallSays(3), '3 numbers too small for 32 bits were read as 0');
  assert.equal(smallSays(1234), '1,234 numbers too small for 32 bits were read as 0');
});
test('a chosen file is given a path of its own under data/', () => {
  assert.equal(dataName('weights.csv'), 'data/weights.csv'); assert.equal(dataName('My Weights.CSV'), 'data/My Weights.csv');
  assert.equal(dataName('../../etc/passwd'), 'data/etc-passwd.csv'); assert.equal(dataName(''), 'data/data.csv'); assert.equal(dataName('...'), 'data/data.csv');
  assert.equal(dataName('a.csv', new Set(['data/a.csv'])), 'data/a-2.csv'); assert.equal(dataName('a.csv', new Set(['data/a.csv', 'data/a-2.csv'])), 'data/a-3.csv');
  for (const name of ['x'.repeat(300), 'ü.csv', 'a/b\\c.csv', '\0.csv', '..', '.hidden']) assert.equal(dataPath(dataName(name)), dataName(name), name);      /* whatever it was called, the path is one a project may hold */
});

test('a block that reads a file is the file\'s size and no other; before a file is chosen, and any other source, is any size', () => {
  assert.equal(sizable({ file: 'data/weights.csv' }, 'Weights').refused, 'Weights reads data/weights.csv: its size is the file\'s. Choose another CSV file to change it');
  assert.match(sizable({ file: 'data/a b.csv' }).refused, /^It reads data\/a b\.csv/);
  for (const free of [{ file: null }, { file: '../etc/passwd' }, { noise: { seed: 3, dist: 'normal' } }, 'zeros', 'ones', 'identity', null, undefined, 'file', {}]) assert.deepEqual(sizable(free, 'Keys'), { ok: true });
});
