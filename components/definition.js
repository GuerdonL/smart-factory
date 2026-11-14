/* What a definition space shows: an equation.

       ┌ ─ ─ ─ ┐     ⎡ x₁y₁ x₂y₁ x₃y₁ ⎤
       │ 3 × 2 │  =  ⎢                ⎥
       └ ─ ─ ─ ┘     ⎣ x₁y₂ x₂y₂ x₃y₂ ⎦

   On the right, the block as a variable in matrix notation. On the left, the place for what defines it: a dashed
   outline of exactly the block's promised size. Whatever is put in the space must come to that size.

   createDefinition({ cols, rows, unit }) -> { el, check(rects) }
     cols, rows   the block's promised shape, in units
     unit         world units to one "u"
     check        takes the rects ({ x, y, w, h }, world coordinates) of everything in the space. Nothing yet: the
                  outline waits. Together exactly cols × rows: "=". Any other size: "≠", with the size it is. */
import { html, style } from './dom.js';
import { createMatrix } from './matrix.js';

style('definition', `
.definition { position: absolute; left: 0; top: 0; pointer-events: none; }
.definition-slot { position: absolute; box-sizing: border-box; display: grid; place-items: center; border: 1.2px dashed var(--muted); border-radius: 4px;
  color: var(--muted); font-family: var(--font-name); font-size: 11px; white-space: nowrap; }
.definition.filled .definition-slot { border-color: transparent; color: transparent; }      /* content has taken its place */
.definition-sign { position: absolute; transform: translate(-50%, -50%); text-align: center; color: var(--fg); font-family: var(--font-math); font-size: 22px; line-height: 1; }
.definition-sign small { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 4px; font-family: var(--font-name); font-size: 10px; white-space: nowrap; }
.definition.wrong .definition-sign { color: var(--warn); }
`);

export function createDefinition({ cols, rows, unit }){
  const on = v => Math.round(v / unit) * unit;                   /* everything sits on the dots */
  const el = html`<div class="definition"><div class="definition-slot"></div><div class="definition-sign"><span>=</span><small></small></div></div>`;
  const [slot, sign] = el.children, matrix = createMatrix({ cols, rows, cell: unit });
  /* the sign is at the origin; one unit of air each side; the slot and the matrix are level with each other */
  const top = on(-rows * unit / 2);
  Object.assign(slot.style, { left: -unit - cols * unit + 'px', top: top + 'px', width: cols * unit + 'px', height: rows * unit + 'px' });
  slot.textContent = `${cols} × ${rows}`;
  Object.assign(sign.style, { left: '0px', top: top + rows * unit / 2 + 'px' });
  Object.assign(matrix.el.style, { left: unit + 'px', top: on(top + (rows * unit - matrix.height) / 2) + 'px' });
  el.append(matrix.el);
  return { el, check(rects){
    let is = null;
    if (rects.length){ const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
      is = [Math.round((Math.max(...rects.map(r => r.x + r.w)) - x) / unit), Math.round((Math.max(...rects.map(r => r.y + r.h)) - y) / unit)]; }
    const wrong = !!is && (is[0] !== cols || is[1] !== rows);
    el.classList.toggle('filled', !!is); el.classList.toggle('wrong', wrong);
    sign.firstElementChild.textContent = wrong ? '≠' : '='; sign.lastElementChild.textContent = wrong ? `${is[0]} × ${is[1]}` : ''; } };
}
