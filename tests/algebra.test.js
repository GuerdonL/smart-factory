/* algebra.js: what shapes on a canvas mean. Run with: node --test */
import './solver.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touches, joins, pieces, hollows, resultHollows, stacks, typeOf, readEntry, isScalar, isSurd, isWhole, surd, rootOf, exact, held, valueText, initials, cut, fits, difference, intersection, rangeOf, rangeIn, wholeSide, sideLabel, nthOf } from '../algebra.js';

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

test('a gap or an overlap is no touch at all, and a corner or a stack is no product', () => {
  assert.deepEqual(touches([rect(0, 0, 3, 2), rect(4, 0, 4, 3)]), []);      /* gap */
  assert.deepEqual(touches([rect(0, 0, 3, 2), rect(2, 0, 4, 3)]), []);      /* overlap */
  assert.deepEqual(joins([rect(0, 0, 3, 2), rect(3, 2, 4, 3)]), []);        /* corner: a touch, but not a product */
  assert.deepEqual(joins([rect(0, 0, 3, 2), rect(0, 2, 3, 2)]), []);        /* one on top of the other: likewise */
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
  const rects = [rect(0, 0, 2, 4), rect(2, 0, 3, 2), rect(2, 2, 4, 2)];      /* the two on the right differ in width, so they are not a sum */
  const [p] = pieces(rects);
  assert.equal(p.rule, 'product'); assert.deepEqual(p.type, { error: 'undefined' }); assert.deepEqual([...p.members].sort(), [0, 1, 2]);
});

test('nothing is null, one shape is itself, and shapes apart are several pieces', () => {
  assert.equal(typeOf([]), null);
  assert.deepEqual(typeOf([rect(0, 0, 3, 2, 'a', 'b')]), type(3, 2, 'a', 'b'));
  assert.deepEqual(typeOf([rect(0, 0, 3, 2), rect(10, 0, 3, 2)]), { error: '2 pieces' });
  assert.deepEqual(typeOf([rect(0, 0, 3, 2), rect(10, 0, 3, 2), rect(20, 9, 1, 1)]), { error: '3 pieces' });
});

/* ---- the four touches ---- */
const only = rects => { const ts = touches(rects); assert.equal(ts.length, 1); return ts[0]; };

test('product: the right edge against the left edge, along more than a corner', () => {
  assert.deepEqual(only([rect(0, 0, 3, 2), rect(3, 0, 4, 3)]), { kind: 'product', a: 0, b: 1, x: 3, y: 1, ok: true, note: '' });
  assert.deepEqual(only([rect(0, 0, 3, 2), rect(3, 1, 4, 3)]), { kind: 'product', a: 0, b: 1, x: 3, y: 1.5, ok: true, note: '' });      /* one row of overlap is enough */
  assert.equal(only([rect(0, 0, 3, 2), rect(3, 2, 4, 3)]).kind, 'over');       /* no overlap, only the corner: not a product */
  assert.deepEqual(only([rect(0, 0, 4, 2), rect(4, 0, 2, 3)]), { kind: 'product', a: 0, b: 1, x: 4, y: 1, ok: false, note: '4 ≠ 3' });
  assert.equal(only([rect(0, 0, 1, 1), rect(1, 0, 4, 3)]).ok, true);           /* either being one by one always matches */
});

test('sum: the same x and width, one directly on the other; defined when the heights agree too', () => {
  assert.deepEqual(only([rect(0, 0, 3, 2), rect(0, 2, 3, 2)]), { kind: 'sum', a: 0, b: 1, x: 1.5, y: 2, ok: true, note: '' });
  assert.deepEqual(only([rect(0, 2, 3, 2), rect(0, 0, 3, 2)]), { kind: 'sum', a: 1, b: 0, x: 1.5, y: 2, ok: true, note: '' });      /* a is the upper one, whatever the order given */
  assert.deepEqual(only([rect(0, 0, 3, 2), rect(0, 2, 3, 3)]), { kind: 'sum', a: 0, b: 1, x: 1.5, y: 2, ok: false, note: '2 ≠ 3' });      /* they touch, and are an error */
  assert.equal(only([rect(4, 0, 1, 1), rect(4, 1, 1, 1)]).ok, true);           /* two single entries add */
});

test('sum: a shared horizontal edge without the same x and width is no touch, nor is a gap', () => {
  assert.deepEqual(touches([rect(0, 0, 3, 2), rect(0, 2, 4, 2)]), []);      /* a different width */
  assert.deepEqual(touches([rect(0, 0, 3, 2), rect(1, 2, 3, 2)]), []);      /* a step sideways */
  assert.deepEqual(touches([rect(0, 0, 3, 2), rect(0, 3, 3, 2)]), []);      /* a gap */
  assert.deepEqual(touches([rect(0, 0, 3, 2), rect(0, 1, 3, 2)]), []);      /* an overlap */
  assert.deepEqual(touches([rect(0, 0, 3, 1), rect(0, 1, 1, 1)]), []);      /* a sum never broadcasts: a scalar under a row does not touch it */
});

