/* graph.js: a snapshot into a graph, and a graph checked. The numbered cases are those of the graph design, in its
   order (case 10, a stack, is a sum now); after them one build case for every operation, one for every error
   code, and what validate refuses. */
import './solver.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, validate, OPS, CODES, indexAt, VERSION } from '../graph.js';
import { read } from '../project.js';

const B = (id, x, y, cols, rows, more = {}) => ({ id, type: 'tensor', name: id, x, y, cols, rows, colsName: null, rowsName: null, entries: {}, inside: null, variable: null, ...more });
const space = (shapes, groups = [], operations = []) => ({ shapes, groups, operations });
const snap = (shapes, groups = [], operations = []) => ({ top: space(shapes, groups, operations) });
const arrow = (id, input, more = {}, shapeMore = {}) => B(id, 0, 0, 1, 1, { type: 'arrow', name: 'Shape 9', arrow: { input, side: 'e', start: 1, span: 1, gap: 2, gapName: null, output: null, formula: null, ...more }, ...shapeMore });
const tree = (dir, at = '') => readdirSync(join(dir, at)).flatMap(n => statSync(join(dir, at, n)).isDirectory() ? tree(dir, at + n + '/') : [{ path: at + n, text: readFileSync(join(dir, at, n), 'utf8') }]);
const projects = join(dirname(fileURLToPath(import.meta.url)), '..', 'projects');
const type = (cols, rows, colsName = null, rowsName = null) => ({ cols, rows, colsName, rowsName });

const built = [];                              /* every snapshot built below, for cases 20 to 22 */
const make = s => { built.push(s); const g = build(s); assert.deepEqual(validate(g), []); return g; };
const piece = (g, key = 'top', i = 0) => g.spaces[key].pieces[i];

test('1: two shapes side by side are one piece, a matmul of the left one\'s rows and the right one\'s columns', () => {
  const g = make(snap([B('A', 0, 0, 3, 2), B('B', 3, 0, 4, 3)]));
  assert.equal(g.version, VERSION);
  assert.equal(g.spaces.top.pieces.length, 1);
  assert.deepEqual(piece(g), { blocks: ['A', 'B'], rule: 'product', node: 'matmul(v:A,v:B)', error: null });
  assert.deepEqual(g.nodes['matmul(v:A,v:B)'], { op: 'matmul', inputs: ['v:A', 'v:B'], type: type(4, 2) });
  assert.deepEqual(g.nodes['v:A'], { op: 'variable', inputs: [], type: type(3, 2), name: 'A', named: true, defined: 'entries', entries: {} });
  assert.deepEqual(g.blocks, { A: 'v:A', B: 'v:B' });
  assert.deepEqual(g.spaces.top.owner, null); assert.deepEqual(g.spaces.top.arrows, []); assert.deepEqual(g.spaces.top.tiles, []);
});
test('2: named sides that agree are carried to the result; names that differ are a mismatch', () => {
  const A = B('A', 0, 0, 5, 6, { colsName: 'embed', rowsName: 'context' }), ok = make(snap([A, B('W', 5, 0, 4, 5, { colsName: 'key', rowsName: 'embed' })]));
  assert.deepEqual(ok.nodes[piece(ok).node].type, type(4, 6, 'key', 'context'));
  const no = make(snap([A, B('W', 5, 0, 4, 5, { colsName: 'key', rowsName: 'key' })]));
  assert.deepEqual(piece(no), { blocks: ['A', 'W'], rule: 'product', node: null, error: { code: 'mismatch', note: 'embed ≠ key' } });
});
test('3: columns that are not the next one\'s rows are a mismatch, and no node', () => {
  const g = make(snap([B('A', 0, 0, 3, 2), B('B', 3, 0, 2, 4)]));
  assert.deepEqual(piece(g).error, { code: 'mismatch', note: '3 ≠ 4' }); assert.equal(piece(g).node, null);
  assert.deepEqual(Object.keys(g.nodes).sort(), ['v:A', 'v:B']);      /* something that comes to no matrix is no node */
});
test('4: one block touching two on the same side is not a row', () => {
  const g = make(snap([B('A', 0, 0, 2, 4), B('B', 2, 0, 3, 2), B('C', 2, 2, 4, 2)]));
  assert.deepEqual(piece(g).error, { code: 'not-a-row', note: '' }); assert.equal(piece(g).node, null);
});
test('5: a scalar in a row is pulled to the front', () => {
  const g = make(snap([B('A', 0, 0, 3, 2), B('s', 3, 0, 1, 1), B('B', 4, 0, 4, 3)]));
  assert.equal(piece(g).node, 'scale(v:s,matmul(v:A,v:B))');
  assert.deepEqual(g.nodes[piece(g).node].type, type(4, 2));
  const two = make(snap([B('A', 0, 0, 3, 2), B('s', 3, 0, 1, 1), B('B', 4, 0, 4, 3), B('t', 8, 0, 1, 1)]));
  assert.equal(piece(two).node, 'scale(v:s,scale(v:t,matmul(v:A,v:B)))');      /* the leftmost scalar outermost */
  const wrong = make(snap([B('A', 0, 0, 3, 2), B('s', 3, 0, 1, 1), B('B', 4, 0, 4, 5)]));      /* every touch agrees, and A · B does not */
  assert.deepEqual(piece(wrong).error, { code: 'mismatch', note: '3 ≠ 5' });
});
test('6: two scalars alone in a row: the left one scales the right one', () => {
  assert.equal(piece(make(snap([B('s', 0, 0, 1, 1), B('t', 1, 0, 1, 1)]))).node, 'scale(v:s,v:t)');
});
test('7: a row of three is two products, grouped from the left', () => {
  const g = make(snap([B('A', 0, 0, 3, 2), B('B', 3, 0, 4, 3), B('C', 7, 0, 5, 4)]));
  assert.equal(piece(g).node, 'matmul(matmul(v:A,v:B),v:C)'); assert.deepEqual(g.nodes[piece(g).node].type, type(5, 2));
});
test('8: two uses of one variable in different spaces are one node', () => {
  const g = make(snap([B('X', 0, 0, 2, 2, { variable: 1 }), B('Y', 9, 0, 2, 2, { inside: space([B('X2', 0, 0, 2, 2, { name: 'X', variable: 1, reference: true })]) })]));
  assert.equal(g.blocks.X, 'v:X'); assert.equal(g.blocks.X2, 'v:X');
  /* and a use met before the block the variable was made as still takes that block's id */
  const late = make(snap([B('use', 0, 0, 2, 2, { name: 'X', variable: 1, reference: true }), B('X', 9, 0, 2, 2, { variable: 1 })]));
  assert.equal(late.blocks.use, 'v:X');
});
test('8b: one product in two spaces is one node', () => {
  const pair = n => [B('a' + n, 0, 0, 3, 2, { name: 'A', variable: 1, reference: n > 0 }), B('b' + n, 3, 0, 4, 3, { name: 'B', variable: 2, reference: n > 0 })];
  const g = make(snap([...pair(0), B('Y', 20, 0, 4, 2, { inside: space(pair(1)) })]));
  assert.equal(piece(g).node, 'matmul(v:a0,v:b0)'); assert.equal(piece(g, 'v:Y').node, 'matmul(v:a0,v:b0)');
  assert.equal(Object.values(g.nodes).filter(n => n.op === 'matmul').length, 1);
});
test('9: a transposed use maps to the transpose; the variable keeps its own way round', () => {
  const g = make(snap([B('X', 0, 0, 2, 3, { variable: 1, colsName: 'a', entries: { '2,3': 7 } }), B('Xt', 9, 0, 3, 2, { name: 'X', variable: 1, reference: true, transposed: true, rowsName: 'a' })]));
  assert.equal(g.blocks.Xt, 'transpose(v:X)');
  assert.deepEqual(g.nodes['v:X'].type, type(2, 3, 'a', null)); assert.deepEqual(g.nodes['transpose(v:X)'].type, type(3, 2, null, 'a'));
  assert.deepEqual(g.nodes['v:X'].entries, { '2,3': 7 });      /* entries stay the variable's way round */
  const only = make(snap([B('X', 0, 0, 3, 2, { transposed: true, colsName: 'k' })]));      /* the one use is the transpose: the variable is the other way */
  assert.deepEqual(only.nodes['v:X'].type, type(2, 3, null, 'k')); assert.equal(only.blocks.X, 'transpose(v:X)');
});
test('10: two blocks of one width, one directly under the other, are a sum: an add', () => {
  const g = make(snap([B('A', 0, 0, 3, 2), B('C', 0, 2, 3, 2)]));
  assert.deepEqual(piece(g), { blocks: ['A', 'C'], rule: 'sum', node: 'add(v:A,v:C)', error: null });
  assert.deepEqual(g.nodes['add(v:A,v:C)'], { op: 'add', inputs: ['v:A', 'v:C'], type: type(3, 2) });
  const three = make(snap([B('A', 0, 0, 3, 2), B('C', 0, 2, 3, 2), B('D', 0, 4, 3, 2)]));
  assert.equal(piece(three).node, 'add(v:A,v:C,v:D)');
  assert.deepEqual(piece(make(snap([B('A', 0, 0, 3, 2), B('C', 0, 2, 3, 3)]))).error, { code: 'mismatch', note: '2 ≠ 3' });
});
const joined = () => B('J', 0, 0, 5, 2, { name: 'Shape 3', joined: [{ fx: 0, fy: 0, fw: .6, fh: 1, shape: B('L', 0, 0, 3, 2) }, { fx: .6, fy: 0, fw: .4, fh: 1, shape: B('R', 3, 0, 2, 2) }] });
test('11: a joined shape is a block of its members', () => {
  const g = make(snap([joined()]));
  assert.deepEqual(g.nodes['v:J'], { op: 'variable', inputs: ['block(v:L@0,0;v:R@3,0)'], type: type(5, 2), name: 'Shape 3', named: false, defined: 'joined', entries: {} });
  assert.deepEqual(g.nodes['block(v:L@0,0;v:R@3,0)'], { op: 'block', inputs: ['v:L', 'v:R'], type: type(5, 2), at: [{ col: 0, row: 0 }, { col: 3, row: 0 }] });
  assert.deepEqual(g.blocks, { J: 'v:J', L: 'v:L', R: 'v:R' });
  const turned = make(snap([{ ...joined(), transposed: true }]));      /* a joined shape is turned bodily: it never gets a transpose */
  assert.equal(turned.blocks.J, 'v:J');
});
const standing = (...shapes) => B('O', 0, 0, 2, 2, { entries: { '1,1': 5 }, inside: space(shapes) });
test('12: standing shapes that cover every entry define the variable, and its space has no pieces', () => {
  const g = make(snap([standing(B('t1', -3, -1, 2, 1, { standing: true }), B('t2', -3, 0, 2, 1, { standing: true }))]));
  assert.equal(g.nodes['v:O'].defined, 'standing'); assert.deepEqual(g.nodes['v:O'].inputs, ['block(v:t1@0,0;v:t2@0,1)']);
  assert.deepEqual(g.spaces['v:O'], { owner: 'v:O', pieces: [], arrows: [], tiles: [] });
  assert.equal(g.blocks.t1, 'v:t1');
});
test('13: with one entry left uncovered the variable keeps its own entries: the two are never mixed', () => {
  const g = make(snap([standing(B('t1', -3, -1, 2, 1, { standing: true }), B('t2', -3, 0, 1, 1, { standing: true }))]));
  assert.equal(g.nodes['v:O'].defined, 'entries'); assert.deepEqual(g.nodes['v:O'].inputs, []); assert.deepEqual(g.nodes['v:O'].entries, { '1,1': 5 });
  assert.deepEqual(g.spaces['v:O'].pieces, []);
  /* a shape that is not standing, or lies outside the matrix, and the space is pieces again */
  const loose = build(snap([standing(B('t1', -3, -1, 2, 1, { standing: true }), B('t2', -3, 0, 2, 1))]));
  assert.equal(loose.spaces['v:O'].pieces.length, 1); assert.equal(loose.spaces['v:O'].pieces[0].rule, 'sum');
});
const defined = (cols, rows, ...shapes) => B('K', 20, 0, cols, rows, { entries: { '1,1': 9 }, inside: space(shapes) });
test('14: a definition that holds one matching product is the variable\'s value', () => {
  const g = make(snap([defined(4, 2, B('A', 0, 0, 3, 2), B('W', 3, 0, 4, 3))]));
  assert.deepEqual(g.nodes['v:K'], { op: 'variable', inputs: ['matmul(v:A,v:W)'], type: type(4, 2), name: 'K', named: true, defined: 'definition', entries: { '1,1': 9 } });
  assert.deepEqual(g.spaces['v:K'], { owner: 'v:K', pieces: [{ blocks: ['A', 'W'], rule: 'product', node: 'matmul(v:A,v:W)', error: null }], arrows: [], tiles: [] });
});
test('15: a definition of the wrong size is an error on the variable, which keeps its entries', () => {
  const g = make(snap([defined(4, 6, B('A', 0, 0, 3, 2), B('W', 3, 0, 5, 3))]));
  assert.equal(g.nodes['v:K'].defined, 'entries'); assert.deepEqual(g.nodes['v:K'].inputs, []);
  assert.deepEqual(g.nodes['v:K'].error, { code: 'size', note: '5 × 2 ≠ 4 × 6' });
  assert.deepEqual(g.nodes['v:K'].type, type(4, 6)); assert.deepEqual(g.nodes['v:K'].entries, { '1,1': 9 });
  assert.equal(piece(g, 'v:K').node, 'matmul(v:A,v:W)');      /* the piece is still what it is */
  const names = make(snap([B('K', 20, 0, 4, 2, { colsName: 'key', inside: space([B('A', 0, 0, 3, 2), B('W', 3, 0, 4, 3, { colsName: 'query' })]) })]));
  assert.deepEqual(names.nodes['v:K'].error, { code: 'size', note: 'query ≠ key' });
  const bad = make(snap([defined(4, 2, B('A', 0, 0, 3, 2), B('W', 3, 0, 4, 9))]));      /* its one piece has an error: the variable has it */
  assert.deepEqual(bad.nodes['v:K'].error, { code: 'mismatch', note: '3 ≠ 9' });
});
test('16: a definition holding two separate pieces', () => {
  const g = make(snap([defined(4, 2, B('A', 0, 0, 4, 2), B('W', 9, 0, 4, 2))]));
  assert.deepEqual(g.nodes['v:K'].error, { code: 'pieces', note: '2 pieces' }); assert.equal(g.spaces['v:K'].pieces.length, 2);
  assert.equal(make(snap([defined(4, 2)])).nodes['v:K'].defined, 'entries');      /* an empty definition defines nothing */
});
test('17: a commented-out block and a block in a .config frame take no part', () => {
  const g = make(snap([B('A', 0, 0, 3, 2), B('off', 3, 0, 4, 3, { name: '// B' }), B('set', 9, 0, 3, 1, { name: '.bg' }), B('deep', 9, 4, 3, 1)],
    [{ id: 'g1', name: '.config', members: [2], groups: [{ id: 'g2', name: '.ui', members: [3], groups: [] }] }]));
  assert.deepEqual(g.blocks, { A: 'v:A' }); assert.deepEqual(g.spaces.top.pieces.map(p => p.blocks), [['A']]);
});
test('18: a block that is a measure of another\'s side', () => {
  const g = make(snap([B('A', 0, 0, 4, 6), B('m', 9, 0, 1, 1, { from: { id: 'A', side: 'x' } })]));
  assert.deepEqual(g.nodes['v:m'].inputs, ['measure(v:A;x)']); assert.equal(g.nodes['v:m'].defined, 'measure');
  assert.deepEqual(g.nodes['measure(v:A;x)'], { op: 'measure', inputs: ['v:A'], type: type(1, 1), side: 'x' });
});
test('19: a variable used inside its own definition is a loop, and build returns', () => {
  const g = make(snap([B('K', 0, 0, 2, 2, { variable: 1, inside: space([B('k2', 0, 0, 2, 2, { name: 'K', variable: 1, reference: true }), B('W', 2, 0, 2, 2)]) }), B('Other', 9, 0, 2, 2), B('P', 11, 0, 2, 2)]));
  assert.deepEqual(g.nodes['v:K'].error, { code: 'loop', note: '' }); assert.equal(g.nodes['v:K'].defined, 'entries'); assert.deepEqual(g.nodes['v:K'].inputs, []);
  assert.equal(g.spaces.top.pieces[1].node, 'matmul(v:Other,v:P)');      /* everything else is as it would be */
  /* round two variables: each is in the loop */
  const two = make(snap([B('K', 0, 0, 2, 2, { variable: 1, inside: space([B('l2', 0, 0, 2, 2, { name: 'L', variable: 2, reference: true })]) }),
    B('L', 9, 0, 2, 2, { variable: 2, inside: space([B('k2', 0, 0, 2, 2, { name: 'K', variable: 1, reference: true })]) }), B('M', 20, 0, 2, 2, { inside: space([B('k3', 0, 0, 2, 2, { name: 'K', variable: 1, reference: true })]) })]));
  assert.equal(two.nodes['v:K'].error.code, 'loop'); assert.equal(two.nodes['v:L'].error.code, 'loop');
  assert.equal(two.nodes['v:M'].error, undefined); assert.equal(two.nodes['v:M'].defined, 'definition');      /* it depends on the loop and is not in it */
});

