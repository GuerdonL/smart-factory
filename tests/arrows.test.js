/* arrows.js: what an arrow means. Run with: node --test */
import './solver.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { along, covered, coveredType, base, strip, triangle, place, free, edgeAt, adjust, settable, sided, came, check, standing, passed, worked, names, fits, fitting, seatable, carried } from '../arrows.js';
import { pieces, pieceHollows, resultHollows } from '../algebra.js';
import { FUNCTIONS } from '../system.js';

const arrow = (side = 'e', start = 1, span = 1, gap = 2, more = {}) => ({ input: { id: 'b1', as: 'block' }, side, start, span, gap, gapName: null, output: null, formula: null, ...more });
const R = { x: 2, y: 3, w: 4, h: 3 };                      /* a 4 by 3 block */
const T = { cols: 4, rows: 3, colsName: 'embed', rowsName: 'context' };
const input = (rect = R, more = {}) => ({ rect, cols: rect.w, rows: rect.h, colsName: null, rowsName: null, ...more });
const M = pairs => new Map(Object.entries(pairs));

test('the base runs along rows on e and w, along columns on n and s', () => {
  assert.deepEqual(['n', 'e', 's', 'w'].map(along), ['cols', 'rows', 'cols', 'rows']);
});

test('what is covered: whole rows or whole columns of the input, from 0', () => {
  assert.deepEqual(covered(arrow('e', 1, 3), T), { col: 0, row: 0, cols: 4, rows: 3 });
  assert.deepEqual(covered(arrow('w', 2, 2), T), { col: 0, row: 1, cols: 4, rows: 2 });
  assert.deepEqual(covered(arrow('s', 4, 1), T), { col: 3, row: 0, cols: 1, rows: 3 });
  assert.deepEqual(covered(arrow('n', 1, 4), T), { col: 0, row: 0, cols: 4, rows: 3 });
});
test('a span that runs past the input covers nothing: the boundary is the last row or column', () => {
  assert.notEqual(covered(arrow('e', 3, 1), T), null);      /* the last row */
  assert.equal(covered(arrow('e', 3, 2), T), null);         /* one past it */
  assert.equal(covered(arrow('e', 1, 4), T), null);
  assert.notEqual(covered(arrow('s', 1, 4), T), null);
  assert.equal(covered(arrow('s', 2, 4), T), null);
  assert.equal(covered(arrow('e', 0, 1), T), null); assert.equal(covered(arrow('e', 1, 0), T), null); assert.equal(covered(arrow('e', 1.5, 1), T), null);
});
test('the covered part keeps a side\'s name only where the whole side is covered', () => {
  assert.deepEqual(coveredType(arrow('e', 1, 3), T), { cols: 4, rows: 3, colsName: 'embed', rowsName: 'context' });
  assert.deepEqual(coveredType(arrow('e', 1, 2), T), { cols: 4, rows: 2, colsName: 'embed', rowsName: null });
  assert.deepEqual(coveredType(arrow('n', 2, 3), T), { cols: 3, rows: 3, colsName: null, rowsName: 'context' });
  assert.equal(coveredType(arrow('n', 2, 4), T), null);
});

