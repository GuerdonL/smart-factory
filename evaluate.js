/* A graph worked out, exactly. No drawing here: a graph (graph.js) and a node's id in, that node's entries out.

   evaluate(graph, nodeId, { maxEntries = 4096, binding = null })
       -> { type, entries }                    worked out: entries is keyed "column,row" from 1 and holds values of
                                               the kinds values.js sets out, written as the graph writes them (an
                                               infinity is "inf" or "-inf"). An entry that depends on an unknown
                                               entry is unknown, and is absent. An entry that cannot be worked out
                                               (a division by zero, ∞ − ∞) is there, as the error value { err }.
        | { type, deferred: true }             too large to work out here: the node, or something its value is
                                               worked out from, has more than maxEntries entries
        | { error: { code, note, node } }      its value is worked out from a variable that has an error; node is
                                               that variable's id. (Also for an id the graph has not got: no-source.)
   It never throws, for a well-formed graph (graph.js: validate) or any other, and it finishes: a function that
   reaches itself, which validate refuses, is the error loop here and not an endless descent, and whatever else
   goes wrong in a graph that is not well formed is the error no-source with what went wrong for its note.
   carry(from, to)                             takes what was worked out of one graph over to another, for every
                                               node that is the same in both: the same id, the same node, and the
                                               same all the way down what it is worked out from. An id says what a
                                               node is, so such a node has the value it had. (Only what was worked
                                               out under no binding is taken: what a function's body came to for one
                                               input says nothing once the input has changed.) Gives how many nodes.
   MOST                                        4096, the default maxEntries: the most entries the browser works out
   tooLarge(type, most)                        the sentence that says so of a result that size
   toMap(entries)                              an answer's entries as the page keeps them: a Map, infinities as numbers

   What each operation comes to is its rule in graph.js's table (OPS[op].value); this file is what the rules are run
   by. No arithmetic is done here or there: every pair of values goes to combine (values.js, by way of algebra.js)
   and every formula to expression.js. combine works whole numbers, fractions and single roots out directly, so a
   64 by 64 product never reaches the solver.

   What a node needs is its inputs, less those its rule says it does not read (a measure reads a length off its
   input's type, so a matrix's width never waits on the matrix), and, for a function applied, the function's body.

   Remembering. Results are remembered for one graph: evaluate on a new graph starts clean, unless they are carried
   to it (carry). A node outside every
   function and every tile has one value. A node the graph marks as within a function has one for each thing that
   function is applied to, and one within a tile has one for each cell: such a node is remembered under its id
   together with the whole chain of bindings it sits under, never under its id alone. A tile in a tile's pattern
   adds its cell to the chain, so a node there has a value for each (outer cell, inner cell).

   binding says where a node is being looked at from, for a caller that draws what is inside a function or a tile:
       { params: { "<function id>": "<node id>" | { of: "<node id>", range: { col, row, cols, rows } } },
         cells:  [ { x, y, dx, dy, turned, at: { "<node id>": { col, row } } } ] }
   params gives a function's input its value (a node, or a part of one), so that the nodes of its body can be asked
   for; cells is the chain of tile cells the node sits in, outermost first: x and y are the columns and rows of
   the filled tile that lie before the cell, dx and dy those of the pattern that lie before the node asked for
   (graph.js: indexAt), and at says where in the pattern other nodes lie, so that a piece of two blocks of one tile
   gives each its own place. Any of it may be left out.

   The rules are handed `at`, which is everything they may ask:
       at.get(k, env)      the entries of input k (a Map; not to be changed), under env where one is given
       at.type(k)          input k's type
       at.cells            the chain of cells this node is being worked out in
       at.turn()           an env in which the innermost cell is read through a transpose
       at.shift(dx, dy)    an env in which the innermost cell begins dx columns and dy rows further on (a part of a block)
       at.cell({ x, y, dx, dy, at, atKey })   an env with one more cell, innermost (at: where the pattern's parts lie; atKey: a text that tells one such at from another)
       at.call(fn, values, key)   function fn's body with values as its input; key names those values among all
                           the function is applied to
       at.keyOf(k)         a key for input k's entries as they are under this env
       at.given(node)      the entries a function's input has been given, none where it has been given nothing */
import { OPS, readsIndex } from './graph.js';
import { passed } from './arrows.js';

export const MOST = 4096;
export const tooLarge = (type, most = MOST) => type.cols * type.rows > most
  ? `it has ${type.cols} × ${type.rows} entries, more than the ${most} that are worked out here: its size is shown, and its numbers are not`
  : `it is worked out from more than the ${most} entries that are worked out here: its size is shown, and its numbers are not`;
