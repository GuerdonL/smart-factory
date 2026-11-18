/* The backend's fixtures (backend/fixtures) are made from graph.js and evaluate.js by backend/fixtures/generate.mjs.
   This holds the files to what that script makes now, so the backend is never tested against answers that have
   fallen behind the code. If it fails: node backend/fixtures/generate.mjs, and run the backend's tests.
   Run with: node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixtures } from '../backend/fixtures/generate.mjs';

const kept = name => JSON.parse(readFileSync(new URL('../backend/fixtures/' + name, import.meta.url), 'utf8'));
test('the backend\'s fixtures are what graph.js and evaluate.js make now', () => {
  const made = fixtures();
  assert.deepEqual(kept('graphs.json'), made.graphs); assert.deepEqual(kept('mutations.json'), made.mutations);
});
test('the fixtures hold every kind of answer, and changed graphs of both kinds', () => {
  const graphs = kept('graphs.json'), mutations = kept('mutations.json'), answers = graphs.flatMap(g => [...Object.values(g.nodes), ...g.bound.map(b => b.answer)]);
  for (const kind of ['rows', 'error', 'deferred']) assert.ok(answers.filter(a => kind in a).length >= 10, kind);
  const values = answers.flatMap(a => (a.rows || []).flat());
  for (const v of ['inf', '-inf', 'err', null]) assert.ok(values.includes(v), String(v));
  assert.ok(values.some(v => typeof v === 'number' && !Number.isInteger(v)));
  assert.ok(mutations.filter(m => m.valid).length > 500 && mutations.filter(m => !m.valid).length > 3000);
});
