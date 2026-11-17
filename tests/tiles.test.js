/* tiles.js: a region whose contents repeat a whole number of times. Run with: node --test */
import './solver.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enterable, spanned, LIMIT, NO_INDEX, kept, count, typed, counts, filled, settable, dragged, slots, layout, footprint, within, members, makable, index, axisOf, reads, indexValues, matrix, entries, whole, mapped, startIn } from '../tiles.js';

const rep = (cols, rows, across = 1, down = 1, x = 0, y = 0) => ({ x, y, cols, rows, across, down });
const rect = (x, y, w, h) => ({ x, y, w, h });
const M = o => new Map(Object.entries(o));
/* a lookup that knows Keys (4 wide, 3 tall), a scalar's mass and an attribute, by capsule */
const lookup = t => typeof t === 'string' ? undefined : t.id !== 'keys' ? undefined : t.measure === 'x' ? 4 : t.measure === 'y' ? 3 : t.measure === 'm' ? 9 : t.measure === 'a' ? 2 : 2;

test('a repeat is kept as whole numbers, a pattern of at least 1 by 1, and counts of at least 1 or a formula', () => {
  assert.deepEqual(kept({ x: 2, y: -3, cols: 3, rows: 2, across: 3, down: { expr: '@[keys:y]' } }), { x: 2, y: -3, cols: 3, rows: 2, across: 3, down: { expr: '@[keys:y]' } });
  assert.deepEqual(kept({ cols: 0, rows: 2.4, across: 0, down: 'three' }), { x: 0, y: 0, cols: 1, rows: 2, across: 1, down: 1 });
  assert.deepEqual(kept({ x: 1.6, y: '4', cols: '3', rows: 1, across: 2.5, down: { expr: '  ' } }), { x: 2, y: 4, cols: 3, rows: 1, across: 1, down: 1 });
  for (const none of [null, undefined, 3, 'tile', false]) assert.equal(kept(none), null);      /* an ordinary frame */
});

test('a count is a whole number of at least 1', () => {
  assert.deepEqual(count(1), { count: 1, formula: false }); assert.deepEqual(count(40), { count: 40, formula: false });
  assert.match(count(0).refused, /whole number, at least 1, and that comes to 0/);      /* the boundary: 1 is the least */
  assert.match(count(-2).refused, /at least 1/); assert.match(count(1.5).refused, /at least 1/);
  assert.match(count(null).refused, /nothing yet/); assert.match(count({ n: 3, d: 2, k: 0 }).refused, /3\/2/);
});

test('a count that is a formula comes to a whole number from sizes alone', () => {
  assert.deepEqual(count({ expr: '@[keys:y]' }, lookup), { count: 3, formula: true });
  assert.deepEqual(count({ expr: '@[keys:x] * 2 - 7' }, lookup), { count: 1, formula: true });      /* exactly 1 */
  assert.match(count({ expr: '@[keys:x] - 4' }, lookup).refused, /comes to 0/);                      /* and one less */
  assert.match(count({ expr: '@[keys:x] / 3' }, lookup).refused, /comes to 4\/3/);
  assert.match(count({ expr: '@[gone:x]' }, lookup).refused, /an error \(missing variable\)/);
  assert.match(count({ expr: '@[keys:m]' }, lookup).refused, /sizes alone: a width or a height, not a mass/);
  assert.match(count({ expr: '@[keys:a:heads]' }, lookup).refused, /not an attribute/);
  assert.match(count({ expr: '@[keys:g]' }, lookup).refused, /not a gap/);
  assert.match(count({ expr: 'heads' }, lookup).refused, /unknown name: heads/);
  assert.match(count({ expr: '@[keys:x] > 2' }, lookup).refused, /at least 1/);                      /* true is no number of times */
});

test('what typing a count stores: a number, or a formula where it names a size', () => {
  assert.deepEqual(typed('3', lookup), { value: 3 });
  assert.deepEqual(typed('2 * 3', lookup), { value: 6 });                    /* numbers alone: what it comes to */
  assert.deepEqual(typed('@[keys:y]', lookup), { value: { expr: '@[keys:y]' } });
  assert.deepEqual(typed('@[keys:y] + 1', lookup), { value: { expr: '@[keys:y] + 1' } });
  assert.match(typed('', lookup).refused, /nothing was typed/);
  assert.match(typed('0', lookup).refused, /at least 1/); assert.match(typed('3/2', lookup).refused, /at least 1/);
  assert.match(typed('@[keys:m]', lookup).refused, /sizes alone/);
  assert.match(typed('2 +', lookup).refused, /cannot be read/);
});

