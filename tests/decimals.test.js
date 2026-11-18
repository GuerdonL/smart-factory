/* decimals.js and backend.js: the backend's numbers on the page, and when they are asked for. Run with: node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { along, drawn, level, fromBackend, functional, wanted, merged, laid, noted, keyOf, NEEDS, ASKING } from '../decimals.js';
import { createBackend, keyFor, DELAY, EVERY } from '../backend.js';
import { digits, written, kind, storable, combine } from '../values.js';

test('a decimal is written with exactly 9 significant digits, so never as an exact number is', () => {
  assert.equal(digits(Math.fround(Math.E)), '2.71828175'); assert.equal(digits(0.4375), '0.437500000'); assert.equal(digits(Math.fround(0.1)), '0.100000001');
  assert.equal(digits(1), '1.00000000'); assert.equal(digits(0), '0.00000000'); assert.equal(digits(-0.5), '-0.500000000'); assert.equal(digits(1000000), '1000000.00'); assert.equal(digits(3), '3.00000000');
  assert.equal(digits(12345678.5), '12345678.5'); assert.equal(digits(123456789.123), '123456789.'); assert.equal(digits(-123456789), '-123456789.');      /* nine digits before the point: the point is still written */
  assert.equal(digits(1234567890), '1.23456789e9'); assert.equal(digits(Math.fround(Math.exp(31))), '2.90488498e13'); assert.equal(digits(1e-7), '1.00000000e-7'); assert.equal(digits(0.000001), '0.00000100000000');      /* large and small: its size apart */
  assert.equal(digits(Infinity), '∞'); assert.equal(digits(-Infinity), '-∞');
  for (const f of [1, -1, 2, 10, 1000000, 123456789, 1e9, 1e12, 0.5, 1e-9, 16777216]){ const text = digits(f); assert.equal(text.replace(/e.*$/, '').replace(/^-?0\.0*/, '').replace(/\D/g, '').length, 9, text); assert.doesNotMatch(text, /^-?\d+$/, text); }      /* always nine, and never the text of a whole number */
  assert.equal(written({ f: Math.fround(Math.E) }), '2.71828175'); assert.equal(written({ f: 1 }), '1.00000000'); assert.notEqual(written({ f: 1 }), written(1)); assert.equal(kind({ f: 1 }), 'decimal');
  assert.equal(written({ f: Math.fround(Math.E), exact: 'exp(1)' }), '2.71828175'); assert.equal(kind({ f: 1, exact: 'exp(0)' }), 'decimal');      /* one that carries the exact form it stands for is a decimal still */
  assert.equal(storable({ f: 0.5 }), false); assert.equal(storable({ f: 0.5, exact: 'exp(1)' }), false);      /* never kept in an entry or a file */
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
test('what is asked of the backend: what the browser does not work out, and an entry that holds exp, ln, tanh or erf; nothing it holds exactly', () => {
  const t = { cols: 2, rows: 1, colsName: null, rowsName: null }, sym = text => ({ sym: text });
  for (const yes of ['e', 'e^2', '1+e^2', 'log(2)', 'log(2)+log(3)', 'tanh(1)', 'erf(1)', 'erf(-2)', 'sqrt(e)', 'e^(-1)', '2^e', '2^(-erf(-2))', 'log(2)*log(3)^(-1)', '-e', '(1+e)^2', '2*e']) assert.equal(functional(sym(yes)), true, yes);      /* as the solver writes exp(1), exp(2), ln(2), … */
  for (const no of ['1+sqrt(2)', '-1+sqrt(2)', '2^(1/3)', 'sqrt(2)*sqrt(3)', '1-sqrt(2)', '3^(1/5)+1', '123456789012345678901234567890']) assert.equal(functional(sym(no)), false, no);      /* held exactly: never a decimal */
  for (const no of [1, 0, true, null, undefined, { n: 1, d: 2, k: 0 }, { n: 1, d: 1, k: 2 }, { err: 'exp(1)' }, { f: 1 }, 'e', { sym: 7 }]) assert.equal(functional(no), false);
  assert.equal(wanted({ type: t, deferred: true }), true); assert.equal(wanted({ type: t, deferred: true, backend: true }), true);
  assert.equal(wanted({ type: t, entries: { '1,1': 1, '2,1': sym('e') } }), true); assert.equal(wanted({ type: t, entries: { '1,1': sym('1+sqrt(2)'), '2,1': sym('log(2)') } }), true);
  assert.equal(wanted({ type: t, entries: { '1,1': sym('1+sqrt(2)'), '2,1': sym('-1+sqrt(2)') } }), false);      /* the boundary: symbolic, and exact: not asked for */
  assert.equal(wanted({ type: t, entries: { '1,1': 1, '2,1': { n: 1, d: 2, k: 0 } } }), false); assert.equal(wanted({ type: t, entries: {} }), false);
  assert.equal(wanted({ error: { code: 'loop' } }), false); assert.equal(wanted(null), false);
});
test('what is drawn of an answer: an exact entry stays exact, and a decimal carries the exact form it stands for', () => {
  const t = { cols: 3, rows: 1, colsName: null, rowsName: null }, E = 2.7182817459106445;
  const result = { cols: 3, rows: 1, cells: [[1, 1, 1], [2, 1, E], [3, 1, 2.4142136573791504]] };
  const exact = new Map([['1,1', 1], ['2,1', { sym: 'e' }], ['3,1', { sym: '1+sqrt(2)' }]]), answer = { type: t, entries: {} };
  const m = merged(answer, exact, result);
  assert.deepEqual([...m], [['1,1', 1], ['2,1', { f: E, exact: 'exp(1)' }], ['3,1', { sym: '1+sqrt(2)' }]]);      /* exp applied to 0 and 1: 1 stays the whole number, exp(1) is the decimal; 1+√2 stays as it is whatever the backend sent */
  assert.equal(written(m.get('2,1')), '2.71828175'); assert.equal(m.stale, undefined);
  assert.deepEqual([...exact], [['1,1', 1], ['2,1', { sym: 'e' }], ['3,1', { sym: '1+sqrt(2)' }]]); assert.notEqual(m, exact);      /* the evaluator's own entries are never changed: what reads them reads no decimal */
  assert.deepEqual([...merged({ type: t, deferred: true }, new Map(), result)], [['1,1', { f: 1 }], ['2,1', { f: E }], ['3,1', { f: 2.4142136573791504 }]]);      /* not worked out here: every entry is the backend's */
  assert.deepEqual([...merged(answer, exact, null)], [...exact]);      /* no answer yet: as it was */
  assert.deepEqual(merged(answer, exact, { cells: [[2, 1, { err: 'that has no value' }]] }).get('2,1'), { err: 'that has no value' });
  assert.equal(merged({ type: t, deferred: true }, new Map(), result, true).stale, true);
  assert.deepEqual([...merged({ type: t, deferred: true }, new Map(), { cells: [[1, 1, { err: 'that has no value' }], [2, 1, 'inf'], 'junk', [1, 1]] })], [['1,1', { err: 'that has no value' }], ['2,1', { f: Infinity }]]);
  assert.equal(noted(NEEDS), noted(NEEDS)); assert.equal(noted(NEEDS).note, 'needs the backend'); assert.equal(noted(NEEDS).size, 0); assert.equal(noted(ASKING).note, 'asking the backend');
  assert.notDeepEqual(keyOf(m), keyOf(merged(answer, exact, result, true))); assert.notDeepEqual(keyOf(noted(NEEDS)), keyOf(new Map())); assert.notDeepEqual(keyOf(noted(NEEDS)), keyOf(noted(ASKING))); assert.deepEqual(keyOf(null), []);
});
test('what is laid over an answer for drawing: the backend\'s numbers, or why there are none, and never silence', () => {
  const t = { cols: 2, rows: 1, colsName: null, rowsName: null }, got = { result: { cols: 2, rows: 1, cells: [[1, 1, 0.25], [2, 1, 0.75]] }, stale: false };
  const plain = new Map([['1,1', 1], ['2,1', { sym: '1+sqrt(2)' }]]), fn = new Map([['1,1', 1], ['2,1', { sym: 'e' }]]), none = new Map();
  /* held exactly: the very Map, whatever the backend is or says */
  for (const state of [{}, { there: true, got }, { there: false }, { there: true, why: 'x' }]) assert.equal(laid({ type: t, entries: { '1,1': 1, '2,1': { sym: '1+sqrt(2)' } } }, plain, state), plain);
  /* worked out here, with an entry it leaves symbolic: exact until the decimal comes, with no backend and where it gave none */
  const f = { type: t, entries: { '1,1': 1, '2,1': { sym: 'e' } } };
  for (const state of [{}, { there: null }, { there: false }, { there: true }, { there: true, why: 'the run took longer than 30 seconds and was stopped' }]) assert.equal(laid(f, fn, state), fn);
  assert.deepEqual([...laid(f, fn, { there: true, got })], [['1,1', 1], ['2,1', { f: 0.75, exact: 'exp(1)' }]]); assert.equal(laid(f, fn, { there: true, got: { ...got, stale: true } }).stale, true);
  /* not worked out here, made of noise or of a file: it needs the backend, and says so */
  const n = { type: t, deferred: true, backend: true };
  assert.equal(laid(n, none, { there: false }).note, NEEDS); assert.equal(laid(n, none, { there: true }).note, ASKING); assert.equal(laid(n, none, { there: null }), none);
  assert.equal(laid(n, none, { there: true, why: 'unknown entries in Keys' }).note, 'unknown entries in Keys'); assert.equal(laid(n, none, { there: true, why: 'unknown entries in Keys' }).size, 0);
  assert.deepEqual([...laid(n, none, { there: true, got })], [['1,1', { f: 0.25 }], ['2,1', { f: 0.75 }]]); assert.equal(laid(n, none, { there: true, got: { ...got, stale: true }, why: null }).stale, true);
  assert.equal(laid(n, none, { there: false, got }).note, NEEDS);      /* the backend is gone: what it said before is not shown as if it still said it */
  /* only too large: with no backend it is as the browser has it, its symbols; with one it is asked for like the rest */
  const big = { type: t, deferred: true };
  assert.equal(laid(big, none, { there: false }), none); assert.equal(laid(big, none, { there: true }).note, ASKING); assert.equal(laid(big, none, { there: true, why: 'a node of more than 16,000,000 entries' }).note, 'a node of more than 16,000,000 entries');
});

