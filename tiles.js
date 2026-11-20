/* What a tile means. No drawing here: plain data in, facts out.

   A tile is a region of a canvas whose contents repeat a whole number of times. It is a frame with a repeat:

       repeat: { x, y,            where the pattern's top-left corner is, in units from the space's origin
                 cols, rows,      the pattern's size in whole units, fixed when the tile is drawn. Blank space
                                  inside it is part of the pattern
                 across, down }   how many times the pattern is set side by side and one under the other: each a
                                  whole number of at least 1, or a formula { expr } that comes to one

   Only the blocks in the first cell, the top-left one, exist. Every other cell is a drawn copy. A cell has a place,
   counted from 1: (cx, cy). The filled tile is the pattern's size times the counts.

   A rect is { x, y, w, h } in units, y downward, as in algebra.js and arrows.js.

   Keeping one
   kept(repeat)                  -> the repeat as it is kept: whole numbers, a pattern of at least 1 by 1, and each
                                    count a whole number of at least 1 or { expr: text }. null for what is no repeat
                                    (a frame without one is an ordinary frame)
   LIMIT                         -> 64: the most cells that are drawn
   DEPTH                         -> 8: how many tiles deep a tile may lie, one inside the next
   (How large a matrix is worked out in the browser is the evaluator's to say: evaluate.js, MOST. A tile's counts are
   free to be a billion; nothing here loops over cells but entries, which the evaluator asks only for what is small.)

   Counts
   circular(tile, reads, next)   -> whether a count depends on its own tile's size: whether tile (an id) is reached
                                    from any of reads (the ids the count's formula names), going on through
                                    next(id), the ids whose size that one's size follows. A tile's size follows
                                    what its counts read, and nothing else: not the tile it is in, nor the tiles
                                    in its pattern, whose sizes are their own. So only a real cycle is refused:
                                    an inner tile's count may read the block seated on the arrow of the tile it
                                    is in, or of a tile beside it, and an outer tile's count what comes of a tile
                                    in its pattern, so long as that does not come back round. An arrow's output
                                    follows its input (a tile it reads, a tile it is repeated in); a seated block
                                    its arrow; a reference its variable; a side the sides that share its name.
                                    The page and graph.js gather next; this walks it, once.
   count(stored, lookup, { loops, entryOf }) -> { count, formula } | { refused: a sentence }: what a stored count comes to.
                                    loops: the formula depends on the tile's own size (circular): it is refused
                                    with "it depends on itself", whatever it would come to.
                                    A number has to be whole and at least 1. A formula is worked out
                                    (expression.js) and has to come to such a number from what is settled before
                                    anything is worked out (settled): lookup is expression.js's. formula says
                                    whether it was one.
   settled(text, entryOf)        -> { ok: true } | { refused }: whether a formula reads only what is settled when
                                    the model is built: a variable's width or height (x, y), or the mass of a
                                    scalar whose own entry is a literal number or such a formula in its turn.
                                    entryOf(id) gives what that scalar's entry holds as it is stored (a number,
                                    { n, d, k }, or { expr }), or undefined where it is no scalar or its number is
                                    worked out some other way (seated, a part, a measure, defined in its space).
                                    An attribute, a gap, a whole shape, a bare name in a scalar's formula (its own
                                    x or mass), and a mass that is unknown or worked out are refused.
   typed(text, lookup, options)  -> { value } | { refused }: what typing text for a count stores: a whole number, or
                                    { expr } where it names a size. Arithmetic on numbers alone is kept as what it
                                    comes to. Refused where count would refuse it (options are count's), or nothing
                                    was typed.
   counts(repeat, lookup, { across, down }) -> { across, down, formula: { across, down }, warn }: both counts as
                                    numbers. One that cannot be worked out is 1, and warn says why (null where
                                    both can). The third argument is count's, for each of the two: a count that
                                    depends on its own tile is 1 with that warning, so a project saved with one
                                    opens, and nothing is worked out round the loop
   filled(repeat, across, down)  -> { cols, rows }: the filled size in units
   settable(repeat, patch)       -> { repeat } | { refused }: the repeat with x, y, cols or rows changed as typed.
                                    The pattern's sides are whole numbers of at least 1 and its place is on whole
                                    units. (Counts are changed through typed, or by dragging: dragged.)
   movable(mapped)               -> { ok: true } | { refused }: whether a tile can be moved on its own. Not one that
                                    an arrow is repeated in (mapped): it lies along that arrow's input, and moves
                                    when the input moves. Any other moves with everything in it.
   dragged(count, size, moved)   -> the count after an edge has been pulled `moved` units (outwards is more), for
                                    a pattern `size` units long that way: the count it had (what it comes to,
                                    where it is a formula), changed by the whole patterns moved, at least 1.
                                    Whatever is drawn of the tile: an elided tile's edge is not where its last
                                    cell would be

   What is drawn
   slots(across, down, formula, limit) -> { xs, ys }: which cells are drawn in each direction, in order: { cell: k } or
                                    { dots: true }. A direction whose count is a formula is one pattern and an
                                    ellipsis on the side it repeats toward. Otherwise every cell is drawn while
                                    there are no more than limit of them (LIMIT, unless the tile is inside
                                    another: see laid); beyond that each direction longer than four is its first
                                    three cells, an ellipsis and its last, or, where the limit is under 16 and
                                    that would still be too many, its first cell and an ellipsis.
   layout(repeat, across, down, formula, limit) -> { xs, ys, w, h }: the same, each slot with at (its offset from the tile's
                                    corner, in units) and size (a pattern's length, or 1 for an ellipsis); w and h
                                    are the size of all that is drawn, the tile's footprint on the canvas
   footprint(repeat, across, down, formula, limit) -> the rect all that is drawn covers

   Tiles inside tiles, and tiles that overlap
   A tile may lie wholly inside another tile's pattern (the first cell, where the real blocks are). It is then part
   of that pattern and is repeated with it, and stays a tile in its own right: its own counts, arrows and name.
   Which tile a tile is in is said by the frames, as it is for a block (the tile's frame is inside the other's);
   that it lies wholly inside is said by the rectangles: its filled size (its pattern times its counts, what its
   matrix would be, whatever is drawn of it) has to lie inside the other's pattern. Tiles nest as deep as DEPTH.
   Two tiles that overlap in any other way are both warned of, and neither has a matrix.
   The tiles of a space are given as a list: [{ id, in, repeat, across, down, formula, name }], in: the id of the tile
   it is in (the nearest, by the frames) or null; across and down as numbers (counts); formula as counts gives it.
   laid(list)                    -> a Map from id: { in, depth, limit, lay, cells, rect, filled, pattern } for every
                                    tile. depth: how many tiles it is inside. limit: the most cells of it that are
                                    drawn: LIMIT for a tile in no other, else its outer tile's limit divided by
                                    the cells drawn of that tile (at least 1), so that no tile is drawn more than
                                    LIMIT times, counting the copies of it in the cells of the tiles it is in.
                                    lay: its layout under that limit; cells: how many cells that draws; rect: its
                                    footprint; filled: the rect of its filled size; pattern: the rect of its
                                    first cell. An `in` that names no tile, or comes back round, is none.
   overlaps(list)                -> [{ a, b, why }]: the pairs that overlap without one lying wholly inside the
                                    other's pattern. why 'past': b is in a (at any depth) and its filled size
                                    does not lie inside a's pattern. why 'over': neither is in the other, and
                                    the two overlap (edge to edge is not over), so a tile lying on another's
                                    pattern without being in it is over it too. A tile that is in another tile
                                    is taken at its filled size, since that is what is set in the outer matrix,
                                    whatever is drawn of it (an ellipsis takes no room there); a tile in no other
                                    at what is drawn of it, which is what it takes up on the canvas.
   overlapping(list)             -> a Map from id to why that tile is warned of and has no matrix: it is one of
                                    such a pair, or lies more than DEPTH deep. Tiles that are well are absent.
                                    The other tile of the pair is called by its name where the list gives one
                                    (name, on an item).
   allowed(before, after)        -> { ok: true } | { refused }: whether the tiles may come to stand as `after`,
                                    having stood as `before`: not where a pair overlaps that did not before, or a
                                    tile comes to lie deeper than DEPTH. (So a tile already warned of can still be
                                    changed, to mend it.) This is what is asked when a tile is drawn, moved,
                                    pulled or typed into.
   reframed(before, after)       -> { ok: true } | { refused }: whether a framing gesture may leave the tiles as
                                    `after` (the same tiles in the same places, some now in other tiles or in
                                    none, because frames were made, entered or left): not where a tile that has
                                    changed hands would be parted from the pattern it lies in, or put in a tile
                                    whose pattern it does not lie in (allowed). Framing blocks never moves a
                                    tile's pattern, so a tile is taken from one tile to another only by its frame.
   home(list, id)                -> the id of the tile that tile lies wholly inside the pattern of, as the list
                                    stands: the innermost such that is not itself inside it; null for none. Where
                                    a tile is let go, this is the tile it is then in.
   moved(list, id, dx, dy)       -> { ok: true, in, list } | { refused }: the tiles after that one is moved, with
                                    every tile inside it: it is then in whatever tile it lies wholly inside the
                                    pattern of (home), and the move is refused where allowed refuses it.

   What is in it
   within(repeat, rect)          -> whether rect lies wholly inside the pattern (the first cell)
   held(repeat, rect, dx, dy)    -> { dx, dy, stopped }: how far a block of the tile, at rect inside the pattern,
                                    goes when it is dragged (dx, dy) units the ordinary way: as far as the
                                    pattern's edge and no further. A block that belongs to a tile stays inside
                                    its pattern unless it is taken out of the tile (Shift). stopped says the
                                    drag was cut short.
   members(rect, rects)          -> the indexes of the rects that lie wholly inside rect: what a tile drawn as rect
                                    takes in
   makable(rect, list, held)     -> { ok: true, in, holds } | { refused }: whether a tile can be drawn as rect: at
                                    least 1 by 1, on whole units, and overlapping the tiles there are (list) only
                                    by lying wholly inside one's pattern or by taking others in whole (allowed).
                                    in: the tile it is then in (home), or null; holds: the tiles that are then in
                                    it. held: how many blocks inside rect belong to a tile that is neither: such a
                                    block cannot be taken from its tile by drawing round it.
   copied(inTiles, whole)        -> which of the tiles a block is in go with it when it is copied. inTiles: their
                                    ids, innermost first; whole(id): whether every block of that tile is copied
                                    with it. One rule, whether the tile lies in another or not: a tile goes with
                                    what is copied only where the whole of it is copied, so one block of several
                                    is pasted as that block and no tile, and a block that is all its tile holds
                                    takes that tile. A tile goes only with every tile inside it that the block
                                    is in. To copy a tile without filling the selection, the tile is selected.
   enterable(host, held, fits)   -> { ok: true } | { refused }: whether blocks let go on a frame go into it. Where
                                    the frame is a tile, or is in one (host), and the blocks are all of another
                                    tile's (held), that tile goes in whole: only where it lies wholly inside the
                                    host tile's pattern (fits)
   within(repeat, rect)          -> also whether a tile's filled rect lies wholly inside the pattern
   A tile touches nothing, and nothing outside it touches a block inside it: that is algebra.js's to say (a rect's
   zone, and zoneOf: the innermost tile a block is in), and the page gives every block its zone from there.

   The index
   index(repeat, offset, c, r, cx, cy) -> { x, y }: the index of entry c, r (column and row from 1) of a block whose
                                    top-left corner is offset ({ x, y } in units from the pattern's corner), in cell
                                    (cx, cy): its column and row counted across the whole filled tile.
                                    x = (cx − 1) · cols + offset.x + c,  y = (cy − 1) · rows + offset.y + r
   axisOf(name)                  -> 'x' | 'y' | null: which of the two a name in a formula is: index.x, index.y
   reads(text)                   -> whether a formula's text reads the index
   indexValues(repeat, offset, cols, rows, axis, cx, cy) -> a Map from "column,row": index.x or index.y for every
                                    entry of a block that size, as a matrix
   indexless(shapes, leaving)    -> the ids of the index matrices that are left without an index when blocks leave
                                    their tiles (a tile is taken off; a block is taken out): those whose block is
                                    among leaving (ids). shapes: [{ id, from }], every shape there is. They go
                                    with it, through the page's cascade and its warning: an index matrix left
                                    standing would define its block as nothing.
   NO_INDEX                      -> the error an index comes to where there is no tile

   Its matrix
   matrix(repeat, across, down, rects) -> { cols, rows } | { error }: a tile is not a matrix, but it has one where
                                    its pattern is covered exactly by blocks (rects, in units on the canvas), with
                                    no gap and no overlap: every cell's blocks set in their places, the filled size.
                                    error says what is wrong: a block outside the pattern, two that overlap, a gap.
                                    A tile in the pattern is one of the rects, marked tile: true: its matrix set
                                    in its place (its corner, and its matrix's size), or { error } where it has
                                    no matrix, and then this tile has none (lostWithin: the reason is the
                                    innermost tile's, said once however deep it lies). What overlaps is named
                                    for what it is: two blocks, a tile and a block, two tiles. (A tile that
                                    overlapping names has no matrix: whoever asks says so before asking this.)
                                    A rect may carry inner, the axes of what each of its block's entries holds
                                    (algebra.js): all the pattern's blocks have to hold the same, or the tile has
                                    no matrix, and the answer then carries that inner too.
   entries(repeat, across, down, rects, valuesIn) -> a Map from "column,row": that matrix's entries, every cell's.
                                    valuesIn(n, cx, cy) gives the entries (a Map) of the n-th rect's block as it is
                                    in cell (cx, cy): a block differs from cell to cell only through the index.
                                    An inner position after a key's column and row goes with its entry.
   whole(arrow, size)            -> the arrow as it reads a tile: all of the tile's matrix, start 1 and the whole
                                    side ({ cols, rows }) for its span. A tile is not a matrix to take rows of: the
                                    rows are taken from the block seated on the output.
   drawnOn(arrow, rect)          -> the arrow as it is drawn against a tile whose footprint is rect: its base runs
                                    the whole of the edge as that is drawn, from its first unit, however many rows
                                    or columns the tile's matrix really has. An elided tile is drawn shorter than
                                    its matrix: the base, and what has to be clear of it (arrows.js: free), go by
                                    the drawn edge, while the output keeps the matrix's real size.
   spanned(arrow, patch)         -> { ok: true } | { refused }: whether an arrow that reads a tile can be changed as
                                    patch says: not its start or its span, to anything but what they are

   Map: an arrow inside a tile whose input is outside it is repeated along its input.
   mapped(arrow, repeat, across, down, n, { tile }) -> { count, warn }: how many times, and why not where it cannot be (null
                                    where it can). The tile must repeat only along the edge the arrow sits on
                                    (across for n and s, down for e and w), and the pattern's size that way must be
                                    the arrow's span. In cell k the arrow's start is its own plus (k − 1) spans
                                    (startIn); where the last cell runs past the input (n rows or columns along
                                    the edge) that is a warning, and the tile is drawn in the warning colour.
                                    tile: the input is another tile, outside this one (a tile in this one's
                                    pattern is not outside it, and an arrow that reads one is not repeated). An
                                    arrow that reads a tile reads all of it (whole), so it cannot be repeated
                                    along it: that is refused, once, with what to do instead.
                                    outer: [{ repeat, across, down }], the tiles its tile is in that its input is
                                    outside of too, innermost first. The arrow is repeated along its input through
                                    each of them by the same rules: in the next cell of such a tile it goes on
                                    where the cell before ended. So each must repeat only along the arrow's edge,
                                    and its pattern must be as long that way as what is covered inside it (the
                                    span times the counts inside); one that does not repeat at all changes
                                    nothing. through: how many times each of them repeats it, in order (as far
                                    as they could be told); count is still the innermost tile's. The last cell
                                    of all running past the input is the warning.
   startIn(arrow, k)             -> the arrow's start in cell k, from 1 */
