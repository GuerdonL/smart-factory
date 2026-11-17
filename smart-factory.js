/* The page: makes the components and connects them. Components never reach into each other;
   anything one needs from another passes through here. */
import { editText } from './components/dom.js';
import { createView } from './components/view.js';
import { createMenu } from './components/menu.js';
import { createHud } from './components/hud.js';
import { createProperties } from './components/properties.js';
import { createWarning } from './components/warning.js';
import { createFormula } from './components/formula.js';
import { evaluate, entered, typed as typedText, bound, guard, refs, refersTo, repoint, label, wholeOf } from './expression.js';
import { createBlock } from './components/block.js';
import { createArrow } from './components/arrow.js';
import { createMeasure, sides } from './components/measure.js';
import { createBounds, createBackdrop } from './components/bounds.js';
import { drawRectangle } from './components/draw.js';
import { boxSelect } from './components/marquee.js';
import { createDefinition } from './components/definition.js';
import { createCrumbs } from './components/crumbs.js';
import { createVariables } from './components/variables.js';
import { createJoin } from './components/join.js';
import { createResult } from './components/result.js';
import { touches, joins, pieces, resultHollows, pieceHollows, typeOf, difference, intersection, rangeOf, rangeIn, partEntries, wholeSide, sideLabel, nthOf, initials, rootOf as rootValue, isWhole, isError, isFormula, storable, sideOf, combine, valueText } from './algebra.js';
import * as project from './project.js';
import { createBus } from './bus.js';
import { createIds } from './ids.js';
import { createHistory } from './history.js';
import { SYSTEM, FUNCTIONS, SLOTS, OLD, CONFIG, COLORS, DARK, DARK_DOWN, isColour, leaf } from './system.js';
import { SIDES, along, covered, coveredType, strip, triangle, free, edgeAt, adjust, settable, sided, standing, passed, worked as entryWise, names as formulaNames, fits, fitting, seatable, carried } from './arrows.js';
import { zip, unzip } from './zip.js';
import { squares } from './components/matrix.js';

/* everything the user does takes effect as a message on the bus (bus.js); what each message does is set out under
   "messages", near the end. Blocks are named in messages by their ids. */
const bus = createBus(); globalThis.smartFactoryBus = bus;      /* on the page as smartFactoryBus, to look at its log */
const everyKnown = () => { const out = [], add = b => { out.push(b); for (const m of b.members || []) add(m.block); }; for (const s of everySpace()){ s.blocks.forEach(add); for (const o of s.ops) o.sources.forEach(add); } return out; };      /* every block: those fused into others, and those a cut or an intersection took off the canvas and keeps, included */
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
   Only the current space's blocks are on the canvas. A space also keeps its operations (ops): what Difference and
   Intersect have cut in it, each with the two blocks it took off the canvas (see "the boolean tool"). */
const newSpace = (owner, parent) => ({ owner, parent, blocks: [], ops: [], groupOf: new Map(), groupUp: new Map(), groupNames: new Map(), frames: new Map(), camera: { x: 0, y: 0, zoom: 1 }, definition: null });
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
  if (isArrow(space.owner)){      /* an arrow's space: its output on the right, at the size it promises or, with no promise, the size it comes to */
    const a = space.owner, t = defSize(a); syncIn(space, a);
    space.definition = createDefinition({ cols: t.cols, rows: t.rows, unit: view.unit, name: isNamed(a) ? a.name : 'output', letter: initials(a.name), color: 'function', values: new Map(), editable: false, colsName: t.colsName || null, rowsName: t.rowsName || null });
    space.definition.tiled = defKey(a); view.world.prepend(space.definition.el); return; }
  flow(space.owner);
  const o = space.owner, r = o.rect, over = turned(o);      /* opened through a transpose, it is still the variable's own definition: the right way round */
  space.definition = createDefinition({ cols: Math.round((over ? r.h : r.w) / view.unit), rows: Math.round((over ? r.w : r.h) / view.unit), unit: view.unit,
    name: o.name, letter: initials(o.name), color: isNamed(o) ? o.shape.color : null, values: valuesOf(o, 0, true), inherited: inheritedBy(o, space.parent), editable: isNamed(o),      /* a named block's matrix is written in its colour */
    colsName: over ? o.sides.h : o.sides.w, rowsName: over ? o.sides.w : o.sides.h, tiles: tileLook(o) });
  space.definition.tiled = defKey(o);
  view.world.prepend(space.definition.el);     /* beneath the blocks */
}
/* the size an arrow's space writes on the right of its equation, and what the equation was written for: it is written again when that changes */
const defSize = a => { const o = outputOf(a), seat = seatOn(a); return a.arrow.output ? { ...a.arrow.output, colsName: seat?.sides.w || null, rowsName: seat?.sides.h || null } : (o.came && !o.came.error && o.came) || o.part || { cols: 1, rows: 1 }; };
const defKey = o => isArrow(o) ? 'arrow ' + JSON.stringify(defSize(o)) : JSON.stringify(tileLook(o));
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
   A named shape's two side lengths are listed under it in the same way: click the shape and they show beneath it.
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
    for (const b of withKept(s)){               /* a variable a cut keeps off the canvas is still in reach: a use of it can be pulled out, to look at it or change it */
      if (isArrow(b)){      /* a named arrow is a variable too: a function, set against another edge from the list. (A use of a function by its name is not one: what it uses is listed.) */
        if (isNamed(b) && !isOff(b) && !seen.has(b) && !isUse(b) && !spaces.includes(spaceOf.get(b))){ for (const k of kinOf(b)) seen.add(k); const up = named(s.groupOf.get(b));
          shapes.push([{ kind: 'arrow', name: b.name, color: b.shape.color, cols: 1, rows: 1, block: originOf(b), depth, children: [] }, up === undefined ? (isHidden(b.name) ? hidden : main) : node(up).children]); }
        if (b.arrow.gapName && !names.has(b.arrow.gapName)){ names.add(b.arrow.gapName); lengths.push({ kind: 'length', of: b.id, side: 'g', name: b.arrow.gapName, units: b.arrow.gap }); }      /* a gap given a name: a measure for formulas */
        continue; }
      if (isNamed(b) && !isOff(b) && !seen.has(b) && !spaces.includes(spaceOf.get(b))){       /* not the one whose definition we are standing in */
        for (const k of kinOf(b)) seen.add(k);
        const up = named(s.groupOf.get(b)), item = { kind: 'shape', name: b.name, color: b.shape.color, cols: b.rect.w / view.unit, rows: b.rect.h / view.unit, block: b, depth,
          children: (turned(b) ? ['h', 'w'] : ['w', 'h']).map(dim => ({ kind: 'length', of: originOf(b).id, side: (dim === 'w') !== turned(b) ? 'x' : 'y', name: sideName(b, dim), units: unset(b) ? null : rootSide(b) === null ? b.rect[dim] / view.unit : rootSide(b), label: unset(b) ? '√' + symbolOf(b) : rootSide(b) === null ? null : valueText(rootSide(b)) + 'u' }))
            .concat(massName(b) ? [{ kind: 'length', of: originOf(b).id, side: 'm', name: massName(b), units: scalarOf(b), label: unset(b) ? symbolOf(b) : valueText(scalarOf(b)) }] : []) };      /* and a scalar's mass: the number it holds */      /* its side lengths, out of sight under it until it is clicked: the variable's width, then its height */
        shapes.push([item, up === undefined ? (isHidden(b.name) ? hidden : main) : node(up).children]); }
      if (!isNamed(b)) for (const dim of ['w', 'h']) if (b.sides[dim] && !names.has(b.sides[dim])){      /* a named side of a shape with no name has no shape to hang under */ names.add(b.sides[dim]); lengths.push({ kind: 'length', of: b.id, side: dim === 'w' ? 'x' : 'y', name: b.sides[dim], units: b.rect[dim] / view.unit }); }
    } });
  const lowest = new Map(); for (const [i] of shapes) lowest.set(bare(i.name).trim(), Math.max(i.depth, lowest.get(bare(i.name).trim()) ?? 0));
  for (const [i, into] of shapes) if (lowest.get(bare(i.name).trim()) === i.depth) into.push(i);
  /* each shape is listed the variable's own way round; with shift held, as its transpose, which is then what is pulled out */
  const face = list => { for (const i of list){ if (i.children) face(i.children);
      if (i.kind === 'shape' && !i.block.members){ const over = !!i.block.t !== shiftHeld; if (over) [i.cols, i.rows] = [i.rows, i.cols]; if (shiftHeld){ i.name += '\u1d40'; i.transposed = true; } } } };
  face(main); face(hidden);
  const told = new Set(), tell = list => { for (const i of list){ told.add(i.name); if (i.children) tell(i.children); } }; tell(hidden);
  const under = new Set(shapes.flatMap(([i]) => i.children.map(c => c.name)));      /* lengths already listed under a shape */
  return { main: [...main, ...lengths.filter(l => !under.has(l.name))], hidden: [...systemItems().filter(i => !told.has(i.name)), ...hidden] };      /* the program's own, where the project has none of that name */
}
const systemItems = () => [{ kind: 'system', name: CONFIG, group: true, color: 'muted', cols: 3, rows: 3 }, { kind: 'system', name: COLORS, group: true, color: 'muted', cols: 3, rows: 2 }, { kind: 'system', name: DARK, group: true, color: 'muted', cols: 3, rows: 2 },
  ...SYSTEM.map(v => ({ kind: 'system', name: v.name, key: v.key, color: v.css || v.color, cols: v.cols, rows: v.rows || 1 })),
  ...FUNCTIONS.map(f => ({ kind: 'arrow', name: f.name, color: 'function', cols: 1, rows: 1, builtin: true }))];      /* the program's own functions (a project's arrow of the same name is listed in its place) */
/* another use of a shape variable, centred on a world point */
function useShape(of, at, transposed = false){      /* transposed: whether the new use is to be the variable's transpose */
  const u = view.unit, on = v => Math.round(v / u) * u, over = !of.members && !!of.t !== !!transposed, r = over ? { w: of.rect.h, h: of.rect.w } : of.rect;
  const b = makeBlock({ ...of.shape }, { x: on(at.x - r.w / 2), y: on(at.y - r.h / 2), w: r.w, h: r.h }, of.name);
  b.sides = over ? { w: of.sides.h, h: of.sides.w } : { ...of.sides }; b.values = of.values; b.turn(of.members ? of.t : transposed); if (of.members) b.members = of.members;                                         /* the same entries, not a copy */
  if (!spaceOf.has(of)){ const def = newSpace(of, space); for (const k of kinOf(of)) spaceOf.set(k, def); }
  spaceOf.set(b, spaceOf.get(of));                                                          /* the same definition */
  const set = kin.get(of) || new Set([of]); set.add(b); for (const k of set) kin.set(k, set);
  b.ref = true; b.attrs = attrsOf(of);           /* a reference to the variable, not the shape it was made as: its attributes are the variable's */
  space.blocks.push(b); view.world.append(b.el); select([b]);
}
/* ---- shapes standing in a matrix ----
   A variable dragged from the list onto a shape's matrix (the "= [...]" beside it in the Menu, or the right-hand side
   in its definition space) goes into the matrix, where it was dropped, in place of the entries it covers. It may be
   any size that fits inside the matrix, and the shapes there may be packed in any arrangement that does not overlap;
   the entries not yet covered stay as they were. The first one put in replaces whatever was in the receiving shape's definition space. From then on that
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
    if (!t.tile || x % 1 || y % 1 || x < 0 || y < 0 || x + w > cols || y + h > rows) return null;
    if (out.some(o => x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h)) return null;
    out.push({ block: t, x, y, w, h }); }
  return out;
}
const tileLook = b => (tilesOf(b) || []).map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h, color: t.block.shape.color, name: t.block.name, id: t.block.id }));
/* ---- the algebra of a space ----
   algebraIn(s): the blocks of s that take part, their rectangles in units, every touch between them (a product, a
   sum, times or over: algebra.js) and the pieces they make, each with its one rule. */
function algebraIn(s){
  const u = view.unit, active = s.owner && tilesOf(s.owner) ? [] : s.blocks.filter(b => !isOff(b) && !isArrow(b) && !hollowSeat(b));      /* shapes standing in the block's matrix are entries, not a product; commented-out blocks take no part */
  const rects = active.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u, wName: b.sides.w, hName: b.sides.h, ...(lost(b) ? { none: true } : {}) }));      /* none: a part its source is too small to have has no value */
  return { active, rects, touches: touches(rects), all: pieces(rects) };
}
/* a block's entries: its own; or, once shapes standing in its matrix (in its definition space) cover all of it,
   theirs. Nothing else defines it: shapes set anywhere else, there or beside it, are only pieces. */
/* A block can be the transpose of its variable (block.t). Its entries are kept the variable's way round, shared with
   every other use; a transpose reads them turned. (A joined shape is turned bodily, with what it was joined from, so
   its entries are already the way it stands.) */
const turned = b => !!b.t && !b.members;
const flipped = values => new Map([...values].map(([k, v]) => { const [c, r] = k.split(','); return [r + ',' + c, v]; }));
/* An entry holds a literal value or a formula, { expr } (expression.js), never a formula with its result: a formula
   is worked out each time it is read, so it follows whatever it refers to. worked(b) is b's own entries as values:
   the block's Map itself where it holds no formula, else a new one, in which an entry whose formula comes to nothing
   yet (unknown) is absent and so is drawn as its symbol. A formula that depends on itself, directly or through
   others, comes to the error "depends on itself": working (expression.js: guard) keeps track of what is being
   worked out, each thing by the id of the block its variable was made as. */