/* a backend that answers when it is told to, and a clock that moves when it is told to */
function world({ health = true } = {}){
  const sent = [], timers = [], said = []; let changes = 0, id = 0, time = 0, healths = 0, up = health;
  const reply = body => ({ ok: true, status: 200, json: async () => body });
  const fetch = (path, options) => { if (path === 'api/backend/health'){ healths++; return up === 'down' ? Promise.reject(new Error('no route')) : Promise.resolve(up ? reply({ ok: true, version: 1 }) : { ok: false, status: 503, json: async () => ({ error: 'none' }) }); }
    return new Promise((resolve, reject) => sent.push({ at: time, path, body: JSON.parse(options.body), answer: body => resolve(reply(body)), fail: e => reject(e) })); };
  const later = (fn, ms) => { timers.push({ id: ++id, fn, at: time + ms, ms }); return id; }, cancel = n => { const i = timers.findIndex(t => t.id === n); if (i >= 0) timers.splice(i, 1); };
  const b = createBackend({ fetch, later, cancel, changed: () => changes++, told: why => said.push(...why), project: () => 'mine' });
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  /* the clock moves on by ms: every timer that falls due is run at its own time, in order */
  const pass = async ms => { const until = time + ms;
    for (;;){ const due = timers.filter(t => t.at <= until).sort((a, b) => a.at - b.at || a.id - b.id)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); time = due.at; due.fn(); await settle(); }
    time = until; await settle(); };
  const runs = () => timers.filter(t => t.ms === DELAY);
  return { b, sent, timers, runs, pass, settle, said, changes: () => changes, healths: () => healths, now: () => time, set: h => { up = h; } };
}
const cells = [[1, 1]], res = v => ({ cols: 1, rows: 1, cells: [[1, 1, v]], min: v, max: v, mean: v });
test('the backend is asked half a second after the last change, for everything wanted at once', async () => {
  const w = world(), g = { nodes: {} }; assert.equal(DELAY, 500);
  assert.equal(w.b.available(), null); assert.equal(await w.b.health(), true); assert.equal(w.b.available(), true);
  assert.equal(w.b.ask(g, 'a', null, cells), null); assert.equal(w.runs().length, 1); assert.equal(w.sent.length, 0);      /* asking returns at once, and nothing is sent yet */
  await w.pass(300); assert.equal(w.sent.length, 0);
  assert.equal(w.b.ask(g, 'b', { cells: [{ x: 1 }] }, cells), null); assert.equal(w.runs().length, 1); assert.equal(w.runs()[0].at, 800);      /* asked again at 300: the half second starts again */
  w.b.ask(g, 'a', null, cells); assert.equal(w.runs()[0].at, 800); assert.equal(w.b.pending(), 2);      /* what is already wanted starts nothing again */
  await w.pass(200); assert.equal(w.sent.length, 0);      /* 500: half a second after the first change, and not yet after the last */
  await w.pass(299); assert.equal(w.sent.length, 0);      /* 799 */
  await w.pass(1); assert.equal(w.sent.length, 1); assert.equal(w.sent[0].at, 800);      /* 800: half a second after the last change, to the millisecond */
  assert.deepEqual(w.sent[0].body, { graph: g, want: [{ node: 'a', as: 'a', cells }, { node: 'b', as: keyFor('b', { cells: [{ x: 1 }] }), cells, binding: { cells: [{ x: 1 }] } }], tick: 0, project: 'mine' });
  w.sent[0].answer({ results: { a: res(0.5) }, errors: { [keyFor('b', { cells: [{ x: 1 }] })]: 'unknown entries in Keys' } }); await w.settle();
  assert.equal(w.changes() >= 1, true); assert.deepEqual(w.said, ['unknown entries in Keys']);      /* why there are no numbers is told when it arrives */
  assert.deepEqual(w.b.ask(g, 'a', null, cells), { result: res(0.5), stale: false }); assert.equal(w.b.ask(g, 'b', { cells: [{ x: 1 }] }, cells), null);
  assert.equal(w.b.problem(g, 'b', { cells: [{ x: 1 }] }), 'unknown entries in Keys'); assert.equal(w.b.problem(g, 'a', null), null); assert.equal(w.b.pending(), 0);
  assert.equal(w.runs().length, 0); w.b.ask(g, 'a', null, cells); assert.equal(w.runs().length, 0);      /* what is answered is not asked for again */
  w.b.ask(g, 'c', null, cells); await w.pass(499); assert.equal(w.sent.length, 1); await w.pass(1); assert.deepEqual(w.sent[1].body.want.map(x => x.node), ['c']);      /* something newly drawn of the same graph: that alone, half a second on */
});
test('every change starts the half second again: a run of changes is one request, after the last of them', async () => {
  const w = world(); await w.b.health(); const t0 = w.now();
  for (let i = 0; i < 6; i++){ w.b.ask({ n: i }, 'a', null, cells); await w.pass(400); }      /* a new graph every 400 ms: never half a second of quiet */
  assert.equal(w.sent.length, 0); await w.pass(99); assert.equal(w.sent.length, 0);
  await w.pass(1); assert.equal(w.sent.length, 1); assert.equal(w.sent[0].at - t0, 5 * 400 + 500); assert.deepEqual(w.sent[0].body.graph, { n: 5 });      /* the last graph, and only that */
});
test('an answer for an older graph is dropped, and the previous values are given as stale while the new are waited for', async () => {
  const w = world(), g1 = { n: 1 }, g2 = { n: 2 }, g3 = { n: 3 }; await w.b.health();
  w.b.ask(g1, 'a', null, cells); await w.pass(500); w.sent[0].answer({ results: { a: res(1) }, errors: {} }); await w.settle();
  assert.deepEqual(w.b.ask(g2, 'a', null, cells), { result: res(1), stale: true });      /* the project changed: what was there, dimmed */
  await w.pass(500); assert.equal(w.sent.length, 2);
  assert.deepEqual(w.b.ask(g3, 'a', null, cells), { result: res(1), stale: true });      /* and changed again before the answer came */
  const before = w.changes(); w.sent[1].answer({ results: { a: res(2) }, errors: {} }); await w.settle();
  assert.equal(w.changes(), before); assert.deepEqual(w.b.ask(g3, 'a', null, cells), { result: res(1), stale: true });      /* the answer for g2 is not g3's: dropped */
  await w.pass(500); w.sent[2].answer({ results: { a: res(3) }, errors: {} }); await w.settle();
  assert.deepEqual(w.b.ask(g3, 'a', null, cells), { result: res(3), stale: false });
  assert.equal(w.b.ask(g3, 'other', null, cells), null);      /* never drawn before: nothing to dim */
});
test('a failure of a run for an older graph is dropped too: it is no reason for what is asked now', async () => {
  const w = world(), g1 = { n: 1 }, g2 = { n: 2 }; await w.b.health();
  w.b.ask(g1, 'a', null, cells); await w.pass(500); assert.equal(w.sent.length, 1);
  w.b.ask(g2, 'a', null, cells); const before = w.changes(), healths = w.healths();
  w.sent[0].fail(new Error('the network is down')); await w.settle();
  assert.equal(w.b.problem(g2, 'a', null), null); assert.equal(w.changes(), before); assert.deepEqual(w.said, []); assert.equal(w.healths(), healths); assert.equal(w.b.pending(), 1);
  await w.pass(500); assert.equal(w.sent.length, 2); w.sent[1].answer({ results: { a: res(2) }, errors: {} }); await w.settle();
  assert.deepEqual(w.b.ask(g2, 'a', null, cells), { result: res(2), stale: false });
});
test('what is drawn in one place keeps its previous values, dimmed, though its node is another (a noise block given a new seed)', async () => {
  const w = world(), g1 = { n: 1 }, g2 = { n: 2 }; await w.b.health();
  w.b.ask(g1, 'noise(0)', null, cells, 'block N'); w.b.ask(g1, 'other', null, cells, 'block O'); await w.pass(500); w.sent[0].answer({ results: { 'noise(0)': res(0.25), other: res(0.5) }, errors: {} }); await w.settle();
  assert.deepEqual(w.b.ask(g2, 'noise(7)', null, cells, 'block N'), { result: res(0.25), stale: true });      /* the same block: what it showed, until the new numbers come */
  assert.equal(w.b.ask(g2, 'noise(7)', null, cells, 'block M'), null); assert.equal(w.b.ask(g2, 'noise(0)', null, cells), null);      /* another place has nothing of it */
  await w.pass(500); w.sent[1].answer({ results: { 'noise(7)': res(0.75) }, errors: {} }); await w.settle();
  assert.deepEqual(w.b.ask(g2, 'noise(7)', null, cells, 'block N'), { result: res(0.75), stale: false });
});
test('with no backend nothing is asked, and a failure is said', async () => {
  for (const health of [false, 'down']){ const w = world({ health }); assert.equal(await w.b.health(), false); assert.equal(w.b.available(), false);
    assert.equal(w.b.ask({}, 'a', null, cells), null); assert.equal(w.runs().length, 0); assert.equal(w.sent.length, 0); assert.deepEqual(w.said, []); }
  const w = world(), g = {}; w.b.ask(g, 'a', null, cells); assert.equal(w.timers.length, 0);      /* before health is known nothing is sent */
  await w.b.health(); assert.equal(w.runs().length, 1);      /* and once it is, what was wanted is asked for */
  await w.pass(500); w.sent[0].fail(new Error('the network is down')); await w.settle();
  assert.equal(w.b.problem(g, 'a', null), 'the backend could not be asked: the network is down'); assert.equal(w.b.ask(g, 'a', null, cells), null); assert.deepEqual(w.said, ['the backend could not be asked: the network is down']);
  const v = world(), h = {}; await v.b.health(); v.b.ask(h, 'a', null, cells); await v.pass(500); v.sent[0].answer({ results: {}, errors: { '*': 'the run took longer than 30 seconds and was stopped' } }); await v.settle();
  assert.equal(v.b.problem(h, 'a', null), 'the run took longer than 30 seconds and was stopped'); assert.deepEqual(v.said, ['the run took longer than 30 seconds and was stopped']);
  await v.pass(60000); assert.equal(v.sent.length, 1); assert.equal(v.b.problem(h, 'a', null), 'the run took longer than 30 seconds and was stopped');      /* a refusal stands while the backend does: the same run is not sent again */
  const a = world(); a.b.absent(); assert.equal(a.b.available(), false); assert.equal(await a.b.health(), false); await a.pass(60000); assert.equal(a.healths(), 0);      /* no server to ask: never asked */
});
test('whether there is a backend is asked again: after a failure at once, and every so often, so one started or stopped later is noticed', async () => {
  assert.equal(EVERY, 15000);
  const w = world({ health: false }), g = {}; assert.equal(await w.b.health(), false); assert.equal(w.healths(), 1);
  await w.pass(14999); assert.equal(w.healths(), 1); await w.pass(1); assert.equal(w.healths(), 2); assert.equal(w.b.available(), false);      /* asked again a quarter of a minute on */
  w.set(true); const before = w.changes(); await w.pass(15000); assert.equal(w.healths(), 3); assert.equal(w.b.available(), true); assert.equal(w.changes() > before, true);      /* started after the page loaded: noticed, and the page is told to draw */
  assert.equal(w.b.ask(g, 'a', null, cells), null); await w.pass(500); assert.equal(w.sent.length, 1); w.sent[0].answer({ results: { a: res(1) }, errors: {} }); await w.settle();
  /* stopped: the next run fails, health is asked at once (not a quarter of a minute later), and it is said */
  const g2 = {}; w.b.ask(g2, 'a', null, cells); await w.pass(500); assert.equal(w.sent.length, 2); w.set('down'); const asked = w.healths();
  w.sent[1].fail(new Error('Failed to fetch')); await w.settle();
  assert.equal(w.healths(), asked + 1); assert.equal(w.b.available(), false); assert.deepEqual(w.said, ['the backend could not be asked: Failed to fetch', 'the backend has stopped answering']);
  assert.equal(w.b.ask(g2, 'a', null, cells), null); await w.pass(5000); assert.equal(w.sent.length, 2);      /* gone: nothing is sent */
  /* back: what had failed is asked for again without anything being changed */
  w.set(true); await w.pass(15000); assert.equal(w.b.available(), true); assert.equal(w.b.problem(g2, 'a', null), null);
  await w.pass(500); assert.equal(w.sent.length, 3); assert.deepEqual(w.sent[2].body.want.map(x => x.node), ['a']); w.sent[2].answer({ results: { a: res(2) }, errors: {} }); await w.settle();
  assert.deepEqual(w.b.ask(g2, 'a', null, cells), { result: res(2), stale: false });
  /* the server says the backend is gone by refusing the whole run: health is asked at once then too */
  const g3 = {}; w.b.ask(g3, 'a', null, cells); await w.pass(500); w.set(false); const n = w.healths();
  w.sent[3].answer({ results: {}, errors: { '*': 'the backend is not answering (Connection refused)' } }); await w.settle();
  assert.equal(w.healths(), n + 1); assert.equal(w.b.available(), false);
  /* a run that could not be asked while the backend says it is there is tried again each time it says so */
  const v = world(), h = {}; await v.b.health(); v.b.ask(h, 'a', null, cells); await v.pass(500); v.sent[0].fail(new Error('reset')); await v.settle();
  assert.equal(v.b.available(), true); assert.equal(v.b.problem(h, 'a', null), 'the backend could not be asked: reset'); await v.pass(14000); assert.equal(v.sent.length, 1);      /* not at once, over and over */
  await v.pass(1000); assert.equal(v.b.problem(h, 'a', null), null); await v.pass(500); assert.equal(v.sent.length, 2); assert.deepEqual(v.sent[1].body.want.map(x => x.node), ['a']);
});

