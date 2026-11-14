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
import { createSettingsButton } from './components/settings.js';
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
   A space is one canvas-full of blocks. The page opens on the top space. Every block has a definition space of its
   own, made the first time it is opened (the top space instead shows "=" and what each piece of touching shapes comes to): a canvas showing an equation, with the block as a variable in matrix
   notation on the right and, on the left, the place for what defines it. What is put in the space must come to the
   block's promised size (w units across, h units down). Only the current space's blocks are on the canvas. */
const newSpace = (owner, parent) => ({ owner, parent, blocks: [], groupOf: new Map(), groupNames: new Map(), frames: new Map(), camera: { x: 0, y: 0, zoom: 1 }, definition: null });
const top = newSpace(null, null);
/* the settings: a space of its own, opened from the gear in the corner and reached from anywhere. Nothing is in it yet. */
const settings = Object.assign(newSpace(null, top), { label: 'Settings' });
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
  crumbs.show(trail().map(s => s.owner ? s.owner.name : s.label || 'Top'));
  gear.active(space === settings);
}
/* writes out the current space's equation: afresh each time it is opened, so it follows its block's size, and again
   whenever one of the block's entries is given a number */
function write(){
  space.definition?.el.remove(); space.definition = null;
  if (!space.owner) return;
  const o = space.owner, r = o.rect;
  space.definition = createDefinition({ cols: Math.round(r.w / view.unit), rows: Math.round(r.h / view.unit), unit: view.unit,
    name: o.name, letter: initials(o.name), color: isNamed(o) ? o.shape.color : null, values: o.values, editable: isNamed(o),      /* a named block's matrix is written in its colour */
    colsName: o.sides.w, rowsName: o.sides.h });
  view.world.prepend(space.definition.el);     /* beneath the blocks */
}
const open = b => { if (!spaceOf.has(b)) spaceOf.set(b, newSpace(b, space)); deeper.length = 0; go(spaceOf.get(b)); };
/* out and back in again, like a browser's back and forward: stepping out remembers the space left, so stepping in can return to it */
const deeper = [];
function out(){ if (!space.parent) return; if (space === settings) return go(before);      /* leaving the settings goes back to where they were opened from */
  deeper.push(space); go(space.parent); }
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
  shown(); }

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
const everyBlock = () => [...top.blocks, ...settings.blocks, ...[...spaceOf.values()].flatMap(s => s.blocks)];
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
  for (const s of [top, settings, ...spaceOf.values()]){
    const live = s.blocks.filter(b => !isOff(b)), rects = live.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u }));
    for (const j of joins(rects)) if (!except(live[j.left], live[j.right])) pairs.push([live[j.left], live[j.right]]);
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

/* ---- groups: blocks that are selected together. A block is in at most one group, within its space. ----
   A group can be given a name. A named group keeps a solid frame and its name on the canvas whether or not it is
   selected. It behaves as one named thing, but its blocks stay where they are, in this space, and can still be
   worked on directly; folding it is what moves them into a block of their own. */
let nextGroup = 1;
const members = b => { const g = space.groupOf; return g.has(b) ? space.blocks.filter(o => g.get(o) === g.get(b)) : [b]; };
const isOneGroup = list => { const g = space.groupOf; return list.length > 1 && g.has(list[0]) && list.every(b => g.get(b) === g.get(list[0])) && members(list[0]).length === list.length; };
function ungroup(list){
  for (const b of list) space.groupOf.delete(b);
  for (const b of space.blocks) if (space.groupOf.has(b) && members(b).length < 2) space.groupOf.delete(b);      /* a group of one is no group */
  const live = new Set(space.groupOf.values());
  for (const id of [...space.groupNames.keys()]) if (!live.has(id)) space.groupNames.delete(id);                /* nor does a group that is gone keep its name */
}
const boxOf = list => { const x = Math.min(...list.map(b => b.rect.x)), y = Math.min(...list.map(b => b.rect.y));
  return { x, y, w: Math.max(...list.map(b => b.rect.x + b.rect.w)) - x, h: Math.max(...list.map(b => b.rect.y + b.rect.h)) - y }; };

