/* Tiles with a step: the operation loop, and a repeat with fn and state (graph.js, evaluate.js). */
import './solver.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../graph.js';
import { evaluate, stoppedAt } from '../evaluate.js';

import { total, ty, V, inFunction, inStep } from './looping.js';
const one = a => a.entries && a.entries['1,1'];
const cell = (g, id, k, across = 4) => evaluate(g, id, { binding: { cells: [{ x: (k - 1) % across, y: 2 * Math.floor((k - 1) / across), dx: 0, dy: id === 's' ? 1 : 0, cx: (k - 1) % across + 1, cy: Math.floor((k - 1) / across) + 1, of: ['t:T'] }] } });

test('loop: a settled count gives the state after the last cell, and each cell shows its own state', () => {
  const g = total(); assert.deepEqual(validate(g), []);
  assert.equal(one(evaluate(g, 'lp')), 10);                       /* 0, +1, +2, +3, +4 */
  assert.deepEqual([1, 2, 3, 4].map(k => one(cell(g, 's', k))), [0, 1, 3, 6]);
  assert.deepEqual(evaluate(g, 'rep').entries, { '1,1': 1, '2,1': 2, '3,1': 3, '4,1': 4, '1,2': 0, '2,2': 1, '3,2': 3, '4,2': 6 });      /* the whole matrix: every cell with its state */
  assert.equal(one(evaluate(g, 's')), 0);                         /* looked at from no cell, the block holds its own entries */
});
test('loop: cells go left to right, then the next row down', () => {
  const g = total({ count: 4, across: 2 }); assert.deepEqual(validate(g), []);
  assert.deepEqual([1, 2, 3, 4].map(k => one(cell(g, 's', k, 2))), [0, 1, 3, 4]);      /* index.x is 1, 2, 1, 2 */
  assert.equal(one(evaluate(g, 'lp')), 6);
});
test('loop: Stop when true gives the state of the cell where the stop block is true, that cell included', () => {
  const more = { stop: V(ty(1, 1), { '1,1': { expr: '$1 >= 3' } }, { inputs: ['s'], within: ['t:T'] }) };
  const g = total({ count: 'inf', across: 'inf', until: 2, more, loop: { inputs: ['c', 's', 'stop'], at: [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }], pattern: { cols: 1, rows: 3 } } });
  g.nodes['param(f:1)'].type = ty(1, 3); g.spaces.top.tiles[0].blocks.push('stop'); g.blocks.stop = 'stop';
  assert.deepEqual(validate(g), []);
  assert.equal(one(evaluate(g, 'lp')), 3); assert.equal(stoppedAt(g, 'lp'), 3);      /* states 0, 1, 3: true in the third cell */
});
test('loop: a stop block with an unknown entry that decides it gives unknown, not "keep going"', () => {
  const more = { stop: V(ty(2, 1), { '1,1': 0 }) };      /* [0, never given]: not false, since the other entry may be true */
  const g = total({ count: 'inf', across: 'inf', until: 2, more, loop: { inputs: ['c', 's', 'stop'], at: [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }], pattern: { cols: 2, rows: 3 } } });
  g.nodes.c.type = ty(2, 1); g.nodes.s.type = ty(2, 1); g.nodes.lp.state.cols = 2; g.nodes.lp.type = ty(2, 1); g.nodes['param(f:1)'].type = ty(2, 3);
  for (const k of ['top', 'bot']){ g.nodes[k].type = ty(2, 1); g.nodes[k].range.cols = 2; } g.nodes.body.type = ty(2, 1);
  g.spaces.top.tiles[0].blocks.push('stop'); g.blocks.stop = 'stop';
  assert.deepEqual(validate(g), []);
  assert.deepEqual(evaluate(g, 'lp'), { type: g.nodes.lp.type, entries: {} });
});
test('loop: 256 steps and then it is the backend\'s; an infinite count with no stop block runs until stopped', () => {
  const g = total({ count: 300, across: 300 }); assert.deepEqual(validate(g), []);
  assert.deepEqual(evaluate(g, 'lp'), { type: g.nodes.lp.type, deferred: true, steps: 256 });
  assert.equal(one(evaluate(g, 'lp', { maxSteps: 300 })), 300 * 301 / 2);
  const h = total({ count: 256, across: 256 }); assert.equal(one(evaluate(h, 'lp')), 256 * 257 / 2);      /* the boundary: 256 are worked out */
  const never = total({ count: 'inf', across: 'inf', until: 1, s0: -1, c: { '1,1': 0 } });      /* the stop block is the state, which stays -1... and is true: stops at once */
  assert.equal(one(evaluate(never, 'lp')), -1);
  const zero = total({ count: 'inf', across: 'inf', until: 1, s0: 0, c: { '1,1': 0 } });      /* never true */
  assert.deepEqual(evaluate(zero, 'lp'), { type: zero.nodes.lp.type, deferred: true, steps: 256 });
  const f = total({ count: 'inf', across: 'inf' });
  assert.deepEqual(evaluate(f, 'lp'), { type: f.nodes.lp.type, deferred: true, forever: true });
  assert.deepEqual([1, 2, 3].map(k => one(cell(f, 's', k, 1e9))), [0, 1, 3]);      /* and its first cells are still worked out */
});
test('loop: a count that is settled only when it is run', () => {
  const n = v => ({ n: V(ty(1, 1), v === null ? {} : { '1,1': v }) });
  const g = total({ count: { input: 2 }, across: 'inf', more: n(4) }); assert.deepEqual(validate(g), []);
  assert.equal(one(evaluate(g, 'lp')), 10);
  assert.deepEqual(evaluate(total({ count: { input: 2 }, across: 'inf', more: n(null) }), 'lp').entries, {});
  assert.match(one(evaluate(total({ count: { input: 2 }, across: 'inf', more: n({ n: 1, d: 2, k: 0 }) }), 'lp')).err, /whole number/);
  assert.match(one(evaluate(total({ count: { input: 2 }, across: 'inf', more: n(0) }), 'lp')).err, /whole number/);
});
test('loop: a tile with a step inside a function has a state for each thing the function is given', () => {
  /* by hand: f(x) = 2x, so 10, 14 and [10; 14], whatever was asked before */
  for (const order of [['fa', 'fb', 'fx'], ['fb', 'fa', 'fx'], ['fx', 'fb', 'fa']]){ const g = inFunction(); assert.deepEqual(validate(g), []);
    const got = Object.fromEntries(order.map(id => [id, evaluate(g, id).entries]));
    assert.deepEqual(got, { fa: { '1,1': 10 }, fb: { '1,1': 14 }, fx: { '1,1': 10, '1,2': 14 } }, order.join(' ')); }
});
test('loop: a tile with a step inside a step starts from what that step was given', () => {
  /* by hand: s' = 2s + c with c = 1, 2, 3: the cells hold 0, 1, 4 and the loop gives 11 */
  for (const order of [['lp', 'rep'], ['rep', 'lp']]){ const g = inStep(); assert.deepEqual(validate(g), []);
    const got = Object.fromEntries(order.map(id => [id, evaluate(g, id).entries]));
    assert.deepEqual(got, { lp: { '1,1': 11 }, rep: { '1,1': 1, '2,1': 2, '3,1': 3, '1,2': 0, '2,2': 1, '3,2': 4 } }, order.join(' ')); }
});
test('loop: None as state, and the index is not readable in a step', () => {
  assert.deepEqual(one(evaluate(total({ s0: { none: true } }), 'lp')), { none: true });      /* None with anything is None */
  const g = total(); g.nodes.top = V(ty(1, 1), { '1,1': { expr: 'index.x' } }); g.nodes.body.inputs = ['top', 'bot'];
  assert.match(one(evaluate(g, 'lp')).err, /not in a tile/);
});
test('loop: both validators\' rules, each refusal with its sentence', () => {
  const bad = (change, why) => { const g = total(); change(g); const got = validate(g); assert.ok(got.some(m => why.test(m)), JSON.stringify(got)); };
  bad(g => { g.nodes['param(f:1)'].type = ty(1, 3); }, /its step takes 1 × 3 and one cell is 1 × 2/);
  bad(g => { g.nodes.lp.state = { col: 0, row: 0, cols: 1, rows: 2 }; g.nodes.rep.state = g.nodes.lp.state; g.nodes.c.entries = { '1,1': 1 }; g.nodes.lp.type = ty(1, 2); }, /its step gives 1 × 1 and its state is 1 × 2/);
  bad(g => { g.nodes.lp.state = { col: 0, row: 0, cols: 1, rows: 2 }; }, /a state block holds something other than its own typed entries/);
  bad(g => { g.nodes.lp.state = { col: 0, row: 1, cols: 2, rows: 1 }; }, /its state runs past its pattern/);
  bad(g => { g.nodes.s.type = ty(1, 2); g.nodes.lp.pattern.rows = 3; g.nodes.lp.state = { col: 0, row: 1, cols: 1, rows: 1 }; }, /its state blocks do not fill its state exactly/);
  bad(g => { g.nodes.lp.count = 0; }, /count is a whole number/);
  bad(g => { g.nodes.lp.until = 2; }, /until is null or the place/);
  bad(g => { g.nodes.lp.across = 0; }, /across is a whole number/);
  bad(g => { delete g.nodes.lp.fn; }, /fn is a function id and state/);
  bad(g => { delete g.nodes.rep.state; }, /both or neither/);
  bad(g => { g.nodes.lp.extra = 1; }, /a loop holds no extra/);
  bad(g => { delete g.spaces.top.tiles[0].loop; delete g.spaces.top.tiles[0].step; }, /a loop that is no tile's/);
  bad(g => { delete g.spaces.top.tiles[0].step; }, /both or neither/);
  bad(g => { g.nodes.c.entries = { '1,1': 1 }; g.nodes.rep.state = { col: 0, row: 0, cols: 1, rows: 1 }; }, /not of one pattern, state and step/);
  bad(g => { g.version = 4; }, /needs version 5/);
  bad(g => { g.version = 4; delete g.nodes.lp; g.spaces.top.tiles[0] = { ...g.spaces.top.tiles[0], step: undefined, loop: undefined }; delete g.spaces.top.tiles[0].step; delete g.spaces.top.tiles[0].loop; }, /it holds a step, which needs version 5/);
  const g = total(); delete g.nodes.s.within; assert.ok(validate(g).some(m => /s: within names the tiles none and it belongs to t:T/.test(m)));      /* a state block follows its cell */
});

/* ---- canvases: a tile with a step, as build reads it (tests/looping.js) ---- */
import { build } from '../graph.js';
import { LOOPS, runningTotal, counting, adds, B, arrow, space } from './looping.js';
import * as tiles from '../tiles.js';

const made = s => { const g = build(s); assert.deepEqual(validate(g), []); const t = g.spaces.top.tiles.find(t => t.tile === 't:T'), a = g.spaces.top.arrows.find(a => a.arrow === 'step'); return { g, t, a }; };
const row = (g, id, r) => { const a = evaluate(g, id), out = []; for (let c = 1; c <= a.type.cols; c++) out.push(a.entries[c + ',' + r]); return out; };
test('build: the running total: the cells show 0, 3, 4, 8 and the step\'s output 9', () => {
  const { g, t, a } = made(LOOPS['loops: the running total']);
  assert.equal(a.node, t.loop); assert.equal(t.step, 'step'); assert.equal(g.nodes[t.loop].op, 'loop');
  assert.deepEqual(evaluate(g, t.loop).entries, { '1,1': 9 });
  assert.deepEqual(row(g, t.node, 1), [3, 1, 4, 1]);      /* the block seated on the repeated arrow lies in the pattern, and in cell k holds the arrow's k-th run (ruling 4) */
  assert.deepEqual(row(g, t.node, 2), [0, 3, 4, 8]);      /* each cell's state */
  const take = g.nodes[g.spaces.top.arrows.find(a => a.arrow === 'take').node];
  assert.equal(take.op, 'mapalong'); assert.equal(take.count, 1); assert.deepEqual(take.through, [{ tile: 't:T', count: 4 }]);
  /* an arrow on another side reads the whole matrix, every cell with its state */
  const more = runningTotal({ shapes: [arrow('all', { id: 'T', as: 'tile' }, { side: 's' })] }), h = build(more), all = h.spaces.top.arrows.find(a => a.arrow === 'all');
  assert.equal(all.node, h.spaces.top.tiles[0].node); assert.equal(h.nodes[all.node].op, 'repeat'); assert.equal(h.nodes[all.node].fn, 'f:step');
  /* and with no step the same canvas is as it was before: the seated block in the pattern holds the arrow's first run in every cell */
  const plain = build(runningTotal({ repeat: { step: undefined } }));
  assert.equal(plain.nodes[plain.spaces.top.arrows.find(a => a.arrow === 'take').node].op, 'slice'); assert.deepEqual(row(plain, plain.spaces.top.tiles[0].node, 1), [3, 3, 3, 3]);
});
test('build: a settled count across and down; Stop when true; a stop block not known; no end; a count settled when run; 256 steps', () => {
  let m = made(LOOPS['loops: a counter, across and then down']);
  assert.deepEqual(evaluate(m.g, m.t.loop).entries, { '1,1': 6 }); assert.deepEqual([row(m.g, m.t.node, 2), row(m.g, m.t.node, 4)], [[0, 1], [3, 4]]);
  m = made(LOOPS['loops: a counter down the page']); assert.deepEqual(evaluate(m.g, m.t.loop).entries, { '1,1': 3 });
  m = made(LOOPS['loops: Stop when true']);
  assert.deepEqual(m.g.nodes[m.t.loop].count, 'inf'); assert.equal(m.g.nodes[m.t.loop].until, 2); assert.equal(m.t.node, null); assert.equal(m.t.error.note, tiles.ENDLESS);
  assert.deepEqual(evaluate(m.g, m.t.loop).entries, { '1,1': 6 }); assert.equal(stoppedAt(m.g, m.t.loop), 4);      /* 0, 1, 3, 6: the fourth cell is the first where S >= 4 */
  m = made(LOOPS['loops: a stop block that is not known']); assert.deepEqual(evaluate(m.g, m.t.loop).entries, {});
  m = made(LOOPS['loops: no end and no stop block']); assert.deepEqual(evaluate(m.g, m.t.loop), { type: m.g.nodes[m.t.loop].type, deferred: true, forever: true });
  assert.deepEqual([1, 2, 3].map(k => evaluate(m.g, 'v:S', { binding: { cells: [{ x: k - 1, y: 0, dx: 0, dy: 1, cx: k, cy: 1, of: ['t:T'] }] } }).entries['1,1']), [0, 1, 3]);      /* its first cells show their state */
  m = made(LOOPS['loops: a count settled only when it is run']);
  assert.deepEqual(m.g.nodes[m.t.loop].count, { input: 2 }); assert.equal(m.t.error.note, tiles.AT_RUN); assert.deepEqual(evaluate(m.g, m.t.loop).entries, { '1,1': 15 });      /* five steps */
  m = made(LOOPS['loops: more steps than are worked out in the browser']); assert.deepEqual(evaluate(m.g, m.t.loop), { type: m.g.nodes[m.t.loop].type, deferred: true, steps: 256 });
});
test('build: None as state, inner data as state, and an inner tile\'s own step starting again in each outer cell', () => {
  let m = made(LOOPS['loops: None as state']); assert.deepEqual(evaluate(m.g, m.t.loop).entries, { '1,1': { none: true } });
  m = made(LOOPS['loops: inner data as state']); assert.deepEqual(evaluate(m.g, m.t.loop).entries, { '1,1,1': 10, '1,1,2': 30 });
  m = made(LOOPS['loops: a tile with a step inside a tile']);
  const outer = m.g.spaces.top.tiles.find(t => t.tile === 't:O').node;
  assert.deepEqual([2, 4].map(r => row(m.g, outer, r)), [[0, 1, 3, 6], [0, 1, 3, 6]]);      /* it steps the inner tile's cells and nothing else */
  assert.deepEqual(evaluate(m.g, m.t.loop).entries, { '1,1': 10 });
});
test('build: each refusal with its sentence', () => {
  const said = (s, code, note) => { const g = build(s); assert.deepEqual(validate(g), []); const a = g.spaces.top.arrows.find(a => a.arrow === 'step'); assert.equal(a.node, null); assert.deepEqual(a.error, { code, note }); return g; };
  said(counting({ inside: adds(1, 3) }), 'mismatch', tiles.STEP.takes('1 × 3', '1 × 2'));                 /* a step whose in is not the pattern's size */
  said(counting({ inside: adds(1, 2, [B('lone', 9, 9, 1, 1)]) }), 'pieces', '2 pieces');                    /* (a space that comes to no one matrix is that error, as for any arrow) */
  said(counting({ inside: space([B('in', -12, 0, 1, 2, { in: true })]) }), 'size', tiles.STEP.gives('1 × 2', '1 × 1'));      /* whose output is not the state rectangle's: it passes its cell through */
  said(counting({ shapes: [B('K', 1, 0, 1, 1, { entries: { '1,1': 5 } }), B('L', 1, 1, 1, 1, { entries: { '1,1': { expr: '1 + 1' } } })], members: [3, 4], repeat: { cols: 2 }, inside: adds(2, 2) }), 'mismatch', tiles.STEP.rectangle);      /* state blocks that do not fill one rectangle: S and K lie corner to corner */
  said(counting({ s0: { expr: '1 + 1' } }), 'mismatch', tiles.STEP.none);
  said(counting({ inside: adds(1, 2, [B('n', 5, 2, 1, 1, { entries: { '1,1': { expr: 'index.x' } } })]) }), 'mismatch', tiles.STEP.index);      /* the index read in a step */
  said(counting({ step: { side: 's' } }), 'mismatch', tiles.STEP.east);
  said(counting({ step: { formula: 'x + 1' } }), 'mismatch', tiles.STEP.formula);
  said(counting({ repeat: { across: 'inf', down: 2 } }), 'mismatch', tiles.STEP.oneWay);
  said(counting({ repeat: { until: 'nowhere' } }), 'no-source', tiles.STEP.stopGone);
  const lost = build(counting({ repeat: { step: 'gone' } })); assert.deepEqual(lost.spaces.top.tiles[0].error, { code: 'no-source', note: tiles.BAD_STEP + ': ' + tiles.STEP.gone });
  /* a step that does not fit leaves the tile no matrix, and the arrow on another side says so */
  const bad = build(counting({ inside: adds(1, 3), shapes: [arrow('all', { id: 'T', as: 'tile' }, { side: 's' })] }));
  assert.match(bad.spaces.top.tiles[0].error.note, /^its step does not fit: its in block is 1 × 3/); assert.equal(bad.spaces.top.arrows.find(a => a.arrow === 'all').error.code, 'no-source');
  /* an arrow repeated in a tile that does not end */
  const open = build(runningTotal({ repeat: { across: 'inf' } })); assert.deepEqual(open.spaces.top.arrows.find(a => a.arrow === 'take').error, { code: 'mismatch', note: tiles.STEP.openMapped });
});

/* ---- an error in words (graph.js: said), and an arrow that cannot be repeated through a tile with a step ---- */
import { said, CODES } from '../graph.js';
test('said: every error is a sentence, never a bare code or a count of pieces', () => {
  for (const code of CODES){ const s = said({ code, note: '' }); assert.ok(s.length > 8 && !CODES.includes(s), code + ': ' + s);
    for (const note of CODES){ const t = said({ code, note }); assert.ok(!CODES.includes(t) && !t.endsWith(': ' + note) && !t.endsWith('(' + note + ')'), code + ' ' + note + ': ' + t); } }
  assert.equal(said({ code: 'mismatch', note: tiles.STEP.east }), tiles.STEP.east);      /* a note that is a sentence is the sentence */
  assert.equal(said({ code: 'pieces', note: '2 pieces' }), 'its space holds 2 pieces, and not one matrix');
  assert.equal(said({ code: 'no-source', note: 'size' }), 'what it reads is not there: it is not the size it has to be');
  assert.equal(said({ code: 'nonsense', note: '' }), 'it has no value'); assert.equal(said(null), 'it has no value');
});
test('build: an arrow that cannot be repeated through a tile with a step says why, as the page then says it', () => {
  const take = s => { const g = build(s); assert.deepEqual(validate(g), []); return g.spaces.top.arrows.find(a => a.arrow === 'take').error; };
  const wide = runningTotal(); wide.top.shapes[0] = B('X', 0, 0, 3, 1, { entries: { '1,1': 3, '2,1': 1, '3,1': 4 } });
  assert.deepEqual(take(wide), { code: 'size', note: 'its last cell runs past its input, which has 3 columns' });
  assert.deepEqual(take(runningTotal({ repeat: { across: 6 } })), { code: 'size', note: 'its last cell runs past its input, which has 4 columns' });
  assert.deepEqual(take(runningTotal({ repeat: { across: 2, down: 2 } })), { code: 'mismatch', note: 'its tile repeats down, and an arrow against columns is repeated across only' });
  assert.deepEqual(take(runningTotal({ repeat: { across: 1, down: 4 } })), { code: 'mismatch', note: 'its tile repeats down, and an arrow against columns is repeated across only' });
  assert.deepEqual(take(runningTotal({ repeat: { across: 'inf' } })), { code: 'mismatch', note: tiles.STEP.openMapped });
  /* tiles.js says the same of each for the page (mapped), an open count included */
  const arrowS = { side: 's', start: 1, span: 1 }, rep = { x: 0, y: 3, cols: 1, rows: 2 };
  assert.equal(tiles.mapped(arrowS, rep, 4, 1, 3).warn, 'its last cell runs past its input, which has 3 columns');
  assert.equal(tiles.mapped(arrowS, rep, 2, 2, 4).warn, 'its tile repeats down, and an arrow against columns is repeated across only');
  assert.deepEqual(tiles.mapped(arrowS, rep, 1, 1, 4, { open: true }), { count: 1, through: [], warn: tiles.STEP.openMapped });
});

import { carry } from '../evaluate.js';
test('carry: the cell a loop stopped at goes over to the next graph with its answer', () => {
  const stopping = () => { const more = { stop: V(ty(1, 1), { '1,1': { expr: '$1 >= 3' } }, { inputs: ['s'], within: ['t:T'] }) };
    const g = total({ count: 'inf', across: 'inf', until: 2, more, loop: { inputs: ['c', 's', 'stop'], at: [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }], pattern: { cols: 1, rows: 3 } } });
    g.nodes['param(f:1)'].type = ty(1, 3); g.spaces.top.tiles[0].blocks.push('stop'); g.blocks.stop = 'stop'; return g; };
  const g = stopping(); assert.equal(one(evaluate(g, 'lp')), 3); assert.equal(stoppedAt(g, 'lp'), 3);
  const h = stopping(); h.nodes.other = V(ty(1, 1), { '1,1': 7 });      /* an unrelated block was added */
  assert.equal(stoppedAt(h, 'lp'), null); assert.ok(carry(g, h) > 0);
  assert.equal(one(evaluate(h, 'lp')), 3); assert.equal(stoppedAt(h, 'lp'), 3);
  const k = stopping(); k.nodes.s.entries = { '1,1': 5 }; carry(g, k); assert.equal(stoppedAt(k, 'lp'), null);      /* a loop that is no longer the same takes nothing over */
  assert.equal(one(evaluate(k, 'lp')), 5); assert.equal(stoppedAt(k, 'lp'), 1);
});

