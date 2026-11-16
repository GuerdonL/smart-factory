/* ids.js: a seeded source of ids and of chance. Run with: node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIds } from '../ids.js';

const take = (ids, n) => Array.from({ length: n }, () => ids.random());

test('the same seed gives the same ids and the same chances', () => {
  const a = createIds(42), b = createIds(42);
  assert.deepEqual(take(a, 20), take(b, 20));
  assert.deepEqual([a.id('b'), a.id('g'), a.id()], [b.id('b'), b.id('g'), b.id()]);
});

test('different seeds go different ways', () => {
  assert.notDeepEqual(take(createIds(1), 5), take(createIds(2), 5));
});

test('the sequence for a seed does not change from one version to the next', () => {
  /* saved projects keep where their source has got to; change the generator and they would carry on differently */
  const ids = createIds(42);
  assert.deepEqual([ids.id('b'), ids.id('g')], ['bln13h9', 'gg4zfzu']);
});

test('random is from 0 up to, not including, 1, and well spread', () => {
  const xs = take(createIds(7), 5000);
  assert.ok(xs.every(x => x >= 0 && x < 1));
  const mean = xs.reduce((a, b) => a + b) / xs.length;
  assert.ok(mean > 0.45 && mean < 0.55, 'mean ' + mean);
  assert.equal(new Set(xs).size, xs.length);
});

test('an id is its prefix and six letters or digits, and they do not repeat', () => {
  const ids = createIds(3), made = Array.from({ length: 2000 }, () => ids.id('b'));
  for (const id of made) assert.match(id, /^b[0-9a-z]{6}$/);
  assert.equal(new Set(made).size, made.length);
  assert.match(ids.id(), /^[0-9a-z]{6}$/); assert.match(ids.id('g'), /^g[0-9a-z]{6}$/);
});

test('state is plain data: the seed it began with and where it has got to', () => {
  const ids = createIds(42);
  assert.deepEqual(ids.state(), { seed: 42, at: 42 });
  ids.random(); ids.id('b');
  const s = ids.state();
  assert.equal(s.seed, 42); assert.notEqual(s.at, 42); assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('restore carries on from a state, exactly where it left off', () => {
  const a = createIds(42); take(a, 7);
  const kept = JSON.parse(JSON.stringify(a.state())), next = take(a, 10);
  const b = createIds(999); b.restore(kept);
  assert.deepEqual(take(b, 10), next); assert.equal(b.state().seed, 42);
  a.restore(kept); assert.deepEqual(take(a, 10), next);      /* and the same source can be wound back */
});

test('a state with only a seed starts from the beginning', () => {
  const a = createIds(5), b = createIds(77); b.restore({ seed: 5 });
  assert.deepEqual(take(b, 5), take(a, 5));
});

test('with no seed given one is taken, a whole number, and differs from one time to the next', () => {
  const a = createIds(), b = createIds();
  for (const s of [a.state().seed, b.state().seed]) assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
  assert.notDeepEqual(take(a, 5), take(b, 5));
});

test('a seed is taken as a whole number from 0 to 2^32', () => {
  assert.equal(createIds(-1).state().seed, 4294967295); assert.equal(createIds(2 ** 32 + 5).state().seed, 5);
});
