/* evaluate.js: a graph worked out exactly. The numbered cases are those of the graph design, in its order, with the
   three this program changed (5: a symbolic value; 7: nothing times an infinity is an error; 8: so is ∞ − ∞); after
   them one case for every other operation, the bindings, the limit, and the time a 64 by 64 product takes. */
import './solver.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, carry, MOST, tooLarge, toMap } from '../evaluate.js';
import { build, validate } from '../graph.js';
import { read } from '../project.js';
import { valueText } from '../algebra.js';

const t = (cols, rows, colsName = null, rowsName = null) => ({ cols, rows, colsName, rowsName });
/* a matrix given row by row: [[1, 2], [3, 4]]; null for an entry not given */
const rowsOf = rows => Object.fromEntries(rows.flatMap((row, r) => row.map((v, c) => [`${c + 1},${r + 1}`, v])).filter(([, v]) => v !== null));
const V = (rows, more = {}) => ({ op: 'variable', inputs: [], type: t(rows[0].length, rows.length), name: 'v', named: true, defined: 'entries', entries: rowsOf(rows), ...more });
/* a graph written by hand. tiles: [[tile id, the repeat that is its matrix]]: a repeat is always some tile's */
const G = (nodes, functions = {}, tiles = []) => { const g = { version: 1, nodes, functions, blocks: {},
    spaces: tiles.length ? { top: { owner: null, pieces: [], arrows: [], tiles: tiles.map(([tile, node]) => ({ tile, blocks: [], arrows: [], node, error: null })) } } : {} };
  assert.deepEqual(validate(g), []); return g; };
const N = (op, inputs, type, more = {}) => ({ op, inputs, type, ...more });
const worked = (g, id, options) => { const r = evaluate(g, id, options); assert.ok(r.entries, JSON.stringify(r)); assert.deepEqual(r.type, g.nodes[id].type); assert.deepEqual(JSON.parse(JSON.stringify(r)), r); return r.entries; };
const text = entries => Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, v && v.err ? '!' : valueText(v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v)]));
const product = (A, Bm) => G({ a: V(A), b: V(Bm), p: N('matmul', ['a', 'b'], t(Bm[0].length, A.length)) });

test('1: a 2 by 2 product with every entry given', () => {
  assert.deepEqual(worked(product([[1, 2], [3, 4]], [[5, 6], [7, 8]]), 'p'), rowsOf([[19, 22], [43, 50]]));
});
test('2: with one entry not given, exactly the entries that need it are unknown', () => {
  assert.deepEqual(worked(product([[1, null], [3, 4]], [[5, 6], [7, 8]]), 'p'), { '1,2': 43, '2,2': 50 });
  /* a known zero times an unknown is still unknown: the unknown could be an infinity */
  assert.deepEqual(worked(product([[0, null], [3, 4]], [[5, 6], [0, 0]]), 'p'), { '1,2': 15, '2,2': 18 });
  assert.deepEqual(worked(product([[1, 2], [3, 4]], [[5, null], [7, 8]]), 'p'), { '1,1': 19, '1,2': 43 });
});
test('3: a scalar 3 times a matrix', () => {
  const g = G({ s: V([[3]]), m: V([[1, 2], [3, null]]), p: N('scale', ['s', 'm'], t(2, 2)) });
  assert.deepEqual(worked(g, 'p'), { '1,1': 3, '2,1': 6, '1,2': 9 });
  assert.deepEqual(worked(G({ s: V([[null]]), m: V([[1, 2]]), p: N('scale', ['s', 'm'], t(2, 1)) }), 'p'), {});      /* an unknown scalar: every entry unknown */
});
test('4: a scalar √2 times whole numbers: entries in root form', () => {
  const g = G({ s: V([[{ n: 2, k: 1 }]]), m: V([[2, 3]]), p: N('scale', ['s', 'm'], t(2, 1)) });
  assert.deepEqual(worked(g, 'p'), { '1,1': { n: 8, k: 1 }, '2,1': { n: 18, k: 1 } });
});
test('5: a product whose sum adds √2 and 1 is the symbolic value 1+√2', () => {
  const e = worked(product([[{ n: 2, k: 1 }, 1]], [[1], [1]]), 'p');
  assert.equal(typeof e['1,1'].sym, 'string'); assert.deepEqual(text(e), { '1,1': '1+√2' });
});
test('6: a product with fractions: exact, in lowest terms', () => {
  assert.deepEqual(worked(product([[{ n: 1, d: 2, k: 0 }, { n: 1, d: 3, k: 0 }]], [[{ n: 1, d: 2, k: 0 }], [3]]), 'p'), { '1,1': { n: 5, d: 4, k: 0 } });
  assert.deepEqual(worked(product([[{ n: 1, d: 2, k: 0 }, { n: 1, d: 2, k: 0 }]], [[1], [1]]), 'p'), { '1,1': 1 });      /* and a whole number where it comes out as one */
});
test('7: -inf times 0 is an error, and times 2 is still -inf', () => {
  const g = G({ s: V([['-inf']]), m: V([[0, 2, -2]]), p: N('scale', ['s', 'm'], t(3, 1)) }), e = worked(g, 'p');
  assert.equal(typeof e['1,1'].err, 'string'); assert.equal(e['2,1'], '-inf'); assert.equal(e['3,1'], 'inf');
  assert.deepEqual(text(worked(product([['-inf', 1]], [[0], [5]]), 'p')), { '1,1': '!' });      /* the same inside a product's sum */
});
test('8: inf plus -inf is an error, for that entry only', () => {
  const g = G({ a: V([['inf', 'inf', 1]]), b: V([['-inf', 'inf', 2]]), s: N('add', ['a', 'b'], t(3, 1)) }), e = worked(g, 's');
  assert.equal(typeof e['1,1'].err, 'string'); assert.equal(e['2,1'], 'inf'); assert.equal(e['3,1'], 3);
});
test('9: a transpose of a 2 by 3 matrix', () => {
  const g = G({ a: V([[1, 2], [3, 4], [5, null]]), tr: N('transpose', ['a'], t(3, 2)) });
  assert.deepEqual(worked(g, 'tr'), { '1,1': 1, '2,1': 3, '3,1': 5, '1,2': 2, '2,2': 4 });
});
test('10: a block of two parts: each entry from the part that covers it', () => {
  const g = G({ a: V([[1, 2, 3]]), b: V([[4, 5, 6], [7, 8, 9]]), bl: N('block', ['a', 'b'], t(3, 3), { at: [{ col: 0, row: 0 }, { col: 0, row: 1 }] }) });
  assert.deepEqual(worked(g, 'bl'), rowsOf([[1, 2, 3], [4, 5, 6], [7, 8, 9]]));
});
test('11: a measure of a 4 by 6 matrix: its columns, then its rows', () => {
  const g = G({ a: { ...V([[0]]), type: t(4, 6), entries: {} }, x: N('measure', ['a'], t(1, 1), { side: 'x' }), y: N('measure', ['a'], t(1, 1), { side: 'y' }) });
  assert.deepEqual(worked(g, 'x'), { '1,1': 4 }); assert.deepEqual(worked(g, 'y'), { '1,1': 6 });
});
test('12: a measure of a scalar: the root of its mass for a side, the mass itself for m', () => {
  const of = v => G({ s: V([[v]]), x: N('measure', ['s'], t(1, 1), { side: 'x' }), m: N('measure', ['s'], t(1, 1), { side: 'm' }) });
  assert.deepEqual(worked(of(9), 'x'), { '1,1': 3 }); assert.deepEqual(worked(of(2), 'x'), { '1,1': { n: 2, k: 1 } });
  assert.deepEqual(worked(of(9), 'm'), { '1,1': 9 }); assert.deepEqual(worked(of(null), 'x'), {}); assert.deepEqual(worked(of(null), 'm'), {});
});
test('13: a node above a variable with an error gives that error, naming the variable', () => {
  const g = G({ a: V([[1, 2]], { error: { code: 'size', note: '5 × 6 ≠ 4 × 6' } }), b: V([[1], [1]]), p: N('matmul', ['a', 'b'], t(1, 1)), q: N('transpose', ['p'], t(1, 1)), fine: N('transpose', ['b'], t(2, 1)) });
  assert.deepEqual(evaluate(g, 'q'), { error: { code: 'size', note: '5 × 6 ≠ 4 × 6', node: 'a' } });
  assert.deepEqual(evaluate(g, 'a'), { error: { code: 'size', note: '5 × 6 ≠ 4 × 6', node: 'a' } });
  assert.deepEqual(worked(g, 'fine'), { '1,1': 1, '2,1': 1 });      /* every other result still shows */
});
test('14: a node with more entries than maxEntries is deferred, at once', () => {
  const g = G({ big: { ...V([[1]]), type: t(100, 100) }, small: V([[1]]) }), before = performance.now();
  assert.deepEqual(evaluate(g, 'big'), { type: t(100, 100), deferred: true });
  assert.ok(performance.now() - before < 50);
  assert.equal(MOST, 4096);
  const edge = G({ at: { ...V([[1]]), type: t(64, 64) }, over: { ...V([[1]]), type: t(4097, 1) } });      /* exactly the limit is worked out */
  assert.ok(evaluate(edge, 'at').entries); assert.equal(evaluate(edge, 'over').deferred, true);
  assert.ok(evaluate(edge, 'over', { maxEntries: 4097 }).entries); assert.equal(evaluate(edge, 'at', { maxEntries: 10 }).deferred, true);
  assert.match(tooLarge(t(4097, 1)), /^it has 4097 × 1 entries, more than the 4096 that are worked out here: its size is shown/);
  assert.match(tooLarge(t(2, 2)), /worked out from more than the 4096/);
});
test('14b: the limit covers everything a result is worked out from', () => {
  const g = G({ wide: { ...V([[1]]), type: t(5000, 1) }, tall: { ...V([[1]]), type: t(1, 5000) }, p: N('matmul', ['wide', 'tall'], t(1, 1)), w: N('measure', ['wide'], t(1, 1), { side: 'x' }) });
  assert.deepEqual(evaluate(g, 'p'), { type: t(1, 1), deferred: true });      /* a small result of two large matrices */
  assert.deepEqual(worked(g, 'w'), { '1,1': 5000 });      /* a width is read off the type: it does not wait on the matrix */
});
test('15: a variable with a definition has the definition\'s value, and its own entries are not used', () => {
  const g = G({ a: V([[1, 2]]), k: V([[9, 9]], { inputs: ['a'], defined: 'definition' }) });
  assert.deepEqual(worked(g, 'k'), { '1,1': 1, '2,1': 2 });
});