import { evaluate, entered, refs } from './expression.js';
import { isWhole, isError, valueText, nested } from './algebra.js';

export const LIMIT = 64, DEPTH = 8;
export const NO_INDEX = { err: 'not in a tile: there is no index' };
const whole1 = v => Number.isInteger(v) && v >= 1;
const along = side => side === 'e' || side === 'w' ? 'rows' : 'cols';

const keptCount = v => whole1(v) ? v : v && typeof v === 'object' && typeof v.expr === 'string' && v.expr.trim() ? { expr: v.expr } : 1;
export function kept(repeat){
  if (!repeat || typeof repeat !== 'object') return null;
  const n = (v, least) => Math.max(least, Math.round(+v || 0)), place = v => Math.round(+v || 0);
  return { x: place(repeat.x), y: place(repeat.y), cols: n(repeat.cols, 1), rows: n(repeat.rows, 1), across: keptCount(repeat.across), down: keptCount(repeat.down) };
}

const NOT = v => `a count is a whole number, at least 1, and that comes to ${isError(v) ? 'an error (' + v.err + ')' : v === null || v === undefined ? 'nothing yet' : valueText(v)}`;
export function circular(tile, reads, next){
  const seen = new Set(), todo = [...reads];
  while (todo.length){ const id = todo.pop(); if (id === tile) return true; if (seen.has(id)) continue; seen.add(id); todo.push(...next(id)); }
  return false;
}
const WORDS = new Set(['select', 'max', 'min', 'abs', 'sqrt', 'exp', 'ln', 'tanh', 'erf', 'inf', 'infinity', 'true', 'false']);
const NOT_SETTLED = 'a count comes from what is settled before anything is worked out: a width, a height, or the mass of a scalar that holds a number or a formula of those; not ';
export function settled(text, entryOf = () => undefined, depth = 0, inner = false){
  if (depth > 16) return { refused: NOT_SETTLED + 'a mass that depends on itself' };
  /* a bare name in a scalar's own formula is one of its own measures, each of which is its mass again */
  if (inner && (String(text).replace(/@\[[^\]]*\]/g, ' ').match(/[A-Za-z_][\w.]*/g) || []).some(name => !WORDS.has(name.toLowerCase()))) return { refused: NOT_SETTLED + 'a mass worked out from the scalar\'s own measures' };
  for (const r of refs(text)){
    if (r.measure === 'x' || r.measure === 'y') continue;
    if (r.measure !== 'm') return { refused: NOT_SETTLED + (r.measure === 'a' ? 'an attribute' : r.measure === 'g' ? 'a gap' : 'a whole shape') };
    const held = entryOf(r.id);
    if (typeof held === 'number' || (held && typeof held === 'object' && Number.isInteger(held.n))) continue;      /* a literal number */
    if (!held || typeof held.expr !== 'string') return { refused: NOT_SETTLED + 'a mass that is unknown or worked out' };
    const within = settled(held.expr, entryOf, depth + 1, true); if (within.refused) return within; }
  return { ok: true };
}
export function count(stored, lookup = () => undefined, { loops = false, entryOf = () => undefined } = {}){
  if (typeof stored === 'number') return whole1(stored) ? { count: stored, formula: false } : { refused: NOT(stored) };
  if (!stored || typeof stored !== 'object' || typeof stored.expr !== 'string') return { refused: NOT(stored) };
  if (loops) return { refused: 'it depends on itself: what it reads follows this tile\'s own size' };
  const from = settled(stored.expr, entryOf); if (from.refused) return from;
  const got = evaluate(stored.expr, lookup);
  if (got.empty) return { refused: 'nothing was typed' };
  return whole1(got.value) && isWhole(got.value) ? { count: got.value, formula: true } : { refused: NOT(got.value) };
}
export function typed(text, lookup = () => undefined, options = {}){
  const got = entered(text, lookup, { settle: true });
  if (got.clear) return { refused: 'nothing was typed' };
  if (got.refused) return got;
  const c = count(got.value, lookup, options);
  return c.refused ? c : { value: c.formula ? { expr: got.value.expr } : c.count };
}
export function counts(repeat, lookup = () => undefined, each = {}){
  const a = count(repeat.across, lookup, each.across), d = count(repeat.down, lookup, each.down);
  return { across: a.refused ? 1 : a.count, down: d.refused ? 1 : d.count, formula: { across: !!a.formula, down: !!d.formula },
    warn: a.refused ? 'across: ' + a.refused : d.refused ? 'down: ' + d.refused : null };
}
export const filled = (repeat, across, down) => ({ cols: repeat.cols * across, rows: repeat.rows * down });
export function settable(repeat, patch){
  const next = { ...repeat };
  for (const k of ['cols', 'rows']) if (k in patch){ if (!whole1(patch[k])) return { refused: `A pattern's ${k === 'cols' ? 'width' : 'height'} is a whole number of units, at least 1` }; next[k] = patch[k]; }
  for (const k of ['x', 'y']) if (k in patch){ if (!Number.isInteger(patch[k])) return { refused: 'A tile stands on whole units' }; next[k] = patch[k]; }
  return { repeat: next };
}
export const movable = mapped => mapped ? { refused: 'An arrow is repeated in this tile, so the tile lies along that arrow\'s input: move the input, and the tile goes with it' } : { ok: true };
export const dragged = (count, size, moved) => Math.max(1, count + Math.round(moved / size));

