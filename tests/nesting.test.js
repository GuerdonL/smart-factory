/* inner.js: what the page asks about a shape's inner data: its axes as they are kept, the number of data
   dimensions as it is typed, what an entry opened holds, and how it is all said. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as inner from '../inner.js';

const ax = (length, name = null) => ({ length, name });
test('inner.kept: axes are whole lengths of at least 1 with a name or none, at most six', () => {
  assert.deepEqual(inner.kept([{ length: 2, name: 'key' }, { length: 4 }]), [ax(2, 'key'), ax(4)]);
  assert.deepEqual(inner.kept([{ length: 2.6, name: '' }, { length: 0, name: 7 }, null, 'x']), [ax(3), ax(1)]);
  assert.deepEqual(inner.kept(null), []); assert.deepEqual(inner.kept('x'), []); assert.equal(inner.kept(Array.from({ length: 9 }, () => ax(2))).length, 6);
  assert.deepEqual(inner.tails([ax(2), ax(2)]), [',1,1', ',1,2', ',2,1', ',2,2']); assert.deepEqual(inner.tails([]), ['']);
  assert.equal(inner.numbers(3, 1, [ax(2), ax(4)]), 24); assert.equal(inner.numbers(3, 2, null), 6);
});
test('the number of data dimensions is a whole number from 0 to 6, worked out once', () => {
  for (const n of [0, 1, 6]) assert.deepEqual(inner.counted(n), { count: n });
  for (const v of [7, -1, 1.5, { n: 1, d: 2, k: 0 }, null, true, 'two', Infinity]) assert.match(inner.counted(v).refused, /whole number from 0 to 6/);
  assert.deepEqual(inner.counted({ err: 'missing variable' }), { refused: 'missing variable' });
});
test('a scalar holds one number: a 1 by 1 block is refused data dimensions, and so is what something else defines', () => {
  assert.deepEqual(inner.countable({ name: 'S', scalar: true }, 1), { refused: 'A scalar holds one number' });
  assert.deepEqual(inner.countable({ name: 'S', scalar: true }, 0), { ok: true });      /* none is what it has */
  assert.deepEqual(inner.countable({ name: 'M' }, 2), { ok: true }); assert.deepEqual(inner.countable({ name: 'M', source: 'zeros' }, 2), { ok: true }); assert.deepEqual(inner.countable({ name: 'M', source: 'noise' }, 6), { ok: true });
  assert.match(inner.countable({ name: 'F', source: 'file' }, 1).refused, /CSV file holds no inner data/); assert.deepEqual(inner.countable({ name: 'F', source: 'file' }, 0), { ok: true });
  for (const k of ['arrow', 'input', 'part', 'entry', 'measure', 'seated']) assert.ok(inner.countable({ name: 'B', [k]: true }, 0).refused, k);
});
test('raising the count adds axes of length 1 at the end and keeps every number; lowering removes the last, and what was past its first position', () => {
  assert.deepEqual(inner.resized([ax(2, 'key')], 3), [ax(2, 'key'), ax(1), ax(1)]);
  assert.deepEqual(inner.resized([ax(2, 'key'), ax(4)], 1), [ax(2, 'key')]); assert.deepEqual(inner.resized([ax(2)], 0), []); assert.equal(inner.resized([], 9).length, 6);
  const up = inner.rekeyed(new Map([['1,1', 5], ['2,1', { expr: 'k1' }]]), [], [ax(1), ax(1)]);
  assert.deepEqual([...up.entries], [['1,1,1,1', 5], ['2,1,1,1', { expr: 'k1' }]]); assert.equal(up.lost, 0);
  const down = inner.rekeyed(new Map([['1,1,1,1', 5], ['1,1,2,1', 6], ['1,1,2,3', 7], ['9,9', 8]]), [ax(2), ax(4)], [ax(2)]);
  assert.deepEqual([...down.entries], [['1,1,1', 5], ['1,1,2', 6], ['9,9', 8]]); assert.equal(down.lost, 1);      /* a key that was never its entry is left alone */
  const none = inner.rekeyed(new Map([['1,1,1', 5], ['1,1,2', 6]]), [ax(2)], []);
  assert.deepEqual([...none.entries], [['1,1', 5]]); assert.equal(none.lost, 1);
  assert.equal(inner.rekeyed(new Map([['1,1,1', 5]]), [ax(2)], [ax(2)]).lost, 0);
});
test('an axis\'s row is typed as a side is: a length, a name, both, or - to take the name off', () => {
  assert.deepEqual(inner.axisTyped('4'), { name: undefined, length: 4 }); assert.deepEqual(inner.axisTyped('embed'), { name: 'embed', length: undefined });
  assert.deepEqual(inner.axisTyped('embed 4'), { name: 'embed', length: 4 }); assert.deepEqual(inner.axisTyped('-'), { name: null, length: undefined }); assert.deepEqual(inner.axisTyped('d2'), { name: 'd2', length: undefined });
  for (const text of ['2.5', '0', 'embed 0', '', 'none', '∅', 'None']) assert.ok(inner.axisTyped(text).refused, text);
});
test('the panel says what the shape is and never counts dimensions; the measurement and the bracket give the sizes', () => {
  assert.equal(inner.described(3, 1, [ax(2, 'key'), ax(4, 'embed')]), 'vector of 2 × 4 matrices');
  assert.equal(inner.described(1, 3, [ax(5)]), 'vector of vectors of 5'); assert.equal(inner.described(2, 2, [ax(2), ax(2)]), 'matrix of 2 × 2 matrices');
  assert.equal(inner.described(2, 2, [ax(2), ax(2), ax(3)]), 'matrix of 2 × 2 × 3 arrays'); assert.equal(inner.described(1, 1, [ax(2), ax(4)]), 'single entry holding a 2 × 4 matrix');
  assert.equal(inner.described(3, 1, []), null); assert.equal(inner.described(3, 1, null), null);
  for (const text of [inner.described(3, 1, [ax(2), ax(4)]), inner.described(2, 2, [ax(2), ax(2), ax(3)])]) assert.doesNotMatch(text, /dimension/);
  assert.equal(inner.measured([ax(2, 'key'), ax(4, 'embed')]), '2 key × 4 embed'); assert.equal(inner.measured([ax(5)]), '5'); assert.equal(inner.measured([]), '');
  assert.equal(inner.bracket([ax(2, 'key'), ax(4)]), '[2×4]'); assert.equal(inner.bracket([ax(5)]), '[5]');
});
test('an entry opened: its type, its numbers and the shape\'s own key for each, at any depth', () => {
  assert.deepEqual(inner.entryType([ax(2, 'key'), ax(4, 'embed')]), { cols: 2, rows: 4, colsName: 'key', rowsName: 'embed', inner: [] });
  assert.deepEqual(inner.entryType([ax(5)]), { cols: 5, rows: 1, colsName: null, rowsName: null, inner: [] });
  assert.deepEqual(inner.entryType([ax(2), ax(4), ax(3)]).inner, [ax(3)]);
  const values = new Map([['2,1,1,3', 7], ['2,1,2,3', 8], ['3,1,1,1', 9]]);
  assert.deepEqual([...inner.given(values)].sort(), ['2,1', '3,1']); assert.deepEqual([...inner.given(new Map([['1,1', 4]]))], []);
  assert.equal(inner.opened(values, []), values);
  assert.deepEqual([...inner.opened(values, [[2, 1]], 2)], [['1,3', 7], ['2,3', 8]]); assert.deepEqual([...inner.opened(values, [[1, 1]], 2)], []);
  assert.equal(inner.keyAt([[2, 1]], '1,3', 2), '2,1,1,3'); assert.equal(inner.keyAt([], '2,1', 2), '2,1');
  /* one axis: the entry is a single row, and its row is no part of the shape's key */
  const one = new Map([['2,1,4', 7]]);
  assert.deepEqual([...inner.opened(one, [[2, 1]], 1)], [['4,1', 7]]); assert.equal(inner.keyAt([[2, 1]], '4,1', 1), '2,1,4');
  /* three axes: two levels down, the last a single row */
  const deep = new Map([['1,1,2,4,3', 5]]);
  assert.deepEqual([...inner.opened(deep, [[1, 1]], 3)], [['2,4,3', 5]]); assert.deepEqual([...inner.opened(deep, [[1, 1], [2, 4]], 3)], [['3,1', 5]]);
  assert.equal(inner.keyAt([[1, 1], [2, 4]], '3,1', 3), '1,1,2,4,3'); assert.equal(inner.keyAt([[1, 1]], '2,4,3', 3), '1,1,2,4,3');
  const type = { cols: 3, rows: 1, colsName: null, rowsName: null, inner: [ax(2), ax(4), ax(3)] };
  assert.deepEqual(inner.pathType(type, []), type);
  assert.deepEqual(inner.pathType(type, [[3, 1]]), { cols: 2, rows: 4, colsName: null, rowsName: null, inner: [ax(3)] });
  assert.deepEqual(inner.pathType(type, [[3, 1], [2, 4]]), { cols: 3, rows: 1, colsName: null, rowsName: null, inner: [] });
  for (const path of [[[4, 1]], [[1, 2]], [[1, 1], [3, 1]], [[1, 1], [2, 4], [1, 1]], [[0, 1]]]) assert.equal(inner.pathType(type, path), null, JSON.stringify(path));
  assert.equal(inner.pathType({ cols: 3, rows: 1 }, [[1, 1]]), null);
  assert.equal(inner.trail('QKV', [[2, 1]]), 'QKV › 2,1'); assert.equal(inner.trail('QKV', [[2, 1], [1, 3]]), 'QKV › 2,1 › 1,3'); assert.equal(inner.trail('QKV', []), 'QKV');
});

