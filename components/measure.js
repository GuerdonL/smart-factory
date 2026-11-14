/* Dimension lines for a rectangle on the canvas:  |-------- 6u --------|

   createMeasure(unit) -> { el, set(rect, { top, right }) }
     unit    how many world units make one "u"
     set     fits the lines to rect ({ x, y, w, h } in world coordinates). The width is shown along the bottom
             and the height down the left side; pass top / right as true to move them to the other side.
   Put el in the view's world. The lines and text keep their size on screen at any zoom.

   sides(view, rect) -> { top, right }   which fallbacks are needed for the lines to stay on screen */
import { html, style } from './dom.js';

style('measure', `
.measure { position: absolute; pointer-events: none; --px: calc(1px / var(--zoom, 1)); --gap: calc(14 * var(--px));
  color: var(--measure); font-size: calc(11 * var(--px)); line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
.measure > div { position: absolute; display: flex; align-items: center; }
.measure-w { left: 0; right: 0; top: calc(100% + var(--gap)); height: calc(11 * var(--px)); }
.measure-w.top { top: auto; bottom: calc(100% + 2.4 * var(--gap)); }      /* above the block's name */
.measure-h { top: 0; bottom: 0; right: calc(100% + var(--gap)); width: calc(11 * var(--px)); flex-direction: column; }
.measure-h.right { right: auto; left: calc(100% + var(--gap)); }
.measure i { background: currentColor; flex: none; }
.measure i.line { flex: 1; min-width: 0; min-height: 0; }
.measure-w i { height: var(--px); } .measure-w i.cap { width: var(--px); height: 100%; }
.measure-h i { width: var(--px); } .measure-h i.cap { height: var(--px); width: 100%; }
.measure-w span { padding: 0 calc(5 * var(--px)); } .measure-h span { padding: calc(4 * var(--px)) 0; }
`);

const ROOM = 34, ROOM_TOP = 54;      /* screen pixels a line needs beside the rectangle; more on top, to clear the name */
export function sides(view, r){
  const a = view.toScreen(r.x, r.y), b = view.toScreen(r.x + r.w, r.y + r.h);
  return { top: b.y + ROOM > innerHeight && a.y - ROOM_TOP >= 0, right: a.x - ROOM < 0 && b.x + ROOM <= innerWidth };
}

export function createMeasure(unit){
  const side = cls => html`<div class="${cls}"><i class="cap"></i><i class="line"></i><span></span><i class="line"></i><i class="cap"></i></div>`;
  const el = html`<div class="measure"></div>`, w = side('measure-w'), h = side('measure-h');
  el.append(w, h);
  const u = n => +(n / unit).toFixed(2) + 'u';
  return { el, set(r, { top = false, right = false } = {}){
    Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    w.querySelector('span').textContent = u(r.w); h.querySelector('span').textContent = u(r.h);
    w.classList.toggle('top', top); h.classList.toggle('right', right); } };
}