test('sum: sides that are both named must carry the same name', () => {
  assert.equal(only([rect(0, 0, 3, 2, 'embed', 'context'), rect(0, 2, 3, 2, 'embed', 'context')]).ok, true);
  assert.equal(only([rect(0, 0, 3, 2, 'embed'), rect(0, 2, 3, 2)]).ok, true);      /* only one named: lengths decide */
  assert.deepEqual(only([rect(0, 0, 3, 2, 'embed'), rect(0, 2, 3, 2, 'key')]), { kind: 'sum', a: 0, b: 1, x: 1.5, y: 2, ok: false, note: 'embed ≠ key' });
  assert.equal(only([rect(0, 0, 3, 2, null, 'context'), rect(0, 2, 3, 2, null, 'batch')]).note, 'context ≠ batch');
});

test('times: b\'s bottom-left corner on a\'s top-right corner', () => {
  assert.deepEqual(only([rect(0, 2, 3, 2), rect(3, 0, 3, 2)]), { kind: 'times', a: 0, b: 1, x: 3, y: 2, ok: true, note: '' });
  assert.deepEqual(only([rect(3, 0, 3, 2), rect(0, 2, 3, 2)]), { kind: 'times', a: 1, b: 0, x: 3, y: 2, ok: true, note: '' });      /* a is the left one */
  assert.deepEqual(touches([rect(0, 2, 3, 2), rect(4, 0, 3, 2)]), []);      /* a column away from the corner */
  assert.deepEqual(touches([rect(0, 3, 3, 2), rect(3, 0, 3, 2)]), []);      /* a row away from it */
});

test('over: b\'s top-left corner on a\'s bottom-right corner; a is divided by b', () => {
  assert.deepEqual(only([rect(0, 0, 3, 2), rect(3, 2, 3, 2)]), { kind: 'over', a: 0, b: 1, x: 3, y: 2, ok: true, note: '' });
  assert.deepEqual(only([rect(3, 2, 3, 2), rect(0, 0, 3, 2)]), { kind: 'over', a: 1, b: 0, x: 3, y: 2, ok: true, note: '' });
  assert.deepEqual(touches([rect(0, 0, 3, 2), rect(3, 3, 3, 2)]), []);
});

test('times and over: equal sizes, or one of exactly three broadcasts', () => {
  const pair = (kind, a, b) => only(kind === 'times' ? [rect(0, 10, ...a), rect(a[0], 10 - b[1], ...b)] : [rect(0, 0, ...a), rect(a[0], a[1], ...b)]);
  for (const kind of ['times', 'over']){
    assert.equal(pair(kind, [4, 3], [4, 3]).kind, kind);
    assert.equal(pair(kind, [4, 3], [4, 3]).ok, true);       /* equal */
    assert.equal(pair(kind, [1, 1], [4, 3]).ok, true);       /* one by one, either side: every entry */
    assert.equal(pair(kind, [4, 3], [1, 1]).ok, true);
    assert.equal(pair(kind, [4, 1], [4, 3]).ok, true);       /* a single row with the other's columns: every row */
    assert.equal(pair(kind, [4, 3], [4, 1]).ok, true);
    assert.equal(pair(kind, [1, 3], [4, 3]).ok, true);       /* a single column with the other's rows: every column */
    assert.equal(pair(kind, [4, 3], [1, 3]).ok, true);
    assert.equal(pair(kind, [1, 4], [1, 1]).ok, true);
    assert.deepEqual([pair(kind, [4, 3], [5, 3]).ok, pair(kind, [4, 3], [5, 3]).note], [false, '4 ≠ 5']);          /* the boundary: one column out */
    assert.deepEqual([pair(kind, [4, 3], [4, 2]).ok, pair(kind, [4, 3], [4, 2]).note], [false, '3 ≠ 2']);
    assert.deepEqual([pair(kind, [4, 3], [5, 2]).ok, pair(kind, [4, 3], [5, 2]).note], [false, '4×3 ≠ 5×2']);
    assert.deepEqual([pair(kind, [3, 1], [4, 3]).ok, pair(kind, [3, 1], [4, 3]).note], [false, '3 ≠ 4']);          /* a row, but not of the other's columns: the columns are what fail */
    assert.deepEqual([pair(kind, [1, 2], [4, 3]).ok, pair(kind, [1, 2], [4, 3]).note], [false, '2 ≠ 3']);          /* a column, but not of the other's rows: the rows are what fail */
    assert.deepEqual([pair(kind, [4, 1], [1, 3]).ok, pair(kind, [4, 1], [1, 3]).note], [false, '4×1 ≠ 1×3']);      /* a row against a column is none of the three */
    assert.equal(pair(kind, [2, 2], [4, 4]).ok, false);      /* nothing repeats but a single entry, row or column */
  }
});

