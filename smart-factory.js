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
import { createDefinition } from './components/definition.js';
import { createCrumbs } from './components/crumbs.js';
import { createJoin } from './components/join.js';
import { createResult } from './components/result.js';
import { joins, pieces, typeOf } from './algebra.js';

/* the shapes registry: shapes/index.json names the configs in shapes/ */
let shapes = [];
fetch('shapes/index.json').then(r => r.json())
  .then(names => Promise.all(names.map(name => fetch(`shapes/${name}.json`).then(r => r.json()).then(shape => ({ name, ...shape })))))
  .then(list => { shapes = list; }).catch(() => {});

/* ---- spaces ----
   A space is one canvas-full of blocks. The page opens on the top space. Every block has a definition space of its
   own, made the first time it is opened (the top space instead shows "=" and what each piece of touching shapes comes to): a canvas showing an equation, with the block as a variable in matrix
   notation on the right and, on the left, the place for what defines it. What is put in the space must come to the
   block's promised size (w units across, h units down). Only the current space's blocks are on the canvas. */
const newSpace = (owner, parent) => ({ owner, parent, blocks: [], groupOf: new Map(), camera: { x: 0, y: 0, zoom: 1 }, definition: null });
const top = newSpace(null, null);
const spaceOf = new Map();                     /* block -> its definition space */
let space = top;
const trail = () => { const t = []; for (let s = space; s; s = s.parent) t.unshift(s); return t; };
function go(to){
  select([]); space.camera = view.camera();
  for (const b of space.blocks) b.el.remove(); space.definition?.el.remove();
  space = to;
  view.world.append(...space.blocks.map(b => b.el));
  if (space.owner){                            /* written afresh each time, so it follows the block's current size */
    const r = space.owner.rect;
    space.definition = createDefinition({ cols: Math.round(r.w / view.unit), rows: Math.round(r.h / view.unit), unit: view.unit });
    view.world.prepend(space.definition.el);   /* beneath the blocks */
  }
  view.origin.hidden = !!space.owner;          /* the equals sign sits at the origin of a definition space */
  view.look(space.camera);
  crumbs.show(trail().map(s => s.owner ? s.owner.name : 'Top'));
}
const open = b => { if (!spaceOf.has(b)) spaceOf.set(b, newSpace(b, space)); deeper.length = 0; go(spaceOf.get(b)); };
/* out and back in again, like a browser's back and forward: stepping out remembers the space left, so stepping in can return to it */
const deeper = [];
function out(){ if (!space.parent) return; deeper.push(space); go(space.parent); }
function backIn(){
  const to = deeper.pop();
  if (to && to.parent === space && space.blocks.includes(to.owner)) go(to); else deeper.length = 0;      /* its block may have been deleted since */
}
/* the mouse's back and forward buttons do that, and never the browser's own back and forward */
for (const type of ['mousedown', 'mouseup', 'auxclick']) addEventListener(type, e => {
  if (e.button !== 3 && e.button !== 4) return;
  e.preventDefault(); e.stopPropagation();
  if (type === 'mouseup') e.button === 3 ? out() : backIn();
}, true);

const blockAt = el => space.blocks.find(b => b.el.contains(el));
/* a new block is "Shape n", with the lowest n no block in this space is using */
function freeName(){
  const used = new Set(space.blocks.map(b => b.name));
  for (let n = 1; ; n++) if (!used.has('Shape ' + n)) return 'Shape ' + n;
}

/* ---- groups: blocks that are selected together. A block is in at most one group, within its space. ---- */
let nextGroup = 1;
const members = b => { const g = space.groupOf; return g.has(b) ? space.blocks.filter(o => g.get(o) === g.get(b)) : [b]; };
const isOneGroup = list => { const g = space.groupOf; return list.length > 1 && g.has(list[0]) && list.every(b => g.get(b) === g.get(list[0])) && members(list[0]).length === list.length; };
function ungroup(list){
  for (const b of list) space.groupOf.delete(b);
  for (const b of space.blocks) if (space.groupOf.has(b) && members(b).length < 2) space.groupOf.delete(b);      /* a group of one is no group */
}

/* ---- selection ----
   Click a block to select it (with its group, if it has one); double-click one inside a selected group to select
   just that block. Double-click a block that is selected on its own to open its definition space.
   Shift-click adds or removes. Click empty canvas or press Escape to clear. Press s to drag a box round several.
   One block selected: it shows its dimension lines and can be resized. Several: a box is drawn round them with a
   group button, and they move together but do not resize. Whatever is not selected fades back. */
