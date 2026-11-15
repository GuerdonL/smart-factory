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
import { createVariables } from './components/variables.js';
import { createJoin } from './components/join.js';
import { createResult } from './components/result.js';
import { joins, pieces, typeOf, initials, readEntry } from './algebra.js';
import * as project from './project.js';
import { zip, unzip } from './zip.js';
import { written, squares } from './components/matrix.js';

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
  const o = space.owner, r = o.rect;
  space.definition = createDefinition({ cols: Math.round(r.w / view.unit), rows: Math.round(r.h / view.unit), unit: view.unit,
    name: o.name, letter: initials(o.name), color: isNamed(o) ? o.shape.color : null, values: o.values, inherited: inheritedBy(o, space.parent), editable: isNamed(o),      /* a named block's matrix is written in its colour */
    colsName: o.sides.w, rowsName: o.sides.h });
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
  if (type === 'mouseup') e.button === 3 ? out() : backIn();
}, true);

/* a block is named once it has been given a name of its own, in place of the "Shape n" it was drawn with.
   Naming a block gives it a colour (never the red of an unnamed one), and only a named block's entries can be given numbers. */
/* A block whose name begins with // is commented out: it stays on the canvas, and can be moved, resized and opened,
   but it takes no part in anything. It does not multiply, has no result, and does not count towards a definition. */
