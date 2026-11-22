/* The project's clock, top-centre (clear of the readout, which grows along the bottom): the tick, a way to type it, and a way to step it by one.

   createClock({ onSet(text), onStep(by) }) -> { el, show(tick) }
     show     takes the tick, a whole number from 0, and writes it in the field (unless it is being typed in)
     onSet    called with what was typed when Enter is pressed or the field is left with something else in it;
              whoever is told decides whether that is a tick, and calls show with the tick that then stands
     onStep   called with -1 or 1 when a button is pressed */
import { html, style } from './dom.js';

style('clock', `
.clock { position: fixed; z-index: 10; display: flex; gap: 6px; align-items: center; color: var(--muted); font-variant-numeric: tabular-nums;
  left: 50%; transform: translateX(-50%); top: calc(12px + env(safe-area-inset-top, 0px));
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px 4px 10px; }
.clock button { font: inherit; color: var(--fg); background: none; border: 1px solid var(--line); border-radius: 4px; padding: 2px 8px; cursor: pointer; }
.clock button:hover { background: var(--hover); }
.clock button:focus-visible, .clock input:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.clock input { font: inherit; color: var(--fg); background: none; border: 1px solid var(--line); border-radius: 4px; padding: 2px 6px; width: 9ch; text-align: right; }
`);

export function createClock({ onSet = () => {}, onStep = () => {} } = {}){
  const el = html`<div class="clock" aria-label="The tick"><span>tick</span><button type="button" data-step="-1" aria-label="One tick back">−</button><input type="text" inputmode="numeric" aria-label="The tick" value="0"><button type="button" data-step="1" aria-label="One tick on">+</button></div>`;
  const [, back, field, on] = el.children; let shown = '0';
  back.addEventListener('click', () => onStep(-1)); on.addEventListener('click', () => onStep(1));
  const give = () => { if (field.value.trim() !== shown) onSet(field.value); };
  field.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter'){ give(); field.blur(); } if (e.key === 'Escape'){ field.value = shown; field.blur(); } });
  field.addEventListener('blur', give);
  for (const type of ['keyup', 'keypress', 'pointerdown', 'mousedown', 'wheel', 'paste', 'copy', 'cut']) el.addEventListener(type, e => e.stopPropagation());
  el.addEventListener('contextmenu', e => e.preventDefault());
  return { el, show(tick){ shown = String(tick); field.value = shown; } };
}
