/* What a piece (one shape, or several touching) comes to, written beside it:   [shapes]  =  ⎡ … ⎤

   createResult({ unit }) -> { el, set(box, type, { side, drop, look, nameable, editable, hollows, warn, whole }) -> rect, name(done), body() }
     unit   world units to one "u"
     set    box is the rectangle round the piece's shapes ({ x, y, w, h }, world coordinates). side says where the
            "=" and the matrix go: 'right' (the default) puts them to the right of the box, level with its middle;
            'below' puts them under it, starting at its left edge, `drop` further units down (default 0);
            'left' puts the matrix and then the sign to the left of the box.
            Either way they sit on the dots.
            type is what the piece comes to: { cols, rows } is written out in matrix notation; { error } is written
            as the error, in the warning colour. With no type nothing is shown.
            look is how the matrix is written: any of createMatrix's letter, color, values and product. Its standing
            are the shapes that stand in for some of the entries (see matrix.js).
            hollows, where given and not empty, is where the matrix goes in place of all that: [{ x, y, w, h }],
            empty rectangles among the piece's own shapes (world coordinates). The matrix is written in the middle
            of each, on the dots, with no "=": one result, written once in every hollow given. (An error is never
            written in a hollow.)
            nameable says the matrix can be pressed, to name the result (default false).
            editable says its entries can be pressed, to type a value over each (default false): for one shape on its own.
            whole says an arrow reads this result, so its matrix must stand on whole units (arrows.js: writtenAt).
            warn writes the matrix in the warning colour (default false): the output of an arrow that is not
            what it promises.
            Returns the rectangle the "=" and the matrix now cover, so the caller can see what they would overlap.
     name   asks the user to name this result: the matrix is ringed and a field opens above it to type in.
            done(text) is called with the name, or with null if they gave none or pressed Escape.
     body   the rectangle the matrix itself now covers ({ x, y, w, h }, world coordinates), or null where none is
            written (nothing, or an error): for whoever sets something against the written result (an arrow).
   An arrow's output is written with one of these too: the matrix alone, in the output's place (hollows: [place]).
   Where the matrix can be pressed, the canvas hands the click to the page, which decides what it means.
   Put el in the view's world, beneath the blocks. Call set whenever the shapes change; it only rewrites the matrix
   when the size it has to show is a different one. */
import { html, style, editText } from './dom.js';
import { createMatrix, valuesKey } from './matrix.js';
import { writtenAt } from '../arrows.js';

style('result', `
.result { position: absolute; left: 0; top: 0; pointer-events: none; }
.result-sign { position: absolute; transform: translate(-50%, -50%); color: var(--fg); font-family: var(--font-math); font-size: 22px; line-height: 1; }
.result .matrix { border-radius: 3px; }
.result.nameable .matrix { pointer-events: auto; cursor: pointer; }
.result.nameable .matrix:hover { background: var(--hover); }
.result.editable .matrix > span[data-c] { pointer-events: auto; cursor: text; border-radius: 3px; }
.result.editable .matrix > span[data-c]:hover { background: var(--hover); }
.result.naming .matrix { background: var(--select-halo); outline: 2px solid var(--select); outline-offset: 5px; }
/* in a hollow the matrix fills the space between its piece's shapes, so its brackets stand just inside it, clear of them */
.result.in-hollow .matrix::before { left: 2px; } .result.in-hollow .matrix::after { right: 2px; }
.result.in-hollow .matrix::before, .result.in-hollow .matrix::after { top: 2px; bottom: 2px; }
.result-name { position: absolute; pointer-events: auto; transform: translateY(-100%); margin-top: -12px; padding: 0 3px; min-width: 3ch;
  font-family: var(--font-name); font-size: 14px; line-height: 1.2; white-space: nowrap; color: var(--select); }
.result-name:empty::before { content: "name"; color: var(--muted); }
.result.warned .matrix, .result.warned .matrix span { color: var(--warn) !important; }
.result-error { position: absolute; transform: translateY(-50%); color: var(--warn); font-family: var(--font-name); font-size: 13px; white-space: nowrap; }
`);

export function createResult({ unit }){
  const on = v => Math.round(v / unit) * unit;
  const el = html`<div class="result"><div class="result-sign">=</div></div>`, sign = el.firstElementChild;
  const nameEl = html`<span class="result-name" hidden></span>`; el.append(nameEl);
  let showing = '', body = null, width = 0, height = 0, copies = [];
  return { el, set(box, type, { side = 'right', drop = 0, look = {}, nameable = false, editable = false, hollows = [], warn = false, whole = false } = {}){
    el.classList.toggle('nameable', nameable); el.classList.toggle('editable', editable); el.classList.toggle('warned', warn);
    el.hidden = !type; if (!type) return null;
    const key = type.error ? 'error ' + type.error : type.cols + 'x' + type.rows + (type.colsName || '') + '/' + (type.rowsName || '') + JSON.stringify({ ...look, values: valuesKey(look.values), inherited: look.inherited ? [...look.inherited] : [] });
    if (key !== showing){ showing = key; body?.remove();
      if (type.error){ body = html`<div class="result-error"></div>`; body.textContent = type.error; width = 4 * unit; height = 0; }
      else { const m = createMatrix({ cols: type.cols, rows: type.rows, colsName: type.colsName, rowsName: type.rowsName, cell: unit, decimal: 'square', ...look });      /* on the canvas a decimal is a square */
        body = m.el; body.classList.add('result-body'); width = m.width; height = m.height; }
      el.append(body); }
    for (const c of copies) c.remove(); copies = [];
    sign.hidden = hollows.length > 0 && !type.error; el.classList.toggle('in-hollow', sign.hidden);
    if (sign.hidden){                          /* in the hollows: the same matrix in each, and the name is asked for above the first */
      const place = (m, h) => Object.assign(m.style, { left: on(h.x + (h.w - width) / 2) + 'px', top: on(h.y + (h.h - height) / 2) + 'px' });
      place(body, hollows[0]); Object.assign(nameEl.style, { left: body.style.left, top: body.style.top });
      for (const h of hollows.slice(1)){ const copy = body.cloneNode(true); place(copy, h); el.append(copy); copies.push(copy); }
      return { ...hollows[0] }; }
    /* beside the piece: where the sign and the matrix go is arrows.js's to say (writtenAt), in units, since an arrow set against the result reads it there */
    const b = { x: box.x / unit, y: box.y / unit, w: box.w / unit, h: box.h / unit }, to = writtenAt(b, { w: width / unit, h: height / unit }, { side, drop, whole });
    Object.assign(sign.style, { left: to.sign.x * unit + 'px', top: to.sign.y * unit + 'px' });
    Object.assign(body.style, { left: to.body.x * unit + 'px', top: to.body.y * unit + 'px' }); Object.assign(nameEl.style, { left: body.style.left, top: body.style.top });
    return { x: to.at.x * unit, y: to.at.y * unit, w: to.at.w * unit, h: to.at.h * unit }; },
    body(){ return el.hidden || !body || !height ? null : { x: parseFloat(body.style.left), y: parseFloat(body.style.top), w: width, h: height }; },
    name(done){
      el.classList.add('naming'); nameEl.textContent = ''; nameEl.hidden = false;
      editText(nameEl, text => { el.classList.remove('naming'); nameEl.hidden = true; done(text || null); });
    } };
}