test('loop: a count far past what is worked out here is deferred at once, and a count that is true is one step', () => {
  const n = v => ({ n: V(ty(1, 1), { '1,1': v }) }), by = v => total({ count: { input: 2 }, across: 'inf', more: n(v) });
  const big = by(3000000000), began = Date.now();
  assert.deepEqual(evaluate(big, 'lp'), { type: big.nodes.lp.type, deferred: true, steps: 256 }); assert.ok(Date.now() - began < 1000, 'took ' + (Date.now() - began) + ' ms');
  const fixed = total({ count: 3000000000, across: 'inf' }); assert.deepEqual(evaluate(fixed, 'lp'), { type: fixed.nodes.lp.type, deferred: true, steps: 256 });
  assert.deepEqual(evaluate(by(257), 'lp'), { type: big.nodes.lp.type, deferred: true, steps: 256 });
  assert.equal(one(evaluate(by(256), 'lp')), 256 * 257 / 2);
  assert.equal(one(evaluate(by(true), 'lp')), 1);      /* true counts as 1: one step, 0 + 1 */
  assert.match(one(evaluate(by(false), 'lp')).err, /whole number/);      /* and false as 0, which is no count */
});

import { settledCounts } from '../evaluate.js';
import { createBackend } from '../backend.js';
test('settledCounts: a count the page has exactly is sent to the backend, which is not asked to find it', async () => {
  const n = v => ({ n: V(ty(1, 1), v === null ? {} : { '1,1': v }) }), by = v => total({ count: { input: 2 }, across: 'inf', more: n(v) });
  assert.deepEqual(settledCounts(by(4)), { lp: 4 });
  const third = by({ expr: '(1/7)*21' }); assert.deepEqual(validate(third), []); assert.deepEqual(settledCounts(third), { lp: 3 }); assert.equal(one(evaluate(third, 'lp')), 6);      /* 3 exactly here; 3.0000002 in 32-bit floats */
  assert.deepEqual(settledCounts(by(true)), { lp: 1 });
  for (const v of [null, { n: 1, d: 2, k: 0 }, 0, false, 'inf']) assert.deepEqual(settledCounts(by(v)), {}, JSON.stringify(v));      /* not known, no whole number, no end: nothing to send */
  assert.deepEqual(settledCounts(total()), {});                                    /* a count written on the loop is no count to send */
  const inside = by(4); inside.nodes.n.within = ['f:9']; assert.deepEqual(settledCounts(inside), {});      /* one that follows what a function is given has no one value */
  assert.deepEqual(settledCounts(null), {});
  /* and backend.js sends them with the run */
  const sent = [], waits = [], g = by({ expr: '(1/7)*21' });
  const fetch = (path, options) => { if (options) sent.push(JSON.parse(options.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve(path.endsWith('health') ? { ok: true, version: g.version } : { results: {}, errors: {} }) }); };
  const b = createBackend({ fetch, later: fn => { waits.push(fn); return waits.length; }, cancel: () => {}, version: g.version, counts: settledCounts });
  await b.health(); b.ask(g, 'lp', null, [[1, 1]], 'a'); while (waits.length) waits.shift()(); await new Promise(r => setTimeout(r, 0));
  assert.equal(sent.length, 1); assert.deepEqual(sent[0].counts, { lp: 3 });
});

