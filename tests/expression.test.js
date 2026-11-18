/* expression.js: a formula as typed, read and worked out exactly. Run with: node --test */
import './solver.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, written, entered, typed, refs, parts, refersTo, repoint, capsuleText, label, measuresOf, offers, wholeOf, bound, guard, namesIn } from '../expression.js';

const q = (n, d = 1, k = 0) => ({ n, ...(d !== 1 ? { d } : {}), k }), sym = text => ({ sym: text }), E = why => ({ err: why });
const is = (text, expected, lookup, options) => assert.deepEqual(evaluate(text, lookup, options), { value: expected }, text);
const unread = (text, why, lookup, options) => assert.deepEqual(evaluate(text, lookup, options), { value: E(why), unread: true }, text);

test('whole numbers and fractions stay exact', () => {
  is('7', 7); is('-3', -3); is('1 + 2 * 3', 7); is('(1 + 2) * 3', 9);
  is('3/2', q(3, 2)); is('6/4', q(3, 2)); is('1/3 + 1/6', q(1, 2)); is('2^(3) + 1', 9); is('2^3^2', 512); is('-2^2', -4); is('2^-1', q(1, 2));
  is('0', 0); is('1/2 - 1/2', 0);
});

test('decimals are taken as fractions, never kept as decimals', () => {
  is('0.5', q(1, 2)); is('1.25', q(5, 4)); is('0.1 + 0.2', q(3, 10)); is('.5', q(1, 2)); is('5.', 5); is('5. + 1', 6); is('2.(3)', 6);      /* a point with nothing after it, as typedNumber takes it */
  unread('.', 'cannot read "."'); unread('1.2.3', 'that cannot be read as arithmetic');
});

test('a single root is a value', () => {
  is('2^(1/2)', q(2, 1, 1)); is('√2', q(2, 1, 1)); is('12^(1/2)', q(12, 1, 1)); is('2√3', q(12, 1, 1));
  is('30^(1/4)', q(30, 1, 2)); is('∜30', q(30, 1, 2)); is('√√30', q(30, 1, 2)); is('(1/2)^(1/2)', q(1, 2, 1));
  is('-√2', q(-2, 1, 1)); is('sqrt(2)', q(2, 1, 1)); is('sqrt(1/5)', q(1, 5, 1)); is('√2^2', 2);
});

test('roots that come out whole or as fractions do', () => {
  is('√9', 3); is('√(9/4)', q(3, 2)); is('∜16', 2); is('2√3 * √3', 6); is('√2 * √2', 2); is('√8 / √2', 2);
});

test('an odd root of a negative number is the real one', () => {
  is('(-8)^(1/3)', -2); is('(-32)^(1/5)', -2); is('(-27)^(1/3) + 1', -2); is('(-8)^(2/3)', 4); is('(-8/27)^(1/3)', q(-2, 3));
});

test('whole roots the solver leaves standing are brought out', () => {
  is('27^(1/3)', 3); is('27^(1/3) + 1', 4); is('(8/27)^(1/3)', q(2, 3)); is('125^(2/3)', 25);
  is('54^(1/3)', sym('3*2^(1/3)')); is('(-2)^(1/3)', sym('-2^(1/3)'));
});

test('an even root of a negative number is an error', () => {
  for (const t of ['√(-4)', '√-4', '∜-16', '√ - 4', '(-4)^(1/2)', '(-16)^(1/4)', '(-8)^(1/6)', '(-2)^(3/2)', 'sqrt(-1)', '√(1-√2)', '√(√2-√3)']) is(t, E('an even root of a negative number'));
  is('√-(1-5)', 2); is('√+4', 2); is('2√-(-9)', 6); unread('√-', 'a root sign with nothing under it'); unread('√-)', 'a root sign with nothing under it');      /* a sign after a root sign goes under it */
});

