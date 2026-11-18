/* Makes the fixtures the backend is tested against, from graph.js and evaluate.js. Run from the repository's root:

       node backend/fixtures/generate.mjs            writes graphs.json and mutations.json beside this file
       node backend/fixtures/generate.mjs --check    writes nothing; says whether the files are what it would write

   graphs.json     [{ name, graph, nodes: { "<node id>": answer }, bound: [{ node, binding, answer }] }]
                   Graphs built by graph.js (every project in projects/, and the canvases set out below, which between
                   them hold every operation), each with what evaluate.js makes of every node. An answer is
                       { rows: [[value, …], …] }    worked out: each entry as a number near what it is exactly (a
                                                    64-bit float), "inf", "-inf", "err" for an entry that is an
                                                    error, or null for one that is unknown
                     | { error: "<code>" }          it is worked out from a variable that has an error
                     | { deferred: true }           not worked out in the browser (too large, noise, a data file)
                   bound: nodes asked for under a binding, as the page asks for what is inside a tile or a function.
   mutations.json  [{ graph: <index into graphs.json>, path: [keys], set: <value> } | { …, drop: true }, valid]
                   as { graph, path, set | drop, valid }: a graph changed in one place, and whether validate
                   (graph.js) still accepts it. The Python validate (backend/check.py) has to say the same of each.

   tests/fixtures.test.js runs this with --check, so the files cannot fall behind the code they were made from. */
import '../../tests/solver.js';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, validate } from '../../graph.js';
import { evaluate } from '../../evaluate.js';
import { read } from '../../project.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const B = (id, x, y, cols, rows, more = {}) => ({ id, type: 'tensor', name: id, x, y, cols, rows, colsName: null, rowsName: null, entries: {}, inside: null, variable: null, ...more });
const space = (shapes, groups = [], operations = []) => ({ shapes, groups, operations });
const snap = (shapes, groups = []) => ({ top: space(shapes, groups) });
const arrow = (id, input, more = {}, shapeMore = {}) => B(id, 0, 0, 1, 1, { type: 'arrow', name: 'Shape 9', arrow: { input, side: 'e', start: 1, span: 1, gap: 2, gapName: null, output: null, formula: null, ...more }, ...shapeMore });
const rowsOf = rows => Object.fromEntries(rows.flatMap((row, r) => row.map((v, c) => [`${c + 1},${r + 1}`, v])).filter(([, v]) => v !== null));
const tile = (id, members, repeat, groups = []) => ({ id, name: null, members, groups, repeat: { x: 0, y: 0, cols: 1, rows: 1, across: 1, down: 1, ...repeat } });
const half = { n: 1, d: 2, k: 0 }, root2 = { n: 2, k: 1 }, f = expr => ({ expr });

