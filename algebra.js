/* What shapes on a canvas mean as algebra. No drawing here: only rectangles in, facts out.
   A rect is { x, y, w, h, wName, hName } in units, y increasing downward: w is a variable's columns, h its rows, and
   wName / hName are the names of those sides where they have them (say "context", "embed"); sides with the same name
   are the same length. A rect is the shape's real size, named sides included.

   Touching is the only thing that combines shapes, and there are four ways to touch, a against b:

       product  a · b    a's right edge against b's left edge, along an edge (not just at a corner): a.x + a.w = b.x
                         and their y ranges overlap. Defined when a's columns are b's rows: where both of those sides
                         are named, they must carry the same name; otherwise they must be the same length. A single
                         entry (a one by one shape) is a scalar: it scales whatever it touches, from either side.
       sum      a + b    b directly under a, the same x and the same width: a.y + a.h = b.y. Defined when they are the
                         same height too, and no side of one carries a different name from the same side of the other.
                         A sum never broadcasts.
       times    a ∘ b    b's bottom-left corner on a's top-right corner: entry by entry, a times b.
       over     a ⊘ b    b's top-left corner on a's bottom-right corner: entry by entry, a divided by b.
                         Both are defined when the sizes agree as for a sum, or in exactly three more cases (broadcast):
                         one of the two is one by one (it is applied to every entry); one is a single row with the
                         other's number of columns (applied to every row); one is a single column with the other's
                         number of rows (applied to every column). The result is the size of the larger.

   Shapes that share a horizontal edge without the same x and width do not touch, and shapes that do not touch have
   nothing to do with each other here, however close they are.

   A piece is the shapes joined to one another by any of the four touches, and a piece uses one rule: 'product', 'sum'
   or 'elementwise' (times and over together are one rule, read left to right and grouped from the left:
   (a ∘ b) ⊘ c). A piece whose touches are not all of one rule is { error: 'mixed rules' }. To use one result inside
   another rule, the result is named first.
   A row of products is as it was: in a row of shapes the scalars are passed over when the sizes are matched
   (A · s · B is defined when A · B is), and it must be a single left-to-right row. A sum must likewise be a single
   column, and an elementwise chain a single run with one shape at each step.

   touches(rects) -> [{ kind, a, b, x, y, ok, note }]
       every touch: kind is 'product' | 'sum' | 'times' | 'over'; a and b are indexes into rects (a the left one, or
       for a sum the upper one); x, y is the place for its mark (the middle of the shared edge, or the shared corner);
       ok is whether it is defined, and note, where it is not, what does not agree ("4 ≠ 3", "embed ≠ key",
       "3×2 ≠ 4×5")
   joins(rects)  -> [{ left, right, x, y, ok, scalar, note }]
       the products among those, as they were given before there were other touches. Kept for the callers that mean
       only products (shapes that are to stay side by side).
   pieces(rects) -> [{ rule, members, box, type }]
       the shapes sorted into pieces. rule is 'product', 'sum' or 'elementwise'; 'mixed' where the touches are of more
       than one rule; null for a shape on its own. members are indexes into rects in reading order (left to right;
       top to bottom for a sum) where there is one. box is the rectangle round the piece. type is what the piece
       comes to: { cols, rows, colsName, rowsName }, or { error: 'mixed rules' }, or { error: 'undefined' } when a
       touch in it is not defined or its shapes do not form a single line (one shape touching two on the same side
       has no one reading). A sum or an elementwise chain is the size of its largest operand; each side has the name
       of the first member that names a side of that length (a scalar's side does not name the side of a matrix it
       is broadcast over).
   hollows(touch, rects) -> [{ x, y, w, h }, { x, y, w, h }]
       the two empty rectangles a times or over pair encloses, where its result can be read; the first is the one to
       use when only one is used. For times: beside a under b (the lower right), then above a. For over: under a
       beside b (the lower one), then beside a above b. [] for any other touch.
   resultHollows(rects, piece, copies, written) -> [{ x, y, w, h }]
       the hollows a piece's result is written in: none, one or two. piece is one of pieces(rects); copies is what
       .show_hadamard_copies says (not above 0, or not a number: none; 2 or more: both; anything between: one; left
       out: one); written is { cols, rows }, how many squares the result's matrix takes as it is written (a named or
       a long side is written elided), left out where it is written in full. Only a defined piece of exactly two
       shapes, times or over, has any: a chain of three or more is written beside the piece. Only a hollow of the
       result's size is used (with a broadcast operand one or both are not), and only one the matrix as written is
       no larger than. With one copy asked for it is the first of hollows() that can be used, else the other.
       [] means: beside the piece, as any other result.
   stacks(rects) -> see below: what a stack was in projects saved before format 3. Not used to work anything out now.
   typeOf(rects) -> null | { cols, rows, colsName, rowsName } | { error }
       what everything comes to: nothing is null, one piece is that piece's type, and several pieces are not one
       thing: { error: 'n pieces' }.
   readEntry(text) -> what was typed into a matrix entry: a whole number ("7", "-3", "+12"), plus or minus infinity
       ("inf", "+inf", "-inf", "infinity", "∞", "-∞"), null for nothing typed (the entry goes back to being a
       symbol), or undefined for anything else (not accepted)
   initials(name) -> the letters a variable's entries are called by: "Key Weights" -> "kw", "Shape 3" -> "s" */

