/* tiles.js: a region whose contents repeat a whole number of times. Run with: node --test */
import './solver.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEPTH, nest, laid, overlaps, overlapping, allowed, home, moved, indexless, drawnOn, movable, held, settled, circular, enterable, spanned, LIMIT, NO_INDEX, kept, count, typed, counts, filled, settable, dragged, slots, layout, footprint, within, members, makable, index, axisOf, reads, indexValues, matrix, entries, whole, mapped, startIn } from '../tiles.js';

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
  assert.match(count({ expr: '@[keys:m]' }, lookup).refused, /not a mass that is unknown or worked out/);      /* no entryOf: nothing is known of it */
  assert.match(count({ expr: '@[keys:a:heads]' }, lookup).refused, /not an attribute/);
  assert.match(count({ expr: '@[keys:g]' }, lookup).refused, /not a gap/);
  assert.match(count({ expr: 'heads' }, lookup).refused, /unknown name: heads/);
  assert.match(count({ expr: '@[keys:x] > 2' }, lookup).refused, /at least 1/);                      /* true is no number of times */
});

test('a count that depends on its own tile\'s size is refused, whatever it would come to', () => {
  /* the tile t; an arrow a that reads it; B seated on a; C a reference to B; D sharing a side's name with C; another tile u whose count reads D */
  const next = id => ({ t: ['keys'], a: ['t'], B: ['a'], C: ['B'], D: ['C'], u: ['D'], keys: [], free: ['keys'] })[id] || [];
  assert.equal(circular('t', ['B'], next), true);            /* directly: the block seated on the tile's own arrow */
  assert.equal(circular('t', ['D'], next), true);            /* through a reference and a shared side */
  assert.equal(circular('t', ['u'], next), true);            /* through another tile's count */
  assert.equal(circular('t', ['t'], next), true);
  assert.equal(circular('t', ['keys'], next), false);        /* what the tile itself reads is not the tile */
  assert.equal(circular('t', ['free', 'keys'], next), false); assert.equal(circular('t', [], next), false);
  assert.equal(circular('u', ['B'], next), false);           /* B follows t, and t does not follow u */
  assert.equal(circular('t', ['x'], id => id === 'x' ? ['y'] : id === 'y' ? ['x'] : []), false);      /* a loop elsewhere is walked once and is not this tile's */
  assert.match(count({ expr: '@[keys:y]' }, lookup, { loops: true }).refused, /^it depends on itself/);
  assert.deepEqual(count({ expr: '@[keys:y]' }, lookup, { loops: false }), { count: 3, formula: true });
  assert.deepEqual(count(3, lookup, { loops: true }), { count: 3, formula: false });      /* a number reads nothing */
  /* kept in a project all the same: it is 1, with the reason, and the other count stands */
  const c = counts(rep(2, 1, { expr: '@[keys:x]' }, { expr: '@[keys:y]' }), lookup, { across: { loops: true } });
  assert.equal(c.across, 1); assert.equal(c.down, 3); assert.match(c.warn, /^across: it depends on itself/);
});

