/* algebra.js: what shapes on a canvas mean. Run with: node --test */
import './solver.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joins, pieces, stacks, typeOf, readEntry, isScalar, isSurd, isWhole, surd, rootOf, exact, held, valueText, initials } from '../algebra.js';

const rect = (x, y, w, h, wName, hName) => ({ x, y, w, h, wName, hName });
const type = (cols, rows, colsName = null, rowsName = null) => ({ cols, rows, colsName, rowsName });

test('shapes touching side by side along an edge are a product', () => {
  const js = joins([rect(0, 0, 3, 2), rect(3, 0, 4, 3)]);
  assert.equal(js.length, 1);
  assert.deepEqual({ ...js[0] }, { left: 0, right: 1, x: 3, y: 1, ok: true, scalar: false, note: '' });
});

test('the order shapes are given in does not matter, only where they are', () => {
  const [j] = joins([rect(3, 0, 4, 3), rect(0, 0, 3, 2)]);
  assert.equal(j.left, 1); assert.equal(j.right, 0); assert.equal(j.ok, true);
});

test('touching at a corner, a gap, or an overlap is no product', () => {
  assert.deepEqual(joins([rect(0, 0, 3, 2), rect(3, 2, 4, 3)]), []);      /* corner */
  assert.deepEqual(joins([rect(0, 0, 3, 2), rect(4, 0, 4, 3)]), []);      /* gap */
  assert.deepEqual(joins([rect(0, 0, 3, 2), rect(2, 0, 4, 3)]), []);      /* overlap */
  assert.deepEqual(joins([rect(0, 0, 3, 2), rect(0, 2, 3, 2)]), []);      /* one on top of the other */
});

test('a product is undefined when columns do not meet rows, and says what differs', () => {
  const [j] = joins([rect(0, 0, 4, 2), rect(4, 0, 2, 3)]);
  assert.equal(j.ok, false); assert.equal(j.note, '4 ≠ 3');
});

test('where both sides are named the names decide, whatever the lengths', () => {
  const same = joins([rect(0, 0, 4, 2, 'key'), rect(4, 0, 2, 3, null, 'key')])[0];
  assert.equal(same.ok, true);
  const differ = joins([rect(0, 0, 3, 2, 'embed'), rect(3, 0, 2, 3, null, 'key')])[0];
  assert.equal(differ.ok, false); assert.equal(differ.note, 'embed ≠ key');
  const oneNamed = joins([rect(0, 0, 3, 2, 'embed'), rect(3, 0, 2, 3)])[0];      /* only one named: lengths decide */
  assert.equal(oneNamed.ok, true);
});

test('a single entry scales whatever it touches, from either side', () => {
  assert.equal(isScalar(rect(0, 0, 1, 1)), true); assert.equal(isScalar(rect(0, 0, 1, 2)), false);
  const right = joins([rect(0, 0, 4, 5), rect(4, 0, 1, 1)])[0], left = joins([rect(0, 0, 1, 1), rect(1, 0, 4, 5)])[0];
  assert.equal(right.ok, true); assert.equal(right.scalar, true); assert.equal(left.ok, true); assert.equal(left.scalar, true);
});

test('a row of shapes comes to the first one\'s rows and the last one\'s columns', () => {
  const rects = [rect(0, 0, 3, 2, 'embed', 'context'), rect(3, 0, 4, 3), rect(7, 0, 5, 4, 'key')];
  assert.deepEqual(typeOf(rects), type(5, 2, 'key', 'context'));
  const [p] = pieces(rects);
  assert.deepEqual(p.members, [0, 1, 2]); assert.deepEqual(p.box, { x: 0, y: 0, w: 12, h: 4 });
});

test('a piece\'s members are left to right, whatever order they were given in', () => {
  const [p] = pieces([rect(7, 0, 5, 4), rect(0, 0, 3, 2), rect(3, 0, 4, 3)]);
  assert.deepEqual(p.members, [1, 2, 0]); assert.deepEqual(p.type, type(5, 2));
});

test('scalars in a row are passed over: A · s · B is defined when A · B is', () => {
  assert.deepEqual(typeOf([rect(0, 0, 3, 2), rect(3, 0, 1, 1), rect(4, 0, 4, 3)]), type(4, 2));
  assert.deepEqual(typeOf([rect(0, 0, 3, 2), rect(3, 0, 1, 1), rect(4, 0, 4, 5)]), { error: 'undefined' });
  assert.deepEqual(typeOf([rect(0, 0, 1, 1), rect(1, 0, 4, 3)]), type(4, 3));      /* s · A is A's size */
  assert.deepEqual(typeOf([rect(0, 0, 4, 3), rect(4, 0, 1, 1)]), type(4, 3));
  assert.deepEqual(typeOf([rect(0, 0, 1, 1), rect(1, 0, 1, 1)]), type(1, 1));      /* two scalars */
});

test('an undefined product makes its piece undefined', () => {
  assert.deepEqual(typeOf([rect(0, 0, 4, 2), rect(4, 0, 2, 3)]), { error: 'undefined' });
});

test('one shape touching two on the same side has no one reading', () => {
  const rects = [rect(0, 0, 2, 4), rect(2, 0, 3, 2), rect(2, 2, 3, 2)];
  const [p] = pieces(rects);
  assert.deepEqual(p.type, { error: 'undefined' }); assert.deepEqual([...p.members].sort(), [0, 1, 2]);
});

