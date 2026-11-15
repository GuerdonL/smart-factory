/* The page: makes the components and connects them. Components never reach into each other;
   anything one needs from another passes through here. */
import { editText } from './components/dom.js';
import { createView } from './components/view.js';
import { createMenu } from './components/menu.js';
import { createHud } from './components/hud.js';
import { createBlock } from './components/block.js';
import { createMeasure, sides } from './components/measure.js';
import { createBounds, createBackdrop } from './components/bounds.js';
import { drawRectangle } from './components/draw.js';
import { boxSelect } from './components/marquee.js';
import { createDefinition } from './components/definition.js';
import { createCrumbs } from './components/crumbs.js';
import { createVariables } from './components/variables.js';
import { createJoin } from './components/join.js';
import { createResult } from './components/result.js';
import { joins, pieces, stacks, typeOf, initials, readEntry } from './algebra.js';
import { createEquals } from './components/equals.js';
import * as project from './project.js';
import { createBus } from './bus.js';
import { createIds } from './ids.js';
import { createHistory } from './history.js';
import { SYSTEM, SLOTS, OLD, CONFIG, COLORS, DARK, DARK_DOWN, isColour, leaf } from './system.js';
import { zip, unzip } from './zip.js';
import { written, squares } from './components/matrix.js';

/* everything the user does takes effect as a message on the bus (bus.js); what each message does is set out under
   "messages", near the end. Blocks are named in messages by their ids. */
const bus = createBus(); globalThis.smartFactoryBus = bus;      /* on the page as smartFactoryBus, to look at its log */
const everyKnown = () => { const out = [], add = b => { out.push(b); for (const m of b.members || []) add(m.block); }; for (const s of everySpace()) s.blocks.forEach(add); return out; };      /* every block, those joined into others included */
const blockOf = id => space.blocks.find(b => b.id === id) || (space.owner?.id === id ? space.owner : everyKnown().find(b => b.id === id));
const idsOf = list => [...list].map(b => b.id);
const pick = (list, toggle = false) => bus.send('select', { ids: idsOf(list), toggle });


/* the shapes registry: shapes/index.json names the configs in shapes/ */
let shapes = [];
fetch('shapes/index.json').then(r => r.json())
  .then(names => Promise.all(names.map(name => fetch(`shapes/${name}.json`).then(r => r.json()).then(shape => ({ name, ...shape })))))
  .then(list => { shapes = list; }).catch(() => {});

/* ---- spaces ----
   A space is one canvas-full of blocks. There is one space at the top, the Menu, which is where the page opens.
   Every block has a definition space of its own, made the first time it is opened: a canvas showing an equation,
   with the block as a variable in matrix notation on the right and what the shapes in the space come to on the left.
   What is put in the space must come to the block's promised size (w units across, h units down). The Menu has no
   promise, so it writes "=" and what each piece of touching shapes comes to beside that piece.
   Only the current space's blocks are on the canvas. */
const newSpace = (owner, parent) => ({ owner, parent, blocks: [], groupOf: new Map(), groupUp: new Map(), groupNames: new Map(), frames: new Map(), camera: { x: 0, y: 0, zoom: 1 }, definition: null });
const top = newSpace(null, null);              /* the Menu */
const spaceOf = new Map();                     /* block -> its definition space */
let space = top;
const trail = () => { const t = []; for (let s = space; s; s = s.parent) t.unshift(s); return t; };
function go(to){
  select([]); space.camera = view.camera();
  for (const b of space.blocks) b.el.remove(); space.definition?.el.remove(); for (const f of space.frames.values()) f.el.remove();
  space = to;
  view.world.append(...space.blocks.map(b => b.el));
  write();
  view.origin.hidden = !!space.owner;          /* a definition space has its equals sign at the origin */
  view.look(space.camera);
  crumbs.show(trail().map(s => s.owner ? s.owner.name : 'Menu'));
}
/* writes out the current space's equation: afresh each time it is opened, so it follows its block's size, and again
   whenever one of the block's entries is given a number */
function write(){
  space.definition?.el.remove(); space.definition = null;
  if (!space.owner) return;
  flow(space.owner);
  const o = space.owner, r = o.rect;
  space.definition = createDefinition({ cols: Math.round(r.w / view.unit), rows: Math.round(r.h / view.unit), unit: view.unit,
    name: o.name, letter: initials(o.name), color: isNamed(o) ? o.shape.color : null, values: valuesOf(o), inherited: inheritedBy(o, space.parent), editable: isNamed(o),      /* a named block's matrix is written in its colour */
    colsName: o.sides.w, rowsName: o.sides.h, tiles: tileLook(o) });
  space.definition.tiled = JSON.stringify(tileLook(o));
  view.world.prepend(space.definition.el);     /* beneath the blocks */
}
/* opening a block: its definition space is made the first time (one space for every place the variable is used),
   and is entered from here, by this block */
function open(b){
  if (!spaceOf.has(b)){ const def = newSpace(b, space); for (const k of kinOf(b)) spaceOf.set(k, def); }
  const def = spaceOf.get(b);
  if (trail().includes(def)) return;           /* already inside it */
  def.owner = b; def.parent = space; deeper.length = 0; go(def);
}
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
  if (type === 'mouseup') bus.send(e.button === 3 ? 'space.out' : 'space.back');
}, true);

/* a block is named once it has been given a name of its own, in place of the "Shape n" it was drawn with.
   Naming a block gives it a colour (never the red of an unnamed one), and only a named block's entries can be given numbers. */
/* A block whose name begins with // is commented out: it stays on the canvas, and can be moved, resized and opened,
   but it takes no part in anything. It does not multiply, has no result, and does not count towards a definition. */
const isOff = b => /^\s*\/\//.test(b.name);
const bare = name => name.replace(/^\s*\/\/\s*/, '');                  /* a name without its comment mark */
const isNamed = b => !/^Shape \d+$/.test(bare(b.name));
const PALETTE = SLOTS;                          /* the six places a named shape's colour is kept; what colour each is, is .variable_colors' to say (system.js) */
function someColour(not){                        /* one this space is not using, while there is one; never the one it has */
  const used = new Set(space.blocks.map(b => b.shape.color)), free = PALETTE.filter(c => !used.has(c) && c !== not);
  const from = free.length ? free : PALETTE.filter(c => c !== not);
  return from[Math.floor(ids.random() * from.length)];
}
function renamed(b, color){                        /* color: the new colour that comes with a new name, if it is one */
  if (color) b.paint(color);
  for (const k of kinOf(b)) if (k !== b){ k.call(b.name); k.paint(b.shape.color); }      /* one variable, one name and colour, wherever it is used */
  shown(); }

/* ---- variables ----
   A named shape is a variable. Dragged in from the list at the screen's right edge, it is the same variable used in
   another place: every use has the one name, colour, size, set of entries and definition, and changing any of them
   through one use changes them all. A named side length is a variable too: see "named sides" below.
   A variable is in reach in the space where its highest use sits and in every space beneath that one: at the top
   level it is in reach everywhere. The list shows what is in reach of the current space, along the way you came. */
const kin = new Map();                         /* block -> the set of blocks that are uses of its variable (itself included), once it has more than one */
const kinOf = b => kin.get(b) || [b];
/* What is in reach, for the list at the right edge: { main, hidden }, each a list of items.
   A named frame is a variable: dragged from the list, all of it is made again where it is dropped. What is named
   inside a named frame is listed under that frame, out of sight until the frame is opened, and nowhere else: it is an
   attribute of the frame. (A frame is no scope: its shapes share the space's variables with everything else there.)
   A dotted name is a hidden variable, kept behind the plus, along with everything under a dotted frame.
   Of several definitions of one name in different spaces, the lowest is the one in reach: it shadows the others. */
function inReach(){
  const spaces = trail(), main = [], hidden = [], seen = new Set(), names = new Set(), lengths = [], shapes = [];
  spaces.forEach((s, depth) => { const nodes = new Map();
    const named = g => { for (; g !== undefined; g = s.groupUp.get(g)) if (s.groupNames.has(g)) return g; };      /* the nearest named frame, from g outwards */
    const node = g => { if (!nodes.has(g)){ const up = named(s.groupUp.get(g)), name = s.groupNames.get(g);
        const n = { kind: 'frame', name, id: g, key: depth + ':' + g, color: 'muted', cols: 3, rows: 2, children: [] }; nodes.set(g, n);
        (up === undefined ? (isHidden(name) ? hidden : main) : node(up).children).push(n); }
      return nodes.get(g); };
    for (const g of s.groupNames.keys()) node(g);
    for (const b of s.blocks){
      if (isNamed(b) && !isOff(b) && !seen.has(b) && !spaces.includes(spaceOf.get(b))){       /* not the one whose definition we are standing in */
        for (const k of kinOf(b)) seen.add(k);
        const up = named(s.groupOf.get(b)), item = { kind: 'shape', name: b.name, color: b.shape.color, cols: b.rect.w / view.unit, rows: b.rect.h / view.unit, block: b, depth };
        shapes.push([item, up === undefined ? (isHidden(b.name) ? hidden : main) : node(up).children]); }
      for (const dim of ['w', 'h']) if (b.sides[dim] && !names.has(b.sides[dim])){ names.add(b.sides[dim]); lengths.push({ kind: 'length', name: b.sides[dim], units: b.rect[dim] / view.unit }); }
    } });
  const lowest = new Map(); for (const [i] of shapes) lowest.set(bare(i.name).trim(), Math.max(i.depth, lowest.get(bare(i.name).trim()) ?? 0));
  for (const [i, into] of shapes) if (lowest.get(bare(i.name).trim()) === i.depth) into.push(i);
  const told = new Set(), tell = list => { for (const i of list){ told.add(i.name); if (i.children) tell(i.children); } }; tell(hidden);
  return { main: [...main, ...lengths], hidden: [...systemItems().filter(i => !told.has(i.name)), ...hidden] };      /* the program's own, where the project has none of that name */
}
const systemItems = () => [{ kind: 'system', name: CONFIG, group: true, color: 'muted', cols: 3, rows: 3 }, { kind: 'system', name: COLORS, group: true, color: 'muted', cols: 3, rows: 2 }, { kind: 'system', name: DARK, group: true, color: 'muted', cols: 3, rows: 2 },
  ...SYSTEM.map(v => ({ kind: 'system', name: v.name, key: v.key, color: v.css || v.color, cols: v.cols, rows: v.rows || 1 }))];
/* another use of a shape variable, centred on a world point */
function useShape(of, at){
  const u = view.unit, on = v => Math.round(v / u) * u, r = of.rect;
  const b = makeBlock({ ...of.shape }, { x: on(at.x - r.w / 2), y: on(at.y - r.h / 2), w: r.w, h: r.h }, of.name);
  b.sides = { ...of.sides }; b.values = of.values; if (of.members) b.members = of.members;                                         /* the same entries, not a copy */
  if (!spaceOf.has(of)){ const def = newSpace(of, space); for (const k of kinOf(of)) spaceOf.set(k, def); }
  spaceOf.set(b, spaceOf.get(of));                                                          /* the same definition */
  const set = kin.get(of) || new Set([of]); set.add(b); for (const k of set) kin.set(k, set);
  space.blocks.push(b); view.world.append(b.el); select([b]);
}
/* ---- shapes standing in a matrix ----
   A variable dragged from the list onto a shape's matrix (the "= [...]" beside it in the Menu, or the right-hand side
   in its definition space) goes into the matrix, where it was dropped, in place of the entries it covers. It must be
   as wide as the matrix or as tall, so vectors can be loaded in one at a time; the entries not yet covered stay as
   they were. The first one put in replaces whatever was in the receiving shape's definition space. From then on that
   space holds the shapes standing in the matrix, each marked as a tile and lying where it stands: the place where the
   equation's left side is written is the matrix, entry for unit. Once the tiles cover every entry, the receiving
   shape's entries are theirs, as if they had been joined. */
const slotOf = b => ({ x: -view.unit - b.rect.w, y: Math.round(-b.rect.h / 2 / view.unit) * view.unit });      /* where the left side of b's equation is written, in b's definition space */
/* the shapes standing in b's matrix: [{ block, x, y, w, h }] in entries, or null if its definition space is not just such shapes */
function tilesOf(b){
  const def = spaceOf.get(b), u = view.unit; if (!def) return null;
  const act = def.blocks.filter(t => !isOff(t) && !inConfig(t, def)), slot = slotOf(b), cols = Math.round(b.rect.w / u), rows = Math.round(b.rect.h / u), out = [];
  if (!act.length) return null;
  for (const t of act){ const x = (t.rect.x - slot.x) / u, y = (t.rect.y - slot.y) / u, w = t.rect.w / u, h = t.rect.h / u;
    if (!t.tile || x % 1 || y % 1 || x < 0 || y < 0 || x + w > cols || y + h > rows || (w !== cols && h !== rows)) return null;
    if (out.some(o => x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h)) return null;
    out.push({ block: t, x, y, w, h }); }
  return out;
}
const tileLook = b => (tilesOf(b) || []).map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h, color: t.block.shape.color, name: t.block.name, id: t.block.id }));
/* ---- the algebra of a space ----
   algebraIn(s): the blocks of s that take part, their rectangles in units, and the pieces they make (products, stacks,
   and shapes on their own).
   pairsIn(s): the assertions written in s by setting a piece beside a shape. A shape (one on its own, or one in a
   .config) with a piece to its right, level with it, of its own size, one to four units away with nothing between,
   is asserted equal to that piece: block -> { piece, blocks, x, y }, x and y being the middle of the gap. */