const isOff = b => /^\s*\/\//.test(b.name);
const bare = name => name.replace(/^\s*\/\/\s*/, '');                  /* a name without its comment mark */
const isNamed = b => !/^Shape \d+$/.test(bare(b.name));
const PALETTE = ['lavender', 'watermelon', 'lazuli', 'fanta', 'marigold', 'lagoon'];      /* colours in the theme */
function someColour(not){                        /* one this space is not using, while there is one; never the one it has */
  const used = new Set(space.blocks.map(b => b.shape.color)), free = PALETTE.filter(c => !used.has(c) && c !== not);
  const from = free.length ? free : PALETTE.filter(c => c !== not);
  return from[Math.floor(Math.random() * from.length)];
}
function renamed(b, changed, was){                /* adding or taking off the // is not a new name, so it brings no new colour */
  if (changed && isNamed(b) && bare(b.name) !== bare(was)) b.paint(someColour(b.shape.color));
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
function inReach(){
  const spaces = trail(), items = [], seen = new Set(), names = new Set();
  for (const s of spaces) for (const b of s.blocks){
    if (isNamed(b) && !isOff(b) && !seen.has(b) && !spaces.includes(spaceOf.get(b))){       /* not the one whose definition we are standing in */
      for (const k of kinOf(b)) seen.add(k);
      items.push({ kind: 'shape', name: b.name, color: b.shape.color, cols: b.rect.w / view.unit, rows: b.rect.h / view.unit, block: b }); }
    for (const dim of ['w', 'h']) if (b.sides[dim] && !names.has(b.sides[dim])){ names.add(b.sides[dim]); items.push({ kind: 'length', name: b.sides[dim], units: b.rect[dim] / view.unit }); }
  }
  /* of several definitions of one name, the lowest is the one in reach: it shadows the others. Dotted names are kept out. */
  const lowest = new Map(); for (const i of items) if (i.kind === 'shape') lowest.set(bare(i.name).trim(), i);
  const shapes = items.filter(i => i.kind === 'shape' && lowest.get(bare(i.name).trim()) === i && !isHidden(i.name));
  return [...shapes, ...items.filter(i => i.kind === 'length')];
}
const systemItems = () => [{ kind: 'system', name: CONFIG, group: true, color: 'muted', cols: 3, rows: 3 }, { kind: 'system', name: COLORS, group: true, color: 'muted', cols: 3, rows: 2 },
  ...SYSTEM.map(key => ({ kind: 'system', name: '.' + key, key, color: key, cols: 3, rows: 1 }))];
/* another use of a shape variable, centred on a world point */
function useShape(of, at){
  const u = view.unit, on = v => Math.round(v / u) * u, r = of.rect;
  const b = createBlock({ ...of.shape }, { x: on(at.x - r.w / 2), y: on(at.y - r.h / 2), w: r.w, h: r.h }, of.name);
  b.sides = { ...of.sides }; b.values = of.values;                                         /* the same entries, not a copy */
  if (!spaceOf.has(of)){ const def = newSpace(of, space); for (const k of kinOf(of)) spaceOf.set(k, def); }
  spaceOf.set(b, spaceOf.get(of));                                                          /* the same definition */
  const set = kin.get(of) || new Set([of]); set.add(b); for (const k of set) kin.set(k, set);
  space.blocks.push(b); view.world.append(b.el); select([b]);
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
  onDrag: (item, x, y) => { if (selected.size) select([]); if (item.kind === 'length') reach(x, y); },
  onDrop: (item, x, y) => {
    if (item.kind === 'shape') return useShape(item.block, view.toWorld(x, y));
    if (item.kind === 'system'){ summon(item, view.toWorld(x, y)); return shown(); }
    const target = reach(x, y), u = view.unit;
    if (target) typed(target.b, target.dim, item.name);                                     /* onto a side: that side takes the name, and its length */
    else { const at = view.toWorld(x, y), on = v => Math.round(v / u) * u, h = item.units * u;      /* onto the canvas: a vector that long */
      const b = createBlock({ ...typeNamed('tensor') }, { x: on(at.x - u / 2), y: on(at.y - h / 2), w: u, h }, freeName());
      b.sides = { w: null, h: item.name }; space.blocks.push(b); view.world.append(b.el); select([b]); }
    shown(); },
  onEnd: () => { for (const m of near.values()) m.el.remove(); near.clear(); },
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
let nextGroup = 1;
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
  const g = nextGroup++, done = new Set();
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
      if (holds < (s.groupNames.has(g) ? 1 : 2)){ ungroup(g, s); again = true; break; } } }      /* a named group may hold a single thing */
  const live = new Set([...s.groupOf.values(), ...s.groupUp.values()]);
  for (const id of [...s.groupNames.keys()]) if (!live.has(id)) s.groupNames.delete(id);
}
/* how many levels of named groups sit strictly inside these blocks' frame: 0 if none */
const namedBelow = id => Math.max(0, ...[...space.groupUp].filter(([, up]) => up === id).map(([c]) => (space.groupNames.has(c) ? 1 : 0) + namedBelow(c)));      /* the same, for a group: by what is grouped inside it */
function namedWithin(list, not = []){             /* not: the groups already counted on the way in (two may hold exactly the same blocks) */
  let most = 0;
  for (const [id] of space.groupNames){ if (not.includes(id)) continue; const m = inGroup(id);
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
const bounds = createBounds();
const results = [];                            /* the Menu's "= …", one for each piece */
let marks = [];                                /* the product marks now on the canvas */
/* ---- shadowing ----
   A variable is defined at the highest space that mentions it. A shape of the same name further down is a new
   definition that shadows the one above, from its own space downwards, but only in the parts it gives: an entry it
   leaves blank is still the entry from above (written faintly in its matrix), and an entry it gives covers it.

   The program's own variables are there from the start, above the Menu. Their names begin with a dot, and they are
   kept out of the list at the right edge, behind its plus button. They are .config, which holds .colors, which holds
   one variable for each plain colour of the theme (.tensor, .bg, ...): a shape of three entries, red green blue.
   A group named .config shadows the program's .config from its space downwards, and one further down shadows it
   again. Only what is in it counts: a shape named for a system variable, anywhere in the group (in a .colors group
   inside it or not), covers the entries it gives and no others. Anything else in the group is a new attribute, which
   the program does not read. A commented-out shape, or a group called //.config, takes no part. */
const CONFIG = '.config', COLORS = '.colors', rootStyle = document.documentElement.style;
const SYSTEM = ['tensor', 'data-in', 'lavender', 'watermelon', 'lazuli', 'fanta', 'marigold', 'lagoon', 'bg', 'fg', 'muted', 'panel', 'line', 'hover', 'dot', 'focus', 'fade-to', 'warn', 'select', 'measure'];
const leaf = name => bare(name).trim().toLowerCase().replace(/^(--|\.)/, '').replace(/\s+/g, '-');      /* ".Data in" -> "data-in" */
const isHidden = name => bare(name).trim().startsWith('.');
const cells = b => { const u = view.unit, cols = Math.round(b.rect.w / u), rows = Math.round(b.rect.h / u), v = [];      /* a block's entries, row by row */
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) v.push(b.values.get(c + ',' + r)); return v; };
let defaults = null;                           /* the theme's own colours, read with nothing of ours laid over them */
function programDefaults(){
  if (defaults) return defaults;
  for (const key of SYSTEM) rootStyle.removeProperty('--' + key);
  const probe = document.body.appendChild(document.createElement('i')); defaults = new Map();
  for (const key of SYSTEM){ probe.style.color = `var(--${key})`; defaults.set(key, (getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(n => Math.round(+n))); }
  probe.remove(); return defaults;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { defaults = null; shown(); });
new MutationObserver(() => { defaults = null; shown(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
const inConfig = (b, s) => chain(b, s).some(g => (s.groupNames.get(g) || '').trim() === CONFIG);
/* a system colour as it stands after the .configs of these spaces, highest first, have each covered what they give */
function systemValue(key, spaces){
  const v = [...programDefaults().get(key)];
  for (const s of spaces) for (const b of s.blocks) if (!isOff(b) && leaf(b.name) === key && inConfig(b, s))
    cells(b).slice(0, 3).forEach((n, i) => { if (Number.isFinite(n)) v[i] = Math.max(0, Math.min(255, n)); });
  return v;
}
function configure(){
  const base = programDefaults(), spaces = trail();
  for (const key of SYSTEM){ const v = systemValue(key, spaces);
    if (v.join() === base.get(key).join()) rootStyle.removeProperty('--' + key); else rootStyle.setProperty('--' + key, `rgb(${v.join(', ')})`); }
}
/* what the definitions above give to a block, for the entries it leaves blank. s is the space the block is in. */
function inheritedBy(b, s){
  const above = []; for (let p = s.parent; p; p = p.parent) above.unshift(p);
  const key = leaf(b.name), got = new Map(), cols = Math.round(b.rect.w / view.unit);
  if (inConfig(b, s)){ if (programDefaults().has(key)) systemValue(key, above).forEach((n, i) => got.set((i % cols + 1) + ',' + (Math.floor(i / cols) + 1), n));
    return got; }                                /* in a .config: what the program and the .configs above make of it */
  if (!isNamed(b)) return got;
  const name = bare(b.name).trim(), mine = new Set(kinOf(b));
  for (const p of above) for (const o of p.blocks) if (!isOff(o) && !mine.has(o) && bare(o.name).trim() === name) for (const [k, n] of o.values) got.set(k, n);
  return got;
}
/* a system variable dragged in from the list: blank shapes that shadow it, in this space's .config (made if there is
   none). One colour brings one shape; .colors or .config brings every colour, in a .colors group. */
function summon(item, at){
  const u = view.unit, on = v => Math.round(v / u) * u, keys = item.group ? SYSTEM : [item.key], made = [];
  keys.forEach((key, i) => { const b = createBlock({ ...typeNamed('tensor'), color: key }, { x: on(at.x) + (i % 2) * 6 * u, y: on(at.y) + Math.floor(i / 2) * 2 * u, w: 3 * u, h: u }, '.' + key);
    space.blocks.push(b); view.world.append(b.el); made.push(b); });
  let config = [...space.groupNames].find(([, name]) => name.trim() === CONFIG)?.[0];
  if (config === undefined){ config = nextGroup++; space.groupNames.set(config, CONFIG); }
  let into = config;
  if (item.group){ into = nextGroup++; space.groupNames.set(into, COLORS); space.groupUp.set(into, config); }
  for (const b of made) space.groupOf.set(b, into);
  select(made);
}

function shown(){                              /* brings what is on screen in line with the selection and the blocks' positions */
  configure();
  const list = [...selected], one = list.length === 1 ? list[0] : null;
  for (const b of space.blocks){ b.select(selected.has(b)); b.dim(selected.size > 0 && !selected.has(b)); b.grips(!(list.length > 1 && selected.has(b))); }
  if (one){ measure ||= createMeasure(view.unit); view.world.append(measure.el); measure.set(one.rect, { ...sides(view, one.rect), wName: one.sides.w, hName: one.sides.h }); }
  else measure?.el.remove();
  /* named groups keep their frames; the one that is the whole selection also carries the tools */
  const oneGroup = groupIs(list), live = new Set();
  for (const [id, name] of space.groupNames){
    const ms = inGroup(id); if (ms.length < 2) continue;
    live.add(id); if (!space.frames.has(id)) space.frames.set(id, createBounds());
    const f = space.frames.get(id), on = id === oneGroup;
    f.set(boxOf(ms), { name, solid: true, selected: on, tools: on, grouped: true, fold: true, grow: namedBelow(id) }); view.world.append(f.el);
  }
  for (const [id, f] of space.frames) if (!live.has(id)){ f.el.remove(); space.frames.delete(id); }
  /* any other selection of several gets the dashed box, with a name to fill in */
  if (list.length > 1 && !live.has(oneGroup)){
    bounds.set(boxOf(list), { selected: true, tools: true, grouped: oneGroup !== null, grow: namedWithin(list) });
    view.world.append(bounds.el);
  } else bounds.el.remove();
  /* the algebra of what is here: a mark wherever two blocks touch and multiply, and whether it all comes to the promised size */
  for (const b of space.blocks) b.off(isOff(b));
  const u = view.unit, active = space.blocks.filter(b => !isOff(b) && !inConfig(b, space));           /* commented-out blocks take no part, nor what is in a .config */
  const rects = active.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u, wName: b.sides.w, hName: b.sides.h }));
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
    return bs.length === 1 ? { letter: initials(first.name), color: first.shape.color, values: first.values }
      : { product: { rows: { letter: initials(first.name), color: first.shape.color }, cols: { letter: initials(last.name), color: last.shape.color } } }; };
  /* a definition space sets what is here beside its block's promised size. The Menu has no promise, so it
     writes out what each piece comes to, beside that piece. (Shapes that do not touch are separate pieces.) */
  const all = pieces(rects);
  space.definition?.check(!all.length ? null : all.length === 1 ? all[0].type : { error: all.length + ' pieces' }, all.length === 1 ? lookOf(all[0]) : {});
  const ps = space.owner ? [] : all;
  /* a result goes to the right of its piece; if something else is there (another block, or a result already placed),
     it goes below instead, as far down as it takes to be clear */
  const taken = space.blocks.map(b => b.rect),      /* commented-out blocks are still in the way */
     hits = r => taken.some(t => t !== r && t.x < r.x + r.w && t.x + t.w > r.x && t.y < r.y + r.h && t.y + t.h > r.y);
  ps.forEach((piece, i) => { const r = results[i] ||= createResult({ unit: u }); view.world.prepend(r.el);
    const box = { x: piece.box.x * u, y: piece.box.y * u, w: piece.box.w * u, h: piece.box.h * u }, look = lookOf(piece);
    r.piece = { blocks: piece.members.map(m => active[m]), type: piece.type, box };       /* what this result is the result of */
    /* a product can be named, folding its blocks into one; a block on its own already is one, and has its own name */
    const nameable = piece.members.length > 1;
    let at = r.set(box, piece.type, { look, nameable });
    for (let drop = 0; hits(at) && drop < 60; drop++) at = r.set(box, piece.type, { side: 'below', drop, look, nameable });
    taken.push(at); });
  for (const r of results.slice(ps.length)) r.el.remove();
  variables.show(inReach(), systemItems());
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
function fold({ blocks: inside, type, box }, name){
  const u = view.unit;
  const made = createBlock({ ...typeNamed('tensor'), color: someColour() },
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
const picture = (b, s) => ({ shape: b.shape, rect: { ...b.rect }, name: b.name, sides: { ...b.sides }, values: new Map(b.values), groups: chain(b, s).map(g => ({ id: g, name: s.groupNames.get(g) ?? null })),      /* the groups it is in, innermost first */
 
  inside: spaceOf.has(b) ? spaceOf.get(b).blocks.map(o => picture(o, spaceOf.get(b))) : null });
function copy(){ if (selected.size) clipboard = [...selected].map(b => picture(b, space)); }
function cut(){ if (selected.size){ copy(); remove(); } }
/* makes the blocks in pictures inside space s, moved by (dx, dy); blocks that were grouped together are grouped together again */
function develop(pictures, s, dx, dy){
  const u = view.unit, groups = new Map(), made = [];
  for (const pic of pictures){
    const r = { ...pic.rect, x: pic.rect.x + dx, y: pic.rect.y + dy };
    for (const dim of ['w', 'h']) if (pic.sides[dim] && lengthCalled(pic.sides[dim], s) !== undefined) r[dim] = lengthCalled(pic.sides[dim], s);      /* a named side is whatever length that name is now */
    const name = s === space && /^Shape \d+$/.test(pic.name) ? freeName() : pic.name;      /* a block never given a name of its own gets a fresh number */
    const b = createBlock(pic.shape, r, name); b.sides = { ...pic.sides }; b.values = new Map(pic.values);
    s.blocks.push(b); made.push(b);
    pic.groups.forEach((g, i) => { if (!groups.has(g.id)){ groups.set(g.id, nextGroup++); if (g.name) s.groupNames.set(groups.get(g.id), g.name); }
      if (i === 0) s.groupOf.set(b, groups.get(g.id)); else s.groupUp.set(groups.get(pic.groups[i - 1].id), groups.get(g.id)); });
    if (pic.inside){ const def = newSpace(b, s); spaceOf.set(b, def); develop(pic.inside, def, 0, 0); }
  }
  tidy(s);                                     /* a group of which only part was copied may not be a group here */
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
  for (const b of gone){ b.el.remove(); space.blocks.splice(space.blocks.indexOf(b), 1); spaceOf.delete(b);
    const set = kin.get(b); if (set){ set.delete(b); kin.delete(b); if (set.size < 2) for (const k of set) kin.delete(k); } }      /* one use fewer of its variable */
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
  const plain = s => ({
    shapes: s.blocks.map(b => ({ type: b.shape.name || 'tensor', name: b.name, color: b.shape.color, x: b.rect.x / u, y: b.rect.y / u, cols: b.rect.w / u, rows: b.rect.h / u,
      colsName: b.sides.w, rowsName: b.sides.h, entries: Object.fromEntries(b.values), inside: spaceOf.has(b) ? plain(spaceOf.get(b)) : null, variable: number(b) })),
    groups: tree(s, undefined) });
  /* the groups of s directly inside group `up` (undefined: inside none), each with the blocks and groups directly inside it */
  const tree = (s, up) => [...new Set([...s.groupOf.values(), ...s.groupUp.keys(), ...s.groupUp.values()])].filter(g => s.groupUp.get(g) === up)
    .map(g => ({ name: s.groupNames.get(g) || null, members: s.blocks.map((b, i) => s.groupOf.get(b) === g ? i : -1).filter(i => i >= 0), groups: tree(s, g) }));
  return { top: plain(top), saved: new Date().toISOString() };
}
/* the reverse: everything on the page is replaced by what the data describes */
function rebuild(data){
  go(top); select([]);
  for (const s of [top]){ for (const b of s.blocks) b.el.remove(); for (const f of s.frames.values()) f.el.remove();
    s.blocks.length = 0; s.groupOf.clear(); s.groupUp.clear(); s.groupNames.clear(); s.frames.clear(); }
  spaceOf.clear(); kin.clear(); deeper.length = 0; clipboard = null;
  const uses = new Map();                        /* a variable's number -> the blocks that are uses of it */
  const u = view.unit;
  const fill = (plain, s) => {
    for (const d of plain.shapes){ const type = typeNamed(d.type);
      const b = createBlock({ ...type, color: d.color || type.color }, { x: d.x * u, y: d.y * u, w: d.cols * u, h: d.rows * u }, d.name);
      b.sides = { w: d.colsName, h: d.rowsName }; b.values = new Map(Object.entries(d.entries)); s.blocks.push(b);
      const first = d.variable != null && uses.get(d.variable)?.[0];
      if (d.variable != null) uses.set(d.variable, [...(uses.get(d.variable) || []), b]);
      if (first){ b.values = first.values; if (spaceOf.has(first)) spaceOf.set(b, spaceOf.get(first)); continue; }      /* a later use: the first one's entries and definition */
      if (d.inside){ const def = newSpace(b, s); spaceOf.set(b, def); fill(d.inside, def); } }
    const regroup = (g, up) => { const id = nextGroup++; if (up !== undefined) s.groupUp.set(id, up); if (g.name) s.groupNames.set(id, g.name);
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
const DEFAULT_MENU = ['project.json', 'Start.group.json', 'Settings.group.json', '.config'];   /* the files of projects/default-menu */
let kept = null, current = null;               /* kept: the names of the server's projects, or null with no server; current: the one open */
const ask = () => fetch('api/projects').then(r => r.ok ? r.json() : null).then(list => { kept = Array.isArray(list) ? list : null; }).catch(() => { kept = null; });
/* at the start, the Menu is opened from the server: the project called "menu" if one has been saved, otherwise the
   one that comes with the repository. Saving then offers "menu", so the first save makes it your own. */
ask().then(() => { const first = kept && ['menu', 'default-menu'].find(name => kept.includes(name));
  if (first) openKept(first).then(() => { current = 'menu'; });
  else if (!kept) Promise.all(DEFAULT_MENU.map(path => fetch('projects/default-menu/' + path).then(r => r.ok ? r.text() : Promise.reject()).then(text => ({ path, text }), e => path.startsWith('.') ? null : Promise.reject(e))))
    .then(files => openFrom(files.filter(Boolean), 'menu')).catch(() => {}); });   /* no server: the default Menu's files, if they sit beside the page */

async function save(){
  const data = gather(), files = project.write(data), what = `${count(data)} shapes in ${files.length} files`;
  try {
    if (kept){                                   /* on the server, under a name */
      const name = (window.prompt('Save this project as', current || 'untitled') || '').trim();
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
function openFrom(files, name = null){ const data = project.read(files); rebuild(data); current = name; hud.say(`Opened ${name ? name + ': ' : ''}${count(data)} shapes`); }
const openKept = name => fetch('api/projects/' + encodeURIComponent(name)).then(r => r.ok ? r.json() : Promise.reject(new Error('the server answered ' + r.status)))
  .then(files => openFrom(files, name)).catch(e => hud.say('Could not open: ' + (e.message || e)));
const zipPicker = Object.assign(document.createElement('input'), { type: 'file', accept: '.zip,application/zip', hidden: true });
document.body.append(zipPicker);
zipPicker.addEventListener('change', async () => { const file = zipPicker.files[0]; zipPicker.value = ''; if (!file) return;
  try { openFrom(await unzip(new Uint8Array(await file.arrayBuffer()))); } catch (e) { hud.say('Could not open: ' + (e.message || e)); } });

/* ---- keys ---- */
let boxing = null;                             /* the box selection in progress, if any */
addEventListener('keydown', e => {
  /* Ctrl or Cmd with c copies the selection; with x cuts it (copies, then removes); with v pastes in the middle of the screen. (While typing in a name or a
     measurement these keys never reach here, so text is copied and pasted as usual.) */
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'c' || e.key === 'C')){ if (selected.size){ e.preventDefault(); copy(); } return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'x' || e.key === 'X')){ if (selected.size){ e.preventDefault(); cut(); } return; }
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
const DOUBLE = 600;                            /* two clicks on the same thing within this many milliseconds are a double click */
let lastEl = null, lastAt = 0, beforeShift = null;      /* beforeShift: what was selected before the last shift-click, in case it turns out to be the first of two */
function clicked(el, e){
  const twice = el === lastEl && e.timeStamp - lastAt < DOUBLE;
  lastEl = twice ? null : el; lastAt = e.timeStamp;
  /* the frame round the selection (dashed), or round a named group (solid): its buttons and its name */
  for (const [id, f] of [[null, bounds], ...space.frames]){
    if (!f.el.isConnected || !f.el.contains(el)) continue;
    const list = id === null ? [...selected] : inGroup(id);
    /* the group button: make the selection one group, or take it apart again */
    if (f.groupButton.contains(el)){
      if (groupIs(list) !== null){ ungroup(groupIs(list)); tidy(); } else group(list);
      return shown();
    }
    /* the fold button: the group's blocks move into a new block with the group's name */
    if (f.foldButton.contains(el)) return fold(foldable(list), space.groupNames.get(id));
    if (el === f.nameEl){
      /* a named group's name: the first click selects the group, a click once it is selected renames it */
      if (id !== null && groupIs([...selected]) !== id) return select(list);
      f.nameEl.textContent = '';
      return editText(f.nameEl, name => {
        if (name && id !== null) space.groupNames.set(id, name);                                      /* rename a named group */
        else if (name && groupIs(list) !== null) space.groupNames.set(groupIs(list), name);          /* name a group: it stays here, framed */
        else if (name && list.every(b => space.blocks.includes(b))) return fold(foldable(list), name); /* name a plain selection: it folds into a new block */
        shown(); });
    }
    return;
  }
  /* an entry of this space's own matrix, if its block has been named: type a whole number, or inf / -inf, over it. Nothing typed puts the symbol back. */
  const entry = el.closest?.('.definition.editable [data-c]');
  if (entry){
    const o = space.owner, key = entry.dataset.c + ',' + entry.dataset.r;
    select([]); entry.textContent = o.values.has(key) ? written(o.values.get(key)) : '';
    return editText(entry, text => { const v = text === null ? undefined : readEntry(text);
      if (v === null) o.values.delete(key); else if (v !== undefined) o.values.set(key, v);
      write(); shown(); });
  }
  /* a result's matrix: name it, and the blocks that came to it fold into a new block */
  const r = results.find(r => r.el.isConnected && r.el.contains(el));
  if (r){ const piece = r.piece; if (piece.blocks.length < 2) return; select([]); return r.name(name => { if (name && !piece.type.error && piece.blocks.every(b => space.blocks.includes(b))) fold(piece, name); }); }
  /* a measurement: double-click to type a length in whole units, a name for that side, or both; the block keeps its top-left corner */
  if (measure) for (const dim of ['w', 'h']) if (el === measure.labels[dim]){
    const b = [...selected][0];
    if (twice) editText(el, text => { if (text) typed(b, dim, text); shown(); });
    return;                                     /* a click on a measurement never changes the selection */
  }
  const b = blockAt(el);
  /* shift and a double click: add or take away just this block, whatever group it is in. (The first click of the
     pair has already added or taken away its whole group; that is undone, and the one block changed instead.) */
  if (b && twice && e.shiftKey && el !== b.nameEl){
    const next = new Set(beforeShift || selected); next.has(b) ? next.delete(b) : next.add(b);
    selected.clear(); for (const x of next) selected.add(x); beforeShift = null;
    return shown();
  }
  if (b && twice){                              /* double click */
    if (el === b.nameEl){ select([b]); return b.rename((changed, was) => renamed(b, changed, was)); }      /* on a name: rename it */
    if (selected.size === 1 && selected.has(b)) return open(b);             /* on a block selected alone: open its definition space */
    /* on a block in a selected group: step one group inwards, or to the block itself from the innermost */
    const outwards = chain(b).reverse(), at = outwards.indexOf(groupIs([...selected]));
    return select(at + 1 < outwards.length && outwards.length > 1 ? inGroup(outwards[Math.max(at, 0) + 1]) : [b]);
  }
  /* a click on a block inside what is already selected, itself or one of its groups, leaves the selection as it is:
     otherwise the first half of a double click would hand the selection back to the outermost group, and the second
     half could never step inwards or open the block */
  if (b && !e.shiftKey && selected.has(b) && (selected.size === 1 || chain(b).includes(groupIs([...selected])))) return;
  /* shift and a click: add this block to the selection, or take it away, along with the whole of its outermost group */
  beforeShift = b && e.shiftKey ? new Set(selected) : null;
  select(b ? members(b) : [], { toggle: !!b && e.shiftKey });
}

/* what choosing a shape from "New" does, by the shape's "draw" */
const draw = {
  rectangle: shape => { select([]); const name = freeName();
    return drawRectangle(view, rect => createBlock(shape, rect, name)).then(block => { if (block){ space.blocks.push(block); shown(); } }); },
};

/* the right-click menu. A right click on a block that is not selected selects it first, so Cut, Copy and Delete mean that block.
   Paste puts the copy where the click was. */
let menuAt = { x: 0, y: 0 };
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl ';
const menu = createMenu([
  { label: 'New', items: () => shapes.map(shape => ({ label: shape.label || shape.name, run: () => draw[shape.draw]?.(shape) })) },
  { label: 'Cut', hint: mod + 'X', disabled: () => !selected.size, run: cut },
  { label: 'Copy', hint: mod + 'C', disabled: () => !selected.size, run: copy },
  { label: 'Paste', hint: mod + 'V', disabled: () => !clipboard, run: () => paste(menuAt) },
  { label: 'Delete', hint: 'X', disabled: () => !selected.size, run: remove },
  { label: 'Save project', run: save },
  { label: 'Open project', items: () => kept ? kept.map(name => ({ label: name, run: () => openKept(name) })) : [{ label: 'From a zip', run: () => zipPicker.click() }] },
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
document.body.append(view.el, menu.el, hud.el, crumbs.el, variables.el);
hud.show(view.camera());
