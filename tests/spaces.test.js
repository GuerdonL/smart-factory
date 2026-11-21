/* spaces.js: the nine number spaces, the space of both, what each operation gives, and a promise against values.
   The rules are held to the arithmetic itself: for every operation and every pair of spaces, values of those spaces
   are combined by values.js and each result has to lie in the space the rule gave. Then the graph: a type's value
   follows by each operation's rule, both ways of a promise (kept, broken by a value, not provable), and what the
   validator refuses. */
import './solver.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPACES, INSIDE, BINARY, UNARY, parse, promise, inside, within, both, of, ofAll, binary, unary, choice, sum, product, formula, admits, broken, untold as untoldIn, said, NOT_HELD, UNPROVEN } from '../spaces.js';
import { combine, apply, isError, isNone, written } from '../values.js';
import { treeOf, evaluate as evaluateExpr } from '../expression.js';
const evaluateText = text => evaluateExpr(text, () => undefined).value;
import { build, validate, inferred, CODES, VERSION } from '../graph.js';
import { evaluate, promiseOf } from '../evaluate.js';

const q = (n, d = 1, k = 0) => ({ n, ...(d !== 1 ? { d } : {}), k }), NONE = { none: true }, sym = text => ({ sym: text });

test('nine spaces, in one table: what each lies inside', () => {
  assert.deepEqual(SPACES, ['boolean', 'ternary', 'natural', 'whole', 'integer', 'rational', 'probability', 'real', 'any']);
  assert.deepEqual(INSIDE, { boolean: ['whole', 'ternary', 'probability'], ternary: ['integer'], natural: ['whole'], whole: ['integer'], integer: ['rational'], rational: ['real'], probability: ['real'], real: ['any'], any: [] });
  for (const s of SPACES){ assert.ok(inside(s, s)); assert.ok(inside(s, 'any')); }
  for (const [a, b] of [['boolean', 'integer'], ['boolean', 'real'], ['natural', 'rational'], ['ternary', 'real'], ['probability', 'any']]) assert.ok(inside(a, b), a + ' in ' + b);
  /* not one chain: rational and probability overlap, neither inside the other; nor is boolean inside natural, or ternary inside whole */
  for (const [a, b] of [['rational', 'probability'], ['probability', 'rational'], ['boolean', 'natural'], ['natural', 'boolean'], ['ternary', 'whole'], ['whole', 'ternary'], ['natural', 'ternary'], ['integer', 'probability'], ['real', 'rational'], ['any', 'real']]) assert.ok(!inside(a, b), a + ' not in ' + b);
  for (const a of SPACES) for (const b of SPACES) for (const c of SPACES) if (inside(a, b) && inside(b, c)) assert.ok(inside(a, c));
});
test('the space of both is the smallest listed space that holds the two, and there is exactly one for every pair', () => {
  for (const a of SPACES) for (const b of SPACES){ const j = both(a, b), common = SPACES.filter(s => inside(a, s) && inside(b, s));
    assert.ok(common.includes(j)); assert.ok(common.every(s => inside(j, s)), `${a}, ${b}: ${j}`); assert.equal(common.filter(s => common.every(o => inside(s, o))).length, 1); assert.equal(both(b, a), j); }
  const is = (a, b, j) => assert.equal(both(a, b), j, `${a}, ${b}`);
  is('boolean', 'ternary', 'ternary'); is('boolean', 'natural', 'whole'); is('ternary', 'natural', 'integer'); is('ternary', 'whole', 'integer'); is('rational', 'probability', 'real'); is('boolean', 'probability', 'probability');
  is('natural', 'probability', 'real'); is('integer', 'any', 'any'); is('natural', 'natural', 'natural');
  is('natural?', 'whole', 'whole?'); is('natural', 'integer?', 'integer?'); is('real?', 'any?', 'any?');      /* None is admitted where either admits it */
});
test('a space is written as its word, with ? where None is admitted; complex is reserved and refused with its sentence', () => {
  assert.deepEqual(parse('integer'), { space: 'integer', none: false }); assert.deepEqual(parse('integer?'), { space: 'integer', none: true });
  for (const no of ['', '?', 'Integer', 'integer ?', 'integer??', 'complex', 'irrational', 'fraction', 'root', 'number', 'decimal', null, undefined, 7, {}]) assert.equal(parse(no), null, String(no));
  assert.deepEqual(promise(' Natural? '), { holds: 'natural?' }); assert.deepEqual(promise('any'), { holds: 'any' });
  assert.equal(promise('complex').refused, 'complex numbers are not built: a shape holds numbers on the line'); assert.ok(promise('complex?').refused.includes('not built'));
  assert.match(promise('decimal').refused, /decimal is no number space: a shape holds one of boolean, ternary, natural, whole, integer, rational, probability, real, any/);
  assert.equal(said('integer?'), 'integer or None'); assert.equal(said('real'), 'real');
  assert.ok(within('natural', 'integer?')); assert.ok(!within('natural?', 'integer')); assert.ok(within('boolean?', 'probability?')); assert.ok(!within('rational', 'probability'));
});
test('the space a value lies in is the smallest that holds it', () => {
  const is = (v, s) => assert.equal(of(v), s, JSON.stringify(v));
  is(0, 'boolean'); is(1, 'boolean'); is(true, 'boolean'); is(false, 'boolean'); is(2, 'natural'); is(-1, 'ternary'); is(-2, 'integer'); is(q(1, 2), 'probability'); is(q(3, 2), 'rational'); is(q(-1, 2), 'rational'); is(q(2, 1, 1), 'real');
  is(q(1, 2, 1), 'probability');      /* √(1/2) is a real from 0 to 1 */
  is(q(-2, 1, 1), 'real'); is(Infinity, 'any'); is(-Infinity, 'any'); is('inf', 'any'); is('-inf', 'any');      /* an infinity lies only in any */
  is(NONE, 'boolean?');      /* no number, and None */
  is(sym('1+sqrt(2)'), 'real'); is(sym('1208925819614629174706176'), 'natural'); is(sym('-1208925819614629174706176'), 'integer'); is(sym('1/1208925819614629174706176'), 'probability');
  is({ f: 0.5 }, 'probability'); is({ f: 2 }, 'real'); is({ f: Infinity }, 'any');      /* a decimal is not said to be whole or a ratio */
  for (const none of [null, undefined, { err: 'x' }, NaN, 'x', {}]) assert.equal(of(none), null);      /* unknown and an error are no spaces */
  assert.equal(ofAll([1, 2, 3]), 'natural'); assert.equal(ofAll([1, 2, NONE]), 'natural?'); assert.equal(ofAll([0, 5]), 'whole'); assert.equal(ofAll([1, -1, null]), 'ternary'); assert.equal(ofAll([2, q(1, 2)]), 'rational'); assert.equal(ofAll([1]), 'boolean'); assert.equal(ofAll([1, 1, 2]), 'natural'); assert.equal(ofAll([0, q(1, 2)]), 'probability'); assert.equal(ofAll([q(1, 2), q(1, 3)]), 'probability'); assert.equal(ofAll([q(1, 2), q(2, 1, 1)]), 'real'); assert.equal(ofAll([1], ['natural']), 'natural');
  assert.equal(ofAll([null, { err: 'x' }]), 'boolean'); assert.equal(ofAll([]), 'boolean'); assert.equal(ofAll([NONE]), 'boolean?'); assert.equal(ofAll([2], ['integer?']), 'integer?');
});
test('what each operation gives, as the rules are stated', () => {
  const is = (op, a, b, r) => assert.equal(binary(op, a, b), r, `${a} ${op} ${b}`), one = (fn, a, r) => assert.equal(unary(fn, a), r, `${fn} ${a}`);
  is('+', 'natural', 'natural', 'natural'); is('+', 'whole', 'whole', 'whole'); is('+', 'boolean', 'boolean', 'whole'); is('+', 'probability', 'probability', 'real'); is('+', 'natural', 'whole', 'natural'); is('+', 'ternary', 'ternary', 'integer');
  is('-', 'natural', 'natural', 'integer'); is('-', 'whole', 'whole', 'integer'); is('-', 'boolean', 'boolean', 'ternary'); is('-', 'rational', 'integer', 'rational');
  for (const s of SPACES.slice(0, 8)) is('*', s, s, s);      /* a product is closed for every listed space */
  is('*', 'boolean', 'natural', 'whole'); is('*', 'boolean', 'probability', 'probability'); is('*', 'ternary', 'probability', 'real'); is('*', 'any', 'natural', 'any');
  is('/', 'integer', 'integer', 'rational'); is('/', 'natural', 'boolean', 'rational'); is('/', 'rational', 'integer', 'rational'); is('/', 'real', 'integer', 'real'); is('/', 'probability', 'natural', 'real');
  for (const op of ['==', '!=', '<', '>', '<=', '>=', '&&', '||']) is(op, 'real', 'any', 'boolean');
  one('!', 'any', 'boolean'); for (const fn of ['exp', 'tanh', 'erf', 'sqrt']) one(fn, 'real', 'real');
  one('ln', 'natural', 'real'); one('ln', 'whole', 'any'); one('ln', 'real', 'any');      /* ln(0) is -∞, which is no real */
  is('^', 'integer', 'natural', 'integer'); is('^', 'rational', 'natural', 'rational'); is('^', 'natural', 'natural', 'natural'); is('^', 'integer', 'integer', 'real'); is('^', 'rational', 'rational', 'real'); is('^', 'natural', 'boolean', 'real');
  assert.equal(choice('natural', 'ternary'), 'integer'); assert.equal(choice('boolean', 'boolean?'), 'boolean?');
  one('abs', 'ternary', 'boolean'); one('abs', 'integer', 'whole'); one('abs', 'natural', 'natural'); one('abs', 'probability', 'probability'); one('abs', 'rational', 'rational'); one('abs', 'any', 'any');
  one('neg', 'boolean', 'ternary'); one('neg', 'natural', 'integer'); one('neg', 'whole', 'integer'); one('neg', 'probability', 'real'); one('neg', 'rational', 'rational');
  is('max', 'natural', 'whole', 'whole'); is('min', 'boolean', 'ternary', 'ternary'); is('max', 'rational', 'probability', 'real');
  /* a matrix product is a sum of products */
  assert.equal(product('natural', 'natural', 3), 'natural'); assert.equal(product('boolean', 'boolean', 1), 'boolean'); assert.equal(product('boolean', 'boolean', 2), 'whole'); assert.equal(product('ternary', 'ternary', 4), 'integer');
  assert.equal(product('probability', 'probability', 1), 'probability'); assert.equal(product('probability', 'probability', 2), 'real'); assert.equal(sum('boolean', 1), 'boolean'); assert.equal(sum('boolean', 9), 'whole');
});
test('with None admitted on any input the result admits None, but for select, !, &&, ||, == and !=, which follow the None table', () => {
  for (const op of ['+', '-', '*', '/', '^', '<', '>', '<=', '>=', 'max', 'min']){ assert.ok(binary(op, 'integer?', 'integer').endsWith('?'), op); assert.ok(binary(op, 'integer', 'integer?').endsWith('?'), op); assert.ok(!binary(op, 'integer', 'integer').endsWith('?'), op); }
  for (const op of ['==', '!=', '&&', '||']) assert.equal(binary(op, 'integer?', 'real?'), 'boolean', op);
  for (const fn of ['neg', 'abs', 'sqrt', 'exp', 'ln', 'tanh', 'erf']) assert.ok(unary(fn, 'natural?').endsWith('?'), fn);
  assert.equal(unary('!', 'natural?'), 'boolean');
  assert.equal(choice('natural', 'natural'), 'natural'); assert.equal(choice('natural?', 'natural'), 'natural?');      /* select: None where a side that may be chosen admits it, whatever chooses */
  assert.equal(product('natural?', 'natural', 2), 'natural?');
});
/* values of each space, to hold the rules to the arithmetic */
const SAMPLES = { boolean: [0, 1, true, false], ternary: [-1, 0, 1], natural: [1, 2, 5], whole: [0, 1, 3], integer: [-3, -1, 0, 2], rational: [q(1, 2), q(-3, 2), q(2, 3), 4, 0, -2],
  probability: [0, 1, q(1, 2), q(1, 2, 1), q(1, 3)], real: [q(2, 1, 1), q(-2, 1, 1), q(3, 2), 0, -1, 7, q(1, 3, 2)], any: [Infinity, -Infinity, 0, 5, q(-1, 2), 1] };
