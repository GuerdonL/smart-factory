/* The mark where two shapes touch and multiply: a small "·" on their shared edge.

   createJoin({ x, y, ok, note }) -> { el }
     x, y   the middle of the shared edge, in world coordinates
     ok     whether the product is defined. If not, the mark turns to the warning colour and shows `note`
            (say "4 ≠ 3": the left one's columns against the right one's rows).
   Put el in the view's world. It keeps its size on screen at any zoom. */
import { html, style } from './dom.js';

style('join', `
.join { position: absolute; z-index: 2; pointer-events: none; --px: calc(1px / var(--zoom, 1)); transform: translate(-50%, -50%);
  min-width: calc(16 * var(--px)); height: calc(16 * var(--px)); padding: 0 calc(4 * var(--px)); box-sizing: border-box;
  display: grid; place-items: center; border-radius: calc(8 * var(--px)); white-space: nowrap;
  background: var(--panel); color: var(--fg); border: var(--px) solid var(--line); box-shadow: 0 var(--px) calc(2 * var(--px)) var(--shadow);
  font-family: var(--font-math); font-size: calc(18 * var(--px)); line-height: 0; }
.join.wrong { color: var(--warn); border-color: var(--warn); font-family: var(--font-name); font-size: calc(10 * var(--px)); }
`);

export function createJoin({ x, y, ok, note = '' }){
  const el = html`<div class="join"></div>`;
  el.textContent = ok ? '·' : note; el.classList.toggle('wrong', !ok); el.title = ok ? 'matrix product' : 'cannot multiply: ' + note;
  Object.assign(el.style, { left: x + 'px', top: y + 'px' });
  return { el };
}
