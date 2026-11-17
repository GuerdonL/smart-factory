/* sources.js: blocks that have values at any size without storing them. Run with: node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, kept, faceOf, entry, values, typable, holds } from '../sources.js';

const rows = (kind, cols, rows_) => Array.from({ length: rows_ }, (_, r) => Array.from({ length: cols }, (_, c) => values(kind, cols, rows_).get((c + 1) + ',' + (r + 1))).join(' '));

test('the three kinds, in the order they are offered, each with what is written on its face', () => {
  assert.deepEqual(SOURCES.map(s => [s.kind, s.label, s.face]), [['zeros', 'Zeros', '0'], ['ones', 'Ones', '1'], ['identity', 'Identity', 'I']]);
  assert.equal(faceOf('zeros'), '0'); assert.equal(faceOf('ones'), '1'); assert.equal(faceOf('identity'), 'I');
  assert.equal(faceOf(null), null); assert.equal(faceOf('noise'), null);
});

test('zeros is 0 and ones is 1, everywhere', () => {
  assert.deepEqual(rows('zeros', 3, 2), ['0 0 0', '0 0 0']);
  assert.deepEqual(rows('ones', 2, 3), ['1 1', '1 1', '1 1']);
  assert.equal(entry('zeros', 400, 9), 0); assert.equal(entry('ones', 1, 1), 1);
});

test('identity is 1 where the column is the row and 0 elsewhere: 3 by 3 has three ones, 5 by 5 has five', () => {
  assert.deepEqual(rows('identity', 3, 3), ['1 0 0', '0 1 0', '0 0 1']);
  const ones = n => [...values('identity', n, n).values()].filter(v => v === 1).length;
  assert.equal(ones(3), 3); assert.equal(ones(5), 5);
  assert.equal(values('identity', 5, 5).get('5,5'), 1); assert.equal(values('identity', 5, 5).get('5,4'), 0);
});

test('identity need not be square: the ones run down the diagonal as far as the shorter side', () => {
  assert.deepEqual(rows('identity', 4, 2), ['1 0 0 0', '0 1 0 0']);
  assert.deepEqual(rows('identity', 2, 3), ['1 0', '0 1', '0 0']);
  assert.deepEqual(rows('identity', 1, 1), ['1']);
  assert.deepEqual(rows('identity', 1, 3), ['1', '0', '0']);
});

test('resizing changes how many entries there are, never what they are', () => {
  const small = values('identity', 2, 2), large = values('identity', 4, 3);
  assert.equal(small.size, 4); assert.equal(large.size, 12);
  for (const [key, v] of small) assert.equal(large.get(key), v);
});

test('a place that is no entry, and a kind that is no source, have no value', () => {
  assert.equal(entry('identity', 0, 1), undefined); assert.equal(entry('zeros', 1, 0), undefined); assert.equal(entry('ones', 1.5, 1), undefined);
  assert.equal(entry('noise', 1, 1), undefined); assert.equal(entry(null, 1, 1), undefined);
  assert.equal(values('noise', 2, 2).size, 0); assert.equal(values('zeros', 0, 2).size, 0); assert.equal(values('zeros', 2, 1.5).size, 0);
});

test('only a kind this program has is kept: anything else read from a file is no source', () => {
  assert.equal(kept('zeros'), 'zeros'); assert.equal(kept('ones'), 'ones'); assert.equal(kept('identity'), 'identity');
  for (const other of [null, undefined, '', 'Zeros', 'noise', { noise: { seed: 1 } }, { file: 'data/a.csv' }, 1, true]) assert.equal(kept(other), null);
});

test('entries cannot be typed into a source, and nothing stands in its matrix; any other block takes both', () => {
  assert.deepEqual(typable(null, 'Keys'), { ok: true }); assert.deepEqual(holds(null, 'Keys'), { ok: true });
  assert.deepEqual(typable('noise', 'Keys'), { ok: true });      /* not a source here */
  assert.match(typable('zeros', 'Bias').refused, /^Bias is zeros: a source stores no entries/);
  assert.match(typable('identity', 'Eye').refused, /^Eye is an identity: a source/);
  assert.match(holds('ones', 'One').refused, /^One is ones: a source is defined by its kind alone/);
  assert.match(typable('zeros', '').refused, /^It is zeros/);
});
