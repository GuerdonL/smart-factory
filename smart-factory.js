/* The page: makes the components and connects them. Components never reach into each other;
   anything one needs from another passes through here. */
import { editText } from './components/dom.js';
import { createView } from './components/view.js';
import { createMenu } from './components/menu.js';
import { createHud } from './components/hud.js';
import { createProperties } from './components/properties.js';
import { createWarning } from './components/warning.js';
import { createFormula } from './components/formula.js';
import { evaluate, entered, typed as typedText, bound, guard, refs, refersTo, repoint, label, wholeOf, nameable } from './expression.js';
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
import { createTile } from './components/tile.js';
import * as tiles from './tiles.js';
import { touches, zoneOf, joins, pieces, turnedPlaces, nested as innerAgree, resultHollows, pieceHollows, typeOf, difference, intersection, rangeOf, rangeIn, partEntries, wholeSide, sideLabel, nthOf, initials, readSide, rootOf as rootValue, isInteger, isError, isFormula, storable, sideOf, combine, valueText, truthOf } from './algebra.js';
import { build as buildGraph, indexAt, VERSION as GRAPH_VERSION, CODES, said as inWords } from './graph.js';
import { evaluate as workOut, carry, toMap, tooLarge, promiseOf, judged, seenFrom, truthAt, stoppedAt, MOST as MOST_HERE } from './evaluate.js';
import { SPACES as NUMBER_SPACES, NONE as NONE_SPACE, RESERVED, promise as promiseRead } from './spaces.js';
const SPACES = [...NUMBER_SPACES, NONE_SPACE];      /* what a shape may promise: one of the ten number spaces, or None alone */
import * as project from './project.js';
import { createBus } from './bus.js';
import { createIds } from './ids.js';
import { createHistory } from './history.js';
import { SYSTEM, FUNCTIONS, SLOTS, OLD, CONFIG, COLORS, DARK, DARK_DOWN, isColour, leaf } from './system.js';
import { SIDES, along, covered, coveredType, strip, triangle, free, edgeAt, adjust, settable, sided, standing, names as formulaNames, fits, fitting, seatable, carried, ends, defined, seatsOn, dependsOn, functionFor, writtenWhere, readAt, definable, conditionable, chosenType, emptySide, conditionAt, conditionSaid } from './arrows.js';
import { zip, unzip } from './zip.js';
import { SOURCES, DATA, DISTS, kept as sourceKept, kindOf as sourceKind, labelOf as sourceLabel, noise as noiseOf, seedOf, dataName, dataPath, tooSmall, smallSays, faceOf, values as sourceValues, typable, holds, sizable as sourceSizable } from './sources.js';
import { wanted, laid, noted, drawn as cellsDrawn, level as levelOf } from './decimals.js';
import { createBackend, OLDER as OLDER_BACKEND } from './backend.js';
import { squares } from './components/matrix.js';
import * as nesting from './inner.js';

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
   A frame of a space may be a tile: space.repeats has its repeat, and space.tiles what draws it (see "tiles").
   Only the current space's blocks are on the canvas. A space also keeps its operations (ops): what Difference and
   Intersect have cut in it, each with the two blocks it took off the canvas (see "the boolean tool"). */
const newSpace = (owner, parent) => ({ owner, parent, blocks: [], ops: [], groupOf: new Map(), groupUp: new Map(), groupNames: new Map(), repeats: new Map(), tiles: new Map(), frames: new Map(), camera: { x: 0, y: 0, zoom: 1 }, definition: null });
const top = newSpace(null, null);              /* the Menu */
const spaceOf = new Map();                     /* block -> its definition space */
let space = top;
const trail = () => { const t = []; for (let s = space; s; s = s.parent) t.unshift(s); return t; };
function go(to){
  select([]); space.camera = view.camera();
  for (const b of space.blocks) b.el.remove(); space.definition?.el.remove(); for (const f of space.frames.values()) f.el.remove(); for (const t of space.tiles.values()){ t.el.remove(); t.overEl.remove(); }
  pickedTile = null; space = to;
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
    space.definition = createDefinition({ cols: t.cols, rows: t.rows, unit: view.unit, name: isNamed(a) ? a.name : 'output', letter: initials(a.name), color: 'function', values: outputOf(a).asDrawn || new Map(), editable: false, colsName: t.colsName || null, rowsName: t.rowsName || null, inner: t.inner || [] });
    space.definition.wrote = defKey(a); view.world.prepend(space.definition.el); return; }
  flow(space.owner);
  const o = space.owner, r = o.rect, over = turned(o);      /* opened through a transpose, it is still the variable's own definition: the right way round */
  space.definition = createDefinition({ cols: Math.round((over ? r.h : r.w) / view.unit), rows: Math.round((over ? r.w : r.h) / view.unit), unit: view.unit,
    name: o.name, letter: initials(o.name), color: isNamed(o) ? o.shape.color : null, values: laidOf(o, true), inherited: inheritedBy(o, space.parent), editable: isNamed(o) && !o.source,      /* a named block's matrix is written in its colour */
    colsName: over ? o.sides.h : o.sides.w, rowsName: over ? o.sides.w : o.sides.h, standing: standingLook(o), inner: dataOf(o), cell: cellOf(o) });
  space.definition.wrote = defKey(o);
  view.world.prepend(space.definition.el);     /* beneath the blocks */
}
/* the size an arrow's space writes on the right of its equation, and what the equation was written for: it is written again when that changes */
const defSize = a => { const o = outputOf(a), seat = seatOn(a); return a.arrow.output ? { ...a.arrow.output, colsName: seat?.sides.w || null, rowsName: seat?.sides.h || null } : (o.came && !o.came.error && o.came) || o.part || { cols: 1, rows: 1 }; };
const defKey = o => isArrow(o) ? 'arrow ' + JSON.stringify(defSize(o)) : JSON.stringify([standingLook(o), dataOf(o)]);
/* opening a block: its definition space is made the first time (one space for every place the variable is used),
   and is entered from here, by this block */
function open(b){
  const can = definable({ name: bare(b.name), seated: !!seatedOf(b) });      /* a seated variable is defined by its seat and by nothing else (arrows.js) */
  if (can.refused) return hud.say(can.refused);
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
/* Whether something can be called that is expression.js's to say (nameable): none is the word for the value None. Every
   way a name is given asks here first, typed, sent as a message or pasted, and where it cannot be, the readout says why
   and nothing changes. A project saved before the rule opens as it is. */
const unnameable = (...names) => { for (const name of names) if (name !== null && name !== undefined && nameable(name).refused){ hud.say(nameable(name).refused); return true; } return false; };
const namesOf = pics => (pics || []).flatMap(p => [p.name, p.sides?.w, p.sides?.h, p.arrow?.gapName, ...(p.inner || []).map(a => a.name), ...(p.attrs || []).map(a => a.name), ...namesOf(p.inside), ...namesOf((p.members || []).map(m => m.pic))]);      /* every name in what was copied, however deep */
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
/* A shape cannot be put anywhere inside its own definition, however far down: the definition would then hold itself,
   and there would be no end to it. loops(v, s): whether putting a use of v into space s would do that, which it would
   if s is v's definition space or lies anywhere beneath it. (A joined shape's definitions are those of the shapes it
   was joined from, too.) */
const defsOf = b => [spaceOf.get(b), ...(b.members || []).flatMap(m => defsOf(m.block))].filter(Boolean);
function beneath(s, from, seen = new Set()){      /* whether s is from, or a definition space of something in it, and so on down */
  if (from === s) return true; if (seen.has(from)) return false; seen.add(from);
  return from.blocks.some(b => defsOf(b).some(d => beneath(s, d, seen)));
}
const loops = (v, s) => defsOf(v).some(d => beneath(s, d));
/* What is in reach, for the list at the right edge: { main, hidden }, each a list of items.
   A named frame is a variable: dragged from the list, all of it is made again where it is dropped. What is named
   inside a named frame is listed under that frame, out of sight until the frame is opened, and nowhere else: it is an
   attribute of the frame. (A frame is no scope: its shapes share the space's variables with everything else there.)
   A named shape's two side lengths are listed under it in the same way: click the shape and they show beneath it.
   A dotted name is a hidden variable, kept behind the plus, along with everything under a dotted frame.
   Of several definitions of one name in different spaces, the lowest is the one in reach: it shadows the others. */
const inReach = () => steadily(reachNow);
function reachNow(){
  const spaces = trail(), main = [], hidden = [], seen = new Set(), names = new Set(), lengths = [], shapes = [];
  spaces.forEach((s, depth) => { const nodes = new Map();
    const named = g => { for (; g !== undefined; g = s.groupUp.get(g)) if (s.groupNames.has(g) || s.repeats.has(g)) return g; };      /* the nearest named frame, from g outwards; a tile is listed whether or not it has a name */
    const node = g => { if (!nodes.has(g)){ const up = named(s.groupUp.get(g)), name = s.groupNames.get(g) || 'tile';
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
            .concat(massName(b) ? [{ kind: 'length', of: originOf(b).id, side: 'm', name: massName(b), units: scalarOf(b), label: unset(b) ? symbolOf(b) : valueText(scalarOf(b)) }] : [])
            .concat(tileOf(b, s) !== undefined ? indexItems(b) : []) };      /* in a tile: its index, beside its x and y */      /* and a scalar's mass: the number it holds */      /* its side lengths, out of sight under it until it is clicked: the variable's width, then its height */
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
  /* in the definition space of a block that is in a tile, its index is listed as two matrices the block's size, to be dragged in (but for one that is in the space already, which is listed as the shape it is) */
  const o = space.owner, os = o && !isArrow(o) ? spaceWith(o) : null;
  if (os && tileOf(o, os) !== undefined) main.unshift(...indexItems(o).filter(i => !space.blocks.some(b => b.from?.index === i.axis)));
  return { main: [...main, ...lengths.filter(l => !under.has(l.name))], hidden: [...systemItems().filter(i => !told.has(i.name)), ...hidden] };      /* the program's own, where the project has none of that name */
}
const indexItems = b => ['x', 'y'].map(axis => ({ kind: 'index', name: 'index.' + axis, axis, of: b.id, color: b.shape.color, cols: b.rect.w / view.unit, rows: b.rect.h / view.unit }));
const systemItems = () => [{ kind: 'system', name: CONFIG, group: true, color: 'muted', cols: 3, rows: 3 }, { kind: 'system', name: COLORS, group: true, color: 'muted', cols: 3, rows: 2 }, { kind: 'system', name: DARK, group: true, color: 'muted', cols: 3, rows: 2 },
  ...SYSTEM.map(v => ({ kind: 'system', name: v.name, key: v.key, color: v.css || v.color, cols: v.cols, rows: v.rows || 1 })),
  ...FUNCTIONS.map(f => ({ kind: 'arrow', name: f.name, color: 'function', cols: 1, rows: 1, builtin: true }))];      /* the program's own functions (a project's arrow of the same name is listed in its place) */
/* another use of a shape variable, centred on a world point */
function useShape(of, at, transposed = false){      /* transposed: whether the new use is to be the variable's transpose */
  if (orderOf(of)) of = originOf(of);          /* a new use is the variable its own way round, whichever use it was dragged from */
  if (loops(of, space)) return hud.say(`${bare(of.name)} cannot go inside its own definition`);
  const u = view.unit, on = v => Math.round(v / u) * u, over = !of.members && !!of.t !== !!transposed, r = over ? { w: of.rect.h, h: of.rect.w } : of.rect;
  const b = makeBlock({ ...of.shape }, { x: on(at.x - r.w / 2), y: on(at.y - r.h / 2), w: r.w, h: r.h }, of.name);
  b.sides = over ? { w: of.sides.h, h: of.sides.w } : { ...of.sides }; b.values = of.values; b.inner = of.inner; if (of.source) b.source = of.source; b.turn(of.members ? of.t : transposed); if (of.members) b.members = of.members;                                         /* the same entries, not a copy */
  if (!spaceOf.has(of)){ const def = newSpace(of, space); for (const k of kinOf(of)) spaceOf.set(k, def); }
  spaceOf.set(b, spaceOf.get(of));                                                          /* the same definition */
  const set = kin.get(of) || new Set([of]); set.add(b); for (const k of set) kin.set(k, set);
  b.ref = true; b.attrs = attrsOf(of);           /* a reference to the variable, not the shape it was made as: its attributes are the variable's */
  space.blocks.push(b); view.world.append(b.el); select([b]);
}
/* ---- standing shapes (snap to matrix) ----
   A variable dragged from the list onto a shape's matrix (the "= [...]" beside it in the Menu, or the right-hand side
   in its definition space) goes into the matrix, where it was dropped, in place of the entries it covers. It may be
   any size that fits inside the matrix, and the shapes there may be packed in any arrangement that does not overlap;
   the entries not yet covered stay as they were. The first one put in replaces whatever was in the receiving shape's definition space. From then on that
   space holds the shapes standing in the matrix, each marked as standing there and lying where it stands: the place where the
   equation's left side is written is the matrix, entry for unit. Once the standing shapes cover every entry, the receiving
   shape's entries are theirs, as if they had been joined. Until then the variable keeps its own typed entries: the two
   are never mixed. Such a shape is a standing shape (block.standing; once called a tile, a word that now means a
   region that repeats: see "tiles"). What the user reads calls it snap to matrix. */
/* In the matrix of a shape whose entries hold inner data (see "inner data"), a standing shape stands for one entry
   and is that entry's size: so there the matrix's place is laid out entry for entry, each as large as the matrix it
   holds (cellOf), and a shape stands at its entry's place in that. Such shapes are all or nothing too. */
const cellOf = b => { const data = dataOf(b); return data.length >= 2 ? nesting.entryType(data) : null; };      /* one entry's own matrix, for a shape that shapes can stand in the entries of */
const slotOf = b => { const c = cellOf(b), sx = c ? c.cols : 1, sy = c ? c.rows : 1; return { x: -view.unit - b.rect.w * sx, y: Math.round(-b.rect.h * sy / 2 / view.unit) * view.unit }; };      /* where the left side of b's equation is written, in b's definition space */
/* the shapes standing in b's matrix: [{ block, x, y, w, h }] in entries, or null if its definition space is not just such shapes */
function standingOf(b){
  const def = spaceOf.get(b), u = view.unit; if (!def) return null;
  const act = def.blocks.filter(t => !isOff(t) && !inConfig(t, def)), slot = slotOf(b), cols = Math.round(b.rect.w / u), rows = Math.round(b.rect.h / u), out = [], cell = cellOf(b);
  if (!act.length) return null;
  for (const t of act){ const x = (t.rect.x - slot.x) / u / (cell ? cell.cols : 1), y = (t.rect.y - slot.y) / u / (cell ? cell.rows : 1), w = cell ? 1 : t.rect.w / u, h = cell ? 1 : t.rect.h / u;
    if (cell && (t.rect.w !== cell.cols * u || t.rect.h !== cell.rows * u || !innerAgree(cell.inner, dataOf(t), true).ok)) return null;      /* in an entry stands a shape of the entry's size, holding what the entry holds */
    if (!t.standing || x % 1 || y % 1 || x < 0 || y < 0 || x + w > cols || y + h > rows) return null;
    if (out.some(o => x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h)) return null;
    out.push({ block: t, x, y, w, h }); }
  return out;
}
const standingLook = b => (standingOf(b) || []).map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h, color: t.block.shape.color, name: t.block.name, id: t.block.id }));
/* ---- the algebra of a space ----
   algebraIn(s): the blocks of s that take part, their rectangles in units, every touch between them (a product, a
   sum, times or over: algebra.js) and the pieces they make, each with its one rule. */
function algebraIn(s){
  const u = view.unit, active = s.owner && standingOf(s.owner) ? [] : s.blocks.filter(b => !isOff(b) && !isArrow(b) && !hollowSeat(b));      /* shapes standing in the block's matrix are entries, not a product; commented-out blocks take no part */
  const rects = active.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u, wName: b.sides.w, hName: b.sides.h, zone: zoneOf(tilesOf(b, s)), ...(dataOf(b).length ? { inner: dataOf(b) } : {}), ...(lost(b) ? { none: true } : {}) }));      /* zone: the tile it is in: nothing touches across a tile's boundary (algebra.js) */      /* none: a part its source is too small to have has no value */
  return { active, rects, touches: touches(rects), all: pieces(rects) };
}
/* a block's entries: its own; or, once shapes standing in its matrix (in its definition space) cover all of it,
   theirs. Nothing else defines it: shapes set anywhere else, there or beside it, are only pieces. */
/* A block can be the transpose of its variable (block.t). Its entries are kept the variable's way round, shared with
   every other use; a transpose reads them turned. (A joined shape is turned bodily, with what it was joined from, so
   its entries are already the way it stands.) */
const turned = b => !!b.t && !b.members;
const flipped = values => new Map([...values].map(([k, v]) => { const i = k.indexOf(','), j = k.indexOf(',', i + 1); return [(j < 0 ? k.slice(i + 1) : k.slice(i + 1, j)) + ',' + k.slice(0, i) + (j < 0 ? '' : k.slice(j)), v]; }));      /* column and row change places; an inner position stays where it is */
/* An entry holds a literal value or a formula, { expr } (expression.js), never a formula with its result: a formula
   is worked out each time it is read, so it follows whatever it refers to. worked(b) is b's own entries as values:
   the block's Map itself where it holds no formula, else a new one, in which an entry whose formula comes to nothing
   yet (unknown) is absent and so is drawn as its symbol. A formula that depends on itself, directly or through
   others, comes to the error "depends on itself": working (expression.js: guard) keeps track of what is being
   worked out, each thing by the id of the block its variable was made as. */
const working = guard();
const workedAt = (b, key) => { const v = b.values.get(key); if (!isFormula(v)) return v; const [c, r, ...ks] = key.split(',').map(Number); return working(originOf(b).id + ' ' + key, () => evaluate(v.expr, lookupFor(b, { c, r, ks })).value ?? null); };      /* the entry's place, for a formula that reads the index */
function worked(b){
  if (b.source){ const all = orderOf(b) ? variableAxes(b) : null, u = view.unit, w = Math.round(b.rect.w / u), h = Math.round(b.rect.h / u);      /* (a turned use: by its variable's own columns and rows) */
    if (dataOf(b).length && nesting.numbers(w, h, dataOf(b)) > MOST_HERE) return new Map();      /* more numbers than are worked out here: none are made, whatever its size */
    return all ? sourceValues(b.source, all[0].length, all[1].length, all.slice(2).map(a => a.length)) : sourceValues(b.source, turned(b) ? h : w, turned(b) ? w : h, dataOf(b).map(a => a.length)); }      /* a source stores no entries: they follow from its kind and its size (sources.js), the variable's own way round */
  let any = false; for (const v of b.values.values()) if (isFormula(v)){ any = true; break; }
  if (!any) return b.values;
  const out = new Map(); for (const [k, v] of b.values){ const w = isFormula(v) ? workedAt(b, k) : v; if (w !== null && w !== undefined) out.set(k, w); }
  return out;
}
const own = (b, plain = false) => { const order = plain ? null : orderOf(b); return order ? reordered(worked(b), order) : turned(b) && !plain ? flipped(worked(b)) : worked(b); };
/* a variable's entries as a turned use reads them: each key's numbers in the use's order of axes (a key that is not one of its entries is left out) */
const reordered = (values, order) => { const out = new Map(); for (const [k, v] of values) if (k.split(',').length === order.length) out.set(nesting.toUse(k, order), v); return out; };
/* ---- the graph and the evaluator ----
   What anything on the page comes to is not worked out here. The whole project is built into a graph (graph.js) and
   every result that is drawn is asked of the evaluator (evaluate.js): what a block holds, what a piece comes to,
   an arrow's output, a tile's cells. The page does no arithmetic of its own.
   The graph is built once for each state of the project, and not again while that state stands: a message that
   only looks (the camera, the selection, a hover) builds nothing. Whether the state still stands is told from the
   project as it would be saved (gather), written out and compared, with each block's entries written as a stamp
   that every change to them moves on (touched: said wherever entries are changed in place), so the comparison
   costs the same however many numbers there are. When the graph is built again, what was worked out of the last
   one is carried over for every node that is the same all the way down (evaluate.js: carry), so a change is
   worked out where it reaches and nowhere else. */
const GRAPH = Symbol('graph'), graphKept = { graph: null, light: null }; let holding = 0, graphHeld = null;
const steadily = read => { holding++; try { return read(); } finally { if (!--holding) graphHeld = null; } };      /* read changes nothing: one look at the project serves all of it */
const stamps = new WeakMap(); let stampAt = 0;
const stampOf = values => { if (!stamps.has(values)) stamps.set(values, ++stampAt); return stamps.get(values); };      /* which entries these are, and how often changed */
const touched = values => { stamps.set(values, ++stampAt); };
/* a block's entries as plain data: the same object for as long as they are not changed, so that whoever reads the project again (graph.js) can tell at once */
const entriesKept = new WeakMap();
function entriesOut(values){ const at = stampOf(values), was = entriesKept.get(values); if (was && was.at === at) return was.data; const data = Object.freeze(Object.fromEntries(values)); entriesKept.set(values, { at, data }); return data; }
function graphNow(){
  if (memo?.has(GRAPH)) return memo.get(GRAPH);
  if (holding && graphHeld) return graphHeld;
  const light = JSON.stringify(gather(true).top);
  if (light !== graphKept.light){ const g = buildGraph(gather('kept')); if (graphKept.graph) carry(graphKept.graph, g); graphKept.graph = g; graphKept.light = light; }
  memo?.set(GRAPH, graphKept.graph); if (holding) graphHeld = graphKept.graph;
  return graphKept.graph;
}
/* a graph's pieces and arrows, found by the blocks they are of */
const found = new WeakMap();
function findIn(g){
  if (!found.has(g)){ const pieces = new Map(), arrows = new Map(), tiles = new Map();
    for (const s of Object.values(g.spaces)){ for (const p of s.pieces) if (!pieces.has(p.blocks.join(' '))) pieces.set(p.blocks.join(' '), p); for (const a of s.arrows) if (!arrows.has(a.arrow)) arrows.set(a.arrow, a);
      for (const t of s.tiles) if (!tiles.has(t.tile)) tiles.set(t.tile, t); }
    found.set(g, { pieces, arrows, tiles }); }
  return found.get(g);
}
/* what the evaluator says of a node: its entries as a Map (infinities as numbers); an empty Map where it is too
   large to be worked out here, or is made of what only the backend has; null where it has no value (an error in the
   graph). This is exact, always: no number of the backend's is ever in it. Everything the page works out, checks,
   refuses or saves reads this (valuesOf, scalarOf and all that read them), and nothing else. */
const asMaps = new WeakMap();
function answerOf(node, binding = null){
  if (!node) return null;
  const r = workOut(graphNow(), node, binding ? { binding } : undefined);
  if (!r.deferred && !r.entries) return null;
  if (!r.entries) return new Map();
  if (!asMaps.has(r)) asMaps.set(r, toMap(r.entries));
  return asMaps.get(r);
}
/* ---- the backend ----
   What the evaluator does not work out (a result too large for the browser, anything made of noise or of a data
   file) and an entry it leaves as exp, ln, tanh or erf (exp(1)) is asked of the backend, a separate process reached
   through the server (backend.js has when it is asked and which answers are kept; decimals.js what is asked for and
   what is drawn of an answer). Asking never waits: what is known now is given, and when an answer comes the screen
   is drawn again.

   The backend's numbers are decimals, and a decimal is for showing and for nothing else. They are kept apart, in
   `backend` here, and laid over the evaluator's exact answer only by the four functions of this section, laidAt,
   laidOf, pieceLaid and outputLaid, which only what draws may call: a result on the canvas, a tile's copies, a
   block's face, the matrix in the properties panel and in a definition space, and the sentences beside them
   (tests/decimals.test.js holds the page to that list). Nothing else reads them: an attribute, a side, a mass, a
   comparison, a count, a size, a formula, what is fused, copied or saved all read valuesOf, which is exact. So what
   the page works out is the same with a backend and without one, and no decimal is an entry of any block.

   With no backend nothing is asked, and what is made of noise or of a data file says "needs the backend" where its
   numbers would be; a result that is only too large keeps its symbols, with the same words small under its matrix
   (decimals.js: marked); everything else is as it is without one. With one, what it gives no numbers for says why in
   their place, and in the readout when the reason arrives. Whether there is one is asked again after a failure and
   every quarter of a minute, so one started or stopped later is noticed. */
const backend = createBackend({ fetch: (path, options) => fetch(path, options), later: (fn, ms) => setTimeout(fn, ms), cancel: id => clearTimeout(id),
  changed: () => { if (holding) return; if (space.owner) write(); shown(); }, project: () => (kept ? current : null), version: GRAPH_VERSION,
  told: why => hud.say((/^the backend /.test(why[0]) ? cap(why[0]) : 'The backend gave no numbers: ' + why[0]) + (why.length > 1 ? `; and ${why.length - 1} more: each is written where its numbers would be` : '')) });
const laidKept = new WeakMap();                /* an evaluator's answer -> what was last laid over it, and from what */
const slotAt = (slot, binding) => slot + (binding && binding.cells ? ' ' + binding.cells.map(c => c.cx + ',' + c.cy).join(' ') : '');      /* what is drawn in one place, in one cell: the previous numbers there are dimmed while the new are waited for */
function laidAt(node, binding = null, slot = null){
  const exact = answerOf(node, binding); if (exact === null) return null;
  const g = graphNow(), r = workOut(g, node, binding ? { binding } : undefined); if (!wanted(r)) return exact;
  if (r.forever) return RUNS_UNTIL;      /* a loop with no last cell: there is nothing to ask the backend for until something runs it */
  const there = backend.available(), got = there === false ? null : backend.ask(g, node, binding, cellsDrawn(r.type), slot === null ? null : slotAt(slot, binding)), why = got ? null : backend.problem(g, node, binding);      /* only the entries that are drawn are asked for */
  const was = laidKept.get(r); if (was && was.there === there && was.result === (got ? got.result : null) && was.stale === (got ? got.stale : false) && was.why === why) return was.map;
  const map = laid(r, exact, { there, got, why }); laidKept.set(r, { there, result: got ? got.result : null, stale: got ? got.stale : false, why, map }); return map;
}
const deferredAt = (node, binding = null) => !!node && !!workOut(graphNow(), node, binding ? { binding } : undefined).deferred;
/* what to say, in the panel, of a node whose numbers are not shown: that it needs the backend, why the backend gave
   none, or (for one that is only too large) that it is; null where its numbers are shown, or it has an error of its own */
const RUNS_UNTIL = noted('runs until stopped');
const RUNS_ON = 'It runs until stopped: its count is infinite and it has no stop block. Its first cells show their state';
const notStopped = steps => `Not stopped after ${steps} steps: needs the backend`;
function unshown(node, binding = null, slot = null){
  if (!node) return null;
  const g = graphNow(), r = workOut(g, node, binding ? { binding } : undefined);
  if (r.error && r.error.code === 'type' && r.error.node !== node) return 'It has no value: ' + r.error.note;      /* worked out from a shape whose promise a value breaks (that shape says so itself, in its Holds row) */
  if (!wanted(r)) return null;
  if (r.forever) return RUNS_ON;      /* a loop with no last cell: nothing gives it a value while nothing runs it */
  if (backend.available() === false && backend.older()) return r.backend || r.deferred ? cap(OLDER_BACKEND) : null;      /* one is running, and reads an older graph than this page writes: said on each result that needs it */
  if (backend.available() === false) return r.backend ? 'It needs the backend: its numbers are made there, and none is running (README: The backend)' : r.steps !== undefined ? notStopped(r.steps) : r.deferred ? tooLarge(r.type) : null;
  const why = backend.problem(g, node, binding), far = why ? backend.broke(g, node, binding) : null;
  if (far && far.node === node) return null;      /* its own promise, broken by a number the backend worked out: the shape says so itself, in its Holds row */
  if (why) return (far ? 'It has no value: ' : 'The backend gave no numbers: ') + why;      /* (a promise its numbers break, found by the backend: the sentence is the page's own) */
  return r.deferred && !backend.ask(g, node, binding, cellsDrawn(r.type), slot === null ? null : slotAt(slot, binding)) ? (backend.available() ? 'Waiting for the backend' : r.backend ? null : r.steps !== undefined ? notStopped(r.steps) : tooLarge(r.type)) : null;
}
/* In the panel a sentence is said once. A matrix with no numbers carries why in place of its entries (decimals.js:
   noted), and the notes beneath it say the same in full ("It has no value: in is not natural: …"): where they do,
   the matrix says only that it has no value. values: what the panel draws; laidOut: what was laid, which has the note. */
const once = (values, laidOut, said) => laidOut && laidOut.note && typeof said === 'string' && said !== laidOut.note && said.endsWith(laidOut.note) ? noted('no value') : values;
/* a block's entries as they are drawn: the evaluator's, with the backend's laid over them. For drawing only. */
function laidOf(b, plain = false){
  if (isArrow(b)) return new Map();
  if (typedOnly(b)) return own(b, plain);
  return steadily(() => { const n = nodeFor(b, plain); return n && laidAt(n.id, n.binding, n.slot); }) || held(b, 0, plain);
}
/* what a piece of several blocks comes to, as it is drawn. For drawing only. */
const pieceLaid = (bs, s = space) => steadily(() => { const g = graphNow(), p = findIn(g).pieces.get(bs.map(b => b.id).join(' ')); return !p || !p.node ? null : laidAt(p.node, bindingOf(bs, s), 'p ' + p.blocks.join(' ')); });
/* a single entry's number as it is written on its block's face where the browser has none for it and the backend has (a decimal); null otherwise. For drawing only. */
const faceLaid = b => { if (!single(b) || b.source || scalarOf(b) !== null) return null; const m = laidOf(b), v = m.get('1,1'); return v && typeof v === 'object' && typeof v.f === 'number' ? { text: valueText(v), stale: !!m.stale } : null; };
/* Truth is shown as height: whether a block is drawn sunk, which is where its whole matrix is false (every entry known,
   and zero, false or None: values.js, truthOf). Every shape is asked, whatever it is for. True, and not known, are
   drawn as a block always was; so is a block that takes no part (commented out). An arrow is never sunk: a function
   is always true. Where the page works the block out, its entries say; where it is too large, what it is known to
   hold says (evaluate.js: truthAt: a source of zeros is false at any size); and where only the backend has its
   numbers, the backend's answer says once it has come (decimals.js: merged), and until then it is drawn as it was.
   For drawing only: nothing is worked out from this. */
function truthLaid(b){      /* true, false, or null where it is not known */
  if (isArrow(b) || isOff(b)) return null;
  return steadily(() => { const n = nodeFor(b, false), u = view.unit;
    if (!n){ const vs = valuesOf(b), count = Math.round(b.rect.w / u) * Math.round(b.rect.h / u) * dataOf(b).reduce((k, a) => k * a.length, 1), t = truthOf(vs.values()); return t === false && vs.size < count ? null : t; }      /* in no graph (a setting in a .config): its own entries */
    const t = truthAt(graphNow(), n.id, n.binding ? { binding: n.binding } : undefined), laid = t === null ? laidOf(b).truth : null;
    return t !== null ? t : laid === true || laid === false ? laid : null; });
}
const sunkLaid = b => truthLaid(b) === false;
/* Where a node is looked at from (evaluate.js: binding). A block of a tile, or one in the definition space of a block
   of a tile, is in a cell: the first, or the one being drawn (cellNow). The cell says where every block of the
   pattern lies, and every arrow's output there, so that each reads its own place however it is reached (a product
   of two blocks of one tile gives each its own index). A block of a tile that is inside another tile's pattern is
   in a cell of each: the whole chain is given, outermost first (cellsOf), and which of them the index is read from
   is not said here (graph.js: indexAt). A block in an arrow's definition space is in a function's
   body: the function's input is what the arrow that space was opened through is given.
   of: the blocks whose node is asked for; a: the arrow, where it is an arrow's output; over: the node asked for is
   under a transpose that is not being asked for (a variable's own way round, through a use that is turned). */
function cellIn(s, t, r = null, over = false){      /* r: where in the pattern what is asked for lies ({ x, y } in units on the canvas); none: the evaluator finds it by `at` */
  const rep = s.repeats.get(t), now = cellNow.get(rep) || FIRST, g = graphNow(), at = {}, mine = inGroup(t, s).filter(k => tileOf(k, s) === t);
  for (const k of mine) if (!isArrow(k) && g.blocks[k.id]){ const r = unitsOf(k); at[g.blocks[k.id]] = { col: r.x - rep.x, row: r.y - rep.y }; }
  for (const [c, cr] of s.repeats) if (tileUp(s, c) === t){ const id = findIn(g).tiles.get('t:' + c)?.node; if (id && !(id in at)) at[id] = { col: cr.x - rep.x, row: cr.y - rep.y }; }      /* a tile in the pattern is one part of it */
  for (const k of mine) if (isArrow(k)){ const id = findIn(g).arrows.get(k.id)?.node, r = id && !(id in at) ? outputOf(k).place : null; if (r) at[id] = { col: r.x - rep.x, row: r.y - rep.y }; }      /* an output lies where it is written */
  return { x: (now.cx - 1) * rep.cols, y: (now.cy - 1) * rep.rows, dx: r ? r.x - rep.x : 0, dy: r ? r.y - rep.y : 0, cx: now.cx, cy: now.cy, turned: over, of: ['t:' + t], at };      /* of: which tile's cell it is, so that a block read from a tile inside its own is still worked out in its own tile's cell alone (evaluate.js) */
}
/* the chain of cells something in tile t is in: a cell of every tile t is inside, outermost first, and last t's own */
function cellsOf(s, t, r = null, over = false){
  const ts = [t, ...tilesAbove(s, t)].reverse();
  return ts.map((g, i) => i === ts.length - 1 ? cellIn(s, g, r, over) : cellIn(s, g, s.repeats.get(ts[i + 1])));
}
function bindingOf(of, s, over = false, a = null){
  const g = graphNow(), params = {}, first = a || of[0], t = s && first ? tileOf(first, s) : undefined;
  let cells = t !== undefined ? cellsOf(s, t, over ? unitsOf(first) : null, over) : null;
  for (let at = s; at && at.owner; at = spaceWith(at.owner)){ const o = at.owner, up = spaceWith(o);
    if (isArrow(o)){ const inner = at.blocks.find(k => k.in), param = inner && g.blocks[inner.id], fn = param && (g.nodes[param].within || []).find(w => w[0] === 'f'), given = givenTo(o);
      if (fn && given && !(fn in params)) params[fn] = given; }
    else if (!cells && up && tileOf(o, up) !== undefined) cells = cellsOf(up, tileOf(o, up), unitsOf(o), turned(o)); }      /* what is in a block's definition is at that block's place, the variable's own way round */
  return cells || Object.keys(params).length ? { params, ...(cells ? { cells } : {}) } : null;
}
/* what an arrow gives its function: the covered part of its input, as the graph has it */
function givenTo(a){
  const g = graphNow(), e = findIn(g).arrows.get(a.id), n = e && e.node && g.nodes[e.node]; if (!n) return null;
  const first = t => along(a.arrow.side) === 'rows' ? { col: 0, row: a.arrow.start - 1, cols: t.cols, rows: a.arrow.span } : { col: a.arrow.start - 1, row: 0, cols: a.arrow.span, rows: t.rows };
  if (n.op === 'apply' || n.op === 'map') return n.inputs[0];
  if (n.op === 'mapalong') return { of: n.inputs[0], range: first(g.nodes[n.inputs[0]].type) };      /* repeated: the first run */
  const span = { ...first(n.type), col: 0, row: 0 };      /* passed through: the output is the covered part (every run of it, where it is repeated) */
  return span.cols < n.type.cols || span.rows < n.type.rows ? { of: e.node, range: span } : e.node;
}
/* a block's entries as the evaluator gives them: null where the block takes no part (it is commented out, or in a
   .config) or has no value there (its variable has an error: then it keeps what it holds, see held) */
