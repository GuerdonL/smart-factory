/* A variable written out in matrix notation, laid on the dot grid.

   createMatrix({ cols, rows, cell }) -> { el, width, height }
     cols, rows   the variable's promised shape
     cell         the size of one entry's square, in world units
     width, height  the size of what was made, in world units (for placing it)

   One row or one column is a vector, written x₁ … xₙ. Otherwise it is a matrix, each entry named by its column and
   row: x₁y₁ … xₙy₁ down to x₁yₙ … xₙyₙ. Past eight along a side, the middle is elided the way it is on paper:
   the first three, dots, and the last. */
import { html, style } from './dom.js';

style('matrix', `
.matrix { position: absolute; display: grid; color: var(--fg); font-family: var(--font-math); font-style: italic; font-size: 17px; line-height: 1; }
.matrix > span { text-align: center; line-height: var(--cell); white-space: nowrap; }      /* centred in its square */
.matrix > span.dots { font-style: normal; color: var(--muted); }
.matrix sub { font-style: normal; font-size: .68em; vertical-align: -0.35em; line-height: 0; margin-left: .04em; }
/* the brackets: a tall stroke each side with short feet turned inwards */
.matrix::before, .matrix::after { content: ""; position: absolute; top: -4px; bottom: -4px; width: 8px; border: 1.6px solid var(--fg); }
.matrix::before { left: -6px; border-right: 0; } .matrix::after { right: -6px; border-left: 0; }
`);

const shown = n => n <= 8 ? Array.from({ length: n }, (_, i) => i + 1) : [1, 2, 3, null, n];      /* null: the elided middle */

export function createMatrix({ cols, rows, cell }){
  const cs = shown(cols), rs = shown(rows), vector = cols === 1 || rows === 1;
  const el = html`<div class="matrix"></div>`;
  el.style.gridTemplateColumns = `repeat(${cs.length}, ${cell}px)`; el.style.gridAutoRows = cell + 'px'; el.style.setProperty('--cell', cell + 'px');
  for (const r of rs) for (const c of cs){
    if (r === null || c === null){ el.append(html`<span class="dots">${r === null && c === null ? '⋱' : r === null ? '⋮' : '⋯'}</span>`); continue; }
    el.append(vector ? html`<span>x<sub>${cols === 1 ? r : c}</sub></span>` : html`<span>x<sub>${c}</sub>y<sub>${r}</sub></span>`);
  }
  return { el, width: cs.length * cell, height: rs.length * cell };
}
