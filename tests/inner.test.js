/* Inner data (phase 8): a type's inner axes in algebra.js, graph.js and evaluate.js. Graphs are written by hand
   here, as a backend would be sent them; what the builder makes of a canvas is further down. For every rule: what
   is accepted, what is refused, and the boundary between them. */
import './solver.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touches, pieces, nested, numbers, isScalar, partEntries } from '../algebra.js';
import { validate, axes, tailsOf, OPS, VERSION, AXES } from '../graph.js';
import { evaluate, tooLarge, MOST } from '../evaluate.js';
import { values as sourceValues } from '../sources.js';
import { passed, coveredType, fits } from '../arrows.js';
import * as tiles from '../tiles.js';

const ax = (length, name = null) => ({ length, name });
const t = (cols, rows, inner = null, colsName = null, rowsName = null) => ({ cols, rows, colsName, rowsName, ...(inner ? { inner: inner.map(a => typeof a === 'number' ? ax(a) : a) } : {}) });
const N = (op, inputs, type, more = {}) => ({ op, inputs, type, ...more });
/* a variable whose every number is given by fill(c, r, ...ks); fill left out: nothing given */
const V = (type, fill = null, more = {}) => { const entries = {};
  if (fill) for (const tail of tailsOf(type)) for (let r = 1; r <= type.rows; r++) for (let c = 1; c <= type.cols; c++){ const v = fill(c, r, ...tail.split(',').slice(1).map(Number)); if (v !== null) entries[c + ',' + r + tail] = v; }
  return { op: 'variable', inputs: [], type, name: 'v', named: true, defined: 'entries', entries, ...more }; };
const G = (nodes, functions = {}, spaces = {}) => ({ version: VERSION, nodes, functions, blocks: {}, spaces });
const ok = g => { assert.deepEqual(validate(g), []); return g; };
const bad = (g, why) => { const b = validate(g); assert.ok(b.length > 0, 'refused: ' + why); return b.join('\n'); };
const worked = (g, id, options) => { const r = evaluate(g, id, options); assert.ok(r.entries, JSON.stringify(r)); assert.deepEqual(r.type, g.nodes[id].type); assert.deepEqual(JSON.parse(JSON.stringify(r)), r); return r.entries; };
const R = (x, y, w, h, inner = null, more = {}) => ({ x, y, w, h, ...(inner ? { inner: inner.map(a => typeof a === 'number' ? ax(a) : a) } : {}), ...more });

/* ---- algebra.js ---- */
test('nested: inner axes agree when there are as many, of the same lengths, and no axis has two names', () => {
  assert.deepEqual(nested([], []), { ok: true, note: '', inner: [] });
  assert.deepEqual(nested(undefined, null), { ok: true, note: '', inner: [] });
  assert.deepEqual(nested([ax(3, 'head')], [ax(3)]), { ok: true, note: '', inner: [ax(3, 'head')] });
  assert.deepEqual(nested([ax(3)], [ax(3, 'head')]).inner, [ax(3, 'head')]);      /* named by whichever names it */
  assert.equal(nested([ax(3, 'head')], [ax(3, 'layer')]).note, 'head ≠ layer');
  assert.equal(nested([ax(3)], [ax(2)]).note, 'inner 3 ≠ 2');
  assert.equal(nested([ax(3, 'head')], [ax(2, 'head')]).note, 'inner 3 ≠ 2');      /* one name and two lengths: the lengths are what is said */
  assert.equal(nested([ax(2), ax(4)], [ax(3)]).note, 'inner 2×4 ≠ 3');
  /* one with none: used at every position, but for where it is to be exact */
  assert.deepEqual(nested([ax(2), ax(4)], []), { ok: true, note: '', inner: [ax(2), ax(4)] });
  assert.deepEqual(nested([], [ax(2)]).inner, [ax(2)]);
  assert.deepEqual(nested([ax(2), ax(4)], [], true), { ok: false, note: 'inner 2×4 ≠ none', inner: null });
  assert.equal(nested([], [ax(2)], true).note, 'inner none ≠ 2');
  assert.equal(nested([ax(2)], [ax(2)], true).ok, true);
});
test('numbers: a type holds its columns times its rows times every inner length', () => {
  assert.equal(numbers({ cols: 3, rows: 1 }), 3); assert.equal(numbers(t(3, 1, [2, 4])), 24); assert.equal(numbers(t(4, 4, [16, 16])), 4096);
});
test('a product is one product at each inner position: inner data agrees, or one of the two has none', () => {
  const X = R(0, 0, 4, 5), W = R(4, 0, 2, 4, [ax(3, 'head')]);
  assert.deepEqual(touches([X, W]).map(x => [x.kind, x.ok, x.note]), [['product', true, '']]);
  assert.deepEqual(pieces([X, W])[0].type, { cols: 2, rows: 5, colsName: null, rowsName: null, inner: [ax(3, 'head')] });
  assert.deepEqual(pieces([R(0, 0, 4, 5, [ax(3, 'head')]), W])[0].type.inner, [ax(3, 'head')]);
  assert.deepEqual(touches([R(0, 0, 4, 5, [ax(3, 'layer')]), W]).map(x => [x.ok, x.note]), [[false, 'layer ≠ head']]);
  assert.deepEqual(touches([R(0, 0, 4, 5, [2]), W]).map(x => [x.ok, x.note]), [[false, 'inner 2 ≠ 3']]);
  assert.deepEqual(pieces([R(0, 0, 4, 5, [2]), W])[0].type, { error: 'undefined' });
  /* a side mismatch is said before an inner one */
  assert.equal(touches([R(1, 0, 3, 5, [2]), W])[0].note, '3 ≠ 4');
  /* a shape with no inner data keeps its old type exactly: no inner field at all */
  assert.deepEqual(pieces([X, R(4, 0, 2, 4)])[0].type, { cols: 2, rows: 5, colsName: null, rowsName: null });
});
test('a row of products: inner data has to agree all along it, across the scalars passed over', () => {
  const A = R(0, 0, 2, 2, [3]), s = R(2, 0, 1, 1), B = R(3, 0, 2, 2, [3]), C = R(3, 0, 2, 2, [2]);
  assert.deepEqual(pieces([A, s, B])[0].type.inner, [ax(3)]);
  assert.deepEqual(pieces([A, s, C])[0].type, { error: 'undefined' });      /* each touch is with the scalar, and is defined: the row is not */
  assert.deepEqual(pieces([A, s, R(3, 0, 2, 2)])[0].type.inner, [ax(3)]);
});
test('a one by one shape that holds inner data is no scalar: it does not scale and is not passed over', () => {
  assert.equal(isScalar(R(0, 0, 1, 1)), true); assert.equal(isScalar(R(0, 0, 1, 1, [2])), false); assert.equal(isScalar(R(0, 0, 1, 1, [])), true);
  /* against a 3 by 3 it is a product of 1 column and 3 rows */
  assert.deepEqual(touches([R(0, 0, 1, 1, [2]), R(1, 0, 3, 3)]).map(x => [x.ok, x.note]), [[false, '1 ≠ 3']]);
  assert.equal(touches([R(0, 0, 1, 1), R(1, 0, 3, 3)])[0].ok, true);
  /* in a row it is a matrix like any other: 2×1 · [1×1 of 2] · 1×2 is 2 columns by 1 row... of products */
  assert.deepEqual(pieces([R(0, 0, 1, 2), R(1, 0, 1, 1, [2]), R(2, 0, 2, 1)])[0].type, { cols: 2, rows: 2, colsName: null, rowsName: null, inner: [ax(2)] });
  /* entry by entry it is not applied to every entry of a larger shape, as a scalar is */
  assert.equal(touches([R(0, 2, 3, 3), R(3, 1, 1, 1, [2])])[0].ok, false);
  assert.equal(touches([R(0, 2, 3, 3), R(3, 1, 1, 1)])[0].ok, true);
  assert.equal(touches([R(0, 1, 1, 1, [2]), R(1, 0, 1, 1, [2])])[0].ok, true);      /* two of one size: entry by entry as any two */
});
test('a sum never broadcasts: inner data agrees exactly, and one with none against one with some is refused', () => {
  const A = R(0, 0, 3, 2, [2, 4]);
  assert.deepEqual(touches([A, R(0, 2, 3, 2, [2, 4])]).map(x => [x.kind, x.ok]), [['sum', true]]);
  assert.deepEqual(pieces([A, R(0, 2, 3, 2, [2, 4])])[0].type.inner, [ax(2), ax(4)]);
  assert.deepEqual(touches([A, R(0, 2, 3, 2)]).map(x => [x.kind, x.ok, x.note]), [['sum', false, 'inner 2×4 ≠ none']]);
  assert.deepEqual(touches([R(0, 0, 3, 2), R(0, 2, 3, 2, [2, 4])]).map(x => [x.ok, x.note]), [[false, 'inner none ≠ 2×4']]);
  assert.equal(touches([A, R(0, 2, 3, 2, [2, 5])])[0].note, 'inner 4 ≠ 5');
});
test('times and over: inner data agrees or one has none, with the three broadcasts on the drawn sides', () => {
  const A = R(0, 2, 3, 2, [2]);
  assert.deepEqual(touches([A, R(3, 0, 3, 2, [2])]).map(x => [x.kind, x.ok]), [['times', true]]);
  assert.deepEqual(touches([A, R(3, 0, 3, 2)]).map(x => [x.kind, x.ok]), [['times', true]]);      /* one has none */
  assert.deepEqual(pieces([A, R(3, 0, 3, 2)])[0].type.inner, [ax(2)]);
  assert.deepEqual(touches([A, R(3, 1, 3, 1)]).map(x => [x.kind, x.ok]), [['times', true]]);      /* a row with no inner data, over every row at every position */
  assert.deepEqual(touches([A, R(3, 1, 1, 1)]).map(x => [x.kind, x.ok]), [['times', true]]);      /* a scalar */
  assert.deepEqual(touches([A, R(3, 4, 3, 2, [3])]).map(x => [x.kind, x.ok, x.note]), [['over', false, 'inner 2 ≠ 3']]);
});
test('a part of a shape keeps the inner position of every entry it takes', () => {
  const entries = new Map([['1,1,1', 'a'], ['2,1,1', 'b'], ['2,1,2', 'c'], ['2,2,2', 'd']]);
  assert.deepEqual([...partEntries({ col: 1, row: 0, cols: 1, rows: 2, toEnd: { cols: false, rows: false } }, { cols: 2, rows: 2, entries, turned: false })], [['1,1,1', 'b'], ['1,1,2', 'c'], ['1,2,2', 'd']]);
  assert.deepEqual([...partEntries({ col: 1, row: 0, cols: 1, rows: 2, toEnd: { cols: false, rows: false } }, { cols: 2, rows: 2, entries, turned: false }, true)], [['1,1,1', 'b'], ['1,1,2', 'c'], ['2,1,2', 'd']]);
  assert.deepEqual([...passed(entries, { col: 1, row: 1, cols: 1, rows: 1 })], [['1,1,2', 'd']]);
  assert.deepEqual([...passed(new Map([['2,2', 5]]), { col: 1, row: 1, cols: 1, rows: 1 })], [['1,1', 5]]);
});
test('a source that holds inner data has its rule at every inner position', () => {
  assert.deepEqual([...sourceValues('identity', 2, 2, [2])], [['1,1,1', 1], ['2,1,1', 0], ['1,2,1', 0], ['2,2,1', 1], ['1,1,2', 1], ['2,1,2', 0], ['1,2,2', 0], ['2,2,2', 1]]);
  assert.equal(sourceValues('ones', 3, 1, [2, 4]).size, 24);
  assert.deepEqual([...sourceValues('zeros', 1, 1)], [['1,1', 0]]);
  assert.equal(sourceValues('ones', 2, 2, [0]).size, 0); assert.equal(sourceValues('ones', 2, 2, 'x').size, 0);
});
test('arrows and tiles carry inner data along: a covered part keeps it, an input block that holds some takes the same, a pattern holds one kind', () => {
  const type = { cols: 3, rows: 4, colsName: null, rowsName: 'context', inner: [ax(2, 'key')] };
  assert.deepEqual(coveredType({ side: 'e', start: 2, span: 2 }, type), { cols: 3, rows: 2, colsName: null, rowsName: null, inner: [ax(2, 'key')] });
  assert.deepEqual(coveredType({ side: 'e', start: 1, span: 1 }, { cols: 3, rows: 4, colsName: null, rowsName: null }), { cols: 3, rows: 1, colsName: null, rowsName: null });
  const part = { cols: 3, rows: 1, colsName: null, rowsName: null, inner: [ax(2), ax(4)] };
  assert.deepEqual(fits({ cols: 3, rows: 1, colsName: null, rowsName: null, inner: [ax(2), ax(4)] }, part), { ok: true });
  assert.deepEqual(fits({ cols: 3, rows: 1, colsName: null, rowsName: null }, part), { ok: true });      /* no inner data of its own: run at every position */
  assert.match(fits({ cols: 3, rows: 1, colsName: null, rowsName: null, inner: [ax(2), ax(5)] }, part).refused, /inner 5 ≠ 4/);
  assert.match(fits({ cols: 3, rows: 1, colsName: null, rowsName: null, inner: [ax(2)] }, { cols: 3, rows: 1, colsName: null, rowsName: null }).refused, /inner 2 ≠ none/);
  const rep = { x: 0, y: 0, cols: 2, rows: 1 };
  assert.deepEqual(tiles.matrix(rep, 3, 1, [{ x: 0, y: 0, w: 1, h: 1, inner: [ax(2)] }, { x: 1, y: 0, w: 1, h: 1, inner: [ax(2)] }]), { cols: 6, rows: 1, inner: [ax(2)] });
  assert.deepEqual(tiles.matrix(rep, 3, 1, [{ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 }]), { cols: 6, rows: 1 });
  assert.match(tiles.matrix(rep, 3, 1, [{ x: 0, y: 0, w: 1, h: 1, inner: [ax(2)] }, { x: 1, y: 0, w: 1, h: 1 }]).error, /do not hold the same inner data/);
  assert.deepEqual([...tiles.entries(rep, 2, 1, [{ x: 0, y: 0, w: 2, h: 1 }], () => new Map([['1,1,2', 7], ['2,1,1', 8]]))], [['1,1,2', 7], ['2,1,1', 8], ['3,1,2', 7], ['4,1,1', 8]]);
});

