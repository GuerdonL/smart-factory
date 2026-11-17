/* The variables in reach, down the right edge of the screen: named shapes and named side lengths.

   createVariables({ onDrag(item, x, y), onDrop(item, x, y), onEnd() }) -> { el, show(items, hidden) }
     show     takes what to list, top to bottom:
                { kind: 'shape',  name, color, cols, rows, children }   drawn as a miniature of the shape, with its name.
                                                              Its children (its side lengths) open under it on a click, as a frame's do
                { kind: 'length', name, units, label }        drawn as a ruler, with its name and its length (label, where
                                                              given, is written in place of the units: "√2u")
                { kind: 'frame',  name, children }            drawn as an outline, with its name. Its children are items
                                                              of any kind, kept out of sight under it until it is
                                                              clicked, when it opens to show them (and shuts again).
              Anything else on an item is kept and handed back untouched, for the caller's own use. An item's `key`,
              if it has one, is what its being open is remembered by; otherwise its name is.
              hidden is a second list, of the same kind of items (kind 'system' is drawn as a shape; with group: true,
              as an outline). It is kept out of sight below a divider and a plus button; the button opens and shuts it.
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
.variable-mini.group { background: none; box-shadow: none; border: 1.5px dashed var(--muted); box-sizing: border-box; }
.variable.child { margin-right: calc(14px * var(--depth)); }      /* what is in a frame hangs under it, stepped in from the edge */
.variable b { font: 11px/1 var(--font-ui); color: var(--muted); width: 8px; text-align: center; }      /* the mark that a frame opens */
.variables-more { flex: none; pointer-events: auto; display: flex; align-items: center; gap: 6px; margin: 4px 6px 2px 0; }
.variables-more::before { content: ""; width: 44px; height: 1px; background: var(--line); }
.variables-more button { all: unset; box-sizing: border-box; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--line); background: var(--panel); color: var(--muted);
  font: 15px/20px var(--font-ui); text-align: center; cursor: pointer; }
.variables-more button:hover { color: var(--fg); background: var(--hover); }
.variables-more button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .variable { transition: none; } }
`);

export function createVariables({ onDrag = () => {}, onDrop = () => {}, onEnd = () => {} } = {}){
  const el = html`<div class="variables" aria-label="Variables" hidden></div>`;
  el.addEventListener('contextmenu', e => e.preventDefault());
  let showing = '';
  const opened = new Set(), keyOf = item => item.key || item.kind + ':' + item.name;
  const draw = (item, depth = 0) => {
    const v = html`<div class="variable"></div>`;
    if (depth){ v.classList.add('child'); v.style.setProperty('--depth', depth); }
    if (item.children?.length && item.kind !== 'shape'){ v.append(html`<b></b>`);      /* a shape carries no mark: it is clicked to show its sides all the same */ v.firstChild.textContent = opened.has(keyOf(item)) ? '\u25be' : '\u25b8'; }
    if (item.kind !== 'length'){ const k = 22 / Math.max(item.cols, item.rows), mini = html`<i class="variable-mini"></i>`;      /* the shape's proportions, 22px on its longer side */
      Object.assign(mini.style, { width: Math.max(5, item.cols * k) + 'px', height: Math.max(5, item.rows * k) + 'px' }); mini.style.setProperty('--mini', `var(--${item.color})`); mini.classList.toggle('group', !!item.group || item.kind === 'frame');
      v.append(mini, html`<span></span>`); v.lastChild.textContent = item.name; }
    else { v.insertAdjacentHTML('beforeend', RULER); v.append(html`<span></span>`, html`<small></small>`); v.lastChild.previousSibling.textContent = item.name; v.lastChild.textContent = item.label || item.units + 'u'; }
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
      v.classList.remove('held');
      if (!ghost){ if (e.type === 'pointerup' && item.children?.length){ const k = keyOf(item); opened.has(k) ? opened.delete(k) : opened.add(k); self.show(...last); } return; }      /* a click, not a drag: a frame opens or shuts */
      ghost.remove();
      const r = el.getBoundingClientRect(), off = e.clientX < r.left || e.clientY < r.top || e.clientY > r.bottom;
      if (e.type === 'pointerup' && off) onDrop(item, e.clientX, e.clientY);
      onEnd(); };
    v.addEventListener('pointermove', move); v.addEventListener('pointerup', up); v.addEventListener('pointercancel', up);
  }
  let open = false, last = [[], []];
  const more = html`<div class="variables-more"><button type="button" aria-expanded="false" aria-label="System variables" title="System variables">+</button></div>`;
  const self = { el, show(items, hidden = []){
    last = [items, hidden];
    const told = i => [i.kind, i.name, i.color, i.cols, i.rows, i.units, i.label, (i.children || []).map(told)];
    const key = JSON.stringify([open, [...opened], ...[...items, ...hidden].map(told)]);
    if (key === showing && !items.some(i => i.fresh)) return;      /* nothing to redraw: leave whatever is being hovered or dragged alone */
    showing = key; el.hidden = !items.length && !hidden.length; el.replaceChildren();
    const put = (item, depth = 0) => { const v = draw(item, depth); v.addEventListener('pointerdown', e => { if (e.button === 0) hold(v, item, e); }); el.append(v);
      v.addEventListener('mousedown', e => e.preventDefault());      /* pressing an item leaves the cursor where it is: in a formula that is being typed, say, which the item can then be dragged onto */
      if (item.children?.length && opened.has(keyOf(item))) for (const c of item.children) put(c, depth + 1); };
    items.forEach(i => put(i));
    if (hidden.length){ more.firstChild.textContent = open ? '\u2212' : '+'; more.firstChild.setAttribute('aria-expanded', open); el.append(more); if (open) hidden.forEach(i => put(i)); } } };
  more.firstChild.addEventListener('pointerdown', e => e.stopPropagation());
  more.firstChild.addEventListener('click', () => { open = !open; self.show(...last); });
  return self;
}