/* ---- the other operations ---- */
test('add: entry by entry, any number of them, and unknown where a term is', () => {
  const g = G({ a: V([[1, 2], [3, null]]), b: V([[10, 20], [30, 40]]), c: V([[100, { n: 1, d: 2, k: 0 }], [0, 0]]), s: N('add', ['a', 'b', 'c'], t(2, 2)) });
  assert.deepEqual(worked(g, 's'), { '1,1': 111, '2,1': { n: 45, d: 2, k: 0 }, '1,2': 33 });
});
test('ewise: times and over, with each broadcast, and a division by zero that is one entry\'s error', () => {
  const A = V([[2, 4], [6, 8]]);
  assert.deepEqual(worked(G({ a: A, b: V([[1, 2], [3, 4]]), e: N('ewise', ['a', 'b'], t(2, 2), { fn: 'mul', broadcast: 'none' }) }), 'e'), rowsOf([[2, 8], [18, 32]]));
  const over = worked(G({ a: A, b: V([[2, 0], [4, 16]]), e: N('ewise', ['a', 'b'], t(2, 2), { fn: 'div', broadcast: 'none' }) }), 'e');
  assert.deepEqual(text(over), { '1,1': '1', '2,1': '!', '1,2': '3/2', '2,2': '1/2' }); assert.equal(over['2,1'].err, 'divide by zero');
  assert.deepEqual(worked(G({ a: A, r: V([[10, 100]]), e: N('ewise', ['a', 'r'], t(2, 2), { fn: 'mul', broadcast: 'row' }) }), 'e'), rowsOf([[20, 400], [60, 800]]));
  assert.deepEqual(worked(G({ a: A, c: V([[10], [100]]), e: N('ewise', ['a', 'c'], t(2, 2), { fn: 'mul', broadcast: 'col' }) }), 'e'), rowsOf([[20, 40], [600, 800]]));
  assert.deepEqual(text(worked(G({ s: V([[1]]), a: A, e: N('ewise', ['s', 'a'], t(2, 2), { fn: 'div', broadcast: 'scalar' }) }), 'e')), { '1,1': '1/2', '2,1': '1/4', '1,2': '1/6', '2,2': '1/8' });      /* a scalar holding 1 over A: the reciprocal of every entry */
});
test('slice: a range of its input', () => {
  const g = G({ a: V([[1, 2, 3, 4], [5, 6, null, 8]]), s: N('slice', ['a'], t(2, 2), { range: { col: 2, row: 0, cols: 2, rows: 2 } }) });
  assert.deepEqual(worked(g, 's'), { '1,1': 3, '2,1': 4, '2,2': 8 });
});
test('source: zeros, ones and an identity that need not be square; and M times the identity is M', () => {
  const src = (kind, cols, rows) => worked(G({ s: N('source', [], t(cols, rows), { kind }) }), 's');
  assert.deepEqual(src('zeros', 2, 1), { '1,1': 0, '2,1': 0 }); assert.deepEqual(src('ones', 1, 2), { '1,1': 1, '1,2': 1 });
  assert.deepEqual(src('identity', 3, 2), rowsOf([[1, 0, 0], [0, 1, 0]]));
  const g = G({ m: V([[1, 2], [3, 4]]), i: N('source', [], t(2, 2), { kind: 'identity' }), p: N('matmul', ['m', 'i'], t(2, 2)) });
  assert.deepEqual(worked(g, 'p'), rowsOf([[1, 2], [3, 4]]));
});
test('measure of an attribute: its formula, with $1 and on for the inputs after the first', () => {
  const g = G({ k: { ...V([[0]]), type: t(4, 3), entries: {} }, tau: V([[3]]), m: N('measure', ['tau'], t(1, 1), { side: 'm' }), x: N('measure', ['k'], t(1, 1), { side: 'x' }),
    heads: N('measure', ['k', 'm', 'x'], t(1, 1), { side: 'a', name: 'heads', formula: '2^(3) + $1 * $2' }), none: N('measure', ['k'], t(1, 1), { side: 'a', name: 'none', formula: '' }) });
  assert.deepEqual(worked(g, 'heads'), { '1,1': 20 }); assert.deepEqual(worked(g, 'none'), {});
});
test('a variable\'s formulas: $n is an input, and what could not be bound is the error it says', () => {
  const g = G({ k: { ...V([[0]]), type: t(4, 3), entries: {} }, x: N('measure', ['k'], t(1, 1), { side: 'x' }), tau: V([[null]]), m: N('measure', ['tau'], t(1, 1), { side: 'm' }),
    w: { ...V([[0, 0, 0], [0, 0, 0]]), inputs: ['x', 'm'], entries: { '1,1': { expr: '1/√($1)' }, '2,1': { expr: '$2 * 2' }, '3,1': { err: 'missing variable' }, '1,2': { expr: 'select(2 > 3, 1/0, 5)' }, '2,2': { expr: '1/0' } } } });
  const e = worked(g, 'w');
  assert.deepEqual(text(e), { '1,1': '1/2', '3,1': '!', '1,2': '5', '2,2': '!' });      /* an unset mass leaves its entry a symbol, not 0 */
  assert.equal(e['3,1'].err, 'missing variable'); assert.equal(e['2,2'].err, 'divide by zero');
  const sym = worked(G({ w: V([[{ expr: 'exp(2) + 1' }, { expr: 'index.x' }]]) }), 'w');
  assert.equal(valueText(sym['1,1']), '1+exp(2)'); assert.equal(sym['2,1'].err, 'not in a tile: there is no index');
});
test('map: an entry formula at every entry, with x, i, j and what it names', () => {
  const x = V([[2, -5], [null, 7]]);
  assert.deepEqual(worked(G({ x, m: N('map', ['x'], t(2, 2), { formula: 'max(x, 0)' }) }), 'm'), { '1,1': 2, '2,1': 0, '2,2': 7 });
  const sq = V([[11, 12, 13], [21, 22, 23], [31, 32, 33]]);
  assert.deepEqual(worked(G({ x: sq, m: N('map', ['x'], t(3, 3), { formula: 'select(i > j, -inf, x)' }) }), 'm'), rowsOf([[11, '-inf', '-inf'], [21, 22, '-inf'], [31, 32, 33]]));
  const g = G({ x, b: V([[0, 0], [9, 9]]), s: V([[10]]), m: N('map', ['x', 'b', 's'], t(2, 2), { formula: 'max(x, $1) * $2 + i' }) });      /* a matrix the size of the output is its entry at this place; a single entry is that number */
  assert.deepEqual(worked(g, 'm'), { '1,1': 21, '2,1': 2, '2,2': 92 });
  const odd = { version: 1, nodes: { x, m: N('map', ['x'], t(2, 2), { formula: 'x + w' }) }, functions: {}, spaces: {}, blocks: {} };      /* validate refuses a name that is no input; worked out all the same, it is an error and nothing worse */
  assert.ok(validate(odd).length > 0); assert.equal(evaluate(odd, 'm').entries['1,1'].err, 'unknown name: w');
  assert.deepEqual(worked(G({ x, m: N('map', ['x'], t(2, 2), { formula: 'i == j' }) }), 'm'), rowsOf([[true, false], [false, true]]));
  const ix = G({ x, m: N('map', ['x'], t(2, 2), { formula: 'index.x + 10 * index.y' }) });      /* the index is the output's place in the cell it is worked out for */
  assert.deepEqual(worked(ix, 'm', { binding: { cells: [{ x: 3, y: 1 }] } }), rowsOf([[24, 25], [34, 35]])); assert.equal(worked(ix, 'm')['1,1'].err, 'not in a tile: there is no index');
});
const fn = () => ({ 'p': N('param', [], t(2, 1), { within: ['f:lin'] }), w: V([[2], [3]]), body: N('matmul', ['p', 'w'], t(1, 1), { within: ['f:lin'] }) });
test('apply and param: one function applied to two inputs gives two values', () => {
  const g = G({ ...fn(), a: V([[1, 1]]), b: V([[10, 100]]), fa: N('apply', ['a'], t(1, 1), { fn: 'f:lin' }), fb: N('apply', ['b'], t(1, 1), { fn: 'f:lin' }) }, { 'f:lin': { input: 'p', body: 'body' } });
  assert.deepEqual(worked(g, 'fa'), { '1,1': 5 }); assert.deepEqual(worked(g, 'fb'), { '1,1': 320 });
  assert.deepEqual(worked(g, 'fa'), { '1,1': 5 });      /* and the first is still the first: remembered under what it was applied to */
  assert.deepEqual(worked(g, 'body'), {});      /* a body asked for with nothing given: its input has no value of its own */
  assert.deepEqual(worked(g, 'p'), {});
  assert.deepEqual(worked(g, 'body', { binding: { params: { 'f:lin': 'b' } } }), { '1,1': 320 });      /* looked at from inside: the input is given a node */
  assert.deepEqual(worked(g, 'p', { binding: { params: { 'f:lin': 'a' } } }), { '1,1': 1, '2,1': 1 });
  assert.deepEqual(worked(g, 'body', { binding: { params: { 'f:lin': { of: 'b', range: { col: 0, row: 0, cols: 2, rows: 1 } } } } }), { '1,1': 320 });
  assert.deepEqual(worked(g, 'body', { binding: { params: { 'f:lin': 'a' } } }), { '1,1': 5 });
});
test('a function applied inside a function: each keeps its own input', () => {
  const g = G({ p: N('param', [], t(1, 1), { within: ['f:double'] }), two: V([[2]]), twice: N('scale', ['two', 'p'], t(1, 1), { within: ['f:double'] }),
    q: N('param', [], t(1, 1), { within: ['f:quad'] }), once: N('apply', ['q'], t(1, 1), { fn: 'f:double', within: ['f:quad'] }), again: N('apply', ['once'], t(1, 1), { fn: 'f:double', within: ['f:quad'] }),
    x: V([[5]]), y: V([[7]]), fx: N('apply', ['x'], t(1, 1), { fn: 'f:quad' }), fy: N('apply', ['y'], t(1, 1), { fn: 'f:quad' }) },
    { 'f:double': { input: 'p', body: 'twice' }, 'f:quad': { input: 'q', body: 'again' } });
  assert.deepEqual(worked(g, 'fx'), { '1,1': 20 }); assert.deepEqual(worked(g, 'fy'), { '1,1': 28 });
});
test('repeat: a tile\'s matrix; a block that reads the index differs from cell to cell', () => {
  const row = G({ r: V([[1, 2, 3, 4]]), tile: N('repeat', ['r'], t(4, 3), { at: [{ col: 0, row: 0 }], pattern: { cols: 4, rows: 1 }, across: 1, down: 3 }) }, {}, [['t:g', 'tile']]);
  assert.deepEqual(worked(row, 'tile'), rowsOf([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]]));
  const p = { ...V([[{ expr: 'index.x + index.y' }]]), within: ['t:g'] };
  const g = G({ p, tile: N('repeat', ['p'], t(2, 2), { at: [{ col: 0, row: 0 }], pattern: { cols: 1, rows: 1 }, across: 2, down: 2 }) }, {}, [['t:g', 'tile']]);
  assert.deepEqual(worked(g, 'tile'), rowsOf([[2, 3], [3, 4]]));
  /* a block set in from the pattern's corner, beside one that reads nothing */
  const wide = G({ q: V([[0]]), p: { ...V([[{ expr: 'index.x + index.y' }, { expr: '10 * index.x + index.y' }]]), within: ['t:g'] },
    tile: N('repeat', ['q', 'p'], t(6, 2), { at: [{ col: 0, row: 0 }, { col: 1, row: 0 }], pattern: { cols: 3, rows: 1 }, across: 2, down: 2 }) }, {}, [['t:g', 'tile']]);
  assert.deepEqual(worked(wide, 'tile'), rowsOf([[0, 3, 31, 0, 6, 61], [0, 4, 32, 0, 7, 62]]));
  assert.deepEqual(worked(wide, 'p', { binding: { cells: [{ x: 4, y: 1 }] } }), { '1,1': 7, '2,1': 62 });      /* one cell, looked at on its own */
  assert.equal(worked(wide, 'p')['1,1'].err, 'not in a tile: there is no index');
});
test('a tile past the limit is deferred at once: no cell is worked out, however many there are', () => {
  const tile = (across, down) => G({ r: V([[7]]), tile: N('repeat', ['r'], t(across, down), { at: [{ col: 0, row: 0 }], pattern: { cols: 1, rows: 1 }, across, down }) }, {}, [['t:g', 'tile']]);
  assert.equal(Object.keys(worked(tile(64, 64), 'tile')).length, 4096);      /* exactly the limit */
  assert.deepEqual(evaluate(tile(4097, 1), 'tile'), { type: t(4097, 1), deferred: true });
  const before = performance.now(); assert.equal(evaluate(tile(1e9, 1e9), 'tile').deferred, true); assert.ok(performance.now() - before < 50);
});
test('the index goes through a transpose and through the parts of a block to where the entry stands', () => {
  const p = { ...V([[{ expr: 'index.x' }], [{ expr: 'index.x' }]]), within: ['t:g'] };      /* one column, two rows */
  const g = G({ p, tr: N('transpose', ['p'], t(2, 1), { within: ['t:g'] }), tile: N('repeat', ['tr'], t(4, 1), { at: [{ col: 0, row: 0 }], pattern: { cols: 2, rows: 1 }, across: 2, down: 1 }) }, {}, [['t:g', 'tile']]);
  assert.deepEqual(worked(g, 'tile'), rowsOf([[1, 2, 3, 4]]));      /* turned, its two entries lie in columns 1 and 2 */
  const q = { ...V([[{ expr: 'index.x * 10 + index.y' }]]), within: ['t:g'] };
  const b = G({ q, a: V([[0]]), bl: N('block', ['a', 'q'], t(2, 1), { at: [{ col: 0, row: 0 }, { col: 1, row: 0 }], within: ['t:g'] }), own: { ...V([[0, 0]]), inputs: ['bl'], defined: 'standing', within: ['t:g'] },
    tile: N('repeat', ['own'], t(2, 2), { at: [{ col: 0, row: 0 }], pattern: { cols: 2, rows: 1 }, across: 1, down: 2 }) }, {}, [['t:g', 'tile']]);
  assert.deepEqual(worked(b, 'tile'), rowsOf([[0, 21], [0, 22]]));
});
test('a tile inside a tile: the bindings compose, and the index is the innermost cell\'s', () => {
  /* the outer pattern is 3 wide: an inner tile (a 1 by 1 pattern, twice across) and, beside it, a block of the outer tile alone */
  const g = G({ p: { ...V([[{ expr: 'index.x' }]]), within: ['t:outer', 't:inner'] }, q: { ...V([[{ expr: '100 * index.x + index.y' }]]), within: ['t:outer'] },
    inner: N('repeat', ['p'], t(2, 1), { at: [{ col: 0, row: 0 }], pattern: { cols: 1, rows: 1 }, across: 2, down: 1, within: ['t:outer'] }),
    outer: N('repeat', ['inner', 'q'], t(6, 2), { at: [{ col: 0, row: 0 }, { col: 2, row: 0 }], pattern: { cols: 3, rows: 1 }, across: 2, down: 2 }) }, {}, [['t:outer', 'outer'], ['t:inner', 'inner']]);
  assert.deepEqual(worked(g, 'outer'), rowsOf([[1, 2, 301, 1, 2, 601], [1, 2, 302, 1, 2, 602]]));      /* p reads the inner tile's cell, q the outer's */
  /* p has a value for each (outer cell, inner cell): asked for under a chain, it is that chain's, however the outer cell differs */
  assert.deepEqual(worked(g, 'p', { binding: { cells: [{ x: 3, y: 1 }, { x: 1, y: 0 }] } }), { '1,1': 2 });
  assert.deepEqual(worked(g, 'p', { binding: { cells: [{ x: 0, y: 0 }, { x: 7, y: 0 }] } }), { '1,1': 8 });
  assert.deepEqual(worked(g, 'p', { binding: { cells: [{ x: 3, y: 1 }] } }), { '1,1': 4 });
  assert.deepEqual(worked(g, 'inner', { binding: { cells: [{ x: 3, y: 1 }] } }), { '1,1': 1, '2,1': 2 });
  /* and inside a function as well: a tile in a function's body, the function applied to two inputs */
  const f = G({ in: N('param', [], t(1, 1), { within: ['f:f'] }), cellv: { ...V([[{ expr: 'index.x * $1' }]]), inputs: ['m'], within: ['f:f', 't:inner'] }, m: N('measure', ['in'], t(1, 1), { side: 'm', within: ['f:f'] }),
    body: N('repeat', ['cellv'], t(3, 1), { at: [{ col: 0, row: 0 }], pattern: { cols: 1, rows: 1 }, across: 3, down: 1, within: ['f:f'] }),
    a: V([[1]]), b: V([[10]]), fa: N('apply', ['a'], t(3, 1), { fn: 'f:f' }), fb: N('apply', ['b'], t(3, 1), { fn: 'f:f' }) }, { 'f:f': { input: 'in', body: 'body' } }, [['t:inner', 'body']]);
  assert.deepEqual(worked(f, 'fa'), rowsOf([[1, 2, 3]])); assert.deepEqual(worked(f, 'fb'), rowsOf([[10, 20, 30]]));
});
test('mapalong: a formula or a function applied to each run, the outputs set side by side', () => {
  const m = V([[1, -2, 3, -4], [-5, 6, -7, 8]]);
  const g = G({ m, out: N('mapalong', ['m'], t(4, 2), { formula: 'max(x, 0)', axis: 'cols', start: 1, span: 1, count: 4 }) });
  assert.deepEqual(worked(g, 'out'), rowsOf([[1, 0, 3, 0], [0, 6, 0, 8]]));
  const part = G({ m, out: N('mapalong', ['m'], t(2, 2), { formula: 'x * 10 + i', axis: 'cols', start: 2, span: 1, count: 2 }) });      /* i and j are counted within each run */
  assert.deepEqual(worked(part, 'out'), rowsOf([[-19, 31], [61, -69]]));
  const down = G({ m, out: N('mapalong', ['m'], t(4, 2), { formula: 'x + j', axis: 'rows', start: 1, span: 1, count: 2 }) });
  assert.deepEqual(worked(down, 'out'), rowsOf([[2, -1, 4, -3], [-4, 7, -6, 9]]));
  const ix = G({ m, out: N('mapalong', ['m'], t(4, 2), { formula: 'index.x', axis: 'cols', start: 1, span: 1, count: 4, at: { col: 0, row: 0 } }) });      /* the cell being worked out */
  assert.deepEqual(worked(ix, 'out'), rowsOf([[1, 2, 3, 4], [1, 2, 3, 4]]));
  /* a function over each column: its two entries times (2, 3), a single entry each */
  const f = G({ ...fn(), mt: V([[1, 10, 100], [1, 100, 1000]]), row: N('mapalong', ['mt2'], t(3, 1), { fn: 'f:lin', axis: 'cols', start: 1, span: 2, count: 3 }), mt2: V([[1, 1, 10, 100, 0, 1]]) }, { 'f:lin': { input: 'p', body: 'body' } });
  assert.deepEqual(worked(f, 'row'), { '1,1': 5, '2,1': 320, '3,1': 3 });
});