test('the signs people type are read', () => {
  is('2 × 3', 6); is('2 · 3', 6); is('6 ÷ 4', q(3, 2)); is('5 − 7', -2); is('2(3+1)', 8); is('(1+1)(2+1)', 6);
  is('2 ≠ 3', true); is('2 ≤ 2', true); is('2 ≥ 3', false); is('∞', Infinity); is('-∞', -Infinity); is('inf', Infinity); is('-Infinity', -Infinity);
});

test('answers that are not one root stay symbolic, as the solver simplified them', () => {
  is('√2 + 1', sym('1+sqrt(2)')); is('2^(1/3)', sym('2^(1/3)'));
  const r = evaluate('√2 + √3').value; assert.equal(written(r), '√2+√3'); assert.doesNotMatch(r.sym, /\d\.\d/);      /* no decimals */
  is('2^(80)', sym('1208925819614629174706176'));          /* too large for a plain number: kept exactly, as text */
});

test('a value error is a value: the text was read, and what it came to is the error', () => {
  is('1/0', E('divide by zero')); is('1 + 1/0', E('divide by zero')); is('inf - inf', E('∞ − ∞ has no value')); is('0 * inf', E('0 × ∞ has no value')); is('inf / inf', E('∞ / ∞ has no value'));
  is('3 / inf', 0); is('inf + 5', Infinity); is('-inf + -inf', -Infinity); is('-2 * inf', -Infinity);
});

test('what cannot be read is unread, and says why', () => {
  unread('x + 1', 'unknown name: x'); unread('2 $ 3', 'cannot read "$"'); unread('√', 'a root sign with nothing under it'); unread('√(2', 'a bracket is not closed');
  unread('(2 + 3', 'a bracket is not closed'); unread('2 +* 3', 'that cannot be read as arithmetic'); unread('2 + ', 'that cannot be read as arithmetic'); unread('2 3', 'that cannot be read as arithmetic');
  unread('1 = 2', 'cannot read "="'); unread('1 & 2', 'cannot read "&"'); unread('2)', 'that cannot be read as arithmetic'); unread('max(1, 2', 'a bracket is not closed');
  unread('@Keys.x', 'after @, choose a variable from the list');
});

test('nothing typed is empty', () => { assert.deepEqual(evaluate(''), { empty: true }); assert.deepEqual(evaluate('   '), { empty: true }); });

test('comparisons give true or false, and bind looser than arithmetic and tighter than && and ||', () => {
  is('2 > 3', false); is('2 < 3', true); is('3 == 3', true); is('3 != 3', false); is('3 <= 3', true); is('3 >= 4', false);
  is('1 + 1 == 2', true); is('1 < 2 && 2 < 3', true); is('1 > 2 || 2 < 3', true); is('1 > 2 || 2 > 3', false); is('1 < 2 && 2 > 3 || 1 == 1', true);
  is('!0', true); is('!(2 > 3)', true); is('!1 == 0', true); is('!3 + 1', 1); is('true && !false', true); is('true + 1', 2); is('(2 > 1) * 5', 5);
  is('1/2 < √2', true); is('√2 < 3/2', true); is('√2 * √3 == √6', true); is('1 + √2 > 2', true); is('inf > 10^(20)', true); is('inf == inf', true); is('-inf < inf', true);
  is('(1+√2)(1+√3) == 1+√2+√3+√6', E('cannot be compared exactly'));      /* never a guess */
});

test('select works out only the chosen side', () => {
  is('select(2 > 3, 1/0, 5)', 5); is('select(2 < 3, 5, 1/0)', 5); is('select(1, inf - inf, 0)', E('∞ − ∞ has no value')); is('select(0, 1, -inf)', -Infinity);
  is('select(1/0, 1, 2)', E('divide by zero'));            /* an error in the condition is that error */
  is('select(u, 1, 2)', null, () => null);                 /* an unknown condition is unknown: it is not false */
  is('select(2 > 3, u, 5)', 5, () => null); is('select(2 < 3, u, 5)', null, () => null);
  const z = '((1+√2)*(1+√3) - (1+√2+√3+√6))'; is(`select(${z}, 1, 2)`, E('cannot be compared exactly')); is(`!${z}`, E('cannot be compared exactly')); is(`${z} && 1`, E('cannot be compared exactly'));      /* a condition that cannot be told from 0 is neither side */
  unread('select(1, 2)', 'select takes three values'); unread('select(1, 2, zz)', 'unknown name: zz');      /* a name nothing knows is said, whichever side it is on */
});

