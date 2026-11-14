/* The page: makes the components and connects them. Components never reach into each other;
   anything one needs from another passes through here. */
import { createView } from './components/view.js';
import { createMenu } from './components/menu.js';
import { createHud } from './components/hud.js';
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
   A selected block shows its dimension lines. */
const selected = new Map();                    /* block -> its dimension lines */
function select(list, { toggle = false } = {}){
  const drop = b => { b.select(false); selected.get(b).el.remove(); selected.delete(b); };
  if (!toggle) for (const b of [...selected.keys()]) if (!list.includes(b)) drop(b);
  for (const b of list){
    if (selected.has(b)){ if (toggle) drop(b); continue; }
    const m = createMeasure(view.unit); selected.set(b, m); view.world.append(m.el); b.select(true); m.set(b.rect, sides(view, b.rect));
  }
}
addEventListener('keydown', e => {
  if (e.key === 'Escape') return select([]);
  /* x, Backspace or Delete removes the selected blocks. (Typing in a name never reaches here.) */
  if ((e.key === 'x' || e.key === 'X' || e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.metaKey && !e.altKey && selected.size){
    e.preventDefault(); const gone = [...selected.keys()]; select([]);
    for (const b of gone){ b.el.remove(); blocks.splice(blocks.indexOf(b), 1); }
  }
});

/* dragging a selected block moves every selected block, in steps of the dots on screen */
function dragged(el, from){
  const b = blocks.find(b => b.el.contains(el));
  if (!b || !selected.has(b) || el.isContentEditable) return;
  const g = view.grid(), start = [...selected.keys()].map(b => [b, b.rect]);
  return { move(p){ const dx = Math.round((p.x - from.x) / g) * g, dy = Math.round((p.y - from.y) / g) * g;
    for (const [b, r] of start){ b.set({ ...r, x: r.x + dx, y: r.y + dy }); selected.get(b).set(b.rect, sides(view, b.rect)); } } };
}

/* a second click on a name soon after the first is a double click: edit the name */
let lastName = null, lastAt = 0;
function clicked(el, e){
  const b = blocks.find(b => b.el.contains(el));
  if (b && el === b.nameEl && lastName === b && e.timeStamp - lastAt < 450){ lastName = null; select([b]); return b.rename(); }
  lastName = b && el === b.nameEl ? b : null; lastAt = e.timeStamp;
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
  onChange: cam => { hud.show(cam); menu.close(); for (const [b, m] of selected) m.set(b.rect, sides(view, b.rect)); },
  onMenu: (x, y) => menu.openAt(x, y),
  onClick: clicked,
  onDrag: dragged,
});
document.body.append(view.el, menu.el, hud.el);
hud.show(view.camera());