/* ---- how it answers ---- */
test('it never throws: a node the graph has not got, a graph that is not one, a function inside itself', () => {
  const g = G({ a: V([[1]]) });
  assert.deepEqual(evaluate(g, 'nothing'), { error: { code: 'no-source', note: 'no such node', node: 'nothing' } });
  assert.equal(evaluate(null, 'a').error.code, 'no-source'); assert.equal(evaluate({}, 'a').error.code, 'no-source'); assert.equal(evaluate(g, undefined).error.code, 'no-source');
  /* validate refuses this graph; the evaluator still finishes on it */
  const loop = { version: 1, nodes: { p: N('param', [], t(1, 1), { within: ['f:f'] }), again: N('apply', ['p'], t(1, 1), { fn: 'f:f', within: ['f:f'] }), a: V([[1]]), fa: N('apply', ['a'], t(1, 1), { fn: 'f:f' }) }, functions: { 'f:f': { input: 'p', body: 'again' } }, spaces: {}, blocks: {} };
  assert.ok(validate(loop).length > 0); assert.equal(evaluate(loop, 'fa').error.code, 'loop');
  const ring = { version: 1, nodes: { a: N('transpose', ['b'], t(1, 1)), b: N('transpose', ['a'], t(1, 1)) }, functions: {}, spaces: {}, blocks: {} };
  assert.equal(evaluate(ring, 'a').error.code, 'loop');
});
test('results are remembered for one graph, and a new graph starts clean', () => {
  const g = product([[1, 2], [3, 4]], [[5, 6], [7, 8]]), first = evaluate(g, 'p');
  assert.equal(evaluate(g, 'p'), first);       /* the very same answer */
  const other = product([[1, 2], [3, 4]], [[5, 6], [7, 9]]);
  assert.deepEqual(evaluate(other, 'p').entries, rowsOf([[19, 24], [43, 54]]));
  assert.deepEqual(evaluate(JSON.parse(JSON.stringify(g)), 'p'), first);
});
test('toMap gives the entries as the page keeps them', () => {
  const m = toMap({ '1,1': 'inf', '2,1': '-inf', '1,2': 7, '2,2': { n: 2, k: 1 } });
  assert.equal(m.get('1,1'), Infinity); assert.equal(m.get('2,1'), -Infinity); assert.equal(m.get('1,2'), 7); assert.deepEqual(m.get('2,2'), { n: 2, k: 1 }); assert.equal(toMap(undefined).size, 0);
});
test('timing: a 64 by 64 product of whole numbers in under one second, and it is right', () => {
  const n = 64, A = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => ((r * 31 + c * 17) % 23) - 11)), Bm = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => ((r * 7 + c * 13) % 19) - 9));
  const g = product(A, Bm), before = performance.now(), e = evaluate(g, 'p').entries, took = performance.now() - before;
  assert.ok(took < 1000, `took ${took} ms`);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++){ let sum = 0; for (let k = 0; k < n; k++) sum += A[r][k] * Bm[k][c]; assert.equal(e[`${c + 1},${r + 1}`], sum); }
});