test('the base, the gap in front of it, and the output\'s place, on each side', () => {
  assert.deepEqual(base(arrow('e', 2, 2), R), { x: 6, y: 4, w: 0, h: 2 });
  assert.deepEqual(base(arrow('w', 2, 2), R), { x: 2, y: 4, w: 0, h: 2 });
  assert.deepEqual(base(arrow('s', 3, 2), R), { x: 4, y: 6, w: 2, h: 0 });
  assert.deepEqual(base(arrow('n', 3, 2), R), { x: 4, y: 3, w: 2, h: 0 });
  assert.deepEqual(strip(arrow('e', 2, 2, 3), R), { x: 6, y: 4, w: 3, h: 2 });
  assert.deepEqual(strip(arrow('w', 2, 2, 3), R), { x: -1, y: 4, w: 3, h: 2 });
  assert.deepEqual(strip(arrow('s', 3, 2, 1), R), { x: 4, y: 6, w: 2, h: 1 });
  assert.deepEqual(strip(arrow('n', 3, 2, 1), R), { x: 4, y: 2, w: 2, h: 1 });
  /* the output starts gap units from the edge, its first row or column level with the first one covered */
  const size = { cols: 4, rows: 2 };
  assert.deepEqual(place(arrow('e', 2, 2, 3), R, size), { x: 9, y: 4, w: 4, h: 2 });
  assert.deepEqual(place(arrow('w', 2, 2, 3), R, size), { x: -5, y: 4, w: 4, h: 2 });
  assert.deepEqual(place(arrow('s', 3, 2, 1), R, { cols: 2, rows: 3 }), { x: 4, y: 7, w: 2, h: 3 });
  assert.deepEqual(place(arrow('n', 3, 2, 1), R, { cols: 2, rows: 3 }), { x: 4, y: -1, w: 2, h: 3 });
});
test('the output is always on whole units, whatever the span and the gap', () => {
  for (const side of ['n', 'e', 's', 'w']) for (let start = 1; start <= 3; start++) for (let gap = 1; gap <= 4; gap++){
    const p = place(arrow(side, start, 1, gap), R, { cols: 3, rows: 5 });
    assert.ok([p.x, p.y, p.w, p.h].every(Number.isInteger), side + start + gap); }
});
test('the triangle is centred in the gap and on the span, pointing away', () => {
  assert.deepEqual(triangle(arrow('e', 1, 3, 2), R), [[6.25, 3], [6.25, 6], [7.75, 4.5]]);      /* 1.5 deep in a gap of 2: a quarter of air each side */
  assert.deepEqual(triangle(arrow('e', 2, 1, 2), R), [[6.5, 4], [6.5, 5], [7.5, 4.5]]);
  assert.deepEqual(triangle(arrow('w', 2, 1, 2), R), [[1.5, 4], [1.5, 5], [0.5, 4.5]]);
  assert.deepEqual(triangle(arrow('s', 1, 2, 1), R), [[2, 6], [4, 6], [3, 7]]);
  assert.deepEqual(triangle(arrow('n', 1, 2, 3), R), [[2, 2], [4, 2], [3, 1]]);
  assert.deepEqual(triangle(arrow('e', 1, 3, 1), R), [[6, 3], [6, 6], [7, 4.5]]);      /* never deeper than the gap */
});

test('an arrow needs a free edge: nothing may lie against the part under its base', () => {
  const a = arrow('e', 2, 1);                               /* row 2 of the right edge: y 4 to 5 at x 6 */
  assert.equal(free(a, R, []), true);
  assert.equal(free(a, R, [{ x: 6, y: 4, w: 2, h: 1 }]), false);      /* against exactly that row */
  assert.equal(free(a, R, [{ x: 6, y: 3, w: 2, h: 3 }]), false);      /* against the whole edge */
  assert.equal(free(a, R, [{ x: 6, y: 4.5, w: 1, h: 3 }]), false);    /* against part of it */
  assert.equal(free(a, R, [{ x: 6, y: 3, w: 2, h: 1 }]), true);       /* against the row above: it meets the base only at a corner */
  assert.equal(free(a, R, [{ x: 6, y: 5, w: 2, h: 1 }]), true);       /* and the row below */
  assert.equal(free(a, R, [{ x: 7, y: 4, w: 2, h: 1 }]), true);       /* a unit clear of the edge */
  assert.equal(free(a, R, [{ x: 0, y: 4, w: 2, h: 1 }]), true);       /* against the other side */
  assert.equal(free(arrow('w', 2, 1), R, [{ x: 0, y: 4, w: 2, h: 1 }]), false);
  assert.equal(free(arrow('s', 1, 2), R, [{ x: 2, y: 6, w: 1, h: 1 }]), false);
  assert.equal(free(arrow('s', 3, 2), R, [{ x: 2, y: 6, w: 2, h: 1 }]), true);
  assert.equal(free(arrow('n', 1, 4), R, [{ x: 5, y: 1, w: 3, h: 2 }]), false);
  assert.equal(free(arrow('n', 1, 4), R, [{ x: 6, y: 1, w: 3, h: 2 }]), true);
});