test('every rule is sound: for every operation and every pair of spaces, what values.js makes of their values lies in the space the rule gives', () => {
  let held = 0;
  /* (a symbolic result that the solver cannot tell from 0 or 1, erf(5) against 1, is no answer either way: it must not be said to lie outside the space) */
  const untold = v => !!v && typeof v === 'object' && typeof v.sym === 'string' && (isError(combine('<=', v, 1)) || isError(combine('>=', v, 0)));
  const lies = (space, v, said) => { if (isError(v)) return; const a = admits(space, v);      /* one the solver cannot compare exactly is not shown to lie in the space, and must not be said to lie outside it */
    if (untold(v)) assert.notEqual(a, false, `${said} is ${written(v)}, which cannot be compared exactly and is said to lie outside ${space}`); else assert.ok(a, `${said} is ${written(v)}, outside ${space}`); held++; };
  for (const a of SPACES) for (const b of SPACES) for (const x of SAMPLES[a]) for (const y of SAMPLES[b]){
    for (const op of ['+', '-', '*', '/', '^', '==', '!=', '<', '>', '<=', '>=', '&&', '||', 'max', 'min']){ if (op === '^' && typeof y === 'object' && typeof x === 'object') continue;      /* (a root of a root is the solver's, and slow) */
      lies(binary(op, a, b), combine(op, x, y), `${written(x)} ${op} ${written(y)} (${a}, ${b})`);
      lies(binary(op, a + '?', b), combine(op, NONE, y), `None ${op} ${written(y)}`); lies(binary(op, a, b + '?'), combine(op, x, NONE), `${written(x)} ${op} None`); }
    lies(choice(a, b), x, 'select'); lies(choice(a, b), y, 'select'); }
  for (const a of SPACES) for (const x of SAMPLES[a]) for (const fn of ['neg', '!', 'abs', 'sqrt', 'exp', 'ln', 'tanh', 'erf']){ if ((fn === 'exp' || fn === 'ln' || fn === 'tanh' || fn === 'erf') && typeof x === 'object') continue;      /* (kept to what is worked out without the solver) */
    lies(unary(fn, a), apply(fn, x), `${fn}(${written(x)}) (${a})`); lies(unary(fn, a + '?'), apply(fn, NONE), `${fn}(None)`); }
  assert.ok(held > 15000, String(held));
  /* and the samples are of their spaces, and of nothing smaller than is said */
  for (const s of SPACES) for (const v of SAMPLES[s]) assert.ok(admits(s, v), `${written(v)} in ${s}`);
});
test('a formula\'s space is read off its tree', () => {
  const names = { $1: 'natural', $2: 'integer?', $3: 'probability', x: 'rational' }, is = (text, s) => assert.equal(formula(treeOf(text), n => names[n]), s, text);
  is('1', 'boolean'); is('2', 'natural'); is('0.5', 'probability'); is('1.5', 'rational'); is('-1', 'ternary'); is('inf', 'any'); is('true', 'boolean'); is('none', 'boolean?');
  is('$1 + $1', 'natural'); is('$1 - $1', 'integer'); is('$1 * $2', 'integer?'); is('$1 / $1', 'rational'); is('$1 ^ 2', 'natural'); is('$1 ^ $2', 'real?'); is('exp($1)', 'real'); is('ln($1)', 'real'); is('ln($3)', 'any');
  is('select($2, $1, $3)', 'real'); is('select($1 > 2, none, $1)', 'natural?'); is('$2 == none', 'boolean'); is('$2 < 1', 'boolean?'); is('!$2', 'boolean'); is('max($1, 0)', 'whole'); is('x * 2', 'rational');
  is('tanh($1)', 'probability'); is('sqrt($3)', 'probability'); is('1 - $3', 'real'); is('unknownName + 1', 'any?'); is('1' + '0'.repeat(45), 'real');
});
test('a promise against values: what lies in a space, and the first entry that does not', () => {
  for (const v of [0, 1, true, false]) assert.ok(admits('boolean', v));
  for (const v of [2, -1, q(1, 2), NONE, Infinity]) assert.ok(!admits('boolean', v));
  assert.ok(admits('natural', 3)); assert.ok(!admits('natural', 0)); assert.ok(!admits('natural', -3)); assert.ok(admits('whole', 0)); assert.ok(!admits('whole', -1)); assert.ok(admits('integer', -5)); assert.ok(!admits('integer', q(1, 2)));
  assert.ok(admits('rational', q(-3, 2))); assert.ok(!admits('rational', q(2, 1, 1))); assert.ok(admits('probability', q(1, 2, 1))); assert.ok(admits('probability', 1)); assert.ok(!admits('probability', q(3, 2))); assert.ok(!admits('probability', -1));
  assert.ok(admits('probability', sym('e^(-1)'))); assert.ok(!admits('probability', sym('1+sqrt(2)')));      /* a symbolic value is told from 0 and 1 as any comparison is */
  assert.ok(admits('real', q(2, 1, 1))); assert.ok(admits('real', sym('1+sqrt(2)'))); assert.ok(!admits('real', Infinity)); assert.ok(!admits('real', '-inf')); assert.ok(admits('any', -Infinity));      /* real admits no infinity */
  assert.ok(!admits('integer', NONE)); assert.ok(admits('integer?', NONE)); assert.ok(admits('integer?', 4)); assert.ok(!admits('any', NONE)); assert.ok(admits('any?', NONE));
  for (const s of SPACES){ assert.ok(admits(s, null)); assert.ok(admits(s, { err: 'divide by zero' })); }      /* unknown and an error are not asked */
  assert.ok(admits('natural', sym('1208925819614629174706176'))); assert.ok(!admits('natural', sym('-1208925819614629174706176'))); assert.ok(admits('integer', sym('-1208925819614629174706176')));
  assert.ok(admits('real', { f: 2.5 })); assert.ok(admits('probability', { f: 0.25 })); assert.ok(!admits('integer', { f: 2 })); assert.ok(!admits('real', { f: Infinity }));
  assert.equal(broken('natural', new Map([['1,1', 1], ['2,1', 5]])), null);
  assert.deepEqual(broken('natural', new Map([['3,2', 0], ['2,1', -3], ['1,2', -4]])), { key: '2,1', value: -3 });      /* by row, then column */
  assert.deepEqual(broken('integer', { '1,1': 2, '2,1': NONE }), { key: '2,1', value: NONE }); assert.equal(broken('integer?', { '1,1': 2, '2,1': NONE }), null);
  assert.equal(NOT_HELD('W', 'natural', '2,1', -3), 'W is not natural: it holds -3 at 2, 1'); assert.equal(NOT_HELD('W', 'integer', '1,3', NONE), 'W is not integer: it holds None at 1, 3');
  assert.equal(NOT_HELD('W', 'real?', '1,1', 'inf'), 'W is not real or None: it holds ∞ at 1, 1'); assert.equal(UNPROVEN('W', 'natural', 'integer'), 'W cannot be shown to be natural: it is worked out as integer');
});