const evaluated = (b, plain) => steadily(() => { const n = nodeFor(b, plain); return n && answerOf(n.id, n.binding); });
/* a block's node in the graph, where it is looked at from, and what it is on the screen (backend.js: slot); null where it has none */
function nodeFor(b, plain){
  const g = graphNow(); let id = g.blocks[b.id]; if (!id) return null;
  const over = (turned(b) || !!orderOf(b)) && plain; if (over){ if (g.nodes[id].op !== 'transpose') return null; id = g.nodes[id].inputs[0]; }
  return { id, binding: bindingOf([b], spaceWith(b), over), slot: 'b ' + b.id + (over ? ' over' : '') };
}
/* why a block's variable has no value in the graph, as a sentence for the properties panel; null where it has one */
const WHY = { loop: () => 'It depends on itself, so nothing is worked out from it', pieces: n => `Its definition space holds ${n}, which is not one matrix: it keeps the entries typed into it`,
  size: n => `What defines it comes to another size (${n}): it keeps the entries typed into it`, mismatch: n => `What is in its definition space does not agree${n ? ' (' + n + ')' : ''}: it keeps the entries typed into it`,
  'not-a-row': () => 'What is in its definition space is not a single line of shapes: it keeps the entries typed into it', mixed: () => 'What is in its definition space mixes rules: it keeps the entries typed into it',
  'no-source': n => `What it reads is not there${n ? ' (' + n + ')' : ''}`, seat: n => `The arrow it is seated on has no output (${n})`, 'size-unknown': n => `A size it depends on is not settled (${n})` };
function whyNot(b){
  const g = graphNow(); let n = g.nodes[g.blocks[b.id]]; if (n && n.op === 'transpose') n = g.nodes[n.inputs[0]];
  if (!n || !n.error || !WHY[n.error.code]) return null;
  /* a block seated on an arrow that has no output says why the arrow has none, in the arrow's own sentence; and a note that is another error's code is said in words */
  const on = n.error.code === 'seat' && b.seat ? findIn(g).arrows.get(b.seat) : null;
  if (on && on.error) return 'The arrow it is seated on has no output: ' + inWords(on.error);
  return WHY[n.error.code](CODES.includes(n.error.note) ? inWords({ code: n.error.note, note: '' }) : n.error.note);
}
/* a block's entries: what the evaluator says its node comes to, exactly (what is drawn of them is laidOf's). plain: the variable's own way round, whatever this use is */
function valuesOf(b, depth = 0, plain = false){
  if (isArrow(b)) return new Map();            /* an arrow has no entries: its output has */
  if (typedOnly(b)) return own(b, plain);          /* numbers typed into it and nothing else: there is nothing to work out, and no graph is needed to say so */
  return evaluated(b, plain) || held(b, depth, plain);
}
/* whether a block's value is simply the numbers typed into it: nothing else defines its variable (no measure, part,
   index, seat, function's input, fusing, source, or anything in its definition space) and none of its entries is a formula */
function typedOnly(b){
  if (b.members || b.source || b.from || b.seat || b.in) return false;
  if (kin.has(b)) for (const k of kin.get(b)) if (k.from || k.seat || k.in) return false;
  const def = spaceOf.get(b); if (def && def.blocks.some(k => !isOff(k) && !inConfig(k, def))) return false;
  for (const v of b.values.values()) if (isFormula(v)) return false;
  /* a block of a tile that has a step is its state: in a later cell it holds what the step made of the cell before, which is the graph's to say */
  for (const k of [b, ...(kin.get(b) || [])]){ const s = spaceWith(k), g = s ? tileOf(k, s) : undefined; if (g !== undefined && s.repeats.get(g)?.step) return false; }
  return true;
}
/* What a block holds, for one the graph gives no value: a block that takes no part, or a variable with an error,
   which keeps its entries. Its own entries (a formula's worked out by expression.js), a measure, a part of
   another shape, or the shapes standing in its matrix: nothing here is arithmetic. */
function held(b, depth = 0, plain = false){
  if (givenOf(b) || seatedOf(b)) return new Map();      /* a function's input, or a seated block: its value is the graph's or nothing */
  if (measures(b)){ const v = derived(b); return new Map(v === null ? [] : [['1,1', v]]); }      /* a side length of another shape: whatever that is now */
  const ix = indexedOf(b); if (ix) return indexMatrix(ix);      /* the index of the block whose definition this is in, as a matrix */
  const part = rangedOf(b);                    /* a part of another shape: that shape's entries there, whatever they are now */
  if (part) return depth < 8 ? rangeValues(part, depth, turned(b) && !plain) : new Map();
  const taken = takenOf(b);                    /* one entry of a shape that holds inner data, taken out: what that entry holds, whatever it is now */
  if (taken){ const src = depth < 8 ? sourceOf(taken) : null; if (!src) return new Map();
    const got = nesting.opened(valuesOf(src, depth + 1), [[taken.from.entry.col, taken.from.entry.row]], dataOf(src).length); return turned(b) && !plain ? flipped(got) : got; }
  const stood = depth < 8 && standingOf(b), u = view.unit;
  if (!stood || stood.reduce((sum, t) => sum + t.w * t.h, 0) !== Math.round(b.rect.w / u) * Math.round(b.rect.h / u)){
    return own(b, plain); }
  const all = new Map(), using = useNow; useNow = b;
  try { if (cellOf(b)) for (const t of stood) for (const [k, v] of valuesOf(t.block, depth + 1)) all.set((t.x + 1) + ',' + (t.y + 1) + ',' + k, v);      /* each stands for one entry: its matrix is what the entry holds */
    else for (const t of stood) for (const [k, v] of valuesOf(t.block, depth + 1)){ const [c, r, ...ks] = k.split(',').map(Number); if (c <= t.w && r <= t.h) all.set((c + t.x) + ',' + (r + t.y) + (ks.length ? ',' + ks.join(',') : ''), v); } }
  finally { useNow = using; }
  return all;
}
function matrixAt(x, y){
  const hit = el => { const r = el?.getBoundingClientRect(); return r && x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6; };
  if (space.owner){ const el = space.definition?.el.querySelector('.promised'); return hit(el) ? { block: space.owner, el } : null; }
  const r = results.find(r => r.el.isConnected && !r.el.hidden && r.piece?.blocks.length === 1 && hit(r.el.querySelector('.result-body.matrix')));
  return r ? { block: r.piece.blocks[0], el: r.el.querySelector('.result-body') } : null;
}
function slotIn(a, v, cx, cy){                    /* cx, cy: where in the matrix the pointer was, in entries from its top-left corner */
  const u = view.unit, home = a === space.owner ? space.parent : space, cols = Math.round(a.rect.w / u), rows = Math.round(a.rect.h / u), data = dataOf(a), cell = cellOf(a);
  /* where the entries hold inner data a shape stands for one entry, and is the size of what an entry holds: its place is counted in entries, one each way */
  if (data.length === 1) return hud.say(`Snap to matrix: an entry of ${bare(a.name)} holds a vector of ${data[0].length}, and a shape stands only for an entry that holds a matrix. Give it a second data dimension`);
  if (cell && (v.rect.w !== cell.cols * u || v.rect.h !== cell.rows * u || !innerAgree(cell.inner, dataOf(v), true).ok))
    return hud.say(`Snap to matrix: an entry of ${bare(a.name)} holds ${nesting.described(1, 1, data).replace('single entry holding ', '')}, and ${bare(v.name)} is ${Math.round(v.rect.w / u)} × ${Math.round(v.rect.h / u)}${dataOf(v).length ? ' of ' + nesting.measured(dataOf(v)) : ''}`);
  const w = cell ? 1 : Math.round(v.rect.w / u), h = cell ? 1 : Math.round(v.rect.h / u);
  if (rangedOf(a)) return hud.say(`${bare(a.name)} is part of ${partOf(a)}: change it there`);      /* its entries are its source's */
  if (isArrow(a) || givenOf(a) || seatedOf(a)) return hud.say(isArrow(a) ? 'An arrow\'s output is what its function comes to: nothing stands in it' : `${bare(a.name)} ${givenOf(a) ? 'is the function\'s input' : 'is seated'}: its entries are not its own`);
  if ([...kinOf(a)].includes(v)) return hud.say('A shape cannot go into its own matrix');
  if (orderOf(v)) v = originOf(v);             /* what stands there is the variable its own way round */
  if (holds(a.source, bare(a.name)).refused) return hud.say(holds(a.source, bare(a.name)).refused);
  if (w > cols || h > rows) return hud.say(`Snap to matrix: ${bare(v.name)} does not fit in ${bare(a.name)}`);
  if (!spaceOf.has(a)){ const def = newSpace(a, home); for (const k of kinOf(a)) spaceOf.set(k, def); }
  if (!spaceOf.has(v)){ const def = newSpace(v, space); for (const k of kinOf(v)) spaceOf.set(k, def); }
  const def = spaceOf.get(a), vdef = spaceOf.get(v), family = [...kinOf(v)];      /* v's definition and uses, noted now: v may itself be among what is taken out below */
  if (def === vdef) return hud.say('A shape cannot go into its own matrix');
  if (loops(v, def)) return hud.say(`${bare(a.name)} is inside ${bare(v.name)}'s definition: ${bare(v.name)} cannot go into ${bare(a.name)}'s matrix`);
  const out = b => { b.el.remove(); def.blocks.splice(def.blocks.indexOf(b), 1); def.groupOf.delete(b); forget(b, vdef); };
  let stood = standingOf(a);
  if (!stood){ for (const b of [...def.blocks]) out(b); stood = [];      /* the first shape in: whatever was in its definition goes */
    def.groupUp.clear(); def.groupNames.clear(); def.repeats.clear(); for (const f of def.frames.values()) f.el.remove(); def.frames.clear(); for (const t of def.tiles.values()){ t.el.remove(); t.overEl.remove(); } def.tiles.clear(); }
  /* where it was dropped; if that is taken, the nearest free place; if there is none, it takes the place of what is there */
  const wantX = Math.max(0, Math.min(cols - w, Math.round(cx - w / 2))), wantY = Math.max(0, Math.min(rows - h, Math.round(cy - h / 2)));
  const over = (X, Y) => stood.filter(t => X < t.x + t.w && t.x < X + w && Y < t.y + t.h && t.y < Y + h);
  let best = null;
  for (let X = 0; X <= cols - w; X++) for (let Y = 0; Y <= rows - h; Y++) if (!over(X, Y).length){ const d = Math.abs(X - wantX) + Math.abs(Y - wantY); if (!best || d < best[2]) best = [X, Y, d]; }
  const [X, Y] = best || [wantX, wantY];
  for (const t of over(X, Y)) out(t.block);
  pruneOps();                                  /* what was cut in the definition went with it */
  const slot = slotOf(a), use = makeBlock({ ...v.shape }, { x: slot.x + X * (cell ? cell.cols : 1) * u, y: slot.y + Y * (cell ? cell.rows : 1) * u, w: v.rect.w, h: v.rect.h }, v.name);
  use.sides = { ...v.sides }; use.values = v.values; use.inner = v.inner; if (v.source) use.source = v.source; use.turn(v.t); use.standing = true; if (v.members) use.members = v.members; spaceOf.set(use, vdef);      /* v's definition, kept through the clearing (forget's held) though v itself may have gone with what the definition held */
  use.ref = true;
  if (v.from?.index) use.from = fromOf(v.from);      /* an index matrix stands there as itself: the one it was made from went with what the definition held */
  else { const set = new Set(family.filter(k => spaceOf.get(k) === vdef)); set.add(use); if (set.size > 1) for (const k of set) kin.set(k, set); use.attrs = attrsOf(v); }      /* the uses still there: v is not one of them if it was in the definition that has just been cleared */
  def.blocks.push(use); if (def === space) view.world.append(use.el);
  select([]); shown();
  const left = cols * rows - (standingOf(a) || []).reduce((sum, t) => sum + t.w * t.h, 0);
  hud.say(left ? `Snap to matrix: ${bare(v.name)} stands in ${bare(a.name)}, ${left} ${left === 1 ? 'entry' : 'entries'} still open` : `Snap to matrix: ${bare(a.name)} is covered, and its entries are now those of the shapes standing in it`);
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
      if (item.kind === 'index') return openField.write(item.name);      /* the index goes in by its name: it is the place of whatever entry the formula is in */
      if (item.kind === 'length' && item.of) return openField.insert({ id: item.of, measure: item.side || 'x', name: null });
      const whole = item.kind === 'shape' ? wholeOf(variableOf(item.block), !!openField.matrices) : { refused: 'only a variable or one of its measures can go into a formula' };
      return whole.refused ? hud.say(`${item.name}: ${whole.refused}`) : openField.insert(whole.capsule); }
    /* the index of a block in a tile: into that block's own definition space, as a matrix, on the canvas or standing in the definition's matrix */
    if (item.kind === 'index'){ const mine = space.owner && [...kinOf(space.owner)].some(k => k.id === item.of), of = blockOf(item.of);
      if (!mine) return hud.say(`${item.name} is the place of ${of ? bare(of.name) : 'a block'} in its tile: type it in an entry's formula, or drag it into ${of ? bare(of.name) + "'s" : 'that block\'s'} definition space`);
      return bus.send('index.add', { of: item.of, axis: item.axis, at, stand: !!matrixAt(x, y) }); }
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
    if (target && !isInteger(item.units)) return hud.say(`${item.name} is ${item.label}, not a whole number: it cannot be a side's length`);      /* only whole numbers are side lengths */
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
const autoSide = (b, dim) => { if (!isNamed(b) || isArrow(b)) return null; const order = orderOf(b), name = bare(b.name).trim().slice(0, 10);
  if (order){ const axis = order[dim === 'w' ? 0 : 1]; return axis === 0 ? name + '.x' : axis === 1 ? name + '.y' : null; }      /* a turned use: only where the side is its variable's width or height */
  return name + ((dim === 'w') !== turned(b) ? '.x' : '.y'); };
/* a named scalar has a third measure beside its two sides: its mass, the number it holds, called
   by the shape's name with .mass. ('m' stands for it wherever 'w' and 'h' stand for the sides.) */
/* a block that reads a data file is the file's size (sources.js: sizable): why its size cannot be changed, or null
   where it can. A shape fused from such a block is held by it too: pulled, it would pull the block. */
const fileHeld = b => { const can = sourceSizable(b.source, bare(b.name)); return can.refused || (b.members || []).map(m => fileHeld(m.block)).find(Boolean) || null; };
const single = b => !b.members && !isArrow(b) && b.rect.w === view.unit && b.rect.h === view.unit && !dataOf(b).length;      /* a scalar: one number and nothing else. A one by one block that holds inner data (a part cut down to one entry) is no scalar */
/* ---- inner data ----
   Each entry of a shape may itself be an array (inner.js): the shape then has inner axes, block.inner, a list of
   { length, name }, the same for every use of its variable (the uses share the one list, as they share their
   entries), and its entries' keys go on past column and row, "column,row,k1,…". They are set in the properties
   panel: how many (data dimensions), and each one's length and name. dataOf(b) is what b's entries hold: its own
   axes, but for a shape whose value is another's, which holds what that gives it: a part holds what its source
   holds, an entry taken out what is left of its source's axes after the first two, a fused shape what its parts
   hold, a seated block what the output it sits on holds, and a measure or an index one number. */
function dataOf(b, depth = 0){
  if (!b || isArrow(b) || depth > 8) return NO_DATA;
  const as = asTurned(b); if (as) return as.slice(2);      /* a turned use: what is left of its variable's axes after the two it draws */
  if (b.members) return b.members.length ? dataOf(b.members[0].block, depth + 1) : NO_DATA;
  const part = rangedOf(b); if (part){ const src = sourceOf(part); return src && src !== b ? dataOf(src, depth + 1) : NO_DATA; }
  const taken = takenOf(b); if (taken){ const src = sourceOf(taken); return src && src !== b ? nesting.entryType(dataOf(src, depth + 1)).inner : NO_DATA; }
  if (b.from || (kin.has(b) && [...kin.get(b)].some(k => k.from))) return NO_DATA;      /* a measure, or an index: numbers */
  const seat = seatedOf(b); if (seat){ const s = spaceWith(seat); if (!s) return NO_DATA;
    if (typeof seat.seat !== 'string'){ const h = hollowOf(seat.seat.hollow, s); return (h && h.type.inner) || NO_DATA; }
    const a = s.blocks.find(k => k.id === seat.seat && isArrow(k)), o = a && outputOf(a); return (o && o.type && o.type.inner) || NO_DATA; }
  return b.inner || NO_DATA;
}
const NO_DATA = Object.freeze([]);
/* whether giving b that size by hand would make a one by one shape that holds inner data, which exists only as a result */
const madeOne = (b, w, h) => w === view.unit && h === view.unit && !(b.rect.w === view.unit && b.rect.h === view.unit) && !isArrow(b) && dataOf(b).length > 0 && !rangedOf(b) && !takenOf(b) && !seatedOf(b) && !givenOf(b) && !orderOf(b);
/* ---- turning ----
   A use of a variable that holds inner data can be turned: block.axes is an order of all the variable's axes (its
   columns 0, its rows 1, then its inner axes), and the use draws the first two and holds the rest (inner.js). Its
   entries stay the variable's and are read in that order, as a transpose's are read turned; its size and its sides'
   names are worked out from the variable's each time the screen is brought up to date (follow), so nothing is
   typed on them. Only a reference is turned: the shape a variable was made as keeps the variable's own way round,
   since its rectangle is where the variable's two drawn lengths are kept. An order that only swaps columns and
   rows is a transpose and is kept as one (T), and one that moves nothing is none. */
const variableAxes = b => { const o = originOf(b), u = view.unit, w = { length: Math.round(o.rect.w / u), name: o.sides.w || null }, h = { length: Math.round(o.rect.h / u), name: o.sides.h || null };
  return [...(turned(o) ? [h, w] : [w, h]), ...(o.inner || [])]; };
const orderOf = b => b && b.axes && b.ref && !b.members && originOf(b) !== b ? nesting.ordered(b.axes, (originOf(b).inner || []).length) : null;
const asTurned = b => { const order = orderOf(b); return order ? nesting.turnedAxes(variableAxes(b), order) : null; };
/* the order a use has now, turned or not: for the panel's list, and for what a drag or T makes of it */
const orderNow = b => orderOf(b) || (all => turned(b) && !b.members ? [1, 0, ...all.slice(2)] : all)(variableAxes(b).map((_, i) => i));
/* gives a use that order: none, a transpose, or a turn; and the size and side names that go with it */
function setOrder(b, order){
  const all = variableAxes(b), kind = nesting.plainly(order, all.length - 2), u = view.unit; if (!kind) return false;
  b.axes = kind === 'turned' ? [...order] : null; b.turn(kind === 'transposed');
  const as = nesting.turnedAxes(all, order); b.set({ ...b.rect, w: as[0].length * u, h: as[1].length * u }); b.sides = { w: as[0].name, h: as[1].name };
  return true;
}
const turnableNow = b => nesting.turnable({ name: bare(b.name), origin: originOf(b) === b || !b.ref, inner: (originOf(b).inner || []).length, arrow: isArrow(b), input: !!givenOf(b), part: !!rangedOf(b), entry: !!takenOf(b), measure: measures(b) || !!indexedOf(b), seated: !!seatedOf(b), fused: !!b.members, standing: !!b.standing });
/* the block that is an entry taken out of another: b itself, or, for another use of one that was named, that one */
const takenOf = b => b.from?.entry ? b : kin.has(b) ? [...kin.get(b)].find(k => k.from?.entry) || null : null;
/* a block's axes that are its own to set, with their names: what a named length reaches (see "named sides") */
const axesOf = b => isArrow(b) || b.members || b.from || b.seat || b.in || orderOf(b) ? NO_DATA : b.inner || NO_DATA;      /* (a turned use's are its variable's: they are reached through the shape it was made as) */
/* a length along dim: 'w' or 'h' a side of the block's rectangle; 'k0', 'k1', … an inner axis, as many units as it is long */
const lenOf = (b, dim) => dim[0] === 'k' ? (axesOf(b)[+dim.slice(1)]?.length ?? 1) * view.unit : b.rect[dim];
const setLen = (b, dim, length) => { if (dim[0] !== 'k') return b.set({ ...b.rect, [dim]: length }); const a = axesOf(b)[+dim.slice(1)]; if (a) a.length = Math.round(length / view.unit); };
const massName = b => isNamed(b) && single(b) ? bare(b.name).trim().slice(0, 10) + '.mass' : null;      /* whether or not it has been given a number yet */
/* a named scalar not yet given a number: its mass is still a symbol, written as its one entry is in its definition
   (the name's initials and the entry's number: k₁), and its sides are the root of that */
const unset = b => isNamed(b) && single(b) && scalarOf(b) === null;
const symbolOf = b => initials(b.name) + '₁';
const sideName = (b, dim) => dim === 'm' ? massName(b) : dim[0] === 'k' ? axesOf(b)[+dim.slice(1)]?.name || null : b.sides[dim] || autoSide(b, dim);
/* a space's blocks with those a cut or an intersection took off its canvas and keeps: a kept block's named sides are
   still that name's length, and follow it, so that the shapes made of the block do */
const withKept = s => s.ops.length ? [...s.blocks, ...s.ops.flatMap(o => o.sources)] : s.blocks;
const uses = (s, name) => withKept(s).some(b => sideName(b, 'w') === name || sideName(b, 'h') === name || massName(b) === name || axesOf(b).some(a => a.name === name));
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
  for (const t of everySpace()) if (uses(t, name) && homeOf(name, t) === home) for (const b of withKept(t)){ for (const dim of ['w', 'h']) if (b.sides[dim] === name) out.push([b, dim, t]); axesOf(b).forEach((a, i) => { if (a.name === name) out.push([b, 'k' + i, t]); }); }      /* and every inner axis of that name: it is that length too */
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
  const pinned = ([o, d]) => d !== 'm' && d[0] !== 'k' && (!!fileHeld(o) || (!!o.from?.range && !wholeSide(o.from.range, (d === 'w') !== turned(o) ? 'cols' : 'rows')));      /* and a side of a block that reads a file: it is as long as the file makes it */
  while (todo.length){
    const c = todo.pop(); if (done.has(c)) continue; done.add(c);
    if (isArrow(c)) continue;                  /* an arrow's rectangle is the gap it is drawn in: no size any other shape shares */
    if (orderOf(c)) continue;                  /* a turned use lies as its variable does: nothing takes its size from it */
    for (const k of kinOf(c)) if (k !== c){ const as = asTurned(k);
      if (as){ const w = as[0].length * view.unit, h = as[1].length * view.unit; k.sides = { w: as[0].name, h: as[1].name }; if (k.rect.w !== w || k.rect.h !== h){ k.set({ ...k.rect, w, h }); todo.push(k); } continue; }      /* a turned use: the two axes it draws */
      const over = !!k.t !== !!c.t, w = over ? c.rect.h : c.rect.w, h = over ? c.rect.w : c.rect.h;      /* a transpose of it is the other way round */
      k.sides = over ? { w: c.sides.h, h: c.sides.w } : { ...c.sides }; if (k.rect.w !== w || k.rect.h !== h){ k.set({ ...k.rect, w, h }); todo.push(k); } }      /* one variable, one size */
    const s = everySpace().find(s => withKept(s).includes(c)); if (!s) continue;
    for (const dim of ['w', 'h', 'm', ...axesOf(c).map((_, i) => 'k' + i)]) if (sideName(c, dim)){ const group = sidesCalled(sideName(c, dim), s), boss = group.find(([o, d]) => d[0] !== 'k' && rootSide(o) !== null) || group.find(pinned);      /* a single entry's number settles the length: it is not resized to suit the others. So does a part's shortened side */
      if (boss && pinned(boss) && c !== boss[0] && lenOf(c, dim) !== boss[0].rect[boss[1]]) hud.say(`${sideName(c, dim)} stays ${Math.round(boss[0].rect[boss[1]] / view.unit)}u: ${bare(boss[0].name)} carries that name and ${fileHeld(boss[0]) ? 'reads a data file, so its size is the file\'s' : `is part of ${partOf(boss[0])}, so its size cannot change`}`);
      const length = boss ? sideLength(boss[0], boss[1]) : lenOf(c, dim);
      if (!boss && dim === 'm') continue;
      if (length === null){      /* the entry's side is not a whole number now: no side can be that long, so the sides that carried its name let go of it and stay as they are */
        for (const [o, d] of group) if (d[0] === 'k'){ const a = axesOf(o)[+d.slice(1)]; if (a && a.name){ hud.say(`${a.name} is not a whole number now: ${bare(o.name)} no longer follows it`); a.name = null; } }
          else if (rootSide(o) === null && o.sides[d]){ hud.say(`${o.sides[d]} is not a whole number now: ${bare(o.name)} no longer follows it`); o.sides[d] = null; }
        continue; }
      for (const [o, d] of group) if ((d[0] === 'k' || (rootSide(o) === null && !unset(o))) && lenOf(o, d) !== length){
        if (d[0] !== 'k' && fileHeld(o)){ hud.say(`${o.sides[d]} is ${Math.round(length / view.unit)}u, and ${bare(o.name)} is the size of its file: it no longer follows ${o.sides[d]}`); o.sides[d] = null; continue; }      /* another length than its file's: it lets go of the name, and stays */
        if (d[0] !== 'k' && madeOne(o, d === 'w' ? length : o.rect.w, d === 'h' ? length : o.rect.h)){ hud.say(`${o.sides[d]} is 1 now, and ${bare(o.name)} holds inner data, so it cannot be one by one: it no longer follows ${o.sides[d]}`); o.sides[d] = null; continue; }      /* a named length that comes to 1 */
        setLen(o, d, length); done.delete(o); todo.push(o); } }
  }
}
/* Runs change(), then puts back together whatever it pulled apart: blocks that were touching side by side, in any
   space, still touch afterwards, the right-hand one moving to stay against the left-hand one. A length that changes
   would otherwise leave products overlapping or gapped. except(left, right) can name pairs to leave alone. */
function keepTouching(change, except = () => false){
  const u = view.unit, pairs = [];
  for (const s of everySpace()){
    const live = s.blocks.filter(b => !isOff(b) && !isArrow(b) && !hollowSeat(b)), rects = live.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u, zone: zoneOf(tilesOf(b, s)), inner: dataOf(b) }));
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
  if (orderOf(b)) return hud.say(`${bare(b.name)} is turned here: its sides are its variable's axes. Change them on the shape it was made as`);
  if (b.seat && /\d\s*u?$/i.test(text)) return hud.say(`${bare(b.name)} is seated: its size is the output's`);
  if (b.from?.index && /\d\s*u?$/i.test(text)) return hud.say(`${bare(b.name)} is the index of its block: it is that block's size`);
  const read = readSide(text), name = read.name; let n = read.length;      /* algebra.js: a number is a length only apart from the name, so "d2" is a name */
  if (unnameable(name)) return;
  if (n === undefined){ hud.say(`${String(text).trim()}: only a whole number can be a side's length`); return; }      /* never rounded: nothing changes */
  /* a part of another shape is the size of that part: a length typed on it is not taken, nor a name that is another length already */
  if (rangedOf(b)){ const has = name && name !== '-' && name !== autoSide(b, dim) ? lengthCalled(name, space, b) : undefined;
    if ((n !== null && n * view.unit !== b.rect[dim]) || (has !== undefined && has !== b.rect[dim])){ hud.say(`${bare(b.name)} is part of ${partOf(b)}: its size is that part's`); if (has !== undefined && has !== b.rect[dim]) return; }
    n = null; }
  /* a block that reads a file is the file's size: a length typed on it is not taken, nor a name that is another length already */
  if (fileHeld(b)){ const has = name && name !== '-' && name !== autoSide(b, dim) ? lengthCalled(name, space, b) : undefined;
    if ((n !== null && n * view.unit !== b.rect[dim]) || (has !== undefined && has !== b.rect[dim])){ hud.say(fileHeld(b)); return; }
    n = null; }
  /* a named scalar stays a scalar: a length given to its side is the root of its number, so the number becomes the
     length squared, and the block keeps its one square */
  const single = isNamed(b) && !b.members && b.rect.w === view.unit && b.rect.h === view.unit && !dataOf(b).length;
  if (takenOf(b) && /\d\s*u?$/i.test(text)) return hud.say(`${bare(b.name)} is an entry of ${partOf(b)}: its size is that entry's`);
  if (single && measures(b)){ hud.say(`${bare(b.name)} is a measure of another shape: change it there`); return; }
  if (single && b.source && n !== null){ hud.say(`${bare(b.name)} is a source: a length typed on a single entry sets its number, and a source's is not typed. Pull it larger by an edge`); return; }
  const oneNow = length => madeOne(b, dim === 'w' ? length : b.rect.w, dim === 'h' ? length : b.rect.h);
  if ((n !== null && oneNow(n * view.unit)) || (n === null && name && name !== '-' && lengthCalled(name, space, b) !== undefined && oneNow(lengthCalled(name, space, b)))){ hud.say(nesting.sizable(1, 1, 1).refused); return; }      /* typed, or through a name whose length is 1 */
  const size = length => { if (single){ b.values.set('1,1', (length / view.unit) ** 2); touched(b.values); } else b.set({ ...b.rect, [dim]: length }); };
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
  return g;
}
/* takes one group apart: what was directly in it is now directly in the group that held it, or in none */
function ungroup(g, s = space){
  const up = s.groupUp.get(g);
  for (const [b, at] of s.groupOf) if (at === g) up === undefined ? s.groupOf.delete(b) : s.groupOf.set(b, up);
  for (const [c, at] of s.groupUp) if (at === g) up === undefined ? s.groupUp.delete(c) : s.groupUp.set(c, up);
  s.groupUp.delete(g); s.groupNames.delete(g); s.repeats.delete(g);      /* and it is no tile */
}
/* after blocks have left: an unnamed group with fewer than two things in it is no group, nor a named one with nothing, and a group that is gone keeps no name */
function tidy(s = space){
  for (const b of [...s.groupOf.keys()]) if (!s.blocks.includes(b)) s.groupOf.delete(b);
  for (let again = true; again;){ again = false;
    const ids = new Set([...s.groupOf.values(), ...s.groupUp.keys(), ...s.groupUp.values()]);
    for (const g of ids){ const holds = [...s.groupOf.values()].filter(at => at === g).length + [...s.groupUp.values()].filter(at => at === g).length;
      if (holds < 1 && !s.repeats.has(g) && !sidesIn(s).includes(g)){ ungroup(g, s); again = true; break; } } }      /* a frame may hold a single thing; an empty one is no frame, unless it is a tile, whose pattern may be blank, or a side of a condition, which is then None */
  const live = new Set([...s.groupOf.values(), ...s.groupUp.values(), ...s.repeats.keys(), ...sidesIn(s)]);
  for (const id of [...s.groupNames.keys()]) if (!live.has(id)) s.groupNames.delete(id);
  unstep(s);
}
/* a tile whose step is no longer an arrow that reads it from the east, or whose stop block is no longer a block of
   its pattern, has none: the arrow or the block was deleted, turned to another side, or taken out of the tile */
function unstep(s = space){
  let gone = 0;
  for (const [g, r] of s.repeats){
    if (r.step){ const a = s.blocks.find(k => k.id === r.step); if (!a || !isArrow(a) || a.arrow.input.as !== 'tile' || a.arrow.input.id !== g || a.arrow.side !== 'e'){ delete r.step; gone++; } }
    if (r.until){ const b = s.blocks.find(k => k.id === r.until); if (!b || isArrow(b) || tileOf(b, s) !== g){ delete r.until; gone++; } } }
  return gone;
}
/* how many levels of named groups sit strictly inside these blocks' frame: 0 if none */
const framesIn = s => new Set([...s.groupOf.values(), ...s.groupUp.keys(), ...s.groupUp.values(), ...s.repeats.keys(), ...sidesIn(s)]);      /* every frame of a space, by id: a tile that holds nothing is still one, and so is a side of a condition */
/* The two sides of a condition. A conditional arrow's function carries choose: { then, else }, the ids of two frames of
   its definition space (arrows.js: Conditions). Those two frames stay, empty or not, for as long as they have their
   names (true and false, given when they are made, and never changed): a side that holds nothing is None. conditionIn:
   the choose of the arrow a space is the definition space of, or null; sidesIn: its two frames, those that are there. */
const conditionIn = s => (s.owner && s.owner.arrow && s.owner.fn && s.owner.fn.choose) || null;
const sidesIn = s => { const c = conditionIn(s); return c ? [c.then, c.else].filter(g => s.groupNames.has(g)) : []; };
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
const scalarOf = b => { const u = view.unit; if (b.members || isArrow(b) || b.rect.w !== u || b.rect.h !== u || dataOf(b).length) return null; const v = valuesOf(b).get('1,1'); return v === undefined ? null : v; };      /* a value of any kind; null for none yet */
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
  if (dim === 'm'){ const v = scalarOf(b); return isInteger(v) && v >= 1 ? v * view.unit : null; } if (dim[0] === 'k') return lenOf(b, dim); const r = rootSide(b); return r === null ? b.rect[dim] : isInteger(r) && r >= 1 ? r * view.unit : null; };
/* ---- attributes ----
   Everything a variable has, together, as the properties panel shows it: the lengths of its two sides (x and y),
   a scalar's mass (the number it holds), and whatever attributes have been added to it by hand. Each has a value
   that can be typed over. An added attribute has a name of the user's choosing and a value that is a number or
   arithmetic (expression.js, which hands the working out to a maths solver), in which the variable's other attributes can be used by name: x, y, mass, and the
   added ones. Added attributes belong to the variable: every reference to it has the same ones. */