test('max, min and abs are worked out exactly; sqrt is the root sign', () => {
  is('max(3, 7/2)', q(7, 2)); is('min(3, 7/2)', 3); is('max(√2, 3/2)', q(3, 2)); is('min(√2, 3/2)', q(2, 1, 1)); is('max(-inf, 2)', 2); is('min(1, inf)', 1);
  is('abs(-3/2)', q(3, 2)); is('abs(-√2)', q(2, 1, 1)); is('abs(1 - √2)', sym('-1+sqrt(2)')); is('abs(-inf)', Infinity); is('max(1, 1/0)', E('divide by zero'));
  is('sqrt(9)', 3); is('sqrt(2) * √2', 2); is('MAX(1, 2)', 2);
  unread('max(1)', 'max takes two values'); unread('abs(1, 2)', 'abs takes one value'); unread('abs()', 'abs takes one value');
});

test('exp, ln, tanh and erf stay symbolic unless they come out', () => {
  is('exp(0)', 1); is('ln(1)', 0); is('tanh(0)', 0); is('erf(0)', 0); is('exp(ln(2))', 2); is('ln(exp(3))', 3);
  is('exp(2) + 1', sym('1+e^2')); assert.equal(written(evaluate('exp(2) + 1').value), '1+exp(2)');
  is('ln(2)', sym('log(2)')); is('tanh(2)', sym('tanh(2)')); is('erf(1)', sym('erf(1)'));
  is('exp(-inf)', 0); is('exp(inf)', Infinity); is('ln(0)', -Infinity); is('ln(inf)', Infinity); is('tanh(inf)', 1); is('tanh(-inf)', -1); is('erf(inf)', 1); is('erf(-inf)', -1);
  is('exp(-inf) / (exp(-inf) + exp(0))', 0);               /* a causal mask followed by a softmax */
});

test('no other function is taken, and a function\'s name alone is only a name', () => {
  unread('sin(1)', 'unknown name: sin'); unread('log(2)', 'unknown name: log'); unread('floor(2.5)', 'unknown name: floor'); unread('max', 'unknown name: max');
  is('x(3 + 1)', 12, n => ({ x: 3 })[n]);                   /* a name set against a bracket multiplies it */
});

test('names stand for their values, of any kind', () => {
  const names = { x: 3, y: q(1, 2), mass: q(2, 1, 1), 'Keys.x': 4, odd: sym('1+sqrt(2)'), none: null, bad: E('missing variable'), up: Infinity, yes: true };
  const lookup = n => names[n];
  is('x + 1', 4, lookup); is('2x', 6, lookup); is('x * y', q(3, 2), lookup); is('mass^2', 2, lookup);
  is('√x', q(3, 1, 1), lookup); is('Keys.x * 2', 8, lookup); is('x - 5', -2, lookup); is('1/√(Keys.x)', q(1, 2), lookup);
  is('odd - 1', q(2, 1, 1), lookup); is('odd + 1', sym('2+sqrt(2)'), lookup);
  is('none + 1', null, lookup); is('none * 0', null, lookup); is('bad + none', E('missing variable'), lookup); is('up - x', Infinity, lookup); is('yes + x', 4, lookup);
  unread('z', 'unknown name: z', lookup);
  is('a^2', 4, n => ({ a: -2 })[n]); is('a * 3', -6, n => ({ a: -2 })[n]);      /* a negative name keeps its sign under a power */
});

