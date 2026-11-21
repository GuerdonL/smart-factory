/* A graph worked out, exactly. No drawing here: a graph (graph.js) and a node's id in, that node's entries out.

   evaluate(graph, nodeId, { maxEntries = 4096, binding = null, maxSteps = 256 })
       -> { type, entries }                    worked out: entries is keyed "column,row" from 1 (and, where the type
                                               holds inner data, "column,row,k1,k2,…": one more number, from 1, for
                                               each inner axis) and holds values of
                                               the kinds values.js sets out, written as the graph writes them (an
                                               infinity is "inf" or "-inf"). An entry that depends on an unknown
                                               entry is unknown, and is absent. An entry that cannot be worked out
                                               (a division by zero, ∞ − ∞) is there, as the error value { err }.
        | { type, deferred: true }             too large to work out here: the node, or something its value is
                                               worked out from, holds more than maxEntries numbers (its columns
                                               times its rows times every inner length)
        | { error: { code, note, node } }      its value is worked out from a variable that has an error; node is
                                               that variable's id. (Also for an id the graph has not got: no-source.)
                                               A variable that promises a number space (holds) and has a value
                                               outside it is such a variable: the code is type, and the note names
                                               the entry. It is found here, where the values are, not by build.
        | { type, deferred: true, backend: true }   it is worked out from noise or from a data file, whose numbers
                                               only the backend has (backend/): nothing here can say them
        | { type, deferred: true, steps: 256 }      a tile's step was applied maxSteps times and the loop had not
                                               stopped (or its tile has more cells than that): the backend's
        | { type, deferred: true, forever: true }   a loop with an infinite count and no stop block: it has no last
                                               cell, and runs until it is stopped
   It never throws, for a well-formed graph (graph.js: validate) or any other, and it finishes: a function that
   reaches itself, which validate refuses, is the error loop here and not an endless descent, and whatever else
   goes wrong in a graph that is not well formed is the error no-source with what went wrong for its note.
   carry(from, to)                             takes what was worked out of one graph over to another, for every
                                               node that is the same in both: the same id, the same node, and the
                                               same all the way down what it is worked out from. An id says what a
                                               node is, so such a node has the value it had. (Only what was worked
                                               out under no binding is taken: what a function's body came to for one
                                               input says nothing once the input has changed.) Gives how many nodes.
   judged(graph, id, holds, name, options)     a promise held against any node's values (what a function's input
                                               block promises, against what it is given): see the function
   seenFrom(graph, use, error)                 a broken promise's sentence with the entry's place as one use of the
                                               variable draws it (a transposed use, one turned through inner axes)
   promiseOf(graph, id, options)               what a variable promises to hold (its number space, spaces.js) and
                                               whether its values keep the promise: see the function
   truthAt(graph, id, options)                 whether a node's whole matrix counts as true, as far as it can be
                                               told here: true, false, or null for not known (see the function)
   stoppedAt(graph, id)                        the cell (from 1) at which a loop last worked out here was stopped
                                               by its stop block, or null
   STEPS                                       256, the default maxSteps: the most steps of a loop worked out here
   MOST                                        4096, the default maxEntries: the most numbers the browser works out
   tooLarge(type, most)                        the sentence that says so of a result that size
   toMap(entries)                              an answer's entries as the page keeps them: a Map, infinities as numbers

   What each operation comes to is its rule in graph.js's table (OPS[op].value); this file is what the rules are run
   by. No arithmetic is done here or there: every pair of values goes to combine (values.js, by way of algebra.js)
   and every formula to expression.js. combine works whole numbers, fractions and single roots out directly, so a
   64 by 64 product never reaches the solver.

   The limit counts what is worked out, not only what is held: a function run at each inner position of what it is
   given is its body that many times, and the largest thing in that body which follows the function's input, times
   the positions, is held to maxEntries too, before anything is run. What the body comes to at one position is not
   kept once that position is done.

   What a node needs is its inputs, less those its rule says it does not read (a measure reads a length off its
   input's type, so a matrix's width never waits on the matrix), and, for a function applied, the function's body.
   A choose needs its condition; which of its two sides it needs is not known until that is worked out, so the side
   it then takes is looked at when it is taken (at.pick), and the other never: an error in the side not chosen, a
   side too large to work out here and one only the backend has do no harm. (Only where a function is run at each
   inner position is the larger of the two sides counted beforehand, since that count is made before anything runs.)

   Remembering. Results are remembered for one graph: evaluate on a new graph starts clean, unless they are carried
   to it (carry). A node outside every
   function and every tile has one value. A node the graph marks as within a function has one for each thing that
   function is applied to, and one within a tile has one for each cell: such a node is remembered under its id
   together with the whole chain of bindings it sits under, never under its id alone. One worked out from the state
   of a tile with a step (a state block in a later cell, and whatever reads it there) is remembered under what every
   function round it was given, whether or not the graph marks it within them: the state is. A tile in a tile's pattern
   adds its cell to the chain, so a node there has a value for each (outer cell, inner cell).

   Whose cells a node sits in. A block is in the tiles it is itself in, whoever reads it: read from a tile inside
   its own (a formula there names it, an arrow there is set against it), a block of the outer tile is still in the
   outer tile's cell and no other, and a block in no tile is in no cell, so that an index it reads is the error it
   is outside a tile. So before a node that stands for a block (or is the map of an arrow's formula) is worked
   out, the chain is cut down to the cells of the tiles that block is in. Which those are is read off the graph's
   spaces (homes, below): each space's tiles list their blocks and arrows, and what is in a block's definition
   space is in the cells that block is in. A cell says which tile it is of (of: tile ids); one that does not is
   kept. A node that stands for no block is worked out under whatever chain reaches it.

   A tile with a step (graph.js: a repeat with fn and state, and a loop). Its cells are worked out in order, each
   once: the state of cell k is what the step made of cell k − 1, all of it set in its places, and is remembered
   under the tile, what the functions round it were given, the chain of outer cells and k. A state block asked for
   in a cell after the first, by whoever asks (the tile's matrix, its loop, a block beside it, an arrow in the
   tile, the page drawing that cell), is the part of that state that is its own: so every cell shows its state, and
   a tile in the pattern with a step of its own starts again in each outer cell. The step's function is run with no
   cell: it cannot read the index. No more than maxSteps steps are taken for any one tile.

   binding says where a node is being looked at from, for a caller that draws what is inside a function or a tile:
       { params: { "<function id>": "<node id>" | { of: "<node id>", range: { col, row, cols, rows } } },
         cells:  [ { x, y, dx, dy, cx, cy, turned, of: ["t:<frame id>"], at: { "<node id>": { col, row } } } ] }
   params gives a function's input its value (a node, or a part of one), so that the nodes of its body can be asked
   for (where that node holds inner data and the function's input block holds none, the function is run at each
   inner position, and what is asked for is seen at the first); cells is the chain of tile cells the node sits in, outermost first: x and y are the columns and rows of
   the filled tile that lie before the cell, dx and dy those of the pattern that lie before the node asked for
   (graph.js: indexAt), cx and cy which cell it is, counted from 1 (left out: the first; only noise reads them, and
   only the backend makes noise), and at says where in the pattern other nodes lie, so that a piece of two blocks of one tile
   gives each its own place. Any of it may be left out.

   The rules are handed `at`, which is everything they may ask:
       at.get(k, env)      the entries of input k (a Map; not to be changed), under env where one is given. An
                           input is worked out when it is asked for, and not before
       at.pick(k)          the entries of an input the rule reads only now (graph.js: later; a choose's chosen
                           side): what it needs is looked at here, as every other input's was before anything was
                           run, so that an error in it, or its being too large or the backend's, is the answer
       at.type(k)          input k's type
       at.cells            the chain of cells this node is being worked out in
       at.turn()           an env in which the innermost cell is read through a transpose
       at.shift(dx, dy)    an env in which the innermost cell begins dx columns and dy rows further on (a part of a block)
       at.cell({ x, y, dx, dy, at, atKey })   an env with one more cell, innermost (at: where the pattern's parts lie; atKey: a text that tells one such at from another)
       at.call(fn, values, key)   function fn's body with values as its input; key names those values among all
                           the function is applied to
       at.keyOf(k)         a key for input k's entries as they are under this env
       at.given(node)      the entries a function's input has been given, none where it has been given nothing
       at.rest(k)          what input k, a sum or a product of several, set aside at each entry (graph.js: RESTS), or null
       at.state(k, stopped)   a loop's: the state of cell k of its tile (stopped: it ends there, which is noted)
       at.stopped(k)       a loop's: whether its stop block is true as a whole matrix in cell k (null: not known)
       at.forever()        a loop's: it has no last cell
       at.ks               where the rule is being repeated over inner data, the inner position of this run */