function algebraIn(s){
  const u = view.unit, active = s.owner && tilesOf(s.owner) ? [] : s.blocks.filter(b => !isOff(b));      /* shapes standing in the block's matrix are entries, not a product; commented-out blocks take no part */
  const rects = active.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u, wName: b.sides.w, hName: b.sides.h }));
  return { active, rects, all: stacks(rects, pieces(rects)) };
}
function pairsIn(s, { active, all } = algebraIn(s)){
  const u = view.unit, out = new Map(), every = s.blocks.map(b => b.rect);
  const lefts = [...all.filter(p => p.members.length === 1 && !p.type.error).map(p => active[p.members[0]]), ...s.blocks.filter(b => !isOff(b) && inConfig(b, s))];
  for (const b of lefts){ const l = { x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u };
    for (const p of all){ if (p.type.error || (p.members.length === 1 && active[p.members[0]] === b)) continue;
      const gap = p.box.x - l.x - l.w;
      if (p.box.y !== l.y || p.box.h !== l.h || p.type.cols !== l.w || p.type.rows !== l.h || gap < 1 || gap > 4) continue;
      const strip = { x: (l.x + l.w) * u, y: l.y * u, w: gap * u, h: l.h * u };
      if (every.some(r => r.x < strip.x + strip.w && strip.x < r.x + r.w && r.y < strip.y + strip.h && strip.y < r.y + r.h)) continue;
      out.set(b, { piece: p, blocks: p.members.map(m => active[m]), x: strip.x + strip.w / 2, y: strip.y + strip.h / 2 }); break; } }
  return out;
}
/* the entries of a piece a shape is asserted equal to: a shape's own; a stack's, row under row; a product's are not worked out */
function pieceValues({ piece, blocks }, depth){
  if (blocks.length === 1) return valuesOf(blocks[0], depth);
  if (!piece.stack) return null;
  const all = new Map(), u = view.unit; let down = 0;
  for (const b of blocks){ for (const [k, v] of valuesOf(b, depth)){ const [c, r] = k.split(',').map(Number); all.set(c + ',' + (r + down), v); } down += Math.round(b.rect.h / u); }
  return all;
}
/* a block's entries: its own; or, once shapes standing in its matrix cover all of it, theirs; or, where it is asserted
   equal to a piece beside it, that piece's, under any of its own */
function valuesOf(b, depth = 0){
  const tiles = depth < 8 && tilesOf(b), u = view.unit;
  if (!tiles || tiles.reduce((sum, t) => sum + t.w * t.h, 0) !== Math.round(b.rect.w / u) * Math.round(b.rect.h / u)){
    const s = depth < 8 && spaceWith(b), pair = s && pairsIn(s).get(b), from = pair && pieceValues(pair, depth + 1);
    return from ? new Map([...from, ...b.values]) : b.values; }
  const all = new Map();
  for (const t of tiles) for (const [k, v] of valuesOf(t.block, depth + 1)){ const [c, r] = k.split(',').map(Number); if (c <= t.w && r <= t.h) all.set((c + t.x) + ',' + (r + t.y), v); }
  return all;
}
function matrixAt(x, y){
  const hit = el => { const r = el?.getBoundingClientRect(); return r && x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6; };
  if (space.owner){ const el = space.definition?.el.querySelector('.promised'); return hit(el) ? { block: space.owner, el } : null; }
  const r = results.find(r => r.el.isConnected && !r.el.hidden && r.piece?.blocks.length === 1 && hit(r.el.querySelector('.result-body.matrix')));
  return r ? { block: r.piece.blocks[0], el: r.el.querySelector('.result-body') } : null;
}
function slotIn(a, v, cx, cy){                    /* cx, cy: where in the matrix the pointer was, in entries from its top-left corner */
  const u = view.unit, home = a === space.owner ? space.parent : space, cols = Math.round(a.rect.w / u), rows = Math.round(a.rect.h / u), w = Math.round(v.rect.w / u), h = Math.round(v.rect.h / u);
  if (kinOf(a).includes(v)) return hud.say('A shape cannot go into its own matrix');
  if (w > cols || h > rows || (w !== cols && h !== rows)) return hud.say(`${bare(v.name)} is neither as wide nor as tall as ${bare(a.name)}`);
  if (!spaceOf.has(a)){ const def = newSpace(a, home); for (const k of kinOf(a)) spaceOf.set(k, def); }
  if (!spaceOf.has(v)){ const def = newSpace(v, space); for (const k of kinOf(v)) spaceOf.set(k, def); }
  const def = spaceOf.get(a);
  if (def === spaceOf.get(v)) return hud.say('A shape cannot go into its own matrix');
  const out = b => { b.el.remove(); def.blocks.splice(def.blocks.indexOf(b), 1); def.groupOf.delete(b); forget(b); };
  let tiles = tilesOf(a);
  if (!tiles){ for (const b of [...def.blocks]) out(b); tiles = [];      /* the first shape in: whatever was in its definition goes */
    def.groupUp.clear(); def.groupNames.clear(); for (const f of def.frames.values()) f.el.remove(); def.frames.clear(); }
  /* where it was dropped; if that is taken, the nearest free place; if there is none, it takes the place of what is there */
  const wantX = Math.max(0, Math.min(cols - w, Math.round(cx - w / 2))), wantY = Math.max(0, Math.min(rows - h, Math.round(cy - h / 2)));
  const over = (X, Y) => tiles.filter(t => X < t.x + t.w && t.x < X + w && Y < t.y + t.h && t.y < Y + h);
  let best = null;
  for (let X = 0; X <= cols - w; X++) for (let Y = 0; Y <= rows - h; Y++) if (!over(X, Y).length){ const d = Math.abs(X - wantX) + Math.abs(Y - wantY); if (!best || d < best[2]) best = [X, Y, d]; }
  const [X, Y] = best || [wantX, wantY];
  for (const t of over(X, Y)) out(t.block);
  const slot = slotOf(a), use = makeBlock({ ...v.shape }, { x: slot.x + X * u, y: slot.y + Y * u, w: v.rect.w, h: v.rect.h }, v.name);
  use.sides = { ...v.sides }; use.values = v.values; use.tile = true; if (v.members) use.members = v.members; spaceOf.set(use, spaceOf.get(v));
  const set = kin.get(v) || new Set([v]); set.add(use); for (const k of set) kin.set(k, set);
  def.blocks.push(use); if (def === space) view.world.append(use.el);
  select([]); shown();
  const left = cols * rows - (tilesOf(a) || []).reduce((sum, t) => sum + t.w * t.h, 0);
  hud.say(left ? `${bare(v.name)} is in ${bare(a.name)}: ${left} ${left === 1 ? 'entry' : 'entries'} still open` : `${bare(a.name)} is filled`);
}
/* a side-length variable dragged over the canvas: the blocks near the pointer show their measurements, and the line
   nearest the pointer, if it is close, is where the length will land */
const near = new Map();                        /* block -> the measurements shown for it while a length is dragged */
function reach(x, y){
  let best = null;
  const within = space.blocks.filter(b => { const a = view.toScreen(b.rect.x, b.rect.y), z = view.toScreen(b.rect.x + b.rect.w, b.rect.y + b.rect.h);
    return x > a.x - 110 && x < z.x + 110 && y > a.y - 110 && y < z.y + 110; });
  for (const [b, m] of near) if (!within.includes(b)){ m.el.remove(); near.delete(b); }
  for (const b of within){
    if (!near.has(b)){ near.set(b, createMeasure(view.unit)); view.world.append(near.get(b).el); }
    const s = sides(view, b.rect), a = view.toScreen(b.rect.x, b.rect.y), z = view.toScreen(b.rect.x + b.rect.w, b.rect.y + b.rect.h);
    near.get(b).set(b.rect, { ...s, wName: b.sides.w, hName: b.sides.h }); near.get(b).mark(null);
    /* where the two lines are drawn on screen (measure.js: a 14px gap, then an 11px line) */
    const wy = s.top ? a.y - 2.4 * 14 - 5.5 : z.y + 14 + 5.5, hx = s.right ? z.x + 14 + 5.5 : a.x - 14 - 5.5;
    const dw = Math.hypot(Math.max(a.x - x, 0, x - z.x), y - wy), dh = Math.hypot(x - hx, Math.max(a.y - y, 0, y - z.y));
    for (const [dim, d] of [['w', dw], ['h', dh]]) if (d < 24 && (!best || d < best.d)) best = { b, dim, d };
  }
  if (best) near.get(best.b).mark(best.dim);
  return best;
}
const variables = createVariables({
  onDrag: (item, x, y) => bus.send('variable.drag', { kind: item.kind, x, y }),
  /* what a drop amounts to: a shape into a matrix, or onto the canvas as another use; a system variable into this
     space's .config; a length onto a side, or onto the canvas as a vector that long */
  onDrop: (item, x, y) => { const at = view.toWorld(x, y);
    if (item.kind === 'shape'){ const onto = matrixAt(x, y); if (!onto) return bus.send('use', { id: item.block.id, at });
      const r = onto.el.getBoundingClientRect(), u = view.unit, cols = Math.round(onto.block.rect.w / u), rows = Math.round(onto.block.rect.h / u), whole = cols <= 8 && rows <= 8;      /* a longer matrix is written with its middle left out, so the pointer cannot say where */
      return bus.send('slot', { into: onto.block.id, id: item.block.id, cx: whole ? (x - r.left) / (r.width / cols) : 0, cy: whole ? (y - r.top) / (r.height / rows) : 0 }); }
    if (item.kind === 'system') return bus.send('summon', { name: item.name, key: item.key || null, group: !!item.group, at });
    if (item.kind === 'frame') return bus.send('replicate', { frame: item.id, at });
    const target = reach(x, y);
    return target ? bus.send('side.set', { id: target.b.id, dim: target.dim, text: item.name }) : bus.send('length.add', { name: item.name, units: item.units, at }); },
  onEnd: () => bus.send('variable.end'),
});

const blockAt = el => space.blocks.find(b => b.el.contains(el));
/* a new block is "Shape n", with the lowest n no block in this space is using */
function freeName(){
  const used = new Set(space.blocks.map(b => b.name));
  for (let n = 1; ; n++) if (!used.has('Shape ' + n)) return 'Shape ' + n;
}

/* ---- named sides ----
   A side of a block (its width or its height) can be given a name, such as "context". A name belongs to a space: the
   highest space, above a side or the side's own, that has a side of that name. Every side of that name in that space
   and in the spaces beneath it is the same length: change one and they all change. So a name used at the top level
   is one length everywhere, while the same name used in two spaces that are not above one another is two separate
   lengths. Two named sides multiply only if they carry the same name. */
const everySpace = () => [...new Set([top, ...spaceOf.values()])];
const everyBlock = () => everySpace().flatMap(s => s.blocks);
const spaceWith = b => everySpace().find(s => s.blocks.includes(b));
const uses = (s, name) => s.blocks.some(b => b.sides.w === name || b.sides.h === name);
/* s and every space above it: the spaces holding a block whose definition s is, and so on up */
function above(s){
  const seen = new Set([s]), todo = [s];
  while (todo.length){ const t = todo.pop(); for (const p of everySpace()) if (!seen.has(p) && p.blocks.some(b => spaceOf.get(b) === t)){ seen.add(p); todo.push(p); } }
  return seen;
}
/* the space a name belongs to, as seen from s: the highest space at or above s with a side of that name; s itself if there is none yet */
function homeOf(name, s){
  const having = [...above(s)].filter(t => uses(t, name));
  return having.find(t => ![...above(t)].some(a => a !== t && having.includes(a))) || s;
}
/* every side that is the same length as a side called name in s: [block, 'w' or 'h', the block's space] */
function sidesCalled(name, s){
  const home = homeOf(name, s), out = [];
  for (const t of everySpace()) if (uses(t, name) && homeOf(name, t) === home) for (const b of t.blocks) for (const dim of ['w', 'h']) if (b.sides[dim] === name) out.push([b, dim, t]);
  return out;
}
/* the length a side called name has in s already, if one at or above s carries it; otherwise undefined */
function lengthCalled(name, s, not = null){
  const here = above(s), from = sidesCalled(name, s).find(([o, , t]) => o !== not && here.has(t));
  return from && from[0].rect[from[1]];
}
/* after b's size has changed: every other use of its variable takes its size, and every side that shares a name
   with one of its sides takes that side's length; then the same for whatever those changed, until nothing moves */
