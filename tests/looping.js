/* Graphs written by hand for a tile with a step (graph.js: loop, and a repeat with fn and state): for tests/loops.test.js
   and for the backend's fixtures (backend/fixtures/generate.mjs), which hold the backend to the same answers. */
import { VERSION } from '../graph.js';

export const ty = (cols, rows, inner) => ({ cols, rows, colsName: null, rowsName: null, ...(inner ? { inner } : {}) });
export const V = (type, entries, more = {}) => ({ op: 'variable', inputs: [], type, name: '', named: false, defined: 'entries', entries, ...more });
export const N = (op, inputs, type, more = {}) => ({ op, inputs, type, ...more });
const cut = (row, w = ['f:1']) => N('slice', ['param(f:1)'], ty(1, 1), { range: { col: 0, row, cols: 1, rows: 1 }, within: w });
/* a tile 1 by 2, c over s: c is the index (worked out afresh in each cell), s the state; the step adds the two rows */
export function total({ count = 4, across = 4, until = null, s0 = 0, more = {}, loop = {}, c = { '1,1': { expr: 'index.x' } }, version = VERSION } = {}){
  const at = [{ col: 0, row: 0 }, { col: 0, row: 1 }], state = { col: 0, row: 1, cols: 1, rows: 1 }, pattern = { cols: 1, rows: 2 }, byInput = !!count && typeof count === 'object';
  const nodes = { c: V(ty(1, 1), c, { within: ['t:T'] }), s: V(ty(1, 1), s0 === null ? {} : { '1,1': s0 }, { within: ['t:T'] }),
    'param(f:1)': N('param', [], ty(1, 2), { within: ['f:1'] }), top: cut(0), bot: cut(1), body: N('add', ['top', 'bot'], ty(1, 1), { within: ['f:1'] }),
    ...more,
    lp: N('loop', byInput ? ['c', 's', 'n'] : ['c', 's'], ty(1, 1), { at, pattern, state, fn: 'f:1', count: byInput ? { input: 2 } : count, until, across, ...loop }) };
  const settled = Number.isInteger(count) && Number.isInteger(across);
  if (settled) nodes.rep = N('repeat', ['c', 's'], ty(across, 2 * Math.ceil(count / across)), { at, pattern, across, down: Math.ceil(count / across), fn: 'f:1', state });
  return { version, nodes, functions: { 'f:1': { input: 'param(f:1)', body: 'body' } },
    spaces: { top: { owner: null, pieces: [], arrows: [], tiles: [{ tile: 't:T', blocks: ['c', 's'], arrows: [], node: settled ? 'rep' : null, error: settled ? null : { code: 'size-unknown', note: '' }, step: 'a', loop: 'lp' }] } }, blocks: { c: 'c', s: 's' } };
}

/* ---- canvases: snapshots as the page gathers them ---- */
export const B = (id, x, y, cols, rows, more = {}) => ({ id, type: 'tensor', name: id, x, y, cols, rows, colsName: null, rowsName: null, entries: {}, inside: null, variable: null, ...more });
export const space = (shapes, groups = [], operations = []) => ({ shapes, groups, operations });
export const arrow = (id, input, more = {}, shapeMore = {}) => B(id, 0, 0, 1, 1, { type: 'arrow', name: 'Shape 9', arrow: { input, side: 'e', start: 1, span: 1, gap: 2, gapName: null, output: null, formula: null, ...more }, ...shapeMore });
/* a step's space: in, c columns by r rows, cut into its rows by an arrow on each (a pass-through, on the east side),
   and the blocks seated on those set one over the next: a sum */
export const adds = (cols = 1, rows = 2, more = [], take = rows, inner = undefined) => space([B('in', -12, 0, cols, rows, { in: true, ...(inner ? { inner } : {}) }),
  ...Array.from({ length: take }, (_, k) => arrow('cut' + k, { id: 'in', as: 'block' }, { start: k + 1 }, { x: -11 + cols, y: k })),
  ...Array.from({ length: take }, (_, k) => B('row' + k, 5, k, cols, 1, { name: 'Shape ' + (20 + k), seat: 'cut' + k, ...(inner ? { inner } : {}) })), ...more]);
/* The running total. X = [3 1 4 1]; a tile 4 across whose pattern is x over S; x is seated on an arrow under column 1
   of X, S holds 0; the step (east of the tile) cuts the two rows of in apart and adds them. The cells show 0, 3, 4, 8
   and the step's output 9. more: the tile's repeat, changed; shapes, groups: added to the canvas. */