import { OPS, RESTS, readsIndex, tailsOf, inferred, fnOf, stateAt, placesOf, cellAt } from './graph.js';
import { broken, untold, within, NOT_HELD, UNPROVEN } from './spaces.js';
import { passed } from './arrows.js';
import { numbers, truthOf } from './algebra.js';

export const MOST = 4096, STEPS = 256;
const hasInner = type => Array.isArray(type.inner) && type.inner.length > 0;
export const tooLarge = (type, most = MOST) => numbers(type) > most
  ? `it holds ${[type.cols, type.rows, ...(hasInner(type) ? type.inner.map(a => a.length) : [])].join(' × ')} numbers, more than the ${most} that are worked out here: its size is shown, and its numbers are not`
  : `it is worked out from more than the ${most} numbers that are worked out here: its size is shown, and its numbers are not`;
export function toMap(entries){
  const out = new Map(); for (const [key, v] of Object.entries(entries || {})) out.set(key, v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v); return out;
}

const LOOP = { loop: true };
const own = (o, k) => !!o && typeof o === 'object' && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const nodeAt = (graph, id) => own(graph.nodes, id) && graph.nodes[id] && typeof graph.nodes[id] === 'object' && own(OPS, graph.nodes[id].op) && Array.isArray(graph.nodes[id].inputs) && graph.nodes[id].type ? graph.nodes[id] : null;
const fnAt = (graph, id) => own(graph.functions, id) && graph.functions[id] && typeof graph.functions[id] === 'object' ? graph.functions[id] : null;
const states = new WeakMap();                   /* a graph -> what has been worked out of it: values and answers by node id, then by binding */
const stateOf = graph => { if (!states.has(graph)) states.set(graph, { values: new Map(), needs: new Map(), answers: new Map(), follows: new Map(), carries: new Map(), stepped: new Map(), stops: new Map() }); return states.get(graph); };
/* whether a node's value follows the cell it is worked out in: a formula of its own reads the index, or what it is made of does.
   (The graph marks such a node with its tiles; this is asked of the node itself, so that a value is never remembered under too little.) */
function follows(graph, st, id){
  if (!st.follows.has(id)){ st.follows.set(id, false); const n = nodeAt(graph, id); st.follows.set(id, !!n && (homesOf(graph, st).stateIds.has(id) || readsIndex(n) || n.inputs.some(i => follows(graph, st, i)))); }      /* (a state block of a tile with a step holds what the step made of the cell before) */
  return st.follows.get(id);
}
/* whether a node's value is worked out from the state of a tile with a step: it is a state block, or what it is made of
   is. Such a value depends on everything the state does: what every function round the tile was given, not only the
   functions the node is itself within. */
