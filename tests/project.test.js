/* project.js: a project written as a tree of files, and read back. Run with: node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { write, read, isNamed, FORMAT } from '../project.js';

/* a shape as read() gives one: every field present */
const shape = (name, more = {}) => ({ id: null, type: 'tensor', name, color: isNamed(name) ? 'variable-1' : null, x: 0, y: 0, cols: 2, rows: 3, colsName: null, rowsName: null,
  entries: {}, inside: null, variable: null, tile: false, transposed: false, attributes: [], reference: false, from: null, joined: null, ...more });
const space = (shapes = [], groups = []) => ({ shapes, groups });
const project = (top, more = {}) => ({ top, saved: '2026-11-16T00:00:00.000Z', ids: null, ...more });
const json = (files, path) => JSON.parse(files.find(f => f.path === path).text);
const paths = files => files.map(f => f.path).sort();
const file = (path, body) => ({ path, text: JSON.stringify(body) });
const head = (version = FORMAT) => file('project.json', { format: 'smart-factory/project', version });
const config = (name, more = {}) => ({ format: 'smart-factory/shape', version: FORMAT, name, ...more });

test('a project with everything in it comes back as it went', () => {
  const p = project(space([
    shape('Keys', { id: 'b0x7m2c', color: 'variable-3', x: -12, y: 4, cols: 4, rows: 6, colsName: 'key', rowsName: 'context', variable: 2,
      inside: space([shape('Embedding', { id: 'b111111', tile: true }), shape('Key Weights', { x: 5, entries: { '1,1': 3 } })]) }),
    shape('Shape 1', { entries: { '1,1': 0, '2,1': -Infinity, '1,2': Infinity, '2,3': -7 } }),
    shape('Keys', { id: 'b222222', color: 'variable-3', x: 20, cols: 6, rows: 4, variable: 2, reference: true, transposed: true }),
    shape('Width', { cols: 1, rows: 1, from: { id: 'b0x7m2c', side: 'x' } }),
    shape('Mass', { cols: 1, rows: 1, from: { id: 'b0x7m2c', side: 'm' }, attributes: [{ name: 'heads', value: '2^(3) + 1' }, { name: 'half', value: '√2 / 2' }] }),
    shape('// Old idea', { y: 30 }),
    shape('Joined', { cols: 4, rows: 2, joined: [{ fx: 0, fy: 0, fw: 0.5, fh: 1, shape: shape('Left', { entries: { '1,1': 1 } }) }, { fx: 0.5, fy: 0, fw: 0.5, fh: 1, shape: shape('Right') }] }),
    shape('In a frame', { x: 40 }), shape('In an inner frame', { x: 44 }), shape('.dark_mode', { cols: 1, rows: 1, entries: { '1,1': 1 } }),
  ], [
    { id: 'g4k09zq', name: 'Pair', members: [7], groups: [{ id: 'g000001', name: null, members: [8], groups: [] }] },
    { id: 'g000002', name: '.config', members: [9], groups: [] },
  ]), { ids: { seed: 42, at: 1234567 } });
  assert.deepEqual(read(write(p)), p);
});

test('writing what was read gives the same files', () => {
  const p = project(space([shape('A', { inside: space([shape('B')]) }), shape('Shape 2')], [{ id: null, name: 'G', members: [1], groups: [] }]));
  const files = write(p);
  assert.deepEqual(write(read(files)), files);
});

test('a space is a directory, a shape a file, a definition a directory beside it, a frame one file', () => {
  const files = write(project(space([shape('Keys', { inside: space([shape('Embedding')]) }), shape('Lone'), shape('Framed')],
    [{ id: null, name: 'Pair', members: [2], groups: [] }, { id: null, name: '.config', members: [], groups: [] }])));
  assert.deepEqual(paths(files), ['.config', 'Keys.json', 'Keys/Embedding.json', 'Lone.json', 'Pair.frame.json', 'project.json']);
  assert.equal(json(files, 'Keys.json').definition, 'Keys/');
  assert.equal(json(files, 'Pair.frame.json').shapes[0].name, 'Framed');
  assert.deepEqual(json(files, 'project.json'), { format: 'smart-factory/project', version: FORMAT, saved: '2026-11-16T00:00:00.000Z' });
  for (const f of files) assert.ok(f.text.endsWith('\n'), f.path + ' ends with a newline');
});