export function slots(across, down, formula = {}, limit = LIMIT){
  const fa = !!formula.across, fd = !!formula.down, many = (fa ? 1 : across) * (fd ? 1 : down) > limit;
  const one = (n, isFormula) => isFormula || (many && limit < 16 && n > 1) ? [{ cell: 1 }, { dots: true }] : many && n > 4 ? [{ cell: 1 }, { cell: 2 }, { cell: 3 }, { dots: true }, { cell: n }] : Array.from({ length: n }, (_, i) => ({ cell: i + 1 }));
  return { xs: one(across, fa), ys: one(down, fd) };
}
export function layout(repeat, across, down, formula = {}, limit = LIMIT){
  const s = slots(across, down, formula, limit), set = (list, size) => { let at = 0; return [list.map(o => { const one = { ...o, at, size: o.dots ? 1 : size }; at += one.size; return one; }), at]; };
  const [xs, w] = set(s.xs, repeat.cols), [ys, h] = set(s.ys, repeat.rows);
  return { xs, ys, w, h };
}
export const footprint = (repeat, across, down, formula = {}, limit = LIMIT) => { const l = layout(repeat, across, down, formula, limit); return { x: repeat.x, y: repeat.y, w: l.w, h: l.h }; };

const inside = (outer, r) => r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;
const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const pattern = repeat => ({ x: repeat.x, y: repeat.y, w: repeat.cols, h: repeat.rows });
export const within = (repeat, rect) => inside(pattern(repeat), rect);
export function held(repeat, rect, dx, dy){
  const clamp = (v, low, high) => Math.max(low, Math.min(Math.max(low, high), v));
  const x = clamp(rect.x + dx, repeat.x, repeat.x + repeat.cols - rect.w), y = clamp(rect.y + dy, repeat.y, repeat.y + repeat.rows - rect.h);
  return { dx: x - rect.x, dy: y - rect.y, stopped: x !== rect.x + dx || y !== rect.y + dy };
}
export const members = (rect, rects) => rects.map((r, i) => inside(rect, r) ? i : -1).filter(i => i >= 0);
/* ---- tiles inside tiles, and tiles that overlap ---- */
export function laid(list){
  const by = new Map(list.map(t => [t.id, t])), out = new Map();
  const one = (t, open) => { if (out.has(t.id)) return out.get(t.id);
    const up = t.in !== null && t.in !== undefined && by.has(t.in) && t.in !== t.id && !open.has(t.in) ? by.get(t.in) : null;
    open.add(t.id); const above = up ? one(up, open) : null; open.delete(t.id);
    const limit = above ? Math.max(1, Math.floor(above.limit / above.cells)) : LIMIT, lay = layout(t.repeat, t.across, t.down, t.formula || {}, limit), f = filled(t.repeat, t.across, t.down);
    const got = { in: up ? up.id : null, depth: above ? above.depth + 1 : 0, limit, lay, cells: lay.xs.filter(o => !o.dots).length * lay.ys.filter(o => !o.dots).length,
      rect: { x: t.repeat.x, y: t.repeat.y, w: lay.w, h: lay.h }, filled: { x: t.repeat.x, y: t.repeat.y, w: f.cols, h: f.rows }, pattern: pattern(t.repeat) };
    out.set(t.id, got); return got; };
  for (const t of list) one(t, new Set());
  return out;
}
const upsOf = (L, id) => { const out = []; for (let p = L.get(id).in; p !== null && !out.includes(p); p = L.get(p).in) out.push(p); return out; };      /* the tiles it is in, innermost first */
/* what a tile takes up among tiles it is not inside: in another tile's pattern, its filled size, which is what is set in that tile's matrix; on the bare canvas, what is drawn of it */
const extent = t => t.in !== null ? t.filled : t.rect;
export function overlaps(list){
  const L = laid(list), ids = [...L.keys()], ups = new Map(ids.map(id => [id, upsOf(L, id)])), out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++){ const a = ids[i], b = ids[j];
    const outer = ups.get(b).includes(a) ? a : ups.get(a).includes(b) ? b : null, inner = outer === a ? b : a;
    if (outer !== null){ if (!inside(L.get(outer).pattern, L.get(inner).filled)) out.push({ a: outer, b: inner, why: 'past' }); }
    else if (over(extent(L.get(a)), extent(L.get(b)))) out.push({ a, b, why: 'over' }); }
  return out;
}
const PAST = 'a tile inside a tile lies wholly inside that tile\'s pattern', OVER = 'two tiles overlap only where one lies wholly inside the other\'s pattern, as part of it', DEEP = `tiles lie one inside the next at most ${DEPTH} deep`;
export function overlapping(list){
  const out = new Map(), say = (id, why) => { if (!out.has(id)) out.set(id, why); }, names = new Map(list.map(t => [t.id, typeof t.name === 'string' && t.name.trim() ? t.name.trim() : null]));
  const called = (id, unnamed) => names.get(id) ? 'the tile ' + names.get(id) : unnamed;
  for (const p of overlaps(list)){
    if (p.why === 'past'){ say(p.a, `${called(p.b, 'a tile')} in its pattern runs past the pattern: ` + PAST); say(p.b, `it runs past the pattern of ${called(p.a, 'the tile it is in')}: ` + PAST); }
    else { say(p.a, `it lies over ${called(p.b, 'another tile')}: ` + OVER); say(p.b, `it lies over ${called(p.a, 'another tile')}: ` + OVER); } }
  for (const [id, t] of laid(list)) if (t.depth >= DEPTH) say(id, 'it lies too deep: ' + DEEP);
  return out;
}
export function allowed(before, after){
  const key = p => [p.a, p.b].map(String).sort().join('\n'), had = new Set(overlaps(before).map(key)), fresh = overlaps(after).find(p => !had.has(key(p)));
  if (fresh) return { refused: fresh.why === 'past' ? 'That would leave a tile running past the pattern of the tile it is in: ' + PAST : 'A tile cannot lie over another tile: ' + OVER };
  const was = laid(before); for (const [id, t] of laid(after)) if (t.depth >= DEPTH && !(was.has(id) && was.get(id).depth >= DEPTH)) return { refused: 'That is too deep: ' + DEEP };
  return { ok: true };
}
export function reframed(before, after){
  const was = new Map(before.map(t => [t.id, t.in ?? null]));
  if (!after.some(t => was.has(t.id) && was.get(t.id) !== (t.in ?? null))) return { ok: true };
  return allowed(before, after).refused ? { refused: 'That would part a tile from the pattern it lies in: a tile belongs to the tile whose pattern it lies inside. Move the tile by its frame, and what is in it goes with it' } : { ok: true };
}
export function home(list, id){
  const L = laid(list), me = L.get(id); if (!me) return null;
  let best = null;
  for (const [k, t] of L){ if (k === id || upsOf(L, k).includes(id) || !inside(t.pattern, me.filled)) continue;
    if (best === null || t.depth > L.get(best).depth || (t.depth === L.get(best).depth && t.pattern.w * t.pattern.h < L.get(best).pattern.w * L.get(best).pattern.h)) best = k; }
  return best;
}
export function moved(list, id, dx, dy){
  const L = laid(list), goes = t => t.id === id || upsOf(L, t.id).includes(id);
  let after = list.map(t => goes(t) ? { ...t, repeat: { ...t.repeat, x: t.repeat.x + dx, y: t.repeat.y + dy } } : t);
  const to = home(after, id); after = after.map(t => t.id === id ? { ...t, in: to } : t);
  const can = allowed(list, after);
  return can.refused ? can : { ok: true, in: to, list: after };
}
const NEW = '\u0000 the tile being drawn';
export function makable(rect, list = [], held = 0){
  if (![rect.x, rect.y, rect.w, rect.h].every(Number.isInteger) || rect.w < 1 || rect.h < 1) return { refused: 'A tile\'s pattern is a rectangle on whole units, at least 1 by 1' };
  const made = { id: NEW, in: null, repeat: { x: rect.x, y: rect.y, cols: rect.w, rows: rect.h, across: 1, down: 1 }, across: 1, down: 1, formula: {} };
  made.in = home([...list, made], NEW);
  const holds = list.filter(t => (t.in ?? null) === made.in && home([...list, made], t.id) === NEW).map(t => t.id);
  const can = allowed(list, [...list.map(t => holds.includes(t.id) ? { ...t, in: NEW } : t), made]); if (can.refused) return can;
  if (held > 0) return { refused: 'A block of another tile lies there: draw the tile round all of that tile, or wholly inside its pattern' };
  return { ok: true, in: made.in, holds };
}

