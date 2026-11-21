/* What an arrow means. No drawing here: plain data in, facts out.

   An arrow is a function drawn as a triangle. Its base lies against rows or columns of an input, it points away, and
   its output is written on the far side. An arrow as it is kept:

       { input:  { id, as: 'block' | 'result' | 'tile', hollow: 1 | 2 (only with 'result') },
                 what it reads: a block; or the drawn result of the piece that holds the block with that id (for a
                 times or over pair, hollow says which of its two hollows: algebra.js numbers them); or, where the
                 id is another arrow's, that arrow's output; or, with 'tile', the matrix of the tile whose frame has
                 that id (tiles.js), all of it
         side:   'n' | 'e' | 's' | 'w', the edge of the input the base lies on. On e and w the base runs along rows;
                 on n and s, along columns
         start, span:   the first row or column covered, from 1, and how many: whole numbers
         gap:    how far the output's near edge is from the input's edge, in units: a whole number, at least 1
         gapName:   a name given to the gap, or null. It is layout and nothing else
         output: { cols, rows } the function promises, or null for no promise
         formula:   an entry formula, or null
         choose:    { then, else }, the ids of two frames of its definition space, where it is a condition (see
                    "Conditions", below); left out of any other arrow }

   A rect is { x, y, w, h } in units, y downward, as in algebra.js. A type is { cols, rows, colsName, rowsName },
   with inner (the axes of what each entry holds, algebra.js) where it holds inner data. An arrow's span, and all
   else here, is in drawn rows and columns: inner data is carried along with its entry, untouched.

   Where things are (never stored: worked out from the input's rectangle each time)
   along(side)                  -> 'rows' | 'cols': what the base runs along
   covered(arrow, size)         -> { col, row, cols, rows } | null: the part of an input of that size ({ cols, rows })
                                   under the base, counted from 0; null where the span runs past the input
   coveredType(arrow, type)     -> the covered part as a type, or null. A side keeps the input's name for it only
                                   where the whole of that side is covered
   base(arrow, rect)            -> the stretch of the input's edge under the base, a rect with no width or no height
   strip(arrow, rect)           -> the gap in front of the base: from the input's edge to the output's near edge
   triangle(arrow, rect)        -> [[x, y], [x, y], [x, y]]: the two ends of the triangle's base and its point. The
                                   triangle is centred in the gap and on the span, its base parallel to the edge
   place(arrow, rect, size)     -> where the output is: it starts gap units from the input's edge, its first row or
                                   column level with the first one the base covers. Always on whole units.
   free(arrow, rect, others)    -> whether the edge under the base is free: no other rect lies against any part of it
                                   (meeting it at a corner is not touching it)
   edgeAt(rect, point, reach)   -> { side, at, distance } | null: the edge of rect nearest a point no further than
                                   reach (default 1/2) from it, and which row or column of that edge, from 1
   adjust(arrow, n, change)     -> { start, span, gap }: the arrow after a drag, kept inside an input with n rows or
                                   columns along the base. change is one of { start } (slid along the edge, span
                                   kept), { first } (the base's first end pulled to that row or column, the last
                                   staying), { last } (the other end), { gap }
   settable(arrow, n, patch)    -> { arrow } | { refused: a sentence }: the arrow with side, start, span, gap or output
                                   changed as typed. n(side) gives how many rows or columns the input has along that
                                   side, or null where the input is gone (then only what needs no input is checked)

   sided(arrow, side, was, now) -> { side, start, span }: the arrow turned to another side of its input, which has
                                   `now` rows or columns along it where the old side had `was`. One that covered the
                                   whole of the old side covers the whole of the new; any other keeps its start and
                                   span as far as the new side has room

   What the function is: nothing (the covered part passes through unchanged), an entry formula (worked out once for
   every entry of the output, which is the size of the covered part), or a definition space (the page says what the
   one piece in it comes to).
   came(arrow, part, defined, takes) -> what the function comes to: a type, or { error }. part is coveredType; defined is
                                   what its definition space comes to (a type, { error }, or null where it has none
                                   or holds only its input). A formula comes first. takes: the function's own
                                   input block as a type (left out: the part itself). Where the part holds inner
                                   data and the input block holds none, the function is run at each inner
                                   position and its result takes the part's inner axes, so it may not come to
                                   inner data of its own; where the input block holds inner data, it is applied
                                   once, to all of it.
   check(promise, came)         -> { ok, note }: whether what the function comes to is what was promised. promise is
                                   { cols, rows, colsName, rowsName } or null (nothing promised: nothing checked).
                                   Where both name a side the names must be the same.
   standing(arrow, input, others, names, defined, { loops, inner, map, drawn }) -> { warn, part, came, type, place, blocked }
                                   everything about one arrow as it stands. input is null where it is gone, else
                                   { rect, cols, rows, colsName, rowsName }; others are the rects of the blocks that
                                   could lie against its edge; names are the side names that go with the promise
                                   ({ colsName, rowsName }, those of the block seated on the output, or null).
                                   warn is null or why the arrow is drawn in the warning colour: its input is gone,
                                   its span runs past its input, the edge under it is not free, or what it comes to
                                   is not what it promises. type is the output as it is drawn (the promise where
                                   there is one, else what the function comes to; null where there is neither) and
                                   place its rectangle. loops: the arrow reads itself, through whatever else
                                   (dependsOn): it is "it depends on itself" and has nothing. inner: for another
                                   use of a named arrow, the function's own input as a type: an input that does not
                                   fit it (fits) is a warning too. others must not include the block seated on the
                                   output: where there is one (names) and the output's place lies over another
                                   block, blocked is true and the arrow warns: a seat is never put on another block.
                                   An input that is there and has no value ({ rect, error }: a tile with no
                                   matrix) is a warning that says so, and there is no output. map: for an arrow
                                   inside a tile whose input is outside it (tiles.js: mapped), { count, warn }: it
                                   is repeated count times along its input, and what it comes to is every cell's
                                   output set beside the last in that direction (spread): one output, checked
                                   against the promise as a whole. Its edge has to be free under every cell.
                                   drawn: the arrow as it is drawn where that is not as it reads (against a tile
                                   drawn elided: tiles.js, drawnOn): its base, the edge that has to be free and
                                   the output's place go by it; what it covers and comes to go by the arrow.
   spread(type, count, side)    -> a type set beside itself count times along the edge an arrow on that side runs
                                   along: count times the rows for e and w, the columns for n and s. The side that
                                   was repeated keeps no name.
   dependsOn(from, target, next) -> whether target is reached from any of the ids in from, going on through next(id),
                                   the ids that one depends on (an arrow: what it reads, and the arrows in its
                                   function's space; a seated block: its arrow, or the two blocks of its pair). An
                                   arrow reads itself where it is reached from what it reads; a block cannot be
                                   seated on an arrow that is reached back to that block.
   functionFor(name, levels)    -> the id of the arrow whose function a use by name applies, or null for the
                                   program's own. levels: the arrows of the use's space, then of each space above
                                   it, nearest first, each { id, name, reference, off }. It is the first arrow of
                                   that name (as trimmed) in the nearest space that has one which is not itself a
                                   reference and not commented out: that is how a project shadows a function.

   Where a result is written (units; a rect's y downward). The page draws it there; an arrow set against it reads
   it there, on screen or not.
   writtenAt(box, size, { side, drop, whole }) -> { sign: { x, y }, body: { x, y, w, h }, at }
                                   box is the rectangle round the piece; size the matrix as written ({ w, h }; an
                                   error is { w: 4, h: 0 }). side 'right' (the default): the sign a unit and a half
                                   right of the box and the matrix a unit and a half after it, level with the box's
                                   middle. 'below': under the box from its left edge, drop further units down.
                                   'left': the matrix, then the sign, left of the box. at is the rectangle all of
                                   it covers, with a little air. whole: the result is read by an arrow, so its
                                   matrix has to stand on whole units: below, it is two units after the sign in
                                   place of one and a half (everywhere else it is on whole units already).
   writtenWhere(box, size, taken, whole, firm) -> writtenAt's answer with the side and drop chosen: to the right; if that
                                   lies over one of taken, just below, to the left, or one or two units further
                                   below; and if all of those are taken, to the right all the same. firm, where
                                   given, is the part of taken that is drawn solid (blocks, arrows, a tile's
                                   copies; not the bare ground of a tile's own pattern): with every place taken,
                                   the same places are tried against firm alone before the right is settled for,
                                   so that a result with no free place is not written over an arrow that has one.
   readAt(written, hollow, copies) -> the rectangle an arrow reads of a written result, or null where none is
                                   written. written: { usable: [first, second] the pair's hollows that the result
                                   could be written in (null where not), drawn: [{ n, x, y, w, h }] those it is
                                   written in, body: its matrix beside the piece or null }. An arrow that names a
                                   hollow reads that hollow where results are written in hollows at all (copies
                                   above 0) and it can be used: it is written there once something reads from it.
                                   Otherwise the first hollow written in, else the matrix beside the piece.

   What a space comes to, where it holds arrows: its ends, the things in it that nothing reads from.
   ends(pieces, arrows, taken)  -> [{ type, piece } | { type, arrow }]. pieces: [{ ids: the ids of its blocks, type,
                                   config: true for what is in a .config, which is no part of what a space comes
                                   to }]; arrows: [{ id, reads: the id its input names, seated: whether a block is
                                   seated on its output, type: what its output is, or { error } }]. A piece is an
                                   end unless an arrow reads one of its blocks (or the piece's result); an arrow's
                                   output is one unless another arrow reads it or a block is seated on it, in which
                                   case that block's piece is what goes on. With no arrows, the ends are the pieces.
                                   taken: the ids of the blocks an entry has been taken out of, on that canvas
                                   (a shape that holds inner data, with one of its entries set down as a block of
                                   its own): such a block is read from as an arrow's input is, and its piece is
                                   no end.
   defined(ends, isInput)       -> what an arrow's definition space comes to: null where it has no end, or its one
                                   end is the input block alone (isInput(id) says which block that is), which is to
                                   pass through; the one end's type; or { error: 'n pieces' } for several

   Values, entry by entry
   passed(values, part)         -> a Map: the covered part of the input's entries (a Map from "column,row"; an
                                   inner position after those, "column,row,k1,k2", goes with its entry)
   worked(formula, { cols, rows, x, lookup, matrix }) -> a Map from "column,row" to a value
                                   an entry formula worked out for every entry of the output (expression.js, with
                                   whole matrices taken). In it x is the input's entry at this place (x: a Map), i
                                   and j this entry's column and row from 1, a capsule for a whole matrix is that
                                   matrix's entry at this place (matrix(id) -> { cols, rows, values } or undefined;
                                   one that is not the size of the output is the error "not the size of the
                                   output"), and anything else is lookup's to say: it is asked lookup(token, { c, r })
                                   with the entry's column and row, for a name whose value depends on the place
                                   (index.x: tiles.js). An entry that comes to nothing yet is left out.
   names(lookup)                -> a lookup that also knows x, i and j, as unknown: for reading a formula as it is typed

   Named arrows. A named arrow is a variable; another use of it is the same function on a new input, which must fit
   the function's own input block, `in`:
   fits(inner, part)            -> { ok: true } | { refused: a sentence }: each named side of inner must meet a side of
                                   the same name, each unnamed side one of the same length; and where inner holds
                                   inner data, part has to hold the same (algebra.js: nested)
   fitting(inner, side, type, at) -> { start, span } | { refused }: where such an arrow goes when set against side of
                                   an input of that type at row or column `at`: a span the length of inner's side
                                   along the base (the whole side where inner names it), slid to take in `at`.
                                   inner null (a function with no input of its own yet) fits anything: the whole side.

   Conditions. A conditional arrow chooses between the two frames its choose names, by whether what its base covers
   (the condition, any size) is true as a whole matrix: the then frame where it is, the else frame where it is not.
   Each frame holds one piece or nothing, and an empty one is None at the other's size. Its function has no formula.
   conditionable({ blocks, pieces, fixed, read }) -> { ok: true } | { refused: a sentence }: whether a selection can be made
                                   conditional. blocks: how many blocks are selected; pieces: the pieces of the
                                   canvas that hold any of them, [{ members: how many blocks it has, chosen: how many
                                   of those are selected, error: why it comes to no matrix, or null }]; fixed: why
                                   one of the blocks cannot be folded away (an arrow, a function's input, a seated
                                   block), or null; read: the name of one of the blocks that an arrow has for its
                                   input (any arrow: a condition's own entry is one), or null: folded away, it would
                                   leave that arrow reading nothing. It takes exactly one piece, whole, that comes
                                   to a matrix.
   chosenType(sides, promise, across) -> what a conditional arrow comes to: a type, or { error }. sides: for the then frame
                                   and the else frame, the ends that lie wholly in it ([{ type }], as ends gives
                                   them); promise: the arrow's output, { cols, rows } or null. Several ends in one
                                   frame are { error: 'n pieces' }; an end that is an error is that error; two sides
                                   that are not one size (drawn sides, inner axes, or a side under two names) are
                                   { error: TWO_SIZES }. The type is the then side's; with that side empty, the else
                                   side's size under no names; with both empty, the promise, else one by one.
                                   across: for each frame, whether some piece has blocks in it and blocks out of it.
                                   Such a piece belongs to neither: it is { error: ACROSS(0 | 1) }, a sentence that
                                   names the side, before anything else is asked. A side is None only where its
                                   frame holds nothing.
   conditionAt(at, size, taken) -> { x, y }: where Make conditional sets its new entry, in units, so that what it
                                   makes lies over nothing that is there. at: where the selection's top left corner
                                   was; size: the output as it is written, { cols, rows }; taken: the rectangles of
                                   what is there and stays. The entry is one unit, its arrow's strip the two after
                                   it, and the output the size given after those. at itself where that is free;
                                   else the nearest free place to its left on the same line (a definition space's
                                   equation is on the right), up to 12 units; else the nearest free place anywhere,
                                   leftwards first; and at itself where there is none within 60 units.
   emptySide(which, other, size) -> where an empty frame of a condition is drawn, a rect in units: which is 'then' or
                                   'else', other the box of the other frame's blocks (null where that is empty
                                   too), size { cols, rows }. The two stand one above the other, then on top, three
                                   units apart: the equation is on their right and the input block on their left.
   TWO_SIZES                    -> 'its two sides are not one size'

   Seats. A block that sits on a drawn output is seated: its value is the output.
   seatable(block)              -> { ok: true } | { refused: a sentence }. A seat gives a variable its value, so a
                                   block can be seated if it is unnamed, or the only use of its variable where
                                   nothing else defines that. block: { name, named, uses, reference, defined,
                                   standing, seated, part, measure, fused, source, arrow, input, feeds }. feeds: the arrow
                                   reads this block, directly or through other arrows (dependsOn): its output
                                   cannot be the block it is made from.
   definable(block)             -> { ok: true } | { refused }: whether a variable's definition space can be gone into
                                   to define it. Not where it is seated ({ name, seated }): a seat is what defines it.
   seatsOn(rect, place)         -> whether a block let go at rect is let go on an output at place: it lies over part
                                   of it, with its top-left corner within a unit of the output's
   carried(hollow, rect)        -> { side, gap } | null: a block lifted out of a hollow and set down at rect, if it
                                   went straight out along its row or its column, at least one unit clear: the
                                   pass-through arrow that carries the hollow's result to it */
