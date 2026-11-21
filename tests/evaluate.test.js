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
import { build as valued, validate } from '../graph.js';
/* The cases below were written for a graph's sizes: they are held to those. build is asked here for the graph
   without each type's value, its number space, which has its own cases (tests/spaces.test.js and the end of
   tests/graph.test.js); a type with no value is a type still (graph.js: Number spaces). */
const build = snapshot => { const g = valued(snapshot); for (const n of Object.values(g.nodes)){ const { value, ...size } = n.type; n.type = size; } return g; };
import { read } from '../project.js';
import { valueText } from '../algebra.js';

const t = (cols, rows, colsName = null, rowsName = null) => ({ cols, rows, colsName, rowsName });
/* a matrix given row by row: [[1, 2], [3, 4]]; null for an entry not given */
const rowsOf = rows => Object.fromEntries(rows.flatMap((row, r) => row.map((v, c) => [`${c + 1},${r + 1}`, v])).filter(([, v]) => v !== null));
const V = (rows, more = {}) => ({ op: 'variable', inputs: [], type: t(rows[0].length, rows.length), name: 'v', named: true, defined: 'entries', entries: rowsOf(rows), ...more });
/* a graph written by hand. tiles: [[tile id, the repeat that is its matrix]]: a repeat is always some tile's */
const G = (nodes, functions = {}, tiles = []) => { const g = { version: 4, nodes, functions, blocks: {},
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
  assert.match(tooLarge(t(4097, 1)), /^it holds 4097 × 1 numbers, more than the 4096 that are worked out here: its size is shown/);
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
test('a single entry\'s side with no root to write is an error, and the side of true or false is that of 1 or 0', () => {
  const side = v => worked(G({ s: V([[v]]), x: N('measure', ['s'], t(1, 1), { side: 'x' }) }), 'x')['1,1'];
  for (const v of [-4, 'inf', '-inf', { n: -2, k: 1 }]) assert.equal(side(v).err, 'it has no root to be a side', JSON.stringify(v));
  assert.equal(side(true), 1); assert.equal(side(false), 0);      /* a boolean counts as 1 or 0, as in all arithmetic: the backend, which holds true as 1, says the same (backend/tests/test_evaluate.py) */
  const said = G({ s: { ...V([[null]]), entries: { '1,1': { expr: '2 > 1' } } }, x: N('measure', ['s'], t(1, 1), { side: 'x' }), m: N('measure', ['s'], t(1, 1), { side: 'm' }) });
  assert.deepEqual(worked(said, 'x'), { '1,1': 1 }); assert.deepEqual(worked(said, 'm'), { '1,1': true });      /* worked out by a comparison likewise; its mass is still true */
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

/* ---- phase 7: what only the backend has ---- */
test('phase 7: what is made of noise or of a data file is not worked out here: deferred, and marked as the backend\'s', () => {
  const g = make(snap([B('N', 0, 0, 2, 2, { source: { noise: { seed: 1, dist: 'uniform' } } }), B('M', 2, 0, 2, 2, { entries: { '1,1': 1, '2,1': 2, '1,2': 3, '2,2': 4 } }),
    B('F', 10, 0, 2, 2, { source: { file: 'data/w.csv' } }), B('K', 20, 0, 2, 2, { entries: { '1,1': 5, '2,1': { expr: '@[N:x] + 1' } } }), B('Bad', 30, 0, 2, 2, { source: { file: null } }), B('Q', 32, 0, 2, 2)]));
  const t = { cols: 2, rows: 2, colsName: null, rowsName: null };
  assert.deepEqual(evaluate(g, 'v:N'), { type: t, deferred: true, backend: true });
  assert.deepEqual(evaluate(g, 'matmul(v:N,v:M)'), { type: t, deferred: true, backend: true });      /* and everything made of it */
  assert.deepEqual(evaluate(g, 'v:F'), { type: t, deferred: true, backend: true });
  assert.deepEqual(evaluate(g, 'v:M').entries, { '1,1': 1, '2,1': 2, '1,2': 3, '2,2': 4 });      /* what is not made of it is worked out as ever */
  assert.deepEqual(evaluate(g, 'v:K').entries, { '1,1': 5, '2,1': 3 });      /* its width is a size, and needs no numbers */
  assert.equal(evaluate(g, 'matmul(v:Bad,v:Q)').error.code, 'no-source');      /* an error is still the error */
  const big = make(snap([B('N', 0, 0, 100, 100, { source: { noise: {} } })]));
  assert.deepEqual(evaluate(big, 'v:N'), { type: { cols: 100, rows: 100, colsName: null, rowsName: null }, deferred: true, backend: true });      /* too large here, and the backend's all the same */
  assert.deepEqual(evaluate(big, 'v:N', { maxEntries: 1e6 }), { type: { cols: 100, rows: 100, colsName: null, rowsName: null }, deferred: true, backend: true });
});

test('phase 7: a function repeated through an outer tile is given another part of its input in each of that tile\'s cells', () => {
  /* found while the backend was written against this file: the function's body was remembered under the run's number alone, so every outer cell read the first cell's */
  const g = make({ top: { shapes: [B('M', 0, 0, 8, 1, { entries: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((v, i) => [(i + 1) + ',1', v])) }),
    arrow('f', { id: 'M', as: 'block' }, { side: 's' }, { x: 0, y: 1, inside: { shapes: [B('in', -9, 0, 1, 1, { in: true }), B('two', -8, 0, 1, 1, { entries: { '1,1': 2 } })], groups: [], operations: [] } }), B('seat', 0, 3, 1, 1, { seat: 'f' })],
    groups: [{ id: 'outer', name: null, members: [2], repeat: { x: 0, y: 1, cols: 2, rows: 3, across: 4, down: 1 }, groups: [{ id: 'inner', name: null, members: [1], groups: [], repeat: { x: 0, y: 1, cols: 1, rows: 1, across: 2, down: 1 } }] }], operations: [] } });
  const a = g.spaces.top.arrows[0].node; assert.equal(g.nodes[a].fn, 'f:f'); assert.deepEqual(g.nodes[a].through, [{ tile: 't:outer', count: 4 }]);
  const cell = x => evaluate(g, a, { binding: { cells: [{ x, y: 0, of: ['t:outer'] }] } }).entries;
  assert.deepEqual(cell(0), { '1,1': 2, '2,1': 4 }); assert.deepEqual(cell(2), { '1,1': 6, '2,1': 8 }); assert.deepEqual(cell(6), { '1,1': 14, '2,1': 16 });
});

/* found in review of the stack: the answer a function gave for one run of an input was handed to every other run of it */
test('after review: two arrows of one function on different rows of one input each have their own answer, whichever is asked first', () => {
  const B = (id, x, y, cols, rows, more = {}) => ({ id, type: 'tensor', name: id, x, y, cols, rows, colsName: null, rowsName: null, entries: {}, inside: null, variable: null, ...more });
  const arrow = (id, start, y, more) => B(id, 4, y, 1, 1, { type: 'arrow', arrow: { input: { id: 'X', as: 'block' }, side: 'e', start, span: 1, gap: 2, gapName: null, output: null, formula: null }, variable: 7, name: 'linear', ...more });
  const tile = (id, member, y) => ({ id, name: null, members: [member], groups: [], repeat: { x: 4, y, cols: 1, rows: 1, across: 1, down: 2 } });
  /* linear: its input, one row of two, times a column of 3 and 4. X is four rows; one arrow is repeated down rows 1 and 2, a reference to it down rows 3 and 4 */
  const body = { shapes: [B('in', -9, 0, 2, 1, { in: true }), B('W', -7, 0, 1, 2, { entries: rowsOf([[3], [4]]) })], groups: [], operations: [] };
  const made = () => build({ top: { shapes: [B('X', 0, 0, 2, 4, { entries: rowsOf([[1, 2], [10, 20], [100, 200], [1000, 2000]]) }), arrow('lin', 1, 0, { inside: body }), arrow('use', 3, 2, { reference: true })],
    groups: [tile('t1', 1, 0), tile('t2', 2, 2)], operations: [] } });
  const column = (g, i) => { const e = evaluate(g, g.spaces.top.arrows[i].node); return [e.entries['1,1'], e.entries['1,2']]; };
  const g = made(); assert.deepEqual(validate(g), []);
  assert.deepEqual([column(g, 0), column(g, 1)], [[11, 110], [1100, 11000]]);
  const again = made(); assert.deepEqual([column(again, 1), column(again, 0)], [[1100, 11000], [11, 110]]);      /* asked the other way round */
});

/* ---- None (phase 9) ---- */
const NONE = { none: true };
test('None: a product entry with one None term is None, wherever among the terms it stands; an error or an unknown term comes first', () => {
  const dot = (row, col) => worked(G({ a: V([row]), b: V(col.map(v => [v])), p: N('matmul', ['a', 'b'], t(1, 1)) }), 'p')['1,1'];
  assert.deepEqual(dot([0, NONE], [5, 7]), NONE); assert.deepEqual(dot([NONE, 0], [5, 7]), NONE); assert.deepEqual(dot([2, 3], [NONE, 0]), NONE); assert.deepEqual(dot([NONE], [NONE]), NONE);
  assert.deepEqual(dot([NONE, 'inf'], ['inf', 1]), NONE);      /* None against an infinity is None, not ∞ × 0 */
  for (const row of [['inf', NONE, '-inf'], ['inf', '-inf', NONE], [NONE, 'inf', '-inf']]) assert.equal(dot(row, [1, 1, 1]).err, '∞ − ∞ has no value');
  assert.equal(dot([0, NONE], ['inf', 1]).err, '0 × ∞ has no value');
  assert.equal(dot([NONE, 2], [1, null]), undefined); assert.equal(dot([null, NONE], [1, 1]), undefined);      /* None against unknown is unknown: the entry is absent */
  assert.deepEqual(worked(product([[1, NONE], [3, 4]], [[5, 6], [7, 8]]), 'p'), rowsOf([[NONE, NONE], [43, 50]]));
});
test('None: a sum, a scale, entry by entry, a formula and a measure follow the table', () => {
  const g = G({ a: V([[NONE, 1, 0]]), b: V([[1, NONE, { expr: '1/0' }]]), s: V([[NONE]]), sum: N('add', ['a', 'b'], t(3, 1)), sc: N('scale', ['s', 'b'], t(3, 1)),
    over: N('ewise', ['b', 'a'], t(3, 1), { fn: 'div', broadcast: 'none' }), f: V([[{ expr: 'select($1, 1, 2)' }, { expr: '$1 == none' }, { expr: '!$1 + ($1 || 3)' }]], { inputs: ['s'] }),
    side: N('measure', ['s'], t(1, 1), { side: 'x' }), mass: N('measure', ['s'], t(1, 1), { side: 'm' }), m: N('map', ['a'], t(3, 1), { formula: 'select(x == none, -1, x + 1)' }) });
  assert.deepEqual(text(worked(g, 'sum')), { '1,1': '∅', '2,1': '∅', '3,1': '!' });
  assert.deepEqual(text(worked(g, 'sc')), { '1,1': '∅', '2,1': '∅', '3,1': '!' });
  assert.deepEqual(text(worked(g, 'over')), { '1,1': '∅', '2,1': '∅', '3,1': '!' });      /* 1 / None is None, not a division by zero */
  assert.deepEqual(worked(g, 'f'), rowsOf([[2, true, 2]]));
  assert.deepEqual(worked(g, 'side'), { '1,1': NONE }); assert.deepEqual(worked(g, 'mass'), { '1,1': NONE });
  assert.deepEqual(worked(g, 'm'), rowsOf([[-1, 2, 1]]));
});

/* ---- ruled 21 November 2026: special values in a sum or product of several terms are order-free ---- */
test('several shapes added or multiplied entry by entry are looked at all together: an error two of them make comes before unknown, and unknown before None, whatever their order', () => {
  const NONE = { none: true }, perms = xs => xs.length < 2 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]));
  const says = v => v === undefined ? 'unknown' : v && v.err ? 'error' : v && v.none ? 'None' : valueText(v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v);
  const one = v => V([[v]]), T = t(1, 1);
  const sum = terms => { const g = G({ ...Object.fromEntries(terms.map((v, k) => ['v' + k, one(v)])), s: N('add', terms.map((_, k) => 'v' + k), T) }); return says(evaluate(g, 's').entries['1,1']); };
  /* a times of several is one node made of another, as a canvas makes it; and a sum made of a sum, and a scale of a times */
  const nested = (op, more) => terms => { const nodes = Object.fromEntries(terms.map((v, k) => ['v' + k, one(v)])); let acc = 'v0';
    terms.slice(1).forEach((_, k) => { nodes['n' + k] = N(op, [acc, 'v' + (k + 1)], T, more); acc = 'n' + k; }); return says(evaluate(G(nodes), acc).entries['1,1']); };
  const times = nested('ewise', { fn: 'mul', broadcast: 'none' }), sums = nested('add'), scales = terms => { const nodes = Object.fromEntries(terms.map((v, k) => ['v' + k, one(v)])); let acc = 'v' + (terms.length - 1);
    for (let k = terms.length - 2; k >= 0; k--){ nodes['n' + k] = N('scale', ['v' + k, acc], T); acc = 'n' + k; } return says(evaluate(G(nodes), acc).entries['1,1']); };
  for (const [terms, want] of [[[NONE, 'inf', '-inf'], 'error'], [[null, 'inf', '-inf'], 'error'], [[NONE, null, 'inf', '-inf'], 'error'], [[NONE, null, 3], 'unknown'], [[NONE, 1, 2], 'None'], [[NONE, 'inf', 'inf'], 'None'], [[1, 2, 3], '6'], [[NONE, { err: 'x' }, 1], 'error']])
    for (const p of perms(terms)){ assert.equal(sum(p), want, 'a sum of ' + JSON.stringify(p)); assert.equal(sums(p), want, 'a sum made of sums, ' + JSON.stringify(p)); }
  for (const [terms, want] of [[[NONE, 0, 'inf'], 'error'], [[null, 0, '-inf'], 'error'], [[NONE, null, 0, 'inf'], 'error'], [[NONE, null, 0], 'unknown'], [[NONE, 2, 3], 'None'], [[NONE, 0, 0], 'None'], [[2, 3, 4], '24'], [[NONE, 1, 'inf'], 'None']])
    for (const p of perms(terms)){ assert.equal(times(p), want, 'a times of ' + JSON.stringify(p)); assert.equal(scales(p), want, 'scales of ' + JSON.stringify(p)); }
  /* what is set aside is read only by a sum made directly of a sum: through a variable, or by a product, None is None */
  const g = G({ a: one(NONE), b: one('inf'), c: one('-inf'), s: N('add', ['a', 'b'], T), named: N('variable', ['s'], T, { name: 'S', named: true, defined: 'definition', entries: {} }), u: N('add', ['named', 'c'], T), z: one(0),
    m: N('ewise', ['s', 'z'], T, { fn: 'mul', broadcast: 'none' }) });
  assert.equal(says(evaluate(g, 'u').entries['1,1']), 'None'); assert.equal(says(evaluate(g, 'm').entries['1,1']), 'None');
});
test('a product entry\'s terms are looked at together: ∞ − ∞ among them is an error beside a None or an unknown term, wherever they stand', () => {
  const NONE = { none: true }, at = (row, col) => { const r = evaluate(product([row], col.map(v => [v])), 'p'); const v = r.entries['1,1']; return v === undefined ? 'unknown' : v.err ? 'error' : v.none ? 'None' : v; };
  for (const row of [['inf', NONE, '-inf'], [NONE, 'inf', '-inf'], ['inf', '-inf', NONE], ['inf', null, '-inf'], [null, 'inf', '-inf'], ['inf', '-inf', null], [null, NONE, 'inf', '-inf']]) assert.equal(at(row, row.map(() => 1)), 'error', JSON.stringify(row));
  assert.equal(at([null, NONE, 2], [1, 1, 1]), 'unknown'); assert.equal(at([NONE, null, 2], [1, 1, 1]), 'unknown'); assert.equal(at([NONE, 2, 3], [1, 1, 1]), 'None'); assert.equal(at([1, 2, 3], [1, 1, 1]), 6);
  assert.equal(at([NONE, 'inf', 5], [1, 0, 1]), 'error');      /* a term that is itself an error: 0 × ∞ */
});