test('a name or a capsule is asked for once, and a capsule is handed over read', () => {
  const asked = [];
  const lookup = t => { asked.push(t); return typeof t === 'string' ? 2 : t.measure === 'x' ? 4 : t.measure === 'a' ? 3 : undefined; };
  is('1/√(@[b3k2m9x:x])', q(1, 2), lookup); is('@[b3k2m9x:x] * @[b3k2m9x:a:head count] + w', 14, lookup);
  assert.deepEqual(asked[0], { id: 'b3k2m9x', measure: 'x', name: null }); assert.deepEqual(asked[2], { id: 'b3k2m9x', measure: 'a', name: 'head count' }); assert.equal(asked[3], 'w');
  is('@[bgone00:m] + 1', E('missing variable'), lookup);   /* a capsule nothing answers for: its variable is missing */
  is('select(1, 5, @[bgone00:m])', 5, lookup);             /* and it does no harm on the side not chosen */
  is('2@[b1:x]', 8, lookup);                               /* set against a number, it multiplies */
});

test('a whole matrix is read, and refused everywhere but where matrices are taken', () => {
  unread('@[b3k2m9x]', 'choose one of its measures', () => 1); unread('max(1, @[b3k2m9x])', 'choose one of its measures', () => 1);
  const asked = []; is('max(1, @[b3k2m9x])', 5, t => { asked.push(t); return 5; }, { matrices: true });
  assert.deepEqual(asked, [{ id: 'b3k2m9x', measure: null, name: null }]);
});

test('capsules in a text: found, pointed elsewhere, written, labelled', () => {
  const text = '1/√(@[b1:x]) + @[b2:m]*@[b1:a:heads] + @[b3]';
  assert.deepEqual(refs(text).map(r => r.text), ['@[b1:x]', '@[b2:m]', '@[b1:a:heads]', '@[b3]']);
  assert.deepEqual(refs(text).map(r => [r.id, r.measure, r.name]), [['b1', 'x', null], ['b2', 'm', null], ['b1', 'a', 'heads'], ['b3', null, null]]);
  assert.deepEqual(refs('x + 1'), []); assert.deepEqual(refs('@[b1:z] @Keys.x @[]'), []);      /* not capsules */
  assert.equal(refersTo(text, new Set(['b2'])), true); assert.equal(refersTo(text, new Set(['b9', 'b3'])), true); assert.equal(refersTo(text, new Set(['b9'])), false); assert.equal(refersTo('b1 + 2', new Set(['b1'])), false);
  assert.equal(repoint(text, 'b1', 'b7'), '1/√(@[b7:x]) + @[b2:m]*@[b7:a:heads] + @[b3]'); assert.equal(repoint(text, 'b', 'b7'), text);
  for (const r of refs(text)) assert.equal(capsuleText(r), r.text);
  assert.deepEqual(parts('1/√(@[b1:x])+@[b2:m]'), ['1/√(', { id: 'b1', measure: 'x', name: null }, ')+', { id: 'b2', measure: 'm', name: null }]); assert.deepEqual(parts('x + 1'), ['x + 1']); assert.deepEqual(parts(''), []);
  assert.equal(label({ id: 'b1', measure: 'x' }, 'Keys'), 'Keys.x'); assert.equal(label({ id: 'b1', measure: 'm' }, 'Tau'), 'Tau.mass'); assert.equal(label({ id: 'b1', measure: 'a', name: 'heads' }, 'Keys'), 'Keys.heads');
  assert.equal(label({ id: 'b1', measure: 'y' }, 'Key Weights Matrix'), 'Key Weight.y'); assert.equal(label({ id: 'b1', measure: null }, 'Keys'), 'Keys');      /* up to ten characters of the name */
});

