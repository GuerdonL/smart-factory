/* decimals.js and backend.js: the backend's numbers on the page, and when they are asked for. Run with: node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { along, drawn, level, fromBackend, wanted, merged, noted, keyOf, NEEDS } from '../decimals.js';
import { createBackend, keyFor, DELAY } from '../backend.js';
import { digits, written, kind, storable, combine } from '../values.js';

test('a decimal is written to 9 significant digits, and no digit is added', () => {
  assert.equal(digits(Math.fround(Math.E)), '2.71828175'); assert.equal(digits(0.4375), '0.4375'); assert.equal(digits(Math.fround(0.1)), '0.100000001');
  assert.equal(digits(1), '1'); assert.equal(digits(0), '0'); assert.equal(digits(-0.5), '-0.5'); assert.equal(digits(123456789.123), '123456789'); assert.equal(digits(1e-7), '1e-7');
  assert.equal(digits(Infinity), '∞'); assert.equal(digits(-Infinity), '-∞');
  assert.equal(written({ f: Math.fround(Math.E) }), '2.71828175'); assert.equal(kind({ f: 1 }), 'decimal');
  assert.equal(storable({ f: 0.5 }), false);      /* never kept in an entry or a file */
  assert.deepEqual(combine('+', { f: 0.5 }, 1), { f: 1.5 }); assert.equal(combine('+', { f: 0.5 }, null), null);      /* a decimal with anything is a decimal; unknown wins */
});
test('which entries are drawn, and so asked for: all of a side up to eight, then the first three and the last', () => {
  assert.deepEqual(along(3).map(e => e.i), [1, 2, 3]); assert.deepEqual(along(8).length, 8); assert.deepEqual(along(9).map(e => e && e.i), [1, 2, 3, null, 9]);
  assert.deepEqual(along(2, 'embed').map(e => e && [e.i, !!e.ghost]), [[1, false], [2, true], [3, true], null, [2, false]]);
  assert.equal(drawn({ cols: 4, rows: 4 }).length, 16); assert.equal(drawn({ cols: 8, rows: 8 }).length, 64);
  assert.deepEqual(drawn({ cols: 768, rows: 2 }), [[1, 1], [2, 1], [3, 1], [768, 1], [1, 2], [2, 2], [3, 2], [768, 2]]);
  assert.equal(drawn({ cols: 768, rows: 768 }).length, 16);      /* never a whole large matrix */
  assert.equal(drawn({ cols: 1e9, rows: 1e9 }).length, 16);
  for (const type of [{ cols: 5, rows: 2, colsName: 'k', rowsName: null }, { cols: 20, rows: 9, colsName: 'k', rowsName: 'c' }, { cols: 2, rows: 1, colsName: 'k', rowsName: null }]){      /* what a named side shows is among them */
    const asked = new Set(drawn(type).map(c => c.join())); for (const c of along(type.cols, type.colsName)) for (const r of along(type.rows, type.rowsName)) if (c && r && !c.ghost && !r.ghost) assert.ok(asked.has(c.i + ',' + r.i)); }
  assert.deepEqual(drawn(null), []); assert.deepEqual(drawn({ cols: 0, rows: 3 }), []);
});
test('a decimal\'s square: black at 0 or below, white at 1 or above, grey between', () => {
  assert.equal(level(0), 0); assert.equal(level(-3), 0); assert.equal(level(-Infinity), 0); assert.equal(level(1), 1); assert.equal(level(2.7), 1); assert.equal(level(Infinity), 1);
  assert.equal(level(0.25), 0.25); assert.equal(level(0.999), 0.999); assert.equal(level(1e-9), 1e-9); assert.equal(level(NaN), 0);
});
test('the backend\'s values as values here', () => {
  assert.deepEqual(fromBackend(0.5), { f: 0.5 }); assert.deepEqual(fromBackend(0), { f: 0 }); assert.deepEqual(fromBackend('inf'), { f: Infinity }); assert.deepEqual(fromBackend('-inf'), { f: -Infinity });
  assert.deepEqual(fromBackend({ err: 'that has no value' }), { err: 'that has no value' });
  for (const no of [null, undefined, 'x', true, NaN, Infinity, {}, [], { f: 1 }]) assert.equal(fromBackend(no), null);
});
test('what is asked of the backend, and what is drawn of its answer: an exact entry stays exact', () => {
  const t = { cols: 2, rows: 1, colsName: null, rowsName: null };
  assert.equal(wanted({ type: t, deferred: true }), true); assert.equal(wanted({ type: t, deferred: true, backend: true }), true);
  assert.equal(wanted({ type: t, entries: { '1,1': 1, '2,1': { sym: 'exp(1)' } } }), true);
  assert.equal(wanted({ type: t, entries: { '1,1': 1, '2,1': { n: 1, d: 2, k: 0 } } }), false); assert.equal(wanted({ type: t, entries: {} }), false);
  assert.equal(wanted({ error: { code: 'loop' } }), false); assert.equal(wanted(null), false);
  const result = { cols: 2, rows: 1, cells: [[1, 1, 1], [2, 1, 2.7182817459106445]] };
  const exact = new Map([['1,1', 1], ['2,1', { sym: 'exp(1)' }]]);
  const m = merged({ type: t, entries: {} }, exact, result);
  assert.deepEqual([...m], [['1,1', 1], ['2,1', { f: 2.7182817459106445 }]]);      /* exp applied to 0 and 1: 1 stays the whole number, exp(1) is the decimal */
  assert.equal(written(m.get('2,1')), '2.71828175'); assert.equal(m.stale, undefined);
  assert.deepEqual([...merged({ type: t, deferred: true }, new Map(), result)], [['1,1', { f: 1 }], ['2,1', { f: 2.7182817459106445 }]]);      /* not worked out here: every entry is the backend's */
  assert.deepEqual([...merged({ type: t, entries: {} }, exact, null)], [...exact]);      /* no answer yet: as it was */
  assert.equal(merged({ type: t, deferred: true }, new Map(), result, true).stale, true);
  assert.deepEqual([...merged({ type: t, deferred: true }, new Map(), { cells: [[1, 1, { err: 'that has no value' }], [2, 1, 'inf'], 'junk', [1, 1]] })], [['1,1', { err: 'that has no value' }], ['2,1', { f: Infinity }]]);
  assert.equal(noted(NEEDS), noted(NEEDS)); assert.equal(noted(NEEDS).note, 'needs the backend'); assert.equal(noted(NEEDS).size, 0);
  assert.notDeepEqual(keyOf(m), keyOf(merged({ type: t, entries: {} }, exact, result, true))); assert.notDeepEqual(keyOf(noted(NEEDS)), keyOf(new Map())); assert.deepEqual(keyOf(null), []);
});