function agree(b){
  const todo = [b], done = new Set();
  while (todo.length){
    const c = todo.pop(); if (done.has(c)) continue; done.add(c);
    for (const k of kinOf(c)) if (k !== c){ k.sides = { ...c.sides }; if (k.rect.w !== c.rect.w || k.rect.h !== c.rect.h){ k.set({ ...k.rect, w: c.rect.w, h: c.rect.h }); todo.push(k); } }      /* one variable, one size */
    const s = spaceWith(c); if (!s) continue;
    for (const dim of ['w', 'h']) if (c.sides[dim]) for (const [o, d] of sidesCalled(c.sides[dim], s)) if (o.rect[d] !== c.rect[dim]){ o.set({ ...o.rect, [d]: c.rect[dim] }); done.delete(o); todo.push(o); }
  }
}
/* Runs change(), then puts back together whatever it pulled apart: blocks that were touching side by side, in any
   space, still touch afterwards, the right-hand one moving to stay against the left-hand one. A length that changes
   would otherwise leave products overlapping or gapped. except(left, right) can name pairs to leave alone. */
function keepTouching(change, except = () => false){
  const u = view.unit, pairs = [];
  for (const s of everySpace()){
    const live = s.blocks.filter(b => !isOff(b)), rects = live.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u }));
    for (const j of joins(rects)) if (!except(live[j.left], live[j.right])) pairs.push([live[j.left], live[j.right]]);
  }
  change();
  pairs.sort((a, b) => a[0].rect.x - b[0].rect.x);                       /* left to right, so a row shuffles along in order */
  for (const [left, right] of pairs) if (right.rect.x !== left.rect.x + left.rect.w) right.set({ ...right.rect, x: left.rect.x + left.rect.w });
}

/* what was typed into a measurement:  "8" a length;  "context" a name (the side takes the length that name has here or
   above; if the name is new here, the side gives it its own length, and any sides of that name below follow);
   "context 8" both;  "-" takes the name off. */
function typed(b, dim, text){ keepTouching(() => typedNow(b, dim, text)); }
function typedNow(b, dim, text){
  const m = text.match(/^(.*?)[\s=:]*(?:(\d+(?:\.\d+)?)\s*u?)?$/i), name = (m[1] || '').trim(), n = m[2] ? Math.round(parseFloat(m[2])) : null;
  if (name === '-'){ b.sides[dim] = null; if (n >= 1) b.set({ ...b.rect, [dim]: n * view.unit }); return; }
  if (name){ b.sides[dim] = null; const has = lengthCalled(name, space, null);      /* the length the name already has here or above, looked up before this side joins it */
    b.sides[dim] = name; if (n === null && has !== undefined) b.set({ ...b.rect, [dim]: has }); }
  if (n >= 1) b.set({ ...b.rect, [dim]: n * view.unit });
  agree(b);
}

/* ---- groups: blocks that are selected together ----
   A group holds blocks and other groups. A block sits directly in at most one group, and that group may sit in
   another, and so on outwards. Clicking a block selects the outermost group it is in; each double click steps one
   group inwards, down to the block itself.
   A group can be given a name. A named group keeps a solid frame and its name on the canvas whether or not it is
   selected. It behaves as one named thing, but its blocks stay where they are, in this space, and can still be
   worked on directly; folding it is what moves them into a block of their own. */
/* a project's ids and its chance come from one seeded source (ids.js), kept with the project: a group's id is the same
   group whenever the project is opened, and the same messages make the same ids and pick the same colours */
let ids = createIds();
const newGroup = () => ids.id('g');
/* a block that is to be part of the project: made, and given its id. (A sketch while drawing, or a picture of a block
   in an equation, is made with createBlock and has none.) */
const makeBlock = (shape, rect, name) => Object.assign(createBlock(shape, rect, name), { id: ids.id('b') });
/* the groups b is in, innermost first */
const chain = (b, s = space) => { const out = []; for (let g = s.groupOf.get(b); g !== undefined; g = s.groupUp.get(g)) out.push(g); return out; };
const inGroup = (g, s = space) => s.blocks.filter(b => chain(b, s).includes(g));
const members = b => { const c = chain(b); return c.length ? inGroup(c[c.length - 1]) : [b]; };      /* everything in b's outermost group */
/* the group whose blocks are exactly these, or null */
const groupIs = list => { if (list.length < 2) return null;
  for (const g of chain(list[0])){ const m = inGroup(g); if (m.length === list.length && m.every(b => list.includes(b))) return g; }
  return null; };
/* makes these blocks one group. Groups lying wholly among them go in as they are, as groups within the new one;
   the new group itself sits in whatever group already held all of them. */
function group(list){
  const g = newGroup(), done = new Set();
  const holder = chain(list[0]).find(c => list.every(b => chain(b).includes(c)));      /* the innermost group holding them all, if any */
  for (const b of list){ if (done.has(b)) continue;
    let unit = null; for (const c of chain(b)){ if (c === holder) break; if (inGroup(c).every(x => list.includes(x))) unit = c; }      /* the largest group, with b in it, wholly inside the list */
    if (unit === null){ space.groupOf.set(b, g); done.add(b); }
    else { for (const x of inGroup(unit)) done.add(x); space.groupUp.set(unit, g); } }
  if (holder !== undefined) space.groupUp.set(g, holder);
  tidy();
}
/* takes one group apart: what was directly in it is now directly in the group that held it, or in none */
function ungroup(g, s = space){
  const up = s.groupUp.get(g);
  for (const [b, at] of s.groupOf) if (at === g) up === undefined ? s.groupOf.delete(b) : s.groupOf.set(b, up);
  for (const [c, at] of s.groupUp) if (at === g) up === undefined ? s.groupUp.delete(c) : s.groupUp.set(c, up);
  s.groupUp.delete(g); s.groupNames.delete(g);
}
/* after blocks have left: an unnamed group with fewer than two things in it is no group, nor a named one with nothing, and a group that is gone keeps no name */
function tidy(s = space){
  for (const b of [...s.groupOf.keys()]) if (!s.blocks.includes(b)) s.groupOf.delete(b);
  for (let again = true; again;){ again = false;
    const ids = new Set([...s.groupOf.values(), ...s.groupUp.keys(), ...s.groupUp.values()]);
    for (const g of ids){ const holds = [...s.groupOf.values()].filter(at => at === g).length + [...s.groupUp.values()].filter(at => at === g).length;
      if (holds < 1){ ungroup(g, s); again = true; break; } } }      /* a frame may hold a single thing; an empty one is no frame */
  const live = new Set([...s.groupOf.values(), ...s.groupUp.values()]);
  for (const id of [...s.groupNames.keys()]) if (!live.has(id)) s.groupNames.delete(id);
}
/* how many levels of named groups sit strictly inside these blocks' frame: 0 if none */
const framesIn = s => new Set([...s.groupOf.values(), ...s.groupUp.keys(), ...s.groupUp.values()]);      /* every frame of a space, by id */
const namedBelow = id => Math.max(0, ...[...space.groupUp].filter(([, up]) => up === id).map(([c]) => 1 + namedBelow(c)));      /* the same, for a group: by what is grouped inside it */
function namedWithin(list, not = []){             /* not: the groups already counted on the way in (two may hold exactly the same blocks) */
  let most = 0;
  for (const id of framesIn(space)){ if (not.includes(id)) continue; const m = inGroup(id);
    if (m.length && m.every(b => list.includes(b))) most = Math.max(most, 1 + namedWithin(m, [...not, id])); }
  return most;
}
const boxOf = list => { const x = Math.min(...list.map(b => b.rect.x)), y = Math.min(...list.map(b => b.rect.y));
  return { x, y, w: Math.max(...list.map(b => b.rect.x + b.rect.w)) - x, h: Math.max(...list.map(b => b.rect.y + b.rect.h)) - y }; };

/* ---- selection ----
   Click a block to select it (with its group, if it has one); double-click one inside a selected group to select
   just that block. Double-click a block that is selected on its own to open its definition space.
   Shift-click adds or removes a block with its whole group; shift and a double click adds or removes the one block. Click empty canvas or press Escape to clear. Press s to drag a box round several.
   One block selected: it shows its dimension lines and can be resized. Several: a box is drawn round them with a
   group button and a place for a name, and they move together but do not resize. Whatever is not selected fades.
   Naming a plain selection folds it into a new block of that name. Naming a group makes it a named group. */
const selected = new Set();
let measure = null;                            /* the dimension lines of the one selected block */
const bounds = createBounds(), roomFrame = createBounds();
const results = [];                            /* the Menu's "= …", one for each piece */
let marks = [], equalSigns = [];                                /* the product marks now on the canvas */
/* ---- shadowing ----
   A variable is defined at the highest space that mentions it. A shape of the same name further down is a new
   definition that shadows the one above, from its own space downwards, but only in the parts it gives: an entry it
   leaves blank is still the entry from above (written faintly in its matrix), and an entry it gives covers it.

   The program's own variables are there from the start, above the Menu. Their names begin with a dot, and they are
   kept out of the list at the right edge, behind its plus button. The tree of them is in system.js: .config, holding
   .integer_precision and .colors, whose two branches, Shapes and UI, hold the colours: shapes of three entries, red green blue.
   A group named .config shadows the program's .config from its space downwards, and one further down shadows it
   again. One set inside another group shadows it for that group alone (see systemValue). Only what is in it counts: a shape named for a system variable, anywhere in the group (in a .colors group
   inside it or not), covers the entries it gives and no others. Anything else in the group is a new attribute, which
   the program does not read. A commented-out shape, or a group called //.config, takes no part. */
const rootStyle = document.documentElement.style;
const isHidden = name => bare(name).trim().startsWith('.');
const cells = b => { const u = view.unit, cols = Math.round(b.rect.w / u), rows = Math.round(b.rect.h / u), v = [];      /* a block's entries, row by row */
  const from = valuesOf(b);
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) v.push(from.get(c + ',' + r)); return v; };
/* The theme has two sets of colours, light and dark. Which is in use is .dark_mode's to say: 1 is dark, 0 light, and
   left blank it is whatever the computer (or the app the page sits in) asks for. The page then says so on the root
   element, which is what the stylesheet goes by, over whatever was there. A colour shape in a .config sets the light
   colour if it is in .colors, the dark one if it is in .dark_colors, and both if it is in neither. */