test('a count may read the mass of a scalar whose entry is a literal number, or a formula of sizes and such masses', () => {
  /* n holds 3; half holds 3/2; k holds a formula of a size; deep a formula of k's mass; own a formula of its own x;
     attr a formula of an attribute; loop reads itself; seated is worked out some other way */
  const held = { n: 3, half: { n: 3, d: 2, k: 0 }, k: { expr: '@[keys:y] + 1' }, deep: { expr: '2 * @[k:m]' }, own: { expr: 'x * 2' }, attr: { expr: '@[keys:a:heads]' }, loop: { expr: '@[loop:m] + 1' }, fn: { expr: 'max(@[keys:x], 2)' } };
  const entryOf = id => held[id];
  for (const ok of ['@[n:m]', '@[k:m]', '@[deep:m]', '@[fn:m]', '@[keys:x] * @[n:m]', '@[half:m] * 2']) assert.deepEqual(settled(ok, entryOf), { ok: true }, ok);
  assert.match(settled('@[own:m]', entryOf).refused, /not a mass worked out from the scalar's own measures/);
  assert.match(settled('@[attr:m]', entryOf).refused, /not an attribute/);
  assert.match(settled('@[seated:m]', entryOf).refused, /not a mass that is unknown or worked out/);      /* entryOf knows nothing of it */
  assert.match(settled('@[loop:m]', entryOf).refused, /not a mass that depends on itself/);
  assert.match(settled('@[keys:x] + @[keys]', entryOf).refused, /not a whole shape/);
  /* and what the count then comes to is still to be a whole number of at least 1 */
  const look = t => typeof t === 'string' ? undefined : t.id === 'n' ? 3 : t.id === 'half' ? { n: 3, d: 2, k: 0 } : lookup(t);
  assert.deepEqual(count({ expr: '@[n:m]' }, look, { entryOf }), { count: 3, formula: true });
  assert.deepEqual(count({ expr: '@[half:m] * 2' }, look, { entryOf }), { count: 3, formula: true });
  assert.match(count({ expr: '@[half:m]' }, look, { entryOf }).refused, /comes to 3\/2/);
});

test('what typing a count stores: a number, or a formula where it names a size', () => {
  assert.deepEqual(typed('3', lookup), { value: 3 });
  assert.deepEqual(typed('2 * 3', lookup), { value: 6 });                    /* numbers alone: what it comes to */
  assert.deepEqual(typed('@[keys:y]', lookup), { value: { expr: '@[keys:y]' } });
  assert.deepEqual(typed('@[keys:y] + 1', lookup), { value: { expr: '@[keys:y] + 1' } });
  assert.match(typed('', lookup).refused, /nothing was typed/);
  assert.match(typed('0', lookup).refused, /at least 1/); assert.match(typed('3/2', lookup).refused, /at least 1/);
  assert.match(typed('@[keys:m]', lookup).refused, /settled before anything is worked out/);
  assert.deepEqual(typed('@[keys:m]', lookup, { entryOf: () => 9 }), { value: { expr: '@[keys:m]' } });
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

test('a tile moves on its own unless an arrow is repeated in it', () => {
  assert.deepEqual(movable(false), { ok: true });
  assert.match(movable(true).refused, /lies along that arrow's input: move the input/);
});

test('an edge dragged changes the count by the whole patterns moved, from the count it had, never to less than 1', () => {
  assert.equal(dragged(1, 3, 6), 3); assert.equal(dragged(3, 3, 1.4), 3); assert.equal(dragged(3, 3, 1.6), 4);      /* half a pattern is the boundary */
  assert.equal(dragged(3, 3, -3), 2); assert.equal(dragged(3, 3, -6), 1); assert.equal(dragged(3, 3, -60), 1);
  /* a tile drawn elided: 70 across in a pattern 2 wide, its edge pulled 2 units, is 71, not what the drawn width would hold */
  assert.equal(dragged(70, 2, 2), 71); assert.equal(dragged(70, 2, -4), 68); assert.equal(dragged(70, 2, 0), 70);
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

test('a block of a tile dragged the ordinary way stays inside the pattern', () => {
  const p = rep(6, 3, 3, 1, 10, 10), r = rect(11, 10, 2, 1);      /* a 2 by 1 block one unit in from the pattern's left edge */
  assert.deepEqual(held(p, r, 1, 1), { dx: 1, dy: 1, stopped: false });
  assert.deepEqual(held(p, r, 3, 2), { dx: 3, dy: 2, stopped: false });      /* exactly into the far corner */
  assert.deepEqual(held(p, r, 4, 2), { dx: 3, dy: 2, stopped: true });       /* one unit further: stopped at the edge */
  assert.deepEqual(held(p, r, 3, -5), { dx: 3, dy: 0, stopped: true });      /* the reviewer's drag: 3 right and 5 up */
  assert.deepEqual(held(p, r, -9, 0), { dx: -1, dy: 0, stopped: true });
  assert.deepEqual(held(p, r, 0, 0), { dx: 0, dy: 0, stopped: false });
  /* the second cell is not the pattern: a block cannot be dragged onto a copy */
  assert.equal(held(p, r, 6, 0).dx, 3);
  /* a block as large as the pattern does not move at all */
  assert.deepEqual(held(rep(2, 1), rect(0, 0, 2, 1), 1, 0), { dx: 0, dy: 0, stopped: true });
});

/* the tiles of a space as tiles.js takes them: T(id, the tile it is in, x, y, pattern cols, rows, across, down, formula) */
const T = (id, up, x, y, cols, rows, across = 1, down = 1, formula = {}) => ({ id, in: up, repeat: rep(cols, rows, across, down, x, y), across, down, formula });

test('a tile is drawn on whole units, at least 1 by 1, and over another tile only wholly inside its pattern or wholly round it', () => {
  assert.deepEqual(makable(rect(0, 0, 1, 1)), { ok: true, in: null, holds: [] });
  assert.match(makable(rect(0, 0, 0, 2)).refused, /at least 1 by 1/); assert.match(makable(rect(.5, 0, 2, 2)).refused, /whole units/);
  const other = [T('t', null, 0, 0, 3, 2, 2, 1)];      /* another tile: 3 by 2, twice across, so drawn 6 by 2 */
  assert.match(makable(rect(5, 1, 2, 2), other).refused, /cannot lie over another tile/);      /* partly over it */
  assert.match(makable(rect(4, 0, 1, 1), other).refused, /over another tile/);      /* over a drawn copy is over the tile: the second cell is not the pattern */
  assert.match(makable(rect(2, 0, 2, 1), other).refused, /over another tile/);      /* half in the pattern and half in the copy */
  assert.deepEqual(makable(rect(6, 0, 2, 2), other), { ok: true, in: null, holds: [] });                  /* edge to edge */
  assert.deepEqual(makable(rect(0, 2, 6, 1), other), { ok: true, in: null, holds: [] });
  /* wholly inside the pattern: it is in that tile. The boundary: as large as the pattern is inside it */
  assert.deepEqual(makable(rect(1, 0, 2, 1), other), { ok: true, in: 't', holds: [] });
  assert.deepEqual(makable(rect(0, 0, 3, 2), other), { ok: true, in: 't', holds: [] });
  assert.match(makable(rect(0, 0, 3, 3), other).refused, /over another tile/);      /* one row more: no longer inside, and not round all that is drawn of it */
  /* wholly round all of it: that tile is then in the new one */
  assert.deepEqual(makable(rect(0, 0, 6, 2), other), { ok: true, in: null, holds: ['t'] });
  assert.deepEqual(makable(rect(-1, -1, 9, 4), other), { ok: true, in: null, holds: ['t'] });
  /* between two levels: inside the outer pattern and round the inner tile */
  const two = [T('o', null, 0, 0, 6, 2, 1, 3), T('i', 'o', 0, 0, 1, 1, 2, 1)];
  assert.deepEqual(makable(rect(0, 0, 3, 1), two), { ok: true, in: 'o', holds: ['i'] });
  assert.deepEqual(makable(rect(3, 0, 2, 2), two), { ok: true, in: 'o', holds: [] });      /* beside the inner tile, in the same pattern */
  assert.match(makable(rect(1, 0, 3, 1), two).refused, /over another tile/);                /* over half of the inner tile */
  assert.deepEqual(makable(rect(0, 0, 1, 1), two), { ok: true, in: 'i', holds: [] });      /* inside the inner tile's own pattern: three deep */
  /* a block inside the rectangle that belongs to a tile which is neither: it cannot be taken from its tile by drawing round it */
  assert.match(makable(rect(20, 20, 3, 3), other, 1).refused, /block of another tile/);
  assert.deepEqual(makable(rect(20, 20, 3, 3), other, 0), { ok: true, in: null, holds: [] });
});

test('blocks go into a tile as into a frame, and a whole tile only where it lies wholly inside the pattern', () => {
  assert.deepEqual(enterable(true, false), { ok: true });      /* plain blocks, or some of a tile's, into a tile */
  assert.deepEqual(enterable(false, true), { ok: true });      /* a whole tile, into an ordinary frame */
  assert.deepEqual(enterable(false, false), { ok: true });
  assert.match(enterable(true, true).refused, /only where it lies wholly inside that tile's pattern/);
  assert.match(enterable(true, true, false).refused, /wholly inside/);
  assert.deepEqual(enterable(true, true, true), { ok: true });      /* it lies wholly inside the host tile's pattern */
});

test('a tile counts as inside another where the frames say so and its filled size lies wholly inside the pattern', () => {
  /* the outer pattern is 4 by 1, three down; the inner pattern 2 by 1 */
  const nestOf = across => [T('o', null, 0, 0, 4, 1, 1, 3), T('i', 'o', 0, 0, 2, 1, across, 1)];
  assert.deepEqual(overlaps(nestOf(1)), []); assert.deepEqual(overlaps(nestOf(2)), []);      /* the boundary: its filled size is exactly the pattern */
  assert.deepEqual(overlaps(nestOf(3)), [{ a: 'o', b: 'i', why: 'past' }]);                  /* one pattern more runs past it */
  assert.deepEqual(overlaps([T('o', null, 0, 0, 4, 1, 1, 3), T('i', 'o', 0, 0, 2, 1, 1, 2)]), [{ a: 'o', b: 'i', why: 'past' }]);      /* down into the outer tile's second cell: a copy is not the pattern */
  assert.deepEqual(overlaps([T('o', null, 0, 0, 4, 1), T('i', 'o', 3, 0, 2, 1)]), [{ a: 'o', b: 'i', why: 'past' }]);      /* half out of it */
  assert.deepEqual(overlaps([T('o', null, 0, 0, 4, 1), T('i', 'o', 9, 9, 2, 1)]), [{ a: 'o', b: 'i', why: 'past' }]);      /* in it by its frame, and nowhere near: not inside its pattern */
  /* it is the filled size that counts, whatever is drawn: a count that is a formula is drawn as one pattern and an ellipsis */
  const f = { across: true };
  assert.deepEqual(overlaps([T('o', null, 0, 0, 4, 1), T('i', 'o', 0, 0, 2, 1, 2, 1, f)]), []);
  assert.deepEqual(overlaps([T('o', null, 0, 0, 4, 1), T('i', 'o', 0, 0, 2, 1, 3, 1, f)]), [{ a: 'o', b: 'i', why: 'past' }]);      /* the formula has grown: drawn 3 wide, and 6 wide filled */
  /* the same rectangles with no frame saying one is in the other: it lies over the other, and is no part of its pattern */
  assert.deepEqual(overlaps([T('o', null, 0, 0, 4, 1, 1, 3), T('i', null, 0, 0, 2, 1, 2, 1)]), [{ a: 'o', b: 'i', why: 'over' }]);
  assert.equal(within(rep(4, 1, 1, 3), rect(0, 0, 4, 1)), true); assert.equal(within(rep(4, 1, 1, 3), rect(0, 0, 6, 1)), false);
});

test('which pairs of tiles overlap without one lying wholly inside the other\'s pattern', () => {
  const a = T('a', null, 0, 0, 3, 2, 2, 1), pairs = list => overlaps(list).map(p => `${p.a} ${p.b} ${p.why}`);
  assert.deepEqual(pairs([a, T('b', null, 6, 0, 2, 2)]), []);                    /* edge to edge */
  assert.deepEqual(pairs([a, T('b', null, 5, 1, 2, 2)]), ['a b over']);          /* over its second cell, partly */
  assert.deepEqual(pairs([a, T('b', null, 5, 1, 2, 2), T('c', null, 6, 2, 2, 2)]), ['a b over', 'b c over']);      /* every pair, and only those that do */
  assert.deepEqual(pairs([a, T('b', null, 20, 20, 2, 2)]), []);
  /* two tiles in one pattern that lie over each other; and one inside a tile against one outside it */
  assert.deepEqual(pairs([T('o', null, 0, 0, 6, 2), T('i', 'o', 0, 0, 2, 1, 2, 1), T('j', 'o', 3, 0, 2, 1)]), ['i j over']);
  assert.deepEqual(pairs([T('o', null, 0, 0, 6, 2), T('i', 'o', 0, 0, 2, 1), T('z', null, 5, 1, 3, 3)]), ['o z over']);      /* z is over the outer tile, and clear of the inner one */
  /* what is drawn is what lies on the canvas: a tile drawn elided is over only what its drawn cells are over */
  assert.deepEqual(pairs([T('a', null, 0, 0, 2, 1, 100, 1), T('b', null, 9, 0, 2, 1)]), []);      /* 100 across is drawn 9 wide */
  assert.deepEqual(pairs([T('a', null, 0, 0, 2, 1, 100, 1), T('b', null, 8, 0, 2, 1)]), ['a b over']);
  /* both tiles of a pair are warned of, each with its reason; a tile that is well is not there */
  const w = overlapping([T('o', null, 0, 0, 4, 1), T('i', 'o', 0, 0, 2, 1, 3, 1), T('far', null, 30, 30, 1, 1)]);
  assert.deepEqual([...w.keys()], ['o', 'i']); assert.match(w.get('o'), /^a tile in its pattern runs past the pattern/); assert.match(w.get('i'), /^it runs past the pattern of the tile it is in/);
  const v = overlapping([a, T('b', null, 5, 1, 2, 2)]); assert.match(v.get('a'), /^it lies over another tile/); assert.match(v.get('b'), /^it lies over another tile/);
  assert.equal(overlapping([a]).size, 0); assert.equal(overlapping([]).size, 0);
});

test('tiles nest deeper than two, as far as DEPTH, and every level has to lie inside every one above it', () => {
  assert.equal(DEPTH, 8);
  const three = [T('a', null, 0, 0, 8, 2, 2, 1), T('b', 'a', 0, 0, 4, 1, 2, 1), T('c', 'b', 0, 0, 2, 1, 2, 1)];
  assert.deepEqual(overlaps(three), []);
  assert.deepEqual([...laid(three).values()].map(t => t.depth), [0, 1, 2]);
  /* the innermost grown past its own tile's pattern, but still inside the outermost: the pair with its own tile, and no other */
  assert.deepEqual(overlaps([three[0], three[1], T('c', 'b', 0, 0, 2, 1, 3, 1)]), [{ a: 'b', b: 'c', why: 'past' }]);
  /* past both */
  assert.deepEqual(overlaps([three[0], three[1], T('c', 'b', 0, 0, 2, 1, 5, 1)]), [{ a: 'a', b: 'c', why: 'past' }, { a: 'b', b: 'c', why: 'past' }]);
  /* eight deep is allowed (depths 0 to 7), a ninth level is refused, and one met in a project is warned of */
  const chainOf = n => Array.from({ length: n }, (_, k) => T('t' + k, k ? 't' + (k - 1) : null, 0, 0, 1, 1));
  assert.equal(overlapping(chainOf(DEPTH)).size, 0);
  assert.deepEqual([...overlapping(chainOf(DEPTH + 1))], [['t8', 'it lies too deep: tiles lie one inside the next at most 8 deep']]);
  assert.deepEqual(allowed(chainOf(DEPTH - 1), chainOf(DEPTH)), { ok: true });
  assert.match(allowed(chainOf(DEPTH), chainOf(DEPTH + 1)).refused, /at most 8 deep/);
  assert.match(makable(rect(0, 0, 1, 1), chainOf(DEPTH)).refused, /at most 8 deep/);
  /* an `in` that names nothing, or comes back round, is none: it ends */
  assert.equal(laid([T('a', 'gone', 0, 0, 1, 1)]).get('a').in, null);
  const round = laid([T('a', 'b', 0, 0, 1, 1), T('b', 'a', 0, 0, 1, 1)]); assert.equal(round.get('a').depth + round.get('b').depth, 1);
  assert.equal(laid([T('a', 'a', 0, 0, 1, 1)]).get('a').depth, 0);
});

test('what may come to stand: no pair that did not overlap before, so a tile already warned of can still be mended', () => {
  const o = T('o', null, 0, 0, 4, 1, 1, 3), i = n => T('i', 'o', 0, 0, 2, 1, n, 1);
  assert.deepEqual(allowed([o, i(1)], [o, i(2)]), { ok: true });
  assert.match(allowed([o, i(2)], [o, i(3)]).refused, /^That would leave a tile running past the pattern of the tile it is in/);      /* an edge pulled, or a count typed */
  assert.match(allowed([o, i(2)], [T('o', null, 0, 0, 3, 1, 1, 3), i(2)]).refused, /running past the pattern/);      /* the outer pattern made narrower than what is in it */
  assert.deepEqual(allowed([o, i(5)], [o, i(4)]), { ok: true });      /* already past it (a formula grew): made smaller, though not yet small enough */
  assert.deepEqual(allowed([o, i(5)], [o, i(2)]), { ok: true });
  const a = T('a', null, 0, 0, 2, 2), b = x => T('b', null, x, 0, 2, 2);
  assert.match(allowed([a, b(5)], [a, b(1)]).refused, /^A tile cannot lie over another tile/);
  assert.deepEqual(allowed([a, b(5)], [a, b(2)]), { ok: true });      /* edge to edge */
  assert.deepEqual(allowed([a, b(1)], [a, b(0)]), { ok: true });      /* pasted over it: it can be moved while it still lies over it */
});

test('where a tile is let go it is in the tile whose pattern it lies wholly inside, the innermost; and moving one takes the tiles inside it', () => {
  const list = [T('o', null, 0, 0, 6, 2, 1, 2), T('i', 'o', 0, 0, 3, 1), T('k', 'i', 0, 0, 1, 1, 2, 1), T('free', null, 20, 0, 1, 1)];
  assert.equal(home(list, 'k'), 'i'); assert.equal(home(list, 'i'), 'o'); assert.equal(home(list, 'o'), null); assert.equal(home(list, 'free'), null);
  assert.equal(home(list, 'nothing'), null);
  /* moved inside the same pattern it stays in it, and what is inside it goes with it */
  let m = moved(list, 'i', 3, 1); assert.equal(m.in, 'o'); assert.deepEqual(m.list.map(t => [t.id, t.in, t.repeat.x, t.repeat.y]), [['o', null, 0, 0], ['i', 'o', 3, 1], ['k', 'i', 3, 1], ['free', null, 20, 0]]);
  /* out of the pattern altogether it has left; onto another tile's pattern it is in that one */
  m = moved(list, 'i', 30, 30); assert.equal(m.in, null); assert.equal(m.list[2].in, 'i');
  m = moved(list, 'free', -20, 0); assert.equal(m.in, 'k');      /* onto the innermost pattern there: three deep */
  m = moved(list, 'free', -15, 0); assert.equal(m.in, 'o');      /* onto the outer pattern, clear of the inner tile */
  /* half out of the pattern, over a copy, or over a tile it is beside, it is refused */
  assert.match(moved(list, 'i', 4, 0).refused, /cannot lie over another tile/);
  assert.match(moved(list, 'i', 0, 2).refused, /cannot lie over another tile/);      /* the outer tile's second cell */
  assert.match(moved(list, 'free', -19, 0).refused, /over another tile/);            /* over the second cell of the innermost tile: a copy is not its pattern */
  assert.equal(moved(list, 'free', -18, 0).in, 'i');                                 /* beside it, in the middle tile's pattern */
  /* a tile is never let go inside itself or inside a tile that is in it */
  assert.equal(moved(list, 'o', 0, 0).in, null);
});

test('no tile is drawn more than 64 times: an inner tile draws as many cells as its outer tile leaves it', () => {
  const cells = l => l.xs.filter(o => !o.dots).length * l.ys.filter(o => !o.dots).length;
  let L = laid([T('o', null, 0, 0, 8, 1, 4, 4), T('i', 'o', 0, 0, 1, 1, 2, 1)]);
  assert.equal(L.get('o').limit, 64); assert.equal(L.get('o').cells, 16); assert.equal(L.get('i').limit, 4); assert.equal(L.get('i').cells, 2);
  /* five would be more than its four: it is its first cell and an ellipsis, since four is too few for the first three and the last */
  L = laid([T('o', null, 0, 0, 8, 1, 4, 4), T('i', 'o', 0, 0, 1, 1, 5, 1)]);
  assert.deepEqual(L.get('i').lay.xs.map(o => o.dots ? '…' : o.cell), [1, '…']); assert.equal(L.get('i').cells, 1); assert.deepEqual(L.get('i').rect, rect(0, 0, 2, 1)); assert.deepEqual(L.get('i').filled, rect(0, 0, 5, 1));
  /* an outer tile drawn once leaves all 64 */
  L = laid([T('o', null, 0, 0, 80, 8), T('i', 'o', 0, 0, 1, 1, 8, 8)]); assert.equal(L.get('i').cells, 64);
  /* with 16 or more left, the first three and the last each way */
  L = laid([T('o', null, 0, 0, 80, 8, 1, 2), T('i', 'o', 0, 0, 1, 1, 40, 1)]); assert.equal(L.get('i').limit, 32); assert.deepEqual(L.get('i').lay.xs.map(o => o.dots ? '…' : o.cell), [1, 2, 3, '…', 40]);
  /* an outer tile drawn 64 times leaves one cell, and three levels multiply */
  L = laid([T('o', null, 0, 0, 2, 1, 8, 8), T('i', 'o', 0, 0, 1, 1, 2, 1)]); assert.equal(L.get('i').limit, 1); assert.equal(L.get('i').cells, 1);
  L = laid([T('a', null, 0, 0, 8, 1, 2, 2), T('b', 'a', 0, 0, 4, 1, 2, 2), T('c', 'b', 0, 0, 1, 1, 3, 3)]);
  assert.deepEqual(['a', 'b', 'c'].map(k => [L.get(k).limit, L.get(k).cells]), [[64, 4], [16, 4], [4, 1]]);
  for (const [a, d, limit] of [[9, 9, 64], [9, 9, 16], [5, 5, 15], [4, 4, 15], [3, 2, 5], [70, 70, 1], [2, 1, 1]]) assert.ok(cells(layout(rep(1, 1), a, d, {}, limit)) <= limit, `${a} × ${d} within ${limit}`);
  assert.equal(slots(8, 8, {}, 64).xs.length, 8);      /* and a tile in no other is drawn as before */
});

test('a count goes with its tile\'s nest: the tile it is in and the tiles in its pattern', () => {
  const list = [{ id: 'o', in: null }, { id: 'i', in: 'o' }, { id: 'j', in: 'o' }, { id: 'k', in: 'i' }, { id: 'far', in: null }];
  assert.deepEqual(nest('o', list), ['i', 'j']); assert.deepEqual(nest('i', list), ['o', 'k']); assert.deepEqual(nest('k', list), ['i']); assert.deepEqual(nest('far', list), []); assert.deepEqual(nest('gone', list), []);
  /* what follows what: each tile its nest; an arrow the tile it reads; a block seated on it the arrow */
  const next = id => ({ aO: ['o'], BO: ['aO'], aI: ['i'], BI: ['aI'], aFar: ['far'], BFar: ['aFar'], keys: [] })[id] || nest(id, list);
  assert.equal(circular('i', ['BO'], next), true);       /* the inner tile's count reads what comes of the tile it is in */
  assert.equal(circular('o', ['BI'], next), true);       /* the outer tile's count reads what comes of a tile in its pattern */
  assert.equal(circular('k', ['BO'], next), true);       /* two levels up */
  assert.equal(circular('o', ['k'], next), true);        /* two levels down */
  assert.equal(circular('i', ['BI'], next), true);       /* its own, as before */
  assert.equal(circular('j', ['BI'], next), true);       /* a tile beside it in the same pattern is of the same nest */
  assert.equal(circular('i', ['BFar'], next), false);    /* a tile outside the nest */
  assert.equal(circular('far', ['BO'], next), false); assert.equal(circular('i', ['keys'], next), false);
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

test('index matrices go with the tile: those of a block that leaves its tile, and no others', () => {
  const shapes = [{ id: 'P', from: null }, { id: 'ix', from: { id: 'P', index: 'x' } }, { id: 'iy', from: { id: 'P', index: 'y' } }, { id: 'qx', from: { id: 'Q', index: 'x' } },
    { id: 'len', from: { id: 'P', side: 'x' } }, { id: 'part', from: { id: 'P', range: {} } }, { id: 'plain' }];
  assert.deepEqual(indexless(shapes, ['P']), ['ix', 'iy']);            /* a measure and a part of P are not its index */
  assert.deepEqual(indexless(shapes, ['P', 'Q']), ['ix', 'iy', 'qx']);
  assert.deepEqual(indexless(shapes, ['R']), []); assert.deepEqual(indexless(shapes, []), []);
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

test('a tile in the pattern is one part of it: its matrix set in its place, and none where it has none', () => {
  /* the outer pattern is 4 by 2: an inner tile whose matrix is 4 by 1 over a 4 by 1 block */
  const p = rep(4, 2, 1, 3), inner = rect(0, 0, 4, 1), under = rect(0, 1, 4, 1);
  assert.deepEqual(matrix(p, 1, 3, [under, inner]), { cols: 4, rows: 6 });
  assert.deepEqual(matrix(rep(4, 1, 1, 3), 1, 3, [inner]), { cols: 4, rows: 3 });      /* the inner tile alone covers the pattern */
  assert.deepEqual(matrix(p, 1, 3, [under, rect(0, 0, 2, 1)]), { error: 'its pattern has a gap' });      /* the inner tile's matrix is narrower than the room left for it */
  assert.deepEqual(matrix(p, 1, 3, [under, rect(0, 0, 6, 1)]), { error: 'a block of it lies outside its pattern' });
  assert.deepEqual(matrix(p, 1, 3, [rect(0, 0, 4, 2), inner]), { error: 'two blocks in its pattern overlap' });      /* a block of the outer tile under the inner tile */
  assert.deepEqual(matrix(p, 1, 3, [under, { error: 'its pattern has a gap' }]), { error: 'a tile in its pattern has no matrix: its pattern has a gap' });
  /* its entries: the inner tile's own entries are handed over as one part's */
  const m = entries(rep(4, 1, 1, 2), 1, 2, [inner], () => M({ '1,1': 1, '2,1': 2, '3,1': 1, '4,1': 2 }));
  assert.deepEqual([1, 2].map(r => [1, 2, 3, 4].map(c => m.get(c + ',' + r)).join(' ')), ['1 2 1 2', '1 2 1 2']);
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

test('a tile\'s size is said however many cells it has: how much of it is worked out is the evaluator\'s to say', () => {
  assert.deepEqual(matrix(rep(2, 1), 1e9, 1, [rect(0, 0, 2, 1)]), { cols: 2e9, rows: 1 });
  let asked = 0; const one = () => { asked++; return M({ '1,1': 7 }); };
  assert.equal(entries(rep(1, 1), 70, 70, [rect(0, 0, 1, 1)], one).size, 4900); assert.equal(asked, 4900);      /* entries gives every cell it is asked for */
});

test('an arrow that reads a tile reads all of it', () => {
  assert.deepEqual(whole({ side: 'e', start: 2, span: 1, gap: 2 }, { cols: 4, rows: 3 }), { side: 'e', start: 1, span: 3, gap: 2 });
  assert.deepEqual(whole({ side: 's', start: 1, span: 1, gap: 1 }, { cols: 4, rows: 3 }), { side: 's', start: 1, span: 4, gap: 1 });
});

test('an arrow on a tile is drawn along the edge as the tile is drawn, not as long as its matrix', () => {
  /* a 3 by 1 pattern whose down follows a height of 4: drawn as one pattern and an ellipsis, 2 units tall; its matrix has 4 rows */
  const foot = footprint(rep(3, 1, 1, 1, -30, -6), 1, 4, { down: true }), a = whole({ side: 'e', start: 1, span: 1, gap: 2 }, { cols: 3, rows: 4 });
  assert.deepEqual(foot, { x: -30, y: -6, w: 3, h: 2 }); assert.equal(a.span, 4);
  assert.deepEqual(drawnOn(a, foot), { side: 'e', start: 1, span: 2, gap: 2 });      /* the base is the drawn edge */
  assert.deepEqual(drawnOn({ ...a, side: 's' }, foot).span, 3);
  /* drawn in full, the two agree */
  assert.equal(drawnOn(a, footprint(rep(3, 1, 1, 1, -30, -6), 1, 4)).span, 4);
});

test('map: an arrow in a tile is repeated along its input, each cell one span on', () => {
  const a = { side: 's', start: 1, span: 1, gap: 2 };
  assert.deepEqual(mapped(a, rep(1, 2), 4, 1, 4), { count: 4, through: [], warn: null });      /* under column 1 of a 4-wide block, across 4 */
  assert.deepEqual([1, 2, 3, 4].map(k => startIn(a, k)), [1, 2, 3, 4]);
  const b = { side: 'e', start: 2, span: 2, gap: 1 };
  assert.deepEqual(mapped(b, rep(3, 2), 1, 3, 7), { count: 3, through: [], warn: null });      /* rows 2-3, 4-5, 6-7 of 7: the last one just fits */
  assert.deepEqual([1, 2, 3].map(k => startIn(b, k)), [2, 4, 6]);
  assert.deepEqual(mapped(a, rep(1, 2), 1, 1, 4), { count: 1, through: [], warn: null });      /* counts of 1: once */
});

test('map is refused where the tile repeats the other way, the pattern is not the span, or the last cell runs past the input', () => {
  const a = { side: 's', start: 1, span: 1, gap: 2 };
  assert.match(mapped(a, rep(1, 2), 4, 2, 4).warn, /repeats down, and an arrow against columns is repeated across only/);
  assert.match(mapped({ ...a, side: 'e' }, rep(2, 1), 2, 3, 4).warn, /repeats across, and an arrow against rows is repeated down only/);
  assert.match(mapped(a, rep(2, 2), 2, 1, 4).warn, /pattern is 2 wide and the arrow's span is 1/);
  assert.match(mapped({ ...a, side: 'w', span: 2 }, rep(2, 3), 1, 2, 9).warn, /pattern is 3 tall and the arrow's span is 2/);
  /* an arrow in one tile whose input is another tile: it reads all of that tile, so there is nothing to repeat along */
  const other = mapped(a, rep(1, 2), 4, 1, 4, { tile: true }); assert.equal(other.count, 1); assert.match(other.warn, /reads another tile, all of it, so it cannot be repeated/);
  assert.equal(mapped(a, rep(1, 2), 4, 1, 4, { tile: false }).warn, null);
  const past = mapped(a, rep(1, 2), 5, 1, 4);
  assert.equal(past.count, 5); assert.match(past.warn, /last cell runs past its input, which has 4 columns/);
  assert.match(mapped({ ...a, start: 2 }, rep(1, 2), 4, 1, 4).warn, /runs past/);      /* one column on is one too many */
  assert.equal(mapped({ ...a, start: 2 }, rep(1, 2), 3, 1, 4).warn, null);
});

test('after review: an arrow in a tile in a tile is repeated along its input through both, by the same rules at each level', () => {
  const a = { side: 's', start: 1, span: 1, gap: 2 }, O = (cols, rows, across = 1, down = 1) => ({ repeat: rep(cols, rows), across, down });
  /* under column 1 of an 8-wide block: the inner tile 4 across, the outer tile (a 4-wide pattern) twice across */
  assert.deepEqual(mapped(a, rep(1, 2), 4, 1, 8, { outer: [O(4, 3, 2, 1)] }), { count: 4, through: [2], warn: null });
  /* the boundary: the last cell of all just fits; an input one column shorter is run past */
  assert.match(mapped(a, rep(1, 2), 4, 1, 7, { outer: [O(4, 3, 2, 1)] }).warn, /last cell runs past its input, which has 7 columns/);
  assert.equal(mapped({ ...a, start: 2 }, rep(1, 2), 4, 1, 9, { outer: [O(4, 3, 2, 1)] }).warn, null); assert.match(mapped({ ...a, start: 2 }, rep(1, 2), 4, 1, 8, { outer: [O(4, 3, 2, 1)] }).warn, /runs past/);
  /* an outer tile that does not repeat changes nothing, whatever its pattern */
  assert.deepEqual(mapped(a, rep(1, 2), 4, 1, 4, { outer: [O(9, 9)] }), { count: 4, through: [1], warn: null });
  /* the outer tile repeats the other way; or its pattern is not as wide as what the inner tile covers */
  const wrongWay = mapped(a, rep(1, 2), 4, 1, 8, { outer: [O(4, 3, 1, 2)] }); assert.equal(wrongWay.count, 4); assert.match(wrongWay.warn, /a tile its tile is in repeats down, and an arrow against columns is repeated across only/);
  assert.match(mapped(a, rep(1, 2), 4, 1, 8, { outer: [O(4, 3, 2, 2)] }).warn, /repeats down/);
  assert.match(mapped(a, rep(1, 2), 4, 1, 80, { outer: [O(5, 3, 2, 1)] }).warn, /has a pattern 5 wide, and the arrow covers 4 columns of its input in each of that tile's cells/);
  /* three levels: each pattern as long as what is covered inside it (2, then 2 × 3 = 6), 2 × 3 × 2 = 12 rows in all */
  const e = { side: 'e', start: 1, span: 2, gap: 1 };
  assert.deepEqual(mapped(e, rep(1, 2), 1, 1, 12, { outer: [O(3, 2, 1, 3), O(3, 6, 1, 2)] }), { count: 1, through: [3, 2], warn: null });
  assert.match(mapped(e, rep(1, 2), 1, 1, 11, { outer: [O(3, 2, 1, 3), O(3, 6, 1, 2)] }).warn, /runs past its input, which has 11 rows/);
  assert.match(mapped(e, rep(1, 2), 1, 1, 12, { outer: [O(3, 2, 1, 3), O(3, 4, 1, 2)] }).warn, /pattern 4 tall, and the arrow covers 6 rows/);
  /* the innermost tile's own rules come first, as before */
  assert.match(mapped(a, rep(2, 2), 2, 1, 8, { outer: [O(4, 3, 2, 1)] }).warn, /pattern is 2 wide and the arrow's span is 1/);
});