test('both counts, with 1 standing in for one that cannot be worked out, and why', () => {
  assert.deepEqual(counts(rep(3, 2, 3, 2)), { across: 3, down: 2, formula: { across: false, down: false }, warn: null });
  assert.deepEqual(counts(rep(4, 1, 1, { expr: '@[keys:y]' }), lookup), { across: 1, down: 3, formula: { across: false, down: true }, warn: null });
  const gone = counts(rep(4, 1, { expr: '@[gone:x]' }, 2), lookup);
  assert.equal(gone.across, 1); assert.equal(gone.down, 2); assert.match(gone.warn, /^across: .*missing variable/);
  assert.match(counts(rep(1, 1, 2, { expr: '@[keys:x]/3' }), lookup).warn, /^down: /);
});

test('the filled size is the pattern times the counts', () => {
  assert.deepEqual(filled(rep(3, 2), 3, 2), { cols: 9, rows: 4 });
  assert.deepEqual(filled(rep(4, 1), 1, 3), { cols: 4, rows: 3 });
  assert.deepEqual(filled(rep(1, 1), 1, 1), { cols: 1, rows: 1 });
});

test('the pattern is resized and the tile moved only to whole units', () => {
  assert.deepEqual(settable(rep(3, 2, 2, 2), { cols: 4 }).repeat, rep(4, 2, 2, 2));
  assert.deepEqual(settable(rep(3, 2), { x: -5, y: 7 }).repeat, rep(3, 2, 1, 1, -5, 7));
  assert.match(settable(rep(3, 2), { cols: 0 }).refused, /width is a whole number of units, at least 1/);
  assert.match(settable(rep(3, 2), { rows: 1.5 }).refused, /height/);
  assert.match(settable(rep(3, 2), { x: .5 }).refused, /whole units/);
  assert.deepEqual(settable(rep(3, 2), { rows: 1 }).repeat.rows, 1);      /* the least */
});

test('an edge dragged gives a count in whole patterns, never less than 1', () => {
  assert.equal(dragged(3, 9), 3); assert.equal(dragged(3, 10.4), 3); assert.equal(dragged(3, 10.6), 4);
  assert.equal(dragged(3, 1), 1); assert.equal(dragged(3, -8), 1); assert.equal(dragged(1, 64), 64);
});

test('every cell is drawn up to 64 of them; beyond that, the first three and the last each way', () => {
  const cells = list => list.map(o => o.dots ? '…' : o.cell).join(' ');
  assert.equal(LIMIT, 64);
  let s = slots(3, 2); assert.equal(cells(s.xs), '1 2 3'); assert.equal(cells(s.ys), '1 2');
  s = slots(8, 8); assert.equal(cells(s.xs), '1 2 3 4 5 6 7 8'); assert.equal(s.ys.length, 8);      /* exactly 64: all of them */
  s = slots(13, 5); assert.equal(cells(s.xs), '1 2 3 … 13'); assert.equal(cells(s.ys), '1 2 3 … 5');      /* 65: elided each way */
  s = slots(65, 1); assert.equal(cells(s.xs), '1 2 3 … 65'); assert.equal(cells(s.ys), '1');
  s = slots(4, 17); assert.equal(cells(s.xs), '1 2 3 4'); assert.equal(cells(s.ys), '1 2 3 … 17');      /* four is its first three and its last already */
  s = slots(64, 1); assert.equal(s.xs.length, 64);
});

test('a count that is a formula is one pattern and an ellipsis on the side it repeats toward', () => {
  const cells = list => list.map(o => o.dots ? '…' : o.cell).join(' ');
  let s = slots(1, 3, { down: true }); assert.equal(cells(s.xs), '1'); assert.equal(cells(s.ys), '1 …');
  s = slots(4, 2, { across: true }); assert.equal(cells(s.xs), '1 …'); assert.equal(cells(s.ys), '1 2');
  s = slots(1, 1, { across: true }); assert.equal(cells(s.xs), '1 …');      /* even where it comes to 1 just now */
  s = slots(500, 70, { across: true }); assert.equal(cells(s.ys), '1 2 3 … 70');      /* the other way is counted on its own */
  s = slots(500, 64, { across: true }); assert.equal(s.ys.length, 64);
});

