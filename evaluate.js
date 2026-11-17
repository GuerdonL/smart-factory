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
   It never throws for a well-formed graph (graph.js: validate), and it finishes: a function that reaches itself,
   which validate refuses, is the error loop here and not an endless descent.
   MOST                                        4096, the default maxEntries: the most entries the browser works out
   tooLarge(type, most)                        the sentence that says so of a result that size
   toMap(entries)                              an answer's entries as the page keeps them: a Map, infinities as numbers

   What each operation comes to is its rule in graph.js's table (OPS[op].value); this file is what the rules are run
   by. No arithmetic is done here or there: every pair of values goes to combine (values.js, by way of algebra.js)
   and every formula to expression.js. combine works whole numbers, fractions and single roots out directly, so a
   64 by 64 product never reaches the solver.

   What a node needs is its inputs, less those its rule says it does not read (a measure reads a length off its
   input's type, so a matrix's width never waits on the matrix), and, for a function applied, the function's body.

   Remembering. Results are remembered for one graph: evaluate on a new graph starts clean. A node outside every
   function and every tile has one value. A node the graph marks as within a function has one for each thing that
   function is applied to, and one within a tile has one for each cell: such a node is remembered under its id
   together with the whole chain of bindings it sits under, never under its id alone. A tile in a tile's pattern
   adds its cell to the chain, so a node there has a value for each (outer cell, inner cell).

   binding says where a node is being looked at from, for a caller that draws what is inside a function or a tile:
       { params: { "<function id>": "<node id>" | { of: "<node id>", range: { col, row, cols, rows } } },
         cells:  [ { x, y, turned } ] }
   params gives a function's input its value (a node, or a part of one), so that the nodes of its body can be asked
   for; cells is the chain of tile cells the node sits in, outermost first, each the columns and rows that lie
   before the block's first entry across the whole filled tile (graph.js: indexAt). Either may be left out.

   The rules are handed `at`, which is everything they may ask:
       at.get(k, env)      the entries of input k (a Map; not to be changed), under env where one is given
       at.type(k)          input k's type
       at.cells            the chain of cells this node is being worked out in
       at.turn()           an env in which the innermost cell is read through a transpose
       at.shift(dx, dy)    an env in which the innermost cell begins dx columns and dy rows further on (a part of a block)
       at.cell({ x, y })   an env with one more cell, innermost
       at.call(fn, values, key)   function fn's body with values as its input; key names those values among all
                           the function is applied to
       at.keyOf(k)         a key for input k's entries as they are under this env
       at.given(node)      the entries a function's input has been given, none where it has been given nothing */
import { OPS } from './graph.js';
import { passed } from './arrows.js';

export const MOST = 4096;
export const tooLarge = (type, most = MOST) => type.cols * type.rows > most
  ? `it has ${type.cols} × ${type.rows} entries, more than the ${most} that are worked out here: its size is shown, and its numbers are not`
  : `it is worked out from more than the ${most} entries that are worked out here: its size is shown, and its numbers are not`;
export function toMap(entries){
  const out = new Map(); for (const [key, v] of Object.entries(entries || {})) out.set(key, v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v); return out;
}

const LOOP = { loop: true };
const states = new WeakMap();                   /* a graph -> what has been worked out of it */
const stateOf = graph => { if (!states.has(graph)) states.set(graph, { values: new Map(), needs: new Map(), answers: new Map() }); return states.get(graph); };
const fnsOf = n => (n.within || []).filter(w => w[0] === 'f');
const cellsKey = cells => cells.map(c => `${c.x},${c.y}${c.turned ? 't' : ''}`).join(';');
/* what a node's value is remembered under, beside its id: every binding it sits under */
function keyFor(n, env){
  if (!n.within) return '';
  return '|' + fnsOf(n).map(f => env.params[f] ? env.params[f].key : '').join('|') + (n.within.some(w => w[0] === 't') ? '|' + cellsKey(env.cells) : '');
}
/* the most entries of anything a node's value is worked out from, and the first variable among them that has an error */
function needsOf(graph, st, id, open = new Set()){
  if (st.needs.has(id)) return st.needs.get(id);
  const n = graph.nodes[id];
  if (!n || !OPS[n.op] || !n.type || !Array.isArray(n.inputs)) return { most: 0, bad: { code: 'no-source', note: 'no such node', node: id } };
  let most = n.type.cols * n.type.rows, bad = n.op === 'variable' && n.error ? { code: n.error.code, note: n.error.note, node: id } : null;
  if (open.has(id)) return { most, bad: bad || { code: 'loop', note: '', node: id } };
  open.add(id);
  const ins = n.inputs.map(i => graph.nodes[i]), rule = OPS[n.op];
  const read = ins.every(Boolean) ? (rule.needs ? rule.needs(n, ins) : n.inputs.map((_, k) => k)).map(k => n.inputs[k]) : n.inputs;
  const body = (n.op === 'apply' || n.op === 'mapalong') && n.fn !== undefined ? graph.functions[n.fn] : null;
  for (const dep of body ? [...read, body.body] : read){ const d = needsOf(graph, st, dep, open); most = Math.max(most, d.most); bad = bad || d.bad; }
  if ((n.op === 'apply' || n.op === 'mapalong') && n.fn !== undefined && !body) bad = bad || { code: 'no-source', note: 'no such function', node: id };
  open.delete(id);
  const out = { most, bad }; st.needs.set(id, out); return out;
}
const inner = (cells, change) => cells.length ? [...cells.slice(0, -1), change(cells[cells.length - 1])] : cells;

