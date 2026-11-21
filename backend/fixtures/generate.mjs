/* Makes the fixtures the backend is tested against, from graph.js and evaluate.js. Run from the repository's root:

       node backend/fixtures/generate.mjs            writes graphs.json and mutations.json beside this file
       node backend/fixtures/generate.mjs --check    writes nothing; says whether the files are what it would write

   graphs.json     [{ name, graph, nodes: { "<node id>": answer }, bound: [{ node, binding, answer }] }]
                   Graphs built by graph.js (every project in projects/, and the canvases set out below), and graphs
                   written by hand for what no canvas makes yet (HAND, below: stack, entry, a transpose with an
                   order, a function given inner data); between them they hold every operation. Each comes with
                   what evaluate.js makes of every node. An answer is
                       { rows: [[value, …], …] }    worked out: each entry as a number near what it is exactly (a
                                                    64-bit float), "inf", "-inf", "err" for an entry that is an
                                                    error, "none" for one that is None, or null for one that
                                                    is unknown
                     | { inner: [2, 4], rows: … }   worked out, of a node whose entries hold inner data: inner is
                                                    the lengths of its inner axes, and rows is nested once more
                                                    for each of them, outermost first, so the entry at
                                                    "column,row,k1,k2" is rows[k1 - 1][k2 - 1][row - 1][column - 1]
                                                    (the backend holds its arrays the same way round)
                     | { error: "<code>" }          it is worked out from a variable that has an error
                     | { deferred: true }           not worked out in the browser (too large, noise, a data file)
                   bound: nodes asked for under a binding, as the page asks for what is inside a tile or a function.
   mutations.json  [{ graph: <index into graphs.json>, path: [keys], set: <value> } | { …, drop: true }, valid]
                   as { graph, path, set | drop, valid }: a graph changed in one place, and whether validate
                   (graph.js) still accepts it. The Python validate (backend/check.py) has to say the same of each.
                   Most are changed at random (the same every time); TYPES, below, adds changes to what a type and
                   an entry's key may be, for every node that holds inner data.

   spaces.json     what spaces.js makes of the number spaces: for every pair of the nine, whether one lies inside the
                   other and the space of both; for every pair of written spaces (each with and without "?") and every
                   operation, what the operation gives; the smallest space of some values; and the space of some
                   formulas. backend/spaces.py has to say the same of every one (backend/tests/test_spaces.py).

   tests/fixtures.test.js runs this with --check, so the files cannot fall behind the code they were made from. */
import '../../tests/solver.js';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, validate, tailsOf, VERSION } from '../../graph.js';
import { evaluate } from '../../evaluate.js';
import { read } from '../../project.js';
import * as S from '../../spaces.js';
import { treeOf } from '../../expression.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const B = (id, x, y, cols, rows, more = {}) => ({ id, type: 'tensor', name: id, x, y, cols, rows, colsName: null, rowsName: null, entries: {}, inside: null, variable: null, ...more });
const space = (shapes, groups = [], operations = []) => ({ shapes, groups, operations });
/* the .config that comes with a project: it is kept beside the project's directory, as <name>.config (projects/README.md) */
const given = name => { try { return [{ path: '.config', text: readFileSync(join(root, 'projects', name + '.config'), 'utf8') }]; } catch (e) { return []; } };
const snap = (shapes, groups = []) => ({ top: space(shapes, groups) });
const arrow = (id, input, more = {}, shapeMore = {}) => B(id, 0, 0, 1, 1, { type: 'arrow', name: 'Shape 9', arrow: { input, side: 'e', start: 1, span: 1, gap: 2, gapName: null, output: null, formula: null, ...more }, ...shapeMore });
const rowsOf = rows => Object.fromEntries(rows.flatMap((row, r) => row.map((v, c) => [`${c + 1},${r + 1}`, v])).filter(([, v]) => v !== null));
const tile = (id, members, repeat, groups = []) => ({ id, name: null, members, groups, repeat: { x: 0, y: 0, cols: 1, rows: 1, across: 1, down: 1, ...repeat } });
const half = { n: 1, d: 2, k: 0 }, root2 = { n: 2, k: 1 }, f = expr => ({ expr }), NONE = { none: true };
/* inner data: axes as a snapshot gives them, and every number of a shape that holds them, from fill(c, r, k1, …) (null: not given) */
const ax = (length, name = null) => ({ length, name });
const filled = (cols, rows, inner, fill) => { const out = {};
  for (const tail of tailsOf({ inner })) for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++){ const v = fill(c, r, ...tail.split(',').slice(1).map(Number)); if (v !== null) out[c + ',' + r + tail] = v; }
  return out; };