/* The page itself (smart-factory.js) is not a pure module and is not run here, but one rule of it is held by reading
   it: the backend's numbers are laid over the evaluator's only where the page draws. Each name below reads them, and
   may be called only from the functions listed for it: the ones that draw (write: a definition space's equation;
   paint: results, faces and the panel; copiesOf and writtenOn: a tile's copies; outputOf: an arrow's output as drawn),
   and one another. Everything else the page works out reads valuesOf, which never calls any of them. */
test('on the page, only what draws reads the backend\'s numbers', () => {
  const lines = readFileSync(new URL('../smart-factory.js', import.meta.url), 'utf8').split('\n');
  const may = { 'backend.ask(': ['laidAt', 'unshown'], 'backend.problem(': ['laidAt', 'unshown'], 'laidAt(': ['laidAt', 'laidOf', 'pieceLaid', 'outputLaidNow'], 'laidOf(': ['laidOf', 'faceLaid', 'write', 'paint', 'copiesOf', 'writtenOn'],
    'pieceLaid(': ['pieceLaid', 'paint'], 'faceLaid(': ['faceLaid', 'paint'], 'outputLaid(': ['outputLaid', 'outputOf'], 'outputLaidNow(': ['outputLaid', 'outputLaidNow'], '.asDrawn': ['write', 'paint', 'outputOf'], 'unshown(': ['unshown', 'paint', 'outputOf'] };
  const seen = Object.fromEntries(Object.keys(may).map(k => [k, new Set()])); let top = null;
  for (const line of lines){ const m = /^(?:async )?function (\w+)|^(?:const|let) (\w+)\b/.exec(line); if (m) top = m[1] || m[2];      /* the function or constant, at the start of a line, that this line is in */
    for (const name of line.match(/\b(?:laidAt|laidOf|pieceLaid|outputLaid|outputLaidNow|faceLaid|backend\.(?:ask|problem)|unshown)\(|\.asDrawn\b/g) || []) seen[name].add(top); }
  for (const [name, by] of Object.entries(seen)){ assert.ok(by.size > 0, name + ' is still in the page'); for (const fn of by) assert.ok(may[name].includes(fn), `${fn} reads ${name} and does not draw`); }
  /* and what the exact readers are made of names none of them */
  const body = name => { const at = lines.findIndex(l => new RegExp('^(?:function|const) ' + name + '\\b').test(l)); assert.ok(at >= 0, name); let end = at + 1; while (end < lines.length && !/^(?:async )?function \w+|^(?:const|let) \w+|^\/\*/.test(lines[end])) end++; return lines.slice(at, end).join('\n'); };
  for (const exact of ['answerOf', 'valuesOf', 'evaluated', 'held', 'scalarOf', 'rootSide', 'sideLength', 'measured', 'lookupFor', 'attrValue', 'cells', 'gather', 'derived', 'rangeValues']) assert.doesNotMatch(body(exact), /laid|backend\./i, exact);
});