/* ---- graph.js: a type and its checks ---- */
test('axes gives every axis of a type in order; a type with no inner data is written as it always was', () => {
  assert.deepEqual(axes(t(3, 1, [ax(2, 'key'), ax(4, 'embed')])), [ax(3), ax(1), ax(2, 'key'), ax(4, 'embed')]);
  assert.deepEqual(axes({ cols: 3, rows: 2, colsName: 'a', rowsName: null }), [ax(3, 'a'), ax(2)]);
  assert.deepEqual(tailsOf(t(3, 1)), ['']); assert.deepEqual(tailsOf(t(1, 1, [2, 2])), [',1,1', ',1,2', ',2,1', ',2,2']);
  assert.equal(AXES, 6);
});
test('validate: inner is a list of 1 to 6 axes, each exactly { length, name }, and a type has no other key', () => {
  const g = inner => G({ a: V({ cols: 2, rows: 2, colsName: null, rowsName: null, ...(inner === undefined ? {} : { inner }) }) });
  ok(g(undefined)); ok(g([ax(1)])); ok(g([ax(2, 'key'), ax(4)])); ok(g(Array.from({ length: 6 }, () => ax(2))));
  for (const inner of [[], Array.from({ length: 7 }, () => ax(2)), [ax(0)], [ax(1.5)], [{ length: 2 }], [{ length: 2, name: '' }], [{ length: 2, name: 7 }], [{ length: 2, name: null, x: 1 }], [2], 'x', null, 0])
    bad(g(inner), JSON.stringify(inner));
  bad(G({ a: V({ cols: 2, rows: 2, colsName: null, rowsName: null, depth: 2 }) }), 'another key');
});
test('validate: an entry key has two numbers and one more for each inner axis, each within its length', () => {
  const g = (type, key) => G({ a: { ...V(type), entries: { [key]: 7 } } });
  ok(g(t(3, 1, [2, 4]), '2,1,1,3')); ok(g(t(3, 1, [2, 4]), '3,1,2,4')); ok(g(t(3, 1), '3,1'));
  for (const key of ['2,1', '2,1,1', '2,1,1,3,1', '4,1,1,1', '3,2,1,1', '3,1,3,1', '3,1,2,5', '3,1,0,1', '3,1,01,1', '3,1,,1']) bad(g(t(3, 1, [2, 4]), key), key);
  bad(g(t(3, 1), '3,1,1'), 'an inner position in a shape with no inner data');
});
test('validate: a product is repeated at each inner position, where inner data agrees or one input has none', () => {
  const g = (a, b, out) => G({ a: V(a), b: V(b), p: N('matmul', ['a', 'b'], out) });
  ok(g(t(4, 5), t(2, 4, [ax(3, 'head')]), t(2, 5, [ax(3, 'head')])));      /* the proposal's example: X · W */
  ok(g(t(4, 5, [ax(3, 'head')]), t(2, 4, [3]), t(2, 5, [ax(3, 'head')])));
  bad(g(t(4, 5, [2]), t(2, 4, [3]), t(2, 5, [3])), 'inner 2 against 3');
  bad(g(t(4, 5, [ax(3, 'layer')]), t(2, 4, [ax(3, 'head')]), t(2, 5, [ax(3, 'head')])), 'two names');
  bad(g(t(4, 5), t(2, 4, [3]), t(2, 5)), 'the inner data left off the result');
  bad(g(t(4, 5), t(2, 4, [3]), t(2, 5, [ax(3, 'head')])), 'a name the inputs do not give');
  /* a one by one that holds inner data is not passed over by size */
  bad(g(t(1, 1, [2]), t(3, 3), t(3, 3, [2])), 'a 1 by 1 of inner data scaling');
  ok(g(t(1, 1, [2]), t(3, 1), t(3, 1, [2])));      /* but it is a 1 by 1 matrix: 1 column against 1 row */
});
test('validate: scale takes a scalar, which holds no inner data, and keeps the matrix\'s', () => {
  const g = (s, m, out) => G({ s: V(s), m: V(m), p: N('scale', ['s', 'm'], out) });
  ok(g(t(1, 1), t(3, 2, [2, 4]), t(3, 2, [2, 4])));
  bad(g(t(1, 1, [2]), t(3, 2, [2]), t(3, 2, [2])), 'a 1 by 1 with inner data as the scalar');
  bad(g(t(1, 1), t(3, 2, [2, 4]), t(3, 2)), 'inner data dropped');
});
test('validate: a sum needs inner data to agree exactly; times and over let one input have none', () => {
  const sum = (a, b, out) => G({ a: V(a), b: V(b), p: N('add', ['a', 'b'], out) });
  ok(sum(t(3, 2, [2]), t(3, 2, [2]), t(3, 2, [2])));
  bad(sum(t(3, 2, [2]), t(3, 2), t(3, 2, [2])), 'a sum against no inner data');
  bad(sum(t(3, 2), t(3, 2, [2]), t(3, 2, [2])), 'a sum against no inner data, the other way');
  bad(sum(t(3, 2, [2]), t(3, 2, [3]), t(3, 2, [2])), 'a sum of two inner sizes');
  const ew = (a, b, out, broadcast) => G({ a: V(a), b: V(b), p: N('ewise', ['a', 'b'], out, { fn: 'mul', broadcast }) });
  ok(ew(t(3, 2, [2]), t(3, 2, [2]), t(3, 2, [2]), 'none')); ok(ew(t(3, 2, [2]), t(3, 2), t(3, 2, [2]), 'none')); ok(ew(t(3, 2), t(3, 2, [2]), t(3, 2, [2]), 'none'));
  ok(ew(t(3, 2, [2]), t(1, 1), t(3, 2, [2]), 'scalar')); ok(ew(t(3, 2, [2]), t(3, 1), t(3, 2, [2]), 'row')); ok(ew(t(3, 2, [2]), t(1, 2, [2]), t(3, 2, [2]), 'col'));
  bad(ew(t(3, 2, [2]), t(3, 2, [3]), t(3, 2, [2]), 'none'), 'two inner sizes');
  bad(ew(t(3, 2, [2]), t(1, 1, [2]), t(3, 2, [2]), 'scalar'), 'a 1 by 1 with inner data is not applied to every entry');
  ok(ew(t(1, 2, [2]), t(1, 1, [2]), t(1, 2, [2]), 'row'));      /* as a single row over a single column's rows it is */
});
test('validate: slice, block, repeat, map and transpose carry inner data; a block\'s and a pattern\'s parts hold the same', () => {
  ok(G({ a: V(t(3, 2, [2])), p: N('slice', ['a'], t(2, 1, [2]), { range: { col: 1, row: 0, cols: 2, rows: 1 } }) }));
  bad(G({ a: V(t(3, 2, [2])), p: N('slice', ['a'], t(2, 1), { range: { col: 1, row: 0, cols: 2, rows: 1 } }) }), 'a slice that loses inner data');
  const block = (b, out) => G({ a: V(t(1, 2, [2])), b: V(b), p: N('block', ['a', 'b'], out, { at: [{ col: 0, row: 0 }, { col: 1, row: 0 }] }) });
  ok(block(t(2, 2, [2]), t(3, 2, [2])));
  assert.match(bad(block(t(2, 2), t(3, 2, [2])), 'a part with no inner data'), /do not hold the same inner data/);
  assert.match(bad(block(t(2, 2, [3]), t(3, 2, [2])), 'a part of another inner size'), /do not hold the same inner data/);
  const tile = { top: { owner: null, pieces: [], arrows: [], tiles: [{ tile: 't:1', blocks: [], arrows: [], node: 'p', error: null }] } };
  const rep = (b, out) => G({ a: V(t(1, 1, [2])), b: V(b), p: N('repeat', ['a', 'b'], out, { at: [{ col: 0, row: 0 }, { col: 1, row: 0 }], pattern: { cols: 2, rows: 1 }, across: 2, down: 1 }) }, {}, tile);
  ok(rep(t(1, 1, [2]), t(4, 1, [2]))); assert.match(bad(rep(t(1, 1), t(4, 1, [2])), 'a pattern of two kinds'), /do not hold the same inner data/);
  ok(G({ a: V(t(3, 2, [2])), p: N('map', ['a'], t(3, 2, [2]), { formula: 'x + k1' }) }));
  ok(G({ a: V(t(3, 2, [2])), m: V(t(3, 2)), s: V(t(1, 1)), w: V(t(3, 2, [2])), p: N('map', ['a', 'm', 's', 'w'], t(3, 2, [2]), { formula: 'x + $1 + $2 + $3' }) }));
  bad(G({ a: V(t(3, 2, [2])), m: V(t(3, 2, [3])), p: N('map', ['a', 'm'], t(3, 2, [2]), { formula: 'x + $1' }) }), 'a named matrix of another inner size');
  bad(G({ a: V(t(3, 2)), m: V(t(3, 2, [2])), p: N('map', ['a', 'm'], t(3, 2), { formula: 'x + $1' }) }), 'a named matrix that holds inner data the output does not');
  ok(G({ a: V(t(3, 2, [ax(2, 'k')], 'c', 'r')), p: N('transpose', ['a'], t(2, 3, [ax(2, 'k')], 'r', 'c')) }));
});
test('validate: a transpose with order names every axis once and moves an inner one; with none it swaps the drawn sides', () => {
  const g = (order, out) => G({ a: V(t(3, 1, [ax(2, 'key'), ax(4, 'embed')])), p: N('transpose', ['a'], out, order ? { order } : {}) });
  ok(g([2, 3, 0, 1], t(2, 4, [3, 1], 'key', 'embed')));      /* the entry's own sides drawn */
  ok(g([0, 1, 3, 2], t(3, 1, [ax(4, 'embed'), ax(2, 'key')])));
  ok(g([2, 1, 0, 3], t(2, 1, [3, ax(4, 'embed')], 'key')));
  for (const order of [[0, 1, 2, 3], [1, 0, 2, 3], [0, 1, 2], [0, 1, 2, 2], [0, 1, 2, 4], [2, 3, 0, '1'], [0, 1], 'x', []]) bad(g(order, t(3, 1, [ax(2, 'key'), ax(4, 'embed')])), 'order ' + JSON.stringify(order));
  bad(G({ a: V(t(3, 2)), p: N('transpose', ['a'], t(2, 3), { order: [1, 0] }) }), 'an order on a shape with no inner data');
  bad(g([2, 3, 0, 1], t(4, 2, [3, 1])), 'a type the order does not give');
});
test('validate: stack puts one part into each entry, all of one size; entry takes one out', () => {
  const part = (cols = 2, rows = 4, inner = null, names = ['key', 'embed']) => V(t(cols, rows, inner, ...names));
  const at3 = [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }], QKV = t(3, 1, [ax(2, 'key'), ax(4, 'embed')]);
  const g = (parts, at, out) => G({ ...Object.fromEntries(parts.map((p, i) => ['w' + i, p])), q: N('stack', parts.map((_, i) => 'w' + i), out, { at }) });
  ok(g([part(), part(), part()], at3, QKV));
  ok(g([part(2, 4, null, [null, null]), part(), part(2, 4, null, [null, null])], at3, QKV));      /* named by the part that names them */
  ok(g([part(2, 4, [5])], [{ col: 0, row: 0 }], t(1, 1, [ax(2, 'key'), ax(4, 'embed'), 5])));      /* one entry: a 1 by 1 that holds a matrix, and is no scalar */
  ok(g([part(), part(), part(), part()], [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }], t(2, 2, [ax(2, 'key'), ax(4, 'embed')])));
  bad(g([part(), part()], at3.slice(0, 2), QKV), 'two parts for three entries');
  bad(g([part(), part(), part()], [at3[0], at3[1], at3[1]], QKV), 'two parts on one entry');
  bad(g([part(), part(), part()], [at3[0], at3[1], { col: 3, row: 0 }], t(4, 1, [ax(2, 'key'), ax(4, 'embed')])), 'an entry left empty');
  bad(g([part(), part(3, 4), part()], at3, QKV), 'a part of another size');
  bad(g([part(), part(2, 4, null, ['query', 'embed']), part()], at3, QKV), 'a part whose side has another name');
  bad(g([part(), part(2, 4, [2]), part()], at3, QKV), 'a part with inner data of its own beside parts with none');
  bad(g([part(), part(), part()], at3.map(a => ({ ...a, col: a.col - 1 })), QKV), 'a place before the first entry');
  bad(g([V(t(2, 2, [2, 2, 2, 2, 2]))], [{ col: 0, row: 0 }], t(1, 1, [2, 2, 2, 2, 2, 2, 2])), 'seven inner axes');
  const e = (at, out, inType = QKV) => G({ q: V(inType), e: N('entry', ['q'], out, { at }) });
  ok(e({ col: 1, row: 0 }, t(2, 4, null, 'key', 'embed'))); ok(e({ col: 2, row: 0 }, t(2, 4, null, 'key', 'embed')));
  bad(e({ col: 3, row: 0 }, t(2, 4, null, 'key', 'embed')), 'an entry past the last'); bad(e({ col: 0, row: 1 }, t(2, 4, null, 'key', 'embed')), 'a row it has not got');
  bad(e({ col: -1, row: 0 }, t(2, 4, null, 'key', 'embed')), 'a place before the first'); bad(e({ col: 0 }, t(2, 4, null, 'key', 'embed')), 'no row');
  bad(e({ col: 0, row: 0 }, t(2, 4)), 'the names left off'); bad(e({ col: 0, row: 0 }, t(1, 1), t(3, 1)), 'an entry of a shape with no inner data');
  ok(e({ col: 0, row: 0 }, t(5, 1), t(3, 1, [5])));      /* one inner axis: that many columns in one row */
  ok(e({ col: 0, row: 0 }, t(2, 4, [5]), t(3, 1, [2, 4, 5])));      /* further axes stay inner */
});
test('validate: a measure reads an inner axis as d1, d2, …; a mass is a scalar\'s, and a 1 by 1 of inner data has none', () => {
  const g = (type, side) => G({ a: V(type), m: N('measure', ['a'], t(1, 1), { side }) });
  ok(g(t(3, 1, [2, 4]), 'd1')); ok(g(t(3, 1, [2, 4]), 'd2')); ok(g(t(3, 1, [2, 4]), 'x')); ok(g(t(1, 1), 'm'));
  bad(g(t(3, 1, [2, 4]), 'd3'), 'an axis it has not got'); bad(g(t(3, 1), 'd1'), 'no inner data'); bad(g(t(3, 1, [2]), 'd0'), 'd0'); bad(g(t(3, 1, [2]), 'd7'), 'd7');
  bad(g(t(1, 1, [2]), 'm'), 'the mass of a 1 by 1 that holds inner data');
});
test('validate: a function fits its input\'s inner data, or holds none and is run at each position', () => {
  const fn = (p, b = p) => ({ 'f:1': { input: 'param(f:1)', body: b === p ? 'param(f:1)' : 'body' } });
  const g = (p, given, out, body = null) => G({ x: V(given), 'param(f:1)': N('param', [], p, { within: ['f:1'] }),
    ...(body ? { body: N('transpose', ['param(f:1)'], body, { within: ['f:1'] }) } : {}), y: N('apply', ['x'], out, { fn: 'f:1' }) }, { 'f:1': { input: 'param(f:1)', body: body ? 'body' : 'param(f:1)' } });
  ok(g(t(3, 1, [2, 4]), t(3, 1, [2, 4]), t(3, 1, [2, 4])));      /* in holds the same: applied once */
  ok(g(t(3, 2), t(3, 2, [5]), t(2, 3, [5]), t(2, 3)));          /* in holds none: run at each position, the result takes the axes */
  ok(g(t(3, 2), t(3, 2), t(2, 3), t(2, 3)));
  bad(g(t(3, 1, [2, 4]), t(3, 1, [2, 5]), t(3, 1, [2, 4])), 'another inner size'); bad(g(t(3, 1, [2]), t(3, 1), t(3, 1, [2])), 'in holds inner data and what is given holds none');
  bad(g(t(3, 2), t(3, 2, [5]), t(2, 3), t(2, 3)), 'the inner axes left off the result');
  /* in has none, what is given has some, and the body comes to inner data of its own */
  const own = G({ x: V(t(2, 1, [5])), w: V(t(2, 1)), 'param(f:1)': N('param', [], t(2, 1), { within: ['f:1'] }),
    body: N('stack', ['param(f:1)', 'w'], t(2, 1, [2, 1]), { at: [{ col: 0, row: 0 }, { col: 1, row: 0 }], within: ['f:1'] }), y: N('apply', ['x'], t(2, 1, [2, 1]), { fn: 'f:1' }) }, { 'f:1': { input: 'param(f:1)', body: 'body' } });
  assert.match(bad(own, 'a body with inner data of its own'), /inner data of its own/);
  own.nodes.x = V(t(2, 1)); ok(own);      /* given no inner data, the same function is applied once and its result holds the stack */
});