const I = (id, x, y, cols, rows, inner, fill, more = {}) => B(id, x, y, cols, rows, { inner, entries: fill ? filled(cols, rows, inner, fill) : {}, ...more });
const whole = { cols: false, rows: false };

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
  /* ---- inner data (phase 8): every rule repeated at each inner position ---- */
  'inner data: products and scales': snap([B('X', 0, 0, 2, 2, { entries: rowsOf([[1, 2], [3, half]]) }), I('W', 2, 0, 2, 2, [ax(3, 'head')], (c, r, h) => c === r ? h : c - r),      /* one has none: X is used at every head */
    I('P', 10, 0, 2, 1, [ax(2)], (c, r, k) => c * k), I('Q', 12, 0, 1, 2, [ax(2)], (c, r, k) => k === 2 && r === 2 ? root2 : r + k),      /* both hold it: position by position */
    B('s', 20, 0, 1, 1, { entries: { '1,1': { n: 3, d: 4, k: 0 } } }), I('M', 21, 0, 2, 2, [ax(2), ax(2)], (c, r, k1, k2) => c + 10 * r + 100 * k1 + 1000 * k2),      /* a scalar scales all of it */
    I('One', 30, 0, 1, 1, [ax(2)], (c, r, k) => k + 1), I('Row', 31, 0, 3, 1, [ax(2)], (c, r, k) => c * k),      /* a 1 by 1 that holds inner data is a matrix: 1 column against 1 row */
    I('Wt', 40, 0, 2, 2, [ax(3, 'head')], null, { name: 'W', variable: 1, reference: true, transposed: true })].map((d, i) => i === 1 ? { ...d, variable: 1 } : d)),
  'inner data: sums and entry by entry': snap([I('C', 0, 0, 2, 1, [ax(2)], (c, r, k) => c + 10 * k), I('D', 0, 1, 2, 1, [ax(2)], (c, r, k) => k === 1 ? half : 100 * c),
    I('E', 20, 2, 2, 2, [ax(2)], (c, r, k) => c + 2 * r + 4 * k), B('F', 22, 1, 2, 1, { entries: rowsOf([[2, half]]) }),                            /* times a row that holds none */
    I('G', 40, 0, 2, 2, [ax(2)], (c, r, k) => c * r * k), I('H', 42, 2, 1, 2, [ax(2)], (c, r, k) => r === 2 && k === 2 ? 0 : r + k),              /* over a column, both holding it: a division by zero at one position */
    I('K', 60, 0, 2, 2, [ax(3)], (c, r, k) => 12 * k * c / r), B('J', 62, 2, 1, 1, { entries: { '1,1': 4 } }),                                       /* over a scalar */
    I('L', 80, 2, 2, 1, [ax(2)], (c, r, k) => c + k), I('N', 82, 1, 2, 1, [ax(2)], (c, r, k) => c * k),                                             /* times, both */
    I('Bad', 100, 0, 2, 1, [ax(2)], (c, r, k) => 1), B('Flat', 100, 1, 2, 1, { entries: rowsOf([[1, 1]]) })]),                                      /* a sum against no inner data: refused */
  'inner data: parts, sources and measures': snap([I('W', 0, 0, 3, 2, [ax(2, 'key')], (c, r, k) => c + 10 * r + 100 * k),
    I('part', 10, 0, 2, 1, [ax(2, 'key')], null, { name: 'Shape 5', from: { id: 'W', range: { col: 1, row: 1, cols: 2, rows: 1, toEnd: whole } } }),
    I('cell', 15, 0, 1, 1, [ax(2, 'key')], null, { name: 'Shape 6', from: { id: 'W', range: { col: 2, row: 0, cols: 1, rows: 1, toEnd: whole } } }),      /* cut down to one entry: 1 by 1, and no scalar */
    I('J', 20, 0, 2, 2, [ax(2)], null, { name: 'Shape 3', joined: [{ fx: 0, fy: 0, fw: .5, fh: 1, shape: I('Lj', 20, 0, 1, 2, [ax(2)], (c, r, k) => r * k) }, { fx: .5, fy: 0, fw: .5, fh: 1, shape: I('Rj', 21, 0, 1, 2, [ax(2)], (c, r, k) => -r - k) }] }),
    I('Zs', 30, 0, 2, 2, [ax(2)], null, { source: 'zeros' }), I('Os', 40, 0, 2, 1, [ax(2), ax(3)], null, { source: 'ones' }), I('Is', 50, 0, 2, 3, [ax(2)], null, { source: 'identity' }),
    I('M2', 60, 0, 2, 2, [ax(2)], (c, r, k) => c + 2 * r + 4 * k), I('I2', 62, 0, 2, 2, [ax(2)], null, { source: 'identity' }),
    B('n', 70, 0, 3, 1, { entries: rowsOf([[f('@[W:d1] + 1'), f('@[W:x] * @[W:y]'), f('@[Os:d2] / @[Os:d1]')]]) }),      /* the length of an inner axis, read off the type */
    I('Fk', 80, 0, 2, 1, [ax(3)], (c, r, k) => k === 2 ? f('k1 * 10 + ' + c) : k === 3 ? f('@[W:d1] ^ k1') : c),      /* a formula in an entry reads its inner position */
    I('Half', 90, 0, 2, 1, [ax(2)], (c, r, k) => k === 2 && c === 2 ? null : c + k), I('Hw', 92, 0, 1, 2, [ax(2)], (c, r, k) => 1),      /* a number never given, at depth */
    I('Nz', 100, 0, 2, 2, [ax(2)], null, { source: { noise: { seed: 3, dist: 'uniform' } } })]),
  'inner data: arrows and a tile': snap([I('X', 0, 0, 3, 2, [ax(2)], (c, r, k) => (c - 2) * r * k), arrow('pass', { id: 'X', as: 'block' }, { start: 2, span: 1 }),
    arrow('relu', { id: 'X', as: 'block' }, { side: 's', span: 3, formula: 'max(x, 0) + k1 / 4' }), arrow('mix', { id: 'X', as: 'block' }, { side: 'n', span: 3, formula: 'x * @[s:m] + @[O] * i + @[Xi] / (j + k1)' }),
    B('s', 30, 30, 1, 1, { entries: { '1,1': half } }), B('O', 40, 40, 3, 2, { source: 'ones' }), I('Xi', 44, 44, 3, 2, [ax(2)], (c, r, k) => c + r + k),      /* a matrix the formula names that holds no inner data is read at every position */
    I('Y', 0, 60, 2, 2, [ax(3)], (c, r, k) => c + r * k), arrow('lin', { id: 'Y', as: 'block' }, { span: 2 }, { x: 50, name: 'linear', inside: space([B('in2', -9, 0, 2, 2, { in: true }), B('Wf', -7, 0, 1, 2, { entries: rowsOf([[1], [half]]) })]) }),      /* its input block holds none: run at each position */
    I('Z', 0, 80, 2, 2, [ax(3)], (c, r, k) => c * r - k), arrow('all', { id: 'Z', as: 'block' }, { span: 2 }, { x: 50, y: 80, name: 'whole', inside: space([I('in3', -9, 0, 2, 2, [ax(3)], null, { in: true }), I('Wg', -7, 0, 1, 2, [ax(3)], (c, r, k) => r + k)]) }),      /* it holds the same: applied once */
    I('T', 0, 100, 1, 1, [ax(2)], (c, r, k) => k === 1 ? f('index.x * 10 + k1') : f('index.y - k1')), arrow('out', { id: 't1', as: 'tile' })],
    [tile('t1', [11], { y: 100, cols: 1, rows: 1, across: 3, down: 2 })]),
  /* ---- None (phase 9): every row of the table that can arise where every number is a float ---- */
  'None': snap([B('Nn', 0, 0, 4, 2, { entries: rowsOf([[NONE, 1, 0, NONE], [2, NONE, 'inf', 3]]) }), B('Np', 0, 2, 4, 2, { entries: rowsOf([[1, NONE, 5, NONE], [f('1/0'), 2, 3, f('none')]]) }),      /* a sum: None + 1, None + None, and an error against a number */
    B('Pa', 10, 0, 2, 2, { entries: rowsOf([[0, NONE], [1, 2]]) }), B('Pb', 12, 0, 2, 2, { entries: rowsOf([[NONE, 1], ['inf', 4]]) }),      /* a product: an entry with one None term is None, also where the None meets an infinity or a zero */
    B('Pc', 20, 0, 2, 1, { entries: rowsOf([[0, NONE]]) }), B('Pd', 22, 0, 1, 2, { entries: rowsOf([['inf'], [1]]) }),      /* 0 × ∞ beside a None term: the error comes first */
    B('Pe', 25, 0, 3, 1, { entries: rowsOf([['inf', NONE, '-inf']]) }), B('Pf', 28, 0, 1, 3, { entries: rowsOf([[1], [0], [1]]) }),      /* ∞ − ∞ beside a None term likewise */
    B('Ea', 30, 2, 3, 1, { entries: rowsOf([[NONE, 4, 0]]) }), B('Eb', 33, 3, 3, 1, { entries: rowsOf([[2, NONE, NONE]]) }),      /* over: None / 2, 4 / None and 0 / None are None, never a division by zero */
    B('Ec', 40, 2, 2, 1, { entries: rowsOf([[NONE, 3]]) }), B('Ed', 42, 1, 2, 1, { entries: rowsOf([[0, NONE]]) }),      /* times: None × 0 */
    B('Vn', 50, 0, 7, 3, { entries: rowsOf([[f('none + 1'), f('none * 0'), f('none == 0'), f('none == false'), f('none == none'), f('none < 1'), f('max(none, 3)')],
      [f('1/none'), f('exp(none)'), f('ln(none)'), f('select(none, 1, 2)'), f('!none'), f('none && 1'), f('none || 2')],
      [f('none || 0'), f('none + 1/0'), f('none != 0'), f('select(1, none, 3)'), f('-∅'), f('none ^ 2'), f('none ^ (1/3)')]]) }),
    arrow('fill', { id: 'Nn', as: 'block' }, { side: 's', span: 4, formula: 'select(x == none, 0, x + 1)' }), arrow('twice', { id: 'Nn', as: 'block' }, { side: 'n', span: 4, formula: 'select(x > 1, @[Sn:m], min(x * 2, 5))' }),
    arrow('root', { id: 'Nn', as: 'block' }, { side: 'w', span: 2, formula: 'tanh(sqrt(abs(x))) + erf(x) * 0' }),
    B('Sn', 60, 0, 1, 1, { entries: { '1,1': NONE } }), B('ns', 62, 0, 1, 1, { name: 'Shape 20', from: { id: 'Sn', side: 'x' } }), B('nm', 64, 0, 1, 1, { name: 'Shape 21', from: { id: 'Sn', side: 'm' } }),      /* the side of None is None, as its mass is */
    B('reads', 66, 0, 2, 1, { entries: rowsOf([[f('@[Sn:m] + 1'), f('select(@[Sn:m], 1, 2)')]]) }),
    B('Sc', 70, 0, 1, 1, { entries: { '1,1': NONE } }), B('Sm', 71, 0, 2, 2, { entries: rowsOf([[1, 2], [3, f('1/0')]]) }),      /* a scale by None: None everywhere but where there is no value */
    B('Nt', 80, 0, 2, 4, { name: 'Nn', variable: 1, reference: true, transposed: true }),
    B('part', 90, 0, 2, 1, { name: 'Shape 22', from: { id: 'Nn', range: { col: 2, row: 0, cols: 2, rows: 1, toEnd: whole } } }),
    B('Jn', 100, 0, 2, 1, { name: 'Shape 23', joined: [{ fx: 0, fy: 0, fw: .5, fh: 1, shape: B('Jl', 100, 0, 1, 1, { entries: { '1,1': NONE } }) }, { fx: .5, fy: 0, fw: .5, fh: 1, shape: B('Jr', 101, 0, 1, 1, { entries: { '1,1': 7 } }) }] }),
    B('Tn', 0, 40, 2, 1, { entries: rowsOf([[NONE, f('index.x')]]) }), arrow('out', { id: 't1', as: 'tile' })].map((d, i) => i === 0 ? { ...d, variable: 1 } : d),
    [tile('t1', [25], { y: 40, cols: 2, rows: 1, across: 2, down: 2 })]),
  /* ---- number spaces (phase 9): promises that are kept, on shapes and on a function's input and output ---- */
  'number spaces': snap([B('Wn', 0, 0, 3, 1, { entries: rowsOf([[1, 2, 3]]), holds: 'natural' }), B('Wz', 0, 1, 3, 1, { entries: rowsOf([[-2, 0, NONE]]), holds: 'integer?' }),      /* a sum of a natural and an integer or None */
    B('Pp', 10, 0, 2, 2, { entries: rowsOf([[half, 1], [0, { n: 1, d: 2, k: 1 }]]) }), B('Pq', 12, 0, 2, 2, { entries: rowsOf([[1, 0], [0, 1]]), holds: 'boolean' }),      /* a product of probabilities and booleans */
    B('Fm', 20, 0, 4, 1, { entries: rowsOf([[f('@[Wn:x] + 1'), f('1/3'), f('exp(1)'), f('select(2 > 1, none, -1)')]]) }),
    B('Any', 30, 0, 2, 1, { entries: rowsOf([['inf', 2]]), holds: 'any' }), B('Cx', 40, 0, 1, 1, { entries: { '1,1': 2 }, holds: 'complex' }),      /* complex is no space: the promise is not read */
    B('X', 0, 20, 2, 2, { entries: rowsOf([[1, 2], [3, 4]]) }),
    arrow('lin', { id: 'X', as: 'block' }, { span: 2 }, { x: 50, y: 20, name: 'linear', inside: space([B('inn', -9, 0, 2, 2, { in: true, holds: 'natural' }), B('Wf', -7, 0, 1, 2, { entries: rowsOf([[1], [2]]) })]) }),
    B('Out', 5, 20, 1, 2, { seat: 'lin', holds: 'whole' }),
    arrow('sq', { id: 'X', as: 'block' }, { side: 's', span: 2, formula: 'x ^ 2 - i' }), arrow('rt', { id: 'X', as: 'block' }, { side: 'n', span: 2, formula: 'tanh(sqrt(x)) > 1/2' }),
    B('Ns', 60, 0, 2, 2, { source: { noise: { seed: 2, dist: 'uniform' } }, holds: 'probability' }), B('Id', 70, 0, 2, 2, { source: 'identity' })]),
  'None: inner data': snap([I('X', 0, 0, 2, 1, [ax(2)], (c, r, k) => c === k ? NONE : c + k), B('W', 2, 0, 1, 2, { entries: rowsOf([[1], [2]]) }),      /* a product repeated at each inner position, a None in each */
    I('A', 10, 0, 2, 1, [ax(2)], (c, r, k) => k === 2 && c === 1 ? NONE : c * k), I('Bn', 10, 1, 2, 1, [ax(2)], (c, r, k) => k === 1 && c === 2 ? NONE : 10)]),
};