function carries(graph, st, id){
  if (!st.carries.has(id)){ st.carries.set(id, false); const n = nodeAt(graph, id); st.carries.set(id, !!n && (homesOf(graph, st).stateIds.has(id) || n.inputs.some(i => carries(graph, st, i)))); }
  return st.carries.get(id);
}
const paramsKey = params => Object.keys(params).sort().map(f => f + '=' + params[f].key).join('|');
const under = (map, id) => { if (!map.has(id)) map.set(id, new Map()); return map.get(id); };
const fnsOf = n => (Array.isArray(n.within) ? n.within : []).filter(w => typeof w === 'string' && w[0] === 'f');
const cellKey = c => `${c.x},${c.y},${c.dx},${c.dy}${c.turned ? 't' : ''}@${c.atKey}`;
const cellsKey = cells => cells.map(cellKey).join(';');
const aCell = c => ({ x: Number(c.x) || 0, y: Number(c.y) || 0, dx: Number(c.dx) || 0, dy: Number(c.dy) || 0, cx: Number.isInteger(c.cx) && c.cx >= 1 ? c.cx : 1, cy: Number.isInteger(c.cy) && c.cy >= 1 ? c.cy : 1, turned: !!c.turned, of: Array.isArray(c.of) && c.of.length && c.of.every(t => typeof t === 'string') ? c.of : null, at: c.at && typeof c.at === 'object' ? c.at : null, atKey: c.at && typeof c.at === 'object' ? (c.atKey ?? JSON.stringify(c.at)) : '' });
/* what a node's value is remembered under, beside its id: every binding it sits under */
function keyFor(graph, st, id, n, env){
  const inCells = env.cells.length > 0 && follows(graph, st, id), fns = fnsOf(n);
  /* (what is worked out from a tile's state, in a cell: under all that the state is remembered under, stateIn) */
  return fns.length || inCells ? '|' + (inCells && carries(graph, st, id) ? paramsKey(env.params) : fns.map(f => env.params[f] ? env.params[f].key : '').join('|')) + (inCells ? '|' + cellsKey(env.cells) : '') : '';
}
const NO_IDS = Object.freeze([]);
/* the most entries of anything a node's value is worked out from, the first variable among them that has an error, and the variables among them that promise a number space */
function needsOf(graph, st, id, open = new Set()){
  if (st.needs.has(id)) return st.needs.get(id);
  const n = nodeAt(graph, id);
  if (!n) return { most: 0, bad: { code: 'no-source', note: 'no such node', node: String(id) } };
  let most = numbers(n.type), bad = n.op === 'variable' && n.error ? { code: n.error.code, note: n.error.note, node: id } : null;
  let remote = n.op === 'noise' || (n.op === 'source' && n.kind === 'file');      /* numbers only the backend has */
  let bound = fnsOf(n).length ? most : 0;       /* the most numbers of anything it is worked out from that follows a function's input: that is worked out again for each thing the function is applied to */
  let kept = (n.op === 'variable' && typeof n.holds === 'string') || fnOf(n) !== undefined ? [id] : NO_IDS;      /* the variables among them, itself included, that promise a number space, and the functions applied, whose input may promise one */
  if (open.has(id)) return { most, bound, bad: bad || { code: 'loop', note: '', node: id }, remote, kept };
  open.add(id);
  const ins = n.inputs.map(i => nodeAt(graph, i)), rule = OPS[n.op];
  const read = ins.every(Boolean) ? (rule.needs ? rule.needs(n, ins) : n.inputs.map((_, k) => k)).map(k => n.inputs[k]) : n.inputs;
  const applies = fnOf(n) !== undefined, body = applies ? fnAt(graph, fnOf(n)) : null;
  /* inputs read only when the value asks for them (a choose's sides): of them only what follows a function's input is counted here, the larger of them */
  if (rule.later && ins.every(Boolean)) for (const k of rule.later(n)) bound = Math.max(bound, needsOf(graph, st, n.inputs[k], open).bound || 0);
  for (const dep of body ? [...read, body.body] : read){ const d = needsOf(graph, st, dep, open); most = Math.max(most, d.most); bound = Math.max(bound, d.bound || 0); bad = bad || d.bad; remote = remote || !!d.remote;
    if (d.kept && d.kept.length) kept = kept.length ? [...new Set([...kept, ...d.kept])] : d.kept;
    /* a function run at each inner position of what it is given (its input block holds none) is its body worked out that many times: that is counted before it is run */
    if (body && dep === body.body && ins[0] && hasInner(ins[0].type) && !hasInner((nodeAt(graph, body.input) || n).type)) most = Math.max(most, (d.bound || 0) * tailsCount(n.op === 'mapalong' ? { inner: ins[0].type.inner } : ins[0].type) * (n.op === 'mapalong' ? n.count || 1 : 1)); }
  if (applies && !body) bad = bad || { code: 'no-source', note: 'no such function', node: id };
  open.delete(id);
  const out = { most, bound, bad, remote, kept }; st.needs.set(id, out); return out;
}
/* The tiles each block's node is itself in, and which tiles each repeat is the matrix of, read off the graph's spaces.
   homes: node id -> Set of tile ids, for every node that stands for a block listed in a space (in a piece or in a
   tile), the variable under a transposed use, and the map of an arrow's formula; a block in no tile has the empty
   set. A block in the definition space of a block has that block's tiles as well as its own. A node not there
   stands for no block that is placed (a standing shape, what is in a function's space): it is not in the Map. */