test('where each drawn cell is, and the footprint of all that is drawn', () => {
  const l = layout(rep(3, 2), 3, 2);
  assert.deepEqual(l.xs, [{ cell: 1, at: 0, size: 3 }, { cell: 2, at: 3, size: 3 }, { cell: 3, at: 6, size: 3 }]);
  assert.deepEqual(l.ys, [{ cell: 1, at: 0, size: 2 }, { cell: 2, at: 2, size: 2 }]);
  assert.equal(l.w, 9); assert.equal(l.h, 4);
  const far = layout(rep(2, 1), 100, 1);      /* three patterns, one unit of ellipsis, the last */
  assert.deepEqual(far.xs.map(o => [o.dots ? '…' : o.cell, o.at, o.size]), [[1, 0, 2], [2, 2, 2], [3, 4, 2], ['…', 6, 1], [100, 7, 2]]);
  assert.equal(far.w, 9);
  assert.deepEqual(footprint(rep(4, 1, 1, 1, 5, -2), 1, 3, { down: true }), { x: 5, y: -2, w: 4, h: 2 });
  assert.deepEqual(footprint(rep(4, 1, 1, 1, 5, -2), 1, 3), { x: 5, y: -2, w: 4, h: 3 });
});

test('what a tile takes in when it is drawn: the blocks wholly inside its rectangle', () => {
  const rects = [rect(0, 0, 2, 1), rect(2, 0, 1, 2), rect(2, 1, 2, 1), rect(-1, 0, 1, 1), rect(9, 9, 1, 1)];
  assert.deepEqual(members(rect(0, 0, 3, 2), rects), [0, 1]);      /* the third runs one unit past the right edge; the fourth lies against it outside */
  assert.deepEqual(members(rect(0, 0, 4, 2), rects), [0, 1, 2]);
  assert.deepEqual(members(rect(20, 20, 3, 3), rects), []);        /* over empty canvas */
  assert.equal(within(rep(3, 2), rect(1, 1, 2, 1)), true); assert.equal(within(rep(3, 2), rect(1, 1, 3, 1)), false);
  assert.equal(within(rep(3, 2, 4, 4), rect(3, 0, 1, 1)), false);      /* the second cell is not the pattern */
});

test('a tile is drawn on whole units, at least 1 by 1, and not over another tile', () => {
  assert.deepEqual(makable(rect(0, 0, 1, 1)), { ok: true });
  assert.match(makable(rect(0, 0, 0, 2)).refused, /at least 1 by 1/); assert.match(makable(rect(.5, 0, 2, 2)).refused, /whole units/);
  const other = [rect(0, 0, 6, 2)];      /* another tile's footprint: 3 by 2, twice across */
  assert.match(makable(rect(5, 1, 2, 2), other).refused, /cannot lie over another tile/);
  assert.match(makable(rect(4, 0, 1, 1), other).refused, /over another tile/);      /* over a drawn copy is over the tile */
  assert.deepEqual(makable(rect(6, 0, 2, 2), other), { ok: true });                  /* edge to edge */
  assert.deepEqual(makable(rect(0, 2, 6, 1), other), { ok: true });
  /* a block inside the rectangle that is in a tile already: its tile's pattern may be elsewhere, but the block is that tile's */
  assert.match(makable(rect(20, 20, 3, 3), other, 1).refused, /does not go inside a tile/);
  assert.deepEqual(makable(rect(20, 20, 3, 3), other, 0), { ok: true });
});

test('blocks go into a tile as into a frame, but a whole tile does not go into another', () => {
  assert.deepEqual(enterable(true, false), { ok: true });      /* plain blocks, or some of a tile's, into a tile */
  assert.deepEqual(enterable(false, true), { ok: true });      /* a whole tile, into an ordinary frame */
  assert.deepEqual(enterable(false, false), { ok: true });
  assert.match(enterable(true, true).refused, /does not go inside another tile/);
});

test('an arrow that reads a tile keeps its start and its span: only what leaves them as they are is taken', () => {
  const a = { side: 'e', start: 1, span: 3, gap: 2 };
  assert.deepEqual(spanned(a, { gap: 4 }), { ok: true }); assert.deepEqual(spanned(a, { side: 's' }), { ok: true });
  assert.deepEqual(spanned(a, { start: 1, span: 3, gap: 5 }), { ok: true });      /* a drag that changed only the gap says all three */
  assert.match(spanned(a, { span: 2 }).refused, /reads all of it/); assert.match(spanned(a, { start: 2 }).refused, /seat a block on its output/);
});