/* ---- graphs written by hand: what a backend may be sent that no canvas makes yet ---- */
const ty = (cols, rows, inner = null, colsName = null, rowsName = null) => ({ cols, rows, colsName, rowsName, ...(inner ? { inner } : {}) });
const N = (op, inputs, type, more = {}) => ({ op, inputs, type, ...more });
const V = (type, fill, more = {}) => ({ op: 'variable', inputs: [], type, name: 'v', named: true, defined: 'entries', entries: filled(type.cols, type.rows, type.inner || [], fill), ...more });
const G = (nodes, functions = {}) => ({ version: VERSION, nodes, functions, spaces: {}, blocks: {} });
const QKV = ty(3, 1, [ax(2, 'key'), ax(4, 'embed')]), Wm = k => V(ty(2, 4, null, 'key', 'embed'), (c, r) => k * 100 + c * 10 + r), fn = (body, input = 'param(f:1)') => ({ 'f:1': { input, body } });
const HAND = {
  'by hand: stack, and an entry taken out again': G({ wq: Wm(1), wk: Wm(2), wv: Wm(3), q: N('stack', ['wq', 'wk', 'wv'], QKV, { at: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }] }),
    qkv: { ...V(QKV, () => null), inputs: ['q'], defined: 'standing', name: 'QKV' }, k: N('entry', ['qkv'], ty(2, 4, null, 'key', 'embed'), { at: { col: 1, row: 0 } }), wk2: { ...V(ty(2, 4, null, 'key', 'embed'), () => null), inputs: ['k'], defined: 'entry' },
    x: V(ty(4, 2), (c, r) => (c === r ? 1 : half)), xk: N('matmul', ['x', 'wk2'], ty(2, 2, null, 'key')),
    deep: N('stack', ['q', 'q'], ty(1, 2, [ax(3), ax(1), ax(2, 'key'), ax(4, 'embed')]), { at: [{ col: 0, row: 0 }, { col: 0, row: 1 }] }),      /* parts that hold inner data of their own */
    e1: N('entry', ['deep'], ty(3, 1, [ax(2, 'key'), ax(4, 'embed')]), { at: { col: 0, row: 1 } }),
    a1: V(ty(2, 1, [ax(3)]), (c, r, k) => c * 10 + k), e2: N('entry', ['a1'], ty(3, 1), { at: { col: 1, row: 0 } }) }),      /* one inner axis: a single row */
  'by hand: a transpose with an order': G({ a: V(QKV, (c, r, k1, k2) => c * 100 + k1 * 10 + k2), drawn: N('transpose', ['a'], ty(2, 4, [ax(3), ax(1)], 'key', 'embed'), { order: [2, 3, 0, 1] }),
    back: N('transpose', ['drawn'], QKV, { order: [2, 3, 0, 1] }), swap: N('transpose', ['a'], ty(3, 1, [ax(4, 'embed'), ax(2, 'key')]), { order: [0, 1, 3, 2] }),
    turn: N('transpose', ['a'], ty(4, 3, [ax(2, 'key'), ax(1)], 'embed'), { order: [3, 0, 2, 1] }), plain: N('transpose', ['a'], ty(1, 3, [ax(2, 'key'), ax(4, 'embed')])) }),
  'by hand: a function whose input block holds no inner data, given some': G({ x: V(ty(2, 1, [ax(3)]), (c, r, k) => c * k), w: V(ty(1, 2), (c, r) => (r === 1 ? 1 : half)),
    'param(f:1)': N('param', [], ty(2, 1), { within: ['f:1'] }), body: N('matmul', ['param(f:1)', 'w'], ty(1, 1), { within: ['f:1'] }), y: N('apply', ['x'], ty(1, 1, [ax(3)]), { fn: 'f:1' }),
    x0: V(ty(2, 1), c => c + 5), y0: N('apply', ['x0'], ty(1, 1), { fn: 'f:1' }),      /* and the same function given none */
    wide: V(ty(2, 2, [ax(2)]), (c, r, k) => c + 2 * r + 4 * k), runs: N('mapalong', ['wide'], ty(1, 2, [ax(2)]), { fn: 'f:1', axis: 'rows', start: 1, span: 1, count: 2 }) }, fn('body')),
  'by hand: a function whose input block holds inner data': G({ q: V(QKV, (c, r, k1, k2) => c * 100 + k1 * 10 + k2), 'param(f:1)': N('param', [], QKV, { within: ['f:1'] }),
    body: N('entry', ['param(f:1)'], ty(2, 4, null, 'key', 'embed'), { at: { col: 1, row: 0 }, within: ['f:1'] }), y: N('apply', ['q'], ty(2, 4, null, 'key', 'embed'), { fn: 'f:1' }),
    d: N('measure', ['q'], ty(1, 1), { side: 'd2' }), m: N('map', ['q', 'd'], QKV, { formula: 'x + k1 * k2 + $1' }) }, fn('body')),
};