test('what typing into an entry stores: a literal where it is a value written out, a formula otherwise', () => {
  const stores = (text, value, ...more) => assert.deepEqual(entered(text, ...more), { value }, text);
  stores('7', 7); stores('-3', -3); stores('+12', 12); stores(' 42 ', 42); stores('−5', -5); stores('0', 0);
  for (const t of ['inf', '+inf', 'infinity', 'INF', '∞', '+∞']) stores(t, Infinity); for (const t of ['-inf', '-infinity', '-∞', '−∞']) stores(t, -Infinity);
  stores('3/4', q(3, 4)); stores('√2', q(2, 1, 1)); stores('2√3', q(12, 1, 1)); stores('true', true); stores('false', false);
  /* anything else is a formula, kept as typed whatever it comes to: never with its result */
  for (const t of ['6/4', '1 + 1', 'exp(2) + 1', '1/0', 'select(2 > 3, 1/0, 5)', '1/√(@[b1:x])', '2 > 1', '√2 + 1', '1.5']) stores(t, { expr: t });
  stores('  1 + 1 ', { expr: '1 + 1' });
  stores('x + 1', { expr: 'x + 1' }, n => ({ x: null })[n]);      /* a name that is known but has no value yet is still read */
  assert.deepEqual(entered(''), { clear: true }); assert.deepEqual(entered('   '), { clear: true }); assert.deepEqual(entered(null), { clear: true });
  /* what cannot be read is refused, with why */
  assert.deepEqual(entered('2 +'), { refused: 'that cannot be read as arithmetic' }); assert.deepEqual(entered('w + 1'), { refused: 'unknown name: w' });
  assert.deepEqual(entered('@[b1]'), { refused: 'choose one of its measures' }); assert.deepEqual(entered('abc'), { refused: 'unknown name: abc' });
  assert.deepEqual(entered('@[b1]', () => 1, { matrices: true }), { value: { expr: '@[b1]' } });
  /* settle: a formula of numbers alone is kept as what it comes to, where that can be a literal */
  stores('(3)^2', 9, undefined, { settle: true }); stores('(√2)^2', 2, undefined, { settle: true }); stores('(1/2)^2', q(1, 4), undefined, { settle: true });
  stores('(1+√2)^2', { expr: '(1+√2)^2' }, undefined, { settle: true }); stores('(x)^2', { expr: '(x)^2' }, () => 3, { settle: true }); stores('1/0', { expr: '1/0' }, undefined, { settle: true });
});

test('what is stored can be typed over, and typed back in', () => {
  assert.equal(typed({ expr: '1/√(@[b1:x])' }), '1/√(@[b1:x])'); assert.equal(typed(7), '7'); assert.equal(typed(-Infinity), '-∞'); assert.equal(typed(q(12, 1, 1)), '2√3');
  assert.equal(typed(true), 'true'); assert.equal(typed(sym('1+e^2')), '1+exp(2)'); assert.equal(typed(undefined), ''); assert.equal(typed(null), '');
  for (const v of [7, -3, Infinity, -Infinity, true, false, q(3, 4), q(-3, 4), q(2, 1, 1), q(12, 1, 1), q(-12, 1, 1), q(1, 2, 1), q(3, 4, 1), q(30, 1, 2), q(32, 1, 2), q(2, 1, 3), q(1, 2, 3)]){
    assert.deepEqual(evaluate(typed(v)), { value: v }, typed(v)); assert.deepEqual(evaluate(written(v) === 'T' || written(v) === 'F' ? typed(v) : written(v)), { value: v }); }
  for (const t of ['√2 + 1', 'exp(2) + 1', 'ln(2) + ln(3)', '54^(1/3)', 'exp(1/2)', 'tanh(2) * erf(1)', '2^(80)']){ const v = evaluate(t).value;
    assert.deepEqual(evaluate(typed(v)), { value: v }, t + ' -> ' + typed(v)); }      /* a symbolic value as it is written reads back as itself */
});

const Keys = { id: 'bkeys00', name: 'Keys', scalar: false, attributes: ['heads', 'head count'] }, Tau = { id: 'btau000', name: 'Tau', scalar: true, attributes: [] },
  Long = { id: 'blong00', name: 'Key Weights Matrix', scalar: false, attributes: [] }, Key = { id: 'bkey000', name: 'Key', scalar: false, attributes: [] }, all = [Keys, Tau, Long, Key];