import { value as make, written as writtenExact } from './expression.js';

export const isScalar = r => r.w === 1 && r.h === 1;
const sized = r => ({ cols: r.w, rows: r.h, colsName: r.wName || null, rowsName: r.hName || null });
/* two sides that have to be one side: '' where they are (the same length, and not two different names), else what
   differs. Two names that differ are said first, since a name is what the user gave the side. */
const differ = (la, na, lb, nb) => na && nb && na !== nb ? `${na} ≠ ${nb}` : la !== lb ? `${la} ≠ ${lb}` : '';
/* A and B (as sized gives them) entry by entry: { ok, note, type }. Equal sizes always; with broadcast, the three
   cases above as well. type is the larger, each side named by the first of the two that names a side of that length. */
function together(A, B, broadcast){
  const c = differ(A.cols, A.colsName, B.cols, B.colsName), r = differ(A.rows, A.rowsName, B.rows, B.rowsName);
  const one = t => t.cols === 1 && t.rows === 1;
  const ok = (!c && !r) || (broadcast && (one(A) || one(B) || (!c && (A.rows === 1 || B.rows === 1)) || (!r && (A.cols === 1 || B.cols === 1))));
  if (!ok){
    /* what to say: the side that fails. One of the two being a single column, the columns were free to differ and it is
       the rows that do not agree; a single row likewise leaves the columns to blame. Otherwise whichever side differs,
       and both sizes where both lengths do. */
    const column = broadcast && (A.cols === 1 || B.cols === 1), row = broadcast && (A.rows === 1 || B.rows === 1);
    return { ok, note: column && !row ? r : row && !column ? c : c && r && A.cols !== B.cols && A.rows !== B.rows ? `${A.cols}×${A.rows} ≠ ${B.cols}×${B.rows}` : c || r }; }
  const cols = Math.max(A.cols, B.cols), rows = Math.max(A.rows, B.rows);
  return { ok, note: '', type: { cols, rows, colsName: (A.cols === cols && A.colsName) || (B.cols === cols && B.colsName) || null, rowsName: (A.rows === rows && A.rowsName) || (B.rows === rows && B.rowsName) || null } };
}
export function touches(rects){
  const out = [];
  rects.forEach((a, i) => rects.forEach((b, j) => {
    if (i === j) return;
    const touch = (kind, x, y, ok, note) => out.push({ kind, a: i, b: j, x, y, ok, note: ok ? '' : note });
    if (a.x + a.w === b.x){
      const top = Math.max(a.y, b.y), bottom = Math.min(a.y + a.h, b.y + b.h);
      if (bottom > top){                            /* along an edge: a product */
        const byName = a.wName && b.hName, ok = isScalar(a) || isScalar(b) || (byName ? a.wName === b.hName : a.w === b.h);      /* a single entry multiplies anything, from either side */
        touch('product', b.x, (top + bottom) / 2, ok, byName ? `${a.wName} ≠ ${b.hName}` : `${a.w} ≠ ${b.h}`); }
      else if (b.y + b.h === a.y || b.y === a.y + a.h){      /* at a corner: b above is times, b below is over */
        const t = together(sized(a), sized(b), true); touch(b.y === a.y + a.h ? 'over' : 'times', b.x, b.y === a.y + a.h ? b.y : a.y, t.ok, t.note); }
    } else if (a.x === b.x && a.w === b.w && a.y + a.h === b.y){      /* one directly on the other: a sum */
      const t = together(sized(a), sized(b), false); touch('sum', a.x + a.w / 2, b.y, t.ok, t.note); }
  }));
  return out;
}
export const joins = rects => touches(rects).filter(t => t.kind === 'product')
  .map(t => ({ left: t.a, right: t.b, x: t.x, y: t.y, ok: t.ok, scalar: isScalar(rects[t.a]) || isScalar(rects[t.b]), note: t.note }));