function homesOf(graph, st){
  if (st.homes) return st;
  const homes = new Map(), repeats = new Map(), loops = new Map(), stateIds = new Map(), spaces = graph.spaces && typeof graph.spaces === 'object' ? graph.spaces : {}, list = v => Array.isArray(v) ? v : [];
  const add = (id, set) => { if (typeof id !== 'string' || !nodeAt(graph, id)) return false; if (!homes.has(id)){ homes.set(id, new Set(set)); return true; }
    const had = homes.get(id); let grew = false; for (const t of set) if (!had.has(t)){ had.add(t); grew = true; } return grew; };
  for (let pass = 0, again = true; again && pass < 64; pass++){ again = false;
    for (const key of Object.keys(spaces)){ const s = spaces[key]; if (!s || typeof s !== 'object') continue;
      const context = key === 'top' ? new Set() : typeof s.owner === 'string' && homes.has(s.owner) ? homes.get(s.owner) : null; if (!context) continue;
      const tiles = list(s.tiles).filter(t => t && typeof t === 'object' && typeof t.tile === 'string'), inTiles = (k, id) => new Set([...context, ...tiles.filter(t => list(t[k]).includes(id)).map(t => t.tile)]);
      for (const b of new Set([...list(s.pieces).flatMap(p => list(p && p.blocks)), ...tiles.flatMap(t => list(t.blocks))])){ if (!own(graph.blocks, b)) continue;
        const id = graph.blocks[b], n = nodeAt(graph, id), set = inTiles('blocks', b);
        if (add(id, set)) again = true; if (n && n.op === 'transpose' && add(n.inputs[0], set)) again = true; }
      for (const a of list(s.arrows)){ const n = a && typeof a.node === 'string' ? nodeAt(graph, a.node) : null; if (n && n.op === 'map' && add(a.node, inTiles('arrows', a.arrow))) again = true; }
      for (const t of tiles) for (const id of [t.node, t.loop]) if (typeof id === 'string'){ if (!repeats.has(id)) repeats.set(id, []); if (!repeats.get(id).includes(t.tile)) repeats.get(id).push(t.tile);
        /* a tile with a step: the node that says its pattern, state and function (its matrix, else its loop), and where each state block lies in the state */
        const n = nodeAt(graph, id); if (!n || n.fn === undefined || !n.state || !Array.isArray(n.at)) continue;
        if (!loops.has(t.tile)) loops.set(t.tile, id);
        n.at.forEach((_, k) => { const i = nodeAt(graph, n.inputs[k]), where = i ? stateAt(n, k, i.type) : null; if (!where) return; if (!stateIds.has(n.inputs[k])) stateIds.set(n.inputs[k], new Map()); stateIds.get(n.inputs[k]).set(t.tile, where); }); } } }
  st.homes = homes; st.repeats = repeats; st.loops = loops; st.stateIds = stateIds; return st;
}
/* What a variable holds, where that can be read off the graph without working anything out, at any size: its own
   entries where every one of them is a value typed in (no formula among them); or, where it is a source filled with
   known values, one entry for each value there is in it (zeros: 0; ones: 1; an identity: 1, and 0 off its diagonal),
   keyed where the first such entry lies. -> { key: value }, or null where it has to be worked out. For holding a
   promise against a shape too large to be worked out here. */
function plainly(graph, id){
  let n = nodeAt(graph, id);
  for (let k = 0; n && k < 64 && n.op === 'variable' && n.defined !== 'entries' && !n.error && n.inputs.length === 1; k++) n = nodeAt(graph, n.inputs[0]);
  if (!n) return null;
  if (n.op === 'variable') return n.defined === 'entries' && !n.error && n.entries && typeof n.entries === 'object' && !Object.values(n.entries).some(v => v && typeof v === 'object' && 'expr' in v) ? n.entries : null;
  if (n.op !== 'source') return null;
  const t = hasInner(n.type) ? tailsOf(n.type)[0] : '';      /* with inner data the first such entry is at the first inner position, and its place is said with it: "at 1, 1, 1" */
  return n.kind === 'none' ? { ['1,1' + t]: { none: true } } : n.kind === 'zeros' ? { ['1,1' + t]: 0 } : n.kind === 'ones' ? { ['1,1' + t]: 1 } : n.kind === 'identity' ? { ['1,1' + t]: 1, ...(n.type.cols > 1 ? { ['2,1' + t]: 0 } : n.type.rows > 1 ? { ['1,2' + t]: 0 } : {}) } : null;
}
const inner = (cells, change) => cells.length ? [...cells.slice(0, -1), change(cells[cells.length - 1])] : cells;

/* ---- inner data: a rule repeated at each inner position ----
   The rules in graph.js's table are two-dimensional, and stay so. A node one of whose inputs holds inner data is
   worked out by running its rule once for each inner position: every input that holds inner data is handed its
   entries at that position (keyed "column,row"), an input that holds none is handed whole to every run, and the
   results are joined under the long keys, "column,row,k1,k2,…". A rule marked deep reads the long keys itself (a
   variable, a slice, a stack, an entry and so on), and a function whose input block holds inner data is handed its
   input whole: those are run once. */
const EMPTY = new Map(), splits = new WeakMap(), flats = new WeakMap();
const tailsCount = type => (type.inner || []).reduce((n, a) => n * a.length, 1);      /* how many inner positions a type has */
/* a value's entries sorted by inner position: tail (",k1,k2") -> a Map from "column,row". Kept with the value. */
function split(values){
  if (!splits.has(values)){ const by = new Map();
    for (const [key, v] of values){ const i = key.indexOf(','), j = key.indexOf(',', i + 1), tail = j < 0 ? '' : key.slice(j);
      if (!by.has(tail)) by.set(tail, new Map()); by.get(tail).set(j < 0 ? key : key.slice(0, j), v); }
    splits.set(values, by); }
  return splits.get(values);
}
const flatType = t => { const { inner: _, ...rest } = t; return rest; };
const flatNode = n => { if (!flats.has(n)) flats.set(n, hasInner(n.type) ? { ...n, type: flatType(n.type) } : n); return flats.get(n); };
function repeated(rule, n, at, types){
  const out = new Map(), lead = types.find(hasInner), flat = flatNode(n), applies = n.fn !== undefined; let rests = null;      /* (rests: what a sum or product set aside, graph.js: RESTS, kept by the long keys) */
  for (const tail of tailsOf(lead)){
    /* a function's body at one position is of no use at the next: what it comes to there is kept only while that position is worked out */
    const scratch = applies ? new Map() : null;
    const here = { ...at, ks: tail.slice(1).split(',').map(Number), ...(applies ? { call: (fn, values, k, _, where = '') => at.call(fn, values, k, scratch, where, tail) } : {}),
      type: k => hasInner(types[k]) ? flatType(types[k]) : types[k],
      get: (k, e) => hasInner(types[k]) ? split(at.get(k, e)).get(tail) || EMPTY : at.get(k, e),
      rest: k => { const kept = at.rest(k); return kept && hasInner(types[k]) ? { get: key => kept.get(key + tail) } : kept; },
      keyOf: k => at.keyOf(k) + (hasInner(types[k]) ? '#k' + tail : '') };
    const made = rule.value(flat, here), rest = RESTS.get(made);
    for (const [key, v] of made) out.set(key + tail, v);
    if (rest){ if (!rests) rests = { op: rest.op, at: new Map() }; for (const [key, v] of rest.at) rests.at.set(key + tail, v); } }
  if (rests) RESTS.set(out, rests);
  return out;
}

