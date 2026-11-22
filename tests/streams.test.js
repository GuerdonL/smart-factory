/* Streams and the tick (phase 9D): sources.js's stream settings, graph.js's stream, the tick in evaluate.js, and
   backend.js sending the tick. A stream's numbers are the backend's: backend/tests/test_streams.py has them by hand. */
import './solver.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build, validate, VERSION, OPS, readsIndex } from '../graph.js';
import { evaluate, carry, promiseOf, truthAt } from '../evaluate.js';
import { createBackend } from '../backend.js';
import * as sources from '../sources.js';
import { total, counting, B, space, arrow, adds } from './looping.js';
import { STREAMS, streamTotal, st, noisy, filed } from './streaming.js';

const one = a => a.entries && a.entries['1,1'];
const made = s => { const g = build(s); assert.deepEqual(validate(g), []); return g; };

test('sources: a data file is a CSV, a text or a .npy, by its ending, and a plain file block reads a CSV only', () => {
  for (const [path, kind] of [['data/w.csv', 'csv'], ['data/words.txt', 'text'], ['data/cube.npy', 'npy']]){ assert.equal(sources.dataPath(path), path); assert.equal(sources.fileKind(path), kind); }
  for (const path of ['data/w.CSV', 'data/w.json', 'data/w', 'data/a/b.txt', 'data/../w.txt', '../w.npy', 'w.npy', 'data/.npy', '', null, 7, 'data/w.txt\0']){ assert.equal(sources.dataPath(path), null, String(path)); assert.equal(sources.fileKind(path), null); }
  assert.deepEqual(sources.kept({ file: 'data/w.csv' }), { file: 'data/w.csv' });
  assert.deepEqual(sources.kept({ file: 'data/w.txt' }), { file: null });      /* text is read as a stream: as a plain block it is no file chosen */
  assert.deepEqual(sources.kept({ file: 'data/w.npy' }), { file: null });
  assert.deepEqual(sources.kept({ file: 'data/w.txt', stream: {} }), { file: 'data/w.txt', stream: st() });
  assert.equal(sources.dataName('My Words.TXT'), 'data/My Words.txt'); assert.equal(sources.dataName('cube.npy', new Set(['data/cube.npy'])), 'data/cube-2.npy');
  assert.equal(sources.dataName('weights'), 'data/weights.csv'); assert.equal(sources.dataName('My Weights.CSV'), 'data/My Weights.csv');
});

