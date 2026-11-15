/* A variable written out in matrix notation, laid on the dot grid.

   createMatrix({ cols, rows, cell, letter, color, values, product }) -> { el, width, height }
     cols, rows   the variable's promised shape
     cell         the size of one entry's square, in world units
     letter       what the entries are called: the variable's initials, say "k" for Keys (default "x")
     color        a theme colour to write the entries in ("lazuli" -> --lazuli), numbers included: the colour of
                  the block they come from. Left out, they are written in the ordinary text colour.
     product      for a matrix that is a product: { rows: { letter, color }, cols: { letter, color } }, the block
                  its rows come from (the first of the chain) and the block its columns come from (the last).
                  Each entry is then written as the pair it is made from, each half in its block's colour:
                  k₂·q₃ is the second row of k against the third column of q.
     inherited    a Map of the same kind: entries not given here but given by a definition this one shadows. They are
                  written faintly, and a value of the block's own covers them.
     transposed   the matrix is a variable's transpose: each symbol carries the variable's own column and row, so the
                  entry in column 1, row 2 reads k₂₁
     tiles        [{ x, y, w, h, color, name, id }]: shapes that stand in for the entries they cover, drawn in their
                  places inside the brackets (x, y from 0, in entries), each with its name on it. One given an id can
                  be pressed, and carries the id as data-tile for whoever handles the click. Left out where the matrix is elided.
     values       a Map from "column,row" (say "2,1") to a number, for entries that have been given one. Those are
                  written as the number, upright, in place of the symbol; infinity is +∞ or −∞.
     width, height  the size of what was made, in world units (for placing it)

   One row or one column is a vector, written k₁ … kₙ. Otherwise it is a matrix, each entry carrying its column then
   its row: k₁₁ … kₙ₁ down to k₁ₙ … kₙₙ (with a comma between them once either passes nine: k₁₀,₃). Past eight along
   a side, the middle is elided the way it is on paper: the first three, dots, and the last.
   Each entry's element carries data-c and data-r, its column and row, for whoever wants to act on a click. */

/* a number as it is written in a matrix */
export const written = v => v === Infinity ? '+∞' : v === -Infinity ? '−∞' : String(v).replace('-', '−');
import { html, style } from './dom.js';
import { likeness } from './block.js';

style('matrix', `
.matrix { position: absolute; display: grid; color: var(--fg); font-family: var(--font-math); font-style: italic; line-height: 1; }
.matrix > span { text-align: center; line-height: var(--cell); white-space: nowrap; }      /* centred in its square */
.matrix > span.set { font-style: normal; font-family: var(--font-ui); font-weight: 600; font-size: .92em; font-variant-numeric: tabular-nums; }
/* a shape standing in for some of the entries: its name is written on it, small, since above it is the next row up */
.matrix > .likeness .block-name { left: 0; right: 0; bottom: auto; top: 50%; transform: translateY(-50%); margin: 0; padding: 0; text-align: center;
  font-size: 10px; font-style: normal; color: var(--on-block); text-shadow: 0 0 2px var(--shadow), 0 0 1px var(--shadow); overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.matrix > span.set.inherited { opacity: .45; font-weight: 400; }
.matrix i { font-style: inherit; }           /* half of a product's entry */
.matrix b { font-style: normal; font-weight: normal; color: var(--muted); margin: 0 .06em; }      /* the dot between the halves */
.matrix > span.dots { font-style: normal; color: var(--muted); }
.matrix sub { font-style: normal; font-size: .68em; vertical-align: -0.35em; line-height: 0; margin-left: .04em; }
/* the brackets: a tall stroke each side with short feet turned inwards */
.matrix::before, .matrix::after { content: ""; position: absolute; top: -3px; bottom: -3px; width: 5px; border: 1.2px solid var(--fg); }
.matrix::before { left: -5px; border-right: 0; } .matrix::after { right: -5px; border-left: 0; }
`);

const shown = n => n <= 8 ? Array.from({ length: n }, (_, i) => i + 1) : [1, 2, 3, null, n];      /* null: the elided middle */
/* how many squares a side of n takes once written (the elided middle is one) */
export const squares = n => shown(n).length;

export function createMatrix({ cols, rows, cell, letter = 'x', color = null, values = new Map(), inherited = new Map(), product = null, tiles = [], transposed = false }){
  const cs = shown(cols), rs = shown(rows), vector = cols === 1 || rows === 1;
  const el = html`<div class="matrix"></div>`, elided = cs.includes(null) || rs.includes(null);
  /* one size of type for the whole matrix, small enough that its widest entry fits its square:
     a letter is about half an em wide and a subscript digit about a third */
  const comma = cols > 9 || rows > 9 ? ',' : '', digits = n => String(n).length;
  const symbol = product ? .5 * (product.rows.letter.length + product.cols.letter.length) + .34 * (digits(rows) + digits(cols)) + .3
    : .5 * letter.length + .34 * (vector ? digits(Math.max(cols, rows)) : digits(cols) + digits(rows) + (comma ? .6 : 0));
  const widest = Math.max(symbol, ...[...values.values(), ...inherited.values()].map(v => written(v).length * .72));
  el.style.fontSize = Math.min(cell * .6, cell * .8 / widest) + 'px';
  el.style.gridTemplateColumns = `repeat(${cs.length}, ${cell}px)`; el.style.gridAutoRows = cell + 'px'; el.style.setProperty('--cell', cell + 'px');
  for (const r of rs) for (const c of cs){
    if (r === null || c === null){ el.append(html`<span class="dots">${r === null && c === null ? '⋱' : r === null ? '⋮' : '⋯'}</span>`); continue; }
    const entry = html`<span data-c="${c}" data-r="${r}"></span>`, key = c + ',' + r;
    const half = (from, n) => { const h = html`<i><sub></sub></i>`; h.prepend(from.letter); h.lastChild.textContent = n; if (from.color) h.style.color = `var(--${from.color})`; return h; };
    if (product) entry.append(half(product.rows, r), html`<b>·</b>`, half(product.cols, c));
    else { if (color) entry.style.color = `var(--${color})`;              /* symbols and typed numbers alike */
      if (values.has(key)){ entry.className = 'set'; entry.textContent = written(values.get(key)); }
      else if (inherited.has(key)){ entry.className = 'set inherited'; entry.textContent = written(inherited.get(key)); }      /* not given here: what a definition higher up gives */
      else { entry.append(letter, html`<sub></sub>`); entry.lastChild.textContent = vector ? (cols === 1 ? r : c) : transposed ? r + comma + c : c + comma + r; } }
    if (!elided && tiles.some(t => c > t.x && c <= t.x + t.w && r > t.y && r <= t.y + t.h)) entry.replaceChildren();      /* a shape stands here */
    el.append(entry);
  }
  if (!elided) for (const t of tiles){ const b = likeness({ cols: t.w, rows: t.h, unit: cell, color: t.color, name: t.name }); b.el.title = t.name;
    if (t.id){ b.el.dataset.tile = t.id; b.el.style.pointerEvents = 'auto'; b.el.style.cursor = 'pointer'; }      /* it can be pressed: the page hears of it by this id */
    Object.assign(b.el.style, { left: t.x * cell + 'px', top: t.y * cell + 'px' }); el.append(b.el); }
  return { el, width: cs.length * cell, height: rs.length * cell };
}