import { evaluate } from './expression.js';
import { nested } from './algebra.js';

export const SIDES = ['n', 'e', 's', 'w'];
export const along = side => side === 'e' || side === 'w' ? 'rows' : 'cols';
const whole = (v, least = 1) => Number.isInteger(v) && v >= least;

export function covered(arrow, size){
  const rows = along(arrow.side) === 'rows', n = rows ? size.rows : size.cols;
  if (!whole(arrow.start) || !whole(arrow.span) || arrow.start + arrow.span - 1 > n) return null;
  return rows ? { col: 0, row: arrow.start - 1, cols: size.cols, rows: arrow.span } : { col: arrow.start - 1, row: 0, cols: arrow.span, rows: size.rows };
}
export function coveredType(arrow, type){
  const part = covered(arrow, type); if (!part) return null;
  return { cols: part.cols, rows: part.rows, colsName: part.cols === type.cols ? type.colsName || null : null, rowsName: part.rows === type.rows ? type.rowsName || null : null,
    ...(Array.isArray(type.inner) && type.inner.length ? { inner: type.inner } : {}) };      /* rows and columns are covered whole: what each entry holds goes with it */
}
export function base(arrow, r){
  const s = arrow.start - 1;
  return arrow.side === 'e' ? { x: r.x + r.w, y: r.y + s, w: 0, h: arrow.span } : arrow.side === 'w' ? { x: r.x, y: r.y + s, w: 0, h: arrow.span }
    : arrow.side === 's' ? { x: r.x + s, y: r.y + r.h, w: arrow.span, h: 0 } : { x: r.x + s, y: r.y, w: arrow.span, h: 0 };
}
export function strip(arrow, r){
  const b = base(arrow, r), g = arrow.gap;
  return arrow.side === 'e' ? { ...b, w: g } : arrow.side === 'w' ? { ...b, x: b.x - g, w: g } : arrow.side === 's' ? { ...b, h: g } : { ...b, y: b.y - g, h: g };
}
export function triangle(arrow, r){
  const b = base(arrow, r), g = arrow.gap, deep = Math.min(g, Math.max(1, arrow.span / 2)), off = (g - deep) / 2;      /* centred in the gap: as much air before it as after */
  if (arrow.side === 'e') return [[b.x + off, b.y], [b.x + off, b.y + b.h], [b.x + off + deep, b.y + b.h / 2]];
  if (arrow.side === 'w') return [[b.x - off, b.y], [b.x - off, b.y + b.h], [b.x - off - deep, b.y + b.h / 2]];
  if (arrow.side === 's') return [[b.x, b.y + off], [b.x + b.w, b.y + off], [b.x + b.w / 2, b.y + off + deep]];
  return [[b.x, b.y - off], [b.x + b.w, b.y - off], [b.x + b.w / 2, b.y - off - deep]];
}
export function place(arrow, r, size){
  const b = base(arrow, r), g = arrow.gap;
  return arrow.side === 'e' ? { x: b.x + g, y: b.y, w: size.cols, h: size.rows } : arrow.side === 'w' ? { x: b.x - g - size.cols, y: b.y, w: size.cols, h: size.rows }
    : arrow.side === 's' ? { x: b.x, y: b.y + g, w: size.cols, h: size.rows } : { x: b.x, y: b.y - g - size.rows, w: size.cols, h: size.rows };
}
export function free(arrow, r, others){
  const b = base(arrow, r), lap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0;
  return !others.some(o => arrow.side === 'e' ? o.x === b.x && lap(o.y, o.y + o.h, b.y, b.y + b.h) : arrow.side === 'w' ? o.x + o.w === b.x && lap(o.y, o.y + o.h, b.y, b.y + b.h)
    : arrow.side === 's' ? o.y === b.y && lap(o.x, o.x + o.w, b.x, b.x + b.w) : o.y + o.h === b.y && lap(o.x, o.x + o.w, b.x, b.x + b.w));
}
export function edgeAt(r, p, reach = .5){
  const off = (v, a, b) => Math.max(a - v, 0, v - b), index = (v, a, n) => Math.max(1, Math.min(n, Math.floor(v - a) + 1));
  const edges = [['e', Math.hypot(p.x - (r.x + r.w), off(p.y, r.y, r.y + r.h)), index(p.y, r.y, r.h)], ['s', Math.hypot(p.y - (r.y + r.h), off(p.x, r.x, r.x + r.w)), index(p.x, r.x, r.w)],
    ['w', Math.hypot(p.x - r.x, off(p.y, r.y, r.y + r.h)), index(p.y, r.y, r.h)], ['n', Math.hypot(p.y - r.y, off(p.x, r.x, r.x + r.w)), index(p.x, r.x, r.w)]];
  let best = null; for (const [side, distance, at] of edges) if (distance <= reach && (!best || distance < best.distance)) best = { side, at, distance };
  return best;
}
export function adjust(arrow, n, change){
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(v))), end = arrow.start + arrow.span - 1;
  if ('gap' in change) return { start: arrow.start, span: arrow.span, gap: Math.max(1, Math.round(change.gap)) };
  if ('start' in change) return { start: clamp(change.start, 1, Math.max(1, n - arrow.span + 1)), span: arrow.span, gap: arrow.gap };
  if ('first' in change){ const start = clamp(change.first, 1, end); return { start, span: end - start + 1, gap: arrow.gap }; }
  return { start: arrow.start, span: clamp(change.last, arrow.start, Math.max(arrow.start, n)) - arrow.start + 1, gap: arrow.gap };
}
export function settable(arrow, n, patch){
  const next = { ...arrow, ...patch };
  if (!SIDES.includes(next.side)) return { refused: 'A side is n, e, s or w' };
  for (const k of ['start', 'span', 'gap']) if (!whole(next[k])) return { refused: `${k[0].toUpperCase() + k.slice(1)} is a whole number, at least 1` };
  if (next.output !== null && next.output !== undefined && !(whole(next.output.cols) && whole(next.output.rows))) return { refused: 'An output size is columns by rows, whole numbers, at least 1' };
  const has = n(next.side), what = along(next.side) === 'rows' ? 'rows' : 'columns';
  if (has !== null && next.span > has) return { refused: `The span cannot exceed the input's ${what}: it has ${has}` };
  if (has !== null && next.start + next.span - 1 > has) return { refused: `That runs past the input's ${what}: it has ${has}` };
  return { arrow: { ...next, output: next.output ? { cols: next.output.cols, rows: next.output.rows } : null } };
}

