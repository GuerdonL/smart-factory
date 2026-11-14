/* A variable written out in matrix notation, laid on the dot grid.

   createMatrix({ cols, rows, cell, letter }) -> { el, width, height }
     cols, rows   the variable's promised shape
     cell         the size of one entry's square, in world units
     letter       what the entries are called: the variable's initials, say "k" for Keys (default "x")
     width, height  the size of what was made, in world units (for placing it)

   One row or one column is a vector, written k₁ … kₙ. Otherwise it is a matrix, each entry carrying its column then
   its row: k₁₁ … kₙ₁ down to k₁ₙ … kₙₙ (with a comma between them once either passes nine: k₁₀,₃). Past eight along
   a side, the middle is elided the way it is on paper: the first three, dots, and the last. */
import { html, style } from './dom.js';

style('matrix', `
.matrix { position: absolute; display: grid; color: var(--fg); font-family: var(--font-math); font-style: italic; line-height: 1; }
.matrix > span { text-align: center; line-height: var(--cell); white-space: nowrap; }      /* centred in its square */
.matrix > span.dots { font-style: normal; color: var(--muted); }
.matrix sub { font-style: normal; font-size: .68em; vertical-align: -0.35em; line-height: 0; margin-left: .04em; }
/* the brackets: a tall stroke each side with short feet turned inwards */
.matrix::before, .matrix::after { content: ""; position: absolute; top: -3px; bottom: -3px; width: 5px; border: 1.2px solid var(--fg); }
.matrix::before { left: -5px; border-right: 0; } .matrix::after { right: -5px; border-left: 0; }
`);

const shown = n => n <= 8 ? Array.from({ length: n }, (_, i) => i + 1) : [1, 2, 3, null, n];      /* null: the elided middle */

export function createMatrix({ cols, rows, cell, letter = 'x' }){
  const cs = shown(cols), rs = shown(rows), vector = cols === 1 || rows === 1;
  const el = html`<div class="matrix"></div>`;
  /* one size of type for the whole matrix, small enough that its widest entry fits its square:
     a letter is about half an em wide and a subscript digit about a third */
  const comma = cols > 9 || rows > 9 ? ',' : '', digits = n => String(n).length;
  const widest = .5 * letter.length + .34 * (vector ? digits(Math.max(cols, rows)) : digits(cols) + digits(rows) + (comma ? .6 : 0));
  el.style.fontSize = Math.min(cell * .6, cell * .8 / widest) + 'px';
  el.style.gridTemplateColumns = `repeat(${cs.length}, ${cell}px)`; el.style.gridAutoRows = cell + 'px'; el.style.setProperty('--cell', cell + 'px');
  for (const r of rs) for (const c of cs){
    if (r === null || c === null){ el.append(html`<span class="dots">${r === null && c === null ? '⋱' : r === null ? '⋮' : '⋯'}</span>`); continue; }
    const cell = html`<span><sub></sub></span>`; cell.prepend(letter); cell.lastChild.textContent = vector ? (cols === 1 ? r : c) : c + comma + r;
    el.append(cell);
  }
  return { el, width: cs.length * cell, height: rs.length * cell };
}