/* ---- evaluate.js ---- */
const QKV = t(3, 1, [ax(2, 'key'), ax(4, 'embed')]);
const qkv = (c, r, k1, k2) => c * 100 + k1 * 10 + k2;
test('evaluate: a product of a matrix and a matrix of three heads is three products', () => {
  const X = [[1, 2], [3, 4]], W = h => [[h, 0], [0, 1]];      /* W at head h */
  const g = ok(G({ x: V(t(2, 2), (c, r) => X[r - 1][c - 1]), w: V(t(2, 2, [ax(3, 'head')]), (c, r, h) => W(h)[r - 1][c - 1]), p: N('matmul', ['x', 'w'], t(2, 2, [ax(3, 'head')])) }));
  assert.deepEqual(worked(g, 'p'), { '1,1,1': 1, '2,1,1': 2, '1,2,1': 3, '2,2,1': 4, '1,1,2': 2, '2,1,2': 2, '1,2,2': 6, '2,2,2': 4, '1,1,3': 3, '2,1,3': 2, '1,2,3': 9, '2,2,3': 4 });
  /* both hold it: position by position */
  const h = ok(G({ x: V(t(2, 1, [2]), (c, r, k) => c * k), w: V(t(1, 2, [2]), (c, r, k) => r + k), p: N('matmul', ['x', 'w'], t(1, 1, [2])) }));
  assert.deepEqual(worked(h, 'p'), { '1,1,1': 1 * 2 + 2 * 3, '1,1,2': 2 * 3 + 4 * 4 });
});
test('evaluate: a number never given is unknown at any depth; half an entry typed is half known', () => {
  const g = ok(G({ a: { ...V(QKV), entries: { '2,1,1,3': 7, '2,1,2,3': { expr: '1/√(4)' } } }, s: V(t(1, 1), () => 2), p: N('scale', ['s', 'a'], QKV) }));
  assert.deepEqual(worked(g, 'a'), { '2,1,1,3': 7, '2,1,2,3': { n: 1, d: 2, k: 0 } });
  assert.deepEqual(worked(g, 'p'), { '2,1,1,3': 14, '2,1,2,3': 1 });
});
test('evaluate: sum, times, over and scale at every inner position; one with no inner data is used at each', () => {
  const a = V(t(2, 1, [2]), (c, r, k) => c + 10 * k), b = V(t(2, 1, [2]), (c, r, k) => 100 * k), m = V(t(2, 1), c => c + 1), s = V(t(1, 1), () => 3);
  const g = ok(G({ a, b, m, s, sum: N('add', ['a', 'b'], t(2, 1, [2])), mul: N('ewise', ['a', 'm'], t(2, 1, [2]), { fn: 'mul', broadcast: 'none' }), div: N('ewise', ['b', 's'], t(2, 1, [2]), { fn: 'div', broadcast: 'scalar' }),
    sc: N('scale', ['s', 'a'], t(2, 1, [2])) }));
  assert.deepEqual(worked(g, 'sum'), { '1,1,1': 111, '2,1,1': 112, '1,1,2': 221, '2,1,2': 222 });
  assert.deepEqual(worked(g, 'mul'), { '1,1,1': 22, '2,1,1': 36, '1,1,2': 42, '2,1,2': 66 });
  assert.deepEqual(worked(g, 'div'), { '1,1,1': { n: 100, d: 3, k: 0 }, '2,1,1': { n: 100, d: 3, k: 0 }, '1,1,2': { n: 200, d: 3, k: 0 }, '2,1,2': { n: 200, d: 3, k: 0 } });
  assert.deepEqual(worked(g, 'sc'), { '1,1,1': 33, '2,1,1': 36, '1,1,2': 63, '2,1,2': 66 });
});
test('evaluate: a map\'s formula reads x there, i and j, and k1, k2 for the inner position; a formula in an entry reads k1 too', () => {
  const g = ok(G({ a: V(t(2, 1, [2, 2]), () => 1), m: V(t(2, 1), c => 1000 * c), p: N('map', ['a', 'm'], t(2, 1, [2, 2]), { formula: 'x + 10*i + 100*k1 + k2/2 + $1' }),
    q: N('map', ['m'], t(2, 1), { formula: 'x + k1' }), e: { ...V(t(1, 1, [3])), entries: { '1,1,1': { expr: 'k1 * 2' }, '1,1,3': { expr: 'k1 + k2' } } }, f: { ...V(t(1, 1)), entries: { '1,1': { expr: 'k1' } } } }));
  const f = n => ({ n: 2 * n + 1, d: 2, k: 0 });      /* n and a half */
  assert.deepEqual(worked(g, 'p'), { '1,1,1,1': f(1111), '2,1,1,1': f(2121), '1,1,1,2': 1112, '2,1,1,2': 2122, '1,1,2,1': f(1211), '2,1,2,1': f(2221), '1,1,2,2': 1212, '2,1,2,2': 2222 });
  assert.match(worked(g, 'q')['1,1'].err, /no inner data/);
  const e = worked(g, 'e'); assert.equal(e['1,1,1'], 2); assert.match(e['1,1,3'].err, /no inner axis 2/); assert.equal('1,1,2' in e, false);
  assert.match(worked(g, 'f')['1,1'].err, /no inner data/);
});
test('evaluate: slice, block, transpose and a tile carry every inner position', () => {
  const a = V(t(2, 2, [2]), (c, r, k) => c + 10 * r + 100 * k);
  const tile = { top: { owner: null, pieces: [], arrows: [], tiles: [{ tile: 't:1', blocks: [], arrows: [], node: 'rep', error: null }] } };
  const g = ok(G({ a, s: N('slice', ['a'], t(1, 2, [2]), { range: { col: 1, row: 0, cols: 1, rows: 2 } }), tr: N('transpose', ['a'], t(2, 2, [2])),
    b: N('block', ['s', 'a'], t(3, 2, [2]), { at: [{ col: 0, row: 0 }, { col: 1, row: 0 }] }),
    rep: N('repeat', ['s'], t(2, 2, [2]), { at: [{ col: 0, row: 0 }], pattern: { cols: 1, rows: 2 }, across: 2, down: 1 }) }, {}, tile));
  assert.deepEqual(worked(g, 's'), { '1,1,1': 112, '1,2,1': 122, '1,1,2': 212, '1,2,2': 222 });
  assert.deepEqual(worked(g, 'tr'), { '1,1,1': 111, '2,1,1': 121, '1,2,1': 112, '2,2,1': 122, '1,1,2': 211, '2,1,2': 221, '1,2,2': 212, '2,2,2': 222 });
  assert.deepEqual(worked(g, 'b')['1,1,2'], 212); assert.deepEqual(worked(g, 'b')['3,2,2'], 222); assert.equal(Object.keys(worked(g, 'b')).length, 12);
  assert.deepEqual(worked(g, 'rep'), { '1,1,1': 112, '2,1,1': 112, '1,2,1': 122, '2,2,1': 122, '1,1,2': 212, '2,1,2': 212, '1,2,2': 222, '2,2,2': 222 });
});
test('evaluate: stack puts matrices into entries and entry takes one out again: what went in', () => {
  const W = k => V(t(2, 4, null, 'key', 'embed'), (c, r) => k * 100 + c * 10 + r);
  const g = ok(G({ wq: W(1), wk: W(2), wv: W(3), q: N('stack', ['wq', 'wk', 'wv'], QKV, { at: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }] }),
    k: N('entry', ['q'], t(2, 4, null, 'key', 'embed'), { at: { col: 1, row: 0 } }), x: V(t(4, 2), (c, r) => (c === r ? 1 : 0)), xk: N('matmul', ['x', 'k'], t(2, 2, null, 'key')) }));
  const q = worked(g, 'q'); assert.equal(Object.keys(q).length, 24); assert.equal(q['2,1,1,3'], 213); assert.equal(q['3,1,2,4'], 324); assert.equal(q['1,1,1,1'], 111);
  assert.deepEqual(worked(g, 'k'), worked(g, 'wk'));
  assert.deepEqual(worked(g, 'xk'), { '1,1': 211, '2,1': 221, '1,2': 212, '2,2': 222 });      /* W_K touching X in an ordinary product */
  /* one inner axis: the entry is a single row of that many columns */
  const h = ok(G({ a: V(t(2, 1, [3]), (c, r, k) => c * 10 + k), e: N('entry', ['a'], t(3, 1), { at: { col: 1, row: 0 } }) }));
  assert.deepEqual(worked(h, 'e'), { '1,1': 21, '2,1': 22, '3,1': 23 });
});
test('evaluate: a transpose with order moves every number to where its axes now are', () => {
  const a = V(t(3, 1, [2, 4]), qkv);
  const g = ok(G({ a, p: N('transpose', ['a'], t(2, 4, [3, 1]), { order: [2, 3, 0, 1] }), back: N('transpose', ['p'], t(3, 1, [2, 4]), { order: [2, 3, 0, 1] }) }));
  const p = worked(g, 'p'); assert.equal(p['1,3,2,1'], qkv(2, 1, 1, 3)); assert.equal(p['2,4,3,1'], qkv(3, 1, 2, 4)); assert.equal(Object.keys(p).length, 24);
  assert.deepEqual(worked(g, 'back'), worked(g, 'a'));
});
test('evaluate: a function whose input block holds inner data is applied once; one that holds none is run at each inner position', () => {
  /* f(in) = in · W, with in 2 by 1 and W 1 by 2 */
  const fn = { 'f:1': { input: 'param(f:1)', body: 'body' } };
  const g = ok(G({ x: V(t(2, 1, [3]), (c, r, k) => c * k), w: V(t(1, 2), (c, r) => r), 'param(f:1)': N('param', [], t(2, 1), { within: ['f:1'] }),
    body: N('matmul', ['param(f:1)', 'w'], t(1, 1), { within: ['f:1'] }), y: N('apply', ['x'], t(1, 1, [3]), { fn: 'f:1' }) }, fn));
  assert.deepEqual(worked(g, 'y'), { '1,1,1': 1 + 4, '1,1,2': 2 + 8, '1,1,3': 3 + 12 });
  /* g(in) = the second entry of in, where in is 3 by 1 of 2 by 4: the attention input */
  const h = ok(G({ q: V(QKV, qkv), 'param(f:1)': N('param', [], QKV, { within: ['f:1'] }), body: N('entry', ['param(f:1)'], t(2, 4, null, 'key', 'embed'), { at: { col: 1, row: 0 }, within: ['f:1'] }),
    y: N('apply', ['q'], t(2, 4, null, 'key', 'embed'), { fn: 'f:1' }) }, fn));
  const y = worked(h, 'y'); assert.equal(Object.keys(y).length, 8); assert.equal(y['2,4'], qkv(2, 1, 2, 4)); assert.equal(y['1,1'], qkv(2, 1, 1, 1));
});
test('evaluate: a source holds its rule at every inner position, and a measure reads an inner length', () => {
  const g = ok(G({ i: N('source', [], t(2, 2, [2]), { kind: 'identity' }), v: { ...V(t(2, 2, [ax(2, 'head')])), inputs: ['i'], defined: 'source' }, d: N('measure', ['v'], t(1, 1), { side: 'd1' }), x: N('measure', ['v'], t(1, 1), { side: 'x' }) }));
  assert.deepEqual(worked(g, 'v'), { '1,1,1': 1, '2,1,1': 0, '1,2,1': 0, '2,2,1': 1, '1,1,2': 1, '2,1,2': 0, '1,2,2': 0, '2,2,2': 1 });
  assert.deepEqual(worked(g, 'd'), { '1,1': 2 }); assert.deepEqual(worked(g, 'x'), { '1,1': 2 });
  bad(G({ f: N('source', [], t(2, 2, [2]), { kind: 'file', path: 'data/w.csv' }) }), 'a data file with inner data');
});
test('evaluate: the limit counts numbers: 4 by 4 of 16 by 16 is worked out, 4 by 4 of 17 by 16 is deferred', () => {
  const at = t(4, 4, [16, 16]), over = t(4, 4, [17, 16]);
  const g = ok(G({ a: V(at, () => 1), b: V(over), s: V(t(1, 1), () => 2), p: N('scale', ['s', 'a'], at), q: N('scale', ['s', 'b'], over), m: N('measure', ['b'], t(1, 1), { side: 'd1' }) }));
  const p = worked(g, 'p'); assert.equal(Object.keys(p).length, MOST); assert.equal(p['4,4,16,16'], 2);
  assert.deepEqual(evaluate(g, 'q'), { type: over, deferred: true }); assert.deepEqual(evaluate(g, 'b'), { type: over, deferred: true });
  assert.deepEqual(worked(g, 'm'), { '1,1': 17 });      /* a length is read off the type: it does not wait on the numbers */
  assert.match(tooLarge(over), /^it holds 4 × 4 × 17 × 16 numbers, more than the 4096/);
  assert.deepEqual(evaluate(g, 'p', { maxEntries: 4095 }), { type: at, deferred: true });
});
test('every operation says whether it reads inner positions itself', () => {
  for (const op of ['matmul', 'scale', 'add', 'ewise', 'map']) assert.equal(OPS[op].deep, undefined, op);
  for (const op of ['variable', 'transpose', 'block', 'slice', 'source', 'noise', 'measure', 'param', 'repeat', 'stack', 'entry']) assert.equal(OPS[op].deep, true, op);
  for (const op of ['apply', 'mapalong']) assert.equal(typeof OPS[op].deep, 'function', op);
});
test('evaluate: looked at from inside a function that is run at each inner position, its body is seen at the first position', () => {
  const fn = { 'f:1': { input: 'param(f:1)', body: 'body' } };
  const g = ok(G({ x: V(t(2, 1, [3]), (c, r, k) => c * k), w: V(t(1, 2), (c, r) => r), 'param(f:1)': N('param', [], t(2, 1), { within: ['f:1'] }),
    body: N('matmul', ['param(f:1)', 'w'], t(1, 1), { within: ['f:1'] }), y: N('apply', ['x'], t(1, 1, [3]), { fn: 'f:1' }) }, fn));
  assert.deepEqual(worked(g, 'param(f:1)', { binding: { params: { 'f:1': 'x' } } }), { '1,1': 1, '2,1': 2 });
  assert.deepEqual(worked(g, 'body', { binding: { params: { 'f:1': 'x' } } }), { '1,1': 5 });
  assert.deepEqual(worked(g, 'y'), { '1,1,1': 5, '1,1,2': 10, '1,1,3': 15 });      /* and the arrow's output is every position's */
});

