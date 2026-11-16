/* expression.js: arithmetic as typed, worked out exactly. Run with: node --test */
import './solver.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, written, whole, number, value } from '../expression.js';

const v = (p, q = 1, k = 0) => ({ value: { p, q, k } });
const is = (text, expected, lookup) => assert.deepEqual(evaluate(text, lookup), expected, text);

test('whole numbers and fractions stay exact', () => {
  is('7', v(7)); is('-3', v(-3)); is('1 + 2 * 3', v(7)); is('(1 + 2) * 3', v(9));
  is('3/2', v(3, 2)); is('6/4', v(3, 2)); is('1/3 + 1/6', v(1, 2)); is('2^(3) + 1', v(9)); is('2^3^2', v(512));
  is('0', v(0)); is('1/2 - 1/2', v(0));
});

test('decimals are taken as fractions, never kept as decimals', () => {
  is('0.5', v(1, 2)); is('1.25', v(5, 4)); is('0.1 + 0.2', v(3, 10));
});

test('a single root is a value', () => {
  is('2^(1/2)', v(2, 1, 1)); is('√2', v(2, 1, 1)); is('12^(1/2)', v(12, 1, 1)); is('2√3', v(12, 1, 1));
  is('30^(1/4)', v(30, 1, 2)); is('∜30', v(30, 1, 2)); is('√√30', v(30, 1, 2)); is('(1/2)^(1/2)', v(1, 2, 1));
  is('-√2', v(-2, 1, 1));
});

test('roots that come out whole or as fractions do', () => {
  is('√9', v(3)); is('√(9/4)', v(3, 2)); is('∜16', v(2)); is('2√3 * √3', v(6)); is('√2 * √2', v(2)); is('√8 / √2', v(2));
});

test('an odd root of a negative number is the real one', () => {
  is('(-8)^(1/3)', v(-2)); is('(-32)^(1/5)', v(-2)); is('(-27)^(1/3) + 1', v(-2)); is('(-8)^(2/3)', v(4));
  is('(-8/27)^(1/3)', v(-2, 3));
});

test('whole roots the solver leaves standing are brought out', () => {
  is('27^(1/3)', v(3)); is('27^(1/3) + 1', v(4)); is('(8/27)^(1/3)', v(2, 3)); is('125^(2/3)', v(25));
  is('54^(1/3)', { inexact: true, text: '3·2^(1/3)' }); is('(-2)^(1/3)', { inexact: true, text: '-2^(1/3)' });
});

test('an even root of a negative number is an error', () => {
  for (const t of ['√(-4)', '(-4)^(1/2)', '(-16)^(1/4)', '(-8)^(1/6)', '(-2)^(3/2)'])
    is(t, { error: 'an even root of a negative number' });
});

test('the signs people type are read', () => {
  is('2 × 3', v(6)); is('2 · 3', v(6)); is('6 ÷ 4', v(3, 2)); is('5 − 7', v(-2)); is('2(3+1)', v(8)); is('(1+1)(2+1)', v(6));
});

test('answers that are not one root stay as the solver simplified them', () => {
  is('√2 + 1', { inexact: true, text: '1+√2' });
  is('2^(1/3)', { inexact: true, text: '2^(1/3)' });
  const r = evaluate('√2 + √3'); assert.equal(r.inexact, true); assert.doesNotMatch(r.text, /\d\.\d/);      /* no decimals */
});

test('errors say why', () => {
  is('1/0', { error: 'divide by zero' });
  is('x + 1', { error: 'unknown name: x' });
  is('2 $ 3', { error: 'cannot read "$"' });
  is('√', { error: 'a root sign with nothing under it' });
  is('√(2', { error: 'a bracket is not closed' });
  assert.ok(evaluate('(2 + 3').error, 'an unclosed bracket');
  assert.ok(evaluate('2 +* 3').error ?? evaluate('2 + ').error, 'arithmetic that cannot be read');
});

test('nothing typed is empty', () => { is('', { empty: true }); is('   ', { empty: true }); });

test('names stand for their values', () => {
  const names = { x: value(3), y: value(1, 2), mass: value(2, 1, 1), 'Keys.x': value(4), odd: 'inexact' };
  const lookup = n => names[n];
  is('x + 1', v(4), lookup); is('2x', v(6), lookup); is('x * y', v(3, 2), lookup); is('mass^2', v(2), lookup);
  is('√x', v(3, 1, 1), lookup); is('Keys.x * 2', v(8), lookup); is('x - 5', v(-2), lookup);
  is('odd + 1', { inexact: true, text: null }, lookup);
  is('z', { error: 'unknown name: z' }, lookup);
});

test('a negative name keeps its sign under a power', () => {
  const lookup = n => ({ a: value(-2) })[n];
  is('a^2', v(4), lookup); is('a * 3', v(-6), lookup);
});

test('value() gives lowest terms and as few roots as needed', () => {
  assert.deepEqual(value(6, 4), { p: 3, q: 2, k: 0 });
  assert.deepEqual(value(1, -2), { p: -1, q: 2, k: 0 });
  assert.deepEqual(value(9, 1, 1), { p: 3, q: 1, k: 0 });
  assert.deepEqual(value(9, 4, 1), { p: 3, q: 2, k: 0 });
  assert.deepEqual(value(16, 1, 2), { p: 2, q: 1, k: 0 });
  assert.deepEqual(value(4, 1, 2), { p: 2, q: 1, k: 1 });
  assert.deepEqual(value(0, 5, 3), { p: 0, q: 1, k: 0 });
  assert.deepEqual(number(7), { p: 7, q: 1, k: 0 });
});

test('numbers too large to hold exactly are inexact, not wrong', () => {
  assert.equal(value(2 ** 60, 1), 'inexact');
  assert.equal(value(2, 1, 7), 'inexact');
  const r = evaluate('2^(80)'); assert.equal(r.inexact, true); assert.equal(r.value, undefined);
});

test('written() writes values out', () => {
  const w = (p, q, k) => written(value(p, q, k));
  assert.equal(w(7), '7'); assert.equal(w(-3), '-3'); assert.equal(w(3, 4), '3/4');
  assert.equal(w(2, 1, 1), '√2'); assert.equal(w(12, 1, 1), '2√3'); assert.equal(w(-12, 1, 1), '-2√3');
  assert.equal(w(1, 2, 1), '√(1/2)'); assert.equal(w(30, 1, 2), '∜30'); assert.equal(w(32, 1, 2), '2∜2');
  assert.equal(w(2, 1, 3), '2^(1/8)'); assert.equal(w(1, 2, 3), '(1/2)^(1/8)');
});

test('whole() gives a whole number or null', () => {
  assert.equal(whole(value(5)), 5); assert.equal(whole(value(0)), 0); assert.equal(whole(value(1, 2)), null);
  assert.equal(whole(value(2, 1, 1)), null); assert.equal(whole('inexact'), null); assert.equal(whole(null), null);
});

test('what is written can be typed back in', () => {
  for (const [p, q, k] of [[7, 1, 0], [-3, 1, 0], [3, 4, 0], [-3, 4, 0], [2, 1, 1], [12, 1, 1], [-12, 1, 1], [1, 2, 1], [3, 4, 1], [30, 1, 2], [32, 1, 2], [2, 1, 3], [1, 2, 3]]){
    const val = value(p, q, k); assert.deepEqual(evaluate(written(val)), { value: val }, written(val)); }
});

test('without the solver, evaluate says so', () => {
  const kept = globalThis.nerdamer; globalThis.nerdamer = undefined;
  try { is('1 + 1', { error: 'the maths solver did not load' }); } finally { globalThis.nerdamer = kept; }
});