export function sided(arrow, side, was, now){
  if (arrow.start === 1 && arrow.span === was) return { side, start: 1, span: now };
  const start = Math.min(arrow.start, now); return { side, start, span: Math.min(arrow.span, now - start + 1) };
}

export const came = (arrow, part, defined, takes = part) => arrow.formula || !defined || defined.error ? (arrow.formula ? part : defined || part)
  : !(part.inner && part.inner.length) || (takes && takes.inner && takes.inner.length) ? defined      /* nothing to repeat over, or the function takes the inner data whole */
  : defined.inner && defined.inner.length ? { error: 'it is run at each inner position of its input, and comes to inner data of its own' } : { ...defined, inner: part.inner };
export function check(promise, came){
  if (!promise) return { ok: true, note: '' };
  if (!came) return { ok: false, note: 'nothing to check' };
  if (came.error) return { ok: false, note: came.error };
  if (came.cols !== promise.cols || came.rows !== promise.rows) return { ok: false, note: `${came.cols}×${came.rows} ≠ ${promise.cols}×${promise.rows}` };
  for (const k of ['colsName', 'rowsName']) if (promise[k] && came[k] && promise[k] !== came[k]) return { ok: false, note: `${came[k]} ≠ ${promise[k]}` };
  return { ok: true, note: '' };
}
export function dependsOn(from, target, next){
  const seen = new Set(), todo = [...from];
  while (todo.length){ const id = todo.pop(); if (id === target) return true; if (seen.has(id)) continue; seen.add(id); todo.push(...next(id)); }
  return false;
}
export function functionFor(name, levels){
  const want = String(name).trim();
  for (const level of levels){ const own = level.find(a => !a.reference && !a.off && String(a.name).trim() === want); if (own) return own.id; }
  return null;
}
const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const spread = (type, count, side) => !type || type.error || count === 1 ? type : along(side) === 'rows' ? { ...type, rows: type.rows * count, rowsName: null } : { ...type, cols: type.cols * count, colsName: null };
export function standing(arrow, input, others = [], names = null, defined = null, { loops = false, inner = null, map = null, drawn = null } = {}){
  const promise = arrow.output ? { cols: arrow.output.cols, rows: arrow.output.rows, colsName: names?.colsName || null, rowsName: names?.rowsName || null } : null;
  if (loops) return { warn: 'it depends on itself', part: null, came: null, type: null, place: null, blocked: false };
  if (!input) return { warn: 'its input is gone', part: null, came: null, type: promise, place: null, blocked: false };
  if (input.error) return { warn: input.error, part: null, came: null, type: promise, place: null, blocked: false };
  const part = coveredType(arrow, input);
  if (!part) return { warn: 'its span runs past its input', part: null, came: null, type: promise, place: null, blocked: false };
  const times = map ? map.count : 1, n = along(arrow.side) === 'rows' ? input.rows : input.cols, under = drawn || { ...arrow, span: Math.min(arrow.span * times, n - arrow.start + 1) };      /* every cell's base; or the base as it is drawn */
  const to = spread(came(arrow, part, defined, inner || part), times, arrow.side), ok = check(promise, to), type = promise || (to.error ? null : to);
  const at = type ? place(drawn || arrow, input.rect, type) : null, blocked = !!names && !!at && others.some(o => over(o, at)), fit = inner ? fits(inner, part) : { ok: true };
  const warn = !free(under, input.rect, others) ? 'the edge under it is not free' : map?.warn ? map.warn : to.error ? `what defines it has no size: ${to.error}`
    : !ok.ok ? `it promises ${promise.cols}×${promise.rows} and comes to ${to.cols}×${to.rows}` + (ok.note.includes('×') ? '' : `: ${ok.note}`)
    : fit.refused ? 'its input does not fit the function: ' + fit.refused : blocked ? 'its output would lie on another block: the block seated on it is left where it was' : null;
  return { warn, part, came: to, type, place: at, blocked };
}

