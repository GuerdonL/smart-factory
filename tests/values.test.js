/* values.js: the kinds of value and how two combine. Run with: node --test */
import './solver.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combine, apply, truth, kind, written, typedNumber, storable, sideOf, rootOf, isError, isFormula, exact, held } from '../values.js';
import * as algebra from '../algebra.js';

const q = (n, d = 1, k = 0) => ({ n, ...(d !== 1 ? { d } : {}), k }), E = why => ({ err: why }), sym = text => ({ sym: text });
const is = (op, a, b, expected) => assert.deepEqual(combine(op, a, b), expected, `${written(a)} ${op} ${written(b)}`);
const INF = Infinity;

test('every kind is told apart', () => {
  const kinds = [[7, 'whole'], [-INF, 'infinity'], [q(3, 4), 'exact'], [true, 'boolean'], [sym('1+sqrt(2)'), 'symbolic'], [{ f: 0.5 }, 'decimal'], [E('x'), 'error'], [null, 'unknown'], [undefined, 'unknown']];
  for (const [v, k] of kinds) assert.equal(kind(v), k);
  assert.equal(isFormula({ expr: '1+1' }), true); assert.equal(isFormula(q(1, 2)), false); assert.equal(kind({ expr: '1' }), 'unknown');      /* a formula is not a value */
});

test('whole numbers, fractions and single roots are worked out exactly', () => {
  is('+', 2, 3, 5); is('-', 2, 3, -1); is('*', -4, 3, -12); is('/', 6, 3, 2); is('/', 6, 4, q(3, 2)); is('/', 0, -5, 0); is('*', 0, -5, 0);
  is('+', q(1, 3), q(1, 6), q(1, 2)); is('-', q(1, 2), q(1, 2), 0); is('*', q(2, 3), q(3, 2), 1); is('/', q(1, 2), q(1, 4), 2);
  is('*', q(2, 1, 1), q(2, 1, 1), 2); is('*', q(2, 1, 1), q(3, 1, 1), q(6, 1, 1)); is('/', q(8, 1, 1), q(2, 1, 1), 2); is('*', 2, q(3, 1, 1), q(12, 1, 1));
  is('*', q(2, 1, 1), q(2, 1, 2), q(8, 1, 2));            /* √2 · ∜2 = ∜8 */
  is('+', q(2, 1, 1), q(8, 1, 1), q(18, 1, 1));           /* √2 + √8 = 3√2: a single root still */
  is('-', q(2, 1, 1), q(2, 1, 1), 0); is('+', q(2, 1, 1), 0, q(2, 1, 1));
  is('^', 2, 10, 1024); is('^', 2, -1, q(1, 2)); is('^', 2, q(1, 2), q(2, 1, 1)); is('^', 9, q(1, 2), 3); is('^', q(9, 4), q(1, 2), q(3, 2));
  is('^', 30, q(1, 4), q(30, 1, 2)); is('^', q(2, 1, 1), 2, 2); is('^', 7, 0, 1); is('^', 0, 3, 0);
  is('^', -8, q(1, 3), -2); is('^', -8, q(2, 3), 4); is('^', q(-8, 27), q(1, 3), q(-2, 3)); is('^', 27, q(1, 3), 3); is('^', 125, q(2, 3), 25);
});

test('nothing overflows: what is too large for plain numbers is kept exactly, and still worked out directly', () => {
  const big = combine('^', 2, 80); assert.deepEqual(big, sym('1208925819614629174706176'));
  is('/', big, combine('^', 2, 78), 4); is('+', big, 1, sym('1208925819614629174706177')); is('<', big, combine('+', big, 1), true);
  is('*', 9007199254740991, 2, sym('18014398509481982')); is('+', 9007199254740991, 1, sym('9007199254740992'));
  is('/', 1, big, sym('1/1208925819614629174706176'));
  assert.deepEqual(combine('^', 2, 100000), E('too large to work out'));
});