test('times and over: names decide as they do for a sum, on the sides that are matched', () => {
  const times = (a, b) => only([{ ...a, x: 0, y: 10 }, { ...b, x: a.w, y: 10 - b.h }]);
  assert.equal(times({ w: 3, h: 2, wName: 'embed' }, { w: 3, h: 2, wName: 'embed' }).ok, true);
  assert.equal(times({ w: 3, h: 2, wName: 'embed' }, { w: 3, h: 2, wName: 'key' }).note, 'embed ≠ key');
  assert.equal(times({ w: 3, h: 2, wName: 'embed' }, { w: 3, h: 1, wName: 'key' }).ok, false);          /* a row is matched on its columns */
  assert.equal(times({ w: 3, h: 2, hName: 'context' }, { w: 3, h: 1, hName: 'one' }).ok, true);         /* and not on its rows */
  assert.equal(times({ w: 3, h: 2, wName: 'embed', hName: 'context' }, { w: 1, h: 1, wName: 'a', hName: 'b' }).ok, true);      /* a single entry is matched on nothing */
});

test('a refused broadcast names the side that fails, not the one that was free to differ', () => {
  /* one column against four is the column broadcast; what is wrong is the rows' names */
  const column = [{ x: 0, y: 3, w: 1, h: 3, hName: 'ctx' }, { x: 1, y: 0, w: 4, h: 3, hName: 'batch' }];
  assert.deepEqual(only(column), { kind: 'times', a: 0, b: 1, x: 1, y: 3, ok: false, note: 'ctx ≠ batch' });
  assert.equal(only([{ ...column[0], hName: 'batch' }, column[1]]).ok, true);                                    /* the same names: defined */
  assert.equal(only([{ x: 0, y: 3, w: 1, h: 2 }, { x: 1, y: 0, w: 4, h: 3 }]).note, '2 ≠ 3');                    /* a column of the wrong height */
  /* one row against three is the row broadcast; what is wrong is the columns */
  const row = [{ x: 0, y: 0, w: 4, h: 1, wName: 'embed' }, { x: 4, y: 1, w: 4, h: 3, wName: 'key' }];
  assert.deepEqual(only(row), { kind: 'over', a: 0, b: 1, x: 4, y: 1, ok: false, note: 'embed ≠ key' });
  assert.equal(only([{ x: 0, y: 0, w: 5, h: 1 }, { x: 5, y: 1, w: 4, h: 3 }]).note, '5 ≠ 4');
  /* neither a row nor a column: both lengths differ, and both sizes are given */
  assert.equal(only([{ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 2, w: 4, h: 4 }]).note, '2×2 ≠ 4×4');
});

/* ---- pieces: one rule each ---- */
test('a sum of any number of shapes is one piece, read top to bottom, the size of each', () => {
  const rects = [rect(0, 4, 3, 2), rect(0, 0, 3, 2), rect(0, 2, 3, 2, 'embed')];
  const [p] = pieces(rects);
  assert.deepEqual(p, { rule: 'sum', members: [1, 2, 0], box: { x: 0, y: 0, w: 3, h: 6 }, type: type(3, 2, 'embed') });      /* the name of the first member that has one */
  assert.deepEqual(typeOf([rect(0, 0, 3, 2), rect(0, 2, 3, 2)]), type(3, 2));
});

test('a sum with one member the wrong height, or two different names in it, is undefined', () => {
  const tall = pieces([rect(0, 0, 3, 2), rect(0, 2, 3, 3)])[0];
  assert.equal(tall.rule, 'sum'); assert.deepEqual(tall.type, { error: 'undefined' });
  /* each touch is defined (the middle one has no names), but the first and the last do not agree */
  const rects = [rect(0, 0, 3, 2, 'embed'), rect(0, 2, 3, 2), rect(0, 4, 3, 2, 'key')];
  assert.ok(touches(rects).every(t => t.ok)); assert.deepEqual(typeOf(rects), { error: 'undefined' });
});

test('an elementwise chain mixes times and over, and is read left to right', () => {
  const rects = [rect(6, 2, 3, 2), rect(0, 2, 3, 2), rect(3, 0, 3, 2)];      /* (B ∘ C) ⊘ A, given out of order */
  const [p] = pieces(rects);
  assert.deepEqual(touches(rects).map(t => t.kind).sort(), ['over', 'times']);
  assert.deepEqual(p, { rule: 'elementwise', members: [1, 2, 0], box: { x: 0, y: 0, w: 9, h: 4 }, type: type(3, 2) });
});

test('an elementwise result is the size of its larger operand', () => {
  assert.deepEqual(typeOf([rect(0, 0, 1, 1), rect(1, 1, 4, 4)]), type(4, 4));            /* s ⊘ A: every entry of A under s */
  assert.deepEqual(typeOf([rect(0, 1, 4, 3), rect(4, 0, 4, 1)]), type(4, 3));            /* a row, over every row */
  assert.deepEqual(typeOf([rect(0, 0, 1, 3), rect(1, 3, 4, 3)]), type(4, 3));            /* a column, over every column */
  assert.deepEqual(typeOf([rect(0, 0, 1, 1), rect(1, 1, 1, 1)]), type(1, 1));
  assert.deepEqual(typeOf([rect(0, 2, 3, 2), rect(3, 0, 4, 2)]), { error: 'undefined' });
});

