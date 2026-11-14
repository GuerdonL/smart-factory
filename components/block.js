/* A block on the canvas: a solid, slightly raised rectangle in its shape's colour.

   createBlock(shape, rect) -> { el, shape, rect, set(rect) }
     shape   a config from shapes/; its "color" names the theme variable to use ("tensor" -> --tensor)
     rect    { x, y, w, h } in world coordinates
     set     moves and resizes it */
import { html, style } from './dom.js';

style('block', `
.block { position: absolute; box-sizing: border-box; border-radius: 5px; background: var(--block);
  box-shadow: inset 0 1px 0 var(--raise-light), inset 0 -2px 0 var(--raise-dark), 0 1px 2px var(--shadow), 0 3px 6px -2px var(--shadow); }
`);

export function createBlock(shape, rect){
  const el = html`<div class="block"></div>`;
  el.style.setProperty('--block', `var(--${shape.color})`);
  const block = { el, shape, rect, set(r){ block.rect = r;
    Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); } };
  block.set(rect);
  return block;
}