test('what is not a single root goes to the solver and comes back symbolic, or simpler where it is', () => {
  is('+', q(2, 1, 1), 1, sym('1+sqrt(2)')); is('+', q(2, 1, 1), q(3, 1, 1), sym('sqrt(2)+sqrt(3)')); is('^', 2, q(1, 3), sym('2^(1/3)'));
  is('^', 54, q(1, 3), sym('3*2^(1/3)')); is('^', -2, q(1, 3), sym('-2^(1/3)'));
  is('-', sym('1+sqrt(2)'), q(2, 1, 1), 1);                /* the simplest kind that holds the answer: a whole number */
  is('-', sym('1+sqrt(2)'), 1, q(2, 1, 1));                /* else exact */
  is('*', sym('1+sqrt(2)'), 2, sym('2*(1+sqrt(2))'));      /* else symbolic */
  assert.doesNotMatch(JSON.stringify(combine('+', q(2, 1, 1), q(3, 1, 1))), /\d\.\d/);      /* never a decimal */
  /* the root of a square: the solver's abs( … ) comes off where the sign can be told */
  is('^', combine('^', sym('1+sqrt(2)'), 2), q(1, 2), sym('1+sqrt(2)')); is('^', combine('^', sym('1-sqrt(2)'), 2), q(1, 2), sym('-1+sqrt(2)'));
});

/* what a value comes to as a floating-point number, worked out apart from values.js: to check answers by */
const near = v => typeof v === 'number' ? v : v.sym !== undefined ? Number(globalThis.nerdamer(v.sym).evaluate().text('decimals')) : Math.sign(v.n) * (Math.abs(v.n) / (v.d || 1)) ** (1 / 2 ** v.k);
const squareFree = n => { for (let f = 2; f * f <= n; f++) while (n % (f * f) === 0) n /= f * f; return n; };

test('a sum or difference of two roots is a single root only when one is a fraction of the other: every √a ± √b for a, b from 2 to 24', () => {
  let single = 0, symbolic = 0;
  for (let a = 2; a <= 24; a++) for (let b = 2; b <= 24; b++) for (const op of ['+', '-']){
    const v = combine(op, combine('^', a, q(1, 2)), combine('^', b, q(1, 2))), want = op === '+' ? Math.sqrt(a) + Math.sqrt(b) : Math.sqrt(a) - Math.sqrt(b), label = `√${a} ${op} √${b} = ${written(v)}`;
    assert.ok(Math.abs(near(v) - want) < 1e-9, label);
    const one = squareFree(a) === squareFree(b);          /* the same square-free part: √8 and √2, √12 and √3 */
    assert.equal(kind(v) === 'whole' || kind(v) === 'exact', one, label); assert.equal(kind(v) === 'symbolic', !one, label);
    one ? single++ : symbolic++; }
  assert.equal(single + symbolic, 2 * 23 * 23); assert.equal(single, 2 * [...Array(23)].flatMap((_, i) => [...Array(23)].map((_, j) => [i + 2, j + 2])).filter(([a, b]) => squareFree(a) === squareFree(b)).length);
  /* the ones the solver gets wrong when asked: it says (√2-√6)² is 8 */
  is('-', q(2, 1, 1), q(6, 1, 1), sym('-sqrt(6)+sqrt(2)')); is('-', q(3, 1, 1), q(6, 1, 1), sym('-sqrt(6)+sqrt(3)')); is('==', combine('-', q(2, 1, 1), q(6, 1, 1)), q(-8, 1, 1), false);
  assert.ok(Math.abs(near(combine('-', q(2, 1, 1), combine('/', q(10, 1, 1), 3))) - (Math.SQRT2 - Math.sqrt(10) / 3)) < 1e-9);
});