test('a side of an elementwise result is named by the first member that names a side of that length', () => {
  assert.deepEqual(typeOf([rect(0, 2, 3, 2, null, 'context'), rect(3, 0, 3, 2, 'embed', 'other')]), { error: 'undefined' });
  assert.deepEqual(typeOf([rect(0, 2, 3, 2, null, 'context'), rect(3, 0, 3, 2, 'embed')]), type(3, 2, 'embed', 'context'));
  /* a scalar's sides, and a row's one row, do not name the sides of what they are broadcast over */
  assert.deepEqual(typeOf([rect(0, 1, 1, 1, 'a', 'b'), rect(1, -3, 4, 4, 'embed')]), type(4, 4, 'embed', null));
  assert.deepEqual(typeOf([rect(0, 1, 4, 1, 'embed', 'one'), rect(4, -2, 4, 3, null, 'context')]), type(4, 3, 'embed', 'context'));
});

test('a chain is worked out from the left, so a scalar in the middle does not excuse the shapes round it', () => {
  const fits = [rect(0, 4, 3, 2), rect(3, 3, 1, 1), rect(4, 1, 3, 2)], not = [rect(0, 4, 3, 2), rect(3, 3, 1, 1), rect(4, -1, 4, 4)];
  assert.deepEqual(typeOf(fits), type(3, 2));
  assert.ok(touches(not).every(t => t.ok)); assert.deepEqual(typeOf(not), { error: 'undefined' });
});

test('one shape with two at its corners on the same side has no one reading', () => {
  const [p] = pieces([rect(0, 2, 3, 2), rect(3, 0, 3, 2), rect(3, 4, 3, 2)]);      /* A ∘ B and A ⊘ C at once */
  assert.equal(p.rule, 'elementwise'); assert.deepEqual(p.type, { error: 'undefined' });
});

test('a piece whose touches are not all of one rule is mixed rules', () => {
  const rects = [rect(0, 0, 2, 2), rect(2, 0, 4, 2), rect(0, 2, 2, 2)];      /* A · B, with a third stacked under A */
  const [p] = pieces(rects);
  assert.equal(pieces(rects).length, 1);
  assert.equal(p.rule, 'mixed'); assert.deepEqual(p.type, { error: 'mixed rules' }); assert.deepEqual([...p.members].sort(), [0, 1, 2]);
  assert.deepEqual(typeOf([rect(0, 2, 3, 2), rect(3, 0, 3, 2), rect(0, 4, 3, 2)]), { error: 'mixed rules' });      /* times and a sum */
  assert.deepEqual(typeOf([rect(0, 2, 3, 2), rect(3, 0, 3, 2), rect(6, 0, 2, 3)]), { error: 'mixed rules' });      /* times and a product */
  assert.equal(pieces([rect(0, 2, 3, 2), rect(3, 0, 3, 2), rect(6, 2, 3, 2)])[0].rule, 'elementwise');             /* times and over are one rule */
});

test('a shape on its own has no rule, and a row of products has the rule product', () => {
  assert.equal(pieces([rect(0, 0, 3, 2)])[0].rule, null);
  assert.equal(pieces([rect(0, 0, 3, 2), rect(3, 0, 4, 3)])[0].rule, 'product');
});

test('the hollows of a times or over pair: where its result is read', () => {
  const times = [rect(0, 2, 3, 2), rect(3, 0, 3, 2)], over = [rect(0, 0, 3, 2), rect(3, 2, 3, 2)];
  assert.deepEqual(hollows(touches(times)[0], times), [{ x: 3, y: 2, w: 3, h: 2 }, { x: 0, y: 0, w: 3, h: 2 }]);      /* beside a under b, then above a */
  assert.deepEqual(hollows(touches(over)[0], over), [{ x: 0, y: 2, w: 3, h: 2 }, { x: 3, y: 0, w: 3, h: 2 }]);        /* under a beside b, then beside a above b */
  const row = [rect(0, 1, 4, 3), rect(4, 0, 4, 1)];                                                                   /* broadcast: only one hollow is the result's size */
  assert.deepEqual(hollows(touches(row)[0], row), [{ x: 4, y: 1, w: 4, h: 3 }, { x: 0, y: 0, w: 4, h: 1 }]);
  const product = [rect(0, 0, 3, 2), rect(3, 0, 2, 3)];
  assert.deepEqual(hollows(touches(product)[0], product), []);
});

/* ---- which hollows a result is written in ---- */
const used = (rects, copies, written) => resultHollows(rects, pieces(rects)[0], copies, written);
const timesPair = [rect(0, 2, 3, 2), rect(3, 0, 3, 2)], overPair = [rect(0, 0, 3, 2), rect(3, 2, 3, 2)];
const lowerRight = { x: 3, y: 2, w: 3, h: 2 }, upperLeft = { x: 0, y: 0, w: 3, h: 2 };