export const copied = (inTiles, whole = () => false) => { const n = inTiles.findIndex(id => !whole(id)); return n < 0 ? [...inTiles] : inTiles.slice(0, n); };
export const enterable = (host, held, fits = false) => host && held && !fits ? { refused: 'A tile goes inside another only where it lies wholly inside that tile\'s pattern: move it there by its frame' } : { ok: true };

export const index = (repeat, offset, c, r, cx = 1, cy = 1) => ({ x: (cx - 1) * repeat.cols + offset.x + c, y: (cy - 1) * repeat.rows + offset.y + r });
export const axisOf = name => { const m = typeof name === 'string' && name.trim().toLowerCase().match(/^index\.(x|y)$/); return m ? m[1] : null; };
export const reads = text => (String(text ?? '').replace(/@\[[^\]]*\]/g, ' ').match(/[A-Za-z_][\w.]*/g) || []).some(name => axisOf(name.replace(/\.+$/, '')) !== null);      /* names as expression.js reads them */
export const indexless = (shapes, leaving) => { const out = new Set(leaving); return shapes.filter(d => d.from && d.from.index && out.has(d.from.id)).map(d => d.id); };
export function indexValues(repeat, offset, cols, rows, axis, cx = 1, cy = 1){
  const out = new Map();
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) out.set(c + ',' + r, index(repeat, offset, c, r, cx, cy)[axis === 'y' ? 'y' : 'x']);
  return out;
}