test('a variable\'s measures: its sides, a scalar\'s mass, its attributes', () => {
  assert.deepEqual(measuresOf(Keys).map(m => m.label), ['x', 'y', 'heads', 'head count']); assert.deepEqual(measuresOf(Tau).map(m => m.label), ['x', 'y', 'mass']);
  assert.deepEqual(measuresOf(Keys)[2], { measure: 'a', name: 'heads', label: 'heads' }); assert.deepEqual(measuresOf(Tau)[2], { measure: 'm', name: null, label: 'mass' });
});

test('what the list under an @ offers', () => {
  assert.deepEqual(offers('', all).options, all);
  assert.deepEqual(offers('k', all).options, [Keys, Long, Key]); assert.deepEqual(offers('KEY', all).options, [Keys, Long, Key]); assert.deepEqual(offers('a', all).options, [Tau, Long]);      /* beginning with it first, then holding it */
  assert.deepEqual(offers('zz', all).options, []); assert.equal(offers('ke', all).of, undefined);
  const m = offers('Keys.', all); assert.equal(m.of, Keys); assert.deepEqual(m.options.map(o => o.label), ['x', 'y', 'heads', 'head count']);
  assert.deepEqual(offers('keys.h', all).options.map(o => o.label), ['heads', 'head count']); assert.deepEqual(offers('Keys.q', all).options, []);
  assert.equal(offers('Key.', all).of, Key); assert.equal(offers('Key Weight.', all).of, Long); assert.equal(offers('Key Weights Matrix.', all).of, Long);      /* the longest name that fits; a long one by its first ten letters too */
  assert.deepEqual(offers('Tau.m', all).options.map(o => o.measure), ['m']);
});

test('a whole shape as a value: a scalar is its mass, anything else is refused', () => {
  assert.deepEqual(wholeOf(Tau), { capsule: { id: 'btau000', measure: 'm', name: null } });
  assert.deepEqual(wholeOf(Keys), { refused: 'choose one of its measures' });
  assert.deepEqual(wholeOf(Keys, true), { capsule: { id: 'bkeys00', measure: null, name: null } });
});

test('names typed out after an @ are bound to their capsules', () => {
  const b = (text, ...more) => bound(text, all, ...more);
  assert.deepEqual(b('1/√(@Keys.x)'), { text: '1/√(@[bkeys00:x])' }); assert.deepEqual(b('@keys.Y + @Tau.mass*@Tau.m'), { text: '@[bkeys00:y] + @[btau000:m]*@[btau000:m]' });
  assert.deepEqual(b('@Keys.heads+@Keys.head count*2'), { text: '@[bkeys00:a:heads]+@[bkeys00:a:head count]*2' });
  assert.deepEqual(b('@Key.x @Key Weight.y @Key Weights Matrix.x'), { text: '@[bkey000:x] @[blong00:y] @[blong00:x]' });
  assert.deepEqual(b('@Tau + 1'), { text: '@[btau000:m] + 1' });      /* a scalar alone is its mass */
  assert.deepEqual(b('@[bkeys00:x] + @Tau.x'), { text: '@[bkeys00:x] + @[btau000:x]' }); assert.deepEqual(b('x + 1'), { text: 'x + 1' });      /* what is bound already, or has no @, is left */
  assert.deepEqual(b('@Keys + 1'), { refused: 'Keys: choose one of its measures' }); assert.deepEqual(b('@Keys', { matrices: true }), { text: '@[bkeys00]' });
  assert.deepEqual(b('@Nope.x'), { refused: 'No variable in reach is called Nope.x' }); assert.deepEqual(b('@Keys.z'), { refused: 'Keys has no measure called z' });
  assert.deepEqual(b('@Keys.xy'), { refused: 'Keys has no measure called xy' }); assert.deepEqual(b('@Keys.mass'), { refused: 'Keys has no measure called mass' });      /* the boundary: x is a measure, xy is not; a mass is a scalar's */
  assert.deepEqual(b('@'), { refused: 'No variable in reach is called that' });
});

