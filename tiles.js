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
   MOST                          -> 4096: the most entries a matrix that comes of a tile is worked out for here (a
                                    tile's matrix, or the one output of an arrow repeated in a tile). It is the
                                    number phase 6 gives its evaluator for what the browser works out (maxEntries)
   small(cols, rows)             -> whether a matrix that size is worked out: no more than MOST entries
   tooLarge(cols, rows)          -> the reason given where it is not: its size is shown, and its numbers are not

   Counts
   circular(tile, reads, next)   -> whether a count depends on its own tile's size: whether tile (an id) is reached
                                    from any of reads (the ids the count's formula names), going on through
                                    next(id), the ids whose size that one's size follows. A tile's size follows
                                    what its counts read; an arrow's output its input (a tile it reads, a tile it
                                    is repeated in); a seated block its arrow; a reference its variable; a side
                                    the sides that share its name. The page gathers next; this walks it, once.
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
   dragged(count, size, moved)   -> the count after an edge has been pulled `moved` units (outwards is more), for
                                    a pattern `size` units long that way: the count it had (what it comes to,
                                    where it is a formula), changed by the whole patterns moved, at least 1.
                                    Whatever is drawn of the tile: an elided tile's edge is not where its last
                                    cell would be

   What is drawn
   slots(across, down, formula)  -> { xs, ys }: which cells are drawn in each direction, in order: { cell: k } or
                                    { dots: true }. A direction whose count is a formula is one pattern and an
                                    ellipsis on the side it repeats toward. Otherwise every cell is drawn while
                                    there are no more than LIMIT of them; beyond that each direction longer than
                                    four is its first three cells, an ellipsis and its last.
   layout(repeat, across, down, formula) -> { xs, ys, w, h }: the same, each slot with at (its offset from the tile's
                                    corner, in units) and size (a pattern's length, or 1 for an ellipsis); w and h
                                    are the size of all that is drawn, the tile's footprint on the canvas
   footprint(repeat, across, down, formula) -> the rect all that is drawn covers

   What is in it
   within(repeat, rect)          -> whether rect lies wholly inside the pattern (the first cell)
   held(repeat, rect, dx, dy)    -> { dx, dy, stopped }: how far a block of the tile, at rect inside the pattern,
                                    goes when it is dragged (dx, dy) units the ordinary way: as far as the
                                    pattern's edge and no further. A block that belongs to a tile stays inside
                                    its pattern unless it is taken out of the tile (Shift). stopped says the
                                    drag was cut short.
   members(rect, rects)          -> the indexes of the rects that lie wholly inside rect: what a tile drawn as rect
                                    takes in
   makable(rect, others, held)   -> { ok: true } | { refused }: whether a tile can be drawn as rect: at least 1 by 1,
                                    on whole units, not over another tile's footprint (others; edge to edge is
                                    not over), and taking in no block that is in a tile already (held: how many
                                    of the blocks inside rect are)
   enterable(host, held)         -> { ok: true } | { refused }: whether blocks let go on a frame go into it. Not
                                    where the frame is a tile, or is in one (host), and the blocks are all of
                                    another tile's (held), which would go in whole: a tile does not go inside a tile
   A tile touches nothing, and nothing outside it touches a block inside it: that is algebra.js's to say (a rect's
   zone), and the page gives every block of a tile that tile's id for its zone.

   The index
   index(repeat, offset, c, r, cx, cy) -> { x, y }: the index of entry c, r (column and row from 1) of a block whose
                                    top-left corner is offset ({ x, y } in units from the pattern's corner), in cell
                                    (cx, cy): its column and row counted across the whole filled tile.
                                    x = (cx − 1) · cols + offset.x + c,  y = (cy − 1) · rows + offset.y + r
   axisOf(name)                  -> 'x' | 'y' | null: which of the two a name in a formula is: index.x, index.y
   reads(text)                   -> whether a formula's text reads the index
   indexValues(repeat, offset, cols, rows, axis, cx, cy) -> a Map from "column,row": index.x or index.y for every
                                    entry of a block that size, as a matrix
   NO_INDEX                      -> the error an index comes to where there is no tile

   Its matrix
   matrix(repeat, across, down, rects) -> { cols, rows } | { error }: a tile is not a matrix, but it has one where
                                    its pattern is covered exactly by blocks (rects, in units on the canvas), with
                                    no gap and no overlap: every cell's blocks set in their places, the filled size.
                                    error says what is wrong: a block outside the pattern, two that overlap, a gap.
   entries(repeat, across, down, rects, valuesIn) -> a Map from "column,row": that matrix's entries; none where the
                                    filled tile is not small (nothing is then asked of any cell).
                                    valuesIn(n, cx, cy) gives the entries (a Map) of the n-th rect's block as it is
                                    in cell (cx, cy): a block differs from cell to cell only through the index.
   whole(arrow, size)            -> the arrow as it reads a tile: all of the tile's matrix, start 1 and the whole
                                    side ({ cols, rows }) for its span. A tile is not a matrix to take rows of: the
                                    rows are taken from the block seated on the output.
   spanned(arrow, patch)         -> { ok: true } | { refused }: whether an arrow that reads a tile can be changed as
                                    patch says: not its start or its span, to anything but what they are

   Map: an arrow inside a tile whose input is outside it is repeated along its input.
   mapped(arrow, repeat, across, down, n) -> { count, warn }: how many times, and why not where it cannot be (null
                                    where it can). The tile must repeat only along the edge the arrow sits on
                                    (across for n and s, down for e and w), and the pattern's size that way must be
                                    the arrow's span. In cell k the arrow's start is its own plus (k − 1) spans
                                    (startIn); where the last cell runs past the input (n rows or columns along
                                    the edge) that is a warning, and the tile is drawn in the warning colour.
   startIn(arrow, k)             -> the arrow's start in cell k, from 1 */
import { evaluate, entered, refs } from './expression.js';
import { isWhole, isError, valueText } from './algebra.js';

export const LIMIT = 64, MOST = 4096;
export const small = (cols, rows) => cols * rows <= MOST;
export const tooLarge = (cols, rows) => `it has ${cols} × ${rows} entries, more than the ${MOST} that are worked out here: its size is shown, and its numbers are not`;
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
export const dragged = (count, size, moved) => Math.max(1, count + Math.round(moved / size));

export function slots(across, down, formula = {}){
  const fa = !!formula.across, fd = !!formula.down, many = (fa ? 1 : across) * (fd ? 1 : down) > LIMIT;
  const one = (n, isFormula) => isFormula ? [{ cell: 1 }, { dots: true }] : many && n > 4 ? [{ cell: 1 }, { cell: 2 }, { cell: 3 }, { dots: true }, { cell: n }] : Array.from({ length: n }, (_, i) => ({ cell: i + 1 }));
  return { xs: one(across, fa), ys: one(down, fd) };
}
export function layout(repeat, across, down, formula = {}){
  const s = slots(across, down, formula), set = (list, size) => { let at = 0; return [list.map(o => { const one = { ...o, at, size: o.dots ? 1 : size }; at += one.size; return one; }), at]; };
  const [xs, w] = set(s.xs, repeat.cols), [ys, h] = set(s.ys, repeat.rows);
  return { xs, ys, w, h };
}
export const footprint = (repeat, across, down, formula = {}) => { const l = layout(repeat, across, down, formula); return { x: repeat.x, y: repeat.y, w: l.w, h: l.h }; };

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
export function makable(rect, others = [], held = 0){
  if (![rect.x, rect.y, rect.w, rect.h].every(Number.isInteger) || rect.w < 1 || rect.h < 1) return { refused: 'A tile\'s pattern is a rectangle on whole units, at least 1 by 1' };
  if (others.some(o => over(o, rect))) return { refused: 'A tile cannot lie over another tile: each repeats on its own' };
  if (held > 0) return { refused: 'A block of another tile lies there: a tile does not go inside a tile' };
  return { ok: true };
}

export const enterable = (host, held) => host && held ? { refused: 'A tile does not go inside another tile: each repeats on its own' } : { ok: true };

export const index = (repeat, offset, c, r, cx = 1, cy = 1) => ({ x: (cx - 1) * repeat.cols + offset.x + c, y: (cy - 1) * repeat.rows + offset.y + r });
export const axisOf = name => { const m = typeof name === 'string' && name.trim().toLowerCase().match(/^index\.(x|y)$/); return m ? m[1] : null; };
export const reads = text => (String(text ?? '').replace(/@\[[^\]]*\]/g, ' ').match(/[A-Za-z_][\w.]*/g) || []).some(name => axisOf(name.replace(/\.+$/, '')) !== null);      /* names as expression.js reads them */
export function indexValues(repeat, offset, cols, rows, axis, cx = 1, cy = 1){
  const out = new Map();
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) out.set(c + ',' + r, index(repeat, offset, c, r, cx, cy)[axis === 'y' ? 'y' : 'x']);
  return out;
}