const attrsOf = b => (b.attrs ||= []);
/* ---- number spaces: what a shape promises to hold (spaces.js) ----
   A promise is the variable's, as its attributes are: it is kept on the list of them (attrs.holds), which every use
   of the variable shares, so that every reference promises the same. "integer?", or nothing. */
const holdsOf = b => attrsOf(b).holds || null;
/* the row of the panel that says what a block holds: its promise, or what it is worked out as; and where a promise
   is broken by a value or cannot be shown to be kept, the sentence (evaluate.js: promiseOf) */
function holdsRow(b, key = 'holds', label = 'Holds'){
  return steadily(() => { const g = graphNow(), holds = holdsOf(b), use = g.blocks[b.id]; let id = use, n = id && g.nodes[id]; if (n && n.op === 'transpose'){ id = n.inputs[0]; n = g.nodes[id]; }
    /* the sentence names the entry as it is drawn on the use being looked at: a transposed use's columns are the variable's rows, and one turned through its inner axes has its own */
    const here = note => note && use !== id ? seenFrom(g, use, { code: 'type', note, node: id }) : note;
    if (!n || n.op === 'param') return { key, label, holds, inferred: n && !holds ? 'any?' : null, from: n ? 'whatever it is given' : '', note: null };
    const binding = bindingOf([b], spaceWith(b)), p = promiseOf(g, id, { binding }), bare = n.defined === 'entries' && !Object.keys(n.entries).length;
    /* where its numbers are the backend's, the backend holds them to the promise, and what it found is this row's to say */
    const far = holds && p && p.state !== 'broken' ? [[use, binding], [use, null], [id, binding], [id, null]].find(([node, at]) => { const c = backend.broke(g, node, at); return c && c.node === id; }) : null;
    if (far) return { key, label, holds, inferred: null, from: '', note: here(backend.problem(g, far[0], far[1])) };
    return { key, label, holds, inferred: !p || bare ? null : p.inferred, from: bare ? '' : n.defined === 'entries' ? 'from its entries' : n.defined === 'seat' ? 'from the arrow' : n.defined === 'source' ? 'from its source' : 'from what defines it', note: p && p.note ? (p.state === 'broken' ? here(p.note) : p.note) : holds ? here(brokenInTile(b, g, id)) : null }; });
}
/* a block of a tile holds its promise in every cell, not the first alone: the tile's matrix is every cell worked
   out, so where that has no value because this block breaks its promise in some cell, the sentence (which names
   the cell) is this block's to show. The outermost tile's matrix, which has every cell of the tiles inside it. */
function brokenInTile(b, g, id){
  const s = spaceWith(b), t = s ? tileOf(b, s) : undefined; if (t === undefined) return null;
  const top = [t, ...tilesAbove(s, t)].pop(), node = findIn(g).tiles.get('t:' + top)?.node, a = node ? workOut(g, node) : null;
  return a && a.error && a.error.code === 'type' && a.error.node === id ? a.error.note : null;
}
/* and an arrow's two: what it takes is the promise of its function's in block, held against what the arrow gives it
   (what it takes of its input, a run at a time where it is repeated in a tile: evaluate.js, judged);
   what it gives is the promise of the block seated on its output. With no block seated there is nothing to hold
   that promise, and the row says only what the output is worked out as. */
function arrowHolds(a){
  return steadily(() => { const g = graphNow(), s = spaceWith(a), e = findIn(g).arrows.get(a.id), out = e && e.node, n = out && g.nodes[out], inner = inOf(a), seat = seatOn(a, s);
    const given = n ? (n.op === 'apply' || n.op === 'map' || n.op === 'mapalong' ? n.inputs[0] : out) : null, binding = n ? bindingOf(readBy(a, s), s, false, a) : null;
    const runs = n && n.op === 'mapalong' ? { axis: n.axis, start: n.start, span: n.span, count: n.count } : null;      /* repeated in a tile: it takes its input a run at a time, and no more of it than its runs cover */
    const took = given ? judged(g, given, inner ? holdsOf(inner) : null, 'in', { ...(binding ? { binding } : {}), ...(runs ? { runs } : {}) }) : null;
    return [{ key: 'takes', label: 'Takes', holds: inner ? holdsOf(inner) : null, inferred: took ? took.inferred : null, from: took ? 'from its input' : '', note: took && took.note ? took.note : null, fixed: !inner },
      seat ? holdsRow(seat, 'gives', 'Gives') : { key: 'gives', label: 'Gives', holds: null, inferred: n ? n.type.value || null : null, from: n ? 'from the arrow' : '', hint: n ? 'Seat a block on its output to promise what it gives' : null, note: null, fixed: true }]; });
}
/* the in block of an arrow's function: in its own definition space, or in that of the arrow its function is shared with */
const inOf = a => { for (const k of [a, ...(kin.get(a) || [])]){ const def = spaceOf.get(k), inner = def && def.blocks.find(x => x.in); if (inner) return inner; } return null; };
/* what an attribute comes to: a value of any kind, null where nothing is typed */
const attrValue = (b, a) => working(originOf(b).id + ' a ' + a.name.trim().toLowerCase(), () => evaluate(a.text, lookupFor(b)).value ?? null);
/* one measure of a variable as a value: its width or height (x, y) the variable's own way round, a scalar's mass
   (m), or an attribute (a, by name). null where it has no value yet (a named scalar not given a number: its mass and
   its sides are still symbols); undefined for an attribute it has not got. */
function measured(b, measure, name){
  if (measure === 'g') return isArrow(b) ? b.arrow.gap : { err: 'not an arrow: it has no gap' };
  if (measure === 'm') return single(b) ? scalarOf(b) : { err: 'not a scalar: it has no mass' };
  if (/^d[1-6]$/.test(measure)){ const a = dataOf(b)[+measure[1] - 1]; return a ? a.length : { err: dataOf(b).length ? `it has no inner axis ${measure[1]}` : 'it holds no inner data' }; }      /* the length of an inner axis */
  if (measure === 'a'){ const key = String(name).trim().toLowerCase(), a = attrsOf(b).find(a => a.name.trim().toLowerCase() === key); return a ? attrValue(b, a) : undefined; }
  if (single(b)){ const v = scalarOf(b); if (v === null || isError(v)) return v; const r = rootSide(b); return r !== null ? r : { err: 'it has no root to be a side' }; }      /* a scalar's side is the root of its mass, and where that has no root it has none */
  return Math.round(((measure === 'x') !== turned(b) ? b.rect.w : b.rect.h) / view.unit);
}
/* what a name or a capsule in one of b's formulas stands for (expression.js: evaluate's lookup). A capsule names a
   measure of any variable, by its block's id. A bare name is one of b's own: x, y, mass, or an attribute it was given. */
function lookupFor(b, at = null){      /* at: the entry the formula is in, { c, r }, for the index; arrows.js hands an arrow's own with each name */
  const mine = bare(b.name).trim().slice(0, 10).toLowerCase() + '.';
  return (token, place = null) => {
    const axis = typeof token === 'string' ? tiles.axisOf(token) : null;
    if (axis){ const i = indexFor(b, place || at); return i ? i[axis] : tiles.NO_INDEX; }      /* index.x, index.y: this entry's place across its whole tile (tiles.js) */
    const kn = typeof token === 'string' ? token.match(/^k([1-6])$/i) : null;      /* k1, k2, …: the inner position of the entry the formula is in (an attribute of that name, where the shape has one, is still the attribute) */
    if (kn && isArrow(b)) return null;         /* in an arrow's formula it is the position being worked out: not known here */
    if (kn && !attrsOf(b).some(a => a.name.trim().toLowerCase() === token.toLowerCase())){ const ks = (place || at)?.ks || []; return +kn[1] <= ks.length ? ks[+kn[1] - 1] : { err: ks.length ? `there is no inner axis ${kn[1]}: it has ${ks.length}` : 'no inner data: there is no ' + token.toLowerCase() }; }
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
const variableOf = b => ({ id: originOf(b).id, name: bare(b.name).trim(), color: b.shape.color, scalar: single(b), inner: dataOf(b).length, attributes: attrsOf(b).map(a => a.name.trim()).filter(Boolean) });
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
  /* what its entries hold: how many data dimensions, then each inner axis's length (called by its name where it has one) and its name */
  const data = dataOf(b); fixed.push({ key: 'dims', label: 'data dimensions', text: String(data.length) });
  data.forEach((a, i) => fixed.push({ key: 'd' + (i + 1), label: 'd' + (i + 1), text: String(a.length) }, { key: 'n' + (i + 1), label: 'd' + (i + 1) + ' name', text: a.name || '' }));
  const made = sourceKind(b.source) === 'noise' || sourceKind(b.source) === 'file';      /* its numbers are the backend's: it has no mass to type, and none the browser knows */
  if (one && !made){ const stored = measures(b) || rangedOf(b) ? undefined : b.values.get('1,1'), text = isFormula(stored) ? stored.expr : v === null ? symbolOf(b) : isError(v) ? '' : typedText(v);      /* a formula as it was typed; not yet given a value: its symbol */
    fixed.push({ key: 'mass', label: massName(b) || 'mass', text, ...seen(text), ...told(text, isFormula(stored) || isError(v) ? v : null) }); }
  /* noise has a seed and a distribution, and nothing else */
  if (sourceKind(b.source) === 'noise') return [...fixed, { key: 'seed', label: 'seed', text: String(b.source.noise.seed) }, { key: 'dist', label: 'distribution', text: b.source.noise.dist }];
  if (sourceKind(b.source) === 'file') return fixed;
  return [...fixed, ...attrsOf(b).map((a, i) => ({ key: 'a' + i, custom: true, label: a.name, text: a.text, ...seen(a.text), ...told(a.text, attrValue(b, a)) }))];
}
/* the block an entry of the selected shape's matrix really belongs to, and its key there */
const entryOfSelected = key => { const b = [...selected][0], order = b ? orderOf(b) : null; if (order) return key.split(',').length === order.length ? [b, nesting.toVariable(key, order)] : null;      /* a turned use: the entry's own key in its variable */
  const [c, r, ...ks] = key.split(',').map(Number), home = b ? entryHome(b, c, r) : null; return home ? [home[0], home[1] + (ks.length ? ',' + ks.join(',') : '')] : null; };      /* an inner position goes with its entry */
const properties = createProperties({ ...fields,
  onAction: key => { const b = [...selected][0]; if (key === 'file' && b) chooseFile(b); },
  onName: text => { if (pickedTile) return bus.send('name', { frame: pickedTile, ids: [], name: text, color: null });
    const b = [...selected][0]; if (b) bus.send('rename', { id: b.id, name: text, color: isNamed(b) ? null : someColour() }); },
  onAdd: () => { const b = [...selected][0]; if (!b) return; properties.focus('a' + attrsOf(b).length + '.label'); bus.send('attr.add', { id: b.id }); },
  onLabel: (key, text) => { const b = [...selected][0]; if (b) bus.send('attr.set', { id: b.id, index: +key.slice(1), name: text }); },
  /* a number space chosen in the panel: a block's own promise; of an arrow, its in block's (Takes) or its seated block's (Gives) */
  onHolds: (key, holds) => { const b = [...selected][0], of = !b ? null : key === 'takes' ? inOf(b) : key === 'gives' ? seatOn(b) : b; if (of) bus.send('holds.set', { id: of.id, holds }); },
  onEntry: (key, text) => { const home = entryOfSelected(keyOpened(key)); if (home) bus.send('entry.set', { id: home[0].id, key: home[1], text: text === '' ? null : text }); },
  /* an entry that holds inner data, pressed: it is opened in the panel, one level down; the trail pressed goes back up, and dragged takes the entry out */
  onInto: (c, r) => { const b = [...selected][0]; if (!b) return; opened = { id: b.id, path: [...openPath(b), [c, r]] }; shown(); },
  onTurn: (from, to) => { const b = [...selected][0]; if (b) bus.send('turn', { id: b.id, order: nesting.moved(orderNow(b), from, to) }); },
  onUp: () => { if (opened.path.length){ opened = { id: opened.id, path: opened.path.slice(0, -1) }; shown(); } },
  onTake: (x, y) => { const b = [...selected][0], path = b ? openPath(b) : []; if (!b || !path.length) return;
    if (isArrow(b)) return hud.say('An arrow\'s output is not a block: seat a block on it, and take the entry out of that');
    if (path.length > 1) return hud.say('Only an entry of the shape itself is taken out: take the entry above this one out first, and then its entry');
    bus.send('entry.take', { id: b.id, col: path[0][0], row: path[0][1], at: view.toWorld(x, y) }); },
  /* what an entry holds, as it would be typed: its formula or its literal; for an entry that is another shape's (a measure, a part), what it shows */
  textOf: shownKey => { const key = keyOpened(shownKey), home = entryOfSelected(key); return !home ? '' : home[0].values.has(home[1]) && !home[0].members && !seatedOf(home[0]) && !givenOf(home[0]) ? typedText(home[0].values.get(home[1])) : typedText(valuesOf([...selected][0]).get(key)); },
  onValue: (key, text) => { if (pickedTile) return tileTyped(pickedTile, key, text);
    const b = [...selected][0]; if (!b) return;
    if (isArrow(b)) return arrowTyped(b, key, text);
    if (key === 'seed'){ const got = readTyped(b, text), seed = got.refused ? got : isError(got.value) ? { refused: got.value.err } : seedOf(got.value);      /* a whole number, or a formula that comes to one now */
      if (seed.refused){ hud.say(/^A seed/.test(seed.refused) ? seed.refused : `seed: ${seed.refused}`); return shown(); } return bus.send('source.set', { id: b.id, seed: seed.seed }); }
    if (key === 'dist'){ const dist = text.trim().toLowerCase(); if (!DISTS.includes(dist)){ hud.say(`A distribution is ${DISTS.join(' or ')}`); return shown(); } return bus.send('source.set', { id: b.id, dist }); }
    if (key[0] === 'a') return bus.send('attr.set', { id: b.id, index: +key.slice(1), text });
    /* the number of data dimensions: a whole number from 0 to 6, or a formula that comes to one now. It is worked out once, here, and the number kept (inner.js) */
    if (key === 'dims'){ const got = readTyped(b, text), n = got.refused ? got : nesting.counted(got.value);
      if (n.refused){ hud.say(/^The number/.test(n.refused) ? n.refused : `data dimensions: ${n.refused}`); return shown(); }
      return setDims(b, n.count); }
    /* an inner axis: its length, a whole number of at least 1 (a formula is worked out once, as a side's is); and its name */
    if (/^d[1-6]$/.test(key)){ const got = readTyped(b, text), side = got.refused ? got : sideOf(got.value);
      if (side.refused){ hud.say(`${key}: ${side.refused}`); return shown(); }
      return bus.send('inner.set', { id: b.id, index: +key[1] - 1, length: side.length }); }
    if (/^n[1-6]$/.test(key)) return bus.send('inner.set', { id: b.id, index: +key[1] - 1, name: text.trim() === '-' ? '' : text.trim() });
    /* a scalar's mass and sides take a value of any kind, or a formula. Its side is the root of its mass, so a side
       typed is a mass of that squared: a side of 3 is a mass of 9, of √2 a mass of 2. It stays one square whatever is typed. */
    if (key === 'mass') return bus.send('entry.set', { id: b.id, key: '1,1', text: text === '' ? null : text });
    if (rootSide(b) !== null || (isNamed(b) && single(b))) return bus.send('entry.set', { id: b.id, key: '1,1', text: text === '' ? null : `(${text})^2`, settle: true });
    /* any other shape is drawn on the grid: its side is a whole number of squares, at least 1 (algebra.js: sideOf).
       A formula typed there is worked out once, now, and has to come to such a number. */
    const got = readTyped(b, text), side = got.refused ? got : sideOf(got.value);
    if (side.refused){ hud.say(`${key}: ${side.refused}`); return shown(); }
    bus.send('side.set', { id: b.id, dim: key === 'x' ? 'w' : 'h', text: String(side.length) }); } });
/* ---- an entry opened ----
   An entry that holds inner data is opened in the properties panel: the panel then shows that entry's own matrix
   under a trail, "QKV › 2,1", and an entry of that which holds more is opened in its turn. opened says which
   shape and how far down: it is where the user is looking, and no part of the project. */
let opened = { id: null, path: [] };
const typeAsDrawn = b => { if (isArrow(b)){ const t = outputOf(b).type; return { cols: t?.cols || 1, rows: t?.rows || 1, colsName: t?.colsName || null, rowsName: t?.rowsName || null, inner: t?.inner || [] }; }      /* an arrow: its output */
  return { cols: Math.round(b.rect.w / view.unit), rows: Math.round(b.rect.h / view.unit), colsName: b.sides.w, rowsName: b.sides.h, inner: dataOf(b) }; };
/* how far down the selected shape is opened: the path while it still leads somewhere in the shape as it now is, else nothing */
const openPath = b => opened.id === b.id && opened.path.length && nesting.pathType(typeAsDrawn(b), opened.path) ? opened.path : [];
/* the selected shape's own key for an entry of what the panel is showing */
const keyOpened = key => { const b = [...selected][0]; return b ? nesting.keyAt(openPath(b), key, dataOf(b).length) : key; };
/* The number of data dimensions set to n: axes of length 1 are added at the end, or the last are removed. Refused
   with why for a scalar and for what something else defines (inner.js: countable). Entries past the first position
   of an axis that is removed would be lost: that is asked first. */
function setDims(b, n){
  const o = originOf(b), kind = sourceKind(b.source), can = nesting.countable({ name: bare(b.name), scalar: single(b), arrow: isArrow(b), source: kind, part: !!rangedOf(b), entry: !!takenOf(b), measure: measures(b) || !!indexedOf(b), seated: !!seatedOf(b), input: !!givenOf(b) }, n);
  if (can.refused){ hud.say(can.refused); return shown(); }
  if (b.members){ hud.say(`${bare(b.name)} is fused from other shapes: it holds what they hold`); return shown(); }
  if (orderOf(b)){ hud.say(`${bare(b.name)} is turned here: change its data dimensions on the shape it was made as`); return shown(); }
  if (n === o.inner.length) return shown();
  const lost = nesting.rekeyed(o.values, o.inner, nesting.resized(o.inner, n)).lost, send = () => bus.send('inner.count', { id: b.id, count: n });
  if (!lost) return send();
  warning.ask({ title: `Fewer data dimensions for ${bare(b.name)} loses ${lost === 1 ? 'an entry' : lost + ' entries'}`,
    note: `${lost === 1 ? 'One number that was' : lost + ' numbers that were'} typed into it ${lost === 1 ? 'lies' : 'lie'} past the first position of an axis that would be removed, and would be gone. What is at the first position is kept.`,
    head: [], rows: [], proceed: 'Remove', onProceed: send, onCancel: shown });
}
/* brings what is on screen in line with the selection and the blocks' positions. An arrow set against a written
   result is placed once that result has been written, and a block seated on it after that: so the screen is drawn,
   the arrows and seats are put in their places again (arrange), and where any moved it is drawn once more. */
function shown(){
  memo = new Map();
  try { arrangeAll(); for (let pass = 0; pass < 4; pass++){ const was = paint(); memo.clear(); if (!arrangeAll() && standingNow() === was) break; } } finally { memo = null; }
}
/* how every arrow on screen stands just now: whether it warns, and where its output is. What was drawn is drawn again where this is no longer so. */
const standingNow = () => { const list = space.blocks.filter(isArrow); return !list.length ? '' : JSON.stringify(list.map(a => { const o = outputOf(a); return [o.warn, o.place, o.type]; })); };
const outs = new Map();                        /* arrow -> its output as it is written (components/result.js) */
const arrowFrame = createBounds();             /* the frame round a selected arrow and its output */
function paint(){
  hush(); follow(); if (arrangeAll()) memo?.clear(); configure();
  for (const b of space.blocks) if (measures(b)){ const src = sourceOf(b); if (!src) continue; const name = sideName(src, dimOf(b, src));
    if (name && b.name !== name){ b.call(name); for (const k of kinOf(b)) k.call(name); } if (b.shape.color !== src.shape.color) for (const k of kinOf(b)) k.paint(src.shape.color); }
  const strays = new Set(straysIn(space));      /* in a condition's space, what lies in neither side takes no part */
  for (const b of space.blocks){ const v = scalarOf(b), f = v === null ? faceLaid(b) : null; b.face(b.source ? faceOf(b.source) : f ? f.text : v === null ? null : asText(v), f ? { decimal: true, stale: f.stale } : {});      /* a source says what it is on its face: 0, 1 or I; a number that is the backend's is marked as one */
    b.warn(isArrow(b) ? !!outputOf(b).warn || strays.has(b) : lost(b) || strays.has(b)); b.sit(!!b.seat); b.given(!!b.in); b.nest(dataOf(b).length);      /* one outline behind it for each inner axis */      /* a part its source is now too small to have is drawn in the warning colour; so is an arrow that cannot be what it says, and a block whose seat is gone */
    b.sink(sunkLaid(b));      /* truth as height: a shape that is false is drawn sunk */
    if (isArrow(b)){ b.el.classList.toggle('anon', !isNamed(b)); b.mark(fnOf(b).choose && !fnOf(b).formula ? '?' : ''); } }      /* a condition carries a small ? on its triangle */
  for (const b of space.blocks) if (b.members){ flow(b); b.join(partsOf(b, 0, 0, b.rect.w / view.unit, b.rect.h / view.unit), b.rect.w / view.unit, b.rect.h / view.unit); }
  const list = [...selected], one = list.length === 1 ? list[0] : null;
  /* in a condition's space the side that is not chosen is faded: by the truth of what the arrow the space was opened through is given. Not known, neither is */
  const cond = conditionIn(space), given = cond ? space.blocks.find(k => k.in) : null, truth = given ? truthLaid(given) : null, idle = truth === null ? null : truth ? cond.else : cond.then;
  for (const b of space.blocks){ b.select(selected.has(b)); b.dim((selected.size > 0 && !selected.has(b)) || (idle !== null && chain(b).includes(idle))); b.grips(!(list.length > 1 && selected.has(b))); }
  /* the properties of the one shape selected: its name, its shape, its value */
  if (pickedTile && space.repeats.has(pickedTile)){ const t = tileInfo(space, pickedTile), r = t.rep, typedAs = v => typeof v === 'object' ? v.expr : String(v);
    const row = k => ({ key: k, label: k, text: typedAs(r[k]), seen: refs(typedAs(r[k])).map(fields.look), result: typeof r[k] === 'object' ? String(t[k]) : null });
    const read = space.blocks.some(a => isArrow(a) && a.arrow.input.as === 'tile' && a.arrow.input.id === pickedTile), mapWarn = mapWarnIn(space, pickedTile), up = tileUp(space, pickedTile);
    properties.show({ id: 'tile ' + pickedTile, name: space.groupNames.get(pickedTile) || 'tile', color: '', cols: r.cols, rows: r.rows, scalar: false, plain: true, fixed: true,
      shape: `tile: a ${r.cols} × ${r.rows} pattern, ${countSaid(t, 'across')} across × ${countSaid(t, 'down')} down` + (t.matrix.error ? '' : `. Its matrix is ${t.matrix.cols} wide × ${t.matrix.rows} tall`)
        + (up !== undefined && !t.over ? `. It is inside ${space.groupNames.get(up) || 'a tile'}'s pattern, and is repeated with it` : ''),
      attributes: [{ key: 'cols', label: 'pattern x', text: String(r.cols) }, { key: 'rows', label: 'pattern y', text: String(r.rows) }, row('across'), row('down')],
      notes: [...(t.warn ? [cap(t.warn)] : []), ...(mapWarn ? [cap(mapWarn)] : []), ...(t.over ? [cap(t.over) + '. It has no matrix while it lies so'] : read && t.matrix.error ? ['It has no matrix for its arrow to read: ' + t.matrix.error] : []),
        ...stepNotes(space, pickedTile),
        ...(steadily(() => { const g = graphNow(), node = findIn(g).tiles.get('t:' + pickedTile)?.node, a = node ? workOut(g, node) : null; return a && a.error && a.error.code === 'type' ? ['Its matrix has no value: ' + a.error.note] : []; }) || [])], matrix: null }); }
  else if (one && isArrow(one)){ const o = outputOf(one), fn = fnOf(one), t = o.type, seat = seatOn(one, space), laidOut = o.asDrawn, wrong = [...(laidOut || [])].filter(([, v]) => isError(v));
    const data = t?.inner || [], path = openPath(one), at = nesting.pathType(typeAsDrawn(one), path), says = t ? nesting.described(t.cols, t.rows, data) : null;      /* its output's entries are opened as a block's are */
    properties.show({ id: one.id, name: one.name, color: getComputedStyle(one.el).getPropertyValue('--block').trim(), cols: at.cols, rows: at.rows, scalar: false, plain: true, fixed: true,
      ...(path.length ? { trail: nesting.trail(bare(one.name), path) } : {}),
      shape: (fn.formula ? 'entry formula' : fn.choose ? 'a condition: its true side, or its false side' : o.defined ? 'defined in its space' : 'pass through') + (t ? `: ${t.cols} wide × ${t.rows} tall` + (says ? ` · ${says}` : '') : ''), attributes: arrowRows(one, fn), spaces: arrowHolds(one), words: SPACES, reserved: Object.keys(RESERVED),
      notes: [...stepSaid(one), ...(o.warn ? [o.warn[0].toUpperCase() + o.warn.slice(1)] : []), ...(o.note ? [cap(o.note)] : []), ...(fn.choose && !fn.formula && !o.warn && conditionOpen(one) ? [conditionOpen(one)] : []), ...wrong.slice(0, 6).map(([k, v]) => `entry ${k}: ${v.err}`), ...(wrong.length > 6 ? [`and ${wrong.length - 6} more`] : [])],
      matrix: t ? { letter: initials((seat || one).name), values: once(path.length ? nesting.opened(laidOut || new Map(), path, data.length) : laidOut || new Map(), laidOut, o.note ? cap(o.note) : null), ...(path.length ? {} : { colsName: t.colsName, rowsName: t.rowsName }), ...(at.inner.length ? { inner: at.inner } : {}) } : null }); }
  else if (one){ const cols = Math.round(one.rect.w / view.unit), rows = Math.round(one.rect.h / view.unit), data = dataOf(one), path = openPath(one), at = nesting.pathType(typeAsDrawn(one), path);      /* at: what the panel shows: the shape, or the entry of it that is opened */
    const all = laidOf(one), values = path.length ? nesting.opened(all, path, data.length) : all, scalar = cols === 1 && rows === 1 && !one.members && !data.length, wrong = scalar ? [] : [...all].filter(([, v]) => isError(v));      /* why each entry that shows the error mark does (a scalar's is said on its mass) */
    const says = nesting.described(cols, rows, data), sized = `${cols} wide × ${rows} tall` + (says ? ` · ${says}` : '');      /* what it is, and never a count of dimensions */
    const kind = sourceKind(one.source), node = steadily(() => graphNow().blocks[one.id]), quiet = node ? steadily(() => unshown(node, bindingOf([one], spaceWith(one)), 'b ' + one.id)) : null;
    properties.show({ id: one.id, name: one.name, color: getComputedStyle(one.el).getPropertyValue('--block').trim(), cols: at.cols, rows: at.rows, scalar, attributes: attributesOf(one), spaces: [holdsRow(one)], words: SPACES, reserved: Object.keys(RESERVED), fixed: !!one.source,
      shape: one.source ? `${[...SOURCES, ...DATA].find(s => s.kind === kind).label.toLowerCase()}${kind === 'file' ? ' (' + (one.source.file || 'no file chosen') + ')' : ''}: ${sized}` : data.length ? sized : undefined,
      ...(path.length ? { trail: nesting.trail(bare(one.name), path) } : {}),
      ...((originOf(one).inner || []).length && !one.members ? { axes: { labels: orderNow(one).map(i => nesting.axisLabels(variableAxes(one))[i]), drawn: 2 } } : {}),      /* which of its variable's axes this use draws: dragged to turn it */
      ...(kind === 'file' ? { actions: [{ key: 'file', label: one.source.file ? 'Choose another CSV file…' : 'Choose a CSV file…' }] } : {}), ...(kind === 'noise' || kind === 'file' ? { plain: true } : {}),
      notes: [...(whyNot(one) ? [whyNot(one)] : []), ...(strays.has(one) ? [acrossNote(space, one) || 'It lies in neither side of the condition, so it takes no part: drag it into true or false'] : []), ...(quiet ? [quiet] : []), ...(kind === 'file' && one.source.file && smallSays(smallIn(one.source.file)) ? [smallSays(smallIn(one.source.file))] : []), ...wrong.slice(0, 6).map(([k, v]) => `entry ${k}: ${v.err}`), ...(wrong.length > 6 ? [`and ${wrong.length - 6} more`] : [])],
      matrix: { letter: initials(one.name), values: once(values, all, quiet), transposed: turned(one) && !path.length, ...(path.length ? {} : { colsName: at.colsName, rowsName: at.rowsName }), ...(at.inner.length ? { inner: at.inner } : {}) } }); }      /* an opened entry is written in full, whatever its axes are called: it is there to be typed into */
  else properties.show(null);
  if (one && !isArrow(one)){ measure ||= createMeasure(view.unit); view.world.append(measure.el); measure.set(one.rect, { ...sides(view, one.rect), wName: shownSide(one, 'w'), hName: shownSide(one, 'h'), ...rootOf(one), inner: nesting.measured(dataOf(one)) }); }
  else measure?.el.remove();
  /* every frame is drawn, named or not; the one that is the whole selection also carries the tools */
  const oneGroup = groupIs(list), live = new Set();
  const twoSides = sidesIn(space);
  for (const id of framesIn(space)){ const side = twoSides.includes(id), name = side ? (id === cond.then ? 'true' : 'false') : space.groupNames.get(id) || '';      /* the two sides of a condition are called true and false */
    if (space.repeats.has(id)) continue;       /* a tile draws itself (below) */
    const ms = inGroup(id); if (!ms.length && !side) continue;      /* a side of a condition is drawn though it holds nothing: it is None, and shapes are let go into it */
    live.add(id); if (!space.frames.has(id)) space.frames.set(id, createBounds());
    const whole = ms.length > 0 && ms.length === list.length && ms.every(b => selected.has(b));      /* the selection is this frame (two frames, one round the other, can hold the very same blocks) */
    const f = space.frames.get(id), on = whole || id === room.host;      /* lit while a selection is held over it */
    f.fit = [room.loose?.get(id) || frameBox(id), { name, solid: true, selected: on, tools: whole, grouped: true, fold: true, grow: namedBelow(id) }, room.loose?.has(id) ? [] : ms];
    f.set(f.fit[0], f.fit[1]); view.world.append(f.el);
  }
  for (const [id, f] of space.frames) if (!live.has(id)){ f.el.remove(); space.frames.delete(id); }
  if (room.host !== null && !space.frames.has(room.host) && !space.repeats.has(room.host)){ roomFrame.set(boxOf(inGroup(room.host)), { selected: true, grouped: true, grow: namedBelow(room.host) }); view.world.append(roomFrame.el); }
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
     row it takes from the first block against the column it takes from the last, each in its block's colour. A sum
     or an elementwise chain: each entry as its members' entries with the signs between them, a₁₁+b₁₁, each in its
     block's colour. Where the evaluator has an entry's number, the number is written in place of all that. */
  const lookOf = piece => { const look = lookNow(piece), data = piece.type && !piece.type.error ? piece.type.inner : null; return data && data.length ? { ...look, inner: data } : look; };      /* a result whose entries hold inner data is written as brackets (matrix.js) */
  const lookNow = piece => { const bs = piece.members.map(m => active[m]), first = bs[0];
    const values = bs.length > 1 ? pieceLaid(bs) || new Map() : null;      /* what the piece comes to: the evaluator's, with the backend's numbers laid over it */
    if (piece.rule === 'sum' || piece.rule === 'elementwise') return { values, combined: {
      parts: bs.map(b => ({ letter: initials(b.name), color: b.shape.color, cols: Math.round(b.rect.w / u), rows: Math.round(b.rect.h / u), transposed: turned(b) })),
      signs: piece.members.slice(1).map((m, n) => piece.rule === 'sum' ? '+' : ts.some(t => t.kind === 'over' && t.a === piece.members[n] && t.b === m) ? '/' : '·') } };
    /* a shape in a .config is written in the ordinary text colour, since its own may be the canvas's, with the entries it leaves to the definitions above written faintly */
    if (bs.length === 1 && inConfig(first, space)) return { letter: initials(first.name), values: laidOf(first), inherited: inheritedBy(first, space), standing: standingLook(first) };
    if (bs.length === 1) return { letter: initials(first.name), color: first.shape.color, values: laidOf(first), standing: standingLook(first), transposed: turned(first) };
    /* scalars times at most one other shape: an entry not known is written as the scalars against its symbol: as the
       one number they come to where each has one, else by their letters */
    const one = b => b.rect.w === u && b.rect.h === u && !b.members && !dataOf(b).length, scalars = bs.filter(one), solid = bs.filter(b => !one(b));
    if (scalars.length && solid.length <= 1){ const of = solid[0] || scalars.pop(), ks = scalars.map(b => valuesOf(b).get('1,1') ?? null), known = ks.every(k => k !== null && !isError(k));
      return { letter: (known ? asText(ks.reduce((a, b) => combine('*', a, b))) : scalars.map(b => initials(b.name)).join('')) + initials(of.name), color: of.shape.color, values, transposed: turned(of) }; }      /* (what the known scalars come to together is combine's to say) */
    const ends = solid.length ? solid : bs; return { values, product: { rows: { letter: initials(ends[0].name), color: ends[0].shape.color }, cols: { letter: initials(ends[ends.length - 1].name), color: ends[ends.length - 1].shape.color } } }; };
  /* a definition space sets what is here beside its block's promised size. The Menu has no promise, so it
     writes out what each piece comes to, beside that piece. (Shapes that do not touch are separate pieces.) */
  const stacked = new Set(ts.filter(t => t.kind === 'sum').flatMap(t => [active[t.a], active[t.b]]));
  const standing = new Set(((space.owner && standingOf(space.owner)) || []).map(t => t.block));      /* shapes standing in the definition's matrix sit against one another too */
  for (const b of space.blocks) b.inset(stacked.has(b) || standing.has(b));      /* in a sum there is no room above a block for its name (the next one up is there): names go on the blocks */
  if (space.definition && space.definition.wrote !== defKey(space.owner)) write();      /* shapes have gone into, or come out of, its block's matrix; or an arrow's output is another size */
  /* what the space comes to: its ends, the pieces (and outputs) nothing reads from. What is in a .config is no part of it. */
  const mine = space.definition ? endsOf(space, { active, all }) : [], outLook = a => ({ letter: initials(a.name), values: outputOf(a).asDrawn || new Map(), ...(outputOf(a).type?.inner?.length ? { inner: outputOf(a).type.inner } : {}) });      /* in the ordinary text colour: the function colour is for the triangle */
  if (cond) space.definition?.check(conditionCome(space), outLook(space.owner));      /* a condition comes to its two sides' size: the matrix on the right is its output, as it is written for the arrow */
  else space.definition?.check(!mine.length ? null : mine.length === 1 ? mine[0].type : { error: mine.length + ' pieces' }, mine.length === 1 ? (mine[0].piece ? lookOf(mine[0].piece) : outLook(mine[0].arrow)) : {});
  /* a result stays by its piece: to the right; if something else is there (another block, or a result already placed),
     just below, to the left, or a little further below; and if every one of those is taken, to the right all the
     same, over whatever is there. It never goes off looking for room. */
  /* A times or over pair encloses two empty rectangles, its hollows, and its result is written in them, on the bare
     canvas, in place of the "= …" beside the piece: in neither, one or both, as .show_hadamard_copies says. Which
     hollows, if any, is worked out in algebra.js (resultHollows); the page says only how many squares the matrix
     takes as it is written, and draws. With none, the result goes beside the piece as any other does. */
  /* With one copy asked for, the hollow written in is the one an arrow reads from, where one does. Where each result
     goes is worked out from the blocks (writtenIn), the same on screen and off; here it is drawn there. */
  const world = r => ({ x: r.x * u, y: r.y * u, w: r.w * u, h: r.h * u });
  /* a product, a sum or an elementwise result can be named, folding its blocks into one; a block on its own already is one, and has its own name */
  const writ = writtenIn(space, { active, rects, all }).map(w => ({ ...w, look: lookOf(w.piece), nameable: w.piece.members.length > 1, hollows: w.drawn.map(h => ({ n: h.n, ...world(h) })),
    editable: w.piece.members.length === 1 && isNamed(w.blocks[0]) && !w.blocks[0].source,      /* a named shape on its own: its entries can be typed where they are written */
    box: world(w.piece.box) }));
  writ.forEach(({ blocks, type, look, nameable, editable, box, hollows, where, whole }, i) => { const r = results[i] ||= createResult({ unit: u }); view.world.prepend(r.el);
    const at = r.set(box, type, { ...(hollows.length ? { hollows } : { side: where.side, drop: where.drop, whole }), look, nameable, editable });
    r.piece = { blocks, type, box, hollows, at }; });            /* what this result is the result of, and the hollows it is written in */
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
    view.world.prepend(r.el); r.set(at, o.type, { hollows: [at], look: seat ? { letter: initials(seat.name), color: seat.shape.color, ...(o.type.inner?.length ? { inner: o.type.inner } : {}) } : outLook(a), nameable: !seat, warn: !!o.warn }); r.at = at; }
  /* a selected arrow shows a frame round itself and its output */
  if (one && isArrow(one)){ const at = outs.get(one)?.el.isConnected ? outs.get(one).at : one.rect, x = Math.min(one.rect.x, at.x), y = Math.min(one.rect.y, at.y);
    arrowFrame.set({ x, y, w: Math.max(one.rect.x + one.rect.w, at.x + at.w) - x, h: Math.max(one.rect.y + one.rect.h, at.y + at.h) - y }, { selected: true }); view.world.append(arrowFrame.el); }
  else arrowFrame.el.remove();
  /* every tile of the space: its frame, its cells, and the copies of what is in its first one */
  /* a tile inside another is drawn over it, so that its own frame and edges take the pointer: the innermost are set down last, each beneath those before it */
  for (const g of [...space.repeats.keys()].sort((a, b) => tileInfo(space, b).depth - tileInfo(space, a).depth)){ const t = tileInfo(space, g), tile = space.tiles.get(g) || createTile(), list = t.members; space.tiles.set(g, tile);
    for (const e of tile.el.querySelectorAll('[data-tile-grab], [data-tile-edge]')) e.dataset.tile = g;
    const mapWarn = mapWarnIn(space, g);      /* an arrow repeated here, or through here from a tile inside, that cannot be, or runs past its input */
    tile.set({ x: t.rep.x * u, y: t.rep.y * u, unit: u, xs: t.lay.xs, ys: t.lay.ys, w: t.lay.w, h: t.lay.h, name: space.groupNames.get(g) || '', counts: `${countSaid(t, 'across')} × ${countSaid(t, 'down')}`, levels: t.levels,
      selected: pickedTile === g || room.host === g, warn: !!(t.warn || mapWarn || t.over), copies: copiesOf(space, t), written: writtenOn(t, list) });      /* over: it overlaps another tile without lying wholly inside its pattern (tiles.js: overlapping) */
    view.world.prepend(tile.el); view.world.append(tile.overEl); }
  for (const [g, tile] of space.tiles) if (!space.repeats.has(g)){ tile.el.remove(); tile.overEl.remove(); space.tiles.delete(g); }
  if (pickedTile && !space.repeats.has(pickedTile)) pickedTile = null;
  dress();
  const reach = inReach(); variables.show(reach.main, reach.hidden);
  return standingNow();                        /* as the arrows stood when this was drawn */
}
function select(list, { toggle = false } = {}){
  if (!toggle || list.length) pickedTile = null;      /* blocks are selected, or a tile: not both */
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
  const u = view.unit, box = boxOf(list), type = typeOf(list.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u, wName: b.sides.w, hName: b.sides.h, inner: dataOf(b) })));
  return { blocks: list, box, type: type && !type.error ? type : { cols: box.w / u, rows: box.h / u, colsName: null, rowsName: null } };
}
/* moves blocks of the space on screen into a definition space, by (dx, dy), with what goes with them: the frames that
   lie wholly among them, a tile as a tile, and what was cut where every shape it made goes */
