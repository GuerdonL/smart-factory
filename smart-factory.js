/* The page: makes the components and connects them. Components never reach into each other;
   anything one needs from another passes through here. */
import { editText } from './components/dom.js';
import { createView } from './components/view.js';
import { createMenu } from './components/menu.js';
import { createHud } from './components/hud.js';
import { createBlock } from './components/block.js';
import { createMeasure, sides } from './components/measure.js';
import { createBounds } from './components/bounds.js';
import { drawRectangle } from './components/draw.js';
import { boxSelect } from './components/marquee.js';

/* the shapes registry: shapes/index.json names the configs in shapes/ */
let shapes = [];
fetch('shapes/index.json').then(r => r.json())
  .then(names => Promise.all(names.map(name => fetch(`shapes/${name}.json`).then(r => r.json()).then(shape => ({ name, ...shape })))))
  .then(list => { shapes = list; }).catch(() => {});

const blocks = [];
const blockAt = el => blocks.find(b => b.el.contains(el));
/* a new block is "Shape n", with the lowest n no block is using */
function freeName(){
  const used = new Set(blocks.map(b => b.name));
  for (let n = 1; ; n++) if (!used.has('Shape ' + n)) return 'Shape ' + n;
}

/* ---- groups: blocks that are selected together. A block is in at most one group. ---- */
const groupOf = new Map();                     /* block -> its group's number */
let nextGroup = 1;
const members = b => groupOf.has(b) ? blocks.filter(o => groupOf.get(o) === groupOf.get(b)) : [b];
const isOneGroup = list => list.length > 1 && groupOf.has(list[0]) && list.every(b => groupOf.get(b) === groupOf.get(list[0])) && members(list[0]).length === list.length;
function ungroup(list){
  for (const b of list) groupOf.delete(b);
  for (const b of blocks) if (groupOf.has(b) && members(b).length < 2) groupOf.delete(b);      /* a group of one is no group */
}

/* ---- selection ----
   Click a block to select it (with its group, if it has one); double-click to select just that block.
   Shift-click adds or removes. Click empty canvas or press Escape to clear. Press s to drag a box round several.
   One block selected: it shows its dimension lines and can be resized. Several: a box is drawn round them with a
   group button, and they move together but do not resize. Whatever is not selected fades back. */
const selected = new Set();
let measure = null;                            /* the dimension lines of the one selected block */
const bounds = createBounds();
function shown(){                              /* brings what is on screen in line with the selection and the blocks' positions */
  const list = [...selected], one = list.length === 1 ? list[0] : null;
  for (const b of blocks){ b.select(selected.has(b)); b.dim(selected.size > 0 && !selected.has(b)); b.grips(!(list.length > 1 && selected.has(b))); }
  if (one){ measure ||= createMeasure(view.unit); view.world.append(measure.el); measure.set(one.rect, sides(view, one.rect)); }
  else measure?.el.remove();
  if (list.length > 1){
    const x = Math.min(...list.map(b => b.rect.x)), y = Math.min(...list.map(b => b.rect.y));
    bounds.set({ x, y, w: Math.max(...list.map(b => b.rect.x + b.rect.w)) - x, h: Math.max(...list.map(b => b.rect.y + b.rect.h)) - y }, { grouped: isOneGroup(list) });
    view.world.append(bounds.el);
  } else bounds.el.remove();
}
function select(list, { toggle = false } = {}){
  if (!toggle) selected.clear();
  const off = toggle && list.length && list.every(b => selected.has(b));
  for (const b of list) off ? selected.delete(b) : selected.add(b);
  shown();
}

/* ---- keys ---- */
let boxing = null;                             /* the box selection in progress, if any */
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') return select([]);
  /* s: drag a box; every block it touches is selected, with its group. Press s again to leave without selecting. */
  if (e.key === 's' || e.key === 'S'){
    if (boxing) return boxing.cancel();
    const box = boxing = boxSelect(view);
    return box.done.then(r => { boxing = null; if (!r) return;
      const hit = blocks.filter(b => b.rect.x < r.x + r.w && b.rect.x + b.rect.w > r.x && b.rect.y < r.y + r.h && b.rect.y + b.rect.h > r.y);
      select([...new Set(hit.flatMap(members))]); });
  }
  /* x, Backspace or Delete removes the selected blocks. (Typing in a name or a measurement never reaches here.) */
  if ((e.key === 'x' || e.key === 'X' || e.key === 'Backspace' || e.key === 'Delete') && selected.size){
    e.preventDefault(); const gone = [...selected]; select([]);
    for (const b of gone){ b.el.remove(); blocks.splice(blocks.indexOf(b), 1); }
    ungroup(gone);
  }
});

