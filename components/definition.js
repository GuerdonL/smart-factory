/* What a definition space shows: an equation, with what its contents come to on the left and what the block
   promises on the right.

       ⎡ a₁·b₁ a₁·b₂ a₁·b₃ ⎤     ⎡ k₁₁ k₂₁ k₃₁ ⎤
       ⎣ a₂·b₁ a₂·b₂ a₂·b₃ ⎦  =  ⎣ k₁₂ k₂₂ k₃₂ ⎦

   On the right, the block as a variable in matrix notation, at its promised size. On the left, the matrix that the
   shapes in the space currently come to, so the two can be compared entry for entry; its entries are coloured by
   the shapes they come from. The sign between them is "=" when the sizes agree and "≠" when they do not.
   The equation stays put at the centre of the space, its sign at the origin, as part of the background: the shapes
   are not tied to it and can be anywhere, over it included. Before anything is in the space, its left side is a
   dashed outline of the promised size, waiting.
   (What the contents come to is worked out elsewhere and handed to check.)

   createDefinition({ cols, rows, unit, letter, values, editable, colsName, rowsName }) -> { el, check(type, look) }
     cols, rows   the block's promised shape, in units
     letter       the block's initials, for the right-hand matrix's entries
     values       the entries that have been given a number (see matrix.js)
     editable     whether the right-hand matrix's entries can be pressed, to give them numbers
     colsName, rowsName   the names of the block's sides, where it has them
     unit         world units to one "u"
     check        takes what the space's contents come to: null for nothing yet; { cols, rows, colsName, rowsName }
                  for a size (where both a promised side and the contents' side are named, the names must agree
                  too); or { error } for contents that have no size, which is written out in words.
                  look is how to write the left-hand matrix: createMatrix's letter, color, values and product.
   Where the entries can be pressed, the canvas hands the click to the page, which decides what it means. */
import { html, style } from './dom.js';
import { createMatrix } from './matrix.js';

style('definition', `
.definition { position: absolute; left: 0; top: 0; pointer-events: none; }
.definition.editable .matrix.promised > span[data-c] { pointer-events: auto; cursor: text; border-radius: 3px; }
.definition.editable .matrix.promised > span[data-c]:hover { background: var(--hover); }
.definition-slot { position: absolute; box-sizing: border-box; display: grid; place-items: center; border: 1.2px dashed var(--muted); border-radius: 4px;
  color: var(--muted); font-family: var(--font-name); font-size: 11px; white-space: nowrap; }
.definition-sign { position: absolute; transform: translate(-50%, -50%); text-align: center; color: var(--fg); font-family: var(--font-math); font-size: 22px; line-height: 1; }
.definition-error { position: absolute; transform: translate(-100%, -50%); color: var(--warn); font-family: var(--font-name); font-size: 13px; white-space: nowrap; }
.definition.wrong .definition-sign { color: var(--warn); }
`);

export function createDefinition({ cols, rows, unit, letter = 'x', values, editable = false, colsName = null, rowsName = null }){
  const on = v => Math.round(v / unit) * unit;                   /* everything sits on the dots */
  const el = html`<div class="definition"><div class="definition-slot"></div><div class="definition-sign">=</div></div>`;
  el.classList.toggle('editable', editable);
  const [slot, sign] = el.children, matrix = createMatrix({ cols, rows, cell: unit, letter, values });
  matrix.el.classList.add('promised');
  /* the sign is at the origin, with one unit of air each side; both sides are level with it */
  const top = on(-rows * unit / 2), level = top + rows * unit / 2;
  Object.assign(slot.style, { left: -unit - cols * unit + 'px', top: top + 'px', width: cols * unit + 'px', height: rows * unit + 'px' });
  slot.textContent = `${cols} × ${rows}`;
  Object.assign(sign.style, { left: '0px', top: level + 'px' });
  Object.assign(matrix.el.style, { left: unit + 'px', top: on(top + (rows * unit - matrix.height) / 2) + 'px' });
  el.append(matrix.el);
  let left = null, showing = '';
  return { el, check(type, look = {}){
    const named = (a, b) => !a || !b || a === b;
    const wrong = !!type && (!!type.error || type.cols !== cols || type.rows !== rows || !named(type.colsName, colsName) || !named(type.rowsName, rowsName));
    el.classList.toggle('wrong', wrong); sign.textContent = wrong ? '≠' : '='; slot.hidden = !!type;
    /* the left side, rewritten only when it would read differently; it ends one unit before the sign */
    const key = !type ? '' : type.error ? 'error ' + type.error : type.cols + 'x' + type.rows + JSON.stringify({ ...look, values: look.values ? [...look.values] : [] });
    if (key !== showing){ showing = key; left?.remove(); left = null;
      if (type && type.error){ left = html`<div class="definition-error"></div>`; left.textContent = type.error; Object.assign(left.style, { left: -unit + 'px', top: level + 'px' }); }
      else if (type){ const m = createMatrix({ cols: type.cols, rows: type.rows, cell: unit, ...look }); left = m.el;
        Object.assign(left.style, { left: -unit - m.width + 'px', top: on(level - m.height / 2) + 'px' }); }
      if (left) el.append(left); } } };
}