/* ---- the graph ---- */
const B = (id, x, y, cols, rows, more = {}) => ({ id, type: 'tensor', name: id, x, y, cols, rows, colsName: null, rowsName: null, entries: {}, inside: null, variable: null, ...more });
const space = (shapes, groups = [], operations = []) => ({ shapes, groups, operations }), snap = (shapes, groups = []) => ({ top: space(shapes, groups) });
const rowsOf = rows => Object.fromEntries(rows.flatMap((row, r) => row.map((v, c) => [`${c + 1},${r + 1}`, v])).filter(([, v]) => v !== null));
const arrow = (id, input, more = {}, shapeMore = {}) => B(id, 0, 0, 1, 1, { type: 'arrow', name: 'Shape 9', arrow: { input, side: 'e', start: 1, span: 1, gap: 2, gapName: null, output: null, formula: null, ...more }, ...shapeMore });
const made = s => { const g = build(s); assert.deepEqual(validate(g), []); assert.deepEqual(JSON.parse(JSON.stringify(g)), g); return g; };
const valueOf = (g, id) => g.nodes[id].type.value;

test('graph: every node\'s type says its number space, by its operation\'s rule', () => {
  const g = made(snap([B('A', 0, 0, 2, 2, { entries: rowsOf([[1, 2], [3, 4]]) }), B('W', 2, 0, 2, 2, { entries: rowsOf([[0, 1], [1, 0]]) }),      /* a product: natural × boolean, two terms */
    B('C', 10, 0, 2, 1, { entries: rowsOf([[1, -1]]) }), B('D', 10, 1, 2, 1, { entries: rowsOf([[{ n: 1, d: 2, k: 0 }, 0]]) }),                       /* a sum: ternary + probability */
    B('E', 20, 2, 2, 1, { entries: rowsOf([[2, 4]]) }), B('F', 22, 3, 2, 1, { entries: rowsOf([[4, 8]]) }),                                           /* over: natural / natural */
    B('s', 30, 0, 1, 1, { entries: { '1,1': { none: true } } }), B('M', 31, 0, 2, 1, { entries: rowsOf([[5, 6]]) }),                                    /* a scale by None */
    B('U', 40, 0, 2, 1, { entries: rowsOf([[1, null]]) }), B('Fm', 50, 0, 3, 1, { entries: rowsOf([[{ expr: '@[A:x] / 2' }, { expr: 'exp(1)' }, 7]]) }),
    B('Zs', 60, 0, 2, 2, { source: 'zeros' }), B('Nu', 70, 0, 2, 2, { source: { noise: { seed: 1, dist: 'uniform' } } }), B('Nn', 80, 0, 2, 2, { source: { noise: { seed: 1, dist: 'normal' } } }), B('Fl', 90, 0, 2, 2, { source: { file: 'data/t.csv' } }),
    B('wide', 100, 0, 1, 1, { name: 'Shape 6', from: { id: 'A', side: 'x' } }), B('T', 110, 0, 2, 2, { name: 'A', variable: 1, reference: true, transposed: true }),
    arrow('sq', { id: 'A', as: 'block' }, { side: 's', span: 2, formula: 'x ^ 2 - i' }), arrow('cmp', { id: 'A', as: 'block' }, { side: 'n', span: 2, formula: 'x > 2' })].map((d, i) => i === 0 ? { ...d, variable: 1 } : d)));
  const is = (id, s) => assert.equal(valueOf(g, id), s, id);
  is('v:A', 'natural'); is('v:W', 'boolean'); is('matmul(v:A,v:W)', 'whole'); is('v:C', 'ternary'); is('v:D', 'probability'); is('add(v:C,v:D)', 'real'); is('ewise(v:E,v:F;div;none)', 'rational');
  is('v:s', 'boolean?'); is('scale(v:s,v:M)', 'whole?');      /* None alone is written boolean?, the smallest word there is: what is made of it is wider than it need be, never narrower */
   is('v:U', 'boolean');      /* an entry not given says nothing */
  is('v:Fm', 'real'); is('measure(v:A;x)', 'natural'); is('v:Zs', 'boolean'); is('v:Nu', 'probability'); is('v:Nn', 'real'); is('v:Fl', 'real'); is('transpose(v:A)', 'natural');
  is(g.spaces.top.arrows.find(a => a.arrow === 'sq').node, 'integer'); is(g.spaces.top.arrows.find(a => a.arrow === 'cmp').node, 'boolean');
  assert.equal(g.version, 3); assert.equal(VERSION, 3); assert.ok(CODES.includes('type'));
  for (const n of Object.values(g.nodes)) assert.deepEqual(Object.keys(n.type).filter(k => k !== 'inner'), ['cols', 'rows', 'colsName', 'rowsName', 'value']);
});
test('graph: a promise is the variable\'s value, whatever defines it; a function\'s input takes what its in block promises, and a function applied gives its body\'s', () => {
  const g = made(snap([B('W', 0, 0, 2, 1, { entries: rowsOf([[1, 2]]), holds: 'integer?' }), B('V', 0, 1, 2, 1, { entries: rowsOf([[1, 1]]) }),
    B('X', 0, 20, 2, 2, { entries: rowsOf([[1, 2], [3, 4]]) }),
    arrow('lin', { id: 'X', as: 'block' }, { span: 2 }, { x: 50, y: 20, name: 'linear', inside: space([B('inn', -9, 0, 2, 2, { in: true, holds: 'natural' }), B('Wf', -7, 0, 1, 2, { entries: rowsOf([[1], [2]]) })]) }),
    B('Out', 5, 20, 1, 2, { seat: 'lin', holds: 'whole' }),
    arrow('free', { id: 'X', as: 'block' }, { side: 'w', span: 2 }, { x: 60, y: 20, name: 'other', inside: space([B('in2', -9, 0, 2, 2, { in: true }), B('Wg', -7, 0, 1, 2, { entries: rowsOf([[1], [2]]) })]) }),
    B('Cx', 40, 0, 1, 1, { entries: { '1,1': 2 }, holds: 'complex' }), B('Odd', 44, 0, 1, 1, { entries: { '1,1': 2 }, holds: 'decimal' })]));
  assert.equal(g.nodes['v:W'].holds, 'integer?'); assert.equal(valueOf(g, 'v:W'), 'integer?'); assert.equal(inferred(g, 'v:W'), 'natural'); assert.equal(valueOf(g, 'add(v:W,v:V)'), 'integer?');
  assert.equal(valueOf(g, 'param(f:lin)'), 'natural'); assert.equal(valueOf(g, g.functions['f:lin'].body), 'natural'); assert.equal(valueOf(g, g.spaces.top.arrows.find(a => a.arrow === 'lin').node), 'natural');
  assert.equal(valueOf(g, 'v:Out'), 'whole'); assert.equal(inferred(g, 'v:Out'), 'natural');      /* the seat: Gives is the seated block's promise */
  assert.equal(valueOf(g, 'param(f:free)'), 'any?'); assert.equal(valueOf(g, g.spaces.top.arrows.find(a => a.arrow === 'free').node), 'any?');      /* an input block that promises nothing takes anything */
  assert.equal(g.nodes['v:Cx'].holds, undefined); assert.equal(valueOf(g, 'v:Cx'), 'natural'); assert.equal(g.nodes['v:Odd'].holds, undefined);      /* what is no space is no promise */
  assert.equal(inferred(g, 'matmul(v:X,v:Wf)'), undefined); assert.equal(inferred(g, 'nothing'), undefined);
});
test('validate: a value is one of the nine words, follows from the inputs, and a type has no other new key; a type that says none is not checked', () => {
  const good = () => made(snap([B('A', 0, 0, 2, 1, { entries: rowsOf([[1, 2]]), holds: 'whole' }), B('C', 0, 1, 2, 1, { entries: rowsOf([[1, -1]]) })]));
  const refused = (change, what) => { const g = good(); change(g); assert.ok(validate(g).length > 0, what); };
  for (const v of ['complex', 'number', 'decimal', 'fraction', 'Integer', 'integer ?', '', '?', 7, null, true, ['real'], {}]) refused(g => { g.nodes['v:C'].type.value = v; }, 'value ' + JSON.stringify(v));
  refused(g => { g.nodes['v:C'].type.value = 'integer'; }, 'a value its entries do not give'); refused(g => { g.nodes['add(v:A,v:C)'].type.value = 'real'; }, 'a value its inputs do not give');
  refused(g => { g.nodes['v:C'].type.holds = 'integer'; }, 'another new key'); refused(g => { g.nodes['v:C'].type.space = 'ternary'; }, 'another new key'); refused(g => { g.nodes['v:C'].type.none = true; }, 'another new key');
  refused(g => { g.nodes['v:A'].holds = 'complex'; }, 'a promise that is no space'); refused(g => { g.nodes['v:A'].holds = 'natural'; }, 'a promise that is not its value'); refused(g => { delete g.nodes['v:A'].holds; }, 'a value that was its promise');
  refused(g => { g.nodes['v:C'].holds = 'integer'; }, 'a promise its value does not say');
  let g = good(); g.nodes['v:C'].holds = 'ternary'; assert.deepEqual(validate(g), []);      /* a promise that is its value */
  g = good(); for (const n of Object.values(g.nodes)) delete n.type.value; assert.deepEqual(validate(g), []);      /* no values at all: an older graph */
  g = good(); delete g.nodes['v:C'].type.value; assert.ok(validate(g).length > 0);      /* an input that says none is any?: the sum's value no longer follows */
  g = good(); delete g.nodes['add(v:A,v:C)'].type.value; assert.deepEqual(validate(g), []);
  for (const version of [1, 2, 3]) assert.deepEqual(validate({ ...good(), version }), []);
});
test('evaluate: a promise that is kept; one broken by a value is the error type, naming the entry, for the variable and what is made of it', () => {
  const g = made(snap([B('W', 0, 0, 2, 2, { entries: rowsOf([[1, 2], [-3, 4]]), holds: 'natural' }), B('V', 2, 0, 1, 2, { entries: rowsOf([[1], [1]]) }),
    B('K', 10, 0, 2, 1, { entries: rowsOf([[1, null]]), holds: 'natural' }), B('Z', 20, 0, 2, 1, { entries: rowsOf([[{ expr: '1/0' }, 5]]), holds: 'natural' }),
    B('O', 30, 0, 2, 1, { entries: rowsOf([[{ none: true }, 5]]), holds: 'natural' }), B('P', 40, 0, 2, 1, { entries: rowsOf([[{ none: true }, 5]]), holds: 'natural?' }),
    B('Q', 50, 0, 2, 1, { entries: rowsOf([[{ expr: '3 - 5' }, 5]]), holds: 'whole' }), B('I', 60, 0, 1, 1, { entries: { '1,1': 'inf' }, holds: 'real' })]));
  const err = { code: 'type', note: 'W is not natural: it holds -3 at 1, 2', node: 'v:W' };
  assert.deepEqual(evaluate(g, 'v:W'), { error: err }); assert.deepEqual(evaluate(g, 'matmul(v:W,v:V)'), { error: err }); assert.deepEqual(evaluate(g, 'v:W'), { error: err });
  assert.deepEqual(promiseOf(g, 'v:W'), { holds: 'natural', inferred: 'integer', state: 'broken', note: err.note });
  assert.deepEqual(evaluate(g, 'v:K').entries, { '1,1': 1 }); assert.equal(promiseOf(g, 'v:K').state, 'kept');      /* an entry not given breaks nothing */
  assert.ok(evaluate(g, 'v:Z').entries); assert.equal(promiseOf(g, 'v:Z').state, 'kept');      /* nor does an entry that is an error: it is marked as one already */
  assert.equal(evaluate(g, 'v:O').error.note, 'O is not natural: it holds None at 1, 1'); assert.equal(promiseOf(g, 'v:P').state, 'kept');
  assert.equal(evaluate(g, 'v:Q').error.note, 'Q is not whole: it holds -2 at 1, 1'); assert.equal(evaluate(g, 'v:I').error.note, 'I is not real: it holds ∞ at 1, 1');
  assert.deepEqual(promiseOf(g, 'v:V'), { holds: null, inferred: 'boolean', state: 'inferred', note: '' }); assert.equal(promiseOf(g, 'matmul(v:W,v:V)'), null);
});
test('evaluate: a promise that cannot be checked against values (too large, noise, a data file) is kept where the inferred space is inside it, and a warning where it is not', () => {
  const g = made(snap([B('Nu', 0, 0, 2, 2, { source: { noise: { seed: 1, dist: 'uniform' } }, holds: 'probability' }), B('Nn', 10, 0, 2, 2, { source: { noise: { seed: 1, dist: 'normal' } }, holds: 'probability' }),
    B('Fl', 20, 0, 2, 2, { source: { file: 'data/t.csv' }, holds: 'natural' }), B('Big', 30, 0, 80, 80, { source: 'ones', holds: 'natural' }), B('Fine', 30, 100, 80, 80, { source: 'ones', holds: 'whole' })]));
  assert.equal(promiseOf(g, 'v:Nu').state, 'kept');
  assert.deepEqual(promiseOf(g, 'v:Nn'), { holds: 'probability', inferred: 'real', state: 'unproven', note: 'Nn cannot be shown to be probability: it is worked out as real' });
  assert.equal(promiseOf(g, 'v:Fl').note, 'Fl cannot be shown to be natural: it is worked out as real');
  assert.equal(promiseOf(g, 'v:Big').note, 'Big cannot be shown to be natural: it is worked out as boolean'); assert.equal(promiseOf(g, 'v:Fine').state, 'kept');
  for (const id of ['v:Nn', 'v:Fl', 'v:Big']) assert.equal(evaluate(g, id).deferred, true);      /* a warning: the shape keeps its value, which is the backend's */
  assert.equal(promiseOf(g, 'v:Big', { maxEntries: 10000 }).state, 'kept');      /* and where the values are here, they are asked: ones are natural */
});
test('a value the solver cannot compare exactly breaks no promise: it is not shown to lie in the space, and the warning is for a promise the inferred space is not inside', () => {
  for (const text of ['tanh(20)', 'tanh(64)', 'erf(5)', 'exp(-50)']){ const v = evaluateText(text);
    assert.ok(isError(combine('<=', v, 1)) || isError(combine('>=', v, 0)), text + ' is one the solver cannot compare');
    assert.equal(admits('probability', v), null, text); assert.equal(broken('probability', { '1,1': v }), null); assert.deepEqual(untoldIn('probability', { '2,1': 1, '1,1': v }), { key: '1,1', value: v }); }
  assert.equal(admits('probability', 2), false); assert.equal(admits('probability', q(1, 2)), true); assert.equal(untoldIn('probability', { '1,1': q(1, 2) }), null);
  const g = made(snap([B('E3', 0, 0, 1, 1, { entries: { '1,1': { expr: 'tanh(20)' } }, holds: 'probability' }), B('E4', 5, 0, 1, 1, { entries: { '1,1': { expr: 'exp(-50)' } }, holds: 'probability' }),
    B('E5', 10, 0, 2, 1, { entries: { '1,1': { expr: 'exp(-50)' }, '2,1': 3 }, holds: 'probability' })]));
  assert.ok(evaluate(g, 'v:E3').entries); assert.deepEqual(promiseOf(g, 'v:E3'), { holds: 'probability', inferred: 'probability', state: 'kept', note: '' });      /* tanh of a whole number is worked out as a probability: kept */
  assert.ok(evaluate(g, 'v:E4').entries); assert.deepEqual(promiseOf(g, 'v:E4'), { holds: 'probability', inferred: 'real', state: 'unproven', note: 'E4 cannot be shown to be probability: it is worked out as real' });
  assert.equal(evaluate(g, 'v:E5').error.note, 'E5 is not probability: it holds 3 at 2, 1');      /* and a value that is told to lie outside still breaks it */
});
test('evaluate: a promise on the block seated on an arrow is held against the arrow\'s output, and one inside a function against each thing it is given', () => {
  const g = made(snap([B('X', 0, 20, 2, 2, { entries: rowsOf([[1, 2], [3, -4]]) }),
    arrow('lin', { id: 'X', as: 'block' }, { span: 2 }, { x: 50, y: 20, name: 'linear', inside: space([B('inn', -9, 0, 2, 2, { in: true }), B('Wf', -7, 0, 1, 2, { entries: rowsOf([[1], [2]]) })]) }),
    B('Out', 5, 20, 1, 2, { seat: 'lin', holds: 'whole' })]));
  assert.deepEqual(evaluate(g, 'v:Out'), { error: { code: 'type', note: 'Out is not whole: it holds -5 at 1, 2', node: 'v:Out' } });
  assert.equal(promiseOf(g, 'v:Out').state, 'broken'); assert.deepEqual(evaluate(g, g.spaces.top.arrows[0].node).entries, { '1,1': 5, '1,2': -5 });      /* the arrow's own output is as it was */
});