const root = document.documentElement, bySystemKey = new Map(SYSTEM.map(v => [v.key, v]));
let defaults = null;                           /* { light, dark }: the theme's own colours for each, read with nothing of ours laid over them */
let hostTheme = root.dataset.theme || null, ourTheme;      /* what the app has put on the root element, and what the page last put there */
const asksForDark = () => hostTheme ? hostTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
function programDefaults(){
  if (defaults) return defaults;
  for (const v of SYSTEM) for (const css of v.cssRows || (v.css ? [v.css] : [])) rootStyle.removeProperty('--' + css);
  const probe = document.body.appendChild(document.createElement('i')), was = root.dataset.theme;
  const rgb = css => { probe.style.color = `var(--${css})`; return (getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(n => Math.round(+n)); };
  defaults = {};
  for (const mode of ['light', 'dark']){ root.dataset.theme = mode;      /* the stylesheet is asked for each set in turn */
    defaults[mode] = new Map(SYSTEM.map(v => [v.key, v.css ? rgb(v.css) : v.cssRows ? v.cssRows.flatMap(() => rgb('tensor')) : v.key === 'dark-mode' ? [asksForDark() ? 1 : 0] : v.value])); }      /* a colour is the stylesheet's; an array of colours, with nothing said, is a plain tensor's all through; anything else starts as system.js says */
  if (was === undefined) delete root.dataset.theme; else root.dataset.theme = was;
  probe.remove(); return defaults;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => bus.send('theme', { dark: e.matches }));
new MutationObserver(() => { const now = root.dataset.theme || null; if (now === ourTheme || now === hostTheme) return;      /* the page's own doing, or no change */
  bus.send('theme', { set: now }); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
const inConfig = (b, s) => chain(b, s).some(g => (s.groupNames.get(g) || '').trim() === CONFIG);
const modeOf = (b, s) => { const names = chain(b, s).map(g => (s.groupNames.get(g) || '').trim()); return names.includes(DARK) ? 'dark' : names.includes(COLORS) ? 'light' : 'both'; };
/* a system variable as it stands after the .configs of these spaces, highest first, have each covered what they give.
   mode: for a colour, which of the two sets is wanted */
/* A .config reaches as far as the group it is in: one in no group, the whole space and everything below it; one inside
   a group, that group's shapes and groups and everything below them. (A group is no wall: its shapes share the
   space's variables with everything else there. But what a .config inside it says is said of that group only.)
   So a value is asked for a path: each space on the way down, with the groups (innermost first) round the block the
   way went through, or round the thing being asked about; null where it is the space as a whole. */
let configs = null;                            /* each space's .config shapes, worked out once for every time the screen is brought up to date */
bus.tap(phase => { if (phase === 'before') configs = null; });      /* and afresh for every message */
const configsOf = s => { configs ||= new Map();
  if (!configs.has(s)) configs.set(s, s.blocks.filter(b => !isOff(b) && inConfig(b, s) && bySystemKey.has(leaf(b.name))).map(b => { const groups = chain(b, s), own = groups.find(g => (s.groupNames.get(g) || '').trim() === CONFIG);
    return { key: leaf(b.name), mode: modeOf(b, s), reach: s.groupUp.get(own), values: cells(b) }; }));      /* reach: the group its .config is in, or undefined */
  return configs.get(s); };
const pathTo = s => { const path = []; for (let c = s; c.parent; c = c.parent) path.unshift({ s: c.parent, at: chain(c.owner, c.parent) }); return path; };      /* the spaces above s */
const pathOf = (at = null) => [...pathTo(space), { s: space, at }];      /* down to this space, or to something in it */
const upFrom = g => { const out = [g]; for (let p = space.groupUp.get(g); p !== undefined; p = space.groupUp.get(p)) out.push(p); return out; };      /* a group and those round it, innermost first */
function systemValue(key, path, mode = 'light'){
  const v = [...programDefaults()[mode].get(key)], coloured = isColour(bySystemKey.get(key));
  for (const { s, at } of path){
    const said = configsOf(s).filter(c => c.key === key && (c.reach === undefined || (at && at.includes(c.reach))) && !(coloured && c.mode !== 'both' && c.mode !== mode));
    said.sort((a, b) => (a.reach === undefined ? -1 : at.length - at.indexOf(a.reach)) - (b.reach === undefined ? -1 : at.length - at.indexOf(b.reach)));      /* the space's first, then outer groups', then inner */
    for (const c of said) c.values.slice(0, v.length).forEach((n, i) => { if (Number.isFinite(n)) v[i] = n; }); }
  return v;
}
const modeIn = path => systemValue('dark-mode', path)[0] ? 'dark' : 'light';
function configure(){
  configs = null;
  const spaces = pathOf(), mode = modeIn(spaces), base = programDefaults()[mode], byte = n => Math.max(0, Math.min(255, n));
  if ((root.dataset.theme || null) !== mode){ ourTheme = mode; root.dataset.theme = mode; }
  for (const { key, css, cssRows } of SYSTEM){ const each = cssRows || (css ? [css] : []);      /* only the colours, and which set of them, are read so far */
    const v = each.length ? systemValue(key, spaces, mode).map(byte) : [], d = base.get(key);
    each.forEach((name, i) => { const mine = v.slice(3 * i, 3 * i + 3);
      if (css && mine.join() === d.slice(3 * i, 3 * i + 3).join()) rootStyle.removeProperty('--' + name); else rootStyle.setProperty('--' + name, `rgb(${mine.join(', ')})`); }); }      /* the rows of an array are always set: the stylesheet has nothing for them */
  /* a colour's shape in a .config is drawn in the colour it comes to, in the set it belongs to */
  for (const b of space.blocks){ const v = !isOff(b) && inConfig(b, space) && bySystemKey.get(leaf(b.name)); if (!v?.css) continue;
    const m = modeOf(b, space), path = pathOf(chain(b)); b.el.style.setProperty('--block', `rgb(${systemValue(v.key, path, m === 'both' ? modeIn(path) : m).map(byte).join(', ')})`); }
}
/* Where a .config inside a group gives that group colours of its own, everything of the group's wears them: its shapes,
   what is written beside them, its frame, and the ground under it. An element wears a set of colours by a class (the
   stylesheet's light or dark) and, set on it directly, whatever the .configs make different from that. */
const worn = new WeakMap(); let backdrops = [];
function dress(){
  for (const d of backdrops) d.remove(); backdrops = [];
  const local = configsOf(space).some(c => c.reach !== undefined), page = pathOf(), pageMode = modeIn(page), byte = n => Math.max(0, Math.min(255, n));
  const colours = (path, mode) => { const out = new Map();
    for (const { key, css, cssRows } of SYSTEM){ const each = cssRows || (css ? [css] : []); if (!each.length) continue;
      const v = systemValue(key, path, mode).map(byte); each.forEach((name, i) => out.set('--' + name, `rgb(${v.slice(3 * i, 3 * i + 3).join(', ')})`)); }
    return out; };
  const pageColours = local ? colours(page, pageMode) : null, plain = { light: null, dark: null };
  const wear = (el, at) => { const had = worn.get(el) || new Set(), now = new Map(); let mode = pageMode;
    if (local){ const path = pathOf(at); mode = modeIn(path);
      if (mode !== pageMode) plain[mode] ||= colours([], mode);      /* that set as the stylesheet has it */
      const against = mode === pageMode ? pageColours : plain[mode];
      for (const [name, value] of colours(path, mode)) if (value !== against.get(name) || (mode !== pageMode && name.startsWith('--variable-'))) now.set(name, value); }
    el.classList.toggle('theme-dark', mode !== pageMode && mode === 'dark'); el.classList.toggle('theme-light', mode !== pageMode && mode === 'light');
    for (const name of had) if (!now.has(name)) el.style.removeProperty(name);
    for (const [name, value] of now) el.style.setProperty(name, value);
    worn.set(el, new Set(now.keys())); return mode; };
  for (const b of space.blocks) wear(b.el, chain(b));
  for (const r of results) if (r.el.isConnected && r.piece) wear(r.el, chain(r.piece.blocks[0]));
  for (const [id, f] of space.frames){ const round = upFrom(id), mode = wear(f.el, round);
    if (!local || !f.box || mode === modeIn(pathOf(round.length > 1 ? round.slice(1) : null))) continue;      /* the same colours as what is round it: no ground of its own */
    const grow = namedBelow(id), side = 12 + 14 * grow, above = 32 + 34 * grow + 26;      /* as bounds.js draws the frame, and its name above it, which is in these colours too */
    const ground = createBackdrop({ x: f.box.x - side, y: f.box.y - above, w: f.box.w + 2 * side, h: f.box.h + above + side });
    wear(ground, round); view.world.prepend(ground); backdrops.push(ground); }
}
/* what the definitions above give to a block, for the entries it leaves blank. s is the space the block is in. */
function inheritedBy(b, s){
  const above = []; for (let p = s.parent; p; p = p.parent) above.unshift(p);
  const key = leaf(b.name), got = new Map(), cols = Math.round(b.rect.w / view.unit);
  if (inConfig(b, s)){ const m = modeOf(b, s);
    if (bySystemKey.has(key)) systemValue(key, pathTo(s), m === 'both' ? modeIn(pathOf()) : m).forEach((n, i) => got.set((i % cols + 1) + ',' + (Math.floor(i / cols) + 1), n));
    return got; }                                /* in a .config: what the program and the .configs above make of it */
  if (!isNamed(b)) return got;
  const name = bare(b.name).trim(), mine = new Set(kinOf(b));
  for (const p of above) for (const o of p.blocks) if (!isOff(o) && !mine.has(o) && bare(o.name).trim() === name) for (const [k, n] of o.values) got.set(k, n);
  return got;
}
/* a system variable dragged in from the list: blank shapes that shadow it, in this space's .config (made if there is
   none). One variable brings one shape. .colors brings every colour, in its Shapes and UI groups; .config brings the
   whole tree. They are laid out as in system.js. */
function summon(item, at){
  const u = view.unit, on = v => Math.round(v / u) * u, made = [], colours = SYSTEM.filter(isColour);
  /* which variables, and the area of the .config each goes in: .colors, .dark_colors, or neither */
  const which = !item.group ? [[SYSTEM.find(v => v.key === item.key), null]] : item.name === COLORS ? colours.map(v => [v, COLORS]) : item.name === DARK ? colours.map(v => [v, DARK])
    : [...SYSTEM.filter(v => !isColour(v)).map(v => [v, null]), ...colours.map(v => [v, COLORS]), ...colours.map(v => [v, DARK])];
  const place = ([v, area]) => [v.at[0], v.at[1] + (area === DARK ? DARK_DOWN : 0)], [x0, y0] = place(which[0]);
  let config = [...space.groupNames].find(([, name]) => name.trim() === CONFIG)?.[0];
  if (config === undefined){ config = newGroup(); space.groupNames.set(config, CONFIG); }
  const groups = new Map(), groupFor = (key, name, up) => { if (!groups.has(key)){ const id = newGroup(); groups.set(key, id); space.groupNames.set(id, name); space.groupUp.set(id, up); } return groups.get(key); };
  for (const [v, area] of which){ const [x, y] = place([v, area]);
    const b = makeBlock({ ...typeNamed('tensor'), color: v.css || v.color }, { x: on(at.x) + (x - x0) * u, y: on(at.y) + (y - y0) * u, w: v.cols * u, h: (v.rows || 1) * u }, v.name);
    space.blocks.push(b); view.world.append(b.el); made.push(b);
    const outer = area && groupFor(area, area, config);
    space.groupOf.set(b, !area ? config : v.branch ? groupFor(area + '/' + v.branch, v.branch, outer) : outer); }
  select(made);
}

/* Everything in a dotted frame is a hidden variable, and says so: its name is lower case and begins with a dot. That is
   seen to here, each time the screen is brought up to date, for whatever has gone into such a frame or been named
   there. (A shape still called "Shape 3", and a frame with no name, are not variables and are left alone.) */
function hush(){
  const s = space, dotted = [...s.groupNames].filter(([, n]) => bare(n).trim().startsWith('.')).map(([id]) => id); if (!dotted.length) return;
  const low = n => { const core = bare(n).trim(), want = (core.startsWith('.') ? core : '.' + core).toLowerCase(); return !core || want === core ? n : (/^\s*\/\//.test(n) ? '//' : '') + want; };
  const under = (g, id) => { for (let p = s.groupUp.get(g); p !== undefined; p = s.groupUp.get(p)) if (p === id) return true; return false; };
  for (const id of dotted){
    for (const b of inGroup(id, s)) if (isNamed(b) && low(b.name) !== b.name){ const want = low(b.name); for (const k of kinOf(b)) k.call(want); }
    for (const [g, n] of [...s.groupNames]) if (under(g, id) && low(n) !== n) s.groupNames.set(g, low(n)); }
}
function shown(){                              /* brings what is on screen in line with the selection and the blocks' positions */
  hush(); configure();
  for (const b of space.blocks) if (b.members){ flow(b); b.join(partsOf(b, 0, 0, b.rect.w / view.unit, b.rect.h / view.unit), b.rect.w / view.unit, b.rect.h / view.unit); }
  const list = [...selected], one = list.length === 1 ? list[0] : null;
  for (const b of space.blocks){ b.select(selected.has(b)); b.dim(selected.size > 0 && !selected.has(b)); b.grips(!(list.length > 1 && selected.has(b))); }
  if (one){ measure ||= createMeasure(view.unit); view.world.append(measure.el); measure.set(one.rect, { ...sides(view, one.rect), wName: one.sides.w, hName: one.sides.h }); }
  else measure?.el.remove();
  /* every frame is drawn, named or not; the one that is the whole selection also carries the tools */
  const oneGroup = groupIs(list), live = new Set();
  for (const id of framesIn(space)){ const name = space.groupNames.get(id) || '';
    const ms = inGroup(id); if (!ms.length) continue;
    live.add(id); if (!space.frames.has(id)) space.frames.set(id, createBounds());
    const f = space.frames.get(id), on = id === oneGroup || id === room.host;      /* lit while a selection is held over it */
    f.fit = [room.loose?.get(id) || boxOf(ms), { name, solid: true, selected: on, tools: id === oneGroup, grouped: true, fold: true, grow: namedBelow(id) }, room.loose?.has(id) ? [] : ms];
    f.set(f.fit[0], f.fit[1]); view.world.append(f.el);
  }
  for (const [id, f] of space.frames) if (!live.has(id)){ f.el.remove(); space.frames.delete(id); }
  if (room.host !== null && !space.frames.has(room.host)){ roomFrame.set(boxOf(inGroup(room.host)), { selected: true, grouped: true, grow: namedBelow(room.host) }); view.world.append(roomFrame.el); }
  else roomFrame.el.remove();                  /* a group with no name has no frame of its own: it is lent one while something is held over it */
  /* any other selection of several gets the dashed box, with a name to fill in */
  if (list.length > 1 && !live.has(oneGroup)){
    bounds.set(boxOf(list), { selected: true, tools: true, grouped: oneGroup !== null, grow: namedWithin(list) });
    view.world.append(bounds.el);
  } else bounds.el.remove();
  /* the algebra of what is here: a mark wherever two blocks touch and multiply, and whether it all comes to the promised size */
  for (const b of space.blocks) b.off(isOff(b));
  const u = view.unit, { active, rects, all } = algebraIn(space);
  /* commented-out blocks take no part, nor what is in a .config */
  for (const j of marks) j.el.remove();
  const js = joins(rects);
  marks = js.map(j => createJoin({ x: j.x * u, y: j.y * u, ok: j.ok, note: j.note }));
  /* in a product the left block gives its rows and the right block its columns, so the left one is banded across
     and the right one down; a block in the middle of a chain does both */
  for (const b of space.blocks){ const i = active.indexOf(b), rows = i >= 0 && js.some(j => j.ok && j.left === i), cols = i >= 0 && js.some(j => j.ok && j.right === i);
    b.stripes(rows && cols ? 'both' : rows ? 'rows' : cols ? 'cols' : null, u); }
  view.world.append(...marks.map(j => j.el));
  /* how a piece's matrix is written. One block: its own initials, colour and numbers. A product: each entry as the
     row it takes from the first block against the column it takes from the last, each in its block's colour.
     (A product is not worked out in numbers yet.) */
  const lookOf = piece => { const bs = piece.members.map(m => active[m]), first = bs[0], last = bs[bs.length - 1];
    if (piece.stack) return { letter: initials(first.name), values: pieceValues({ piece, blocks: bs }, 0) };      /* a stack: its shapes' entries, row under row */
    /* a shape in a .config is written in the ordinary text colour, since its own may be the canvas's, with the entries it leaves to the definitions above written faintly */
    if (bs.length === 1 && inConfig(first, space)) return { letter: initials(first.name), values: valuesOf(first), inherited: inheritedBy(first, space), tiles: tileLook(first) };
    return bs.length === 1 ? { letter: initials(first.name), color: first.shape.color, values: valuesOf(first), tiles: tileLook(first) }
      : { product: { rows: { letter: initials(first.name), color: first.shape.color }, cols: { letter: initials(last.name), color: last.shape.color } } }; };
  /* a definition space sets what is here beside its block's promised size. The Menu has no promise, so it
     writes out what each piece comes to, beside that piece. (Shapes that do not touch are separate pieces.) */
  /* a shape with a piece of its own size beside it is asserted equal to it: a sign goes between them, and only the
     piece at the end of such a row has its value written out */
  const stacked = new Set(all.filter(p => p.stack).flatMap(p => p.members.map(m => active[m])));
  for (const b of space.blocks) b.inset(stacked.has(b));      /* in a stack, names go on the blocks */
  const pairs = pairsIn(space, { active, rects, all });
  for (const e of equalSigns) e.el.remove();
  equalSigns = [...pairs.values()].map(p => createEquals(p)); view.world.append(...equalSigns.map(e => e.el));
  if (space.definition && space.definition.tiled !== JSON.stringify(tileLook(space.owner))) write();      /* shapes have gone into, or come out of, its block's matrix */
  const mine = all.filter(p => !p.members.some(m => inConfig(active[m], space)));      /* what is in a .config is no part of what the space comes to */
  space.definition?.check(!mine.length ? null : mine.length === 1 ? mine[0].type : { error: mine.length + ' pieces' }, mine.length === 1 ? lookOf(mine[0]) : {});
  const ps = space.owner ? [] : all;
  /* a result stays by its piece: to the right; if something else is there (another block, or a result already placed),
     just below, to the left, or a little further below; and if every one of those is taken, to the right all the
     same, over whatever is there. It never goes off looking for room. */
  const taken = space.blocks.map(b => b.rect),      /* commented-out blocks are still in the way */
     hits = r => taken.some(t => t !== r && t.x < r.x + r.w && t.x + t.w > r.x && t.y < r.y + r.h && t.y + t.h > r.y);
  /* a product can be named, folding its blocks into one; a block on its own already is one, and has its own name */
  const writ = ps.filter(piece => !(piece.members.length === 1 && pairs.has(active[piece.members[0]]))).map(piece => ({ blocks: piece.members.map(m => active[m]), type: piece.type, look: lookOf(piece), nameable: piece.members.length > 1,
    box: { x: piece.box.x * u, y: piece.box.y * u, w: piece.box.w * u, h: piece.box.h * u } }));
  writ.forEach(({ blocks, type, look, nameable, box }, i) => { const r = results[i] ||= createResult({ unit: u }); view.world.prepend(r.el);
    r.piece = { blocks, type, box };            /* what this result is the result of */
    let at = null;
    for (const where of [{}, { side: 'below' }, { side: 'left' }, { side: 'below', drop: 1 }, { side: 'below', drop: 2 }, {}]){ at = r.set(box, type, { ...where, look, nameable }); if (!hits(at)) break; }
    r.piece.at = at; taken.push(at); });
  for (const r of results.slice(writ.length)) r.el.remove();
  /* a named group's frame takes in what is written beside its shapes, too */
  for (const f of space.frames.values()){ const [box, options, ms] = f.fit; let x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
    for (const r of results.slice(0, writ.length)) if (r.piece.at && r.piece.blocks.every(b => ms.includes(b))){ const a = r.piece.at;
      x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y); x1 = Math.max(x1, a.x + a.w); y1 = Math.max(y1, a.y + a.h); }
    f.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    if (x1 - x0 !== box.w || y1 - y0 !== box.h) f.set(f.box, options); }
  dress();
  const reach = inReach(); variables.show(reach.main, reach.hidden);
}
function select(list, { toggle = false } = {}){
  if (!toggle) selected.clear();
  const off = toggle && list.length && list.every(b => selected.has(b));
  for (const b of list) off ? selected.delete(b) : selected.add(b);
  shown();
}

/* ---- naming a result ----
   Click the matrix a product comes to and give it a name: the blocks that came to it fold away into a new block of that name,
   the size of the result, in a bold colour picked at random. They become its definition: open it to find them on
   the left of its "=". */
/* what folding these blocks would make: if they come to one thing (a product, say) the new block is that size;
   if not, it is the size of the box round them */
function foldable(list){
  const u = view.unit, box = boxOf(list), type = typeOf(list.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u, wName: b.sides.w, hName: b.sides.h })));
  return { blocks: list, box, type: type && !type.error ? type : { cols: box.w / u, rows: box.h / u, colsName: null, rowsName: null } };
}
function fold({ blocks: inside, type, box }, name, color = someColour()){
  const u = view.unit;
  const made = makeBlock({ ...typeNamed('tensor'), color },
    { x: box.x, y: box.y, w: type.cols * u, h: type.rows * u }, name);
  made.sides = { w: type.colsName, h: type.rowsName };                    /* its sides keep the names the result's sides had */
  /* its definition space: the folded blocks, level with the equation at the centre and clear of it on the left */
  const def = newSpace(made, space); spaceOf.set(made, def);
  /* groups lying wholly among the folded blocks go with them; the group being folded itself, if it is one, does not */
  const whole = groupIs(inside), going = new Set(inside.flatMap(b => chain(b)).filter(g => g !== whole && inGroup(g).every(b => inside.includes(b))));
  for (const b of inside) if (going.has(space.groupOf.get(b))) def.groupOf.set(b, space.groupOf.get(b));
  for (const g of going){ if (going.has(space.groupUp.get(g))) def.groupUp.set(g, space.groupUp.get(g)); if (space.groupNames.has(g)) def.groupNames.set(g, space.groupNames.get(g)); }
  for (const g of going){ space.groupUp.delete(g); space.groupNames.delete(g); }
  const dx = -u * (3 + squares(type.cols)) - (box.x + box.w), dy = Math.round(-box.h / 2 / u) * u - box.y;
  for (const b of inside){
    b.el.remove(); space.blocks.splice(space.blocks.indexOf(b), 1); space.groupOf.delete(b);
    b.set({ ...b.rect, x: b.rect.x + dx, y: b.rect.y + dy }); def.blocks.push(b);
    if (spaceOf.has(b)) spaceOf.get(b).parent = def;                                                 /* its own definition now hangs under the new one */
  }
  tidy();                                      /* a group left with one thing in it is no group */
  space.blocks.push(made); view.world.append(made.el);
  select([made]);
}

/* ---- copy and paste ----
   Copy takes a picture of the selected blocks as they are now: size, name, colour, side names, entries, grouping, and each
   one's whole definition space, all the way down. Paste makes new blocks from that picture in the current space,
   centred on a point, and selects them. The picture stays, so it can be pasted again and again.
   This is the page's own clipboard, not the computer's: it does not survive a reload or reach another tab. */
let clipboard = null;
const picture = (b, s) => ({ tile: !!b.tile, shape: { ...b.shape }, rect: { ...b.rect }, name: b.name, sides: { ...b.sides }, values: [...b.values],      /* plain data throughout, so a paste can say what it pasted */
  groups: chain(b, s).map(g => ({ id: g, name: s.groupNames.get(g) ?? null })),      /* the groups it is in, innermost first */
 
  inside: spaceOf.has(b) ? spaceOf.get(b).blocks.map(o => picture(o, spaceOf.get(b))) : null,
  members: b.members ? b.members.map(m => ({ fx: m.fx, fy: m.fy, fw: m.fw, fh: m.fh, pic: picture(m.block, s) })) : null });
function copy(){ if (selected.size) clipboard = [...selected].map(b => picture(b, space)); }
function cut(){ if (selected.size){ copy(); remove(); } }
/* makes the blocks in pictures inside space s, moved by (dx, dy); blocks that were grouped together are grouped together again */
function develop(pictures, s, dx, dy){
  const u = view.unit, groups = new Map(), made = [];
  for (const pic of pictures){
    const r = { ...pic.rect, x: pic.rect.x + dx, y: pic.rect.y + dy };
    for (const dim of ['w', 'h']) if (pic.sides[dim] && lengthCalled(pic.sides[dim], s) !== undefined) r[dim] = lengthCalled(pic.sides[dim], s);      /* a named side is whatever length that name is now */
    const name = s === space && /^Shape \d+$/.test(pic.name) ? freeName() : pic.name;      /* a block never given a name of its own gets a fresh number */
    const b = makeBlock(pic.shape, r, name); b.sides = { ...pic.sides }; b.values = new Map(pic.values); if (pic.tile && s !== space) b.tile = true;
    if (pic.members) b.members = pic.members.map(m => ({ fx: m.fx, fy: m.fy, fw: m.fw, fh: m.fh, block: hidden(m.pic, s) }));
    s.blocks.push(b); made.push(b);
    pic.groups.forEach((g, i) => { if (!groups.has(g.id)){ groups.set(g.id, newGroup()); if (g.name) s.groupNames.set(groups.get(g.id), g.name); }
      if (i === 0) s.groupOf.set(b, groups.get(g.id)); else s.groupUp.set(groups.get(pic.groups[i - 1].id), groups.get(g.id)); });
    if (pic.inside){ const def = newSpace(b, s); spaceOf.set(b, def); develop(pic.inside, def, 0, 0); }
  }
  tidy(s);                                     /* a group of which only part was copied may not be a group here */
  return made;
}
/* a block made from a picture but put in no space: one of those a joined shape was joined from */
function hidden(pic, s){
  const b = makeBlock(pic.shape, { ...pic.rect }, pic.name); b.sides = { ...pic.sides }; b.values = new Map(pic.values);
  if (pic.members) b.members = pic.members.map(m => ({ fx: m.fx, fy: m.fy, fw: m.fw, fh: m.fh, block: hidden(m.pic, s) }));
  if (pic.inside){ const def = newSpace(b, s); spaceOf.set(b, def); develop(pic.inside, def, 0, 0); }
  return b;
}
function paste(at, clipboard){                             /* at: a world point; the pasted blocks are centred on it, on the dots */
  if (!clipboard?.length) return;
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
/* transposes the selection. A shape on its own turns about its top-left corner: its width and height change places,
   with their names, and entry c,r becomes entry r,c. A product turns as a whole, (A·B·C)ᵀ = Cᵀ·Bᵀ·Aᵀ: each shape is
   transposed and their order reversed, laid out again from the product's top-left corner. A shape is a variable, so
   every other use of it is transposed with it. (What is inside its definition space is left as it is.) */
function transpose(){
  if (!selected.size) return;
  const u = view.unit, list = [...selected], act = list.filter(b => !isOff(b)), done = new Set();
  const chains = pieces(act.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u, wName: b.sides.w, hName: b.sides.h })))
    .map(p => p.members.map(m => act[m]).sort((a, b) => a.rect.x - b.rect.x)).filter(c => c.length > 1)
    .map(c => ({ blocks: c, x: Math.min(...c.map(b => b.rect.x)), y: Math.min(...c.map(b => b.rect.y)) }));
  const flip = b => { const variable = kin.get(b) || b; if (done.has(variable)) return; done.add(variable);
    const was = [...b.values]; b.values.clear(); for (const [k, v] of was){ const [c, r] = k.split(','); b.values.set(r + ',' + c, v); }
    for (const k of kinOf(b)){ k.set({ ...k.rect, w: k.rect.h, h: k.rect.w }); k.sides = { w: k.sides.h, h: k.sides.w }; }
    for (const m of b.members || []){ [m.fx, m.fy, m.fw, m.fh] = [m.fy, m.fx, m.fh, m.fw]; flip(m.block); } };      /* a joined shape turns with everything it was joined from */
  list.forEach(flip);
  for (const c of chains){ let x = c.x; for (const b of c.blocks.reverse()){ b.set({ ...b.rect, x, y: c.y }); x += b.rect.w; } }
  if (space.owner && kinOf(space.owner).some(k => done.has(kin.get(k) || k))) write();      /* the block whose space this is has turned too */
  shown();
}
/* ---- joined shapes ----
   Shapes that fit together into a rectangle, with nothing missing and nothing doubled, can be joined into one shape:
   that rectangle. Like a group, it keeps the shapes it was joined from, whole (their names, entries, definitions),
   only out of sight; disjoin puts them back. On its face each keeps its colour, with a wavy line where two meet.
   Its entries are theirs: each of its entries is the entry of the shape that covers that place, and a number typed
   into it goes to that shape. A joined shape can be joined again, into a larger one.
   block.members: [{ block, fx, fy, fw, fh }], each with the part of the joined shape it takes up, as fractions, so
   they follow when it is resized. */