const working = guard();
const workedAt = (b, key) => { const v = b.values.get(key); return isFormula(v) ? working(originOf(b).id + ' ' + key, () => evaluate(v.expr, lookupFor(b)).value ?? null) : v; };
function worked(b){
  let any = false; for (const v of b.values.values()) if (isFormula(v)){ any = true; break; }
  if (!any) return b.values;
  const out = new Map(); for (const [k, v] of b.values){ const w = isFormula(v) ? workedAt(b, k) : v; if (w !== null && w !== undefined) out.set(k, w); }
  return out;
}
const own = (b, plain = false) => turned(b) && !plain ? flipped(worked(b)) : worked(b);
function valuesOf(b, depth = 0, plain = false){      /* plain: the variable's own way round, whatever this use is */
  if (isArrow(b)) return new Map();            /* an arrow has no entries: its output has */
  const given = givenOf(b), seated = given ? null : seatedOf(b);      /* a function's input, or a seated block (or a reference to either): what the arrow is given, or its output */
  if (given || seated){ const of = given || seated, v = given ? inValues(of) : seatValues(of), right = of.t ? flipped(v) : v; return turned(b) && !plain ? flipped(right) : right; }
  if (measures(b)){ const v = derived(b); return new Map(v === null ? [] : [['1,1', v]]); }      /* a side length of another shape: whatever that is now */
  const part = rangedOf(b);                    /* a part of another shape: that shape's entries there, whatever they are now */
  if (part) return depth < 8 ? rangeValues(part, depth, turned(b) && !plain) : new Map();
  const tiles = depth < 8 && tilesOf(b), u = view.unit;
  if (!tiles || tiles.reduce((sum, t) => sum + t.w * t.h, 0) !== Math.round(b.rect.w / u) * Math.round(b.rect.h / u)){
    return own(b, plain); }
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
  if (rangedOf(a)) return hud.say(`${bare(a.name)} is part of ${partOf(a)}: change it there`);      /* its entries are its source's */
  if (isArrow(a) || givenOf(a) || seatedOf(a)) return hud.say(isArrow(a) ? 'An arrow\'s output is what its function comes to: nothing stands in it' : `${bare(a.name)} ${givenOf(a) ? 'is the function\'s input' : 'is seated'}: its entries are not its own`);
  if (kinOf(a).includes(v)) return hud.say('A shape cannot go into its own matrix');
  if (w > cols || h > rows) return hud.say(`${bare(v.name)} does not fit in ${bare(a.name)}`);
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
  pruneOps();                                  /* what was cut in the definition went with it */
  const slot = slotOf(a), use = makeBlock({ ...v.shape }, { x: slot.x + X * u, y: slot.y + Y * u, w: v.rect.w, h: v.rect.h }, v.name);
  use.sides = { ...v.sides }; use.values = v.values; use.turn(v.t); use.tile = true; if (v.members) use.members = v.members; spaceOf.set(use, spaceOf.get(v));
  const set = kin.get(v) || new Set([v]); set.add(use); for (const k of set) kin.set(k, set); use.ref = true; use.attrs = attrsOf(v);
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
  const within = space.blocks.filter(b => { if (isArrow(b)) return false; const a = view.toScreen(b.rect.x, b.rect.y), z = view.toScreen(b.rect.x + b.rect.w, b.rect.y + b.rect.h);
    return x > a.x - 110 && x < z.x + 110 && y > a.y - 110 && y < z.y + 110; });
  for (const [b, m] of near) if (!within.includes(b)){ m.el.remove(); near.delete(b); }
  for (const b of within){
    if (!near.has(b)){ near.set(b, createMeasure(view.unit)); view.world.append(near.get(b).el); }
    const s = sides(view, b.rect), a = view.toScreen(b.rect.x, b.rect.y), z = view.toScreen(b.rect.x + b.rect.w, b.rect.y + b.rect.h);
    near.get(b).set(b.rect, { ...s, wName: shownSide(b, 'w'), hName: shownSide(b, 'h'), ...rootOf(b) }); near.get(b).mark(null);
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
     space's .config; a length onto a side, or onto the canvas as a single entry holding it */
  onDrop: (item, x, y) => { const at = view.toWorld(x, y);
    /* onto a formula that is open: a measure's capsule goes in at the cursor. A whole shape is its mass if it is a scalar, and otherwise is refused (expression.js: wholeOf). */
    if (openField?.over(x, y)){
      if (item.kind === 'length' && item.of) return openField.insert({ id: item.of, measure: item.side || 'x', name: null });
      const whole = item.kind === 'shape' ? wholeOf(variableOf(item.block), !!openField.matrices) : { refused: 'only a variable or one of its measures can go into a formula' };
      return whole.refused ? hud.say(`${item.name}: ${whole.refused}`) : openField.insert(whole.capsule); }
    if (item.kind === 'shape'){ const onto = matrixAt(x, y); if (!onto) return bus.send('use', { id: item.block.id, at, transposed: !!item.transposed });
      const r = onto.el.getBoundingClientRect(), u = view.unit, cols = Math.round(onto.block.rect.w / u), rows = Math.round(onto.block.rect.h / u), whole = cols <= 8 && rows <= 8;      /* a longer matrix is written with its middle left out, so the pointer cannot say where */
      return bus.send('slot', { into: onto.block.id, id: item.block.id, cx: whole ? (x - r.left) / (r.width / cols) : 0, cy: whole ? (y - r.top) / (r.height / rows) : 0 }); }
    /* a function: set against the edge it was dropped on. A named arrow has to fit there (arrows.js: fitting); one of the program's own fits anything */
    if (item.kind === 'arrow'){ const e = edgeNear(at, 1), read = e && readOf(space, e.input);
      if (!read) return hud.say(`${item.name}: set it against rows or columns`);
      const fit = fitting(item.block ? innerOf(item.block) : null, e.side, read, e.at);
      if (fit.refused) return hud.say(`${item.name} does not fit there. ${fit.refused}`);
      return bus.send('arrow.add', { input: e.input, side: e.side, start: fit.start, span: fit.span, gap: 2, ...(item.block ? { of: item.block.id } : { builtin: item.name }) }); }
    if (item.kind === 'length' && item.side === 'g') return hud.say(`${item.name} is an arrow's gap: it is layout, and can only be used in a formula`);
    if (item.kind === 'system') return bus.send('summon', { name: item.name, key: item.key || null, group: !!item.group, at });
    if (item.kind === 'frame') return bus.send('replicate', { frame: item.id, at });
    const target = reach(x, y);
    if (target && !isWhole(item.units)) return hud.say(`${item.name} is ${item.label}, not a whole number: it cannot be a side's length`);      /* only whole numbers are side lengths */
    return target ? bus.send('side.set', { id: target.b.id, dim: target.dim, text: item.name }) : bus.send('length.add', { name: item.name, units: item.units, at, of: item.of || null, side: item.side || null }); },      /* on the canvas: an entry that is that length, a root left as a root */
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
/* A named shape's sides are lengths with names of their own, without being given any: the shape's name, up to ten
   characters, with .x for its width and .y for its height (a transpose's are the variable's, the other way round).
   Such a name can be typed on any other side, which is then that length and stays so. A side that has been given a
   name goes by that one. (A side's own automatic name is only a handle: it does not make the side a variable one,
   so it neither elides the shape's matrix nor has to match a neighbour's name in a product.) */
const autoSide = (b, dim) => isNamed(b) && !isArrow(b) ? bare(b.name).trim().slice(0, 10) + ((dim === 'w') !== turned(b) ? '.x' : '.y') : null;
/* a named scalar has a third measure beside its two sides: its mass, the number it holds, called
   by the shape's name with .mass. ('m' stands for it wherever 'w' and 'h' stand for the sides.) */
const single = b => !b.members && !isArrow(b) && b.rect.w === view.unit && b.rect.h === view.unit;
const massName = b => isNamed(b) && single(b) ? bare(b.name).trim().slice(0, 10) + '.mass' : null;      /* whether or not it has been given a number yet */
/* a named scalar not yet given a number: its mass is still a symbol, written as its one entry is in its definition
   (the name's initials and the entry's number: k₁), and its sides are the root of that */
const unset = b => isNamed(b) && single(b) && scalarOf(b) === null;
const symbolOf = b => initials(b.name) + '₁';
const sideName = (b, dim) => dim === 'm' ? massName(b) : b.sides[dim] || autoSide(b, dim);
/* a space's blocks with those a cut or an intersection took off its canvas and keeps: a kept block's named sides are
   still that name's length, and follow it, so that the shapes made of the block do */
const withKept = s => s.ops.length ? [...s.blocks, ...s.ops.flatMap(o => o.sources)] : s.blocks;
const uses = (s, name) => withKept(s).some(b => sideName(b, 'w') === name || sideName(b, 'h') === name || massName(b) === name);
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
  for (const t of everySpace()) if (uses(t, name) && homeOf(name, t) === home) for (const b of withKept(t)) for (const dim of ['w', 'h']) if (b.sides[dim] === name) out.push([b, dim, t]);
  /* and the shape the name is taken from, where it is a shape's own: one variable only, the nearest, so that
     shapes which merely share a name are not tied to one another */
  const order = [...above(s)].sort((a, b) => above(b).size - above(a).size), all = [...order, ...everySpace().filter(t => !order.includes(t))];
  let owner = null;
  for (const t of all){ if (homeOf(name, t) !== home) continue; owner = t.blocks.find(b => ['w', 'h'].some(dim => !b.sides[dim] && autoSide(b, dim) === name) || massName(b) === name); if (owner) break; }
  if (owner) for (const k of kinOf(owner)){ const t = spaceWith(k); if (!t) continue; for (const dim of ['w', 'h']) if (!k.sides[dim] && autoSide(k, dim) === name) out.push([k, dim, t]); if (massName(k) === name) out.push([k, 'm', t]); }
  return out;
}
/* the length a side called name has in s already, if one at or above s carries it; otherwise undefined */
function lengthCalled(name, s, not = null){
  const here = above(s), from = sidesCalled(name, s).find(([o, , t]) => o !== not && here.has(t));
  return from ? sideLength(from[0], from[1]) ?? undefined : undefined;      /* a length that is not whole is no length a side can take */
}
/* after b's size has changed: every other use of its variable takes its size, and every side that shares a name
   with one of its sides takes that side's length; then the same for whatever those changed, until nothing moves */
function agree(b){
  const todo = [b], done = new Set();
  /* a named side of a part that does not take in its source's whole side: it is as long as its range, whatever else carries the name */
  const pinned = ([o, d]) => !!o.from?.range && d !== 'm' && !wholeSide(o.from.range, (d === 'w') !== turned(o) ? 'cols' : 'rows');
  while (todo.length){
    const c = todo.pop(); if (done.has(c)) continue; done.add(c);
    if (isArrow(c)) continue;                  /* an arrow's rectangle is the gap it is drawn in: no size any other shape shares */
    for (const k of kinOf(c)) if (k !== c){ const over = !!k.t !== !!c.t, w = over ? c.rect.h : c.rect.w, h = over ? c.rect.w : c.rect.h;      /* a transpose of it is the other way round */
      k.sides = over ? { w: c.sides.h, h: c.sides.w } : { ...c.sides }; if (k.rect.w !== w || k.rect.h !== h){ k.set({ ...k.rect, w, h }); todo.push(k); } }      /* one variable, one size */
    const s = everySpace().find(s => withKept(s).includes(c)); if (!s) continue;
    for (const dim of ['w', 'h', 'm']) if (sideName(c, dim)){ const group = sidesCalled(sideName(c, dim), s), boss = group.find(([o]) => rootSide(o) !== null) || group.find(pinned);      /* a single entry's number settles the length: it is not resized to suit the others. So does a part's shortened side */
      if (boss && pinned(boss) && c !== boss[0] && c.rect[dim] !== boss[0].rect[boss[1]]) hud.say(`${sideName(c, dim)} stays ${Math.round(boss[0].rect[boss[1]] / view.unit)}u: ${bare(boss[0].name)} carries that name and is part of ${partOf(boss[0])}, so its size cannot change`);
      const length = boss ? sideLength(boss[0], boss[1]) : c.rect[dim];
      if (!boss && dim === 'm') continue;
      if (length === null){      /* the entry's side is not a whole number now: no side can be that long, so the sides that carried its name let go of it and stay as they are */
        for (const [o, d] of group) if (rootSide(o) === null && o.sides[d]){ hud.say(`${o.sides[d]} is not a whole number now: ${bare(o.name)} no longer follows it`); o.sides[d] = null; }
        continue; }
      for (const [o, d] of group) if (rootSide(o) === null && !unset(o) && o.rect[d] !== length){ o.set({ ...o.rect, [d]: length }); done.delete(o); todo.push(o); } }
  }
}
/* Runs change(), then puts back together whatever it pulled apart: blocks that were touching side by side, in any
   space, still touch afterwards, the right-hand one moving to stay against the left-hand one. A length that changes
   would otherwise leave products overlapping or gapped. except(left, right) can name pairs to leave alone. */
function keepTouching(change, except = () => false){
  const u = view.unit, pairs = [];
  for (const s of everySpace()){
    const live = s.blocks.filter(b => !isOff(b) && !isArrow(b) && !hollowSeat(b)), rects = live.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u }));
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
  if (isArrow(b)) return hud.say('An arrow has no sides of its own: its start, span and gap are in its properties');
  if (b.in) return hud.say('in is the function\'s input: its sides are those of what the arrow covers');
  if (b.seat && /\d\s*u?$/i.test(text)) return hud.say(`${bare(b.name)} is seated: its size is the output's`);
  const m = text.match(/^(.*?)[\s=:]*(?:(\d+(?:\.\d+)?)\s*u?)?$/i), name = (m[1] || '').trim(); let n = m[2] ? Math.round(parseFloat(m[2])) : null;
  /* a part of another shape is the size of that part: a length typed on it is not taken, nor a name that is another length already */
  if (rangedOf(b)){ const has = name && name !== '-' && name !== autoSide(b, dim) ? lengthCalled(name, space, b) : undefined;
    if ((n !== null && n * view.unit !== b.rect[dim]) || (has !== undefined && has !== b.rect[dim])){ hud.say(`${bare(b.name)} is part of ${partOf(b)}: its size is that part's`); if (has !== undefined && has !== b.rect[dim]) return; }
    n = null; }
  /* a named scalar stays a scalar: a length given to its side is the root of its number, so the number becomes the
     length squared, and the block keeps its one square */
  const single = isNamed(b) && !b.members && b.rect.w === view.unit && b.rect.h === view.unit;
  if (single && measures(b)){ hud.say(`${bare(b.name)} is a measure of another shape: change it there`); return; }
  const size = length => single ? b.values.set('1,1', (length / view.unit) ** 2) : b.set({ ...b.rect, [dim]: length });
  if (name === '-' || (name && name === autoSide(b, dim))){ b.sides[dim] = null; if (n >= 1) size(n * view.unit); if (name !== '-') agree(b); return; }      /* its own automatic name is no name given */
  if (name && sidesCalled(name, space).some(([o, d]) => o !== b && sideLength(o, d) === null)){ hud.say(`${name} is not a whole number: it cannot be a side's length`); return; }
  if (name){ b.sides[dim] = null; const has = lengthCalled(name, space, null);      /* the length the name already has here or above, looked up before this side joins it */
    b.sides[dim] = name; if (n === null && has !== undefined) size(has); }
  if (n >= 1) size(n * view.unit);
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
const groupIs = list => { if (!list.length) return null;      /* a frame may hold one block: that block, selected, is that frame */
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
let marks = [];                                /* the marks now on the canvas, one for each touch */
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
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++){ const n = from.get(c + ',' + r); v.push(typeof n === 'boolean' ? +n : typeof n === 'number' ? n : undefined); } return v; };      /* a setting is a number: an entry that comes to anything else says nothing */
/* The theme has two sets of colours, light and dark. Which is in use is .dark_mode's to say: 1 is dark, 0 light, and
   left blank it is whatever the computer (or the app the page sits in) asks for. The page then says so on the root
   element, which is what the stylesheet goes by, over whatever was there. A colour shape in a .config sets the light
   colour if it is in .colors, the dark one if it is in .dark_colors, and both if it is in neither. */
const root = document.documentElement, bySystemKey = new Map(SYSTEM.map(v => [v.key, v]));
let defaults = null;                           /* { light, dark }: the theme's own colours for each, read with nothing of ours laid over them */
let hostTheme = root.dataset.theme || null, ourTheme;      /* what the app has put on the root element, and what the page last put there */
const asksForDark = () => hostTheme ? hostTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
function programDefaults(){                    /* what the program itself says of each variable: nothing, but for .dark_mode, which left blank is whatever the computer asks for, and one that system.js gives a fallback */
  if (defaults) return defaults;
  const blank = v => v.key === 'dark-mode' ? [asksForDark() ? 1 : 0] : 'fallback' in v ? [v.fallback] : Array.from({ length: v.cssRows ? 3 * v.cssRows.length : v.css ? 3 : 1 }, () => undefined);
  defaults = { light: new Map(SYSTEM.map(v => [v.key, blank(v)])), dark: new Map(SYSTEM.map(v => [v.key, blank(v)])) };
  return defaults;
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
function systemValue(key, path, mode = 'light', said_only = false){      /* said_only: only what .configs say, blank where none does */
  const v = [...programDefaults()[mode].get(key)].map(n => said_only ? undefined : n), coloured = isColour(bySystemKey.get(key));
  for (const { s, at } of path){
    const said = configsOf(s).filter(c => c.key === key && (c.reach === undefined || (at && at.includes(c.reach))) && !(coloured && c.mode !== 'both' && c.mode !== mode));
    said.sort((a, b) => (a.reach === undefined ? -1 : at.length - at.indexOf(a.reach)) - (b.reach === undefined ? -1 : at.length - at.indexOf(b.reach)));      /* the space's first, then outer groups', then inner */
    for (const c of said) c.values.slice(0, v.length).forEach((n, i) => { if (Number.isFinite(n)) v[i] = n; }); }
  return v;
}
const modeIn = path => systemValue('dark-mode', path)[0] ? 'dark' : 'light';
/* .show_hadamard_copies, as it stands for a block of this space: what it means is algebra.js's to say (resultHollows) */
const hadamardCopies = b => systemValue('show-hadamard-copies', pathOf(chain(b)))[0];
function configure(){
  configs = null;
  const spaces = pathOf(), mode = modeIn(spaces), base = programDefaults()[mode], byte = n => Math.max(0, Math.min(255, n));
  if ((root.dataset.theme || null) !== mode){ ourTheme = mode; root.dataset.theme = mode; }
  for (const { key, css, cssRows } of SYSTEM){ const each = cssRows || (css ? [css] : []);      /* only the colours, and which set of them, are read so far */
    const v = each.length ? systemValue(key, spaces, mode).map(byte) : [], d = base.get(key);
    each.forEach((name, i) => { const mine = v.slice(3 * i, 3 * i + 3);
      if (!mine.every(Number.isFinite)) rootStyle.setProperty('--' + name, 'initial');      /* a row not wholly given is no colour: what wears it is drawn without one */
      else rootStyle.setProperty('--' + name, `rgb(${mine.join(', ')})`); }); }
  /* a colour's shape in a .config is drawn in the colour it comes to, in the set it belongs to */
  for (const b of space.blocks){ const v = !isOff(b) && inConfig(b, space) && bySystemKey.get(leaf(b.name)); if (!v?.css) continue;
    const m = modeOf(b, space), path = pathOf(chain(b)); const rgb = systemValue(v.key, path, m === 'both' ? modeIn(path) : m).map(byte);
    b.el.style.setProperty('--block', rgb.every(Number.isFinite) ? `rgb(${rgb.join(', ')})` : 'initial'); }      /* not given in full: no colour */
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
      const v = systemValue(key, path, mode).map(byte); each.forEach((name, i) => { const mine = v.slice(3 * i, 3 * i + 3); out.set('--' + name, mine.every(Number.isFinite) ? `rgb(${mine.join(', ')})` : 'initial'); }); }
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
    if (bySystemKey.has(key)) systemValue(key, pathTo(s), m === 'both' ? modeIn(pathOf()) : m, true).forEach((n, i) => Number.isFinite(n) && got.set((i % cols + 1) + ',' + (Math.floor(i / cols) + 1), n));
    return got; }                                /* in a .config: what the .configs above say of it (the program itself says nothing) */
  if (!isNamed(b)) return got;
  const name = bare(b.name).trim(), mine = new Set(kinOf(b));
  for (const p of above) for (const o of p.blocks) if (!isOff(o) && !mine.has(o) && bare(o.name).trim() === name) for (const [k, n] of worked(o)) got.set(k, n);
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
/* A single entry (a 1 by 1 block) that holds a number: the number is its area, so each side is the root of it. The
   block still takes one square of the grid and is still one by one in a product; only what is written changes: the
   number on its face, and its sides as the root of the number: 9 has sides of 3u, 2 of √2u. A side elsewhere that carries one of
   its sides' names is that long and follows the number as it changes, so long as the root is a whole number. */
const scalarOf = b => { const u = view.unit; if (b.members || isArrow(b) || b.rect.w !== u || b.rect.h !== u) return null; const v = valuesOf(b).get('1,1'); return v === undefined ? null : v; };      /* a value of any kind; null for none yet */
const asText = valueText;
/* the length of each side of such an entry, in units: the root of its number (null where it has none, or none with a root) */
const rootSide = b => { const v = scalarOf(b); return v === null ? null : rootValue(v); };      /* a value: a whole number, or a root left as a root */
/* A GENERAL PRINCIPLE of what is written: a result that would not come out as a whole number is left in algebraic
   form, never rounded to decimals. The root of 2 is written √2, not 1.41; of 12, 2√3; of 9, 3. (Roots are the only
   case so far. Anything worked out later that need not be whole is to be written the same way.) */
const rootOf = b => { const r = rootSide(b); if (r === null && unset(b)){ const t = dim => sideName(b, dim) + ' √' + symbolOf(b); return { wText: t('w'), hText: t('h') }; } if (r === null) return {}; const t = dim => (sideName(b, dim) ? sideName(b, dim) + ' ' : '') + valueText(r) + 'u'; return { wText: t('w'), hText: t('h') }; };
/* a side's length as other sides take it, in world units: a block's own, but for such an entry the root of its
   number. Only a whole number of units can be a side's length, with no exceptions and no rounding: where the root is
   not whole, this is null, and no side can take it. */
const sideLength = (b, dim) => { if (unset(b)) return null;      /* no number yet: no length to give */
  if (dim === 'm'){ const v = scalarOf(b); return isWhole(v) && v >= 1 ? v * view.unit : null; } const r = rootSide(b); return r === null ? b.rect[dim] : isWhole(r) && r >= 1 ? r * view.unit : null; };
/* ---- attributes ----
   Everything a variable has, together, as the properties panel shows it: the lengths of its two sides (x and y),
   a scalar's mass (the number it holds), and whatever attributes have been added to it by hand. Each has a value
   that can be typed over. An added attribute has a name of the user's choosing and a value that is a number or
   arithmetic (expression.js, which hands the working out to a maths solver), in which the variable's other attributes can be used by name: x, y, mass, and the
   added ones. Added attributes belong to the variable: every reference to it has the same ones. */
const attrsOf = b => (b.attrs ||= []);
/* what an attribute comes to: a value of any kind, null where nothing is typed */
const attrValue = (b, a) => working(originOf(b).id + ' a ' + a.name.trim().toLowerCase(), () => evaluate(a.text, lookupFor(b)).value ?? null);
/* one measure of a variable as a value: its width or height (x, y) the variable's own way round, a scalar's mass
   (m), or an attribute (a, by name). null where it has no value yet (a named scalar not given a number: its mass and
   its sides are still symbols); undefined for an attribute it has not got. */
function measured(b, measure, name){
  if (measure === 'g') return isArrow(b) ? b.arrow.gap : { err: 'not an arrow: it has no gap' };
  if (measure === 'm') return single(b) ? scalarOf(b) : { err: 'not a scalar: it has no mass' };
  if (measure === 'a'){ const key = String(name).trim().toLowerCase(), a = attrsOf(b).find(a => a.name.trim().toLowerCase() === key); return a ? attrValue(b, a) : undefined; }
  if (single(b)){ const v = scalarOf(b); if (unset(b)) return null; if (isError(v)) return v; const r = rootSide(b); if (r !== null) return r; }      /* a scalar's side is the root of its mass */
  return Math.round(((measure === 'x') !== turned(b) ? b.rect.w : b.rect.h) / view.unit);
}
/* what a name or a capsule in one of b's formulas stands for (expression.js: evaluate's lookup). A capsule names a
   measure of any variable, by its block's id. A bare name is one of b's own: x, y, mass, or an attribute it was given. */
