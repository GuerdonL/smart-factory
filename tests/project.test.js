/* project.js: a project written as a tree of files, and read back. Run with: node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { write, read, isNamed, FORMAT } from '../project.js';
import { pieces } from '../algebra.js';
import './solver.js';
import { build, validate } from '../graph.js';
import { evaluate, promiseOf, truthAt } from '../evaluate.js';

/* a shape as read() gives one: every field present */
const shape = (name, more = {}) => ({ id: null, type: 'tensor', name, color: isNamed(name) ? 'variable-1' : null, x: 0, y: 0, cols: 2, rows: 3, colsName: null, rowsName: null, inner: null,
  entries: {}, inside: null, variable: null, standing: false, source: null, transposed: false, attributes: [], reference: false, from: null, arrow: null, seat: null, in: false, joined: null, ...more });
const space = (shapes = [], groups = [], operations = []) => ({ shapes, groups, operations });
const project = (top, more = {}) => ({ top, saved: '2026-11-16T00:00:00.000Z', ids: null, tick: 0, data: {}, converted: 0, changed: 0, resized: [], unheld: [], unstepped: [], streamed: [], ticked: null, ...more });      /* converted, changed: read says how many old stacks it fused, and how many other pieces read differently; resized: the references it set to their variable's size */
const json = (files, path) => JSON.parse(files.find(f => f.path === path).text);
const paths = files => files.map(f => f.path).sort();
const file = (path, body) => ({ path, text: JSON.stringify(body) });
const head = (version = FORMAT) => file('project.json', { format: 'smart-factory/project', version });
const config = (name, more = {}) => ({ format: 'smart-factory/shape', version: FORMAT, name, ...more });

