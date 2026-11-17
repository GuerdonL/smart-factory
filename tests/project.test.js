/* project.js: a project written as a tree of files, and read back. Run with: node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { write, read, isNamed, FORMAT } from '../project.js';
import { pieces } from '../algebra.js';

/* a shape as read() gives one: every field present */
const shape = (name, more = {}) => ({ id: null, type: 'tensor', name, color: isNamed(name) ? 'variable-1' : null, x: 0, y: 0, cols: 2, rows: 3, colsName: null, rowsName: null,
  entries: {}, inside: null, variable: null, tile: false, transposed: false, attributes: [], reference: false, from: null, joined: null, ...more });
const space = (shapes = [], groups = [], operations = []) => ({ shapes, groups, operations });
const project = (top, more = {}) => ({ top, saved: '2026-11-16T00:00:00.000Z', ids: null, converted: 0, changed: 0, ...more });      /* converted, changed: read says how many old stacks it fused, and how many other pieces read differently */
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
  assert.throws(() => read([head(FORMAT + 1)]), /newer version \(format 4\)/);
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

test('the format is 3', () => { assert.equal(FORMAT, 3); });

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

test('a converted project, saved, is format 3 and is not converted again', () => {
  const old = read([head(2), file('Top.json', at('Top', 0, 0, 3, 2, { order: 0 })), file('Under.json', at('Under', 0, 2, 3, 2, { order: 1 })), file('Last.json', at('Last', 0, 4, 3, 1, { order: 2 }))]);
  assert.equal(old.converted, 1); assert.equal(old.top.shapes.length, 1); assert.equal(old.top.shapes[0].joined.length, 3);
  const files = write(old);
  assert.equal(json(files, 'project.json').version, 3);
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

/* the projects that come with the repository */
const here = fileURLToPath(new URL('../projects/', import.meta.url));
const tree = (dir, at = '') => readdirSync(join(dir, at)).flatMap(n => statSync(join(dir, at, n)).isDirectory() ? tree(dir, at + n + '/') : [{ path: at + n, text: readFileSync(join(dir, at, n), 'utf8') }]);
const count = s => s.shapes.reduce((n, sh) => n + 1 + (sh.inside ? count(sh.inside) : 0), 0);
for (const name of ['default-menu', 'example', 'touch-algebra', 'boolean-tool']) test(`projects/${name} reads, holds no old stack, and survives being written and read again`, () => {
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
], [], [{ id: 'o000001', op: 'difference', results: ['bleft00', 'bright0'], sources: [
  shape('Keys', { id: 'bwide00', cols: 6, rows: 4, variable: 1, reference: true, entries: { '3,1': 7 }, inside: space([shape('Inner', { id: 'binner0' })]) }),
  shape('Shape 2', { id: 'bband00', x: 2, cols: 2, rows: 4 })] }]);

test('operations and ranges come back as they went, in every space', () => {
  const inner = space([shape('Shape 1', { id: 'bpart00', cols: 2, rows: 2, from: { id: 'bunder0', range: range(1, 1, 2, 2) } })], [],
    [{ id: 'o000002', op: 'intersect', results: ['bpart00'], sources: [shape('Under', { id: 'bunder0', cols: 5, rows: 5 }),
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
      { id: 'o1', op: 'difference', sources: [src('A'), src('B')], results: ['bP', 7, null] },
      { id: 'o2', op: 'union', sources: [src('C'), src('D')], results: ['bQ'] },            /* no such operation */
      { id: 'o3', op: 'intersect', sources: [src('E')], results: ['bQ'] },                  /* not two sources */
      { id: 'o4', op: 'intersect', sources: [src('F'), src('G')], results: [] },            /* it made nothing */
      { op: 'intersect', sources: [src('H'), null], results: ['bR'] }, null, 'x'] })]);
  assert.deepEqual(p.top.shapes.map(s => s.from), [{ id: 'bA', range: { col: 0, row: 1, cols: 1, rows: 1, toEnd: { cols: true, rows: false } } }, { id: 'bA', side: 'x' }]);
  assert.deepEqual(p.top.operations.map(o => [o.id, o.op, o.sources.map(s => s.name), o.results]), [['o1', 'difference', ['A', 'B'], ['bP']], [null, 'intersect', ['H', 'Shape'], ['bR']]]);
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