test('a formula that depends on itself is an error, directly or through others', () => {
  const working = guard(), formulas = { a: 'b + 1', b: 'c * 2', c: 'a', d: 'd', e: 'f + 1', f: '2', g: 'select(1, 2, g)', h: 'select(0, 2, h)' };
  const value = name => working(name, () => evaluate(formulas[name], n => n in formulas ? value(n) : undefined).value);
  for (const name of ['a', 'b', 'c', 'd']) assert.deepEqual(value(name), E('depends on itself'), name);
  assert.equal(value('e'), 3); assert.equal(value('f'), 2);      /* depending on another is not depending on itself, and the guard is clear again afterwards */
  assert.equal(value('g'), 2);                                   /* on the side not chosen it does no harm */
  assert.deepEqual(value('h'), E('depends on itself'));
  assert.equal(working('k', () => working('l', () => 5)), 5); assert.throws(() => working('m', () => { throw new Error('x'); })); assert.equal(working('m', () => 1), 1);      /* cleared even when the work throws */
});

test('formulas that refer to themselves through capsules, as the page has them: directly, and through another variable', () => {
  /* variables as plain data: a mass (the formula of entry 1,1) and attributes, each referring to others by capsule */
  const variables = { b1: { mass: '@[b1:m] + 1', attributes: {} },                                   /* directly */
    b2: { mass: '@[b3:a:heads] * 2', attributes: {} }, b3: { mass: '4', attributes: { heads: '@[b2:m] + 1', tails: '@[b3:m] / 2', own: 'own + 1' } },      /* through another variable */
    b4: { mass: 'select(1, 7, @[b4:m])', attributes: { fine: '@[b3:a:tails] + @[b3:m]' } } };
  const working = guard();
  const lookup = id => token => { if (typeof token === 'string') return token in variables[id].attributes ? worked(id, 'a:' + token) : undefined;
    return !variables[token.id] ? undefined : token.measure === 'm' ? worked(token.id, 'm') : token.name in variables[token.id].attributes ? worked(token.id, 'a:' + token.name) : { err: 'missing attribute' }; };
  const worked = (id, what) => working(id + ' ' + what, () => evaluate(what === 'm' ? variables[id].mass : variables[id].attributes[what.slice(2)], lookup(id)).value);
  const itself = E('depends on itself');
  assert.deepEqual(worked('b1', 'm'), itself);                                                       /* its own mass */
  assert.deepEqual(worked('b2', 'm'), itself); assert.deepEqual(worked('b3', 'a:heads'), itself);     /* b2's mass needs b3's heads, which needs b2's mass */
  assert.deepEqual(worked('b3', 'a:own'), itself);                                                   /* an attribute by its own bare name */
  assert.equal(worked('b3', 'm'), 4); assert.equal(worked('b3', 'a:tails'), 2); assert.equal(worked('b4', 'a:fine'), 6);      /* what does not go round is worked out, the same variables beside it */
  assert.equal(worked('b4', 'm'), 7);                                                                /* itself on the side not chosen does no harm */
  assert.deepEqual(evaluate('@[b1:m] + @[b3:m]', lookup('b3')).value, itself); assert.deepEqual(evaluate('@[bgone:m]', lookup('b3')).value, E('missing variable'));
});

test('without the solver, only what needs it says so', () => {
  const kept = globalThis.nerdamer; globalThis.nerdamer = undefined;
  try { is('1 + 1', 2); is('1/√4', q(1, 2)); is('√5 + 1', E('the maths solver did not load')); } finally { globalThis.nerdamer = kept; }
});