export function matrix(repeat, across, down, rects){
  const p = pattern(repeat);
  if (!rects.length) return { error: 'its pattern is empty' };
  if (rects.some(r => !inside(p, r))) return { error: 'a block of it lies outside its pattern' };
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (over(rects[i], rects[j])) return { error: 'two blocks in its pattern overlap' };
  if (rects.reduce((sum, r) => sum + r.w * r.h, 0) !== p.w * p.h) return { error: 'its pattern has a gap' };
  return filled(repeat, across, down);
}
export function entries(repeat, across, down, rects, valuesIn){
  const out = new Map(); if (!small(repeat.cols * across, repeat.rows * down)) return out;
  for (let cy = 1; cy <= down; cy++) for (let cx = 1; cx <= across; cx++) rects.forEach((rect, n) => {
    const ox = (cx - 1) * repeat.cols + rect.x - repeat.x, oy = (cy - 1) * repeat.rows + rect.y - repeat.y;
    for (const [key, v] of valuesIn(n, cx, cy)){ const [c, r] = key.split(',').map(Number); if (c >= 1 && c <= rect.w && r >= 1 && r <= rect.h) out.set((ox + c) + ',' + (oy + r), v); } });
  return out;
}
export const whole = (arrow, size) => ({ ...arrow, start: 1, span: along(arrow.side) === 'rows' ? size.rows : size.cols });

export const spanned = (arrow, patch) => ('start' in patch && patch.start !== arrow.start) || ('span' in patch && patch.span !== arrow.span)
  ? { refused: 'An arrow on a tile reads all of it: seat a block on its output, and take rows or columns from that' } : { ok: true };

export const startIn = (arrow, k) => arrow.start + (k - 1) * arrow.span;
export function mapped(arrow, repeat, across, down, n){
  const rows = along(arrow.side) === 'rows', times = rows ? down : across, other = rows ? across : down, size = rows ? repeat.rows : repeat.cols;
  const way = rows ? 'down' : 'across', edge = rows ? 'rows' : 'columns';
  if (other !== 1) return { count: 1, warn: `its tile repeats ${rows ? 'across' : 'down'}, and an arrow against ${edge} is repeated ${way} only` };
  if (size !== arrow.span) return { count: 1, warn: `its tile's pattern is ${size} ${rows ? 'tall' : 'wide'} and the arrow's span is ${arrow.span}: to repeat along its input they must be the same` };
  if (startIn(arrow, times) + arrow.span - 1 > n) return { count: times, warn: `its last cell runs past its input, which has ${n} ${edge}` };
  return { count: times, warn: null };
}