const RULE = { product: 'product', sum: 'sum', times: 'elementwise', over: 'elementwise' };
export const pieces = rects => piecesBy(rects, touches(rects));
/* the pieces these touches make of the shapes (stacks, below, asks for the pieces products alone make) */
function piecesBy(rects, ts){
  const piece = rects.map((_, i) => i);            /* piece[i]: the lowest index joined to i */
  for (let changed = true; changed;){ changed = false;
    for (const t of ts){ const m = Math.min(piece[t.a], piece[t.b]); if (piece[t.a] !== m || piece[t.b] !== m){ piece[t.a] = piece[t.b] = m; changed = true; } } }
  return [...new Set(piece)].map(id => {
    const members = rects.map((_, i) => i).filter(i => piece[i] === id), inside = ts.filter(t => piece[t.a] === id);
    const x = Math.min(...members.map(i => rects[i].x)), y = Math.min(...members.map(i => rects[i].y));
    const box = { x, y, w: Math.max(...members.map(i => rects[i].x + rects[i].w)) - x, h: Math.max(...members.map(i => rects[i].y + rects[i].h)) - y };
    const rules = new Set(inside.map(t => RULE[t.kind])), rule = !rules.size ? null : rules.size > 1 ? 'mixed' : [...rules][0];
    if (rule === 'mixed') return { rule, members, box, type: { error: 'mixed rules' } };
    const line = inOneLine(members, inside);
    return { rule, members: line || members, box, type: !line || inside.some(t => !t.ok) ? { error: 'undefined' } : rule === 'product' || !rule ? rowType(rects, line) : chainType(rects, line, rule === 'elementwise') };
  });
}
/* what a row of products comes to (a shape on its own is a row of one): the first one's rows and the last one's
   columns. Single entries in the row only scale it: what it comes to, and whether it is defined, is a matter for the others. */
function rowType(rects, row){
  const solid = row.filter(i => !isScalar(rects[i])), ends = solid.length ? solid : row, first = rects[ends[0]], last = rects[ends[ends.length - 1]];
  const fits = solid.every((i, n) => { if (!n) return true; const a = rects[solid[n - 1]], b = rects[i]; return a.wName && b.hName ? a.wName === b.hName : a.w === b.h; });
  return fits ? { cols: last.w, rows: first.h, colsName: last.wName || null, rowsName: first.hName || null } : { error: 'undefined' };
}
/* what a sum or an elementwise chain comes to, taken from the first member on: each step must be defined against
   what the steps before it came to (A ∘ s ∘ B has both its touches defined whatever A and B are, and is still
   undefined unless A ∘ B is) */
function chainType(rects, line, broadcast){
  let type = sized(rects[line[0]]);
  for (const i of line.slice(1)){ const t = together(type, sized(rects[i]), broadcast); if (!t.ok) return { error: 'undefined' }; type = t.type; }
  return type;
}
export function hollows(touch, rects){
  const a = rects[touch.a], b = rects[touch.b];
  if (touch.kind !== 'times' && touch.kind !== 'over') return [];
  const besideA = { x: b.x, y: a.y, w: b.w, h: a.h }, besideB = { x: a.x, y: b.y, w: a.w, h: b.h };      /* level with a, in b's columns; level with b, in a's columns */
  return [touch.kind === 'times' ? besideA : besideB, touch.kind === 'times' ? besideB : besideA];
}
export function resultHollows(rects, piece, copies = 1, written = null){
  const type = piece.type, n = !(copies > 0) ? 0 : copies >= 2 ? 2 : 1;
  if (!n || piece.rule !== 'elementwise' || piece.members.length !== 2 || type.error) return [];
  const touch = touches(rects).find(t => t.a === piece.members[0] && t.b === piece.members[1]), size = written || type;
  return hollows(touch, rects).filter(h => h.w === type.cols && h.h === type.rows && size.cols <= h.w && size.rows <= h.h).slice(0, n);
}

/* In projects saved before format 3, shapes of one width set one directly on top of the next were a stack: one
   piece, whose rows were theirs, top to bottom (rows appended). Now such shapes are a sum, and nothing here or on
   the page works anything out from a stack. This is kept for one use: finding the old stacks in an old project, so
   that each can be fused into one shape and go on meaning what it meant (project.js).
   stacks(rects) gives the pieces as they were then (shapes joined by products only) with every such run of lone
   shapes made one piece, marked stack: true, its members in order from the top. (A shape that is part of a product
   is not stacked.) */