const WITHIN = 'a tile in its pattern has no matrix: ';
export const lostWithin = why => String(why).startsWith(WITHIN) ? String(why) : WITHIN + why;      /* said once, with the innermost tile's reason, however deep that tile lies */
export function matrix(repeat, across, down, rects){
  const p = pattern(repeat);
  if (!rects.length) return { error: 'its pattern is empty' };
  const lost = rects.find(r => r.error); if (lost) return { error: lostWithin(lost.error) };
  const out = rects.find(r => !inside(p, r)); if (out) return { error: out.tile ? 'a tile in it lies outside its pattern' : 'a block of it lies outside its pattern' };
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (over(rects[i], rects[j]))
    return { error: rects[i].tile && rects[j].tile ? 'two tiles in its pattern overlap' : rects[i].tile || rects[j].tile ? 'a tile and a block in its pattern overlap' : 'two blocks in its pattern overlap' };
  if (rects.reduce((sum, r) => sum + r.w * r.h, 0) !== p.w * p.h) return { error: 'its pattern has a gap' };
  let inner = rects[0].inner || [];
  for (const r of rects.slice(1)){ const n = nested(inner, r.inner, true); if (!n.ok) return { error: 'its blocks do not hold the same inner data: ' + n.note }; inner = n.inner; }
  return { ...filled(repeat, across, down), ...(inner.length ? { inner } : {}) };
}
export function entries(repeat, across, down, rects, valuesIn){
  const out = new Map();
  for (let cy = 1; cy <= down; cy++) for (let cx = 1; cx <= across; cx++) rects.forEach((rect, n) => {
    const ox = (cx - 1) * repeat.cols + rect.x - repeat.x, oy = (cy - 1) * repeat.rows + rect.y - repeat.y;
    for (const [key, v] of valuesIn(n, cx, cy)){ const [c, r, ...ks] = key.split(',').map(Number); if (c >= 1 && c <= rect.w && r >= 1 && r <= rect.h) out.set((ox + c) + ',' + (oy + r) + (ks.length ? ',' + ks.join(',') : ''), v); } });
  return out;
}
export const whole = (arrow, size) => ({ ...arrow, start: 1, span: along(arrow.side) === 'rows' ? size.rows : size.cols });