test('the index of an entry is its column and row counted across the whole filled tile', () => {
  const p = rep(3, 2);
  assert.deepEqual(index(p, { x: 0, y: 0 }, 1, 1, 1, 1), { x: 1, y: 1 });
  assert.deepEqual(index(p, { x: 0, y: 0 }, 1, 1, 2, 1), { x: 4, y: 1 });
  assert.deepEqual(index(p, { x: 0, y: 0 }, 1, 1, 1, 2), { x: 1, y: 3 });
  assert.deepEqual(index(p, { x: 1, y: 1 }, 2, 1, 3, 2), { x: 2 * 3 + 1 + 2, y: 1 * 2 + 1 + 1 });      /* (cx − 1) · pw + ox + c */
  assert.deepEqual(index(p, { x: 2, y: 0 }, 1, 2), { x: 3, y: 2 });      /* with no cell given, the first */
  /* a 1 by 1 pattern, 2 by 2: index.x + index.y is 2, 3, 3, 4 */
  const one = rep(1, 1), sum = (cx, cy) => { const i = index(one, { x: 0, y: 0 }, 1, 1, cx, cy); return i.x + i.y; };
  assert.deepEqual([sum(1, 1), sum(2, 1), sum(1, 2), sum(2, 2)], [2, 3, 3, 4]);
});

test('index.x and index.y are the two names of the index, and a text that uses neither does not read it', () => {
  assert.equal(axisOf('index.x'), 'x'); assert.equal(axisOf('Index.Y'), 'y'); assert.equal(axisOf(' index.x '), 'x');
  for (const other of ['index', 'index.z', 'x', 'index.xy', 'myindex.x', null, 3]) assert.equal(axisOf(other), null);
  assert.equal(reads('index.x + index.y'), true); assert.equal(reads('select(index.y > 2, 1, 0)'), true); assert.equal(reads('2index.x'), true);
  assert.equal(reads('x + i + j'), false); assert.equal(reads('reindex.x'), false); assert.equal(reads('index.xs'), false); assert.equal(reads(''), false); assert.equal(reads(null), false);
});

test('the index as two matrices the size of a block', () => {
  const p = rep(3, 2), xs = indexValues(p, { x: 1, y: 0 }, 2, 2, 'x', 2, 1), ys = indexValues(p, { x: 1, y: 0 }, 2, 2, 'y', 2, 3);
  assert.deepEqual(xs, M({ '1,1': 5, '2,1': 6, '1,2': 5, '2,2': 6 }));
  assert.deepEqual(ys, M({ '1,1': 5, '2,1': 5, '1,2': 6, '2,2': 6 }));
  assert.deepEqual(indexValues(p, { x: 0, y: 0 }, 1, 1, 'x'), M({ '1,1': 1 }));
  assert.deepEqual(NO_INDEX, { err: 'not in a tile: there is no index' });
});

test('a tile has a matrix when its pattern is covered exactly by blocks, and it is the filled size', () => {
  assert.deepEqual(matrix(rep(4, 1), 1, 3, [rect(0, 0, 4, 1)]), { cols: 4, rows: 3 });
  assert.deepEqual(matrix(rep(3, 2, 1, 1, 5, 5), 2, 2, [rect(5, 5, 2, 2), rect(7, 5, 1, 1), rect(7, 6, 1, 1)]), { cols: 6, rows: 4 });
  assert.deepEqual(matrix(rep(1, 1), 1, 1, [rect(0, 0, 1, 1)]), { cols: 1, rows: 1 });
});

test('a tile whose pattern has a gap, an overlap or a block outside it, or nothing in it, has no matrix', () => {
  assert.deepEqual(matrix(rep(4, 1), 1, 3, [rect(0, 0, 3, 1)]), { error: 'its pattern has a gap' });      /* one entry short */
  assert.deepEqual(matrix(rep(3, 2), 1, 1, [rect(0, 0, 2, 2), rect(1, 0, 2, 2)]), { error: 'two blocks in its pattern overlap' });
  assert.deepEqual(matrix(rep(3, 2), 1, 1, [rect(0, 0, 3, 2), rect(3, 0, 1, 2)]), { error: 'a block of it lies outside its pattern' });      /* against its edge, outside */
  assert.deepEqual(matrix(rep(3, 2), 1, 1, [rect(0, 0, 4, 2)]), { error: 'a block of it lies outside its pattern' });
  assert.deepEqual(matrix(rep(3, 2), 2, 2, []), { error: 'its pattern is empty' });
  /* the right area, and still not a cover: two blocks one over the other beside a gap */
  assert.deepEqual(matrix(rep(2, 1), 1, 1, [rect(0, 0, 1, 1), rect(0, 0, 1, 1)]), { error: 'two blocks in its pattern overlap' });
});