/* ---- from a snapshot, through build ---- */
const B = (id, x, y, cols, rows, more = {}) => ({ id, type: 'tensor', name: id, x, y, cols, rows, colsName: null, rowsName: null, entries: {}, inside: null, variable: null, ...more });
const snap = (shapes, groups = []) => ({ top: { shapes, groups, operations: [] } });
const arrow = (id, input, more = {}, shapeMore = {}) => B(id, 0, 0, 1, 1, { type: 'arrow', name: 'Shape 9', arrow: { input, side: 'e', start: 1, span: 1, gap: 2, gapName: null, output: null, formula: null, ...more }, ...shapeMore });
const out = (g, i = 0) => worked(g, g.spaces.top.arrows[i].node);
test('a 2 by 2 holding 1, 2, 3, 4 times a 2 by 2 identity source is 1, 2, 3, 4', () => {
  const g = build(snap([B('M', 0, 0, 2, 2, { entries: rowsOf([[1, 2], [3, 4]]) }), B('I', 2, 0, 2, 2, { source: 'identity' })]));
  assert.deepEqual(worked(g, g.spaces.top.pieces[0].node), rowsOf([[1, 2], [3, 4]]));
});
test('a variable defined in terms of itself has an error, and every other result is still worked out', () => {
  const g = build(snap([B('K', 0, 0, 1, 1, { variable: 1, inside: { shapes: [B('k2', 0, 0, 1, 1, { name: 'K', variable: 1, reference: true }), B('two', 1, 0, 1, 1, { entries: { '1,1': 2 } })], groups: [], operations: [] } }),
    B('A', 9, 0, 1, 2, { entries: rowsOf([[1], [2]]) }), B('C', 9, 2, 1, 2, { entries: rowsOf([[10], [20]]) }), B('uses', 20, 0, 1, 1, { entries: { '1,1': { expr: '@[K:m] + 1' } } })]));
  assert.deepEqual(evaluate(g, 'v:K'), { error: { code: 'loop', note: '', node: 'v:K' } });
  assert.deepEqual(evaluate(g, 'v:uses'), { error: { code: 'loop', note: '', node: 'v:K' } });      /* what reads it has no value either */
  assert.deepEqual(worked(g, 'add(v:A,v:C)'), rowsOf([[11], [22]]));
});
test('arrows, as the page draws them: pass through, a formula, a seat in a product, a definition space', () => {
  const g = build(snap([B('Keys', 0, 0, 2, 2, { entries: rowsOf([[11, 12], [21, 22]]) }), arrow('f', { id: 'Keys', as: 'block' }, { span: 2 }), B('H', 4, 0, 2, 2, { seat: 'f' }), B('W', 6, 0, 1, 2, { entries: rowsOf([[1], [1]]) }),
    arrow('relu', { id: 'W', as: 'result' }, { span: 2, formula: 'max(x, 30)' })]));
  assert.deepEqual(out(g, 0), rowsOf([[11, 12], [21, 22]])); assert.deepEqual(worked(g, 'v:H'), rowsOf([[11, 12], [21, 22]]));
  assert.deepEqual(worked(g, 'matmul(v:H,v:W)'), rowsOf([[23], [43]])); assert.deepEqual(out(g, 1), rowsOf([[30], [43]]));      /* an arrow reading a product reads its numbers */
  const lin = build(snap([B('X', 0, 0, 2, 1, { entries: rowsOf([[1, 2]]) }), arrow('lin', { id: 'X', as: 'block' }, {}, { variable: 7, name: 'linear', inside: { shapes: [B('in', -9, 0, 2, 1, { in: true }), B('Wf', -7, 0, 1, 2, { entries: rowsOf([[3], [4]]) })], groups: [], operations: [] } }),
    B('Y', 0, 9, 2, 1, { entries: rowsOf([[10, 0]]) }), arrow('use', { id: 'Y', as: 'block' }, {}, { variable: 7, name: 'linear', reference: true })]));
  assert.deepEqual(out(lin, 0), { '1,1': 11 }); assert.deepEqual(out(lin, 1), { '1,1': 30 });      /* one function, two inputs, two values */
});
test('tiles, as the page draws them: a row repeated down, a block reading its index, a formula mapped along columns', () => {
  const g = build(snap([B('Row', 0, 0, 4, 1, { entries: rowsOf([[1, 2, 3, 4]]) }), arrow('out', { id: 't1', as: 'tile' })], [{ id: 't1', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 4, rows: 1, across: 1, down: 3 } }]));
  assert.deepEqual(out(g), rowsOf([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]]));
  const ix = build(snap([B('P', 0, 0, 1, 1, { entries: { '1,1': { expr: 'index.x + index.y' } } }), arrow('out', { id: 't1', as: 'tile' })], [{ id: 't1', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 1, rows: 1, across: 2, down: 2 } }]));
  assert.deepEqual(out(ix), rowsOf([[2, 3], [3, 4]]));
  assert.deepEqual(worked(ix, 'v:P', { binding: { cells: [{ x: 1, y: 1 }] } }), { '1,1': 4 });      /* the last drawn copy */
  const m = build(snap([B('M', 0, 0, 4, 2, { entries: rowsOf([[1, -2, 3, -4], [-5, 6, -7, 8]]) }), arrow('f', { id: 'M', as: 'block' }, { side: 's', formula: 'max(x, 0)' }, { x: 0, y: 2 })],
    [{ id: 't1', name: null, members: [1], groups: [], repeat: { x: 0, y: 2, cols: 1, rows: 2, across: 4, down: 1 } }]));
  assert.deepEqual(out(m), rowsOf([[1, 0, 3, 0], [0, 6, 0, 8]]));
});
test('every project that comes with the repository: every node is answered, and none throws', () => {
  const tree = (dir, at = '') => readdirSync(join(dir, at)).flatMap(n => statSync(join(dir, at, n)).isDirectory() ? tree(dir, at + n + '/') : [{ path: at + n, text: readFileSync(join(dir, at, n), 'utf8') }]);
  const projects = join(dirname(fileURLToPath(import.meta.url)), '..', 'projects');
  for (const name of readdirSync(projects).filter(n => statSync(join(projects, n)).isDirectory())){ const g = build(read(tree(join(projects, name))));
    for (const id of Object.keys(g.nodes)){ const r = evaluate(g, id); assert.ok(r.entries || r.deferred || r.error, name + ' ' + id); assert.deepEqual(JSON.parse(JSON.stringify(r)), r); } }
});

