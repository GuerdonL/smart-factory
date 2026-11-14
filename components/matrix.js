/* A variable written out in matrix notation, laid on the dot grid.

   createMatrix({ cols, rows, cell, letter, color, values, product }) -> { el, width, height }
     cols, rows   the variable's promised shape
     cell         the size of one entry's square, in world units
     letter       what the entries are called: the variable's initials, say "k" for Keys (default "x")
     color        a theme colour to write the entries in ("lazuli" -> --lazuli): the colour of the block they come
                  from. Left out, they are written in the ordinary text colour.
     product      for a matrix that is a product: { rows: { letter, color }, cols: { letter, color } }, the block
                  its rows come from (the first of the chain) and the block its columns come from (the last).
                  Each entry is then written as the pair it is made from, each half in its block's colour:
                  k₂·q₃ is the second row of k against the third column of q.
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

style('matrix', `
.matrix { position: absolute; display: grid; color: var(--fg); font-family: var(--font-math); font-style: italic; line-height: 1; }
.matrix > span { text-align: center; line-height: var(--cell); white-space: nowrap; }      /* centred in its square */
.matrix > span.set { font-style: normal; font-family: var(--font-ui); font-weight: 600; font-size: .92em; font-variant-numeric: tabular-nums; }
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

export function createMatrix({ cols, rows, cell, letter = 'x', color = null, values = new Map(), product = null }){
  const cs = shown(cols), rs = shown(rows), vector = cols === 1 || rows === 1;
  const el = html`<div class="matrix"></div>`;
  /* one size of type for the whole matrix, small enough that its widest entry fits its square:
     a letter is about half an em wide and a subscript digit about a third */
  const comma = cols > 9 || rows > 9 ? ',' : '', digits = n => String(n).length;
  const symbol = product ? .5 * (product.rows.letter.length + product.cols.letter.length) + .34 * (digits(rows) + digits(cols)) + .3
    : .5 * letter.length + .34 * (vector ? digits(Math.max(cols, rows)) : digits(cols) + digits(rows) + (comma ? .6 : 0));
  const widest = Math.max(symbol, ...[...values.values()].map(v => written(v).length * .72));
  el.style.fontSize = Math.min(cell * .6, cell * .8 / widest) + 'px';
  el.style.gridTemplateColumns = `repeat(${cs.length}, ${cell}px)`; el.style.gridAutoRows = cell + 'px'; el.style.setProperty('--cell', cell + 'px');
  for (const r of rs) for (const c of cs){
    if (r === null || c === null){ el.append(html`<span class="dots">${r === null && c === null ? '⋱' : r === null ? '⋮' : '⋯'}</span>`); continue; }
    const entry = html`<span data-c="${c}" data-r="${r}"></span>`, key = c + ',' + r;
    const half = (from, n) => { const h = html`<i><sub></sub></i>`; h.prepend(from.letter); h.lastChild.textContent = n; if (from.color) h.style.color = `var(--${from.color})`; return h; };
    if (product) entry.append(half(product.rows, r), html`<b>·</b>`, half(product.cols, c));
    else if (values.has(key)){ entry.className = 'set'; entry.textContent = written(values.get(key)); }
    else { entry.append(letter, html`<sub></sub>`); entry.lastChild.textContent = vector ? (cols === 1 ? r : c) : c + comma + r; if (color) entry.style.color = `var(--${color})`; }
    el.append(entry);
  }
  return { el, width: cs.length * cell, height: rs.length * cell };
}