/* ---- one build case for every other operation ---- */
test('ewise: a times and an over pair, a broadcast row, and a chain nested from the left', () => {
  const times = make(snap([B('A', 0, 2, 3, 2), B('C', 3, 0, 3, 2)]));
  assert.deepEqual(piece(times), { blocks: ['A', 'C'], rule: 'elementwise', node: 'ewise(v:A,v:C;mul;none)', error: null });
  assert.deepEqual(times.nodes[piece(times).node], { op: 'ewise', inputs: ['v:A', 'v:C'], type: type(3, 2), fn: 'mul', broadcast: 'none' });
  const over = make(snap([B('A', 0, 0, 3, 2), B('r', 3, 2, 3, 1)]));
  assert.equal(piece(over).node, 'ewise(v:A,v:r;div;row)');
  assert.equal(piece(make(snap([B('A', 0, 0, 3, 2), B('c', 3, 2, 1, 2)]))).node, 'ewise(v:A,v:c;div;col)');
  assert.equal(piece(make(snap([B('s', 0, 0, 1, 1), B('A', 1, 1, 4, 4)]))).node, 'ewise(v:s,v:A;div;scalar)');
  const chain = make(snap([B('A', 0, 2, 2, 2), B('C', 2, 0, 2, 2), B('D', 4, 2, 2, 2)]));
  assert.equal(piece(chain).node, 'ewise(ewise(v:A,v:C;mul;none),v:D;div;none)');
  assert.deepEqual(piece(make(snap([B('A', 0, 2, 3, 2), B('C', 3, 0, 2, 2)]))).error, { code: 'mismatch', note: '3 ≠ 2' });
});
const cutOf = (range, more = {}) => snap([B('part', 0, 0, range.cols, range.rows, { name: 'Shape 4', from: { id: 'Keys', range }, ...more })], [],
  [{ id: 'o1', op: 'intersect', sources: [B('Keys', 0, 0, 6, 4, { colsName: 'embed' }), B('Band', 2, 0, 2, 4)], results: ['part'], was: null }]);
