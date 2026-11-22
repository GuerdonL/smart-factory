/* Running, .backend, checkpoints, and server/backend version checks (phase 9E). Run with: node --test */
import './solver.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackend, OLDER, OLDER_SERVER } from '../backend.js';
import { build, validate } from '../graph.js';
import { read, write, FORMAT } from '../project.js';
import { BACKEND, BACKEND_SETTINGS } from '../system.js';
import { zip, unzip } from '../zip.js';

const mkHeaders = map => ({ get: k => map[k.toLowerCase()] ?? null });

test('backend.js: play, poll, stop, ceiling notice, stream ended, and pass timeout', async () => {
  const calls = [], waits = [], told = [], ticks = [];
  let pollIdx = 0;
  const polls = [
    { tick: 0, results: { n: { cols: 1, rows: 1, cells: [[1, 1, 0]], min: 0, max: 0, mean: 0, truth: false } }, errors: {}, ended: [], running: true },
    { tick: 1, results: { n: { cols: 1, rows: 1, cells: [[1, 1, 3]], min: 3, max: 3, mean: 3, truth: true } }, errors: {}, ended: [], running: true },
    { tick: 2, results: {}, errors: { n: 'it ended' }, codes: { n: { code: 'ended', node: 's', tick: 2 } }, ended: ['s'], running: false },
  ];
  const fetch = (path, options) => {
    calls.push({ path, body: options ? JSON.parse(options.body) : null });
    if (path === 'api/backend/health') return Promise.resolve({ ok: true, headers: mkHeaders({ 'x-smart-factory-play': '1' }), json: async () => ({ ok: true, version: 6, play: true, ceiling: 10 }) });
    if (path === 'api/backend/play') return Promise.resolve({ ok: true, json: async () => ({ run: 'a'.repeat(16), seconds: 10, ceiling: 10, capped: true }) });
    if (path.startsWith('api/backend/play/')) return Promise.resolve({ ok: true, json: async () => polls[pollIdx++] });
    if (path === 'api/backend/stop') return Promise.resolve({ ok: true, json: async () => ({ tick: 1 }) });
    if (path === 'api/backend/checkpoint') return Promise.resolve({ ok: true, json: async () => ({ ok: true, written: 1, tick: JSON.parse(options.body).tick }) });
    return Promise.resolve({ ok: true, json: async () => ({ results: {}, errors: {} }) });
  };
  let curTick = 0;
  const b = createBackend({ fetch, later: fn => { waits.push(fn); return waits.length; }, cancel: id => { waits[id - 1] = () => {}; },
    version: 6, requirePlay: true, project: () => 'running', tick: () => curTick,
    onTick: t => { curTick = t; ticks.push(t); }, told: why => told.push(...why),
    ended: (g, node, at) => `The stream x ended at tick ${at}` });
  assert.equal(await b.health(), true);
  assert.equal(b.playable(), true);
  assert.equal(b.serverOlder(), false);
  assert.equal(b.ceiling(), 10);
  const g = { version: 6, nodes: {}, functions: {}, spaces: {}, blocks: {} };
  b.ask(g, 'n', null, [[1, 1]], 'slot-n');
  assert.equal(await b.play(g, { from: 0, seconds: 30 }), true);
  assert.equal(b.playing(), true);
  assert.ok(told.some(t => /granted 10 seconds per pass/.test(t)));      /* ceiling < requested */
  // Flush 3 poll ticks
  for (let i = 0; i < 3; i++){ const fn = waits.pop(); fn(); await new Promise(r => setImmediate(r)); }
  assert.deepEqual(ticks, [0, 1, 2]);
  assert.equal(b.playing(), false);
  assert.ok(told.some(t => t === 'The stream x ended at tick 2'));
  const ck = await b.checkpoint(g, 2);
  assert.deepEqual(ck, { ok: true, written: 1, tick: 2 });
  assert.equal(calls.at(-1).path, 'api/backend/checkpoint');
});

test('backend.js: older server lacks X-Smart-Factory-Play header -> one sentence, Play not offered', async () => {
  const told = [];
  const fetch = () => Promise.resolve({ ok: true, headers: mkHeaders({ 'content-type': 'application/json' }), json: async () => ({ ok: true, version: 6, play: true, ceiling: 30 }) });
  const b = createBackend({ fetch, later: () => 1, cancel: () => {}, version: 6, requirePlay: true, told: why => told.push(...why) });
  assert.equal(await b.health(), true);
  assert.equal(b.serverOlder(), true);
  assert.equal(b.playable(), false);
  assert.deepEqual(told, [OLDER_SERVER]);
  // Re-asking health does not repeat the sentence
  await b.health();
  assert.deepEqual(told, [OLDER_SERVER]);
});

