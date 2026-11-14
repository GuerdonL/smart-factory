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
import { joins, pieces, typeOf, initials } from './algebra.js';

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
    space.definition = createDefinition({ cols: Math.round(r.w / view.unit), rows: Math.round(r.h / view.unit), unit: view.unit,
      letter: initials(space.owner.name), colsName: space.owner.sides.w, rowsName: space.owner.sides.h });
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

/* ---- named sides ----
   A side of a block (its width or its height) can be given a name, such as "context". Every side with the same name,
   on any block in any space, is the same length: change one and they all change. Two named sides multiply only if
   they carry the same name. */
const lengths = new Map();                     /* a name -> how many units long its sides are */
const everyBlock = () => [...top.blocks, ...[...spaceOf.values()].flatMap(s => s.blocks)];
/* after b's size has changed: its named sides give their new length to every side of the same name */
function agree(b){
  const u = view.unit;
  for (const dim of ['w', 'h']) if (b.sides[dim]) lengths.set(b.sides[dim], Math.max(1, Math.round(b.rect[dim] / u)));
  for (const o of everyBlock()){ let r = o.rect;
    for (const dim of ['w', 'h']) if (o.sides[dim] && r[dim] !== lengths.get(o.sides[dim]) * u) r = { ...r, [dim]: lengths.get(o.sides[dim]) * u };
    if (r !== o.rect) o.set(r); }
}
/* Runs change(), then puts back together whatever it pulled apart: blocks that were touching side by side, in any
   space, still touch afterwards, the right-hand one moving to stay against the left-hand one. A length that changes
   would otherwise leave products overlapping or gapped. except(left, right) can name pairs to leave alone. */
function keepTouching(change, except = () => false){
  const u = view.unit, pairs = [];
  for (const s of [top, ...spaceOf.values()]){
    const rects = s.blocks.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u }));
    for (const j of joins(rects)) if (!except(s.blocks[j.left], s.blocks[j.right])) pairs.push([s.blocks[j.left], s.blocks[j.right]]);
  }
  change();
  pairs.sort((a, b) => a[0].rect.x - b[0].rect.x);                       /* left to right, so a row shuffles along in order */
  for (const [left, right] of pairs) if (right.rect.x !== left.rect.x + left.rect.w) right.set({ ...right.rect, x: left.rect.x + left.rect.w });
}

/* what was typed into a measurement:  "8" a length;  "context" a name (the side takes that name's length, or gives it
   its own if the name is new);  "context 8" both;  "-" takes the name off. */
function typed(b, dim, text){ keepTouching(() => typedNow(b, dim, text)); }
function typedNow(b, dim, text){
  const m = text.match(/^(.*?)[\s=:]*(?:(\d+(?:\.\d+)?)\s*u?)?$/i), name = (m[1] || '').trim(), n = m[2] ? Math.round(parseFloat(m[2])) : null;
  if (name === '-'){ b.sides[dim] = null; if (n >= 1) b.set({ ...b.rect, [dim]: n * view.unit }); return; }
  if (name){ b.sides[dim] = name; if (n === null && lengths.has(name)) b.set({ ...b.rect, [dim]: lengths.get(name) * view.unit }); }
  if (n >= 1) b.set({ ...b.rect, [dim]: n * view.unit });
  agree(b);
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
  if (one){ measure ||= createMeasure(view.unit); view.world.append(measure.el); measure.set(one.rect, { ...sides(view, one.rect), wName: one.sides.w, hName: one.sides.h }); }
  else measure?.el.remove();
  if (list.length > 1){
    const x = Math.min(...list.map(b => b.rect.x)), y = Math.min(...list.map(b => b.rect.y));
    bounds.set({ x, y, w: Math.max(...list.map(b => b.rect.x + b.rect.w)) - x, h: Math.max(...list.map(b => b.rect.y + b.rect.h)) - y }, { grouped: isOneGroup(list) });
    view.world.append(bounds.el);
  } else bounds.el.remove();
  /* the algebra of what is here: a mark wherever two blocks touch and multiply, and whether it all comes to the promised size */
  const u = view.unit, rects = space.blocks.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u, wName: b.sides.w, hName: b.sides.h }));
  for (const j of marks) j.el.remove();
  marks = joins(rects).map(j => createJoin({ x: j.x * u, y: j.y * u, ok: j.ok, note: j.note }));
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
    r.piece = { blocks: piece.members.map(m => space.blocks[m]), type: piece.type, box };       /* what this result is the result of */
    const letter = piece.members.length === 1 ? initials(space.blocks[piece.members[0]].name) : 'x';      /* one block: its own initials; a product has no name yet */
    let at = r.set(box, piece.type, 'right', 0, letter);
    for (let drop = 0; hits(at) && drop < 60; drop++) at = r.set(box, piece.type, 'below', drop, letter);
    taken.push(at); });
  for (const r of results.slice(ps.length)) r.el.remove();
}
function select(list, { toggle = false } = {}){
  if (!toggle) selected.clear();
  const off = toggle && list.length && list.every(b => selected.has(b));
  for (const b of list) off ? selected.delete(b) : selected.add(b);
  shown();
}