const files = (dir, at = '') => readdirSync(join(dir, at)).sort().flatMap(n => statSync(join(dir, at, n)).isDirectory() ? files(dir, at + n + '/') : [{ path: at + n, text: readFileSync(join(dir, at, n), 'utf8') }]);
const near = v => v === null || v === undefined ? null : v === 'inf' || v === '-inf' ? v : typeof v === 'boolean' ? +v : typeof v === 'number' ? v
  : typeof v.err === 'string' ? 'err' : v.none === true ? 'none' : typeof v.sym === 'string' ? Number(globalThis.nerdamer(v.sym).evaluate().text('decimals', 30)) : Math.sign(v.n) * Math.pow(Math.abs(v.n) / (v.d || 1), 1 / 2 ** v.k);
function answer(r){
  if (r.error) return { error: r.error.code };
  if (r.deferred) return { deferred: true };
  const matrix = tail => { const rows = []; for (let y = 1; y <= r.type.rows; y++){ const row = []; for (let x = 1; x <= r.type.cols; x++) row.push(near(r.entries[x + ',' + y + tail])); rows.push(row); } return rows; };
  const inner = (r.type.inner || []).map(a => a.length), nest = (tail, at) => at === inner.length ? matrix(tail) : Array.from({ length: inner[at] }, (_, k) => nest(tail + ',' + (k + 1), at + 1));
  return inner.length ? { inner, rows: nest('', 0) } : { rows: matrix('') };
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
  /* (a function run at each inner position of what it is given has no one input to be looked at from: the page asks for none, and neither is asked here) */
  for (const [id, n] of Object.entries(g.nodes)) if (n.op === 'apply' && (g.nodes[n.inputs[0]].type.inner || []).length === (g.nodes[g.functions[n.fn].input].type.inner || []).length){ const f = g.functions[n.fn]; out.push({ node: f.body, binding: { params: { [n.fn]: n.inputs[0] } } }); out.push({ node: f.input, binding: { params: { [n.fn]: n.inputs[0] } } }); }
  return out;
}