function lookupFor(b){
  const mine = bare(b.name).trim().slice(0, 10).toLowerCase() + '.';
  return token => {
    if (typeof token === 'string' && isArrow(b)) return undefined;      /* an arrow has no attributes of its own to call by a bare name (x, i and j are its formula's: arrows.js) */
    if (typeof token !== 'string'){ const of = blockOf(token.id); if (!of) return undefined;      /* its variable is gone: "missing variable" */
      const v = measured(of, token.measure, token.name); return v === undefined ? { err: 'missing attribute' } : v; }
    const k = token.toLowerCase(), short = k.startsWith(mine) ? k.slice(mine.length) : k;
    if (short === 'x' || short === 'y') return measured(b, short);
    if (short === 'mass' && single(b)) return scalarOf(b);
    return measured(b, 'a', k); };
}
/* ---- typing a formula ----
   Every value is typed in a formula field (components/formula.js). What such a field needs from the page: how a
   capsule is drawn, the variables an @ offers, and to say which field is open, so that a measure dragged from the
   list at the right edge can be put into it. */
let openField = null;
const variableOf = b => ({ id: originOf(b).id, name: bare(b.name).trim(), color: b.shape.color, scalar: single(b), attributes: attrsOf(b).map(a => a.name.trim()).filter(Boolean) });
/* the variables a formula typed here can refer to: every named shape in reach of this space */
function reachList(){
  const { main, hidden } = inReach(), out = [];
  const add = list => { for (const i of list){ if (i.kind === 'shape') out.push(variableOf(i.block)); else if (i.children) add(i.children); } };
  add(main); add(hidden); return out;
}
const fields = { reach: reachList, onOpen: f => { openField = f; }, onClose: f => { if (openField === f) openField = null; },
  look: capsule => { const b = blockOf(capsule.id); return !b ? null : capsule.measure === 'g' && b.arrow?.gapName ? { label: b.arrow.gapName, color: b.shape.color } : { label: label(capsule, bare(b.name).trim()), color: b.shape.color }; } };
/* a formula field opened over one entry of a matrix on the canvas: cell is the entry's element, o and key the block and the entry it really belongs to */
function typeEntry(cell, o, key){
  const was = [...cell.childNodes], back = () => cell.replaceChildren(...was);
  const f = createFormula({ ...fields, text: typedText(o.values.get(key)), onKeep: text => { back(); bus.send('entry.set', { id: o.id, key, text: text || null }); }, onLeave: back });
  cell.replaceChildren(f.el); f.focus();
}
/* what was typed, worked out now for b: names typed out after an @ are bound to their capsules first. { value } or { refused } */
function readTyped(b, text){ const t = bound(text, reachList()); if (t.refused) return t; const got = evaluate(t.text, lookupFor(b)); return got.empty ? { refused: 'nothing was typed' } : { value: got.value }; }
function attributesOf(b){
  const r = rootSide(b), u = view.unit, v = scalarOf(b), one = single(b), len = dim => unset(b) ? '√' + symbolOf(b) : one && isError(v) ? '!' : r === null ? String(Math.round(b.rect[dim] / u)) : valueText(r);
  /* what a formula comes to, written after it where that says more than what was typed; why, where it comes to an error */
  const told = (text, v) => ({ error: isError(v) ? v.err : null, result: (w => w && !isError(v) && w.replace(/\s+/g, '') !== text.replace(/\s+/g, '') ? w : null)(valueText(v)) });
  /* seen: how each capsule in a text is drawn just now, so that the panel is drawn again when a variable it names is renamed, recoloured or gone */
  const seen = text => ({ seen: refs(text).map(fields.look) });
  const fixed = [{ key: 'x', label: sideName(b, 'w') || 'x', text: len('w') }, { key: 'y', label: sideName(b, 'h') || 'y', text: len('h') }];
  if (one){ const stored = measures(b) || rangedOf(b) ? undefined : b.values.get('1,1'), text = isFormula(stored) ? stored.expr : v === null ? symbolOf(b) : isError(v) ? '' : typedText(v);      /* a formula as it was typed; not yet given a value: its symbol */
    fixed.push({ key: 'mass', label: massName(b) || 'mass', text, ...seen(text), ...told(text, isFormula(stored) || isError(v) ? v : null) }); }
  return [...fixed, ...attrsOf(b).map((a, i) => ({ key: 'a' + i, custom: true, label: a.name, text: a.text, ...seen(a.text), ...told(a.text, attrValue(b, a)) }))];
}
/* the block an entry of the selected shape's matrix really belongs to, and its key there */
const entryOfSelected = key => { const b = [...selected][0], [c, r] = key.split(',').map(Number); return b ? entryHome(b, c, r) : null; };
const properties = createProperties({ ...fields,
  onName: text => { const b = [...selected][0]; if (b) bus.send('rename', { id: b.id, name: text, color: isNamed(b) ? null : someColour() }); },
  onAdd: () => { const b = [...selected][0]; if (!b) return; properties.focus('a' + attrsOf(b).length + '.label'); bus.send('attr.add', { id: b.id }); },
  onLabel: (key, text) => { const b = [...selected][0]; if (b) bus.send('attr.set', { id: b.id, index: +key.slice(1), name: text }); },
  onEntry: (key, text) => { const home = entryOfSelected(key); if (home) bus.send('entry.set', { id: home[0].id, key: home[1], text: text === '' ? null : text }); },
  /* what an entry holds, as it would be typed: its formula or its literal; for an entry that is another shape's (a measure, a part), what it shows */
  textOf: key => { const home = entryOfSelected(key); return !home ? '' : home[0].values.has(home[1]) && !home[0].members && !seatedOf(home[0]) && !givenOf(home[0]) ? typedText(home[0].values.get(home[1])) : typedText(valuesOf([...selected][0]).get(key)); },
  onValue: (key, text) => { const b = [...selected][0]; if (!b) return;
    if (isArrow(b)) return arrowTyped(b, key, text);
    if (key[0] === 'a') return bus.send('attr.set', { id: b.id, index: +key.slice(1), text });
    /* a scalar's mass and sides take a value of any kind, or a formula. Its side is the root of its mass, so a side
       typed is a mass of that squared: a side of 3 is a mass of 9, of √2 a mass of 2. It stays one square whatever is typed. */
    if (key === 'mass') return bus.send('entry.set', { id: b.id, key: '1,1', text: text === '' ? null : text });
    if (rootSide(b) !== null || (isNamed(b) && single(b))) return bus.send('entry.set', { id: b.id, key: '1,1', text: text === '' ? null : `(${text})^2`, settle: true });
    /* any other shape is drawn on the grid: its side is a whole number of squares, at least 1 (algebra.js: sideOf).
       A formula typed there is worked out once, now, and has to come to such a number. */
    const got = readTyped(b, text), side = got.refused ? got : sideOf(got.value);
    if (side.refused){ hud.say(`${key}: ${side.refused}`); return shown(); }
    bus.send('side.set', { id: b.id, dim: key === 'x' ? 'w' : 'h', text: String(side.length) }); } });
/* brings what is on screen in line with the selection and the blocks' positions. An arrow set against a written
   result is placed once that result has been written, and a block seated on it after that: so the screen is drawn,
   the arrows and seats are put in their places again (arrange), and where any moved it is drawn once more. */
function shown(){
  memo = new Map();
  try { for (let pass = 0; pass < 4; pass++){ paint(); if (!arrange()) break; } } finally { memo = null; }
}
const outs = new Map();                        /* arrow -> its output as it is written (components/result.js) */
const arrowFrame = createBounds();             /* the frame round a selected arrow and its output */
function paint(){
  hush(); follow(); arrange(); configure();
  for (const b of space.blocks) if (measures(b)){ const src = sourceOf(b); if (!src) continue; const name = sideName(src, dimOf(b, src));
    if (name && b.name !== name){ b.call(name); for (const k of kinOf(b)) k.call(name); } if (b.shape.color !== src.shape.color) for (const k of kinOf(b)) k.paint(src.shape.color); }
  for (const b of space.blocks){ const v = scalarOf(b); b.face(v === null ? null : asText(v)); b.warn(isArrow(b) ? !!outputOf(b).warn : lost(b)); b.sit(!!b.seat); b.given(!!b.in);      /* a part its source is now too small to have is drawn in the warning colour; so is an arrow that cannot be what it says, and a block whose seat is gone */
    if (isArrow(b)) b.el.classList.toggle('anon', !isNamed(b)); }
  for (const b of space.blocks) if (b.members){ flow(b); b.join(partsOf(b, 0, 0, b.rect.w / view.unit, b.rect.h / view.unit), b.rect.w / view.unit, b.rect.h / view.unit); }
  const list = [...selected], one = list.length === 1 ? list[0] : null;
  for (const b of space.blocks){ b.select(selected.has(b)); b.dim(selected.size > 0 && !selected.has(b)); b.grips(!(list.length > 1 && selected.has(b))); }
  /* the properties of the one shape selected: its name, its shape, its value */
  if (one && isArrow(one)){ const o = outputOf(one), fn = fnOf(one), t = o.type, seat = seatOn(one, space), wrong = [...(o.values || [])].filter(([, v]) => isError(v));
    properties.show({ id: one.id, name: one.name, color: getComputedStyle(one.el).getPropertyValue('--block').trim(), cols: t?.cols || 1, rows: t?.rows || 1, scalar: false, plain: true, fixed: true,
      shape: (fn.formula ? 'entry formula' : o.defined ? 'defined in its space' : 'pass through') + (t ? `: ${t.cols} wide × ${t.rows} tall` : ''), attributes: arrowRows(one, fn),
      notes: [...(o.warn ? [o.warn[0].toUpperCase() + o.warn.slice(1)] : []), ...wrong.slice(0, 6).map(([k, v]) => `entry ${k}: ${v.err}`), ...(wrong.length > 6 ? [`and ${wrong.length - 6} more`] : [])],
      matrix: t ? { letter: initials((seat || one).name), values: o.values || new Map(), colsName: t.colsName, rowsName: t.rowsName } : null }); }
  else if (one){ const cols = Math.round(one.rect.w / view.unit), rows = Math.round(one.rect.h / view.unit);
    const values = valuesOf(one), scalar = cols === 1 && rows === 1 && !one.members, wrong = scalar ? [] : [...values].filter(([, v]) => isError(v));      /* why each entry that shows the error mark does (a scalar's is said on its mass) */
    properties.show({ id: one.id, name: one.name, color: getComputedStyle(one.el).getPropertyValue('--block').trim(), cols, rows, scalar, attributes: attributesOf(one),
      notes: [...wrong.slice(0, 6).map(([k, v]) => `entry ${k}: ${v.err}`), ...(wrong.length > 6 ? [`and ${wrong.length - 6} more`] : [])],
      matrix: { letter: initials(one.name), values, transposed: turned(one), colsName: one.sides.w, rowsName: one.sides.h } }); }
  else properties.show(null);
  if (one && !isArrow(one)){ measure ||= createMeasure(view.unit); view.world.append(measure.el); measure.set(one.rect, { ...sides(view, one.rect), wName: shownSide(one, 'w'), hName: shownSide(one, 'h'), ...rootOf(one) }); }
  else measure?.el.remove();
  /* every frame is drawn, named or not; the one that is the whole selection also carries the tools */
  const oneGroup = groupIs(list), live = new Set();
  for (const id of framesIn(space)){ const name = space.groupNames.get(id) || '';
    const ms = inGroup(id); if (!ms.length) continue;
    live.add(id); if (!space.frames.has(id)) space.frames.set(id, createBounds());
    const whole = ms.length === list.length && ms.every(b => selected.has(b));      /* the selection is this frame (two frames, one round the other, can hold the very same blocks) */
    const f = space.frames.get(id), on = whole || id === room.host;      /* lit while a selection is held over it */
    f.fit = [room.loose?.get(id) || boxOf(ms), { name, solid: true, selected: on, tools: whole, grouped: true, fold: true, grow: namedBelow(id) }, room.loose?.has(id) ? [] : ms];
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
  /* the algebra of what is here: a mark wherever two blocks touch, whatever the touch means, and whether it all comes to the promised size */
  for (const b of space.blocks) b.off(isOff(b));
  const u = view.unit, { active, rects, touches: ts, all } = algebraIn(space);
  /* commented-out blocks take no part */
  for (const j of marks) j.el.remove();
  const mixed = new Set(all.filter(p => p.rule === 'mixed').flatMap(p => p.members));      /* in a piece of more than one rule, every mark is a warning */
  marks = ts.map(t => createJoin({ kind: t.kind, x: t.x * u, y: t.y * u, ok: t.ok, note: t.note, warn: mixed.has(t.a) }));
  const js = ts.filter(t => t.kind === 'product').map(t => ({ ...t, left: t.a, right: t.b }));
  /* in a product the left block gives its rows and the right block its columns, so the left one is banded across
     and the right one down; a block in the middle of a chain does both */
  for (const b of space.blocks){ const i = active.indexOf(b), rows = i >= 0 && js.some(j => j.ok && j.left === i), cols = i >= 0 && js.some(j => j.ok && j.right === i);
    b.stripes(rows && cols ? 'both' : rows ? 'rows' : cols ? 'cols' : null, u); }
  view.world.append(...marks.map(j => j.el));
  /* how a piece's matrix is written. One block: its own initials, colour and numbers. A product: each entry as the
     row it takes from the first block against the column it takes from the last, each in its block's colour.
     (A product is not worked out in numbers yet.) A sum or an elementwise chain: each entry as its members' entries
     with the signs between them, a₁₁+b₁₁, each in its block's colour; these are not worked out in numbers yet either. */
  const lookOf = piece => { const bs = piece.members.map(m => active[m]), first = bs[0], last = bs[bs.length - 1];
    if (piece.rule === 'sum' || piece.rule === 'elementwise') return { combined: {
      parts: bs.map(b => ({ letter: initials(b.name), color: b.shape.color, cols: Math.round(b.rect.w / u), rows: Math.round(b.rect.h / u), transposed: turned(b) })),
      signs: piece.members.slice(1).map((m, n) => piece.rule === 'sum' ? '+' : ts.some(t => t.kind === 'over' && t.a === piece.members[n] && t.b === m) ? '/' : '·') } };
    /* a shape in a .config is written in the ordinary text colour, since its own may be the canvas's, with the entries it leaves to the definitions above written faintly */
    if (bs.length === 1 && inConfig(first, space)) return { letter: initials(first.name), values: valuesOf(first), inherited: inheritedBy(first, space), tiles: tileLook(first) };
    if (bs.length === 1) return { letter: initials(first.name), color: first.shape.color, values: valuesOf(first), tiles: tileLook(first), transposed: turned(first) };
    /* scalars times at most one other shape: that shape's entries, each multiplied through where the numbers are known;
       an entry not known is written as the scalars against its symbol */
    const one = b => b.rect.w === u && b.rect.h === u && !b.members, scalars = bs.filter(one), solid = bs.filter(b => !one(b));
    if (scalars.length && solid.length <= 1){ const of = solid[0] || scalars.pop(), ks = scalars.map(b => valuesOf(b).get('1,1') ?? null);
      const known = ks.every(k => k !== null), k = known ? ks.reduce((a, b) => combine('*', a, b), 1) : null, values = new Map();
      if (known) for (const [key, v] of valuesOf(of)) values.set(key, combine('*', k, v));      /* values of any kind, by the rules for combining them (algebra.js): nothing times infinity is an error */
      return { letter: (known ? asText(k) : scalars.map(b => initials(b.name)).join('')) + initials(of.name), color: of.shape.color, values, transposed: turned(of) }; }
    const ends = solid.length ? solid : bs; return { product: { rows: { letter: initials(ends[0].name), color: ends[0].shape.color }, cols: { letter: initials(ends[ends.length - 1].name), color: ends[ends.length - 1].shape.color } } }; };
  /* a definition space sets what is here beside its block's promised size. The Menu has no promise, so it
     writes out what each piece comes to, beside that piece. (Shapes that do not touch are separate pieces.) */
  const stacked = new Set(ts.filter(t => t.kind === 'sum').flatMap(t => [active[t.a], active[t.b]]));
  const standing = new Set(((space.owner && tilesOf(space.owner)) || []).map(t => t.block));      /* shapes standing in the definition's matrix sit against one another too */
  for (const b of space.blocks) b.inset(stacked.has(b) || standing.has(b));      /* in a sum there is no room above a block for its name (the next one up is there): names go on the blocks */
  if (space.definition && space.definition.tiled !== defKey(space.owner)) write();      /* shapes have gone into, or come out of, its block's matrix; or an arrow's output is another size */
  /* what the space comes to: its ends, the pieces (and outputs) nothing reads from. What is in a .config is no part of it. */
  const mine = space.definition ? endsOf(space, { active, all }) : [], outLook = a => ({ letter: initials(a.name), values: outputOf(a).values || new Map() });      /* in the ordinary text colour: the function colour is for the triangle */
  space.definition?.check(!mine.length ? null : mine.length === 1 ? mine[0].type : { error: mine.length + ' pieces' }, mine.length === 1 ? (mine[0].piece ? lookOf(mine[0].piece) : outLook(mine[0].arrow)) : {});
  const ps = space.owner ? [] : all;
  /* a result stays by its piece: to the right; if something else is there (another block, or a result already placed),
     just below, to the left, or a little further below; and if every one of those is taken, to the right all the
     same, over whatever is there. It never goes off looking for room. */
  /* (an arrow that reads a written result, and the block seated on it, are placed by where the result is written: they are not in its way, or it would run from them) */
  const follows = b => (isArrow(b) && b.arrow.input.as === 'result') || (typeof b.seat === 'string' && space.blocks.some(a => a.id === b.seat && isArrow(a) && a.arrow.input.as === 'result'));
  const taken = space.blocks.filter(b => !follows(b)).map(b => b.rect),      /* commented-out blocks are still in the way */
     hits = r => taken.some(t => t !== r && t.x < r.x + r.w && t.x + t.w > r.x && t.y < r.y + r.h && t.y + t.h > r.y);
  /* A times or over pair encloses two empty rectangles, its hollows, and its result is written in them, on the bare
     canvas, in place of the "= …" beside the piece: in neither, one or both, as .show_hadamard_copies says. Which
     hollows, if any, is worked out in algebra.js (resultHollows); the page says only how many squares the matrix
     takes as it is written, and draws. With none, the result goes beside the piece as any other does. */
  /* With one copy asked for, the hollow written in is the one an arrow reads from, where one does. Each is given with which of the pair's two it is (n). */
  const readers = space.blocks.filter(k => isArrow(k) && !isOff(k) && k.arrow.input.as === 'result' && k.arrow.input.hollow);
  const hollowsOf = piece => { if (piece.type.error) return [];
    const both = pieceHollows(rects, piece), needed = readers.filter(k => piece.members.some(m => active[m].id === k.arrow.input.id)).map(k => k.arrow.input.hollow);
    return resultHollows(rects, piece, hadamardCopies(active[piece.members[0]]), { cols: squares(piece.type.cols, piece.type.colsName), rows: squares(piece.type.rows, piece.type.rowsName) }, needed)
      .map(h => ({ n: both.indexOf(h) + 1, x: h.x * u, y: h.y * u, w: h.w * u, h: h.h * u })); };
  /* a product, a sum or an elementwise result can be named, folding its blocks into one; a block on its own already is one, and has its own name */
  const writ = ps.map(piece => ({ blocks: piece.members.map(m => active[m]), type: piece.type, look: lookOf(piece), nameable: piece.members.length > 1, hollows: hollowsOf(piece),
    editable: piece.members.length === 1 && isNamed(active[piece.members[0]]),      /* a named shape on its own: its entries can be typed where they are written */
    box: { x: piece.box.x * u, y: piece.box.y * u, w: piece.box.w * u, h: piece.box.h * u } }));
  writ.forEach(({ blocks, type, look, nameable, editable, box, hollows }, i) => { const r = results[i] ||= createResult({ unit: u }); view.world.prepend(r.el);
    r.piece = { blocks, type, box, hollows, body: null };            /* what this result is the result of, and the hollows it is written in */
    let at = null;
    for (const where of hollows.length ? [{ hollows }] : [{}, { side: 'below' }, { side: 'left' }, { side: 'below', drop: 1 }, { side: 'below', drop: 2 }, {}]){ at = r.set(box, type, { ...where, look, nameable, editable }); if (where.hollows || !hits(at)) break; }
    r.piece.at = at; r.piece.body = hollows.length ? null : r.body(); taken.push(at); });      /* body: where its matrix is, for an arrow set against it */
  for (const r of results.slice(writ.length)) r.el.remove();
  /* a named group's frame takes in what is written beside its shapes, too */
  for (const f of space.frames.values()){ const [box, options, ms] = f.fit; let x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
    for (const r of results.slice(0, writ.length)) if (r.piece.at && r.piece.blocks.every(b => ms.includes(b))){ const a = r.piece.at;
      x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y); x1 = Math.max(x1, a.x + a.w); y1 = Math.max(y1, a.y + a.h); }
    f.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    if (x1 - x0 !== box.w || y1 - y0 !== box.h) f.set(f.box, options); }
  /* each arrow's output, written on the bare canvas in its place: the matrix alone, like a result in a hollow. It
     can be pressed, to seat a named block on it, until a block is seated there; then the block lies over it, inset. */
  const here = new Set(space.blocks.filter(isArrow));
  for (const [a, r] of outs) if (!here.has(a)){ r.el.remove(); outs.delete(a); }
  for (const a of here){ const o = outputOf(a), seat = seatOn(a, space), r = outs.get(a) || createResult({ unit: u }); outs.set(a, r);
    if (!o.place || !o.type){ r.el.remove(); continue; }
    const at = { x: o.place.x * u, y: o.place.y * u, w: o.place.w * u, h: o.place.h * u };
    view.world.prepend(r.el); r.set(at, o.type, { hollows: [at], look: seat ? { letter: initials(seat.name), color: seat.shape.color } : outLook(a), nameable: !seat, warn: !!o.warn }); r.at = at; }
  /* a selected arrow shows a frame round itself and its output */
  if (one && isArrow(one)){ const at = outs.get(one)?.el.isConnected ? outs.get(one).at : one.rect, x = Math.min(one.rect.x, at.x), y = Math.min(one.rect.y, at.y);
    arrowFrame.set({ x, y, w: Math.max(one.rect.x + one.rect.w, at.x + at.w) - x, h: Math.max(one.rect.y + one.rect.h, at.y + at.h) - y }, { selected: true }); view.world.append(arrowFrame.el); }
  else arrowFrame.el.remove();
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
   Click the matrix a product, a sum or an elementwise piece comes to (beside it, or in a hollow) and give it a name: the blocks that came to it fold away into a new block of that name,
   the size of the result, in a bold colour picked at random. They become its definition: open it to find them on
   the left of its "=". */
/* what folding these blocks would make: if they come to one thing (a product, say) the new block is that size;
   if not, it is the size of the box round them */
function foldable(list){
  const u = view.unit, box = boxOf(list), type = typeOf(list.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u, wName: b.sides.w, hName: b.sides.h })));
  return { blocks: list, box, type: type && !type.error ? type : { cols: box.w / u, rows: box.h / u, colsName: null, rowsName: null } };
}
function fold({ blocks: inside, type, box }, name, color = someColour()){
  const u = view.unit, fixed = fixedIn(inside, 'folded away');
  if (fixed){ hud.say(fixed); return shown(); }
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
  const dx = -u * (3 + squares(type.cols, type.colsName)) - (box.x + box.w), dy = Math.round(-box.h / 2 / u) * u - box.y;
  for (const b of inside){
    b.el.remove(); space.blocks.splice(space.blocks.indexOf(b), 1); space.groupOf.delete(b);
    b.set({ ...b.rect, x: b.rect.x + dx, y: b.rect.y + dy }); def.blocks.push(b);
    if (spaceOf.has(b)) spaceOf.get(b).parent = def;                                                 /* its own definition now hangs under the new one */
  }
  /* what was cut goes with the shapes it made, where all of them fold away: the blocks it keeps move as they did */
  for (const o of [...space.ops]) if (o.results.every(id => inside.some(b => b.id === id))){ space.ops.splice(space.ops.indexOf(o), 1); def.ops.push(o);
    for (const b of o.sources) b.set({ ...b.rect, x: b.rect.x + dx, y: b.rect.y + dy }); o.was = null; }      /* their old place in the order, and their frames, were this space's */
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
const picture = (b, s) => ({ id: b.id, arrow: isArrow(b) ? { ...b.arrow, input: { ...b.arrow.input }, output: b.arrow.output ? { ...b.arrow.output } : null, formula: isUse(b) ? null : fnOf(b).formula } : null, use: isUse(b),
  seat: !b.seat ? null : typeof b.seat === 'string' ? b.seat : { hollow: [...b.seat.hollow] }, in: !!b.in, tile: !!b.tile, t: !!b.t, shape: { ...b.shape }, rect: { ...b.rect }, name: b.name, sides: { ...b.sides }, attrs: attrsOf(b).map(a => ({ ...a })), values: measures(b) ? [...valuesOf(b)].filter(([, v]) => storable(v)) : rangedOf(b) ? [...valuesOf(b, 0, true)].filter(([, v]) => storable(v)) : [...b.values],      /* plain data throughout, so a paste can say what it pasted; a measure, or a part of another shape, is copied as the numbers it now shows */
  groups: chain(b, s).map(g => ({ id: g, name: s.groupNames.get(g) ?? null })),      /* the groups it is in, innermost first */
 
  inside: spaceOf.has(b) ? spaceOf.get(b).blocks.map(o => picture(o, spaceOf.get(b))) : null,
  members: b.members ? b.members.map(m => ({ fx: m.fx, fy: m.fy, fw: m.fw, fh: m.fh, pic: picture(m.block, s) })) : null });
function copy(){ if (selected.size) clipboard = [...selected].map(b => picture(b, space)); }
function cut(also){ if (selected.size){ copy(); remove(also); } }
/* makes the blocks in pictures inside space s, moved by (dx, dy); blocks that were grouped together are grouped together again */
function develop(pictures, s, dx, dy){
  const u = view.unit, groups = new Map(), made = [], now = new Map();      /* now: the id a block had when it was copied -> the block made from it */
  for (const pic of pictures){
    const r = { ...pic.rect, x: pic.rect.x + dx, y: pic.rect.y + dy };
    for (const dim of ['w', 'h']) if (pic.sides[dim] && lengthCalled(pic.sides[dim], s) !== undefined) r[dim] = lengthCalled(pic.sides[dim], s);      /* a named side is whatever length that name is now */
    const name = s === space && /^Shape \d+$/.test(pic.name) ? freeName() : pic.name;      /* a block never given a name of its own gets a fresh number */
    const b = pic.arrow ? makeArrow(name) : makeBlock(pic.shape, r, name); b.sides = { ...pic.sides }; b.attrs = (pic.attrs || []).map(a => ({ ...a })); b.values = new Map(pic.values); b.turn(pic.t); if (pic.tile && s !== space) b.tile = true;
    if (pic.arrow){ const { formula, ...geo } = pic.arrow; b.set(r); b.arrow = { ...geo, input: { ...geo.input }, output: geo.output ? { ...geo.output } : null }; b.fn = { formula }; if (pic.use) b.ref = true; }
    if (pic.seat) b.seat = typeof pic.seat === 'string' ? pic.seat : { hollow: [...pic.seat.hollow] };
    if (pic.in && s.owner && isArrow(s.owner) && !s.blocks.some(k => k.in)) b.in = true;      /* a function's input, copied with its function */
    if (pic.id) now.set(pic.id, b);
    if (pic.members) b.members = pic.members.map(m => ({ fx: m.fx, fy: m.fy, fw: m.fw, fh: m.fh, block: hidden(m.pic, s) }));
    s.blocks.push(b); made.push(b);
    pic.groups.forEach((g, i) => { if (!groups.has(g.id)){ groups.set(g.id, newGroup()); if (g.name) s.groupNames.set(groups.get(g.id), g.name); }
      if (i === 0) s.groupOf.set(b, groups.get(g.id)); else s.groupUp.set(groups.get(pic.groups[i - 1].id), groups.get(g.id)); });
    if (pic.inside){ const def = newSpace(b, s); spaceOf.set(b, def); develop(pic.inside, def, 0, 0); }
    if (pic.arrow){ if (!spaceOf.has(b)) spaceOf.set(b, newSpace(b, s)); }
  }
  /* an arrow copied with its input reads the copy, and a block copied with its seat sits on the copy; an arrow copied
     alone reads what the one it was copied from reads, and a seated block copied without its seat is not seated */
  for (const b of made){
    if (isArrow(b)){ const to = now.get(b.arrow.input.id); if (to) b.arrow.input.id = to.id; }
    if (typeof b.seat === 'string') b.seat = now.get(b.seat)?.id || null;
    else if (b.seat) b.seat = b.seat.hollow.every(id => now.has(id)) ? { hollow: b.seat.hollow.map(id => now.get(id).id) } : null; }
  for (const b of made) if (isArrow(b)) ensureIn(spaceOf.get(b), b);
  tidy(s);                                     /* a group of which only part was copied may not be a group here */
  return made;
}
/* a block made from a picture but put in no space: one of those a joined shape was joined from */
function hidden(pic, s){
  const b = makeBlock(pic.shape, { ...pic.rect }, pic.name); b.sides = { ...pic.sides }; b.attrs = (pic.attrs || []).map(a => ({ ...a })); b.values = new Map(pic.values); b.turn(pic.t);
  if (pic.members) b.members = pic.members.map(m => ({ fx: m.fx, fy: m.fy, fw: m.fw, fh: m.fh, block: hidden(m.pic, s) }));
  if (pic.inside){ const def = newSpace(b, s); spaceOf.set(b, def); develop(pic.inside, def, 0, 0); }
  return b;
}
function paste(at, clipboard, fresh = true){                             /* at: a world point; the pasted blocks are centred on it, on the dots */
  if (!clipboard?.length) return;
  const u = view.unit, rs = clipboard.map(p => p.rect), x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y));
  const cx = (x0 + Math.max(...rs.map(r => r.x + r.w))) / 2, cy = (y0 + Math.max(...rs.map(r => r.y + r.h))) / 2;
  let dx = Math.round((at.x - cx) / u) * u, dy = Math.round((at.y - cy) / u) * u;
  /* pasting twice in one place would hide one copy exactly behind the other: step down and right until it would not */
  while (space.blocks.some(b => clipboard.some(p => b.rect.x === p.rect.x + dx && b.rect.y === p.rect.y + dy))){ dx += u; dy += u; }
  const made = develop(clipboard, space, dx, dy);
  if (fresh) for (const b of made) if (isNamed(b) && !isArrow(b) && !b.in) b.paint(someColour(b.shape.color));      /* a copy is a variable of its own: a new colour every time */
  view.world.append(...made.map(b => b.el));
  select(made); return made;
}

