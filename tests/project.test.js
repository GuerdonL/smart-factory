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
  entries: {}, inside: null, variable: null, standing: false, source: null, transposed: false, attributes: [], reference: false, from: null, arrow: null, seat: null, in: false, joined: null, ...more });
const space = (shapes = [], groups = [], operations = []) => ({ shapes, groups, operations });
const project = (top, more = {}) => ({ top, saved: '2026-11-16T00:00:00.000Z', ids: null, data: {}, converted: 0, changed: 0, ...more });      /* converted, changed: read says how many old stacks it fused, and how many other pieces read differently */
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
  for (const a of arrows){ assert.ok(ids.has(a.arrow.input.id), a.name + ' reads something on the canvas'); assert.ok(a.inside.shapes.some(d => d.in && d.name === 'in'), a.name + ' has its input block'); }
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

test('every project that comes with the repository says "standing" for a standing shape, and none says "tile"', () => {
  let standing = 0;
  for (const name of readdirSync(here).filter(n => statSync(join(here, n)).isDirectory())) for (const f of tree(join(here, name))){
    assert.equal(/"tile"\s*:/.test(f.text), false, name + '/' + f.path + ' still says tile'); if (/"standing": true/.test(f.text)) standing++; }
  assert.ok(standing >= 12);
  /* the default Menu's six colour rows, light and dark, stand in .variable_colors' matrix */
  const menu = read(tree(join(here, 'default-menu'))), every = [], walk = sp => { for (const d of sp.shapes){ every.push(d); if (d.inside) walk(d.inside); } }; walk(menu.top);
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