test('slice: a part made by a cut or an intersection is a range of its source', () => {
  const g = make(cutOf({ col: 2, row: 0, cols: 2, rows: 4, toEnd: { cols: false, rows: true } }));
  assert.deepEqual(g.nodes['v:part'].inputs, ['slice(v:Keys;2,0,2,4)']); assert.equal(g.nodes['v:part'].defined, 'range');
  assert.deepEqual(g.nodes['slice(v:Keys;2,0,2,4)'], { op: 'slice', inputs: ['v:Keys'], type: type(2, 4), range: { col: 2, row: 0, cols: 2, rows: 4 } });
  assert.equal(g.blocks.Keys, 'v:Keys');      /* what the cut keeps takes part: the part reads it */
  assert.equal(g.blocks.Band, undefined);
  const whole = make(cutOf({ col: 0, row: 1, cols: 6, rows: 2, toEnd: { cols: true, rows: false } }));      /* a side wholly covered keeps its name */
  assert.deepEqual(whole.nodes['slice(v:Keys;0,1,6,2)'].type, type(6, 2, 'embed', null));
});
test('source: zeros, ones and an identity are a variable over a source of its size', () => {
  const g = make(snap([B('M', 0, 0, 2, 2), B('I', 2, 0, 2, 2, { source: 'identity', colsName: 'k' }), B('Z', 9, 0, 3, 1, { source: 'zeros' }), B('odd', 9, 9, 2, 2, { source: 'noise' })]));
  assert.deepEqual(g.nodes['v:I'], { op: 'variable', inputs: ['source(identity;2×2)'], type: type(2, 2, 'k', null), name: 'I', named: true, defined: 'source', entries: {} });
  assert.deepEqual(g.nodes['source(identity;2×2)'], { op: 'source', inputs: [], type: type(2, 2), kind: 'identity' });
  assert.equal(g.nodes['source(zeros;3×1)'].kind, 'zeros'); assert.equal(g.nodes['v:odd'].defined, 'entries');      /* a source this program has not got is an ordinary block */
  assert.equal(piece(g).node, 'matmul(v:M,v:I)');
});
test('a formula\'s dependencies are in inputs, and its text names them $1, $2', () => {
  const g = make(snap([B('Keys', 0, 0, 4, 3), B('Tau', 9, 0, 1, 1, { entries: { '1,1': 9 } }),
    B('W', 20, 0, 2, 2, { entries: { '1,1': { expr: '1/√(@[Keys:x])' }, '2,1': { expr: '@[Tau:m] + @[Keys:x] * @[Keys:y]' }, '1,2': 7, '2,2': { expr: 'x + 2y' }, '9,9': 1 } })]));
  assert.deepEqual(g.nodes['v:W'].inputs, ['measure(v:Keys;x)', 'measure(v:Tau;m)', 'measure(v:Keys;y)']);
  assert.deepEqual(g.nodes['v:W'].entries, { '1,1': { expr: '1/√($1)' }, '2,1': { expr: '$2 + $1 * $3' }, '1,2': 7, '2,2': { expr: '(2) + 2(2)' } });      /* its own size, in its own formula, is a number; an entry outside it is dropped */
  assert.deepEqual(g.nodes['measure(v:Tau;m)'], { op: 'measure', inputs: ['v:Tau'], type: type(1, 1), side: 'm' });
  assert.ok(!JSON.stringify(g).includes('@[Keys'));      /* nothing a node depends on is hidden in a string */
});
test('an attribute capsule is a measure node with side a, its formula and what that names', () => {
  const g = make(snap([B('Keys', 0, 0, 4, 3, { attributes: [{ name: 'heads', value: '2^(3) + @[Tau:m]' }, { name: 'twice', value: 'heads * 2 + x' }] }), B('Tau', 9, 0, 1, 1, { entries: { '1,1': 1 } }),
    B('W', 20, 0, 1, 2, { entries: { '1,1': { expr: '@[Keys:a:heads] / 3' }, '1,2': { expr: '@[Keys:a:twice]' } } })]));
  assert.deepEqual(g.nodes['v:W'].inputs, ['measure(v:Keys;a:heads)', 'measure(v:Keys;a:twice)']);
  assert.deepEqual(g.nodes['measure(v:Keys;a:heads)'], { op: 'measure', inputs: ['v:Keys', 'measure(v:Tau;m)'], type: type(1, 1), side: 'a', name: 'heads', formula: '2^(3) + $1' });
  /* within an attribute, its variable's other attributes and its own width are written in: they are no nodes between a variable and itself */
  assert.deepEqual(g.nodes['measure(v:Keys;a:twice)'], { op: 'measure', inputs: ['v:Keys', 'measure(v:Tau;m)'], type: type(1, 1), side: 'a', name: 'twice', formula: '(2^(3) + $1) * 2 + (4)' });
  /* a variable's own attribute, in its own entries, is written in where it is used: it is no loop */
  const own = make(snap([B('Keys', 0, 0, 2, 1, { attributes: [{ name: 'heads', value: '8' }], entries: { '1,1': { expr: 'heads + x' } } })]));
  assert.equal(own.nodes['v:Keys'].error, undefined); assert.deepEqual(own.nodes['v:Keys'].entries, { '1,1': { expr: '(8) + (2)' } });
});
test('a formula that names what is not there is not kept as text: the entry holds the error it comes to', () => {
  const g = make(snap([B('Keys', 0, 0, 4, 3, { attributes: [{ name: 'a', value: 'b + 1' }, { name: 'b', value: 'a + 1' }, { name: 'blank', value: '' }] }),
    B('W', 20, 0, 3, 3, { entries: { '1,1': { expr: '@[gone:x] + 1' }, '2,1': { expr: '@[Keys:m]' }, '3,1': { expr: '@[Keys:a:none]' }, '1,2': { expr: '@[Keys]' }, '2,2': { expr: '@[Keys:a:a]' }, '3,2': { expr: '$1 + 1' },
      '1,3': { expr: 'nothing + 1' }, '2,3': { expr: '((( 2' }, '3,3': { expr: '@[Keys:a:blank] + 1' } } })]));
  assert.deepEqual(g.nodes['v:W'].entries, { '1,1': { err: 'missing variable' }, '2,1': { err: 'not a scalar: it has no mass' }, '3,1': { err: 'missing attribute' },
    '1,2': { err: 'choose one of its measures' }, '2,2': { err: 'depends on itself' }, '3,2': { err: 'cannot read "$"' }, '1,3': { err: 'unknown name: nothing' }, '2,3': { err: 'a bracket is not closed' }, '3,3': { expr: '$1 + 1' } });
  assert.deepEqual(g.nodes['v:W'].inputs, ['measure(v:Keys;a:blank)']); assert.equal(g.nodes['measure(v:Keys;a:blank)'].formula, '');      /* an attribute with nothing typed has no value yet: that is no error */
  assert.ok(!JSON.stringify(g).includes('@['));      /* no capsule is left anywhere in the graph */
  for (const name of ['__proto__', 'constructor', 'toString']) assert.deepEqual(make(snap([B('A', 0, 0, 2, 1, { entries: { '1,1': { expr: name } } }), B('C', 2, 0, 1, 2)])).nodes['v:A'].entries, { '1,1': { err: 'unknown name: ' + name } });
});
const fnSpace = (cols, rows, ...more) => space([B('in', -9, 0, cols, rows, { in: true }), ...more]);
test('map: an entry formula is a map over the covered part, with what it names', () => {
  const g = make(snap([B('V', 0, 0, 2, 2), B('Bm', 9, 9, 2, 1), B('Tau', 20, 0, 1, 1),
    arrow('f', { id: 'V', as: 'block' }, { formula: 'max(x, @[Bm]) * @[Tau:m] + i', span: 1, start: 2 }, { inside: fnSpace(2, 1) })]));
  assert.deepEqual(g.spaces.top.arrows, [{ arrow: 'f', node: 'map(slice(v:V;0,1,2,1),v:Bm,measure(v:Tau;m);max(x, $1) * $2 + i)', error: null }]);
  assert.deepEqual(g.nodes[g.spaces.top.arrows[0].node], { op: 'map', inputs: ['slice(v:V;0,1,2,1)', 'v:Bm', 'measure(v:Tau;m)'], type: type(2, 1), formula: 'max(x, $1) * $2 + i' });
  assert.equal(g.blocks.f, undefined);         /* an arrow is no matrix: its output is */
  const all = make(snap([B('V', 0, 0, 2, 2), arrow('f', { id: 'V', as: 'block' }, { formula: 'max(x, 0)', span: 2 })]));      /* over the whole edge there is nothing to slice */
  assert.equal(all.spaces.top.arrows[0].node, 'map(v:V;max(x, 0))');
  const other = make(snap([B('V', 0, 0, 2, 2), B('Bm', 9, 9, 3, 3), arrow('f', { id: 'V', as: 'block' }, { formula: 'max(x, @[Bm])', span: 2 })]));
  assert.deepEqual(other.spaces.top.arrows[0], { arrow: 'f', node: null, error: { code: 'mismatch', note: 'not the size of the output' } });      /* a formula that stands for an error: the arrow has it */
  const lost = make(snap([B('V', 0, 0, 2, 2), arrow('f', { id: 'V', as: 'block' }, { formula: 'x + w', span: 2 })]));
  assert.deepEqual(lost.spaces.top.arrows[0].error, { code: 'no-source', note: 'unknown name: w' });
});
test('an arrow with nothing defined passes its covered part through: a slice, or its input whole', () => {
  const g = make(snap([B('V', 0, 0, 4, 3), arrow('f', { id: 'V', as: 'block' }, { span: 3 }, { inside: fnSpace(4, 3) }), arrow('h', { id: 'V', as: 'block' }, { side: 's', start: 2, span: 2 }),
    B('H', 9, 0, 4, 3, { seat: 'f' }), B('W', 13, 0, 2, 4)]));
  assert.deepEqual(g.spaces.top.arrows, [{ arrow: 'f', node: 'v:V', error: null }, { arrow: 'h', node: 'slice(v:V;1,0,2,3)', error: null }]);
  assert.deepEqual(g.nodes['v:H'], { op: 'variable', inputs: ['v:V'], type: type(4, 3), name: 'H', named: true, defined: 'seat', entries: {} });
  assert.equal(g.spaces.top.pieces.find(p => p.blocks.includes('H')).node, 'matmul(v:H,v:W)');      /* a seated block touches like any other */
  assert.deepEqual(g.nodes['param(f:f)'], { op: 'param', inputs: [], type: type(4, 3), within: ['f:f'] });
  assert.equal(g.blocks.in, 'param(f:f)'); assert.deepEqual(g.functions, { 'f:f': { input: 'param(f:f)', body: 'param(f:f)' } });      /* its space holds its input alone: the function that gives its input back */
});
const linear = (more = {}, inner = [B('W', -5, 0, 2, 4)]) => arrow('lin', { id: 'X', as: 'block' }, { span: 3, ...more }, { name: 'linear', variable: 7, inside: fnSpace(4, 3, ...inner) });
test('apply and param: an arrow defined in its space applies a function that is stored once', () => {
  const g = make(snap([B('X', 0, 0, 4, 3), linear(), B('Y', 0, 9, 4, 3),
    arrow('use', { id: 'Y', as: 'block' }, { span: 3 }, { name: 'linear', variable: 7, reference: true, inside: fnSpace(4, 3, B('W', -5, 0, 2, 4)) })]));
  assert.deepEqual(g.functions, { 'f:lin': { input: 'param(f:lin)', body: 'matmul(param(f:lin),v:W)' } });
  assert.deepEqual(g.spaces.top.arrows, [{ arrow: 'lin', node: 'apply(v:X;f:lin)', error: null }, { arrow: 'use', node: 'apply(v:Y;f:lin)', error: null }]);
  assert.deepEqual(g.nodes['apply(v:X;f:lin)'], { op: 'apply', inputs: ['v:X'], type: type(2, 3), fn: 'f:lin' });
  assert.deepEqual(g.nodes['matmul(param(f:lin),v:W)'], { op: 'matmul', inputs: ['param(f:lin)', 'v:W'], type: type(2, 3), within: ['f:lin'] });      /* marked with the function it belongs to */
  assert.equal(g.nodes['v:W'].within, undefined); assert.equal(g.nodes['apply(v:X;f:lin)'].within, undefined);
  assert.deepEqual(g.spaces['f:lin'], { owner: null, pieces: [{ blocks: ['in', 'W'], rule: 'product', node: 'matmul(param(f:lin),v:W)', error: null }], arrows: [], tiles: [] });
});
test('the program\'s functions, and an arrow of the project\'s that shadows one', () => {
  const use = (id, of) => arrow(id, { id: of, as: 'block' }, {}, { name: '.recip', reference: true });
  const g = make(snap([B('V', 0, 0, 2, 1), use('u', 'V')]));
  assert.equal(g.spaces.top.arrows[0].node, 'map(v:V;1/x)');
  const shadow = make(snap([B('V', 0, 0, 2, 1), use('u', 'V'), B('Q', 0, 9, 2, 1), arrow('mine', { id: 'Q', as: 'block' }, { formula: '2 * x' }, { name: '.recip' })]));
  assert.equal(shadow.spaces.top.arrows[0].node, 'map(v:V;2 * x)');
});
const tile = (more = {}) => ({ id: 't1', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 4, rows: 1, across: 1, down: 3, ...more } });
test('repeat: a tile\'s matrix, read out by an arrow, with its counts as plain numbers', () => {
  const g = make(snap([B('Row', 0, 0, 4, 1, { entries: { '1,1': 1 } }), arrow('out', { id: 't1', as: 'tile' }, { span: 1 }), B('Keys', 0, 20, 4, 5)], [tile({ down: { expr: '@[Keys:y]' } })]));
  const id = 'repeat(v:Row@0,0;4×1;1×5)';
  assert.deepEqual(g.spaces.top.arrows, [{ arrow: 'out', node: id, error: null }]);      /* an arrow on a tile reads all of it, whatever span it was saved with */
  assert.deepEqual(g.nodes[id], { op: 'repeat', inputs: ['v:Row'], type: type(4, 5), at: [{ col: 0, row: 0 }], pattern: { cols: 4, rows: 1 }, across: 1, down: 5 });
  assert.equal(g.nodes['v:Row'].within, undefined);      /* it reads no index: it is the same in every cell */
  const index = make(snap([B('P', 1, 0, 2, 1, { entries: { '1,1': { expr: 'index.x + index.y' } } }), B('Q', 0, 0, 1, 1)], [{ ...tile({ cols: 3, across: 2, down: 2 }), members: [0, 1] }]));
  assert.deepEqual(index.nodes['v:P'].within, ['t:t1']); assert.equal(index.nodes['v:Q'].within, undefined);      /* marked with the tile it belongs to, since it differs from cell to cell */
  assert.equal(index.spaces.top.pieces[0].node, 'scale(v:Q,v:P)');      /* shapes of one tile touch as any do */
});
test('nothing touches across a tile\'s boundary', () => {
  const g = make(snap([B('A', 0, 0, 3, 2), B('C', 3, 0, 4, 3)], [{ id: 't1', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 3, rows: 2, across: 1, down: 1 } }]));
  assert.deepEqual(g.spaces.top.pieces.map(p => p.node), ['v:A', 'v:C']);
});
const mapped = (arrowMore = {}, repeatMore = {}) => snap([B('M', 0, 0, 4, 2), arrow('f', { id: 'M', as: 'block' }, { side: 's', formula: 'max(x, 0)', ...arrowMore }, { x: 0, y: 2 })],
  [{ id: 't1', name: null, members: [1], groups: [], repeat: { x: 0, y: 2, cols: 1, rows: 2, across: 4, down: 1, ...repeatMore } }]);
test('mapalong: an arrow in a tile whose input is outside it is repeated along its input', () => {
  const g = make(mapped());
  assert.deepEqual(g.spaces.top.arrows, [{ arrow: 'f', node: 'mapalong(v:M;max(x, 0);cols;1;1;4)', error: null }]);
  assert.deepEqual(g.nodes['mapalong(v:M;max(x, 0);cols;1;1;4)'], { op: 'mapalong', inputs: ['v:M'], type: type(4, 2), formula: 'max(x, 0)', axis: 'cols', start: 1, span: 1, count: 4 });
  assert.equal(make(mapped({ formula: null })).spaces.top.arrows[0].node, 'v:M');      /* nothing defined: every run passed through is the input again */
  assert.equal(make(mapped({ formula: null }, { across: 3 })).spaces.top.arrows[0].node, 'slice(v:M;0,0,3,2)');
  assert.equal(make(mapped({ formula: 'x + index.x' })).spaces.top.arrows[0].node, 'mapalong(v:M;x + index.x;cols;1;1;4;@0,0)');      /* a formula that reads the index carries the arrow's place in its pattern */
  const fn = make(snap([B('M', 0, 0, 4, 2), arrow('f', { id: 'M', as: 'block' }, { side: 's' }, { x: 0, y: 2, inside: fnSpace(1, 2, B('w', -8, 0, 1, 1)) })],
    [{ id: 't1', name: null, members: [1], groups: [], repeat: { x: 0, y: 2, cols: 1, rows: 2, across: 4, down: 1 } }]));
  assert.equal(fn.spaces.top.arrows[0].node, 'mapalong(v:M;f:f;cols;1;1;4)');
  assert.deepEqual(fn.nodes['mapalong(v:M;f:f;cols;1;1;4)'].type, type(4, 2));
});

