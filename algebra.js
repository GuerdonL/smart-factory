/* What shapes on a canvas mean as algebra. No drawing here: only rectangles in, facts out.
   A rect is { x, y, w, h } in units: w is a variable's columns, h its rows.

   Two shapes that touch side by side, the left one's right edge against the right one's left edge (along an edge,
   not just at a corner), are a matrix product, left · right. It is defined when the left one's columns equal the
   right one's rows (left.w === right.h), and gives a variable with the left one's rows and the right one's columns.
   Touching is the only thing that combines shapes. Shapes that do not touch side by side have nothing to do with
   each other, however close they are, and one above another is not an operation.

   joins(rects)  -> [{ left, right, x, y, ok }]
       every side-by-side touch: indexes into rects, the middle of the shared edge, and whether the product is defined
   pieces(rects) -> [{ members, box, type }]
       the shapes sorted into pieces, a piece being shapes joined to one another by touching. members are indexes
       into rects, left to right where that means something; box is the rectangle round the piece; type is what the
       piece comes to: { cols, rows }, or { error: 'undefined' } when a product in it is not defined or its shapes
       do not form a single row (one shape touching two on the same side has no one reading).
   typeOf(rects) -> null | { cols, rows } | { error }
       what everything comes to: nothing is null, one piece is that piece's type, and several pieces are not one
       thing: { error: 'n pieces' }. */

export function joins(rects){
  const out = [];
  rects.forEach((a, left) => rects.forEach((b, right) => {
    if (left === right || a.x + a.w !== b.x) return;
    const top = Math.max(a.y, b.y), bottom = Math.min(a.y + a.h, b.y + b.h);
    if (bottom > top) out.push({ left, right, x: b.x, y: (top + bottom) / 2, ok: a.w === b.h });
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
    const row = inOneRow(members, inside);
    const type = !row || inside.some(j => !j.ok) ? { error: 'undefined' } : { cols: rects[row[row.length - 1]].w, rows: rects[row[0]].h };
    return { members: row || members, box, type };
  });
}

export function typeOf(rects){
  const ps = pieces(rects);
  return !ps.length ? null : ps.length === 1 ? ps[0].type : { error: ps.length + ' pieces' };
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