function fitsTogether(list){
  if (list.length < 2) return false;
  const box = boxOf(list), area = list.reduce((sum, b) => sum + b.rect.w * b.rect.h, 0);
  return Math.abs(area - box.w * box.h) < 1e-6 && !list.some((a, i) => list.some((b, j) => j > i && a.rect.x < b.rect.x + b.rect.w && b.rect.x < a.rect.x + a.rect.w && a.rect.y < b.rect.y + b.rect.h && b.rect.y < a.rect.y + a.rect.h));
}
/* the coloured parts of a block's face, in units: one for a plain block, its members' for a joined one, all the way down */
const partsOf = (b, x, y, w, h) => b.members ? b.members.flatMap(m => partsOf(m.block, x + m.fx * w, y + m.fy * h, m.fw * w, m.fh * h)) : [{ x, y, w, h, color: b.shape.color }];
/* where a member sits in its joined shape as that now is: whole units, never less than one */
function placeOf(m, cols, rows){ const x = Math.round(m.fx * cols), y = Math.round(m.fy * rows);
  return { x, y, w: Math.max(1, Math.round((m.fx + m.fw) * cols) - x), h: Math.max(1, Math.round((m.fy + m.fh) * rows) - y) }; }
/* a joined shape's entries, gathered up from its members' */
function flow(b){
  if (!b.members) return;
  const u = view.unit, cols = Math.round(b.rect.w / u), rows = Math.round(b.rect.h / u); b.values.clear();
  for (const m of b.members){ flow(m.block); const at = placeOf(m, cols, rows);
    for (const [k, v] of m.block.values){ const [c, r] = k.split(',').map(Number); if (c <= at.w && r <= at.h) b.values.set((c + at.x) + ',' + (r + at.y), v); } }
}
/* the shape an entry of b really belongs to, and the entry's place in it */
function entryHome(b, c, r){
  if (!b.members) return [b, c + ',' + r];
  const u = view.unit, cols = Math.round(b.rect.w / u), rows = Math.round(b.rect.h / u);
  for (const m of b.members){ const at = placeOf(m, cols, rows); if (c > at.x && c <= at.x + at.w && r > at.y && r <= at.y + at.h) return entryHome(m.block, c - at.x, r - at.y); }
  return [b, c + ',' + r];
}
function joinShapes(){
  const list = [...selected].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  if (!fitsTogether(list)) return hud.say('To join, the shapes must fit together into one rectangle');
  const box = boxOf(list), held = chain(list[0]).find(g => list.every(b => chain(b).includes(g)));      /* the innermost group holding them all */
  select([]);
  for (const b of list){ b.el.remove(); space.blocks.splice(space.blocks.indexOf(b), 1); space.groupOf.delete(b); }      /* out of sight, not forgotten */
  const made = makeBlock({ ...typeNamed('tensor') }, box, freeName());
  made.members = list.map(b => ({ block: b, fx: (b.rect.x - box.x) / box.w, fy: (b.rect.y - box.y) / box.h, fw: b.rect.w / box.w, fh: b.rect.h / box.h }));
  space.blocks.push(made); view.world.append(made.el); if (held !== undefined) space.groupOf.set(made, held);
  tidy(); select([made]);
}
/* puts back the shapes a joined shape was joined from, where they now fall in it and at the size they now are there */
function disjoin(){
  const u = view.unit, back = [], others = [...selected].filter(b => !b.members);
  for (const j of [...selected].filter(b => b.members)){ const cols = Math.round(j.rect.w / u), rows = Math.round(j.rect.h / u), group = space.groupOf.get(j);
    for (const m of j.members){ const at = placeOf(m, cols, rows), b = m.block;
      for (const k of kinOf(b)) if (k !== b) k.set({ ...k.rect, w: at.w * u, h: at.h * u });      /* every use of a variable is one size */
      b.set({ x: j.rect.x + at.x * u, y: j.rect.y + at.y * u, w: at.w * u, h: at.h * u });
      space.blocks.push(b); view.world.append(b.el); if (group !== undefined) space.groupOf.set(b, group); back.push(b); }
    j.el.remove(); space.blocks.splice(space.blocks.indexOf(j), 1); space.groupOf.delete(j); j.members = null; forget(j); }
  tidy(); select([...others, ...back]);
}
function forget(b){                             /* one use fewer of its variable; what it was joined from goes with it */
  spaceOf.delete(b); const set = kin.get(b); if (set){ set.delete(b); kin.delete(b); if (set.size < 2) for (const k of set) kin.delete(k); }
  for (const m of b.members || []) forget(m.block);
}
function remove(){
  const gone = [...selected]; select([]);
  for (const b of gone){ b.el.remove(); space.blocks.splice(space.blocks.indexOf(b), 1); forget(b); }
  tidy(); shown();
}