function carryInto(def, inside, dx, dy){
  const u = view.unit;
  /* groups lying wholly among the folded blocks go with them; the group being folded itself, if it is one, does not */
  const whole = groupIs(inside), going = new Set(inside.flatMap(b => chain(b)).filter(g => g !== whole && !sidesIn(space).includes(g) && inGroup(g).every(b => inside.includes(b))));      /* (a side of a condition stays where it is, empty) */
  for (let more = true; more;){ more = false; for (const [g, up] of space.groupUp) if (going.has(up) && !going.has(g)){ going.add(g); more = true; } }      /* and what is inside a group that goes, though it holds no block: an empty tile in a tile's pattern */
  for (const b of inside) if (going.has(space.groupOf.get(b))) def.groupOf.set(b, space.groupOf.get(b));
  for (const g of going){ if (going.has(space.groupUp.get(g))) def.groupUp.set(g, space.groupUp.get(g)); if (space.groupNames.has(g)) def.groupNames.set(g, space.groupNames.get(g)); }
  for (const g of going){ space.groupUp.delete(g); space.groupNames.delete(g);
    if (space.repeats.has(g)){ const r = space.repeats.get(g); def.repeats.set(g, { ...r, x: r.x + dx / u, y: r.y + dy / u }); space.repeats.delete(g); } }      /* a tile among them goes as a tile */
  for (const b of inside){
    b.el.remove(); space.blocks.splice(space.blocks.indexOf(b), 1); space.groupOf.delete(b);
    b.set({ ...b.rect, x: b.rect.x + dx, y: b.rect.y + dy }); def.blocks.push(b);
    if (spaceOf.has(b)) spaceOf.get(b).parent = def;                                                 /* its own definition now hangs under the new one */
  }
  /* what was cut goes with the shapes it made, where all of them fold away: the blocks it keeps move as they did */
  for (const o of [...space.ops]) if (o.results.every(id => inside.some(b => b.id === id))){ space.ops.splice(space.ops.indexOf(o), 1); def.ops.push(o);
    for (const b of o.sources) b.set({ ...b.rect, x: b.rect.x + dx, y: b.rect.y + dy }); o.was = null; }      /* their old place in the order, and their frames, were this space's */
}
function fold({ blocks: inside, type, box }, name, color = someColour()){
  if (unnameable(name)) return shown();
  const u = view.unit, fixed = fixedIn(inside, 'folded away');
  if (fixed){ hud.say(fixed); return shown(); }
  const made = makeBlock({ ...typeNamed('tensor'), color },
    { x: box.x, y: box.y, w: type.cols * u, h: type.rows * u }, name);
  made.sides = { w: type.colsName, h: type.rowsName };                    /* its sides keep the names the result's sides had */
  made.inner = nesting.kept(type.inner);                                   /* and it holds what the result holds */
  /* its definition space: the folded blocks, level with the equation at the centre and clear of it on the left */
  const def = newSpace(made, space); spaceOf.set(made, def);
  carryInto(def, inside, -u * (3 + squares(type.cols, type.colsName)) - (box.x + box.w), Math.round(-box.h / 2 / u) * u - box.y);
  tidy();                                      /* a group left with one thing in it is no group */
  space.blocks.push(made); view.world.append(made.el);
  select([made]);
}

/* ---- make conditional ----
   The selection, exactly one piece, is wrapped in a condition (arrows.js: Conditions): it folds away into a new arrow's
   definition space, inside the frame called true; an empty frame called false, the same size, is made under it; a new
   single entry holding true is set where the selection's left edge was, with the arrow on its east side; and the
   arrow promises the size the selection came to. So what stood there is still what is worked out, until the entry is
   made false: then it is None. One message, conditional { ids }: one step back undoes all of it. */
function conditionableNow(list){
  const alg = algebraIn(space), held = alg.all.filter(p => p.members.some(m => list.includes(alg.active[m])));
  const out = list.filter(b => !alg.active.includes(b) && !isArrow(b) && !b.in && !b.seat).length;      /* a block that takes no part (commented out, in a .config) is in no piece */
  const read = list.find(b => space.blocks.some(k => isArrow(k) && !list.includes(k) && k.arrow.input.as !== 'tile' && k.arrow.input.id === b.id));      /* a block an arrow has for its input, or reads the piece's result by way of */
  return conditionable({ blocks: list.length, fixed: fixedIn(list, 'made conditional'), read: read ? bare(read.name) || 'That block' : null, pieces: [...held.map(p => ({ members: p.members.length, chosen: p.members.filter(m => list.includes(alg.active[m])).length, error: p.type.error || null })), ...Array.from({ length: out }, () => ({ members: 1, chosen: 1, error: 'it takes no part' }))] });
}
function makeConditional(list){
  const can = conditionableNow(list); if (can.refused){ hud.say(can.refused); return shown(); }
  const u = view.unit, { box, type } = foldable(list), holder = chain(list[0]).find(c => list.every(b => chain(b).includes(c)));      /* the innermost frame that held all of it: what stands in its place is in that frame still (a side of another condition, a tile) */
  const at = conditionPlace(list, box, type);
  const when = makeBlock({ ...typeNamed('tensor'), color: someColour() }, { x: at.x * u, y: at.y * u, w: u, h: u }, conditionName());
  when.values.set('1,1', true); touched(when.values);
  const a = makeArrow(freeName()); a.arrow = { input: { id: when.id, as: 'block' }, side: 'e', start: 1, span: 1, gap: 2, gapName: null, output: { cols: type.cols, rows: type.rows } };
  a.fn = { formula: null, choose: { then: newGroup(), else: newGroup() } };
  const def = newSpace(a, space); spaceOf.set(a, def);
  const dx = -u * (3 + squares(type.cols, type.colsName)) - (box.x + box.w), dy = Math.round(-box.h / 2 / u) * u - box.y;
  carryInto(def, list, dx, dy);
  /* what was carried in is the true side: every block of it, and every frame that came with them, inside that frame */
  for (const b of list) if (!def.groupOf.has(b)) def.groupOf.set(b, a.fn.choose.then);
  for (const g of new Set([...def.groupOf.values(), ...def.groupUp.keys(), ...def.groupUp.values(), ...def.repeats.keys()])) if (g !== a.fn.choose.then && !def.groupUp.has(g)) def.groupUp.set(g, a.fn.choose.then);
  def.groupNames.set(a.fn.choose.then, 'true'); def.groupNames.set(a.fn.choose.else, 'false');
  /* its input block, the condition, on the left of the true side and clear of it */
  const inner = makeBlock({ ...typeNamed('tensor'), color: 'function' }, { x: box.x + dx - 5 * u, y: box.y + dy, w: u, h: u }, 'in'); inner.in = true; def.blocks.push(inner);
  space.blocks.push(when, a); view.world.append(when.el, a.el);
  if (holder !== undefined){ space.groupOf.set(when, holder); space.groupOf.set(a, holder); }
  tidy();
  select([a]); hud.say(`Made conditional: it is what it was while ${when.name} is true, and None while it is false. Open the arrow for its two sides`);
}
/* Where the new entry goes, in units, its arrow and output following on its east side: where the selection's left
   edge was, unless what the three draw there would lie over something that is there and stays: a block, another
   arrow's output, or, in a definition space, the equation (the matrix the space comes to is as large as the
   selection, and the output is written three units further right than the selection began). Then the nearest
   place where they lie over nothing (arrows.js: conditionAt). Only what the command makes is moved: what is there
   stays where it is. */
function conditionPlace(list, box, type){
  const u = view.unit, x0 = Math.round(box.x / u), y0 = Math.round(box.y / u), size = { cols: squares(type.cols, type.colsName), rows: squares(type.rows, type.rowsName) };
  const taken = [...space.blocks.filter(b => !list.includes(b)).map(unitsOf), ...space.blocks.filter(k => isArrow(k) && !isOff(k)).map(k => outputOf(k).place).filter(Boolean)];
  if (space.definition){ const w = (x, y) => view.toWorld(x, y);      /* the equation as it is drawn, and its left matrix as it will be: what the space comes to is the selection's size still */
    for (const m of space.definition.el.querySelectorAll('.matrix, .definition-slot, .definition-sign')){ const r = m.getBoundingClientRect(); if (!r.width) continue; const a = w(r.left, r.top), b = w(r.right, r.bottom); taken.push({ x: a.x / u - 1, y: a.y / u, w: (b.x - a.x) / u + 2, h: (b.y - a.y) / u }); }      /* with a unit of air on either hand: two matrices side by side with nothing between read as a product */
    taken.push({ x: -2 - size.cols, y: -size.rows / 2, w: size.cols + 2, h: size.rows }); }
  return conditionAt({ x: x0, y: y0 }, size, taken);
}
/* a name for the entry a condition is made with, that nothing on this canvas has */
function conditionName(){ const used = new Set(space.blocks.map(b => b.name)); for (let n = 1; ; n++){ const name = n === 1 ? 'if' : 'if ' + n; if (!used.has(name) && !nameable(name).refused) return name; } }

/* ---- copy and paste ----
   Copy takes a picture of the selected blocks as they are now: size, name, colour, side names, entries, grouping, and each
   one's whole definition space, all the way down. Paste makes new blocks from that picture in the current space,
   centred on a point, and selects them. The picture stays, so it can be pasted again and again.
   This is the page's own clipboard, not the computer's: it does not survive a reload or reach another tab. */
let clipboard = null;
const picture = (b, s, goes = null) => ({ id: b.id, arrow: isArrow(b) ? { ...b.arrow, input: { ...b.arrow.input }, output: b.arrow.output ? { ...b.arrow.output } : null, formula: isUse(b) ? null : fnOf(b).formula, choose: !isUse(b) && originOf(b).fn.choose ? { ...originOf(b).fn.choose } : null } : null, use: isUse(b),
  seat: !b.seat ? null : typeof b.seat === 'string' ? b.seat : { hollow: [...b.seat.hollow] }, in: !!b.in, standing: !!b.standing, source: b.source || null, t: !!b.t, shape: { ...b.shape }, rect: { ...b.rect }, name: b.name, sides: { ...b.sides }, inner: dataOf(b).map(a => ({ ...a })), attrs: attrsOf(b).map(a => ({ ...a })), holds: holdsOf(b), values: orderOf(b) ? [...reordered(b.values, orderOf(b))] : measures(b) || indexedOf(b) || takenOf(b) ? [...valuesOf(b)].filter(([, v]) => storable(v)) : rangedOf(b) ? [...valuesOf(b, 0, true)].filter(([, v]) => storable(v)) : [...b.values],      /* plain data throughout, so a paste can say what it pasted; a measure, or a part of another shape, is copied as the numbers it now shows */
  groups: chain(b, s).filter(g => !goes || goes(g)).map(g => ({ id: g, name: s.groupNames.get(g) ?? null, repeat: s.repeats.has(g) ? repeatCopy(s.repeats.get(g)) : null })),      /* the groups it is in, innermost first; a tile with its repeat */
 
  inside: spaceOf.has(b) ? spaceOf.get(b).blocks.map(o => picture(o, spaceOf.get(b))) : null,
  members: b.members ? b.members.map(m => ({ fx: m.fx, fy: m.fy, fw: m.fw, fh: m.fh, pic: picture(m.block, s) })) : null });
/* which tiles go with a copied block is tiles.js's to say (copied): a tile that is copied whole, in another tile or
   in none, so one block of several is pasted alone. A tile that is itself selected (tile) is copied whole, with what
   is in it and without the frames and tiles it is in. */
function copy(tile = null){
  const list = tile ? inGroup(tile) : [...selected]; if (!list.length) return false;
  const whole = g => inGroup(g).every(b => list.includes(b));
  clipboard = list.map(b => { const all = chain(b), upto = tile ? all.slice(0, all.indexOf(tile) + 1) : all, kept = tile ? upto : tiles.copied(tilesOf(b), whole);
    return picture(b, space, g => upto.includes(g) && (!space.repeats.has(g) || kept.includes(g))); });
  return true;
}
function cut(also){ if (selected.size){ copy(); remove(also); } }
/* makes the blocks in pictures inside space s, moved by (dx, dy); blocks that were grouped together are grouped together again */
function develop(pictures, s, dx, dy){
  const u = view.unit, groups = new Map(), made = [], now = new Map();      /* now: the id a block had when it was copied -> the block made from it */
  for (const pic of pictures){
    const r = { ...pic.rect, x: pic.rect.x + dx, y: pic.rect.y + dy };
    for (const dim of ['w', 'h']) if (pic.sides[dim] && lengthCalled(pic.sides[dim], s) !== undefined) r[dim] = lengthCalled(pic.sides[dim], s);      /* a named side is whatever length that name is now */
    const name = s === space && /^Shape \d+$/.test(pic.name) ? freeName() : pic.name;      /* a block never given a name of its own gets a fresh number */
    const b = pic.arrow ? makeArrow(name) : makeBlock(pic.shape, r, name); b.sides = { ...pic.sides }; b.inner = nesting.kept(pic.inner); b.attrs = (pic.attrs || []).map(a => ({ ...a })); if (pic.holds) b.attrs.holds = pic.holds; b.values = new Map(pic.values); if (pic.source) b.source = pic.source; b.turn(pic.t); if (pic.standing && s !== space) b.standing = true;
    if (pic.arrow){ const { formula, choose, ...geo } = pic.arrow; b.set(r); b.arrow = { ...geo, input: { ...geo.input }, output: geo.output ? { ...geo.output } : null }; b.fn = { formula }; if (pic.use) b.ref = true; }
    if (pic.seat) b.seat = typeof pic.seat === 'string' ? pic.seat : { hollow: [...pic.seat.hollow] };
    if (pic.in && s.owner && isArrow(s.owner) && !s.blocks.some(k => k.in)) b.in = true;      /* a function's input, copied with its function */
    if (pic.id) now.set(pic.id, b);
    if (pic.members) b.members = pic.members.map(m => ({ fx: m.fx, fy: m.fy, fw: m.fw, fh: m.fh, block: hidden(m.pic, s) }));
    s.blocks.push(b); made.push(b);
    pic.groups.forEach((g, i) => { if (!groups.has(g.id)){ groups.set(g.id, newGroup()); if (g.name) s.groupNames.set(groups.get(g.id), g.name);
        if (g.repeat) s.repeats.set(groups.get(g.id), { ...repeatCopy(g.repeat), x: g.repeat.x + Math.round(dx / u), y: g.repeat.y + Math.round(dy / u) }); }      /* a tile is pasted as a tile, where its blocks are */
      if (i === 0) s.groupOf.set(b, groups.get(g.id)); else s.groupUp.set(groups.get(pic.groups[i - 1].id), groups.get(g.id)); });
    if (pic.inside){ const def = newSpace(b, s); spaceOf.set(b, def); const inner = develop(pic.inside, def, 0, 0);
      /* a condition copied: its two sides are the copies of its frames, and a side that held nothing is made anew, empty */
      if (pic.arrow && pic.arrow.choose){ const side = (g, name) => { const id = inner.frames.get(g) || newGroup(); def.groupNames.set(id, name); return id; };
        b.fn.choose = { then: side(pic.arrow.choose.then, 'true'), else: side(pic.arrow.choose.else, 'false') }; } }
    if (pic.arrow){ if (!spaceOf.has(b)) spaceOf.set(b, newSpace(b, s)); }
  }
  made.frames = groups;                        /* the id a frame had when it was copied -> the frame made from it */
  /* an arrow copied with its input reads the copy, and a block copied with its seat sits on the copy; an arrow copied
     alone reads what the one it was copied from reads, and a seated block copied without its seat is not seated */
  for (const b of made){
    if (isArrow(b) && b.arrow.input.as === 'tile' && groups.has(b.arrow.input.id)) b.arrow.input.id = groups.get(b.arrow.input.id);      /* an arrow copied with the tile it reads reads the copy */
    else if (isArrow(b)){ const to = now.get(b.arrow.input.id); if (to) b.arrow.input.id = to.id; }
    if (typeof b.seat === 'string') b.seat = now.get(b.seat)?.id || null;
    else if (b.seat) b.seat = b.seat.hollow.every(id => now.has(id)) ? { hollow: b.seat.hollow.map(id => now.get(id).id) } : null; }
  /* a tile copied with its step, or with its stop block, has the copies for them; one copied without has none (the
     arrow it was copied from is the step of the tile it was copied from, and of no other) */
  for (const g of groups.values()){ const r = s.repeats.get(g); if (!r) continue;
    for (const k of ['step', 'until']) if (r[k]){ const to = now.get(r[k]); if (to && (k === 'until' || (isArrow(to) && to.arrow.input.as === 'tile' && to.arrow.input.id === g))) r[k] = to.id; else delete r[k]; } }
  for (const b of made) if (isArrow(b)) ensureIn(spaceOf.get(b), b);
  tidy(s);                                     /* a group of which only part was copied may not be a group here */
  return made;
}
/* a block made from a picture but put in no space: one of those a joined shape was joined from */
function hidden(pic, s){
  const b = makeBlock(pic.shape, { ...pic.rect }, pic.name); b.sides = { ...pic.sides }; b.inner = nesting.kept(pic.inner); b.attrs = (pic.attrs || []).map(a => ({ ...a })); if (pic.holds) b.attrs.holds = pic.holds; b.values = new Map(pic.values); if (pic.source) b.source = pic.source; b.turn(pic.t);
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
   with their names, and entry c,r becomes entry r,c. A piece turns as a whole and is still that piece: a product,
   (A·B·C)ᵀ = Cᵀ·Bᵀ·Aᵀ, has each shape transposed and their order reversed; a sum and an elementwise piece keep their
   order ((A + B)ᵀ = Aᵀ + Bᵀ). Each is laid out again from the piece's top-left corner (algebra.js: turnedPlaces). A
   shape is a variable, so it alone is turned: other uses of the variable stay as they are. (What is inside its
   definition space is left as it is.) */
function transpose(){
  if (!selected.size) return;
  const fixed = fixedIn([...selected], 'transposed'); if (fixed){ hud.say(fixed); return shown(); }
  const u = view.unit, list = [...selected], act = list.filter(b => !isOff(b)), done = new Set();
  const places = turnedPlaces(act.map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u, wName: b.sides.w, hName: b.sides.h, inner: dataOf(b) })));
  /* a shape becomes the transpose of what it was: this use alone, marked with a T. Its width and height change places,
     with their names; its entries stay as the variable has them and are read turned. A joined shape is turned bodily,
     with everything it was joined from, and so are all its uses. */
  const flip = b => { if (done.has(b)) return;
    if (orderOf(b)){ done.add(b); const o = orderOf(b); setOrder(b, [o[1], o[0], ...o.slice(2)]); return; }      /* a turned use: the two axes it draws change places */
    for (const k of b.members ? kinOf(b) : [b]){ done.add(k); k.turn(!k.t); k.set({ ...k.rect, w: k.rect.h, h: k.rect.w }); k.sides = { w: k.sides.h, h: k.sides.w }; }
    for (const m of b.members || []){ [m.fx, m.fy, m.fw, m.fh] = [m.fy, m.fx, m.fh, m.fw]; flip(m.block); } };
  list.forEach(flip);
  act.forEach((b, i) => { if (places[i]) b.set({ ...b.rect, x: places[i].x * u, y: places[i].y * u }); });
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
const measures = b => !!b.from && !b.from.range && !b.from.index && !b.from.entry;      /* block.from is one of four things: a measure of a shape's side, a part (a range) of a shape, one entry of a shape that holds inner data, or the index of a block in a tile */
/* the block whose range b shows: itself, or, for another use of a part that was named, that part */
const rangedOf = b => b.from?.range ? b : kin.has(b) ? [...kin.get(b)].find(k => k.from?.range) || null : null;
const partOf = b => { const src = sourceOf(rangedOf(b) || takenOf(b)); return src ? bare(src.name) : 'another shape'; };      /* what to call its source, in a sentence */
/* a part's range as it lies in its source now, or null where the source cannot hold it (or is gone) */
const rangeNow = o => { const src = sourceOf(o), u = view.unit; return src ? rangeIn(o.from.range, Math.round(src.rect.w / u), Math.round(src.rect.h / u)) : null; };
/* a shape with no value just now: a part its source cannot hold, or a shape fused from one */
const lost = b => { const o = rangedOf(b); return (!!o && !rangeNow(o)) || (b.members || []).some(m => lost(m.block)) || seatLost(b); };      /* or a seated block whose seat is gone */
/* a part's entries: its source's, in its range (algebra.js: partEntries), the variable's own way round or turned */
function rangeValues(o, depth, over = false){
  const src = sourceOf(o), u = view.unit; if (!src) return new Map();
  flow(src);                                   /* a fused source's entries are gathered from what it was fused from */
  if (orderOf(src)) return partEntries(o.from.range, { cols: Math.round(src.rect.w / u), rows: Math.round(src.rect.h / u), entries: valuesOf(src, depth + 1), turned: false }, over);      /* a part of a turned use: of its entries as it reads them */
  return partEntries(o.from.range, { cols: Math.round(src.rect.w / u), rows: Math.round(src.rect.h / u), entries: valuesOf(src, depth + 1, true), turned: turned(src) }, over);
}
/* every part takes the size its range now has in its source (a part of a part after the part it is of), and what
   shares its variable or a side's name follows. Called whenever the screen is brought up to date. */
function follow(){
  const u = view.unit;
  for (let pass = 0, moved = true; moved && pass < 8; pass++){ moved = false;
    for (const o of everyKnown()){ const at = o.from?.range && rangeNow(o); if (!at) continue;
      const w = (turned(o) ? at.rows : at.cols) * u, h = (turned(o) ? at.cols : at.rows) * u;
      if (o.rect.w !== w || o.rect.h !== h){ o.set({ ...o.rect, w, h }); agree(o); moved = true; } }
    /* a turned use is the size of the two axes of its variable that it draws, under their names */
    for (const o of everyKnown()){ const as = asTurned(o); if (!as) continue; const w = as[0].length * u, h = as[1].length * u;
      if (o.sides.w !== as[0].name || o.sides.h !== as[1].name) o.sides = { w: as[0].name, h: as[1].name };
      if (o.rect.w !== w || o.rect.h !== h){ o.set({ ...o.rect, w, h }); moved = true; } }
    /* an entry taken out is the size of one entry of its source, with its first two axes' names for its sides */
    for (const o of everyKnown()){ const src = o.from?.entry && sourceOf(o); if (!src || src === o) continue; const t = nesting.entryType(dataOf(src)), w = (turned(o) ? t.rows : t.cols) * u, h = (turned(o) ? t.cols : t.rows) * u;
      if (!dataOf(src).length) continue;       /* its source holds no inner data now: it keeps the size it had, and has no value */
      o.sides = turned(o) ? { w: t.rowsName, h: t.colsName } : { w: t.colsName, h: t.rowsName };
      if (o.rect.w !== w || o.rect.h !== h){ o.set({ ...o.rect, w, h }); agree(o); moved = true; } }
    /* an index matrix is the size of the block it is the index of */
    for (const o of everyKnown()){ const src = o.from?.index && sourceOf(o); if (src && (o.rect.w !== src.rect.w || o.rect.h !== src.rect.h)){ o.set({ ...o.rect, w: src.rect.w, h: src.rect.h }); agree(o); moved = true; } } }
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
    for (const [k, v] of rangedOf(m.block) || takenOf(m.block) ? valuesOf(m.block) : own(m.block)){ const [c, r, ...ks] = k.split(',').map(Number); if (c <= at.w && r <= at.h) b.values.set((c + at.x) + ',' + (r + at.y) + (ks.length ? ',' + ks.join(',') : ''), v); } }
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
  /* a promise is shown and taken off on a shape's own panel, and a fused shape's members have none: a member's
     promise would live on unseen, and break the fused shape under a name that is no longer on the canvas. So it is
     taken off, and said; the fused shape is promised like any shape. (One whose variable has another use still in
     a space keeps it: it is that use's to show.) Undo puts everything back as it was. */
  const let_go = unpromised();
  tidy(); select([made]);
  if (let_go.length) hud.say(`${let_go.join(', ')} ${let_go.length === 1 ? 'promises' : 'promise'} nothing now: a fused shape holds what its shapes hold together, and is promised on its own`);
}
/* No promise lives where it cannot be seen. A promise is its variable's, shown and taken off on the panel of a use
   of it that lies in a space. Where no use does any more, though the variable is kept (its shapes are fused into
   another, or a cut or an intersection has taken them off the canvas and keeps them), the promise is taken off:
   it would break what is made of the shape under a name that is nowhere to be seen, at a place that is not the
   made shape's. Gives the names of the variables that let theirs go, for whoever did it to say. Undo puts each
   back; Revert gives the shapes back without it.
   (The other ways a shape leaves the canvas leave it in a space, where it is selected and its panel shows the
   promise: a folded selection lies in the definition space, a seated block on its arrow's output, where the
   arrow's Gives row is its promise, and a standing shape in its entry.) */
function unpromised(){
  const seen = new Set(everyBlock()), names = [];
  for (const b of everyKnown()) if (holdsOf(b) && ![...kinOf(b)].some(k => seen.has(k))){ delete attrsOf(b).holds; names.push(bare(originOf(b).name)); }
  return [...new Set(names)];
}
const UNSEEN = names => `${names.join(', ')} ${names.length === 1 ? 'promises' : 'promise'} nothing now: ${names.length === 1 ? 'it is' : 'they are'} kept off the canvas, where a promise can be neither seen nor taken off. A shape made of ${names.length === 1 ? 'it' : 'them'} is promised on its own`;
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
  space.ops.push(record);
  const let_go = unpromised();      /* a source's promise does not live on where it cannot be seen */
  tidy(); select(made);
  if (let_go.length) hud.say(UNSEEN(let_go));
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
  const apart = unfuse(r.fused);                /* while the cuts still keep their blocks: taking a fused shape apart forgets what can no longer be come to */
  for (const o of r.ops) space.ops.splice(space.ops.indexOf(o), 1);
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
/* b has been taken out of its space: one use fewer of its variable. With it goes whatever can no longer be come to
   from the Menu: once the last use of a variable is gone, what was in its definition space, and in the definitions of
   those, all the way down; and what it was joined from. So a reference in there is no longer counted as a use of its
   variable. Whatever can still be come to is left alone: a definition another use of the variable still shares, and
   the shapes a joined shape was joined from, which are in no space but are held by it. (Each space is walked once, so
   a definition that leads back to itself does not go round for ever.)
   held: a definition space to keep although nothing leads to it at this moment, because a block about to be made will */
function forget(b, held = null){
  const drop = o => { spaceOf.delete(o); const set = kin.get(o); if (set){ set.delete(o); kin.delete(o); if (set.size < 2) for (const k of set) kin.delete(k); } };
  drop(b);
  const kept = new Set(), walked = new Set(), walk = s => { if (!s || walked.has(s)) return; walked.add(s); s.blocks.forEach(keep); for (const o of s.ops || []) o.sources.forEach(keep); };      /* the two blocks a cut keeps off the canvas are still come to, by Revert */
  const keep = o => { if (kept.has(o)) return; kept.add(o); walk(spaceOf.get(o)); for (const m of o.members || []) keep(m.block); };
  walk(top); trail().forEach(walk); walk(held);      /* the spaces on the way to where the user stands are kept whatever has become of their blocks */
  for (const o of [...spaceOf.keys(), ...kin.keys()]) if (!kept.has(o)) drop(o);
}
function remove(also = []){                      /* also: blocks anywhere that go with the selection (see doomed) */
  const gone = [...new Set([...selected, ...also])]; select([]); discard(gone); shown();
}
/* takes these blocks out of whatever spaces they are in, for good. A block a cut keeps off the canvas can be among
   them (its variable went, or everything made of it did: see doomed): its operation goes with it, with every shape
   the operation made, and the operation's other kept block, if that is not going too, is put back where it was. */