/* ---- naming a result ----
   Click a result's matrix and give it a name: the blocks that came to it fold away into a new block of that name,
   the size of the result, in a bold colour picked at random. They become its definition: open it to find them on
   the left of its "=". */
const PALETTE = ['lavender', 'watermelon', 'lazuli', 'fanta', 'flamingo', 'marigold', 'lagoon'];      /* colours in the theme */
function fold({ blocks: inside, type, box }, name){
  const u = view.unit, used = new Set(space.blocks.map(b => b.shape.color));
  const free = PALETTE.filter(c => !used.has(c)), from = free.length ? free : PALETTE;                /* one this space is not using, while there is one */
  const made = createBlock({ label: 'Named', draw: 'rectangle', color: from[Math.floor(Math.random() * from.length)] },
    { x: box.x, y: box.y, w: type.cols * u, h: type.rows * u }, name);
  made.sides = { w: type.colsName, h: type.rowsName };                    /* its sides keep the names the result's sides had */
  /* its definition space: the folded blocks, moved so they end one unit left of the "=" and sit level with it */
  const def = newSpace(made, space); spaceOf.set(made, def);
  const dx = -u - (box.x + box.w), dy = Math.round(-box.h / 2 / u) * u - box.y;
  for (const b of inside){
    b.el.remove(); space.blocks.splice(space.blocks.indexOf(b), 1); space.groupOf.delete(b);
    b.set({ ...b.rect, x: b.rect.x + dx, y: b.rect.y + dy }); def.blocks.push(b);
    if (spaceOf.has(b)) spaceOf.get(b).parent = def;                                                 /* its own definition now hangs under the new one */
  }
  ungroup([]);                                 /* a group left with one member is no group */
  space.blocks.push(made); view.world.append(made.el);
  select([made]);
}

/* ---- copy and paste ----
   Copy takes a picture of the selected blocks as they are now: size, name, colour, side names, grouping, and each
   one's whole definition space, all the way down. Paste makes new blocks from that picture in the current space,
   centred on a point, and selects them. The picture stays, so it can be pasted again and again.
   This is the page's own clipboard, not the computer's: it does not survive a reload or reach another tab. */
let clipboard = null;
const picture = (b, s) => ({ shape: b.shape, rect: { ...b.rect }, name: b.name, sides: { ...b.sides }, group: s.groupOf.get(b) ?? null,
  inside: spaceOf.has(b) ? spaceOf.get(b).blocks.map(o => picture(o, spaceOf.get(b))) : null });
