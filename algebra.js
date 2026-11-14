/* What shapes on a canvas mean as algebra. No drawing here: only rectangles in, facts out.
   A rect is { x, y, w, h } in units: w is a variable's columns, h its rows.

   Two shapes that touch side by side, the left one's right edge against the right one's left edge, are a matrix
   product, left · right. It is defined when the left one's columns equal the right one's rows (left.w === right.h),
   and gives a variable with the left one's rows and the right one's columns.

   joins(rects) -> [{ left, right, x, y, ok }]
       every side-by-side touch: indexes into rects, the middle of the shared edge, and whether the product is defined
   typeOf(rects) -> null | { cols, rows } | { error }
       the size of everything taken together. Nothing: null. Shapes touching in one row, left to right: their product,
       or the error "undefined" if some pair cannot be multiplied. Anything else: the size of the box around them all. */

export function joins(rects){
  const out = [];
  rects.forEach((a, left) => rects.forEach((b, right) => {
    if (left === right || a.x + a.w !== b.x) return;
    const top = Math.max(a.y, b.y), bottom = Math.min(a.y + a.h, b.y + b.h);
    if (bottom > top) out.push({ left, right, x: b.x, y: (top + bottom) / 2, ok: a.w === b.h });
  }));
  return out;
}

export function typeOf(rects){
  if (!rects.length) return null;
  const js = joins(rects), chain = inOneRow(rects, js);
  if (chain){
    if (js.some(j => !j.ok)) return { error: 'undefined' };
    return { cols: rects[chain[chain.length - 1]].w, rows: rects[chain[0]].h };
  }
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
  return { cols: Math.max(...rects.map(r => r.x + r.w)) - x, rows: Math.max(...rects.map(r => r.y + r.h)) - y };
}

/* the shapes' order left to right if they form a single row, each touching the next and nothing else; otherwise null */
function inOneRow(rects, js){
  if (rects.length < 2 || js.length !== rects.length - 1) return null;
  const next = new Map(), hasLeft = new Set();
  for (const j of js){ if (next.has(j.left) || hasLeft.has(j.right)) return null; next.set(j.left, j.right); hasLeft.add(j.right); }
  const order = [rects.findIndex((_, i) => !hasLeft.has(i))];
  while (next.has(order[order.length - 1])) order.push(next.get(order[order.length - 1]));
  return order.length === rects.length ? order : null;
}
