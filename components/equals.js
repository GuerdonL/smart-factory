/* The sign between a shape and the piece beside it that it is asserted to equal:   [shape]  =  [piece]

   createEquals({ x, y }) -> { el }
     x, y   the middle of the gap between the two, in world coordinates
   Put el in the view's world. */
import { html, style } from './dom.js';

style('equals', `
.equals { position: absolute; z-index: 2; pointer-events: none; transform: translate(-50%, -50%); color: var(--fg); font-family: var(--font-math); font-size: 22px; line-height: 1; }
`);

export function createEquals({ x, y }){
  const el = html`<div class="equals">=</div>`;
  Object.assign(el.style, { left: x + 'px', top: y + 'px' });
  return { el };
}