/* ---- saving and opening a project ----
   The whole tree of shapes is written as a tree of files, a directory for every space (project.js has the format).
   Served by server.py, the page saves to and opens from the server's projects/ directory, by name.
   Anywhere else (the published artifact, say) there is no server to keep them, so Save hands over one zip of the
   same tree and Open takes one back. */
const typeNamed = name => shapes.find(s => s.name === name) || { name, label: name, draw: 'rectangle', color: 'tensor' };
/* the page's spaces as plain data, lengths in units */
function gather(){
  const u = view.unit, sets = [...new Set(kin.values())], number = b => kin.has(b) ? sets.indexOf(kin.get(b)) + 1 : null;
  const one = b => ({ id: b.id, type: b.shape.name || 'tensor', name: b.name, color: b.shape.color, x: b.rect.x / u, y: b.rect.y / u, cols: b.rect.w / u, rows: b.rect.h / u,
    colsName: b.sides.w, rowsName: b.sides.h, entries: b.members ? {} : Object.fromEntries(b.values), inside: spaceOf.has(b) ? plain(spaceOf.get(b)) : null, variable: number(b),
    tile: !!b.tile,
    joined: b.members ? b.members.map(m => ({ fx: m.fx, fy: m.fy, fw: m.fw, fh: m.fh, shape: one(m.block) })) : null });      /* a joined shape's entries are its members' */
  const plain = s => ({
    shapes: s.blocks.map(one),
    groups: tree(s, undefined) });
  /* the groups of s directly inside group `up` (undefined: inside none), each with the blocks and groups directly inside it */
  const tree = (s, up) => [...new Set([...s.groupOf.values(), ...s.groupUp.keys(), ...s.groupUp.values()])].filter(g => s.groupUp.get(g) === up)
    .map(g => ({ id: g, name: s.groupNames.get(g) || null, members: s.blocks.map((b, i) => s.groupOf.get(b) === g ? i : -1).filter(i => i >= 0), groups: tree(s, g) }));
  return { top: plain(top), saved: new Date().toISOString(), ids: ids.state() };
}
/* the reverse: everything on the page is replaced by what the data describes */
function rebuild(data){
  go(top); select([]);
  for (const s of [top]){ for (const b of s.blocks) b.el.remove(); for (const f of s.frames.values()) f.el.remove();
    s.blocks.length = 0; s.groupOf.clear(); s.groupUp.clear(); s.groupNames.clear(); s.frames.clear(); }
  spaceOf.clear(); kin.clear(); deeper.length = 0; clipboard = null;
  ids = createIds(); if (data.ids) ids.restore(data.ids);
  const uses = new Map();                        /* a variable's number -> the blocks that are uses of it */
  const u = view.unit;
  /* one block from its plain form, with its definition space and, for a joined shape, the shapes it was joined from */
  const build = (d, s) => { const type = typeNamed(d.type);
    const b = createBlock({ ...type, color: OLD[d.color] || d.color || type.color }, { x: d.x * u, y: d.y * u, w: d.cols * u, h: d.rows * u }, d.name);      /* OLD: a colour's name in projects saved before */
    b.sides = { w: d.colsName, h: d.rowsName }; b.values = new Map(Object.entries(d.entries)); if (d.tile) b.tile = true; b.id = d.id || ids.id('b');      /* the id it was saved with */
    if (d.joined) b.members = d.joined.map(j => ({ fx: j.fx, fy: j.fy, fw: j.fw, fh: j.fh, block: build(j.shape, s) }));
    const first = d.variable != null && uses.get(d.variable)?.[0];
    if (d.variable != null) uses.set(d.variable, [...(uses.get(d.variable) || []), b]);
    if (first){ b.values = first.values; if (spaceOf.has(first)) spaceOf.set(b, spaceOf.get(first)); return b; }      /* a later use: the first one's entries and definition */
    if (d.inside){ const def = newSpace(b, s); spaceOf.set(b, def); fill(d.inside, def); }
    return b; };
  const fill = (plain, s) => {
    for (const d of plain.shapes) s.blocks.push(build(d, s));
    const regroup = (g, up) => { const id = g.id || newGroup(); if (up !== undefined) s.groupUp.set(id, up); if (g.name) s.groupNames.set(id, g.name);
      for (const i of g.members) s.groupOf.set(s.blocks[i], id); for (const inner of g.groups || []) regroup(inner, id); };
    for (const g of plain.groups) regroup(g, undefined);
    tidy(s);
  };
  fill(data.top, top);
  for (const list of uses.values()) if (list.length > 1){ const set = new Set(list); for (const b of list) kin.set(b, set); }
  view.world.append(...top.blocks.map(b => b.el)); shown();
}
const count = data => { const n = s => s.shapes.reduce((t, d) => t + 1 + (d.inside ? n(d.inside) : 0), 0); return n(data.top); };
/* is there a server keeping projects? Asked once, at the start; the list is refreshed after every save. */
let kept = null, current = null;               /* kept: the names of the server's projects, or null with no server; current: the one open */
const ask = () => fetch('api/projects').then(r => r.ok ? r.json() : null).then(list => { kept = Array.isArray(list) ? list : null; }).catch(() => { kept = null; });
/* at the start, the Menu is opened from the server: the project called "menu" if one has been saved, otherwise the
   one that comes with the repository. Saving then offers "menu", so the first save makes it your own. */
ask().then(() => { const first = kept && ['menu', 'default-menu'].find(name => kept.includes(name));
  if (first) bus.send('project.open', { name: first }).then(() => { current = 'menu'; });
  else if (!kept) fetch('projects/default-menu/files.json').then(r => r.ok ? r.json() : Promise.reject()).then(list => Promise.all(list.map(path => fetch('projects/default-menu/' + path.split('/').map(encodeURIComponent).join('/')).then(r => r.ok ? r.text() : Promise.reject()).then(text => ({ path, text }), e => path.startsWith('.') ? null : Promise.reject(e)))))
    .then(files => bus.send('project.load', { files: files.filter(Boolean), name: 'menu' })).catch(() => {}); });   /* no server: the default Menu's files, if they sit beside the page */

async function save(name){
  const data = gather(), files = project.write(data), what = `${count(data)} shapes in ${files.length} files`;
  try {
    if (kept){                                   /* on the server, under a name */
      if (!name) return hud.say('Not saved');
      const r = await fetch('api/projects/' + encodeURIComponent(name), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(files) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'the server answered ' + r.status);
      current = name; ask(); return hud.say(`Saved ${what} to projects/${name}/`);
    }
    const bytes = zip(files.map(f => ({ path: 'project/' + f.path, text: f.text }))), downloads = await window.claude?.use?.('downloads');
    if (downloads){ await downloads.save({ filename: 'smart-factory-project.zip', data: new Blob([bytes]) }); return hud.say(`Saved ${what} as a zip`); }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })); a.download = 'smart-factory-project.zip'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000); hud.say(`Saved ${what} as a zip`);
  } catch (e) { hud.say(e.code === 'declined' ? 'Not saved' : 'Could not save: ' + (e.message || e.code || e)); }
}