test('a root of a number past 2^53 stays exact, is read back, and is written readably', () => {
  const root = v => combine('^', v, q(1, 2)), p60 = combine('+', combine('^', 2, 60), 1), p81 = combine('^', 2, 81);
  is('^', root(p60), 2, sym('1152921504606846977'));                    /* √(2^60+1)² ends in 977, not 976 */
  is('^', root(sym('9007199254740993')), 2, sym('9007199254740993'));
  is('==', combine('*', q(2, 1, 1), p60), combine('*', q(2, 1, 1), combine('^', 2, 60)), false); is('>', combine('*', q(2, 1, 1), p60), combine('*', q(2, 1, 1), combine('^', 2, 60)), true);
  const e40 = combine('+', combine('^', 10, 40), 1); is('==', root(e40), combine('^', 10, 20), false); is('>', root(e40), combine('^', 10, 20), true);
  is('*', root(p81), root(p81), sym('2417851639229258349412352'));
  is('/', combine('*', q(2, 1, 1), combine('^', 10, 20)), combine('^', 10, 20), q(2, 1, 1));      /* √2·10^20 / 10^20 is √2 again, not a fraction near it */
  assert.deepEqual(root(p81), sym('(2417851639229258349412352/1)^(1/2)')); assert.equal(written(root(p81)), '√2417851639229258349412352');
  assert.equal(written(combine('/', 1, root(p81))), '√(1/2417851639229258349412352)'); assert.equal(written(combine('^', e40, q(1, 4))), '∜10000000000000000000000000000000000000001');
  assert.equal(written(combine('-', 0, combine('^', e40, q(1, 8)))), '-10000000000000000000000000000000000000001^(1/8)');
  is('+', root(p81), q(2, 1, 1), sym('(2417851639233656395923458/1)^(1/2)'));      /* √(2^81) + √2 = (2^40 + 1)√2: still one root */
  is('-', root(p81), root(p81), 0); is('/', root(p81), root(p81), 1); is('^', root(root(combine('^', 3, 400))), 4, combine('^', 3, 400));
  is('<', root(p81), root(combine('+', p81, 1)), true); is('max', root(p81), 5, root(p81));
  assert.equal(apply('abs', combine('-', 0, root(p81))).sym, root(p81).sym); assert.deepEqual(apply('sqrt', combine('^', 2, 162)), p81);
});

test('no input waits long: past a bound the answer is an error that says so', () => {
  const large = E('too large to work out'), t0 = performance.now();
  is('^', combine('^', 2, 130), q(1, 130), 2); is('^', combine('^', 2, 134), q(1, 67), 4);      /* these have whole roots, found directly */
  is('^', combine('+', combine('^', 10, 30), 1), q(1, 3), large);      /* this has none, and is too long for the solver */
  is('^', 9007199254740881, q(1, 3), large);                            /* so is a cube root of a 16-digit number with no whole root */
  is('^', 1000000007, q(1, 3), sym('1000000007^(1/3)'));               /* the boundary: up to 10^12 the solver is asked */
  is('^', 10, 5000, large); is('^', combine('^', 2, 4000), 2, large); is('+', combine('^', 2, 80), q(2, 1, 1), large); is('*', sym('1+sqrt(2)'), combine('^', 2, 80), large);
  is('^', combine('^', 2, 80), q(2, 1, 1), large); is('^', 2, combine('/', 1, combine('^', 2, 80)), large); is('^', combine('^', 2, 200), q(1, 1025 * 3), large);
  assert.deepEqual(apply('exp', combine('^', 2, 80)), large); assert.deepEqual(typedNumber('1' + '0'.repeat(1300)), large); assert.equal(kind(typedNumber('1' + '0'.repeat(1200))), 'symbolic');
  let deep = 2; for (let i = 0; i < 7; i++) deep = combine('^', deep, q(1, 2)); assert.deepEqual(deep, sym('2^(1/128)'));      /* under more than six roots: the solver's, as text */
  is('>', combine('^', 2, 80), sym('1+sqrt(2)'), true); is('<', sym('1+sqrt(2)'), combine('^', 2, 80), true);      /* one side large, far from the other: told */
  assert.ok(performance.now() - t0 < 3000, `took ${(performance.now() - t0).toFixed(0)}ms`);
});