test('.show_hadamard_copies: 0 is no hollow, 1 the first, 2 both; left out it is 1', () => {
  assert.deepEqual(used(timesPair, 0), []);
  assert.deepEqual(used(timesPair, 1), [lowerRight]);
  assert.deepEqual(used(timesPair, 2), [lowerRight, upperLeft]);
  assert.deepEqual(used(timesPair), [lowerRight]);
  assert.deepEqual(used(overPair, 1), [{ x: 0, y: 2, w: 3, h: 2 }]);                                   /* over: the lower one */
  assert.deepEqual(used(overPair, 2), [{ x: 0, y: 2, w: 3, h: 2 }, { x: 3, y: 0, w: 3, h: 2 }]);
});

test('.show_hadamard_copies: anything not above 0 is none, 2 or more is both, anything between is one', () => {
  for (const none of [-1, -0.5, 0, NaN, null, 'two', -Infinity]) assert.deepEqual(used(timesPair, none), [], String(none));
  for (const one of [0.5, 1, 1.5, 1.999]) assert.equal(used(timesPair, one).length, 1, String(one));
  for (const both of [2, 2.5, 3, 100, Infinity]) assert.equal(used(timesPair, both).length, 2, String(both));
});

test('only a hollow of the result\'s size is used', () => {
  const row = [rect(0, 1, 4, 3), rect(4, 0, 4, 1)];                      /* a row over every row: the hollow above a is 4 by 1, the one beside it 4 by 3 */
  assert.deepEqual(used(row, 2), [{ x: 4, y: 1, w: 4, h: 3 }]);
  const under = [rect(0, 0, 4, 3), rect(4, 3, 4, 1)];                    /* over, with the row: the first hollow (under a) is the wrong size, so one copy is the other */
  assert.deepEqual(used(under, 1), [{ x: 4, y: 0, w: 4, h: 3 }]);
  assert.deepEqual(used(under, 2), [{ x: 4, y: 0, w: 4, h: 3 }]);
  assert.deepEqual(used([rect(0, 0, 1, 1), rect(1, 1, 4, 4)], 2), []);   /* a single entry: neither hollow is 4 by 4 */
  assert.deepEqual(used([rect(0, 1, 1, 1), rect(1, 0, 1, 1)], 2), [{ x: 1, y: 1, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 }]);      /* two single entries: both are */
});

test('a chain of three or more, a piece of another rule, and an undefined pair have no hollow', () => {
  assert.deepEqual(used([rect(0, 4, 3, 2), rect(3, 2, 3, 2), rect(6, 0, 3, 2)], 2), []);      /* three along the diagonal */
  assert.deepEqual(used([rect(0, 0, 3, 2), rect(0, 2, 3, 2)], 2), []);                         /* a sum */
  assert.deepEqual(used([rect(0, 0, 3, 2), rect(3, 0, 2, 3)], 2), []);                         /* a product */
  assert.deepEqual(used([rect(0, 0, 3, 2)], 2), []);                                           /* a shape on its own */
  assert.deepEqual(used([rect(0, 2, 3, 2), rect(3, 0, 4, 2)], 2), []);                         /* times, not defined */
  assert.deepEqual(used([rect(0, 2, 2, 2), rect(2, 0, 4, 2), rect(0, 4, 2, 2)], 2), []);       /* mixed rules */
});

test('a hollow is used only where the matrix as it is written is no larger than it', () => {
  assert.deepEqual(used(timesPair, 2, { cols: 3, rows: 2 }), [lowerRight, upperLeft]);      /* written in full: exactly fits */
  assert.deepEqual(used(timesPair, 2, { cols: 4, rows: 2 }), []);                           /* one square too wide (a short named side is written as five) */
  assert.deepEqual(used(timesPair, 2, { cols: 3, rows: 3 }), []);                           /* one too tall */
  const long = [rect(0, 2, 12, 2), rect(12, 0, 12, 2)];                                     /* a long side is written elided, as five squares: smaller, and it fits */
  assert.equal(used(long, 2, { cols: 5, rows: 2 }).length, 2);
});

/* ---- what a stack was, kept to convert old projects ---- */
test('stacks finds what was a stack before format 3: lone shapes of one width, one directly on the next', () => {
  const rects = [rect(0, 2, 3, 4, 'embed'), rect(0, 0, 3, 2, 'embed'), rect(0, 6, 3, 1)];
  const out = stacks(rects);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { members: [1, 0, 2], stack: true, box: { x: 0, y: 0, w: 3, h: 7 }, type: type(3, 7, 'embed', null) });      /* then, its rows were theirs */
  assert.equal(pieces(rects)[0].rule, 'sum');      /* now, the same shapes are a sum (and this one undefined) */
});

test('a gap, a different width or a sideways step was no stack', () => {
  for (const second of [rect(0, 3, 3, 2), rect(0, 2, 4, 2), rect(1, 2, 3, 2)]){
    const out = stacks([rect(0, 0, 3, 2), second]);
    assert.equal(out.length, 2); assert.ok(out.every(p => !p.stack)); }
});