export function toMap(entries){
  const out = new Map(); for (const [key, v] of Object.entries(entries || {})) out.set(key, v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v); return out;
}

const LOOP = { loop: true };
const own = (o, k) => !!o && typeof o === 'object' && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const nodeAt = (graph, id) => own(graph.nodes, id) && graph.nodes[id] && typeof graph.nodes[id] === 'object' && own(OPS, graph.nodes[id].op) && Array.isArray(graph.nodes[id].inputs) && graph.nodes[id].type ? graph.nodes[id] : null;
const fnAt = (graph, id) => own(graph.functions, id) && graph.functions[id] && typeof graph.functions[id] === 'object' ? graph.functions[id] : null;
const states = new WeakMap();                   /* a graph -> what has been worked out of it: values and answers by node id, then by binding */
const stateOf = graph => { if (!states.has(graph)) states.set(graph, { values: new Map(), needs: new Map(), answers: new Map(), follows: new Map() }); return states.get(graph); };
/* whether a node's value follows the cell it is worked out in: a formula of its own reads the index, or what it is made of does.
   (The graph marks such a node with its tiles; this is asked of the node itself, so that a value is never remembered under too little.) */
function follows(graph, st, id){
  if (!st.follows.has(id)){ st.follows.set(id, false); const n = nodeAt(graph, id); st.follows.set(id, !!n && (readsIndex(n) || n.inputs.some(i => follows(graph, st, i)))); }
  return st.follows.get(id);
}
const under = (map, id) => { if (!map.has(id)) map.set(id, new Map()); return map.get(id); };
const fnsOf = n => (Array.isArray(n.within) ? n.within : []).filter(w => typeof w === 'string' && w[0] === 'f');
const cellKey = c => `${c.x},${c.y},${c.dx},${c.dy}${c.turned ? 't' : ''}@${c.atKey}`;
const cellsKey = cells => cells.map(cellKey).join(';');
const aCell = c => ({ x: Number(c.x) || 0, y: Number(c.y) || 0, dx: Number(c.dx) || 0, dy: Number(c.dy) || 0, turned: !!c.turned, at: c.at && typeof c.at === 'object' ? c.at : null, atKey: c.at && typeof c.at === 'object' ? (c.atKey ?? JSON.stringify(c.at)) : '' });
/* what a node's value is remembered under, beside its id: every binding it sits under */
function keyFor(graph, st, id, n, env){
  const inCells = env.cells.length > 0 && follows(graph, st, id), fns = fnsOf(n);
  return fns.length || inCells ? '|' + fns.map(f => env.params[f] ? env.params[f].key : '').join('|') + (inCells ? '|' + cellsKey(env.cells) : '') : '';
}
/* the most entries of anything a node's value is worked out from, and the first variable among them that has an error */
function needsOf(graph, st, id, open = new Set()){
  if (st.needs.has(id)) return st.needs.get(id);
  const n = nodeAt(graph, id);
  if (!n) return { most: 0, bad: { code: 'no-source', note: 'no such node', node: String(id) } };
  let most = n.type.cols * n.type.rows, bad = n.op === 'variable' && n.error ? { code: n.error.code, note: n.error.note, node: id } : null;
  if (open.has(id)) return { most, bad: bad || { code: 'loop', note: '', node: id } };
  open.add(id);
  const ins = n.inputs.map(i => nodeAt(graph, i)), rule = OPS[n.op];
  const read = ins.every(Boolean) ? (rule.needs ? rule.needs(n, ins) : n.inputs.map((_, k) => k)).map(k => n.inputs[k]) : n.inputs;
  const applies = (n.op === 'apply' || n.op === 'mapalong') && n.fn !== undefined, body = applies ? fnAt(graph, n.fn) : null;
  for (const dep of body ? [...read, body.body] : read){ const d = needsOf(graph, st, dep, open); most = Math.max(most, d.most); bad = bad || d.bad; }
  if (applies && !body) bad = bad || { code: 'no-source', note: 'no such function', node: id };
  open.delete(id);
  const out = { most, bad }; st.needs.set(id, out); return out;
}
const inner = (cells, change) => cells.length ? [...cells.slice(0, -1), change(cells[cells.length - 1])] : cells;

