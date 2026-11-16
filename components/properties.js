/* The properties of what is selected: a small panel that comes up in the corner while one shape is selected.

   createProperties() -> { el, show(what) }
     show   takes { name, color, cols, rows, scalar, matrix } to put the panel up, or null to take it down
              name     the variable's name, written large
              color    a CSS colour for the name (the variable's own); where it is no colour, the text colour is used
              cols, rows   the shape, written "3 wide × 6 tall" (a single entry is "scalar")
              matrix   what createMatrix takes, less its cell: the value. A long side is cut short there, to its
                       first three entries, dots, and its last.
   Nothing else is shown, and nothing in it can be pressed: the canvas under it still takes the pointer. */
import { html, style } from './dom.js';
import { createMatrix } from './matrix.js';

style('properties', `
.properties { position: fixed; z-index: 9; pointer-events: none; --px: 1px; display: flex; flex-direction: column; gap: 6px; max-width: min(320px, calc(100% - 32px));
  left: max(16px, env(safe-area-inset-left, 0px)); bottom: calc(52px + env(safe-area-inset-bottom, 0px)); padding: 10px 14px 12px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 2px 10px var(--shadow); animation: properties-up .12s ease-out; }
@keyframes properties-up { from { opacity: 0; transform: translateY(6px); } }
.properties-name { font-family: var(--font-name); font-size: 22px; line-height: 1.15; letter-spacing: -0.02em; color: var(--named, var(--fg)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.properties-shape { color: var(--muted); font-variant-numeric: tabular-nums; }
.properties-value { padding: 5px 7px 3px; }
.properties-value .matrix { position: relative; }
@media (prefers-reduced-motion: reduce) { .properties { animation: none; } }
`);

const CELL = 26;
export function createProperties(){
  const el = html`<div class="properties" aria-label="Properties" hidden><div class="properties-name"></div><div class="properties-shape"></div><div class="properties-value"></div></div>`;
  const [name, shape, value] = el.children;
  let showing = '';
  return { el, show(what){
    if (!what){ el.hidden = true; showing = ''; return; }
    const key = JSON.stringify([what.name, what.color, what.cols, what.rows, what.scalar, { ...what.matrix, values: [...(what.matrix.values || [])] }]);
    if (key === showing) return; showing = key;
    name.textContent = what.name; name.style.setProperty('--named', what.color || 'initial');
    shape.textContent = what.scalar ? 'scalar' : `${what.cols} wide × ${what.rows} tall`;
    const m = createMatrix({ ...what.matrix, cols: what.cols, rows: what.rows, cell: CELL });
    value.replaceChildren(m.el);
    el.hidden = false; } };
}