test('a project with everything in it comes back as it went', () => {
  const p = project(space([
    shape('Keys', { id: 'b0x7m2c', color: 'variable-3', x: -12, y: 4, cols: 4, rows: 6, colsName: 'key', rowsName: 'context', variable: 2,
      inside: space([shape('Embedding', { id: 'b111111', standing: true }), shape('Key Weights', { x: 5, entries: { '1,1': 3 } })]) }),
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
  assert.deepEqual(json(files, 'project.json'), { format: 'smart-factory/project', version: FORMAT, saved: '2026-11-16T00:00:00.000Z', tick: 0 });
  for (const f of files) assert.ok(f.text.endsWith('\n'), f.path + ' ends with a newline');
});

test('names are made safe to be file names, and different from one another', () => {
  const files = write(project(space([shape('Keys'), shape('Keys'), shape('keys'), shape('a/b: c?'), shape('project'), shape('_settings'),
    shape('// Old idea'), shape('...'), shape('x'.repeat(200))])));
  assert.deepEqual(paths(files), ['Keys (2).json', 'Keys.json', 'Old idea.json', '_settings shape.json', 'a-b- c-.json', 'keys (3).json',
    'project shape.json', 'project.json', 'shape.json', 'x'.repeat(80) + '.json'].sort());
  assert.equal(json(files, 'a-b- c-.json').name, 'a/b: c?');      /* the name itself is kept as it was */
});

/* every name in every directory of what was written, in lower case, with how many files and directories have it:
   the ones had more than once, which a file system could not keep apart */
const clashes = files => { const had = new Map(), dirs = new Set();
  for (const f of files){ const parts = f.path.toLowerCase().split('/');
    parts.slice(0, -1).forEach((_, i) => dirs.add(parts.slice(0, i + 1).join('/')));
    had.set(f.path.toLowerCase(), (had.get(f.path.toLowerCase()) || 0) + 1); }
  return [...had].filter(([path, n]) => n > 1 || dirs.has(path)).map(([path]) => path); };

test('a shape and a frame whose names would make the same file are written to two', () => {
  const p = project(space([shape('Keys.frame'), shape('A')], [{ id: 'g1', name: 'Keys', members: [1], groups: [] }]));
  const files = write(p);
  assert.deepEqual(paths(files), ['Keys (2).frame.json', 'Keys.frame.json', 'project.json']);
  assert.equal(json(files, 'Keys.frame.json').format, 'smart-factory/shape');
  assert.deepEqual(read(files), p);
  const capitals = write(project(space([shape('KEYS.FRAME'), shape('A')], [{ id: 'g1', name: 'keys', members: [1], groups: [] }])));
  assert.deepEqual(paths(capitals), ['KEYS.FRAME.json', 'keys (2).frame.json', 'project.json']);
});

test('no file is written over another or under the name of a directory, whatever the shapes are called', () => {
  const def = () => space([shape('Inner')]);
  const p = project(space([shape('Keys.json', { inside: def() }), shape('Keys'), shape('keys.JSON', { inside: def() }), shape('A.frame.json', { inside: def() }), shape('B'),
    shape('project.json', { inside: def() }), shape('Pair.frame'), shape('pair.FRAME'), shape('C'), shape('Joined', { joined: [{ fx: 0, fy: 0, fw: 1, fh: 1, shape: shape('Joined.json', { inside: def() }) }] }),
    shape('.config'), shape('config.frame')],
    [{ id: 'g1', name: 'A', members: [4], groups: [] }, { id: 'g2', name: 'Pair', members: [8], groups: [] }, { id: 'g3', name: '.config', members: [], groups: [] }, { id: 'g4', name: '.config', members: [], groups: [] }]));
  const files = write(p);
  assert.deepEqual(clashes(files), []);
  assert.equal(files.length, 1 + 10 + 5 + 4);      /* project.json, the shapes in no frame, a shape in each definition, the frames */
  assert.deepEqual(read(files), p);
});

test('a shape and a frame of one name are written as they were: the frame takes a number', () => {
  const files = write(project(space([shape('Keys'), shape('A')], [{ id: null, name: 'Keys', members: [1], groups: [] }])));
  assert.deepEqual(paths(files), ['Keys (2).frame.json', 'Keys.json', 'project.json']);
});

test('only the first frame named .config is the file .config', () => {
  const files = write(project(space([], [{ id: null, name: '.config', members: [], groups: [] }, { id: null, name: '.config', members: [], groups: [] }])));
  assert.deepEqual(paths(files), ['.config', 'config.frame.json', 'project.json']);
  assert.equal(read(files).top.groups.length, 2);
});

test('a variable\'s definition is written once, under the first use that carries it', () => {
  const def = () => space([shape('Embedding')]);
  const files = write(project(space([shape('Keys', { variable: 1 }), shape('Keys', { variable: 1, inside: def() }), shape('Keys', { variable: 1, inside: def() }), shape('Lone', { inside: def() })])));
  assert.deepEqual(paths(files), ['Keys (2).json', 'Keys (2)/Embedding.json', 'Keys (3).json', 'Keys.json', 'Lone.json', 'Lone/Embedding.json', 'project.json']);
  assert.deepEqual(['Keys', 'Keys (2)', 'Keys (3)'].map(n => json(files, n + '.json').definition), [undefined, 'Keys (2)/', undefined]);
  assert.deepEqual(['Keys', 'Keys (2)', 'Keys (3)'].map(n => json(files, n + '.json').value.as), ['computation', 'computation', 'computation']);      /* it is every use's definition */
  assert.deepEqual(read(files).top.shapes.map(s => s.inside && s.inside.shapes.map(i => i.name)), [null, ['Embedding'], null, ['Embedding']]);
});

test('a definition carried by only one use of a variable survives a write and read, whichever use it is', () => {
  const def = () => space([shape('Embedding', { variable: 2, inside: space([shape('Deep')]) }), shape('Embedding', { variable: 2, reference: true })]);
  for (const carrier of [0, 1, 2]){
    const p = project(space([0, 1, 2].map(i => shape('Keys', { id: 'b' + i, variable: 1, x: 10 * i, inside: i === carrier ? def() : null }))));
    assert.deepEqual(read(write(p)), p);
  }
  const joined = project(space([shape('Keys', { variable: 1 }), shape('Joined', { joined: [{ fx: 0, fy: 0, fw: 1, fh: 1, shape: shape('Keys', { variable: 1, inside: def() }) }] })]));
  assert.deepEqual(read(write(joined)), joined);
});

test('what is saved does not multiply with the uses of a variable', () => {
  /* six levels, three uses of a variable at each, every use carrying the definition as projects saved before did */
  let level = space([shape('Leaf')]);
  for (let n = 6; n >= 1; n--) level = space([0, 1, 2].map(i => shape('Level ' + n, { variable: n, x: 10 * i, inside: level })));
  const files = write(project(level));
  assert.equal(files.length, 1 + 6 * 3 + 1);
  let s = read(files).top, depth = 0;
  for (; s.shapes[0].inside; depth++){ assert.deepEqual(s.shapes.map(sh => !!sh.inside), [true, false, false]); s = s.shapes[0].inside; }
  assert.equal(depth, 6); assert.deepEqual(s.shapes.map(sh => sh.name), ['Leaf']);
});

test('projects saved before, where every use of a variable has its definition, are still read', () => {
  const p = read([head(), file('Keys.json', config('Keys', { variable: 1, order: 0, definition: 'Keys/' })), file('Keys/Embedding.json', config('Embedding')),
    file('Keys (2).json', config('Keys', { variable: 1, order: 1, definition: 'Keys (2)/' })), file('Keys (2)/Embedding.json', config('Embedding'))]);
  assert.deepEqual(p.top.shapes.map(s => [s.variable, s.inside.shapes.map(i => i.name)]), [[1, ['Embedding']], [1, ['Embedding']]]);
  assert.deepEqual(paths(write(p)), ['Keys (2).json', 'Keys.json', 'Keys/Embedding.json', 'project.json']);      /* and written again, it is there once */
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
  assert.throws(() => read([head(FORMAT + 1)]), /newer version \(format 10\)/);
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

/* ---- a stack: rows appended in format 2, a sum in format 3 ---- */
const at = (name, x, y, cols, rows, more = {}) => config(name, { position: { x, y }, size: { cols, rows }, ...more });
const rectsOf = shapes => shapes.map(d => ({ x: d.x, y: d.y, w: d.cols, h: d.rows, wName: d.colsName, hName: d.rowsName }));

test('the format is 9', () => { assert.equal(FORMAT, 9); });

test('format 2: a stack is fused into one shape, which holds its shapes top to bottom', () => {
  const p = read([head(2), file('Top.json', at('Top', 4, 0, 3, 2, { id: 'btop', order: 1, value: { entries: { '1,1': 5 } } })), file('Under.json', at('Under', 4, 2, 3, 1, { id: 'bunder', order: 0 })),
    file('Apart.json', at('Apart', 20, 0, 3, 2, { order: 2 }))]);
  assert.equal(p.converted, 1); assert.equal(p.changed, 0);
  assert.deepEqual(p.top.shapes.map(d => d.name), ['Shape 1', 'Apart']);      /* where the stack's first shape was, back to front */
  const fused = p.top.shapes[0];
  assert.deepEqual([fused.x, fused.y, fused.cols, fused.rows, fused.color, fused.id, fused.variable], [4, 0, 3, 3, null, null, null]);
  assert.deepEqual(fused.joined.map(j => [j.shape.name, j.shape.id, j.fx, j.fy, j.fw, j.fh]), [['Top', 'btop', 0, 0, 1, 2 / 3], ['Under', 'bunder', 0, 2 / 3, 1, 1 / 3]]);
  assert.deepEqual(fused.joined[0].shape.entries, { '1,1': 5 });       /* its entries are theirs, as they were */
  assert.equal(pieces(rectsOf(p.top.shapes)).length, 2);               /* one shape now, and no sum */
});

test('format 3: a stack is left alone, and is a sum', () => {
  const files = [head(3), file('Top.json', at('Top', 4, 0, 3, 2, { order: 0 })), file('Under.json', at('Under', 4, 2, 3, 2, { order: 1 }))];
  const p = read(files);
  assert.equal(p.converted, 0); assert.equal(p.changed, 0);      /* a sum in a format 3 project is what it was saved as: nothing has changed */
  assert.deepEqual(p.top.shapes.map(d => [d.name, d.joined]), [['Top', null], ['Under', null]]);
  const [piece] = pieces(rectsOf(p.top.shapes));
  assert.equal(piece.rule, 'sum'); assert.deepEqual(piece.type, { cols: 3, rows: 2, colsName: null, rowsName: null });
  assert.equal(read([head(2), ...files.slice(1)]).converted, 1);      /* the very same files, marked format 2, are a stack */
});

test('a converted project, saved, is the format of today and is not converted again', () => {
  const old = read([head(2), file('Top.json', at('Top', 0, 0, 3, 2, { order: 0 })), file('Under.json', at('Under', 0, 2, 3, 2, { order: 1 })), file('Last.json', at('Last', 0, 4, 3, 1, { order: 2 }))]);
  assert.equal(old.converted, 1); assert.equal(old.top.shapes.length, 1); assert.equal(old.top.shapes[0].joined.length, 3);
  const files = write(old);
  assert.equal(json(files, 'project.json').version, FORMAT);
  const again = read(files);
  assert.equal(again.converted, 0); assert.deepEqual(again.top, old.top);
});

test('format 2: what was no stack is not fused', () => {
  const none = (changed, ...files) => { const p = read([head(2), ...files]); assert.equal(p.converted, 0); assert.ok(p.top.shapes.every(d => !d.joined)); assert.equal(p.changed, changed);
    assert.deepEqual(p.top.shapes.map(d => [d.name, d.x, d.y, d.cols, d.rows]).sort(), files.map(f => JSON.parse(f.text)).map(c => [c.name, c.position.x, c.position.y, c.size.cols, c.size.rows]).sort());      /* and nothing is moved */
    return p; };
  none(0, file('A.json', at('A', 0, 0, 3, 2)), file('B.json', at('B', 0, 3, 3, 2)));                  /* a gap */
  none(0, file('A.json', at('A', 0, 0, 3, 2)), file('B.json', at('B', 0, 2, 4, 2)));                  /* a different width */
  none(0, file('A.json', at('A', 0, 0, 3, 2)), file('B.json', at('B', 1, 2, 3, 2)));                  /* a step sideways */
  none(0, file('A.json', at('A', 0, 0, 3, 2)), file('B.json', at('// B', 0, 2, 3, 2, { commented: true })));      /* a commented-out shape took no part */
  none(0, file('A.json', at('A', 0, 0, 3, 2)), file('B.json', at('B', 3, 0, 2, 3)));                  /* a product reads as it did */
  /* these two were no stack either, but they do not read as they did: they are left as they are, and counted */
  none(1, file('A.json', at('A', 0, 0, 2, 2)), file('B.json', at('B', 2, 0, 4, 2)), file('C.json', at('C', 0, 2, 2, 2)));      /* a shape under one in a product was on its own: now the piece is mixed rules */
  none(1, file('D.json', at('D', 0, 0, 3, 2)), file('E.json', at('E', 3, 2, 3, 2)));                  /* a corner meant nothing: now it is over */
  none(1, file('A.json', at('A', 0, 2, 3, 2)), file('B.json', at('B', 3, 0, 3, 2)));                  /* and the other corner, times */
});

test('format 2: pieces that read differently are counted in every space, beside the stacks, and never in format 3', () => {
  const files = [file('Top.json', at('Top', 0, 0, 3, 2, { order: 0 })), file('Under.json', at('Under', 0, 2, 3, 2, { order: 1 })),      /* a stack: fused, and so not counted as changed */
    file('D.json', at('D', 10, 0, 3, 2, { order: 2 })), file('E.json', at('E', 13, 2, 3, 2, { order: 3 })),                               /* a corner */
    file('Keys.json', at('Keys', 30, 0, 4, 4, { definition: 'Keys/', order: 4 })),
    file('Keys/A.json', at('A', 0, 0, 2, 2)), file('Keys/B.json', at('B', 2, 0, 4, 2)), file('Keys/C.json', at('C', 0, 2, 2, 2)),         /* mixed rules, in a definition */
    file('Keys/F.json', at('F', 20, 2, 1, 1)), file('Keys/G.json', at('G', 21, 1, 1, 1)), file('Keys/Off.json', at('// Off', 22, 0, 1, 1, { commented: true }))];      /* a corner; the commented one takes no part */
  const old = read([head(2), ...files]);
  assert.deepEqual([old.converted, old.changed], [1, 3]);
  const now = read([head(3), ...files]);
  assert.deepEqual([now.converted, now.changed], [0, 0]);
});

test('format 2: a variable used in several places has one definition, and what is in it is counted once', () => {
  const use = (name, x, more = {}) => file(name + '.json', at('Keys', x, 0, 4, 4, { variable: 1, definition: name + '/', ...more }));
  const inside = dir => [file(dir + '/A.json', at('A', 0, 0, 2, 1, { order: 0 })), file(dir + '/B.json', at('B', 0, 1, 2, 1, { order: 1 })),      /* one stack */
    file(dir + '/D.json', at('D', 10, 0, 3, 2, { order: 2 })), file(dir + '/E.json', at('E', 13, 2, 3, 2, { order: 3 }))];                          /* and one corner */
  const p = read([head(2), use('Keys', 0), use('Keys (2)', 10, { reference: true }), use('Keys (3)', 20, { reference: true }),
    ...inside('Keys'), ...inside('Keys (2)'), ...inside('Keys (3)')]);
  assert.deepEqual([p.converted, p.changed], [1, 1]);
  for (const s of p.top.shapes) assert.deepEqual(s.inside.shapes.map(d => d.name), ['Shape 1', 'D', 'E']);      /* every copy is fused all the same, so they stay alike */
  /* two different variables, each with a stack, are two */
  const two = read([head(2), file('P.json', at('P', 0, 0, 4, 4, { variable: 1, definition: 'P/' })), file('Q.json', at('Q', 10, 0, 4, 4, { variable: 2, definition: 'Q/' })),
    file('R.json', at('R', 20, 0, 4, 4, { definition: 'R/' })), file('S.json', at('S', 30, 0, 4, 4, { definition: 'S/' })),      /* and two that are no variable shared with anything */
    ...['P', 'Q', 'R', 'S'].flatMap(d => inside(d).slice(0, 2))]);
  assert.equal(two.converted, 4);
});

test('format 2: a fused stack keeps the name its columns had, which was its first shape\'s', () => {
  const p = read([head(2), file('Top.json', at('Top', 0, 0, 3, 2, { order: 0, sides: { cols: 'embed', rows: 'context' } })), file('Under.json', at('Under', 0, 2, 3, 1, { order: 1, sides: { cols: 'embed', rows: null } }))]);
  const fused = p.top.shapes[0];
  assert.deepEqual([fused.cols, fused.rows, fused.colsName, fused.rowsName], [3, 3, 'embed', null]);      /* as the stack's type was: its rows had no name */
  assert.deepEqual(read(write(p)).top.shapes[0].colsName, 'embed');                                         /* and it is kept when saved */
  const plain = read([head(2), file('Top.json', at('Top', 0, 0, 3, 2, { order: 0 })), file('Under.json', at('Under', 0, 2, 3, 1, { order: 1, sides: { cols: 'embed', rows: null } }))]);
  assert.equal(plain.top.shapes[0].colsName, null);      /* the first shape's, not any shape's */
});

test('format 2: stacks are fused in every space, and in the frame that held them', () => {
  const p = read([head(2), file('Keys.json', at('Keys', 0, 0, 4, 4, { definition: 'Keys/' })),
    file('Keys/A.json', at('A', 3, 0, 2, 1, { order: 0 })), file('Keys/B.json', at('B', 3, 1, 2, 1, { order: 1 })), file('Keys/Shape 1.json', at('Shape 1', 9, 9, 1, 1, { order: 2 })),
    file('Pair.frame.json', { format: 'smart-factory/frame', version: 2, id: 'gpair', name: 'Pair', named: true, shapes: [at('C', 10, 0, 2, 2, { order: 1 })],
      groups: [{ id: 'ginner', name: null, named: false, shapes: [at('D', 10, 2, 2, 2, { order: 2 })], groups: [] }] }),
    file('E.json', at('E', 10, 4, 2, 2, { order: 3 })), file('F.json', at('F', 30, 0, 1, 1, { order: 4 })), file('G.json', at('G', 30, 1, 1, 1, { order: 5 })),
    file('Lone.frame.json', { format: 'smart-factory/frame', version: 2, id: 'glone', name: 'Lone', named: true, shapes: [at('H', 40, 0, 1, 1, { order: 6 }), at('I', 40, 1, 1, 1, { order: 7 })], groups: [] })]);
  assert.equal(p.converted, 4); assert.equal(p.changed, 0);
  const inside = p.top.shapes[0].inside;
  assert.deepEqual(inside.shapes.map(d => d.name), ['Shape 2', 'Shape 1']);      /* a name the space is not using */
  assert.deepEqual(inside.shapes[0].joined.map(j => j.shape.name), ['A', 'B']);
  /* C (in Pair), D (in a frame inside Pair) and E (in none) were one stack: no frame held them all, so the fused shape is in none,
     and the frames it emptied are gone. F and G likewise. H and I were both in Lone, and so is what they became. */
  assert.deepEqual(p.top.shapes.map(d => [d.name, d.joined ? d.joined.map(j => j.shape.name).join('') : null]), [['Keys', null], ['Shape 1', 'CDE'], ['Shape 2', 'FG'], ['Shape 3', 'HI']]);
  assert.deepEqual(p.top.groups, [{ id: 'glone', name: 'Lone', members: [3], groups: [] }]);
});

test('format 2: shapes standing in their owner\'s matrix were its entries, not a stack', () => {
  /* a 3 by 2 shape: the left side of its equation is 3 wide, ending one unit before the origin, from one row above it */
  const rows = [file('Colours/red.json', at('red', -4, -1, 3, 1, { tile: true, order: 0 })), file('Colours/blue.json', at('blue', -4, 0, 3, 1, { tile: true, order: 1 }))];
  const stood = read([head(2), file('Colours.json', at('Colours', 0, 0, 3, 2, { definition: 'Colours/' })), ...rows]);
  assert.equal(stood.converted, 0); assert.deepEqual(stood.top.shapes[0].inside.shapes.map(d => d.name), ['red', 'blue']);
  /* the same two with a third shape beside them that stands nowhere: then nothing stood, and they were a stack */
  const loose = read([head(2), file('Colours.json', at('Colours', 0, 0, 3, 2, { definition: 'Colours/' })), ...rows, file('Colours/Shape 1.json', at('Shape 1', 8, 8, 2, 2, { order: 2 }))]);
  assert.equal(loose.converted, 1);
});

test('a standing shape is written "standing": true, and a file that says "tile": true is read as one', () => {
  /* the old word, in a format 2 file and in a format 3 file saved before the rename: both are standing shapes */
  for (const version of [2, 3]){
    const old = read([head(version), file('Colours.json', at('Colours', 0, 0, 3, 1, { definition: 'Colours/' })), file('Colours/red.json', at('red', -4, 0, 3, 1, { tile: true, order: 0 }))]);
    const red = old.top.shapes[0].inside.shapes[0];
    assert.equal(red.standing, true); assert.equal('tile' in red, false);
    const text = write(old).find(f => f.path === 'Colours/red.json').text;
    assert.equal(JSON.parse(text).standing, true); assert.equal('tile' in JSON.parse(text), false); }
  /* the new word is read; a shape that says neither stands nowhere, and its file has neither word */
  const now = read([head(3), file('Colours.json', at('Colours', 0, 0, 3, 1, { definition: 'Colours/' })), file('Colours/red.json', at('red', -4, 0, 3, 1, { standing: true, order: 0 })), file('Loose.json', at('Loose', 9, 9, 1, 1, { order: 1 }))]);
  assert.equal(now.top.shapes[0].inside.shapes[0].standing, true);
  const loose = now.top.shapes.find(d => d.name === 'Loose'); assert.equal(loose.standing, false);
  const written = JSON.parse(write(now).find(f => f.path === 'Loose.json').text); assert.equal('standing' in written, false); assert.equal('tile' in written, false);
});

test('a source is kept by its kind, with no entries; a kind this program has not got is no source', () => {
  const p = project(space([shape('Eye', { cols: 3, rows: 3, source: 'identity', entries: { '1,1': 9 } }), shape('Bias', { cols: 4, rows: 1, source: 'zeros' }), shape('One', { source: 'ones' }), shape('Plain', { entries: { '1,1': 9 } })]));
  const files = write(p), eye = json(files, 'Eye.json');
  assert.equal(eye.source, 'identity'); assert.deepEqual(eye.value, { as: 'resolved', entries: {} });      /* whatever entries it was handed, none are written */
  assert.equal(json(files, 'Bias.json').source, 'zeros'); assert.equal(json(files, 'One.json').source, 'ones');
  assert.equal('source' in json(files, 'Plain.json'), false);
  const back = read(files).top.shapes;
  assert.deepEqual(back.map(d => [d.name, d.source, d.entries]), [['Eye', 'identity', {}], ['Bias', 'zeros', {}], ['One', 'ones', {}], ['Plain', null, { '1,1': 9 }]]);
  /* anything else: dropped, and the shape keeps the entries its file has */
  for (const source of [{ seed: 1, dist: 'uniform' }, ['zeros'], 'Zeros', 7, true]){
    const got = read([head(3), file('S.json', at('S', 0, 0, 2, 1, { source, value: { entries: { '1,1': 5 } } }))]).top.shapes[0];
    assert.equal(got.source, null); assert.deepEqual(got.entries, { '1,1': 5 }); }
  assert.equal(read([head(2), file('S.json', at('S', 0, 0, 2, 1))]).top.shapes[0].source, null);      /* format 2 has none */
});

test('a definition space with nothing in it has no directory, so its shape does not name one: saved and reopened, the files are the same', () => {
  const p = project(space([shape('Empty', { inside: space() }), shape('Full', { inside: space([shape('In')]) })]));
  const files = write(p);
  assert.equal('definition' in json(files, 'Empty.json'), false); assert.equal(json(files, 'Full.json').definition, 'Full/');
  assert.deepEqual(write(read(files)).map(f => f.text), files.map(f => f.text));
});

test('a tile is a frame with its repeat: kept with its counts, formula and all, shapes or none, at any depth', () => {
  const repeat = { x: 2, y: -3, cols: 4, rows: 1, across: 1, down: { expr: '@[bkeys01:y]' } };
  const p = project(space([shape('Bias', { id: 'bbias01', x: 2, y: -3, cols: 4, rows: 1 }), shape('Keys', { id: 'bkeys01' }), shape('In', { id: 'bin0001' })],
    [{ id: 'gtile01', name: 'Rows', members: [0], groups: [], repeat }, { id: 'gempty1', name: null, members: [], groups: [], repeat: { x: 9, y: 9, cols: 2, rows: 2, across: 3, down: 2 } },
     { id: 'gouter1', name: 'Outer', members: [], groups: [{ id: 'ginner1', name: null, members: [2], groups: [], repeat: { x: 0, y: 0, cols: 2, rows: 3, across: 2, down: 1 } }] }]));
  const files = write(p), rows = json(files, 'Rows.frame.json');
  assert.deepEqual(rows.repeat, repeat); assert.equal(rows.shapes.length, 1);
  const empty = json(files, 'frame 2.frame.json'); assert.deepEqual(empty.shapes, []); assert.deepEqual(empty.repeat, { x: 9, y: 9, cols: 2, rows: 2, across: 3, down: 2 });
  const outer = json(files, 'Outer.frame.json'); assert.equal('repeat' in outer, false); assert.deepEqual(outer.groups[0].repeat, { x: 0, y: 0, cols: 2, rows: 3, across: 2, down: 1 });
  const back = read(files);
  assert.deepEqual(back.top.groups.map(g => [g.id, g.name, g.members.length, g.repeat ?? null]).sort(), [['gempty1', null, 0, { x: 9, y: 9, cols: 2, rows: 2, across: 3, down: 2 }], ['gouter1', 'Outer', 0, null], ['gtile01', 'Rows', 1, repeat]]);
  assert.deepEqual(back.top.groups.find(g => g.id === 'gouter1').groups[0].repeat, { x: 0, y: 0, cols: 2, rows: 3, across: 2, down: 1 });
  assert.deepEqual(write(back).map(f => f.text), files.map(f => f.text));      /* saved and reopened: the same files */
});

test('an ordinary frame has no repeat, and a repeat with things missing or wrong is read with safe values', () => {
  const frame = more => file('F.frame.json', { format: 'smart-factory/frame', version: 3, id: 'gframe1', name: 'F', named: true, shapes: [at('A', 0, 0, 1, 1)], ...more });
  const g = more => read([head(3), frame(more)]).top.groups[0];
  assert.equal('repeat' in g({}), false); assert.equal('repeat' in g({ repeat: null }), false); assert.equal('repeat' in g({ repeat: 'twice' }), false);
  assert.deepEqual(g({ repeat: {} }).repeat, { x: 0, y: 0, cols: 1, rows: 1, across: 1, down: 1 });
  assert.deepEqual(g({ repeat: { x: 1.4, y: -2, cols: 0, rows: 2, across: -3, down: { expr: '' } } }).repeat, { x: 1, y: -2, cols: 1, rows: 2, across: 1, down: 1 });
  assert.deepEqual(g({ repeat: { cols: 3, rows: 2, across: { expr: '@[b1:x]', value: 4 }, down: 2 } }).repeat.across, { expr: '@[b1:x]' });      /* a formula's text, and nothing it came to */
  assert.equal(read([head(2), file('F.frame.json', { format: 'smart-factory/group', version: 2, name: 'F', named: true, shapes: [at('A', 0, 0, 1, 1)] })]).top.groups[0].repeat, undefined);      /* format 2 has none */
});

test('an arrow that reads a tile, and the index as a matrix, come back as they went', () => {
  const p = project(space([shape('out', { id: 'barrow1', type: 'arrow', arrow: { input: { id: 'gtile01', as: 'tile' }, side: 'e', start: 1, span: 3, gap: 2, gapName: null, output: null, formula: null } }),
    shape('index.x', { id: 'bindex1', reference: true, from: { id: 'bbias01', index: 'x' } }), shape('index.y', { id: 'bindex2', reference: true, from: { id: 'bbias01', index: 'y' } }), shape('W', { from: { id: 'bbias01', side: 'y' } })]));
  const files = write(p);
  assert.deepEqual(json(files, 'out.json').arrow.input, { id: 'gtile01', as: 'tile' });
  assert.deepEqual(json(files, 'index.x.json').from, { id: 'bbias01', index: 'x' }); assert.deepEqual(json(files, 'index.y.json').from, { id: 'bbias01', index: 'y' });
  const back = read(files).top.shapes;
  assert.deepEqual(back.map(d => d.from), [null, { id: 'bbias01', index: 'x' }, { id: 'bbias01', index: 'y' }, { id: 'bbias01', side: 'y' }]);
  assert.deepEqual(back[0].arrow.input, { id: 'gtile01', as: 'tile' });
  /* an index that is neither is no index: the from is read as a measure, as any from with no range is */
  assert.deepEqual(read([head(3), file('S.json', at('S', 0, 0, 1, 1, { from: { id: 'b1', index: 'z' } }))]).top.shapes[0].from, { id: 'b1', side: 'x' });
  /* a tile's input carries no hollow */
  assert.deepEqual(read([head(3), file('A.json', at('A', 0, 0, 1, 1, { type: 'arrow', arrow: { input: { id: 'g1', as: 'tile', hollow: 2 } } }))]).top.shapes[0].arrow.input, { id: 'g1', as: 'tile' });
});

test('frames with no name keep their file names when a project is saved, reopened and saved, however many there are', () => {
  /* twelve unnamed frames (tiles, so that each may be empty) with a named one among them; files come back sorted by name, as a server lists them */
  const groups = Array.from({ length: 13 }, (_, i) => i === 5 ? { id: 'gnamed', name: 'Zeta', members: [0], groups: [] } : { id: 'g' + i, name: null, members: [], groups: [], repeat: { x: i, y: 0, cols: 1, rows: 1, across: i + 1, down: 1 } });
  const files = write(project(space([shape('A')], groups))), sorted = fs => [...fs].sort((a, b) => a.path < b.path ? -1 : 1);
  assert.deepEqual(paths(files).filter(p => p.startsWith('frame')), [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13].map(n => `frame ${n}.frame.json`).sort());
  assert.ok(sorted(files).findIndex(f => f.path === 'frame 10.frame.json') < sorted(files).findIndex(f => f.path === 'frame 2.frame.json'));      /* the order that used to renumber them */
  const once = read(sorted(files)); assert.deepEqual(once.top.groups.map(g => g.id), groups.map(g => g.id));
  const again = write(once); assert.deepEqual(sorted(again), sorted(files));
  assert.deepEqual(sorted(write(read(sorted(again)))), sorted(files));
  /* fewer than ten, and none named: the names they have always had */
  const few = write(project(space([shape('A'), shape('B')], [{ id: 'ga', name: null, members: [0], groups: [] }, { id: 'gb', name: null, members: [1], groups: [] }])));
  assert.deepEqual(paths(few).filter(p => p.startsWith('frame')), ['frame 1.frame.json', 'frame 2.frame.json']);
  assert.deepEqual(sorted(write(read(sorted(few)))), sorted(few));
  /* a file whose name gives a place that is taken, or past the end, falls into what is left */
  const odd = read([head(3), file('frame 9.frame.json', { format: 'smart-factory/frame', version: 3, id: 'g9', named: false, shapes: [at('A', 0, 0, 1, 1)] }), file('Named.frame.json', { format: 'smart-factory/frame', version: 3, id: 'gn', name: 'Named', named: true, shapes: [at('B', 0, 0, 1, 1)] })]);
  assert.deepEqual(odd.top.groups.map(g => g.id).sort(), ['g9', 'gn']);
});

/* the projects that come with the repository */
const here = fileURLToPath(new URL('../projects/', import.meta.url));
const tree = (dir, at = '') => readdirSync(join(dir, at)).flatMap(n => statSync(join(dir, at, n)).isDirectory() ? tree(dir, at + n + '/') : [{ path: at + n, text: readFileSync(join(dir, at, n), 'utf8') }]);
const count = s => s.shapes.reduce((n, sh) => n + 1 + (sh.inside ? count(sh.inside) : 0), 0);
for (const name of ['default-menu', 'example', 'touch-algebra', 'boolean-tool', 'entries-and-values', 'arrows', 'sources-and-tiles']) test(`projects/${name} reads, holds no old stack, and survives being written and read again`, () => {
  const p = read(tree(join(here, name)));
  assert.equal(p.converted, 0); assert.equal(p.changed, 0);
  assert.ok(count(p.top) > 0, 'it has shapes');
  const again = read(write(p));
  assert.deepEqual(again, read(write(again)));
  assert.equal(count(again.top), count(p.top));
});

/* ---- operations and ranges (format 3) ---- */
const range = (col, row, cols, rows, toCols = false, toRows = false) => ({ col, row, cols, rows, toEnd: { cols: toCols, rows: toRows } });
/* a 6 by 4 shape cut by a 2 by 4 one laid over its columns 3 and 4: two shapes are left, and the two sources are kept */
const cutSpace = () => space([
  shape('Shape 3', { id: 'bleft00', x: 0, cols: 2, rows: 4, from: { id: 'bwide00', range: range(0, 0, 2, 4, false, true) } }),
  shape('Tail', { id: 'bright0', x: 4, cols: 2, rows: 4, color: 'variable-2', from: { id: 'bwide00', range: range(4, 0, 2, 4, true, true) } }),
  shape('Keys', { id: 'bkeys00', x: 20, cols: 6, rows: 4, variable: 1, entries: { '3,1': 7 } }),
], [], [{ id: 'o000001', op: 'difference', results: ['bleft00', 'bright0'], was: [{ order: 0, frames: [{ id: 'g000009', name: 'Pair' }, { id: 'g000008', name: null }] }, { order: 2, frames: [] }], sources: [
  shape('Keys', { id: 'bwide00', cols: 6, rows: 4, variable: 1, reference: true, entries: { '3,1': 7 }, inside: space([shape('Inner', { id: 'binner0' })]) }),
  shape('Shape 2', { id: 'bband00', x: 2, cols: 2, rows: 4 })] }]);

test('a promise on a shape a cut keeps off the canvas is dropped when a project is read, and said, unless a use of its variable lies in a space to show it', () => {
  /* Keys is promised and still on the canvas (bkeys00), and its kept use says the same: kept. Shape 2 is kept by the cut alone: its promise could be neither seen nor taken off */
  const cut = cutSpace(); cut.shapes[2].holds = 'natural'; cut.operations[0].sources[0].holds = 'natural'; cut.operations[0].sources[1].holds = 'integer?';
  let got = read(write(project(cut)));
  assert.deepEqual(got.unheld, [{ name: 'Shape 2', holds: 'integer?', why: 'it is kept off the canvas by a cut, where a promise can be neither seen nor taken off' }]);
  assert.deepEqual(got.top.operations[0].sources.map(d => d.holds), ['natural', undefined]); assert.equal(got.top.shapes[2].holds, 'natural');
  assert.deepEqual(read(write(got)).unheld, []); assert.deepEqual(write(read(write(got))), write(got));      /* and saved again there is nothing left to drop */
  /* the one use of a variable, kept by a cut: dropped, with or without a variable's number */
  const lone = cutSpace(); lone.shapes.pop(); lone.operations[0].sources[0] = { ...lone.operations[0].sources[0], reference: false, holds: 'whole' };
  got = read(write(project(lone))); assert.deepEqual(got.unheld.map(u => [u.name, u.holds]), [['Keys', 'whole']]); assert.ok(!('holds' in got.top.operations[0].sources[0]));
});
test('operations and ranges come back as they went, in every space', () => {
  const inner = space([shape('Shape 1', { id: 'bpart00', cols: 2, rows: 2, from: { id: 'bunder0', range: range(1, 1, 2, 2) } })], [],
    [{ id: 'o000002', op: 'intersect', results: ['bpart00'], was: null, sources: [shape('Under', { id: 'bunder0', cols: 5, rows: 5 }),
      shape('Fused', { id: 'bfused0', x: 1, y: 1, cols: 2, rows: 2, joined: [{ fx: 0, fy: 0, fw: 0.5, fh: 1, shape: shape('L', { cols: 1, rows: 2 }) }, { fx: 0.5, fy: 0, fw: 0.5, fh: 1, shape: shape('R', { cols: 1, rows: 2 }) }] })] }]);
  const top = cutSpace(); top.shapes.push(shape('Holder', { id: 'bhold00', x: 40, inside: inner }));
  const p = project(top);
  assert.deepEqual(read(write(p)), p);
  assert.deepEqual(write(read(write(p))), write(p));
});

test('a space that was cut has operations.json, holding each operation with its two sources whole; a space that was not has none', () => {
  const files = write(project(cutSpace()));
  assert.deepEqual(paths(files), ['Keys (2)/Inner.json', 'Keys.json', 'Shape 3.json', 'Tail.json', 'operations.json', 'project.json'].sort());      /* a source has no file of its own; its definition is a directory, as any shape's, under a name no other has */
  const ops = json(files, 'operations.json');
  assert.equal(ops.format, 'smart-factory/operations'); assert.equal(ops.version, FORMAT); assert.equal(ops.operations.length, 1);
  const [o] = ops.operations;
  assert.deepEqual([o.id, o.op, o.results], ['o000001', 'difference', ['bleft00', 'bright0']]);
  assert.deepEqual(o.was, [{ order: 0, frames: [{ id: 'g000009', name: 'Pair' }, { id: 'g000008', name: null }] }, { order: 2, frames: [] }]);      /* where each source was, for Revert */
  assert.deepEqual(o.sources.map(c => [c.format, c.id, c.name, c.position, c.size]), [['smart-factory/shape', 'bwide00', 'Keys', { x: 0, y: 0 }, { cols: 6, rows: 4 }], ['smart-factory/shape', 'bband00', 'Shape 2', { x: 2, y: 0 }, { cols: 2, rows: 4 }]]);
  assert.equal(o.sources[0].definition, 'Keys (2)/');
  assert.deepEqual(json(files, 'Shape 3.json').from, { id: 'bwide00', range: { col: 0, row: 0, cols: 2, rows: 4, toEnd: { cols: false, rows: true } } });
  assert.deepEqual(json(files, 'Shape 3.json').value.entries, {});      /* its entries are its source's: none are written */
  assert.ok(!paths(write(project(space([shape('A')])))).includes('operations.json'));
  assert.deepEqual(read(write(project(space([shape('A')])))).top.operations, []);
});

test('a measure keeps its side and a range its range: from holds one or the other', () => {
  const files = write(project(space([shape('W', { cols: 1, rows: 1, from: { id: 'b1', side: 'y' } }), shape('P', { from: { id: 'b1', range: range(1, 0, 2, 3, true, false) } })])));
  assert.deepEqual(json(files, 'W.json').from, { id: 'b1', side: 'y' });
  assert.deepEqual(json(files, 'P.json').from, { id: 'b1', range: { col: 1, row: 0, cols: 2, rows: 3, toEnd: { cols: true, rows: false } } });
});

test('a shape called operations does not take the operations file, and a shape file of that name is still a shape', () => {
  const p = project(cutSpace()); p.top.shapes.push(shape('operations', { id: 'bnamed0' }));
  const files = write(p);
  assert.ok(paths(files).includes('operations shape.json')); assert.equal(json(files, 'operations.json').format, 'smart-factory/operations');
  assert.deepEqual(read(files), p);
  const old = read([head(2), file('operations.json', config('operations', { size: { cols: 2, rows: 2 } }))]);      /* as a format 2 project could have had it */
  assert.deepEqual(old.top.shapes.map(s => s.name), ['operations']); assert.deepEqual(old.top.operations, []);
});

test('format 2 has no operations and no ranges: it reads as none', () => {
  const p = read([head(2), file('A.json', config('A', { id: 'baaaaaa', from: { id: 'bbbbbbb', side: 'x' } })), file('B.json', config('B'))]);
  assert.deepEqual(p.top.operations, []); assert.deepEqual(p.top.shapes[0].from, { id: 'bbbbbbb', side: 'x' });
});

test('operations and ranges with things missing or wrong are read with safe values, or passed over', () => {
  const src = n => config(n, { id: 'b' + n });
  const p = read([head(), file('P.json', config('P', { from: { id: 'bA', range: { col: -2, row: 1.4, cols: 0, toEnd: { cols: 1 } } } })), file('Q.json', config('Q', { from: { id: 'bA', range: 'all' } })),
    file('operations.json', { format: 'smart-factory/operations', version: FORMAT, operations: [
      { id: 'o1', op: 'difference', sources: [src('A'), src('B')], results: ['bP', 7, null], was: [{ order: -1, frames: [{ id: 'g1', name: 4 }, { name: 'no id' }, null] }, 'x'] },
      { id: 'o2', op: 'union', sources: [src('C'), src('D')], results: ['bQ'] },            /* no such operation */
      { id: 'o3', op: 'intersect', sources: [src('E')], results: ['bQ'] },                  /* not two sources */
      { id: 'o4', op: 'intersect', sources: [src('F'), src('G')], results: [] },            /* it made nothing */
      { op: 'intersect', sources: [src('H'), null], results: ['bR'] }, null, 'x'] })]);
  assert.deepEqual(p.top.shapes.map(s => s.from), [{ id: 'bA', range: { col: 0, row: 1, cols: 1, rows: 1, toEnd: { cols: true, rows: false } } }, { id: 'bA', side: 'x' }]);
  assert.deepEqual(p.top.operations.map(o => [o.id, o.op, o.sources.map(s => s.name), o.results]), [['o1', 'difference', ['A', 'B'], ['bP']], [null, 'intersect', ['H', 'Shape'], ['bR']]]);
  assert.deepEqual(p.top.operations.map(o => o.was), [[{ order: null, frames: [{ id: 'g1', name: null }] }, { order: null, frames: [] }], null]);      /* where the sources were: what can be read of it, and nothing where it is not two places */
  assert.deepEqual(read([head(), file('operations.json', { format: 'smart-factory/operations', operations: 'none' })]).top.operations, []);
});

test('projects/boolean-tool holds a fused shape, a cut and an intersection, each part a range of a kept source', () => {
  const dir = fileURLToPath(new URL('../projects/boolean-tool/', import.meta.url)), files = [];
  const walk = at => { for (const n of readdirSync(join(dir, at))){ const p = at ? at + '/' + n : n; if (statSync(join(dir, p)).isDirectory()) walk(p); else files.push({ path: p, text: readFileSync(join(dir, p), 'utf8') }); } };
  walk('');
  const top = read(files).top, byId = new Map(top.operations.flatMap(o => o.sources).map(s => [s.id, s]));
  assert.deepEqual(top.operations.map(o => [o.op, o.sources.map(s => s.name), o.results.length]), [['difference', ['Keys', 'Head'], 2], ['intersect', ['Table', 'Window'], 1]]);
  const parts = top.shapes.filter(s => s.from?.range);
  assert.equal(parts.length, 3);
  for (const p of parts){ assert.ok(byId.has(p.from.id), p.name + ' is a part of a kept source'); assert.deepEqual(p.entries, {}); assert.ok(top.operations.some(o => o.results.includes(p.id))); }
  assert.deepEqual(parts.map(p => [p.from.range.col, p.from.range.cols, p.from.range.toEnd.cols]).sort(), [[0, 2, false], [3, 2, false], [4, 2, true]]);
  assert.equal(top.shapes.filter(s => s.joined).length, 1);
  /* the cut Keys is still the variable its other use is */
  const kept = top.operations[0].sources[0], used = top.shapes.find(s => s.name === 'Keys');
  assert.ok(Number.isInteger(kept.variable)); assert.equal(kept.variable, used.variable);
});

test('entries: every kind that may be kept is written and read back; a formula is written as its text alone', () => {
  const entries = { '1,1': 7, '2,1': -Infinity, '3,1': { n: 1, d: 2, k: 1 }, '1,2': true, '2,2': { expr: '1/√(@[b3k2m9x:x])' }, '3,2': false, '1,3': { sym: '1+sqrt(2)' }, '2,3': { n: 2, k: 1 }, '3,3': Infinity };
  const files = write(project(space([shape('S', { cols: 3, rows: 3, entries })])));
  assert.deepEqual(json(files, 'S.json').value.entries, { '1,1': 7, '2,1': '-inf', '3,1': { n: 1, d: 2, k: 1 }, '1,2': true, '2,2': { expr: '1/√(@[b3k2m9x:x])' }, '3,2': false, '1,3': { sym: '1+sqrt(2)' }, '2,3': { n: 2, k: 1 }, '3,3': 'inf' });
  assert.equal(json(files, 'S.json').value.as, 'resolved');      /* a formula is something given */
  assert.deepEqual(read(files).top.shapes[0].entries, entries);
  assert.equal(typeof json(files, 'S.json').value.entries['1,2'], 'boolean');
});

test('entries: an error, a decimal and anything worked out are never written, and are dropped on reading', () => {
  const files = write(project(space([shape('S', { cols: 3, rows: 2, entries: { '1,1': 7, '2,1': { err: 'divide by zero' }, '3,1': { f: 0.4375 }, '1,2': { expr: '1/0', value: { err: 'divide by zero' } }, '2,2': null, '3,2': 1.5 } })])));
  assert.deepEqual(json(files, 'S.json').value.entries, { '1,1': 7, '1,2': { expr: '1/0' } });      /* a formula goes without its result */
  const at = entries => read([head(3), file('S.json', { format: 'smart-factory/shape', version: 3, name: 'S', named: true, size: { cols: 3, rows: 2 }, value: { entries } })]).top.shapes[0].entries;
  assert.deepEqual(at({ '1,1': 7, '2,1': { err: 'divide by zero' }, '3,1': { f: 0.4375 }, '1,2': { expr: '2 + 2', err: 'x' }, '2,2': 'nonsense', '3,2': { n: 'a', k: 0 }, '1,3': null, '2,3': 2.5, '3,3': { sym: 3 } }),
    { '1,1': 7, '1,2': { expr: '2 + 2' } });
  assert.deepEqual(at({ '1,1': { n: 3, d: 1, k: 0 }, '2,1': { n: 3, d: 4, k: 0, extra: 1 } }), { '1,1': { n: 3, k: 0 }, '2,1': { n: 3, d: 4, k: 0 } });
});

test('attributes keep their text, capsules and all; a format 2 project\'s entries and attributes read unchanged', () => {
  const files = write(project(space([shape('S', { attributes: [{ name: 'heads', value: '@[b3k2m9x:x] / 2' }, { name: 'scale', value: '1/√(@[b3k2m9x:a:heads])' }] })])));
  assert.deepEqual(json(files, 'S.json').attributes, [{ name: 'heads', value: '@[b3k2m9x:x] / 2' }, { name: 'scale', value: '1/√(@[b3k2m9x:a:heads])' }]);
  assert.deepEqual(read(files).top.shapes[0].attributes, [{ name: 'heads', value: '@[b3k2m9x:x] / 2' }, { name: 'scale', value: '1/√(@[b3k2m9x:a:heads])' }]);
  const old = read([head(2), file('S.json', { format: 'smart-factory/shape', version: 2, name: 'S', named: true, size: { cols: 2, rows: 2 }, attributes: [{ name: 'heads', value: '2^(3) + 1' }],
    value: { entries: { '1,1': 0, '2,1': '-inf', '1,2': { n: 3, d: 4, k: 0 }, '2,2': 'inf' } } })]).top.shapes[0];
  assert.deepEqual(old.entries, { '1,1': 0, '2,1': -Infinity, '1,2': { n: 3, d: 4, k: 0 }, '2,2': Infinity }); assert.deepEqual(old.attributes, [{ name: 'heads', value: '2^(3) + 1' }]);
});

/* ---- arrows and seats (phase 4) ---- */
const anArrow = (more = {}) => ({ input: { id: 'bin0001', as: 'block' }, side: 'e', start: 1, span: 3, gap: 2, gapName: null, output: null, formula: null, ...more });
test('arrows, seats and an input block come back as they went', () => {
  const p = project(space([
    shape('Keys', { id: 'bin0001', cols: 4, rows: 3 }),
    shape('Shape 1', { id: 'barrow1', type: 'arrow', x: 4, cols: 2, rows: 3, arrow: anArrow() }),
    shape('H', { id: 'bseat01', x: 6, cols: 4, rows: 3, seat: 'barrow1', entries: { '1,1': 9 } }),      /* its own entries are kept, and not used while it is seated */
    shape('relu', { id: 'barrow2', type: 'arrow', arrow: anArrow({ input: { id: 'barrow1', as: 'result' }, side: 's', start: 2, span: 2, gap: 3, gapName: 'air', output: { cols: 2, rows: 3 }, formula: 'max(x, @[bin0001])' }),
      inside: space([shape('in', { id: 'binner1', in: true }), shape('W', { x: 2, cols: 5, rows: 2 })]) }),
    shape('A', { id: 'bpairA1' }), shape('B', { id: 'bpairB1' }),
    shape('Shape 2', { id: 'barrow3', type: 'arrow', arrow: anArrow({ input: { id: 'bpairA1', as: 'result', hollow: 2 } }) }),
    shape('P', { id: 'bseat02', seat: { hollow: ['bpairA1', 'bpairB1'] } }),
  ]));
  assert.deepEqual(read(write(p)), p);
});
test('an arrow is written as type "arrow" with its arrow, and nothing that was worked out', () => {
  const files = write(project(space([shape('Keys', { id: 'bin0001' }), shape('relu', { id: 'barrow1', type: 'arrow', arrow: { ...anArrow({ formula: 'max(x, 0)' }), place: { x: 9, y: 9 }, values: { '1,1': 2 } } }),
    shape('H', { id: 'bseat01', seat: 'barrow1' })])));
  const a = json(files, 'relu.json');
  assert.equal(a.type, 'arrow');
  assert.deepEqual(a.arrow, { input: { id: 'bin0001', as: 'block' }, side: 'e', start: 1, span: 3, gap: 2, gapName: null, output: null, formula: 'max(x, 0)' });      /* where its output is, and what it comes to, are never written */
  assert.equal(json(files, 'H.json').seat, 'barrow1');
  assert.equal('seat' in json(files, 'Keys.json'), false); assert.equal('arrow' in json(files, 'Keys.json'), false); assert.equal('in' in json(files, 'Keys.json'), false);
});
test('an arrow with things missing or wrong is read with safe values', () => {
  const got = read([head(), file('a.json', config('Shape 1', { id: 'barrow1', type: 'arrow', arrow: { input: { as: 'nothing', hollow: 2 }, side: 'up', start: 0, span: 'x', gap: -3, gapName: '  ', output: { cols: 0, rows: 2 }, formula: '   ' } })),
    file('b.json', config('Shape 2', { id: 'barrow2', type: 'arrow' })),
    file('c.json', config('Shape 3', { id: 'barrow3', type: 'arrow', arrow: { input: { id: 'bx', as: 'block', hollow: 1 }, side: 'n', start: 2.4, span: 3, gap: 2, gapName: ' air ', output: { cols: 2.2, rows: 3 }, formula: 'x' } })),
    file('d.json', config('Shape 4', { id: 'bplain1', arrow: anArrow() }))]).top.shapes;
  const safe = { input: { id: '', as: 'block' }, side: 'e', start: 1, span: 1, gap: 1, gapName: null, output: null, formula: null };
  assert.deepEqual(got[0].arrow, safe); assert.deepEqual(got[1].arrow, safe);
  assert.deepEqual(got[2].arrow, { input: { id: 'bx', as: 'block' }, side: 'n', start: 2, span: 3, gap: 2, gapName: 'air', output: { cols: 2, rows: 3 }, formula: 'x' });      /* a hollow goes with a result only */
  assert.equal(got[3].arrow, null);                         /* only a shape of type arrow is one */
});
test('a seat that names nothing the project has is dropped; one that names an arrow anywhere is kept', () => {
  const got = read([head(), file('a.json', config('Shape 1', { id: 'barrow1', type: 'arrow', arrow: anArrow() })),
    file('h.json', config('H', { id: 'bseat01', seat: 'barrow1' })), file('g.json', config('G', { id: 'bseat02', seat: 'bgone01' })),
    file('k.json', config('K', { id: 'bseat03', seat: 'bseat01' })),                                   /* a block that is no arrow */
    file('p.json', config('P', { id: 'bseat04', seat: { hollow: ['bseat01', 'bseat02'] } })), file('q.json', config('Q', { id: 'bseat05', seat: { hollow: ['bseat01', 'bgone02'] } })),
    file('r.json', config('R', { id: 'bseat06', seat: { hollow: ['bseat01'] } })), file('s.json', config('S', { id: 'bseat07', seat: 7 }))]).top.shapes;
  const seat = name => got.find(d => d.name === name).seat;
  assert.equal(seat('H'), 'barrow1'); assert.equal(seat('G'), null); assert.equal(seat('K'), null);
  assert.deepEqual(seat('P'), { hollow: ['bseat01', 'bseat02'] }); assert.equal(seat('Q'), null); assert.equal(seat('R'), null); assert.equal(seat('S'), null);
});
test('format 2 has no arrows and no seats', () => {
  const got = read([head(2), file('a.json', config('Keys', { id: 'b1' }))]).top.shapes[0];
  assert.equal(got.arrow, null); assert.equal(got.seat, null); assert.equal(got.in, false);
});

test('projects/arrows holds each kind of arrow, every input and seat naming something that is there', () => {
  const dir = join(fileURLToPath(new URL('..', import.meta.url)), 'projects', 'arrows'), p = read(tree(dir)), top = p.top.shapes;
  const arrows = top.filter(d => d.arrow), by = name => top.filter(d => d.name === name), ids = new Set(top.map(d => d.id));
  assert.equal(arrows.length, 7);
  /* a variable's definition is written once: a later use of a named arrow has the one its first use carries */
  const spaceOf = a => a.inside || arrows.find(o => o.inside && o.variable != null && o.variable === a.variable).inside;
  for (const a of arrows){ assert.ok(ids.has(a.arrow.input.id), a.name + ' reads something on the canvas'); assert.ok(spaceOf(a).shapes.some(d => d.in && d.name === 'in'), a.name + ' has its input block'); }
  for (const d of top.filter(d => d.seat)) assert.ok(typeof d.seat === 'string' ? arrows.some(a => a.id === d.seat) : d.seat.hollow.every(id => ids.has(id)), d.name);
  assert.deepEqual(top.filter(d => d.seat).map(d => d.name).sort(), ['Gated', 'H']);
  /* a named arrow used twice is one variable with one formula; the second is a reference */
  const [relu, again] = by('relu'); assert.equal(relu.arrow.formula, 'max(x, 0)'); assert.equal(again.arrow.formula, 'max(x, 0)'); assert.equal(relu.variable, again.variable); assert.equal(again.reference, true);
  assert.equal(by('mask')[0].arrow.formula, 'select(i > j, -inf, x)');
  /* a use of one of the program's functions carries no formula of its own, and reads another arrow's output */
  const exp = by('.exp')[0]; assert.equal(exp.arrow.formula, null); assert.equal(exp.reference, true); assert.deepEqual(exp.arrow.input, { id: by('mask')[0].id, as: 'result' });
  /* a definition space: in against W, with a promise */
  const linear = by('linear')[0]; assert.deepEqual(linear.arrow.output, { cols: 2, rows: 3 }); assert.deepEqual(linear.inside.shapes.map(d => d.name).sort(), ['W', 'in']);
  /* the result of a pair, carried out of its hollow */
  const carried = arrows.find(a => a.arrow.input.hollow); assert.deepEqual(carried.arrow.input, { id: by('Weights')[0].id, as: 'result', hollow: 1 }); assert.equal(by('Gated')[0].seat, carried.id);
  /* nothing that was worked out is in a file: H's entries are its arrow's, and are not written */
  assert.deepEqual(by('H')[0].entries, {});
});

/* a project with the .config that comes with it, which is kept beside its directory (projects/README.md) */
const shipped = name => [...tree(join(here, name)), ...readdirSync(here).filter(n => n === name + '.config').map(n => ({ path: '.config', text: readFileSync(join(here, n), 'utf8') }))];
test('every project that comes with the repository says "standing" for a standing shape, and none says "tile"', () => {
  let standing = 0;
  for (const name of readdirSync(here).filter(n => statSync(join(here, n)).isDirectory())) for (const f of shipped(name)){
    assert.equal(/"tile"\s*:/.test(f.text), false, name + '/' + f.path + ' still says tile'); if (/"standing": true/.test(f.text)) standing++; }
  assert.ok(standing >= 12);
  /* the default Menu's six colour rows, light and dark, stand in .variable_colors' matrix */
  const menu = read(shipped('default-menu')), every = [], walk = sp => { for (const d of sp.shapes){ every.push(d); if (d.inside) walk(d.inside); } }; walk(menu.top);
  assert.equal(every.filter(d => d.standing).length, 12);
});

test('projects/sources-and-tiles holds sources, standing shapes, a tile read by an arrow, the index, and a mapped arrow', () => {
  const p = read(tree(join(here, 'sources-and-tiles'))), top = p.top.shapes, by = name => top.find(d => d.name === name), tile = name => p.top.groups.find(g => g.name === name);
  assert.deepEqual(['Eye', 'Wide', 'Zero', 'One'].map(n => [by(n).source, by(n).entries]), [['identity', {}], ['identity', {}], ['zeros', {}], ['ones', {}]]);
  /* Bias in a tile whose down follows X's height; the arrow that reads the tile; B seated on it */
  const rows = tile('Every row'); assert.deepEqual(rows.repeat.down, { expr: `@[${by('X').id}:y]` }); assert.deepEqual(rows.members.map(i => top[i].name), ['Bias']);
  const out = top.find(d => d.arrow?.input.as === 'tile'); assert.equal(out.arrow.input.id, rows.id); assert.equal(by('B').seat, out.id);
  assert.deepEqual([rows.repeat.cols, rows.repeat.rows, by('Bias').cols, by('Bias').rows, by('Bias').x - rows.repeat.x, by('Bias').y - rows.repeat.y], [4, 1, 4, 1, 0, 0]);      /* the pattern is covered exactly */
  /* the index, in entries */
  assert.deepEqual(by('Place').entries, { '1,1': { expr: 'index.x + index.y' } }); assert.deepEqual([tile('Index').repeat.across, tile('Index').repeat.down], [2, 2]);
  /* map: relu is in the tile, its input M is not, and the pattern is as wide as its span */
  const relu = by('relu'), map = tile('Every column');
  assert.equal(relu.arrow.formula, 'max(x, 0)'); assert.equal(relu.arrow.input.id, by('M').id); assert.deepEqual(map.members.map(i => top[i].name), ['relu']);
  assert.deepEqual([map.repeat.cols, relu.arrow.span, map.repeat.across, map.repeat.down, relu.arrow.side], [1, 1, 4, 1, 's']); assert.equal(by('R').seat, relu.id);
  /* standing shapes */
  assert.deepEqual(by('Stack').inside.shapes.map(d => [d.name, d.standing]), [['Bias', true], ['Bias', true]]);
  /* nothing names what is not there */
  const ids = new Set([...top.map(d => d.id), ...p.top.groups.map(g => g.id)]);
  for (const d of top.filter(d => d.arrow)) assert.ok(ids.has(d.arrow.input.id), d.name);
});

/* ---- phase 7: noise, file sources and data/ ---- */
test('noise and a file source are written as the format has them and read back; data files are written as they are', () => {
  const p = { ...project(space([shape('N', { cols: 4, rows: 4, source: { noise: { seed: 3, dist: 'normal' } }, entries: { '1,1': 9 } }), shape('W', { cols: 2, rows: 2, source: { file: 'data/w.csv' } }), shape('E', { source: { file: null } })])),
    data: { 'data/w.csv': '1,2\n3,4\n', 'data/../x.csv': 'no', 'elsewhere.csv': 'no', 'data/n.csv': 7 } };
  const files = write(p);
  assert.deepEqual(json(files, 'N.json').source, { noise: { seed: 3, dist: 'normal' } }); assert.deepEqual(json(files, 'N.json').value, { as: 'resolved', entries: {} });
  assert.deepEqual(json(files, 'W.json').source, { file: 'data/w.csv' }); assert.deepEqual(json(files, 'E.json').source, { file: null });
  assert.deepEqual(files.filter(f => f.path.endsWith('.csv')), [{ path: 'data/w.csv', text: '1,2\n3,4\n' }]);      /* only a path under data/, and only text */
  const back = read(files);
  assert.deepEqual(back.top.shapes.map(d => d.source), [{ noise: { seed: 3, dist: 'normal' } }, { file: 'data/w.csv' }, { file: null }]);
  assert.deepEqual(back.data, { 'data/w.csv': '1,2\n3,4\n' });
  assert.deepEqual(write(back).map(f => f.path).sort(), files.map(f => f.path).sort());
  assert.deepEqual(read([head(3)]).data, {});      /* a project with no data/ has none */
  /* a decimal or an error among a file's entries is dropped on reading, and never written */
  const d = read([head(3), file('S.json', at('S', 0, 0, 2, 1, { value: { entries: { '1,1': { f: 0.5 }, '2,1': { err: 'no' } } } }))]).top.shapes[0];
  assert.deepEqual(d.entries, {});
  assert.deepEqual(json(write(project(space([shape('S', { cols: 2, entries: { '1,1': { f: 0.5 }, '2,1': 3 } })])), ), 'S.json').value.entries, { '2,1': 3 });
});

test('projects/noise-and-data holds a noise block, a file source with its file under data/, and survives being written and read again', () => {
  const files = shipped('noise-and-data'), p = read(files), by = name => p.top.shapes.find(d => d.name === name);
  assert.deepEqual(by('Noise').source, { noise: { seed: 0, dist: 'uniform' } }); assert.deepEqual([by('Noise').cols, by('Noise').rows, by('Noise').entries], [4, 4, {}]);
  assert.deepEqual(by('Draw').source, { noise: { seed: 7, dist: 'normal' } }); assert.deepEqual(by('Weights').source, { file: 'data/weights.csv' });
  assert.deepEqual(Object.keys(p.data), ['data/weights.csv']); assert.equal(p.data['data/weights.csv'].split('\n').length, 6);      /* a header and four rows of two: the block's size */
  assert.deepEqual([by('Weights').cols, by('Weights').rows], [2, 4]);
  assert.equal(p.top.shapes.find(d => d.arrow).arrow.formula, 'exp(x)');
  for (const f of files) assert.ok(!/"f":|"err":/.test(f.text), f.path);      /* no decimal and no error in any file */
  const again = write(p).map(f => f.path).sort(); assert.deepEqual(again, files.map(f => f.path).sort());
  assert.deepEqual(read(write(p)).data, p.data);
});

/* ---- phase 8: inner data (format 4) ---- */
test('format 4: a shape\'s inner axes are written in its size and its sides, and its long entry keys as they are', () => {
  const inner = [{ length: 2, name: 'key' }, { length: 4, name: null }];
  const p = project(space([shape('QKV', { id: 'b0000q1', cols: 3, rows: 1, inner, entries: { '2,1,1,3': 7, '2,1,2,3': { expr: '1/√(@[b0000q1:d1])' }, '3,1,2,4': Infinity } }), shape('Plain')]));
  const files = write(p), q = json(files, 'QKV.json');
  assert.deepEqual(q.size, { cols: 3, rows: 1, inner: [2, 4] }); assert.deepEqual(q.sides, { cols: null, rows: null, inner: ['key', null] });
  assert.deepEqual(q.value.entries, { '2,1,1,3': 7, '2,1,2,3': { expr: '1/√(@[b0000q1:d1])' }, '3,1,2,4': 'inf' });
  assert.deepEqual(json(files, 'Plain.json').size, { cols: 2, rows: 3 }); assert.deepEqual(json(files, 'Plain.json').sides, { cols: null, rows: null });      /* no inner data: not a word of it */
  assert.deepEqual(read(files), p);
  assert.deepEqual(write(read(files)), files);
});
test('format 4: value.as is "resolved" only when every number at every inner position has been given', () => {
  const all = {}; for (const c of [1, 2]) for (const k of [1, 2, 3]) all[`${c},1,${k}`] = c * k;
  const as = entries => json(write(project(space([shape('S', { cols: 2, rows: 1, inner: [{ length: 3, name: null }], entries })]))), 'S.json').value.as;
  assert.equal(as(all), 'resolved');
  const { '2,1,3': _, ...most } = all; assert.equal(as(most), 'variable');
  assert.equal(as({ '1,1': 1, '2,1': 2 }), 'variable');      /* the short keys are not its entries */
});
test('format 4: an entry taken out keeps the shape and the entry it is, from 1', () => {
  const p = project(space([shape('QKV', { id: 'b0000q1', cols: 3, rows: 1, inner: [{ length: 2, name: null }, { length: 4, name: null }] }), shape('W_K', { cols: 2, rows: 4, from: { id: 'b0000q1', entry: { col: 2, row: 1 } } })]));
  const files = write(p);
  assert.deepEqual(json(files, 'W_K.json').from, { id: 'b0000q1', entry: { col: 2, row: 1 } });
  assert.deepEqual(read(files), p);
  const odd = read([head(), file('E.json', config('E', { named: true, from: { id: 'b1', entry: { col: 0, row: 'x' } } }))]).top.shapes[0].from;
  assert.deepEqual(odd, { id: 'b1', entry: { col: 1, row: 1 } });
});
test('format 4: inner with things missing or wrong is read with safe values, and an arrow has none', () => {
  const got = (size, sides, more = {}) => read([head(), file('S.json', config('S', { named: true, size, sides, ...more }))]).top.shapes[0].inner;
  assert.deepEqual(got({ cols: 3, rows: 1, inner: [2, 4] }, { cols: null, rows: null, inner: ['key', 'embed'] }), [{ length: 2, name: 'key' }, { length: 4, name: 'embed' }]);
  assert.deepEqual(got({ cols: 3, rows: 1, inner: [2, 4] }, { cols: null, rows: null }), [{ length: 2, name: null }, { length: 4, name: null }]);
  assert.deepEqual(got({ cols: 3, rows: 1, inner: [2.4, 0, 'x'] }, { inner: ['', 7] }), [{ length: 2, name: null }, { length: 1, name: null }, { length: 1, name: null }]);
  assert.equal(got({ cols: 3, rows: 1, inner: [1, 2, 3, 4, 5, 6, 7, 8] }, {}).length, 6);
  assert.equal(got({ cols: 3, rows: 1, inner: [] }, {}), null); assert.equal(got({ cols: 3, rows: 1, inner: 'x' }, {}), null); assert.equal(got({ cols: 3, rows: 1 }, { inner: ['key'] }), null);
  assert.equal(got({ cols: 3, rows: 1, inner: [2] }, {}, { type: 'arrow', arrow: {} }), null);
});
test('format 3 is read exactly as it is, and saved again differs only in the format number', () => {
  const v3 = (v, more = {}) => [file('project.json', { format: 'smart-factory/project', version: v, saved: null, ...more }),
    file('A.json', { format: 'smart-factory/shape', version: v, id: 'b000001', type: 'tensor', name: 'A', named: true, commented: false, color: 'variable-1', position: { x: 0, y: 0 }, size: { cols: 2, rows: 2 }, sides: { cols: 'k', rows: null },
      value: { as: 'variable', entries: { '1,1': 3, '2,2': { expr: '2^3' } } }, order: 0 })].map(f => ({ path: f.path, text: JSON.stringify(JSON.parse(f.text), null, 2) + '\n' }));
  const old = read(v3(3));
  assert.equal(old.converted, 0); assert.equal(old.changed, 0); assert.equal(old.top.shapes[0].inner, null);
  assert.deepEqual(old.top.shapes[0].entries, { '1,1': 3, '2,2': { expr: '2^3' } });
  assert.deepEqual(write(old), v3(FORMAT, { tick: 0 }));      /* (and project.json says the tick, which is 0: format 8) */
});
test('projects/inner-data holds a shape of matrices with a matrix standing in each entry, a function that takes it whole, and its entries taken out', () => {
  const files = shipped('inner-data'), p = read(files), by = name => p.top.shapes.find(d => d.name === name);
  assert.equal(p.converted, 0); assert.equal(p.changed, 0);
  assert.deepEqual(by('QKV').inner, [{ length: 2, name: 'key' }, { length: 4, name: 'embed' }]); assert.equal(by('QKV').cols, 3); assert.equal(by('QKV').rows, 1);
  assert.deepEqual(by('QKV').inside.shapes.map(d => [d.name, d.standing, d.cols, d.rows, d.x, d.y]), [['W_Q', true, 2, 4, -7, -2], ['W_K', true, 2, 4, -5, -2], ['W_V', true, 2, 4, -3, -2]]);      /* each at its entry's place, entry for entry */
  assert.deepEqual(by('Heads').inner, [{ length: 3, name: 'head' }]); assert.equal(Object.keys(by('Heads').entries).length, 24); assert.ok(Object.keys(by('Heads').entries).every(k => /^[12],[1-4],[123]$/.test(k)));
  const attend = by('attend'), inside = attend.inside.shapes, input = inside.find(d => d.in);
  assert.equal(attend.arrow.input.id, by('QKV').id); assert.deepEqual(input.inner, by('QKV').inner);
  assert.deepEqual(inside.filter(d => d.from).map(d => [d.name, d.from.id === input.id, d.from.entry, d.transposed]), [['Q', true, { col: 1, row: 1 }, false], ['K', true, { col: 2, row: 1 }, true], ['V', true, { col: 3, row: 1 }, false]]);
  for (const f of files.filter(f => f.path.endsWith('.json'))) assert.equal(JSON.parse(f.text).version ?? 4, 4, f.path);      /* it was saved at format 4, and is kept as it was saved */
  const again = write(read(write(p))); assert.deepEqual(again, write(p));      /* written, read and written again: the same files */
  const byPath = list => Object.fromEntries(list.filter(f => f.path !== 'project.json').map(f => [f.path, f.text]));
  const v4 = o => Object.fromEntries(Object.entries(o).map(([k, t]) => [k, t.replace(/"version": \d+/g, '"version": 4')]));
  assert.deepEqual(v4(byPath(write(p))), byPath(files));      /* and they are the files that are shipped, but for the format's number */
});
test('every project that comes with the repository opens and saves as it did before format 5: saved, read and saved again gives the same files, and none gains a holds or a None', () => {
  const root = fileURLToPath(new URL('../projects/', import.meta.url)); let seen = 0;
  for (const name of readdirSync(root)){ if (!statSync(join(root, name)).isDirectory()) continue; seen++;
    const p = read(shipped(name)), files = write(p);
    assert.deepEqual(write(read(files)), files, name); assert.deepEqual(read(files), read(write(read(files))), name);
    for (const f of files){ assert.ok(name === 'none-and-spaces' || name === 'conditions' || name === 'running' || !/"holds"|"none"/.test(f.text), name + '/' + f.path); assert.ok(name === 'conditions' || !/"choose"/.test(f.text), name + '/' + f.path); assert.ok(name === 'running-total' || name === 'streams' || name === 'running' || !/"step"|"until"|"inf"/.test(f.text), name + '/' + f.path); assert.ok(name === 'streams' || name === 'running' || !/"stream"|"tick": [1-9]/.test(f.text), name + '/' + f.path); if (f.path.endsWith('.json')) assert.equal(JSON.parse(f.text).version ?? FORMAT, FORMAT, f.path); } }      /* (none-and-spaces is the one made for format 5: it has both; conditions holds None, and is the one with conditional arrows; running holds .backend with natural holds) */
  assert.ok(seen >= 12);
});
test('projects/none-and-spaces holds a None, a select that None decides, a promise kept, one broken with its sentence, and an arrow that takes and gives', () => {
  const files = shipped('none-and-spaces'), p = read(files), by = name => p.top.shapes.find(d => d.name === name);
  assert.deepEqual(p.unheld, []); assert.deepEqual(p.resized, []); assert.equal(JSON.parse(files.find(f => f.path === 'project.json').text).version, 5);      /* as it was shipped: it is not saved again for a new format */
  /* its .config gives the shapes their colours, as every example's does: .variable_colors is defined, light and dark, by six colours standing in it */
  for (const dir of ['variable_colors/', 'variable_colors (2)/']) assert.deepEqual(files.filter(f => f.path.startsWith(dir)).map(f => JSON.parse(f.text).name).sort(), ['.fanta', '.lagoon', '.lavender', '.lazuli', '.marigold', '.watermelon'], dir);
  assert.equal((files.find(f => f.path === '.config').text.match(/"definition": "variable_colors/g) || []).length, 2);
  assert.deepEqual(by('W').entries['2,1'], { none: true }); assert.equal(by('W').holds, 'natural?'); assert.deepEqual(by('Pick').entries['1,1'], { expr: 'select(none, 2, 3)' });
  assert.ok(!('holds' in by('V'))); assert.equal(by('Bad').holds, 'natural'); assert.equal(by('Out').holds, 'whole'); assert.equal(by('Out').seat, by('linear').id);
  assert.equal(by('linear').inside.shapes.find(d => d.in).holds, 'natural');
  const g = build(p); assert.deepEqual(validate(g), []);
  const node = name => g.blocks[by(name).id], says = name => promiseOf(g, node(name));
  assert.deepEqual(evaluate(g, node('W')).entries, { '1,1': 1, '2,1': { none: true }, '1,2': 3, '2,2': 4 }); assert.equal(says('W').state, 'kept');
  assert.deepEqual(evaluate(g, node('Pick')).entries, { '1,1': 3 });      /* None is false: select takes its other side */
  assert.deepEqual(says('V'), { holds: null, inferred: 'natural', state: 'inferred', note: '' });
  assert.deepEqual(says('Bad'), { holds: 'natural', inferred: 'integer', state: 'broken', note: 'Bad is not natural: it holds -3 at 2, 1' });
  assert.deepEqual(evaluate(g, node('Out')).entries, { '1,1': 5, '1,2': 11 }); assert.equal(says('Out').state, 'kept');
  const paths = list => Object.fromEntries(list.filter(f => f.path !== 'project.json').map(f => [f.path, f.text.replace(/"version": \d+/g, '"version": 5')]));
  assert.deepEqual(paths(write(read(write(p)))), paths(write(p))); assert.deepEqual(paths(write(p)), paths(files));      /* saved again it is the files that are shipped, but for the format's number */
});
test('a format 4 project opens: its entries and shapes are read as they are, and saved it is format 5', () => {
  const p = project(space([shape('A', { id: 'b00000a', cols: 2, rows: 1, entries: { '1,1': 3, '2,1': { n: 1, d: 2, k: 0 } } })])), files = write(p);
  const old = files.map(f => ({ path: f.path, text: f.text.replace(/"version": 5/g, '"version": 4') }));
  assert.ok(old.every(f => !f.text.includes('"version": 5')));
  assert.deepEqual(read(old), read(files)); assert.deepEqual(write(read(old)), files);
});
test('None is kept: { "none": true } in a file, read back as None, and written again the same', () => {
  const p = project(space([shape('A', { id: 'b00000a', cols: 2, rows: 1, entries: { '1,1': { none: true }, '2,1': 0 } })])), files = write(p);
  assert.deepEqual(JSON.parse(files.find(f => f.path === 'A.json').text).value.entries, { '1,1': { none: true }, '2,1': 0 });
  assert.deepEqual(read(files).top.shapes[0].entries, { '1,1': { none: true }, '2,1': 0 });
  assert.deepEqual(write(read(files)), files);
  const odd = files.map(f => f.path === 'A.json' ? { path: f.path, text: f.text.replace('"none": true', '"none": 1') } : f);
  assert.deepEqual(read(odd).top.shapes[0].entries, { '2,1': 0 });      /* what is not None as it is written is no entry */
});
test('format 4: a turned use keeps its axis order, beside its own size as it is drawn; what is no order of its variable is dropped', () => {
  const inner = [{ length: 3, name: 'head' }], W = shape('W', { id: 'b00000w', cols: 2, rows: 1, inner, variable: 1 });
  const use = more => shape('W', { id: 'b0000w2', cols: 3, rows: 1, colsName: 'head', inner: [{ length: 2, name: null }], variable: 1, reference: true, axes: [2, 1, 0], ...more });
  const p = project(space([W, use()])), files = write(p);
  assert.deepEqual(json(files, 'W (2).json').axes, [2, 1, 0]); assert.equal('axes' in json(files, 'W.json'), false); assert.equal('transposed' in json(files, 'W (2).json'), false);
  assert.deepEqual(read(files), p); assert.deepEqual(write(read(files)), files);
  const kept = d => { const f = write(project(space([W, d]))); return json(f, 'W (2).json').axes ?? null; };
  assert.deepEqual(kept(use({ axes: [0, 2, 1] })), [0, 2, 1]);
  for (const axes of [[0, 1, 2], [1, 0, 2], [2, 1], [2, 1, 0, 3], [2, 2, 0], [2, 1, '0'], 'x', null]) assert.equal(kept(use({ axes })), null, JSON.stringify(axes));      /* nothing moved, a plain transpose, not every axis once */
  assert.equal(kept(use({ reference: false })), null);                                   /* only a reference is turned */
  assert.equal(kept(use({ inner: null, axes: [1, 0] })), null);                           /* no inner data: nothing to turn */
  const back = c => read([head(), file('S.json', config('S', { named: true, size: { cols: 3, rows: 1, inner: [2] }, sides: {}, ...c }))]).top.shapes[0];
  assert.deepEqual(back({ reference: true, axes: [2, 1, 0] }).axes, [2, 1, 0]); assert.equal('axes' in back({ axes: [2, 1, 0] }), false); assert.equal('axes' in back({ reference: true, axes: [5, 1, 0] }), false);
});
test('after review: writing a shape costs what its entries cost, never its size; an inner length past 16,000,000 is not read', () => {
  const huge = shape('H', { cols: 3000, rows: 3000, inner: [{ length: 16000000, name: null }, { length: 16000000, name: null }], entries: { '1,1,1,1': 5 } });
  const t0 = Date.now(), files = write(project(space([huge]))); assert.ok(Date.now() - t0 < 500, 'written at once');
  assert.equal(json(files, 'H.json').value.as, 'variable'); assert.deepEqual(json(files, 'H.json').size.inner, [16000000, 16000000]);
  assert.deepEqual(json(write(project(space([shape('H', { inner: [{ length: 1e12, name: null }] })]))), 'H.json').size.inner, [16000000]);      /* held to the most on the way out */
  for (const length of ['16000001', '1e12', '1e999']) assert.throws(() => read([head(), { path: 'S.json', text: `{"format":"smart-factory/shape","version":4,"name":"S","named":true,"size":{"cols":2,"rows":1,"inner":[${length}]}}` }]), /S has an inner axis .* long: the most is 16000000/);
  assert.deepEqual(read([head(), file('S.json', config('S', { named: true, size: { cols: 2, rows: 1, inner: [16000000] } }))]).top.shapes[0].inner, [{ length: 16000000, name: null }]);
  /* full is counted over the keys that are its own */
  const as = entries => json(write(project(space([shape('S', { cols: 2, rows: 1, inner: [{ length: 2, name: null }], entries })]))), 'S.json').value.as;
  assert.equal(as({ '1,1,1': 1, '2,1,1': 1, '1,1,2': 1, '2,1,2': 1 }), 'resolved'); assert.equal(as({ '1,1,1': 1, '2,1,1': 1, '1,1,2': 1, '3,1,2': 1 }), 'variable'); assert.equal(as({ '1,1,1': 1, '2,1,1': 1, '1,1,2': 1, '2,1,2': 1, '9,9': 1 }), 'resolved');
});

/* ---- every use of a variable is one size ---- */
test('a reference drawn at another size than its variable is set to its variable\'s size when the project is read, and read says which', () => {
  /* s is one entry; a second use of it is drawn 3 by 3 beside A, 2 wide and 3 tall: by its rectangle a product, and the node carried s's own size */
  const s = shape('s', { id: 'bs', cols: 1, rows: 1, variable: 1, entries: { '1,1': 2 } }), A = shape('A', { id: 'bA', x: 13, y: 0, cols: 2, rows: 3, variable: 2 });
  const use = shape('s', { id: 'bu', x: 10, y: 0, cols: 3, rows: 3, variable: 1, reference: true });
  const damaged = project(space([s, A, use])), g = build(damaged);
  /* (the builder no longer writes such a product: a product of 1 column and 3 rows is no node, so the piece is a mismatch by the variable's size, though the rectangles agree) */
  assert.deepEqual(g.spaces.top.pieces.find(x => x.blocks.includes('bu')).error, { code: 'mismatch', note: '1 ≠ 3' }); assert.deepEqual(validate(g), []);
  const p = read(write(damaged));
  assert.deepEqual(p.resized, [{ name: 's', cols: 1, rows: 1, was: { cols: 3, rows: 3 } }]);
  assert.deepEqual(p.top.shapes.map(d => [d.id, d.cols, d.rows, d.x, d.y]), [['bs', 1, 1, 0, 0], ['bA', 2, 3, 13, 0], ['bu', 1, 1, 10, 0]]);      /* it keeps its corner */
  const h = build(p), piece = h.spaces.top.pieces.find(x => x.blocks.includes('bu')); assert.deepEqual(validate(h), []);
  assert.equal(piece.error, null); assert.deepEqual(piece.blocks, ['bu']);      /* it keeps its corner, so it no longer reaches A: a piece of its own, and no product that is none */
  assert.deepEqual(read(write(p)).resized, []);      /* saved again, it is a project like any other */
});
test('the one size is the variable\'s as each use lies: transposed the other way round, turned the two axes its order draws; what has a size of its own is left', () => {
  const made = (more = {}) => shape('K', { id: 'bk', cols: 4, rows: 6, variable: 3, ...more }), use = (id, more = {}) => shape('K', { id, variable: 3, reference: true, ...more });
  const sizes = p => p.top.shapes.map(d => [d.cols, d.rows]);
  /* as it should be: nothing is touched */
  let p = read(write(project(space([made(), use('u1', { cols: 4, rows: 6 }), use('u2', { cols: 6, rows: 4, transposed: true })]))));
  assert.deepEqual(p.resized, []); assert.deepEqual(sizes(p), [[4, 6], [4, 6], [6, 4]]);
  /* a transposed use of it, and a use of a variable that is itself transposed */
  p = read(write(project(space([made(), use('u1', { cols: 4, rows: 6, transposed: true }), use('u2', { cols: 9, rows: 9 })]))));
  assert.deepEqual(p.resized.map(r => [r.cols, r.rows]), [[6, 4], [4, 6]]); assert.deepEqual(sizes(p), [[4, 6], [6, 4], [4, 6]]);
  p = read(write(project(space([made({ transposed: true }), use('u1', { cols: 4, rows: 6 }), use('u2', { cols: 4, rows: 6, transposed: true })]))));
  assert.deepEqual(sizes(p), [[4, 6], [6, 4], [4, 6]]); assert.equal(p.resized.length, 1);
  /* a turned use draws two of its variable's axes: here its first inner axis as its columns */
  const inner = [{ length: 5, name: null }];
  p = read(write(project(space([made({ inner }), use('u1', { cols: 5, rows: 6, inner, axes: [2, 1, 0] }), use('u2', { cols: 4, rows: 6, inner, axes: [2, 1, 0] })]))));
  assert.deepEqual(sizes(p), [[4, 6], [5, 6], [5, 6]]); assert.deepEqual(p.resized, [{ name: 'K', cols: 5, rows: 6, was: { cols: 4, rows: 6 } }]);
  /* left as they are: a measure, a part, a seated block, a function's input, a fused shape, an arrow; and every use where no one shape is the variable's own */
  const own = [use('m', { cols: 1, rows: 1, from: { id: 'bk', side: 'x' } }), use('r', { cols: 2, rows: 2, from: { id: 'bk', range: { col: 0, row: 0, cols: 2, rows: 2, toEnd: { cols: false, rows: false } } } }),
    use('i', { cols: 2, rows: 2, in: true }), use('j', { cols: 8, rows: 6, joined: [{ fx: 0, fy: 0, fw: 0.5, fh: 1, shape: shape('L', { cols: 4, rows: 6 }) }, { fx: 0.5, fy: 0, fw: 0.5, fh: 1, shape: shape('R', { cols: 4, rows: 6 }) }] })];
  p = read(write(project(space([made(), ...own]))));
  assert.deepEqual(p.resized, []); assert.deepEqual(sizes(p), [[4, 6], [1, 1], [2, 2], [2, 2], [8, 6]]);
  p = read(write(project(space([use('u1', { cols: 4, rows: 6 }), use('u2', { cols: 9, rows: 9 })]))));      /* no shape it was made as */
  assert.deepEqual(p.resized, []);
  p = read(write(project(space([made(), made({ id: 'bk2', cols: 9, rows: 9 }), use('u2', { cols: 7, rows: 7 })]))));      /* two of them */
  assert.deepEqual(p.resized, []);
  /* a definition is read once for a variable: the copy another use carries is not a second shape the variable in it was made as */
  const def = () => space([shape('D', { id: 'bd', variable: 5, cols: 2, rows: 2 }), shape('D', { id: 'bd2', variable: 5, reference: true, x: 9, cols: 3, rows: 3 })]);
  p = read(write(project(space([shape('O', { id: 'bo', variable: 4, inside: def() }), shape('O', { id: 'bo2', variable: 4, reference: true, x: 30, inside: def() })]))));
  assert.deepEqual(p.resized.map(r => [r.name, r.cols, r.rows]), [['D', 2, 2]]);
});
test('no project that comes with the repository holds a use of another size than its variable', () => {
  const root = fileURLToPath(new URL('../projects/', import.meta.url));
  const files = (dir, base = '') => readdirSync(dir).flatMap(n => { const at = join(dir, n); return statSync(at).isDirectory() ? files(at, base + n + '/') : [{ path: base + n, text: readFileSync(at, 'utf8') }]; });
  let references = 0; const count = s => { for (const d of s.shapes){ if (d.reference) references++; if (d.inside) count(d.inside); } };
  for (const name of readdirSync(root)){ if (!statSync(join(root, name)).isDirectory()) continue; const p = read(files(join(root, name))); assert.deepEqual(p.resized, [], name); count(p.top); }
  assert.ok(references > 10);      /* and they do hold references */
});

/* ---- number spaces (phase 9): what a shape promises to hold ---- */
test('holds is kept on a shape, read back, and written again the same; where nothing is promised there is no holds at all', () => {
  const p = project(space([shape('W', { id: 'b00000w', holds: 'integer?' }), shape('V', { id: 'b00000v' }),
    shape('f', { id: 'b00000f', type: 'arrow', cols: 1, rows: 1, arrow: { input: { id: 'b00000w', as: 'block' }, side: 'e', start: 1, span: 3, gap: 2, gapName: null, output: null, formula: null },
      inside: space([shape('in', { id: 'b00000i', in: true, holds: 'natural' })]) }), shape('Out', { id: 'b00000o', seat: 'b00000f', holds: 'whole' })])), files = write(p);
  assert.equal(json(files, 'W.json').holds, 'integer?'); assert.ok(!('holds' in json(files, 'V.json'))); assert.equal(json(files, 'f/in.json').holds, 'natural'); assert.equal(json(files, 'Out.json').holds, 'whole');
  const back = read(files); assert.deepEqual(back, p); assert.deepEqual(write(back), files);
  assert.equal(back.top.shapes[0].holds, 'integer?'); assert.ok(!('holds' in back.top.shapes[1]));
});
test('a holds that is no number space is not read: complex is reserved, and the old words are no spaces', () => {
  const files = write(project(space([shape('W', { id: 'b00000w', holds: 'natural' })])));
  for (const word of ['complex', 'complex?', 'decimal', 'fraction', 'root', 'number', 'irrational', 'Integer', 'integer ?', '', 7, null, true, ['real']]){
    const odd = files.map(f => f.path === 'W.json' ? { path: f.path, text: JSON.stringify({ ...JSON.parse(f.text), holds: word }) } : f);
    const got = read(odd); assert.ok(!('holds' in got.top.shapes[0]), JSON.stringify(word));
    assert.equal(got.unheld.length, 1, JSON.stringify(word)); assert.equal(got.unheld[0].name, 'W'); assert.ok(got.unheld[0].why.length > 10, JSON.stringify(word)); }      /* and it is said, not lost in silence */
  assert.equal(read(files.map(f => f.path === 'W.json' ? { path: f.path, text: JSON.stringify({ ...JSON.parse(f.text), holds: 'complex' }) } : f)).unheld[0].why, 'complex numbers are not built: a shape holds numbers on the line');
  for (const word of ['boolean', 'ternary', 'natural', 'whole', 'integer', 'rational', 'probability', 'real', 'any', 'any?', 'whole?']){
    const good = files.map(f => f.path === 'W.json' ? { path: f.path, text: JSON.stringify({ ...JSON.parse(f.text), holds: word }) } : f);
    assert.equal(read(good).top.shapes[0].holds, word); }
  assert.ok(!('holds' in write(project(space([shape('W', { id: 'b00000w', holds: 'complex' })]))).map(f => f.path === 'W.json' ? JSON.parse(f.text) : {})[0]));      /* nor written */
});
test('a promise written only on a reference, or on a shape fused into another, is dropped when a project is read, and said', () => {
  const two = write(project(space([shape('W', { id: 'b00000w', variable: 0, holds: 'natural' }), shape('W', { id: 'b00000x', variable: 0, reference: true, x: 10 })])));
  assert.deepEqual(read(two).unheld, []);      /* a reference carries no promise of its own: nothing to drop */
  const refFile = two.find(f => f.path.endsWith('.json') && JSON.parse(f.text).reference), on = word => two.map(f => f === refFile ? { path: f.path, text: JSON.stringify({ ...JSON.parse(f.text), holds: word }) } : f);
  let got = read(on('integer')); assert.deepEqual(got.unheld, [{ name: 'W', holds: 'integer', why: 'a promise is its variable\'s, said on the shape the variable was made as' }]);
  assert.deepEqual(got.top.shapes.map(d => d.holds), ['natural', undefined]); assert.deepEqual(read(write(got)).unheld, []);
  assert.deepEqual(read(on('natural')).unheld, []);      /* the variable's own promise, said again: nothing is lost */
  const fused = project(space([shape('J', { id: 'b00000j', joined: [{ fx: 0, fy: 0, fw: 1, fh: 0.5, shape: shape('L', { id: 'b00000l', holds: 'natural' }) }, { fx: 0, fy: 0.5, fw: 1, fh: 0.5, shape: shape('R', { id: 'b00000r' }) }] })]));
  got = read(write(fused)); assert.deepEqual(got.unheld, [{ name: 'L', holds: 'natural', why: 'it is fused into J, which promises for itself' }]);
  assert.ok(!('holds' in got.top.shapes[0].joined[0].shape)); assert.deepEqual(read(write(got)).unheld, []);
});

/* ---- conditions (phase 9B): an arrow's choose, and the two frames it names ---- */
test('an arrow\'s choose is kept where it names two frames, and an empty frame is written and read as a frame', () => {
  const shape = (id, name, more = {}) => ({ id, type: 'tensor', name, color: 'variable-1', x: 0, y: 0, cols: 1, rows: 1, colsName: null, rowsName: null, inner: null, entries: {}, inside: null, variable: null, standing: false, source: null, transposed: false, attributes: [], reference: false, from: null, arrow: null, seat: null, in: false, joined: null, ...more });
  const arrow = choose => shape('a1', 'Shape 2', { type: 'arrow', color: 'function', arrow: { input: { id: 'b1', as: 'block' }, side: 'e', start: 1, span: 1, gap: 2, gapName: null, output: { cols: 2, rows: 2 }, formula: null, ...(choose !== undefined ? { choose } : {}) },
    inside: { shapes: [shape('i1', 'in', { in: true, color: 'function' }), shape('t1', 'Then', { cols: 2, rows: 2 })], groups: [{ id: 'gt', name: 'true', members: [1], groups: [] }, { id: 'ge', name: 'false', members: [], groups: [] }], operations: [] } });
  const project = choose => ({ top: { shapes: [shape('b1', 'If', { entries: { '1,1': true } }), arrow(choose)], groups: [], operations: [] }, saved: null });
  const files = write(project({ then: 'gt', else: 'ge' })), back = read(files);
  assert.deepEqual(files.map(f => f.path).sort(), ['If.json', 'Shape 2.json', 'Shape 2/false.frame.json', 'Shape 2/in.json', 'Shape 2/true.frame.json', 'project.json']);
  assert.deepEqual(JSON.parse(files.find(f => f.path === 'Shape 2.json').text).arrow.choose, { then: 'gt', else: 'ge' });
  assert.deepEqual(JSON.parse(files.find(f => f.path === 'Shape 2/false.frame.json').text), { format: 'smart-factory/frame', version: FORMAT, id: 'ge', name: 'false', named: true, shapes: [], groups: [] });
  assert.deepEqual(back.top.shapes[1].arrow.choose, { then: 'gt', else: 'ge' });
  assert.deepEqual(back.top.shapes[1].inside.groups.map(g => [g.id, g.name, g.members]).sort(), [['ge', 'false', []], ['gt', 'true', [1]]]);
  assert.deepEqual(write(read(files)), files);      /* saved, reopened, saved: the same files */
  /* the format's number says it: the program before conditions (format 5) read such a project without complaint, dropped choose from every arrow and the empty side's file, and saved it so. At 6 it refuses it, as this one refuses a 7 */
  for (const f of files) assert.equal(JSON.parse(f.text).version, FORMAT, f.path);
  assert.throws(() => read(files.map(f => f.path === 'project.json' ? { ...f, text: f.text.replace('"version": ' + FORMAT, '"version": ' + (FORMAT + 1)) } : f)), new RegExp('saved by a newer version \\(format ' + (FORMAT + 1) + '\\)'));
  const five = files.map(f => ({ ...f, text: f.text.replace(new RegExp('"version": ' + FORMAT, 'g'), '"version": 5') })); assert.deepEqual(write(read(five)), files);      /* and a format 5 project is read exactly as it is */
  const g = build(back); assert.deepEqual(validate(g), []); assert.equal(g.functions['f:a1'].body, 'choose(param(f:a1),v:t1,source(none;2×2))');
  /* what is no two frame ids is no condition, and is not written */
  for (const choose of [undefined, null, 'gt', {}, { then: 'gt' }, { then: 'gt', else: 'gt' }, { then: '', else: 'ge' }, { then: 1, else: 2 }]){ const a = JSON.parse(write(project(choose)).find(f => f.path === 'Shape 2.json').text).arrow; assert.ok(!('choose' in a), JSON.stringify(choose)); }
  const old = files.map(f => f.path === 'Shape 2.json' ? { path: f.path, text: f.text.replace(/,\s*"choose": \{[^}]*\}/, '') } : f); assert.ok(!('choose' in read(old).top.shapes[1].arrow));
});
test('projects/conditions holds a condition, the same arrow used again on a false one, a whole matrix for a condition, a condition in a tile, and shapes that are false', () => {
  const files = shipped('conditions'), p = read(files), by = name => p.top.shapes.find(d => d.name === name), g = build(p); assert.deepEqual(validate(g), []);
  const out = id => { const a = g.spaces.top.arrows.find(a => a.arrow === id); assert.equal(a.error, null, id); return evaluate(g, a.node).entries; }, N = { none: true };
  assert.deepEqual(by('gate').arrow.choose, { then: 'gcdt001', else: 'gcde001' }); assert.deepEqual(by('gate').inside.groups.map(f => [f.name, f.members.length]).sort(), [['false', 0], ['true', 2]]);
  assert.deepEqual(out('bcda001'), { '1,1': 2, '2,1': 1, '1,2': 4, '2,2': 3 });      /* Go is true: Keys · Weights */
  assert.deepEqual(out('bcda002'), { '1,1': N, '2,1': N, '1,2': N, '2,2': N });      /* No is false, and the false side is empty: None, at that size */
  assert.deepEqual(evaluate(g, g.blocks[by('Out').id]).entries, out('bcda001')); assert.equal(by('Out').seat, 'bcda001');
  assert.deepEqual(out('bcda003'), { '1,1': 1, '2,1': 2 });      /* Mask holds 0, None and 5: one true entry */
  assert.deepEqual(out('bcda004'), { '1,1': 1, '2,1': 2, '1,2': -1, '2,2': -2, '1,3': -1, '2,3': -2 });      /* in a tile, once for each row of Each: true, false, None */
  assert.equal(g.nodes[g.spaces.top.arrows[3].node].op, 'mapalong');
  const truth = name => truthAt(g, g.blocks[by(name).id]);
  assert.deepEqual(['Go', 'No', 'Mask', 'Each', 'Zero', 'Nothing', 'Some', 'Open'].map(truth), [true, false, true, true, false, false, true, null]);      /* what is false is drawn sunk; Open has an entry never given */
  const paths = list => Object.fromEntries(list.filter(f => f.path !== 'project.json').map(f => [f.path, f.text.replace(/"version": \d+/g, '"version": 6')]));      /* (it was shipped at format 6, and is kept as it was shipped: saved now it differs in that number alone) */
  assert.deepEqual(paths(write(read(write(p)))), paths(write(p))); assert.deepEqual(paths(write(p)), paths(files));      /* saved again it is the files that are shipped */
});

/* ---- loops (phase 9C): a tile's step, its stop block, and a count that does not end ---- */
test('a tile\'s step, its stop block and a count of "inf" are kept in its repeat, and the format is 7 so that the program before loops refuses them', () => {
  const at = (name, x, y, cols, rows, more = {}) => ({ id: name.toLowerCase(), type: 'tensor', name, x, y, cols, rows, colsName: null, rowsName: null, entries: {}, inside: null, variable: null, ...more });
  const arrow = { ...at('Go', 3, 0, 1, 2), id: 'a1', type: 'arrow', arrow: { input: { id: 't1', as: 'tile' }, side: 'e', start: 1, span: 2, gap: 2, gapName: null, output: null, formula: null }, inside: { shapes: [at('in', -12, 0, 1, 2, { in: true })], groups: [], operations: [] } };
  const snap = { top: { shapes: [at('C', 0, 0, 1, 1, { entries: { '1,1': { expr: 'index.x' } } }), at('S', 0, 1, 1, 1, { entries: { '1,1': 0 } }), arrow],
    groups: [{ id: 't1', name: 'Count', members: [0, 1], groups: [], repeat: { x: 0, y: 0, cols: 1, rows: 2, across: 'inf', down: 1, step: 'a1', until: 's' } }], operations: [] } };
  const files = write(read(write(snap))), back = read(files);
  assert.equal(FORMAT, 9);
  assert.deepEqual(back.top.groups[0].repeat, { x: 0, y: 0, cols: 1, rows: 2, across: 'inf', down: 1, step: 'a1', until: 's' });
  assert.deepEqual(write(back), files);      /* saved, reopened, saved: the same files */
  assert.deepEqual(JSON.parse(files.find(f => f.path === 'Count.frame.json').text).repeat, { x: 0, y: 0, cols: 1, rows: 2, across: 'inf', down: 1, step: 'a1', until: 's' });
  /* a tile with none of them is written as it always was, and a format 6 project is read exactly as it is */
  const plain = JSON.parse(JSON.stringify(snap)); plain.top.groups[0].repeat = { x: 0, y: 0, cols: 1, rows: 2, across: 4, down: 1 };
  const now = write(read(write(plain))), six = now.map(f => ({ ...f, text: f.text.replace(new RegExp('"version": ' + FORMAT, 'g'), '"version": 6') }));
  assert.deepEqual(Object.keys(JSON.parse(six.find(f => f.path === 'Count.frame.json').text).repeat), ['x', 'y', 'cols', 'rows', 'across', 'down']);
  assert.deepEqual(write(read(six)), now);
  assert.throws(() => read(files.map(f => f.path === 'project.json' ? { ...f, text: f.text.replace('"version": ' + FORMAT, '"version": ' + (FORMAT + 1)) } : f)), new RegExp('saved by a newer version \\(format ' + (FORMAT + 1) + '\\)'));
});

test('projects/running-total: a tile with a step; its cells show 0, 3, 4, 8 and the step gives 9', () => {
  const files = shipped('running-total'), p = read(files), g = build(p); assert.deepEqual(validate(g), []);
  const tile = g.spaces.top.tiles.find(t => t.step), by = name => p.top.shapes.find(d => d.name === name);
  assert.ok(tile); assert.equal(tile.step, by('add').id); assert.equal(by('x').seat, by('take').id);
  assert.deepEqual(p.top.groups.find(f => f.repeat).repeat, { x: -20, y: -9, cols: 1, rows: 2, across: 4, down: 1, step: by('add').id });
  assert.deepEqual(evaluate(g, tile.loop).entries, { '1,1': 9 });
  assert.deepEqual(evaluate(g, tile.node).entries, { '1,1': 3, '2,1': 1, '3,1': 4, '4,1': 1, '1,2': 0, '2,2': 3, '3,2': 4, '4,2': 8 });      /* x holds the k-th column of X in cell k, and S the total so far */
  const paths = list => Object.fromEntries(list.filter(f => f.path !== 'project.json').map(f => [f.path, f.text]));
  /* saved again it is the files that are shipped, but for the format number: it was saved at format 7, and is not saved again for a later one */
  const at7 = list => Object.fromEntries(Object.entries(paths(list)).map(([path, text]) => [path, text.replace(/"version": \d+/g, '"version": 7')]));
  assert.deepEqual(paths(write(read(write(p)))), paths(write(p))); assert.deepEqual(at7(write(p)), paths(files));
  for (const f of files) if (f.path.endsWith('.json')) assert.equal(JSON.parse(f.text).version ?? 7, 7, f.path);
});

test('read: a tile whose step or stop block names what is none of its own has it dropped, and read says which tile', () => {
  const files = shipped('running-total'), p = read(files); assert.deepEqual(p.unstepped, []);
  const frame = files.find(f => f.path.endsWith('.frame.json')), c = JSON.parse(frame.text), step = c.repeat.step;
  const withFrame = change => { const d = JSON.parse(frame.text); change(d); return files.map(f => f === frame ? { path: f.path, text: JSON.stringify(d) } : f); };
  const turned = files.map(f => { if (!f.path.endsWith('.json') || f === frame) return f; const d = JSON.parse(f.text); if (d.id !== step) return f; d.arrow.side = 's'; return { path: f.path, text: JSON.stringify(d) }; });
  const name = c.named ? c.name : null;
  for (const [label, changed, key] of [
    ['a step that is no shape', withFrame(d => { d.repeat.step = 'nowhere'; }), 'step'],
    ['a step turned to the south side', turned, 'step'],
    ['a step that is a block', withFrame(d => { d.repeat.step = d.shapes[0].id; }), 'step'],
    ['a stop block that is no shape', withFrame(d => { d.repeat.until = 'nowhere'; }), 'until'],
    ['a stop block outside the tile', withFrame(d => { d.repeat.until = p.top.shapes.find(x => x.name === 'X').id; }), 'until'],
    ['a stop block that is an arrow', withFrame(d => { d.repeat.until = step; }), 'until']]){
    const q = read(changed), rep = q.top.groups.find(g => g.repeat).repeat;
    assert.deepEqual(q.unstepped, [{ tile: name, key }], label); assert.equal(rep[key], undefined, label);
    const again = read(write(q)); assert.deepEqual(again.unstepped, [], label);      /* and saved, it opens with nothing to say */
    assert.deepEqual(write(again).filter(f => f.path !== 'project.json'), write(q).filter(f => f.path !== 'project.json'), label); }
  /* a stop block of the pattern is kept */
  const kept = read(withFrame(d => { d.repeat.until = d.shapes[0].id; })); assert.deepEqual(kept.unstepped, []); assert.equal(kept.top.groups.find(g => g.repeat).repeat.until, c.shapes[0].id);
});