/* removes the selected blocks, and with each its definition space */
/* transposes the selection. A shape on its own turns about its top-left corner: its width and height change places,
   with their names, and entry c,r becomes entry r,c. A product turns as a whole, (A·B·C)ᵀ = Cᵀ·Bᵀ·Aᵀ: each shape is
   transposed and their order reversed, laid out again from the product's top-left corner. A shape is a variable, so
   it alone is turned: other uses of the variable stay as they are. (What is inside its definition space is left as it is.)
   Only a row of products is laid out again; the shapes of a sum or an elementwise piece each turn where they are. */
function transpose(){
  if (!selected.size) return;
  const fixed = fixedIn([...selected], 'transposed'); if (fixed){ hud.say(fixed); return shown(); }
  const u = view.unit, list = [...selected], act = list.filter(b => !isOff(b)), done = new Set();
  const chains = pieces(act.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u, wName: b.sides.w, hName: b.sides.h })))
    .filter(p => p.rule === 'product').map(p => p.members.map(m => act[m]).sort((a, b) => a.rect.x - b.rect.x))
    .map(c => ({ blocks: c, x: Math.min(...c.map(b => b.rect.x)), y: Math.min(...c.map(b => b.rect.y)) }));
  /* a shape becomes the transpose of what it was: this use alone, marked with a T. Its width and height change places,
     with their names; its entries stay as the variable has them and are read turned. A joined shape is turned bodily,
     with everything it was joined from, and so are all its uses. */
  const flip = b => { if (done.has(b)) return;
    for (const k of b.members ? kinOf(b) : [b]){ done.add(k); k.turn(!k.t); k.set({ ...k.rect, w: k.rect.h, h: k.rect.w }); k.sides = { w: k.sides.h, h: k.sides.w }; }
    for (const m of b.members || []){ [m.fx, m.fy, m.fw, m.fh] = [m.fy, m.fx, m.fh, m.fw]; flip(m.block); } };
  list.forEach(flip);
  for (const c of chains){ let x = c.x; for (const b of c.blocks.reverse()){ b.set({ ...b.rect, x, y: c.y }); x += b.rect.w; } }
  if (space.owner && done.has(space.owner)) write();      /* the block whose space this is has turned too */
  shown();
}
/* ---- the boolean tool: Difference, Intersect and Revert ----
   Difference is what exactly one of the selected shapes covers. Shapes that fit together into a rectangle, with
   nothing missing and nothing doubled, are fused into one shape: that rectangle. Two shapes laid one over the other
   are cut: what is left of each, once the part they share is taken out, becomes new shapes. Intersect makes one new
   shape of the part two shapes share. Revert undoes any of the three. Which of these a selection allows, and why not,
   is algebra.js's to say (difference, intersection, cut); here the blocks are made and put away.

   A fused shape keeps the shapes it was fused from, whole (their names, entries, definitions), only out of sight;
   Revert puts them back. On its face each keeps its colour, with a wavy line where two meet. Its entries are theirs:
   each of its entries is the entry of the shape that covers that place, and a number typed into it goes to that
   shape. A fused shape can be fused again, into a larger one.
   block.members: [{ block, fx, fy, fw, fh }], each with the part of the fused shape it takes up, as fractions, so
   they follow when it is resized.

   A cut or an intersection takes its two shapes off the canvas and keeps them, whole, in the space's list of
   operations: space.ops, each { id, op: 'difference' | 'intersect', sources: [the two blocks], results: [block ids],
   was: [where each source was: { order, frames }] or null }. Revert puts each source back at that place among the
   blocks and in those frames, so a cut reverted leaves the project as it was before the cut.
   A kept block is still a use of its variable and still has its id, so everything that names it finds it, and its
   variable stays in the list at the right edge: a use of it can be pulled out, to see it or to change its entries.
   A kept block goes for good in two ways, both through the cascade and its warning (doomed): its variable is
   deleted, which takes the operation's shapes with it and puts the other kept block back; or every shape its
   operation made is deleted, which takes both kept blocks and whatever refers to them.
   Each shape made is a part of one of the two, its source: block.from = { id, range }, the range in whole columns
   and rows of the source as that block stands (algebra.js: rangeOf, rangeIn). It has no entries of its own. Entry
   c,r of the part is the source's entry in that column and row, whatever it is now, so a number given to the
   source's variable anywhere shows in the part at once, and nothing can be typed into the part. A part is the size
   of its range: where the range reached the source's edge it grows and shrinks with the source, and where the source
   is now too small to have that part the shape is drawn in the warning colour and has no value, until it is large
   enough again; so is a shape fused from such a part. A name typed on a part's shortened side is a real one, and
   since the part cannot change size, neither can any other side of that name: the readout says so. A part that has been named is a variable like any other; its other uses read the same part.
   The part made by an intersection is of the lower of the two shapes, the one earlier in the space's blocks; the
   upper one is only a stencil. */
const unitsOf = b => { const u = view.unit; return { x: Math.round(b.rect.x / u), y: Math.round(b.rect.y / u), w: Math.round(b.rect.w / u), h: Math.round(b.rect.h / u) }; };
const inOrder = list => space.blocks.filter(b => list.includes(b));      /* back to front, as they are drawn */
const measures = b => !!b.from && !b.from.range;      /* block.from is one of two things: a measure of a shape's side, or a part (a range) of a shape */
/* the block whose range b shows: itself, or, for another use of a part that was named, that part */
const rangedOf = b => b.from?.range ? b : kin.has(b) ? [...kin.get(b)].find(k => k.from?.range) || null : null;
const partOf = b => { const src = sourceOf(rangedOf(b)); return src ? bare(src.name) : 'another shape'; };      /* what to call its source, in a sentence */
/* a part's range as it lies in its source now, or null where the source cannot hold it (or is gone) */
const rangeNow = o => { const src = sourceOf(o), u = view.unit; return src ? rangeIn(o.from.range, Math.round(src.rect.w / u), Math.round(src.rect.h / u)) : null; };
/* a shape with no value just now: a part its source cannot hold, or a shape fused from one */
const lost = b => { const o = rangedOf(b); return (!!o && !rangeNow(o)) || (b.members || []).some(m => lost(m.block)) || seatLost(b); };      /* or a seated block whose seat is gone */
/* a part's entries: its source's, in its range (algebra.js: partEntries), the variable's own way round or turned */
function rangeValues(o, depth, over = false){
  const src = sourceOf(o), u = view.unit; if (!src) return new Map();
  flow(src);                                   /* a fused source's entries are gathered from what it was fused from */
  return partEntries(o.from.range, { cols: Math.round(src.rect.w / u), rows: Math.round(src.rect.h / u), entries: valuesOf(src, depth + 1, true), turned: turned(src) }, over);
}
/* every part takes the size its range now has in its source (a part of a part after the part it is of), and what
   shares its variable or a side's name follows. Called whenever the screen is brought up to date. */
function follow(){
  const u = view.unit;
  for (let pass = 0, moved = true; moved && pass < 8; pass++){ moved = false;
    for (const o of everyKnown()){ const at = o.from?.range && rangeNow(o); if (!at) continue;
      const w = (turned(o) ? at.rows : at.cols) * u, h = (turned(o) ? at.cols : at.rows) * u;
      if (o.rect.w !== w || o.rect.h !== h){ o.set({ ...o.rect, w, h }); agree(o); moved = true; } } }
}
/* The sides of a part. A side that takes in the whole of its source's side keeps the name given to that side (a real
   name: it is that length). Any other name it shows is a label, made by algebra.js (sideLabel) from what the two
   shapes of the operation call that side, a given name or an automatic one (Keys.x): A-B on what is left of a,
   B-A on what is left of b, A&B on an intersection, with .1 and .2 where one cut left two shapes of one source.
   A label is written on the measurement as a shape's automatic name is, and binds nothing: it is not in block.sides,
   so it makes no sides one length, lets no product pass by name, and does not elide the matrix. A name typed on the
   side is a real one and is shown in its place; so is the automatic name the shape has once it is itself named. */