export function ends(pieces, arrows, taken = []){
  const read = new Set([...arrows.map(a => a.reads), ...taken]);
  return [...pieces.filter(p => !p.config && !p.ids.some(id => read.has(id))).map(p => ({ type: p.type, piece: p })), ...arrows.filter(a => !a.seated && !read.has(a.id)).map(a => ({ type: a.type, arrow: a }))];
}
export const defined = (ends, isInput) => !ends.length || (ends.length === 1 && !!ends[0].piece && ends[0].piece.ids.length === 1 && isInput(ends[0].piece.ids[0])) ? null
  : ends.length === 1 ? ends[0].type : { error: ends.length + ' pieces' };

export function writtenAt(box, size, { side = 'right', drop = 0, whole = false } = {}){
  const on = Math.round, air = .25, w = size.w, h = size.h;
  if (side === 'left'){ const signX = on(box.x) - 1.5, x = signX - 1.5 - w, y = h ? on(box.y + box.h / 2 - h / 2) : box.y + box.h / 2;
    return { sign: { x: signX, y: y + h / 2 }, body: { x, y, w, h }, at: { x: x - air, y: y - (h ? air : .5), w: w + 2.5 + air, h: (h || 1) + 2 * air } }; }
  const below = side === 'below', left = below ? on(box.x) : on(box.x + box.w) + 1.5, lead = below && whole ? 2 : 1.5;
  const top = below ? on(box.y + box.h) + 1 + drop + (h ? 0 : .5) : h ? on(box.y + box.h / 2 - h / 2) : box.y + box.h / 2;
  return { sign: { x: left, y: top + h / 2 }, body: { x: left + lead, y: top, w, h }, at: { x: left - .5, y: top - (h ? air : .5), w: lead + 1 + w + air, h: (h || 1) + 2 * air } };
}
export function writtenWhere(box, size, taken, whole = false, firm = null){
  const tries = [{}, { side: 'below' }, { side: 'left' }, { side: 'below', drop: 1 }, { side: 'below', drop: 2 }];
  for (const list of firm ? [taken, firm] : [taken]) for (const where of tries){ const got = writtenAt(box, size, { ...where, whole }); if (!list.some(t => over(t, got.at))) return { side: where.side || 'right', drop: where.drop || 0, ...got }; }
  return { side: 'right', drop: 0, ...writtenAt(box, size, { whole }) };
}
export function readAt(written, hollow, copies){
  const named = hollow && copies > 0 ? written.usable[hollow - 1] : null;
  return named || written.drawn.find(h => h.n === hollow) || written.drawn[0] || written.body || null;
}

