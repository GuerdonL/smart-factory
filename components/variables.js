/* The variables in reach, down the right edge of the screen: named shapes and named side lengths.

   createVariables({ onDrag(item, x, y), onDrop(item, x, y), onEnd() }) -> { el, show(items) }
     show     takes what to list, top to bottom:
                { kind: 'shape',  name, color, cols, rows }   drawn as a miniature of the shape, with its name
                { kind: 'length', name, units }               drawn as a ruler, with its name and its length
              Anything else on an item is kept and handed back untouched, for the caller's own use.
     Each sits small and washed out until the pointer is over it, when it grows and takes its full colour.
     It can then be pressed and dragged out onto the canvas:
     onDrag   called as it moves, with the item and the pointer's screen position
     onDrop   called when it is let go anywhere off this list, with the same
     onEnd    called when the drag is over, however it ended
   While dragging, a copy of the item follows the pointer. */
import { html, style } from './dom.js';

const RULER = `<svg viewBox="0 0 24 12"><path d="M1.5 6h21M1.5 2v8M22.5 2v8M6.75 6v-2.5M12 6V2.5M17.25 6v-2.5"/></svg>`;

style('variables', `
/* the strip itself lets the pointer through to the canvas; only the items take it */
.variables { position: fixed; z-index: 9; pointer-events: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; overflow: hidden auto; scrollbar-width: none;
  right: max(10px, env(safe-area-inset-right, 0px)); top: calc(56px + env(safe-area-inset-top, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px)); padding: 4px 6px 4px 30px; }
.variable { flex: none; pointer-events: auto; display: flex; align-items: center; gap: 7px; padding: 3px 6px; border-radius: 6px; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;
  font-family: var(--font-name); font-size: 13px; line-height: 1.2; white-space: nowrap; color: var(--fg);
  opacity: .42; filter: saturate(.45); transform: scale(.86); transform-origin: right center; transition: transform .12s, opacity .12s, filter .12s; }
.variable:hover, .variable.held, .variable-ghost { opacity: 1; filter: none; transform: scale(1.12); background: var(--panel); box-shadow: 0 1px 4px var(--shadow); }
.variable-mini { flex: none; border-radius: 2.5px; background: var(--mini); box-shadow: inset 0 0 0 1px var(--edge), inset 0 -1.5px 0 var(--raise-dark); }
.variable svg { flex: none; width: 24px; height: 12px; fill: none; stroke: var(--measure); stroke-width: 1.3; stroke-linecap: round; }
.variable small { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
/* the copy that follows the pointer hangs below and to the right of it, so it never covers what it is about to land on */
.variable-ghost { position: fixed; z-index: 30; pointer-events: none; margin: 0; transform: translate(14px, 14px) scale(1.12); transform-origin: left top; }
@media (prefers-reduced-motion: reduce) { .variable { transition: none; } }
`);

export function createVariables({ onDrag = () => {}, onDrop = () => {}, onEnd = () => {} } = {}){
  const el = html`<div class="variables" aria-label="Variables" hidden></div>`;
  el.addEventListener('contextmenu', e => e.preventDefault());
  let showing = '';
  const draw = item => {
    const v = html`<div class="variable"></div>`;
    if (item.kind === 'shape'){ const k = 22 / Math.max(item.cols, item.rows), mini = html`<i class="variable-mini"></i>`;      /* the shape's proportions, 22px on its longer side */
      Object.assign(mini.style, { width: Math.max(5, item.cols * k) + 'px', height: Math.max(5, item.rows * k) + 'px' }); mini.style.setProperty('--mini', `var(--${item.color})`);
      v.append(mini, html`<span></span>`); v.lastChild.textContent = item.name; }
    else { v.innerHTML = RULER; v.append(html`<span></span>`, html`<small></small>`); v.children[1].textContent = item.name; v.lastChild.textContent = item.units + 'u'; }
    return v;
  };
  function hold(v, item, down){
    v.setPointerCapture(down.pointerId);
    let ghost = null;
    const move = e => {
      if (!ghost){ if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 5) return;
        ghost = draw(item); ghost.classList.add('variable-ghost'); document.body.append(ghost); v.classList.add('held'); }
      Object.assign(ghost.style, { left: e.clientX + 'px', top: e.clientY + 'px' }); onDrag(item, e.clientX, e.clientY);
    };
    const up = e => { v.removeEventListener('pointermove', move); v.removeEventListener('pointerup', up); v.removeEventListener('pointercancel', up);
      v.classList.remove('held'); if (!ghost) return; ghost.remove();
      const r = el.getBoundingClientRect(), off = e.clientX < r.left || e.clientY < r.top || e.clientY > r.bottom;
      if (e.type === 'pointerup' && off) onDrop(item, e.clientX, e.clientY);
      onEnd(); };
    v.addEventListener('pointermove', move); v.addEventListener('pointerup', up); v.addEventListener('pointercancel', up);
  }
  return { el, show(items){
    const key = JSON.stringify(items.map(i => [i.kind, i.name, i.color, i.cols, i.rows, i.units]));
    if (key === showing && !items.some(i => i.fresh)) return;      /* nothing to redraw: leave whatever is being hovered or dragged alone */
    showing = key; el.hidden = !items.length; el.replaceChildren();
    for (const item of items){ const v = draw(item); v.addEventListener('pointerdown', e => { if (e.button === 0) hold(v, item, e); }); el.append(v); } } };
}