function copy(){ if (selected.size) clipboard = [...selected].map(b => picture(b, space)); }
/* makes the blocks in pictures inside space s, moved by (dx, dy); blocks that were grouped together are grouped together again */
function develop(pictures, s, dx, dy){
  const u = view.unit, groups = new Map(), made = [];
  for (const pic of pictures){
    const r = { ...pic.rect, x: pic.rect.x + dx, y: pic.rect.y + dy };
    for (const dim of ['w', 'h']) if (pic.sides[dim] && lengths.has(pic.sides[dim])) r[dim] = lengths.get(pic.sides[dim]) * u;      /* a named side is whatever length that name is now */
    const name = s === space && /^Shape \d+$/.test(pic.name) ? freeName() : pic.name;      /* a block never given a name of its own gets a fresh number */
    const b = createBlock(pic.shape, r, name); b.sides = { ...pic.sides };
    s.blocks.push(b); made.push(b);
    if (pic.group !== null){ if (!groups.has(pic.group)) groups.set(pic.group, nextGroup++); s.groupOf.set(b, groups.get(pic.group)); }
    if (pic.inside){ const def = newSpace(b, s); spaceOf.set(b, def); develop(pic.inside, def, 0, 0); }
  }
  return made;
}
function paste(at){                             /* at: a world point; the pasted blocks are centred on it, on the dots */
  if (!clipboard) return;
  const u = view.unit, rs = clipboard.map(p => p.rect), x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y));
  const cx = (x0 + Math.max(...rs.map(r => r.x + r.w))) / 2, cy = (y0 + Math.max(...rs.map(r => r.y + r.h))) / 2;
  let dx = Math.round((at.x - cx) / u) * u, dy = Math.round((at.y - cy) / u) * u;
  /* pasting twice in one place would hide one copy exactly behind the other: step down and right until it would not */
  while (space.blocks.some(b => clipboard.some(p => b.rect.x === p.rect.x + dx && b.rect.y === p.rect.y + dy))){ dx += u; dy += u; }
  const made = develop(clipboard, space, dx, dy);
  view.world.append(...made.map(b => b.el));
  select(made);
}

/* removes the selected blocks, and with each its definition space */
function remove(){
  const gone = [...selected]; select([]);
  for (const b of gone){ b.el.remove(); space.blocks.splice(space.blocks.indexOf(b), 1); spaceOf.delete(b); }
  ungroup(gone); shown();
}

/* ---- keys ---- */
let boxing = null;                             /* the box selection in progress, if any */
addEventListener('keydown', e => {
  /* Ctrl or Cmd with c copies the selection; with v pastes in the middle of the screen. (While typing in a name or a
     measurement these keys never reach here, so text is copied and pasted as usual.) */
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'c' || e.key === 'C')){ if (selected.size){ e.preventDefault(); copy(); } return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'v' || e.key === 'V')){ if (clipboard){ e.preventDefault(); paste(view.camera()); } return; }
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
  if ((e.key === 'x' || e.key === 'X' || e.key === 'Backspace' || e.key === 'Delete') && selected.size){ e.preventDefault(); remove(); }
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
      /* what touches its right side follows that side; pulling its own left side away from a neighbour is allowed */
      keepTouching(() => { b.set({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); agree(b); }, (left, right) => right === b || (left === b && !grip.includes('e') && !b.sides.w));
      shown(); } };
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
  /* a result's matrix: name it, and the blocks that came to it fold into a new block */
  const r = results.find(r => r.el.isConnected && r.el.contains(el));
  if (r){ const piece = r.piece; select([]); return r.name(name => { if (name && !piece.type.error && piece.blocks.every(b => space.blocks.includes(b))) fold(piece, name); }); }
  /* a measurement: double-click to type a length in whole units, a name for that side, or both; the block keeps its top-left corner */
  if (measure) for (const dim of ['w', 'h']) if (el === measure.labels[dim]){
    const b = [...selected][0];
    if (twice) editText(el, text => { if (text) typed(b, dim, text); shown(); });
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

/* the right-click menu. A right click on a block that is not selected selects it first, so Copy and Delete mean that block.
   Paste puts the copy where the click was. */
let menuAt = { x: 0, y: 0 };
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl ';
const menu = createMenu([
  { label: 'New', items: () => shapes.map(shape => ({ label: shape.label || shape.name, run: () => draw[shape.draw]?.(shape) })) },
  { label: 'Copy', hint: mod + 'C', disabled: () => !selected.size, run: copy },
  { label: 'Paste', hint: mod + 'V', disabled: () => !clipboard, run: () => paste(menuAt) },
  { label: 'Delete', hint: 'X', disabled: () => !selected.size, run: remove },
]);
const hud = createHud({ onHome: () => view.home() });
const crumbs = createCrumbs({ onGo: i => { deeper.length = 0; go(trail()[i]); } });
const view = createView({
  onChange: cam => { hud.show(cam); menu.close(); shown(); },
  onMenu: (x, y, el) => { const b = blockAt(el); if (b && !selected.has(b)) select(members(b));
    menuAt = view.toWorld(x, y); menu.openAt(x, y); },
  onClick: clicked,
  onDrag: dragged,
});
document.body.append(view.el, menu.el, hud.el, crumbs.el);
hud.show(view.camera());