export function runningTotal({ repeat = {}, shapes = [], groups = [], s0 = 0, step = {}, members = [], inside = adds() } = {}){
  return { top: space([
    B('X', 0, 0, 4, 1, { entries: { '1,1': 3, '2,1': 1, '3,1': 4, '4,1': 1 } }),
    arrow('take', { id: 'X', as: 'block' }, { side: 's' }, { x: 0, y: 1, rows: 2 }),
    B('x', 0, 3, 1, 1, { seat: 'take' }),
    B('S', 0, 4, 1, 1, { entries: s0 === null ? {} : { '1,1': s0 } }),
    arrow('step', { id: 'T', as: 'tile' }, step, { inside }),
    ...shapes],
  [{ id: 'T', name: 'Total', members: [2, 3, ...members], groups: [], repeat: { x: 0, y: 3, cols: 1, rows: 2, across: 4, down: 1, step: 'step', ...repeat } }, ...groups]) };
}

/* A counter. A tile whose pattern is C over S: C holds index.x (worked out afresh in each cell), S the state, from s0;
   the step adds the rows it is told to (take; all of them where left out). */
export function counting({ repeat = {}, shapes = [], groups = null, s0 = 0, members = [], inside = adds(), more = {}, step = {}, c = { '1,1': { expr: 'index.x' } } } = {}){
  const tile = { id: 'T', name: 'Count', members: [0, 1, ...members], groups: [], repeat: { x: 0, y: 0, cols: 1, rows: 2, across: 4, down: 1, step: 'step', ...repeat } };
  return { top: space([
    B('C', 0, 0, 1, 1, { entries: c, ...more }),
    B('S', 0, 1, 1, 1, { entries: s0 === null ? {} : typeof s0 === 'object' && !('none' in s0) && !('n' in s0) && !('expr' in s0) ? s0 : { '1,1': s0 }, ...more }),
    arrow('step', { id: 'T', as: 'tile' }, step, { inside }),
    ...shapes], groups ? groups(tile) : [tile]) };
}
const two = [{ length: 2, name: null }];
/* canvases with a step, by name: tests/loops.test.js says what each comes to, and the backend's fixtures hold the backend to the same */
export const LOOPS = {
  'loops: the running total': runningTotal(),
  'loops: a counter, across and then down': counting({ repeat: { across: 2, down: 2 } }),
  'loops: a counter down the page': counting({ repeat: { across: 1, down: 3 } }),
  'loops: Stop when true': counting({ repeat: { rows: 3, across: 'inf', until: 'stop' }, shapes: [B('stop', 0, 2, 1, 1, { entries: { '1,1': { expr: '@[S:m] >= 4' } } })], members: [3], inside: adds(1, 3, [], 2) }),
  'loops: a stop block that is not known': counting({ repeat: { rows: 3, across: 'inf', until: 'stop' }, shapes: [B('stop', 0, 2, 1, 1, { entries: { '1,1': { expr: '@[U:m] > 0' } } }), B('U', 10, 10, 1, 1)], members: [3], inside: adds(1, 3, [], 2) }),      /* (a stop block with nothing typed into it would be state) */
  'loops: no end and no stop block': counting({ repeat: { across: 'inf' } }),
  'loops: a count settled only when it is run': counting({ repeat: { across: { expr: '@[N:a:times]' } }, shapes: [B('N', 10, 10, 1, 1, { attributes: [{ name: 'times', value: '2 + 3' }] })] }),
  'loops: more steps than are worked out in the browser': counting({ repeat: { across: 300 } }),
  'loops: None as state': counting({ s0: { none: true } }),
  'loops: inner data as state': counting({ more: { inner: two }, c: { '1,1,1': { expr: 'index.x' }, '1,1,2': { expr: '2 * index.x' } }, s0: { '1,1,1': 0, '1,1,2': 10 }, inside: adds(1, 2, [], 2, two) }),
  'loops: a tile with a step inside a tile': counting({ groups: tile => [{ id: 'O', name: 'Outer', members: [], groups: [tile], repeat: { x: 0, y: 0, cols: 4, rows: 2, across: 1, down: 2 } }], shapes: [arrow('all', { id: 'O', as: 'tile' }, { side: 's' })] }),
};