/* a backend that answers when it is told to, and a clock that moves when it is told to */
function world({ health = true } = {}){
  const sent = [], timers = []; let changes = 0, id = 0;
  const reply = body => ({ ok: true, status: 200, json: async () => body });
  const fetch = (path, options) => { if (path === 'api/backend/health') return health === 'down' ? Promise.reject(new Error('no route')) : Promise.resolve(health ? reply({ ok: true, version: 1 }) : { ok: false, status: 503, json: async () => ({ error: 'none' }) });
    return new Promise((resolve, reject) => sent.push({ path, body: JSON.parse(options.body), answer: body => resolve(reply(body)), fail: e => reject(e) })); };
  const later = (fn, ms) => { timers.push({ id: ++id, fn, ms }); return id; }, cancel = n => { const i = timers.findIndex(t => t.id === n); if (i >= 0) timers.splice(i, 1); };
  const b = createBackend({ fetch, later, cancel, changed: () => changes++, project: () => 'mine' });
  const tick = async () => { for (const t of timers.splice(0)) t.fn(); await settle(); }, settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  return { b, sent, timers, tick, settle, changes: () => changes };
}
const cells = [[1, 1]], res = v => ({ cols: 1, rows: 1, cells: [[1, 1, v]], min: v, max: v, mean: v });
test('the backend is asked half a second after the last change, for everything wanted at once', async () => {
  const w = world(), g = { nodes: {} }; assert.equal(DELAY, 500);
  assert.equal(w.b.available(), null); assert.equal(await w.b.health(), true); assert.equal(w.b.available(), true);
  assert.equal(w.b.ask(g, 'a', null, cells), null); assert.equal(w.timers.length, 1); assert.equal(w.timers[0].ms, 500); assert.equal(w.sent.length, 0);      /* asking returns at once, and nothing is sent yet */
  assert.equal(w.b.ask(g, 'b', { cells: [{ x: 1 }] }, cells), null); assert.equal(w.timers.length, 1);      /* asked again: the half second starts again */
  w.b.ask(g, 'a', null, cells); assert.equal(w.b.pending(), 2);
  await w.tick(); assert.equal(w.sent.length, 1);
  assert.deepEqual(w.sent[0].body, { graph: g, want: [{ node: 'a', as: 'a', cells }, { node: 'b', as: keyFor('b', { cells: [{ x: 1 }] }), cells, binding: { cells: [{ x: 1 }] } }], tick: 0, project: 'mine' });
  w.sent[0].answer({ results: { a: res(0.5) }, errors: { [keyFor('b', { cells: [{ x: 1 }] })]: 'unknown entries in Keys' } }); await w.settle();
  assert.equal(w.changes() >= 1, true);
  assert.deepEqual(w.b.ask(g, 'a', null, cells), { result: res(0.5), stale: false }); assert.equal(w.b.ask(g, 'b', { cells: [{ x: 1 }] }, cells), null);
  assert.equal(w.b.problem(g, 'b', { cells: [{ x: 1 }] }), 'unknown entries in Keys'); assert.equal(w.b.problem(g, 'a', null), null); assert.equal(w.b.pending(), 0);
  assert.equal(w.timers.length, 0); w.b.ask(g, 'a', null, cells); assert.equal(w.timers.length, 0);      /* what is answered is not asked for again */
  w.b.ask(g, 'c', null, cells); await w.tick(); assert.deepEqual(w.sent[1].body.want.map(x => x.node), ['c']);      /* something newly drawn of the same graph: that alone */
});
test('an answer for an older graph is dropped, and the previous values are given as stale while the new are waited for', async () => {
  const w = world(), g1 = { n: 1 }, g2 = { n: 2 }, g3 = { n: 3 }; await w.b.health();
  w.b.ask(g1, 'a', null, cells); await w.tick(); w.sent[0].answer({ results: { a: res(1) }, errors: {} }); await w.settle();
  assert.deepEqual(w.b.ask(g2, 'a', null, cells), { result: res(1), stale: true });      /* the project changed: what was there, dimmed */
  await w.tick(); assert.equal(w.sent.length, 2);
  assert.deepEqual(w.b.ask(g3, 'a', null, cells), { result: res(1), stale: true });      /* and changed again before the answer came */
  const before = w.changes(); w.sent[1].answer({ results: { a: res(2) }, errors: {} }); await w.settle();
  assert.equal(w.changes(), before); assert.deepEqual(w.b.ask(g3, 'a', null, cells), { result: res(1), stale: true });      /* the answer for g2 is not g3's: dropped */
  await w.tick(); w.sent[2].answer({ results: { a: res(3) }, errors: {} }); await w.settle();
  assert.deepEqual(w.b.ask(g3, 'a', null, cells), { result: res(3), stale: false });
  assert.equal(w.b.ask(g3, 'other', null, cells), null);      /* never drawn before: nothing to dim */
});
test('with no backend nothing is asked, and a failure is said', async () => {
  for (const health of [false, 'down']){ const w = world({ health }); assert.equal(await w.b.health(), false); assert.equal(w.b.available(), false);
    assert.equal(w.b.ask({}, 'a', null, cells), null); assert.equal(w.timers.length, 0); assert.equal(w.sent.length, 0); }
  const w = world(), g = {}; w.b.ask(g, 'a', null, cells); assert.equal(w.timers.length, 0);      /* before health is known nothing is sent */
  await w.b.health(); assert.equal(w.timers.length, 1);      /* and once it is, what was wanted is asked for */
  await w.tick(); w.sent[0].fail(new Error('the network is down')); await w.settle();
  assert.equal(w.b.problem(g, 'a', null), 'the backend could not be asked: the network is down'); assert.equal(w.b.ask(g, 'a', null, cells), null);
  const v = world(), h = {}; await v.b.health(); v.b.ask(h, 'a', null, cells); await v.tick(); v.sent[0].answer({ results: {}, errors: { '*': 'the run took longer than 30 seconds and was stopped' } }); await v.settle();
  assert.equal(v.b.problem(h, 'a', null), 'the run took longer than 30 seconds and was stopped');
});