/* ---- what the builder makes of a canvas that holds inner data ---- */
import { build } from '../graph.js';
import { ends, came } from '../arrows.js';
const B = (id, x, y, cols, rows, more = {}) => ({ id, type: 'tensor', name: id, x, y, cols, rows, colsName: null, rowsName: null, entries: {}, inside: null, variable: null, ...more });
const space = (shapes, groups = [], operations = []) => ({ shapes, groups, operations });
const snap = (shapes, groups = [], operations = []) => ({ top: space(shapes, groups, operations) });
const arrow = (id, input, more = {}, shapeMore = {}) => B(id, 0, 0, 1, 1, { type: 'arrow', name: 'Shape 9', arrow: { input, side: 'e', start: 1, span: 1, gap: 2, gapName: null, output: null, formula: null, ...more }, ...shapeMore });
const made = s => { const g = build(s); assert.deepEqual(validate(g), []); assert.deepEqual(build(JSON.parse(JSON.stringify(s))), g); return g; };
const fill = (cols, rows, inner, f) => { const out = {}; for (const tail of tailsOf(t(cols, rows, inner.length ? inner : null))) for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) out[c + ',' + r + tail] = f(c, r, ...tail.split(',').slice(1).map(Number)); return out; };
const head3 = [ax(3, 'head')];

