/* What shapes on a canvas mean as algebra. No drawing here: only rectangles in, facts out.
   A rect is { x, y, w, h, wName, hName } in units: w is a variable's columns, h its rows, and wName / hName are the
   names of those sides where they have them (say "context", "embed"); sides with the same name are the same length.

   Two shapes that touch side by side, the left one's right edge against the right one's left edge (along an edge,
   not just at a corner), are a matrix product, left · right. It is defined when the left one's columns are the right
   one's rows: where both of those sides are named, they must carry the same name; otherwise they must be the same
   length. It gives a variable with the left one's rows and the right one's columns.
   A single entry (a one by one shape) is a scalar: touching anything on either side, it scales it, whatever the
   other's size, and the product is the other's size. In a row of shapes the scalars are passed over when the sizes
   are matched: A · s · B is defined when A · B is.
   Touching is the only thing that combines shapes. Besides the product, shapes of one width set one directly on
   top of the next are a stack (see stacks, below). Shapes that do not touch have nothing to do with each other here,
   however close they are.

   joins(rects)  -> [{ left, right, x, y, ok, note }]
       every side-by-side touch: indexes into rects, the middle of the shared edge, whether the product is defined,
       and, where it is not, what does not agree ("4 ≠ 3", or "embed ≠ key")
   pieces(rects) -> [{ members, box, type }]
       the shapes sorted into pieces, a piece being shapes joined to one another by touching. members are indexes
       into rects, left to right where that means something; box is the rectangle round the piece; type is what the
       piece comes to: { cols, rows, colsName, rowsName }, or { error: 'undefined' } when a product in it is not
       defined or its shapes do not form a single row (one shape touching two on the same side has no one reading).
   typeOf(rects) -> null | { cols, rows, colsName, rowsName } | { error }
       what everything comes to: nothing is null, one piece is that piece's type, and several pieces are not one
       thing: { error: 'n pieces' }.
   readEntry(text) -> what was typed into a matrix entry: a whole number ("7", "-3", "+12"), plus or minus infinity
       ("inf", "+inf", "-inf", "infinity", "∞", "-∞"), null for nothing typed (the entry goes back to being a
       symbol), or undefined for anything else (not accepted)
   initials(name) -> the letters a variable's entries are called by: "Key Weights" -> "kw", "Shape 3" -> "s" */

export const isScalar = r => r.w === 1 && r.h === 1;
export function joins(rects){
  const out = [];
  rects.forEach((a, left) => rects.forEach((b, right) => {
    if (left === right || a.x + a.w !== b.x) return;
    const top = Math.max(a.y, b.y), bottom = Math.min(a.y + a.h, b.y + b.h);
    if (bottom <= top) return;
    const scalar = isScalar(a) || isScalar(b);      /* a single entry multiplies anything, from either side */
    const byName = a.wName && b.hName, ok = scalar || (byName ? a.wName === b.hName : a.w === b.h);
    out.push({ left, right, x: b.x, y: (top + bottom) / 2, ok, scalar, note: ok ? '' : byName ? `${a.wName} ≠ ${b.hName}` : `${a.w} ≠ ${b.h}` });
  }));
  return out;
}

export function pieces(rects){
  const js = joins(rects), piece = rects.map((_, i) => i);            /* piece[i]: the lowest index joined to i */
  for (let changed = true; changed;){ changed = false;
    for (const j of js){ const m = Math.min(piece[j.left], piece[j.right]); if (piece[j.left] !== m || piece[j.right] !== m){ piece[j.left] = piece[j.right] = m; changed = true; } } }
  return [...new Set(piece)].map(id => {
    const members = rects.map((_, i) => i).filter(i => piece[i] === id), inside = js.filter(j => piece[j.left] === id);
    const x = Math.min(...members.map(i => rects[i].x)), y = Math.min(...members.map(i => rects[i].y));
    const box = { x, y, w: Math.max(...members.map(i => rects[i].x + rects[i].w)) - x, h: Math.max(...members.map(i => rects[i].y + rects[i].h)) - y };
    /* single entries in the row only scale it: what it comes to, and whether it is defined, is a matter for the others */
    const row = inOneRow(members, inside), solid = row ? row.filter(i => !isScalar(rects[i])) : [], ends = solid.length ? solid : row || [];
    const first = rects[ends[0]], last = rects[ends[ends.length - 1]];
    const fits = solid.every((i, n) => { if (!n) return true; const a = rects[solid[n - 1]], b = rects[i]; return a.wName && b.hName ? a.wName === b.hName : a.w === b.h; });
    const type = !row || inside.some(j => !j.ok) || !fits ? { error: 'undefined' } : { cols: last.w, rows: first.h, colsName: last.wName || null, rowsName: first.hName || null };
    return { members: row || members, box, type };
  });
}

/* Shapes of one width set one directly on top of the next are a stack: one piece, whose rows are theirs, top to
   bottom. stacks(rects, pieces(rects)) gives the pieces again with every such run of lone shapes made one piece,
   marked stack: true, its members in order from the top. (A shape that is part of a product is not stacked.) */
export function stacks(rects, ps){
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

/* A number that is not whole is kept in algebraic form, never as decimals. The only such numbers so far are roots:
   { n, k } is the 2^k-th root of the whole number n (k 1: √n; k 2: the fourth root), kept only where it is not
   itself a whole number.
   surd(n, k)    -> that root as a value: a plain number where it comes out whole (surd(9, 1) is 3), else { n, k }
   rootOf(v)     -> the square root of a value, itself a value; null where v has none to write (negative, infinite, not a number)
   isWhole(v)    -> whether a value is a plain whole number
   valueText(v)  -> a value written out: "7", "∞", "√2", "2√3", "∜12" */
export function surd(n, k){ while (k > 0 && Number.isInteger(Math.sqrt(n))){ n = Math.sqrt(n); k--; } return k ? { n, k } : n; }
export const isSurd = v => !!v && typeof v === 'object' && Number.isInteger(v.n) && Number.isInteger(v.k);
export const isWhole = v => typeof v === 'number' && Number.isInteger(v);
export function rootOf(v){ return isSurd(v) ? surd(v.n, v.k + 1) : isWhole(v) && v >= 0 ? surd(v, 1) : null; }
export function valueText(v){
  if (!isSurd(v)) return v === Infinity ? '∞' : v === -Infinity ? '-∞' : String(v);
  const p = 2 ** v.k; let c = Math.floor(Math.pow(v.n, 1 / p) + 1e-9); while (c > 1 && v.n % (c ** p)) c--;      /* the largest whole factor that comes out of the root */
  const rest = v.n / (c ** p), mark = v.k === 1 ? '√' : v.k === 2 ? '∜' : null;
  return (c > 1 ? c : '') + (mark ? mark + rest : `${rest}^(1/${p})`);
}

export function initials(name){
  return (String(name).match(/[A-Za-z]+/g) || []).map(w => w[0].toLowerCase()).join('').slice(0, 3) || 'x';
}

/* the members' order left to right if they form a single row, each touching the next and nothing else; otherwise null */
function inOneRow(members, js){
  if (js.length !== members.length - 1) return null;
  const next = new Map(), hasLeft = new Set();
  for (const j of js){ if (next.has(j.left) || hasLeft.has(j.right)) return null; next.set(j.left, j.right); hasLeft.add(j.right); }
  const order = [members.find(i => !hasLeft.has(i))];
  while (next.has(order[order.length - 1])) order.push(next.get(order[order.length - 1]));
  return order.length === members.length ? order : null;
}
