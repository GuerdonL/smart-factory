/* The mark where two shapes touch, saying what the touch means.

   createJoin({ kind, x, y, ok, note, warn }) -> { el }
     kind   which touch it is (algebra.js): 'product' (the default) is a small "·" on the shared edge; 'sum' a "+" on
            the shared horizontal edge; 'times' a "∘" in a ring and 'over' a "÷" in a ring, on the shared corner.
     x, y   where the mark goes, in world coordinates: the middle of the shared edge, or the shared corner
     ok     whether the touch is defined. If not, the mark turns to the warning colour and shows `note` in place of
            its sign (say "4 ≠ 3": the left one's columns against the right one's rows; or "embed ≠ key").
     warn   draws a defined mark in the warning colour all the same, keeping its sign: for a mark in a piece that
            mixes rules, where no touch is wrong by itself.
   Put el in the view's world. It zooms with the canvas. */
import { html, style } from './dom.js';

style('join', `
.join { position: absolute; z-index: 2; pointer-events: none; --px: 1px; transform: translate(-50%, -50%);
  min-width: calc(16 * var(--px)); height: calc(16 * var(--px)); padding: 0 calc(4 * var(--px)); box-sizing: border-box;
  display: grid; place-items: center; border-radius: calc(8 * var(--px)); white-space: nowrap;
  background: var(--panel); color: var(--fg); border: var(--px) solid var(--line); box-shadow: 0 var(--px) calc(2 * var(--px)) var(--shadow);
  font-family: var(--font-math); font-size: calc(18 * var(--px)); line-height: 0; }
.join.sum { font-size: calc(14 * var(--px)); }
/* times and over: the sign in a ring of its own colour, a little larger, so the corner it sits on is not mistaken for an edge */
.join.times, .join.over { min-width: calc(20 * var(--px)); height: calc(20 * var(--px)); border-radius: calc(10 * var(--px)); border: calc(1.5 * var(--px)) solid var(--fg); font-size: calc(13 * var(--px)); }
.join.warn { color: var(--warn); border-color: var(--warn); }
.join.wrong { font-family: var(--font-name); font-size: calc(10 * var(--px)); }
`);

const SIGN = { product: '·', sum: '+', times: '∘', over: '÷' };
const NAME = { product: 'matrix product', sum: 'sum', times: 'entry by entry: times', over: 'entry by entry: divided by' };
const VERB = { product: 'multiply', sum: 'add', times: 'multiply entry by entry', over: 'divide entry by entry' };
export function createJoin({ kind = 'product', x, y, ok, note = '', warn = false }){
  const el = html`<div class="join"></div>`;
  el.classList.add(kind); el.classList.toggle('wrong', !ok); el.classList.toggle('warn', !ok || warn);
  el.textContent = ok ? SIGN[kind] : note; el.title = !ok ? `cannot ${VERB[kind]}: ${note}` : warn ? NAME[kind] + ', in a piece that mixes rules' : NAME[kind];
  Object.assign(el.style, { left: x + 'px', top: y + 'px' });
  return { el };
}
