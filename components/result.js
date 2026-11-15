/* What a piece (one shape, or several touching) comes to, written beside it:   [shapes]  =  ⎡ … ⎤

   createResult({ unit }) -> { el, set(box, type, { side, drop, look, nameable }) -> rect, name(done) }
     unit   world units to one "u"
     set    box is the rectangle round the piece's shapes ({ x, y, w, h }, world coordinates). side says where the
            "=" and the matrix go: 'right' (the default) puts them to the right of the box, level with its middle;
            'below' puts them under it, starting at its left edge, `drop` further units down (default 0).
            Either way they sit on the dots.
            type is what the piece comes to: { cols, rows } is written out in matrix notation; { error } is written
            as the error, in the warning colour. With no type nothing is shown.
            look is how the matrix is written: any of createMatrix's letter, color, values and product. With
            look.stands ({ name, color }) the shape of that name is drawn in the matrix's place: the piece is that variable.
            nameable says the matrix can be pressed, to name the result (default false).
            Returns the rectangle the "=" and the matrix now cover, so the caller can see what they would overlap.
     name   asks the user to name this result: the matrix is ringed and a field opens above it to type in.
            done(text) is called with the name, or with null if they gave none or pressed Escape.
   Where the matrix can be pressed, the canvas hands the click to the page, which decides what it means.
   Put el in the view's world, beneath the blocks. Call set whenever the shapes change; it only rewrites the matrix
   when the size it has to show is a different one. */
import { html, style, editText } from './dom.js';
import { createMatrix } from './matrix.js';
import { likeness } from './block.js';

style('result', `
.result { position: absolute; left: 0; top: 0; pointer-events: none; }
.result-sign { position: absolute; transform: translate(-50%, -50%); color: var(--fg); font-family: var(--font-math); font-size: 22px; line-height: 1; }
.result .matrix { border-radius: 3px; }
.result.nameable .matrix { pointer-events: auto; cursor: pointer; }
.result.nameable .matrix:hover { background: var(--hover); }
.result.naming .matrix { background: var(--select-halo); outline: 2px solid var(--select); outline-offset: 5px; }
.result-name { position: absolute; pointer-events: auto; transform: translateY(-100%); margin-top: -12px; padding: 0 3px; min-width: 3ch;
  font-family: var(--font-name); font-size: 14px; line-height: 1.2; white-space: nowrap; color: var(--select); }
.result-name:empty::before { content: "name"; color: var(--muted); }
.result-error { position: absolute; transform: translateY(-50%); color: var(--warn); font-family: var(--font-name); font-size: 13px; white-space: nowrap; }
`);

export function createResult({ unit }){
  const on = v => Math.round(v / unit) * unit;
  const el = html`<div class="result"><div class="result-sign">=</div></div>`, sign = el.firstElementChild;
  const nameEl = html`<span class="result-name" hidden></span>`; el.append(nameEl);
  let showing = '', body = null, width = 0, height = 0;
  return { el, set(box, type, { side = 'right', drop = 0, look = {}, nameable = false } = {}){
    el.classList.toggle('nameable', nameable);
    el.hidden = !type; if (!type) return null;
    const key = type.error ? 'error ' + type.error : type.cols + 'x' + type.rows + JSON.stringify({ ...look, values: look.values ? [...look.values] : [], inherited: look.inherited ? [...look.inherited] : [] });
    if (key !== showing){ showing = key; body?.remove();
      if (type.error){ body = html`<div class="result-error"></div>`; body.textContent = type.error; width = 4 * unit; height = 0; }
      else { const m = look.stands ? likeness({ cols: type.cols, rows: type.rows, unit, ...look.stands }) : createMatrix({ cols: type.cols, rows: type.rows, cell: unit, ...look });
        body = m.el; body.classList.add('result-body'); width = m.width; height = m.height; }
      el.append(body); }
    /* the matrix sits on the dots; the sign is level with the matrix, a unit and a half before it */
    const left = side === 'below' ? on(box.x) : on(box.x + box.w) + 1.5 * unit;
    const top = side === 'below' ? on(box.y + box.h) + (1 + drop) * unit + (height ? 0 : unit / 2) : height ? on(box.y + box.h / 2 - height / 2) : box.y + box.h / 2;
    Object.assign(sign.style, { left: left + 'px', top: top + height / 2 + 'px' });
    Object.assign(body.style, { left: left + 1.5 * unit + 'px', top: top + 'px' });
    Object.assign(nameEl.style, { left: left + 1.5 * unit + 'px', top: top + 'px' });
    const air = unit / 4;                       /* room for the brackets */
    return { x: left - unit / 2, y: top - (height ? air : unit / 2), w: 2.5 * unit + width + air, h: (height || unit) + 2 * air }; },
    name(done){
      el.classList.add('naming'); nameEl.textContent = ''; nameEl.hidden = false;
      editText(nameEl, text => { el.classList.remove('naming'); nameEl.hidden = true; done(text || null); });
    } };
}