const opOf = b => { for (const s of everySpace()) for (const o of s.ops) if (o.results.includes(b.id)) return { op: o, in: s }; return null; };
function labelOf(b, dim){
  if (isNamed(b) || !b.from?.range) return null;
  const op = opOf(b)?.op, src = op?.sources.find(k => k.id === b.from.id), other = op?.sources.find(k => k !== src); if (!src || !other) return null;
  const side = (dim === 'w') !== turned(b) ? 'cols' : 'rows', of = side === 'cols' ? 'w' : 'h';      /* the range is the variable's own way round */
  const made = op.results.map(id => everyKnown().find(k => k.id === id)).filter(k => k?.from?.range && k.from.id === src.id).map(k => k.from.range);      /* what this operation made of the same source */
  return sideLabel(b.from.range, side, sideName(src, of), sideName(other, of), op.op, nthOf(b.from.range, made));
}
const shownSide = (b, dim) => sideName(b, dim) || labelOf(b, dim);      /* what is written on its measurement */
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
    for (const [k, v] of rangedOf(m.block) ? valuesOf(m.block) : own(m.block)){ const [c, r] = k.split(',').map(Number); if (c <= at.w && r <= at.h) b.values.set((c + at.x) + ',' + (r + at.y), v); } }
}
/* the shape an entry of b really belongs to, and the entry's place in it */
function entryHome(b, c, r){
  if (!b.members) return [b, turned(b) ? r + ',' + c : c + ',' + r];      /* a transpose keeps its entries the variable's way round */
  const u = view.unit, cols = Math.round(b.rect.w / u), rows = Math.round(b.rect.h / u);
  for (const m of b.members){ const at = placeOf(m, cols, rows); if (c > at.x && c <= at.x + at.w && r > at.y && r <= at.y + at.h) return entryHome(m.block, c - at.x, r - at.y); }
  return [b, c + ',' + r];
}
/* Difference on the selection: fuse, cut, or a sentence saying why neither */
const refusing = (list, d, doing) => fixedIn(list, doing) ? { refused: fixedIn(list, doing) } : d;      /* an arrow, an input or a seated block is not cut or fused, whatever the rectangles say */
function differenceOf(){
  const list = inOrder([...selected]), d = refusing(list, difference(list.map(unitsOf)), 'cut or fused');
  if (d.refused) return hud.say(d.refused);
  if (d.fuse) return fuse();
  operate('difference', list, [...d.cut.a.map(r => [list[0], r]), ...d.cut.b.map(r => [list[1], r])]);
}
function intersectOf(){
  const list = inOrder([...selected]), d = refusing(list, intersection(list.map(unitsOf)), 'cut');
  if (d.refused) return hud.say(d.refused);
  operate('intersect', list, [[list[d.from], d.overlap]]);      /* a part of the lower of the two, as algebra.js has it */
}
function fuse(){
  const list = [...selected].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const box = boxOf(list), held = chain(list[0]).find(g => list.every(b => chain(b).includes(g)));      /* the innermost group holding them all */
  select([]);
  for (const b of list){ b.el.remove(); space.blocks.splice(space.blocks.indexOf(b), 1); space.groupOf.delete(b); }      /* out of sight, not forgotten */
  const made = makeBlock({ ...typeNamed('tensor') }, box, freeName());
  made.members = list.map(b => ({ block: b, fx: (b.rect.x - box.x) / box.w, fy: (b.rect.y - box.y) / box.h, fw: b.rect.w / box.w, fh: b.rect.h / box.h }));
  space.blocks.push(made); view.world.append(made.el); if (held !== undefined) space.groupOf.set(made, held);
  tidy(); select([made]);
}
/* puts the kept blocks of operations back among the blocks of s where each was: at its old place in the order (so
   what was drawn over what still is) and in the frames it was in, a frame that has gone since being made again */
function putBack(s, pairs){
  for (const [o, b] of pairs.map(([o, b]) => [o, b, o.was?.[o.sources.indexOf(b)]?.order ?? Infinity]).sort((x, y) => x[2] - y[2])){
    const was = o.was?.[o.sources.indexOf(b)] || {}, live = framesIn(s);
    s.blocks.splice(Number.isInteger(was.order) ? Math.min(was.order, s.blocks.length) : s.blocks.length, 0, b);
    (was.frames || []).forEach((f, i, all) => { if (i === 0) s.groupOf.set(b, f.id);
      if (!live.has(f.id)){ if (f.name) s.groupNames.set(f.id, f.name); if (all[i + 1]) s.groupUp.set(f.id, all[i + 1].id); } }); }
  if (s === space) view.world.append(...s.blocks.map(b => b.el));      /* on the canvas in the blocks' order, as when a project is opened */
}
/* a cut or an intersection: the two sources go off the canvas into a new operation, and a new shape is made for each
   part, [its source, its rectangle in units], unnamed and in the tensor colour, in whatever frame held both sources */
function operate(op, sources, parts){
  const u = view.unit, held = chain(sources[0]).find(g => sources.every(b => chain(b).includes(g)));
  /* where each source was, so that Revert can put it back exactly: its place among the blocks, and the frames it was in, innermost first */
  const was = sources.map(b => ({ order: space.blocks.indexOf(b), frames: chain(b).map(g => ({ id: g, name: space.groupNames.get(g) ?? null })) }));
  select([]);
  for (const b of sources){ b.el.remove(); space.blocks.splice(space.blocks.indexOf(b), 1); space.groupOf.delete(b); }
  const record = { id: ids.id('o'), op, sources: [...sources], results: [], was }, made = [];
  for (const [src, r] of parts){
    const b = makeBlock({ ...typeNamed('tensor') }, { x: r.x * u, y: r.y * u, w: r.w * u, h: r.h * u }, freeName());
    b.from = { id: src.id, range: rangeOf(unitsOf(src), r) };
    for (const [dim, side] of [['w', 'cols'], ['h', 'rows']]) if (wholeSide(b.from.range, side) && src.sides[dim]) b.sides[dim] = src.sides[dim];      /* a whole side keeps its name */
    space.blocks.push(b); view.world.append(b.el); if (held !== undefined) space.groupOf.set(b, held);
    made.push(b); record.results.push(b.id); }
  space.ops.push(record); tidy(); select(made);
}
/* puts back the shapes these fused shapes were fused from, where they now fall in each and at the size they now are there; gives them */
function unfuse(list){
  const u = view.unit, back = [];
  for (const j of list){ const cols = Math.round(j.rect.w / u), rows = Math.round(j.rect.h / u), group = space.groupOf.get(j);
    for (const m of j.members){ const at = placeOf(m, cols, rows), b = m.block;
      for (const k of kinOf(b)) if (k !== b) k.set({ ...k.rect, w: at.w * u, h: at.h * u });      /* every use of a variable is one size */
      b.set({ x: j.rect.x + at.x * u, y: j.rect.y + at.y * u, w: at.w * u, h: at.h * u });
      space.blocks.push(b); view.world.append(b.el); if (group !== undefined) space.groupOf.set(b, group); back.push(b); }
    j.el.remove(); space.blocks.splice(space.blocks.indexOf(j), 1); space.groupOf.delete(j); j.members = null; forget(j); }
  return back;
}
/* What Revert would do with the selection: { fused, ops } to undo, or { refused: a sentence }. A fused shape is taken
   apart. A shape made by a cut or an intersection takes every shape that operation made with it, and the two
   sources come back; all of those shapes have to be here to be removed. */
function revertible(list = [...selected]){
  const fused = list.filter(b => b.members), made = list.filter(b => !b.members).map(opOf).filter(Boolean), ops = [...new Set(made.map(m => m.op))];
  if (!fused.length && !ops.length) return { refused: 'Revert puts back what Difference or Intersect made: nothing selected was made by either' };
  if (made.some(m => m.in !== space)) return { refused: 'The shapes this was cut from are in another space, where the cut was made: it cannot be reverted from here' };
  if (ops.some(o => !o.results.every(id => space.blocks.some(b => b.id === id)))) return { refused: 'Another shape that cut made is inside something else now (fused, or cut again): revert that first' };
  return { fused, ops };
}
/* also: what refers to the shapes that go, anywhere (see doomed) */
function revert(also = []){
  const list = [...selected], r = revertible(list);
  if (r.refused) return hud.say(r.refused);
  const gone = r.ops.flatMap(o => o.results.map(blockOf)), back = r.ops.flatMap(o => o.sources);
  for (const o of r.ops) space.ops.splice(space.ops.indexOf(o), 1);
  const apart = unfuse(r.fused);
  putBack(space, r.ops.flatMap(o => o.sources.map(b => [o, b])));      /* first, so that nothing that names them finds them gone; what was made of them lies after them in the order, so each still falls where it was */
  selected.clear(); discard([...gone, ...also]);
  select([...list.filter(b => space.blocks.includes(b)), ...back, ...apart]);
}
/* an operation none of whose shapes is left anywhere is forgotten, with the two blocks it kept */
function pruneOps(){
  for (let again = true; again;){ again = false; const known = new Set(everyKnown().map(b => b.id));
    for (const s of everySpace()) for (const o of [...s.ops]){ o.results = o.results.filter(id => known.has(id));
      if (!o.results.length){ s.ops.splice(s.ops.indexOf(o), 1); for (const b of o.sources) forget(b); again = true; } } }
}
function forget(b){                             /* one use fewer of its variable; what it was joined from goes with it */
  spaceOf.delete(b); const set = kin.get(b); if (set){ set.delete(b); kin.delete(b); if (set.size < 2) for (const k of set) kin.delete(k); }
  for (const m of b.members || []) forget(m.block);
}
function remove(also = []){                      /* also: blocks anywhere that go with the selection (see doomed) */
  const gone = [...new Set([...selected, ...also])]; select([]); discard(gone); shown();
}
/* takes these blocks out of whatever spaces they are in, for good. A block a cut keeps off the canvas can be among
   them (its variable went, or everything made of it did: see doomed): its operation goes with it, with every shape
   the operation made, and the operation's other kept block, if that is not going too, is put back where it was. */
function discard(blocks){
  const going = new Set(blocks), touched = new Set([space]), spaces = everySpace(), ended = [];
  for (const s of spaces) for (const o of s.ops) if (o.sources.some(b => going.has(b))){ ended.push([s, o]);
    for (const id of o.results){ const made = everyKnown().find(k => k.id === id); if (made) going.add(made); } }
  /* a length taken from a shape that is going, while another use of that variable stays, is taken from that one instead */
  for (const d of everyBlock()) if (measures(d) && !going.has(d)){ const src = sourceOf(d), stay = src && going.has(src) && [...kinOf(src)].find(k => !going.has(k)); if (stay) d.from.id = stay.id; }
  /* and so is a formula that names it: its capsules are pointed at the use that stays (expression.js: repoint). A formula
     naming a variable of which nothing stays is left as it is, broken: it comes to "missing variable". */
  for (const b of going){ const stay = [...kinOf(b)].find(k => !going.has(k)), ids = new Set([b.id]); if (!stay) continue;
    for (const d of everyKnown()){ for (const [k, v] of d.values) if (isFormula(v) && refersTo(v.expr, ids)) d.values.set(k, { expr: repoint(v.expr, b.id, stay.id) });
      for (const a of attrsOf(d)) if (refersTo(a.text, ids)) a.text = repoint(a.text, b.id, stay.id);
      if (d.fn?.formula && refersTo(d.fn.formula, ids)) d.fn.formula = repoint(d.fn.formula, b.id, stay.id); } }
  for (const b of going){ const s = spaceWith(b); if (!s) continue; touched.add(s); b.el.remove(); s.blocks.splice(s.blocks.indexOf(b), 1); forget(b); }
  for (const [s, o] of ended){ s.ops.splice(s.ops.indexOf(o), 1); touched.add(s);
    for (const b of o.sources) if (going.has(b)) forget(b);
    putBack(s, o.sources.filter(b => !going.has(b)).map(b => [o, b])); }
  for (const s of touched) tidy(s);
  pruneOps();                                  /* a cut whose shapes have all gone is gone too */
}
/* ---- references ----
   What comes out of the list is never a copy. A shape from the list is a reference to its variable: the same entries,
   size, name, colour and definition as the shape the variable was made as (its source), changing with it. A length
   from the list, set down on the canvas, is an entry that is that side's length, whatever it is now, in the source's
   colour. Copy and paste is the way to make a separate thing: a paste is a variable of its own, in a new colour.
   When the source goes, everything that refers to it goes too: doomed(blocks) is what else would be removed with
   them, here or in any space. Removing a reference removes only that. */
const originOf = b => [...kinOf(b)].find(k => !k.ref) || b;      /* the shape a variable was made as */
const sourceOf = b => b.from ? everyKnown().find(o => o.id === b.from.id) || null : null;
const dimOf = (b, src) => b.from.side === 'm' ? 'm' : (b.from.side === 'x') !== turned(src) ? 'w' : 'h';      /* which of the source's sides, the way it now lies */
const derived = b => { const src = sourceOf(b); if (!src || src === b) return null; const dim = dimOf(b, src), r = rootSide(src); if (dim === 'm') return scalarOf(src); if (unset(src)) return null; return r === null ? Math.round(src.rect[dim] / view.unit) : r; };
function doomed(blocks, reverting = []){            /* reverting: operations being reverted, whose kept blocks come back and so do not go */
  const gone = new Set(blocks), all = everyKnown(), byId = new Map(all.map(b => [b.id, b])), spaces = everySpace();
  const holder = new Map(); for (const b of all) for (const m of b.members || []) holder.set(m.block, b);      /* a block fused into another goes when that one does */
  const going = b => { for (let k = b; k; k = holder.get(k)) if (gone.has(k)) return true; return false; };
  const add = b => { if (!gone.has(b)){ gone.add(b); return true; } return false; };
  for (let more = true; more;){ more = false;
    for (const set of new Set([...gone].map(b => kin.get(b)).filter(Boolean))){ const origins = [...set].filter(k => !k.ref);      /* every shape the variable was made as is going: its references go */
      if (origins.length && origins.every(k => gone.has(k))) for (const k of set) if (add(k)) more = true; }
    for (const d of all) if (d.from && !gone.has(d)){ const src = sourceOf(d); if (src && gone.has(src) && ![...kinOf(src)].some(k => !gone.has(k)) && add(d)) more = true; }
    /* an arrow goes with its input (a block, or the block or arrow whose result it reads), and a seated block with
       its seat: the arrow it sits on, or either shape of the pair whose hollow it sits in */
    const ids = new Set([...gone].map(b => b.id));
    for (const d of all) if (!gone.has(d) && ((isArrow(d) && ids.has(d.arrow.input.id)) || (d.seat && (typeof d.seat === 'string' ? ids.has(d.seat) : d.seat.hollow.some(id => ids.has(id))))) && add(d)) more = true;
    /* what a cut keeps off the canvas is part of this too. A kept block that goes (its variable went) takes every
       shape its operation made. And when every shape an operation made goes, its two kept blocks go, with whatever
       refers to them: they would be gone for good, and nothing may be left naming a block that is not there. */
    for (const s of spaces) for (const o of s.ops){ if (reverting.includes(o)) continue;
      const made = o.results.map(id => byId.get(id)).filter(Boolean);
      if (o.sources.some(b => gone.has(b))){ for (const b of made) if (add(b)) more = true; }
      else if (made.length && made.every(going)) for (const b of o.sources) if (add(b)) more = true; }
  }
  return [...gone].filter(b => !blocks.includes(b));
}
/* deleting or cutting the selection: if that would take other things with it, the user is shown them first, as a table
   of variables and how many instances of each would go, and can still say no */
const warning = createWarning();
/* sends a message that takes `list` away, with whatever else would go; asks first where anything else would */
function warned(list, doing, proceed, send, reverting = []){
  const also = doomed(list, reverting), broken = formulasOn([...list, ...also]);
  if (!also.length && !broken) return send(also);
  const count = new Map(); for (const b of also) count.set(bare(b.name), (count.get(bare(b.name)) || 0) + 1);
  const sources = [...new Set(list.filter(b => also.some(o => [...kinOf(b)].includes(o) || o.from?.id === b.id || o.arrow?.input.id === b.id || o.seat === b.id || (o.seat?.hollow || []).includes(b.id))).map(b => bare(b.name)))];
  const named = [...new Set(list.filter(isNamed).map(b => bare(b.name)))].join(', ') || 'this', formulas = `${broken} ${broken === 1 ? 'formula refers' : 'formulas refer'} to it`;
  warning.ask({ title: also.length ? `${doing} ${sources.join(', ') || 'this'} also deletes what refers to it` : `${doing} ${named} leaves ${broken === 1 ? 'a formula' : broken + ' formulas'} without it`,
    note: [also.length ? `${also.length} other ${also.length === 1 ? 'instance' : 'instances'} would be removed with it, here or in other spaces.` : '',
      broken ? `${formulas}. ${broken === 1 ? 'It is' : 'They are'} left in place, and will show an error: missing variable.` : ''].filter(Boolean).join(' '),
    head: also.length ? ['Variable', 'Instances'] : [], rows: [...count].sort((a, b) => b[1] - a[1]), proceed: also.length ? proceed : proceed.replace(/ all$/, ''), onProceed: () => send(also) });      /* nothing else goes: there is no "all" */
}
/* how many formulas refer to a variable that would be gone with these blocks: every entry and attribute, anywhere,
   that holds a capsule naming one of them (expression.js: refersTo) and is not itself going. A variable's entries
   and attributes are counted once however many uses it has, and a block whose variable has a use that stays is not
   gone: what names it is pointed at that use instead (see discard). */
function formulasOn(blocks){
  const going = new Set(blocks), ids = new Set(blocks.filter(b => ![...kinOf(b)].some(k => !going.has(k))).map(b => b.id)), seen = new Set(); let n = 0;
  for (const b of everyKnown()){ if (going.has(b) || b.members) continue;      /* a fused shape's entries are those of the shapes it was fused from */
    if (!seen.has(b.values)){ seen.add(b.values); for (const v of b.values.values()) if (isFormula(v) && refersTo(v.expr, ids)) n++; }
    const attrs = attrsOf(b); if (!seen.has(attrs)){ seen.add(attrs); for (const a of attrs) if (refersTo(a.text, ids)) n++; }
    if (b.fn && !seen.has(b.fn)){ seen.add(b.fn); if (b.fn.formula && refersTo(b.fn.formula, ids)) n++; } }      /* an arrow's entry formula, once for the function */
  return n;
}
function removing(type){
  if (!selected.size) return;
  const list = [...selected].filter(b => !b.in);
  if (list.length < selected.size) hud.say(`in is the function's input: it cannot be ${type === 'cut' ? 'cut' : 'deleted'}`);
  if (!list.length) return;
  warned(list, type === 'cut' ? 'Cutting' : 'Deleting', type === 'cut' ? 'Cut all' : 'Delete all', also => bus.send(type, { ids: idsOf(list), also: idsOf(also) }));
}
/* Revert removes the shapes a cut or an intersection made: where one of them has been named and is used elsewhere, the same warning comes first */
function reverting(){
  const list = [...selected], r = revertible(list);
  if (r.refused) return hud.say(r.refused);
  warned(r.ops.flatMap(o => o.results.map(blockOf)), 'Reverting', 'Revert', also => bus.send('revert', { ids: idsOf(list), also: idsOf(also) }), r.ops);
}

