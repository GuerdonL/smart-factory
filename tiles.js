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

   Counts
   count(stored, lookup)         -> { count, formula } | { refused: a sentence }: what a stored count comes to.
                                    A number has to be whole and at least 1. A formula is worked out
                                    (expression.js) and has to come to such a number from sizes alone: the only
                                    capsules it may hold are a variable's width and height (x, y). lookup is
                                    expression.js's. formula says whether it was one.
   typed(text, lookup)           -> { value } | { refused }: what typing text for a count stores: a whole number, or
                                    { expr } where it names a size. Arithmetic on numbers alone is kept as what it
                                    comes to. Refused where count would refuse it, or nothing was typed.
   counts(repeat, lookup)        -> { across, down, formula: { across, down }, warn }: both counts as numbers. One
                                    that cannot be worked out is 1, and warn says why (null where both can)
   filled(repeat, across, down)  -> { cols, rows }: the filled size in units
   settable(repeat, patch)       -> { repeat } | { refused }: the repeat with x, y, cols or rows changed as typed.
                                    The pattern's sides are whole numbers of at least 1 and its place is on whole
                                    units. (Counts are changed through typed, or by dragging: dragged.)
   dragged(size, distance)       -> the count an edge pulled to `distance` units from the tile's corner gives, for a
                                    pattern `size` units long that way: whole patterns, at least 1

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
   members(rect, rects)          -> the indexes of the rects that lie wholly inside rect: what a tile drawn as rect
                                    takes in
   makable(rect, others)         -> { ok: true } | { refused }: whether a tile can be drawn as rect: at least 1 by 1,
                                    on whole units, and not over another tile's footprint (others); edge to edge
                                    is not over
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
   entries(repeat, across, down, rects, valuesIn) -> a Map from "column,row": that matrix's entries.
                                    valuesIn(n, cx, cy) gives the entries (a Map) of the n-th rect's block as it is
                                    in cell (cx, cy): a block differs from cell to cell only through the index.
   whole(arrow, size)            -> the arrow as it reads a tile: all of the tile's matrix, start 1 and the whole
                                    side ({ cols, rows }) for its span. A tile is not a matrix to take rows of: the
                                    rows are taken from the block seated on the output.

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

export const LIMIT = 64;
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
export function count(stored, lookup = () => undefined){
  if (typeof stored === 'number') return whole1(stored) ? { count: stored, formula: false } : { refused: NOT(stored) };
  if (!stored || typeof stored !== 'object' || typeof stored.expr !== 'string') return { refused: NOT(stored) };
  const other = refs(stored.expr).find(r => r.measure !== 'x' && r.measure !== 'y');
  if (other) return { refused: 'a count comes from sizes alone: a width or a height, not ' + (other.measure === 'm' ? 'a mass' : other.measure === 'a' ? 'an attribute' : other.measure === 'g' ? 'a gap' : 'a whole shape') };
  const got = evaluate(stored.expr, lookup);
  if (got.empty) return { refused: 'nothing was typed' };
  return whole1(got.value) && isWhole(got.value) ? { count: got.value, formula: true } : { refused: NOT(got.value) };
}
export function typed(text, lookup = () => undefined){
  const got = entered(text, lookup, { settle: true });
  if (got.clear) return { refused: 'nothing was typed' };
  if (got.refused) return got;
  const c = count(got.value, lookup);
  return c.refused ? c : { value: c.formula ? { expr: got.value.expr } : c.count };
}
export function counts(repeat, lookup = () => undefined){
  const a = count(repeat.across, lookup), d = count(repeat.down, lookup);
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
export const dragged = (size, distance) => Math.max(1, Math.round(distance / size));

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
export const members = (rect, rects) => rects.map((r, i) => inside(rect, r) ? i : -1).filter(i => i >= 0);
export function makable(rect, others = []){
  if (![rect.x, rect.y, rect.w, rect.h].every(Number.isInteger) || rect.w < 1 || rect.h < 1) return { refused: 'A tile\'s pattern is a rectangle on whole units, at least 1 by 1' };
  if (others.some(o => over(o, rect))) return { refused: 'A tile cannot lie over another tile: each repeats on its own' };
  return { ok: true };
}

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
  const out = new Map();
  for (let cy = 1; cy <= down; cy++) for (let cx = 1; cx <= across; cx++) rects.forEach((rect, n) => {
    const ox = (cx - 1) * repeat.cols + rect.x - repeat.x, oy = (cy - 1) * repeat.rows + rect.y - repeat.y;
    for (const [key, v] of valuesIn(n, cx, cy)){ const [c, r] = key.split(',').map(Number); if (c >= 1 && c <= rect.w && r >= 1 && r <= rect.h) out.set((ox + c) + ',' + (oy + r), v); } });
  return out;
}
export const whole = (arrow, size) => ({ ...arrow, start: 1, span: along(arrow.side) === 'rows' ? size.rows : size.cols });

export const startIn = (arrow, k) => arrow.start + (k - 1) * arrow.span;
export function mapped(arrow, repeat, across, down, n){
  const rows = along(arrow.side) === 'rows', times = rows ? down : across, other = rows ? across : down, size = rows ? repeat.rows : repeat.cols;
  const way = rows ? 'down' : 'across', edge = rows ? 'rows' : 'columns';
  if (other !== 1) return { count: 1, warn: `its tile repeats ${rows ? 'across' : 'down'}, and an arrow against ${edge} is repeated ${way} only` };
  if (size !== arrow.span) return { count: 1, warn: `its tile's pattern is ${size} ${rows ? 'tall' : 'wide'} and the arrow's span is ${arrow.span}: to repeat along its input they must be the same` };
  if (startIn(arrow, times) + arrow.span - 1 > n) return { count: times, warn: `its last cell runs past its input, which has ${n} ${edge}` };
  return { count: times, warn: null };
}
