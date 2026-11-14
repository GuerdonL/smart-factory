/* What a definition space shows: an equation.

       ┌ ─ ─ ─ ┐     ⎡ x₁y₁ x₂y₁ x₃y₁ ⎤
       │ 3 × 2 │  =  ⎢                ⎥
       └ ─ ─ ─ ┘     ⎣ x₁y₂ x₂y₂ x₃y₂ ⎦

   On the right, the block as a variable in matrix notation. On the left, the place for what defines it: a dashed
   outline of exactly the block's promised size. Whatever is put in the space must come to that size: one shape,
   or shapes touching so that they multiply. Separate pieces are not one thing and do not count.
   (What it comes to is worked out elsewhere and handed to check.)

   createDefinition({ cols, rows, unit, letter, values, colsName, rowsName }) -> { el, check(type) }
     cols, rows   the block's promised shape, in units
     letter       the block's initials, for the matrix's entries
     values       the entries that have been given a number (see matrix.js)
     colsName, rowsName   the names of the block's sides, where it has them
     unit         world units to one "u"
     check        takes what the space's content comes to: null for nothing yet (the outline waits),
                  { cols, rows, colsName, rowsName } for a size ("=" if it is the promised one, otherwise "≠" with
                  that size; where both a promised side and the content's side are named, the names must agree too),
                  or { error } for content that has no size ("≠" with the error).
   The matrix's entries can be pressed; the canvas hands clicks to the page, which decides what one means. */
import { html, style } from './dom.js';
import { createMatrix } from './matrix.js';

style('definition', `
.definition { position: absolute; left: 0; top: 0; pointer-events: none; }
.definition .matrix > span[data-c] { pointer-events: auto; cursor: text; border-radius: 3px; }
.definition .matrix > span[data-c]:hover { background: var(--hover); }
.definition-slot { position: absolute; box-sizing: border-box; display: grid; place-items: center; border: 1.2px dashed var(--muted); border-radius: 4px;
  color: var(--muted); font-family: var(--font-name); font-size: 11px; white-space: nowrap; }
.definition.filled .definition-slot { border-color: transparent; color: transparent; }      /* content has taken its place */
.definition-sign { position: absolute; transform: translate(-50%, -50%); text-align: center; color: var(--fg); font-family: var(--font-math); font-size: 22px; line-height: 1; }
.definition-sign small { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 4px; font-family: var(--font-name); font-size: 10px; white-space: nowrap; }
.definition.wrong .definition-sign { color: var(--warn); }
`);

export function createDefinition({ cols, rows, unit, letter = 'x', values, colsName = null, rowsName = null }){
  const on = v => Math.round(v / unit) * unit;                   /* everything sits on the dots */
  const el = html`<div class="definition"><div class="definition-slot"></div><div class="definition-sign"><span>=</span><small></small></div></div>`;
  const [slot, sign] = el.children, matrix = createMatrix({ cols, rows, cell: unit, letter, values });
  /* the sign is at the origin; one unit of air each side; the slot and the matrix are level with each other */
  const top = on(-rows * unit / 2);
  Object.assign(slot.style, { left: -unit - cols * unit + 'px', top: top + 'px', width: cols * unit + 'px', height: rows * unit + 'px' });
  slot.textContent = `${cols} × ${rows}`;
  Object.assign(sign.style, { left: '0px', top: top + rows * unit / 2 + 'px' });
  Object.assign(matrix.el.style, { left: unit + 'px', top: on(top + (rows * unit - matrix.height) / 2) + 'px' });
  el.append(matrix.el);
  return { el, check(type){
    const named = (a, b) => !a || !b || a === b;
    const wrong = !!type && (!!type.error || type.cols !== cols || type.rows !== rows || !named(type.colsName, colsName) || !named(type.rowsName, rowsName));
    el.classList.toggle('filled', !!type); el.classList.toggle('wrong', wrong);
    sign.firstElementChild.textContent = wrong ? '≠' : '='; sign.lastElementChild.textContent = wrong ? type.error || `${type.colsName || type.cols} × ${type.rowsName || type.rows}` : ''; } };
}