test('the edge nearest a point, and which row or column of it', () => {
  assert.deepEqual(edgeAt(R, { x: 6.2, y: 4.5 }), { side: 'e', at: 2, distance: 0.20000000000000018 });
  assert.equal(edgeAt(R, { x: 5.9, y: 3.1 }).side, 'e'); assert.equal(edgeAt(R, { x: 5.9, y: 3.1 }).at, 1);
  assert.deepEqual(edgeAt(R, { x: 2, y: 5.9 }), { side: 'w', at: 3, distance: 0 });
  assert.deepEqual(edgeAt(R, { x: 5.5, y: 6 }), { side: 's', at: 4, distance: 0 });
  assert.deepEqual(edgeAt(R, { x: 2.5, y: 3 }), { side: 'n', at: 1, distance: 0 });
  assert.equal(edgeAt(R, { x: 4, y: 4.5 }), null);          /* the middle of the block is no edge */
  assert.equal(edgeAt(R, { x: 6.6, y: 4.5 }), null);        /* too far out */
  assert.notEqual(edgeAt(R, { x: 6.5, y: 4.5 }), null);     /* just in reach */
  assert.equal(edgeAt(R, { x: 6.2, y: 7 }), null);          /* past the end of the edge */
  assert.equal(edgeAt(R, { x: 6.9, y: 4.5 }, 1).side, 'e');
});

test('dragging: sliding along the edge, pulling an end of the base, changing the gap', () => {
  const a = arrow('e', 2, 2, 2);                            /* rows 2 and 3 of 5 */
  assert.deepEqual(adjust(a, 5, { start: 4 }), { start: 4, span: 2, gap: 2 });
  assert.deepEqual(adjust(a, 5, { start: 9 }), { start: 4, span: 2, gap: 2 });      /* never past the last row */
  assert.deepEqual(adjust(a, 5, { start: -3 }), { start: 1, span: 2, gap: 2 });
  assert.deepEqual(adjust(a, 5, { first: 1 }), { start: 1, span: 3, gap: 2 });
  assert.deepEqual(adjust(a, 5, { first: 5 }), { start: 3, span: 1, gap: 2 });      /* never past the other end: at least one row */
  assert.deepEqual(adjust(a, 5, { last: 5 }), { start: 2, span: 4, gap: 2 });
  assert.deepEqual(adjust(a, 5, { last: 8 }), { start: 2, span: 4, gap: 2 });
  assert.deepEqual(adjust(a, 5, { last: 1 }), { start: 2, span: 1, gap: 2 });
  assert.deepEqual(adjust(a, 5, { gap: 4.4 }), { start: 2, span: 2, gap: 4 });
  assert.deepEqual(adjust(a, 5, { gap: 0 }), { start: 2, span: 2, gap: 1 });        /* a gap is at least 1 */
});