/* opening replaces everything on the page */
function openFrom(files, name = null){ const data = project.read(files); rebuild(data); history.clear(); current = name;      /* a project just opened has no steps to undo */
  hud.say(`Opened ${name ? name + ': ' : ''}${count(data)} shapes`); }
const openKept = name => fetch('api/projects/' + encodeURIComponent(name)).then(r => r.ok ? r.json() : Promise.reject(new Error('the server answered ' + r.status)))
  .then(files => bus.send('project.load', { files, name })).catch(e => hud.say('Could not open: ' + (e.message || e)));
const zipPicker = Object.assign(document.createElement('input'), { type: 'file', accept: '.zip,application/zip', hidden: true });
document.body.append(zipPicker);
zipPicker.addEventListener('change', async () => { const file = zipPicker.files[0]; zipPicker.value = ''; if (!file) return;
  try { bus.send('project.load', { files: await unzip(new Uint8Array(await file.arrayBuffer())) }); } catch (e) { hud.say('Could not open: ' + (e.message || e)); } });

/* ---- keys ---- */
let boxing = null;                             /* the box selection in progress, if any */
addEventListener('keydown', e => {
  /* Ctrl or Cmd with c copies the selection; with x cuts it (copies, then removes); with v pastes in the middle of the screen. (While typing in a name or a
     measurement these keys never reach here, so text is copied and pasted as usual.) */
  /* Ctrl or Cmd with z undoes; with shift and z, or with y, redoes */
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')){ e.preventDefault(); return bus.send(e.shiftKey || e.key === 'y' || e.key === 'Y' ? 'redo' : 'undo'); }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'c' || e.key === 'C')){ if (selected.size){ e.preventDefault(); bus.send('copy', { ids: idsOf(selected) }); } return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'x' || e.key === 'X')){ if (selected.size){ e.preventDefault(); bus.send('cut', { ids: idsOf(selected) }); } return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'v' || e.key === 'V')){ if (clipboard){ e.preventDefault(); bus.send('paste', { at: { x: view.camera().x, y: view.camera().y }, pasted: clipboard }); } return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') return bus.send('escape');      /* with nothing selected, Escape steps out of a definition space */
  /* s: drag a box; every block it touches is selected, with its group. Press s again to leave without selecting. */
  if (e.key === 's' || e.key === 'S') return bus.send('select.box');
  /* F2 or Enter: rename the one selected block (the way to rename a block in a stack, whose name is written on it) */
  if ((e.key === 'F2' || e.key === 'Enter') && selected.size === 1){ e.preventDefault(); return renaming([...selected][0]); }
  /* f frames the selection; on a selection that is one frame already, it takes the frame off */
  if ((e.key === 'f' || e.key === 'F') && selected.size){ e.preventDefault(); const list = [...selected], g = groupIs(list);
    return g !== null ? bus.send('unframe', { frame: g }) : bus.send('frame', { ids: idsOf(list) }); }
  if ((e.key === 't' || e.key === 'T') && selected.size){ e.preventDefault(); return bus.send('transpose', { ids: idsOf(selected) }); }      /* t transposes the selection */
  /* x, Backspace or Delete removes the selected blocks. (Typing in a name or a measurement never reaches here.) */
  if ((e.key === 'x' || e.key === 'X' || e.key === 'Backspace' || e.key === 'Delete') && selected.size){ e.preventDefault(); bus.send('delete', { ids: idsOf(selected) }); }
});

/* ---- drags that begin on a block ----
   By a side or corner: resize it. On a selected block: move every selected block. Both go in steps of the dots on
   screen. Anything else is left to the view, which pans. */