function run(graph, st, id, env){
  const n = graph.nodes[id], last = env.cells[env.cells.length - 1];
  /* a part of the pattern met again below its tile (an arrow there reads it): it is at its own place, not the reader's */
  if (last && last.at && own(last.at, id)){ const p = last.at[id]; if (last.dx !== p.col || last.dy !== p.row || last.turned) env = { ...env, cells: inner(env.cells, c => ({ ...c, dx: p.col, dy: p.row, turned: false })) }; }
  const mine = under(st.values, id), key = keyFor(graph, st, id, n, env);
  if (mine.has(key)) return mine.get(key);
  const at = { id, graph, env, cells: env.cells,
    type: k => graph.nodes[n.inputs[k]].type,
    get: (k, e = env) => run(graph, st, n.inputs[k], e),
    keyOf: k => n.inputs[k] + keyFor(graph, st, n.inputs[k], graph.nodes[n.inputs[k]], env),
    turn: () => ({ ...env, cells: inner(env.cells, c => ({ ...c, turned: !c.turned })) }),
    shift: (dx, dy) => ({ ...env, cells: inner(env.cells, c => c.turned ? { ...c, dx: c.dx + dy, dy: c.dy + dx } : { ...c, dx: c.dx + dx, dy: c.dy + dy }) }),
    cell: c => ({ ...env, cells: [...env.cells, aCell(c)] }),
    call(fn, values, k){ const f = fnAt(graph, fn); if (!f) return new Map();
      if (env.active.includes(fn)) throw LOOP;      /* a function inside itself: validate refuses the graph, and this stops it */
      return run(graph, st, f.body, { params: { ...env.params, [fn]: { values, key: k } }, cells: [], active: [...env.active, fn] }); },
    given(node){ const fn = fnsOf(node).slice(-1)[0], p = fn !== undefined && own(env.params, fn) ? env.params[fn] : null; if (!p) return new Map();
      if (!p.values){ const spec = p.spec, of = typeof spec === 'string' ? spec : spec.of, rest = { ...env.params }; delete rest[fn];      /* what it was given is not worked out from itself */
        const all = nodeAt(graph, of) ? run(graph, st, of, { ...env, params: rest }) : new Map(); p.values = typeof spec === 'string' || !spec.range ? all : passed(all, spec.range); }
      return p.values; } };
  const value = OPS[n.op].value(n, at);
  mine.set(key, value); return value;
}

export function evaluate(graph, nodeId, { maxEntries = MOST, binding = null } = {}){
  const n = graph && typeof graph === 'object' && typeof nodeId === 'string' ? nodeAt(graph, nodeId) : null;
  if (!n) return { error: { code: 'no-source', note: 'no such node', node: String(nodeId) } };
  const st = stateOf(graph), bkey = binding ? JSON.stringify(binding) : '', kept = under(st.answers, nodeId), akey = maxEntries + '\n' + bkey;
  if (kept.has(akey)) return kept.get(akey);
  const done = answer => { kept.set(akey, answer); return answer; };
  try {
    const given = Object.entries((binding && binding.params) || {}).filter(([, spec]) => spec && (typeof spec === 'string' || typeof spec.of === 'string'));
    const needs = [needsOf(graph, st, nodeId), ...given.map(([, spec]) => needsOf(graph, st, typeof spec === 'string' ? spec : spec.of))];
    if (needs.some(d => d.most > maxEntries)) return done({ type: n.type, deferred: true });
    const bad = needs.map(d => d.bad).find(Boolean); if (bad) return done({ error: bad });
    const env = { params: Object.fromEntries(given.map(([fn, spec]) => [fn, { spec, key: 'given ' + bkey }])), active: [],
      cells: ((binding && Array.isArray(binding.cells) && binding.cells) || []).filter(c => c && typeof c === 'object').map(aCell) };
    const values = run(graph, st, nodeId, env), entries = {};
    for (let r = 1; r <= n.type.rows; r++) for (let c = 1; c <= n.type.cols; c++){ const v = values.get(c + ',' + r);
      if (v !== null && v !== undefined) entries[c + ',' + r] = v === Infinity ? 'inf' : v === -Infinity ? '-inf' : v; }
    return done({ type: n.type, entries });
  } catch (e){      /* never thrown: a function inside itself is a loop, and anything else is a graph that is not well formed */
    return done({ error: e === LOOP ? { code: 'loop', note: '', node: nodeId } : { code: 'no-source', note: 'it could not be worked out: ' + (e && e.message ? e.message : String(e)), node: nodeId } });
  }
}

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
      const f = (y.op === 'apply' || y.op === 'mapalong') && y.fn !== undefined ? [fnAt(from, y.fn), fnAt(to, y.fn)] : null;
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
