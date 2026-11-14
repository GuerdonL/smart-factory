/* A block on the canvas: a solid, slightly raised rectangle in its shape's colour.

   createBlock(shape, rect) -> { el, shape, rect, set(rect) }
     shape   a config from shapes/; its "color" names the theme variable to use ("tensor" -> --tensor)
     rect    { x, y, w, h } in world coordinates
     set     moves and resizes it */
import { html, style } from './dom.js';

style('block', `
.block { position: absolute; box-sizing: border-box; border-radius: 8px;
  /* lit from above: a soft highlight fading down the face, a bright top lip, a dark bottom lip, and a shadow underneath */
  background: linear-gradient(var(--raise-light), transparent 55%) var(--block);
  box-shadow: inset 0 1.5px 0 var(--raise-light), inset 0 -4px 0 var(--raise-dark), 0 2px 3px var(--shadow), 0 8px 14px -4px var(--shadow); }
`);

export function createBlock(shape, rect){
  const el = html`<div class="block"></div>`;
  el.style.setProperty('--block', `var(--${shape.color})`);
  const block = { el, shape, rect, set(r){ block.rect = r;
    Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); } };
  block.set(rect);
  return block;
}