export function fixtures(){
  const graphs = [];
  const add = (name, g) => { const bad = validate(g); if (bad.length) throw new Error(name + ' is not well formed: ' + bad[0]);
    graphs.push({ name, graph: g, nodes: Object.fromEntries(Object.keys(g.nodes).map(id => [id, answer(evaluate(g, id))])), bound: bindings(g).map(b => ({ ...b, answer: answer(evaluate(g, b.node, { binding: b.binding })) })) }); };
  for (const name of readdirSync(join(root, 'projects')).sort()) if (statSync(join(root, 'projects', name)).isDirectory()) add('projects/' + name, build(read([...files(join(root, 'projects', name)).filter(f => /\.json$|(^|\/)\.config$|\.csv$/.test(f.path)), ...given(name)])));
  for (const [name, s] of Object.entries(CASES)) add(name, build(s));
  for (const [name, g] of Object.entries(HAND)) add(name, g);
  return { graphs: JSON.parse(JSON.stringify(graphs)), mutations: mutations(graphs.map(x => JSON.parse(JSON.stringify(x.graph)))) };
}

/* ---- graphs changed in one place ---- */
const TYPES = inner => [[], 0, 'x', [2], [{ length: 2 }], [{ length: 0, name: null }], [{ length: 1.5, name: null }], [...inner, ...Array.from({ length: 7 - inner.length }, () => ({ length: 1, name: null }))], inner.map(a => ({ ...a, name: null })), [...inner].reverse(), [...inner, { length: 1, name: null }]];
function mutations(graphs){
  let seed = 20261118; const rnd = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % n; };      /* the same every time */
  const out = [];
  const paths = (v, at = [], all = []) => { if (v && typeof v === 'object') for (const k of Object.keys(v)){ all.push([...at, k]); paths(v[k], [...at, k], all); } return all; };
  const get = (g, path) => path.reduce((v, k) => v[k], g);
  const apply = (g, m) => { const h = JSON.parse(JSON.stringify(g)), last = m.path[m.path.length - 1], host = get(h, m.path.slice(0, -1));
    if (m.drop){ if (Array.isArray(host)) host.splice(+last, 1); else delete host[last]; } else host[last] = m.set; return h; };
  const OTHER = [null, 0, 1, -1, 2, 1.5, '', 'x', true, false, [], {}, 1e9, 'inf', { n: 1, d: 2, k: 0 }, { n: 2, d: 4, k: 0 }, { n: 4, k: 1 }, { err: 'no' }, { none: true }, { none: 1 }, { none: true, sym: 'x' }, { expr: '$1 + 1' }, { expr: 'eval(x)' }, { expr: '((' }, { sym: 'x' }, 'index.x', 'x + i', '$9', '__proto__', 'constructor', 'data/../x.csv', 'data/a.csv'];
  graphs.forEach((g, gi) => { const all = paths(g), ids = Object.keys(g.nodes), tried = new Set();
    const push = m => { const key = JSON.stringify(m); if (tried.has(key)) return; tried.add(key); out.push({ graph: gi, ...m, valid: validate(apply(g, m)).length === 0 }); };
    for (let n = 0; n < Math.min(260, all.length * 2); n++){ const path = all[rnd(all.length)], was = get(g, path), kind = rnd(6);
      if (kind === 0) push({ path, drop: true });
      else if (kind === 1 && typeof was === 'number') push({ path, set: was + [1, -1, .5, 1000][rnd(4)] });
      else if (kind === 2 && typeof was === 'string' && ids.length > 1) push({ path, set: ids[rnd(ids.length)] });
      else if (kind === 3 && typeof was === 'string') push({ path, set: was + ['x', ' ', '(', '+1', '.y'][rnd(5)] });
      else push({ path, set: OTHER[rnd(OTHER.length)] }); }
    /* what a type and an entry's key may be, for the first few nodes that hold inner data: each a change in one place */
    for (const id of ids.filter(id => g.nodes[id].type.inner).slice(0, 4)){ const n = g.nodes[id], at = ['nodes', id, 'type'], inner = n.type.inner;
      for (const set of TYPES(inner)) push({ path: [...at, 'inner'], set });
      push({ path: [...at, 'inner'], drop: true }); push({ path: [...at, 'inner', '0', 'name'], drop: true }); push({ path: [...at, 'inner', '0', 'length'], set: inner[0].length + 1 }); push({ path: [...at, 'inner', '0', 'more'], set: 1 });
      push({ path: [...at, 'axes'], set: 2 }); push({ path: [...at, 'depth'], set: null }); push({ path: [...at, 'inner', '0', 'name'], set: 'named' }); push({ path: [...at, 'inner', '0', 'name'], set: '' });
      if (n.op === 'variable'){ const tail = inner.map(() => ',1').join('');
        for (const key of ['1,1', '1,1' + tail + ',1', '1,1' + tail.slice(2), '1,1' + inner.map(a => ',' + (a.length + 1)).join(''), '1,1' + tail.replace(/1$/, '0'), '1,1' + tail.replace(/1$/, '01'), '1,1' + tail]) push({ path: ['nodes', id, 'entries', key], set: 7 }); } }
    /* what a type's value and a variable's promise may be: each a change in one place */
    const WORDS = ['any?', 'any', 'boolean', 'natural', 'natural?', 'integer?', 'real', 'complex', 'Integer', 'integer ?', '', '?', 7, null, true, ['real']];
    for (const id of [...ids.filter(id => g.nodes[id].type.value !== undefined).slice(0, 3), ...ids.filter(id => g.nodes[id].op !== 'variable' && g.nodes[id].type.value !== undefined).slice(0, 3)]){ const at = ['nodes', id, 'type', 'value'];
      for (const set of WORDS) push({ path: at, set }); push({ path: at, drop: true }); }
    for (const id of ids.filter(id => g.nodes[id].op === 'variable').slice(0, 3)){ for (const set of [...WORDS, ...(g.nodes[id].type.value !== undefined ? [g.nodes[id].type.value] : [])]) push({ path: ['nodes', id, 'holds'], set }); if (g.nodes[id].holds !== undefined) push({ path: ['nodes', id, 'holds'], drop: true }); }
    if (g.version !== undefined) for (const v of [1, 2, 3, 4, 0, '2']) push({ path: ['version'], set: v }); });
  return out;
}