/* ---- arrows ----
   An arrow is a function drawn as a triangle: its base lies against rows or columns of an input, it points away, and
   its output is written on the far side. What an arrow means (where its output is, what it covers, whether its edge
   is free, what it comes to, whether a new input fits it, what can be seated on it, its entries) is arrows.js's to
   say. Here the arrow is found its input, drawn, and changed by messages.

   An arrow is a block (components/arrow.js) of the shape "arrow", in the space's blocks with the rest, so that it is
   selected, named, opened, saved and deleted as any block is. It takes no part in touching. On it:
     block.arrow  { input: { id, as, hollow }, side, start, span, gap, gapName, output }: this use of the function
     block.fn     { formula }: the function, which every use of a named arrow shares (as uses of a variable share
                  their entries), with its definition space
   Its rectangle is the gap in front of its base, worked out from its input each time the screen is brought up to
   date (arrange), as is the place of its output; neither is kept anywhere.

   A named arrow is a variable: it is in the list at the right edge, and set against another edge from there it is the
   same function on a new input. The program's own functions (system.js: FUNCTIONS) are in the list too. An arrow
   made from one of those is a use of it by name (block.ref, with no arrow it was made from): its function is the
   nearest arrow of that name in its space or above, which is how a project shadows one, and else the program's.

   Every arrow has a definition space, made with it. It holds the block called `in`, block.in, which cannot be
   deleted: the covered part of the input of the arrow the space was opened through, in size, side names and entries.
   What an arrow is: its entry formula where it has one; else what its definition space comes to (endsOf); and where
   that is `in` alone, the covered part passed through unchanged.

   A block can be seated: block.seat is the id of the arrow whose output it sits on, or { hollow: [id, id] } for the
   hollow of the pair those two blocks make. A seated block is placed on its seat (arrange) and its value is the
   output; its own entries are kept and not used. Seated on an arrow it is an ordinary block for touching. Seated in
   a hollow it lies between the two shapes of its pair and takes no part in touching: it is there to be carried out
   with an arrow. */
const isArrow = b => !!b.arrow;
const hollowSeat = b => !!b.seat && typeof b.seat !== 'string';
const BUILT = new Map(FUNCTIONS.map(f => [f.name, { formula: f.formula, builtin: true }]));
const makeArrow = name => { const b = Object.assign(createArrow({ ...typeNamed('arrow') }, { x: 0, y: 0, w: view.unit, h: view.unit }, name), { id: ids.id('b') }); b.fn = { formula: null }; return b; };
/* a use, by name, of a function that is not an arrow it was made from: one of the program's own, or whatever shadows it */
const isUse = b => isArrow(b) && !!b.ref && originOf(b) === b;
/* the arrow whose function b applies: the one it was made as or from; for a use by name, the nearest arrow of that name here or above (null: the program's own) */
function fnBlock(b){
  if (!isUse(b)) return originOf(b);
  const name = bare(b.name).trim();
  for (let s = spaceWith(b) || space; s; s = s.parent){ const own = s.blocks.find(k => isArrow(k) && !k.ref && !isOff(k) && bare(k.name).trim() === name); if (own) return own; }
  return null;
}
const fnOf = b => { const home = fnBlock(b); return home ? home.fn : BUILT.get(bare(b.name).trim()) || b.fn; };
const full = b => ({ ...b.arrow, formula: fnOf(b).formula });      /* an arrow as arrows.js takes one */
const seatOn = (a, s = spaceWith(a)) => (s && s.blocks.find(k => k.seat === a.id)) || null;      /* the block seated on an arrow's output */
/* the use of b's variable that is seated, or is a function's input: b itself, or the one it refers to */
const seatedOf = b => b.seat ? b : kin.has(b) ? [...kin.get(b)].find(k => k.seat) || null : null;
const givenOf = b => b.in ? b : kin.has(b) ? [...kin.get(b)].find(k => k.in) || null : null;
/* what an arrow would read, in space s: null where it is gone (not on this canvas, commented out, or a result that
   is not written here), else { rect, cols, rows, colsName, rowsName, values }: its rectangle in units and its entries */
function readOf(s, inp){
  const blk = s && s.blocks.find(k => k.id === inp.id);
  if (!blk || isOff(blk)) return null;
  if (isArrow(blk)){ if (inp.as !== 'result') return null; const o = outputOf(blk); return o.place && o.type ? { rect: o.place, ...o.type, values: o.values || new Map() } : null; }      /* another arrow's output */
  if (inp.as !== 'result'){ const r = unitsOf(blk); return { rect: r, cols: r.w, rows: r.h, colsName: blk.sides.w, rowsName: blk.sides.h, values: lost(blk) ? new Map() : valuesOf(blk) }; }
  return writtenOf(s, blk, inp.hollow);
}
const inputOf = a => readOf(spaceWith(a), a.arrow.input);
/* the written result of the piece that holds blk: where its matrix is (in the hollow asked for where that is written
   in, else wherever it is written), its type, and its entries where they are worked out: those of a shape on its
   own. (A product, a sum or an elementwise result is not worked out in numbers yet: its entries are unknown.)
   Results are written beside pieces only in the Menu; in another space than the one on screen only the type and the
   entries are given, since nothing is drawn there. */
function writtenOf(s, blk, hollow){
  const u = view.unit;
  if (s !== space){ const { active, all } = algebraIn(s), p = all.find(p => p.members.some(m => active[m] === blk)); if (!p || p.type.error) return null;
    return { rect: { x: 0, y: 0, w: p.type.cols, h: p.type.rows }, ...p.type, values: p.members.length === 1 ? valuesOf(blk) : new Map() }; }
  const r = results.find(r => r.el.isConnected && !r.el.hidden && r.piece?.blocks.includes(blk)), p = r?.piece;
  if (!p || p.type.error || space.owner) return null;
  /* the hollow it names, where results are written in hollows at all and that one is the result's size: it is where
     the result is written once something reads from it (see hollowsOf). Otherwise wherever the result is written. */
  const named = hollow && hadamardCopies(blk) > 0 && p.blocks.length === 2 ? hollowOf(idsOf(p.blocks), undefined, hollow) : null;
  const at = (named && { x: named.rect.x * u, y: named.rect.y * u }) || p.hollows.find(h => h.n === hollow) || p.hollows[0] || p.body; if (!at) return null;
  return { rect: { x: at.x / u, y: at.y / u, w: p.type.cols, h: p.type.rows }, ...p.type, values: p.blocks.length === 1 ? valuesOf(blk) : new Map() };
}
/* An arrow as it stands (arrows.js: standing), with its output's entries where they are worked out: a pass-through's
   and an entry formula's, entry by entry. One defined by a definition space shows its size and symbols until there
   is an evaluator. While the screen is being brought up to date each arrow of the space on screen is worked out once
   (memo); an arrow that reads itself, through whatever else, is "it depends on itself". */
const busy = new Set(); let memo = null;
function outputOf(a){
  if (memo?.has(a)) return memo.get(a);
  if (busy.has(a)) return { warn: 'it depends on itself', part: null, came: null, type: null, place: null, values: null, defined: false };
  busy.add(a);
  try {
    const s = spaceWith(a), arrow = full(a), input = s ? inputOf(a) : null, seat = seatOn(a, s);
    const defined = arrow.formula || !input ? null : definedBy(a, input);
    const st = standing(arrow, input, s ? othersOf(s, a.arrow.input.id) : [], seat ? { colsName: seat.sides.w, rowsName: seat.sides.h } : null, defined);
    /* another use of a named arrow has to fit the function's own input */
    if (!st.warn && a.ref && !isUse(a) && st.part){ const inner = innerOf(a), fit = inner ? fits(inner, st.part) : { ok: true }; if (fit.refused) st.warn = 'its input does not fit the function: ' + fit.refused; }
    let values = null;
    if (st.part && !defined && (!arrow.output || (arrow.output.cols === st.part.cols && arrow.output.rows === st.part.rows))){
      const x = passed(input.values, covered(arrow, input));
      values = !arrow.formula ? x : entryWise(arrow.formula, { cols: st.part.cols, rows: st.part.rows, x, lookup: lookupFor(a),
        matrix: id => { const m = blockOf(id); if (!m || isArrow(m)) return undefined; const r = unitsOf(m); return { cols: r.w, rows: r.h, values: lost(m) ? new Map() : valuesOf(m) }; } }); }
    const out = { ...st, values, defined: !!defined };
    if (memo && s === space) memo.set(a, out);
    return out;
  } finally { busy.delete(a); }
}
/* the rects an arrow's edge has to be free of: every block of the space that touches, but for its own input */
const othersOf = (s, inputId) => s.blocks.filter(k => !isArrow(k) && !isOff(k) && !hollowSeat(k) && k.id !== inputId).map(unitsOf);
/* the function's own input, as a type: the covered part of the arrow the function was made as */
function innerOf(a){ const o = originOf(a), input = isArrow(o) ? inputOf(o) : null; return input ? coveredType(full(o), input) : null; }
/* what a space comes to: its ends, the things in it that nothing reads from. A piece no arrow has for its input is
   one; so is the output of an arrow that nothing reads from and no block is seated on. (Without arrows these are the
   space's pieces, as before.) Each is { type, piece | arrow, block: the one block of a piece of one } */
function endsOf(s, alg = algebraIn(s)){
  const { active, all } = alg, arrows = s.blocks.filter(k => isArrow(k) && !isOff(k)), read = new Set(arrows.map(k => k.arrow.input.id));
  const out = all.filter(p => !p.members.some(m => inConfig(active[m], s) || read.has(active[m].id))).map(p => ({ piece: p, type: p.type, block: p.members.length === 1 ? active[p.members[0]] : null }));
  for (const k of arrows) if (!read.has(k.id) && !seatOn(k, s)){ const o = outputOf(k); out.push({ arrow: k, type: o.type || { error: o.warn || 'no value' } }); }
  return out;
}
/* what an arrow's definition space comes to, for this arrow's input: a type or { error }; null where it holds only its input, which is to pass through */
function definedBy(a, input){
  const home = fnBlock(a) || a, def = spaceOf.get(home); if (!def) return null;
  syncIn(def, a, input);
  const ends = endsOf(def);
  return !ends.length || (ends.length === 1 && ends[0].block?.in) ? null : ends.length === 1 ? ends[0].type : { error: ends.length + ' pieces' };
}
/* the block called in takes the size and the side names of the covered part of this arrow's input */
function syncIn(def, a, input = inputOf(a)){
  const inner = def.blocks.find(k => k.in), part = input && coveredType(full(a), input), u = view.unit; if (!inner || !part) return;
  if (inner.rect.w !== part.cols * u || inner.rect.h !== part.rows * u) keepTouching(() => { inner.set({ ...inner.rect, w: part.cols * u, h: part.rows * u }); for (const k of kinOf(inner)) if (k !== inner) k.set({ ...k.rect, w: inner.rect.w, h: inner.rect.h }); });
  inner.sides = { w: part.colsName, h: part.rowsName };
}
/* makes the block called in, in an arrow's definition space that has none: clear of the equation, on its left */
function ensureIn(def, a){
  if (def.blocks.some(k => k.in)) return;
  const u = view.unit, input = inputOf(a), part = (input && coveredType(full(a), input)) || { cols: 1, rows: 1 };
  const b = makeBlock({ ...typeNamed('tensor'), color: 'function' }, { x: -u * (3 + squares(part.cols, part.colsName)) - part.cols * u, y: Math.round(-part.rows / 2) * u, w: part.cols * u, h: part.rows * u }, 'in');
  b.in = true; b.sides = { w: part.colsName || null, h: part.rowsName || null }; def.blocks.push(b);
}
/* the entries of the block called in: whatever the arrow its space was opened through is given */
function inValues(b){
  const s = spaceWith(b), a = s?.owner; if (!a || !isArrow(a)) return new Map();
  const input = inputOf(a), part = input && covered(full(a), input);
  return part ? passed(input.values, part) : new Map();
}
/* the entries of a seated block: its arrow's output, where that is worked out. (In a hollow: not worked out yet.) */
function seatValues(st){
  if (typeof st.seat !== 'string') return new Map();
  const a = spaceWith(st)?.blocks.find(k => k.id === st.seat && isArrow(k));
  return (a && outputOf(a).values) || new Map();
}
/* where a block seated in a hollow sits: the first hollow of its pair that is the size of the result (algebra.js:
   pieceHollows), as { n: which of the two, rect, type }; null where the two do not make such a pair now */
function hollowOf(pair, alg = algebraIn(space), which = 0){      /* which: 1 or 2 for that hollow and no other */
  const { active, rects, all } = alg, p = all.find(p => p.members.length === 2 && p.members.every(m => pair.includes(active[m].id)));
  if (!p) return null;
  const both = pieceHollows(rects, p), n = which ? (both[which - 1] ? which - 1 : -1) : both.findIndex(Boolean);
  return n < 0 ? null : { n: n + 1, rect: both[n], type: p.type };
}
/* a seated block whose seat is gone or has nowhere to be just now: it has no value */
const seatLost = b => !b.seat ? false : typeof b.seat !== 'string' ? !hollowOf(b.seat.hollow) : (s => { const a = s?.blocks.find(k => k.id === b.seat && isArrow(k)); return !a || !outputOf(a).place; })(spaceWith(b));
/* a triangle's corners in units from its own rectangle's corner, for an arrow whose gap is w by h */
function cornersOf(side, w, h){
  const rows = along(side) === 'rows', span = rows ? h : w, gap = rows ? w : h;
  const r = side === 'e' ? { x: -1, y: 0, w: 1, h: span } : side === 'w' ? { x: gap, y: 0, w: 1, h: span } : side === 's' ? { x: 0, y: -1, w: span, h: 1 } : { x: 0, y: gap, w: span, h: 1 };
  return triangle({ side, start: 1, span, gap }, r);
}
/* puts every arrow of the space on screen in front of its base, and every seated block on its seat, at the size its
   seat has. An arrow may read a seated block or another arrow's output, so it is done until nothing moves. Gives
   whether anything did. */
function arrange(){
  const u = view.unit, scaled = r => ({ x: r.x * u, y: r.y * u, w: r.w * u, h: r.h * u }); let any = false;
  if (!space.blocks.some(b => isArrow(b) || b.seat)) return false;
  for (let pass = 0, again = true; again && pass < 8; pass++){ again = false; memo?.clear();
    const alg = space.blocks.some(hollowSeat) ? algebraIn(space) : null;
    for (const b of space.blocks){ let r = null;
      if (isArrow(b)){ const input = inputOf(b); if (input && covered(b.arrow, input)) r = scaled(strip(b.arrow, input.rect));
        const at = r || b.rect; b.point(b.arrow.side, cornersOf(b.arrow.side, at.w / u, at.h / u), at.w / u, at.h / u); }
      else if (typeof b.seat === 'string'){ const a = space.blocks.find(k => k.id === b.seat && isArrow(k)), o = a && outputOf(a); if (o?.place) r = scaled(o.place); }
      else if (b.seat){ const h = hollowOf(b.seat.hollow, alg); if (h) r = scaled(h.rect); }
      if (!r || (r.x === b.rect.x && r.y === b.rect.y && r.w === b.rect.w && r.h === b.rect.h)) continue;
      const sized = r.w !== b.rect.w || r.h !== b.rect.h; b.set(r); if (sized && !isArrow(b)) agree(b); again = any = true; } }
  memo?.clear();
  return any;
}
/* every edge an arrow could be set against here: each block's; each arrow's output, where no block is seated on it;
   and, in the Menu, each written result of a piece of several shapes (each hollow it is written in). */
function edgesHere(){
  const u = view.unit, out = [];
  for (const b of space.blocks){ if (isOff(b) || hollowSeat(b)) continue;
    if (isArrow(b)){ const o = outputOf(b); if (o.place && o.type && !seatOn(b, space)) out.push({ input: { id: b.id, as: 'result' }, rect: o.place }); }
    else out.push({ input: { id: b.id, as: 'block' }, rect: unitsOf(b) }); }
  if (!space.owner) for (const r of results){ const p = r.piece; if (!r.el.isConnected || r.el.hidden || !p || p.blocks.length < 2 || p.type.error) continue;
    if (p.hollows.length) for (const h of p.hollows) out.push({ input: { id: p.blocks[0].id, as: 'result', hollow: h.n }, rect: { x: h.x / u, y: h.y / u, w: h.w / u, h: h.h / u } });
    else if (p.body) out.push({ input: { id: p.blocks[0].id, as: 'result' }, rect: { x: p.body.x / u, y: p.body.y / u, w: p.type.cols, h: p.type.rows } }); }
  return out;
}
/* the edge nearest a world point, if one is within reach (in units): { input, side, at, rect } */
function edgeNear(p, reach = .5){
  const u = view.unit, pt = { x: p.x / u, y: p.y / u }; let best = null;
  for (const c of edgesHere()){ const e = edgeAt(c.rect, pt, reach); if (e && (!best || e.distance < best.distance)) best = { ...e, input: c.input, rect: c.rect }; }
  return best;
}
const FREE = 'An arrow needs a free edge: another block lies against that part of it';
function addArrow({ input, side, start = 1, span = 1, gap = 2, of = null, builtin = null, seat = null }){
  const from = of ? blockOf(of) : null, read = readOf(space, input);
  if (!read) return hud.say('There is nothing there to set an arrow against');
  const arrow = { input: { id: input.id, as: input.as === 'result' ? 'result' : 'block', ...(input.as === 'result' && input.hollow ? { hollow: input.hollow } : {}) }, side, start, span, gap, gapName: null, output: null };
  const can = settable(arrow, s => along(s) === 'rows' ? read.rows : read.cols, {});
  if (can.refused) return hud.say(can.refused);
  if (!free(arrow, read.rect, othersOf(space, input.id))) return hud.say(FREE);
  if (from){ const inner = innerOf(from), fit = inner ? fits(inner, coveredType(arrow, read)) : { ok: true }; if (fit.refused) return hud.say(`${bare(from.name)} does not fit there. ${fit.refused}`); }
  const b = makeArrow(builtin || (from ? from.name : freeName())); b.arrow = arrow;
  if (from){ const o = originOf(from); b.ref = true; b.fn = o.fn; spaceOf.set(b, spaceOf.get(o)); const set = kin.get(o) || new Set([o]); set.add(b); for (const k of set) kin.set(k, set); }
  else { if (builtin) b.ref = true; spaceOf.set(b, newSpace(b, space)); }
  space.blocks.push(b); view.world.append(b.el);
  ensureIn(spaceOf.get(b), b);
  if (seat){ const k = space.blocks.find(k => k.id === seat); if (k) k.seat = b.id; }
  select([b]);
}
function setArrow({ id, ...patch }){
  const a = blockOf(id); if (!a || !isArrow(a)) return;
  const input = inputOf(a), n = side => input ? (along(side) === 'rows' ? input.rows : input.cols) : null, geo = {};
  for (const k of ['side', 'start', 'span', 'gap', 'output']) if (k in patch) geo[k] = patch[k];
  if ('side' in geo && !('start' in geo) && !('span' in geo) && input && SIDES.includes(geo.side)) Object.assign(geo, sided(a.arrow, geo.side, n(a.arrow.side), n(geo.side)));      /* turned to another side: it covers what it can of that one */
  const got = settable(a.arrow, n, geo);
  if (got.refused){ hud.say(got.refused); return shown(); }
  const next = got.arrow;
  if (input && ('side' in geo || 'start' in geo || 'span' in geo)){
    if (!free(next, input.rect, othersOf(space, a.arrow.input.id))){ hud.say(FREE); return shown(); }
    const inner = a.ref && !isUse(a) ? innerOf(a) : null, fit = inner ? fits(inner, coveredType(next, input)) : { ok: true };
    if (fit.refused){ hud.say(`${bare(a.name)} would not fit its input. ${fit.refused}`); return shown(); } }
  if ('gapName' in patch) next.gapName = String(patch.gapName || '').trim() || null;
  if ('formula' in patch){
    if (isUse(a)){ hud.say(`${bare(a.name)} is not this arrow's own function: name an arrow of your own ${bare(a.name)} to change it`); return shown(); }
    const text = String(patch.formula ?? '').trim(), t = bound(text, reachList(), { matrices: true }), read = t.refused ? t : entered(t.text, formulaNames(lookupFor(a)), { matrices: true });
    if (read.refused){ hud.say(`Not kept: ${read.refused}`); return shown(); }
    originOf(a).fn.formula = read.clear ? null : t.text.trim(); }
  a.arrow = next; shown();
}
/* what arrows.js needs to know of a block to say whether it can be seated */
const seatFacts = b => ({ name: bare(b.name), named: isNamed(b), arrow: isArrow(b), input: !!givenOf(b), reference: !!b.ref, uses: [...kinOf(b)].length, defined: !!spaceOf.get(b)?.blocks.some(k => !isOff(k)),
  standing: !!b.tile, seated: !!seatedOf(b), part: !!rangedOf(b), measure: measures(b), fused: !!b.members });