function dragged(el, from, e){
  const b = blockAt(el);
  if (!b || el.isContentEditable) return;
  const g = view.grid(), snap = v => Math.round(v / g) * g, cursor = c => { view.el.style.cursor = c; };
  /* while a drag lasts the blocks follow the pointer directly. When it ends they are put back as they were, and one
     message, 'place', says where every block that moved or changed size now goes. */
  const before = new Map(everyKnown().map(b => [b, b.rect]));
  const settle = () => { const rects = [];
    for (const [b, r] of before) if (b.rect !== r){ if (b.rect.x !== r.x || b.rect.y !== r.y || b.rect.w !== r.w || b.rect.h !== r.h) rects.push({ id: b.id, ...b.rect }); b.set(r); }
    if (rects.length) bus.send('place', { rects }); else shown(); };
  const end = () => { cursor(''); settle(); };
  const grip = el.dataset.grip;
  if (grip){                                    /* the opposite side or corner stays where it is; never smaller than one square */
    if (!selected.has(b) || selected.size > 1) pick([b]);
    const r = b.rect, right = r.x + r.w, bottom = r.y + r.h;
    cursor(getComputedStyle(el).cursor);
    return { end, move(p){
      const x0 = grip.includes('w') ? Math.min(snap(p.x), right - g) : r.x, x1 = grip.includes('e') ? Math.max(snap(p.x), r.x + g) : right;
      const y0 = grip.includes('n') ? Math.min(snap(p.y), bottom - g) : r.y, y1 = grip.includes('s') ? Math.max(snap(p.y), r.y + g) : bottom;
      /* what touches its right side follows that side; pulling its own left side away from a neighbour is allowed */
      keepTouching(() => { b.set({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); agree(b); }, (left, right) => right === b || (left === b && !grip.includes('e') && !b.sides.w));
      shown(); } };
  }
  /* shift, on a block in a group: that one block is pulled free. Its groups' frames stay where they are while it is
     carried; let go outside them, it has left. (Let go still inside one, it is in that one.) */
  const pulled = e?.shiftKey && chain(b).length ? chain(b).map(id => [id, boxOf(inGroup(id))]) : null;
  if (pulled){ pick([b]); room.loose = new Map(pulled); }
  if (!selected.has(b)) return;
  const start = [...selected].map(b => [b, b.rect]);
  let last = from;
  cursor('move');
  /* held over a group, that group lights up; let go there and the selection joins it */
  const held = new Set(selected), u = view.unit;
  const others = [...new Set([...space.groupOf.values(), ...space.groupUp.keys(), ...space.groupUp.values()])].filter(id => { const m = inGroup(id); return m.length && !m.some(x => held.has(x)); })
    .map(id => [id, boxOf(inGroup(id))]);      /* they do not move during the drag, so their boxes are worked out once */
  const within = (p, r) => p.x >= r.x - u / 2 && p.x <= r.x + r.w + u / 2 && p.y >= r.y - 1.25 * u && p.y <= r.y + r.h + u / 2;      /* the frame stands a little off its blocks, more above */
  return {
    end(){ const host = room.host; room.host = null; room.loose = null;
      end();
      if (pulled && host === null){ const stays = pulled.find(([, r]) => within(last, r));      /* innermost first */
        return bus.send('frame.leave', { id: b.id, frame: stays ? stays[0] : null }); }
      if (host !== null) bus.send('frame.enter', { ids: idsOf(held), frame: host }); },
    move(p){ const dx = snap(p.x - from.x), dy = snap(p.y - from.y); last = p;
      for (const [b, r] of start) b.set({ ...r, x: r.x + dx, y: r.y + dy });
      const over = others.filter(([, r]) => within(p, r));
      room.host = over.length ? over.reduce((a, c) => c[1].w * c[1].h < a[1].w * a[1].h ? c : a)[0] : null;      /* the innermost of those the pointer is in */
      shown(); } };
}
const room = { host: null, loose: null };      /* the group the dragged selection is held over; while a block is pulled out of its groups, group -> the frame it keeps */

/* ---- clicks ----
   A second click on the same thing soon after the first is a double click. */
const DOUBLE = 600;                            /* two clicks on the same thing within this many milliseconds are a double click */
let lastEl = null, lastAt = 0, beforeShift = null;      /* beforeShift: what was selected before the last shift-click, in case it turns out to be the first of two */
/* lets the user type a block a new name, where its name is. Adding or taking off the // is not a new name, so it brings
   no new colour. The typing puts the name on the block already: it is taken off again, and the message names it. */
function renaming(b){
  return b.rename((changed, was) => { const name = b.name, color = changed && isNamed(b) && bare(name) !== bare(was) ? someColour(b.shape.color) : null;
    b.call(was); bus.send('rename', { id: b.id, name, color }); });
}
function clicked(el, e){
  const twice = el === lastEl && e.timeStamp - lastAt < DOUBLE;
  lastEl = twice ? null : el; lastAt = e.timeStamp;
  /* the frame round the selection (dashed), or round a named group (solid): its buttons and its name */
  for (const [id, f] of [[null, bounds], ...space.frames]){
    if (!f.el.isConnected || !f.el.contains(el)) continue;
    const list = id === null ? [...selected] : inGroup(id);
    /* the group button: make the selection one group, or take it apart again */
    if (f.groupButton.contains(el)) return groupIs(list) !== null ? bus.send('unframe', { frame: groupIs(list) }) : bus.send('frame', { ids: idsOf(list) });
    /* the fold button: the group's blocks move into a new block with the group's name */
    if (f.foldButton.contains(el)) return bus.send('fold', { ids: idsOf(list), name: space.groupNames.get(id), color: someColour() });
    if (el === f.nameEl){
      /* a named group's name: the first click selects the group, a click once it is selected renames it */
      if (id !== null && groupIs([...selected]) !== id) return pick(list);
      f.nameEl.textContent = '';
      return editText(f.nameEl, name => bus.send('name', { frame: id, ids: idsOf(list), name: name || null, color: someColour() }));
    }
    return;
  }
  /* a shape standing in a matrix: it is the real shape, shown where it stands. A double click opens it, as it would on the canvas. */
  const tile = el.closest?.('[data-tile]');
  if (tile){ if (twice) bus.send('open', { id: tile.dataset.tile }); return; }
  /* an entry of this space's own matrix, if its block has been named: type a whole number, or inf / -inf, over it. Nothing typed puts the symbol back. */
  const entry = el.closest?.('.definition.editable [data-c]');
  if (entry){
    const [o, key] = entryHome(space.owner, +entry.dataset.c, +entry.dataset.r);      /* in a joined shape, the entry belongs to the shape it came from */
    pick([]); entry.textContent = o.values.has(key) ? written(o.values.get(key)) : '';
    return editText(entry, text => bus.send('entry.set', { id: o.id, key, text }));
  }
  /* a result's matrix: name it, and the blocks that came to it fold into a new block */
  const r = results.find(r => r.el.isConnected && r.el.contains(el));
  if (r){ const piece = r.piece; if (piece.blocks.length < 2) return; pick([]); return r.name(name => { if (name) bus.send('fold', { ids: idsOf(piece.blocks), name, color: someColour(), product: true }); }); }
  /* a measurement: double-click to type a length in whole units, a name for that side, or both; the block keeps its top-left corner */
  if (measure) for (const dim of ['w', 'h']) if (el === measure.labels[dim]){
    const b = [...selected][0];
    if (twice) editText(el, text => { if (text) bus.send('side.set', { id: b.id, dim, text }); else shown(); });
    return;                                     /* a click on a measurement never changes the selection */
  }
  const b = blockAt(el);
  /* shift and a double click: add or take away just this block, whatever group it is in. (The first click of the
     pair has already added or taken away its whole group; that is undone, and the one block changed instead.) */
  if (b && twice && e.shiftKey && el !== b.nameEl){
    const next = new Set(beforeShift || selected); next.has(b) ? next.delete(b) : next.add(b); beforeShift = null;
    return pick(next);
  }
  if (b && twice){                              /* double click */
    if (el === b.nameEl){ pick([b]); return renaming(b); }      /* on a name: rename it */
    if (selected.size === 1 && selected.has(b)) return bus.send('open', { id: b.id });             /* on a block selected alone: open its definition space */
    /* on a block in a selected group: step one group inwards, or to the block itself from the innermost */
    const outwards = chain(b).reverse(), at = outwards.indexOf(groupIs([...selected]));
    return pick(at + 1 < outwards.length && outwards.length > 1 ? inGroup(outwards[Math.max(at, 0) + 1]) : [b]);
  }
  /* a click on a block inside what is already selected, itself or one of its groups, leaves the selection as it is:
     otherwise the first half of a double click would hand the selection back to the outermost group, and the second
     half could never step inwards or open the block */
  if (b && !e.shiftKey && selected.has(b) && (selected.size === 1 || chain(b).includes(groupIs([...selected])))) return;
  /* shift and a click: add this block to the selection, or take it away, along with the whole of its outermost group */
  beforeShift = b && e.shiftKey ? new Set(selected) : null;
  pick(b ? members(b) : [], !!b && e.shiftKey);
}

/* what choosing a shape from "New" does, by the shape's "draw" */
const draw = {
  rectangle: shape => { select([]); const name = freeName();
    return drawRectangle(view, rect => createBlock(shape, rect, name)).then(block => { if (!block) return; block.el.remove();      /* what was drawn was a sketch: the message makes the block */
      bus.send('add', { type: shape.name, rect: block.rect, name }); }); },
};

/* the right-click menu. A right click on a block that is not selected selects it first, so Cut, Copy and Delete mean that block.
   Paste puts the copy where the click was. */
/* ---- messages ----
   What each message does. Its payload is plain data; blocks are named by id. The ones marked `changes` can alter the
   project; the rest look at it, move about in it, or change what is selected. */
const changes = { changes: true };
/* ---- undo and redo ----
   History is a tap on the bus (history.js). What it keeps is the whole project as it is saved, with where the user
   was: the space they were in and what was selected. Putting one back rebuilds the project from it (every block and
   group has its id again), keeps each space's view where it now is, and goes back to that place. */
const history = createHistory(bus, {
  snap: () => { const data = gather(); return { data, text: JSON.stringify(data.top), path: trail().slice(1).map(s => s.owner.id), selected: idsOf(selected) }; },
  same: (a, b) => a.text === b.text,
  restore(state){
    const views = new Map([[null, space === top ? view.camera() : top.camera]]);      /* each space's camera, by the id of the block it defines */
    for (const [b, s] of spaceOf) views.set(b.id, s === space ? view.camera() : s.camera);
    const kept = clipboard, name = current;
    rebuild(state.data); clipboard = kept; current = name;
    top.camera = views.get(null); for (const [b, s] of spaceOf) if (views.has(b.id)) s.camera = views.get(b.id);
    view.look(top.camera);
    for (const id of state.path){ const b = space.blocks.find(x => x.id === id); if (!b) break; open(b); }
    select(state.selected.map(blockOf).filter(b => b && space.blocks.includes(b)));
  } });
bus.on('undo', () => { const type = history.undo(); hud.say(type ? 'Undid ' + type : 'Nothing to undo'); });
bus.on('redo', () => { const type = history.redo(); hud.say(type ? 'Redid ' + type : 'Nothing to redo'); });
/* looking and moving about */
bus.on('select', ({ ids, toggle = false }) => select(ids.map(blockOf).filter(Boolean), { toggle }));
bus.on('select.box', () => {                   /* s: drag a box; every block it touches is selected. Press s again to leave without selecting. */
  if (boxing) return boxing.cancel();
  const box = boxing = boxSelect(view);
  return box.done.then(r => { boxing = null; if (!r) return;
    const hit = space.blocks.filter(b => b.rect.x < r.x + r.w && b.rect.x + b.rect.w > r.x && b.rect.y < r.y + r.h && b.rect.y + b.rect.h > r.y);
    /* a block the box touches brings its group only if the box crosses that group's frame or surrounds it: a box drawn
       wholly inside a frame picks out what it touches there (which may be a group inside, by the same rule) */
    const frame = g => { const m = boxOf(inGroup(g)), grow = namedBelow(g); return { x: m.x - 12 - 14 * grow, y: m.y - 32 - 34 * grow, w: m.w + 2 * (12 + 14 * grow), h: m.h + 32 + 34 * grow + 12 + 14 * grow }; };      /* as bounds.js draws it */
    const within = f => r.x > f.x && r.y > f.y && r.x + r.w < f.x + f.w && r.y + r.h < f.y + f.h;
    pick(new Set(hit.flatMap(b => { const g = chain(b).reverse().find(g => !within(frame(g))); return g === undefined ? [b] : inGroup(g); }))); }); });
bus.on('escape', () => selected.size || !space.parent || boxing ? select([]) : out());      /* with nothing selected, Escape steps out of a definition space */
bus.on('open', ({ id }) => { const b = blockOf(id); if (b) open(b); });
bus.on('space.out', out); bus.on('space.back', backIn);
bus.on('space.go', ({ index }) => { deeper.length = 0; go(trail()[index]); });
bus.on('camera', camera => { hud.show(camera); menu.close(); shown(); });
bus.on('camera.home', () => view.home());
bus.on('menu.open', ({ x, y, id }) => { const b = id && blockOf(id); if (b && !selected.has(b)) select(members(b));      /* a right click on a block that is not selected selects it first */
  menuAt = view.toWorld(x, y); menu.openAt(x, y); });
bus.on('variable.drag', ({ kind, x, y }) => { if (selected.size) select([]); if (kind === 'length') reach(x, y); });
bus.on('variable.end', () => { for (const m of near.values()) m.el.remove(); near.clear(); });
bus.on('new', ({ type }) => { const shape = typeNamed(type); return draw[shape.draw]?.(shape); });      /* begins drawing; 'add' is the block */
bus.on('copy', ({ ids: list }) => { selected.clear(); for (const b of list.map(blockOf)) if (b) selected.add(b); copy(); shown(); });
bus.on('save', ({ name = null }) => save(name));      /* name: what was typed when asked what to save it as */
bus.on('project.open', ({ name }) => openKept(name)); bus.on('project.pick', () => zipPicker.click());
/* changing the project */
bus.on('project.load', ({ files, name = null }) => openFrom(files, name), changes);
bus.on('add', ({ type, rect, name }) => { const b = makeBlock({ ...typeNamed(type) }, rect, name); space.blocks.push(b); view.world.append(b.el); shown(); }, changes);
bus.on('place', ({ rects }) => { for (const r of rects) blockOf(r.id)?.set({ x: r.x, y: r.y, w: r.w, h: r.h }); shown(); }, changes);      /* where blocks go, and how big: the end of a move or a resize */
/* these act on the blocks they name: what was selected when they were sent. paste carries what it pastes. */
const chosen = fn => ({ ids: list }) => { selected.clear(); for (const b of list.map(blockOf)) if (b && space.blocks.includes(b)) selected.add(b); return fn(); };
bus.on('cut', chosen(cut), changes); bus.on('delete', chosen(remove), changes);
bus.on('transpose', chosen(transpose), changes); bus.on('join', chosen(joinShapes), changes); bus.on('disjoin', chosen(disjoin), changes);
bus.on('paste', ({ at, pasted }) => paste(at, pasted), changes);
/* what comes from outside the program is a message too, so the log says so: the theme the computer asks for */
bus.on('theme', ({ set }) => { if (set !== undefined) hostTheme = set; defaults = null; shown(); });
bus.on('rename', ({ id, name, color }) => { const b = blockOf(id); if (!b) return; b.call(name); renamed(b, color); }, changes);
bus.on('entry.set', ({ id, key, text }) => { const o = blockOf(id), v = text === null ? undefined : readEntry(text);      /* nothing typed puts the symbol back; anything that is not a number is not taken */
  if (o){ if (v === null) o.values.delete(key); else if (v !== undefined) o.values.set(key, v); }
  write(); shown(); }, changes);
bus.on('side.set', ({ id, dim, text }) => { const b = blockOf(id); if (b) typed(b, dim, text); shown(); }, changes);
/* a frame is several shapes held together (in the code, and in projects saved before, a group) */
bus.on('frame', ({ ids }) => { group(ids.map(blockOf).filter(Boolean)); shown(); hud.say('Framed: click its name to name it'); }, changes);
bus.on('unframe', ({ frame: g }) => { ungroup(g); tidy(); shown(); hud.say('Frame taken off'); }, changes);
bus.on('frame.enter', ({ ids, frame: host }) => { const held = new Set(ids.map(blockOf).filter(Boolean));
  for (const b of held){ const outer = chain(b).at(-1);
    if (outer !== undefined && inGroup(outer).every(x => held.has(x))) space.groupUp.set(outer, host); else space.groupOf.set(b, host); }      /* a whole group goes in as a group */
  tidy(); shown(); }, changes);
/* a whole frame set down again from the list: everything in it, made anew, centred where it was dropped */
bus.on('replicate', ({ frame, at }) => { const s = trail().find(s => s.groupNames.has(frame)); if (!s) return;
  const pictures = inGroup(frame, s).map(b => picture(b, s));
  for (const p of pictures) p.groups = p.groups.slice(0, p.groups.findIndex(g => g.id === frame) + 1);      /* the frame and what is inside it, not the frames it is in */
  paste(at, pictures); }, changes);
bus.on('frame.leave', ({ id, frame: g }) => { const b = blockOf(id); if (b){ if (g === null) space.groupOf.delete(b); else space.groupOf.set(b, g); } tidy(); shown(); }, changes);      /* pulled free of its group, as far out as g: null is out of them all */
/* a name given to a frame: a named group is renamed; a group without one is named, and stays, framed; a plain selection folds into a new block of that name */
bus.on('name', ({ frame: id, ids, name, color }) => { const list = ids.map(blockOf).filter(Boolean);
  if (name && id !== null) space.groupNames.set(id, name);
  else if (name && groupIs(list) !== null) space.groupNames.set(groupIs(list), name);
  else if (name && list.length && list.every(b => space.blocks.includes(b))) return fold(foldable(list), name, color);
  shown(); }, changes);
/* blocks move into a new block of that name: a group's, as they are, or (product) a product's, as what it comes to */
bus.on('fold', ({ ids, name, color, product = false }) => { const list = ids.map(blockOf).filter(Boolean); if (!list.length || !list.every(b => space.blocks.includes(b))) return;
  const piece = product && results.find(r => r.el.isConnected && r.piece && r.piece.blocks.length === list.length && list.every(b => r.piece.blocks.includes(b)))?.piece;
  if (product && (!piece || piece.type.error)) return;
  fold(piece || foldable(list), name, color); }, changes);
bus.on('use', ({ id, at }) => { const v = blockOf(id); if (v) useShape(v, at); }, changes);
bus.on('slot', ({ into, id, cx, cy }) => { const a = blockOf(into), v = blockOf(id); if (a && v) slotIn(a, v, cx, cy); }, changes);
bus.on('summon', ({ name, key, group: all, at }) => { summon({ name, key, group: all }, at); shown(); }, changes);
bus.on('length.add', ({ name, units, at }) => { const u = view.unit, on = v => Math.round(v / u) * u, h = units * u;      /* a named length set down on the canvas: a vector that long */
  const b = makeBlock({ ...typeNamed('tensor') }, { x: on(at.x - u / 2), y: on(at.y - h / 2), w: u, h }, freeName());
  b.sides = { w: null, h: name }; space.blocks.push(b); view.world.append(b.el); select([b]); }, changes);

let menuAt = { x: 0, y: 0 };
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl ';
const menu = createMenu([
  { label: 'New', items: () => shapes.map(shape => ({ label: shape.label || shape.name, run: () => bus.send('new', { type: shape.name }) })) },
  { label: 'Undo', hint: mod + 'Z', disabled: () => !history.canUndo(), run: () => bus.send('undo') },
  { label: 'Redo', hint: mod + (mod === '⌘' ? '⇧Z' : 'Y'), disabled: () => !history.canRedo(), run: () => bus.send('redo') },
  { label: 'Cut', hint: mod + 'X', disabled: () => !selected.size, run: () => bus.send('cut', { ids: idsOf(selected) }) },
  { label: 'Copy', hint: mod + 'C', disabled: () => !selected.size, run: () => bus.send('copy', { ids: idsOf(selected) }) },
  { label: 'Paste', hint: mod + 'V', disabled: () => !clipboard, run: () => bus.send('paste', { at: menuAt, pasted: clipboard }) },
  { label: 'Transpose', hint: 'T', disabled: () => !selected.size, run: () => bus.send('transpose', { ids: idsOf(selected) }) },
  { label: 'Join', disabled: () => !fitsTogether([...selected]), run: () => bus.send('join', { ids: idsOf(selected) }) },
  { label: 'Disjoin', disabled: () => ![...selected].some(b => b.members), run: () => bus.send('disjoin', { ids: idsOf(selected) }) },
  { label: 'Delete', hint: 'X', disabled: () => !selected.size, run: () => bus.send('delete', { ids: idsOf(selected) }) },
  { label: 'Save project', run: () => { const name = kept ? (window.prompt('Save this project as', current || 'untitled') || '').trim() : null;      /* asked here, so the message says what was answered */
    if (kept && !name) return hud.say('Not saved'); bus.send('save', { name }); } },
  { label: 'Open project', items: () => kept ? kept.map(name => ({ label: name, run: () => bus.send('project.open', { name }) })) : [{ label: 'From a zip', run: () => bus.send('project.pick') }] },
]);
const hud = createHud({ onHome: () => bus.send('camera.home') });
const crumbs = createCrumbs({ onGo: index => bus.send('space.go', { index }) });
const view = createView({
  onChange: camera => bus.send('camera', camera),
  onMenu: (x, y, el) => bus.send('menu.open', { x, y, id: blockAt(el)?.id ?? null }),
  onClick: clicked,                             /* these two read the pointer, and send what it amounts to */
  onDrag: dragged,
});
document.body.append(view.el, menu.el, hud.el, crumbs.el, variables.el);
hud.show(view.camera());
