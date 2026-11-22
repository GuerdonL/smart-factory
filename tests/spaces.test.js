/* spaces.js: the ten number spaces, the space of both, what each operation gives, and a promise against values.
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
import { evaluate, promiseOf, judged, seenFrom } from '../evaluate.js';

const q = (n, d = 1, k = 0) => ({ n, ...(d !== 1 ? { d } : {}), k }), NONE = { none: true }, sym = text => ({ sym: text });

test('ten spaces, in one table: what each lies inside', () => {
  assert.deepEqual(SPACES, ['boolean', 'ternary', 'natural', 'whole', 'integer', 'rational', 'probability', 'real', 'extended', 'any']);
  assert.deepEqual(INSIDE, { boolean: ['whole', 'ternary', 'probability'], ternary: ['integer'], natural: ['whole'], whole: ['integer'], integer: ['rational'], rational: ['real'], probability: ['real'], real: ['extended'], extended: ['any'], any: [] });
  for (const s of SPACES){ assert.ok(inside(s, s)); assert.ok(inside(s, 'any')); }
  for (const [a, b] of [['boolean', 'integer'], ['boolean', 'real'], ['natural', 'rational'], ['ternary', 'real'], ['probability', 'any'], ['real', 'extended'], ['boolean', 'extended'], ['extended', 'any']]) assert.ok(inside(a, b), a + ' in ' + b);
  /* not one chain: rational and probability overlap, neither inside the other; nor is boolean inside natural, or ternary inside whole */
  for (const [a, b] of [['rational', 'probability'], ['probability', 'rational'], ['boolean', 'natural'], ['natural', 'boolean'], ['ternary', 'whole'], ['whole', 'ternary'], ['natural', 'ternary'], ['integer', 'probability'], ['real', 'rational'], ['any', 'real'], ['extended', 'real'], ['any', 'extended']]) assert.ok(!inside(a, b), a + ' not in ' + b);
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
  assert.match(promise('decimal').refused, /decimal is no number space: a shape holds one of boolean, ternary, natural, whole, integer, rational, probability, real, extended, any/);
  assert.equal(said('integer?'), 'integer or None'); assert.equal(said('real'), 'real');
  assert.ok(within('natural', 'integer?')); assert.ok(!within('natural?', 'integer')); assert.ok(within('boolean?', 'probability?')); assert.ok(!within('rational', 'probability'));
});
test('the space a value lies in is the smallest that holds it', () => {
  const is = (v, s) => assert.equal(of(v), s, JSON.stringify(v));
  is(0, 'boolean'); is(1, 'boolean'); is(true, 'boolean'); is(false, 'boolean'); is(2, 'natural'); is(-1, 'ternary'); is(-2, 'integer'); is(q(1, 2), 'probability'); is(q(3, 2), 'rational'); is(q(-1, 2), 'rational'); is(q(2, 1, 1), 'real');
  is(q(1, 2, 1), 'probability');      /* √(1/2) is a real from 0 to 1 */
  is(q(-2, 1, 1), 'real'); is(Infinity, 'extended'); is(-Infinity, 'extended'); is('inf', 'extended'); is('-inf', 'extended');      /* an infinity is no real: the smallest space that holds it is extended */
  is(NONE, 'none');      /* no number, and None: the space of its own */
  is(sym('1+sqrt(2)'), 'real'); is(sym('1208925819614629174706176'), 'natural'); is(sym('-1208925819614629174706176'), 'integer'); is(sym('1/1208925819614629174706176'), 'probability');
  is({ f: 0.5 }, 'probability'); is({ f: 2 }, 'real'); is({ f: Infinity }, 'extended');      /* a decimal is not said to be whole or a ratio */
  for (const none of [null, undefined, { err: 'x' }, NaN, 'x', {}]) assert.equal(of(none), null);      /* unknown and an error are no spaces */
  assert.equal(ofAll([1, 2, 3]), 'natural'); assert.equal(ofAll([1, 2, NONE]), 'natural?'); assert.equal(ofAll([0, 5]), 'whole'); assert.equal(ofAll([1, -1, null]), 'ternary'); assert.equal(ofAll([2, q(1, 2)]), 'rational'); assert.equal(ofAll([1]), 'boolean'); assert.equal(ofAll([1, 1, 2]), 'natural'); assert.equal(ofAll([0, q(1, 2)]), 'probability'); assert.equal(ofAll([q(1, 2), q(1, 3)]), 'probability'); assert.equal(ofAll([q(1, 2), q(2, 1, 1)]), 'real'); assert.equal(ofAll([1], ['natural']), 'natural');
  assert.equal(ofAll([null, { err: 'x' }]), 'boolean'); assert.equal(ofAll([]), 'boolean'); assert.equal(ofAll([NONE]), 'none'); assert.equal(ofAll([NONE, null]), 'none'); assert.equal(ofAll([], ['none']), 'none'); assert.equal(ofAll([NONE], ['natural']), 'natural?'); assert.equal(ofAll([2], ['integer?']), 'integer?');
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
  one('ln', 'natural', 'real'); one('ln', 'whole', 'extended'); one('ln', 'real', 'extended'); one('ln', 'extended', 'extended'); one('ln', 'any', 'any');      /* ln(0) is -∞, which is no real: it is extended */
  /* extended, the reals with ∞ and -∞, is closed under + − and × (∞ − ∞ and 0 × ∞ are errors, no values); a number over an infinity is real */
  for (const op of ['+', '-', '*', '^']){ is(op, 'extended', 'extended', 'extended'); is(op, 'natural', 'extended', 'extended'); is(op, 'extended', 'any', 'any'); }
  is('/', 'real', 'extended', 'real'); is('/', 'natural', 'extended', 'real'); is('/', 'extended', 'real', 'extended'); is('/', 'extended', 'extended', 'extended');
  one('exp', 'extended', 'extended'); one('sqrt', 'extended', 'extended'); one('neg', 'extended', 'extended'); one('abs', 'extended', 'extended'); one('tanh', 'extended', 'real'); one('erf', 'extended', 'real'); one('tanh', 'any', 'any');
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
  probability: [0, 1, q(1, 2), q(1, 2, 1), q(1, 3)], real: [q(2, 1, 1), q(-2, 1, 1), q(3, 2), 0, -1, 7, q(1, 3, 2)], extended: [Infinity, -Infinity, 0, 5, -3, q(-1, 2), q(2, 1, 1), 1], any: [Infinity, -Infinity, 0, 5, q(-1, 2), 1] };
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
  is('1', 'boolean'); is('2', 'natural'); is('0.5', 'probability'); is('1.5', 'rational'); is('-1', 'ternary'); is('inf', 'extended'); is('ln($2)', 'extended?'); is('1 / inf', 'real'); is('true', 'boolean'); is('none', 'none'); is('none + $1', 'none'); is('select($1 > 2, none, none)', 'none');
  is('$1 + $1', 'natural'); is('$1 - $1', 'integer'); is('$1 * $2', 'integer?'); is('$1 / $1', 'rational'); is('$1 ^ 2', 'natural'); is('$1 ^ $2', 'real?'); is('exp($1)', 'real'); is('ln($1)', 'real'); is('ln($3)', 'extended');
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
  assert.ok(admits('extended', Infinity)); assert.ok(admits('extended', '-inf')); assert.ok(admits('extended', q(2, 1, 1))); assert.ok(admits('extended', { f: -Infinity })); assert.ok(!admits('extended', NONE)); assert.ok(admits('extended?', NONE));      /* the reals and the two infinities */
  assert.deepEqual(promise('extended?'), { holds: 'extended?' });
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
const numbersOf = (g, id) => g.nodes[id].type.cols * g.nodes[id].type.rows;

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
  is('v:s', 'none'); is('scale(v:s,v:M)', 'none');      /* None alone has its own space, and None with anything is None */
   is('v:U', 'boolean');      /* an entry not given says nothing */
  is('v:Fm', 'real'); is('measure(v:A;x)', 'natural'); is('v:Zs', 'boolean'); is('v:Nu', 'probability'); is('v:Nn', 'real'); is('v:Fl', 'real'); is('transpose(v:A)', 'natural');
  is(g.spaces.top.arrows.find(a => a.arrow === 'sq').node, 'integer'); is(g.spaces.top.arrows.find(a => a.arrow === 'cmp').node, 'boolean');
  assert.equal(g.version, 6); assert.equal(VERSION, 6); assert.ok(CODES.includes('type'));
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
test('validate: a value is one of the ten words, follows from the inputs, and a type has no other new key; a type that says none is not checked', () => {
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
  /* a value and a promise need version 3 (ruled 21 November 2026): a graph that says less and holds either is refused, and one that holds neither is read */
  for (const version of [1, 2]){ assert.ok(validate({ ...good(), version }).some(w => w.includes('it holds a number space, which needs version 3, and the graph says version ' + version)));
    g = good(); g.version = version; for (const n of Object.values(g.nodes)) delete n.type.value; assert.equal(validate(g)[0], 'v:A: it holds a promise, which needs version 3, and the graph says version ' + version);
    delete g.nodes['v:A'].holds; assert.deepEqual(validate(g), []); }
});
test('validate: a symbolic value never spells None or an infinity, and a whole number or a fraction of any length is told from its digits', () => {
  const g = (sym, value) => ({ version: VERSION, nodes: { v: { op: 'variable', inputs: [], type: { cols: 1, rows: 1, colsName: null, rowsName: null, value }, name: 'V', named: true, defined: 'entries', entries: { '1,1': { sym } } } }, functions: {}, spaces: {}, blocks: {} });
  for (const sym of ['none', 'None', '∅', 'none + 1', 'inf', '2 * inf', 'Infinity', '∞', '1/∞']) assert.deepEqual(validate(g(sym, 'real')), ['v: entry 1,1 holds no value in its stated form'], sym);      /* each has its one form of its own */
  for (const sym of ['1+sqrt(2)', 'e^(-1)', 'information', 'nonexistent']) assert.ok(!validate(g(sym, 'real')).some(w => /stated form/.test(w)), sym);      /* (a longer name that only begins so is a name like any other) */
  const nines = '9'.repeat(4301);      /* past what Python will read as a number: the backend says the same (test_spaces.py) */
  for (const [sym, value] of [[nines, 'natural'], ['-' + nines, 'integer'], ['1/' + nines, 'probability'], [nines + '/7', 'rational'], [nines + '/' + nines, 'probability'], ['0'.repeat(4400), 'boolean'], ['0'.repeat(4400) + '1', 'boolean']]){
    assert.equal(of({ sym }), value, sym.slice(0, 12)); assert.deepEqual(validate(g(sym, value)), [], sym.slice(0, 12)); }
  assert.match(validate({ ...g('1+sqrt(2)', 'complex') })[0], /^v: its type is not .*and value, one of the ten number spaces/);      /* and a value that is no space is refused with a reason that names value */
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
  assert.equal(promiseOf(g, 'v:Big').state, 'kept'); assert.equal(promiseOf(g, 'v:Fine').state, 'kept');      /* (ones, at any size: see the test of a source filled with one known value) */
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
test('a whole or rational value the solver leaves symbolic breaks no promise: it is asked whether it is the whole number it is nearest, and is neither in nor out where that cannot be told', () => {
  const three = evaluateText('ln(8)/ln(2)'), one = evaluateText('ln(2)+ln(3)-ln(6)+1');
  assert.equal(typeof three.sym, 'string'); assert.equal(typeof one.sym, 'string');      /* the solver leaves them as they are written, and cannot reduce their difference from 3 and from 1 to 0 */
  for (const s of ['boolean', 'ternary', 'natural', 'whole', 'integer', 'rational']){ assert.notEqual(admits(s, three), false, s); assert.notEqual(admits(s, one), false, s); assert.equal(broken(s, { '1,1': three, '2,1': 1 }), null, s); }
  assert.equal(admits('probability', three), false); assert.equal(admits('real', three), true);      /* and what can be told is: 3 is above 1 */
  /* one that is shown to be no whole number is outside every space of whole numbers, and is not said to be no ratio */
  for (const text of ['1+sqrt(2)', 'exp(-1)', 'exp(1)/3', '2^(1/3)']){ const v = evaluateText(text);
    for (const s of ['boolean', 'ternary', 'natural', 'whole', 'integer']) assert.equal(admits(s, v), false, text + ' ' + s);
    assert.equal(admits('rational', v), null, text); assert.equal(broken('rational', { '1,1': v }), null); assert.deepEqual(untoldIn('rational', { '1,1': v }), { key: '1,1', value: v }); }
  /* a value written in digits is told as before, whatever its length */
  assert.equal(admits('rational', evaluateText('(2^80+1)/3')), true); assert.equal(admits('integer', evaluateText('(2^80+1)/3')), false); assert.equal(admits('natural', evaluateText('2^80+1')), true);
  const g = made(snap([B('S', 0, 0, 2, 1, { entries: { '1,1': { expr: 'ln(8)/ln(2)' }, '2,1': 3 }, holds: 'integer' }), B('Nt', 5, 0, 1, 1, { entries: { '1,1': { expr: 'ln(2)+ln(3)-ln(6)+1' } }, holds: 'natural' }),
    B('Q', 10, 0, 1, 1, { entries: { '1,1': { expr: 'ln(8)/ln(2)' } }, holds: 'rational' }), B('I', 15, 0, 2, 1, { entries: { '1,1': { expr: 'ln(8)/ln(2)' }, '2,1': { expr: '1+sqrt(2)' } }, holds: 'integer' })]));
  for (const id of ['v:S', 'v:Nt', 'v:Q']){ const a = evaluate(g, id), p = promiseOf(g, id); assert.ok(a.entries, id); assert.notEqual(p.state, 'broken', id);      /* the shape keeps its value, and the row warns at most */
    if (p.state === 'unproven') assert.match(p.note, /cannot be shown to be/); }
  assert.equal(evaluate(g, 'v:I').error.note, 'I is not integer: it holds 1+√2 at 2, 1');
});
test('the first entry outside a space is the first by number: row, then column, then each inner position, also past position 9', () => {
  assert.deepEqual(broken('natural', { '1,1,10': -5, '1,1,2': -5 }), { key: '1,1,2', value: -5 });      /* not by the key as text, where "1,1,10" comes before "1,1,2" */
  assert.deepEqual(broken('natural', { '1,1,10,1': -5, '1,1,9,12': -4, '1,1,9,3': -3 }), { key: '1,1,9,3', value: -3 });
  assert.deepEqual(broken('natural', { '10,1,1': -1, '2,1,12': -2, '1,2,1': -3 }), { key: '2,1,12', value: -2 });      /* row, then column, before any inner position */
  assert.deepEqual(broken('natural', { '12,10': -1, '3,10': -2, '1,11': -3 }), { key: '3,10', value: -2 });
  assert.deepEqual(untoldIn('probability', { '1,1,10': evaluateText('tanh(20)'), '1,1,2': evaluateText('tanh(20)') }).key, '1,1,2');
  const entries = {}; for (let k = 1; k <= 12; k++) entries['1,1,' + k] = k === 2 || k === 10 ? -5 : 1;
  const g = made(snap([B('D', 0, 0, 1, 1, { inner: [{ length: 12, name: null }], entries, holds: 'natural' })]));
  assert.equal(evaluate(g, 'v:D').error.note, 'D is not natural: it holds -5 at 1, 1, 2');      /* as the backend says it: backend/tests/test_none.py */
});
test('evaluate: what is worked out from a shape whose promise a value breaks has no value, also where it would be the backend\'s to give', () => {
  const g = made(snap([B('W', 0, 0, 2, 2, { entries: rowsOf([[1, 2], [-3, 4]]), holds: 'natural' }), B('Nz', 2, 0, 2, 2, { source: { noise: { seed: 1, dist: 'uniform' } } }),
    B('K', 0, 10, 2, 2, { entries: rowsOf([[1, 2], [3, 4]]), holds: 'natural' }), B('Nk', 2, 10, 2, 2, { source: { noise: { seed: 2, dist: 'uniform' } } }),
    B('Col', 0, 20, 1, 80, { source: 'ones' }), B('Wide', 1, 20, 80, 1, { entries: { '3,1': -3 }, holds: 'natural' })]));
  const err = { code: 'type', note: 'W is not natural: it holds -3 at 1, 2', node: 'v:W' };
  assert.deepEqual(evaluate(g, 'matmul(v:W,v:Nz)'), { error: err });      /* made of noise: not deferred to the backend, since W has no value */
  assert.equal(evaluate(g, 'matmul(v:K,v:Nk)').deferred, true); assert.equal(evaluate(g, 'matmul(v:K,v:Nk)').backend, true);      /* a promise that is kept changes nothing */
  assert.equal(numbersOf(g, 'matmul(v:Col,v:Wide)'), 6400);
  assert.deepEqual(evaluate(g, 'matmul(v:Col,v:Wide)'), { error: { code: 'type', note: 'Wide is not natural: it holds -3 at 3, 1', node: 'v:Wide' } });      /* too large to work out here, and nothing all the same */
  assert.equal(evaluate(g, 'v:Nz').deferred, true);
});
test('evaluate: what an arrow repeated in a tile takes is held to its promise run by run, and what no run covers is not asked', () => {
  const g = made(snap([B('M', 0, 0, 3, 2, { entries: rowsOf([[-4, 2, 3], [1, 5, -6]]) })]));
  const runs = (start, span, count, axis = 'cols') => ({ runs: { axis, start, span, count } });
  assert.equal(judged(g, 'v:M', 'natural', 'in').note, 'in is not natural: it holds -4 at 1, 1');      /* the whole of it */
  assert.equal(judged(g, 'v:M', 'natural', 'in', runs(2, 1, 1)).state, 'kept');      /* column 2 alone: -4 and -6 are none of what it takes */
  assert.equal(judged(g, 'v:M', 'natural', 'in', runs(2, 1, 2)).note, 'in is not natural: it holds -6 at 1, 2 in run 2');      /* columns 2 and 3, one at a time: the place is the input block's own */
  assert.equal(judged(g, 'v:M', 'natural', 'in', runs(1, 1, 3)).note, 'in is not natural: it holds -4 at 1, 1 in run 1');
  assert.equal(judged(g, 'v:M', 'natural', 'in', runs(2, 1, 1, 'rows')).note, 'in is not natural: it holds -6 at 3, 1');      /* row 2 alone, a single run: no run is named */
  assert.equal(judged(g, 'v:M', 'integer', 'in', runs(1, 1, 3)).state, 'kept');
});
test('evaluate: a promise is held in every cell of a tile, and the sentence says which cell breaks it', () => {
  const g = build(snap([B('Row', 0, 0, 2, 1, { entries: { '1,1': { expr: '3 - index.x' }, '2,1': 1 }, holds: 'natural' }), arrow('out', { id: 't1', as: 'tile' })],
    [{ id: 't1', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 2, rows: 1, across: 3, down: 1 } }]));
  assert.deepEqual(validate(g), []);
  const tile = g.spaces.top.tiles[0].node, got = evaluate(g, tile);
  assert.deepEqual(got, { error: { code: 'type', note: 'Row is not natural: it holds 0 at 1, 1 in cell 2, 1', node: 'v:Row' } });      /* cell 1 holds 2 1, cell 2 holds 0 1 */
  assert.deepEqual(evaluate(g, g.spaces.top.arrows[0].node), got);      /* and so has the arrow that reads the tile */
});
test('evaluate: a promise on the block seated on an arrow is held against the arrow\'s output, and one inside a function against each thing it is given', () => {
  const g = made(snap([B('X', 0, 20, 2, 2, { entries: rowsOf([[1, 2], [3, -4]]) }),
    arrow('lin', { id: 'X', as: 'block' }, { span: 2 }, { x: 50, y: 20, name: 'linear', inside: space([B('inn', -9, 0, 2, 2, { in: true }), B('Wf', -7, 0, 1, 2, { entries: rowsOf([[1], [2]]) })]) }),
    B('Out', 5, 20, 1, 2, { seat: 'lin', holds: 'whole' })]));
  assert.deepEqual(evaluate(g, 'v:Out'), { error: { code: 'type', note: 'Out is not whole: it holds -5 at 1, 2', node: 'v:Out' } });
  assert.equal(promiseOf(g, 'v:Out').state, 'broken'); assert.deepEqual(evaluate(g, g.spaces.top.arrows[0].node).entries, { '1,1': 5, '1,2': -5 });      /* the arrow's own output is as it was */
});

/* ---- ruled 21 November 2026: None has a space of its own ---- */
test('none is the space of None alone: joined with a space S it is S? exactly, it lies within what admits None, and it can be promised', () => {
  assert.deepEqual(parse('none'), { space: null, none: true }); assert.equal(parse('none?'), null); assert.equal(parse('None'), null); assert.ok(!SPACES.includes('none'));
  assert.deepEqual(promise('none'), { holds: 'none' }); assert.deepEqual(promise(' None '), { holds: 'none' }); assert.deepEqual(promise('none?'), { holds: 'none' });      /* None or None is None */
  assert.equal(said('none'), 'None'); assert.equal(of(NONE), 'none'); assert.equal(ofAll([NONE, NONE]), 'none');
  for (const s of SPACES){ assert.equal(both('none', s), s + '?', s); assert.equal(both(s + '?', 'none'), s + '?', s); assert.equal(choice('none', s), s + '?', s);
    assert.ok(within('none', s + '?'), s); assert.ok(!within('none', s), s); assert.ok(!within(s, 'none'), s); assert.ok(!within(s + '?', 'none'), s);
    for (const op of ['+', '-', '*', '/', '^', '<', '>', '<=', '>=', 'max', 'min']){ assert.equal(binary(op, 'none', s), 'none', op + ' ' + s); assert.equal(binary(op, s + '?', 'none'), 'none', op + ' ' + s); }      /* None with anything is None */
    for (const op of ['==', '!=', '&&', '||']) assert.equal(binary(op, 'none', s), 'boolean', op + ' ' + s); }
  assert.equal(both('none', 'none'), 'none'); assert.ok(within('none', 'none')); assert.equal(both('none', 'natural'), 'natural?');      /* not whole? */
  for (const fn of ['neg', 'abs', 'sqrt', 'exp', 'ln', 'tanh', 'erf']) assert.equal(unary(fn, 'none'), 'none', fn); assert.equal(unary('!', 'none'), 'boolean');
  assert.equal(sum('none', 3), 'none'); assert.equal(product('none', 'natural', 2), 'none');
  assert.equal(admits('none', NONE), true); assert.equal(admits('none', 0), false); assert.equal(admits('none', null), true); assert.equal(admits('none', { err: 'x' }), true);
  assert.deepEqual(broken('none', { '1,1': NONE, '2,1': 2 }), { key: '2,1', value: 2 }); assert.equal(NOT_HELD('W', 'none', '2,1', 2), 'W is not None: it holds 2 at 2, 1');
  assert.equal(NOT_HELD('W', 'none', '1,1', true), 'W is not None: it holds 1 at 1, 1'); assert.equal(NOT_HELD('W', 'none', '1,1', false), 'W is not None: it holds 0 at 1, 1');      /* a boolean as the backend writes it in the same sentence (backend/tests/test_none.py) */
  assert.equal(UNPROVEN('W', 'none', 'natural?'), 'W cannot be shown to be None: it is worked out as natural or None');
});
test('a shape of only None is worked out as none, promises it and keeps it, and a number in it breaks the promise', () => {
  const B = (id, entries, more = {}) => ({ id, type: 'tensor', name: id, x: 0, y: 0, cols: 2, rows: 1, colsName: null, rowsName: null, entries, inside: null, variable: null, ...more });
  const g = build({ top: { shapes: [B('E', { '1,1': NONE, '2,1': NONE }), B('P', { '1,1': NONE, '2,1': NONE }, { x: 10, holds: 'none' }), B('Q', { '1,1': NONE, '2,1': 3 }, { x: 20, holds: 'none' })], groups: [], operations: [] } });
  assert.deepEqual(validate(g), []); const node = id => g.blocks[id];
  assert.equal(g.nodes[node('E')].type.value, 'none'); assert.equal(promiseOf(g, node('E')).inferred, 'none'); assert.equal(g.nodes[node('P')].holds, 'none'); assert.equal(promiseOf(g, node('P')).state, 'kept');
  assert.deepEqual(promiseOf(g, node('Q')), { holds: 'none', inferred: 'natural?', state: 'broken', note: 'Q is not None: it holds 3 at 2, 1' });
});

/* ---- ruled 21 November 2026: a broken Takes is an error, and a type never says what might be false ---- */
test('evaluate: a value outside what an arrow takes is the error type, naming the entry: the output has no value, and nor has what is made of it', () => {
  const lin = (x, more = {}) => [B('X', 0, 20, 2, 2, { entries: rowsOf(x) }),
    arrow('lin', { id: 'X', as: 'block' }, { span: 2 }, { x: 50, y: 20, name: 'linear', inside: space([B('inn', -9, 0, 2, 2, { in: true, holds: 'natural', ...more }), B('Wf', -7, 0, 1, 2, { entries: rowsOf([[1], [2]]) })]) }),
    B('Out', 5, 20, 1, 2, { seat: 'lin' })];
  let g = made(snap(lin([[1, 2], [3, -4]]))); const out = g => g.spaces.top.arrows[0].node;
  assert.deepEqual(evaluate(g, out(g)), { error: { code: 'type', note: 'in is not natural: it holds -4 at 2, 2', node: out(g) } });
  assert.deepEqual(evaluate(g, 'v:Out').error, evaluate(g, out(g)).error);      /* the block seated on it: no value, for the same reason */
  assert.equal(judged(g, 'v:X', 'natural', 'in').note, 'in is not natural: it holds -4 at 2, 2');      /* the sentence the arrow's Takes row shows is the same one */
  g = made(snap(lin([[1, 2], [3, 4]]))); assert.deepEqual(evaluate(g, 'v:Out').entries, { '1,1': 5, '1,2': 11 });      /* kept: worked out as before */
  g = made(snap(lin([[1, NONE], [3, 4]]))); assert.equal(evaluate(g, out(g)).error.note, 'in is not natural: it holds None at 2, 1');
  g = made(snap(lin([[1, NONE], [3, 4]], { holds: 'natural?' }))); assert.ok(evaluate(g, out(g)).entries);
  g = made(snap(lin([[1, null], [3, 4]]))); assert.ok(evaluate(g, out(g)).entries);      /* an entry not given breaks nothing */
});
test('evaluate: an arrow repeated in a tile holds each run to what it takes, and the sentence says which run', () => {
  const tile = (id, members, repeat) => ({ id, name: null, members, groups: [], repeat: { x: 0, y: 0, cols: 1, rows: 1, across: 1, down: 1, ...repeat } });
  const g = made(snap([B('N', 0, 20, 2, 4, { entries: rowsOf([[1, 2], [3, 4], [5, -6], [7, 8]]) }),
    arrow('g', { id: 'N', as: 'block' }, { side: 'e', span: 2 }, { x: 2, y: 20, inside: space([B('inn', -9, 0, 2, 2, { in: true, holds: 'natural' }), B('Wg', -7, 0, 1, 2, { entries: rowsOf([[1], [10]]) })]) })],
    [tile('t2', [1], { x: 2, y: 20, cols: 1, rows: 2, down: 2 })]));
  const node = g.spaces.top.arrows[0].node; assert.equal(g.nodes[node].op, 'mapalong');
  assert.deepEqual(evaluate(g, node), { error: { code: 'type', note: 'in is not natural: it holds -6 at 2, 1 in run 2', node } });
});
test('graph: a promise is a type only where the graph alone shows it kept; otherwise the type passed on is what is worked out, and nothing known widens nothing', () => {
  const g = made(snap([B('Nn', 0, 0, 2, 2, { source: { noise: { seed: 1, dist: 'normal' } }, holds: 'probability' }), B('Nu', 10, 0, 2, 2, { source: { noise: { seed: 1, dist: 'uniform' } }, holds: 'real' }),
    B('Z', 20, 0, 2, 1, { entries: rowsOf([[2, -3]]), holds: 'natural' }), B('K', 30, 0, 2, 1, { entries: rowsOf([[2, 3]]), holds: 'integer' }),
    B('E', 40, 0, 2, 1, { holds: 'natural' }), B('Ef', 50, 0, 2, 1, { holds: 'natural' }), B('P', 60, 0, 2, 1, { entries: rowsOf([[1, null]]), holds: 'natural' }), B('F', 70, 0, 1, 1, { entries: { '1,1': { expr: '3 - 1' } }, holds: 'natural' })]));
  assert.equal(valueOf(g, 'v:Nn'), 'real');      /* cannot be shown: the wider one actually worked out, not the promise */
  assert.equal(promiseOf(g, 'v:Nn').state, 'unproven');
  assert.equal(valueOf(g, 'v:Nu'), 'real');      /* probability lies inside real: the promise */
  assert.equal(valueOf(g, 'v:Z'), 'integer'); assert.equal(valueOf(g, 'v:K'), 'integer');
  for (const id of ['v:E', 'v:Ef']){ assert.equal(valueOf(g, id), 'natural', id); assert.deepEqual(promiseOf(g, id), { holds: 'natural', inferred: 'boolean', state: 'kept', note: '' }); }      /* an empty shape: nothing known lies inside every space, so it neither widens nor warns */
  assert.equal(valueOf(g, 'v:P'), 'boolean'); assert.equal(promiseOf(g, 'v:P').state, 'kept');      /* one entry given: what is known is said, and its value keeps the promise */
  assert.equal(valueOf(g, 'v:F'), 'integer'); assert.equal(promiseOf(g, 'v:F').state, 'kept');      /* a difference is an integer by its rule; its value, 2, is held against the promise where the values are */
  /* and the validator holds a graph to it: a promise claimed as the type where the graph does not show it is refused */
  const claimed = JSON.parse(JSON.stringify(g)); claimed.nodes['v:Nn'].type.value = 'probability'; assert.ok(validate(claimed).some(w => w.includes('v:Nn')));
  const empty = JSON.parse(JSON.stringify(g)); empty.nodes['v:E'].type.value = 'boolean'; assert.ok(validate(empty).some(w => w.includes('v:E')));
});
test('graph: a function applied gives its body\'s space only where what it is given is known to lie in what the function takes', () => {
  const lin = (x, takes) => made(snap([B('X', 0, 20, 2, 2, { entries: rowsOf(x) }),
    arrow('lin', { id: 'X', as: 'block' }, { span: 2 }, { x: 50, y: 20, name: 'linear', inside: space([B('inn', -9, 0, 2, 2, { in: true, ...(takes ? { holds: takes } : {}) }), B('Wf', -7, 0, 1, 2, { entries: rowsOf([[1], [2]]) })]) })]));
  const out = g => valueOf(g, g.spaces.top.arrows[0].node);
  assert.equal(out(lin([[1, 2], [3, 4]], 'natural')), 'natural');      /* naturals given to a function of naturals */
  assert.equal(out(lin([[1, 2], [3, -4]], 'natural')), 'any?');      /* integers given: the body's space was worked out for naturals, and is not said of this */
  assert.equal(out(lin([[1, 2], [3, -4]], 'integer')), 'integer'); assert.equal(out(lin([[1, 2], [3, -4]], null)), 'any?');
});

/* ---- ruled 21 November 2026: a source filled with one known value is checked by that value at any size ---- */
test('evaluate: a shape too large to work out whose values can be read off the graph is held to its promise by them: kept or broken, never unproven', () => {
  const big = { '1,1': 2, '80,80': -7 };
  const g = made(snap([B('Os', 0, 0, 80, 80, { source: 'ones', holds: 'natural' }), B('Zs', 100, 0, 80, 80, { source: 'zeros', holds: 'natural' }), B('Zw', 200, 0, 80, 80, { source: 'zeros', holds: 'whole' }),
    B('Id', 300, 0, 80, 80, { source: 'identity', holds: 'natural' }), B('Ib', 400, 0, 80, 80, { source: 'identity', holds: 'probability' }),
    B('Ty', 500, 0, 80, 80, { entries: big, holds: 'natural' }), B('Tz', 600, 0, 80, 80, { entries: big, holds: 'integer' }), B('Tf', 700, 0, 80, 80, { entries: { '1,1': { expr: '2 - 9' } }, holds: 'natural' }),
    B('R', 0, 100, 80, 80, { name: 'Zs', variable: 1, reference: true })].map((d, i) => i === 1 ? { ...d, variable: 1 } : d)));
  for (const id of ['v:Os', 'v:Zw', 'v:Ib', 'v:Tz']){ assert.deepEqual(promiseOf(g, id).note, '', id); assert.equal(promiseOf(g, id).state, 'kept', id); assert.equal(evaluate(g, id).deferred, true, id); }
  assert.deepEqual(evaluate(g, 'v:Zs'), { error: { code: 'type', note: 'Zs is not natural: it holds 0 at 1, 1', node: 'v:Zs' } }); assert.equal(promiseOf(g, 'v:Zs').state, 'broken');
  assert.equal(promiseOf(g, 'v:Id').note, 'Id is not natural: it holds 0 at 2, 1');
  assert.equal(promiseOf(g, 'v:Ty').note, 'Ty is not natural: it holds -7 at 80, 80');
  assert.equal(promiseOf(g, 'v:Tf').state, 'unproven');      /* a formula among its entries: it would have to be worked out */
  assert.equal(evaluate(g, g.blocks.R).error.note, 'Zs is not natural: it holds 0 at 1, 1');      /* and what is made of it has no value */
  /* with inner data the place is said with its inner position, as the same shape small says it and as the backend does */
  const inner = [{ length: 2, name: null }], h = made(snap([B('Zi', 0, 0, 70, 70, { inner, source: 'zeros', holds: 'natural' }), B('Zj', 100, 0, 2, 2, { inner, source: 'zeros', holds: 'natural' }),
    B('Ii', 200, 0, 70, 70, { inner: [{ length: 2, name: null }, { length: 3, name: null }], source: 'identity', holds: 'natural' })]));
  assert.equal(evaluate(h, 'v:Zi').error.note, 'Zi is not natural: it holds 0 at 1, 1, 1'); assert.equal(evaluate(h, 'v:Zj').error.note, 'Zj is not natural: it holds 0 at 1, 1, 1');
  assert.equal(evaluate(h, 'v:Ii').error.note, 'Ii is not natural: it holds 0 at 2, 1, 1, 1');
});

/* ---- ruled 21 November 2026: a sentence names the place as drawn on the shape being looked at ---- */
test('a broken promise\'s sentence names the entry as the use being looked at draws it: transposed, and turned through its inner axes', () => {
  const g = made(snap([B('W', 0, 0, 3, 2, { entries: rowsOf([[1, 2, -3], [4, 5, 6]]), holds: 'natural', variable: 1 }), B('Wt', 0, 10, 2, 3, { name: 'W', variable: 1, reference: true, transposed: true })]));
  const use = g.blocks.Wt, error = evaluate(g, 'v:W').error; assert.equal(g.nodes[use].op, 'transpose');
  assert.equal(error.note, 'W is not natural: it holds -3 at 3, 1'); assert.equal(seenFrom(g, use, error), 'W is not natural: it holds -3 at 1, 3');
  assert.equal(seenFrom(g, 'v:W', error), error.note); assert.equal(seenFrom(g, use, { code: 'size', note: 'x at 3, 1', node: 'v:W' }), 'x at 3, 1'); assert.equal(seenFrom(g, use, { ...error, node: 'v:other' }), error.note);
  /* a use turned through its inner axes: axis k of the use is axis order[k] of the variable */
  const turned = { ...g, nodes: { ...g.nodes, turn: { op: 'transpose', inputs: ['v:W'], order: [2, 0, 3, 1], type: g.nodes['v:W'].type } } };
  assert.equal(seenFrom(turned, 'turn', { code: 'type', note: 'W is not natural: it holds -3 at 5, 6, 7, 8 in cell 2, 1', node: 'v:W' }), 'W is not natural: it holds -3 at 7, 5, 8, 6 in cell 2, 1');
});