/* ---- phase 4: what an arrow adds ---- */
test('an arrow\'s gap is a measure: @[id:g]', () => {
  assert.deepEqual(refs('2 * @[ba1:g]'), [{ id: 'ba1', measure: 'g', name: null, text: '@[ba1:g]' }]);
  is('2 * @[ba1:g] + 1', 7, token => token.measure === 'g' ? 3 : undefined);
  assert.equal(capsuleText({ id: 'ba1', measure: 'g', name: null }), '@[ba1:g]');
  assert.equal(label({ id: 'ba1', measure: 'g', name: null }, 'relu'), 'relu.gap');
});
test('where whole matrices are taken, all of a variable is offered before its measures, and a whole shape is its capsule', () => {
  const vars = [{ id: 'b1', name: 'Keys', scalar: false, attributes: ['heads'] }, { id: 'b2', name: 'Tau', scalar: true, attributes: [] }];
  assert.deepEqual(offers('Keys.', vars, { matrices: true }).options.map(o => o.label), ['all of it', 'x', 'y', 'heads']);
  assert.deepEqual(offers('Keys.', vars, { matrices: true }).options[0], { measure: null, name: null, label: 'all of it' });
  assert.deepEqual(offers('Keys.', vars).options.map(o => o.label), ['x', 'y', 'heads']);                    /* nowhere else */
  assert.deepEqual(offers('Tau.', vars, { matrices: true }).options.map(o => o.label), ['x', 'y', 'mass']);      /* a scalar is its mass */
  assert.deepEqual(offers('Keys.x', vars, { matrices: true }).options.map(o => o.label), ['x']);
  assert.deepEqual(bound('max(x, @Keys)', vars, { matrices: true }), { text: 'max(x, @[b1])' });
  assert.match(bound('max(x, @Keys)', vars).refused, /choose one of its measures/);
  is('@[b1] + 1', 6, token => token.measure === null ? 5 : undefined, { matrices: true });
  unread('@[b1] + 1', 'choose one of its measures', () => 5);
});
test('$ and a number is a name: the graph\'s formulas name their inputs $1, $2', () => {
  const lookup = token => token === '$1' ? 4 : token === '$2' ? { n: 1, d: 2, k: 0 } : undefined;
  assert.equal(evaluate('1/√($1)', lookup).value.n, 1); assert.deepEqual(evaluate('2$1 + $2 * 2', lookup).value, 9);
  assert.deepEqual(evaluate('$3 + 1', lookup), { value: { err: 'unknown name: $3' }, unread: true });      /* and on the page, where nothing knows one, it is an unknown name */
});
test('a name that an object would have of its own accord is a name like any other', () => {
  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']){
    assert.deepEqual(evaluate(name), { value: { err: 'unknown name: ' + name }, unread: true }, name);
    assert.deepEqual(evaluate(name + '(2)', () => 3).value, 6, name);      /* no function of that name: the name against a bracket */
    assert.equal(evaluate(name + ' + 1', n => n === name ? 4 : undefined).value, 5); }
});
test('what a text names is said without working it out', () => {
  assert.deepEqual(namesIn('max(x, $1) * inf + Keys.x + @[b1:m] + true'), { names: ['x', '$1', 'Keys.x'], capsules: [{ id: 'b1', measure: 'm', name: null }], deep: 1 });      /* deep: how far it nests (one bracket) */
  assert.equal(typeof namesIn('(((').why, 'string'); assert.deepEqual(namesIn('constructor'), { names: ['constructor'], capsules: [], deep: 0 });
  assert.equal(namesIn('-(2^-(√(1)))').deep, 7); assert.equal(namesIn('1 + 2 * 3 - 4').deep, 0);
});

test('after review (phase 7): a sum of five thousand terms is read and worked out, not deeper than the stack', () => {
  const long = Array.from({ length: 5000 }, (_, i) => i % 2 ? '$1' : '1').join(' + ');
  assert.deepEqual(namesIn(long).names.length, 2500);
  assert.deepEqual(evaluate(long, n => n === '$1' ? 2 : undefined).value, 7500);
  assert.deepEqual(evaluate(Array.from({ length: 3000 }, () => '2').join(' - ')).value, -5996);      /* and grouped from the left, as ever */
  assert.deepEqual(evaluate('1 - 2 - 3 * 4 - 5').value, -18);
});