test('a root of a symbolic value below 0: an even one is an error, an odd one is the real one', () => {
  const even = E('an even root of a negative number'), neg = sym('1-sqrt(2)'), pos = sym('-1+sqrt(2)');
  assert.deepEqual(apply('sqrt', neg), even); is('^', neg, q(1, 2), even); is('^', neg, q(1, 4), even); is('^', neg, q(3, 2), even); assert.deepEqual(apply('sqrt', combine('-', q(2, 1, 1), q(3, 1, 1))), even);
  assert.deepEqual(apply('sqrt', pos), sym('sqrt(-1+sqrt(2))')); assert.deepEqual(apply('sqrt', combine('-', q(3, 1, 1), q(2, 1, 1))), sym('sqrt(-sqrt(2)+sqrt(3))'));
  is('^', q(-8, 1, 1), q(2, 3), 2); is('^', q(-8, 1, 1), q(1, 3), q(-2, 1, 1)); is('^', q(-6, 1, 1), q(1, 2), even);      /* a root that is below 0: (-√8)^(2/3) is 2 */
  assert.ok(Math.abs(near(combine('^', q(-6, 1, 1), q(2, 3))) - 6 ** (1 / 3)) < 1e-9); assert.ok(Math.abs(near(combine('^', q(-6, 1, 1), q(1, 3))) + 6 ** (1 / 6)) < 1e-9);
  is('^', neg, q(1, 3), sym('-(-1+sqrt(2))^(1/3)')); is('^', neg, q(2, 3), sym('(-1+sqrt(2))^(2/3)')); is('^', pos, q(1, 3), sym('(-1+sqrt(2))^(1/3)'));
  assert.ok(Math.abs(near(combine('^', neg, q(1, 3))) + Math.cbrt(Math.SQRT2 - 1)) < 1e-9);
});

test('division by zero is an error, and so is an even root of a negative number', () => {
  is('/', 1, 0, E('divide by zero')); is('/', q(1, 2), 0, E('divide by zero')); is('/', 0, 0, E('divide by zero')); is('^', 0, -1, E('divide by zero'));
  is('/', sym('1+sqrt(2)'), 0, E('divide by zero'));
  is('^', -4, q(1, 2), E('an even root of a negative number')); is('^', -2, q(3, 2), E('an even root of a negative number')); is('^', -8, q(1, 6), E('an even root of a negative number'));
  assert.deepEqual(apply('sqrt', -4), E('an even root of a negative number'));
});

test('an error with anything is that error; unknown with anything else is unknown; a decimal with what is left is a decimal', () => {
  const e = E('divide by zero'), f = { f: 0.5 };
  for (const other of [1, INF, q(1, 2), true, sym('1+sqrt(2)'), f, null]){ is('+', e, other, e); is('*', other, e, e); is('<', e, other, e); is('&&', other, e, e); }
  is('+', e, E('second'), e);                              /* the first of two */
  for (const other of [1, 0, INF, q(1, 2), false, sym('1+sqrt(2)'), f]){ is('+', null, other, null); is('*', other, null, null); is('==', null, other, null); is('&&', other, null, null); is('||', null, other, null); is('max', other, null, null); }
  is('*', 0, null, null); is('&&', false, null, null); is('/', null, 0, null);      /* never taken as zero or false */
  is('+', null, null, null); is('+', undefined, 1, null);
  /* the order between the three: an error wins over unknown, unknown over a decimal */
  is('+', e, null, e); is('+', null, e, e); is('+', null, f, null); is('+', f, null, null); is('+', f, e, e);
  is('+', f, 1, { f: 1.5 }); is('*', q(1, 2), f, { f: 0.25 }); is('-', f, true, { f: -0.5 }); is('max', f, 0, { f: 0.5 }); is('*', f, INF, { f: INF });
  is('<', f, 1, true); is('==', f, q(1, 2), true); is('/', f, 0, E('divide by zero'));
  for (const fn of ['neg', 'abs', 'sqrt', 'exp', 'ln', 'tanh', 'erf', '!']){ assert.deepEqual(apply(fn, e), e); assert.equal(apply(fn, null), null); }
  assert.deepEqual(apply('neg', f), { f: -0.5 }); assert.deepEqual(apply('sqrt', { f: 0.25 }), f); assert.ok(Math.abs(apply('erf', f).f - 0.5205) < 1e-4);
});