export function passed(values, part){
  const out = new Map();
  for (const [key, v] of values){ const [c, r, ...ks] = key.split(',').map(Number), C = c - part.col, R = r - part.row; if (C >= 1 && C <= part.cols && R >= 1 && R <= part.rows) out.set(C + ',' + R + (ks.length ? ',' + ks.join(',') : ''), v); }
  return out;
}
export const names = (lookup = () => undefined) => token => typeof token === 'string' && ['x', 'i', 'j'].includes(token.toLowerCase()) ? null : lookup(token);
export function worked(formula, { cols, rows, x = new Map(), lookup = () => undefined, matrix = () => undefined }){
  const out = new Map(), sized = new Map();
  const whole = id => { if (!sized.has(id)){ const m = matrix(id); sized.set(id, m === undefined ? undefined : m.cols === cols && m.rows === rows ? m : { err: 'not the size of the output' }); } return sized.get(id); };
  for (let j = 1; j <= rows; j++) for (let i = 1; i <= cols; i++){ const key = i + ',' + j;
    const v = evaluate(formula, token => {
      if (typeof token !== 'string'){ if (token.measure) return lookup(token, { c: i, r: j }); const m = whole(token.id); return m === undefined ? undefined : m.err ? m : m.values.get(key) ?? null; }
      const k = token.toLowerCase(); return k === 'x' ? x.get(key) ?? null : k === 'i' ? i : k === 'j' ? j : lookup(token, { c: i, r: j }); }, { matrices: true }).value;
    if (v !== null && v !== undefined) out.set(key, v); }
  return out;
}