/* ---- one case for every error code, and where errors are ---- */
test('every error code', () => {
  const seen = new Set(), see = e => { assert.ok(e, 'an error'); seen.add(e.code); return e; };
  see(piece(make(snap([B('A', 0, 0, 3, 2), B('B', 3, 0, 2, 4)]))).error);                                             /* mismatch */
  see(piece(make(snap([B('A', 0, 0, 2, 4), B('B', 2, 0, 3, 2), B('C', 2, 2, 4, 2)]))).error);                         /* not-a-row */
  assert.deepEqual(see(piece(make(snap([B('A', 0, 0, 3, 2), B('B', 3, 0, 4, 3), B('C', 0, 2, 3, 2)]))).error), { code: 'mixed', note: '' });
  assert.deepEqual(see(make(snap([defined(4, 2, B('A', 0, 0, 4, 2), B('W', 9, 0, 4, 2), B('Z', 20, 0, 4, 2))])).nodes['v:K'].error), { code: 'pieces', note: '3 pieces' });
  assert.deepEqual(see(make(snap([defined(4, 6, B('A', 0, 0, 5, 6))])).nodes['v:K'].error), { code: 'size', note: '5 × 6 ≠ 4 × 6' });
  assert.deepEqual(see(make(snap([B('T', 0, 0, 1, 1, { entries: { '1,1': { expr: '@[T:m] + 1' } } })])).nodes['v:T'].error), { code: 'loop', note: '' });      /* through a formula */
  assert.deepEqual(see(make(snap([B('m', 9, 0, 1, 1, { from: { id: 'gone', side: 'x' } })])).nodes['v:m'].error), { code: 'no-source', note: '' });
  const seat = make(snap([B('H', 9, 0, 4, 3, { seat: 'f' }), arrow('f', { id: 'gone', as: 'block' })]));
  assert.deepEqual(see(seat.nodes['v:H'].error), { code: 'seat', note: 'no-source' });
  const unknown = make(snap([B('Row', 0, 0, 4, 1), arrow('out', { id: 't1', as: 'tile' }), B('Tau', 0, 20, 1, 1)], [tile({ down: { expr: '@[Tau:m]' } })]));      /* a mass not yet given */
  assert.deepEqual(see(unknown.spaces.top.arrows[0].error), { code: 'size-unknown', note: '@[Tau:m]' });
  assert.deepEqual([...seen].sort(), [...CODES].sort());
});
test('a loop through a formula is in the graph as an error on each variable round it, and never a cycle', () => {
  const g = make(snap([B('S', 0, 0, 1, 1, { entries: { '1,1': { expr: '@[T:m] * 2' } } }), B('T', 9, 0, 1, 1, { entries: { '1,1': { expr: '@[S:x]' } } }), B('U', 20, 0, 1, 1, { entries: { '1,1': { expr: '@[T:m]' } } })]));
  assert.equal(g.nodes['v:S'].error.code, 'loop'); assert.equal(g.nodes['v:T'].error.code, 'loop'); assert.equal(g.nodes['v:U'].error, undefined);
  /* sizes are settled: two matrices that read each other's widths depend on nothing that is worked out */
  const sizes = make(snap([B('K', 0, 0, 4, 1, { entries: { '1,1': { expr: '@[W:x]' } } }), B('W', 9, 0, 3, 1, { entries: { '1,1': { expr: '@[K:x]' } } })]));
  assert.equal(sizes.nodes['v:K'].error, undefined); assert.equal(sizes.nodes['v:W'].error, undefined);
  assert.deepEqual(sizes.nodes['v:W'].entries, { '1,1': { expr: '(4)' } }); assert.deepEqual(sizes.nodes['v:K'].entries, { '1,1': { expr: '(3)' } }); assert.deepEqual(sizes.nodes['v:K'].inputs, []);
});
test('an arrow\'s error is in spaces, beside the pieces, and on the variable seated on it', () => {
  const past = make(snap([B('V', 0, 0, 4, 3), arrow('f', { id: 'V', as: 'block' }, { start: 2, span: 3 }), B('H', 9, 0, 4, 3, { seat: 'f' })]));
  assert.deepEqual(past.spaces.top.arrows, [{ arrow: 'f', node: null, error: { code: 'size', note: 'rows 2 to 4 of 3' } }]);
  assert.deepEqual(past.nodes['v:H'].error, { code: 'seat', note: 'size' }); assert.deepEqual(past.nodes['v:H'].type, type(4, 3));
  const promise = make(snap([B('V', 0, 0, 4, 3), arrow('f', { id: 'V', as: 'block' }, { span: 3, output: { cols: 3, rows: 3 } })]));
  assert.deepEqual(promise.spaces.top.arrows[0], { arrow: 'f', node: null, error: { code: 'size', note: '4 × 3 ≠ 3 × 3' } });
  const gone = make(snap([arrow('f', { id: 'nothing', as: 'block' })]));
  assert.deepEqual(gone.spaces.top.arrows[0], { arrow: 'f', node: null, error: { code: 'no-source', note: '' } });
  const result = make(snap([B('A', 0, 0, 3, 2), B('C', 3, 0, 2, 4), arrow('f', { id: 'A', as: 'result' })]));      /* it reads a result that is an error */
  assert.deepEqual(result.spaces.top.arrows[0].error, { code: 'no-source', note: 'mismatch' });
  const fit = make(snap([B('X', 0, 0, 4, 3), linear(), B('Y', 0, 9, 5, 3), arrow('use', { id: 'Y', as: 'block' }, { span: 3 }, { name: 'linear', variable: 7, reference: true })]));
  assert.deepEqual(fit.spaces.top.arrows[1].error, { code: 'mismatch', note: '5 × 3 ≠ 4 × 3' });
  const gap = make(snap([B('Row', 0, 0, 3, 1), arrow('out', { id: 't1', as: 'tile' })], [tile()]));      /* the pattern is 4 wide and its block 3 */
  assert.deepEqual(gap.spaces.top.arrows[0].error, { code: 'no-source', note: 'its pattern has a gap' });
  assert.deepEqual(make(mapped({}, { across: 5 })).spaces.top.arrows[0].error.code, 'size');      /* the last cell runs past the input */
  assert.deepEqual(make(mapped({}, { across: 2, down: 2 })).spaces.top.arrows[0].error.code, 'mismatch');
});
test('an arrow reads a block, a piece\'s result, or another arrow\'s output', () => {
  const g = make(snap([B('A', 0, 0, 3, 2), B('C', 3, 0, 4, 3), arrow('f', { id: 'C', as: 'result' }, { span: 2 }), arrow('h', { id: 'f', as: 'result' }, { span: 2, formula: 'abs(x)' }),
    B('L', 0, 12, 3, 2), B('R', 3, 10, 3, 2), B('S', 3, 12, 3, 2, { seat: { hollow: ['L', 'R'] } })]));
  assert.deepEqual(g.spaces.top.arrows.map(a => a.node), ['matmul(v:A,v:C)', 'map(matmul(v:A,v:C);abs(x))']);
  assert.deepEqual(g.nodes['v:S'].inputs, ['ewise(v:L,v:R;mul;none)']); assert.equal(g.nodes['v:S'].defined, 'seat');      /* seated in a pair's hollow: the pair's result */
  assert.deepEqual(g.spaces.top.pieces.map(p => p.blocks), [['A', 'C'], ['L', 'R']]);      /* and it takes no part in touching there */
  assert.equal(g.blocks.S, 'v:S');
});
test('nothing loops without end: arrows that read each other, a seat on what it feeds, a function that applies itself', () => {
  const ring = make(snap([arrow('f', { id: 'h', as: 'result' }), arrow('h', { id: 'f', as: 'result' })]));
  assert.deepEqual(ring.spaces.top.arrows.map(a => a.error.code), ['loop', 'loop']);
  const self = make(snap([B('X', 0, 0, 2, 2, { seat: 'f' }), arrow('f', { id: 'X', as: 'block' }, { span: 2 })]));
  assert.equal(self.nodes['v:X'].error.code, 'loop');
  const inner = arrow('again', { id: 'in', as: 'block' }, { span: 3 }, { name: 'linear', variable: 7, reference: true });
  const rec = make(snap([B('X', 0, 0, 4, 3), linear({}, [inner])]));
  assert.equal(rec.spaces.top.arrows[0].error.code, 'loop'); assert.deepEqual(rec.functions, {});
  const count = make(snap([B('Row', 0, 0, 2, 1), arrow('out', { id: 't1', as: 'tile' }), B('Seat', 4, 0, 2, 1, { seat: 'out' })], [tile({ cols: 2, across: { expr: '@[Seat:x]' }, down: 1 })]));      /* a count that reads what its own tile makes */
  assert.deepEqual(count.spaces.top.tiles[0].error, { code: 'size-unknown', note: '@[Seat:x]' });      /* refused as the page refuses it (tiles.js: circular), so the two agree */
  assert.deepEqual(count.spaces.top.arrows[0], { arrow: 'out', node: null, error: { code: 'size-unknown', note: '@[Seat:x]' } }); assert.deepEqual(count.nodes['v:Seat'].error, { code: 'seat', note: 'size-unknown' });
  const through = make(snap([B('Row', 0, 0, 2, 1), arrow('out', { id: 't1', as: 'tile' }), B('Seat', 4, 0, 2, 1, { seat: 'out', variable: 5 }), B('use', 9, 9, 2, 1, { name: 'Seat', variable: 5, reference: true })], [tile({ cols: 2, across: { expr: '@[use:x]' }, down: 1 })]));      /* through a reference to it */
  assert.equal(through.spaces.top.tiles[0].error.code, 'size-unknown');
  const fine = make(snap([B('Row', 0, 0, 2, 1), arrow('out', { id: 't1', as: 'tile' }), B('Other', 9, 9, 3, 1)], [tile({ cols: 2, across: { expr: '@[Other:x]' }, down: 1 })]));      /* a size that is not its own */
  assert.equal(fine.spaces.top.tiles[0].node, 'repeat(v:Row@0,0;2×1;3×1)');
});
test('a block saved with no id is called by its place in the snapshot', () => {
  const g = make(snap([B(null, 0, 0, 3, 2, { name: 'A' }), B(null, 3, 0, 4, 3, { name: 'B', inside: space([B(null, 0, 0, 4, 3, { name: 'C' })]) }), { ...joined(), id: null, joined: joined().joined.map(j => ({ ...j, shape: { ...j.shape, id: null } })) }]));
  assert.deepEqual(g.blocks, { 'p:0': 'v:p:0', 'p:1': 'v:p:1', 'p:2': 'v:p:2', 'p:2.j0': 'v:p:2.j0', 'p:2.j1': 'v:p:2.j1', 'p:1.0': 'v:p:1.0' });
  assert.equal(piece(g).node, 'matmul(v:p:0,v:p:1)'); assert.deepEqual(Object.keys(g.spaces), ['top', 'v:p:1']);
});
test('a long id is its operation and a hash of what it would have been', () => {
  const row = Array.from({ length: 12 }, (_, i) => B('Matrix' + i, i * 2, 0, 2, 2)), g = make(snap(row)), id = piece(g).node;
  assert.match(g.nodes[id].inputs[0], /^matmul#[0-9a-f]{16}$/); assert.equal(build(snap(row)).spaces.top.pieces[0].node, id);
  assert.equal(g.nodes[id].inputs[1], 'v:Matrix11'); assert.ok(Object.keys(g.nodes).every(k => k.length <= 96));
});

/* ---- 20 to 23, over everything built above ---- */
const shifted = (s, dx, dy) => { const sp = p => ({ ...p, shapes: p.shapes.map(sh), groups: p.groups.map(gr), operations: (p.operations || []).map(o => ({ ...o, sources: o.sources.map(sh) })) });
  const gr = g => ({ ...g, groups: (g.groups || []).map(gr), ...(g.repeat ? { repeat: { ...g.repeat, x: g.repeat.x + dx, y: g.repeat.y + dy } } : {}) });
  const sh = d => ({ ...d, x: d.x + (d.standing ? 0 : dx), y: d.y + (d.standing ? 0 : dy),      /* a standing shape lies where it stands in the matrix: that is not a place on the canvas */
     inside: d.inside && sp(d.inside), joined: d.joined && d.joined.map(j => ({ ...j, shape: sh(j.shape) })) });
  return { top: sp(s.top) }; };
test('20: every block moved by the same offset gives an identical graph', () => {
  assert.ok(built.length > 60);
  for (const s of built) assert.equal(JSON.stringify(build(shifted(s, 7, -13))), JSON.stringify(build(s)));
});
test('20b: a block moved without changing what it touches leaves the graph as it was', () => {
  const at = (x, y) => snap([B('A', 0, 0, 3, 2), B('B', 3, 0, 4, 3), B('C', x, y, 2, 2)]);
  assert.equal(JSON.stringify(build(at(40, 40))), JSON.stringify(build(at(-9, 17))));
  const slid = snap([B('A', 0, 0, 3, 2), B('B', 3, 1, 4, 3), B('C', 40, 40, 2, 2)]);      /* still against the same edge */
  assert.equal(JSON.stringify(build(slid)), JSON.stringify(build(at(40, 40))));
});
test('21: built twice, the graphs are deeply equal, with their keys in one order, and survive a JSON round trip', () => {
  for (const s of built){ const a = build(s), b = build(s);
    assert.deepEqual(a, b); assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.deepEqual(JSON.parse(JSON.stringify(a)), a); }
  const before = JSON.stringify(built[0]); build(built[0]); assert.equal(JSON.stringify(built[0]), before);      /* and the snapshot is left as it was */
});
test('22: validate accepts every graph built above', () => {
  for (const s of built) assert.deepEqual(validate(build(s)), []);
});
test('23: projects/example builds, and Keys is defined by the matmul of its two blocks', () => {
  const g = build(read(tree(join(projects, 'example'))));
  assert.deepEqual(validate(g), []);
  const [id, keys] = Object.entries(g.nodes).find(([, n]) => n.op === 'variable' && n.name === 'Keys');
  assert.equal(keys.defined, 'definition'); assert.equal(g.nodes[keys.inputs[0]].op, 'matmul');
  assert.deepEqual(g.nodes[keys.inputs[0]].inputs.map(i => g.nodes[i].name), ['Embedding', 'Key Weights']);
  assert.deepEqual(g.nodes[keys.inputs[0]].type, type(4, 6, 'key', 'context')); assert.deepEqual(g.spaces[id].pieces.length, 1);
});
test('every project that comes with the repository builds into a graph validate accepts, the same each time', () => {
  for (const name of readdirSync(projects).filter(n => statSync(join(projects, n)).isDirectory())){
    const s = read(tree(join(projects, name))), g = build(s);
    assert.deepEqual(validate(g), [], name); assert.equal(JSON.stringify(build(s)), JSON.stringify(g), name); assert.deepEqual(JSON.parse(JSON.stringify(g)), g, name);
    assert.equal(JSON.stringify(build(shifted(s, 3, 11))), JSON.stringify(g), name + ', moved');
  }
});
test('build never throws: half-built and broken canvases', () => {
  for (const s of [undefined, null, {}, { top: null }, { top: {} }, { top: { shapes: [null, 7, {}, { id: 'a' }, { arrow: {} }, { arrow: { input: null } }, { joined: [null, {}] }, { from: {} }, { seat: {} }, { seat: 'x' }, { inside: {} },
    { id: 'q', cols: 0, rows: -3, x: 'a', entries: { bad: 1, '1,1': NaN, '1,2': { expr: 5 } }, attributes: [null, { name: 3 }] }], groups: [null, { members: [99] }, { repeat: {}, groups: 5 }], operations: [null, { sources: [null, {}] }] } }]){
    const g = build(s); assert.deepEqual(validate(g), [], JSON.stringify(s)); }
  /* every shipped project, with each field of each shape in turn taken away or made nonsense */
  const all = readdirSync(projects).filter(n => statSync(join(projects, n)).isDirectory()).map(n => read(tree(join(projects, n))));
  let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  const harm = d => { const out = { ...d }, keys = Object.keys(out), k = keys[rnd(keys.length)], how = rnd(5);
    if (how === 0) delete out[k]; else out[k] = [null, 3, 'gone', {}][how - 1];
    if (out.inside && typeof out.inside === 'object' && Array.isArray(out.inside.shapes)) out.inside = { ...out.inside, shapes: out.inside.shapes.map(x => rnd(3) ? x : harm(x)) };
    return out; };
  for (let round = 0; round < 40; round++) for (const s of all){ const broken = { top: { ...s.top, shapes: s.top.shapes.map(d => rnd(4) ? d : harm(d)) } };
    const g = build(broken); assert.deepEqual(validate(g), []); }
});

/* ---- validate refuses ---- */
const good = () => build(snap([
  B('A', 0, 0, 3, 2, { variable: 3, entries: { '1,1': 4, '2,1': { expr: '@[s:m]' } } }), B('W', 3, 0, 4, 3), B('s', 7, 0, 1, 1),      /* a product and a scale */
  B('C', 20, 0, 3, 2), B('D', 20, 2, 3, 2),                                                                                       /* a sum */
  B('E', 40, 2, 3, 2), B('F', 43, 1, 3, 1),                                                                                       /* times, a row broadcast */
  { ...joined(), x: 100 },
  B('X', 0, 30, 4, 3), arrow('lin', { id: 'X', as: 'block' }, { span: 3 }, { name: 'linear', inside: fnSpace(4, 3, B('Wf', -5, 0, 2, 4)) }),
  B('M', 0, 50, 4, 2), arrow('f', { id: 'M', as: 'block' }, { side: 's', formula: 'max(x, 0)' }, { x: 0, y: 52 }),                     /* repeated in tile t1 */
  B('Row', 0, 60, 4, 1), arrow('out', { id: 't2', as: 'tile' }),
  B('Z', 40, 40, 2, 2, { source: 'zeros' }), B('part', 50, 50, 2, 2, { name: 'Shape 5', from: { id: 'W', range: { col: 0, row: 0, cols: 2, rows: 2, toEnd: { cols: false, rows: false } } } }),
  B('At', 60, 60, 2, 3, { name: 'A', variable: 3, reference: true, transposed: true }), arrow('relu', { id: 'C', as: 'block' }, { span: 2, formula: 'max(x, @[s:m])' }),
  B('Nz', 70, 70, 2, 2, { source: { noise: { seed: 1, dist: 'normal' } } }), B('Fl', 80, 80, 2, 2, { source: { file: 'data/w.csv' } }),
  /* matrices standing in the entries of a shape that holds inner data (a stack), and one of them taken out again (an entry) */
  B('QK', 0, 90, 2, 1, { inner: [{ length: 2, name: null }, { length: 3, name: null }], inside: space([B('q1', -5, -1, 2, 3, { standing: true }), B('q2', -3, -1, 2, 3, { standing: true })]) }),
  B('Kout', 10, 90, 2, 3, { name: 'Shape 6', from: { id: 'QK', entry: { col: 2, row: 1 } } })],
  [{ id: 't1', name: null, members: [11], groups: [], repeat: { x: 0, y: 52, cols: 1, rows: 2, across: 4, down: 1 } }, { id: 't2', name: null, members: [12], groups: [], repeat: { x: 0, y: 60, cols: 4, rows: 1, across: 1, down: 2 } }]));
const refused = (change, what) => { const g = JSON.parse(JSON.stringify(good())); change(g); const bad = validate(g); assert.ok(bad.length > 0, 'refused: ' + what); assert.ok(bad.every(b => typeof b === 'string')); return bad; };
const first = (g, op) => Object.entries(g.nodes).find(([, n]) => n.op === op)[1];
test('validate accepts what build made, of every operation', () => {
  const g = good(); assert.deepEqual(validate(g), []);
  assert.deepEqual([...new Set(Object.values(g.nodes).map(n => n.op))].sort(), Object.keys(OPS).sort());
});
test('validate refuses a graph that is not one', () => {
  for (const g of [null, 7, 'graph', {}, { version: 1 }, { version: 1, nodes: [], functions: {}, spaces: {}, blocks: {} }]) assert.ok(validate(g).length > 0);
  refused(g => { g.version = 3; }, 'another version'); refused(g => { g.version = 0; }, 'no version');
  for (const v of [1, 2]){ const g = JSON.parse(JSON.stringify(good())); g.version = v; assert.deepEqual(validate(g), [], 'a version 1 graph is a version 2 graph as it stands'); }
  const inf = good(); inf.nodes['v:A'].entries['1,1'] = Infinity; assert.ok(validate(inf).length > 0);      /* an infinity is written "inf" */
  const undef = good(); undef.nodes['v:A'].entries['1,1'] = undefined; assert.ok(validate(undef).length > 0);
});
test('validate refuses an input that is not there, an operation it does not know, and a cycle', () => {
  assert.match(refused(g => { g.nodes['matmul(v:A,v:W)'].inputs[1] = 'v:nothing'; }, 'a missing input')[0], /not in the graph/);
  refused(g => { g.nodes['v:C'].op = 'conv'; }, 'an unknown operation');
  refused(g => { g.nodes['matmul(v:A,v:W)'].inputs = ['v:A']; }, 'one input to a product');
  refused(g => { g.nodes['v:C'].inputs = ['add(v:C,v:D)']; g.nodes['v:C'].defined = 'definition'; }, 'a cycle');
  assert.deepEqual(refused(g => { g.nodes['v:W'] = { ...g.nodes['v:W'], inputs: ['matmul(v:A,v:W)'], defined: 'definition' }; }, 'a cycle'), ['the nodes form a cycle']);
  refused(g => { g.functions['f:lin'].body = 'apply(v:X;f:lin)'; }, 'a function that applies itself');
});
test('validate refuses a type that does not follow from the inputs by the operation\'s rule', () => {
  refused(g => { g.nodes['matmul(v:A,v:W)'].type.cols = 5; }, 'a product of the wrong size');
  refused(g => { g.nodes['matmul(v:A,v:W)'].type.rowsName = 'made up'; }, 'a product with a name from nowhere');
  refused(g => { g.nodes['v:W'].type.rows = 4; }, 'a product whose sizes do not agree');
  refused(g => { g.nodes['v:A'].type = { cols: 3, rows: 2 }; }, 'a type with fields missing');
  refused(g => { g.nodes['v:A'].type.cols = 0; }, 'a side of no length');
  refused(g => { g.nodes['add(v:C,v:D)'].type.rows = 4; }, 'a sum that grew');
  refused(g => { g.nodes['v:D'].type.rows = 3; g.nodes['add(v:C,v:D)'].type.rows = 3; }, 'a sum of two heights');
  refused(g => { first(g, 'ewise').broadcast = 'none'; }, 'a broadcast that is not said');
  refused(g => { first(g, 'ewise').fn = 'pow'; }, 'an elementwise function that is not one');
  refused(g => { first(g, 'ewise').type.rows = 1; }, 'an elementwise result the size of the smaller');
  refused(g => { first(g, 'slice').range.cols = 9; first(g, 'slice').type.cols = 9; }, 'a range past its input');
  refused(g => { first(g, 'slice').range.col = -1; }, 'a range from before the start');
  refused(g => { first(g, 'slice').type.cols = 1; }, 'a slice that is not its range\'s size');
  refused(g => { first(g, 'source').kind = 'noise'; }, 'a source of no kind');
  refused(g => { first(g, 'source').type.colsName = 'k'; }, 'a source with a named side');
  refused(g => { first(g, 'transpose').type = { cols: 3, rows: 2, colsName: null, rowsName: null }; }, 'a transpose that did not turn');
  refused(g => { g.nodes['scale(v:A,v:W)'] = { op: 'scale', inputs: ['v:A', 'v:W'], type: g.nodes['v:W'].type }; }, 'a scale by a matrix');
  refused(g => { first(g, 'measure').side = 'z'; }, 'a measure of no side');
  refused(g => { g.nodes['measure(v:A;m)'] = { op: 'measure', inputs: ['v:A'], type: { cols: 1, rows: 1, colsName: null, rowsName: null }, side: 'm' }; }, 'the mass of a matrix');
  refused(g => { first(g, 'measure').type.cols = 2; }, 'a measure that is not one entry');
  refused(g => { g.nodes['measure(v:A;a:h)'] = { op: 'measure', inputs: ['v:A'], type: { cols: 1, rows: 1, colsName: null, rowsName: null }, side: 'a', name: 'h', formula: '$1 + 1' }; }, 'an attribute that names an input it has not got');
  refused(g => { first(g, 'apply').type.cols = 9; }, 'an apply that is not its body\'s size');
  refused(g => { first(g, 'apply').fn = 'f:none'; }, 'an apply of no function');
  refused(g => { g.nodes['v:X'].type.cols = 5; }, 'an apply to what does not fit');
  refused(g => { first(g, 'repeat').down = 3; }, 'a repeat whose size is not its counts');
  refused(g => { first(g, 'repeat').across = 0; }, 'a count of none');
  refused(g => { first(g, 'repeat').pattern.cols = 5; first(g, 'repeat').type.cols = 5; }, 'a pattern with a gap');
  refused(g => { first(g, 'repeat').at = []; }, 'a repeat with no places');
  refused(g => { first(g, 'mapalong').count = 5; first(g, 'mapalong').type.cols = 5; }, 'a run past its input');
  refused(g => { first(g, 'mapalong').fn = 'f:lin'; }, 'both a function and a formula');
  refused(g => { first(g, 'mapalong').axis = 'z'; }, 'no axis');
  refused(g => { first(g, 'mapalong').formula = 'x + $1'; }, 'a formula that names an input it has not got');
  refused(g => { g.nodes['map(v:A;x)'] = { op: 'map', inputs: ['v:A', 'v:W'], type: g.nodes['v:A'].type, formula: 'x + $1' }; }, 'a map over a matrix of another size');
});
test('validate refuses a block that its parts do not cover exactly', () => {
  refused(g => { first(g, 'block').at[1].col = 2; }, 'parts that overlap');
  refused(g => { first(g, 'block').at[1].col = 4; first(g, 'block').type.cols = 6; }, 'a gap');
  refused(g => { first(g, 'block').at.pop(); }, 'a part with no place');
  refused(g => { first(g, 'block').at[0].col = .5; }, 'a place between entries');
});
test('validate refuses a variable that breaks its own rule', () => {
  refused(g => { g.nodes['v:C'].defined = 'somehow'; }, 'no such way of being defined');
  refused(g => { g.nodes['v:C'].defined = 'definition'; }, 'a definition with no input');
  refused(g => { g.nodes['v:J'].type.cols = 6; }, 'a variable that is not the size of what defines it');
  refused(g => { g.nodes['v:J'].defined = 'source'; }, 'a source over a block');
  refused(g => { g.nodes['v:A'].entries['4,1'] = 1; }, 'an entry outside it');
  refused(g => { g.nodes['v:A'].entries['1,1'] = { err: 7 }; }, 'an error that says nothing');
  refused(g => { g.nodes['v:A'].entries['1,1'] = 1.5; }, 'a decimal kept as an entry');
  refused(g => { g.nodes['v:A'].entries['2,1'] = { expr: '$2' }; }, 'a formula that names an input it has not got');
  refused(g => { g.nodes['v:C'].error = 'loop'; }, 'an error that is a bare string');
  refused(g => { g.nodes['v:C'].error = { code: 'odd', note: '' }; }, 'an error code there is not');
  refused(g => { g.nodes['v:J'].error = { code: 'loop', note: '' }; }, 'an error on a variable that still has its input');
  refused(g => { delete g.nodes['v:C'].name; }, 'no name');
});
test('validate refuses functions, marks, spaces and blocks that do not hold together', () => {
  refused(g => { g.functions['f:lin'].input = 'v:X'; }, 'a function whose input is no param');
  refused(g => { g.functions['f:lin'].body = 'v:none'; }, 'a function with no body');
  refused(g => { delete g.nodes['matmul(param(f:lin),v:Wf)'].within; }, 'a node of a body that is not marked');
  refused(g => { g.nodes['v:C'].within = ['f:lin']; }, 'a node marked as in a function it is not in');
  refused(g => { g.nodes['v:C'].within = 'f:lin'; }, 'a mark that is not a list');
  refused(g => { g.spaces.top.pieces[0].node = 'v:none'; }, 'a piece whose node is not there');
  refused(g => { g.spaces.top.pieces[0].error = { code: 'mismatch', note: '' }; }, 'a piece with a node and an error');
  refused(g => { g.spaces.top.pieces[0].node = null; }, 'a piece with neither');
  refused(g => { g.spaces.top.pieces[0].node = null; g.spaces.top.pieces[0].error = { code: 'pieces', note: '' }; }, 'a piece with a variable\'s error');
  refused(g => { g.spaces.top.pieces[0].node = null; g.spaces.top.pieces[0].error = 'mismatch'; }, 'a bare string for an error');
  refused(g => { g.spaces.top.pieces[0].rule = 'power'; }, 'a rule there is not');
  refused(g => { g.spaces.top.arrows[0].node = null; }, 'an arrow with neither');
  refused(g => { g.spaces.top.owner = 'v:none'; }, 'an owner that is not there');
  refused(g => { delete g.spaces.top.arrows; }, 'a space with no arrows');
  refused(g => { g.blocks.A = 'v:none'; }, 'a block whose node is not there');
});
test('the index is read from the innermost cell, and that is the one place it is chosen', () => {
  assert.equal(indexAt([], 1, 1), null); assert.equal(indexAt(null, 1, 1), null);
  assert.deepEqual(indexAt([{ x: 4, y: 2 }], 2, 1), { x: 6, y: 3 });
  assert.deepEqual(indexAt([{ x: 100, y: 100 }, { x: 4, y: 2 }], 2, 1), { x: 6, y: 3 });      /* a tile in a tile: the inner one's */
  assert.deepEqual(indexAt([{ x: 4, y: 2, turned: true }], 2, 1), { x: 5, y: 4 });      /* read through a transpose, entry c,r stands in column r, row c */
});

/* ---- after review ---- */
const sorted = g => ({ nodes: g.nodes, blocks: g.blocks, functions: g.functions, spaces: Object.fromEntries(Object.entries(g.spaces).map(([k, sp]) => [k, { ...sp, pieces: [...sp.pieces].sort((a, b) => a.blocks.join() < b.blocks.join() ? -1 : 1), arrows: [...sp.arrows].sort((a, b) => a.arrow < b.arrow ? -1 : 1) }])) });
const eitherOrder = (shapes, check) => { const a = make(snap(shapes)), b = make(snap([...shapes].reverse())); assert.deepEqual(sorted(b), sorted(a)); check(a); return a; };
test('a length is read without building what it is read off: the graph is the same whichever shape comes first', () => {
  /* X holds a formula of K's width, and K's definition holds X: no loop, since a width is settled from sizes alone */
  const inK = () => space([B('x2', 0, 0, 2, 3, { name: 'X', variable: 1, reference: true }), B('W', 2, 0, 4, 2)]);
  eitherOrder([B('X', 0, 0, 2, 3, { variable: 1, entries: { '1,1': { expr: '@[K:x] + 1' } } }), B('K', 9, 0, 4, 3, { inside: inK() })], g => {
    assert.equal(g.nodes['v:X'].error, undefined); assert.equal(g.nodes['v:K'].error, undefined); assert.equal(g.nodes['v:K'].defined, 'definition');
    assert.deepEqual(g.nodes['v:X'].entries, { '1,1': { expr: '(4) + 1' } }); assert.deepEqual(g.nodes['v:X'].inputs, []); });
  /* the same through a height, an attribute, and a block that is a measure of the other's side */
  eitherOrder([B('X', 0, 0, 2, 3, { variable: 1, entries: { '1,1': { expr: '@[K:y] * @[K:a:heads]' } } }), B('K', 9, 0, 4, 3, { inside: inK(), attributes: [{ name: 'heads', value: 'x + 2' }] })], g => {
    assert.equal(g.nodes['v:X'].error, undefined); assert.equal(g.nodes['v:K'].error, undefined); assert.deepEqual(g.nodes['v:X'].entries, { '1,1': { expr: '(3) * ((4) + 2)' } }); });
  eitherOrder([B('m', 0, 0, 1, 1, { variable: 1, from: { id: 'K', side: 'x' } }), B('K', 9, 0, 1, 2, { inside: space([B('m2', 0, 0, 1, 1, { name: 'm', variable: 1, reference: true }), B('W', 1, 0, 1, 2)]) })], g => {
    assert.equal(g.nodes['v:m'].error, undefined); assert.equal(g.nodes['v:K'].error, undefined); assert.deepEqual(g.nodes['v:m'].entries, { '1,1': 1 }); assert.equal(g.nodes['v:K'].defined, 'definition'); });
  /* where nothing can come back round, a length and an attribute are nodes, in either order */
  eitherOrder([B('W', 0, 0, 2, 1, { entries: { '1,1': { expr: '@[K:x] + @[K:a:heads]' } } }), B('K', 9, 0, 4, 3, { attributes: [{ name: 'heads', value: '8' }] })], g => assert.deepEqual(g.nodes['v:W'].inputs, ['measure(v:K;x)', 'measure(v:K;a:heads)']));
  /* a single entry's side is the root of its mass: that is a value, and reading its own is a loop in either order */
  eitherOrder([B('S', 0, 0, 1, 1, { entries: { '1,1': { expr: '@[T:x]' } } }), B('T', 9, 0, 1, 1, { entries: { '1,1': { expr: '@[S:m]' } } })], g => { assert.equal(g.nodes['v:S'].error.code, 'loop'); assert.equal(g.nodes['v:T'].error.code, 'loop'); });
});
test('an arrow in a tile whose formula reads the index is worked out for each cell: its nodes belong to the tile', () => {
  const g = make(snap([B('P', 0, 0, 2, 1, { entries: { '1,1': 0, '2,1': 0 } }), arrow('f', { id: 'P', as: 'block' }, { side: 's', span: 2, gap: 1, formula: 'x + index.x' }, { x: 0, y: 1 }), B('H', 0, 1, 2, 1, { seat: 'f' }), arrow('out', { id: 't1', as: 'tile' })],
    [{ id: 't1', name: null, members: [0, 1, 2], groups: [], repeat: { x: 0, y: 0, cols: 2, rows: 2, across: 3, down: 1 } }]));
  assert.deepEqual(g.nodes['map(v:P;x + index.x)'], { op: 'map', inputs: ['v:P'], type: type(2, 1), formula: 'x + index.x', within: ['t:t1'] });      /* no place of its own: it is read where it is worked out */
  assert.deepEqual(g.nodes['v:H'].within, ['t:t1']); assert.equal(g.nodes['v:P'].within, undefined);
  assert.deepEqual(g.spaces.top.tiles, [{ tile: 't:t1', blocks: ['P', 'H'], arrows: ['f'], node: 'repeat(v:P@0,0;v:H@0,1;2×2;3×1)', error: null }]);
});
test('whatever follows its cell in a tile is marked with the tile, however it is reached: a piece, an arrow\'s output', () => {
  const g = make(snap([B('P', 0, 0, 2, 1, { entries: { '1,1': { expr: 'index.x' }, '2,1': { expr: 'index.x' } } }), B('Q', 2, 0, 1, 2, { entries: { '1,1': 1, '1,2': 1 } }), arrow('f', { id: 'P', as: 'block' }, { side: 's', span: 2 }, { x: 0, y: 1 })],
    [{ id: 't1', name: null, members: [0, 1, 2], groups: [], repeat: { x: 0, y: 0, cols: 3, rows: 2, across: 2, down: 1 } }]));
  assert.deepEqual(g.nodes['matmul(v:P,v:Q)'].within, ['t:t1']); assert.deepEqual(g.nodes['v:P'].within, ['t:t1']); assert.equal(g.nodes['v:Q'].within, undefined);
  assert.equal(g.spaces.top.arrows[0].node, 'v:P');
  /* validate holds the marks to exactly that: one taken away, one too many, one of a tile that is not there */
  const without = JSON.parse(JSON.stringify(g)); delete without.nodes['matmul(v:P,v:Q)'].within; assert.match(validate(without)[0], /within names the tiles none and it belongs to t:t1/);
  const extra = JSON.parse(JSON.stringify(g)); extra.nodes['v:Q'].within = ['t:t1']; assert.ok(validate(extra).length > 0);
  const other = JSON.parse(JSON.stringify(g)); other.nodes['v:P'].within = ['t:other']; assert.ok(validate(other).length > 0);
});
test('validate answers for any value at all, and never throws', () => {
  for (const g of [null, undefined, 0, 'x', [], [1], { version: 1, nodes: null }, { version: 1, nodes: { a: null }, functions: {}, spaces: {}, blocks: {} }, { version: 1, nodes: { a: 7, b: 'x', c: [] }, functions: {}, spaces: {}, blocks: {} },
    { version: 1, nodes: { a: { op: 'constructor', inputs: [], type: type(1, 1) }, b: { op: 'toString' }, c: { op: '__proto__', inputs: [] }, d: { op: 'hasOwnProperty', inputs: [], type: type(1, 1) } }, functions: {}, spaces: {}, blocks: {} },
    { version: 1, nodes: {}, functions: { f: null, g: 7 }, spaces: { top: null, x: 7, y: { owner: null, pieces: [null, 7], arrows: [null], tiles: [null, 7, {}] } }, blocks: { a: null, b: 7 } },
    { version: 1, nodes: { a: { op: 'variable', inputs: [], type: type(1, 1), name: 'a', named: true, defined: 'toString', entries: { '1,1': null } } }, functions: {}, spaces: {}, blocks: {} },
    { version: 1, nodes: { a: { op: 'apply', inputs: ['a'], type: type(1, 1), fn: 'constructor' }, b: { op: 'mapalong', inputs: ['a'], type: type(1, 1), fn: '__proto__', axis: 'rows', start: 1, span: 1, count: 1 } }, functions: {}, spaces: {}, blocks: {} }]){
    const bad = validate(g); assert.ok(Array.isArray(bad) && bad.length > 0 && bad.every(b => typeof b === 'string'), JSON.stringify(g)); }
  const deep = good(); let at = deep.nodes['v:C']; for (let i = 0; i < 5000; i++) at = at.more = {}; assert.ok(validate(deep).length > 0);      /* however deep what it is handed goes */
});
test('validate reads every formula: nothing a node depends on can be hidden in one', () => {
  for (const formula of ['$1 + @[b1:x]', '@[s:m]', '(((', 'eval(1)', 'x + 1', 'heads * 2', '$2', '$0', '__proto__', 'constructor', 'i + j', ''])
    refused(g => { g.nodes['v:A'].entries['2,1'] = { expr: formula }; }, 'a variable holding ' + formula);
  refused(g => { g.nodes['v:A'].entries['2,1'] = { expr: '$1', also: 1 }; }, 'a formula with something beside it');
  for (const formula of ['max(x, @[b1:x])', 'x +', 'eval(x)', 'x + w', 'x + $2', 'x + Keys.x', ''])
    for (const op of ['map', 'mapalong']) refused(g => { first(g, op).formula = formula; }, `a ${op} holding ${formula}`);
  const attr = formula => ({ op: 'measure', inputs: ['v:A', 'measure(v:s;m)'], type: type(1, 1), side: 'a', name: 'h', formula });
  for (const formula of ['$1 + @[b1:x]', '(((', 'eval($1)', '$1 + x', '$2'])
    refused(g => { g.nodes['measure(v:A;a:h)'] = attr(formula); }, 'an attribute holding ' + formula);
  const ok = good(); ok.nodes['measure(v:A;a:h)'] = attr('max($1, 2) + index.x'); assert.deepEqual(validate(ok), []);
  const empty = good(); empty.nodes['measure(v:A;a:h)'] = attr(''); assert.deepEqual(validate(empty), []);      /* an attribute with nothing typed */
  const names = good(); first(names, 'map').formula = 'select(i > j, -inf, X) + index.y + $1'; assert.deepEqual(validate(names), []);      /* an arrow's own names, any case */
  /* and build writes none: across every project, every formula in the graph is one validate accepts, with no capsule in it */
  for (const name of readdirSync(projects).filter(n => statSync(join(projects, n)).isDirectory())) assert.ok(!JSON.stringify(build(read(tree(join(projects, name))))).includes('@['), name);
});
test('validate holds an exact value to its one stated form, and an entry\'s key to its one spelling', () => {
  for (const v of [{ n: 2, k: 60 }, { n: 2, k: 7 }, { n: 1, d: 0, k: 0 }, { n: 1, k: -1 }, { n: 2, d: 4, k: 0 }, { n: 1, d: -2, k: 0 }, { n: 1, d: 1, k: 0 }, { n: 4, k: 0 }, { n: 4, k: 1 }, { n: 0, k: 1 }, { n: 1.5, k: 0 }, { n: 1, d: 2, k: 0, x: 1 }, { n: 1, d: 2 }, { k: 1 },
    { n: 2 ** 60, k: 1 }, {}, [], 1.5, NaN, 'seven', { sym: '' }, { sym: 7 }, { f: 0.5 }, null])
    refused(g => { g.nodes['v:A'].entries['1,1'] = v; }, 'an entry holding ' + JSON.stringify(v));
  for (const v of [{ n: 1, d: 2, k: 0 }, { n: 2, k: 1 }, { n: 2, k: 6 }, { n: -3, d: 4, k: 1 }, 'inf', '-inf', true, -7, { sym: '1+sqrt(2)' }, { err: 'divide by zero' }]){ const g = good(); g.nodes['v:A'].entries['1,1'] = v; assert.deepEqual(validate(g), [], JSON.stringify(v)); }
  for (const key of ['01,1', '1,01', '0,1', '1,0', '4,1', '1,3', '1, 1', '1', '1,1,1', '-1,1', '1.0,1'])
    refused(g => { g.nodes['v:A'].entries[key] = 3; }, 'an entry called ' + key);
  /* build keeps a value that is not in that form as the value it is, and drops what is none */
  const g = make(snap([B('A', 0, 0, 3, 2, { entries: { '1,1': { n: 2, d: 4, k: 0 }, '2,1': { n: 4, k: 1 }, '3,1': { n: 1, d: 0, k: 0 }, '1,2': { n: 2, k: 60 }, '2,2': { n: 6, d: 3, k: 0 }, '01,1': 5 } })]));
  assert.deepEqual(g.nodes['v:A'].entries, { '1,1': { n: 1, d: 2, k: 0 }, '2,1': 2, '2,2': 2 });
});
test('a tile wholly inside another tile\'s pattern is one part of it: a repeat that is an input of a repeat', () => {
  /* the outer pattern is 2 by 2: its first row is an inner tile (a 1 by 1 pattern, twice across), its second a block */
  const g = make(snap([B('P', 0, 0, 1, 1, { entries: { '1,1': { expr: 'index.x' } } }), B('Under', 0, 1, 2, 1, { entries: { '1,1': { expr: 'index.x' }, '2,1': 9 } }), arrow('out', { id: 'outer', as: 'tile' })],
    [{ id: 'outer', name: null, members: [1], repeat: { x: 0, y: 0, cols: 2, rows: 2, across: 3, down: 1 }, groups: [{ id: 'inner', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 1, rows: 1, across: 2, down: 1 } }] }]));
  const inner = 'repeat(v:P@0,0;1×1;2×1)', outer = `repeat(v:Under@0,1;${inner}@0,0;2×2;3×1)`;
  assert.deepEqual(g.spaces.top.arrows, [{ arrow: 'out', node: outer, error: null }]);
  assert.deepEqual(g.nodes[outer], { op: 'repeat', inputs: ['v:Under', inner], type: type(6, 2), at: [{ col: 0, row: 1 }, { col: 0, row: 0 }], pattern: { cols: 2, rows: 2 }, across: 3, down: 1 });
  assert.deepEqual(g.nodes[inner], { op: 'repeat', inputs: ['v:P'], type: type(2, 1), at: [{ col: 0, row: 0 }], pattern: { cols: 1, rows: 1 }, across: 2, down: 1, within: ['t:outer'] });
  assert.deepEqual(g.nodes['v:P'].within, ['t:outer', 't:inner']); assert.deepEqual(g.nodes['v:Under'].within, ['t:outer']);      /* every tile it belongs to, outermost first */
  assert.deepEqual(g.spaces.top.tiles.map(t => [t.tile, t.blocks, t.node]), [['t:outer', ['P', 'Under'], outer], ['t:inner', ['P'], inner]]);
  assert.deepEqual(g.spaces.top.pieces.map(p => p.blocks), [['P'], ['Under']]);      /* and nothing touches across the inner tile's edge */
  const gap = make(snap([B('P', 0, 0, 1, 1), arrow('out', { id: 'outer', as: 'tile' })],      /* an inner tile that does not fill the pattern leaves a gap, as a block would */
    [{ id: 'outer', name: null, members: [], repeat: { x: 0, y: 0, cols: 2, rows: 2, across: 1, down: 1 }, groups: [{ id: 'inner', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 1, rows: 1, across: 2, down: 1 } }] }]));
  assert.deepEqual(gap.spaces.top.arrows[0].error, { code: 'no-source', note: 'its pattern has a gap' }); assert.equal(gap.spaces.top.tiles[1].node, inner.replace('v:P', 'v:P'));
});
test('tiles that overlap without one lying wholly inside the other\'s pattern have no matrix, and an arrow on either says so', () => {
  const G2 = (inner, more = [], extra = []) => [{ id: 'outer', name: null, members: [], repeat: { x: 0, y: 0, cols: 4, rows: 1, across: 1, down: 3 }, groups: [{ id: 'inner', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 2, rows: 1, down: 1, ...inner } }] }, ...extra];
  const shapes = more => [B('A', 0, 0, 2, 1, { entries: { '1,1': 1, '2,1': 2 } }), arrow('out', { id: 'outer', as: 'tile' }), arrow('in', { id: 'inner', as: 'tile' }, { side: 'n' }), ...more];
  /* the boundary: the inner tile's filled size is exactly the outer pattern */
  const fits = make(snap(shapes([]), G2({ across: 2 })));
  assert.deepEqual(fits.spaces.top.arrows.map(a => a.node), ['repeat(repeat(v:A@0,0;2×1;2×1)@0,0;4×1;1×3)', 'repeat(v:A@0,0;2×1;2×1)']);
  /* one pattern more: it runs past, and neither has a matrix */
  const past = make(snap(shapes([]), G2({ across: 3 })));
  assert.deepEqual(past.spaces.top.tiles.map(t => [t.tile, t.node, t.error.code]), [['t:outer', null, 'no-source'], ['t:inner', null, 'no-source']]);
  assert.match(past.spaces.top.tiles[0].error.note, /^a tile in its pattern runs past the pattern/); assert.match(past.spaces.top.tiles[1].error.note, /^it runs past the pattern of the tile it is in/);
  assert.deepEqual(past.spaces.top.arrows.map(a => [a.node, a.error.code]), [[null, 'no-source'], [null, 'no-source']]);
  assert.match(past.spaces.top.arrows[0].error.note, /runs past the pattern/);
  /* a count that is a formula and has grown past the pattern (K is 3 wide) */
  const grew = make(snap(shapes([B('K', 20, 20, 3, 1)]), G2({ across: { expr: '@[K:x]' } })));
  assert.match(grew.spaces.top.arrows[1].error.note, /^it runs past the pattern of the tile it is in/);
  assert.equal(make(snap(shapes([B('K', 20, 20, 2, 1)]), G2({ across: { expr: '@[K:x]' } }))).spaces.top.arrows[0].node, 'repeat(repeat(v:A@0,0;2×1;2×1)@0,0;4×1;1×3)');
  /* two tiles that lie partly over each other, neither in the other: a third tile, over the outer tile's second cell */
  const third = { id: 'third', name: null, members: [3], groups: [], repeat: { x: 3, y: 1, cols: 2, rows: 1, across: 1, down: 1 } };
  const over = make(snap(shapes([B('C', 3, 1, 2, 1), arrow('c', { id: 'third', as: 'tile' })]), G2({ across: 2 }, [], [third])));
  assert.deepEqual(over.spaces.top.tiles.map(t => [t.tile, t.error && t.error.note.slice(0, 26)]), [['t:outer', 'it lies over another tile:'], ['t:inner', null], ['t:third', 'it lies over another tile:']]);      /* the inner tile is clear of it, and keeps its matrix */
  assert.deepEqual(over.spaces.top.arrows.map(a => a.node), [null, 'repeat(v:A@0,0;2×1;2×1)', null]);
  /* edge to edge it is clear, and all three have their matrices */
  const clear = make(snap(shapes([B('C', 4, 1, 2, 1), arrow('c', { id: 'third', as: 'tile' })]), G2({ across: 2 }, [], [{ ...third, repeat: { ...third.repeat, x: 4 } }])));
  assert.deepEqual(clear.spaces.top.tiles.map(t => !!t.node), [true, true, true]);
});
test('after review: a tile and a block that overlap are called that, and a tile nine deep is the one reason, said once', () => {
  const inner = { id: 'inner', name: 'Twice', members: [0], groups: [], repeat: { x: 0, y: 0, cols: 2, rows: 1, across: 2, down: 1 } };
  const g = make(snap([B('A', 0, 0, 2, 1), B('Under', 2, 0, 2, 1), arrow('out', { id: 'outer', as: 'tile' })], [{ id: 'outer', name: 'Rows', members: [1], repeat: { x: 0, y: 0, cols: 4, rows: 1, across: 1, down: 1 }, groups: [inner] }]));
  assert.deepEqual(g.spaces.top.arrows[0].error, { code: 'no-source', note: 'a tile and a block in its pattern overlap' });
  /* named in the reason, as on the page */
  const past = make(snap([B('A', 0, 0, 2, 1), arrow('out', { id: 'outer', as: 'tile' })], [{ id: 'outer', name: 'Rows', members: [], repeat: { x: 0, y: 0, cols: 3, rows: 1, across: 1, down: 1 }, groups: [inner] }]));
  assert.match(past.spaces.top.tiles[0].error.note, /^the tile Twice in its pattern runs past the pattern: /); assert.match(past.spaces.top.tiles[1].error.note, /^it runs past the pattern of the tile Rows: /);
  /* nine tiles, one inside the next, from a file */
  let nest = null; for (let k = 8; k >= 0; k--) nest = { id: 't' + k, name: null, members: k === 8 ? [0] : [], groups: nest ? [nest] : [], repeat: { x: 0, y: 0, cols: 1, rows: 1, across: 1, down: 1 } };
  const deep = make(snap([B('A', 0, 0, 1, 1), arrow('out', { id: 't0', as: 'tile' })], [nest]));
  assert.deepEqual(deep.spaces.top.tiles.map(t => t.tile), ['t:t0', 't:t1', 't:t2', 't:t3', 't:t4', 't:t5', 't:t6', 't:t7', 't:t8']);
  assert.equal(deep.spaces.top.tiles[8].error.note, 'it lies too deep: tiles lie one inside the next at most 8 deep');
  for (let k = 0; k < 8; k++) assert.equal(deep.spaces.top.tiles[k].error.note, 'a tile in its pattern has no matrix: it lies too deep: tiles lie one inside the next at most 8 deep');
  assert.equal(deep.spaces.top.arrows[0].error.note, 'a tile in its pattern has no matrix: it lies too deep: tiles lie one inside the next at most 8 deep');
});
test('after review: a count may read what comes of the tile it is in, a tile beside it or a tile in its pattern; only a real cycle is not settled', () => {
  const nest = (outer, inner, more = []) => [{ id: 'outer', name: null, members: [], repeat: { x: 0, y: 0, cols: 4, rows: 1, across: 1, down: 1, ...outer }, groups: [{ id: 'inner', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 2, rows: 1, across: 2, down: 1, ...inner } }, ...more] }];
  const shapes = [B('A', 0, 0, 2, 1), arrow('out', { id: 'outer', as: 'tile' }), B('SO', 6, 0, 4, 1, { seat: 'out' }), arrow('in', { id: 'inner', as: 'tile' }, { side: 'n' }), B('SI', 0, -4, 4, 1, { seat: 'in' }), B('Other', 20, 20, 2, 3)];
  const both = 'repeat(repeat(v:A@0,0;2×1;2×1)@0,0;4×1;1×1)';
  const up = make(snap(shapes, nest({}, { across: { expr: '@[SO:x] / 2' } })));      /* the inner tile's count reads what is seated on the outer tile's arrow: 4 / 2 */
  assert.deepEqual(up.spaces.top.tiles.map(t => t.node), [both, 'repeat(v:A@0,0;2×1;2×1)']);
  const down = make(snap(shapes, nest({ down: { expr: '@[SI:y] + 2' } }, {})));          /* the outer tile's count reads what is seated on the inner tile's arrow: 1 + 2 */
  assert.deepEqual(down.spaces.top.tiles.map(t => t.node), ['repeat(repeat(v:A@0,0;2×1;2×1)@0,0;4×1;1×3)', 'repeat(v:A@0,0;2×1;2×1)']);
  /* a tile beside it in the same pattern: the outer pattern 6 wide, a second inner tile whose count is the first one's matrix's height */
  const beside = { id: 'beside', name: null, members: [6], groups: [], repeat: { x: 4, y: 0, cols: 2, rows: 1, across: { expr: '@[SI:y]' }, down: 1 } };
  const sib = make(snap([...shapes, B('C', 4, 0, 2, 1)], nest({ cols: 6 }, {}, [beside])));
  assert.deepEqual(sib.spaces.top.tiles.map(t => [t.tile, !!t.node]), [['t:outer', true], ['t:inner', true], ['t:beside', true]]);
  /* a real cycle: each of the two reads what comes of the other */
  const round = make(snap(shapes, nest({ down: { expr: '@[SI:y]' } }, { across: { expr: '@[SO:y] + 1' } })));
  assert.deepEqual(round.spaces.top.tiles.map(t => t.error && t.error.code), ['size-unknown', 'size-unknown']);
  assert.deepEqual(round.spaces.top.arrows.map(a => a.error && a.error.code), ['size-unknown', 'size-unknown']);
  /* and its own, as before */
  const own = make(snap(shapes, nest({}, { across: { expr: '@[SI:x] / 2' } }))); assert.equal(own.spaces.top.tiles[1].error.code, 'size-unknown');
});