/* ---- the number spaces, as spaces.js has them ---- */
const VALUES = [0, 1, 2, -1, -2, 7, -7, true, false, 'inf', '-inf', half, root2, { n: 3, d: 2, k: 0 }, { n: -1, d: 2, k: 0 }, { n: 1, d: 2, k: 1 }, { n: -2, k: 1 }, { n: 5, d: 4, k: 2 }, { none: true }, { err: 'no' },
  { sym: '1+sqrt(2)' }, { sym: 'e^(-1)' }, { sym: '1208925819614629174706176' }, { sym: '-1208925819614629174706176' }, { sym: '1/1208925819614629174706176' }, { sym: '-1/1208925819614629174706176' }, { sym: '1208925819614629174706177/1208925819614629174706176' }, { sym: '(1208925819614629174706177/1)^(1/2)' }];
const FORMULAS = ['1', '0', '2', '0.5', '1.5', '1.0', '5.', '.25', '123456789012345678901234567890', '0.' + '1'.repeat(38), '1' + '0'.repeat(45), '0.' + '0'.repeat(45) + '1', '9'.repeat(400), '∞', 'inf', '-inf', 'none', '∅', 'true', 'false && $1',
  '$1 + $2', '$1 - $2', '$1 * $2', '$1 / $2', '$1 ^ 2', '$1 ^ $2', '2 ^ $1', '$1 ^ 0', '$1 ^ (1/3)', '-$1', '!$1', 'abs($1)', 'sqrt($1)', '√$1', '∜$1', 'exp($1)', 'ln($1)', 'tanh($1)', 'erf($1)', 'max($1, $2)', 'min($1, 0)',
  'select($1, $2, $3)', 'select($1 > 0, none, $2)', 'select(none, $1, $2)', '$1 == $2', '$1 != none', '$1 < $2', '$1 >= none', '$1 && $2', '$1 || none', 'none + $1', 'none == none', 'index.x + index.y', 'k1 * 2', 'x + i * j', 'x / i', 'X ^ J',
  '$4', '$1 + unknown', '2x', '2(3+1)', '1/0', '(-8)^(1/3)', '($1 + $2) * ($3 - 1) / 2 ^ 2', 'exp(-($1 ^ 2))', 'tanh(abs($1))', '1 - $3', 'abs($1 - $2)', 'max(1, $1)', 'ln($1 + 1)', 'ln(2)', 'sqrt(4)', '-1', '-(1)', '+$1', '2 - 1'];
