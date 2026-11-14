/* The page: makes the components and connects them. Components never reach into each other;
   anything one needs from another passes through here. */
import { createView } from './components/view.js';
import { createMenu } from './components/menu.js';
import { createHud } from './components/hud.js';
import { editText } from './components/dom.js';
import { createBlock } from './components/block.js';
import { createMeasure, sides } from './components/measure.js';
import { drawRectangle } from './components/draw.js';

/* the shapes registry: shapes/index.json names the configs in shapes/ */
let shapes = [];
fetch('shapes/index.json').then(r => r.json())
  .then(names => Promise.all(names.map(name => fetch(`shapes/${name}.json`).then(r => r.json()).then(shape => ({ name, ...shape })))))
  .then(list => { shapes = list; }).catch(() => {});

const blocks = [];
/* a new block is "Shape n", with the lowest n no block is using */
function freeName(){
  const used = new Set(blocks.map(b => b.name));
  for (let n = 1; ; n++) if (!used.has('Shape ' + n)) return 'Shape ' + n;
}

/* selection: click a block to select it alone, shift-click to add or remove one, click empty canvas or press Escape to clear.
   A selected block shows its dimension lines and comes to the front; the others fade. */
const selected = new Map();                    /* block -> its dimension lines */
function select(list, { toggle = false } = {}){
  const drop = b => { b.select(false); selected.get(b).el.remove(); selected.delete(b); };
  if (!toggle) for (const b of [...selected.keys()]) if (!list.includes(b)) drop(b);
  for (const b of list){
    if (selected.has(b)){ if (toggle) drop(b); continue; }
    const m = createMeasure(view.unit); selected.set(b, m); view.world.append(m.el); b.select(true); m.set(b.rect, sides(view, b.rect));
  }
  for (const b of blocks) b.dim(selected.size > 0 && !selected.has(b));        /* while something is selected, the rest fade back */
}
addEventListener('keydown', e => {
  if (e.key === 'Escape') return select([]);
  /* x, Backspace or Delete removes the selected blocks. (Typing in a name never reaches here.) */
  if ((e.key === 'x' || e.key === 'X' || e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.metaKey && !e.altKey && selected.size){
    e.preventDefault(); const gone = [...selected.keys()]; select([]);
    for (const b of gone){ b.el.remove(); blocks.splice(blocks.indexOf(b), 1); }
  }
});

const fit = b => selected.get(b)?.set(b.rect, sides(view, b.rect));
const blockAt = el => blocks.find(b => b.el.contains(el));

/* drags that begin on a block: by a side or corner, resize it; on a selected block, move every selected block.
   Both go in steps of the dots on screen. Anything else is left to the view, which pans. */
function dragged(el, from){
  const b = blockAt(el);
  if (!b || el.isContentEditable) return;
  const g = view.grid(), snap = v => Math.round(v / g) * g, cursor = c => { view.el.style.cursor = c; }, end = () => cursor('');
  const grip = el.dataset.grip;
  if (grip){                                    /* the opposite side or corner stays where it is; never smaller than one square */
    if (!selected.has(b)) select([b]);
    const r = b.rect, right = r.x + r.w, bottom = r.y + r.h;
    cursor(getComputedStyle(el).cursor);
    return { end, move(p){
      const x0 = grip.includes('w') ? Math.min(snap(p.x), right - g) : r.x, x1 = grip.includes('e') ? Math.max(snap(p.x), r.x + g) : right;
      const y0 = grip.includes('n') ? Math.min(snap(p.y), bottom - g) : r.y, y1 = grip.includes('s') ? Math.max(snap(p.y), r.y + g) : bottom;
      b.set({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); fit(b); } };
  }
  if (!selected.has(b)) return;
  const start = [...selected.keys()].map(b => [b, b.rect]);
  cursor('move');
  return { end, move(p){ const dx = snap(p.x - from.x), dy = snap(p.y - from.y);
    for (const [b, r] of start){ b.set({ ...r, x: r.x + dx, y: r.y + dy }); fit(b); } } };
}

/* clicks. A second click on the same name or measurement soon after the first is a double click: edit it.
   A typed measurement resizes the block to that many whole units, keeping its top-left corner. */
let lastEl = null, lastAt = 0;
function clicked(el, e){
  const twice = el === lastEl && e.timeStamp - lastAt < 450;
  lastEl = twice ? null : el; lastAt = e.timeStamp;
  for (const [b, m] of selected) for (const dim of ['w', 'h']) if (el === m.labels[dim]){
    if (twice) editText(el, text => { const n = Math.round(parseFloat(text));
      if (n >= 1) b.set({ ...b.rect, [dim]: n * view.unit }); fit(b); });
    return;                                     /* a click on a measurement never changes the selection */
  }
  const b = blockAt(el);
  if (b && el === b.nameEl && twice){ select([b]); return b.rename(); }
  select(b ? [b] : [], { toggle: !!b && e.shiftKey });
}

/* what choosing a shape from "New" does, by the shape's "draw" */
const draw = {
  rectangle: shape => { select([]); const name = freeName();
    return drawRectangle(view, rect => createBlock(shape, rect, name)).then(block => { if (block) blocks.push(block); }); },
};

const menu = createMenu([{ label: 'New', items: () => shapes.map(shape => ({ label: shape.label || shape.name, run: () => draw[shape.draw]?.(shape) })) }]);
const hud = createHud({ onHome: () => view.home() });
const view = createView({
  onChange: cam => { hud.show(cam); menu.close(); for (const b of selected.keys()) fit(b); },
  onMenu: (x, y) => menu.openAt(x, y),
  onClick: clicked,
  onDrag: dragged,
});
document.body.append(view.el, menu.el, hud.el);
hud.show(view.camera());