test('arrows and nested tiles: one in a tile that reads a tile in that tile\'s pattern is not repeated; one in the inner tile is repeated by the inner tile', () => {
  /* the outer pattern is 4 by 3: an inner tile (a 2 by 1 pattern, twice across) in its first row, and an arrow of the outer tile under the inner tile */
  const inside = make(snap([B('A', 0, 0, 2, 1, { entries: { '1,1': 1, '2,1': 2 } }), arrow('f', { id: 'inner', as: 'tile' }, { side: 's' })],
    [{ id: 'outer', name: null, members: [1], repeat: { x: 0, y: 0, cols: 4, rows: 3, across: 1, down: 1 }, groups: [{ id: 'inner', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 2, rows: 1, across: 2, down: 1 } }] }]));
  assert.deepEqual(inside.spaces.top.arrows, [{ arrow: 'f', node: 'repeat(v:A@0,0;2×1;2×1)', error: null }]);
  /* an arrow in the inner tile, under column 1 of a block outside both: repeated across by the inner tile's count */
  const mapped = make(snap([B('M', 0, 0, 4, 2, { entries: { '1,1': 1, '2,1': -2, '3,1': 3, '4,1': -4, '1,2': -5, '2,2': 6, '3,2': -7, '4,2': 8 } }), arrow('relu', { id: 'M', as: 'block' }, { side: 's', formula: 'max(x, 0)' }, { x: 0, y: 2 })],
    [{ id: 'outer', name: null, members: [], repeat: { x: 0, y: 2, cols: 4, rows: 2, across: 1, down: 1 }, groups: [{ id: 'inner', name: null, members: [1], groups: [], repeat: { x: 0, y: 2, cols: 1, rows: 2, across: 4, down: 1 } }] }]));
  assert.equal(mapped.nodes[mapped.spaces.top.arrows[0].node].op, 'mapalong'); assert.equal(mapped.nodes[mapped.spaces.top.arrows[0].node].count, 4);
});
test('the graph says an index matrix by rule, at any size: only the evaluator has a limit', () => {
  const g = make(snap([B('P', 0, 0, 100, 50, { inside: space([B('ix', -101, -25, 100, 50, { name: 'index.x', from: { id: 'P', index: 'x' }, standing: true })]) })],
    [{ id: 't1', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 100, rows: 50, across: 2, down: 1 } }]));
  assert.deepEqual(g.nodes['v:ix'], { op: 'variable', inputs: ['map(source(zeros;100×50);index.x)'], type: type(100, 50), name: 'index.x', named: true, defined: 'source', entries: {}, within: ['t:t1'] });
  assert.deepEqual(g.nodes['map(source(zeros;100×50);index.x)'], { op: 'map', inputs: ['source(zeros;100×50)'], type: type(100, 50), formula: 'index.x', within: ['t:t1'] });
  assert.equal(g.nodes['v:P'].defined, 'standing');
});
test('a single entry\'s side that has no root is an error, and a count that needs it is not settled', () => {
  const count = v => make(snap([B('Row', 0, 0, 2, 1), arrow('out', { id: 't1', as: 'tile' }), B('Tau', 9, 9, 1, 1, { entries: { '1,1': v } })], [tile({ cols: 2, across: { expr: '@[Tau:x]' }, down: 1 })]));
  assert.equal(count(9).spaces.top.tiles[0].node, 'repeat(v:Row@0,0;2×1;3×1)');
  for (const v of [-4, Infinity, { n: -2, k: 1 }, true]) assert.deepEqual(count(v).spaces.top.tiles[0].error, { code: 'size-unknown', note: '@[Tau:x]' }, String(v));
});
test('definitions nested a thousand deep: build returns, and says where it stopped reading', () => {
  let inner = null; for (let i = 1000; i >= 1; i--) inner = space([B('d' + i, 0, 0, 1, 1, { inside: inner })]);
  const g = build(snap([B('d0', 0, 0, 1, 1, { inside: inner })]));
  assert.deepEqual(validate(g), []);
  assert.equal(g.nodes['v:d0'].defined, 'definition'); assert.equal(g.nodes['v:d63'].defined, 'definition');
  assert.deepEqual(g.nodes['v:d64'].error, { code: 'no-source', note: 'its definition lies more than 64 definitions deep, and is not read' }); assert.equal(g.nodes['v:d65'], undefined);
  let fused = B('f1000', 0, 0, 1, 1); for (let i = 999; i >= 0; i--) fused = B('f' + i, 0, 0, 1, 1, { joined: [{ fx: 0, fy: 0, fw: 1, fh: 1, shape: fused }] });      /* and shapes fused of shapes fused */
  assert.deepEqual(validate(build(snap([fused]))), []);
  const row = Array.from({ length: 3000 }, (_, i) => B('m' + i, i, 0, 1, 2 - (i % 2) * 0, { cols: 2, rows: 2, x: i * 2 })); assert.deepEqual(validate(build(snap(row))), []);      /* and a row of three thousand */
});
test('a variable with an error keeps its entries, formulas and all', () => {
  const g = make(snap([B('Tau', 30, 30, 1, 1, { entries: { '1,1': 3 } }), B('K', 20, 0, 4, 6, { entries: { '1,1': { expr: '1+1' }, '2,1': 7, '3,1': { expr: '@[Tau:m] * 2' } }, inside: space([B('A', 0, 0, 5, 6)]) })]));
  assert.deepEqual(g.nodes['v:K'], { op: 'variable', inputs: ['measure(v:Tau;m)'], type: type(4, 6), name: 'K', named: true, defined: 'entries', entries: { '1,1': { expr: '1+1' }, '2,1': 7, '3,1': { expr: '$1 * 2' } }, error: { code: 'size', note: '5 × 6 ≠ 4 × 6' } });
  /* round a loop, a formula that names anything is what loops, or cannot be told from it: those are left out */
  const loop = make(snap([B('T', 0, 0, 2, 1, { entries: { '1,1': { expr: '@[S:m] + 1' }, '2,1': { expr: '2 * 3' } } }), B('S', 9, 0, 1, 1, { entries: { '1,1': { expr: '@[T]' } }, from: null, inside: space([B('t2', 0, 0, 1, 1, { name: 'x' }), B('t3', 1, 0, 1, 1, { name: 'S', variable: 9, reference: true })]), variable: 9 })]));
  assert.equal(loop.nodes['v:S'].error.code, 'loop');
});
test('sides that carry one name and are two lengths do not multiply', () => {
  const g = make(snap([B('A', 0, 0, 3, 2, { colsName: 'e' }), B('W', 3, 0, 4, 5, { rowsName: 'e' })]));
  assert.deepEqual(piece(g), { blocks: ['A', 'W'], rule: 'product', node: null, error: { code: 'mismatch', note: '3 ≠ 5' } });
  refused(g => { g.nodes['v:W'].type = type(4, 5, null, 'e'); g.nodes['v:A'].type = type(3, 2, 'e', null); g.nodes['matmul(v:A,v:W)'].type = type(4, 2); }, 'a product of 3 columns e and 5 rows e');
});
test('a function\'s input is in the graph only with its function', () => {
  for (const name of readdirSync(projects).filter(n => statSync(join(projects, n)).isDirectory())){ const g = build(read(tree(join(projects, name))));
    for (const [id, n] of Object.entries(g.nodes)) if (n.op === 'param') assert.ok(Object.values(g.functions).some(f => f.input === id), name + ' ' + id); }
  /* a space that comes to two pieces is no function: its input, and what is made of it there, are not in the graph */
  const g = make(snap([B('X', 0, 0, 4, 3), arrow('lin', { id: 'X', as: 'block' }, { span: 3 }, { inside: fnSpace(4, 3, B('Wf', -5, 0, 2, 4), B('Z', 20, 0, 2, 2)) })]));
  assert.deepEqual(g.functions, {}); assert.ok(!Object.values(g.nodes).some(n => n.op === 'param')); assert.equal(g.blocks.in, undefined);
  assert.deepEqual(g.spaces.top.arrows[0].error, { code: 'pieces', note: '2 pieces' });
  assert.deepEqual(g.spaces['f:lin'].pieces[0], { blocks: ['in', 'Wf'], rule: 'product', node: null, error: { code: 'mismatch', note: 'the function it is in comes to no one matrix' } });
  assert.equal(g.spaces['f:lin'].pieces[1].node, 'v:Z');
  assert.match(refused(h => { delete h.functions['f:lin']; h.spaces.top.arrows[0] = { arrow: 'lin', node: null, error: { code: 'pieces', note: '' } }; delete h.nodes['apply(v:X;f:lin)']; }, 'an input with no function').join(' '), /a function's input with no function/);
});
test('a block seated on an output of another size has the size error: the arrow has none', () => {
  const g = make(snap([B('V', 0, 0, 4, 3), arrow('f', { id: 'V', as: 'block' }, { span: 3 }), B('H', 9, 0, 2, 2, { seat: 'f' })]));
  assert.deepEqual(g.spaces.top.arrows[0], { arrow: 'f', node: 'v:V', error: null }); assert.deepEqual(g.nodes['v:H'].error, { code: 'size', note: '4 × 3 ≠ 2 × 2' });
});

/* ---- phase 7: noise and data files ---- */
test('phase 7: a noise block is a variable over a noise node keyed by its source block; a file source names its path', () => {
  const g = make(snap([B('N', 0, 0, 4, 4, { variable: 1, source: { noise: { seed: 5, dist: 'normal' } } }), B('Nref', 30, 30, 4, 4, { name: 'N', variable: 1, reference: true, source: { noise: { seed: 5, dist: 'normal' } } }),
    B('W', 10, 0, 2, 3, { source: { file: 'data/w.csv' } }), B('E', 20, 0, 2, 2, { source: { file: null } }), B('U', 40, 0, 1, 1, { source: { noise: {} } })]));
  const n = g.nodes['v:N']; assert.equal(n.defined, 'source'); assert.deepEqual(n.inputs, ['noise(5;normal;N;4×4)']);
  assert.deepEqual(g.nodes[n.inputs[0]], { op: 'noise', inputs: [], type: { cols: 4, rows: 4, colsName: null, rowsName: null }, seed: 5, dist: 'normal', key: 'N' });
  assert.equal(g.blocks.Nref, 'v:N');      /* every use of the variable is the one node: the same numbers */
  assert.deepEqual(g.nodes[g.nodes['v:W'].inputs[0]], { op: 'source', inputs: [], type: { cols: 2, rows: 3, colsName: null, rowsName: null }, kind: 'file', path: 'data/w.csv' });
  assert.deepEqual(g.nodes['v:E'].error, { code: 'no-source', note: 'no file has been chosen for it' });
  assert.deepEqual(g.nodes[g.nodes['v:U'].inputs[0]].seed, 0);
  /* moved, the graph is the same: the key is the block, never the place. Resized, the seed and the key stay */
  const moved = build(snap([B('N', 50, -7, 4, 4, { source: { noise: { seed: 5, dist: 'normal' } } })])), there = build(snap([B('N', 0, 0, 4, 4, { source: { noise: { seed: 5, dist: 'normal' } } })]));
  assert.equal(JSON.stringify(moved), JSON.stringify(there));
  const wider = build(snap([B('N', 0, 0, 9, 4, { source: { noise: { seed: 5, dist: 'normal' } } })])).nodes['noise(5;normal;N;9×4)'];
  assert.deepEqual([wider.seed, wider.dist, wider.key], [5, 'normal', 'N']);
});
test('phase 7: noise in a tile follows its cell, and is marked so', () => {
  const g = make(snap([B('N', 0, 0, 2, 1, { source: { noise: {} } })], [{ id: 't1', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 2, rows: 1, across: 3, down: 1 } }]));
  assert.deepEqual(g.nodes['v:N'].within, ['t:t1']); assert.deepEqual(g.nodes[g.nodes['v:N'].inputs[0]].within, ['t:t1']);
  assert.equal(g.spaces.top.tiles[0].node, 'repeat(v:N@0,0;2×1;3×1)');
});
test('phase 7: validate refuses a noise or a file source that is not in its stated form', () => {
  const noiseOf = g => first(g, 'noise'), fileOf = g => Object.values(g.nodes).find(n => n.op === 'source' && n.kind === 'file');
  refused(g => { noiseOf(g).seed = 1.5; }, 'a seed that is no whole number'); refused(g => { noiseOf(g).seed = '1'; }, 'a seed that is text'); refused(g => { delete noiseOf(g).seed; }, 'no seed');
  refused(g => { noiseOf(g).dist = 'cauchy'; }, 'a distribution there is none of'); refused(g => { noiseOf(g).key = ''; }, 'no key'); refused(g => { noiseOf(g).key = 7; }, 'a key that is no id');
  refused(g => { noiseOf(g).inputs = ['v:s']; }, 'noise with an input'); refused(g => { noiseOf(g).type.cols = 3; }, 'a variable over noise of another size');
  for (const path of ['../w.csv', 'data/../w.csv', '/etc/passwd', 'data/w.txt', 'data/a/b.csv', '', null, 7, 'data/w.csv\0']) refused(g => { fileOf(g).path = path; }, 'the path ' + path);
  refused(g => { delete fileOf(g).path; }, 'a file with no path'); refused(g => { first(g, 'source').kind = 'zeros'; first(g, 'source').path = 'data/w.csv'; delete first(g, 'source').path; first(g, 'source').path = 'x'; }, 'a path on what is no file');
  refused(g => { fileOf(g).kind = { file: 1 }; }, 'a kind that is no word');
});