function run(graph, st, id, env){
  const n = graph.nodes[id], key = id + keyFor(n, env);
  if (st.values.has(key)) return st.values.get(key);
  const at = { id, graph, env, cells: env.cells,
    type: k => graph.nodes[n.inputs[k]].type,
    get: (k, e = env) => run(graph, st, n.inputs[k], e),
    keyOf: k => n.inputs[k] + keyFor(graph.nodes[n.inputs[k]], env),
    turn: () => ({ ...env, cells: inner(env.cells, c => ({ ...c, turned: !c.turned })) }),
    shift: (dx, dy) => ({ ...env, cells: inner(env.cells, c => c.turned ? { ...c, x: c.x + dy, y: c.y + dx } : { ...c, x: c.x + dx, y: c.y + dy }) }),
    cell: c => ({ ...env, cells: [...env.cells, { x: c.x, y: c.y, turned: false }] }),
    call(fn, values, k){ const f = graph.functions[fn]; if (!f) return new Map();
      if (env.active.includes(fn)) throw LOOP;      /* a function inside itself: validate refuses the graph, and this stops it */
      return run(graph, st, f.body, { params: { ...env.params, [fn]: { values, key: k } }, cells: [], active: [...env.active, fn] }); },
    given(node){ const fn = fnsOf(node).slice(-1)[0], p = env.params[fn]; if (!p) return new Map();
      if (!p.values){ const spec = p.spec, of = typeof spec === 'string' ? spec : spec.of, rest = { ...env.params }; delete rest[fn];      /* what it was given is not worked out from itself */
        const all = graph.nodes[of] ? run(graph, st, of, { ...env, params: rest }) : new Map(); p.values = typeof spec === 'string' || !spec.range ? all : passed(all, spec.range); }
      return p.values; } };
  const value = OPS[n.op].value(n, at);
  st.values.set(key, value); return value;
}

export function evaluate(graph, nodeId, { maxEntries = MOST, binding = null } = {}){
  const n = graph && graph.nodes && typeof nodeId === 'string' && Object.prototype.hasOwnProperty.call(graph.nodes, nodeId) ? graph.nodes[nodeId] : null;
  if (!n || !OPS[n.op]) return { error: { code: 'no-source', note: 'no such node', node: String(nodeId) } };
  const st = stateOf(graph), bkey = binding ? JSON.stringify(binding) : '', akey = nodeId + '\n' + maxEntries + '\n' + bkey;
  if (st.answers.has(akey)) return st.answers.get(akey);
  const done = answer => { st.answers.set(akey, answer); return answer; };
  const given = Object.entries((binding && binding.params) || {}).filter(([, spec]) => spec && (typeof spec === 'string' || typeof spec.of === 'string'));
  const needs = [needsOf(graph, st, nodeId), ...given.map(([, spec]) => needsOf(graph, st, typeof spec === 'string' ? spec : spec.of))];
  if (needs.some(d => d.most > maxEntries)) return done({ type: n.type, deferred: true });
  const bad = needs.map(d => d.bad).find(Boolean); if (bad) return done({ error: bad });
  const env = { params: Object.fromEntries(given.map(([fn, spec]) => [fn, { spec, key: 'given ' + bkey }])), active: [],
    cells: ((binding && Array.isArray(binding.cells) && binding.cells) || []).map(c => ({ x: Number(c.x) || 0, y: Number(c.y) || 0, turned: !!c.turned })) };
  let values;
  try { values = run(graph, st, nodeId, env); }
  catch (e){ if (e !== LOOP) throw e; return done({ error: { code: 'loop', note: '', node: nodeId } }); }
  const entries = {};
  for (let r = 1; r <= n.type.rows; r++) for (let c = 1; c <= n.type.cols; c++){ const v = values.get(c + ',' + r);
    if (v !== null && v !== undefined) entries[c + ',' + r] = v === Infinity ? 'inf' : v === -Infinity ? '-inf' : v; }
  return done({ type: n.type, entries });
}