function seatBlock({ arrow = null, hollow = null, id = null, name = null, color = null }){
  const u = view.unit, a = arrow ? space.blocks.find(k => k.id === arrow && isArrow(k)) : null, h = !a && hollow ? hollowOf(hollow) : null;
  if (!a && !h) return hud.say(hollow ? 'Those two shapes enclose no hollow of their result\'s size' : 'There is no output there to seat a block on');
  if (a ? seatOn(a, space) : space.blocks.some(k => hollowSeat(k) && k.seat.hollow.every(x => hollow.includes(x)))) return hud.say('A block is seated there already');
  const type = a ? outputOf(a).type : h.type;
  let b = id ? space.blocks.find(k => k.id === id) : null;
  if (id){ if (!b || !a) return;
    const can = seatable(seatFacts(b)); if (can.refused){ hud.say(can.refused); return shown(); }
    b.seat = a.id; a.arrow = { ...a.arrow, output: { cols: Math.round(b.rect.w / u), rows: Math.round(b.rect.h / u) } }; }      /* the arrow's output size becomes the block's size */
  else { if (!name) return; if (!type) return hud.say('That output has no size yet: there is nothing to seat a block on');
    b = makeBlock({ ...typeNamed('tensor'), color: color || someColour() }, { x: 0, y: 0, w: type.cols * u, h: type.rows * u }, name);
    b.sides = { w: type.colsName || null, h: type.rowsName || null }; b.seat = a ? a.id : { hollow: [...hollow] };
    space.blocks.push(b); view.world.append(b.el); }
  select([b]);
}
/* a drag that begins on an arrow selected alone: along its line changes the gap, along the input's edge the start,
   and by a handle at an end of its base the span. The arrow follows the pointer; one message says where it ended. */
function dragArrow(a, el, from){
  const u = view.unit, input = inputOf(a), was = a.arrow, handle = el.dataset.handle || null;
  if (!input){ hud.say('Its input is gone: there is nothing to move it along'); return { move(){}, end(){} }; }
  const rows = along(was.side) === 'rows', n = rows ? input.rows : input.cols, r = input.rect;
  const down = p => rows ? p.y / u - r.y : p.x / u - r.x;      /* how far along the edge, in units from its start */
  const outward = p => was.side === 'e' ? p.x / u - r.x - r.w : was.side === 'w' ? r.x - p.x / u : was.side === 's' ? p.y / u - r.y - r.h : r.y - p.y / u;
  let mode = handle;
  return { move(p){
      if (!mode){ const dx = p.x - from.x, dy = p.y - from.y; if (Math.hypot(dx, dy) < u / 3) return; mode = (Math.abs(dx) > Math.abs(dy)) === rows ? 'gap' : 'start'; }
      const next = mode === 'gap' ? adjust(was, n, { gap: was.gap + outward(p) - outward(from) }) : mode === 'start' ? adjust(was, n, { start: was.start + Math.round(down(p) - down(from)) })
        : mode === 'first' ? adjust(was, n, { first: Math.round(down(p)) + 1 }) : adjust(was, n, { last: Math.round(down(p)) });
      a.arrow = { ...was, ...next }; view.el.style.cursor = (mode === 'gap') === rows ? 'ew-resize' : 'ns-resize'; shown(); },
    end(){ const now = a.arrow; a.arrow = was; view.el.style.cursor = '';
      if (now.start !== was.start || now.span !== was.span || now.gap !== was.gap) bus.send('arrow.set', { id: a.id, start: now.start, span: now.span, gap: now.gap }); else shown(); } };
}
/* a drag that begins on a seated block selected alone. On an arrow's output: along the arrow's line it changes the
   gap; let go off the line, the block stays seated and a reference to it is put where it was dropped. In a hollow:
   let go straight out along its row or its column, a pass-through arrow is made from the hollow's result to it. */
function dragSeated(b, from){
  const u = view.unit, g = view.grid(), snap = v => Math.round(v / g) * g, home = b.rect;
  const a = typeof b.seat === 'string' ? space.blocks.find(k => k.id === b.seat && isArrow(k)) : null, was = a?.arrow;
  let at = home, off = false;
  return { move(p){ const dx = snap(p.x - from.x), dy = snap(p.y - from.y); at = { ...home, x: home.x + dx, y: home.y + dy }; view.el.style.cursor = 'move';
      if (a){ const rows = along(was.side) === 'rows', out = (was.side === 'e' ? dx : was.side === 'w' ? -dx : was.side === 's' ? dy : -dy) / u; off = (rows ? dy : dx) !== 0;
        a.arrow = off ? was : { ...was, gap: Math.max(1, was.gap + out) }; shown(); if (off) b.set(at); }
      else b.set(at); },
    end(){ view.el.style.cursor = ''; b.set(home);
      if (a){ const now = a.arrow; a.arrow = was;
        if (off){ shown(); return isNamed(b) ? bus.send('use', { id: b.id, at: { x: at.x + at.w / 2, y: at.y + at.h / 2 } }) : hud.say('It stays seated. Give it a name, and dragging it off the arrow\'s line sets down a reference to it'); }
        return now.gap !== was.gap ? bus.send('arrow.set', { id: a.id, gap: now.gap }) : shown(); }
      const h = hollowOf(b.seat.hollow), scale = r => ({ x: Math.round(r.x / u), y: Math.round(r.y / u), w: Math.round(r.w / u), h: Math.round(r.h / u) }), to = h && carried(h.rect, scale(at));
      if (!to){ shown(); if (at !== home && (at.x !== home.x || at.y !== home.y)) hud.say('To carry it out of the hollow, drag it straight along its row or its column, at least one unit clear'); return; }
      bus.send('arrow.add', { input: { id: b.seat.hollow[0], as: 'result', hollow: h.n }, side: to.side, start: 1, span: along(to.side) === 'rows' ? h.rect.h : h.rect.w, gap: to.gap, seat: b.id }); } };
}
/* the arrow whose output a block has been let go on, if any: an output with no block seated on it that the block lies over, its corner within a unit of the output's */
function outputUnder(b){
  const r = unitsOf(b);
  return space.blocks.find(a => { if (!isArrow(a) || seatOn(a, space)) return false; const p = outputOf(a).place;
    return !!p && r.x < p.x + p.w && p.x < r.x + r.w && r.y < p.y + p.h && p.y < r.y + r.h && Math.abs(r.x - p.x) <= 1 && Math.abs(r.y - p.y) <= 1; }) || null;
}
/* what the properties panel shows of an arrow: a row for each thing that can be typed */
const arrowRows = (a, fn) => [{ key: 'side', label: 'side', text: a.arrow.side }, { key: 'start', label: 'start', text: String(a.arrow.start) }, { key: 'span', label: 'span', text: String(a.arrow.span) },
  { key: 'gap', label: a.arrow.gapName || 'gap', text: String(a.arrow.gap) }, { key: 'gapname', label: 'gap name', text: a.arrow.gapName || '' },
  { key: 'output', label: 'output', text: a.arrow.output ? `${a.arrow.output.cols} × ${a.arrow.output.rows}` : '' },
  { key: 'formula', label: 'formula', text: fn.formula || '', matrices: true, seen: refs(fn.formula || '').map(fields.look) }];
/* what was typed in one of those rows. Start, span and gap take a formula that comes to a whole number, at least 1,
   worked out once, now; an output size is written columns × rows, or left empty for no promise. */
function arrowTyped(a, key, text){
  const t = text.trim();
  if (key === 'side') return bus.send('arrow.set', { id: a.id, side: t.toLowerCase() });
  if (key === 'gapname') return bus.send('arrow.set', { id: a.id, gapName: t || null });
  if (key === 'formula') return bus.send('arrow.set', { id: a.id, formula: t || null });
  if (key === 'output'){ const m = t.match(/^(\d+)\s*(?:[x×*,]|by)\s*(\d+)$/i);
    if (t && !m){ hud.say('An output size is written columns × rows, or left empty for no promise'); return shown(); }
    return bus.send('arrow.set', { id: a.id, output: m ? { cols: +m[1], rows: +m[2] } : null }); }
  const got = readTyped(a, t), n = got.refused ? got : isWhole(got.value) && got.value >= 1 ? { length: got.value } : { refused: `it is a whole number, at least 1, and that comes to ${isError(got.value) ? 'an error (' + got.value.err + ')' : got.value === null ? 'nothing yet' : valueText(got.value)}` };
  if (n.refused){ hud.say(`${key[0].toUpperCase() + key.slice(1)}: ${n.refused}`); return shown(); }
  bus.send('arrow.set', { id: a.id, [key]: n.length });
}
/* an arrow, a function's input and a seated block are where they are because of something else: they are not cut, fused, folded or turned. Why not, for the first of these that is one; null for none */
const fixedIn = (list, doing) => { const b = list.find(b => isArrow(b) || b.in || b.seat); return !b ? null : isArrow(b) ? `An arrow cannot be ${doing}` : b.in ? `in is the function's input: it cannot be ${doing}` : `${bare(b.name)} is seated: it cannot be ${doing}. Unseat it first, or carry its value on with an arrow`; };

/* ---- saving and opening a project ----
   The whole tree of shapes is written as a tree of files, a directory for every space (project.js has the format).
   Served by server.py, the page saves to and opens from the server's projects/ directory, by name.
   Anywhere else (the published artifact, say) there is no server to keep them, so Save hands over one zip of the
   same tree and Open takes one back. */
const typeNamed = name => shapes.find(s => s.name === name) || (name === 'arrow' ? { name, label: 'Function', draw: 'arrow', color: 'function' } : { name, label: name, draw: 'rectangle', color: 'tensor' });
const wasOf = was => was ? was.map(w => ({ order: w.order, frames: w.frames.map(f => ({ ...f })) })) : null;      /* where an operation's kept blocks were, as plain data of its own */
const fromOf = f => !f ? null : f.range ? { id: f.id, range: { ...f.range, toEnd: { ...f.range.toEnd } } } : { ...f };      /* a block's from, as plain data of its own */
/* the page's spaces as plain data, lengths in units */
function gather(){
  const u = view.unit, sets = [...new Set(kin.values())], number = b => kin.has(b) ? sets.indexOf(kin.get(b)) + 1 : null;
  const one = b => ({ id: b.id, type: b.shape.name || 'tensor', name: b.name, color: b.shape.color, x: b.rect.x / u, y: b.rect.y / u, cols: b.rect.w / u, rows: b.rect.h / u,
    colsName: b.sides.w, rowsName: b.sides.h, entries: b.members ? {} : Object.fromEntries(b.values), inside: spaceOf.has(b) ? plain(spaceOf.get(b)) : null, variable: number(b),
    tile: !!b.tile, transposed: !!b.t, attributes: attrsOf(b).map(a => ({ name: a.name, value: a.text })), reference: !!b.ref, from: fromOf(b.from),
    /* an arrow: this use of it, with its function's formula (a use of a function by name has none of its own). Never where its output is, or what it comes to. */
    arrow: isArrow(b) ? { input: { ...b.arrow.input }, side: b.arrow.side, start: b.arrow.start, span: b.arrow.span, gap: b.arrow.gap, gapName: b.arrow.gapName || null, output: b.arrow.output ? { ...b.arrow.output } : null, formula: isUse(b) ? null : originOf(b).fn.formula || null } : null,
    seat: !b.seat ? null : typeof b.seat === 'string' ? b.seat : { hollow: [...b.seat.hollow] }, in: !!b.in,
    joined: b.members ? b.members.map(m => ({ fx: m.fx, fy: m.fy, fw: m.fw, fh: m.fh, shape: one(m.block) })) : null });      /* a joined shape's entries are its members' */
  const plain = s => ({
    shapes: s.blocks.map(one),
    groups: tree(s, undefined),
    operations: s.ops.map(o => ({ id: o.id, op: o.op, sources: o.sources.map(one), results: [...o.results], was: wasOf(o.was) })) });      /* what was cut here, each with the two blocks it keeps, whole */
  /* the groups of s directly inside group `up` (undefined: inside none), each with the blocks and groups directly inside it */
  const tree = (s, up) => [...new Set([...s.groupOf.values(), ...s.groupUp.keys(), ...s.groupUp.values()])].filter(g => s.groupUp.get(g) === up)
    .map(g => ({ id: g, name: s.groupNames.get(g) || null, members: s.blocks.map((b, i) => s.groupOf.get(b) === g ? i : -1).filter(i => i >= 0), groups: tree(s, g) }));
  return { top: plain(top), saved: new Date().toISOString(), ids: ids.state() };
}
/* the reverse: everything on the page is replaced by what the data describes */
function rebuild(data){
  go(top); select([]);
  for (const s of [top]){ for (const b of s.blocks) b.el.remove(); for (const f of s.frames.values()) f.el.remove();
    s.blocks.length = 0; s.ops.length = 0; s.groupOf.clear(); s.groupUp.clear(); s.groupNames.clear(); s.frames.clear(); }
  spaceOf.clear(); kin.clear(); deeper.length = 0; clipboard = null;
  ids = createIds(); if (data.ids) ids.restore(data.ids);
  const uses = new Map();                        /* a variable's number -> the blocks that are uses of it */
  const u = view.unit;
  /* one block from its plain form, with its definition space and, for a joined shape, the shapes it was joined from */
  const build = (d, s) => { const type = typeNamed(d.type);
    const b = (d.arrow ? createArrow : createBlock)({ ...type, color: OLD[d.color] || d.color || type.color }, { x: d.x * u, y: d.y * u, w: d.cols * u, h: d.rows * u }, d.name);      /* OLD: a colour's name in projects saved before */
    if (d.arrow){ const { formula, ...use } = d.arrow; b.arrow = { ...use, input: { ...use.input }, output: use.output ? { ...use.output } : null }; b.fn = { formula: formula || null }; }
    if (d.seat) b.seat = typeof d.seat === 'string' ? d.seat : { hollow: [...d.seat.hollow] };
    if (d.in) b.in = true;
    b.sides = { w: d.colsName, h: d.rowsName }; b.values = new Map(Object.entries(d.entries)); if (d.tile) b.tile = true; if (d.reference) b.ref = true; if (d.from) b.from = fromOf(d.from); b.attrs = (d.attributes || []).map(a => ({ name: a.name, text: a.value })); b.turn(d.transposed); b.id = d.id || ids.id('b');      /* the id it was saved with */
    if (d.joined) b.members = d.joined.map(j => ({ fx: j.fx, fy: j.fy, fw: j.fw, fh: j.fh, block: build(j.shape, s) }));
    const first = d.variable != null && uses.get(d.variable)?.[0];
    if (d.variable != null) uses.set(d.variable, [...(uses.get(d.variable) || []), b]);
    if (first){ b.values = first.values; b.attrs = first.attrs; if (first.fn && b.arrow) b.fn = first.fn; if (spaceOf.has(first)) spaceOf.set(b, spaceOf.get(first)); return b; }      /* a later use: the first one's entries and definition */
    if (d.inside){ const def = newSpace(b, s); spaceOf.set(b, def); fill(d.inside, def); }
    return b; };
  const fill = (plain, s) => {
    for (const d of plain.shapes) s.blocks.push(build(d, s));
    for (const o of plain.operations || []) s.ops.push({ id: o.id || ids.id('o'), op: o.op, sources: o.sources.map(d => build(d, s)), results: [...o.results], was: wasOf(o.was) });
    const regroup = (g, up) => { const id = g.id || newGroup(); if (up !== undefined) s.groupUp.set(id, up); if (g.name) s.groupNames.set(id, g.name);
      for (const i of g.members) s.groupOf.set(s.blocks[i], id); for (const inner of g.groups || []) regroup(inner, id); };
    for (const g of plain.groups) regroup(g, undefined);
    tidy(s);
  };
  fill(data.top, top);
  for (const list of uses.values()) if (list.length > 1){ const set = new Set(list); for (const b of list) kin.set(b, set); }
  /* every arrow has its definition space, with its input block in it: one written without is given them */
  for (const s of everySpace()) for (const b of s.blocks) if (isArrow(b)){ if (!spaceOf.has(b)){ const def = newSpace(b, s); for (const k of kinOf(b)) spaceOf.set(k, def); } ensureIn(spaceOf.get(b), originOf(b)); }
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
  /* a project saved before format 3 may hold stacks, which then appended rows and would now be sums: project.js has fused each into one shape, and says how many */
  hud.say(`Opened ${name ? name + ': ' : ''}${count(data)} shapes` + (data.converted ? `. ${data.converted === 1 ? '1 stack was fused into one shape' : data.converted + ' stacks were each fused into one shape'}: a stack is now a sum` : '')
    /* and what could not be kept as it was: shapes at a corner, or under a shape in a product, did not touch then and do now */
    + (data.changed ? `. ${data.changed === 1 ? '1 piece reads' : data.changed + ' pieces read'} differently now: shapes that meet at a corner, or stand under one in a product, touch` : '')); }
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
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'x' || e.key === 'X')){ if (selected.size){ e.preventDefault(); removing('cut'); } return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'v' || e.key === 'V')){ if (clipboard){ e.preventDefault(); bus.send('paste', { at: { x: view.camera().x, y: view.camera().y }, pasted: clipboard }); } return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') return bus.send('escape');      /* with nothing selected, Escape steps out of a definition space */
  /* s: drag a box; every block it touches is selected, with its group. Press s again to leave without selecting. */
  if (e.key === 's' || e.key === 'S') return bus.send('select.box');
  /* F2 or Enter: rename the one selected block (the way to rename a block in a sum, whose name is written on it) */
  if ((e.key === 'F2' || e.key === 'Enter') && selected.size === 1){ e.preventDefault(); return renaming([...selected][0]); }
  /* f frames the selection; on a selection that is one frame already, it takes the frame off */
  if ((e.key === 'f' || e.key === 'F') && selected.size){ e.preventDefault(); const list = [...selected], g = groupIs(list);
    return g !== null ? bus.send('unframe', { frame: g }) : bus.send('frame', { ids: idsOf(list) }); }
  if ((e.key === 't' || e.key === 'T') && selected.size){ e.preventDefault(); return bus.send('transpose', { ids: idsOf(selected) }); }      /* t transposes the selection */
  /* x, Backspace or Delete removes the selected blocks. (Typing in a name or a measurement never reaches here.) */
  if ((e.key === 'x' || e.key === 'X' || e.key === 'Backspace' || e.key === 'Delete') && selected.size){ e.preventDefault(); removing('delete'); }
});