test('a type holds its four fields, inner where it has inner axes, and no other key', () => {
  refused(h => { first(h, 'matmul').type = { cols: 4, rows: 2, colsName: null }; }, 'a type with one of its four fields gone');
  refused(h => { first(h, 'matmul').type.rowsName = 7; }, 'a side name that is no text');
  refused(h => { first(h, 'matmul').type.axes = [{ length: 4, name: null }]; }, 'a key a type has not got');
  for (const inner of [0, [], 'x', [{ length: 0, name: null }], [{ length: 2 }], [{ length: 2, name: '' }], [{ length: 2, name: null, more: 1 }], [2], Array.from({ length: 7 }, () => ({ length: 1, name: null }))])
    refused(h => { h.nodes['v:C'].type.inner = inner; }, 'inner that is ' + JSON.stringify(inner));
});

/* the same cases, with the same verdicts, are in backend/tests/test_check.py: "the bounds of a formula are graph.js's" */
export const FORMULA_BOUNDS = [[Array.from({ length: 5000 }, () => '1').join('+'), true], [Array.from({ length: 5000 }, () => '1').join('+') + '+', false], [Array.from({ length: 3334 }, () => '$1').join('+'), false],
  ['('.repeat(64) + '$1' + ')'.repeat(64), true], ['('.repeat(65) + '$1' + ')'.repeat(65), false], ['-'.repeat(64) + '1', true], ['-'.repeat(65) + '1', false], ['2' + '^2'.repeat(64), true], ['2' + '^2'.repeat(65), false],
  ['√'.repeat(64) + '4', true], ['√'.repeat(65) + '4', false], ['abs('.repeat(64) + '1' + ')'.repeat(64), true], ['abs('.repeat(65) + '1' + ')'.repeat(65), false], ['('.repeat(5000) + '1' + ')'.repeat(5000), false], ['1'.repeat(10000), true], ['1'.repeat(10001), false]];
test('after review (phase 7): a formula in a graph is bounded as the backend bounds it: 10,000 characters, 64 deep, and a long sum is read', () => {
  for (const [expr, ok] of FORMULA_BOUNDS){ const g = JSON.parse(JSON.stringify(good()));
    const v = Object.values(g.nodes).find(n => n.op === 'variable' && n.inputs.length && Object.values(n.entries).some(e => e && e.expr));
    for (const k of Object.keys(v.entries)) if (v.entries[k] && v.entries[k].expr) v.entries[k] = { expr };
    assert.equal(validate(g).length === 0, ok, expr.slice(0, 30) + '… (' + expr.length + ')'); }
});