test('nothing is null, one shape is itself, and shapes apart are several pieces', () => {
  assert.equal(typeOf([]), null);
  assert.deepEqual(typeOf([rect(0, 0, 3, 2, 'a', 'b')]), type(3, 2, 'a', 'b'));
  assert.deepEqual(typeOf([rect(0, 0, 3, 2), rect(10, 0, 3, 2)]), { error: '2 pieces' });
  assert.deepEqual(typeOf([rect(0, 0, 3, 2), rect(10, 0, 3, 2), rect(20, 9, 1, 1)]), { error: '3 pieces' });
});

test('shapes of one width set directly on top of each other are a stack', () => {
  const rects = [rect(0, 2, 3, 4, 'embed'), rect(0, 0, 3, 2, 'embed'), rect(0, 6, 3, 1)];
  const out = stacks(rects, pieces(rects));
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { members: [1, 0, 2], stack: true, box: { x: 0, y: 0, w: 3, h: 7 }, type: type(3, 7, 'embed', null) });
});

test('a gap, a different width or a sideways step breaks a stack', () => {
  for (const second of [rect(0, 3, 3, 2), rect(0, 2, 4, 2), rect(1, 2, 3, 2)]){
    const rects = [rect(0, 0, 3, 2), second], out = stacks(rects, pieces(rects));
    assert.equal(out.length, 2); assert.ok(out.every(p => !p.stack)); }
});

test('a shape that is part of a product is not stacked', () => {
  const rects = [rect(0, 0, 2, 2), rect(2, 0, 4, 2), rect(0, 2, 2, 2)];      /* the third is right under the first, which is in a product */
  const out = stacks(rects, pieces(rects));
  assert.equal(out.length, 2); assert.ok(out.every(p => !p.stack)); assert.deepEqual(out.map(p => p.members.length).sort(), [1, 2]);
});

test('readEntry reads whole numbers and infinities, and nothing else', () => {
  assert.equal(readEntry('7'), 7); assert.equal(readEntry('-3'), -3); assert.equal(readEntry('+12'), 12);
  assert.equal(readEntry(' 4 2 '), 42); assert.equal(readEntry('−5'), -5); assert.equal(readEntry('0'), 0);
  for (const t of ['inf', '+inf', 'infinity', 'INF', '∞', '+∞']) assert.equal(readEntry(t), Infinity, t);
  for (const t of ['-inf', '-infinity', '-∞', '−∞']) assert.equal(readEntry(t), -Infinity, t);
  assert.equal(readEntry(''), null); assert.equal(readEntry('   '), null);
  for (const t of ['1.5', 'abc', '1e3', '--1', '3/2', '√2']) assert.equal(readEntry(t), undefined, t);
});

test('a value that comes out whole is a plain number; otherwise it is kept in algebraic form', () => {
  assert.equal(surd(9, 1), 3); assert.equal(surd(16, 2), 2); assert.equal(surd(6, 0, 3), 2);
  assert.deepEqual(surd(2, 1), { n: 2, k: 1 }); assert.deepEqual(surd(3, 0, 4), { n: 3, d: 4, k: 0 });
  assert.deepEqual(surd(12, 1), { n: 12, k: 1 }); assert.deepEqual(surd(4, 2), { n: 2, k: 1 });
  assert.equal(isWhole(3), true); assert.equal(isWhole(1.5), false); assert.equal(isWhole({ n: 2, k: 1 }), false);
  assert.equal(isSurd({ n: 2, k: 1 }), true); assert.equal(isSurd(3), false); assert.equal(isSurd(null), false);
});

test('rootOf gives the square root as a value, and null where there is none', () => {
  assert.equal(rootOf(9), 3); assert.deepEqual(rootOf(2), { n: 2, k: 1 }); assert.deepEqual(rootOf(12), { n: 12, k: 1 });
  assert.deepEqual(rootOf(30), { n: 30, k: 1 }); assert.deepEqual(rootOf(rootOf(30)), { n: 30, k: 2 });
  assert.deepEqual(rootOf({ n: 9, d: 4, k: 0 }), { n: 3, d: 2, k: 0 }); assert.equal(rootOf(0), 0);
  assert.equal(rootOf(-1), null); assert.equal(rootOf(Infinity), null); assert.equal(rootOf(NaN), null);
  assert.equal(rootOf(null), null); assert.equal(rootOf(1.5), null);
});

test('exact and held are each other\'s reverse', () => {
  for (const v of [7, -3, 0, { n: 2, k: 1 }, { n: 3, d: 4, k: 0 }, { n: 30, k: 2 }, { n: 1, d: 2, k: 1 }]) assert.deepEqual(held(exact(v)), v);
  assert.equal(exact(Infinity), null); assert.equal(exact(null), null); assert.equal(held(null), null); assert.equal(held('inexact'), null);
});

test('valueText writes a value out, never in decimals', () => {
  assert.equal(valueText(7), '7'); assert.equal(valueText(-3), '-3'); assert.equal(valueText(Infinity), '∞'); assert.equal(valueText(-Infinity), '-∞');
  assert.equal(valueText({ n: 3, d: 4, k: 0 }), '3/4'); assert.equal(valueText({ n: 2, k: 1 }), '√2');
  assert.equal(valueText({ n: 12, k: 1 }), '2√3'); assert.equal(valueText({ n: 30, k: 2 }), '∜30');
  assert.equal(valueText(rootOf(2)), '√2'); assert.equal(valueText(rootOf(12)), '2√3'); assert.equal(valueText(rootOf(9)), '3');
});

test('initials are the first letters of a name\'s words', () => {
  assert.equal(initials('Key Weights'), 'kw'); assert.equal(initials('Shape 3'), 's'); assert.equal(initials('Embedding'), 'e');
  assert.equal(initials('a b c d e'), 'abc'); assert.equal(initials('123'), 'x'); assert.equal(initials(''), 'x');
});