test('a shape that was part of a product was not stacked', () => {
  const rects = [rect(0, 0, 2, 2), rect(2, 0, 4, 2), rect(0, 2, 2, 2)];      /* the third is right under the first, which is in a product */
  const out = stacks(rects);
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

/* ---- the boolean tool ---- */
const R = (x, y, w, h) => ({ x, y, w, h });

test('cut: shapes that do not overlap are not cut, and sharing an edge or a corner is no overlap', () => {
  for (const b of [R(7, 0, 2, 4), R(6, 0, 2, 4), R(0, 4, 6, 2), R(6, 4, 2, 2)]){
    const c = cut(R(0, 0, 6, 4), b);
    assert.equal(c.overlap, null); assert.equal(c.a, null); assert.equal(c.b, null); assert.equal(c.refused, 'The shapes do not overlap'); }
  assert.deepEqual(cut(R(0, 0, 6, 4), R(5, 3, 2, 2)).overlap, R(5, 3, 1, 1));      /* one square over: an overlap */
});

test('cut: a band at an edge leaves one rectangle, and the shape inside leaves none', () => {
  /* +------+----+   b lies wholly inside a, over its last two columns */
  const c = cut(R(0, 0, 6, 4), R(4, 0, 2, 4));
  assert.deepEqual(c, { overlap: R(4, 0, 2, 4), a: [R(0, 0, 4, 4)], b: [], refused: null });
  assert.deepEqual(cut(R(0, 0, 6, 4), R(0, 0, 2, 4)).a, [R(2, 0, 4, 4)]);      /* at the left edge */
  assert.deepEqual(cut(R(0, 0, 6, 4), R(0, 0, 6, 1)).a, [R(0, 1, 6, 3)]);      /* along the top */
  assert.deepEqual(cut(R(0, 0, 6, 4), R(0, 3, 6, 1)).a, [R(0, 0, 6, 3)]);      /* along the bottom */
});

test('cut: a band across the middle leaves two rectangles, left then right or top then bottom', () => {
  /* +----+----+----+ */
  const c = cut(R(0, 0, 6, 4), R(2, 0, 2, 4));
  assert.deepEqual(c, { overlap: R(2, 0, 2, 4), a: [R(0, 0, 2, 4), R(4, 0, 2, 4)], b: [], refused: null });
  const d = cut(R(0, 0, 6, 4), R(0, 1, 6, 2));
  assert.deepEqual(d.a, [R(0, 0, 6, 1), R(0, 3, 6, 1)]); assert.equal(d.refused, null);
});

test('cut: a partial overlap in the same rows leaves a rectangle of each', () => {
  /* +------+---+------+ */
  const c = cut(R(0, 0, 5, 3), R(3, 0, 6, 3));
  assert.deepEqual(c, { overlap: R(3, 0, 2, 3), a: [R(0, 0, 3, 3)], b: [R(5, 0, 4, 3)], refused: null });
  const d = cut(R(0, 0, 3, 5), R(0, 3, 3, 6));      /* and in the same columns */
  assert.deepEqual([d.a, d.b], [[R(0, 0, 3, 3)], [R(0, 5, 3, 4)]]);
});

test('cut: two bands that cross leave two rectangles of each', () => {
  const c = cut(R(0, 2, 6, 2), R(2, 0, 2, 6));
  assert.deepEqual(c.a, [R(0, 2, 2, 2), R(4, 2, 2, 2)]); assert.deepEqual(c.b, [R(2, 0, 2, 2), R(2, 4, 2, 2)]); assert.equal(c.refused, null);
});

test('cut: there is no cutter, so the order only says which leftover is whose', () => {
  const one = cut(R(0, 0, 5, 3), R(3, 0, 6, 3)), other = cut(R(3, 0, 6, 3), R(0, 0, 5, 3));
  assert.deepEqual(other, { overlap: one.overlap, a: one.b, b: one.a, refused: null });
});

test('cut: what is left must be rectangles, or the whole cut is refused', () => {
  const why = 'What is left of a shape would not be a rectangle: the overlap has to cross it from one side to the other';
  /* a small shape in the middle of a large one, touching no edge: a frame round a hole */
  const hole = cut(R(0, 0, 8, 6), R(3, 2, 2, 2));
  assert.equal(hole.refused, why); assert.equal(hole.a, null); assert.deepEqual(hole.b, []); assert.deepEqual(hole.overlap, R(3, 2, 2, 2));      /* the overlap is still there to be taken */
  /* inside, against one edge but not across: the drawing, a U */
  assert.equal(cut(R(0, 0, 8, 4), R(4, 1, 3, 3)).refused, why);
  /* in a corner: an L */
  assert.equal(cut(R(0, 0, 8, 4), R(6, 2, 2, 2)).refused, why);
  /* over a corner from outside: an L of each */
  const corner = cut(R(0, 0, 4, 4), R(2, 2, 4, 4));
  assert.equal(corner.refused, why); assert.equal(corner.a, null); assert.equal(corner.b, null);
  /* across one, but turning a corner in the other: one leftover would do, and it is refused all the same */
  const half = cut(R(0, 0, 6, 2), R(2, 0, 2, 4));      /* a: two rectangles; b: one below */
  assert.equal(half.refused, null); assert.deepEqual(half.b, [R(2, 2, 2, 2)]);
  const off = cut(R(0, 0, 6, 2), R(2, 1, 2, 4));       /* now b covers only a's lower row there */
  assert.equal(off.refused, why); assert.equal(off.a, null); assert.deepEqual(off.b, [R(2, 2, 2, 3)]);
});

test('cut: the same rectangle twice is refused, since nothing would be left; one row less is not', () => {
  const c = cut(R(1, 1, 3, 2), R(1, 1, 3, 2));
  assert.equal(c.refused, 'The two shapes are the same rectangle: nothing would be left'); assert.deepEqual([c.a, c.b], [[], []]); assert.deepEqual(c.overlap, R(1, 1, 3, 2));
  assert.equal(cut(R(1, 1, 3, 2), R(1, 1, 3, 1)).refused, null);
});

test('fits: shapes that fill one rectangle exactly, with nothing missing and nothing doubled', () => {
  assert.equal(fits([R(0, 0, 3, 2), R(3, 0, 2, 2)]), true);
  assert.equal(fits([R(0, 0, 2, 2), R(2, 0, 2, 1), R(2, 1, 2, 1)]), true);
  assert.equal(fits([R(0, 0, 3, 2)]), false);                                   /* one shape is nothing to fuse */
  assert.equal(fits([R(0, 0, 3, 2), R(3, 0, 2, 3)]), false);                    /* a corner missing */
  assert.equal(fits([R(0, 0, 3, 2), R(4, 0, 2, 2)]), false);                    /* a gap */
  assert.equal(fits([R(0, 0, 3, 2), R(2, 0, 2, 2)]), false);                    /* an overlap */
  assert.equal(fits([R(0, 0, 3, 2), R(1, 0, 3, 2), R(3, 0, 1, 2)]), false);     /* the areas would add up to a rectangle, but one square is doubled and one missing */
});

test('difference: fuses what fits together, cuts two that overlap, and says why it does neither', () => {
  assert.deepEqual(difference([R(0, 0, 3, 2), R(3, 0, 2, 2)]), { fuse: true });
  assert.deepEqual(difference([R(0, 0, 2, 2), R(2, 0, 2, 1), R(2, 1, 2, 1)]), { fuse: true });
  assert.deepEqual(difference([R(0, 0, 6, 4), R(2, 0, 2, 4)]), { cut: cut(R(0, 0, 6, 4), R(2, 0, 2, 4)) });
  assert.deepEqual(difference([R(0, 0, 3, 2)]), { refused: 'Difference takes two or more shapes' });
  assert.deepEqual(difference([]), { refused: 'Difference takes two or more shapes' });
  assert.deepEqual(difference([R(0, 0, 3, 2), R(4, 0, 2, 2)]), { refused: 'To be fused the shapes must fit together into one rectangle, and to be cut two must overlap' });
  /* three shapes, two of which overlap: a cut takes exactly two, even where the third would fit */
  assert.deepEqual(difference([R(0, 0, 6, 4), R(2, 0, 2, 4), R(6, 0, 2, 4)]), { refused: 'A cut takes exactly two shapes' });
  assert.deepEqual(difference([R(0, 0, 8, 6), R(3, 2, 2, 2)]), { refused: cut(R(0, 0, 8, 6), R(3, 2, 2, 2)).refused });
  assert.deepEqual(difference([R(0, 0, 2, 2), R(0, 0, 2, 2)]), { refused: 'The two shapes are the same rectangle: nothing would be left' });
});

test('intersection: exactly two shapes that overlap, however they do', () => {
  assert.deepEqual(intersection([R(0, 0, 6, 4), R(2, 0, 2, 4)]), { overlap: R(2, 0, 2, 4), from: 0 });
  assert.deepEqual(intersection([R(0, 0, 8, 6), R(3, 2, 2, 2)]), { overlap: R(3, 2, 2, 2), from: 0 });      /* where a difference is refused */
  assert.deepEqual(intersection([R(0, 0, 4, 4), R(2, 2, 4, 4)]), { overlap: R(2, 2, 2, 2), from: 0 });
  assert.deepEqual(intersection([R(0, 0, 2, 2), R(0, 0, 2, 2)]), { overlap: R(0, 0, 2, 2), from: 0 });      /* the same rectangle: all of it */
  assert.equal(intersection([R(2, 0, 2, 4), R(0, 0, 6, 4)]).from, 0);      /* the part is of the lower shape, the first given, whichever is the larger */
  assert.deepEqual(intersection([R(0, 0, 3, 2), R(3, 0, 2, 2)]), { refused: 'The shapes do not overlap' });
  assert.deepEqual(intersection([R(0, 0, 3, 2)]), { refused: 'Intersect takes exactly two shapes' });
  assert.deepEqual(intersection([R(0, 0, 6, 4), R(2, 0, 2, 4), R(1, 0, 2, 4)]), { refused: 'Intersect takes exactly two shapes' });
});

test('a range is whole columns and rows of its source, from 0, and knows which edges it reached', () => {
  const src = R(10, 5, 6, 4);
  assert.deepEqual(rangeOf(src, R(12, 5, 2, 4)), { col: 2, row: 0, cols: 2, rows: 4, toEnd: { cols: false, rows: true } });
  assert.deepEqual(rangeOf(src, R(14, 5, 2, 4)), { col: 4, row: 0, cols: 2, rows: 4, toEnd: { cols: true, rows: true } });
  assert.deepEqual(rangeOf(src, R(13, 6, 2, 2)), { col: 3, row: 1, cols: 2, rows: 2, toEnd: { cols: false, rows: false } });
});

test('a range stays on the same columns however its source is resized, and one that reached an edge goes on reaching it', () => {
  const mid = { col: 2, row: 0, cols: 2, rows: 4, toEnd: { cols: false, rows: true } };
  assert.deepEqual(rangeIn(mid, 6, 4), { col: 2, row: 0, cols: 2, rows: 4 });
  assert.deepEqual(rangeIn(mid, 9, 7), { col: 2, row: 0, cols: 2, rows: 7 });      /* columns 3 and 4 still; every row, now seven */
  assert.deepEqual(rangeIn(mid, 4, 1), { col: 2, row: 0, cols: 2, rows: 1 });      /* the boundary: just wide enough */
  assert.equal(rangeIn(mid, 3, 4), null);                                          /* column 4 is gone: no such range */
  const end = { col: 4, row: 1, cols: 2, rows: 3, toEnd: { cols: true, rows: false } };
  assert.deepEqual(rangeIn(end, 10, 4), { col: 4, row: 1, cols: 6, rows: 3 });     /* its stored cols is not looked at */
  assert.deepEqual(rangeIn(end, 5, 4), { col: 4, row: 1, cols: 1, rows: 3 });      /* the boundary: one column left */
  assert.equal(rangeIn(end, 4, 4), null);                                          /* none left */
  assert.equal(rangeIn(end, 10, 3), null);                                         /* rows 2 to 4 are named, and row 4 is gone */
});

test('a side of a range is whole only where it runs from the first column or row to the end', () => {
  const r = { col: 2, row: 0, cols: 2, rows: 4, toEnd: { cols: false, rows: true } };
  assert.equal(wholeSide(r, 'cols'), false); assert.equal(wholeSide(r, 'rows'), true);
  assert.equal(wholeSide({ ...r, col: 0 }, 'cols'), false);                                    /* from the first, but not to the end */
  assert.equal(wholeSide({ ...r, toEnd: { cols: true, rows: true } }, 'cols'), false);         /* to the end, but not from the first */
  assert.equal(wholeSide({ ...r, col: 0, toEnd: { cols: true, rows: true } }, 'cols'), true);
});

test('a shortened side is labelled from both shapes names for it, and a whole one keeps its own', () => {
  const part = { col: 0, row: 0, cols: 2, rows: 4, toEnd: { cols: false, rows: true } };
  assert.equal(sideLabel(part, 'cols', 'embed', 'head', 'difference'), 'embed-head');
  assert.equal(sideLabel(part, 'cols', 'head', 'embed', 'difference'), 'head-embed');      /* the other shape's leftover */
  assert.equal(sideLabel(part, 'cols', 'Keys.x', 'head', 'intersect'), 'Keys.x&head');
  assert.equal(sideLabel(part, 'cols', 'embed', 'head', 'difference', 1), 'embed-head.1');
  assert.equal(sideLabel(part, 'cols', 'embed', 'head', 'difference', 2), 'embed-head.2');
  assert.equal(sideLabel(part, 'rows', 'context', 'batch', 'difference', 2), 'context');   /* the whole side: its own name, and no number */
  assert.equal(sideLabel(part, 'rows', null, 'batch', 'difference'), null);
  assert.equal(sideLabel(part, 'cols', null, 'head', 'difference'), null);                 /* either has no name: no label */
  assert.equal(sideLabel(part, 'cols', 'embed', null, 'intersect'), null);
});

test('two ranges one operation made of one source are numbered left to right or top to bottom; one alone has no number', () => {
  const left = rangeOf(R(0, 0, 6, 4), R(0, 0, 2, 4)), right = rangeOf(R(0, 0, 6, 4), R(4, 0, 2, 4));
  assert.equal(nthOf(left, [right, left]), 1); assert.equal(nthOf(right, [right, left]), 2); assert.equal(nthOf(right, [right]), 0);
  const top = rangeOf(R(0, 0, 6, 4), R(0, 0, 6, 1)), bottom = rangeOf(R(0, 0, 6, 4), R(0, 3, 6, 1));
  assert.equal(nthOf(top, [top, bottom]), 1); assert.equal(nthOf(bottom, [top, bottom]), 2);
});

test('a shape with no value gives its piece none, alone or touching', () => {
  assert.deepEqual(typeOf([{ ...rect(0, 0, 3, 2), none: true }]), { error: 'no value' });
  const [p] = pieces([rect(0, 0, 3, 2), { ...rect(3, 0, 4, 3), none: true }]);
  assert.deepEqual(p.type, { error: 'no value' }); assert.deepEqual(p.members, [0, 1]);
  assert.deepEqual(typeOf([rect(0, 0, 3, 2), rect(3, 0, 4, 3)]), type(4, 2));      /* and with a value, as ever */
});