/* ---- turning ---- */
test('an axis order names every axis of the variable once; one that moves no inner axis is no turn, or a transpose', () => {
  assert.deepEqual(inner.ordered([2, 1, 0], 1), [2, 1, 0]); assert.deepEqual(inner.ordered([2, 3, 0, 1], 2), [2, 3, 0, 1]); assert.deepEqual(inner.ordered([0, 1, 3, 2], 2), [0, 1, 3, 2]);
  assert.equal(inner.plainly([0, 1, 2], 1), 'same'); assert.equal(inner.plainly([1, 0, 2], 1), 'transposed'); assert.equal(inner.plainly([2, 1, 0], 1), 'turned');
  for (const [order, count] of [[[0, 1, 2], 1], [[1, 0, 2], 1], [[2, 1, 0], 2], [[2, 1, 0, 0], 2], [[0, 1], 0], [[1, 0], 0], [[2, 1, 3], 1], [[2, 1, '0'], 1], [null, 1], ['x', 1], [[2.5, 1, 0], 1]]) assert.equal(inner.ordered(order, count), null, JSON.stringify(order));
  assert.equal(inner.plainly([2, 1, 0], 2), null);
});
test('a turned use draws the axes its order puts first, and holds the rest; a key goes to the variable\'s and back', () => {
  const all = [ax(3), ax(1), ax(2, 'key'), ax(4, 'embed')];
  assert.deepEqual(inner.turnedAxes(all, [2, 3, 0, 1]), [ax(2, 'key'), ax(4, 'embed'), ax(3), ax(1)]);
  assert.deepEqual(inner.turnedAxes(all, [2, 1, 0, 3]), [ax(2, 'key'), ax(1), ax(3), ax(4, 'embed')]);
  assert.equal(inner.toUse('3,1,2,4', [2, 3, 0, 1]), '2,4,3,1'); assert.equal(inner.toVariable('2,4,3,1', [2, 3, 0, 1]), '3,1,2,4');
  for (const order of [[2, 1, 0, 3], [3, 0, 1, 2], [1, 2, 3, 0]]) assert.equal(inner.toVariable(inner.toUse('5,6,7,8', order), order), '5,6,7,8');
  assert.deepEqual(inner.axisLabels(all), ['x', 'y', 'key', 'embed']); assert.deepEqual(inner.axisLabels([ax(3, 'n'), ax(1), ax(2), ax(2)]), ['n', 'y', 'd1', 'd2']);
});
test('dragging an axis to another place in the list gives the new order', () => {
  assert.deepEqual(inner.moved([0, 1, 2], 2, 0), [2, 0, 1]);      /* head, before the bar: drawn as the columns */
  assert.deepEqual(inner.moved([0, 1, 2, 3], 3, 1), [0, 3, 1, 2]); assert.deepEqual(inner.moved([0, 1, 2], 0, 2), [1, 2, 0]); assert.deepEqual(inner.moved([0, 1, 2], 1, 1), [0, 1, 2]);
  assert.deepEqual(inner.moved([0, 1, 2], 5, 0), [0, 1, 2]); assert.deepEqual(inner.moved([0, 1, 2], 0, -1), [0, 1, 2]);
});
test('what can be turned: a use that holds inner data and is not the shape its variable was made as, nor defined by something else', () => {
  assert.deepEqual(inner.turnable({ name: 'W', inner: 1 }), { ok: true });
  assert.match(inner.turnable({ name: 'W', inner: 1, origin: true }).refused, /another use of it from the list/);
  assert.match(inner.turnable({ name: 'W', inner: 0 }).refused, /holds no inner data/);
  for (const k of ['arrow', 'input', 'part', 'entry', 'measure', 'seated', 'fused', 'standing']) assert.ok(inner.turnable({ name: 'W', inner: 2, [k]: true }).refused, k);
});

/* ---- after review ---- */
test('an axis is at most 16,000,000 long, where it is typed and where it is kept; a shape with inner data is not made one by one', () => {
  assert.equal(inner.LONGEST, 16000000);
  assert.deepEqual(inner.lengthOk(16000000), { ok: true }); assert.deepEqual(inner.lengthOk(1), { ok: true });
  for (const n of [16000001, 5000000000, 1e12, Infinity, 0, 1.5, NaN, '3']) assert.ok(inner.lengthOk(n).refused, String(n));
  assert.match(inner.lengthOk(5000000000).refused, /at most 16000000/); assert.match(inner.axisTyped('embed 5000000000').refused, /at most 16000000/);
  assert.deepEqual(inner.kept([{ length: 1e12, name: null }, { length: Infinity, name: null }]).map(a => a.length), [16000000, 16000000]);
  assert.deepEqual(inner.sizable(1, 1, 0), { ok: true }); assert.deepEqual(inner.sizable(2, 1, 3), { ok: true }); assert.deepEqual(inner.sizable(1, 2, 1), { ok: true });
  assert.match(inner.sizable(1, 1, 1).refused, /cannot be made one by one/);
});