/* ---- selection ----
   Click a block to select it (with its group, if it has one); double-click one inside a selected group to select
   just that block. Double-click a block that is selected on its own to open its definition space.
   Shift-click adds or removes. Click empty canvas or press Escape to clear. Press s to drag a box round several.
   One block selected: it shows its dimension lines and can be resized. Several: a box is drawn round them with a
   group button and a place for a name, and they move together but do not resize. Whatever is not selected fades.
   Naming a plain selection folds it into a new block of that name. Naming a group makes it a named group. */
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
  /* named groups keep their frames; the one that is the whole selection also carries the tools */
  const oneGroup = isOneGroup(list) ? space.groupOf.get(list[0]) : null, live = new Set();
  for (const [id, name] of space.groupNames){
    const ms = space.blocks.filter(b => space.groupOf.get(b) === id); if (ms.length < 2) continue;
    live.add(id); if (!space.frames.has(id)) space.frames.set(id, createBounds());
    const f = space.frames.get(id), on = id === oneGroup;
    f.set(boxOf(ms), { name, solid: true, selected: on, tools: on, grouped: true, fold: true }); view.world.append(f.el);
  }
  for (const [id, f] of space.frames) if (!live.has(id)){ f.el.remove(); space.frames.delete(id); }
  /* any other selection of several gets the dashed box, with a name to fill in */
  if (list.length > 1 && !live.has(oneGroup)){
    bounds.set(boxOf(list), { selected: true, tools: true, grouped: oneGroup !== null });
    view.world.append(bounds.el);
  } else bounds.el.remove();
  /* the algebra of what is here: a mark wherever two blocks touch and multiply, and whether it all comes to the promised size */
  for (const b of space.blocks) b.off(isOff(b));
  const u = view.unit, active = space.blocks.filter(b => !isOff(b));           /* commented-out blocks take no part */
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
  /* a definition space sets what is here beside its block's promised size. The top space has no promise, so it
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
  const dx = -u * (3 + squares(type.cols)) - (box.x + box.w), dy = Math.round(-box.h / 2 / u) * u - box.y;
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
   Copy takes a picture of the selected blocks as they are now: size, name, colour, side names, entries, grouping, and each
   one's whole definition space, all the way down. Paste makes new blocks from that picture in the current space,
   centred on a point, and selects them. The picture stays, so it can be pasted again and again.
   This is the page's own clipboard, not the computer's: it does not survive a reload or reach another tab. */
let clipboard = null;
const picture = (b, s) => ({ shape: b.shape, rect: { ...b.rect }, name: b.name, sides: { ...b.sides }, values: new Map(b.values), group: s.groupOf.get(b) ?? null, groupName: s.groupNames.get(s.groupOf.get(b)) ?? null,
  inside: spaceOf.has(b) ? spaceOf.get(b).blocks.map(o => picture(o, spaceOf.get(b))) : null });