test('a count that is no count is never said by its stored text; the east side of a tile with a step; a count that is not pulled', () => {
  for (const note of ['@[bf8vc0b:m]', '2 * @[b1:x]', '0']){ const t = said({ code: 'size-unknown', note }); assert.ok(!/@\[|bf8vc0b/.test(t) && t.length > 8, t); }
  assert.equal(tiles.STEP.noCount('across: a count is a whole number, at least 1, and that comes to 0'), 'its tile has no count to run it by (across: a count is a whole number, at least 1, and that comes to 0)');
  /* a second arrow on the east side of a tile with a step is refused; the step itself, another side, and a tile with no step are not */
  const rep = { x: 0, y: 0, cols: 1, rows: 2, across: 4, down: 1, step: 'a1' };
  assert.equal(tiles.sideFree(rep, 'e', null, 'Total').refused, 'Total has a step, the one arrow its east side takes: set the arrow against another side of the tile');
  assert.match(tiles.sideFree(rep, 'e', 'a2').refused, /^This tile has a step/);
  assert.deepEqual(tiles.sideFree(rep, 'e', 'a1'), { ok: true }); assert.deepEqual(tiles.sideFree(rep, 's', null), { ok: true });
  assert.deepEqual(tiles.sideFree({ ...rep, step: undefined }, 'e', null), { ok: true }); assert.deepEqual(tiles.sideFree(undefined, 'e'), { ok: true });
  /* an open count is typed, not pulled */
  assert.match(tiles.pullable('inf').refused, /does not end.*Type the count in the tile's panel/); assert.match(tiles.pullable('run').refused, /settled only when it is run/);
  assert.deepEqual(tiles.pullable(null), { ok: true }); assert.deepEqual(tiles.pullable(undefined), { ok: true });
});

import { stuckAt } from '../evaluate.js';
test('loop: a stop block that is an error or not known says which cell and why', () => {
  const stopping = entries => { const more = { stop: V(ty(1, 1), entries, { inputs: ['s'], within: ['t:T'] }) };
    const g = total({ count: 'inf', across: 'inf', until: 2, more, loop: { inputs: ['c', 's', 'stop'], at: [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }], pattern: { cols: 1, rows: 3 } } });
    g.nodes['param(f:1)'].type = ty(1, 3); g.spaces.top.tiles[0].blocks.push('stop'); g.blocks.stop = 'stop'; return g; };
  let g = stopping({ '1,1': { expr: '0 / (3 - $1)' } });      /* states 0, 1, 3: 0/3 and 0/2 are false, and 0/0 in the third cell is an error */
  assert.deepEqual(evaluate(g, 'lp').entries, {}); assert.equal(stuckAt(g, 'lp').cell, 3); assert.match(stuckAt(g, 'lp').err, /zero|no value/);
  const h = stopping({ '1,1': { expr: '0 / (3 - $1)' } }); h.nodes.other = V(ty(1, 1), { '1,1': 7 }); carry(g, h); assert.equal(stuckAt(h, 'lp').cell, 3);      /* and it is carried with the answer */
  g = stopping({ '1,1': { expr: '$1 >= 3' } }); assert.equal(one(evaluate(g, 'lp')), 3); assert.equal(stuckAt(g, 'lp'), null);
  assert.equal(tiles.STEP.stuck('Stop', 3, 'division by zero'), 'Its stop block Stop is an error in cell 3 (division by zero), so it cannot be told whether the tile stops there: what the step gives is not known');
  assert.match(tiles.STEP.stuck('', 1, null), /^Its stop block is not known in cell 1, so/);
  assert.match(tiles.STEP.stopLost('Stop', 'a cycle: it depends on itself'), /^Its stop block Stop has no value \(a cycle: it depends on itself\)/);
});

import { truthAt } from '../evaluate.js';
test('loop: a state block in a later cell is the backend\'s where its pattern is, and past 256 steps it is not judged by its own entries', () => {
  const at = (k, id = 's') => ({ binding: { cells: [{ x: k - 1, y: 0, dx: 0, dy: id === 's' ? 1 : 0, cx: k, cy: 1, of: ['t:T'] }] } });
  /* noise in the pattern: the state of every cell after the first is made of it */
  const g = total(); g.nodes.c = { op: 'noise', inputs: [], type: ty(1, 1), seed: 1, dist: 'uniform', key: 'c', within: ['t:T'] }; assert.deepEqual(validate(g), []);
  assert.equal(one(evaluate(g, 's', at(1))), 0);                                                   /* the first cell is the block's own entries */
  assert.deepEqual(evaluate(g, 's', at(2)), { type: g.nodes.s.type, deferred: true, backend: true });
  assert.deepEqual(evaluate(g, 's', at(4)), { type: g.nodes.s.type, deferred: true, backend: true });
  assert.deepEqual(evaluate(g, 'lp'), { type: g.nodes.lp.type, deferred: true, backend: true });
  /* 300 across: cell 300's state is deferred for its steps, and is not called false for the 0 typed into the block */
  const h = total({ count: 300, across: 300 });
  assert.deepEqual(evaluate(h, 's', at(300)), { type: h.nodes.s.type, deferred: true, steps: 256 }); assert.equal(truthAt(h, 's', at(300)), null);
  assert.equal(truthAt(h, 's', at(1)), false); assert.equal(truthAt(h, 's', at(3)), true);      /* 0, and 0 + 1 + 2 */
});