test('the entries of a tile\'s matrix are every cell\'s blocks set in their places', () => {
  /* 4 by 1 holding 1 2 3 4, three down: those numbers in every row */
  const row = M({ '1,1': 1, '2,1': 2, '3,1': 3, '4,1': 4 }), got = entries(rep(4, 1), 1, 3, [rect(0, 0, 4, 1)], () => row);
  assert.equal(got.size, 12);
  for (let r = 1; r <= 3; r++) assert.deepEqual([1, 2, 3, 4].map(c => got.get(c + ',' + r)), [1, 2, 3, 4]);
  /* two blocks in a 2 by 1 pattern at 5,5, twice across; the second differs from cell to cell */
  const two = entries(rep(2, 1, 1, 1, 5, 5), 2, 1, [rect(5, 5, 1, 1), rect(6, 5, 1, 1)], (n, cx) => M({ '1,1': n === 0 ? 7 : 10 * cx }));
  assert.deepEqual(two, M({ '1,1': 7, '2,1': 10, '3,1': 7, '4,1': 20 }));
  /* an entry a block has not been given is not in the matrix, and one outside the block's size is not taken */
  assert.deepEqual(entries(rep(2, 1), 1, 1, [rect(0, 0, 2, 1)], () => M({ '2,1': 5, '3,1': 9 })), M({ '2,1': 5 }));
});

test('an arrow that reads a tile reads all of it', () => {
  assert.deepEqual(whole({ side: 'e', start: 2, span: 1, gap: 2 }, { cols: 4, rows: 3 }), { side: 'e', start: 1, span: 3, gap: 2 });
  assert.deepEqual(whole({ side: 's', start: 1, span: 1, gap: 1 }, { cols: 4, rows: 3 }), { side: 's', start: 1, span: 4, gap: 1 });
});

test('map: an arrow in a tile is repeated along its input, each cell one span on', () => {
  const a = { side: 's', start: 1, span: 1, gap: 2 };
  assert.deepEqual(mapped(a, rep(1, 2), 4, 1, 4), { count: 4, warn: null });      /* under column 1 of a 4-wide block, across 4 */
  assert.deepEqual([1, 2, 3, 4].map(k => startIn(a, k)), [1, 2, 3, 4]);
  const b = { side: 'e', start: 2, span: 2, gap: 1 };
  assert.deepEqual(mapped(b, rep(3, 2), 1, 3, 7), { count: 3, warn: null });      /* rows 2-3, 4-5, 6-7 of 7: the last one just fits */
  assert.deepEqual([1, 2, 3].map(k => startIn(b, k)), [2, 4, 6]);
  assert.deepEqual(mapped(a, rep(1, 2), 1, 1, 4), { count: 1, warn: null });      /* counts of 1: once */
});

test('map is refused where the tile repeats the other way, the pattern is not the span, or the last cell runs past the input', () => {
  const a = { side: 's', start: 1, span: 1, gap: 2 };
  assert.match(mapped(a, rep(1, 2), 4, 2, 4).warn, /repeats down, and an arrow against columns is repeated across only/);
  assert.match(mapped({ ...a, side: 'e' }, rep(2, 1), 2, 3, 4).warn, /repeats across, and an arrow against rows is repeated down only/);
  assert.match(mapped(a, rep(2, 2), 2, 1, 4).warn, /pattern is 2 wide and the arrow's span is 1/);
  assert.match(mapped({ ...a, side: 'w', span: 2 }, rep(2, 3), 1, 2, 9).warn, /pattern is 3 tall and the arrow's span is 2/);
  const past = mapped(a, rep(1, 2), 5, 1, 4);
  assert.equal(past.count, 5); assert.match(past.warn, /last cell runs past its input, which has 4 columns/);
  assert.match(mapped({ ...a, start: 2 }, rep(1, 2), 4, 1, 4).warn, /runs past/);      /* one column on is one too many */
  assert.equal(mapped({ ...a, start: 2 }, rep(1, 2), 3, 1, 4).warn, null);
});