const selected = new Set();
let measure = null;                            /* the dimension lines of the one selected block */
const bounds = createBounds();
const results = [];                            /* the top space's "= …", one for each piece */
let marks = [];                                /* the product marks now on the canvas */
function shown(){                              /* brings what is on screen in line with the selection and the blocks' positions */
  const list = [...selected], one = list.length === 1 ? list[0] : null;
  for (const b of space.blocks){ b.select(selected.has(b)); b.dim(selected.size > 0 && !selected.has(b)); b.grips(!(list.length > 1 && selected.has(b))); }
  if (one){ measure ||= createMeasure(view.unit); view.world.append(measure.el); measure.set(one.rect, sides(view, one.rect)); }
  else measure?.el.remove();
  if (list.length > 1){
    const x = Math.min(...list.map(b => b.rect.x)), y = Math.min(...list.map(b => b.rect.y));
    bounds.set({ x, y, w: Math.max(...list.map(b => b.rect.x + b.rect.w)) - x, h: Math.max(...list.map(b => b.rect.y + b.rect.h)) - y }, { grouped: isOneGroup(list) });
    view.world.append(bounds.el);
  } else bounds.el.remove();
  /* the algebra of what is here: a mark wherever two blocks touch and multiply, and whether it all comes to the promised size */
  const u = view.unit, rects = space.blocks.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u }));
  for (const j of marks) j.el.remove();
  marks = joins(rects).map(j => createJoin({ x: j.x * u, y: j.y * u, ok: j.ok, note: `${rects[j.left].w} ≠ ${rects[j.right].h}` }));
  view.world.append(...marks.map(j => j.el));
  /* a definition space checks what is here against its block's promised size. The top space has no promise, so it
     writes out what each piece comes to, beside that piece. (Shapes that do not touch are separate pieces.) */
  space.definition?.check(typeOf(rects));
  const ps = space.owner ? [] : pieces(rects);
  /* a result goes to the right of its piece; if something else is there (another block, or a result already placed),
     it goes below instead, as far down as it takes to be clear */
  const taken = space.blocks.map(b => b.rect), hits = r => taken.some(t => t !== r && t.x < r.x + r.w && t.x + t.w > r.x && t.y < r.y + r.h && t.y + t.h > r.y);
  ps.forEach((piece, i) => { const r = results[i] ||= createResult({ unit: u }); view.world.prepend(r.el);
    const box = { x: piece.box.x * u, y: piece.box.y * u, w: piece.box.w * u, h: piece.box.h * u };
    let at = r.set(box, piece.type, 'right');
    for (let drop = 0; hits(at) && drop < 60; drop++) at = r.set(box, piece.type, 'below', drop);
    taken.push(at); });
  for (const r of results.slice(ps.length)) r.el.remove();
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
  if (e.key === 'Escape') return selected.size || !space.parent || boxing ? select([]) : out();      /* with nothing selected, Escape steps out of a definition space */
  /* s: drag a box; every block it touches is selected, with its group. Press s again to leave without selecting. */
  if (e.key === 's' || e.key === 'S'){
    if (boxing) return boxing.cancel();
    const box = boxing = boxSelect(view);
    return box.done.then(r => { boxing = null; if (!r) return;
      const hit = space.blocks.filter(b => b.rect.x < r.x + r.w && b.rect.x + b.rect.w > r.x && b.rect.y < r.y + r.h && b.rect.y + b.rect.h > r.y);
      select([...new Set(hit.flatMap(members))]); });
  }
  /* x, Backspace or Delete removes the selected blocks. (Typing in a name or a measurement never reaches here.) */
  if ((e.key === 'x' || e.key === 'X' || e.key === 'Backspace' || e.key === 'Delete') && selected.size){
    e.preventDefault(); const gone = [...selected]; select([]);
    for (const b of gone){ b.el.remove(); space.blocks.splice(space.blocks.indexOf(b), 1); spaceOf.delete(b); }
    ungroup(gone); shown();
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
    if (isOneGroup(list)) ungroup(list); else { ungroup(list); const id = nextGroup++; for (const b of list) space.groupOf.set(b, id); }
    return shown();
  }
  /* a measurement: double-click to type a size in whole units; the block keeps its top-left corner */
  if (measure) for (const dim of ['w', 'h']) if (el === measure.labels[dim]){
    const b = [...selected][0];
    if (twice) editText(el, text => { const n = Math.round(parseFloat(text)); if (n >= 1) b.set({ ...b.rect, [dim]: n * view.unit }); shown(); });
    return;                                     /* a click on a measurement never changes the selection */
  }
  const b = blockAt(el);
  if (b && twice){                              /* double click */
    if (el === b.nameEl){ select([b]); return b.rename(); }                 /* on a name: rename it */
    if (selected.size === 1 && selected.has(b)) return open(b);             /* on a block selected alone: open its definition space */
    return select([b]);                                                     /* on one of several: select just that block */
  }
  select(b ? members(b) : [], { toggle: !!b && e.shiftKey });
}

/* what choosing a shape from "New" does, by the shape's "draw" */
const draw = {
  rectangle: shape => { select([]); const name = freeName();
    return drawRectangle(view, rect => createBlock(shape, rect, name)).then(block => { if (block){ space.blocks.push(block); shown(); } }); },
};

const menu = createMenu([{ label: 'New', items: () => shapes.map(shape => ({ label: shape.label || shape.name, run: () => draw[shape.draw]?.(shape) })) }]);
const hud = createHud({ onHome: () => view.home() });
const crumbs = createCrumbs({ onGo: i => { deeper.length = 0; go(trail()[i]); } });
const view = createView({
  onChange: cam => { hud.show(cam); menu.close(); shown(); },
  onMenu: (x, y) => menu.openAt(x, y),
  onClick: clicked,
  onDrag: dragged,
});
document.body.append(view.el, menu.el, hud.el, crumbs.el);
hud.show(view.camera());