/* the canvases: between them, every operation, every kind of value, the infinities and the entries that are errors */
const CASES = {
  'products and scales': snap([B('A', 0, 0, 3, 2, { entries: rowsOf([[1, 2, 3], [4, 5, 6]]) }), B('W', 3, 0, 2, 3, { entries: rowsOf([[half, 2], [-3, root2], [7, { n: -5, d: 3, k: 0 }]]) }), B('s', 5, 0, 1, 1, { entries: { '1,1': { n: 3, d: 4, k: 0 } } }),
    B('T', 0, 10, 2, 3, { name: 'A', variable: 1, reference: true, transposed: true }), B('A0', 20, 20, 3, 2, { name: 'A', variable: 1, reference: true })].map((d, i) => i === 0 ? { ...d, variable: 1 } : d)),
  'sums and broadcasts': snap([B('C', 0, 0, 3, 2, { entries: rowsOf([[1, 2, 3], [4, 5, 6]]) }), B('D', 0, 2, 3, 2, { entries: rowsOf([[10, 20, 30], [half, 0, -1]]) }), B('E3', 0, 4, 3, 2, { entries: rowsOf([[1, 1, 1], [1, 1, 1]]) }),
    B('E', 20, 2, 3, 2, { entries: rowsOf([[1, 2, 3], [4, 5, 6]]) }), B('F', 23, 1, 3, 1, { entries: rowsOf([[2, 0, half]]) }),                       /* times, a row over every row */
    B('G', 40, 0, 3, 2, { entries: rowsOf([[1, 2, 3], [4, 5, 6]]) }), B('H', 43, 2, 1, 2, { entries: rowsOf([[2], [0]]) }),                           /* over, a column: a division by zero in one row */
    B('I', 60, 0, 2, 2, { entries: rowsOf([[1, 2], [3, 4]]) }), B('J', 62, 2, 1, 1, { entries: { '1,1': 4 } }),                                       /* over a single entry */
    B('K', 80, 0, 2, 2, { entries: rowsOf([[1, 2], [3, 4]]) }), B('L', 82, -2, 2, 2, { entries: rowsOf([[5, 6], [7, 8]]) }), B('M', 84, 0, 2, 2, { entries: rowsOf([[2, 2], [4, 4]]) })]),      /* a chain: times, then over */
  'infinities and errors': snap([B('P', 0, 0, 3, 1, { entries: rowsOf([['inf', '-inf', 2]]) }), B('Q', 3, 0, 1, 3, { entries: rowsOf([[1], [1], [0]]) }),      /* ∞ − ∞ in a product */
    B('R', 10, 0, 2, 2, { entries: rowsOf([['inf', 0], [true, false]]) }), B('S', 12, 0, 2, 2, { entries: rowsOf([[0, 1], [2, 'inf']]) }),              /* 0 × ∞ */
    B('V', 20, 0, 4, 1, { entries: rowsOf([[f('1/0'), f('exp(-inf)'), f('ln(0)'), f('tanh(inf) + erf(-inf)')]]) }),
    B('X', 30, 0, 4, 1, { entries: rowsOf([[f('select(2 > 3, 1/0, 5)'), f('max(inf, 3)'), f('min(-inf, 3)'), f('abs(-inf)')]]) }),
    B('Y', 40, 0, 4, 1, { entries: rowsOf([[f('inf == inf'), f('inf > 10^6'), f('!(3 < 2) && (2 <= 2 || 1/0 > 1)'), f('2 != 2')]]) })]),
  'formulas': snap([B('Keys', 0, 0, 4, 2, { entries: rowsOf([[1, 2, 3, 4], [5, 6, 7, 8]]), attributes: [{ name: 'heads', value: '2^3 + 1' }, { name: 'scale', value: '1/√(heads)' }] }),
    B('Tau', 10, 0, 1, 1, { entries: { '1,1': { n: 3, d: 4, k: 0 } } }),
    B('Z', 20, 0, 4, 2, { entries: rowsOf([[f('1/√(@[Keys:x])'), f('@[Tau:m] * 2'), f('@[Keys:a:heads] - @[Keys:y]'), f('@[Keys:a:scale]')],
      [f('exp(2) + 1'), f('2^10 / 3^2'), f('(-8)^(1/3)'), f('√(1/5) + ∜16 - 2√3')]]) }),
    B('U', 30, 0, 4, 2, { entries: rowsOf([[f('exp(1)'), f('ln(2)'), f('tanh(1/2)'), f('erf(1)')], [f('sqrt(2) * sqrt(8)'), f('-2^2'), f('2^3^2'), f('2(3+1)')]]) }),
    B('N', 40, 0, 3, 1, { entries: rowsOf([[f('@[Tau:x]'), f('@[Tau:y] ^ 2'), f('1.25 + .75')]]) }),
    B('Sym', 50, 0, 2, 1, { entries: rowsOf([[{ sym: '1+sqrt(2)' }, { sym: 'e^2' }]]) })]),
  'blocks, slices and measures': snap([B('J', 0, 0, 5, 2, { name: 'Shape 3', joined: [{ fx: 0, fy: 0, fw: .6, fh: 1, shape: B('L', 0, 0, 3, 2, { entries: rowsOf([[1, 2, 3], [4, 5, 6]]) }) }, { fx: .6, fy: 0, fw: .4, fh: 1, shape: B('R', 3, 0, 2, 2, { entries: rowsOf([[7, 8], [9, 10]]) }) }] }),
    B('W', 10, 0, 4, 3, { entries: rowsOf([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]) }),
    B('part', 20, 0, 2, 2, { name: 'Shape 5', from: { id: 'W', range: { col: 1, row: 1, cols: 2, rows: 2, toEnd: { cols: false, rows: false } } } }),
    B('wide', 30, 0, 1, 1, { name: 'Shape 6', from: { id: 'W', side: 'x' } }), B('tall', 32, 0, 1, 1, { name: 'Shape 7', from: { id: 'W', side: 'y' } }),
    B('m', 40, 0, 1, 1, { entries: { '1,1': 9 } }), B('mass', 42, 0, 1, 1, { name: 'Shape 8', from: { id: 'm', side: 'm' } }), B('side', 44, 0, 1, 1, { name: 'Shape 10', from: { id: 'm', side: 'x' } }),
    B('Zs', 50, 0, 3, 2, { source: 'zeros' }), B('Os', 60, 0, 2, 3, { source: 'ones' }), B('Is', 70, 0, 3, 4, { source: 'identity' }),
    B('M2', 80, 0, 2, 2, { entries: rowsOf([[1, 2], [3, 4]]) }), B('I2', 82, 0, 2, 2, { source: 'identity' }),
    B('Def', 90, 0, 2, 1, { inside: space([B('a', 0, 0, 2, 2, { entries: rowsOf([[1, 2], [3, 4]]) }), B('b', 2, 0, 1, 2, { entries: rowsOf([[1], [1]]) })]) }),      /* a definition of another size: an error on the variable */
    B('Good', 100, 0, 1, 2, { inside: space([B('a2', 0, 0, 2, 2, { entries: rowsOf([[1, 2], [3, 4]]) }), B('b2', 2, 0, 1, 2, { entries: rowsOf([[1], [half]]) })]) }),
    B('reads', 110, 0, 1, 1, { entries: { '1,1': f('@[Def:x] + 1') } })]),
  'unknown entries': snap([B('Keys', 0, 0, 2, 2, { entries: rowsOf([[1, 2], [3, null]]) }), B('W', 2, 0, 2, 2, { entries: rowsOf([[1, 0], [0, 1]]) }),
    B('top', 10, 0, 2, 1, { name: 'Shape 4', from: { id: 'Keys', range: { col: 0, row: 0, cols: 2, rows: 1, toEnd: { cols: true, rows: false } } } }),
    B('n', 20, 0, 1, 1, { entries: { '1,1': f('@[Keys:x] * 3') } }), B('Empty', 30, 0, 1, 1), B('uses', 32, 5, 1, 1, { entries: { '1,1': f('@[Empty:m] + 1') } })]),
  'arrows': snap([B('X', 0, 0, 4, 3, { entries: rowsOf([[1, -2, 3, -4], [-5, 6, -7, 8], [9, -10, 11, -12]]) }), arrow('pass', { id: 'X', as: 'block' }, { start: 2, span: 2 }),
    arrow('relu', { id: 'X', as: 'block' }, { side: 's', span: 4, formula: 'max(x, 0)' }), arrow('mask', { id: 'X', as: 'block' }, { side: 'n', span: 3, formula: 'select(i > j, -inf, x)' }),
    arrow('eye', { id: 'X', as: 'block' }, { side: 'w', span: 3, formula: 'i == j' }), arrow('mix', { id: 'X', as: 'block' }, { side: 'e', span: 3, formula: 'x * @[s:m] + @[O] / (i + j)' }),
    B('s', 30, 30, 1, 1, { entries: { '1,1': half } }), B('O', 40, 40, 4, 3, { source: 'ones' }),
    arrow('lin', { id: 'X', as: 'block' }, { span: 3 }, { x: 50, variable: 7, name: 'linear', inside: space([B('in', -9, 0, 4, 3, { in: true }), B('Wf', -5, 0, 2, 4, { entries: rowsOf([[1, 0], [0, 1], [1, 1], [half, -1]]) })]) }),
    B('Y', 0, 60, 4, 3, { entries: rowsOf([[1, 1, 1, 1], [2, 2, 2, 2], [0, 0, 0, 1]]) }), arrow('use', { id: 'Y', as: 'block' }, { span: 3 }, { variable: 7, name: 'linear', reference: true }),
    arrow('sm', { id: 'Y', as: 'block' }, { side: 's', span: 4, formula: 'exp(x) / (1 + exp(x))' }), arrow('rec', { id: 'Y', as: 'block' }, { side: 'n', span: 4, formula: '1/x' }),
    B('H', 6, 1, 4, 2, { seat: 'pass' }), B('V', 10, 1, 1, 4, { entries: rowsOf([[1], [1], [1], [1]]) })]),
  'a tile and its index': snap([B('Row', 0, 0, 4, 1, { entries: rowsOf([[1, 2, 3, 4]]) }), arrow('out', { id: 't1', as: 'tile' }),
    B('P', 0, 10, 2, 2, { entries: rowsOf([[f('index.x + index.y'), f('index.x * 10')], [f('index.y'), 7]]) }), arrow('out2', { id: 't2', as: 'tile' }, { side: 's' }),
    B('Q', 0, 30, 2, 1, { entries: rowsOf([[f('index.x'), f('index.y')]]) }), B('Qr', 2, 30, 1, 1, { entries: { '1,1': 5 } }), arrow('out3', { id: 't3', as: 'tile' }),
    B('Out', 50, 50, 1, 1, { entries: { '1,1': f('index.x') } })],
    [tile('t1', [0], { cols: 4, rows: 1, down: 3 }), tile('t2', [2], { y: 10, cols: 2, rows: 2, across: 3, down: 2 }), tile('t3', [4, 5], { y: 30, cols: 3, rows: 1, across: 2, down: 2 })]),
  'an arrow repeated along its input': snap([B('M', 0, 0, 4, 2, { entries: rowsOf([[1, -2, 3, -4], [-5, 6, -7, 8]]) }), arrow('f', { id: 'M', as: 'block' }, { side: 's', formula: 'max(x, 0) + index.x / 10' }, { x: 0, y: 2 }),
    B('N', 0, 20, 2, 4, { entries: rowsOf([[1, 2], [3, 4], [5, 6], [7, 8]]) }),
    arrow('g', { id: 'N', as: 'block' }, { side: 'e', span: 2 }, { x: 2, y: 20, inside: space([B('in', -9, 0, 2, 2, { in: true }), B('Wg', -7, 0, 1, 2, { entries: rowsOf([[1], [10]]) })]) })],
    [tile('t1', [1], { y: 2, cols: 1, rows: 2, across: 4 }), tile('t2', [3], { x: 2, y: 20, cols: 1, rows: 2, down: 2 })]),
  'a tile inside a tile': snap([B('A', 0, 0, 2, 1, { entries: rowsOf([[f('index.x'), f('index.x * 10 + index.y')]]) }), B('U', 0, 1, 4, 1, { entries: rowsOf([[f('index.x'), 0, 0, f('index.y')]]) }),
    arrow('out', { id: 'outer', as: 'tile' }), arrow('in', { id: 'inner', as: 'tile' }, { side: 'n' })],
    [{ id: 'outer', name: null, members: [1], repeat: { x: 0, y: 0, cols: 4, rows: 2, across: 2, down: 2 }, groups: [tile('inner', [0], { cols: 2, rows: 1, across: 2 })] }]),
  'an arrow repeated through two tiles': snap([B('M', 0, 0, 8, 1, { entries: rowsOf([[1, 2, 3, 4, 5, 6, 7, 8]]) }), arrow('f', { id: 'M', as: 'block' }, { side: 's', formula: 'x * 2' }, { x: 0, y: 1 }), B('seat', 0, 3, 1, 1, { seat: 'f' })],
    [{ id: 'outer', name: null, members: [2], repeat: { x: 0, y: 1, cols: 2, rows: 3, across: 4, down: 1 }, groups: [tile('inner', [1], { y: 1, cols: 1, rows: 1, across: 2 })] }]),
  'a function repeated through two tiles': { top: space([B('M', 0, 0, 8, 1, { entries: rowsOf([[1, 2, 3, 4, 5, 6, 7, 8]]) }),
    arrow('f', { id: 'M', as: 'block' }, { side: 's' }, { x: 0, y: 1, inside: space([B('in', -9, 0, 1, 1, { in: true }), B('two', -8, 0, 1, 1, { entries: { '1,1': 2 } })]) }), B('seat', 0, 3, 1, 1, { seat: 'f' })],
    [{ id: 'outer', name: null, members: [2], repeat: { x: 0, y: 1, cols: 2, rows: 3, across: 4, down: 1 }, groups: [tile('inner', [1], { y: 1, cols: 1, rows: 1, across: 2 })] }]) },
  'noise and a data file': snap([B('Nz', 0, 0, 4, 4, { source: { noise: { seed: 0, dist: 'uniform' } } }), B('Gs', 4, 0, 4, 2, { source: { noise: { seed: 7, dist: 'normal' } } }), B('Fl', 20, 0, 3, 2, { source: { file: 'data/table.csv' } }),
    B('Nt', 0, 20, 2, 1, { source: { noise: { seed: 1, dist: 'uniform' } } }), arrow('out', { id: 't1', as: 'tile' })], [tile('t1', [3], { y: 20, cols: 2, rows: 1, across: 2, down: 2 })]),
  'a loop': snap([B('K', 0, 0, 1, 1, { variable: 1, inside: space([B('k2', 0, 0, 1, 1, { name: 'K', variable: 1, reference: true }), B('two', 1, 0, 1, 1, { entries: { '1,1': 2 } })]) }),
    B('A', 9, 0, 1, 2, { entries: rowsOf([[1], [2]]) }), B('C', 9, 2, 1, 2, { entries: rowsOf([[10], [20]]) }), B('uses', 20, 0, 1, 1, { entries: { '1,1': f('@[K:m] + 1') } })]),
};