export function fits(inner, part){
  for (const [len, name, what] of [['cols', 'colsName', 'columns'], ['rows', 'rowsName', 'rows']]){
    if (inner[name]){ if (part[name] !== inner[name]) return { refused: `Its input's ${what} are ${inner[name]}: it must be set against ${what} of that name` }; }
    else if (part[len] !== inner[len]) return { refused: `Its input has ${inner[len]} ${what}, and this would give it ${part[len]}` }; }
  /* an input block that holds inner data takes that inner data and no other; one that holds none is applied at every inner position of what it is given */
  if (Array.isArray(inner.inner) && inner.inner.length){ const n = nested(inner.inner, part.inner, true); if (!n.ok) return { refused: `Its input holds inner data, and this would give it other: ${n.note}` }; }
  return { ok: true };
}
export function fitting(inner, side, type, at){
  const rows = along(side) === 'rows', n = rows ? type.rows : type.cols;
  if (!inner) return { start: 1, span: n };
  const span = (rows ? inner.rowsName : inner.colsName) ? n : rows ? inner.rows : inner.cols;
  if (span > n) return { refused: `Its input has ${span} ${rows ? 'rows' : 'columns'}, and there are only ${n} here` };
  const start = Math.max(1, Math.min(n - span + 1, at)), fit = fits(inner, coveredType({ side, start, span }, type));
  return fit.refused ? fit : { start, span };
}