/* ---- drags that begin on a block ----
   By a side or corner: resize it. On a selected block: move every selected block. Both go in steps of the dots on
   screen. Anything else is left to the view, which pans. */
function dragged(el, from){
  const b = blockAt(el);
  if (!b || el.isContentEditable) return;
  const g = view.grid(), snap = v => Math.round(v / g) * g, cursor = c => { view.el.style.cursor = c; }, end = () => cursor('');
  const grip = el.dataset.grip;
  if (grip){                                    /* the opposite side or corner stays where it is; never smaller than one square */
    if (!selected.has(b) || selected.size > 1) select([b]);
    const r = b.rect, right = r.x + r.w, bottom = r.y + r.h;
    cursor(getComputedStyle(el).cursor);
    return { end, move(p){
      const x0 = grip.includes('w') ? Math.min(snap(p.x), right - g) : r.x, x1 = grip.includes('e') ? Math.max(snap(p.x), r.x + g) : right;
      const y0 = grip.includes('n') ? Math.min(snap(p.y), bottom - g) : r.y, y1 = grip.includes('s') ? Math.max(snap(p.y), r.y + g) : bottom;
      b.set({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); shown(); } };
  }
  if (!selected.has(b)) return;
  const start = [...selected].map(b => [b, b.rect]);
  cursor('move');
  return { end, move(p){ const dx = snap(p.x - from.x), dy = snap(p.y - from.y);
    for (const [b, r] of start) b.set({ ...r, x: r.x + dx, y: r.y + dy }); shown(); } };
}

/* ---- clicks ----
   A second click on the same thing soon after the first is a double click. */
let lastEl = null, lastAt = 0;
function clicked(el, e){
  const twice = el === lastEl && e.timeStamp - lastAt < 450;
  lastEl = twice ? null : el; lastAt = e.timeStamp;
  /* the group button: make the selection one group, or take it apart again */
  if (bounds.button.contains(el)){
    const list = [...selected];
    if (isOneGroup(list)) ungroup(list); else { ungroup(list); const id = nextGroup++; for (const b of list) groupOf.set(b, id); }
    return shown();
  }
  /* a measurement: double-click to type a size in whole units; the block keeps its top-left corner */
  if (measure) for (const dim of ['w', 'h']) if (el === measure.labels[dim]){
    const b = [...selected][0];
    if (twice) editText(el, text => { const n = Math.round(parseFloat(text)); if (n >= 1) b.set({ ...b.rect, [dim]: n * view.unit }); shown(); });
    return;                                     /* a click on a measurement never changes the selection */
  }
  const b = blockAt(el);
  if (b && twice){ select([b]); if (el === b.nameEl) b.rename(); return; }      /* double click: just this block; on its name, rename it */
  select(b ? members(b) : [], { toggle: !!b && e.shiftKey });
}

/* what choosing a shape from "New" does, by the shape's "draw" */
const draw = {
  rectangle: shape => { select([]); const name = freeName();
    return drawRectangle(view, rect => createBlock(shape, rect, name)).then(block => { if (block) blocks.push(block); }); },
};

const menu = createMenu([{ label: 'New', items: () => shapes.map(shape => ({ label: shape.label || shape.name, run: () => draw[shape.draw]?.(shape) })) }]);
const hud = createHud({ onHome: () => view.home() });
const view = createView({
  onChange: cam => { hud.show(cam); menu.close(); shown(); },
  onMenu: (x, y) => menu.openAt(x, y),
  onClick: clicked,
  onDrag: dragged,
});
document.body.append(view.el, menu.el, hud.el);
hud.show(view.camera());