test('names are made safe to be file names, and different from one another', () => {
  const files = write(project(space([shape('Keys'), shape('Keys'), shape('keys'), shape('a/b: c?'), shape('project'), shape('_settings'),
    shape('// Old idea'), shape('...'), shape('x'.repeat(200))])));
  assert.deepEqual(paths(files), ['Keys (2).json', 'Keys.json', 'Old idea.json', '_settings shape.json', 'a-b- c-.json', 'keys (3).json',
    'project shape.json', 'project.json', 'shape.json', 'x'.repeat(80) + '.json'].sort());
  assert.equal(json(files, 'a-b- c-.json').name, 'a/b: c?');      /* the name itself is kept as it was */
});

test('only the first frame named .config is the file .config', () => {
  const files = write(project(space([], [{ id: null, name: '.config', members: [], groups: [] }, { id: null, name: '.config', members: [], groups: [] }])));
  assert.deepEqual(paths(files), ['.config', 'config.frame.json', 'project.json']);
  assert.equal(read(files).top.groups.length, 2);
});

test('value.as says how a shape\'s value stands', () => {
  const as = s => json(write(project(space([shape('S', s)]))), 'S.json').value.as;
  assert.equal(as({ cols: 2, rows: 1 }), 'variable');
  assert.equal(as({ cols: 2, rows: 1, entries: { '1,1': 4 } }), 'variable');
  assert.equal(as({ cols: 2, rows: 1, entries: { '1,1': 4, '2,1': Infinity } }), 'resolved');
  assert.equal(as({ inside: space([shape('Shape 1')]) }), 'computation');
  assert.equal(as({ inside: space([shape('// off')]) }), 'variable');      /* a commented shape works nothing out */
  assert.equal(as({ inside: space([]) }), 'variable');
});

test('infinity is written "inf" and "-inf"', () => {
  const files = write(project(space([shape('S', { entries: { '1,1': Infinity, '2,1': -Infinity, '1,2': 5 } })])));
  assert.deepEqual(json(files, 'S.json').value.entries, { '1,1': 'inf', '2,1': '-inf', '1,2': 5 });
});

test('a shape\'s config says whether it is named and whether it is commented', () => {
  const files = write(project(space([shape('Shape 12'), shape('Keys'), shape('// Keys'), shape('// Shape 3')])));
  const c = name => json(files, name + '.json');
  assert.deepEqual([c('Shape 12').named, c('Shape 12').commented, c('Shape 12').color], [false, false, null]);
  assert.deepEqual([c('Keys').named, c('Keys').commented, c('Keys').color], [true, false, 'variable-1']);
  assert.deepEqual([c('Keys (2)').named, c('Keys (2)').commented], [true, true]);
  assert.deepEqual([c('Shape 3').named, c('Shape 3').commented], [false, true]);
});

test('shapes come back in their order, back to front, whatever order the files are in', () => {
  const p = project(space([shape('C'), shape('A'), shape('B')]));
  assert.deepEqual(read(write(p).reverse()).top.shapes.map(s => s.name), ['C', 'A', 'B']);
});