export const TWO_SIZES = 'its two sides are not one size';
export function conditionable({ blocks = 0, pieces = [], fixed = null, read = null } = {}){
  if (!blocks) return { refused: 'Make conditional takes one piece: select the shapes of one' };
  if (fixed) return { refused: fixed };
  if (read) return { refused: `${read} is what an arrow reads: it cannot be made conditional, which would fold it away from under the arrow` };
  if (pieces.length !== 1) return { refused: `Make conditional takes exactly one piece, and ${pieces.length} are selected` };
  if (pieces[0].chosen < pieces[0].members) return { refused: 'Make conditional takes a whole piece: select every shape of it' };
  if (pieces[0].error) return { refused: `That piece comes to no one matrix (${pieces[0].error}): there is nothing to choose` };
  return { ok: true };
}
export const ACROSS = k => `a piece lies across the edge of its ${k ? 'false' : 'true'} side: move its blocks wholly into that frame, or wholly out of it`;
export function chosenType(sides, promise = null, across = null){
  const over = Array.isArray(across) ? across.findIndex(Boolean) : -1; if (over >= 0) return { error: ACROSS(over) };
  const came = [0, 1].map(k => { const es = (sides && sides[k]) || []; return es.length > 1 ? { error: es.length + ' pieces' } : es.length ? es[0].type || { error: 'no value' } : null; });
  const bad = came.find(c => c && c.error); if (bad) return { error: bad.error };
  const [a, b] = came, inner = t => (Array.isArray(t.inner) ? t.inner : []);
  if (a && b && (a.cols !== b.cols || a.rows !== b.rows || !nested(inner(a), inner(b), true).ok || ['colsName', 'rowsName'].some(k => a[k] && b[k] && a[k] !== b[k]))) return { error: TWO_SIZES };
  if (a) return { cols: a.cols, rows: a.rows, colsName: a.colsName || null, rowsName: a.rowsName || null, ...(inner(a).length ? { inner: inner(a) } : {}) };
  if (b) return { cols: b.cols, rows: b.rows, colsName: null, rowsName: null, ...(inner(b).length ? { inner: inner(b).map(x => ({ length: x.length, name: null })) } : {}) };
  return promise && whole(promise.cols) && whole(promise.rows) ? { cols: promise.cols, rows: promise.rows, colsName: null, rowsName: null } : { cols: 1, rows: 1, colsName: null, rowsName: null };
}
export function conditionAt(at, size, taken){
  const lies = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const free = (x, y) => ![{ x, y, w: 3, h: 1 }, { x: x + 3, y, w: size.cols, h: size.rows }].some(r => taken.some(t => lies(r, t)));      /* the entry and the triangle's strip, two units deep; and the output */
  for (let d = 0; d <= 12; d++) if (free(at.x - d, at.y)) return { x: at.x - d, y: at.y };      /* on its own line, as far left as it takes; then anywhere near */
  for (let d = 1; d <= 60; d++) for (let sy = 0; sy <= d; sy++) for (const [dx, dy] of [[-(d - sy), sy], [-(d - sy), -sy], [d - sy, sy], [d - sy, -sy]]) if (free(at.x + dx, at.y + dy)) return { x: at.x + dx, y: at.y + dy };
  return { x: at.x, y: at.y };
}
export const emptySide = (which, other, size) => other ? { x: other.x, y: which === 'else' ? other.y + other.h + 3 : other.y - 3 - size.rows, w: size.cols, h: size.rows }
  : { x: -6 - size.cols, y: which === 'then' ? -2 - size.rows : 2, w: size.cols, h: size.rows };

