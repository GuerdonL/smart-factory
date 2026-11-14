/* A block on the canvas: a solid, slightly raised rectangle in its shape's colour, with its name above it.

   createBlock(shape, rect, name) -> { el, nameEl, shape, rect, name, set(rect), select(on), rename() }
     shape    a config from shapes/; its "color" names the theme variable to use ("tensor" -> --tensor)
     rect     { x, y, w, h } in world coordinates
     name     the text shown above it
     nameEl   the element showing the name
     set      moves and resizes it
     select   shows or hides the selection halo
   Each corner has a handle, an element with data-corner = nw | ne | sw | se, for whoever wants to resize by it.
     rename   lets the user type a new name in place: Enter or clicking away keeps it, Escape puts the old one back,
              and an empty name is not kept */
import { html, style, editText } from './dom.js';

style('block', `
.block { position: absolute; box-sizing: border-box; --px: calc(1px / var(--zoom, 1));   /* one screen pixel, whatever the zoom */
  border-radius: calc(8 * var(--px));
  /* lit from above: a flat face with a bright top lip, a dark bottom lip, and a shadow underneath.
     These are sized in screen pixels, so a block looks the same zoomed in or out. */
  background: var(--block);
  /* a thin dark rim all round, so two blocks that touch still show where one ends and the next begins */
  box-shadow: var(--halo, 0 0), inset 0 0 0 var(--px) var(--edge),
    inset 0 calc(2.5 * var(--px)) 0 var(--raise-light), inset 0 calc(-4 * var(--px)) 0 var(--raise-dark); }
/* the shadow underneath is drawn on a layer below every block (z-index -1), so it falls on the canvas and never on another block */
.block::before { content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit; pointer-events: none;
  box-shadow: 0 calc(2 * var(--px)) calc(3 * var(--px)) var(--shadow), 0 calc(8 * var(--px)) calc(14 * var(--px)) calc(-4 * var(--px)) var(--shadow); }
.block.selected { outline: calc(2 * var(--px)) solid var(--select); outline-offset: calc(2 * var(--px));
  --halo: 0 0 0 calc(7 * var(--px)) var(--select-halo); cursor: move; }
/* a block makes no layer of its own, so its name (z-index 2) sits above every block on the canvas, not just this one */
.block-name { position: absolute; z-index: 2; left: 0; bottom: calc(100% + 9 * var(--px)); padding: 0 calc(3 * var(--px)); margin-left: calc(-3 * var(--px));
  font-family: var(--font-name); font-size: calc(14 * var(--px)); line-height: 1.2; letter-spacing: -0.02em; white-space: nowrap; color: var(--fg); border-radius: calc(3 * var(--px)); cursor: default; }
.block.selected .block-name { color: var(--select); }
/* corners: a handle on each, half in and half out, showing which way it stretches */
.block-corner { position: absolute; width: calc(14 * var(--px)); height: calc(14 * var(--px)); margin: calc(-7 * var(--px)); z-index: 1; }
.block-corner[data-corner="nw"] { left: 0; top: 0; cursor: nwse-resize; }
.block-corner[data-corner="se"] { right: 0; bottom: 0; cursor: nwse-resize; }
.block-corner[data-corner="ne"] { right: 0; top: 0; cursor: nesw-resize; }
.block-corner[data-corner="sw"] { left: 0; bottom: 0; cursor: nesw-resize; }
`);

export function createBlock(shape, rect, name = ''){
  const el = html`<div class="block"><span class="block-name"></span></div>`, nameEl = el.firstElementChild;
  for (const c of ['nw', 'ne', 'sw', 'se']) el.append(html`<i class="block-corner" data-corner="${c}"></i>`);
  nameEl.textContent = name;
  el.style.setProperty('--block', `var(--${shape.color})`);
  const block = { el, nameEl, shape, rect, name,
    select(on){ el.classList.toggle('selected', on); },
    set(r){ block.rect = r; Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); },
    rename(){ editText(nameEl, text => { if (text) block.name = text; nameEl.textContent = block.name; }); } };
  block.set(rect);
  return block;
}