export const drawnOn = (arrow, rect) => ({ ...arrow, start: 1, span: along(arrow.side) === 'rows' ? rect.h : rect.w });
export const spanned = (arrow, patch) => ('start' in patch && patch.start !== arrow.start) || ('span' in patch && patch.span !== arrow.span)
  ? { refused: 'An arrow on a tile reads all of it: seat a block on its output, and take rows or columns from that' } : { ok: true };

export const startIn = (arrow, k) => arrow.start + (k - 1) * arrow.span;
export function mapped(arrow, repeat, across, down, n, { tile = false, outer = [] } = {}){
  if (tile) return { count: 1, through: [], warn: 'it is in a tile and reads another tile, all of it, so it cannot be repeated along it: seat a block on that tile\'s output outside this one, and repeat an arrow along the block' };
  const rows = along(arrow.side) === 'rows', times = rows ? down : across, other = rows ? across : down, size = rows ? repeat.rows : repeat.cols;
  const way = rows ? 'down' : 'across', edge = rows ? 'rows' : 'columns';
  if (other !== 1) return { count: 1, through: [], warn: `its tile repeats ${rows ? 'across' : 'down'}, and an arrow against ${edge} is repeated ${way} only` };
  if (size !== arrow.span) return { count: 1, through: [], warn: `its tile's pattern is ${size} ${rows ? 'tall' : 'wide'} and the arrow's span is ${arrow.span}: to repeat along its input they must be the same` };
  /* through each tile its tile is in, with the same rules: that tile repeats only along the arrow's edge, and its pattern is as long that way as what is covered inside it */
  let covers = arrow.span * times; const through = [];
  for (const o of outer){ const k = rows ? o.down : o.across, oth = rows ? o.across : o.down, len = rows ? o.repeat.rows : o.repeat.cols;
    if (k === 1 && oth === 1){ through.push(1); continue; }      /* a tile that does not repeat changes nothing */
    if (oth !== 1) return { count: times, through, warn: `a tile its tile is in repeats ${rows ? 'across' : 'down'}, and an arrow against ${edge} is repeated ${way} only` };
    if (len !== covers) return { count: times, through, warn: `a tile its tile is in has a pattern ${len} ${rows ? 'tall' : 'wide'}, and the arrow covers ${covers} ${edge} of its input in each of that tile's cells: to go on along its input from cell to cell they must be the same` };
    through.push(k); covers *= k; }
  if (arrow.start + covers - 1 > n) return { count: times, through, warn: `its last cell runs past its input, which has ${n} ${edge}` };
  return { count: times, through, warn: null };
}