/* ---- a tile with a step ---- */
const cellEnv = (graph, st, tile, n, outer, j, k) => { const { cx, cy } = cellAt(n, j), places = placesOf(n);
  return { ...outer, cells: [...outer.cells, aCell({ x: (cx - 1) * n.pattern.cols, y: (cy - 1) * n.pattern.rows, dx: n.at[k].col, dy: n.at[k].row, cx, cy, of: [tile], at: places, atKey: JSON.stringify(places) })] }; };
/* cell j of a tile with a step, whole: every part of its pattern as it is in that cell, set in its place */
function wholeCell(graph, st, tile, n, outer, j){
  const out = new Map();
  n.at.forEach((a, k) => { const t = graph.nodes[n.inputs[k]].type;
    for (const [key, v] of run(graph, st, n.inputs[k], cellEnv(graph, st, tile, n, outer, j, k))){ const [c, r, ...ks] = key.split(',').map(Number); if (c <= t.cols && r <= t.rows) out.set((c + a.col) + ',' + (r + a.row) + (ks.length ? ',' + ks.join(',') : ''), v); } });
  return out;
}
/* the state of cell k (2 or more) of a tile with a step, under what lies round the tile (outer: the env less the
   tile's own cell): what the step made of cell k − 1. Worked out in order from the last cell known, one step each. */
function stateIn(graph, st, tile, outer, k){
  const id = st.loops.get(tile), n = graph.nodes[id], key = tile + '|' + paramsKey(outer.params) + '|' + outer.cells.map(c => c.x + ',' + c.y).join(';');
  if (!st.stepped.has(key)) st.stepped.set(key, [null, null]);
  const list = st.stepped.get(key), f = fnAt(graph, n.fn); if (!f) throw new Error('no such function');
  while (list.length <= k){ const j = list.length;      /* cell j's state, from cell j − 1 */
    if (j - 1 > outer.steps) throw { later: { steps: outer.steps } };
    if (outer.active.includes(n.fn)) throw LOOP;
    const values = wholeCell(graph, st, tile, n, outer, j - 1), p = nodeAt(graph, f.input), takes = p && p.op === 'param' && typeof p.type.value === 'string' && p.type.value !== 'any?' ? p.type.value : null, out = takes ? broken(takes, values) : null;
    if (out) throw { broke: { code: 'type', note: NOT_HELD('in', takes, out.key, out.value === Infinity ? 'inf' : out.value === -Infinity ? '-inf' : out.value) + ' in cell ' + (j - 1), node: id } };
    list.push(run(graph, st, f.body, { params: { ...outer.params, [n.fn]: { values, key: 'step ' + key + '#' + j } }, cells: [], active: [...outer.active, n.fn], scratch: new Map(), most: outer.most, steps: outer.steps })); }
  return list[k];
}
const stepNumber = (n, c) => n.across === 'inf' ? c.cx : (c.cy - 1) * n.across + c.cx;