/* ---- after review ---- */
const tileOf = (repeat, members, shapes) => snap(shapes, [{ id: 't1', name: null, members, groups: [], repeat }]);

const make = s => { const g = build(s); assert.deepEqual(validate(g), []); return g; };
/* a tile inside a tile, built from a snapshot as the page saves one: the inner tile round block 0, in the outer tile */
const nested = (shapes, outer, inner, outerMembers = []) => snap(shapes, [{ id: 'outer', name: null, members: outerMembers, repeat: { x: 0, y: 0, across: 1, down: 1, ...outer }, groups: [{ id: 'inner', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, across: 1, down: 1, ...inner } }] }]);
test('a tile inside a tile, from a snapshot: the outer tile\'s matrix is the inner tile\'s set in its place, in every cell', () => {
  /* a 2 by 1 block holding 1, 2 in an inner tile twice across, inside an outer tile whose pattern is 4 by 1, three down */
  const g = make(nested([B('A', 0, 0, 2, 1, { entries: { '1,1': 1, '2,1': 2 } }), arrow('out', { id: 'outer', as: 'tile' }), arrow('in', { id: 'inner', as: 'tile' }, { side: 'n' })], { cols: 4, rows: 1, down: 3 }, { cols: 2, rows: 1, across: 2 }));
  assert.deepEqual(g.nodes[g.spaces.top.arrows[0].node].type, t(4, 3));
  assert.deepEqual(text(out(g, 0)), text(rowsOf([[1, 2, 1, 2], [1, 2, 1, 2], [1, 2, 1, 2]])));
  assert.deepEqual(text(out(g, 1)), text(rowsOf([[1, 2, 1, 2]])));      /* an arrow on the inner tile alone reads the inner tile's matrix */
});
test('the index a block of the inner tile reads is the inner tile\'s, the same in every cell of the outer tile', () => {
  /* index.x in both entries: 1 2 in the inner tile's first cell and 3 4 in its second, whichever cell of the outer tile it is in */
  const shapes = [B('A', 0, 0, 2, 1, { entries: { '1,1': { expr: 'index.x' }, '2,1': { expr: 'index.x' } } }), B('U', 0, 1, 4, 1, { entries: { '1,1': { expr: 'index.x' }, '4,1': { expr: 'index.y' } } }), arrow('out', { id: 'outer', as: 'tile' }), arrow('in', { id: 'inner', as: 'tile' }, { side: 'n' })];
  const g = make(nested(shapes, { cols: 4, rows: 2, across: 2, down: 2 }, { cols: 2, rows: 1, across: 2 }, [1]));
  assert.deepEqual(text(out(g, 1)), text(rowsOf([[1, 2, 3, 4]])));
  /* the outer tile, 2 by 2 cells: the inner tile's row is 1 2 3 4 in each, and the outer tile's own block beside it reads the outer tile's index */
  assert.deepEqual(text(out(g, 0)), text(rowsOf([[1, 2, 3, 4, 1, 2, 3, 4], [1, null, null, 2, 5, null, null, 2], [1, 2, 3, 4, 1, 2, 3, 4], [1, null, null, 4, 5, null, null, 4]])));
  /* asked for as the page asks, under the chain of both cells (the outer tile's second cell, the inner tile's second): 3 4 */
  const cells = [{ x: 4, y: 0, dx: 0, dy: 0 }, { x: 2, y: 0, dx: 0, dy: 0 }];
  assert.deepEqual(text(worked(g, 'v:A', { binding: { cells } })), text(rowsOf([[3, 4]])));
  assert.deepEqual(text(worked(g, 'v:A', { binding: { cells: [{ x: 0, y: 0, dx: 0, dy: 0 }, { x: 0, y: 0, dx: 0, dy: 0 }] } })), text(rowsOf([[1, 2]])));
});
test('after review: the index a block reads is that of the innermost tile the block itself is in, whoever reads it', () => {
  const F = e => ({ expr: e }), G2 = (outer, inner, om, im) => [{ id: 'outer', name: null, members: om, repeat: { x: 0, y: 0, across: 1, down: 1, ...outer }, groups: [{ id: 'inner', name: null, members: im, groups: [], repeat: { across: 1, down: 1, ...inner } }] }];
  /* 1. Q, a block of the outer tile, holds index.x; P, in a tile inside it, holds Q's number times 10 and its own index */
  let g = make(snap([B('Q', 0, 0, 1, 1, { entries: { '1,1': F('index.x') } }), B('P', 1, 0, 1, 1, { entries: { '1,1': F('@[Q:m] * 10 + index.x') } }), arrow('out', { id: 'outer', as: 'tile' })],
    G2({ cols: 3, rows: 1, across: 2 }, { x: 1, y: 0, cols: 1, rows: 1, across: 2 }, [0], [1])));
  assert.deepEqual(text(out(g)), text(rowsOf([[1, 11, 12, 4, 41, 42]])));
  /* asked for as the page asks, under both cells: P in the outer tile's second cell and the inner tile's second is 42 */
  const cells = (ox, ix) => [{ x: ox, y: 0, dx: 1, dy: 0, of: ['t:outer'], at: { 'v:Q': { col: 0, row: 0 } } }, { x: ix, y: 0, dx: 0, dy: 0, of: ['t:inner'] }];      /* at: where the outer pattern's blocks lie, as the page says it */
  assert.deepEqual(text(worked(g, 'v:P', { binding: { cells: cells(3, 1) } })), { '1,1': '42' });
  assert.deepEqual(text(worked(g, 'v:Q', { binding: { cells: cells(3, 1) } })), { '1,1': '4' });      /* and Q, asked under the same chain, is in the outer cell alone, at its own place */
  /* 2. M, of the outer tile, holds index.x; an arrow in the inner tile passes it through to S, seated in the inner tile */
  g = make(snap([B('M', 0, 0, 2, 1, { entries: { '1,1': F('index.x'), '2,1': F('index.x') } }), arrow('f', { id: 'M', as: 'block' }, { side: 's', span: 2 }), B('S', 0, 1, 2, 1, { seat: 'f' }), arrow('out', { id: 'outer', as: 'tile' })],
    G2({ cols: 2, rows: 2, across: 2 }, { x: 0, y: 1, cols: 2, rows: 1 }, [0], [1, 2])));
  assert.deepEqual(text(worked(g, g.spaces.top.arrows.find(a => a.arrow === 'out').node)), text(rowsOf([[1, 2, 3, 4], [1, 2, 3, 4]])));
  /* 3. M, of the outer tile, holds formulas of index.y; a max(x, 0) arrow under its column 1 is repeated in the inner tile */
  g = make(snap([B('M', 0, 0, 4, 1, { entries: { '1,1': F('index.y'), '2,1': F('0 - index.y'), '3,1': F('2 * index.y'), '4,1': -3 } }), arrow('relu', { id: 'M', as: 'block' }, { side: 's', formula: 'max(x, 0)' }, { x: 0, y: 1 })],
    G2({ cols: 4, rows: 3, down: 2 }, { x: 0, y: 1, cols: 1, rows: 2, across: 4 }, [0], [1])));
  const relu = g.spaces.top.arrows[0].node, under = oy => ({ binding: { cells: [{ x: 0, y: oy, dx: 0, dy: 1, of: ['t:outer'], at: { 'v:M': { col: 0, row: 0 } } }, { x: 0, y: 0, dx: 0, dy: 0, of: ['t:inner'] }] } });
  assert.equal(g.nodes[relu].op, 'mapalong');
  assert.deepEqual(text(worked(g, relu, under(0))), text(rowsOf([[1, 0, 2, 0]])));      /* the outer tile's first cell: index.y is 1 */
  assert.deepEqual(text(worked(g, relu, under(3))), text(rowsOf([[4, 0, 8, 0]])));      /* its second: 4 */
  /* the same root, older than nesting: a block in no tile has no index, though an arrow in a tile reads it */
  g = make(snap([B('M', 0, 0, 4, 1, { entries: { '1,1': F('index.y'), '2,1': 5, '3,1': -6, '4,1': 7 } }), arrow('relu', { id: 'M', as: 'block' }, { side: 's', formula: 'max(x, 0)' }, { x: 0, y: 1 })],
    [{ id: 't1', name: null, members: [1], groups: [], repeat: { x: 0, y: 1, cols: 1, rows: 2, across: 4, down: 1 } }]));
  const free = worked(g, g.spaces.top.arrows[0].node, { binding: { cells: [{ x: 0, y: 0, dx: 0, dy: 0, of: ['t:t1'] }] } });
  assert.deepEqual(text(free), { '1,1': '!', '2,1': '5', '3,1': '0', '4,1': '7' }); assert.match(free['1,1'].err, /not in a tile/);
  assert.match(worked(g, 'v:M', { binding: { cells: [{ x: 0, y: 0, dx: 0, dy: 0, of: ['t:t1'] }] } })['1,1'].err, /not in a tile/);
  /* a block in the definition space of a block of a tile is in that block's cell, as before */
  g = make(snap([B('P', 0, 0, 2, 1, { inside: { shapes: [B('ix', -3, 0, 2, 1, { name: 'index.x', from: { id: 'P', index: 'x' } })], groups: [], operations: [] } }), arrow('out', { id: 't1', as: 'tile' })],
    [{ id: 't1', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 2, rows: 1, across: 2, down: 1 } }]));
  assert.deepEqual(text(out(g)), text(rowsOf([[1, 2, 3, 4]])));
  /* a cell that does not say which tile it is of is kept, whatever the block */
  assert.deepEqual(text(worked(g, 'v:P', { binding: { cells: [{ x: 2, y: 0, dx: 0, dy: 0 }] } })), text(rowsOf([[3, 4]])));
});
test('after review: an arrow repeated in the inner tile goes on along its input in each cell of the outer tile', () => {
  /* M, 8 by 1, outside both tiles; a max(x, 0) arrow under its column 1 in an inner tile 4 across; S seated on the output, in the outer pattern (4 by 2); the outer tile twice across */
  const shapes = (m, more = {}) => [B('M', 0, 0, m.length, 1, { entries: Object.fromEntries(m.map((v, i) => [`${i + 1},1`, v])) }), arrow('relu', { id: 'M', as: 'block' }, { side: 's', formula: 'max(x, 0)', ...more }, { x: 0, y: 1 }), B('S', 0, 3, 4, 1, { seat: 'relu' }), arrow('out', { id: 'outer', as: 'tile' })];
  const groups = (across, down = 1) => [{ id: 'outer', name: null, members: [2], repeat: { x: 0, y: 1, cols: 4, rows: 3, across, down }, groups: [{ id: 'inner', name: null, members: [1], groups: [], repeat: { x: 0, y: 1, cols: 1, rows: 2, across: 4, down: 1 } }] }];
  const M8 = [1, -2, 3, -4, 5, -6, 7, -8];
  let g = make(snap(shapes(M8), groups(2)));
  const relu = g.spaces.top.arrows.find(a => a.arrow === 'relu').node, outer = g.spaces.top.arrows.find(a => a.arrow === 'out').node;
  assert.deepEqual(g.nodes[relu].through, [{ tile: 't:outer', count: 2 }]); assert.deepEqual(g.nodes[relu].type, t(4, 1)); assert.deepEqual(g.nodes[relu].within, ['t:outer', 't:inner']);
  /* the outer tile's matrix: two blank rows (the arrow's own, no block), so it has none; S's row is read cell by cell */
  assert.deepEqual(text(worked(g, relu)), text(rowsOf([[1, 0, 3, 0]])));      /* asked for under no cell: the first */
  const cell = k => ({ binding: { cells: [{ x: (k - 1) * 4, y: 0, dx: 0, dy: 2, of: ['t:outer'] }] } });
  assert.deepEqual(text(worked(g, 'v:S', cell(1))), text(rowsOf([[1, 0, 3, 0]]))); assert.deepEqual(text(worked(g, 'v:S', cell(2))), text(rowsOf([[5, 0, 7, 0]])));
  assert.deepEqual(text(worked(g, relu, cell(2))), text(rowsOf([[5, 0, 7, 0]])));
  /* (the outer tile itself has no matrix here: the arrow's rows of its pattern hold no block. Its copies are read as above.) */
  assert.equal(g.spaces.top.arrows.find(a => a.arrow === 'out').node, null);
  /* an arrow that passes its input through goes on the same way: said as the formula x */
  const pass = make(snap([B('M', 0, 0, 8, 1, { entries: Object.fromEntries(M8.map((v, i) => [`${i + 1},1`, v])) }), arrow('p', { id: 'M', as: 'block' }, { side: 's' }, { x: 0, y: 1 }), B('S', 0, 3, 4, 1, { seat: 'p' })], groups(2)));
  assert.equal(pass.nodes[pass.spaces.top.arrows[0].node].formula, 'x');
  assert.deepEqual(text(worked(pass, 'v:S', cell(1))), text(rowsOf([M8.slice(0, 4)]))); assert.deepEqual(text(worked(pass, 'v:S', cell(2))), text(rowsOf([M8.slice(4)])));
  /* it is never silent: an input too short, or an outer tile that repeats the other way, is an error on the arrow */
  g = make(snap(shapes(M8.slice(0, 7)), groups(2))); assert.deepEqual(g.spaces.top.arrows.find(a => a.arrow === 'relu').error.code, 'size');
  g = make(snap(shapes(M8), groups(1, 2))); assert.equal(g.spaces.top.arrows.find(a => a.arrow === 'relu').error.code, 'mismatch'); assert.match(g.spaces.top.arrows.find(a => a.arrow === 'relu').error.note, /a tile its tile is in repeats down/);
  /* an outer tile that does not repeat: an ordinary mapalong, as before */
  g = make(snap(shapes(M8.slice(0, 4)), groups(1))); assert.equal(g.nodes[g.spaces.top.arrows.find(a => a.arrow === 'relu').node].through, undefined);
});
test('three tiles, one inside the next: the bindings compose from a snapshot too', () => {
  const g = make(snap([B('A', 0, 0, 1, 1, { entries: { '1,1': { expr: 'index.x * 10 + index.y' } } }), arrow('out', { id: 'a', as: 'tile' })],
    [{ id: 'a', name: null, members: [], repeat: { x: 0, y: 0, cols: 4, rows: 2, across: 2, down: 1 }, groups: [{ id: 'b', name: null, members: [], repeat: { x: 0, y: 0, cols: 2, rows: 2, across: 2, down: 1 },
      groups: [{ id: 'c', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 1, rows: 1, across: 2, down: 2 } }] }] }]));
  assert.deepEqual(g.nodes['v:A'].within, ['t:a', 't:b', 't:c']);
  const row1 = [11, 21, 11, 21, 11, 21, 11, 21], row2 = [12, 22, 12, 22, 12, 22, 12, 22];
  assert.deepEqual(text(out(g)), text(rowsOf([row1, row2])));
});
test('an arrow in a tile whose formula reads the index: every cell has its own', () => {
  const g = build(tileOf({ x: 0, y: 0, cols: 2, rows: 2, across: 3, down: 1 }, [0, 1, 2], [B('P', 0, 0, 2, 1, { entries: { '1,1': 0, '2,1': 0 } }),
    arrow('f', { id: 'P', as: 'block' }, { side: 's', span: 2, gap: 1, formula: 'x + index.x' }, { x: 0, y: 1 }), B('H', 0, 1, 2, 1, { seat: 'f' }), arrow('out', { id: 't1', as: 'tile' })]));
  assert.deepEqual(validate(g), []);
  assert.deepEqual(worked(g, g.spaces.top.arrows[1].node), rowsOf([[0, 0, 0, 0, 0, 0], [1, 2, 3, 4, 5, 6]]));
  /* and where the block it reads has an index of its own, that block is read at its own place in the pattern, not at the reader's */
  const both = build(tileOf({ x: 0, y: 0, cols: 2, rows: 2, across: 2, down: 1 }, [0, 1, 2], [B('P', 0, 0, 2, 1, { entries: { '1,1': { expr: 'index.y' }, '2,1': { expr: 'index.x' } } }),
    arrow('f', { id: 'P', as: 'block' }, { side: 's', span: 2, gap: 1, formula: '100 * x + 10 * index.y + index.x' }, { x: 0, y: 1 }), B('H', 0, 1, 2, 1, { seat: 'f' }), arrow('out', { id: 't1', as: 'tile' })]));
  assert.deepEqual(worked(both, both.spaces.top.arrows[1].node), rowsOf([[1, 2, 1, 4], [121, 222, 123, 424]]));
});
test('a piece of a tile that follows its cell has a value for each cell, and each of its blocks its own place', () => {
  const g = build(tileOf({ x: 0, y: 0, cols: 3, rows: 2, across: 4, down: 1 }, [0, 1], [B('P', 0, 0, 2, 1, { entries: { '1,1': { expr: 'index.x' }, '2,1': { expr: 'index.x' } } }), B('Q', 2, 0, 1, 2, { entries: { '1,1': 1, '1,2': 1 } })]));
  const cell = x => ({ binding: { cells: [{ x, y: 0 }] } });
  assert.deepEqual(worked(g, 'matmul(v:P,v:Q)', cell(0)), { '1,1': 3 }); assert.deepEqual(worked(g, 'matmul(v:P,v:Q)', cell(3)), { '1,1': 9 }); assert.deepEqual(worked(g, 'matmul(v:P,v:Q)', cell(0)), { '1,1': 3 });
  /* two blocks that both read the index, in one product: where each lies in the pattern is said, and each reads its own */
  const two = build(tileOf({ x: 0, y: 0, cols: 3, rows: 2, across: 2, down: 1 }, [0, 1], [B('P', 0, 0, 2, 1, { entries: { '1,1': { expr: 'index.x' }, '2,1': { expr: 'index.x' } } }), B('Q', 2, 0, 1, 2, { entries: { '1,1': { expr: 'index.x' }, '1,2': { expr: 'index.y' } } })]));
  const at = x => ({ binding: { cells: [{ x, y: 0, at: { 'v:P': { col: 0, row: 0 }, 'v:Q': { col: 2, row: 0 } } }] } });
  assert.deepEqual(worked(two, 'matmul(v:P,v:Q)', at(0)), { '1,1': 1 * 3 + 2 * 2 }); assert.deepEqual(worked(two, 'matmul(v:P,v:Q)', at(3)), { '1,1': 4 * 6 + 5 * 2 });
});
test('it never throws on what build made of a formula a user can type', () => {
  for (const name of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']){
    const g = build(snap([B('A', 0, 0, 2, 1, { entries: { '1,1': { expr: name }, '2,1': 2 } }), B('C', 2, 0, 1, 2, { entries: { '1,1': 1, '1,2': 1 } })]));
    assert.deepEqual(validate(g), []); const e = worked(g, 'matmul(v:A,v:C)'); assert.equal(e['1,1'].err, 'unknown name: ' + name); }
});
test('it never throws on a graph that is not well formed: what is no value is an error, not a crash', () => {
  const raw = entries => ({ version: 1, nodes: { a: { ...V([[1, 1]]), entries }, b: V([[1], [1]]), p: N('matmul', ['a', 'b'], t(1, 1)) }, functions: {}, spaces: {}, blocks: {} });
  for (const v of [{ n: 2, k: 60 }, { n: 1, d: 0, k: 0 }, {}, [], { sym: 7 }, { expr: '__proto__' }, { expr: 'constructor + 1' }, { expr: '(((' }, 'seven']){
    const g = raw({ '1,1': v, '2,1': 1 }); assert.ok(validate(g).length > 0, JSON.stringify(v));
    const r = evaluate(g, 'p'); assert.ok(r.entries || r.error, JSON.stringify(v)); assert.deepEqual(JSON.parse(JSON.stringify(r)), r); }
  const junk = evaluate(raw({ '1,1': { sym: ')(' }, '2,1': 1 }), 'p'); assert.ok(junk.entries || junk.error);      /* text the solver cannot read */
  for (const g of [{ nodes: { a: null } }, { nodes: { a: { op: 'constructor', inputs: [], type: t(1, 1) } } }, { nodes: { a: { op: 'toString' } } }, { nodes: { a: { op: 'apply', inputs: ['a'], type: t(1, 1), fn: '__proto__' } }, functions: {} }, { nodes: 7 }, 7, 'graph'])
    for (const id of ['a', '__proto__', 'constructor']) assert.equal(evaluate(g, id).error.code === undefined, false);
});
test('a single entry\'s side with no root to write is an error', () => {
  const side = v => worked(G({ s: V([[v]]), x: N('measure', ['s'], t(1, 1), { side: 'x' }) }), 'x')['1,1'];
  for (const v of [-4, 'inf', '-inf', { n: -2, k: 1 }, true]) assert.equal(side(v).err, 'it has no root to be a side', JSON.stringify(v));
  assert.equal(side(16), 4); assert.deepEqual(side({ n: 1, d: 4, k: 0 }), { n: 1, d: 2, k: 0 }); assert.equal(side({ err: 'divide by zero' }).err, 'divide by zero');
});
test('an index matrix is worked out at any size the caller allows', () => {
  const g = build(tileOf({ x: 0, y: 0, cols: 100, rows: 50, across: 2, down: 1 }, [0], [B('P', 0, 0, 100, 50, { inside: { shapes: [B('ix', -101, -25, 100, 50, { name: 'index.x', from: { id: 'P', index: 'x' }, standing: true })], groups: [], operations: [] } })]));
  assert.equal(evaluate(g, 'v:ix').deferred, true);      /* 5,000 entries: past the browser's limit */
  const e = evaluate(g, 'v:ix', { maxEntries: 1e6, binding: { cells: [{ x: 100, y: 0 }] } }).entries;
  assert.equal(Object.keys(e).length, 5000); assert.equal(e['1,1'], 101); assert.equal(e['100,50'], 200);
});
test('carry takes what was worked out to a new graph, for every node that is the same all the way down', () => {
  const shapes = last => [B('A', 0, 0, 2, 2, { entries: rowsOf([[1, 2], [3, 4]]) }), B('W', 2, 0, 2, 2, { entries: rowsOf([[5, 6], [7, 8]]) }), B('C', 9, 0, 2, 2, { entries: rowsOf([[1, 0], [0, 1]]) }), B('D', 11, 0, 2, 2, { entries: rowsOf([[2, 0], [0, last]]) })];
  const one = build(snap(shapes(2))), first = evaluate(one, 'matmul(v:A,v:W)'), other = evaluate(one, 'matmul(v:C,v:D)'), c = evaluate(one, 'v:C'), d = evaluate(one, 'v:D');
  const two = build(snap(shapes(3))); assert.ok(carry(one, two) > 0);
  assert.equal(evaluate(two, 'matmul(v:A,v:W)'), first);      /* the very answer: nothing of it was worked out again */
  assert.notEqual(evaluate(two, 'matmul(v:C,v:D)'), other); assert.deepEqual(evaluate(two, 'matmul(v:C,v:D)').entries, rowsOf([[2, 0], [0, 3]]));      /* what changed below it is worked out afresh */
  assert.equal(evaluate(two, 'v:C'), c); assert.notEqual(evaluate(two, 'v:D'), d);
  assert.equal(carry(null, two), 0); assert.equal(carry(one, one), 0); assert.equal(carry({}, two), 0);
  /* what a function's body came to is not carried: its input may have changed and its own id not */
  const fnShapes = v => [B('X', 0, 0, 2, 1, { entries: rowsOf([[v, 2]]) }), arrow('lin', { id: 'X', as: 'block' }, {}, { inside: { shapes: [B('in', -9, 0, 2, 1, { in: true }), B('Wf', -7, 0, 1, 2, { entries: rowsOf([[3], [4]]) })], groups: [], operations: [] } })];
  const f1 = build(snap(fnShapes(1))); assert.deepEqual(worked(f1, 'apply(v:X;f:lin)'), { '1,1': 11 });
  const f2 = build(snap(fnShapes(10))); carry(f1, f2); assert.deepEqual(worked(f2, 'apply(v:X;f:lin)'), { '1,1': 38 });
});