test('a boolean in arithmetic is 1 or 0, and a number where a boolean is wanted is false only when it is 0', () => {
  is('+', true, 1, 2); is('*', false, 7, 0); is('+', true, true, 2); is('==', true, 1, true); is('<', false, true, true);
  is('&&', 1, 2, true); is('&&', 0, 2, false); is('||', 0, 0, false); is('||', 0, q(1, 2), true); is('&&', INF, sym('1+sqrt(2)'), true);
  assert.equal(apply('!', 0), true); assert.equal(apply('!', 3), false); assert.equal(apply('!', true), false); assert.equal(apply('!', q(1, 2)), false);
  assert.equal(truth(0), false); assert.equal(truth(false), false); assert.equal(truth(-1), true); assert.equal(truth(-INF), true); assert.equal(truth({ f: 0 }), false);
  assert.equal(truth(sym('1+sqrt(2)')), true); assert.equal(truth(sym('1208925819614629174706176')), true);
});

test('a symbolic value that cannot be told from 0 is not taken as true or as false', () => {
  const z = sym('(1+sqrt(2))*(1+sqrt(3))-(1+sqrt(2)+sqrt(3)+sqrt(6))'), no = E('cannot be compared exactly');      /* exactly 0, but the solver does not reduce it */
  assert.deepEqual(truth(z), no); assert.deepEqual(apply('!', z), no); is('&&', z, 1, no); is('&&', 1, z, no); is('||', z, 0, no); is('==', z, 0, no); is('<', z, 0, no);
  is('&&', combine('*', z, 1000000), 1, no);               /* however it is scaled: the noise is scaled with it */
  assert.deepEqual(apply('abs', z), no); is('*', z, INF, no);
});

test('infinity', () => {
  is('+', INF, 5, INF); is('+', 5, -INF, -INF); is('-', 5, INF, -INF); is('-', INF, 5, INF); is('+', INF, INF, INF); is('+', -INF, -INF, -INF);
  is('+', INF, q(2, 1, 1), INF); is('+', sym('1+sqrt(2)'), -INF, -INF);
  is('/', 5, INF, 0); is('/', q(1, 2), -INF, 0); is('/', INF, 2, INF); is('/', INF, -2, -INF); is('/', INF, 0, E('divide by zero'));
  is('*', INF, 3, INF); is('*', INF, -3, -INF); is('*', -INF, -3, INF); is('*', q(-1, 2), INF, -INF); is('*', INF, INF, INF); is('*', INF, -INF, -INF);
  is('*', sym('1-sqrt(2)'), INF, -INF);                    /* a symbolic value's sign */
  is('+', INF, -INF, E('∞ − ∞ has no value')); is('-', INF, INF, E('∞ − ∞ has no value')); is('-', -INF, -INF, E('∞ − ∞ has no value'));
  is('*', 0, INF, E('0 × ∞ has no value')); is('*', -INF, 0, E('0 × ∞ has no value')); is('/', INF, INF, E('∞ / ∞ has no value')); is('/', -INF, INF, E('∞ / ∞ has no value'));
  /* in a comparison it is larger than every number and equal to itself */
  is('>', INF, 1e15, true); is('<', -INF, -1e15, true); is('==', INF, INF, true); is('!=', INF, INF, false); is('<', -INF, INF, true); is('>=', INF, INF, true);
  is('>', INF, sym('1+sqrt(2)'), true); is('>', q(1, 2), -INF, true);
  is('max', 3, INF, INF); is('min', 3, INF, 3); is('max', -INF, 3, 3); is('min', -INF, 3, -INF); is('max', INF, INF, INF);
  /* powers: not in the specification, and chosen to match the limits */
  is('^', INF, 2, INF); is('^', INF, -1, 0); is('^', INF, 0, E('∞^0 has no value')); is('^', -INF, 3, -INF); is('^', -INF, 2, INF);
  is('^', 2, INF, INF); is('^', 2, -INF, 0); is('^', q(1, 2), INF, 0); is('^', q(1, 2), -INF, INF); is('^', 1, INF, E('that has no value')); is('^', 0, INF, 0); is('^', 0, -INF, E('divide by zero')); is('^', -2, INF, E('that has no value'));
});