export function stacks(rects, ps = piecesBy(rects, touches(rects).filter(t => t.kind === 'product'))){
  const lone = ps.filter(p => p.members.length === 1 && !p.type.error).sort((a, b) => rects[a.members[0]].y - rects[b.members[0]].y), rest = ps.filter(p => !lone.includes(p));
  const used = new Set(), out = [];
  for (const p of lone){ if (used.has(p)) continue; used.add(p);
    const run = [p]; let last = rects[p.members[0]];
    for (let next; (next = lone.find(q => !used.has(q) && rects[q.members[0]].x === last.x && rects[q.members[0]].w === last.w && rects[q.members[0]].y === last.y + last.h));){ used.add(next); run.push(next); last = rects[next.members[0]]; }
    if (run.length === 1){ out.push(p); continue; }
    const first = rects[p.members[0]], rows = run.reduce((sum, q) => sum + rects[q.members[0]].h, 0);
    out.push({ members: run.map(q => q.members[0]), stack: true, box: { x: first.x, y: first.y, w: first.w, h: rows }, type: { cols: first.w, rows, colsName: first.wName || null, rowsName: null } }); }
  return [...rest, ...out];
}
export function typeOf(rects){
  const ps = pieces(rects);
  return !ps.length ? null : ps.length === 1 ? ps[0].type : { error: ps.length + ' pieces' };
}

export function readEntry(text){
  const t = String(text).replace(/\s+/g, '').replace(/−/g, '-').toLowerCase();
  if (!t) return null;
  if (/^[+-]?\d+$/.test(t)) return parseInt(t, 10);
  const m = t.match(/^([+-]?)(inf|infinity|∞)$/);
  return m ? (m[1] === '-' ? -Infinity : Infinity) : undefined;
}

/* A number that is not whole is kept in algebraic form, never as decimals: a fraction, a root, or a root of a
   fraction. Such a value is { n, d, k }: n over d (d left out where it is 1), under k square roots (k 0: a
   fraction; k 1: √; k 2: the fourth root), in lowest terms, and kept only where it is not itself a whole number.
   surd(n, k, d)  -> that as a value: a plain number where it comes out whole (surd(9, 1) is 3), else { n, d, k }
   rootOf(v)      -> the square root of a value, itself a value; null where v has none to write (negative, infinite, not a number)
   isWhole(v)     -> whether a value is a plain whole number;   isSurd(v) -> whether it is one of the others
   exact(v)       -> a value as expression.js has them ({ p, q, k }), or null (an infinity, or no value)
   held(e)        -> the other way: what expression.js worked out, as a value an entry can hold
   valueText(v)   -> a value written out: "7", "∞", "3/4", "√2", "2√3", "∜12" */
export const isSurd = v => !!v && typeof v === 'object' && Number.isInteger(v.n) && Number.isInteger(v.k);
export const isWhole = v => typeof v === 'number' && Number.isInteger(v);
export const exact = v => isSurd(v) ? make(v.n, v.d || 1, v.k) : isWhole(v) ? make(v, 1, 0) : null;
export const held = e => !e || e === 'inexact' ? null : !e.k && e.q === 1 ? e.p : { n: e.p, ...(e.q !== 1 ? { d: e.q } : {}), k: e.k };
export function surd(n, k, d = 1){ return held(make(n, d, k)); }
export function rootOf(v){ const e = exact(v); return !e || e.p < 0 ? null : held(make(e.p, e.q, e.k + 1)); }
export function valueText(v){ return isSurd(v) ? writtenExact(exact(v)) : v === Infinity ? '∞' : v === -Infinity ? '-∞' : String(v); }

export function initials(name){
  return (String(name).match(/[A-Za-z]+/g) || []).map(w => w[0].toLowerCase()).join('').slice(0, 3) || 'x';
}

/* the members' order along their touches (each a then b: left to right, or top to bottom) if they form a single line,
   each touching the next and nothing else; otherwise null */
function inOneLine(members, ts){
  if (ts.length !== members.length - 1) return null;
  const next = new Map(), hasBefore = new Set();
  for (const t of ts){ if (next.has(t.a) || hasBefore.has(t.b)) return null; next.set(t.a, t.b); hasBefore.add(t.b); }
  const order = [members.find(i => !hasBefore.has(i))];
  while (next.has(order[order.length - 1])) order.push(next.get(order[order.length - 1]));
  return order.length === members.length ? order : null;
}