/* ---- conditions (phase 9B): choose, and the source that holds None ---- */
const NOTHING = { none: true }, CH = (c, a, b, type = t(2, 2)) => N('choose', [c, a, b], type);
const sides = { a: V([[1, 2], [3, 4]]), b: V([[-1, -2], [-3, -4]]) }, A2 = rowsOf([[1, 2], [3, 4]]), B2 = rowsOf([[-1, -2], [-3, -4]]);
test('choose: a true condition gives the first side, a false one the second, and None is false', () => {
  const g = G({ ...sides, yes: V([[true]]), one: V([[1]]), no: V([[false]]), zero: V([[0]]), nil: V([[NOTHING]]),
    t: CH('yes', 'a', 'b'), t1: CH('one', 'a', 'b'), f: CH('no', 'a', 'b'), f0: CH('zero', 'a', 'b'), n: CH('nil', 'a', 'b') });
  for (const id of ['t', 't1']) assert.deepEqual(worked(g, id), A2);
  for (const id of ['f', 'f0', 'n']) assert.deepEqual(worked(g, id), B2);
});
test('choose: a condition of any size counts by its truth as a whole matrix: one true entry, or every entry zero or None', () => {
  const g = G({ ...sides, some: V([[0, 0, 5], [NOTHING, false, 0]]), none: V([[0, NOTHING], [false, 0]]), allNone: V([[NOTHING, NOTHING]]), half: V([[0, { n: 1, d: 2, k: 0 }]]), inf: V([['-inf']]),
    s: CH('some', 'a', 'b'), z: CH('none', 'a', 'b'), n: CH('allNone', 'a', 'b'), h: CH('half', 'a', 'b'), i: CH('inf', 'a', 'b') });
  assert.deepEqual(worked(g, 's'), A2); assert.deepEqual(worked(g, 'h'), A2); assert.deepEqual(worked(g, 'i'), A2);
  assert.deepEqual(worked(g, 'z'), B2); assert.deepEqual(worked(g, 'n'), B2);
});
test('choose: a condition that is not known leaves every entry unknown, with its type; one true entry settles it beside an unknown one or an error', () => {
  const g = G({ ...sides, open: V([[null]]), part: V([[0, null]]), lost: V([[0, { err: 'divide by zero' }]]), settled: V([[null, 1]]), settledToo: V([[{ err: 'divide by zero' }, true]]),
    u: CH('open', 'a', 'b'), p: CH('part', 'a', 'b'), e: CH('lost', 'a', 'b'), s: CH('settled', 'a', 'b'), s2: CH('settledToo', 'a', 'b') });
  for (const id of ['u', 'p', 'e']) assert.deepEqual(evaluate(g, id), { type: t(2, 2), entries: {} });
  assert.deepEqual(worked(g, 's'), A2); assert.deepEqual(worked(g, 's2'), A2);
});
test('choose: a condition that is an error is that error', () => {
  const g = G({ ...sides, bad: V([[1]], { error: { code: 'loop', note: '' } }), c: CH('bad', 'a', 'b') });
  assert.deepEqual(evaluate(g, 'c'), { error: { code: 'loop', note: '', node: 'bad' } });
});
test('choose: only the chosen side is worked out: an error, a side too large and a side only the backend has do no harm where they are not chosen', () => {
  const g = G({ ...sides, yes: V([[true]]), no: V([[false]]), bad: V([[1, 1], [1, 1]], { error: { code: 'size', note: '5 × 6 ≠ 2 × 2' } }),
    wide: N('source', [], t(70, 70), { kind: 'ones' }), cut: N('slice', ['wide'], t(2, 2), { range: { col: 0, row: 0, cols: 2, rows: 2 } }),
    nz: N('noise', [], t(2, 2), { seed: 1, dist: 'uniform', key: 'nz' }),
    tb: CH('yes', 'a', 'bad'), fb: CH('no', 'a', 'bad'), bt: CH('no', 'bad', 'b'), tw: CH('yes', 'a', 'cut'), fw: CH('no', 'a', 'cut'), wt: CH('no', 'cut', 'b'), tn: CH('yes', 'a', 'nz'), fn: CH('no', 'a', 'nz'),
    after: N('add', ['tb', 'tw', 'tn'], t(2, 2)), afterBad: N('add', ['fb', 'a'], t(2, 2)), afterWide: N('add', ['a', 'fw'], t(2, 2)) });
  for (const id of ['tb', 'tw', 'tn']) assert.deepEqual(worked(g, id), A2, id);
  assert.deepEqual(worked(g, 'bt'), B2); assert.deepEqual(worked(g, 'wt'), B2);
  assert.deepEqual(worked(g, 'after'), rowsOf([[3, 6], [9, 12]]));      /* and what is made of such a choose goes on */
  /* chosen, each is what it would be of any node: the variable's error, deferred, and deferred to the backend */
  assert.deepEqual(evaluate(g, 'fb'), { error: { code: 'size', note: '5 × 6 ≠ 2 × 2', node: 'bad' } }); assert.deepEqual(evaluate(g, 'afterBad'), evaluate(g, 'fb'));
  assert.deepEqual(evaluate(g, 'fw'), { type: t(2, 2), deferred: true }); assert.deepEqual(evaluate(g, 'afterWide'), { type: t(2, 2), deferred: true });
  assert.deepEqual(evaluate(g, 'fn'), { type: t(2, 2), deferred: true, backend: true });
  assert.deepEqual(worked(g, 'fw', { maxEntries: 5000 }), rowsOf([[1, 1], [1, 1]]));      /* with room for it, it is worked out */
});
test('choose: the side not chosen is never asked for', () => {
  /* a side that would take long: a 20 by 20 product of products of fractions, never run */
  const big = Array.from({ length: 20 }, (_, r) => Array.from({ length: 20 }, (_, c) => ({ n: 1, d: c + 2 * r + 2, k: 0 })));
  const g = G({ m: V(big), p: N('matmul', ['m', 'm'], t(20, 20)), q: N('matmul', ['p', 'p'], t(20, 20)), small: V(big.map(() => big[0].map(() => 1))), no: V([[0]]), c: CH('no', 'q', 'small', t(20, 20)) });
  const before = performance.now(), got = evaluate(g, 'c'), took = performance.now() - before; assert.equal(got.entries['20,20'], 1);
  const then = performance.now(); assert.ok(evaluate(g, 'q').entries); const other = performance.now() - then;      /* the other side, asked for on its own, takes many times as long */
  assert.ok(took * 4 < other, `only the small side was worked out: ${took} ms against ${other} ms`);
});
test('choose: a promise broken on the chosen side is the error type; on the other side it is never held', () => {
  const g = G({ ...sides, yes: V([[true]]), no: V([[false]]), w: V([[1, -3], [2, 2]], { name: 'W', holds: 'natural' }), t: CH('yes', 'a', 'w'), f: CH('no', 'a', 'w') });
  assert.deepEqual(worked(g, 't'), A2);
  assert.deepEqual(evaluate(g, 'f'), { error: { code: 'type', note: 'W is not natural: it holds -3 at 2, 1', node: 'w' } });
});
test('choose: inner data on its sides and on its condition; inside a function, one value for each thing the function is given', () => {
  const inner = [{ length: 2, name: null }], ti = { ...t(2, 1), inner }, deep = fill => ({ op: 'variable', inputs: [], type: ti, name: 'v', named: true, defined: 'entries', entries: { '1,1,1': fill, '2,1,1': fill + 1, '1,1,2': fill + 2, '2,1,2': fill + 3 } });
  const g = G({ ai: deep(10), bi: deep(20), ci: { op: 'variable', inputs: [], type: { ...t(1, 1), inner: [{ length: 3, name: null }] }, name: 'c', named: true, defined: 'entries', entries: { '1,1,1': 0, '1,1,2': NOTHING, '1,1,3': 2 } }, no: V([[false]]),
    ti: CH('ci', 'ai', 'bi', ti), fi: CH('no', 'ai', 'bi', ti),
    ...sides, none: N('source', [], t(2, 2), { kind: 'none' }), 'param(f:1)': N('param', [], t(1, 1), { within: ['f:1'] }), body: { ...CH('param(f:1)', 'a', 'none'), within: ['f:1'] },
    yes: V([[true]]), y1: N('apply', ['yes'], t(2, 2), { fn: 'f:1' }), y0: N('apply', ['no'], t(2, 2), { fn: 'f:1' }) }, { 'f:1': { input: 'param(f:1)', body: 'body' } });
  assert.deepEqual(worked(g, 'ti'), g.nodes.ai.entries); assert.deepEqual(worked(g, 'fi'), g.nodes.bi.entries);
  assert.deepEqual(worked(g, 'y1'), A2); assert.deepEqual(worked(g, 'y0'), rowsOf([[NOTHING, NOTHING], [NOTHING, NOTHING]]));
  assert.deepEqual(worked(g, 'body', { binding: { params: { 'f:1': 'yes' } } }), A2); assert.deepEqual(evaluate(g, 'body'), { type: t(2, 2), entries: {} });      /* given nothing, its condition is not known */
});
test('a source of kind none holds None at every entry, at any size and at every inner position; and None with anything is None', () => {
  const g = G({ e: N('source', [], t(2, 1), { kind: 'none' }), ei: N('source', [], { ...t(1, 1), inner: [{ length: 2, name: null }] }, { kind: 'none' }), a: V([[1, 2]]), sum: N('add', ['e', 'a'], t(2, 1)), big: N('source', [], t(100, 100), { kind: 'none' }) });
  assert.deepEqual(worked(g, 'e'), { '1,1': NOTHING, '2,1': NOTHING }); assert.deepEqual(worked(g, 'ei'), { '1,1,1': NOTHING, '1,1,2': NOTHING }); assert.deepEqual(worked(g, 'sum'), { '1,1': NOTHING, '2,1': NOTHING });
  assert.equal(evaluate(g, 'big').deferred, true);
});