test('sources: a stream is kept with every setting and nothing else, and what a file holds that is no setting is said', () => {
  assert.deepEqual(sources.stream(), { length: 1, start: 0, step: 1, end: 'stop' });
  assert.deepEqual(sources.stream(8, 3, 2, 'wrap'), { length: 8, start: 3, step: 2, end: 'wrap' });
  assert.deepEqual(sources.stream(0, -1, 0, 'loop'), st()); assert.deepEqual(sources.stream(1.5, 2.5, '2', null), st());
  assert.deepEqual(sources.stream(2, null, null), { length: 2, start: null, step: null, end: 'stop' });      /* not known: kept as that */
  assert.deepEqual(sources.kept(noisy(3, 'normal', { length: 4, more: 1 })), { noise: { seed: 3, dist: 'normal' }, stream: st(4) });
  assert.deepEqual(sources.kept({ noise: { seed: 3, dist: 'normal' }, stream: 7 }), { noise: { seed: 3, dist: 'normal' } });
  assert.deepEqual(sources.kept('zeros'), 'zeros'); assert.equal(sources.streamOf('zeros'), null); assert.equal(sources.streamOf({ file: 'data/w.csv' }), null);
  assert.deepEqual(sources.streamRead({ length: 8, start: 0, step: 1, end: 'wrap' }), { stream: st(8, 0, 1, 'wrap'), said: [] });
  assert.deepEqual(sources.streamRead({}), { stream: st(), said: [] });
  assert.deepEqual(sources.streamRead(undefined), { stream: null, said: [] });
  const odd = sources.streamRead({ length: 0, start: 'x', step: 1.5, end: 'loop' });
  assert.deepEqual(odd.stream, st()); assert.deepEqual(odd.said, ['a length of 0 is read as 1', 'a start of "x" is read as 0', 'a step of 1.5 is read as 1', 'an end of "loop" is read as "stop"']);
  assert.equal(sources.streamRead('yes').said.length, 1); assert.equal(sources.streamRead('yes').stream, null);
  assert.equal(sources.streamKind(noisy(0, 'uniform', st())), 'noise'); assert.equal(sources.streamKind(filed('data/a.txt', st())), 'text');
  assert.equal(sources.streamKind(filed(null, st())), null); assert.equal(sources.streamKind({ file: 'data/a.csv' }), null);
  assert.equal(sources.kindOf(filed('data/a.npy', st())), 'file'); assert.equal(sources.remote(noisy(0, 'uniform', st())), true);
  assert.equal(sources.faceOf(filed('data/a.npy', st())), 'npy'); assert.equal(sources.faceOf(filed('data/a.txt', st())), 'txt'); assert.equal(sources.faceOf(noisy(0, 'uniform', st())), '~');
  assert.equal(sources.labelOf(noisy(0, 'uniform', st())), 'a stream of noise'); assert.equal(sources.labelOf(filed(null, st())), 'a stream of a data file');
  assert.match(sources.typable(filed('data/a.csv', st()), 'R').refused, /R is a stream of a data file: a source stores no entries/);
  assert.deepEqual(sources.sizable(filed('data/a.csv', st()), 'R'), { ok: true });      /* a stream's sizes have rules of their own: pulled and resized */
  assert.match(sources.sizable({ file: 'data/a.csv' }, 'R').refused, /its size is the file's/);      /* a plain file block keeps its ruling */
});

test('sources: a stream pulled by an edge, and its settings typed (ruling 7)', () => {
  /* a CSV of three columns: one row a value, one value shown. Its step is the rows of a value until another is typed */
  const csv = filed('data/t.csv', st()), was = { cols: 3, rows: 1 };
  assert.deepEqual(sources.valueOf(csv, 3, 1), { cols: 3, rows: 1 }); assert.equal(sources.spanOf(csv, 3, 1), 1);
  const taller = sources.pulled(csv, was, { cols: 3, rows: 4 }, 'R');      /* pulled taller: four rows a value, and the next value starts four rows on */
  assert.deepEqual(taller, { source: filed('data/t.csv', st(1, 0, 4)), cols: 3, rows: 4 });
  const typed = sources.resized(taller.source, taller, { step: 1 }, 'R');      /* step typed as 1: windows that overlap */
  assert.deepEqual(typed, { source: filed('data/t.csv', st(1, 0, 1)), cols: 3, rows: 4 });
  assert.deepEqual(sources.pulled(typed.source, typed, { cols: 3, rows: 2 }, 'R').source.stream.step, 1);      /* a typed step stays where the height changes */
  assert.deepEqual(sources.pulled(taller.source, taller, { cols: 3, rows: 2 }, 'R').source.stream.step, 2);      /* one that was the span follows it */
  /* its width is the file's: pulled wider, it is the length that grows, by whole values */
  assert.deepEqual(sources.pulled(csv, was, { cols: 7, rows: 1 }, 'R'), { source: filed('data/t.csv', st(2)), cols: 6, rows: 1 });
  assert.deepEqual(sources.pulled(csv, was, { cols: 1, rows: 1 }, 'R'), { source: csv, cols: 3, rows: 1 });
  assert.match(sources.resized(csv, was, { cols: 4 }, 'R').refused, /^R reads data\/t\.csv: one value of it is as wide as the file makes it, 3 columns, and that is not typed or pulled/);
  assert.deepEqual(sources.resized(csv, was, { cols: 3 }, 'R'), { source: csv, cols: 3, rows: 1 });
  assert.deepEqual(sources.resized(csv, was, { length: 8 }, 'R'), { source: filed('data/t.csv', st(8)), cols: 24, rows: 1 });      /* the length is free */
  assert.deepEqual(sources.resized(csv, was, { rows: 2 }, 'R'), { source: filed('data/t.csv', st(1, 0, 2)), cols: 3, rows: 2 });
  for (const [set, why] of [[{ length: 0 }, /length is a whole number, at least 1/], [{ length: 1.5 }, /length/], [{ step: 0 }, /step is a whole number, at least 1/], [{ start: -1 }, /start is a whole number, from 0/], [{ end: 'loop' }, /end is stop or wrap/], [{ rows: 0 }, /rows are a whole number/], [{ cols: 'x' }, /columns are a whole number/], [{}, /no such setting/]])
    assert.match(sources.resized(csv, was, set, 'R').refused, why);
  assert.deepEqual(sources.resized(csv, was, { end: 'wrap' }, 'R').source.stream, st(1, 0, 1, 'wrap'));
  assert.deepEqual(sources.resized(csv, was, { start: 5 }, 'R').source.stream, st(1, 5));
  /* text: one row; wider is more characters in a value, and the step follows */
  const text = filed('data/w.txt', st(2)), tw = { cols: 2, rows: 1 };
  assert.equal(sources.spanOf(text, 2, 1), 1);
  assert.deepEqual(sources.pulled(text, tw, { cols: 6, rows: 1 }, 'W'), { source: filed('data/w.txt', st(2, 0, 3)), cols: 6, rows: 1 });
  assert.match(sources.pulled(text, tw, { cols: 2, rows: 2 }, 'W').refused, /^W is a stream of text \(data\/w\.txt\): one value of it is one row of characters/);
  assert.deepEqual(sources.resized(text, tw, { length: 3 }, 'W'), { source: filed('data/w.txt', st(3)), cols: 3, rows: 1 });
  /* .npy: a value is the file's size; only the length changes */
  const npy = filed('data/c.npy', st()), nw = { cols: 2, rows: 3 };
  assert.deepEqual(sources.pulled(npy, nw, { cols: 4, rows: 3 }, 'C'), { source: filed('data/c.npy', st(2)), cols: 4, rows: 3 });
  assert.match(sources.pulled(npy, nw, { cols: 2, rows: 4 }, 'C').refused, /^C reads data\/c\.npy: one value of it is the size the file gives, 2 × 3/);
  /* noise: both sides of a value are free, and the length is typed */
  const nz = noisy(1, 'uniform', st(4)), zw = { cols: 8, rows: 2 };
  assert.deepEqual(sources.pulled(nz, zw, { cols: 12, rows: 3 }, 'N'), { source: nz, cols: 12, rows: 3 });      /* three columns a value now, four values still; its span is one draw, so its step stays */
  assert.deepEqual(sources.resized(nz, zw, { length: 1 }, 'N'), { source: noisy(1, 'uniform', st()), cols: 2, rows: 2 });
  assert.match(sources.pulled('zeros', zw, zw, 'Z').refused, /Z is no stream/);
});

test('graph: a stream is one node with no inputs, of each kind, and says its number space', () => {
  const g = made(STREAMS['streams: one of each kind']), of = id => g.nodes[g.nodes['v:' + id].inputs[0]];
  assert.equal(VERSION, 6); assert.equal(g.version, 6);
  assert.deepEqual(of('Sn'), { op: 'stream', inputs: [], type: { cols: 8, rows: 2, colsName: null, rowsName: null, value: 'probability' }, kind: 'noise', seed: 3, dist: 'uniform', key: 'Sn', length: 4, start: 0, step: 1, end: 'stop' });
  assert.deepEqual(of('Sc'), { op: 'stream', inputs: [], type: { cols: 6, rows: 2, colsName: null, rowsName: null, value: 'real' }, kind: 'csv', path: 'data/table.csv', length: 2, start: 0, step: 2, end: 'stop' });
  assert.equal(of('Sg').type.value, 'real'); assert.equal(of('St').type.value, 'whole'); assert.equal(of('St').kind, 'text'); assert.equal(of('Sp').kind, 'npy'); assert.equal(of('Sp').type.value, 'real');
  assert.equal(of('Su').start, null);      /* a setting that is not known is kept as that: the backend gives it no value */
  assert.equal(g.nodes['v:Sn'].defined, 'source'); assert.equal(g.nodes['v:Sn'].type.value, 'probability');
  assert.equal(g.nodes['v:Sn'].inputs[0], 'stream(noise:3;uniform;Sn;4;0;1;stop;8×2)');      /* its id says what it is: every setting */
  assert.deepEqual(g.nodes['v:Sf'].error, { code: 'no-source', note: 'no file has been chosen for it' });
  assert.deepEqual(g.nodes['v:Sw'].error, { code: 'no-source', note: 'its columns are not a whole number of values' });
  assert.ok(readsIndex(of('Sn')));      /* it follows its cell, as noise does */
  assert.deepEqual(made(STREAMS['streams: in a tile']).nodes['stream(noise:3;uniform;Sn;2;0;1;stop;2×1)'].within, ['t:T']);
  /* a value of text is one row; a stream holds no inner data */
  assert.deepEqual(build({ top: space([B('T', 0, 0, 2, 2, { source: filed('data/w.txt', st()) })]) }).nodes['v:T'].error, { code: 'no-source', note: 'a value of text is one row' });
  assert.deepEqual(build({ top: space([B('T', 0, 0, 2, 2, { inner: [{ length: 2, name: null }], source: noisy(0, 'uniform', st()) })]) }).nodes['v:T'].error, { code: 'no-source', note: 'a stream holds no inner data' });
  /* a plain noise block and a plain file block are what they were */
  const plain = made({ top: space([B('N', 0, 0, 2, 2, { source: { noise: { seed: 3, dist: 'uniform' } } }), B('F', 10, 0, 2, 2, { source: { file: 'data/w.csv' } })]) });
  assert.equal(plain.nodes[plain.nodes['v:N'].inputs[0]].op, 'noise'); assert.equal(plain.nodes[plain.nodes['v:F'].inputs[0]].op, 'source');
});

test('validate: each rule of a stream, and it needs version 6', () => {
  const g = () => JSON.parse(JSON.stringify(build(STREAMS['streams: one of each kind']))), id = { Sn: 'stream(noise:3;uniform;Sn;4;0;1;stop;8×2)', Sc: 'stream(csv:data/table.csv;2;0;2;stop;6×2)', St: 'stream(text:data/words.txt;2;0;2;wrap;4×1)' };
  const bad = (change, why) => { const x = g(); change(x); const said = validate(x); assert.ok(said.some(s => why.test(s)), JSON.stringify(said) + ' ' + why); };
  const ok = change => { const x = g(); change(x); assert.deepEqual(validate(x), []); };
  for (const v of [1, 2, 3, 4, 5]) bad(x => { x.version = v; }, new RegExp(`it holds a stream, which needs version 6, and the graph says version ${v}`));
  bad(x => { x.nodes[id.Sn].kind = 'video'; }, /kind is "video"/); bad(x => { delete x.nodes[id.Sn].kind; }, /kind is "undefined"/);
  bad(x => { x.nodes[id.Sn].seed = 1.5; }, /seed is not a whole number/); bad(x => { x.nodes[id.Sn].dist = 'flat'; }, /dist is "flat"/); bad(x => { x.nodes[id.Sn].key = ''; }, /key is not a block id/);
  bad(x => { x.nodes[id.Sn].path = 'data/a.csv'; }, /a stream holds no path/); bad(x => { x.nodes[id.Sc].seed = 1; }, /a stream holds no seed/); bad(x => { x.nodes[id.Sc].position = 3; }, /a stream holds no position/);
  for (const path of ['data/a.txt', 'data/a.npy', '../a.csv', 'data/a', null]) bad(x => { x.nodes[id.Sc].path = path; }, /path is not a \.csv file under data\//);
  bad(x => { x.nodes[id.St].path = 'data/a.csv'; }, /path is not a \.txt file under data\//);
  for (const length of [0, -1, 1.5, '4', null, true, 2 ** 53]) bad(x => { x.nodes[id.Sn].length = length; }, /length is not a whole number, at least 1/);
  bad(x => { delete x.nodes[id.Sn].length; }, /length is not a whole number/);
  for (const start of [-1, 1.5, '0', true, 2 ** 53]) bad(x => { x.nodes[id.Sn].start = start; }, /start is not a whole number, from 0, or null/);
  bad(x => { delete x.nodes[id.Sn].start; }, /start is not/); bad(x => { delete x.nodes[id.Sn].step; }, /step is not/);
  for (const step of [0, -1, 1.5, '1', false]) bad(x => { x.nodes[id.Sn].step = step; }, /step is not a whole number, at least 1, or null/);
  for (const end of ['loop', '', null, 1]) bad(x => { x.nodes[id.Sn].end = end; }, /end is "/);
  bad(x => { x.nodes[id.Sn].length = 3; }, /its columns are not a whole number of values/);
  bad(x => { x.nodes[id.St].type.rows = 2; }, /a value of text is one row/);
  bad(x => { x.nodes[id.Sn].type.inner = [{ length: 2, name: null }]; }, /a stream holds no inner data/);
  bad(x => { x.nodes[id.Sn].type.value = 'real'; }, /its value is real and its inputs give probability/);
  bad(x => { x.nodes[id.Sn].inputs = ['v:M']; }, /stream does not take 1 inputs/);
  bad(x => { x.nodes[id.Sn].type.colsName = 'k'; }, /its type is/);
  ok(x => { x.nodes[id.Sn].start = null; x.nodes[id.Sn].step = null; }); ok(x => { x.nodes[id.Sn].length = 8; }); ok(x => { x.nodes[id.Sn].length = 1; }); ok(x => { x.nodes[id.Sc].end = 'wrap'; });
  /* a plain file source reads a CSV */
  const f = build({ top: space([B('F', 10, 0, 2, 2, { source: { file: 'data/w.csv' } })]) }), fid = f.nodes['v:F'].inputs[0]; assert.deepEqual(validate(f), []);
  for (const path of ['data/w.txt', 'data/w.npy']){ const x = JSON.parse(JSON.stringify(f)); x.nodes[fid].path = path; assert.ok(validate(x).some(s => /path is not a \.csv file under data\//.test(s))); }
  assert.ok(Object.keys(OPS).includes('stream'));
});

test('evaluate: a stream is the backend\'s, and so is whatever is made of one', () => {
  const g = made(STREAMS['streams: one of each kind']);
  for (const id of ['v:Sn', 'v:Sg', 'v:Sc', 'v:St', 'v:Sp', 'v:Su', 'v:Sm']) assert.deepEqual(evaluate(g, id), { type: g.nodes[id].type, deferred: true, backend: true }, id);
  assert.deepEqual(evaluate(g, g.nodes['v:Sn'].inputs[0]), { type: g.nodes[g.nodes['v:Sn'].inputs[0]].type, deferred: true, backend: true });
  const piece = g.spaces.top.pieces.find(p => p.blocks.includes('Sm')); assert.ok(piece && piece.node);
  assert.deepEqual(evaluate(g, piece.node), { type: g.nodes[piece.node].type, deferred: true, backend: true });
  assert.equal(evaluate(g, 'v:Sf').error.code, 'no-source');
  assert.equal(truthAt(g, 'v:Sn'), null);      /* nothing here says whether it is true */
  const p = promiseOf(g, 'v:Sn'); assert.equal(p.inferred, 'probability');
  const t = made(STREAMS['streams: the running total of a stream']), loop = t.spaces.top.tiles[0].loop;
  assert.deepEqual(evaluate(t, loop, { tick: 3 }), { type: t.nodes[loop].type, deferred: true, backend: true });      /* a loop a stream feeds is the backend's at every tick */
  assert.deepEqual(t.nodes[t.nodes['v:x'].inputs[0]].within, ['t:T']);
});

test('the tick: a loop with no end and no stop block takes one step each tick, and nothing of one tick is given at another', () => {
  /* by hand: c is index.x, s the state from 0, the step adds them. Cells 1, 2, 3, 4, 5 hold 0, 1, 3, 6, 10: at tick t the loop is the state of cell t + 1 */
  const f = total({ count: 'inf', across: 'inf' }); assert.deepEqual(validate(f), []);
  assert.deepEqual([0, 1, 2, 3, 4].map(tick => one(evaluate(f, 'lp', { tick }))), [0, 1, 3, 6, 10]);
  assert.deepEqual([3, 0, 2, 3, 1].map(tick => one(evaluate(f, 'lp', { tick }))), [6, 0, 3, 6, 1]);      /* in any order */
  assert.equal(one(evaluate(f, 'lp')), 0);      /* with no tick said it is 0 */
  for (const tick of [-1, 1.5, '3', null, NaN, Infinity]) assert.equal(one(evaluate(f, 'lp', { tick })), 0, String(tick));      /* what is no tick is 0 */
  assert.equal(one(evaluate(f, 'lp', { tick: 256 })), 256 * 257 / 2);      /* 256 steps are worked out here */
  assert.deepEqual(evaluate(f, 'lp', { tick: 257 }), { type: f.nodes.lp.type, deferred: true, steps: 256 });      /* and past them it is the backend's */
  assert.deepEqual(evaluate(f, 'lp', { tick: 1e9 }), { type: f.nodes.lp.type, deferred: true, steps: 256 });
  assert.equal(one(evaluate(f, 'lp', { tick: 300, maxSteps: 300 })), 300 * 301 / 2);
  assert.equal(one(evaluate(f, 'lp', { tick: 2 })), 3);
  /* what does not follow the tick is the same at every tick: a settled loop, a block of the pattern in a cell */
  const settled = total(); assert.deepEqual([0, 5, 1000].map(tick => one(evaluate(settled, 'lp', { tick }))), [10, 10, 10]);
  const cell = (k, tick) => one(evaluate(f, 's', { tick, binding: { cells: [{ x: k - 1, y: 0, dx: 0, dy: 1, cx: k, cy: 1, of: ['t:T'] }] } }));
  assert.deepEqual([1, 2, 3].map(k => cell(k, 0)), [0, 1, 3]); assert.deepEqual([1, 2, 3].map(k => cell(k, 7)), [0, 1, 3]);      /* a cell is its own tick's, whatever the clock says */
  /* a canvas: the counter with no end, and a block that reads the step's output, which follows the tick with it */
  const c = made(counting({ repeat: { across: 'inf' }, shapes: [B('out', 20, 0, 1, 1, { seat: 'step' }), B('twice', 30, 0, 1, 1, { entries: { '1,1': { expr: '2 * @[out:m]' } } })] }));
  const loop = c.spaces.top.tiles[0].loop; assert.equal(c.nodes[loop].count, 'inf'); assert.equal(c.nodes[loop].until, null);
  assert.deepEqual([0, 1, 2, 3].map(tick => one(evaluate(c, loop, { tick }))), [0, 1, 3, 6]);
  assert.deepEqual([3, 1, 0, 2].map(tick => one(evaluate(c, 'v:twice', { tick }))), [12, 2, 0, 6]);
  assert.deepEqual([3, 1].map(tick => one(evaluate(c, 'v:out', { tick }))), [6, 1]);
});

test('the tick: what is carried from one graph to the next is carried at its tick', () => {
  const a = total({ count: 'inf', across: 'inf' }), b = JSON.parse(JSON.stringify(a)), d = JSON.parse(JSON.stringify(a)), e = JSON.parse(JSON.stringify(a));
  assert.equal(one(evaluate(a, 'lp', { tick: 3 })), 6);
  carry(a, b); assert.equal(one(evaluate(b, 'lp', { tick: 3 })), 6); assert.equal(one(evaluate(b, 'lp', { tick: 2 })), 3); assert.equal(one(evaluate(b, 'lp')), 0);
  assert.equal(one(evaluate(d, 'lp', { tick: 1 })), 1); carry(a, d); assert.equal(one(evaluate(d, 'lp', { tick: 1 })), 1); assert.equal(one(evaluate(d, 'lp', { tick: 3 })), 6);      /* a graph already at another tick takes nothing that follows the tick */
  carry(a, e); assert.equal(one(evaluate(e, 'lp', { tick: 0 })), 0);      /* carried at tick 3, and asked at 0: not the 6 */
});

test('backend.js sends the tick, asks afresh when it changes, and tells of a stream that has ended', async () => {
  const g = made(STREAMS['streams: the running total of a stream']), stream = g.nodes['v:x'].inputs[0], loop = g.spaces.top.tiles[0].loop;
  const sent = [], waits = [], told = []; let tick = 2, answer = () => ({ results: { [loop]: { cols: 1, rows: 1, cells: [[1, 1, 4]] } }, errors: {} });
  const fetch = (path, options) => { if (options) sent.push(JSON.parse(options.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve(path.endsWith('health') ? { ok: true, version: g.version } : answer()) }); };
  const b = createBackend({ fetch, later: fn => { waits.push(fn); return waits.length; }, cancel: () => {}, version: g.version, tick: () => tick, told: why => told.push(...why),
    ended: (graph, node, t) => (graph === g && node === stream ? `The stream x ended at tick ${t}` : null) });
  const flush = async () => { while (waits.length){ const fn = waits.shift(); if (waits.length > 50) break; fn(); } await new Promise(r => setTimeout(r, 0)); };
  await b.health(); assert.equal(b.ask(g, loop, null, [[1, 1]], 'a'), null); await flush();
  assert.equal(sent.length, 1); assert.equal(sent[0].tick, 2);
  assert.deepEqual(b.ask(g, loop, null, [[1, 1]], 'a'), { result: { cols: 1, rows: 1, cells: [[1, 1, 4]] }, stale: false });
  /* another tick: the answer of the tick before is given as stale, and the backend is asked again */
  tick = 3; answer = () => ({ results: { [loop]: { cols: 1, rows: 1, cells: [[1, 1, 8]] } }, errors: {} });
  assert.deepEqual(b.ask(g, loop, null, [[1, 1]], 'a'), { result: { cols: 1, rows: 1, cells: [[1, 1, 4]] }, stale: true });
  assert.equal(b.problem(g, loop, null), null); await flush();
  assert.equal(sent.length, 2); assert.equal(sent[1].tick, 3);
  assert.deepEqual(b.ask(g, loop, null, [[1, 1]], 'a'), { result: { cols: 1, rows: 1, cells: [[1, 1, 8]] }, stale: false });
  /* an answer that comes back after the tick has moved on is dropped */
  tick = 4; let late; answer = () => new Promise(r => { late = r; }); b.ask(g, loop, null, [[1, 1]], 'a'); await flush();
  tick = 5; answer = () => ({ results: { [loop]: { cols: 1, rows: 1, cells: [[1, 1, 9]] } }, errors: {} }); b.ask(g, loop, null, [[1, 1]], 'a');
  late({ results: { [loop]: { cols: 1, rows: 1, cells: [[1, 1, 777]] } }, errors: {} }); await flush(); await flush();
  assert.deepEqual(b.ask(g, loop, null, [[1, 1]], 'a').result.cells, [[1, 1, 9]]); assert.equal(sent[sent.length - 1].tick, 5);
  /* past its file's end: the stream is named once, in the page's words, and what has no numbers because of it says so */
  tick = 40; const why = 'it ended at tick 40: data/rows.csv has 40 rows, and it stops at its end';
  answer = () => ({ results: {}, errors: { [loop]: why, 'v:x': why }, codes: { [loop]: { code: 'ended', node: stream, tick: 40 }, 'v:x': { code: 'ended', node: stream, tick: 40 } }, ended: [stream] });
  b.ask(g, loop, null, [[1, 1]], 'a'); b.ask(g, 'v:x', null, [[1, 1]], 'x'); await flush();
  assert.deepEqual(told, ['The stream x ended at tick 40']);
  assert.equal(b.problem(g, loop, null), why); assert.deepEqual(b.broke(g, loop, null), { code: 'ended', node: stream, tick: 40 });
  assert.deepEqual([...b.ended(g)], [[stream, 40]]);
  tick = 39; assert.deepEqual([...b.ended(g)], []); assert.equal(b.problem(g, loop, null), null);      /* at another tick nothing of that is said */
  /* another project opened while something is waiting to be sent: it is not sent under the new project's name */
  { const out = [], later = []; let name = 'one';
    const bb = createBackend({ fetch: (path, options) => { if (options) out.push(JSON.parse(options.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve(path.endsWith('health') ? { ok: true, version: g.version } : { results: {}, errors: {} }) }); }, later: fn => { later.push(fn); return later.length; }, cancel: id => { later[id - 1] = () => {}; }, version: g.version, project: () => name });
    await bb.health(); bb.ask(g, loop, null, [[1, 1]], 'a'); name = 'two'; bb.forget(); for (const fn of later.splice(0)) fn(); await new Promise(r => setTimeout(r, 0));
    assert.deepEqual(out, []); assert.equal(bb.pending(), 0);
    const h2 = JSON.parse(JSON.stringify(g)); bb.ask(h2, loop, null, [[1, 1]], 'a'); for (const fn of later.splice(0)) fn(); await new Promise(r => setTimeout(r, 0));
    assert.equal(out.length, 1); assert.equal(out[0].project, 'two'); }
  /* with no tick handed in it is 0, as it was */
  const sent0 = [], b0 = createBackend({ fetch: (path, options) => { if (options) sent0.push(JSON.parse(options.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve(path.endsWith('health') ? { ok: true, version: g.version } : { results: {}, errors: {} }) }); }, later: fn => { waits.push(fn); return waits.length; }, cancel: () => {}, version: g.version });
  await b0.health(); b0.ask(g, loop, null, [[1, 1]], 'a'); await flush(); assert.equal(sent0[0].tick, 0);
});

/* ---- in a project's files (project.js) ---- */
import { write, read, FORMAT } from '../project.js';
const shape = (name, cols, rows, more = {}) => ({ id: 'b' + name, type: 'data-in', name, color: 'variable-1', x: 0, y: 0, cols, rows, colsName: null, rowsName: null, inner: null, entries: {}, inside: null, variable: null, standing: false, source: null, transposed: false, attributes: [], reference: false, from: null, arrow: null, seat: null, in: false, ...more });
const snapOf = (shapes, more = {}) => ({ top: { shapes, groups: [], operations: [] }, saved: '2026-11-22T00:00:00.000Z', ids: null, data: {}, ...more });
const json = (files, path) => JSON.parse(files.find(f => f.path === path).text);

test('project: a stream is written beside its source, the tick in project.json, and saved, reopened, saved gives the same files', () => {
  assert.equal(FORMAT, 9);
  const p = snapOf([shape('N', 8, 2, { source: noisy(3, 'normal', st(4, 5, 2, 'wrap')) }), shape('R', 3, 4, { source: filed('data/rows.csv', st(1, 0, 4)) }), shape('W', 6, 1, { source: filed('data/words.txt', st(2, 0, 3)) }),
    shape('C', 2, 3, { source: filed('data/cube.npy', st()) }), shape('U', 2, 1, { source: noisy(0, 'uniform', st(2, null, null)) }), shape('F', 2, 2, { source: filed(null, st()) }), shape('P', 2, 2, { source: { noise: { seed: 1, dist: 'uniform' } } })],
    { tick: 41, data: { 'data/rows.csv': '1,2,3\n', 'data/words.txt': 'héllo 😀\n', 'data/cube.npy': 'AAAA', 'data/notes.md': 'no data file' } });
  const files = write(p), back = read(files);
  assert.deepEqual(json(files, 'project.json'), { format: 'smart-factory/project', version: FORMAT, saved: '2026-11-22T00:00:00.000Z', tick: 41 });
  assert.deepEqual(json(files, 'N.json').source, { noise: { seed: 3, dist: 'normal' } }); assert.deepEqual(json(files, 'N.json').stream, { length: 4, start: 5, step: 2, end: 'wrap' });
  assert.deepEqual(json(files, 'R.json').source, { file: 'data/rows.csv' }); assert.deepEqual(json(files, 'R.json').stream, { length: 1, start: 0, step: 4, end: 'stop' });
  assert.deepEqual(json(files, 'U.json').stream, { length: 2, start: null, step: null, end: 'stop' }); assert.deepEqual(json(files, 'F.json').source, { file: null });
  assert.equal(json(files, 'P.json').stream, undefined);      /* a plain noise block is written as it always was */
  assert.deepEqual(files.filter(f => f.path.startsWith('data/')).map(f => f.path), ['data/cube.npy', 'data/rows.csv', 'data/words.txt']);      /* the three kinds of data file, and nothing else */
  assert.equal(back.tick, 41); assert.equal(back.ticked, null); assert.deepEqual(back.streamed, []);
  assert.deepEqual(back.top.shapes.map(d => d.source), p.top.shapes.map(d => d.source));
  assert.deepEqual(back.data, { 'data/cube.npy': 'AAAA', 'data/rows.csv': '1,2,3\n', 'data/words.txt': 'héllo 😀\n' });
  assert.deepEqual(write(back), files); assert.deepEqual(write(read(write(back))), files);
});

test('project: a project saved before streams opens as it was, with tick 0; a tick or a stream that is none is read and said', () => {
  const old = snapOf([shape('P', 2, 2, { source: { noise: { seed: 1, dist: 'uniform' } } }), shape('F', 2, 2, { source: { file: 'data/w.csv' } })], { data: { 'data/w.csv': '1,2\n3,4\n' } });
  const seven = write(old).map(f => ({ path: f.path, text: f.path.endsWith('.json') ? JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(f.text)).filter(([k]) => k !== 'tick').map(([k, v]) => [k, k === 'version' ? 7 : v])), null, 2) + '\n' : f.text }));
  assert.equal(json(seven, 'project.json').tick, undefined); assert.equal(json(seven, 'project.json').version, 7);
  const opened = read(seven); assert.equal(opened.tick, 0); assert.equal(opened.ticked, null); assert.deepEqual(opened.streamed, []);
  assert.deepEqual(opened.top.shapes.map(d => d.source), [{ noise: { seed: 1, dist: 'uniform' } }, { file: 'data/w.csv' }]);
  assert.deepEqual(write(opened), write(old));      /* saved again: the format number, and "tick": 0 */
  const head = tick => [{ path: 'project.json', text: JSON.stringify({ format: 'smart-factory/project', version: 8, tick }) }];
  for (const [tick, said] of [[-1, '-1'], [1.5, '1.5'], ['7', '"7"'], [null, 'null'], [2 ** 53, '9007199254740992'], [{}, '{}']]){ const r = read(head(tick)); assert.equal(r.tick, 0); assert.equal(r.ticked, said, String(tick)); }
  assert.equal(read(head(7)).tick, 7); assert.equal(read(head(7)).ticked, null);
  /* what was written for a stream and is not read as written: each is said, and the project opens */
  const cfg = (name, more) => ({ path: name + '.json', text: JSON.stringify({ format: 'smart-factory/shape', version: 8, id: 'b' + name, type: 'data-in', name, named: true, position: { x: 0, y: 0 }, size: { cols: 4, rows: 2 }, sides: { cols: null, rows: null }, value: { as: 'resolved', entries: {} }, order: 0, ...more }) });
  const odd = read([...head(0), cfg('A', { source: { noise: { seed: 1, dist: 'uniform' } }, stream: { length: 2, start: 0, step: 1, end: 'loop' } }), cfg('B', { source: 'zeros', stream: { length: 2 } }),
    cfg('C', { source: { noise: { seed: 1, dist: 'uniform' } }, stream: { length: 3, start: 0, step: 1, end: 'stop' } }), cfg('D', { source: { file: 'data/gone.csv' }, stream: { length: 1, start: 0, step: 1, end: 'stop' } }),
    cfg('E', { source: { noise: { seed: 1, dist: 'uniform' } }, stream: 'yes' }), cfg('G', { source: { file: 'data/words.txt' }, stream: { length: 1, start: 0, step: 1, end: 'stop' } }), cfg('V', { source: { file: 'data/film.mp4' }, stream: { length: 1, start: 0, step: 1, end: 'stop' } }), cfg('H', { source: { file: 'data/words.txt' } }),
    { path: 'data/words.txt', text: 'hi' }]);
  const by = name => odd.top.shapes.find(d => d.name === name).source;
  assert.deepEqual(by('A'), noisy(1, 'uniform', st(2))); assert.equal(by('B'), 'zeros'); assert.deepEqual(by('C'), noisy(1, 'uniform', st(1))); assert.deepEqual(by('D'), filed('data/gone.csv', st()));
  assert.deepEqual(by('E'), { noise: { seed: 1, dist: 'uniform' } }); assert.deepEqual(by('G'), filed('data/words.txt', st())); assert.deepEqual(by('V'), filed(null, st())); assert.deepEqual(by('H'), { file: null });      /* (a plain file block reads a CSV: a text is no file chosen) */
  assert.deepEqual(odd.streamed, [
    { id: 'bA', name: 'A', why: 'an end of "loop" is read as "stop"' },
    { id: 'bB', name: 'B', why: 'it is written as a stream, and only noise and a data file are streamed: it is read as what it is without one' },
    { id: 'bC', name: 'C', why: 'it is 4 columns for a length of 3, which is no whole number of values: its length is read as 1' },
    { id: 'bE', name: 'E', why: 'its stream is not { length, start, step, end }, and it is read as no stream' },
    { id: 'bV', name: 'V', why: 'it reads "data/film.mp4", which is no data file this program reads (data/ and one name ending .csv, .txt or .npy): it has no file chosen' },
    { id: 'bD', name: 'D', why: 'it reads data/gone.csv, which is not among the project\'s files: choose the file again' }]);
  assert.deepEqual(read(write(odd)).streamed, [{ id: 'bD', name: 'D', why: 'it reads data/gone.csv, which is not among the project\'s files: choose the file again' }]);      /* saved, only what is still so is said again */
  assert.throws(() => read([{ path: 'project.json', text: JSON.stringify({ format: 'smart-factory/project', version: FORMAT + 1 }) }]), new RegExp(`saved by a newer version \\(format ${FORMAT + 1}\\)`));
});

/* ---- the example that comes with the repository ---- */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
test('projects/streams: one stream of each kind, a plain noise block, and the running total of a stream\'s rows, saved at tick 3', () => {
  const here = fileURLToPath(new URL('../projects/', import.meta.url));
  const tree = (dir, at = '') => readdirSync(join(dir, at)).flatMap(n => statSync(join(dir, at, n)).isDirectory() ? tree(dir, at + n + '/') : [{ path: at + n, text: n.endsWith('.npy') ? readFileSync(join(dir, at, n)).toString('base64') : readFileSync(join(dir, at, n), 'utf8') }]);
  const files = [...tree(join(here, 'streams')), { path: '.config', text: readFileSync(join(here, 'streams.config'), 'utf8') }], p = read(files);
  assert.equal(p.tick, 3); assert.deepEqual(p.streamed, []); assert.deepEqual(p.unstepped, []); assert.deepEqual(p.unheld, []); assert.deepEqual(p.resized, []);
  const by = name => p.top.shapes.find(d => d.name === name), size = d => [d.cols, d.rows];
  assert.deepEqual(by('Noise').source, { noise: { seed: 7, dist: 'uniform' } });
  assert.deepEqual([by('Draws').source, size(by('Draws'))], [noisy(7, 'uniform', st(4)), [8, 2]]);
  assert.deepEqual([by('Rows').source, size(by('Rows'))], [filed('data/rows.csv', st(2, 0, 2, 'wrap')), [4, 2]]);
  assert.deepEqual([by('Letters').source, size(by('Letters'))], [filed('data/letters.txt', st(1, 0, 5, 'wrap')), [5, 1]]);
  assert.deepEqual([by('Cube').source, size(by('Cube'))], [filed('data/cube.npy', st(1, 0, 1, 'wrap')), [2, 3]]);
  assert.deepEqual(by('x').source, filed('data/total.csv', st(1, 0, 1, 'wrap')));
  assert.deepEqual(Object.keys(p.data).sort(), ['data/cube.npy', 'data/letters.txt', 'data/rows.csv', 'data/total.csv']);
  assert.equal(p.data['data/total.csv'], '3\n1\n4\n1\n5\n'); assert.equal([...p.data['data/letters.txt']].length, 22);
  const tile = p.top.groups.find(g => g.repeat); assert.equal(tile.repeat.across, 'inf'); assert.equal(tile.repeat.step, by('add').id); assert.equal(tile.repeat.until, undefined);
  /* saved again it is the files that are shipped, but for the format version */
  const texts = list => Object.fromEntries(list.map(f => [f.path, f.text])), v8 = o => Object.fromEntries(Object.entries(o).map(([k, t]) => [k, k.endsWith('.json') || k === '.config' ? t.replace(new RegExp(`"version": ${FORMAT}`, 'g'), '"version": 8') : t]));
  assert.deepEqual(v8(texts(write(p))), texts(files)); assert.deepEqual(write(read(write(p))), write(p));
  /* its graph: five streams and a loop with no end, all the backend's */
  const g = build(p); assert.deepEqual(validate(g), []);
  assert.deepEqual(Object.values(g.nodes).filter(n => n.op === 'stream').map(n => n.kind).sort(), ['csv', 'csv', 'noise', 'npy', 'text']);
  const t = g.spaces.top.tiles.find(t => t.loop); assert.equal(g.nodes[t.loop].count, 'inf'); assert.equal(g.nodes[t.loop].until, null);
  assert.deepEqual(evaluate(g, t.loop, { tick: 3 }), { type: g.nodes[t.loop].type, deferred: true, backend: true });
  for (const name of ['Noise', 'Draws', 'Rows', 'Letters', 'Cube']) assert.equal(evaluate(g, 'v:' + by(name).id, { tick: 3 }).backend, true, name);
});

test('graph and evaluate: a stream outside an infinite tile read from inside it validates and defers to the backend', () => {
  const g = made({ top: space([
    B('O', -4, 0, 1, 1, { source: filed('data/total.csv', st()) }),
    B('x', 0, 0, 1, 1, { entries: { '1,1': { expr: '@[O:m]' } } }),
    B('S', 0, 1, 1, 1, { entries: { '1,1': 0 } }),
    arrow('step', { id: 'T', as: 'tile' }, {}, { inside: adds() })],
  [{ id: 'T', name: 'Total', members: [1, 2], groups: [], repeat: { x: 0, y: 0, cols: 1, rows: 2, across: 'inf', down: 1, step: 'step' } }]) });
  const t = g.spaces.top.tiles[0];
  assert.ok(!t.blocks.includes('O'));
  assert.deepEqual(evaluate(g, t.loop, { tick: 3 }), { type: g.nodes[t.loop].type, deferred: true, backend: true });
});