const files = (dir, at = '') => readdirSync(join(dir, at)).sort().flatMap(n => statSync(join(dir, at, n)).isDirectory() ? files(dir, at + n + '/') : [{ path: at + n, text: readFileSync(join(dir, at, n), 'utf8') }]);
const near = v => v === null || v === undefined ? null : v === 'inf' || v === '-inf' ? v : typeof v === 'boolean' ? +v : typeof v === 'number' ? v
  : typeof v.err === 'string' ? 'err' : typeof v.sym === 'string' ? Number(globalThis.nerdamer(v.sym).evaluate().text('decimals', 30)) : Math.sign(v.n) * Math.pow(Math.abs(v.n) / (v.d || 1), 1 / 2 ** v.k);
function answer(r){
  if (r.error) return { error: r.error.code };
  if (r.deferred) return { deferred: true };
  const rows = []; for (let y = 1; y <= r.type.rows; y++){ const row = []; for (let x = 1; x <= r.type.cols; x++) row.push(near(r.entries[x + ',' + y])); rows.push(row); }
  return { rows };
}
/* what is inside a tile, asked for as the page asks: each part of each tile's pattern, in its first cell and in another */
function bindings(g){
  const out = [];
  for (const s of Object.values(g.spaces)) for (const t of s.tiles){ const n = t.node && g.nodes[t.node]; if (!n) continue;
    const at = {}; n.inputs.forEach((id, k) => { if (n.inputs.indexOf(id) === n.inputs.lastIndexOf(id)) at[id] = n.at[k]; });
    for (const [cx, cy] of [[1, 1], [n.across, n.down]]) n.inputs.forEach((id, k) => { if (g.nodes[id].op === 'repeat') return;
      out.push({ node: id, binding: { cells: [{ x: (cx - 1) * n.pattern.cols, y: (cy - 1) * n.pattern.rows, dx: n.at[k].col, dy: n.at[k].row, cx, cy, of: [t.tile], at }] } }); }); }
  /* an arrow in a tile, in the first cell and in another of every tile it is in (a tile whose pattern has no matrix has cells all the same) */
  for (const s of Object.values(g.spaces)) for (const t of s.tiles) for (const id of t.arrows){ const a = s.arrows.find(a => a.arrow === id); if (!a || !a.node) continue;
    for (const x of [0, 2]) out.push({ node: a.node, binding: { cells: [{ x, y: 0, dx: 0, dy: 0, cx: 1 + x / 2, cy: 1, of: [t.tile] }] } }); }
  /* and what is inside a function, given what one arrow gives it */
  for (const [id, n] of Object.entries(g.nodes)) if (n.op === 'apply'){ const f = g.functions[n.fn]; out.push({ node: f.body, binding: { params: { [n.fn]: n.inputs[0] } } }); out.push({ node: f.input, binding: { params: { [n.fn]: n.inputs[0] } } }); }
  return out;
}