test('build: a shape\'s inner axes are its variable\'s type; a shape with none is built exactly as before', () => {
  const g = made(snap([B('X', 0, 0, 4, 5), B('W', 4, 0, 2, 4, { inner: head3 })]));
  assert.deepEqual(g.nodes['v:W'].type, t(2, 4, head3)); assert.deepEqual(g.nodes['v:X'].type, { cols: 4, rows: 5, colsName: null, rowsName: null });
  assert.deepEqual(g.spaces.top.pieces[0], { blocks: ['X', 'W'], rule: 'product', node: 'matmul(v:X,v:W)', error: null });
  assert.deepEqual(g.nodes['matmul(v:X,v:W)'].type, t(2, 5, head3));      /* three products */
  /* inner that is no list, or has more than six axes, is read with safe values and never throws */
  for (const inner of [null, 7, 'x', [null, 3], [{ length: 'a' }], Array.from({ length: 9 }, () => ax(2))]) made(snap([B('W', 4, 0, 2, 4, { inner })]));
  assert.equal(made(snap([B('W', 4, 0, 2, 4, { inner: Array.from({ length: 9 }, () => ax(2)) })])).nodes['v:W'].type.inner.length, 6);
  assert.deepEqual(made(snap([arrow('a', { id: 'W', as: 'block' }, {}, { inner: head3 }), B('W', 4, 0, 2, 4)])).nodes['v:W'].type, t(2, 4));      /* an arrow has none */
});
test('build: a touch whose inner data does not agree is a mismatch with the note; a sum against no inner data is refused', () => {
  const piece = shapes => made(snap(shapes)).spaces.top.pieces[0];
  assert.deepEqual(piece([B('X', 0, 0, 4, 5, { inner: [ax(3, 'layer')] }), B('W', 4, 0, 2, 4, { inner: head3 })]).error, { code: 'mismatch', note: 'layer ≠ head' });
  assert.deepEqual(piece([B('X', 0, 0, 4, 5, { inner: [ax(2)] }), B('W', 4, 0, 2, 4, { inner: head3 })]).error, { code: 'mismatch', note: 'inner 2 ≠ 3' });
  assert.deepEqual(piece([B('A', 0, 0, 3, 2, { inner: [ax(2)] }), B('C', 0, 2, 3, 2)]).error, { code: 'mismatch', note: 'inner 2 ≠ none' });
  assert.equal(piece([B('A', 0, 0, 3, 2, { inner: [ax(2)] }), B('C', 0, 2, 3, 2, { inner: [ax(2)] })]).node, 'add(v:A,v:C)');
  assert.equal(piece([B('A', 0, 2, 3, 2, { inner: [ax(2)] }), B('C', 3, 0, 3, 2)]).node, 'ewise(v:A,v:C;mul;none)');      /* times lets one have none */
  /* a row whose touches all agree and whose inner data does not: A · s · C */
  assert.deepEqual(piece([B('A', 0, 0, 2, 2, { inner: [ax(3)] }), B('s', 2, 0, 1, 1), B('C', 3, 0, 2, 2, { inner: [ax(2)] })]).error.code, 'mismatch');
});
test('build: a one by one block that holds inner data exists as a part of another, and is no scalar: no mass, no scaling, not passed over', () => {
  const S = B('S', 0, 0, 3, 1, { inner: [ax(2)], entries: fill(3, 1, [ax(2)], (c, r, k) => c * 10 + k) });
  const P = B('P', 10, 0, 1, 1, { inner: [ax(2)], from: { id: 'S', range: { col: 1, row: 0, cols: 1, rows: 1, toEnd: { cols: false, rows: false } } } });
  const g = made(snap([S, P, B('M', 11, 0, 3, 3), B('N', 20, 0, 1, 1, { entries: { '1,1': { expr: '@[P:m]' }, }, }), B('L', 30, 0, 3, 1, { entries: { '1,1': { expr: '@[P:x] + @[P:d1]' } } }), B('Mass', 40, 0, 1, 1, { name: 'Shape 4', from: { id: 'P', side: 'm' } })]));
  assert.deepEqual(g.nodes['v:P'].type, t(1, 1, [ax(2)])); assert.equal(g.nodes['v:P'].defined, 'range');
  assert.deepEqual(evaluate(g, 'v:P').entries, { '1,1,1': 21, '1,1,2': 22 });
  assert.deepEqual(g.spaces.top.pieces.find(p => p.blocks.includes('P')), { blocks: ['P', 'M'], rule: 'product', node: null, error: { code: 'mismatch', note: '1 ≠ 3' } });      /* against a 3 by 3 it is 1 column and 3 rows, where a scalar would scale it */
  assert.deepEqual(g.nodes['v:N'].entries, { '1,1': { err: 'not a scalar: it has no mass' } });
  assert.deepEqual(evaluate(g, 'v:L').entries, { '1,1': 3 });      /* its sides are 1 and 1, not the root of a mass; and its inner axis is 2 long */
  assert.deepEqual(g.nodes['v:Mass'].error, { code: 'no-source', note: 'not a single entry: it has no mass' });
  /* the same block with no inner data is a scalar, and all three hold */
  const plain = made(snap([B('S', 0, 0, 3, 1), { ...P, inner: null }, B('M', 11, 0, 3, 3)]));
  assert.equal(plain.spaces.top.pieces.find(p => p.blocks.includes('P')).node, 'scale(v:P,v:M)');
});
test('build: the lengths of inner axes are measures d1, d2, …; k1, k2 in an entry\'s formula and in an arrow\'s are the inner position', () => {
  const Q = B('Q', 0, 0, 2, 1, { inner: [ax(2, 'key'), ax(3)], entries: { '1,1,1,1': { expr: 'k1 * 10 + k2' }, '2,1,2,3': { expr: 'k1 * 10 + k2 + @[Q:d2]' }, '1,1,2,2': { expr: 'k3' } } });
  const g = made(snap([Q, B('L', 10, 0, 3, 1, { entries: { '1,1': { expr: '@[Q:d1] * @[Q:d2]' }, '2,1': { expr: '@[Q:d3]' }, '3,1': { expr: '@[L:d1]' } } }),
    arrow('f', { id: 'Q', as: 'block' }, { side: 's', span: 2, formula: 'x + k2 / 2' })]));
  assert.deepEqual(evaluate(g, 'v:Q').entries['1,1,1,1'], 11); assert.deepEqual(evaluate(g, 'v:Q').entries['2,1,2,3'], 26); assert.match(evaluate(g, 'v:Q').entries['1,1,2,2'].err, /no inner axis 3/);
  assert.deepEqual(g.nodes['measure(v:Q;d1)'], { op: 'measure', inputs: ['v:Q'], type: t(1, 1), side: 'd1' });
  assert.deepEqual(g.nodes['v:L'].entries, { '1,1': { expr: '$1 * $2' }, '2,1': { err: 'it has no inner axis 3' }, '3,1': { err: 'it holds no inner data' } });
  assert.deepEqual(evaluate(g, 'v:L').entries['1,1'], 6);
  const out = g.spaces.top.arrows[0]; assert.equal(out.error, null); assert.equal(g.nodes[out.node].op, 'map'); assert.deepEqual(g.nodes[out.node].type, t(2, 1, [ax(2, 'key'), ax(3)]));
  assert.deepEqual(evaluate(g, out.node).entries['1,1,1,1'], { n: 23, d: 2, k: 0 }); assert.deepEqual(evaluate(g, out.node).entries['2,1,2,3'], { n: 55, d: 2, k: 0 });
  /* an attribute called k1 is still the attribute */
  const own = made(snap([B('A', 0, 0, 1, 1, { attributes: [{ name: 'k1', value: '7' }], entries: { '1,1': { expr: 'k1 + 1' } } })]));
  assert.deepEqual(evaluate(own, 'v:A').entries, { '1,1': 8 });
});
test('build: shapes standing in the entries of a shape that holds inner data are a stack, all or nothing, each the size of an entry', () => {
  const W = (id, x, k, more = {}) => B(id, x, -2, 2, 4, { standing: true, entries: fill(2, 4, [], (c, r) => k * 100 + c * 10 + r), ...more });
  const QKV = inside => B('QKV', 0, 0, 3, 1, { inner: [ax(2, 'key'), ax(4, 'embed')], entries: { '1,1,1,1': 9 }, inside });
  const g = made(snap([QKV(space([W('WQ', -7, 1), W('WK', -5, 2), W('WV', -3, 3)]))]));
  assert.equal(g.nodes['v:QKV'].defined, 'standing'); assert.deepEqual(g.nodes['v:QKV'].inputs, ['stack(v:WQ@0,0;v:WK@1,0;v:WV@2,0)']);
  assert.deepEqual(g.nodes['stack(v:WQ@0,0;v:WK@1,0;v:WV@2,0)'].type, t(3, 1, [2, 4]));
  const q = evaluate(g, 'v:QKV').entries; assert.equal(Object.keys(q).length, 24); assert.equal(q['2,1,1,3'], 213); assert.equal(q['1,1,1,1'], 111);      /* never mixed with what was typed into it */
  assert.deepEqual(g.spaces['v:QKV'].pieces, []);
  /* two of the three: it keeps its own entries, and the standing shapes define nothing yet */
  const two = made(snap([QKV(space([W('WQ', -7, 1), W('WK', -5, 2)]))]));
  assert.equal(two.nodes['v:QKV'].defined, 'entries'); assert.deepEqual(evaluate(two, 'v:QKV').entries, { '1,1,1,1': 9 });
  /* a shape that is not the size of an entry does not stand in one: the space is pieces again */
  const odd = made(snap([QKV(space([W('WQ', -7, 1), W('WK', -5, 2), B('WV', -3, -2, 2, 3, { standing: true })]))]));
  assert.equal(odd.nodes['v:QKV'].defined, 'entries'); assert.equal(odd.nodes['v:QKV'].error.code, 'mismatch');      /* (they lie side by side: a row of products that does not agree) */
  /* parts that are the size of an entry and hold inner data of their own where an entry holds none */
  const deep = made(snap([QKV(space([W('WQ', -7, 1), W('WK', -5, 2), W('WV', -3, 3, { inner: [ax(2)], entries: {} })]))]));
  assert.deepEqual(deep.nodes['v:QKV'].error, { code: 'size', note: 'the shapes standing in its entries are not all what an entry holds' });
  /* a side called by another name than the axis it becomes */
  const named = made(snap([QKV(space([W('WQ', -7, 1, { colsName: 'query' }), W('WK', -5, 2), W('WV', -3, 3)]))]));
  assert.deepEqual(named.nodes['v:QKV'].error, { code: 'size', note: 'query ≠ key' });
  /* with no inner data, standing shapes are a block as they always were */
  const flat = made(snap([B('M', 0, 0, 2, 1, { inside: space([B('a', -3, 0, 1, 1, { standing: true }), B('b', -2, 0, 1, 1, { standing: true })]) })]));
  assert.deepEqual(flat.nodes['v:M'].inputs, ['block(v:a@0,0;v:b@1,0)']);
});
test('build: an entry taken out is that entry of its shape, by column and row from 1; what is not there is no-source', () => {
  const Q = B('Q', 0, 0, 3, 1, { inner: [ax(2, 'key'), ax(4, 'embed')], entries: fill(3, 1, [ax(2), ax(4)], (c, r, a, b) => c * 100 + a * 10 + b) });
  const E = (id, entry, more = {}) => B(id, 10, 0, 2, 4, { name: 'Shape 2', from: { id: 'Q', entry }, ...more });
  const g = made(snap([Q, E('K', { col: 2, row: 1 }), B('X', 6, 0, 4, 2, { entries: fill(4, 2, [], (c, r) => (c === r ? 1 : 0)) })]));
  assert.equal(g.nodes['v:K'].defined, 'entry'); assert.deepEqual(g.nodes['v:K'].inputs, ['entry(v:Q;1,0)']); assert.deepEqual(g.nodes['entry(v:Q;1,0)'].type, t(2, 4, null, 'key', 'embed'));
  assert.equal(evaluate(g, 'v:K').entries['2,4'], 224);
  assert.deepEqual(g.spaces.top.pieces.find(p => p.blocks.includes('K')), { blocks: ['X', 'K'], rule: 'product', node: 'matmul(v:X,v:K)', error: null });      /* it touches X in an ordinary product */
  assert.deepEqual(evaluate(g, 'matmul(v:X,v:K)').entries, { '1,1': 211, '2,1': 221, '1,2': 212, '2,2': 222 });
  for (const [entry, note] of [[{ col: 4, row: 1 }, 'entry 4,1 of 3 × 1'], [{ col: 1, row: 2 }, 'entry 1,2 of 3 × 1'], [{ col: 0, row: 1 }, 'entry 0,1 of 3 × 1']])
    assert.deepEqual(made(snap([Q, E('K', entry)])).nodes['v:K'].error, { code: 'no-source', note });
  assert.deepEqual(made(snap([B('Q', 0, 0, 3, 1), E('K', { col: 1, row: 1 })])).nodes['v:K'].error, { code: 'no-source', note: 'it holds no inner data: an entry of it is one number' });
  assert.deepEqual(made(snap([E('K', { col: 1, row: 1 })])).nodes['v:K'].error, { code: 'no-source', note: '' });      /* its shape is gone */
  assert.equal(made(snap([Q, E('K', { col: 1, row: 1 }, { cols: 3 })])).nodes['v:K'].error.code, 'size');      /* a block of another size than the entry */
  /* a transposed use of the entry is the transpose of it */
  const tr = made(snap([Q, E('K', { col: 2, row: 1 }, { cols: 4, rows: 2, transposed: true })]));
  assert.equal(tr.blocks.K, 'transpose(v:K)'); assert.equal(evaluate(tr, 'transpose(v:K)').entries['4,2'], 224);
});
test('build: a function whose input block holds inner data is applied once, and an entry taken out of in is entry(param); one that holds none is run at each position', () => {
  const Q = B('Q', 0, 0, 3, 1, { inner: [ax(2), ax(2)], entries: fill(3, 1, [ax(2), ax(2)], (c, r, a, b) => c * 100 + a * 10 + b) });
  const body = space([B('in', -20, 0, 3, 1, { in: true, inner: [ax(2), ax(2)] }), B('K', 0, 0, 2, 2, { name: 'Shape 2', from: { id: 'in', entry: { col: 2, row: 1 } } }), B('I', 2, 0, 2, 2, { source: 'identity' })]);
  const g = made(snap([Q, arrow('a1', { id: 'Q', as: 'block' }, { side: 's', span: 3 }, { name: 'second', inside: body })]));
  const out = g.spaces.top.arrows[0]; assert.deepEqual(out, { arrow: 'a1', node: 'apply(v:Q;f:a1)', error: null });
  assert.deepEqual(g.nodes['param(f:a1)'].type, t(3, 1, [2, 2])); assert.deepEqual(g.nodes['v:K'].inputs, ['entry(param(f:a1);1,0)']); assert.deepEqual(g.nodes['v:K'].within, ['f:a1']);
  assert.deepEqual(g.spaces['f:a1'].pieces.map(p => p.blocks), [['in'], ['K', 'I']]);      /* in is read from, by the entry taken out of it: the space comes to the one product */
  assert.deepEqual(evaluate(g, out.node).entries, { '1,1': 211, '2,1': 221, '1,2': 212, '2,2': 222 });
  /* a function on a plain 2 by 1, set against a 2 by 1 that holds three numbers to an entry: the body at each */
  const fn = space([B('in', -20, 0, 2, 1, { in: true }), B('W', -18, 0, 1, 2, { entries: { '1,1': 1, '1,2': 2 } })]);
  const h = made(snap([B('X', 0, 0, 2, 1, { inner: [ax(3)], entries: fill(2, 1, [ax(3)], (c, r, k) => c * k) }), arrow('a2', { id: 'X', as: 'block' }, { side: 's', span: 2 }, { name: 'dot', inside: fn })]));
  const o2 = h.spaces.top.arrows[0]; assert.equal(o2.error, null); assert.deepEqual(h.nodes[o2.node].type, t(1, 1, [3]));
  assert.deepEqual(evaluate(h, o2.node).entries, { '1,1,1': 5, '1,1,2': 10, '1,1,3': 15 });
  /* an input block that holds other inner data than it is set against does not fit */
  const bad = made(snap([{ ...Q, inner: [ax(2), ax(3)], entries: {} }, arrow('a1', { id: 'Q', as: 'block' }, { side: 's', span: 3 }, { name: 'second', inside: body })]));
  assert.deepEqual(bad.spaces.top.arrows[0], { arrow: 'a1', node: null, error: { code: 'mismatch', note: 'inner 2 ≠ 3' } });
});
test('build: sources hold inner data, a data file does not; a definition, a fused shape and a tile\'s pattern hold what their variable holds', () => {
  const g = made(snap([B('Z', 0, 0, 2, 2, { source: 'identity', inner: [ax(2, 'head')] }), B('N', 10, 0, 2, 2, { source: { noise: { seed: 1, dist: 'uniform' } }, inner: [ax(3)] }), B('F', 20, 0, 2, 2, { source: { file: 'data/w.csv' }, inner: [ax(2)] })]));
  assert.deepEqual(g.nodes['v:Z'].inputs, ['source(identity;2×2·2)']); assert.equal(evaluate(g, 'v:Z').entries['2,2,2'], 1); assert.equal(evaluate(g, 'v:Z').entries['2,1,2'], 0);
  assert.deepEqual(g.nodes['v:N'].inputs, ['noise(1;uniform;N;2×2·3)']); assert.deepEqual(evaluate(g, 'v:N'), { type: t(2, 2, [3]), deferred: true, backend: true });
  assert.deepEqual(g.nodes['v:F'].error, { code: 'no-source', note: 'a data file holds no inner data' });
  /* a definition that comes to other inner data than its block holds */
  const def = inner => made(snap([B('V', 0, 0, 2, 2, { inner: [ax(2)], inside: space([B('A', 0, 0, 2, 2, { inner })]) })])).nodes['v:V'];
  assert.equal(def([ax(2)]).defined, 'definition'); assert.deepEqual(def([ax(3)]).error, { code: 'size', note: '2 × 2 · 3 ≠ 2 × 2 · 2' }); assert.deepEqual(def(null).error, { code: 'size', note: '2 × 2 ≠ 2 × 2 · 2' });
  assert.deepEqual(made(snap([B('V', 0, 0, 2, 2, { inner: [ax(2, 'head')], inside: space([B('A', 0, 0, 2, 2, { inner: [ax(2, 'layer')] })]) })])).nodes['v:V'].error, { code: 'size', note: 'layer ≠ head' });
  /* a pattern whose blocks do not hold the same */
  const tile = (a, b) => made(snap([B('a', 0, 0, 1, 1, { inner: a }), B('b', 1, 0, 1, 1, { inner: b })], [{ id: 't1', name: null, members: [0, 1], groups: [], repeat: { x: 0, y: 0, cols: 2, rows: 1, across: 2, down: 1 } }])).spaces.top.tiles[0];
  assert.equal(tile([ax(2)], [ax(2)]).error, null); assert.deepEqual(made(snap([B('a', 0, 0, 1, 1, { inner: [ax(2)] }), B('b', 1, 0, 1, 1, { inner: [ax(2)] })], [{ id: 't1', name: null, members: [0, 1], groups: [], repeat: { x: 0, y: 0, cols: 2, rows: 1, across: 2, down: 1 } }])).nodes[tile([ax(2)], [ax(2)]).node].type, t(4, 1, [2]));
  assert.deepEqual(tile([ax(2)], null).error, { code: 'no-source', note: 'its blocks do not hold the same inner data: inner 2 ≠ none' });
});
test('arrows: a block an entry is taken out of is read from, so its piece is no end; a function run at each inner position takes its input\'s axes', () => {
  const pieces = [{ ids: ['in'], type: {} }, { ids: ['X', 'K'], type: { cols: 2, rows: 2 } }];
  assert.equal(ends(pieces, []).length, 2); assert.deepEqual(ends(pieces, [], ['in']).map(e => e.piece.ids), [['X', 'K']]); assert.equal(ends(pieces, [], ['gone']).length, 2);
  const part = { cols: 2, rows: 1, colsName: null, rowsName: null, inner: [ax(3)] }, plain = { cols: 2, rows: 1, colsName: null, rowsName: null }, body = { cols: 1, rows: 1, colsName: null, rowsName: null };
  assert.deepEqual(came({ formula: null }, part, body, plain), { ...body, inner: [ax(3)] });      /* in holds none: at each position */
  assert.deepEqual(came({ formula: null }, part, body, part), body);                            /* in holds the same: applied once */
  assert.deepEqual(came({ formula: null }, part, body), body);                                  /* (the function's own arrow: its input block is the part) */
  assert.match(came({ formula: null }, part, { ...body, inner: [ax(2)] }, plain).error, /inner data of its own/);
  assert.deepEqual(came({ formula: 'x' }, part, body, plain), part); assert.deepEqual(came({ formula: null }, plain, null), plain); assert.deepEqual(came({ formula: null }, plain, body), body);
  assert.deepEqual(came({ formula: null }, part, { error: '2 pieces' }, plain), { error: '2 pieces' });
});