test('a project is read from whatever directory project.json is in', () => {
  const files = write(project(space([shape('A', { inside: space([shape('B')]) })])));
  const moved = [...files.map(f => ({ path: 'saved\\my-project\\' + f.path.replace(/\//g, '\\'), text: f.text })), { path: 'elsewhere/Stray.json', text: files[1].text }];
  const p = read(moved);
  assert.deepEqual(p.top.shapes.map(s => s.name), ['A']); assert.deepEqual(p.top.shapes[0].inside.shapes.map(s => s.name), ['B']);
});

test('a config with things missing or wrong is read with safe values', () => {
  const p = read([head(), file('Bare.json', { format: 'smart-factory/shape' }),
    file('Odd.json', config('Odd', { size: { cols: 0, rows: 2.6 }, position: { x: 'far' }, variable: 1.5, from: { id: 'b1', side: 'z' }, attributes: [{ name: 5 }, null], order: 1,
      definition: 'Odd/', joined: [{}] })),
    file('notes.txt', {}), file('Other.json', { format: 'something else' })]);
  assert.equal(p.top.shapes.length, 2);
  const [bare, odd] = p.top.shapes;
  assert.deepEqual(bare, shape('Shape', { color: null, cols: 1, rows: 1 }));
  assert.deepEqual([odd.cols, odd.rows, odd.x, odd.y, odd.variable, odd.inside], [1, 3, 0, 0, null, null]);
  assert.deepEqual(odd.from, { id: 'b1', side: 'x' });
  assert.deepEqual(odd.attributes, [{ name: '5', value: '' }, { name: '', value: '' }]);
  assert.deepEqual(odd.joined.map(j => [j.fx, j.fy, j.fw, j.fh, j.shape.name]), [[0, 0, 1, 1, 'Shape']]);
  assert.deepEqual([p.saved, p.ids], [null, null]);
});

test('what is not a project is refused, with the reason', () => {
  assert.throws(() => read([]), /no project\.json/);
  assert.throws(() => read([file('A.json', config('A'))]), /no project\.json/);
  assert.throws(() => read([file('project.json', { format: 'other' })]), /not a smart-factory project/);
  assert.throws(() => read([head(FORMAT + 1)]), /newer version \(format 3\)/);
  assert.throws(() => read([head(), { path: 'Bad.json', text: '{ not json' }]), /Bad\.json is not valid JSON/);
});

test('projects saved before are still read: a frame was called a group', () => {
  const p = read([head(), file('Outer.group.json', { format: 'smart-factory/group', version: 1, name: 'Outer', named: true, shapes: [config('A', { order: 0 })],
    groups: [{ name: 'Unnamed', named: false, shapes: [config('B', { order: 1 })], groups: [] }] })]);
  assert.deepEqual(p.top.shapes.map(s => s.name), ['A', 'B']);
  assert.deepEqual(p.top.groups, [{ id: null, name: 'Outer', members: [0], groups: [{ id: null, name: null, members: [1], groups: [] }] }]);
});

test('format 1: the settings become the Menu, and the old top level one block beside them', () => {
  const p = read([head(1), file('Shape 1.json', config('Shape 1')), file('_settings/Colours.json', config('Colours', { position: { x: 2, y: 3 } }))]);
  assert.deepEqual(p.top.shapes.map(s => s.name), ['Colours', 'Top level']);
  const top = p.top.shapes[1];
  assert.deepEqual(top.inside.shapes.map(s => s.name), ['Shape 1']); assert.deepEqual([top.x, top.y], [-5, 0]);
  const empty = read([head(1), file('_settings/Colours.json', config('Colours'))]);      /* nothing at the old top: no block */
  assert.deepEqual(empty.top.shapes.map(s => s.name), ['Colours']);
  const plain = read([file('project.json', { format: 'smart-factory/project' }), file('A.json', config('A'))]);      /* format 1 with no settings */
  assert.deepEqual(plain.top.shapes.map(s => s.name), ['A']);
});

/* the projects that come with the repository */
const here = fileURLToPath(new URL('../projects/', import.meta.url));
const tree = (dir, at = '') => readdirSync(join(dir, at)).flatMap(n => statSync(join(dir, at, n)).isDirectory() ? tree(dir, at + n + '/') : [{ path: at + n, text: readFileSync(join(dir, at, n), 'utf8') }]);
const count = s => s.shapes.reduce((n, sh) => n + 1 + (sh.inside ? count(sh.inside) : 0), 0);
for (const name of ['default-menu', 'example']) test(`projects/${name} reads, and survives being written and read again`, () => {
  const p = read(tree(join(here, name)));
  assert.ok(count(p.top) > 0, 'it has shapes');
  const again = read(write(p));
  assert.deepEqual(again, read(write(again)));
  assert.equal(count(again.top), count(p.top));
});