export function spaceTable(){
  const words = S.SPACES.flatMap(s => [s, s + '?']), pairs = fn => Object.fromEntries(words.flatMap(a => words.map(b => [a + ' ' + b, fn(a, b)])));
  const named = ['natural', 'integer?', 'probability'], lookup = arrow => name => { const m = name.match(/^\$(\d+)$/); if (m) return named[+m[1] - 1]; if (/^index\.[xy]$/i.test(name) || /^k[1-6]$/i.test(name)) return 'natural';
    const k = name.toLowerCase(); return !arrow ? undefined : k === 'x' ? 'rational' : k === 'i' || k === 'j' ? 'natural' : undefined; };
  return { spaces: S.SPACES, inside: Object.fromEntries(S.SPACES.flatMap(a => S.SPACES.map(b => [a + ' ' + b, S.inside(a, b)]))), within: pairs(S.within), both: pairs(S.both), choice: pairs(S.choice),
    binary: Object.fromEntries(['+', '-', '*', '/', '^', '==', '!=', '<', '>', '<=', '>=', '&&', '||', 'max', 'min'].map(op => [op, pairs((a, b) => S.binary(op, a, b))])),
    unary: Object.fromEntries(['neg', '!', 'abs', 'sqrt', 'exp', 'ln', 'tanh', 'erf'].map(fn => [fn, Object.fromEntries(words.map(a => [a, S.unary(fn, a)]))])),
    sum: Object.fromEntries(words.flatMap(a => [1, 2, 3, 5].map(n => [a + ' ' + n, S.sum(a, n)]))), product: Object.fromEntries([1, 2, 4].map(n => [n, pairs((a, b) => S.product(a, b, n))])),
    parse: ['integer', 'integer?', 'any?', 'complex', 'Integer', 'integer ?', '', '?', 'whole?', 'number', 'decimal', 'fraction', 'root', 'irrational'].map(w => [w, S.parse(w) ? [S.parse(w).space, S.parse(w).none] : null]),
    of: VALUES.map(v => [v, S.of(v)]), ofAll: [[], [1, 2], [0, 1], [1, -1], [2, half], [{ none: true }], [{ none: true }, 2, 3], [2, 'inf'], [{ err: 'x' }, -5], [half, root2], [true, { n: 3, d: 2, k: 0 }]].map(vs => [vs, S.ofAll(vs)]),
    formulas: FORMULAS.flatMap(text => [false, true].map(arrow => [text, arrow, S.formula(treeOf(text), lookup(arrow))])) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const made = fixtures(), texts = { 'graphs.json': JSON.stringify(made.graphs) + '\n', 'mutations.json': '[\n' + made.mutations.map(m => JSON.stringify(m)).join(',\n') + '\n]\n', 'spaces.json': JSON.stringify(spaceTable()) + '\n' };
  if (process.argv.includes('--check')){ const stale = Object.keys(texts).filter(f => { try { return readFileSync(join(here, f), 'utf8') !== texts[f]; } catch { return true; } });
    console.log(stale.length ? 'out of date: ' + stale.join(', ') : 'up to date'); process.exit(stale.length ? 1 : 0); }
  for (const [f, t] of Object.entries(texts)) writeFileSync(join(here, f), t);
  console.log(`${made.graphs.length} graphs, ${made.graphs.reduce((n, g) => n + Object.keys(g.nodes).length + g.bound.length, 0)} answers, ${made.mutations.length} changed graphs (${made.mutations.filter(m => m.valid).length} still well formed)`);
}