/* ---- the example project ---- */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { read } from '../project.js';
test('projects/inner-data: QKV is a stack of its three matrices, attend takes it whole and takes its entries out, and comes to X·Q·Kᵀ·Xᵀ·X·V', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'projects', 'inner-data');
  const tree = (at = '') => readdirSync(join(dir, at)).flatMap(n => statSync(join(dir, at, n)).isDirectory() ? tree(at + n + '/') : [{ path: at + n, text: readFileSync(join(dir, at, n), 'utf8') }]);
  const p = read(tree()), g = build(p); assert.deepEqual(validate(g), []);
  const id = name => p.top.shapes.find(d => d.name === name).id, qkv = g.nodes['v:' + id('QKV')];
  assert.equal(qkv.defined, 'standing'); assert.equal(g.nodes[qkv.inputs[0]].op, 'stack'); assert.deepEqual(qkv.type, t(3, 1, [ax(2, 'key'), ax(4, 'embed')]));
  assert.equal(Object.keys(evaluate(g, 'v:' + id('QKV')).entries).length, 24);
  const out = g.spaces.top.arrows[0]; assert.equal(out.error, null); assert.equal(g.nodes[out.node].op, 'apply'); assert.deepEqual(g.nodes[out.node].inputs, ['v:' + id('QKV')]);
  const fn = g.nodes[out.node].fn; assert.deepEqual(g.nodes[g.functions[fn].input].type, qkv.type);      /* in is 3 by 1 of 2 by 4 */
  assert.deepEqual(Object.keys(g.nodes).filter(k => k.startsWith('entry(')).sort(), [0, 1, 2].map(c => `entry(param(${fn});${c},0)`));
  assert.deepEqual(evaluate(g, out.node).entries, { '1,1': 18, '2,1': 18, '1,2': 16, '2,2': 16, '1,3': 14, '2,3': 14 });
  /* X against three heads at once: one product for each */
  const heads = g.spaces.top.pieces.find(x => x.blocks.includes(id('Heads'))); assert.equal(heads.error, null); assert.deepEqual(g.nodes[heads.node].type, t(2, 3, [ax(3, 'head')]));
  const h = evaluate(g, heads.node).entries; assert.equal(Object.keys(h).length, 18); assert.equal(h['1,1,1'], 3); assert.equal(h['1,1,3'], 9); assert.equal(h['2,2,2'], 4);
});