test('backend.js: older backend without play: true -> OLDER sentence, Play not offered', async () => {
  const told = [];
  const fetch = () => Promise.resolve({ ok: true, headers: mkHeaders({ 'x-smart-factory-play': '1' }), json: async () => ({ ok: true, version: 6 }) });
  const b = createBackend({ fetch, later: () => 1, cancel: () => {}, version: 6, requirePlay: true, told: why => told.push(...why) });
  assert.equal(await b.health(), true);
  assert.equal(b.playable(), false);
  assert.equal(b.older(), true);
  assert.deepEqual(told, [OLDER]);
});

test('backend.js: /run reports recomputed loop when no matching checkpoint exists', async () => {
  const waits = [], told = [];
  const fetch = (path, options) => {
    if (path === 'api/backend/health') return Promise.resolve({ ok: true, headers: mkHeaders({ 'x-smart-factory-play': '1' }), json: async () => ({ ok: true, version: 6, play: true, ceiling: 30 }) });
    const req = JSON.parse(options.body);
    assert.equal(req.check, true);
    return Promise.resolve({ ok: true, json: async () => ({ results: { lp: { cols: 1, rows: 1, cells: [[1, 1, 10]], min: 10, max: 10, mean: 10, truth: true } }, errors: {}, recomputed: ['lp'] }) });
  };
  const b = createBackend({ fetch, later: fn => { waits.push(fn); return waits.length; }, cancel: () => {}, version: 6, requirePlay: true, tick: () => 50, told: why => told.push(...why) });
  await b.health();
  b.checkNext();
  b.ask({ version: 6, nodes: {}, functions: {}, spaces: {}, blocks: {} }, 'lp', null, [[1, 1]]);
  waits.pop()();
  await new Promise(r => setImmediate(r));
  assert.ok(told.some(t => /No matching checkpoint at tick 50/.test(t)));
});

test('.backend frame: system.js, project.js round-trip, graph exclusion, and zip', async () => {
  assert.equal(BACKEND, '.backend');
  assert.equal(BACKEND_SETTINGS[0].name, '.seconds_per_pass');
  assert.equal(BACKEND_SETTINGS[0].holds, 'natural');
  assert.equal(BACKEND_SETTINGS[0].fallback, 30);
  const p = {
    top: {
      shapes: [
        { id: 'b1', type: 'tensor', name: '.seconds_per_pass', color: 'variable-5', x: 0, y: 0, cols: 1, rows: 1, colsName: null, rowsName: null, inner: null, entries: { '1,1': 12 }, inside: null, variable: null, standing: false, source: null, transposed: false, attributes: [], reference: false, from: null, holds: 'natural', arrow: null, seat: null, in: false, joined: null },
        { id: 'b2', type: 'tensor', name: 'X', color: 'variable-1', x: 5, y: 0, cols: 1, rows: 1, colsName: null, rowsName: null, inner: null, entries: { '1,1': 7 }, inside: null, variable: null, standing: false, source: null, transposed: false, attributes: [], reference: false, from: null, holds: null, arrow: null, seat: null, in: false, joined: null },
      ],
      groups: [{ id: 'g1', name: '.backend', members: [0], groups: [] }],
      operations: [],
    },
    saved: '2026-11-22T00:00:00.000Z', ids: null, tick: 0, data: {},
  };
  const files = write(p);
  assert.ok(files.some(f => f.path === '.backend'));
  assert.equal(JSON.parse(files.find(f => f.path === 'project.json').text).version, FORMAT);
  const back = read(files);
  assert.deepEqual(write(back), files);
  assert.deepEqual(await unzip(zip(files)), files);
  // .backend shapes take no part in the math graph
  const g = build(back);
  assert.deepEqual(validate(g), []);
  assert.ok(!('b1' in g.blocks));
  assert.ok('b2' in g.blocks);
});

test('projects/running: opens cleanly, validates, holds .backend and Walk loop, and saves back the same', () => {
  const here = fileURLToPath(new URL('../projects/', import.meta.url));
  const tree = (dir, at = '') => readdirSync(join(dir, at)).flatMap(n => statSync(join(dir, at, n)).isDirectory() ? tree(dir, at + n + '/') : [{ path: at + n, text: readFileSync(join(dir, at, n), 'utf8') }]);
  const files = [...tree(join(here, 'running')), { path: '.config', text: readFileSync(join(here, 'running.config'), 'utf8') }];
  const p = read(files);
  assert.equal(p.tick, 0);
  assert.ok(p.top.groups.some(g => g.name === '.backend'));
  const sec = p.top.shapes.find(s => s.name === '.seconds_per_pass');
  assert.equal(sec.holds, 'natural');
  assert.equal(sec.entries['1,1'], 30);
  const g = build(p);
  assert.deepEqual(validate(g), []);
  assert.ok(g.spaces.top.tiles.some(t => t.loop));
  const byPath = list => Object.fromEntries(list.map(f => [f.path, f.text]));
  assert.deepEqual(byPath(write(p)), byPath(files));
});