test('what can be typed for an arrow, and what is refused', () => {
  const a = arrow('e', 1, 3), n = side => along(side) === 'rows' ? 3 : 4;
  assert.deepEqual(settable(a, n, { gap: 5 }).arrow.gap, 5);
  assert.deepEqual(settable(a, n, { side: 's', span: 4 }).arrow.span, 4);
  assert.match(settable(a, n, { side: 's', span: 5 }).refused, /cannot exceed the input's columns: it has 4/);
  assert.match(settable(a, n, { span: 4 }).refused, /cannot exceed the input's rows: it has 3/);
  assert.match(settable(a, n, { start: 2 }).refused, /runs past the input's rows/);      /* 2 + 3 - 1 > 3 */
  assert.equal(settable(a, n, { start: 2, span: 2 }).arrow.start, 2);
  assert.match(settable(a, n, { gap: 0 }).refused, /Gap is a whole number, at least 1/);
  assert.match(settable(a, n, { span: 1.5 }).refused, /Span is a whole number/);
  assert.match(settable(a, n, { side: 'x' }).refused, /n, e, s or w/);
  assert.match(settable(a, n, { output: { cols: 0, rows: 2 } }).refused, /output size/);
  assert.deepEqual(settable(a, n, { output: { cols: 4, rows: 2 } }).arrow.output, { cols: 4, rows: 2 });
  assert.equal(settable({ ...a, output: { cols: 1, rows: 1 } }, n, { output: null }).arrow.output, null);
  assert.equal(settable(a, () => null, { span: 99 }).arrow.span, 99);      /* its input is gone: there is nothing to exceed */
});

test('what a function comes to: the covered part, unless a definition says otherwise; a formula comes first', () => {
  const part = { cols: 4, rows: 3, colsName: null, rowsName: null }, defined = { cols: 5, rows: 3, colsName: null, rowsName: null };
  assert.equal(came(arrow(), part, null), part);
  assert.equal(came(arrow(), part, defined), defined);
  assert.equal(came(arrow('e', 1, 1, 2, { formula: 'max(x, 0)' }), part, defined), part);
  assert.deepEqual(came(arrow(), part, { error: '2 pieces' }), { error: '2 pieces' });
});
test('checking against a promise: sizes, and names where both name a side', () => {
  const to = { cols: 4, rows: 3, colsName: 'embed', rowsName: null };
  assert.deepEqual(check(null, to), { ok: true, note: '' });      /* nothing promised, nothing checked */
  assert.deepEqual(check(null, { error: 'undefined' }), { ok: true, note: '' });
  assert.equal(check({ cols: 4, rows: 3 }, to).ok, true);
  assert.deepEqual(check({ cols: 4, rows: 2 }, to), { ok: false, note: '4×3 ≠ 4×2' });
  assert.deepEqual(check({ cols: 3, rows: 3 }, to), { ok: false, note: '4×3 ≠ 3×3' });
  assert.equal(check({ cols: 4, rows: 3, colsName: 'embed', rowsName: 'context' }, to).ok, true);      /* only one of them names the rows */
  assert.deepEqual(check({ cols: 4, rows: 3, colsName: 'key' }, to), { ok: false, note: 'embed ≠ key' });
  assert.deepEqual(check({ cols: 4, rows: 3 }, { error: 'undefined' }), { ok: false, note: 'undefined' });
});

test('an arrow as it stands: where its output is, and each reason for the warning colour', () => {
  const a = arrow('e', 1, 3, 2);
  assert.deepEqual(standing(a, input()), { warn: null, part: { cols: 4, rows: 3, colsName: null, rowsName: null }, came: { cols: 4, rows: 3, colsName: null, rowsName: null },
    type: { cols: 4, rows: 3, colsName: null, rowsName: null }, place: { x: 8, y: 3, w: 4, h: 3 } });
  assert.equal(standing(a, null).warn, 'its input is gone');
  assert.equal(standing(a, null).place, null);
  assert.equal(standing(arrow('e', 2, 3), input()).warn, 'its span runs past its input');
  assert.equal(standing(a, input(), [{ x: 6, y: 3, w: 1, h: 1 }]).warn, 'the edge under it is not free');
  assert.equal(standing(a, input(), [{ x: 8, y: 3, w: 4, h: 3 }]).warn, null);      /* a block on the output is not against the edge */
  /* a promise the function keeps, and one it does not: the output is drawn at the promised size all the same */
  assert.equal(standing({ ...a, output: { cols: 4, rows: 3 } }, input()).warn, null);
  const broken = standing({ ...a, output: { cols: 2, rows: 3 } }, input());
  assert.equal(broken.warn, 'it promises 2×3 and comes to 4×3');
  assert.deepEqual(broken.type, { cols: 2, rows: 3, colsName: null, rowsName: null }); assert.deepEqual(broken.place, { x: 8, y: 3, w: 2, h: 3 });
  /* names: the promise's are those of the block seated on it */
  assert.equal(standing({ ...a, output: { cols: 4, rows: 3 } }, input(R, { colsName: 'embed' }), [], { colsName: 'embed', rowsName: null }).warn, null);
  assert.equal(standing({ ...a, output: { cols: 4, rows: 3 } }, input(R, { colsName: 'embed' }), [], { colsName: 'key', rowsName: null }).warn, 'it promises 4×3 and comes to 4×3: embed ≠ key');
  /* a definition: what its one piece comes to */
  const product = { cols: 5, rows: 3, colsName: null, rowsName: null };
  assert.deepEqual(standing(a, input(), [], null, product).type, product);
  assert.deepEqual(standing(a, input(), [], null, product).place, { x: 8, y: 3, w: 5, h: 3 });
  assert.equal(standing({ ...a, output: { cols: 5, rows: 3 } }, input(), [], null, product).warn, null);
  assert.equal(standing({ ...a, output: { cols: 4, rows: 3 } }, input(), [], null, product).warn, 'it promises 4×3 and comes to 5×3');
  const none = standing(a, input(), [], null, { error: '2 pieces' });
  assert.equal(none.warn, 'what defines it has no size: 2 pieces'); assert.equal(none.type, null); assert.equal(none.place, null);
});

test('pass through: the covered rows or columns, unchanged', () => {
  const values = M({ '1,1': 1, '2,1': 2, '1,2': 3, '2,2': { n: 1, d: 2, k: 0 }, '2,3': true });
  assert.deepEqual(passed(values, { col: 0, row: 0, cols: 2, rows: 3 }), values);
  assert.deepEqual(passed(values, { col: 0, row: 1, cols: 2, rows: 2 }), M({ '1,1': 3, '2,1': { n: 1, d: 2, k: 0 }, '2,2': true }));      /* an entry not given stays not given */
  assert.deepEqual(passed(values, { col: 1, row: 0, cols: 1, rows: 3 }), M({ '1,1': 2, '1,2': { n: 1, d: 2, k: 0 }, '1,3': true }));
});

test('an entry formula is worked out once for every entry: x, i and j', () => {
  const x = M({ '1,1': 2, '2,1': -5 });
  assert.deepEqual(worked('max(x, 0)', { cols: 2, rows: 1, x }), M({ '1,1': 2, '2,1': 0 }));      /* ReLU */
  /* a causal mask: -∞ above the diagonal, the entry itself elsewhere; an entry not given stays unknown */
  const m = M({ '1,1': 1, '2,1': 2, '3,1': 3, '1,2': 4, '2,2': 5, '3,2': 6, '1,3': 7, '2,3': 8 });
  assert.deepEqual(worked('select(i > j, -inf, x)', { cols: 3, rows: 3, x: m }),
    M({ '1,1': 1, '2,1': -Infinity, '3,1': -Infinity, '1,2': 4, '2,2': 5, '3,2': -Infinity, '1,3': 7, '2,3': 8 }));      /* 3,3 was not given: left out */
  assert.deepEqual(worked('i == j', { cols: 2, rows: 2 }), M({ '1,1': true, '2,1': false, '1,2': false, '2,2': true }));      /* an identity */
  assert.deepEqual(worked('10 * j + i', { cols: 2, rows: 2 }), M({ '1,1': 11, '2,1': 12, '1,2': 21, '2,2': 22 }));      /* i is the column, j the row */
  assert.deepEqual(worked('1/x', { cols: 2, rows: 1, x: M({ '1,1': 4, '2,1': 0 }) }), M({ '1,1': { n: 1, d: 4, k: 0 }, '2,1': { err: 'divide by zero' } }));      /* an error is that entry's alone */
  assert.deepEqual(worked('x + 1', { cols: 2, rows: 1, x: M({ '1,1': 4 }) }), M({ '1,1': 5 }));
});
test('an entry formula: whole matrices, measures, and what cannot be read', () => {
  const x = M({ '1,1': 1, '2,1': 9 }), B = { cols: 2, rows: 1, values: M({ '1,1': 5, '2,1': 3 }) };
  const matrix = id => id === 'bB' ? B : id === 'bC' ? { cols: 3, rows: 1, values: new Map() } : undefined;
  const lookup = token => typeof token === 'string' ? undefined : token.id === 'bK' && token.measure === 'x' ? 4 : undefined;
  assert.deepEqual(worked('max(x, @[bB])', { cols: 2, rows: 1, x, matrix }), M({ '1,1': 5, '2,1': 9 }));      /* the larger of two matrices */
  assert.deepEqual(worked('x + @[bC]', { cols: 2, rows: 1, x, matrix }), M({ '1,1': { err: 'not the size of the output' }, '2,1': { err: 'not the size of the output' } }));
  assert.deepEqual(worked('x + @[gone]', { cols: 2, rows: 1, x, matrix }), M({ '1,1': { err: 'missing variable' }, '2,1': { err: 'missing variable' } }));
  assert.deepEqual(worked('x * @[bK:x]', { cols: 2, rows: 1, x, lookup }), M({ '1,1': 4, '2,1': 36 }));      /* a measure is that number */
  assert.deepEqual(worked('x + nope', { cols: 1, rows: 1, x }), M({ '1,1': { err: 'unknown name: nope' } }));
  assert.deepEqual(worked('X + I + J', { cols: 1, rows: 1, x }), M({ '1,1': 3 }));
  /* reading a formula as it is typed: x, i and j are known names, anything else is not */
  const known = names(lookup);
  assert.equal(known('x'), null); assert.equal(known('J'), null); assert.equal(known('w'), undefined); assert.equal(known({ id: 'bK', measure: 'x' }), 4);
});
test('the seven built-in functions come to what they say', () => {
  const by = Object.fromEntries(FUNCTIONS.map(f => [f.name, f.formula]));
  assert.deepEqual(Object.keys(by), ['.recip', '.sqrt', '.exp', '.ln', '.abs', '.tanh', '.erf']);
  const one = (name, v) => worked(by[name], { cols: 1, rows: 1, x: M({ '1,1': v }) }).get('1,1');
  assert.deepEqual(one('.recip', 4), { n: 1, d: 4, k: 0 }); assert.equal(one('.sqrt', 9), 3); assert.deepEqual(one('.sqrt', 2), { n: 2, k: 1 });
  assert.equal(one('.exp', 0), 1); assert.equal(one('.ln', 1), 0); assert.equal(one('.abs', -3), 3); assert.equal(one('.tanh', Infinity), 1); assert.equal(one('.erf', -Infinity), -1);
  assert.deepEqual(one('.exp', 2), { sym: 'e^2' });      /* symbolic: written exp(2) */
});

test('a new input must fit a named arrow: names where its input block has them, lengths where it has not', () => {
  const inner = { cols: 4, rows: 3, colsName: null, rowsName: null };
  assert.deepEqual(fits(inner, { cols: 4, rows: 3, colsName: 'embed', rowsName: null }), { ok: true });      /* an unnamed side meets any side of its length */
  assert.match(fits(inner, { cols: 5, rows: 3 }).refused, /has 4 columns, and this would give it 5/);
  assert.match(fits(inner, { cols: 4, rows: 2 }).refused, /has 3 rows, and this would give it 2/);
  const named = { cols: 4, rows: 3, colsName: 'embed', rowsName: null };
  assert.deepEqual(fits(named, { cols: 9, rows: 3, colsName: 'embed', rowsName: null }), { ok: true });      /* one name is one length, whatever it is here */
  assert.match(fits(named, { cols: 4, rows: 3, colsName: 'key', rowsName: null }).refused, /columns are embed/);
  assert.match(fits(named, { cols: 4, rows: 3, colsName: null, rowsName: null }).refused, /columns are embed/);      /* the same length is not enough */
});
test('where a named arrow goes on an edge', () => {
  const inner = { cols: 4, rows: 2, colsName: null, rowsName: null }, type = { cols: 4, rows: 5, colsName: null, rowsName: null };
  assert.deepEqual(fitting(inner, 'e', type, 1), { start: 1, span: 2 });
  assert.deepEqual(fitting(inner, 'e', type, 3), { start: 3, span: 2 });
  assert.deepEqual(fitting(inner, 'w', type, 5), { start: 4, span: 2 });      /* slid back so that it ends on the last row */
  assert.match(fitting(inner, 'e', { ...type, rows: 1 }, 1).refused, /has 2 rows, and there are only 1 here/);
  assert.match(fitting(inner, 'e', { ...type, cols: 3 }, 1).refused, /has 4 columns/);
  assert.match(fitting(inner, 's', type, 1).refused, /has 2 rows, and this would give it 5/);      /* its columns fit along the bottom, its rows do not */
  assert.deepEqual(fitting({ cols: 4, rows: 5, colsName: null, rowsName: null }, 's', type, 2), { start: 1, span: 4 });
  assert.deepEqual(fitting({ cols: 4, rows: 2, colsName: null, rowsName: 'context' }, 'e', { ...type, rowsName: 'context' }, 3), { start: 1, span: 5 });      /* a named side is the whole side */
  assert.match(fitting({ cols: 4, rows: 2, colsName: null, rowsName: 'context' }, 'e', type, 3).refused, /rows are context/);
  assert.deepEqual(fitting(null, 'e', type, 3), { start: 1, span: 5 });       /* a built-in function has no input of its own: the whole side */
  assert.deepEqual(fitting(null, 'n', type, 3), { start: 1, span: 4 });
});

test('what can be seated', () => {
  const plain = { name: 'H', named: true, uses: 1, reference: false, defined: false, standing: false, seated: false, part: false, measure: false, fused: false, arrow: false, input: false };
  assert.deepEqual(seatable({ ...plain, named: false, name: 'Shape 2' }), { ok: true });      /* unnamed */
  assert.deepEqual(seatable(plain), { ok: true });                                              /* the only use of a variable nothing defines */
  assert.match(seatable({ ...plain, reference: true, uses: 2 }).refused, /H is a reference/);
  assert.match(seatable({ ...plain, reference: true, uses: 2, seated: true }).refused, /H is a reference/);      /* a reference to a seated variable: it is the reference that is in the way */
  assert.match(seatable({ ...plain, uses: 2 }).refused, /used in 2 places/);
  assert.match(seatable({ ...plain, defined: true }).refused, /defined in its definition space/);
  assert.match(seatable({ ...plain, standing: true }).refused, /stands in a matrix/);
  assert.match(seatable({ ...plain, seated: true }).refused, /seated already/);
  assert.match(seatable({ ...plain, named: false, seated: true }).refused, /seated already/);
  assert.match(seatable({ ...plain, part: true }).refused, /part of another shape/);
  assert.match(seatable({ ...plain, measure: true }).refused, /measure of another shape/);
  assert.match(seatable({ ...plain, fused: true }).refused, /fused/);
  assert.match(seatable({ ...plain, arrow: true }).refused, /arrow cannot be seated/);
  assert.match(seatable({ ...plain, input: true }).refused, /function's input/);
});

test('a block carried out of a hollow: straight out along its row or column, at least a unit clear', () => {
  const h = { x: 4, y: 2, w: 3, h: 2 };
  assert.deepEqual(carried(h, { x: 9, y: 2, w: 3, h: 2 }), { side: 'e', gap: 2 });
  assert.deepEqual(carried(h, { x: 8, y: 2, w: 3, h: 2 }), { side: 'e', gap: 1 });      /* the least gap */
  assert.equal(carried(h, { x: 7, y: 2, w: 3, h: 2 }), null);                          /* against the hollow: no room for an arrow */
  assert.deepEqual(carried(h, { x: -2, y: 2, w: 3, h: 2 }), { side: 'w', gap: 3 });
  assert.deepEqual(carried(h, { x: 4, y: 7, w: 3, h: 2 }), { side: 's', gap: 3 });
  assert.deepEqual(carried(h, { x: 4, y: -1, w: 3, h: 2 }), { side: 'n', gap: 1 });
  assert.equal(carried(h, { x: 9, y: 3, w: 3, h: 2 }), null);                          /* off the row */
  assert.equal(carried(h, { x: 4, y: 2, w: 3, h: 2 }), null);                          /* not moved */
  assert.equal(carried(h, { x: 9, y: 2, w: 2, h: 2 }), null);                          /* another size */
});

test('the hollows of a pair, and which one is written in when an arrow reads from one', () => {
  const rects = [{ x: 0, y: 3, w: 3, h: 2 }, { x: 3, y: 1, w: 3, h: 2 }], piece = pieces(rects)[0];      /* times: b on a's top-right corner */
  const [first, second] = pieceHollows(rects, piece);
  assert.deepEqual(first, { x: 3, y: 3, w: 3, h: 2 }); assert.deepEqual(second, { x: 0, y: 1, w: 3, h: 2 });
  assert.deepEqual(resultHollows(rects, piece, 1), [first]);
  assert.deepEqual(resultHollows(rects, piece, 1, null, [2]), [second]);          /* the one the arrow needs */
  assert.deepEqual(resultHollows(rects, piece, 1, null, [1, 2]), [first, second]);
  assert.deepEqual(resultHollows(rects, piece, 2, null, [2]), [first, second]);
  assert.deepEqual(resultHollows(rects, piece, 0, null, [2]), []);                /* none means none: it is read beside the piece */
  /* with a single row broadcast, one hollow is not the result's size: it is no place for a seat or an arrow */
  const rowed = [{ x: 0, y: 3, w: 3, h: 2 }, { x: 3, y: 2, w: 3, h: 1 }], p2 = pieces(rowed)[0];
  assert.deepEqual(pieceHollows(rowed, p2), [{ x: 3, y: 3, w: 3, h: 2 }, null]);
  assert.deepEqual(resultHollows(rowed, p2, 1, null, [2]), [{ x: 3, y: 3, w: 3, h: 2 }]);      /* the one needed cannot be used: the first, as before */
  assert.deepEqual(pieceHollows([{ x: 0, y: 0, w: 2, h: 2 }], pieces([{ x: 0, y: 0, w: 2, h: 2 }])[0]), [null, null]);
});

test('an arrow turned to another side: the whole side stays the whole side, a part keeps what there is room for', () => {
  assert.deepEqual(sided(arrow('e', 1, 3), 's', 3, 4), { side: 's', start: 1, span: 4 });
  assert.deepEqual(sided(arrow('e', 2, 2), 's', 3, 4), { side: 's', start: 2, span: 2 });
  assert.deepEqual(sided(arrow('s', 3, 2), 'e', 4, 3), { side: 'e', start: 3, span: 1 });
  assert.deepEqual(sided(arrow('s', 4, 1), 'e', 4, 3), { side: 'e', start: 3, span: 1 });
  assert.deepEqual(sided(arrow('e', 1, 2), 'w', 3, 3), { side: 'w', start: 1, span: 2 });
});