test('the functions at their fixed points and at the infinities', () => {
  const at = (fn, a, expected) => assert.deepEqual(apply(fn, a), expected, `${fn}(${written(a)})`);
  at('exp', 0, 1); at('exp', -INF, 0); at('exp', INF, INF); at('ln', 0, -INF); at('ln', INF, INF); at('ln', 1, 0);
  at('tanh', INF, 1); at('tanh', -INF, -1); at('erf', INF, 1); at('erf', -INF, -1); at('tanh', 0, 0); at('erf', 0, 0);
  at('abs', -INF, INF); at('abs', INF, INF); at('abs', -3, 3); at('abs', q(-3, 2), q(3, 2)); at('abs', q(-2, 1, 1), q(2, 1, 1)); at('abs', 0, 0);
  at('abs', sym('1-sqrt(2)'), sym('-1+sqrt(2)'));          /* worked out exactly: its sign is told, and it is turned round */
  at('neg', 5, -5); at('neg', INF, -INF); at('neg', q(1, 2), q(-1, 2)); at('neg', 0, 0); at('neg', true, -1);
  at('sqrt', 9, 3); at('sqrt', 2, q(2, 1, 1)); at('sqrt', q(1, 5), q(1, 5, 1)); at('sqrt', INF, INF); at('sqrt', -INF, E('an even root of a negative number'));
  at('ln', -1, E('ln of a negative number')); at('ln', -INF, E('ln of a negative number'));
  /* these stay symbolic unless the solver reduces them */
  at('exp', 2, sym('e^2')); at('ln', 2, sym('log(2)')); at('tanh', 2, sym('tanh(2)')); at('erf', q(1, 2), sym('erf(1/2)')); at('exp', 1, sym('e'));
  assert.equal(apply('ln', apply('exp', 2)), 2); assert.equal(apply('exp', apply('ln', 2)), 2);
  assert.deepEqual(apply('nothing', 2), E('unknown function: nothing'));
});

test('comparing: exactly where it can be, by the sign of the difference where it cannot, and never by a guess', () => {
  is('<', 2, 3, true); is('==', q(1, 2), q(1, 2), true); is('<', q(1, 3), q(1, 2), true); is('>', q(-1, 3), q(-1, 2), true); is('!=', 2, q(2, 1, 1), true);
  is('<', q(2, 1, 1), q(3, 1, 1), true); is('<', q(2, 1, 1), q(3, 2), true); is('>', q(-2, 1, 1), q(-3, 1, 1), true); is('==', q(2, 1, 1), q(2, 1, 1), true);
  is('<', q(2, 1, 1), q(5, 1, 2), true);                   /* √2 against ∜5: both raised to the fourth power, 4 against 5 */
  is('==', combine('*', q(2, 1, 1), q(3, 1, 1)), q(6, 1, 1), true);
  const a = sym('1+sqrt(2)');
  is('==', a, combine('+', 1, q(2, 1, 1)), true);          /* the solver reduces the difference to 0 */
  is('>', a, 2, true); is('<', a, q(5, 2), true); is('<=', a, a, true); is('max', a, 2, a); is('min', a, 2, 2);
  /* a difference the solver cannot reduce to 0 and that is under 1e-12: cannot be decided */
  const lhs = sym('(1+sqrt(2))*(1+sqrt(3))'), rhs = sym('1+sqrt(2)+sqrt(3)+sqrt(6)'), no = E('cannot be compared exactly');
  is('==', lhs, rhs, no); is('<', lhs, rhs, no); is('max', lhs, rhs, no);
  /* the boundary: a difference of 1e-11 is told, one of 1e-13 is not */
  is('<', a, sym('1+sqrt(2)+1/100000000000+sqrt(3)-sqrt(3)'), true);
  is('<', sym('sqrt(2)*sqrt(3)+sqrt(5)'), sym('sqrt(6)+sqrt(5)+1/10000000000000+sqrt(7)-sqrt(7)'), no);
});