function run(graph, st, id, env){
  const n = graph.nodes[id], home = env.cells.length ? homesOf(graph, st).homes.get(id) : undefined;
  /* a block is in the cells of the tiles it is itself in, and no others, whoever reads it */
  if (home && env.cells.some(c => c.of && !c.of.some(t => home.has(t)))) env = { ...env, cells: env.cells.filter(c => !c.of || c.of.some(t => home.has(t))) };
  const last = env.cells[env.cells.length - 1];
  /* a part of the pattern met again below its tile (an arrow there reads it): it is at its own place, not the reader's */
  if (last && last.at && own(last.at, id)){ const p = last.at[id]; if (last.dx !== p.col || last.dy !== p.row || last.turned) env = { ...env, cells: inner(env.cells, c => ({ ...c, dx: p.col, dy: p.row, turned: false })) }; }
  const key = keyFor(graph, st, id, n, env), mine = under(env.scratch && key ? env.scratch : st.values, id);      /* (what follows a function's input, under a run that keeps nothing: in that run's own store) */
  if (mine.has(key)){ const was = mine.get(key); if (was && was.broke) throw was; return was; }      /* (a promise it was found to break: found once) */
  const at = { id, graph, env, cells: env.cells,
    type: k => graph.nodes[n.inputs[k]].type,
    get: (k, e = env) => run(graph, st, n.inputs[k], e),
    pick(k){ const d = needsOf(graph, st, n.inputs[k]);
      if (d.most > env.most) throw { later: d }; if (d.bad) throw { broke: d.bad }; if (d.remote) throw { later: d };
      return run(graph, st, n.inputs[k], env); },
    rest: k => { const kept = RESTS.get(run(graph, st, n.inputs[k], env)); return kept ? kept.at : null; },
    keyOf: k => n.inputs[k] + keyFor(graph, st, n.inputs[k], graph.nodes[n.inputs[k]], env),
    turn: () => ({ ...env, cells: inner(env.cells, c => ({ ...c, turned: !c.turned })) }),
    shift: (dx, dy) => ({ ...env, cells: inner(env.cells, c => c.turned ? { ...c, dx: c.dx + dy, dy: c.dy + dx } : { ...c, dx: c.dx + dx, dy: c.dy + dy }) }),
    cell: c => ({ ...env, cells: [...env.cells, aCell({ ...c, of: homesOf(graph, st).repeats.get(id) || null })] }),
    call(fn, values, k, scratch = null, where = '', tail = ''){ const f = fnAt(graph, fn); if (!f) return new Map();
      if (env.active.includes(fn)) throw LOOP;      /* a function inside itself: validate refuses the graph, and this stops it */
      /* what the function's input block promises to take is held against what it is given, here, where the values
         are: one that lies outside it is the error type, as a shape's own broken promise is, and the function is not
         run. where: which run of a repeated arrow; tail: which inner position, where it is run at each. */
      const p = nodeAt(graph, f.input), takes = p && p.op === 'param' && typeof p.type.value === 'string' && p.type.value !== 'any?' ? p.type.value : null, out = takes ? broken(takes, values) : null;
      if (out) throw { broke: { code: 'type', note: NOT_HELD('in', takes, out.key + tail, out.value === Infinity ? 'inf' : out.value === -Infinity ? '-inf' : out.value) + where, node: id } };
      return run(graph, st, f.body, { params: { ...env.params, [fn]: { values, key: k } }, cells: [], active: [...env.active, fn], scratch: scratch || env.scratch || null, most: env.most, steps: env.steps }); },
    /* a loop's (graph.js): the tile is the one spaces names it for; the cell before the first step is the pattern as it stands */
    state(k, stopped = false){ const tile = (homesOf(graph, st).repeats.get(id) || [])[0]; if (!tile) throw new Error('a loop that is no tile\'s');
      if (stopped) st.stops.set(id, k);
      return k > 1 ? stateIn(graph, st, tile, env, k) : passed(wholeCell(graph, st, tile, n, env, 1), n.state); },
    stopped(k){ const tile = (homesOf(graph, st).repeats.get(id) || [])[0]; if (!tile) throw new Error('a loop that is no tile\'s');
      if (k - 1 > env.steps) throw { later: { steps: env.steps } };
      const c = run(graph, st, n.inputs[n.until], cellEnv(graph, st, tile, n, env, k, n.until)), t = truthOf(c.values());
      return t === false && c.size < numbers(graph.nodes[n.inputs[n.until]].type) ? null : t; },      /* an entry never given is absent: with none true, not known */
    forever(){ throw { later: { forever: true } }; },
    given(node){ const fn = fnsOf(node).slice(-1)[0], p = fn !== undefined && own(env.params, fn) ? env.params[fn] : null; if (!p) return new Map();
      if (!p.values){ const spec = p.spec, of = typeof spec === 'string' ? spec : spec.of, rest = { ...env.params }; delete rest[fn];      /* what it was given is not worked out from itself */
        const from = nodeAt(graph, of), all = from ? run(graph, st, of, { ...env, params: rest }) : new Map(), part = typeof spec === 'string' || !spec.range ? all : passed(all, spec.range);
        /* looked at from inside a function that is run at each inner position of what it is given (its input block holds no inner data, and this does): what is seen is the first position's */
        p.values = from && hasInner(from.type) && !hasInner(node.type) ? split(part).get(tailsOf(from.type)[0]) || EMPTY : part; }
      return p.values; } };
  const rule = OPS[n.op], types = n.inputs.map((_, k) => at.type(k));
  const deep = !types.some(hasInner) || (typeof rule.deep === 'function' ? rule.deep(n, { node: i => nodeAt(graph, i), fn: f => fnAt(graph, f) }) : !!rule.deep);
  /* a state block in a later cell of its tile holds what the step made of the cell before, not its own entries */
  let carried = null;
  if (last && last.of && homesOf(graph, st).stateIds.has(id)){ const where = st.stateIds.get(id), tile = last.of.find(t => where.has(t)), ln = tile ? graph.nodes[st.loops.get(tile)] : null, k = ln ? stepNumber(ln, last) : 1;
    if (k > 1) carried = passed(stateIn(graph, st, tile, { ...env, cells: env.cells.slice(0, -1) }, k), where.get(tile)); }
  const value = carried || (deep ? rule.value(n, at) : repeated(rule, n, at, types));
  /* a variable that promises a number space is held to it here, where its values are: one that lies outside it
     is the error type, said with the entry, for the variable and for everything worked out from it */
  if (n.op === 'variable' && typeof n.holds === 'string'){ const out = broken(n.holds, value);
    if (out){ const inCells = env.cells.length > 0 && follows(graph, st, id);      /* one whose value follows its cell says which cell it is broken in: innermost first */
      const where = inCells ? ' in cell ' + env.cells.slice().reverse().map(c => c.cx + ', ' + c.cy).join(' of cell ') : '';
      const failed = { broke: { code: 'type', note: NOT_HELD(n.name || id, n.holds, out.key, out.value === Infinity ? 'inf' : out.value === -Infinity ? '-inf' : out.value) + where, node: id } }; mine.set(key, failed); throw failed; } }
  mine.set(key, value); return value;
}

export function evaluate(graph, nodeId, { maxEntries = MOST, binding = null, maxSteps = STEPS } = {}){
  const n = graph && typeof graph === 'object' && typeof nodeId === 'string' ? nodeAt(graph, nodeId) : null;
  if (!n) return { error: { code: 'no-source', note: 'no such node', node: String(nodeId) } };
  const st = stateOf(graph), bkey = binding ? JSON.stringify(binding) : '', kept = under(st.answers, nodeId), akey = maxEntries + (maxSteps === STEPS ? '' : '/' + maxSteps) + '\n' + bkey;
  if (kept.has(akey)) return kept.get(akey);
  const done = answer => { kept.set(akey, answer); return answer; };
  let brokeIn = () => null;
  try {
    const given = Object.entries((binding && binding.params) || {}).filter(([, spec]) => spec && (typeof spec === 'string' || typeof spec.of === 'string'));
    const needs = [needsOf(graph, st, nodeId), ...given.map(([, spec]) => needsOf(graph, st, typeof spec === 'string' ? spec : spec.of))];
    /* a result that is not worked out here (too large, or made of noise or of a data file) is still nothing where a
       variable it is worked out from breaks its promise by a value that is here: that variable has no value, so
       neither has this, and it is not the backend's to give. Asked of each such variable on its own, which is
       small enough to be worked out or is deferred itself and says nothing. */
    const broke = (list = needs) => { for (const d of list) for (const v of d.kept || NO_IDS){
      /* one whose values can be read off the graph (a source filled with one known value, entries all typed in) is held to its promise by them at any size, itself included */
      const kn = nodeAt(graph, v), plain = kn && kn.op === 'variable' && typeof kn.holds === 'string' ? plainly(graph, v) : null, out = plain ? broken(kn.holds, plain) : null;
      if (out) return { code: 'type', note: NOT_HELD(kn.name || v, kn.holds, out.key, out.value), node: v };
      if (v !== nodeId){ const a = evaluate(graph, v, { maxEntries, binding, maxSteps }); if (a.error && a.error.code === 'type') return a.error; } } return null; };
    brokeIn = broke;
    if (needs.some(d => d.most > maxEntries)){ const b = broke(); return done(b ? { error: b } : { type: n.type, deferred: true, ...(needs.some(d => d.remote) ? { backend: true } : {}) }); }
    const bad = needs.map(d => d.bad).find(Boolean); if (bad) return done({ error: bad });
    if (needs.some(d => d.remote)){ const b = broke(); return done(b ? { error: b } : { type: n.type, deferred: true, backend: true }); }
    const env = { params: Object.fromEntries(given.map(([fn, spec]) => [fn, { spec, key: 'given ' + bkey }])), active: [], most: maxEntries, steps: maxSteps,
      cells: ((binding && Array.isArray(binding.cells) && binding.cells) || []).filter(c => c && typeof c === 'object').map(aCell) };
    const values = run(graph, st, nodeId, env), entries = {};
    for (const tail of tailsOf(n.type)) for (let r = 1; r <= n.type.rows; r++) for (let c = 1; c <= n.type.cols; c++){ const v = values.get(c + ',' + r + tail);
      if (v !== null && v !== undefined) entries[c + ',' + r + tail] = v === Infinity ? 'inf' : v === -Infinity ? '-inf' : v; }
    return done({ type: n.type, entries });
  } catch (e){      /* never thrown: a function inside itself is a loop, and anything else is a graph that is not well formed */
    if (e && e.broke) return done({ error: e.broke });      /* a promise broken by a value, here or in what this is worked out from; or an error in the side a choose took */
    if (e && e.later){ let b = null; try { b = brokeIn([e.later]); } catch { b = null; }      /* the side a choose took is too large to work out here, or the backend's: so is this */
      return done(b ? { error: b } : { type: n.type, deferred: true, ...(e.later.remote ? { backend: true } : {}), ...(e.later.steps !== undefined ? { steps: e.later.steps } : {}), ...(e.later.forever ? { forever: true } : {}) }); }
    return done({ error: e === LOOP ? { code: 'loop', note: '', node: nodeId } : { code: 'no-source', note: 'it could not be worked out: ' + (e && e.message ? e.message : String(e)), node: nodeId } });
  }
}

