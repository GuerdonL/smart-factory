/* What a canvas-full of shapes comes to, written beside them:   [shapes]  =  ⎡ … ⎤

   createResult({ unit }) -> { el, set(box, type) }
     unit   world units to one "u"
     set    box is the rectangle round all the shapes ({ x, y, w, h }, world coordinates); the "=" and the matrix go
            to its right, level with its middle, on the dots. type is what the shapes come to: { cols, rows } is
            written out in matrix notation; { error } is written as the error, in the warning colour.
            With no type (nothing on the canvas) nothing is shown.
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
  let showing = '', body = null, height = 0;
  return { el, set(box, type){
    el.hidden = !type; if (!type) return;
    const key = type.error ? 'error ' + type.error : type.cols + 'x' + type.rows;
    if (key !== showing){ showing = key; body?.remove();
      if (type.error){ body = html`<div class="result-error"></div>`; body.textContent = type.error; height = 0; }
      else { const m = createMatrix({ cols: type.cols, rows: type.rows, cell: unit }); body = m.el; height = m.height; }
      el.append(body); }
    const right = on(box.x + box.w), middle = box.y + box.h / 2;
    Object.assign(sign.style, { left: right + 1.5 * unit + 'px', top: middle + 'px' });
    Object.assign(body.style, { left: right + 3 * unit + 'px', top: (height ? on(middle - height / 2) : middle) + 'px' }); } };
}