/* ---- drags that begin on a block ----
   By a side or corner: resize it. On a selected block: move every selected block. Both go in steps of the dots on
   screen. Anything else is left to the view, which pans. */
function dragged(el, from, e){
  const b = blockAt(el);
  if (!b || el.isContentEditable) return;
  if (isArrow(b) && selected.has(b) && selected.size === 1) return dragArrow(b, el, from);
  if (b.seat && selected.has(b) && selected.size === 1 && !el.dataset.grip) return dragSeated(b, from);
  if (el.dataset.grip && (b.seat || b.in)){ hud.say(b.in ? 'in is the function\'s input: its size is what the arrow covers' : `${bare(b.name)} is seated: its size is the output's`); return { end(){}, move(){} }; }
  const g = view.grid(), snap = v => Math.round(v / g) * g, cursor = c => { view.el.style.cursor = c; };
  /* while a drag lasts the blocks follow the pointer directly. When it ends they are put back as they were, and one
     message, 'place', says where every block that moved or changed size now goes. */
  const before = new Map(everyKnown().map(b => [b, b.rect]));
  const settle = () => { const rects = [];
    for (const [b, r] of before) if (b.rect !== r){ if (b.rect.x !== r.x || b.rect.y !== r.y || b.rect.w !== r.w || b.rect.h !== r.h) rects.push({ id: b.id, ...b.rect }); b.set(r); }
    if (rects.length) bus.send('place', { rects }); else shown(); };
  const end = () => { cursor(''); settle(); };
  const grip = el.dataset.grip;
  if (grip && rangedOf(b)){ hud.say(`${bare(b.name)} is part of ${partOf(b)}: its size is that part's`); return { end(){}, move(){} }; }      /* it is as large as its range, and cannot be pulled larger or smaller */
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
      /* one block let go on an arrow's output is seated there, where it can be (arrows.js: seatable) */
      const onto = !pulled && held.size === 1 && !isArrow(b) && !b.seat ? outputUnder(b) : null;
      if (onto){ cursor(''); for (const [k, r] of before) if (k.rect !== r) k.set(r); return bus.send('seat', { arrow: onto.id, id: b.id }); }
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
    if (f.groupButton.contains(el)) return id !== null ? bus.send('unframe', { frame: id }) : groupIs(list) !== null ? bus.send('unframe', { frame: groupIs(list) }) : bus.send('frame', { ids: idsOf(list) });
    /* the fold button: the group's blocks move into a new block with the group's name */
    if (f.foldButton.contains(el)) return bus.send('fold', { ids: idsOf(list), name: space.groupNames.get(id), color: someColour() });
    if (el === f.nameEl){
      /* a named group's name: the first click selects the group, a click once it is selected renames it */
      if (id !== null && !(list.length === selected.size && list.every(b => selected.has(b)))) return pick(list);
      f.nameEl.textContent = '';
      return editText(f.nameEl, name => bus.send('name', { frame: id, ids: idsOf(list), name: name || null, color: someColour() }));
    }
    return;
  }
  /* a shape standing in a matrix: it is the real shape, shown where it stands. A double click opens it, as it would on the canvas. */
  const tile = el.closest?.('[data-tile]');
  if (tile){ if (twice) bus.send('open', { id: tile.dataset.tile }); return; }
  /* an entry of this space's own matrix, if its block has been named: type a value or a formula over it. Nothing typed puts the symbol back. */
  const entry = el.closest?.('.definition.editable [data-c]');
  if (entry){
    if (entry.querySelector('.formula')) return;      /* a click in the field that is already open there */
    const [o, key] = space.owner.members ? entryHome(space.owner, +entry.dataset.c, +entry.dataset.r) : [space.owner, entry.dataset.c + ',' + entry.dataset.r];      /* the definition is written the variable's own way round */      /* in a joined shape, the entry belongs to the shape it came from */
    pick([]); return typeEntry(entry, o, key);
  }
  /* an arrow's output: name it, and a block of that name is seated on it */
  const out = [...outs].find(([, o]) => o.el.isConnected && o.el.contains(el));
  if (out){ const [a, o] = out; pick([]); return o.name(name => { if (name) bus.send('seat', { arrow: a.id, name, color: someColour() }); }); }
  /* a result's matrix: name it, and the blocks that came to it fold into a new block */
  const r = results.find(r => r.el.isConnected && r.el.contains(el));
  if (r){ const piece = r.piece;
    /* one named shape on its own: an entry of its matrix is typed over where it is written */
    if (piece.blocks.length < 2){ const cell = el.closest?.('.result.editable .result-body [data-c]'); if (!cell || cell.querySelector('.formula')) return;
      const [o, key] = entryHome(piece.blocks[0], +cell.dataset.c, +cell.dataset.r); pick([]); return typeEntry(cell, o, key); }
    /* written in a hollow: the name seats a block there, and the two shapes stay where they are */
    if (piece.hollows.length){ pick([]); return r.name(name => { if (name) bus.send('seat', { hollow: idsOf(piece.blocks), name, color: someColour() }); }); }
    pick([]); return r.name(name => { if (name) bus.send('fold', { ids: idsOf(piece.blocks), name, color: someColour(), product: true }); }); }
  /* a measurement: double-click to type a length in whole units, a name for that side, or both; the block keeps its top-left corner */
  if (measure) for (const dim of ['w', 'h']) if (el === measure.labels[dim]){
    const b = [...selected][0];
    const was = el.textContent.replace(/\s+/g, ' ').trim();
    if (twice) editText(el, text => { if (text && text !== was) bus.send('side.set', { id: b.id, dim, text }); else shown(); });      /* left as it was: no new length (a single entry's is not its size on the grid) */
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
  /* a function: the next click, on a free edge of a block or of a written result, sets an arrow there, with a span of 1 at the row or column clicked and a gap of 2 */
  arrow: () => { select([]); hud.say('Click a free edge of a block or of a written result');
    return new Promise(resolve => {
      const done = () => { release(); removeEventListener('keydown', key); resolve(); }, key = e => { if (e.key === 'Escape') done(); };
      addEventListener('keydown', key);
      const release = view.tool({ cursor: 'crosshair', move(){}, up(){}, cancel: done,
        down(p){ const e = edgeNear(p); done();
          if (!e) return hud.say('An arrow is set against an edge: click a free edge of a block or of a written result');
          bus.send('arrow.add', { input: e.input, side: e.side, start: e.at, span: 1, gap: 2 }); } }); }); },
};

/* the right-click menu. A right click on a block that is not selected selects it first, so Cut, Copy and Delete mean that block.
   Paste puts the copy where the click was. Difference, Intersect and Revert (the boolean tool) are greyed where the
   selection does not allow them, and chosen all the same say why in the readout. */
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
bus.on('variable.drag', ({ kind, x, y }) => { if (selected.size && !openField) select([]); if (kind === 'length' && !openField?.over(x, y)) reach(x, y); });      /* while a formula is being typed the selection stays, and with it the panel the formula is in */
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
const going = fn => ({ ids: list, also = [] }) => { selected.clear(); for (const b of list.map(blockOf)) if (b && space.blocks.includes(b)) selected.add(b); return fn(also.map(blockOf).filter(Boolean)); };      /* also: what goes with them, in any space */
bus.on('cut', going(cut), changes); bus.on('delete', going(remove), changes);
bus.on('transpose', chosen(transpose), changes);
/* the boolean tool: the new blocks' ids are made in the handler, from the project's own source, so the same message makes the same ids again */
bus.on('difference', chosen(differenceOf), changes); bus.on('intersect', chosen(intersectOf), changes); bus.on('revert', going(revert), changes);
bus.on('paste', ({ at, pasted }) => paste(at, pasted), changes);
/* what comes from outside the program is a message too, so the log says so: the theme the computer asks for */
bus.on('theme', ({ set }) => { if (set !== undefined) hostTheme = set; defaults = null; shown(); });
bus.on('rename', ({ id, name, color }) => { const b = blockOf(id); if (!b) return;
  if (b.in){ hud.say('in is the function\'s input: that is its name'); b.call('in'); return shown(); }
  /* an arrow keeps the function colour whatever it is called. A use of a function by name, given another name, is an arrow of its own from then on, with the formula it had */
  if (isUse(b) && bare(name).trim() !== bare(b.name).trim()){ b.fn = { formula: fnOf(b).formula }; b.ref = false; }
  b.call(name); renamed(b, isArrow(b) ? null : color); }, changes);
/* arrows (arrows.js has every rule; see "arrows", above).
   arrow.add { input: { id, as, hollow }, side, start, span, gap, of, builtin, seat }: an arrow set against an edge. of: the
       named arrow it is another use of; builtin: the function of the program's it uses by name; seat: a block to
       seat on its output at once (one carried out of a hollow). Refused, with a sentence, where there is nothing
       there, the span runs past the input, the edge is not free, or a named arrow does not fit.
   arrow.set { id, side, start, span, gap, gapName, output, formula }: whichever of those are given, changed; refused the same way.
   seat { arrow | hollow: [id, id], id | name, color }: seats a block on an arrow's output or in a pair's hollow: the
       block with that id (which must be one that can be seated; the arrow's output size becomes its size), or a new one of that name.
   unseat { id }: the block is no longer seated. It stays where it is, with the entries it had before. */
bus.on('arrow.add', addArrow, changes);
bus.on('arrow.set', setArrow, changes);
bus.on('seat', seatBlock, changes);
bus.on('unseat', ({ id }) => { const b = blockOf(id); if (b && b.seat) b.seat = null; else hud.say('That block is not seated'); shown(); }, changes);
/* what is typed into an entry: text is as it was typed (capsules in their stored form; a name typed out after an @ is
   bound to its capsule here), null for nothing typed, which puts the symbol back. What is stored is expression.js's
   to say (entered): a literal value or a formula, and never a formula's result. settle: a formula of numbers alone
   is stored as what it comes to (a scalar's mass worked out from a side typed for it). What cannot be read is not kept. */
bus.on('entry.set', ({ id, key, text = null, settle = false }) => { const o = blockOf(id);
  if (o && measures(o)){ const src = sourceOf(o); hud.say(`${bare(o.name)} is a length of ${src ? bare(src.name) : 'another shape'}: change it there`); return shown(); }
  if (o && rangedOf(o)){ hud.say(`${bare(o.name)} is part of ${partOf(o)}: change it there`); return shown(); }      /* a part has no entries of its own */
  if (o && (isArrow(o) || givenOf(o) || seatedOf(o))){ hud.say(isArrow(o) ? 'An arrow\'s output is worked out: change its input or its formula' : givenOf(o) ? 'in is whatever the arrow is given: change the arrow\'s input' : `${bare(o.name)} is seated: its value is the arrow's output`); return shown(); }
  if (o){ const t = text === null ? { text: '' } : bound(text, reachList()), got = t.refused ? t : entered(t.text, lookupFor(o), { settle });
    if (got.refused) hud.say(`Not kept: ${got.refused}`);
    else { if (got.clear) o.values.delete(key); else o.values.set(key, got.value);
      keepTouching(() => { for (const k of kinOf(o)) agree(k); }); } }      /* a single entry's number is its sides' length: whatever shares their names follows */
  write(); shown(); }, changes);
bus.on('attr.add', ({ id }) => { const b = blockOf(id); if (b){ const list = attrsOf(b); let n = list.length + 1; while (list.some(a => a.name === 'attribute' + n)) n++; list.push({ name: 'attribute' + n, text: '' }); } shown(); }, changes);
bus.on('attr.set', ({ id, index, name, text }) => { const b = blockOf(id), a = b && attrsOf(b)[index]; if (a){ if (name !== undefined) a.name = name;
    if (text !== undefined){ const t = bound(text, reachList()); if (t.refused) hud.say(`Not kept: ${t.refused}`); else a.text = t.text; }      /* a name typed out after an @ is bound to its capsule */
    if (!a.name.trim() && !a.text.trim()) attrsOf(b).splice(index, 1); }      /* with neither a name nor a value, it is gone */
  shown(); }, changes);
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
  /* what comes from the list is the variables themselves, not copies: each named shape in the new frame is a
     reference to the one it was made from, with its entries, its definition and its colour */
  const from = inGroup(frame, s), linked = from.map(b => isNamed(b) && !b.members); pictures.forEach((p, i) => { if (linked[i]) p.inside = null; });
  const made = paste(at, pictures, false) || [];
  made.forEach((b, i) => { const of = from[i]; if (!linked[i] || !of) return; b.values = of.values; b.ref = true; b.attrs = attrsOf(of); if (isArrow(of)) b.fn = of.fn;
    if (!spaceOf.has(of)){ const def = newSpace(of, s); for (const k of kinOf(of)) spaceOf.set(k, def); } spaceOf.set(b, spaceOf.get(of));
    const set = kin.get(of) || new Set([of]); set.add(b); for (const k of set) kin.set(k, set); });
  shown(); }, changes);
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
bus.on('use', ({ id, at, transposed = false }) => { const v = blockOf(id); if (v) useShape(v, at, transposed); }, changes);
bus.on('slot', ({ into, id, cx, cy }) => { const a = blockOf(into), v = blockOf(id); if (a && v) slotIn(a, v, cx, cy); }, changes);
bus.on('summon', ({ name, key, group: all, at }) => { summon({ name, key, group: all }, at); shown(); }, changes);
bus.on('length.add', ({ name, units, at, of = null, side = null }) => { const u = view.unit, on = v => Math.round(v / u) * u;      /* a named length set down on the canvas: a single entry of that name, holding the length */
  const src = of ? blockOf(of) : null;      /* from the list: not a copy of the length but the length itself, the source's colour and always what the source's side is */
  const b = makeBlock({ ...typeNamed('tensor'), color: src ? src.shape.color : someColour() }, { x: on(at.x - u / 2), y: on(at.y - u / 2), w: u, h: u }, name);
  if (src){ b.from = { id: src.id, side: side === 'y' || side === 'm' ? side : 'x' }; b.ref = true; } else b.values.set('1,1', units);
  space.blocks.push(b); view.world.append(b.el); select([b]); }, changes);

/* shift, held, shows the list's shapes as their transposes */
let shiftHeld = false;
const relist = () => { const reach = inReach(); variables.show(reach.main, reach.hidden); };
addEventListener('keydown', e => { if (e.key === 'Shift' && !shiftHeld){ shiftHeld = true; relist(); } });
addEventListener('keyup', e => { if (e.key === 'Shift' && shiftHeld){ shiftHeld = false; relist(); } });
addEventListener('blur', () => { if (shiftHeld){ shiftHeld = false; relist(); } });

let menuAt = { x: 0, y: 0 };
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl ';
const menu = createMenu([
  { label: 'New', items: () => shapes.map(shape => ({ label: shape.label || shape.name, run: () => bus.send('new', { type: shape.name }) })) },
  { label: 'Undo', hint: mod + 'Z', disabled: () => !history.canUndo(), run: () => bus.send('undo') },
  { label: 'Redo', hint: mod + (mod === '⌘' ? '⇧Z' : 'Y'), disabled: () => !history.canRedo(), run: () => bus.send('redo') },
  { label: 'Cut', hint: mod + 'X', disabled: () => !selected.size, run: () => removing('cut') },
  { label: 'Copy', hint: mod + 'C', disabled: () => !selected.size, run: () => bus.send('copy', { ids: idsOf(selected) }) },
  { label: 'Paste', hint: mod + 'V', disabled: () => !clipboard, run: () => bus.send('paste', { at: menuAt, pasted: clipboard }) },
  { label: 'Transpose', hint: 'T', disabled: () => !selected.size, run: () => bus.send('transpose', { ids: idsOf(selected) }) },
  /* greyed where the selection does not allow it; chosen all the same, each says why in the readout */
  { label: 'Difference', why: () => refusing([...selected], difference(inOrder([...selected]).map(unitsOf)), 'cut or fused').refused || null, run: () => bus.send('difference', { ids: idsOf(selected) }) },
  { label: 'Intersect', why: () => refusing([...selected], intersection(inOrder([...selected]).map(unitsOf)), 'cut').refused || null, run: () => bus.send('intersect', { ids: idsOf(selected) }) },
  { label: 'Revert', why: () => revertible().refused || null, run: reverting },
  { label: 'Unseat', why: () => selected.size === 1 && [...selected][0].seat ? null : 'Unseat takes a seated block off its seat: select one block that is seated', run: () => bus.send('unseat', { id: [...selected][0].id }) },
  { label: 'Delete', hint: 'X', disabled: () => !selected.size, run: () => removing('delete') },
  { label: 'Save project', run: () => { const name = kept ? (window.prompt('Save this project as', current || 'untitled') || '').trim() : null;      /* asked here, so the message says what was answered */
    if (kept && !name) return hud.say('Not saved'); bus.send('save', { name }); } },
  { label: 'Open project', items: () => kept ? kept.map(name => ({ label: name, run: () => bus.send('project.open', { name }) })) : [{ label: 'From a zip', run: () => bus.send('project.pick') }] },
], { onWhy: text => hud.say(text) });
const hud = createHud({ onHome: () => bus.send('camera.home') });
const crumbs = createCrumbs({ onGo: index => bus.send('space.go', { index }) });
const view = createView({
  onChange: camera => bus.send('camera', camera),
  onMenu: (x, y, el) => bus.send('menu.open', { x, y, id: blockAt(el)?.id ?? null }),
  onClick: clicked,                             /* these two read the pointer, and send what it amounts to */
  onDrag: dragged,
});
document.body.append(view.el, menu.el, hud.el, properties.el, crumbs.el, variables.el, warning.el);
hud.show(view.camera());