function discard(blocks){
  const going = new Set(blocks), dirty = new Set([space]), spaces = everySpace(), ended = [];
  for (const s of spaces) for (const o of s.ops) if (o.sources.some(b => going.has(b))){ ended.push([s, o]);
    for (const id of o.results){ const made = everyKnown().find(k => k.id === id); if (made) going.add(made); } }
  /* a length taken from a shape that is going, while another use of that variable stays, is taken from that one instead */
  for (const d of everyBlock()) if (measures(d) && !going.has(d)){ const src = sourceOf(d), stay = src && going.has(src) && [...kinOf(src)].find(k => !going.has(k)); if (stay) d.from.id = stay.id; }
  /* and so is a formula that names it: its capsules are pointed at the use that stays (expression.js: repoint). A formula
     naming a variable of which nothing stays is left as it is, broken: it comes to "missing variable". */
  for (const b of going){ const stay = [...kinOf(b)].find(k => !going.has(k)), ids = new Set([b.id]); if (!stay) continue;
    for (const d of everyKnown()){ for (const [k, v] of d.values) if (isFormula(v) && refersTo(v.expr, ids)){ d.values.set(k, { expr: repoint(v.expr, b.id, stay.id) }); touched(d.values); }
      for (const a of attrsOf(d)) if (refersTo(a.text, ids)) a.text = repoint(a.text, b.id, stay.id);
      if (d.fn?.formula && refersTo(d.fn.formula, ids)) d.fn.formula = repoint(d.fn.formula, b.id, stay.id); }
    for (const s of everySpace()) for (const r of s.repeats.values()) for (const k of ['across', 'down']) if (typeof r[k] === 'object' && refersTo(r[k].expr, ids)) r[k] = { expr: repoint(r[k].expr, b.id, stay.id) }; }      /* and a tile's count */
  for (const b of going){ const s = spaceWith(b); if (!s) continue; dirty.add(s); b.el.remove(); s.blocks.splice(s.blocks.indexOf(b), 1); forget(b); }
  for (const [s, o] of ended){ s.ops.splice(s.ops.indexOf(o), 1); dirty.add(s);
    putBack(s, o.sources.filter(b => !going.has(b)).map(b => [o, b]));      /* before anything is forgotten: forget drops whatever can no longer be come to, and the block that stays is come to again only once it is back */
    for (const b of o.sources) if (going.has(b)) forget(b); }
  for (const s of dirty) tidy(s);
  pruneOps();                                  /* a cut whose shapes have all gone is gone too */
  const let_go = unpromised();                 /* the last use in a space of a variable a cut still keeps has gone: so has its promise */
  if (let_go.length) hud.say(UNSEEN(let_go));
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
function doomed(blocks, reverting = [], tileIds = [], leaving = []){      /* leaving: the ids of blocks that are leaving their tiles: their index matrices go (tiles.js: indexless) */            /* reverting: operations being reverted, whose kept blocks come back and so do not go; tileIds: tiles being taken off, whose arrows go */
  const gone = new Set(blocks), all = everyKnown(), byId = new Map(all.map(b => [b.id, b])), spaces = everySpace();
  const holder = new Map(); for (const b of all) for (const m of b.members || []) holder.set(m.block, b);      /* a block fused into another goes when that one does */
  const going = b => { for (let k = b; k; k = holder.get(k)) if (gone.has(k)) return true; return false; };
  const add = b => { if (!gone.has(b)){ gone.add(b); return true; } return false; };
  for (const id of tiles.indexless(all, leaving)) add(byId.get(id));
  for (let more = true; more;){ more = false;
    for (const set of new Set([...gone].map(b => kin.get(b)).filter(Boolean))){ const origins = [...set].filter(k => !k.ref);      /* every shape the variable was made as is going: its references go */
      if (origins.length && origins.every(k => gone.has(k))) for (const k of set) if (add(k)) more = true; }
    for (const d of all) if (d.from && !gone.has(d)){ const src = sourceOf(d); if (src && gone.has(src) && ![...kinOf(src)].some(k => !gone.has(k)) && add(d)) more = true; }
    /* an arrow goes with its input (a block, or the block or arrow whose result it reads), and a seated block with
       its seat: the arrow it sits on, or either shape of the pair whose hollow it sits in */
    const ids = new Set([...[...gone].map(b => b.id), ...tileIds]);
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
function warned(list, doing, proceed, send, reverting = [], tileIds = [], what = null, leaving = [], onCancel = null){      /* tileIds, what: tiles being taken off, and what to call them; leaving: blocks leaving their tiles */
  const also = doomed(list, reverting, tileIds, leaving), broken = formulasOn([...list, ...also]);
  if (!also.length && !broken) return send(also);
  const count = new Map(); for (const b of also) count.set(bare(b.name), (count.get(bare(b.name)) || 0) + 1);
  const sources = [...new Set(list.filter(b => also.some(o => [...kinOf(b)].includes(o) || o.from?.id === b.id || o.arrow?.input.id === b.id || o.seat === b.id || (o.seat?.hollow || []).includes(b.id))).map(b => bare(b.name))), ...(what ? [what] : [])];
  const named = [...new Set(list.filter(isNamed).map(b => bare(b.name)))].join(', ') || 'this', formulas = `${broken} ${broken === 1 ? 'formula refers' : 'formulas refer'} to it`;
  warning.ask({ title: also.length ? `${doing} ${sources.join(', ') || 'this'} also deletes what refers to it` : `${doing} ${named} leaves ${broken === 1 ? 'a formula' : broken + ' formulas'} without it`,
    note: [also.length ? `${also.length} other ${also.length === 1 ? 'instance' : 'instances'} would be removed with it, here or in other spaces.` : '',
      broken ? `${formulas}. ${broken === 1 ? 'It is' : 'They are'} left in place, and will show an error: missing variable.` : ''].filter(Boolean).join(' '),
    head: also.length ? ['Variable', 'Instances'] : [], rows: [...count].sort((a, b) => b[1] - a[1]), proceed: also.length ? proceed : proceed.replace(/ all$/, ''), onProceed: () => send(also), ...(onCancel ? { onCancel } : {}) });      /* nothing else goes: there is no "all" */
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
  for (const s of everySpace()) for (const r of s.repeats.values()) for (const k of ['across', 'down']) if (typeof r[k] === 'object' && refersTo(r[k].expr, ids)) n++;      /* a tile's count that follows a size */
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


/* ---- tiles ----
   A tile is a region whose contents repeat a whole number of times. What a tile means (its counts, what is drawn,
   the index, its matrix, how an arrow is repeated in it) is tiles.js's to say; here it is kept, drawn and changed.

   A tile is a frame with a repeat: space.repeats, frame id -> { x, y, cols, rows, across, down }, the pattern's
   place and size in units and its two counts, each a whole number or a formula { expr } that comes to one from
   what is settled before anything is worked out (tiles.js: settled) and does not depend on the tile's own size. What is in it is what is in the frame, so it is dragged into and out of (with shift), named and
   listed as a frame is. A tile may hold nothing, so its frame stays when its last block leaves.
   Only the blocks of the first cell exist. The other cells are drawn copies (components/tile.js), which take no
   press. A block of a tile is a different matrix in each cell only through the index: index.x and index.y in an
   entry's formula, or the two index matrices in its definition space (a block whose from is { id, index }). What
   a block is in a cell other than the first is worked out with cellNow saying which cell is meant.
   A tile touches nothing: every block of a tile carries the tile for its zone (algebra.js), so no touch crosses a
   tile's boundary. An arrow can take a tile for its input ({ id: the frame's, as: 'tile' }): it reads the tile's
   matrix, all of it. An arrow in a tile whose input is outside the tile is repeated along its input (map).
   A tile may lie wholly inside another tile's pattern: its frame is then inside that tile's frame, as a block's is
   (tileUp), and it is part of that pattern, repeated with it, while staying a tile in its own right (its own repeat,
   counts, arrows, name and frame id). A block's zone, and the index it reads, are the innermost tile's (algebra.js:
   zoneOf; graph.js: indexAt, which is handed the cell of every tile the block is in). Which tile a tile is in is kept
   true to where it lies by every gesture: one drawn or let go wholly inside a pattern is in that tile, one let go
   clear of it has left, and anything between is refused (tiles.js: makable, moved, allowed). Tiles that come to
   overlap some other way (pasted, opened from a file, grown by a count that follows a size, carried off by an arrow
   repeated in them) are drawn in the warning colour with the reason in their panels, and have no matrix until they
   are moved apart (tiles.js: overlapping). */
let pickedTile = null;                         /* the tile that is selected, by its frame's id: its counts and its pattern are in the properties panel */
const cellNow = new Map(), FIRST = { cx: 1, cy: 1 };      /* the cell each tile's blocks are being worked out for: a tile's repeat -> { cx, cy }; a tile that is not there, its first. (A tile in a tile has a cell of each.) */
let useNow = null;                             /* the use of a variable whose standing shapes are being read, for an index matrix among them */
const firstCell = () => cellNow.size === 0;
const tilesOf = (b, s = space) => chain(b, s).filter(g => s.repeats.has(g));      /* the tiles a block is in, innermost first */
const tileOf = (b, s = space) => chain(b, s).find(g => s.repeats.has(g));      /* the tile a block is in, innermost; undefined for none */
const tileUp = (s, g) => { for (let p = s.groupUp.get(g); p !== undefined; p = s.groupUp.get(p)) if (s.repeats.has(p)) return p; return undefined; };      /* the tile a tile is in (by the frames, as a block is); undefined for none */
const tilesAbove = (s, g) => { const out = []; for (let p = tileUp(s, g); p !== undefined; p = tileUp(s, p)) out.push(p); return out; };      /* every tile a tile is in, innermost first */
const tilesUnder = (s, g) => [...s.repeats.keys()].filter(k => tilesAbove(s, k).includes(g));      /* every tile inside a tile, at any depth */
const repeatCopy = r => ({ ...r, across: typeof r.across === 'object' ? { expr: r.across.expr } : r.across, down: typeof r.down === 'object' ? { expr: r.down.expr } : r.down });
/* what a capsule in a count's formula stands for: a measure of a variable, by its block's id (tiles.js lets only sizes through) */
const sizeLookup = token => { if (typeof token === 'string') return undefined; const of = blockOf(token.id); return of ? measured(of, token.measure, token.name) : undefined; };
/* what the size of a thing follows, by id, for tiles.js (circular): a tile, what its counts read; an arrow, what it
   reads and the tile it is repeated in; a seated block, its arrow; a part, a measure or an index matrix, its source;
   any use of a variable, the other uses; a function's input block, its arrow; a named side, the sides of that name;
   a single entry whose number is a formula, what that reads */
function sizeDeps(id){
  for (const s of everySpace()) if (s.repeats.has(id)){ const r = s.repeats.get(id); return ['across', 'down'].flatMap(k => typeof r[k] === 'object' ? refs(r[k].expr).map(c => c.id) : []); }      /* a tile: what its counts read, and nothing else. The tile it is in and the tiles in its pattern have sizes of their own */
  const k = blockOf(id); if (!k) return [];
  const s = spaceWith(k), out = [...depsOf(id)];
  if (isArrow(k) && s){ const g = tileOf(k, s); if (g !== undefined && mapsIn(s, k, g)) out.push(g); if (k.arrow.input.as === 'tile') out.push(k.arrow.input.id); }      /* the tile it reads, and the tile it is repeated in */
  if (k.from) out.push(k.from.id);
  for (const o of kinOf(k)) if (o !== k) out.push(o.id);
  if (k.in && s?.owner) out.push(s.owner.id, originOf(s.owner).id);
  if (s) for (const dim of ['w', 'h']) if (k.sides[dim]) for (const [o] of sidesCalled(k.sides[dim], s)) if (o !== k) out.push(o.id);
  const one = !isArrow(k) && k.values.get('1,1'); if (isFormula(one)) out.push(...refs(one.expr).map(c => c.id));
  return out;
}
/* what a scalar's one entry holds as it is stored, for tiles.js (settled): undefined where it is no scalar, or its number is worked out some other way */
const entryOf = id => { const b = blockOf(id), def = b && spaceOf.get(b); return !b || !single(b) || b.source || seatedOf(b) || givenOf(b) || b.from || rangedOf(b) || (def && def.blocks.some(k => !isOff(k) && !inConfig(k, def))) ? undefined : b.values.get('1,1'); };      /* (what is in its definition space defines it: graph.js) */
/* whether a stored count of tile g depends on that tile's own size: such a count is refused, and one met in a project is 1 with a warning */
const loopsOf = (g, stored) => ({ entryOf, loops: !!stored && typeof stored === 'object' && tiles.circular(g, refs(stored.expr || '').map(c => c.id), sizeDeps) });
/* every tile of a space as tiles.js takes them (which tile each is in, what its counts come to), and what tiles.js
   says of them together: how each is laid out, and which overlap. Worked out once for every time the screen is brought up to date. */
function tilesIn(s){
  if (memo?.has(s.repeats)) return memo.get(s.repeats);
  /* (a count that is open, tiles.js: it does not end, or in a tile with a step is settled only when it is run: laid out as 1, drawn as its first three cells) */
  const list = [...s.repeats].map(([g, rep]) => { const c = tiles.counts(rep, sizeLookup, { across: { ...loopsOf(g, rep.across), step: !!rep.step }, down: { ...loopsOf(g, rep.down), step: !!rep.step } }), open = c.open.across || c.open.down ? c.open : null;
    return { id: g, in: tileUp(s, g) ?? null, name: s.groupNames.get(g) || null, repeat: rep, across: c.across, down: c.down, formula: open ? { ...c.formula, open } : c.formula, open, warn: c.warn }; });
  const all = { list, laid: tiles.laid(list), over: tiles.overlapping(list), info: new Map() };
  memo?.set(s.repeats, all); return all;
}
/* a tile as it stands: its repeat, what its counts come to, what is drawn of it, what is directly in it (members:
   blocks and arrows; blocks; inner: the tiles in its pattern), why it is warned of for where it lies (over), and its
   matrix: its blocks and its inner tiles' matrices set in their places. */
/* a tile's count as it is written on it: its number, ∞ where it does not end, and its formula where that is settled only when it is run */
const countSaid = (t, k) => !t.open || !t.open[k] ? String(t[k]) : t.open[k] === 'inf' ? '∞' : refs(t.rep[k].expr).reduce((text, c) => text.replace(c.text ?? '', fields.look(c)?.label ?? '?'), t.rep[k].expr);
/* ---- a tile's step, and its stop block (tiles.js; graph.js: loop) ----
   repeat.step is the id of the arrow that is the tile's progression function: an arrow on the tile's east side, which
   is then given one whole cell and gives the state of the next. repeat.until is the id of the stop block, a block of
   the pattern: the loop stops at the first cell where it is true. Each is set, and taken off again, by a right-click
   command: step { id } on the arrow, until { id } on the block. What a step must be is graph.js's to say (stepOf):
   the arrow and the tile carry its sentence where it does not fit. */
const stepTile = a => isArrow(a) && a.arrow.input.as === 'tile' && space.repeats.has(a.arrow.input.id) ? a.arrow.input.id : null;
function steppable(list){
  const a = list.length === 1 ? list[0] : null, g = a ? stepTile(a) : null;
  if (!a || !isArrow(a) || g === null || a.arrow.side !== 'e') return { refused: 'Step takes one arrow on a tile\'s east side: ' + cap(tiles.STEP.east) };
  const r = space.repeats.get(g); if (r.step && r.step !== a.id) return { refused: cap(tiles.STEP.second) + ': take the other off first (Step, on that arrow)' };
  return { ok: true, a, g, on: r.step === a.id };
}
function setStep(id){
  const b = blockOf(id), can = steppable(b && space.blocks.includes(b) ? [b] : []); if (can.refused){ hud.say(can.refused); return shown(); }
  const r = space.repeats.get(can.g), name = space.groupNames.get(can.g) || 'the tile';
  if (can.on){ delete r.step; hud.say(`The arrow is no longer the step of ${name}: it reads the tile's matrix`); }
  else { r.step = can.a.id; can.a.arrow = { ...can.a.arrow, output: null };      /* what it promised to give was the matrix's size */
    hud.say(`The arrow is the step of ${name}: it is given one cell and gives the state of the next`); }
  shown();
}
function stoppable(list){
  const b = list.length === 1 ? list[0] : null, g = b && !isArrow(b) ? tileOf(b, space) : undefined;
  if (!b || isArrow(b) || g === undefined) return { refused: 'Stop when true takes one block of a tile\'s pattern: its tile stops at the first cell where that block is true' };
  return { ok: true, b, g, on: space.repeats.get(g).until === b.id };
}
function setUntil(id){
  const b = blockOf(id), can = stoppable(b && space.blocks.includes(b) ? [b] : []); if (can.refused){ hud.say(can.refused); return shown(); }
  const r = space.repeats.get(can.g), name = space.groupNames.get(can.g) || 'The tile';
  if (can.on){ delete r.until; hud.say(`${bare(can.b.name) || 'That block'} is no longer the stop block`); }
  else { r.until = can.b.id; hud.say(`${name} stops at the first cell where ${bare(can.b.name) || 'that block'} is true` + (r.step ? '' : ': once it has a step (Step, on an arrow on its east side)')); }
  shown();
}
/* an error of the graph in words: its note, or what its code means. The code loop is a cycle (a thing that depends on itself): the word loop is kept for a tile with a step */
const errorSaid = e => inWords(e);      /* (graph.js: said) */
/* what there is to say of a tile's step in the tile's panel: which arrow it is, why it does not fit, the stop block, and the cell it stopped at */
function stepNotes(s, g){
  const r = s.repeats.get(g); if (!r || (!r.step && !r.until)) return [];
  const a = r.step ? s.blocks.find(k => k.id === r.step) : null, stop = r.until ? s.blocks.find(k => k.id === r.until) : null, out = [];
  const found = steadily(() => { const gr = graphNow(), f = findIn(gr), e = a ? f.arrows.get(a.id) : null, t = f.tiles.get('t:' + g); if (e && e.node) workOut(gr, e.node); return { e, t, at: e && e.node ? stoppedAt(gr, e.node) : null }; }) || {};
  if (a) out.push(found.e && found.e.error ? 'Its step does not fit: ' + errorSaid(found.e.error) : `It has a step${isNamed(a) ? ', ' + bare(a.name) : ''}: its cells are worked out in order, each from the one before`);
  if (stop) out.push(`It stops at the first cell where ${bare(stop.name) || 'its stop block'} is true` + (found.at ? `: that is cell ${found.at}` : ''));
  return out;
}
/* what there is to say of an arrow that is a tile's step, in the arrow's panel */
function stepSaid(a){
  const g = stepTile(a), r = g !== null ? space.repeats.get(g) : null; if (!r || r.step !== a.id) return [];
  const found = steadily(() => { const gr = graphNow(), e = findIn(gr).arrows.get(a.id); if (e && e.node) workOut(gr, e.node); return { e, at: e && e.node ? stoppedAt(gr, e.node) : null }; }) || {};
  const mapWarn = mapWarnIn(space, g);      /* an arrow its tile's cells are made from cannot be repeated: the cells, and so the step, have no value */
  return [`It is the step of ${space.groupNames.get(g) || 'its tile'}: its in is one cell, and it gives the state of the next`, ...(found.e && found.e.error ? [cap(errorSaid(found.e.error))] : []), ...(mapWarn ? ['An arrow repeated in its tile has no output, so its cells have no value: ' + mapWarn] : []), ...(found.at ? [`It stopped at cell ${found.at}`] : [])];
}
function tileInfo(s, g, all = tilesIn(s)){
  const rep = s.repeats.get(g); if (!rep) return null;
  if (all.info.has(g)) return all.info.get(g);
  const me = all.list.find(t => t.id === g), l = all.laid.get(g), members = inGroup(g, s).filter(b => tileOf(b, s) === g && !isOff(b) && !hollowSeat(b)), blocks = members.filter(b => !isArrow(b));
  const info = { g, rep, across: me.across, down: me.down, formula: me.formula, open: me.open, warn: me.warn, lay: l.lay, rect: l.rect, depth: l.depth, members, blocks, inner: all.list.filter(t => t.in === g).map(t => t.id), over: all.over.get(g) || null, levels: 0, matrix: { error: 'it is inside itself' } };
  all.info.set(g, info);
  info.levels = info.inner.length ? 1 + Math.max(...info.inner.map(i => tileInfo(s, i, all).levels)) : 0;      /* how many levels of tiles lie inside it */
  const parts = [...blocks.map(b => ({ ...unitsOf(b), inner: dataOf(b) })),
    ...info.inner.map(i => { const t = tileInfo(s, i, all); return t.matrix.error ? { error: t.matrix.error } : { x: t.rep.x, y: t.rep.y, w: t.matrix.cols, h: t.matrix.rows, inner: t.matrix.inner || [], tile: true }; })];
  info.matrix = info.over ? { error: info.over } : tiles.matrix(rep, me.across, me.down, parts);
  info.cell = info.over ? { error: info.over } : tiles.matrix(rep, 1, 1, parts);      /* one cell: what a step is given */
  if (me.open && !info.matrix.error) info.matrix = { error: Object.values(me.open).includes('inf') ? tiles.ENDLESS : tiles.AT_RUN };      /* a tile with an open count has no matrix */
  return info;
}
/* the tiles of a space as a list for tiles.js, as they would stand with some changed: change(t) gives the changed one, or nothing to leave it */
const tileList = (s, change = () => null) => tilesIn(s).list.map(t => change(t) || t);
/* the index of one entry of a block or of an arrow's output (at: { c, r }, and cx or cy for an arrow repeated in its
   tile); null where it is in no tile. Which of the cells it is in the index is read from is graph.js's to say (indexAt). */
function indexFor(b, at){
  const s = spaceWith(b), g = s && tileOf(b, s); if (!s || g === undefined || !at) return null;
  const cells = cellsOf(s, g, unitsOf(b), turned(b)), last = cells[cells.length - 1], rep = s.repeats.get(g);      /* a transpose keeps its entries the variable's way round: its place is where it is drawn */
  if (at.cx) last.x = (at.cx - 1) * rep.cols; if (at.cy) last.y = (at.cy - 1) * rep.rows;
  return indexAt(cells, at.c, at.r);
}
/* an index matrix: a block that is index.x or index.y of another block, the one whose definition space it is in */
const indexedOf = b => b.from?.index ? b : kin.has(b) ? [...kin.get(b)].find(k => k.from?.index) || null : null;
function indexMatrix(o){
  let of = blockOf(o.from.id); if (!of) return new Map();
  if (useNow && [...kinOf(useNow)].includes(of)) of = useNow;      /* read through another use of the variable, it is that use's place */
  const s = spaceWith(of), g = s && tileOf(of, s); if (!s || g === undefined) return new Map();
  const r = unitsOf(of), cells = cellsOf(s, g, r), out = new Map();
  for (let row = 1; row <= r.h; row++) for (let c = 1; c <= r.w; c++) out.set(c + ',' + row, indexAt(cells, c, row)[o.from.index === 'y' ? 'y' : 'x']);
  return out;
}
/* whether a block is a different matrix in each cell: an entry of its reads the index, or an index matrix stands in its matrix */
const readsIndex = b => [...b.values.values()].some(v => isFormula(v) && tiles.reads(v.expr)) || (standingOf(b) || []).some(t => indexedOf(t.block))
  || steadily(() => { const g = graphNow(), n = g.nodes[g.blocks[b.id]]; return !!n && (n.within || []).some(w => w[0] === 't'); });      /* or the graph marks it as following its cell: it is made of something that does (seated on an arrow that reads such a block, or that is repeated through an outer tile) */
const texts = values => new Map([...values].map(([k, v]) => [k, isError(v) ? '!' : v && typeof v === 'object' && typeof v.f === 'number' ? { level: levelOf(v.f), text: valueText(v), stale: !!values.stale } : valueText(v)]));      /* (a decimal is drawn as its square: decimals.js) */
/* what is drawn in the cells that are not the first: a copy of every block, and of every arrow, of the tile; and of
   every cell of every tile in its pattern, with what is in that (so a tile in a tile is seen repeated with it). How
   many cells of an inner tile are drawn was settled with its layout (tiles.js: laid), so that no tile is drawn more
   than 64 times in all. Nothing is drawn past the cell it is a copy in: an inner tile that runs past the pattern
   is warned of, and its copies do not spill. */
function copiesOf(s, t){
  const out = [], was = new Map(cellNow), top = t.rep;
  const put = (T, ix, iy, ox, oy) => {      /* all of tile T's cell (the one cellNow names), T's pattern set down at (ox, oy) units from the drawn cell's corner */
    for (const b of T.members){ const r = unitsOf(b), at = { cx: ix, cy: iy, x: ox + r.x - T.rep.x, y: oy + r.y - T.rep.y, w: r.w, h: r.h, color: b.shape.color, name: isNamed(b) ? b.name : '' };
      if (!isArrow(b) && (at.x < 0 || at.y < 0 || at.x + at.w > top.cols || at.y + at.h > top.rows)) continue;
      if (isArrow(b)) out.push({ ...at, tri: cornersOf(b.arrow.side, r.w, r.h) });
      else out.push({ ...at, values: readsIndex(b) && !dataOf(b).length ? texts(laidOf(b)) : null, sunk: sunkLaid(b) }); }      /* sunk: by its truth in this cell, which is not the first cell's where it reads the index */
    for (const c of T.inner){ const C = tileInfo(s, c);
      for (const sy of C.lay.ys) for (const sx of C.lay.xs){ if (sx.dots || sy.dots) continue;
        cellNow.set(C.rep, { cx: sx.cell, cy: sy.cell }); put(C, ix, iy, ox + C.rep.x - T.rep.x + sx.at, oy + C.rep.y - T.rep.y + sy.at); }
      cellNow.delete(C.rep); } };
  try { t.lay.ys.forEach((sy, iy) => t.lay.xs.forEach((sx, ix) => { if (sx.dots || sy.dots || (sx.cell === 1 && sy.cell === 1)) return;
      cellNow.set(top, { cx: sx.cell, cy: sy.cell }); put(t, ix, iy, 0, 0); })); }
  finally { cellNow.clear(); for (const [k, v] of was) cellNow.set(k, v); }
  return out;
}
/* and what is written over the real blocks, in the first cell: the entries of one that reads the index (a single entry shows its own on its face) */
const writtenOn = (t, list) => list.filter(b => !isArrow(b) && !single(b) && !dataOf(b).length && readsIndex(b)).map(b => { const r = unitsOf(b); return { x: r.x - t.rep.x, y: r.y - t.rep.y, w: r.w, h: r.h, values: texts(laidOf(b)) }; });
/* a frame's rectangle, for whatever is held over it: a tile's pattern, or the box round an ordinary frame's blocks */
const frameBox = id => { const r = space.repeats.get(id), u = view.unit; return r ? { x: r.x * u, y: r.y * u, w: r.cols * u, h: r.rows * u } : sidesIn(space).includes(id) ? sideBox(space, id) : boxOf(inGroup(id)); };
/* the box of one side of a condition, in world lengths: round its blocks, or, where it holds none, where an empty side
   is drawn (arrows.js: emptySide), at the other side's size, else the size the arrow promises, else one by one */
function sideBox(s, g){
  const u = view.unit, ms = inGroup(g, s); if (ms.length) return boxOf(ms);
  const c = conditionIn(s), which = g === c.then ? 'then' : 'else', om = inGroup(which === 'then' ? c.else : c.then, s), ob = om.length ? boxOf(om) : null, out = originOf(s.owner).arrow.output;
  const r = emptySide(which, ob && { x: ob.x / u, y: ob.y / u, w: ob.w / u, h: ob.h / u }, ob ? { cols: ob.w / u, rows: ob.h / u } : out || { cols: 1, rows: 1 });
  return { x: r.x * u, y: r.y * u, w: r.w * u, h: r.h * u };
}
/* whether an arrow in tile g is repeated there: its input is outside the tile */
const mapsIn = (s, a, g) => { const inp = a.arrow.input; if (inp.as === 'tile') return inp.id !== g && s.repeats.has(inp.id) && !tilesAbove(s, inp.id).includes(g);      /* another tile is outside this one too, unless it is in this one's pattern: tiles.js says what comes of that */
  const blk = s.blocks.find(k => k.id === inp.id); return !!blk && !chain(blk, s).includes(g); };
/* the tile with a step an arrow is repeated through by way of the block seated on its output (graph.js: outputOf,
   "In a tile with a step"): that block lies in the tile, the arrow's input outside it, and the arrow in it or in no
   tile. In cell k the seated block holds the arrow's k-th run. undefined where there is none. */
function followsIn(s, a){
  const seat = seatOn(a, s), g = seat ? tileOf(seat, s) : undefined, inp = a.arrow.input; if (g === undefined || !s.repeats.get(g)?.step || inp.as === 'tile') return undefined;
  const blk = s.blocks.find(k => k.id === inp.id), mine = tileOf(a, s); if (!blk || chain(blk, s).includes(g) || !(mine === g || mine === undefined)) return undefined;
  return g;
}
/* why an arrow repeated in tile g, or through it from a tile inside it, cannot be: the first there is; null where all can */
const mapWarnIn = (s, g) => { const inside = inGroup(g, s);
  return s.blocks.filter(a => isArrow(a) && !isOff(a) && ((inside.includes(a) && mapsIn(s, a, g)) || followsIn(s, a) === g)).map(a => outputOf(a).mapWarn).find(Boolean) || null; };
const mapsAny = (s, g) => inGroup(g, s).some(a => isArrow(a) && mapsIn(s, a, g));      /* whether any arrow is repeated in the tile, or in a tile inside it, along something outside it */
/* moves a tile, the tiles inside it and its blocks (dx, dy in units). Arrows and seated blocks are placed by what they read, so they are left to that. */
function shiftTile(s, g, dx, dy){
  const u = view.unit; for (const k of [g, ...tilesUnder(s, g)]){ const rep = s.repeats.get(k); rep.x += dx; rep.y += dy; }
  for (const b of inGroup(g, s)) if (!isArrow(b) && !b.seat) b.set({ ...b.rect, x: b.rect.x + dx * u, y: b.rect.y + dy * u });
}
const placesOfTiles = () => everySpace().flatMap(s => [...s.repeats.values()].map(r => [r, r.x, r.y]));      /* where every tile is, to put them back after a drag's preview */
const cap = text => text[0].toUpperCase() + text.slice(1);
function addTile(rect){
  const u = view.unit, r = { x: Math.round(rect.x / u), y: Math.round(rect.y / u), w: Math.round(rect.w / u), h: Math.round(rect.h / u) };
  const inside = tiles.members(r, space.blocks.map(unitsOf)).map(i => space.blocks[i]), list = tileList(space);
  /* where it would be among the tiles there are: inside one's pattern, round others, or clear of them all (tiles.js: makable) */
  const first = tiles.makable(r, list), goes = first.refused ? [] : first.holds, into = first.refused ? null : first.in;
  const strays = inside.filter(b => { const t = tileOf(b); return t !== undefined && t !== (into ?? undefined) && !goes.some(k => k === t || tilesAbove(space, t).includes(k)); }).length;
  const can = first.refused ? first : tiles.makable(r, list, strays);
  if (can.refused) return hud.say(can.refused);
  /* its frame: round the blocks inside it that are in no tile going in whole, and round those tiles; and itself inside
     the innermost frame that held them all, which is the tile whose pattern it was drawn in, or a frame in that */
  const g = newGroup(), loose = inside.filter(b => { const t = tileOf(b); return t === undefined || !goes.some(k => k === t || tilesAbove(space, t).includes(k)); });
  const frames = [...loose.map(b => chain(b)), ...goes.map(k => upFrom(k).slice(1))], wholly = c => inGroup(c).every(x => inside.includes(x));
  let holder = frames.length ? frames[0].find(c => frames.every(f => f.includes(c))) : undefined;
  if (into !== null && (holder === undefined || !upFrom(holder).includes(into))) holder = into;
  for (const b of loose){ let unit = null; for (const c of chain(b)){ if (c === holder) break; if (wholly(c)) unit = c; }      /* a frame wholly inside goes in as a frame */
    if (unit === null) space.groupOf.set(b, g); else space.groupUp.set(unit, g); }
  for (const k of goes){ let unit = k; for (const c of upFrom(k).slice(1)){ if (c === holder) break; if (wholly(c)) unit = c; } space.groupUp.set(unit, g); }      /* a tile it was drawn round is in it, though it holds nothing */
  if (holder !== undefined) space.groupUp.set(g, holder);
  space.repeats.set(g, { x: r.x, y: r.y, cols: r.w, rows: r.h, across: 1, down: 1 });
  tidy(); selected.clear(); pickedTile = g; shown();
  const holds = loose.length ? 'holding ' + loose.length + (loose.length === 1 ? ' block' : ' blocks') : goes.length ? 'with no block of its own' : 'empty';
  hud.say(into !== null ? `A tile inside ${space.groupNames.get(into) || 'a tile'}'s pattern: ${r.w} × ${r.h}, ${holds}. It is part of that pattern, and is repeated with it`
    : `A tile: ${r.w} × ${r.h}, ${holds}${goes.length ? ', with ' + (goes.length === 1 ? 'a tile' : goes.length + ' tiles') + ' inside it' : ''}. Pull its right or bottom edge to repeat it`);
}
function setTile({ frame, ...patch }){
  const rep = space.repeats.get(frame); if (!rep) return;
  const geo = {}; for (const k of ['x', 'y', 'cols', 'rows']) if (k in patch) geo[k] = patch[k];
  const got = tiles.settable(rep, geo); if (got.refused){ hud.say(got.refused); return shown(); }
  const next = got.repeat;
  if (next.x !== rep.x || next.y !== rep.y){ const can = tiles.movable(mapsAny(space, frame)); if (can.refused){ hud.say(can.refused); return shown(); } }
  for (const k of ['across', 'down']) if (k in patch){ const c = tiles.count(patch[k], sizeLookup, { ...loopsOf(frame, patch[k]), step: !!rep.step }); if (c.refused){ hud.say(`${cap(k)}: ${c.refused}`); return shown(); } next[k] = c.open === 'inf' ? tiles.INF : c.formula ? { expr: patch[k].expr } : c.count; }
  /* as the tiles would then stand: this one resized or with other counts where it is, then moved with every tile inside
     it. Whether they may, and which tile it is in once it is let go there, is tiles.js's to say (allowed, moved). */
  const cs = tiles.counts(next, sizeLookup, { across: { ...loopsOf(frame, next.across), step: !!rep.step }, down: { ...loopsOf(frame, next.down), step: !!rep.step } }), dx = next.x - rep.x, dy = next.y - rep.y, before = tileList(space), was = tileUp(space, frame) ?? null;
  const sized = tileList(space, t => t.id === frame ? { ...t, repeat: { ...next, x: rep.x, y: rep.y }, across: cs.across, down: cs.down, formula: cs.open.across || cs.open.down ? { ...cs.formula, open: cs.open } : cs.formula } : null);
  const can = dx || dy ? tiles.moved(sized, frame, dx, dy) : tiles.allowed(before, sized), fits = can.refused || !(dx || dy) ? can : tiles.allowed(before, can.list);
  if (fits.refused){ hud.say(fits.refused); return shown(); }
  Object.assign(rep, next, { x: rep.x, y: rep.y });
  if (dx || dy){ shiftTile(space, frame, dx, dy);
    if (can.in !== was){ if (can.in === null) space.groupUp.delete(frame); else space.groupUp.set(frame, can.in); tidy();      /* let go wholly inside a tile's pattern it is in that tile; out of the one it was in, it has left */
      hud.say(can.in !== null ? `The tile is inside ${space.groupNames.get(can.in) || 'a tile'}'s pattern now: it is part of that pattern, and is repeated with it` : 'The tile has left the tile it was in: it repeats on its own'); } }
  shown();
}
/* what was typed in the panel of a tile: a count takes a whole number or a formula of sizes; the pattern's sides a whole number, worked out once, now */
function tileTyped(g, key, text){
  const t = bound(text, reachList());
  if (key === 'across' || key === 'down'){ const got = t.refused ? t : tiles.typed(t.text, sizeLookup, { entryOf, step: !!space.repeats.get(g)?.step });
    if (got.refused){ hud.say(`${cap(key)}: ${got.refused}`); return shown(); }
    return bus.send('tile.set', { frame: g, [key]: got.value }); }
  const got = t.refused ? t : evaluate(t.text, sizeLookup), side = got.refused ? got : got.empty ? { refused: 'nothing was typed' } : sideOf(got.value);
  if (side.refused){ hud.say(`Pattern: ${side.refused}`); return shown(); }
  bus.send('tile.set', { frame: g, [key]: side.length });
}
/* taking a tile off: its blocks stay, once, and the copies go. An arrow that reads the tile goes with it, after the warning. */
function untiling(g){
  const name = space.groupNames.get(g) || 'the tile';
  warned([], 'Taking off', 'Take off', also => bus.send('tile.remove', { frame: g, also: idsOf(also) }), [], [g], name, tileUp(space, g) !== undefined ? [] : idsOf(tileInfo(space, g).members));      /* its own blocks are in no tile then: their index matrices go. (In a tile's pattern, they are that tile's then, and have its index; a tile inside it stays a tile.) */
}
/* a drag that begins on a tile's frame: by its right or bottom edge it changes that count, in whole patterns; anywhere else it moves the tile and what is in it. One message says where it ended. */
function dragTile(g, edge, from, shift = false){
  const u = view.unit, rep = space.repeats.get(g), was = repeatCopy(rep), rects = inGroup(g).map(b => [b, b.rect]), had = tileInfo(space, g);      /* had: what its counts came to when the drag began */
  const under = tilesUnder(space, g).map(k => [space.repeats.get(k), space.repeats.get(k).x, space.repeats.get(k).y]);      /* the tiles inside it go with it */
  const up = tileUp(space, g), outer = up !== undefined && !shift ? space.repeats.get(up) : null, size = tiles.filled(rep, had.across, had.down); let said = false;
  if (pickedTile !== g) bus.send('tile.pick', { frame: g });
  if (!edge && tiles.movable(mapsAny(space, g)).refused){ hud.say(tiles.movable(true).refused); return { move(){}, end(){} }; }
  return { move(p){
      if (edge) rep[edge] = edge === 'across' ? tiles.dragged(had.across, rep.cols, (p.x - from.x) / u) : tiles.dragged(had.down, rep.rows, (p.y - from.y) / u);      /* by the patterns the pointer has moved, whatever is drawn */
      else { let dx = Math.round((p.x - from.x) / u), dy = Math.round((p.y - from.y) / u);
        /* a tile inside a tile stays inside that tile's pattern, as a block does (tiles.js: held), unless it is being pulled out with Shift */
        if (outer && tiles.within(outer, { x: was.x, y: was.y, w: size.cols, h: size.rows })){ const to = tiles.held(outer, { x: was.x, y: was.y, w: size.cols, h: size.rows }, dx, dy); dx = to.dx; dy = to.dy;
          if (to.stopped && !said){ said = true; hud.say('The tile is inside a tile: it stays inside that pattern. Hold Shift to drag it out'); } }
        rep.x = was.x + dx; rep.y = was.y + dy; for (const [r, x, y] of under){ r.x = x + dx; r.y = y + dy; }
        for (const [b, r] of rects) if (!isArrow(b) && !b.seat) b.set({ ...r, x: r.x + dx * u, y: r.y + dy * u }); }
      view.el.style.cursor = edge === 'across' ? 'ew-resize' : edge ? 'ns-resize' : 'move'; shown(); },
    end(){ const now = repeatCopy(rep); Object.assign(rep, was); for (const [r, x, y] of under){ r.x = x; r.y = y; } for (const [b, r] of rects) b.set(r); view.el.style.cursor = '';
      if (edge && typeof now[edge] === 'number' && now[edge] !== had[edge]) return bus.send('tile.set', { frame: g, [edge]: now[edge] });      /* a count that is a formula is replaced only where the drag changed what it comes to */
      if (!edge && (now.x !== was.x || now.y !== was.y)) return bus.send('tile.set', { frame: g, x: now.x, y: now.y });
      shown(); } };
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
  const levels = []; for (let s = spaceWith(b) || space; s; s = s.parent) levels.push(s.blocks.filter(isArrow).map(k => ({ id: k.id, name: bare(k.name), reference: !!k.ref, off: isOff(k), of: k })));
  const id = functionFor(bare(b.name), levels);      /* which arrow shadows the program's function is arrows.js's to say */
  return id ? levels.flat().find(k => k.id === id).of : null;
}
const fnOf = b => { const home = fnBlock(b); return home ? home.fn : BUILT.get(bare(b.name).trim()) || b.fn; };
const full = b => ({ ...b.arrow, formula: fnOf(b).formula });      /* an arrow as arrows.js takes one */
const seatOn = (a, s = spaceWith(a)) => (s && s.blocks.find(k => k.seat === a.id)) || null;      /* the block seated on an arrow's output */
/* the use of b's variable that is seated, or is a function's input: b itself, or the one it refers to */
const seatedOf = b => b.seat ? b : kin.has(b) ? [...kin.get(b)].find(k => k.seat) || null : null;
const givenOf = b => b.in ? b : kin.has(b) ? [...kin.get(b)].find(k => k.in) || null : null;
/* what an arrow would read, in space s: null where it is gone (not on this canvas, commented out, or a result that
   is not written here), else { rect, cols, rows, colsName, rowsName }: its rectangle in units and its type. (Its
   entries are the graph's: see outputOf.) */
function readOf(s, inp, by = null){
  /* a tile: its matrix, where its pattern is covered exactly; where it is not, it is there and has no value (arrows.js: standing) */
  if (inp.as === 'tile'){ const t = s && tileInfo(s, inp.id); if (!t) return null;
    /* the tile's step (by: the arrow that reads) is given one whole cell, the pattern's size, and not the tile's matrix: the one exemption from an arrow on a tile reading all of it (graph.js: stepOf) */
    if (by && t.rep.step === by.id) return t.cell.error ? { rect: t.rect, error: 'its tile has no matrix: ' + t.cell.error } : { rect: t.rect, cols: t.rep.cols, rows: t.rep.rows, colsName: null, rowsName: null, ...(t.cell.inner ? { inner: t.cell.inner } : {}) };
    if (t.matrix.error) return { rect: t.rect, error: 'its tile has no matrix: ' + t.matrix.error };
    return { rect: t.rect, cols: t.matrix.cols, rows: t.matrix.rows, colsName: null, rowsName: null, ...(t.matrix.inner ? { inner: t.matrix.inner } : {}) }; }
  const blk = s && s.blocks.find(k => k.id === inp.id);
  if (!blk || isOff(blk)) return null;
  if (isArrow(blk)){ if (inp.as !== 'result') return null; const o = outputOf(blk); return o.place && o.type ? { rect: o.place, ...o.type } : null; }      /* another arrow's output */
  if (inp.as !== 'result'){ const r = unitsOf(blk), data = dataOf(blk); return { rect: r, cols: r.w, rows: r.h, colsName: blk.sides.w, rowsName: blk.sides.h, ...(data.length ? { inner: data } : {}) }; }
  return writtenOf(s, blk, inp.hollow);
}
const inputOf = a => readOf(spaceWith(a), a.arrow.input, a);
const sized = input => input && !input.error ? input : null;
/* an arrow as it is drawn against a tile: along the edge as the tile is drawn (tiles.js: drawnOn); null for any other arrow, which is drawn as it reads */
const drawnOf = (arrow, input) => arrow.input.as === 'tile' && input ? tiles.drawnOn(arrow, input.rect) : null;      /* an input that has a size: not one that is gone, nor a tile with no matrix */
/* Where each piece's result is written in space s, worked out from the blocks alone, so that it is the same whether
   or not s is on screen: [{ piece, blocks, type, copies, usable, drawn, where, whole, body, at }], in units. usable
   and drawn are the pair's hollows the result could be, and is, written in (algebra.js); where is its place beside
   the piece (arrows.js: writtenWhere) when it is in no hollow, body its matrix there; whole says an arrow reads it,
   so that its matrix stands on whole units. Results are written beside pieces only in the Menu: a definition space
   has none. The page draws exactly this (paint), and an arrow reads it (writtenOf). */
const copiesIn = (s, b) => systemValue('show-hadamard-copies', [...pathTo(s), { s, at: chain(b, s) }])[0];
function writtenIn(s, alg = null){
  if (s.owner) return [];
  if (memo?.has(s)) return memo.get(s);
  const { active, rects, all } = alg || algebraIn(s), u = view.unit, same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  const readers = s.blocks.filter(k => isArrow(k) && !isOff(k) && k.arrow.input.as === 'result');
  /* an arrow that reads a written result, and the block seated on it, are placed by where the result is written: they are not in its way, or it would run from them */
  const follows = b => (isArrow(b) && b.arrow.input.as === 'result') || (typeof b.seat === 'string' && s.blocks.some(a => a.id === b.seat && isArrow(a) && a.arrow.input.as === 'result'));
  const taken = s.blocks.filter(b => !follows(b)).map(b => ({ x: b.rect.x / u, y: b.rect.y / u, w: b.rect.w / u, h: b.rect.h / u }));      /* commented-out blocks are still in the way */
  const firm = [...taken];      /* what is drawn solid: with no place free, a result may lie on the bare ground of a tile's pattern, never on a block, an arrow or a copy (arrows.js: writtenWhere) */
  for (const g of s.repeats.keys()){ const r = tileInfo(s, g).rect, rep = s.repeats.get(g); taken.push(r);      /* and so is all that is drawn of a tile: a result is not written over its copies */
    if (r.x + r.w > rep.x + rep.cols) firm.push({ x: rep.x + rep.cols, y: r.y, w: r.x + r.w - rep.x - rep.cols, h: r.h }); if (r.y + r.h > rep.y + rep.rows) firm.push({ x: r.x, y: rep.y + rep.rows, w: rep.cols, h: r.y + r.h - rep.y - rep.rows }); }
  const out = all.map(piece => { const blocks = piece.members.map(m => active[m]), read = readers.filter(k => blocks.some(b => b.id === k.arrow.input.id)), type = piece.type, copies = copiesIn(s, blocks[0]);
    const size = type.error ? { w: 4, h: 0 } : { w: squares(type.cols, type.colsName), h: squares(type.rows, type.rowsName) };
    const usable = type.error ? [null, null] : pieceHollows(rects, piece).map(h => h && size.w <= h.w && size.h <= h.h ? h : null);
    const drawn = type.error ? [] : resultHollows(rects, piece, copies, { cols: size.w, rows: size.h }, read.map(k => k.arrow.input.hollow).filter(Boolean)).map(h => ({ n: usable.findIndex(o => same(o, h)) + 1, ...h }));
    const where = drawn.length ? null : writtenWhere(piece.box, size, taken, read.length > 0, firm), at = drawn.length ? { x: drawn[0].x, y: drawn[0].y, w: drawn[0].w, h: drawn[0].h } : where.at;
    taken.push(at); firm.push(at);
    return { piece, blocks, type, copies, usable, drawn, where, whole: read.length > 0, body: where && !type.error ? where.body : null, at }; });
  memo?.set(s, out); return out;
}
/* the written result of the piece that holds blk, as an arrow reads it: where its matrix is (arrows.js: readAt) and its type */
function writtenOf(s, blk, hollow){
  const w = writtenIn(s).find(w => w.blocks.includes(blk)); if (!w || w.type.error) return null;
  const at = readAt(w, hollow, w.copies); if (!at) return null;
  return { rect: { x: at.x, y: at.y, w: w.type.cols, h: w.type.rows }, ...w.type };
}
/* what a thing depends on, by id, for arrows.js (dependsOn): an arrow, on what it reads (the block; the arrow whose
   output it reads; or every block of the piece whose result it reads) and, where it is defined in a space, on the
   arrows in that space; a seated block, on its arrow or on the two shapes of its pair */
function depsOf(id){
  const k = blockOf(id); if (!k) return [];
  if (!isArrow(k)) return !k.seat ? [] : typeof k.seat === 'string' ? [k.seat] : [...k.seat.hollow];
  const s = spaceWith(k), inp = k.arrow.input, blk = s?.blocks.find(x => x.id === inp.id), def = fnOf(k).formula ? null : spaceOf.get(fnBlock(k) || k);
  if (inp.as === 'tile') return [...(s ? inGroup(inp.id, s).map(x => x.id) : []), ...(def ? def.blocks.filter(isArrow).map(x => x.id) : [])];      /* a tile: on everything in it */
  return [...(!blk ? [] : inp.as === 'result' && !isArrow(blk) ? touching(s, blk) : [inp.id]), ...(def ? def.blocks.filter(isArrow).map(x => x.id) : [])];
}
/* the ids of the blocks joined to blk by touching, itself included */
function touching(s, blk){
  const live = s.blocks.filter(b => !isOff(b) && !isArrow(b) && !hollowSeat(b)), ts = touches(live.map(b => ({ ...unitsOf(b), zone: zoneOf(tilesOf(b, s)), inner: dataOf(b) }))), seen = new Set([live.indexOf(blk)]);
  for (let more = true; more;){ more = false; for (const t of ts) if (seen.has(t.a) !== seen.has(t.b)){ seen.add(t.a); seen.add(t.b); more = true; } }
  return [...seen].filter(i => i >= 0).map(i => live[i].id);
}
/* An arrow as it stands (arrows.js: standing): whether it warns, what it comes to and where its output is. Its
   output's entries as they are drawn (asDrawn: the evaluator's with the backend's numbers over them, for drawing only,
   see "the backend") are asked for only when they are drawn: null where the graph gives the arrow no value, and
   none (with note saying why) where it is too large to work out here. While the screen is being
   brought up to date each arrow of the space on screen is worked out once (memo); an arrow that reads itself,
   through whatever else, is "it depends on itself". */
const busy = new Set(); let memo = null;
function outputOf(a){
  if (firstCell() && memo?.has(a)) return memo.get(a);      /* what is kept is the first cell's: a block of a tile may differ in the others */
  if (busy.has(a)) return { ...standing(full(a), null, [], null, null, { loops: true }), asDrawn: null, note: null, defined: false };      /* being worked out already: only reached where it reads itself */
  busy.add(a);
  try {
    const loops = dependsOn(depsOf(a.id), a.id, depsOf);      /* it reads itself, through whatever else: arrows.js says what that comes to */
    const s = spaceWith(a), arrow = full(a), input = s && !loops ? inputOf(a) : null, seat = seatOn(a, s);
    const defined = arrow.formula || !sized(input) ? null : definedBy(a, input);
    /* in a tile, with its input outside it, the arrow is repeated along that input: how often, and whether it can be, is tiles.js's to say */
    /* (and in a tile with a step it is repeated there too where the block seated on it lies in that tile, whether the arrow is in it or in none: followsIn) */
    const led = s ? followsIn(s, a) : undefined, g = led !== undefined ? led : s ? tileOf(a, s) : undefined, tile = sized(input) && g !== undefined && (led !== undefined || mapsIn(s, a, g)) ? tileInfo(s, g) : null, rows = along(arrow.side) === 'rows';
    /* and through every tile that tile is in which its input is outside of too: in each of their cells it goes on along its input */
    const above = tile && a.arrow.input.as !== 'tile' ? tilesAbove(s, g).filter(t => mapsIn(s, a, t)).map(t => tileInfo(s, t)) : [];
    const map = tile ? tiles.mapped(arrow, tile.rep, tile.across, tile.down, rows ? input.rows : input.cols, { tile: a.arrow.input.as === 'tile', open: !!tile.open && !!tile.rep.step, outer: above.map(t => ({ repeat: t.rep, across: t.across, down: t.down })) }) : null;
    /* another use of a named arrow has to fit the function's own input (inner); the block seated on the output is not in its own way */
    /* in a tile with a step, where the block seated on its output lies in that tile too, the output is one run, and the seated block holds the k-th in cell k (graph.js: outputOf) */
    const oneRun = !!(seat && tile && tile.rep.step && tileOf(seat, s) === g && map && !map.warn);
    const st = standing(arrow, input, s ? othersOf(s, a.arrow.input, seat) : [], seat ? { colsName: seat.sides.w, rowsName: seat.sides.h } : null, defined, { loops, inner: a.ref && !isUse(a) ? innerOf(a) : null, map: oneRun ? null : led !== undefined && map ? { ...map, count: 1 } : map, drawn: drawnOf(arrow, sized(input)) });      /* (one that cannot be repeated by way of its seat keeps its one run's shape, and warns) */
    const out = { ...st, defined: !!defined, mapWarn: map?.warn || null,
      get asDrawn(){ return outputLaid(a, s); },
      get note(){ return steadily(() => { const e = findIn(graphNow()).arrows.get(a.id); return e?.node ? unshown(e.node, bindingOf(readBy(a, s), s, false, a), 'a ' + a.id) : null; }); } };
    if (firstCell()) memo?.set(a, out);
    return out;
  } finally { busy.delete(a); }
}
/* the blocks an arrow reads, where they are blocks of its own space: the one it is set against, or all of the piece whose result it reads */
function readBy(a, s){
  const inp = a.arrow.input, blk = inp.as === 'tile' || !s ? null : s.blocks.find(k => k.id === inp.id); if (!blk || isArrow(blk)) return [];
  return inp.as === 'result' ? touching(s, blk).map(id => s.blocks.find(k => k.id === id)).filter(Boolean) : [blk];
}
/* an arrow's output, entry by entry: what the graph's node for it comes to */
const FORMULA_ERROR = /^(not the size of the output|missing variable|missing attribute|unknown name: |not a scalar|not an arrow|an arrow has no such measure|depends on itself|cannot read )/;
const outputLaid = (a, s = spaceWith(a)) => steadily(() => outputLaidNow(a, s));
function outputLaidNow(a, s){
  const e = findIn(graphNow()).arrows.get(a.id);
  /* a formula that stands for an error (it names a matrix of another size, or what is not there) has no node: every entry of the output is that error, and is written as one */
  if (e && !e.node && e.error && FORMULA_ERROR.test(e.error.note) && fnOf(a).formula){ const t = outputOf(a).type, out = new Map(); if (!t) return null;
    for (let r = 1; r <= t.rows; r++) for (let c = 1; c <= t.cols; c++) out.set(c + ',' + r, { err: e.error.note }); return out; }
  if (!e || !e.node) return null;
  return laidAt(e.node, bindingOf(readBy(a, s), s, false, a), 'a ' + a.id);
}
/* the rects an arrow's edge has to be free of: every block of the space that touches, but for its own input */
const othersOf = (s, input, seat = null) => { const own = input.as === 'tile' ? new Set(inGroup(input.id, s)) : null;      /* a tile's own blocks are not against its edge: they are it */
  return s.blocks.filter(k => !isArrow(k) && !isOff(k) && !hollowSeat(k) && !(input.as !== 'result' && k.id === input.id) && k !== seat && !own?.has(k)).map(unitsOf); };      /* (the block a result is read by way of is not the result: it is in the way like any other) */
/* the function's own input, as a type: the covered part of the arrow the function was made as */
function innerOf(a){ const o = originOf(a), input = isArrow(o) ? sized(inputOf(o)) : null; return input ? coveredType(full(o), input) : null; }
/* what a space comes to: its ends, the things in it that nothing reads from. A piece no arrow has for its input is
   one; so is the output of an arrow that nothing reads from and no block is seated on (arrows.js: ends). Without
   arrows these are the space's pieces, as before. Each is { type, piece | arrow } */
function endsOf(s, alg = algebraIn(s), side = null){      /* side: one frame of a condition: the ends of what lies wholly in it (graph.js: endOf) */
  const { active } = alg, inSide = b => side === null || chain(b, s).includes(side), all = alg.all.filter(p => p.members.every(m => inSide(active[m]))), arrows = s.blocks.filter(k => isArrow(k) && !isOff(k) && inSide(k));
  /* a piece in a tile is read where an arrow reads the tile: the tile's id goes with its blocks' */
  return ends(all.map(p => ({ ids: [...p.members.map(m => active[m].id), ...new Set(p.members.flatMap(m => tilesOf(active[m], s)))], type: p.type, config: p.members.some(m => inConfig(active[m], s)), of: p })),
    arrows.map(k => { const seated = !!seatOn(k, s), o = seated ? null : outputOf(k); return { id: k.id, reads: k.arrow.input.id, seated, type: o ? o.type || { error: o.warn || 'no value' } : null, of: k }; }),
    s.blocks.filter(k => k.from?.entry && !isOff(k) && !isArrow(k)).map(k => k.from.id))      /* a block an entry is taken out of is read from: its piece is no end (arrows.js) */
    .map(e => e.piece ? { type: e.type, piece: e.piece.of } : { type: e.type, arrow: e.arrow.of });
}
/* what an arrow's definition space comes to, for this arrow's input: a type or { error }; null where it holds only its input, which is to pass through */
function definedBy(a, input){
  const home = fnBlock(a) || a, def = spaceOf.get(home); if (!def) return null;
  syncIn(def); arrange(def);                   /* its space is laid out from the data, on screen or not, before it is asked what it comes to */
  if (conditionIn(def)) return conditionCome(def);
  const alg = algebraIn(def), inner = def.blocks.find(k => k.in);
  return defined(endsOf(def, alg).map(e => e.piece ? { type: e.type, piece: { ids: e.piece.members.map(m => alg.active[m].id) } } : e), id => id === inner?.id);
}
/* what a condition's space comes to: the type of its two sides (arrows.js: chosenType), each the ends that lie wholly
   in its frame; an error where a frame is gone, as the graph says it */
function conditionCome(def){
  const c = conditionIn(def); if (sidesIn(def).length < 2) return { error: 'a side of its condition is gone' };
  const alg = algebraIn(def);
  return chosenType([c.then, c.else].map(g => endsOf(def, alg, g)), originOf(def.owner).arrow.output, [c.then, c.else].map(g => acrossIn(def, alg, g).length > 0));
}
/* the pieces of a condition's space that lie across the edge of one of its frames: some of their blocks in it, some not (graph.js: chosen) */
const acrossIn = (s, alg, g) => alg.all.filter(p => { const n = p.members.filter(m => chain(alg.active[m], s).includes(g)).length; return n > 0 && n < p.members.length; });
/* what there is to say of a conditional arrow whose condition is not known (what it is given is worked out here, and is neither true nor false): that, or the error that an entry of it is (arrows.js: conditionSaid); null or false where it is known */
function conditionOpen(a){
  return steadily(() => { const g = graphNow(), e = findIn(g).arrows.get(a.id), n = e && e.node && g.nodes[e.node]; if (!n || n.op !== 'apply') return false;
    const binding = bindingOf(readBy(a, spaceWith(a)), spaceWith(a), false, a), options = binding ? { binding } : undefined, r = workOut(g, n.inputs[0], options);
    return !!r.entries && truthAt(g, n.inputs[0], options) === null ? conditionSaid(r.entries) : null; });
}
/* the blocks of a condition's space that lie in neither of its sides, the input block apart: they take no part */
const acrossNote = (s, b) => { const alg = algebraIn(s), k = sidesIn(s).findIndex(g => acrossIn(s, alg, g).some(p => p.members.some(m => alg.active[m] === b)));
  return k < 0 ? null : `Its piece lies across the edge of the ${s.groupNames.get(sidesIn(s)[k])} side, so the condition comes to no matrix: move its blocks wholly into that frame, or wholly out of it`; };
const straysIn = s => { const sides = sidesIn(s); if (!conditionIn(s)) return []; const alg = algebraIn(s);      /* and the blocks of a piece that lies across a side's edge: it is neither side's */
  return [...new Set([...s.blocks.filter(b => !b.in && !isOff(b) && !inConfig(b, s) && !chain(b, s).some(g => sides.includes(g))), ...sides.flatMap(g => acrossIn(s, alg, g)).flatMap(p => p.members.map(m => alg.active[m]))])]; };
/* the block called in takes the size and the side names of the covered part of the input of the arrow the function
   was made as (every use of a named arrow has to fit that, so it is theirs too). It does not depend on which arrow
   the space was opened through: going into a space never changes the project. Gives whether it changed. */
function syncIn(def){
  const a = def.owner && isArrow(def.owner) ? originOf(def.owner) : null, inner = a && def.blocks.find(k => k.in), input = inner && spaceWith(a) ? sized(inputOf(a)) : null, part = input && coveredType(full(a), input), u = view.unit;
  if (!part) return false;
  const data = nesting.kept(part.inner), other = JSON.stringify(inner.inner) !== JSON.stringify(data);
  if (other) inner.inner.splice(0, inner.inner.length, ...data);      /* in place: every use of it shares the one list */
  const resized = inner.rect.w !== part.cols * u || inner.rect.h !== part.rows * u, named = other || inner.sides.w !== (part.colsName || null) || inner.sides.h !== (part.rowsName || null);
  if (resized) keepTouching(() => { inner.set({ ...inner.rect, w: part.cols * u, h: part.rows * u }); for (const k of kinOf(inner)) if (k !== inner) k.set({ ...k.rect, w: inner.rect.w, h: inner.rect.h }); });
  inner.sides = { w: part.colsName || null, h: part.rowsName || null };
  return resized || named;
}
/* makes the block called in, in an arrow's definition space that has none: clear of the equation, on its left */
function ensureIn(def, a){
  if (def.blocks.some(k => k.in)) return;
  const u = view.unit, input = sized(inputOf(a)), part = (input && coveredType(full(a), input)) || { cols: 1, rows: 1 };
  const b = makeBlock({ ...typeNamed('tensor'), color: 'function' }, { x: -u * (3 + squares(part.cols, part.colsName)) - part.cols * u, y: Math.round(-part.rows / 2) * u, w: part.cols * u, h: part.rows * u }, 'in');
  b.in = true; b.sides = { w: part.colsName || null, h: part.rowsName || null }; b.inner = nesting.kept(part.inner); def.blocks.push(b);
}
/* where a block seated in a hollow sits: the first hollow of its pair that is the size of the result (algebra.js:
   pieceHollows), as { n: which of the two, rect, type }; null where the two do not make such a pair now */
function hollowOf(pair, s = space, alg = algebraIn(s), which = 0){      /* which: 1 or 2 for that hollow and no other */
  const { active, rects, all } = alg, p = all.find(p => p.members.length === 2 && p.members.every(m => pair.includes(active[m].id)));
  if (!p) return null;
  const both = pieceHollows(rects, p), n = which ? (both[which - 1] ? which - 1 : -1) : both.findIndex(Boolean);
  return n < 0 ? null : { n: n + 1, rect: both[n], type: p.type };
}
/* a seated block whose seat is gone or has nowhere to be just now: it has no value */
const seatLost = b => !b.seat ? false : (s => { if (!s) return true; if (typeof b.seat !== 'string') return !hollowOf(b.seat.hollow, s);
  const a = s.blocks.find(k => k.id === b.seat && isArrow(k)), o = a && outputOf(a); return !o || !o.place || o.blocked; })(spaceWith(b));      /* blocked: its seat would lie on another block (arrows.js: standing) */
/* a triangle's corners in units from its own rectangle's corner, for an arrow whose gap is w by h */
function cornersOf(side, w, h){
  const rows = along(side) === 'rows', span = rows ? h : w, gap = rows ? w : h;
  const r = side === 'e' ? { x: -1, y: 0, w: 1, h: span } : side === 'w' ? { x: gap, y: 0, w: 1, h: span } : side === 's' ? { x: 0, y: -1, w: span, h: 1 } : { x: 0, y: gap, w: span, h: 1 };
  return triangle({ side, start: 1, span, gap }, r);
}
/* puts every arrow of the space on screen in front of its base, and every seated block on its seat, at the size its
   seat has. An arrow may read a seated block or another arrow's output, so it is done until nothing moves. Gives
   whether anything did. */
function arrange(s = space){
  const u = view.unit, scaled = r => ({ x: r.x * u, y: r.y * u, w: r.w * u, h: r.h * u }); let any = false;
  if (!s.blocks.some(b => isArrow(b) || b.seat)) return false;
  for (let pass = 0, again = true; again && pass < 8; pass++){ again = false; memo?.clear();
    const alg = s.blocks.some(hollowSeat) ? algebraIn(s) : null;
    for (const b of s.blocks){ let r = null;
      if (isArrow(b)){ const input = inputOf(b);
        /* an arrow that reads a tile reads all of it (tiles.js: whole), whatever the tile's counts have become */
        if (sized(input) && b.arrow.input.as === 'tile'){ const all = tiles.whole(b.arrow, input); if (all.start !== b.arrow.start || all.span !== b.arrow.span){ b.arrow = all; again = any = true; } }
        if (input && (input.error || covered(b.arrow, input))) r = scaled(strip(drawnOf(b.arrow, input) || b.arrow, input.rect));      /* against a tile, along its edge as it is drawn */
        const at = r || b.rect; b.point(b.arrow.side, cornersOf(b.arrow.side, at.w / u, at.h / u), at.w / u, at.h / u); }
      else if (typeof b.seat === 'string'){ const a = s.blocks.find(k => k.id === b.seat && isArrow(k)), o = a && outputOf(a); if (o?.place && !o.blocked) r = scaled(o.place); }      /* never onto another block */
      else if (b.seat){ const h = hollowOf(b.seat.hollow, s, alg); if (h) r = scaled(h.rect); }
      if (!r || (r.x === b.rect.x && r.y === b.rect.y && r.w === b.rect.w && r.h === b.rect.h)) continue;
      /* an arrow repeated in a tile takes the tile with it: the tile lies along the arrow's input */
      if (isArrow(b) && (r.x !== b.rect.x || r.y !== b.rect.y)){ const g = tilesOf(b, s).filter(t => mapsIn(s, b, t)).at(-1); if (g !== undefined) shiftTile(s, g, Math.round((r.x - b.rect.x) / u), Math.round((r.y - b.rect.y) / u)); }      /* the outermost tile its input is outside of: every tile it is repeated in or through lies along that input, and what is in them goes too */
      const resized = r.w !== b.rect.w || r.h !== b.rect.h; b.set(r); if (resized && !isArrow(b)) agree(b); again = any = true; } }
  memo?.clear();
  return any;
}
/* the same for every space, on screen or not, with each function's input block brought to its size first: what an
   arrow comes to can depend on how the arrows and seats inside its definition are laid out, and those on it. Until
   nothing moves. So what is saved never depends on which spaces have been looked at. */
function arrangeAll(){
  let any = false;
  for (let pass = 0, again = true; again && pass < 4; pass++){ again = false;
    for (const s of everySpace()){ if (!s.blocks.some(b => isArrow(b) || b.seat || b.in)) continue;
      if (syncIn(s)) again = any = true; if (arrange(s)) again = any = true; } }
  return any;
}
/* every edge an arrow could be set against here: each block's; each arrow's output, where no block is seated on it;
   and, in the Menu, each written result of a piece of several shapes (each hollow it is written in). */
function edgesHere(){
  const u = view.unit, out = [];
  for (const g of [...space.repeats.keys()].sort((a, b) => tileInfo(space, b).depth - tileInfo(space, a).depth)) out.push({ input: { id: g, as: 'tile' }, rect: tileInfo(space, g).rect });      /* first: where a tile's edge is also a block's, it is the tile that is meant; and where it is also the edge of a tile it is in, the inner tile (the outer has the rest of that edge, and its other cells) */
  for (const b of space.blocks){ if (isOff(b) || hollowSeat(b)) continue;
    if (isArrow(b)){ const o = outputOf(b); if (o.place && o.type && !seatOn(b, space)) out.push({ input: { id: b.id, as: 'result' }, rect: o.place }); }
    else out.push({ input: { id: b.id, as: 'block' }, rect: unitsOf(b) }); }
  for (const w of writtenIn(space)){ if (w.blocks.length < 2 || w.type.error) continue;
    if (w.drawn.length) for (const h of w.drawn) out.push({ input: { id: w.blocks[0].id, as: 'result', hollow: h.n }, rect: { x: h.x, y: h.y, w: h.w, h: h.h } });
    else if (w.body) out.push({ input: { id: w.blocks[0].id, as: 'result' }, rect: { x: w.body.x, y: w.body.y, w: w.type.cols, h: w.type.rows } }); }
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
  let arrow = { input: { id: input.id, as: input.as === 'result' ? 'result' : input.as === 'tile' ? 'tile' : 'block', ...(input.as === 'result' && input.hollow ? { hollow: input.hollow } : {}) }, side, start, span, gap, gapName: null, output: null };
  if (input.as === 'tile' && sized(read)) arrow = tiles.whole(arrow, read);      /* an arrow on a tile reads all of it */
  const can = settable(arrow, s => !sized(read) ? null : along(s) === 'rows' ? read.rows : read.cols, {});
  if (can.refused) return hud.say(can.refused);
  if (!free(drawnOf(arrow, read) || arrow, read.rect, othersOf(space, input))) return hud.say(FREE);
  if (from){ const inner = innerOf(from), fit = inner && sized(read) ? fits(inner, coveredType(arrow, read)) : { ok: true }; if (fit.refused) return hud.say(`${bare(from.name)} does not fit there. ${fit.refused}`); }
  const b = makeArrow(builtin || (from ? from.name : freeName())); b.arrow = arrow;
  if (from){ const o = originOf(from); b.ref = true; b.fn = o.fn; spaceOf.set(b, spaceOf.get(o)); const set = kin.get(o) || new Set([o]); set.add(b); for (const k of set) kin.set(k, set); }
  else { if (builtin) b.ref = true; spaceOf.set(b, newSpace(b, space)); }
  space.blocks.push(b); view.world.append(b.el);
  ensureIn(spaceOf.get(b), b);
  /* a block carried out of a hollow: put on the output first, while it is still no part of the pair's touching, and then seated there (left in the hollow it would lie against both shapes and break the piece the arrow reads) */
  if (seat){ const k = space.blocks.find(k => k.id === seat), at = k && outputOf(b).place, u = view.unit; if (k){ if (at) k.set({ x: at.x * u, y: at.y * u, w: at.w * u, h: at.h * u }); k.seat = b.id; } }
  select([b]);
}
function setArrow({ id, ...patch }){
  const a = blockOf(id); if (!a || !isArrow(a)) return;
  if ('gapName' in patch && unnameable(patch.gapName)) return shown();
  const input = sized(inputOf(a)), n = side => input ? (along(side) === 'rows' ? input.rows : input.cols) : null, geo = {};
  for (const k of ['side', 'start', 'span', 'gap', 'output']) if (k in patch) geo[k] = patch[k];
  if (a.arrow.input.as === 'tile' && tiles.spanned(a.arrow, geo).refused){ hud.say(tiles.spanned(a.arrow, geo).refused); return shown(); }
  if ('side' in geo && !('start' in geo) && !('span' in geo) && input && SIDES.includes(geo.side)) Object.assign(geo, sided(a.arrow, geo.side, n(a.arrow.side), n(geo.side)));      /* turned to another side: it covers what it can of that one */
  const got = settable(a.arrow, n, geo);
  if (got.refused){ hud.say(got.refused); return shown(); }
  const next = got.arrow;
  if (input && ('side' in geo || 'start' in geo || 'span' in geo)){
    if (!free(drawnOf(next, input) || next, input.rect, othersOf(space, a.arrow.input))){ hud.say(FREE); return shown(); }
    const inner = a.ref && !isUse(a) ? innerOf(a) : null, fit = inner ? fits(inner, coveredType(next, input)) : { ok: true };
    if (fit.refused){ hud.say(`${bare(a.name)} would not fit its input. ${fit.refused}`); return shown(); } }
  if ('gapName' in patch) next.gapName = String(patch.gapName || '').trim() || null;
  if ('formula' in patch){
    if (isUse(a)){ hud.say(`${bare(a.name)} is not this arrow's own function: name an arrow of your own ${bare(a.name)} to change it`); return shown(); }
    const text = String(patch.formula ?? '').trim(), t = bound(text, reachList(), { matrices: true }), read = t.refused ? t : entered(t.text, formulaNames(lookupFor(a)), { matrices: true });
    if (read.refused){ hud.say(`Not kept: ${read.refused}`); return shown(); }
    originOf(a).fn.formula = read.clear ? null : t.text.trim(); }
  a.arrow = next; unstep(space);      /* turned to another side, a tile's step is its step no longer: taken off here, in this message, so that the change is undone and redone whole */
  shown();
}
/* what arrows.js needs to know of a block to say whether it can be seated */
const seatFacts = b => ({ name: bare(b.name), named: isNamed(b), arrow: isArrow(b), input: !!givenOf(b), reference: !!b.ref, uses: [...kinOf(b)].length, defined: !!spaceOf.get(b)?.blocks.some(k => !isOff(k)),
  standing: !!b.standing, seated: !!seatedOf(b), part: !!rangedOf(b), measure: measures(b) || !!indexedOf(b), fused: !!b.members, source: b.source || null });
/* whether an arrow reads a block, directly or through other arrows and seats (arrows.js: dependsOn): its output cannot be seated with that block */
const feeds = (b, a) => dependsOn([a.id], b.id, depsOf);
function seatBlock({ arrow = null, hollow = null, id = null, name = null, color = null }){
  const u = view.unit, a = arrow ? space.blocks.find(k => k.id === arrow && isArrow(k)) : null, h = !a && hollow ? hollowOf(hollow) : null;
  if (!a && !h) return hud.say(hollow ? 'Those two shapes enclose no hollow of their result\'s size' : 'There is no output there to seat a block on');
  if (a ? seatOn(a, space) : space.blocks.some(k => hollowSeat(k) && k.seat.hollow.every(x => hollow.includes(x)))) return hud.say('A block is seated there already');
  const type = a ? outputOf(a).type : h.type;
  let b = id ? space.blocks.find(k => k.id === id) : null;
  if (id){ if (!b || !a) return hud.say(b ? 'A block is seated in a hollow by naming the result there' : 'That block is not on this canvas: it cannot be seated here');
    const can = seatable({ ...seatFacts(b), feeds: feeds(b, a) }); if (can.refused){ hud.say(can.refused); return shown(); }
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
  const u = view.unit, input = sized(inputOf(a)), was = a.arrow, handle = el.dataset.handle || null;
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
      const h = hollowOf(b.seat.hollow, space), scale = r => ({ x: Math.round(r.x / u), y: Math.round(r.y / u), w: Math.round(r.w / u), h: Math.round(r.h / u) }), to = h && carried(h.rect, scale(at));
      if (!to){ shown(); if (at !== home && (at.x !== home.x || at.y !== home.y)) hud.say('To carry it out of the hollow, drag it straight along its row or its column, at least one unit clear'); return; }
      bus.send('arrow.add', { input: { id: b.seat.hollow[0], as: 'result', hollow: h.n }, side: to.side, start: 1, span: along(to.side) === 'rows' ? h.rect.h : h.rect.w, gap: to.gap, seat: b.id }); } };
}
/* the arrow whose output a block has been let go on, if any: an output with no block seated on it (arrows.js: seatsOn) */
function outputUnder(b){
  const r = unitsOf(b);
  return space.blocks.find(a => { if (!isArrow(a) || seatOn(a, space)) return false; const p = outputOf(a).place; return !!p && seatsOn(r, p); }) || null;
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
  const got = readTyped(a, t), n = got.refused ? got : isInteger(got.value) && got.value >= 1 ? { length: got.value } : { refused: `it is a whole number, at least 1, and that comes to ${isError(got.value) ? 'an error (' + got.value.err + ')' : got.value === null ? 'nothing yet' : valueText(got.value)}` };
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
const fromOf = f => !f ? null : f.range ? { id: f.id, range: { ...f.range, toEnd: { ...f.range.toEnd } } } : f.entry ? { id: f.id, entry: { col: f.entry.col, row: f.entry.row } } : { ...f };      /* a block's from, as plain data of its own */
/* the page's spaces as plain data, lengths in units */
function gather(light = false){      /* light: each block's entries as their stamp, for telling cheaply whether anything has changed; 'kept': as the object they were last given as, while they are unchanged (for the graph: what is saved is always written afresh) */
  const u = view.unit, sets = [...new Set(kin.values())], number = b => kin.has(b) ? sets.indexOf(kin.get(b)) + 1 : null;
  /* a definition space is written once, under the first block met that has it: a variable used in several places is
     several blocks with one space, and written under each, a space inside a space, the whole would multiply */
  const written = new Set(), once = s => !written.has(s) && !!written.add(s);
  const one = b => ({ id: b.id, type: b.shape.name || 'tensor', name: b.name, color: b.shape.color, x: b.rect.x / u, y: b.rect.y / u, cols: b.rect.w / u, rows: b.rect.h / u,
    colsName: b.sides.w, rowsName: b.sides.h, inner: dataOf(b).length ? dataOf(b).map(a => ({ length: a.length, name: a.name || null })) : null, entries: b.members || b.source ? {} : light === true ? { stamp: stampOf(b.values) } : light === 'kept' ? entriesOut(b.values) : Object.fromEntries(b.values), inside: spaceOf.has(b) && !open.has(spaceOf.get(b)) && once(spaceOf.get(b)) ? plain(spaceOf.get(b)) : null, variable: number(b),
    ...(orderOf(b) ? { axes: [...b.axes] } : {}), standing: !!b.standing, source: b.source || null, transposed: !!b.t, attributes: attrsOf(b).map(a => ({ name: a.name, value: a.text })), ...(holdsOf(b) ? { holds: holdsOf(b) } : {}), reference: !!b.ref, from: fromOf(b.from),
    /* an arrow: this use of it, with its function's formula (a use of a function by name has none of its own). Never where its output is, or what it comes to. */
    arrow: isArrow(b) ? { input: { ...b.arrow.input }, side: b.arrow.side, start: b.arrow.start, span: b.arrow.span, gap: b.arrow.gap, gapName: b.arrow.gapName || null, output: b.arrow.output ? { ...b.arrow.output } : null, formula: isUse(b) ? null : originOf(b).fn.formula || null,
      ...(!isUse(b) && originOf(b).fn.choose ? { choose: { ...originOf(b).fn.choose } } : {}) } : null,      /* a condition: the two frames of its space it chooses between */
    seat: !b.seat ? null : typeof b.seat === 'string' ? b.seat : { hollow: [...b.seat.hollow] }, in: !!b.in,
    joined: b.members ? b.members.map(m => ({ fx: m.fx, fy: m.fy, fw: m.fw, fh: m.fh, shape: one(m.block) })) : null });      /* a joined shape's entries are its members' */
  /* a use of a variable inside that variable's own definition (the page refuses to make one, and a file may still hold one)
     is written without its definition, which is the one being written: the project is a tree, and the graph calls it a loop */
  const open = new Set();
  const plain = s => { open.add(s); try { return {
    shapes: s.blocks.map(one),
    groups: tree(s, undefined),
    operations: s.ops.map(o => ({ id: o.id, op: o.op, sources: o.sources.map(one), results: [...o.results], was: wasOf(o.was) })) }; } finally { open.delete(s); } };      /* what was cut here, each with the two blocks it keeps, whole */
  /* the groups of s directly inside group `up` (undefined: inside none), each with the blocks and groups directly inside it */
  const tree = (s, up) => [...framesIn(s)].filter(g => s.groupUp.get(g) === up)
    .map(g => ({ id: g, name: s.groupNames.get(g) || null, members: s.blocks.map((b, i) => s.groupOf.get(b) === g ? i : -1).filter(i => i >= 0), groups: tree(s, g), ...(s.repeats.has(g) ? { repeat: repeatCopy(s.repeats.get(g)) } : {}) }));      /* a tile: its repeat, and never what it comes to */
  const out = { top: plain(top), saved: new Date().toISOString(), ids: ids.state() };
  if (light) return out;
  /* the data files some block reads, as they are: saved with the project, and no others */
  const data = {}; for (const b of everyKnown()) if (sourceKind(b.source) === 'file' && b.source.file && dataFiles.has(b.source.file)) data[b.source.file] = dataFiles.get(b.source.file);
  return { ...out, data: Object.fromEntries(Object.keys(data).sort().map(k => [k, data[k]])) };
}
/* ---- data files ----
   A file source reads a numeric CSV kept with the project under data/. Its text is held here from when it is chosen
   or opened until it is saved; a file is never changed once it is here (another file of the same name is given a
   name of its own), so undoing and redoing need only say which file a block reads. Choosing one sends it to the
   backend, which checks that it is a table of numbers, keeps it in the project's directory and says its size; the
   block then takes that size. So a file can be chosen only in a project that is on the server under its name
   (saved at least once): before that there is no directory for it, and none is made for a project never saved.
   A save writes the files some block reads and those a step of undo or redo can still come back to (save), so
   that a step back never leaves a block reading a file that is no longer there. */
const dataFiles = new Map();                   /* "data/weights.csv" -> its text */
const dataSmall = new Map();                   /* such a path -> how many of its numbers are too small for 32 bits and read as 0: as the backend said when the file was chosen, else counted here */
const smallIn = path => { if (!dataSmall.has(path) && dataFiles.has(path)) dataSmall.set(path, tooSmall(dataFiles.get(path))); return dataSmall.get(path) || 0; };
const filePicker = Object.assign(document.createElement('input'), { type: 'file', accept: '.csv,text/csv', hidden: true });
document.body.append(filePicker);
let choosingFor = null;
function chooseFile(b){
  if (backend.available() !== true) return hud.say('Choosing a file needs the backend, which reads it: none is running (README: The backend)');
  /* the file goes into the project's directory on the server, so there has to be one: the project saved, under the name it has now */
  if (!kept || !current || !kept.includes(current)) return hud.say(`Save the project${kept && current ? ' as ' + current : ' under a name'} first: a data file is kept in the project's directory, and there is none yet`);
  choosingFor = b.id; filePicker.click();
}
filePicker.addEventListener('change', async () => { const file = filePicker.files[0], id = choosingFor; filePicker.value = ''; choosingFor = null; if (!file || !id) return;
  try {
    if (file.size > 50 * 1024 * 1024) throw new Error('it is larger than 50 MB');
    const text = await file.text(), same = [...dataFiles].find(([, t]) => t === text), path = same ? same[0] : dataName(file.name, dataFiles);
    const r = await fetch(`api/backend/data?project=${encodeURIComponent(current)}&path=${encodeURIComponent(path)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: text });
    const said = await r.json().catch(() => ({}));
    if (!r.ok || said.error || !(said.cols >= 1)) throw new Error(said.error || 'the server answered ' + r.status);
    dataFiles.set(path, text); if (Number.isSafeInteger(said.small)) dataSmall.set(path, said.small);
    bus.send('source.set', { id, file: path, cols: said.cols, rows: said.rows });
  } catch (e) { hud.say(`Could not take ${file.name}: ${e.message || e}`); } });
/* the reverse: everything on the page is replaced by what the data describes */
function rebuild(data){
  go(top); select([]);
  for (const s of [top]){ for (const b of s.blocks) b.el.remove(); for (const f of s.frames.values()) f.el.remove();
    for (const t of s.tiles.values()){ t.el.remove(); t.overEl.remove(); }
    s.blocks.length = 0; s.ops.length = 0; s.groupOf.clear(); s.groupUp.clear(); s.groupNames.clear(); s.repeats.clear(); s.tiles.clear(); s.frames.clear(); }
  spaceOf.clear(); kin.clear(); deeper.length = 0; clipboard = null; pickedTile = null;
  for (const [path, text] of Object.entries(data.data || {})) if (dataPath(path) && typeof text === 'string') dataFiles.set(path, text);      /* (a file already here under that name is the same file) */
  ids = createIds(); if (data.ids) ids.restore(data.ids);
  const uses = new Map();                        /* a variable's number -> the blocks that are uses of it */
  const defs = new Map(), sharing = new Map();   /* a variable's number -> its definition space, once a use that carries it has been met, and -> the blocks that share it */
  const u = view.unit;
  /* A block's definition. One use of a variable carries it (any one: not always the first met here, and in projects
     saved before, every one), and every use has it: those met already are given it now, and those to come as they
     are made. What another use carries besides is a copy, and is left.
     A shape written twice is treated likewise, by its id (a shape that several uses of a joined variable were joined
     from is written under each, its definition under one): the one written without a definition has the other's. */
  const define = (b, d, s) => { const v = d.variable ?? null, key = v ?? (d.id || null);
    if (key !== null) sharing.set(key, [...(sharing.get(key) || []), b]);
    if (defs.has(key) && (v !== null || !d.inside)) return spaceOf.set(b, defs.get(key));
    if (!d.inside) return;
    const def = newSpace(b, s); spaceOf.set(b, def);
    if (key !== null && !defs.has(key)){ defs.set(key, def); for (const k of sharing.get(key)) spaceOf.set(k, def); }
    fill(d.inside, def); };
  /* one block from its plain form, with its definition space and, for a joined shape, the shapes it was joined from */
  const build = (d, s) => { const type = typeNamed(d.type);
    const b = (d.arrow ? createArrow : createBlock)({ ...type, color: OLD[d.color] || d.color || type.color }, { x: d.x * u, y: d.y * u, w: d.cols * u, h: d.rows * u }, d.name);      /* OLD: a colour's name in projects saved before */
    if (d.arrow){ const { formula, choose, ...use } = d.arrow; b.arrow = { ...use, input: { ...use.input }, output: use.output ? { ...use.output } : null }; b.fn = { formula: formula || null, ...(choose ? { choose: { then: choose.then, else: choose.else } } : {}) }; }
    if (d.seat) b.seat = typeof d.seat === 'string' ? d.seat : { hollow: [...d.seat.hollow] };
    if (d.in) b.in = true;
    b.sides = { w: d.colsName, h: d.rowsName }; b.inner = d.arrow ? [] : nesting.kept(d.inner); b.values = new Map(Object.entries(d.entries)); if (d.standing) b.standing = true; if (sourceKept(d.source)) b.source = sourceKept(d.source); if (d.reference) b.ref = true; if (d.from) b.from = fromOf(d.from); b.attrs = (d.attributes || []).map(a => ({ name: a.name, text: a.value })); if (d.holds) b.attrs.holds = d.holds; b.turn(d.transposed); if (Array.isArray(d.axes) && d.reference) b.axes = [...d.axes]; b.id = d.id || ids.id('b');      /* the id it was saved with */
    if (d.joined) b.members = d.joined.map(j => ({ fx: j.fx, fy: j.fy, fw: j.fw, fh: j.fh, block: build(j.shape, s) }));
    const first = d.variable != null && uses.get(d.variable)?.[0];
    if (d.variable != null) uses.set(d.variable, [...(uses.get(d.variable) || []), b]);
    if (first){ b.values = first.values; b.inner = first.inner; b.attrs = first.attrs; if (first.fn && b.arrow) b.fn = first.fn; }      /* a later use: the first one's entries, and an arrow's function */
    define(b, d, s);
    return b; };
  const fill = (plain, s) => {
    for (const d of plain.shapes) s.blocks.push(build(d, s));
    for (const o of plain.operations || []) s.ops.push({ id: o.id || ids.id('o'), op: o.op, sources: o.sources.map(d => build(d, s)), results: [...o.results], was: wasOf(o.was) });
    const regroup = (g, up) => { const id = g.id || newGroup(); if (up !== undefined) s.groupUp.set(id, up); if (g.name) s.groupNames.set(id, g.name); if (tiles.kept(g.repeat)) s.repeats.set(id, tiles.kept(g.repeat));
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
/* is there a backend? Asked once, as the page loads, of the server that keeps projects (with no such server there is no one to ask); the page is drawn again when it is known */
ask().then(() => { if (kept) backend.health(); else backend.absent();
  const first = kept && ['menu', 'default-menu'].find(name => kept.includes(name));
  if (first) bus.send('project.open', { name: first }).then(() => { current = 'menu'; });
  else if (!kept) fetch('projects/default-menu/files.json').then(r => r.ok ? r.json() : Promise.reject()).then(list => { const text = url => fetch(url).then(r => r.ok ? r.text() : Promise.reject());
      /* its .config is not among its files (each machine has its own): it is the one beside the directory, projects/default-menu.config */
      return Promise.all([...list.filter(path => path !== '.config').map(path => text('projects/default-menu/' + path.split('/').map(encodeURIComponent).join('/')).then(text => ({ path, text }), e => path.startsWith('.') ? null : Promise.reject(e))),
        text('projects/default-menu.config').then(text => ({ path: '.config', text }), () => null)]); })
    .then(files => bus.send('project.load', { files: files.filter(Boolean), name: 'menu' })).catch(() => {}); });   /* no server: the default Menu's files, if they sit beside the page */

async function save(name){
  let made; try { made = savedNow(); } catch (e){ return hud.say('Could not save: ' + (e && e.message ? e.message : e)); }      /* nothing a save meets is left unsaid */
  const { data, files } = made, what = `${count(data)} shapes in ${files.length} files`;
  return sendSaved(name, files, what);
}
function savedNow(){
  const data = gather();
  /* a data file no block reads now is still saved while undoing or redoing can come back to a block that reads it:
     the backend reads a file from the project's directory, so it has to be there when a step back needs it */
  for (const state of history.states()) for (const path of Object.keys(state.data.data || {})) if (!(path in data.data) && dataFiles.has(path)) data.data[path] = dataFiles.get(path);
  data.data = Object.fromEntries(Object.keys(data.data).sort().map(k => [k, data.data[k]]));
  return { data, files: project.write(data) };
}
async function sendSaved(name, files, what){
  try {
    if (kept){                                   /* on the server, under a name */
      if (!name) return hud.say('Not saved');
      const r = await fetch('api/projects/' + encodeURIComponent(name), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(files) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'the server answered ' + r.status);
      current = name; await ask(); return hud.say(`Saved ${what} to projects/${name}/`);
    }
    const bytes = zip(files.map(f => ({ path: 'project/' + f.path, text: f.text }))), downloads = await window.claude?.use?.('downloads');
    if (downloads){ await downloads.save({ filename: 'smart-factory-project.zip', data: new Blob([bytes]) }); return hud.say(`Saved ${what} as a zip`); }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })); a.download = 'smart-factory-project.zip'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000); hud.say(`Saved ${what} as a zip`);
  } catch (e) { hud.say(e.code === 'declined' ? 'Not saved' : 'Could not save: ' + (e.message || e.code || e)); }
}

/* opening replaces everything on the page */
function openFrom(files, name = null){ let data; try { data = project.read(files); } catch (e){ hud.say('Could not open: ' + (e && e.message ? e.message : e)); return shown(); }      /* what is no project this program reads is said, and nothing is replaced */
   dataFiles.clear(); dataSmall.clear(); rebuild(data); history.clear(); current = name;      /* a project just opened has no steps to undo */
  /* a project saved before format 3 may hold stacks, which then appended rows and would now be sums: project.js has fused each into one shape, and says how many */
  hud.say(`Opened ${name ? name + ': ' : ''}${count(data)} shapes` + (data.converted ? `. ${data.converted === 1 ? '1 stack was fused into one shape' : data.converted + ' stacks were each fused into one shape'}: a stack is now a sum` : '')
    /* and what could not be kept as it was: shapes at a corner, or under a shape in a product, did not touch then and do now */
    + (data.changed ? `. ${data.changed === 1 ? '1 piece reads' : data.changed + ' pieces read'} differently now: shapes that meet at a corner, or stand under one in a product, touch` : '')
    /* a use that the files drew at another size than its variable's: project.js has set it to its variable's, and says which (no page saves one) */
    /* a promise that could not be kept as the files wrote it (no number space, or written where no promise is kept): project.js has dropped it, and says which */
    + (data.unheld && data.unheld.length ? `. ${data.unheld.slice(0, 3).map(u => `${bare(u.name)}'s promise "${u.holds}" is not kept: ${u.why}`).join('; ')}${data.unheld.length > 3 ? `; and ${data.unheld.length - 3} more` : ''}` : '')
    /* a tile whose step or stop block named what is none of its own: project.js has dropped it, and says which tile (no page saves one) */
    + (data.unstepped && data.unstepped.length ? `. ${data.unstepped.slice(0, 3).map(u => `${u.tile ? 'The tile ' + u.tile : 'A tile'} named ${u.key === 'step' ? 'a step that is no arrow on its east side: it has no step now' : 'a stop block that is no block of its pattern: it has no stop block now'}`).join('; ')}${data.unstepped.length > 3 ? `; and ${data.unstepped.length - 3} more` : ''}` : '')
    + (data.resized && data.resized.length ? `. ${data.resized.slice(0, 3).map(r => `${bare(r.name)} was drawn ${r.was.cols} × ${r.was.rows} and its variable is ${r.cols} × ${r.rows}`).join('; ')}${data.resized.length > 3 ? `; and ${data.resized.length - 3} more` : ''}: every use of a variable is its size, so ${data.resized.length === 1 ? 'it has' : 'they have'} been set to it` : '')); }
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
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'c' || e.key === 'C')){ if (selected.size){ e.preventDefault(); bus.send('copy', { ids: idsOf(selected) }); } else if (pickedTile){ e.preventDefault(); bus.send('copy', { ids: [], tile: pickedTile }); } return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'x' || e.key === 'X')){ if (selected.size){ e.preventDefault(); removing('cut'); } return; }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'v' || e.key === 'V')){ if (clipboard){ e.preventDefault(); bus.send('paste', { at: { x: view.camera().x, y: view.camera().y }, pasted: clipboard }); } return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') return bus.send('escape');      /* with nothing selected, Escape steps out of a definition space */
  /* s: drag a box; every block it touches is selected, with its group. Press s again to leave without selecting. */
  if (e.key === 's' || e.key === 'S') return bus.send('select.box');
  /* F2 or Enter: rename the one selected block (the way to rename a block in a sum, whose name is written on it) */
  if ((e.key === 'F2' || e.key === 'Enter') && selected.size === 1){ e.preventDefault(); return renaming([...selected][0]); }
  /* with a tile selected: F2 or Enter names it; x, Backspace or Delete takes the tile off, leaving its blocks */
  if (pickedTile && !selected.size && (e.key === 'F2' || e.key === 'Enter')){ e.preventDefault(); return nameTile(pickedTile); }
  if (pickedTile && !selected.size && (e.key === 'x' || e.key === 'X' || e.key === 'Backspace' || e.key === 'Delete')){ e.preventDefault(); return untiling(pickedTile); }
  /* f frames the selection; on a selection that is one frame already, it takes the frame off */
  if ((e.key === 'f' || e.key === 'F') && selected.size){ e.preventDefault(); const list = [...selected], g = groupIs(list);
    return g !== null ? (space.repeats.has(g) ? untiling(g) : bus.send('unframe', { frame: g })) : bus.send('frame', { ids: idsOf(list) }); }
  if ((e.key === 't' || e.key === 'T') && selected.size){ e.preventDefault(); return bus.send('transpose', { ids: idsOf(selected) }); }      /* t transposes the selection */
  /* x, Backspace or Delete removes the selected blocks. (Typing in a name or a measurement never reaches here.) */
  if ((e.key === 'x' || e.key === 'X' || e.key === 'Backspace' || e.key === 'Delete') && selected.size){ e.preventDefault(); removing('delete'); }
});

/* ---- drags that begin on a block ----
   By a side or corner: resize it. On a selected block: move every selected block. Both go in steps of the dots on
   screen. Anything else is left to the view, which pans. */
function dragged(el, from, e){
  const onTile = el.closest?.('[data-tile]');      /* a tile's frame: its edge, or the rest of it */
  if (onTile && space.repeats.has(onTile.dataset.tile) && !el.isContentEditable) return dragTile(onTile.dataset.tile, onTile.dataset.tileEdge || null, from, !!e?.shiftKey);
  const b = blockAt(el);
  if (!b || el.isContentEditable) return;
  if (isArrow(b) && selected.has(b) && selected.size === 1) return dragArrow(b, el, from);
  if (b.seat && selected.has(b) && selected.size === 1 && !el.dataset.grip) return dragSeated(b, from);
  if (el.dataset.grip && b.from?.index){ hud.say(`${bare(b.name)} is the index of its block: it is that block's size`); return { end(){}, move(){} }; }
  if (el.dataset.grip && (b.seat || b.in)){ hud.say(b.in ? 'in is the function\'s input: its size is what the arrow covers' : `${bare(b.name)} is seated: its size is the output's`); return { end(){}, move(){} }; }
  const g = view.grid(), snap = v => Math.round(v / g) * g, cursor = c => { view.el.style.cursor = c; };
  /* while a drag lasts the blocks follow the pointer directly. When it ends they are put back as they were, and one
     message, 'place', says where every block that moved or changed size now goes. */
  const before = new Map(everyKnown().map(b => [b, b.rect])), tilesBefore = placesOfTiles();      /* a tile that followed its arrow during the drag is put back too */
  /* a side pulled longer takes with it every length of its name, an inner axis's among them: those are put back too, and go in the message */
  const axesBefore = []; for (const b of everyKnown()) (b.inner || []).forEach((a, i) => { if (!axesBefore.some(x => x[1] === a)) axesBefore.push([b, a, i, a.length]); });
  const collect = () => { const rects = [], axes = []; for (const [r, x, y] of tilesBefore){ r.x = x; r.y = y; }      /* everything back as it was; gives where what moved was let go */
    for (const [b, a, i, length] of axesBefore) if (a.length !== length){ axes.push({ id: b.id, index: i, length: a.length }); a.length = length; }
    for (const [b, r] of before) if (b.rect !== r){ if (b.rect.x !== r.x || b.rect.y !== r.y || b.rect.w !== r.w || b.rect.h !== r.h) rects.push({ id: b.id, ...b.rect }); b.set(r); }
    return { rects, axes }; };
  const settle = () => { const { rects, axes } = collect(); if (rects.length || axes.length) bus.send('place', { rects, ...(axes.length ? { axes } : {}) }); else shown(); };
  const end = () => { cursor(''); settle(); };
  const grip = el.dataset.grip;
  if (grip && rangedOf(b)){ hud.say(`${bare(b.name)} is part of ${partOf(b)}: its size is that part's`); return { end(){}, move(){} }; }      /* it is as large as its range, and cannot be pulled larger or smaller */
  if (grip && fileHeld(b)){ hud.say(fileHeld(b)); return { end(){}, move(){} }; }      /* it is as large as its file */
  if (grip && orderOf(b)){ hud.say(`${bare(b.name)} is turned here: its sides are its variable's axes. Change them on the shape it was made as`); return { end(){}, move(){} }; }
  if (grip){                                    /* the opposite side or corner stays where it is; never smaller than one square */
    if (!selected.has(b) || selected.size > 1) pick([b]);
    const r = b.rect, right = r.x + r.w, bottom = r.y + r.h;
    cursor(getComputedStyle(el).cursor);
    return { end, move(p){
      const x0 = grip.includes('w') ? Math.min(snap(p.x), right - g) : r.x, x1 = grip.includes('e') ? Math.max(snap(p.x), r.x + g) : right;
      const y0 = grip.includes('n') ? Math.min(snap(p.y), bottom - g) : r.y, y1 = grip.includes('s') ? Math.max(snap(p.y), r.y + g) : bottom;
      /* what touches its right side follows that side; pulling its own left side away from a neighbour is allowed */
      if (madeOne(b, x1 - x0, y1 - y0)){ hud.say(nesting.sizable(1, 1, 1).refused); return; }      /* pulled down to one square: it stays as it was */
      keepTouching(() => { b.set({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); agree(b); }, (left, right) => right === b || (left === b && !grip.includes('e') && !b.sides.w));
      shown(); } };
  }
  /* shift, on a block in a group: that one block is pulled free. Its groups' frames stay where they are while it is
     carried; let go outside them, it has left. (Let go still inside one, it is in that one.) */
  const pulled = e?.shiftKey && chain(b).length ? chain(b).map(id => [id, frameBox(id)]) : null;
  if (pulled){ pick([b]); room.loose = new Map(pulled); }
  if (!selected.has(b)) return;
  const start = [...selected].map(b => [b, b.rect]);
  let last = from, said = false;
  cursor('move');
  /* held over a group, that group lights up; let go there and the selection joins it */
  const held = new Set(selected), u = view.unit;
  const others = [...framesIn(space)].filter(id => { const m = inGroup(id); return (m.length || space.repeats.has(id) || sidesIn(space).includes(id)) && !m.some(x => held.has(x)); })
    .map(id => [id, frameBox(id)]);      /* a tile takes what is let go on its pattern, blank or not */      /* they do not move during the drag, so their boxes are worked out once */
  const within = (p, r) => p.x >= r.x - u / 2 && p.x <= r.x + r.w + u / 2 && p.y >= r.y - 1.25 * u && p.y <= r.y + r.h + u / 2;      /* the frame stands a little off its blocks, more above */
  return {
    end(){ const host = room.host; room.host = null; room.loose = null;
      /* one block let go on an arrow's output is seated there, where it can be (arrows.js: seatable) */
      const onto = !pulled && held.size === 1 && !isArrow(b) && !b.seat ? outputUnder(b) : null;
      if (onto){ cursor(''); for (const [k, r] of before) if (k.rect !== r) k.set(r); for (const [r, x, y] of tilesBefore){ r.x = x; r.y = y; } return bus.send('seat', { arrow: onto.id, id: b.id }); }
      if (pulled && host === null){ const stays = pulled.find(([, r]) => within(last, r)), t = tileOf(b);      /* innermost first */
        /* out of its tile, its index matrices would be left defining it as nothing: they go with it, after the warning. Nothing is done until that is answered. */
        const leaves = t !== undefined && !(stays && upFrom(stays[0]).some(g => space.repeats.has(g))), rects = (cursor(''), collect()); shown();      /* still in a tile (the one round the tile it left), it still has an index */
        return warned([], 'Taking out', 'Take out', also => { if (rects.length) bus.send('place', { rects }); bus.send('frame.leave', { id: b.id, frame: stays ? stays[0] : null, also: idsOf(also) }); }, [], [], bare(b.name), leaves ? [b.id] : []); }
      /* let go on a frame they cannot go into (a whole tile that would be parted from the pattern it lies in): nothing is moved */
      if (host !== null && !enterFrame(idsOf(held), host, true)){ cursor(''); collect(); return shown(); }
      end();
      if (host !== null) bus.send('frame.enter', { ids: idsOf(held), frame: host }); },
    move(p){ let dx = snap(p.x - from.x), dy = snap(p.y - from.y), stopped = null; last = p;
      /* a block that belongs to a tile stays inside the tile's pattern (tiles.js: held) unless it is being pulled out with Shift */
      if (!pulled) for (let pass = 0; pass < 2; pass++) for (const [k, r] of start){ const t = isArrow(k) || k.seat ? undefined : tileOf(k), rep = t !== undefined && space.repeats.get(t), at = { x: r.x / u, y: r.y / u, w: r.w / u, h: r.h / u };
        if (!rep || !tiles.within(rep, at)) continue;
        const to = tiles.held(rep, at, dx / u, dy / u); if (to.stopped){ dx = to.dx * u; dy = to.dy * u; stopped = k; } }
      if (stopped && !said){ said = true; hud.say(`${bare(stopped.name)} is in a tile: it stays inside the pattern. Hold Shift to drag it out`); }
      for (const [b, r] of start) b.set({ ...r, x: r.x + dx, y: r.y + dy });
      const over = stopped ? [] : others.filter(([, r]) => within(p, r));
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
  /* a tile's frame or its name: the tile is selected; its name, once it is, is typed over */
  const onTile = el.closest?.('[data-tile]');
  if (onTile && space.repeats.has(onTile.dataset.tile)){ const g = onTile.dataset.tile;
    return onTile.dataset.tileGrab === 'name' && pickedTile === g ? nameTile(g) : bus.send('tile.pick', { frame: g }); }
  /* a shape standing in a matrix: it is the real shape, shown where it stands. A double click opens it, as it would on the canvas. */
  const stood = el.closest?.('[data-standing]');
  if (stood){ if (twice) bus.send('open', { id: stood.dataset.standing }); return; }
  /* an entry of this space's own matrix, if its block has been named: type a value or a formula over it. Nothing typed puts the symbol back. */
  const entry = el.closest?.('.definition.editable [data-c]');
  if (entry){
    if (entry.querySelector('.formula')) return;      /* a click in the field that is already open there */
    if (entry.dataset.nested) return hud.say(`An entry of ${bare(space.owner.name)} holds ${nesting.described(1, 1, dataOf(space.owner)).replace('single entry holding ', '')}: step out, select ${bare(space.owner.name)} and press the entry in its properties to open it`);
    const [o, key] = space.owner.members ? entryHome(space.owner, +entry.dataset.c, +entry.dataset.r) : [space.owner, entry.dataset.c + ',' + entry.dataset.r];      /* the definition is written the variable's own way round */      /* in a joined shape, the entry belongs to the shape it came from */
    pick([]); return typeEntry(entry, o, key);
  }
  /* an arrow's output: name it, and a block of that name is seated on it */
  const out = [...outs].find(([, o]) => o.el.isConnected && o.el.contains(el));
  if (out){ const [a, o] = out; pick([]); return o.name(name => { if (name) bus.send('seat', { arrow: a.id, name }); }); }
  /* a result's matrix: name it, and the blocks that came to it fold into a new block */
  const r = results.find(r => r.el.isConnected && r.el.contains(el));
  if (r){ const piece = r.piece;
    /* one named shape on its own: an entry of its matrix is typed over where it is written */
    if (piece.blocks.length < 2){ const cell = el.closest?.('.result.editable .result-body [data-c]'); if (!cell || cell.querySelector('.formula')) return;
      if (cell.dataset.nested){ const b = piece.blocks[0]; select([b]); opened = { id: b.id, path: [[+cell.dataset.c, +cell.dataset.r]] }; return shown(); }      /* it holds inner data: the entry is opened in the properties panel, where its numbers are typed */
      const [o, key] = entryHome(piece.blocks[0], +cell.dataset.c, +cell.dataset.r); pick([]); return typeEntry(cell, o, key); }
    /* written in a hollow: the name seats a block there, and the two shapes stay where they are */
    if (piece.hollows.length){ pick([]); return r.name(name => { if (name) bus.send('seat', { hollow: idsOf(piece.blocks), name }); }); }
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

/* lets the user type a tile's name, where it is written */
function nameTile(g){ const tile = space.tiles.get(g); if (!tile) return; tile.nameEl.textContent = space.groupNames.get(g) || '';
  editText(tile.nameEl, name => name && name !== space.groupNames.get(g) ? bus.send('name', { frame: g, ids: [], name, color: null }) : shown()); }
/* what choosing a shape from "New" does, by the shape's "draw" */
const draw = {
  /* a tile: a rectangle dragged round blocks or over empty canvas is its pattern */
  tile: () => { select([]); hud.say('Drag a rectangle round blocks, or over empty canvas: it is the pattern that repeats'); let last = null;
    const u = view.unit, one = (r, sketch) => { last = r; sketch.set({ x: r.x, y: r.y, unit: u, xs: [{ cell: 1, at: 0, size: r.w / u }], ys: [{ cell: 1, at: 0, size: r.h / u }], w: r.w / u, h: r.h / u, selected: true }); };
    return drawRectangle(view, rect => { const sketch = createTile(); one(rect, sketch); return { el: sketch.el, set: r => one(r, sketch) }; }).then(made => { if (!made) return; made.el.remove();      /* what was drawn was a sketch: the message makes the tile */
      bus.send('tile.add', { rect: last }); }); },
  rectangle: (shape, source = null) => { select([]); const name = freeName();
    return drawRectangle(view, rect => createBlock(shape, rect, name)).then(block => { if (!block) return; block.el.remove();      /* what was drawn was a sketch: the message makes the block */
      bus.send('add', { type: shape.name, rect: block.rect, name, ...(source ? { source } : {}) }); }); },
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
   project; the rest look at it, move about in it, or change what is selected.
   (Phase 7 adds one: source.set { id, seed, dist } for a noise block, or { id, file, cols, rows } for a file block,
   whose file's text is already held under that path: see "data files". Asking the backend is no message: it changes
   nothing in the project.)
   (Phase 9 adds conditional { ids }: the blocks named, exactly one piece, are made a condition: see "make conditional".) */
const changes = { changes: true };
/* Whatever a message did, no tile is left with a step or a stop block that is none (unstep): looked at when each
   message the user caused is over, in every space, so that the project as it stands after the message is the one
   that is saved, undone to and redone to. (The messages that turn, move or delete say so themselves; this is for
   any that do not.) */
bus.tap((phase, message) => { if (phase !== 'after' || !message.changes || message.depth) return;
  let gone = 0; for (const s of new Set([top, ...spaceOf.values()])) gone += unstep(s); if (gone) shown(); });
/* ---- undo and redo ----
   History is a tap on the bus (history.js). What it keeps is the whole project as it is saved, with where the user
   was: the space they were in and what was selected (blocks, or a tile). Putting one back rebuilds the project from it (every block and
   group has its id again), keeps each space's view where it now is, and goes back to that place. */
const history = createHistory(bus, {
  /* text: what two states are compared by. JSON writes both infinities as null, so here they are written as a saved file has them, and ∞ to -∞ is a step */
  snap: () => { const data = gather(); return { data, text: JSON.stringify(data.top, (key, v) => v === Infinity ? 'inf' : v === -Infinity ? '-inf' : v), path: trail().slice(1).map(s => s.owner.id), selected: idsOf(selected), tile: pickedTile }; },
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
    if (state.tile && space.repeats.has(state.tile)){ pickedTile = state.tile; shown(); }      /* or the tile that was */
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
    const frame = g => { const m = frameBox(g), grow = namedBelow(g); return { x: m.x - 12 - 14 * grow, y: m.y - 32 - 34 * grow, w: m.w + 2 * (12 + 14 * grow), h: m.h + 32 + 34 * grow + 12 + 14 * grow }; };      /* as bounds.js draws it */
    const within = f => r.x > f.x && r.y > f.y && r.x + r.w < f.x + f.w && r.y + r.h < f.y + f.h;
    pick(new Set(hit.flatMap(b => { const g = chain(b).reverse().find(g => !within(frame(g))); return g === undefined ? [b] : inGroup(g); }))); }); });
bus.on('escape', () => { const b = selected.size === 1 ? [...selected][0] : null;
  if (b && openPath(b).length && !boxing){ opened = { id: b.id, path: opened.path.slice(0, -1) }; return shown(); }      /* an entry is open in the panel: back up one level */
  return selected.size || pickedTile || !space.parent || boxing ? select([]) : out(); });      /* with nothing selected, Escape steps out of a definition space */
bus.on('open', ({ id }) => { const b = blockOf(id); if (b) open(b); });
bus.on('space.out', out); bus.on('space.back', backIn);
bus.on('space.go', ({ index }) => { deeper.length = 0; go(trail()[index]); });
bus.on('camera', camera => { hud.show(camera); menu.close(); shown(); });
bus.on('camera.home', () => view.home());
bus.on('menu.open', ({ x, y, id }) => { const b = id && blockOf(id); menuOn = b && space.blocks.includes(b) ? b : null; if (b && !selected.has(b)) select(members(b));      /* a right click on a block that is not selected selects it first */
  menuAt = view.toWorld(x, y); menu.openAt(x, y); });
bus.on('variable.drag', ({ kind, x, y }) => { if (selected.size && !openField) select([]); if (kind === 'length' && !openField?.over(x, y)) reach(x, y); });      /* while a formula is being typed the selection stays, and with it the panel the formula is in */
bus.on('variable.end', () => { for (const m of near.values()) m.el.remove(); near.clear(); });
bus.on('new', ({ type, source = null }) => { if (type === 'tile') return draw.tile(); const shape = typeNamed(type); return draw[shape.draw]?.(shape, sourceKept(source)); });      /* begins drawing; 'add' is the block. source: the kind of source to draw (sources.js), for a tensor */
bus.on('copy', ({ ids: list = [], tile = null }) => {
  if (tile){ if (space.repeats.has(tile) && !copy(tile)) hud.say('That tile holds nothing: there is nothing to copy'); return shown(); }      /* a tile selected by its edge or its name */
  selected.clear(); for (const b of list.map(blockOf)) if (b) selected.add(b); copy(); shown(); });
bus.on('save', ({ name = null }) => save(name));      /* name: what was typed when asked what to save it as */
bus.on('project.open', ({ name }) => openKept(name)); bus.on('project.pick', () => zipPicker.click());
/* changing the project */
bus.on('project.load', ({ files, name = null }) => openFrom(files, name), changes);
/* a source's settings. Noise: its seed, its distribution. A file: which file of the project it reads, and the size that file has, which the block takes. Every use of the variable is the one source. */
bus.on('source.set', ({ id, seed, dist, file, cols, rows }) => { const b = blockOf(id), kind = b && sourceKind(b.source); if (!b || (kind !== 'noise' && kind !== 'file')) return;
  const next = kind === 'noise' ? noiseOf(seed === undefined ? b.source.noise.seed : seed, dist === undefined ? b.source.noise.dist : dist) : sourceKept({ file });
  if (kind === 'file' && !next.file) return hud.say('That is not a file a project may hold: a data file is data/ and one name ending .csv');
  for (const k of kinOf(b)) k.source = next;
  if (kind === 'file' && Number.isInteger(cols) && Number.isInteger(rows) && cols >= 1 && rows >= 1){ const u = view.unit, o = originOf(b), over = turned(o);
    o.set({ ...o.rect, w: (over ? rows : cols) * u, h: (over ? cols : rows) * u }); agree(o); hud.say(`${bare(b.name)} reads ${next.file}: ${cols} wide × ${rows} tall`); }
  shown(); }, changes);
bus.on('add', ({ type, rect, name, source = null }) => { if (unnameable(name)) return shown(); const b = makeBlock({ ...typeNamed(type) }, rect, name); if (sourceKept(source)) b.source = sourceKept(source); space.blocks.push(b); view.world.append(b.el); shown(); }, changes);
/* place { rects, axes }: where blocks go, and how big: the end of a move or a resize. axes, where a side that was
   pulled carries the name of an inner axis: [{ id, index, length }], that axis of that block's variable at its new
   length. Every length the gesture changed is in the message, so that a step back puts every one of them back.
   A block that holds inner data is not made one by one (inner.js: sizable): it keeps the size it had. */
bus.on('place', ({ rects, axes = [] }) => { const u = view.unit;
  for (const a of axes){ const b = blockOf(a.id), axis = b && (b.inner || [])[a.index]; if (axis && nesting.lengthOk(a.length).ok) axis.length = a.length; }
  for (const r of rects){ const b = blockOf(r.id); if (!b) continue;
    if (madeOne(b, r.w, r.h)){ hud.say(nesting.sizable(1, 1, 1).refused); b.set({ ...b.rect, x: r.x, y: r.y }); continue; }
    if ((r.w !== b.rect.w || r.h !== b.rect.h) && fileHeld(b)){ hud.say(fileHeld(b)); b.set({ ...b.rect, x: r.x, y: r.y }); continue; }      /* a block that reads a file goes where it is put, at the file's size */
    b.set({ x: r.x, y: r.y, w: r.w, h: r.h }); }
  shown(); }, changes);
/* these act on the blocks they name: what was selected when they were sent. paste carries what it pastes. */
const chosen = fn => ({ ids: list }) => { selected.clear(); for (const b of list.map(blockOf)) if (b && space.blocks.includes(b)) selected.add(b); return fn(); };
const going = fn => ({ ids: list, also = [] }) => { selected.clear(); for (const b of list.map(blockOf)) if (b && space.blocks.includes(b)) selected.add(b); return fn(also.map(blockOf).filter(Boolean)); };      /* also: what goes with them, in any space */
bus.on('cut', going(cut), changes); bus.on('delete', going(remove), changes);
bus.on('transpose', chosen(transpose), changes);
/* the boolean tool: the new blocks' ids are made in the handler, from the project's own source, so the same message makes the same ids again */
bus.on('difference', chosen(differenceOf), changes); bus.on('intersect', chosen(intersectOf), changes); bus.on('revert', going(revert), changes);
bus.on('paste', ({ at, pasted }) => { if (unnameable(...namesOf(pasted))) return shown(); paste(at, pasted); }, changes);
/* what comes from outside the program is a message too, so the log says so: the theme the computer asks for */
bus.on('theme', ({ set }) => { if (set !== undefined) hostTheme = set; defaults = null; shown(); });
bus.on('rename', ({ id, name, color }) => { const b = blockOf(id); if (!b) return;
  if (b.in){ hud.say('in is the function\'s input: that is its name'); b.call('in'); return shown(); }
  if (unnameable(name)) return shown();
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
       block with that id (which must be one that can be seated; the arrow's output size becomes its size), or a new one of that name,
       in that colour or, with none given, one drawn here from the project's own chance, so that undoing it puts that back too.
   unseat { id }: the block is no longer seated. It stays where it is, with the entries it had before. */
/* tiles (tiles.js has every rule; see "tiles", above).
   tile.pick { frame }: the tile is selected, in place of any blocks. Changes nothing.
   tile.add { rect }: a tile drawn as that rectangle (world coordinates): its pattern. The blocks wholly inside it are
       in it; with none it is empty. Counts start at 1. Drawn wholly inside another tile's pattern it is in that
       tile; drawn round all of other tiles they are in it. Refused over another tile in any other way.
   tile.set { frame, x, y, cols, rows, across, down }: whichever are given, changed. x, y move the tile, its blocks and
       the tiles inside it: let go wholly inside another tile's pattern it is then in that tile, and clear of the
       one it was in it has left it. cols, rows are the pattern's size; across, down a count: a whole number of at
       least 1, or { expr } that comes to one from what is settled (a width, a height, a settled scalar's mass).
       Refused, with a sentence, where a count is no such number or depends on its own tile's size,
       the tiles would come to overlap where they did not (one lying over another, or a tile running past the
       pattern of the tile it is in), or it is to be moved and an arrow is repeated in it.
   frame.enter { ids, frame }: as for any frame; a whole tile among the blocks goes into a tile only where it lies
       wholly inside that tile's pattern.
   frame { ids }, frame.enter: refused, with a sentence and nothing changed, where the frame made or entered would
       part a tile from the pattern it lies in (framing, above the handlers).
   frame.leave { id, frame, also }, tile.remove { frame, also }: also carries the index matrices of a block that is then in no tile.
   tile.remove { frame, also }: the tile is taken off. Its blocks, and the tiles in its pattern, stay: they are then in
       the tile it was in, or in none. also: the arrows that read it, and what goes with them.
   index.add { of, axis, at, stand }: the index of the block `of` (which is in a tile) as a matrix, index.x or
       index.y, set down in that block's definition space at a point; with stand, standing in the definition's matrix. */
bus.on('tile.pick', ({ frame }) => { selected.clear(); pickedTile = space.repeats.has(frame) ? frame : null; shown(); });
bus.on('tile.add', ({ rect }) => addTile(rect), changes);
bus.on('tile.set', setTile, changes);
bus.on('tile.remove', ({ frame, also = [] }) => { if (!space.repeats.has(frame)) return; ungroup(frame); tidy(); if (pickedTile === frame) pickedTile = null;
  discard(also.map(blockOf).filter(Boolean)); shown(); hud.say('The tile is taken off: what was in its first cell stays'); }, changes);
bus.on('index.add', ({ of, axis, at, stand = false }) => { const owner = space.owner && [...kinOf(space.owner)].some(k => k.id === of) ? space.owner : null, u = view.unit, on = v => Math.round(v / u) * u;
  if (!owner) return hud.say('The index of a block goes into that block\'s own definition space');
  if (tileOf(owner, spaceWith(owner)) === undefined) return hud.say(`${bare(owner.name)} is in no tile: it has no index`);
  const which = axis === 'y' ? 'y' : 'x', b = makeBlock({ ...typeNamed('tensor'), color: owner.shape.color }, { x: on(at.x - owner.rect.w / 2), y: on(at.y - owner.rect.h / 2), w: owner.rect.w, h: owner.rect.h }, 'index.' + which);
  b.from = { id: owner.id, index: which }; b.ref = true; space.blocks.push(b); view.world.append(b.el);
  if (stand) return slotIn(owner, b, 0, 0);
  select([b]); }, changes);
bus.on('arrow.add', addArrow, changes);
/* conditional { ids }: the blocks named, one piece, are made a condition (see "make conditional") */
bus.on('conditional', ({ ids }) => makeConditional(ids.map(blockOf).filter(b => b && space.blocks.includes(b))), changes);
bus.on('arrow.set', setArrow, changes);
/* step { id }: the arrow named, on a tile's east side, is made that tile's step, or is no longer; until { id }: the block named, in a tile's pattern, is made that tile's stop block, or is no longer */
bus.on('step', ({ id }) => setStep(id), changes);
bus.on('until', ({ id }) => setUntil(id), changes);
bus.on('seat', seatBlock, changes);
bus.on('unseat', ({ id }) => { const b = blockOf(id); if (b && b.seat) b.seat = null; else hud.say('That block is not seated'); shown(); }, changes);
/* what is typed into an entry: text is as it was typed (capsules in their stored form; a name typed out after an @ is
   bound to its capsule here), null for nothing typed, which puts the symbol back. What is stored is expression.js's
   to say (entered): a literal value or a formula, and never a formula's result. settle: a formula of numbers alone
   is stored as what it comes to (a scalar's mass worked out from a side typed for it). What cannot be read is not kept. */
bus.on('entry.set', ({ id, key, text = null, settle = false }) => { const o = blockOf(id);
  if (o && measures(o)){ const src = sourceOf(o); hud.say(`${bare(o.name)} is a length of ${src ? bare(src.name) : 'another shape'}: change it there`); return shown(); }
  if (o && rangedOf(o)){ hud.say(`${bare(o.name)} is part of ${partOf(o)}: change it there`); return shown(); }      /* a part has no entries of its own */
  if (o && takenOf(o)){ hud.say(`${bare(o.name)} is an entry of ${partOf(o)}: change it there`); return shown(); }      /* nor has an entry taken out */
  if (o && key.split(',').length !== 2 + dataOf(o).length){ hud.say(`${key} is not an entry of ${bare(o.name)}: ${dataOf(o).length ? 'its entries hold inner data, and a number is typed in one that is opened' : 'it holds one number to an entry'}`); return shown(); }
  if (o && indexedOf(o)){ hud.say(`${bare(o.name)} is the index of its block: its numbers are that block's place in its tile`); return shown(); }
  if (o && typable(o.source, bare(o.name)).refused){ hud.say(typable(o.source, bare(o.name)).refused); return shown(); }      /* nor has a source */
  if (o && (isArrow(o) || givenOf(o) || seatedOf(o))){ hud.say(isArrow(o) ? 'An arrow\'s output is worked out: change its input or its formula' : givenOf(o) ? 'in is whatever the arrow is given: change the arrow\'s input' : `${bare(o.name)} is seated: its value is the arrow's output`); return shown(); }
  if (o){ const t = text === null ? { text: '' } : bound(text, reachList()), got = t.refused ? t : entered(t.text, lookupFor(o), { settle });
    if (got.refused) hud.say(`Not kept: ${got.refused}`);
    else { if (got.clear) o.values.delete(key); else o.values.set(key, got.value); touched(o.values);
      keepTouching(() => { for (const k of kinOf(o)) agree(k); }); } }      /* a single entry's number is its sides' length: whatever shares their names follows */
  write(); shown(); }, changes);
/* holds.set { id, holds }: what a block's variable promises to hold: a number space as it is written, "integer?", or
   null for no promise. A word that is no space is refused, with why (complex is reserved, and not built). */
bus.on('holds.set', ({ id, holds = null }) => { const b = blockOf(id); if (!b) return;
  if (isArrow(b)){ hud.say('An arrow holds nothing: what it takes is its in block\'s to promise, and what it gives the block\'s seated on its output'); return shown(); }
  const got = holds === null || holds === '' ? { holds: null } : promiseRead(holds);
  if (got.refused){ hud.say(`Not kept: ${got.refused}`); return shown(); }
  if (got.holds) attrsOf(b).holds = got.holds; else delete attrsOf(b).holds;
  write(); shown(); }, changes);
bus.on('attr.add', ({ id }) => { const b = blockOf(id); if (b){ const list = attrsOf(b); let n = list.length + 1; while (list.some(a => a.name === 'attribute' + n)) n++; list.push({ name: 'attribute' + n, text: '' }); } shown(); }, changes);
bus.on('attr.set', ({ id, index, name, text }) => { const b = blockOf(id), a = b && attrsOf(b)[index]; if (a && unnameable(name)) return shown(); if (a){ if (name !== undefined) a.name = name;
    if (text !== undefined){ const t = bound(text, reachList()); if (t.refused) hud.say(`Not kept: ${t.refused}`); else a.text = t.text; }      /* a name typed out after an @ is bound to its capsule */
    if (!a.name.trim() && !a.text.trim()) attrsOf(b).splice(index, 1); }      /* with neither a name nor a value, it is gone */
  shown(); }, changes);
bus.on('side.set', ({ id, dim, text }) => { const b = blockOf(id); if (b) typed(b, dim, text); shown(); }, changes);
/* inner.count { id, count }: the shape's variable has that many inner axes (inner.js: resized), and its entries are
   keyed to suit (rekeyed). inner.set { id, index, length } or { id, index, name }: one axis's length, or its name
   ('' takes the name off). A named axis is one length with every side and axis of that name, as a named side is.
   entry.take { id, col, row, at }: a block that is that entry of the shape, set down at a world point. */
bus.on('inner.count', ({ id, count }) => { const b = blockOf(id), o = b && originOf(b); if (!o || isArrow(o)) return;
  const can = nesting.countable({ name: bare(b.name), scalar: single(b), source: sourceKind(b.source), part: !!rangedOf(b), entry: !!takenOf(b), measure: measures(b) || !!indexedOf(b), seated: !!seatedOf(b), input: !!givenOf(b) }, count);
  if (can.refused || b.members || orderOf(b)){ hud.say(can.refused || (b.members ? `${bare(b.name)} is fused from other shapes: it holds what they hold` : `${bare(b.name)} is turned here: change its data dimensions on the shape it was made as`)); return shown(); }
  const next = nesting.resized(o.inner, count), keyed = nesting.rekeyed(o.values, o.inner, next);
  o.values.clear(); for (const [k, v] of keyed.entries) o.values.set(k, v); touched(o.values);      /* in place: every use shares the one Map, and the one list */
  for (const k of kinOf(o)) if (k.axes){ k.axes = null; hud.say(`${bare(k.name)} has other axes now: its uses are no longer turned`); }      /* an order names every axis: with another number of them it is no order */
  o.inner.splice(0, o.inner.length, ...next);
  keepTouching(() => agree(o));
  if (opened.id === b.id) opened = { id: b.id, path: [] };
  write(); shown(); }, changes);
bus.on('inner.set', ({ id, index, length, name }) => { const b = blockOf(id), a = b && axesOf(b)[index];
  if (!a){ if (b) hud.say(`${bare(b.name)} has no such axis of its own to change`); return shown(); }
  if (unnameable(name)) return shown();
  keepTouching(() => {
    if (length !== undefined){ const can = nesting.lengthOk(length); if (can.refused){ hud.say(can.refused); return; } a.length = length; }
    if (name !== undefined){ const called = String(name).trim();
      if (!called) a.name = null;
      else if (sidesCalled(called, space).some(([o, d]) => sideLength(o, d) === null)){ hud.say(`${called} is not a whole number: it cannot be an axis's length`); return; }
      else { a.name = null; const has = lengthCalled(called, space, null); a.name = called; if (has !== undefined) a.length = Math.round(has / view.unit); } }      /* the length the name has here or above already; a new name is this axis's length */
    for (const k of kinOf(b)) agree(k); });
  write(); shown(); }, changes);
/* turn { id, order }: the use draws its variable's axes in that order (every axis once: columns 0, rows 1, inner
   ones from 2). An order that moves nothing takes the turn off, and one that only swaps columns and rows is T. */
bus.on('turn', ({ id, order }) => { const b = blockOf(id); if (!b) return;
  const can = turnableNow(b), kind = can.refused ? null : nesting.plainly(order, (originOf(b).inner || []).length);
  if (can.refused || !kind){ hud.say(can.refused || 'An order names each of its axes once'); return shown(); }
  keepTouching(() => { setOrder(b, order); });
  if (opened.id === b.id) opened = { id: b.id, path: [] };
  const names = nesting.axisLabels(variableAxes(b));
  hud.say(kind === 'turned' ? `${bare(b.name)} turned: it draws ${names[order[0]]} by ${names[order[1]]}` : kind === 'transposed' ? `${bare(b.name)} is its transpose here` : `${bare(b.name)} lies as its variable does`);
  write(); shown(); }, changes);
bus.on('entry.take', ({ id, col, row, at }) => { const src = blockOf(id), data = src ? dataOf(src) : [], u = view.unit, on = v => Math.round(v / u) * u;
  if (!src || !data.length){ hud.say('Only a shape whose entries hold inner data has an entry to take out'); return shown(); }
  if (!nesting.pathType(typeAsDrawn(src), [[col, row]])){ hud.say(`${bare(src.name)} has no entry ${col},${row}`); return shown(); }
  if (!space.blocks.includes(src)){ hud.say(`${bare(src.name)} is not on this canvas: take its entry out where it is`); return shown(); }
  const t = nesting.entryType(data), b = makeBlock({ ...typeNamed('tensor') }, { x: on(at.x - t.cols * u / 2), y: on(at.y - t.rows * u / 2), w: t.cols * u, h: t.rows * u }, freeName());
  b.from = { id: src.id, entry: { col, row } }; b.sides = { w: t.colsName, h: t.rowsName };
  space.blocks.push(b); view.world.append(b.el); select([b]); shown();
  hud.say(`Entry ${col},${row} of ${bare(src.name)}: it follows what that entry holds`); }, changes);
/* a frame is several shapes held together (in the code, and in projects saved before, a group) */
/* A framing gesture: frames made, entered or left. A whole tile among the blocks goes as a tile, and framing never
   moves a tile's pattern: so where the gesture would part a tile from the pattern it lies in (take an inner tile's
   frame out of the outer tile's, or put it in a tile it does not lie in), it is undone and refused with a sentence
   (tiles.js: reframed). Gives whether it stood. */
function framing(change, trial = false){      /* trial: undone whether or not it could stand */
  const before = tileList(space), was = [space.groupOf, space.groupUp, space.groupNames, space.repeats].map(m => [m, new Map(m)]), at = ids.state();
  change();
  const can = tiles.reframed(before, tileList(space)); if (!can.refused && !trial) return true;
  for (const [m, kept] of was){ m.clear(); for (const [k, v] of kept) m.set(k, v); } ids.restore(at);      /* and no id is used up by what did not happen */
  if (can.refused){ hud.say(can.refused); shown(); }
  return !can.refused;
}
bus.on('frame', ({ ids }) => { if (!framing(() => group(ids.map(blockOf).filter(Boolean)))) return; shown(); hud.say('Framed: click its name to name it'); }, changes);
bus.on('unframe', ({ frame: g }) => { if (sidesIn(space).includes(g)){ hud.say('That frame is a side of the condition: it stays, empty or not. An empty side is None'); return shown(); }
  if (space.repeats.has(g)){ hud.say('That frame is a tile: select the tile by its edge or its name, and press Delete to take it off'); return shown(); }
  ungroup(g); tidy(); shown(); hud.say('Frame taken off'); }, changes);
bus.on('frame.enter', ({ ids, frame }) => { enterFrame(ids, frame); }, changes);
/* blocks let go on a frame go into it. trial: only whether they would, with the sentence where they would not, and nothing changed (a drag asks before it sets the blocks down there) */
function enterFrame(ids, host, trial = false){ const held = new Set(ids.map(blockOf).filter(Boolean));
  /* a whole tile among what is let go goes in as a tile: into a tile, only where it lies wholly inside that tile's pattern (tiles.js: enterable, allowed) */
  const to = upFrom(host).find(g => space.repeats.has(g)), whole = [...new Set([...held].flatMap(b => tilesOf(b)).filter(g => inGroup(g).every(x => held.has(x))))].filter((g, _, all) => !tilesAbove(space, g).some(k => all.includes(k)));
  const fits = to === undefined || whole.every(g => g !== to && !tilesAbove(space, to).includes(g)) && !tiles.allowed(tileList(space), tileList(space, t => whole.includes(t.id) ? { ...t, in: to } : null)).refused;
  const into = tiles.enterable(to !== undefined, whole.length > 0, fits);
  if (into.refused){ hud.say(into.refused); shown(); return false; }
  if (!framing(() => { for (const b of held){ const outer = chain(b).at(-1), tile = tilesOf(b).find(g => whole.includes(g));
      if (outer !== undefined && inGroup(outer).every(x => held.has(x))) space.groupUp.set(outer, host); else if (tile !== undefined) space.groupUp.set(tile, host); else space.groupOf.set(b, host); }      /* a whole group goes in as a group, and a whole tile as a tile */
    tidy(); }, trial)) return false;
  shown(); return true; }
/* a whole frame set down again from the list: everything in it, made anew, centred where it was dropped */
bus.on('replicate', ({ frame, at }) => { const s = trail().find(s => s.groupNames.has(frame) || s.repeats.has(frame)); if (!s) return;
  const pictures = inGroup(frame, s).map(b => picture(b, s));
  for (const p of pictures) p.groups = p.groups.slice(0, p.groups.findIndex(g => g.id === frame) + 1);      /* the frame and what is inside it, not the frames it is in */
  /* what comes from the list is the variables themselves, not copies: each named shape in the new frame is a
     reference to the one it was made from, with its entries, its definition and its colour */
  const from = inGroup(frame, s), linked = from.map(b => isNamed(b) && !b.members);
  const own = from.find((b, i) => linked[i] && loops(b, space)); if (own) return hud.say(`${bare(own.name)} is in that frame, and cannot go inside its own definition`);
  pictures.forEach((p, i) => { if (linked[i]) p.inside = null; });
  const made = paste(at, pictures, false) || [];
  made.forEach((b, i) => { const of = from[i]; if (!linked[i] || !of) return; b.values = of.values; if (of.source) b.source = of.source; b.ref = true; b.attrs = attrsOf(of); if (isArrow(of)) b.fn = of.fn;
    if (!spaceOf.has(of)){ const def = newSpace(of, s); for (const k of kinOf(of)) spaceOf.set(k, def); } spaceOf.set(b, spaceOf.get(of));
    const set = kin.get(of) || new Set([of]); set.add(b); for (const k of set) kin.set(k, set); });
  shown(); }, changes);
bus.on('frame.leave', ({ id, frame: g, also = [] }) => { const b = blockOf(id); if (b){ if (g === null) space.groupOf.delete(b); else space.groupOf.set(b, g); } tidy(); discard(also.map(blockOf).filter(Boolean)); shown(); }, changes);      /* also: what goes with it (the index matrices of a block that leaves its tile) */      /* pulled free of its group, as far out as g: null is out of them all */
/* a name given to a frame: a named group is renamed; a group without one is named, and stays, framed; a plain selection folds into a new block of that name */
bus.on('name', ({ frame: id, ids, name, color }) => { const list = ids.map(blockOf).filter(Boolean);
  if (name && sidesIn(space).includes(id !== null ? id : groupIs(list))){ hud.say('The two sides of a condition are called true and false'); return shown(); }
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
bus.on('length.add', ({ name, units, at, of = null, side = null }) => { if (unnameable(name)) return shown(); const u = view.unit, on = v => Math.round(v / u) * u;      /* a named length set down on the canvas: a single entry of that name, holding the length */
  const src = of ? blockOf(of) : null;      /* from the list: not a copy of the length but the length itself, the source's colour and always what the source's side is */
  const b = makeBlock({ ...typeNamed('tensor'), color: src ? src.shape.color : someColour() }, { x: on(at.x - u / 2), y: on(at.y - u / 2), w: u, h: u }, name);
  if (src){ b.from = { id: src.id, side: side === 'y' || side === 'm' ? side : 'x' }; b.ref = true; } else { b.values.set('1,1', units); touched(b.values); }
  space.blocks.push(b); view.world.append(b.el); select([b]); }, changes);

/* shift, held, shows the list's shapes as their transposes */
let shiftHeld = false;
const relist = () => { const reach = inReach(); variables.show(reach.main, reach.hidden); };
addEventListener('keydown', e => { if (e.key === 'Shift' && !shiftHeld){ shiftHeld = true; relist(); } });
addEventListener('keyup', e => { if (e.key === 'Shift' && shiftHeld){ shiftHeld = false; relist(); } });
addEventListener('blur', () => { if (shiftHeld){ shiftHeld = false; relist(); } });

let menuAt = { x: 0, y: 0 }, menuOn = null;      /* where the menu was opened, and the block it was opened on: Step and Stop when true are commands on that one block, whatever frame's blocks were selected with it */
const aimed = () => (menuOn && space.blocks.includes(menuOn) ? [menuOn] : [...selected]);
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl ';
const menu = createMenu([
  /* New: a kind of block to draw. Tensor is drawn by clicking it, as before; resting on it opens the sources (sources.js), each drawn the same way */
  { label: 'New', items: () => shapes.map(shape => ({ label: shape.label || shape.name, run: () => bus.send('new', { type: shape.name }),
    ...(shape.name === 'tensor' ? { items: SOURCES.map(s => ({ label: s.label, run: () => bus.send('new', { type: shape.name, source: s.kind }) })) } : {}),
    /* Data in: the two sources whose numbers the backend has. Clicking it draws noise; resting on it offers a file too */
    ...(shape.name === 'data-in' ? { run: () => bus.send('new', { type: shape.name, source: noiseOf() }), items: DATA.map(s => ({ label: s.label, run: () => bus.send('new', { type: shape.name, source: s.kind === 'noise' ? noiseOf() : { file: null } }) })) } : {}) }))
    .concat([{ label: 'Tile', run: () => bus.send('new', { type: 'tile' }) }]) },      /* a tile is no kind of block: it is drawn round them */
  { label: 'Undo', hint: mod + 'Z', disabled: () => !history.canUndo(), run: () => bus.send('undo') },
  { label: 'Redo', hint: mod + (mod === '⌘' ? '⇧Z' : 'Y'), disabled: () => !history.canRedo(), run: () => bus.send('redo') },
  { label: 'Cut', hint: mod + 'X', disabled: () => !selected.size, run: () => removing('cut') },
  { label: 'Copy', hint: mod + 'C', disabled: () => !selected.size && !pickedTile, run: () => bus.send('copy', selected.size ? { ids: idsOf(selected) } : { ids: [], tile: pickedTile }) },
  { label: 'Paste', hint: mod + 'V', disabled: () => !clipboard, run: () => bus.send('paste', { at: menuAt, pasted: clipboard }) },
  { label: 'Transpose', hint: 'T', disabled: () => !selected.size, run: () => bus.send('transpose', { ids: idsOf(selected) }) },
  /* greyed where the selection does not allow it; chosen all the same, each says why in the readout */
  { label: 'Difference', why: () => refusing([...selected], difference(inOrder([...selected]).map(unitsOf)), 'cut or fused').refused || null, run: () => bus.send('difference', { ids: idsOf(selected) }) },
  { label: 'Intersect', why: () => refusing([...selected], intersection(inOrder([...selected]).map(unitsOf)), 'cut').refused || null, run: () => bus.send('intersect', { ids: idsOf(selected) }) },
  { label: 'Make conditional', why: () => conditionableNow([...selected]).refused || null, run: () => bus.send('conditional', { ids: idsOf(selected) }) },
  { label: 'Step', why: () => steppable(aimed()).refused || null, run: () => bus.send('step', { id: aimed()[0]?.id ?? null }) },
  { label: 'Stop when true', why: () => stoppable(aimed()).refused || null, run: () => bus.send('until', { id: aimed()[0]?.id ?? null }) },
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