function copy(){ if (selected.size) clipboard = [...selected].map(b => picture(b, space)); }
/* makes the blocks in pictures inside space s, moved by (dx, dy); blocks that were grouped together are grouped together again */
function develop(pictures, s, dx, dy){
  const u = view.unit, groups = new Map(), made = [];
  for (const pic of pictures){
    const r = { ...pic.rect, x: pic.rect.x + dx, y: pic.rect.y + dy };
    for (const dim of ['w', 'h']) if (pic.sides[dim] && lengths.has(pic.sides[dim])) r[dim] = lengths.get(pic.sides[dim]) * u;      /* a named side is whatever length that name is now */
    const name = s === space && /^Shape \d+$/.test(pic.name) ? freeName() : pic.name;      /* a block never given a name of its own gets a fresh number */
    const b = createBlock(pic.shape, r, name); b.sides = { ...pic.sides }; b.values = new Map(pic.values);
    s.blocks.push(b); made.push(b);
    if (pic.group !== null){ if (!groups.has(pic.group)) groups.set(pic.group, nextGroup++); s.groupOf.set(b, groups.get(pic.group));
      if (pic.groupName) s.groupNames.set(groups.get(pic.group), pic.groupName); }
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

/* ---- saving and opening a project ----
   The whole tree of shapes is written as a tree of files, a directory for every space (project.js has the format).
   Served by server.py, the page saves to and opens from the server's projects/ directory, by name.
   Anywhere else (the published artifact, say) there is no server to keep them, so Save hands over one zip of the
   same tree and Open takes one back. */
const typeNamed = name => shapes.find(s => s.name === name) || { name, label: name, draw: 'rectangle', color: 'tensor' };
/* the page's spaces as plain data, lengths in units */
function gather(){
  const u = view.unit;
  const plain = s => ({
    shapes: s.blocks.map(b => ({ type: b.shape.name || 'tensor', name: b.name, color: b.shape.color, x: b.rect.x / u, y: b.rect.y / u, cols: b.rect.w / u, rows: b.rect.h / u,
      colsName: b.sides.w, rowsName: b.sides.h, entries: Object.fromEntries(b.values), inside: spaceOf.has(b) ? plain(spaceOf.get(b)) : null })),
    groups: [...new Set(s.groupOf.values())].map(id => ({ name: s.groupNames.get(id) || null, members: s.blocks.map((b, i) => s.groupOf.get(b) === id ? i : -1).filter(i => i >= 0) })) });
  return { top: plain(top), settings: plain(settings), lengths: Object.fromEntries(lengths), saved: new Date().toISOString() };
}
/* the reverse: everything on the page is replaced by what the data describes */
function rebuild(data){
  go(top); select([]);
  for (const s of [top, settings]){ for (const b of s.blocks) b.el.remove(); for (const f of s.frames.values()) f.el.remove();
    s.blocks.length = 0; s.groupOf.clear(); s.groupNames.clear(); s.frames.clear(); }
  spaceOf.clear(); lengths.clear(); deeper.length = 0; clipboard = null;
  for (const [name, n] of Object.entries(data.lengths)) lengths.set(name, n);
  const u = view.unit;
  const fill = (plain, s) => {
    for (const d of plain.shapes){ const type = typeNamed(d.type);
      const b = createBlock({ ...type, color: d.color || type.color }, { x: d.x * u, y: d.y * u, w: d.cols * u, h: d.rows * u }, d.name);
      b.sides = { w: d.colsName, h: d.rowsName }; b.values = new Map(Object.entries(d.entries)); s.blocks.push(b);
      if (d.inside){ const def = newSpace(b, s); spaceOf.set(b, def); fill(d.inside, def); } }
    for (const g of plain.groups){ const id = nextGroup++; for (const i of g.members) s.groupOf.set(s.blocks[i], id); if (g.name) s.groupNames.set(id, g.name); }
  };
  fill(data.top, top); fill(data.settings, settings);
  view.world.append(...top.blocks.map(b => b.el)); shown();
}
const count = data => { const n = s => s.shapes.reduce((t, d) => t + 1 + (d.inside ? n(d.inside) : 0), 0); return n(data.top) + n(data.settings); };
/* is there a server keeping projects? Asked once, at the start; the list is refreshed after every save. */
let kept = null, current = null;               /* kept: the names of the server's projects, or null with no server; current: the one open */
const ask = () => fetch('api/projects').then(r => r.ok ? r.json() : null).then(list => { kept = Array.isArray(list) ? list : null; }).catch(() => { kept = null; });
ask();

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
  /* the frame round the selection (dashed), or round a named group (solid): its buttons and its name */
  for (const [id, f] of [[null, bounds], ...space.frames]){
    if (!f.el.isConnected || !f.el.contains(el)) continue;
    const list = id === null ? [...selected] : space.blocks.filter(b => space.groupOf.get(b) === id);
    /* the group button: make the selection one group, or take it apart again */
    if (f.groupButton.contains(el)){
      if (isOneGroup(list)) ungroup(list); else { ungroup(list); const g = nextGroup++; for (const b of list) space.groupOf.set(b, g); }
      return shown();
    }
    /* the fold button: the group's blocks move into a new block with the group's name */
    if (f.foldButton.contains(el)) return fold(foldable(list), space.groupNames.get(id));
    if (el === f.nameEl){
      /* a named group's name: the first click selects the group, a click once it is selected renames it */
      if (id !== null && !(isOneGroup([...selected]) && space.groupOf.get([...selected][0]) === id)) return select(list);
      f.nameEl.textContent = '';
      return editText(f.nameEl, name => {
        if (name && id !== null) space.groupNames.set(id, name);                                      /* rename a named group */
        else if (name && isOneGroup(list)) space.groupNames.set(space.groupOf.get(list[0]), name);    /* name a group: it stays here, framed */
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
  if (b && twice){                              /* double click */
    if (el === b.nameEl){ select([b]); return b.rename((changed, was) => renamed(b, changed, was)); }      /* on a name: rename it */
    if (selected.size === 1 && selected.has(b)) return open(b);             /* on a block selected alone: open its definition space */
    return select([b]);                                                     /* on one of several: select just that block */
  }
  /* a click on the block that is already selected alone leaves it so, even inside a group: otherwise the first half
     of a double click would hand the selection back to the group, and the second half could never open the block */
  if (b && !e.shiftKey && selected.size === 1 && selected.has(b)) return;
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
  { label: 'Save project', run: save },
  { label: 'Open project', items: () => kept ? kept.map(name => ({ label: name, run: () => openKept(name) })) : [{ label: 'From a zip', run: () => zipPicker.click() }] },
]);
const hud = createHud({ onHome: () => view.home() });
/* the gear opens the settings from wherever you are; pressed again, or with Escape or Back, it returns to where you were */
let before = top;
const gear = createSettingsButton({ onPress: () => { if (trail().includes(settings)) return go(before);
  before = space; deeper.length = 0; go(settings); } });
const crumbs = createCrumbs({ onGo: i => { deeper.length = 0; go(trail()[i]); } });
const view = createView({
  onChange: cam => { hud.show(cam); menu.close(); shown(); },
  onMenu: (x, y, el) => { const b = blockAt(el); if (b && !selected.has(b)) select(members(b));
    menuAt = view.toWorld(x, y); menu.openAt(x, y); },
  onClick: clicked,
  onDrag: dragged,
});
document.body.append(view.el, menu.el, hud.el, crumbs.el, gear.el);
hud.show(view.camera());