/* What a variable promises to hold, and how that stands. -> null for what is no variable, else
   { holds, inferred, state, note }: holds is its promise ("integer?") or null; inferred the space it would have with
   none (graph.js: inferred); state is
       'inferred'   it promises nothing: its space is the inferred one
       'kept'       its values are here and all lie in the space, or it is worked out as a space inside its promise
       'broken'     a value lies outside it: note is the error's, "W is not natural: it holds -3 at 2, 1". The
                    variable has then no value (evaluate answers with the error type)
                    A shape too large to be worked out here whose values can be read off the graph (a source
                    filled with one known value, entries all typed in) is held to its promise by them all the
                    same, at any size: kept or broken, never unproven.
       'unproven'   its values are not here (too large, noise, a data file), or one of them cannot be compared
                    exactly with the space's ends (tanh(20) against 1), and what it is worked out as is not
                    inside its promise: note says so, "W cannot be shown to be natural: it is worked out as
                    integer". A warning: the variable keeps its value. */
export function promiseOf(graph, id, options = {}){
  const n = graph && typeof graph === 'object' && typeof id === 'string' ? nodeAt(graph, id) : null; if (!n || n.op !== 'variable') return null;
  const was = inferred(graph, id), holds = typeof n.holds === 'string' ? n.holds : null;
  if (!holds) return { holds, inferred: was, state: 'inferred', note: '' };
  const a = evaluate(graph, id, options);
  if (a.error && a.error.code === 'type' && a.error.node === id) return { holds, inferred: was, state: 'broken', note: a.error.note };
  const plain = a.deferred ? plainly(graph, id) : null;      /* too large to work out, and its values can be read off the graph all the same: they were held to the promise (evaluate), and keep it */
  if (((a.deferred && !(plain && !untold(holds, plain))) || (a.entries && untold(holds, a.entries))) && !within(was, holds)) return { holds, inferred: was, state: 'unproven', note: UNPROVEN(n.name || id, holds, was) };
  return { holds, inferred: was, state: 'kept', note: '' };
}

/* A promise held against any node's values, for what is no variable of its own: what a function's input block
   promises to take, against what an arrow gives it. -> null for what is no node, else { holds, inferred, state,
   note } as promiseOf gives, inferred being the node's own space. Nothing in the graph is changed by it: it is a
   sentence for whoever draws, and the node keeps its value. name: what the sentence calls it. options.runs: where
   an arrow repeated in a tile takes the node a run at a time ({ axis, start, span, count }, a mapalong's own), it is
   held to the promise run by run, the part no run covers left out, and the sentence says which run:
   "in is not natural: it holds -4 at 1, 1 in run 2". */
export function judged(graph, id, holds, name, options = {}){
  const n = graph && typeof graph === 'object' && typeof id === 'string' ? nodeAt(graph, id) : null; if (!n) return null;
  const was = typeof n.type.value === 'string' ? n.type.value : 'any?';
  if (!holds) return { holds: null, inferred: was, state: 'inferred', note: '' };
  const a = evaluate(graph, id, options), runs = options.runs && typeof options.runs === 'object' ? options.runs : null;
  const parts = !a.entries ? [] : runs ? byRun(a.entries, runs) : [[0, a.entries]];
  for (const [run, entries] of parts){ const out = broken(holds, entries);
    if (out) return { holds, inferred: was, state: 'broken', note: NOT_HELD(name, holds, out.key, out.value) + (run && runs.count > 1 ? ' in run ' + run : '') }; }
  if ((a.deferred || parts.some(([, entries]) => untold(holds, entries))) && !within(was, holds)) return { holds, inferred: was, state: 'unproven', note: UNPROVEN(name, holds, was) };
  return { holds, inferred: was, state: 'kept', note: '' };
}
/* a node's entries as a repeated arrow takes them: one run at a time, each keyed as the function's input has it
   (from 1, 1), and nothing of what lies outside every run. runs: { axis: 'rows' | 'cols', start, span, count }, as a
   mapalong node says them. -> [[run from 1, { key: value }], …], the runs in order, those with no entry left out. */
function byRun(entries, { axis, start, span, count }){
  const out = new Map(), rows = axis === 'rows';
  for (const [key, v] of Object.entries(entries)){ const p = key.split(','), at = Number(p[rows ? 1 : 0]) - start; if (!(at >= 0 && at < span * count)) continue;
    const run = Math.floor(at / span) + 1; p[rows ? 1 : 0] = String(at % span + 1); if (!out.has(run)) out.set(run, {}); out.get(run)[p.join(',')] = v; }
  return [...out].sort((x, y) => x[0] - y[0]);
}