export function seatable(b){
  const name = b.name || 'It';
  if (b.arrow) return { refused: 'An arrow cannot be seated on an output' };
  if (b.input) return { refused: 'in is the function\'s input: it cannot be seated' };
  if (b.feeds) return { refused: `${name} is what that arrow reads: its output cannot be the block it is made from` };
  if (b.part) return { refused: `${name} is part of another shape, which is what defines it` };
  if (b.measure) return { refused: `${name} is a measure of another shape, which is what defines it` };
  if (b.fused) return { refused: `${name} is fused from other shapes, which are what define it` };
  if (b.source) return { refused: `${name} is a source: its kind is what defines it` };
  if (b.standing) return { refused: `${name} stands in a matrix: it is an entry there` };
  if (b.reference) return { refused: `${name} is a reference: seat the shape the variable was made as` };
  if (b.seated) return { refused: `${name} is seated already: a variable has only one seat` };
  if (!b.named) return { ok: true };
  if (b.uses > 1) return { refused: `${name} is used in ${b.uses} places: only the one use of a variable can be seated` };
  if (b.defined) return { refused: `${name} is defined in its definition space: a seat would define it twice` };
  return { ok: true };
}
export const definable = b => b.seated ? { refused: `${b.name || 'It'} is seated: the arrow's output is what defines it, so it has no definition of its own to go into` } : { ok: true };
export const seatsOn = (r, p) => r.x < p.x + p.w && p.x < r.x + r.w && r.y < p.y + p.h && p.y < r.y + r.h && Math.abs(r.x - p.x) <= 1 && Math.abs(r.y - p.y) <= 1;
export function carried(h, r){
  if (r.y === h.y && r.h === h.h && r.w === h.w){ if (r.x >= h.x + h.w + 1) return { side: 'e', gap: r.x - h.x - h.w }; if (r.x + r.w <= h.x - 1) return { side: 'w', gap: h.x - r.x - r.w }; }
  if (r.x === h.x && r.w === h.w && r.h === h.h){ if (r.y >= h.y + h.h + 1) return { side: 's', gap: r.y - h.y - h.h }; if (r.y + r.h <= h.y - 1) return { side: 'n', gap: h.y - r.y - r.h }; }
  return null;
}