export function fixtures(){
  const graphs = [];
  const add = (name, g) => { const bad = validate(g); if (bad.length) throw new Error(name + ' is not well formed: ' + bad[0]);
    graphs.push({ name, graph: g, nodes: Object.fromEntries(Object.keys(g.nodes).map(id => [id, answer(evaluate(g, id))])), bound: bindings(g).map(b => ({ ...b, answer: answer(evaluate(g, b.node, { binding: b.binding })) })) }); };
  for (const name of readdirSync(join(root, 'projects')).sort()) if (statSync(join(root, 'projects', name)).isDirectory()) add('projects/' + name, build(read(files(join(root, 'projects', name)).filter(f => /\.json$|(^|\/)\.config$|\.csv$/.test(f.path)))));
  for (const [name, s] of Object.entries(CASES)) add(name, build(s));
  return { graphs: JSON.parse(JSON.stringify(graphs)), mutations: mutations(graphs.map(x => JSON.parse(JSON.stringify(x.graph)))) };
}

/* ---- graphs changed in one place ---- */
function mutations(graphs){
  let seed = 20261118; const rnd = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % n; };      /* the same every time */
  const out = [];
  const paths = (v, at = [], all = []) => { if (v && typeof v === 'object') for (const k of Object.keys(v)){ all.push([...at, k]); paths(v[k], [...at, k], all); } return all; };
  const get = (g, path) => path.reduce((v, k) => v[k], g);
  const apply = (g, m) => { const h = JSON.parse(JSON.stringify(g)), last = m.path[m.path.length - 1], host = get(h, m.path.slice(0, -1));
    if (m.drop){ if (Array.isArray(host)) host.splice(+last, 1); else delete host[last]; } else host[last] = m.set; return h; };
  const OTHER = [null, 0, 1, -1, 2, 1.5, '', 'x', true, false, [], {}, 1e9, 'inf', { n: 1, d: 2, k: 0 }, { n: 2, d: 4, k: 0 }, { n: 4, k: 1 }, { err: 'no' }, { expr: '$1 + 1' }, { expr: 'eval(x)' }, { expr: '((' }, { sym: 'x' }, 'index.x', 'x + i', '$9', '__proto__', 'constructor', 'data/../x.csv', 'data/a.csv'];
  graphs.forEach((g, gi) => { const all = paths(g), ids = Object.keys(g.nodes), tried = new Set();
    const push = m => { const key = JSON.stringify(m); if (tried.has(key)) return; tried.add(key); out.push({ graph: gi, ...m, valid: validate(apply(g, m)).length === 0 }); };
    for (let n = 0; n < Math.min(260, all.length * 2); n++){ const path = all[rnd(all.length)], was = get(g, path), kind = rnd(6);
      if (kind === 0) push({ path, drop: true });
      else if (kind === 1 && typeof was === 'number') push({ path, set: was + [1, -1, .5, 1000][rnd(4)] });
      else if (kind === 2 && typeof was === 'string' && ids.length > 1) push({ path, set: ids[rnd(ids.length)] });
      else if (kind === 3 && typeof was === 'string') push({ path, set: was + ['x', ' ', '(', '+1', '.y'][rnd(5)] });
      else push({ path, set: OTHER[rnd(OTHER.length)] }); } });
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const made = fixtures(), texts = { 'graphs.json': JSON.stringify(made.graphs) + '\n', 'mutations.json': '[\n' + made.mutations.map(m => JSON.stringify(m)).join(',\n') + '\n]\n' };
  if (process.argv.includes('--check')){ const stale = Object.keys(texts).filter(f => { try { return readFileSync(join(here, f), 'utf8') !== texts[f]; } catch { return true; } });
    console.log(stale.length ? 'out of date: ' + stale.join(', ') : 'up to date'); process.exit(stale.length ? 1 : 0); }
  for (const [f, t] of Object.entries(texts)) writeFileSync(join(here, f), t);
  console.log(`${made.graphs.length} graphs, ${made.graphs.reduce((n, g) => n + Object.keys(g.nodes).length + g.bound.length, 0)} answers, ${made.mutations.length} changed graphs (${made.mutations.filter(m => m.valid).length} still well formed)`);
}