test('comparing: the band where nothing is decided is relative to the size of what is compared', () => {
  const no = E('cannot be compared exactly'), m = 1000000, lhs = combine('*', sym('(1+sqrt(2))*(1+sqrt(3))'), m), rhs = combine('*', sym('1+sqrt(2)+sqrt(3)+sqrt(6)'), m);
  is('==', lhs, rhs, no); is('<', lhs, rhs, no); is('>', lhs, rhs, no);      /* equal, and 1e-9 of floating-point noise apart: not decided by the noise */
  is('<', lhs, combine('+', rhs, 1), true); is('>', combine('+', lhs, 1), rhs, true); is('==', lhs, combine('+', rhs, q(1, 1000)), false);      /* a real difference at that size is told */
  /* past what a floating-point number holds: told against one that is not, and by their logarithms against each other */
  const big = apply('exp', 1000), less = apply('exp', 999);
  is('>', big, 1, true); is('>', big, less, true); is('<', less, big, true); is('==', big, big, true); is('max', big, less, big);
  is('<', apply('neg', big), apply('neg', less), true); is('>', big, apply('neg', big), true); is('<', apply('neg', big), 0, true);
});

test('written writes every kind, and never a decimal for an exact value', () => {
  const w = (v, text) => assert.equal(written(v), text);
  w(7, '7'); w(-3, '-3'); w(INF, '∞'); w(-INF, '-∞'); w(q(3, 4), '3/4'); w(q(-3, 4), '-3/4'); w(q(2, 1, 1), '√2'); w(q(12, 1, 1), '2√3'); w(q(-12, 1, 1), '-2√3');
  w(q(1, 2, 1), '√(1/2)'); w(q(30, 1, 2), '∜30'); w(q(32, 1, 2), '2∜2'); w(q(2, 1, 3), '2^(1/8)'); w(q(1, 2, 3), '(1/2)^(1/8)');
  w(true, 'T'); w(false, 'F'); w(sym('1+sqrt(2)'), '1+√2'); w(sym('1+e^2'), '1+exp(2)'); w(sym('e'), 'exp(1)'); w(sym('e^(-1/2)'), 'exp(-1/2)'); w(sym('sqrt(e)'), '√(exp(1))');
  w(sym('log(2)+log(3)'), 'ln(2)+ln(3)'); w(sym('3*2^(1/3)'), '3·2^(1/3)'); w(sym('2*sqrt(3)+erf(1)'), '2√3+erf(1)'); w(sym('tanh(2)'), 'tanh(2)');
  w(E('divide by zero'), '!'); w(null, ''); w(undefined, ''); w({ f: 0.4375 }, '0.4375');
  assert.equal(algebra.valueText, written);                /* one function turns a value into text, whatever it is asked for as */
});

test('a number as typed is exact: a decimal is a fraction', () => {
  assert.equal(typedNumber('7'), 7); assert.deepEqual(typedNumber('0.5'), q(1, 2)); assert.deepEqual(typedNumber('1.25'), q(5, 4)); assert.deepEqual(typedNumber('.5'), q(1, 2));
  assert.equal(typedNumber('5.'), 5); assert.equal(typedNumber('2.0'), 2); assert.deepEqual(typedNumber('12345678901234567890'), sym('12345678901234567890'));
});

test('what may be kept in an entry: every kind but an error, a decimal and unknown', () => {
  for (const v of [7, 0, INF, -INF, q(1, 2), true, false, sym('1+sqrt(2)')]) assert.equal(storable(v), true, written(v));
  for (const v of [E('divide by zero'), { f: 0.5 }, null, undefined, NaN, 1.5]) assert.equal(storable(v), false);
});

