/* What a piece (one shape, or several touching) comes to, written beside it:   [shapes]  =  ⎡ … ⎤

   createResult({ unit }) -> { el, set(box, type, side, drop) -> rect }
     unit   world units to one "u"
     set    box is the rectangle round the piece's shapes ({ x, y, w, h }, world coordinates). side says where the
            "=" and the matrix go: 'right' (the default) puts them to the right of the box, level with its middle;
            'below' puts them under it, starting at its left edge, `drop` further units down (default 0).
            Either way they sit on the dots.
            type is what the piece comes to: { cols, rows } is written out in matrix notation; { error } is written
            as the error, in the warning colour. With no type nothing is shown.
            Returns the rectangle the "=" and the matrix now cover, so the caller can see what they would overlap.
   Put el in the view's world, beneath the blocks. Call set whenever the shapes change; it only rewrites the matrix
   when the size it has to show is a different one. */
import { html, style } from './dom.js';
import { createMatrix } from './matrix.js';

style('result', `
.result { position: absolute; left: 0; top: 0; pointer-events: none; }
.result-sign { position: absolute; transform: translate(-50%, -50%); color: var(--fg); font-family: var(--font-math); font-size: 22px; line-height: 1; }
.result-error { position: absolute; transform: translateY(-50%); color: var(--warn); font-family: var(--font-name); font-size: 13px; white-space: nowrap; }
`);

export function createResult({ unit }){
  const on = v => Math.round(v / unit) * unit;
  const el = html`<div class="result"><div class="result-sign">=</div></div>`, sign = el.firstElementChild;
  let showing = '', body = null, width = 0, height = 0;
  return { el, set(box, type, side = 'right', drop = 0){
    el.hidden = !type; if (!type) return null;
    const key = type.error ? 'error ' + type.error : type.cols + 'x' + type.rows;
    if (key !== showing){ showing = key; body?.remove();
      if (type.error){ body = html`<div class="result-error"></div>`; body.textContent = type.error; width = 4 * unit; height = 0; }
      else { const m = createMatrix({ cols: type.cols, rows: type.rows, cell: unit }); body = m.el; width = m.width; height = m.height; }
      el.append(body); }
    /* the matrix sits on the dots; the sign is level with the matrix, a unit and a half before it */
    const left = side === 'below' ? on(box.x) : on(box.x + box.w) + 1.5 * unit;
    const top = side === 'below' ? on(box.y + box.h) + (1 + drop) * unit + (height ? 0 : unit / 2) : height ? on(box.y + box.h / 2 - height / 2) : box.y + box.h / 2;
    Object.assign(sign.style, { left: left + 'px', top: top + height / 2 + 'px' });
    Object.assign(body.style, { left: left + 1.5 * unit + 'px', top: top + 'px' });
    const air = unit / 4;                       /* room for the brackets */
    return { x: left - unit / 2, y: top - (height ? air : unit / 2), w: 2.5 * unit + width + air, h: (height || unit) + 2 * air }; } };
}