/* A broken promise's sentence as it reads on one use of the variable. The sentence names the entry by the variable's
   own columns, rows and inner positions; a use that is transposed, or turned through its inner axes, draws that
   entry somewhere else, and whoever is looking at that use is told the place as it is drawn there.
   use: the use's node (a transpose of the variable, with its order where it is turned); error: evaluate's.
   -> the note, with the place moved; the note as it is for any other node. */
export function seenFrom(graph, use, error){
  const n = graph && typeof graph === 'object' && typeof use === 'string' ? nodeAt(graph, use) : null, note = error && typeof error.note === 'string' ? error.note : '';
  if (!n || n.op !== 'transpose' || !error || error.code !== 'type' || n.inputs[0] !== error.node) return note;
  const m = note.match(/^([^]* at )(\d+(?:, \d+)+)([^]*)$/); if (!m) return note;
  const p = m[2].split(', '), order = Array.isArray(n.order) && n.order.length === p.length ? n.order : null;
  if (!order && (n.order || p.length < 2)) return note;
  /* axis k of the use is axis order[k] of the variable (graph.js: transpose): the entry at p is drawn where each of the use's axes reads its own */
  return m[1] + (order ? order.map(i => p[i]) : [p[1], p[0], ...p.slice(2)]).join(', ') + m[3];
}

/* Whether a node's whole matrix counts as true (values.js: truthOf): true where any known entry is true; false where
   every entry is known and is zero, false or None; null where that is not known. Where its entries are worked out
   here, it is theirs to say. Where they are not (it is too large), it is judged by what it is known to hold: a source
   filled by rule (zeros and a source of None are false at any size, ones and an identity true), or entries all typed
   in, a transpose of either included. Anything else that is not worked out here (noise, a data file, a large result)
   and anything that has an error is null: only the backend can say, or nothing can. For whoever draws: a shape that
   is false is drawn sunk. */
export function truthAt(graph, id, options = {}){
  const n = graph && typeof graph === 'object' && typeof id === 'string' ? nodeAt(graph, id) : null; if (!n) return null;
  const a = evaluate(graph, id, options), all = (values, count) => { const t = truthOf(values); return t === false && values.length < count ? null : t; };      /* an entry never given is absent: with none true, not known */
  if (a.entries) return all(Object.values(a.entries), numbers(n.type));
  if (!a.deferred || a.backend) return null;
  let at = id, m = n; for (let k = 0; m && k < 64 && m.op === 'transpose'; k++){ at = m.inputs[0]; m = nodeAt(graph, at); }      /* turned, it holds the same numbers */
  const plain = m ? plainly(graph, at) : null; if (!plain) return null;
  for (let k = 0; m && k < 64 && m.op === 'variable' && m.defined !== 'entries' && !m.error && m.inputs.length === 1; k++) m = nodeAt(graph, m.inputs[0]);
  return m && m.op === 'source' ? truthOf(Object.values(plain)) : m ? all(Object.values(plain), numbers(m.type)) : null;      /* a source's values are every value there is in it; a variable's entries are its own, one for each that was given */
}

/* the cell at which a loop was last stopped by its stop block when it was worked out here, or null */
export const stoppedAt = (graph, id) => { const st = graph && typeof graph === 'object' ? states.get(graph) : null; return st && st.stops.has(id) ? st.stops.get(id) : null; };

const texts = new WeakMap();
export function carry(from, to){
  const a = from && typeof from === 'object' ? states.get(from) : null; if (!a || !to || typeof to !== 'object' || from === to) return 0;
  const b = stateOf(to), told = new Map();
  /* a node written out, but for its entries, kept with it (it is asked again at the next carry); entries are told apart one by one, and are mostly the very same values */
  const written = n => { if (!texts.has(n)) texts.set(n, JSON.stringify(n, (k, v) => k === 'entries' && v && typeof v === 'object' ? undefined : v)); return texts.get(n); };
  const alike = (p, q) => { if (p === q || !p || !q || typeof p !== 'object' || typeof q !== 'object') return p === q; const ks = Object.keys(p); if (ks.length !== Object.keys(q).length) return false;
    for (const k of ks){ const u = p[k], v = q[k]; if (u !== v && !(own(q, k) && u && v && typeof u === 'object' && typeof v === 'object' && JSON.stringify(u) === JSON.stringify(v))) return false; } return true; };
  const sameNode = (x, y) => written(x) === written(y) && alike(x.entries, y.entries);
  /* the same node, of the same inputs, all the way down: walked with a list of its own, since a graph may be deep */
  const sameAt = start => { const todo = [start];
    while (todo.length){ const id = todo[todo.length - 1]; if (told.has(id)){ todo.pop(); continue; }
      const x = nodeAt(from, id), y = nodeAt(to, id);
      if (!x || !y || !sameNode(x, y)){ told.set(id, false); todo.pop(); continue; }
      const f = fnOf(y) !== undefined ? [fnAt(from, fnOf(y)), fnAt(to, fnOf(y))] : null;
      if (f && (!f[0] || !f[1] || f[0].input !== f[1].input || f[0].body !== f[1].body)){ told.set(id, false); todo.pop(); continue; }
      const deps = f ? [...y.inputs, f[1].body, f[1].input] : y.inputs, open = deps.filter(d => !told.has(d) && !todo.includes(d));
      if (open.length){ todo.push(...open); continue; }
      told.set(id, deps.every(d => told.get(d) !== false)); todo.pop(); }
    return told.get(start); };
  let n = 0;
  for (const [id, mine] of a.values){ if (!mine.has('') || !sameAt(id)) continue; under(b.values, id).set('', mine.get('')); n++; }
  for (const [id, mine] of a.answers) if (sameAt(id)) for (const [key, answer] of mine) if (key.endsWith('\n')) under(b.answers, id).set(key, answer);
  for (const [id, need] of a.needs) if (sameAt(id)) b.needs.set(id, need);
  return n;
}