test('a matrix\'s side is a whole number of at least 1', () => {
  assert.deepEqual(sideOf(1), { length: 1 }); assert.deepEqual(sideOf(64), { length: 64 });
  assert.deepEqual(sideOf(0), { refused: 'it has to be at least 1' }); assert.deepEqual(sideOf(-2), { refused: 'it has to be at least 1' });      /* the boundary: 1 is taken, 0 is not */
  assert.deepEqual(sideOf(q(3, 4)), { refused: 'a matrix\'s side is a whole number of squares: it cannot be 3/4' });
  assert.deepEqual(sideOf(q(2, 1, 1)), { refused: 'a matrix\'s side is a whole number of squares: it cannot be √2' });
  assert.deepEqual(sideOf(sym('1+sqrt(2)')), { refused: 'a matrix\'s side is a whole number of squares: it cannot be 1+√2' });
  assert.match(sideOf(INF).refused, /cannot be ∞/); assert.match(sideOf(true).refused, /cannot be T/); assert.match(sideOf({ f: 2 }).refused, /cannot be 2/);
  assert.deepEqual(sideOf(E('divide by zero')), { refused: 'divide by zero' }); assert.deepEqual(sideOf(null), { refused: 'it has no value yet' });
});

test('the exact-value helpers take every kind', () => {
  for (const v of [INF, true, sym('1-sqrt(2)'), { f: 0.5 }, E('x'), null, -1, q(-1, 2)]) assert.equal(rootOf(v), null, written(v));
  assert.deepEqual(rootOf(sym('1+sqrt(2)+sqrt(3)')), sym('sqrt(1+sqrt(2)+sqrt(3))'));      /* a symbolic value above 0 has a root, itself symbolic */
  for (const v of [INF, true, sym('1+sqrt(2)'), { f: 0.5 }, E('x'), null]){ assert.equal(exact(v), null); assert.equal(algebra.isWhole(v), false); assert.equal(algebra.isSurd(v), false); }
  assert.deepEqual(held(exact(q(3, 4, 1))), q(3, 4, 1)); assert.equal(isError(E('x')), true); assert.equal(isError(q(1, 2)), false);
});

test('without the solver only what needs it fails, and says so', () => {
  const kept = globalThis.nerdamer; globalThis.nerdamer = undefined;
  try { is('+', 1, 1, 2); is('/', 1, 3, q(1, 3)); is('*', q(2, 1, 1), q(8, 1, 1), 4); is('+', q(5, 1, 1), 1, E('the maths solver did not load')); }
  finally { globalThis.nerdamer = kept; }
  is('+', q(5, 1, 1), 1, sym('1+sqrt(5)'));                /* and that answer was not remembered */
});

test('speed: a product of two 64 by 64 matrices of whole numbers, about half a million steps, takes well under a second', () => {
  const n = 64, A = [], B = [];
  for (let i = 0; i < n * n; i++){ A.push((i * 7919) % 201 - 100); B.push((i * 104729) % 157 - 78); }
  const run = () => { const C = []; let steps = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++){ let s = 0; for (let k = 0; k < n; k++){ s = combine('+', s, combine('*', A[r * n + k], B[k * n + c])); steps += 2; } C.push(s); }
    return { C, steps }; };
  run();                                                   /* once to warm up, then timed */
  const t0 = performance.now(), { C, steps } = run(), ms = performance.now() - t0;
  assert.equal(steps, 2 * n * n * n);                      /* 524,288 */
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++){ let s = 0; for (let k = 0; k < n; k++) s += A[r * n + k] * B[k * n + c]; assert.equal(C[r * n + c], s); }      /* every entry, against plain arithmetic */
  assert.ok(ms < 400, `took ${ms.toFixed(0)}ms`);
});

test('speed: fractions and single roots are worked out directly too, with no solver', () => {
  const kept = globalThis.nerdamer; globalThis.nerdamer = undefined;      /* with no solver there at all */
  try { const t0 = performance.now(); let s = 0, p = 1;
    for (let i = 1; i <= 20000; i++){ s = combine('+', s, combine('/', (i % 13) - 6, (i % 7) + 2)); p = combine('*', combine('^', (i % 5) + 2, q(1, 2)), combine('^', (i % 5) + 2, q(1, 2))); }
    assert.deepEqual(s, q(-19, 20)); assert.equal(p, (20000 % 5) + 2);      /* 80,000 steps; the sum checked against Python's fractions */
    assert.ok(performance.now() - t0 < 1000);
  } finally { globalThis.nerdamer = kept; }
});
