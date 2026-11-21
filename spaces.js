/* Number spaces: which numbers a shape may hold. No drawing here: words and values in, words out.

   A type is a number space: a set of numbers. How a number is held (exactly, or as the backend's decimal) is no
   part of it. There are ten, and they are not one chain:

       boolean        0, 1 (and true, false, which count as 1 and 0)     inside whole, ternary, probability
       ternary        -1, 0, 1                                           inside integer
       natural        1, 2, 3, …                                         inside whole
       whole          0 and the naturals                                 inside integer
       integer        the wholes and their negatives                     inside rational
       rational       a ratio of integers                                inside real
       probability    a real from 0 to 1, both ends included             inside real
       real           any number on the line (no infinity)               inside extended
       extended       the reals and the two infinities, ∞ and -∞         inside any
       any            nothing promised

   A space is written as its word, with "?" after it where None is admitted too: "integer?". Unknown and error are
   no spaces: any shape may have an entry not yet given, and an error is of no type. complex is a reserved word: it
   is refused as a promise, with a sentence saying it is not built.

   Everything below is worked from the tables in this file and from nothing else: INSIDE (which space lies
   directly inside which), and one list of clauses for each operation. backend/spaces.py holds the same tables, and
   backend/fixtures/spaces.json, made from this file, holds what they come to for every pair of spaces and every
   operation, so that the two cannot drift apart (tests/fixtures.test.js, backend/tests/test_spaces.py).

   SPACES                      the ten words, smallest first where one lies inside another
   INSIDE                      { word: [the spaces it lies directly inside] }
   BINARY, UNARY               the clauses: for + - * / ^, [[left, right, result], …]; for a function of one value,
                               [[of, result], …]. The first clause both sides lie inside gives the result; where
                               none does it is any. Each is sound: it never gives a smaller space than the result
                               can lie in, and where there was doubt it gives the wider one.
   parse(text)                 -> { space, none } for a word with or without its "?", else null
   promise(text)               -> { holds: "integer?" } | { refused: why }: a word typed or read as a promise
   inside(a, b)                -> whether the space a lies inside b (or is b); a and b are words
   within(a, b)                -> the same of two written spaces, None and all: "natural" is within "integer?",
                                  and "natural?" is not within "integer"
   both(a, b)                  -> the space of both: the smallest listed space that holds the two, written
   of(value)                   -> the smallest space a value lies in, written: 0 and 1 are boolean, 2 natural, -1
                                  ternary, -2 integer, 1/2 probability, 3/2 rational, √2 real, ±∞ extended; None is
                                  "boolean?" (no number, and None); null for unknown and for an error. A value as
                                  the graph writes it or as values.js holds it. A symbolic value is real (or, where
                                  it is a whole number or a fraction too long for plain numbers, what that is):
                                  nothing here asks the solver, so that the backend can say the same.
   ofAll(values, more)         -> the space of them all, unknowns and errors left out; "boolean" where there is
                                  no number among them (the smallest word there is to say so). more: written
                                  spaces that are among them too (what a variable's formulas come to)
   binary(op, a, b)            -> the space of a op b, for + - * / ^, == != < > <= >=, && ||, max and min
   unary(fn, a)                -> of fn(a), for neg ! abs sqrt exp ln tanh erf
   choice(a, b)                -> of select(c, a, b): the space of both sides, whatever c is (None is false)
   sum(a, count)               -> of count values of a added up; product(a, b, terms) -> of a matrix product, a sum
                                  of that many products
   formula(tree, name)         -> of a formula, from its tree (expression.js: treeOf) and name(text) -> the written
                                  space a name stands for (undefined: not known, which is "any?")
   With None admitted on any input the result admits None, but for select, !, &&, ||, == and !=, which follow
   values.js: None is false, and is equal only to None.
   admits(holds, value)        -> whether a value lies in a written space: true, false, or null where it cannot be
                                  told. Exact: it asks values.js, so a symbolic value is told from 0 and 1 as any
                                  comparison is, and one the solver cannot compare exactly (tanh(20) against 1) is
                                  null: not shown to lie in the space, and not shown to lie outside it. Unknown
                                  and an error are not asked (true): they are no values to break a promise.
   broken(holds, entries)      -> the first entry (by row, then column) that lies outside the space:
                                  { key, value }, or null. entries: a Map or an object keyed "column,row". An
                                  entry that cannot be told breaks nothing.
   untold(holds, entries)      -> the first entry that cannot be told to lie in the space or outside it, or null
   NOT_HELD(name, holds, key, value), UNPROVEN(name, holds, inferred)
                               -> the two sentences: "W is not natural: it holds -3 at 2, 1" and
                                  "W cannot be shown to be natural: it is worked out as integer"
   said(written)               -> a written space in words for the panel: "integer", "integer or None" */
import { combine, written as valueText, isError, isNone } from './values.js';

export const SPACES = ['boolean', 'ternary', 'natural', 'whole', 'integer', 'rational', 'probability', 'real', 'extended', 'any'];
export const INSIDE = { boolean: ['whole', 'ternary', 'probability'], ternary: ['integer'], natural: ['whole'], whole: ['integer'], integer: ['rational'], rational: ['real'], probability: ['real'], real: ['extended'], extended: ['any'], any: [] };
export const RESERVED = { complex: 'complex numbers are not built: a shape holds numbers on the line' };
const B = 'boolean', T = 'ternary', N = 'natural', W = 'whole', Z = 'integer', Q = 'rational', P = 'probability', R = 'real', X = 'extended', A = 'any';
export const BINARY = {
  /* (with the infinities: ∞ − ∞ and 0 × ∞ are errors, no values, so extended is closed under + − and ×) */
  '+': [[N, W, N], [W, N, N], [W, W, W], [Z, Z, Z], [Q, Q, Q], [R, R, R], [X, X, X]],      /* naturals: natural; wholes and booleans: whole; probabilities: real */
  '-': [[B, B, T], [Z, Z, Z], [Q, Q, Q], [R, R, R], [X, X, X]],                 /* a difference of naturals or wholes is an integer */
  '*': [[B, B, B], [T, T, T], [N, N, N], [W, W, W], [Z, Z, Z], [P, P, P], [Q, Q, Q], [R, R, R], [X, X, X]],      /* closed for every space */
  '/': [[Q, Q, Q], [R, X, R], [X, X, X]],                                       /* a quotient of integers is rational, of anything wider real; by an infinity it is 0, and an infinity over a number is one still */
  '^': [[B, N, B], [T, N, T], [N, N, N], [W, N, W], [Z, N, Z], [P, N, P], [Q, N, Q], [R, R, R], [X, X, X]],      /* a natural power keeps its space; any other is real; 2 ^ ∞ is ∞ */
};
export const UNARY = {
  neg: [[B, T], [T, T], [Z, Z], [Q, Q], [R, R], [X, X]],
  abs: [[T, B], [N, N], [Z, W], [P, P], [Q, Q], [R, R], [X, X]],
  sqrt: [[B, B], [P, P], [R, R], [X, X]],
  exp: [[R, R], [X, X]],                        /* exp(∞) is ∞ (and exp(-∞) is 0) */
  ln: [[N, R], [X, X]],                         /* ln(0) is -∞, which is no real: only what cannot be 0 has a real logarithm, and any other is extended */
  tanh: [[W, P], [P, P], [X, R]],               /* tanh and erf of an infinity are 1 and -1 */
  erf: [[W, P], [P, P], [X, R]],
};
const COMPARES = ['==', '!=', '<', '>', '<=', '>='], LOGIC = ['&&', '||'];

/* ---- the order ---- */
const above = {};                                /* word -> every space it lies inside, itself included */
for (const s of SPACES){ const seen = new Set([s]), todo = [s]; while (todo.length) for (const up of INSIDE[todo.pop()]) if (!seen.has(up)){ seen.add(up); todo.push(up); } above[s] = seen; }
export const inside = (a, b) => !!above[a] && above[a].has(b);
/* the smallest listed space that holds both: the one of those above both that lies inside every other */
const joins = {};
for (const a of SPACES) for (const b of SPACES){ const common = SPACES.filter(s => inside(a, s) && inside(b, s)); joins[a + ' ' + b] = common.find(s => common.every(o => inside(s, o))); }
/* inside, a space is [word or null, whether None is admitted]: null is no number at all (None alone, or nothing known) */
const join = (a, b) => a === null ? b : b === null ? a : joins[a + ' ' + b];
const WORD = /^([a-z]+)(\?)?$/;
export function parse(text){ const m = typeof text === 'string' ? text.match(WORD) : null; return m && SPACES.includes(m[1]) ? { space: m[1], none: !!m[2] } : null; }
const read = text => { const p = parse(text); return p ? [p.space, p.none] : [A, true]; };      /* what is not written is not known: any, or None */
const write = ([space, none]) => (space === null ? B : space) + (none ? '?' : '');
export function promise(text){
  const t = String(text ?? '').trim().toLowerCase(), word = t.replace(/\?$/, '');
  if (Object.hasOwn(RESERVED, word)) return { refused: RESERVED[word] };
  return parse(t) ? { holds: t } : { refused: `${word || 'that'} is no number space: a shape holds one of ${SPACES.join(', ')}` };
}
export const within = (a, b) => { const x = parse(a), y = parse(b); return !!x && !!y && inside(x.space, y.space) && (!x.none || y.none); };
export const both = (a, b) => { const x = read(a), y = read(b); return write([join(x[0], y[0]), x[1] || y[1]]); };
export const said = text => { const p = parse(text); return p ? p.space + (p.none ? ' or None' : '') : ''; };

/* ---- values ----
   A value lies in several spaces at once (1 is boolean and natural), so the smallest space of some values is not
   the space of both of their smallest ones: it is the first space that holds every one of them, taken in the order
   FIRST, which has a smaller space before any it lies inside, so that the first is a smallest. Where two smallest
   ones hold them all, FIRST says which: 1 alone is boolean before it is natural, and 1/2 a probability before it
   is rational. */
const FIRST = [B, T, N, W, Z, P, Q, R, X, A];
const INT = /^-?\d+$/, FRACTION = /^(-?)(\d+)\/(\d+)$/;
const wholes = n => n === 1 ? SPACES : n === 0 ? [B, T, W, Z, Q, P, R, X, A] : n === -1 ? [T, Z, Q, R, X, A] : n > 1 ? [N, W, Z, Q, R, X, A] : [Z, Q, R, X, A];      /* n: -2 for anything below -1, 2 for anything above 1 */
const clamp = n => n > 1 ? 2 : n < -1 ? -2 : Number(n);
/* a value as [the spaces it lies in, whether it is None], or undefined for what is no value (unknown, an error) */
function lies(v){
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'boolean') return [SPACES, false];
  if (v === 'inf' || v === '-inf' || v === Infinity || v === -Infinity) return [[X, A], false];
  if (typeof v === 'number') return Number.isInteger(v) ? [wholes(clamp(v)), false] : undefined;
  if (typeof v !== 'object') return undefined;
  if (typeof v.err === 'string') return undefined;
  if (v.none === true) return [SPACES, true];      /* no number at all: it is in the way of none */
  if (Number.isInteger(v.n) && Number.isInteger(v.k)){ const d = v.d === undefined ? 1 : v.d, unit = v.n >= 0 && v.n <= d;      /* n over d under k roots: from 0 to 1 where n is, and no more than d */
    if (!v.k && d === 1) return [wholes(clamp(v.n)), false];
    return [v.k ? (unit ? [P, R, X, A] : [R, X, A]) : unit ? [Q, P, R, X, A] : [Q, R, X, A], false]; }
  if (typeof v.sym === 'string'){ if (INT.test(v.sym)) return [wholes(clamp(BigInt(v.sym))), false];
    const m = v.sym.match(FRACTION); if (m && !/^0+$/.test(m[3])) return [!m[1] && BigInt(m[2]) <= BigInt(m[3]) ? [Q, P, R, X, A] : [Q, R, X, A], false];
    return [[R, X, A], false]; }
  if (typeof v.f === 'number') return Number.isNaN(v.f) ? undefined : [v.f >= 0 && v.f <= 1 ? [P, R, X, A] : Number.isFinite(v.f) ? [R, X, A] : [X, A], false];      /* a decimal is the backend's nearest number: it is not said to be whole or a ratio */
  return undefined;
}
/* the first listed space that holds every one of the values and has every one of the written spaces inside it */
function smallest(values, more = []){
  let held = FIRST, none = false;
  for (const v of values){ const s = lies(v); if (s){ held = held.filter(x => s[0].includes(x)); none = none || s[1]; } }
  for (const w of more){ const s = read(w); held = held.filter(x => s[0] === null || inside(s[0], x)); none = none || s[1]; }
  return [held[0], none];
}
/* one value as [space or null, None]: null for None, which is no number */
const ofValue = v => { const s = lies(v); return s === undefined ? undefined : s[1] ? [null, true] : [FIRST.find(x => s[0].includes(x)), false]; };
export const of = v => { const s = ofValue(v); return s === undefined ? null : write(s); };
export const ofAll = (values, more = []) => write(smallest(values, more));

/* ---- the operations ---- */
const first = (clauses, ...xs) => { for (const c of clauses) if (xs.every((x, i) => inside(x, c[i]))) return c[xs.length]; return A; };
function binaryOf(op, a, b){
  if (LOGIC.includes(op) || op === '==' || op === '!=') return [B, false];      /* None is false, and is equal only to None: these are always true or false */
  const none = a[1] || b[1];
  if (a[0] === null || b[0] === null) return [null, none];      /* a side that is no number: None with anything is None */
  if (COMPARES.includes(op)) return [B, none];
  if (op === 'max' || op === 'min') return [join(a[0], b[0]), none];      /* one of the two */
  return [Object.hasOwn(BINARY, op) ? first(BINARY[op], a[0], b[0]) : A, none];
}
function unaryOf(fn, a){
  if (fn === '!') return [B, false];
  if (a[0] === null) return [null, a[1]];
  return [Object.hasOwn(UNARY, fn) ? first(UNARY[fn], a[0]) : A, a[1]];
}
const choiceOf = (a, b) => [join(a[0], b[0]), a[1] || b[1]];
function sumOf(a, count){ let s = a; for (let k = 1; k < count; k++){ const next = binaryOf('+', s, a); if (next[0] === s[0] && next[1] === s[1]) break; s = next; } return s; }
export const binary = (op, a, b) => write(binaryOf(op, read(a), read(b)));
export const unary = (fn, a) => write(unaryOf(fn, read(a)));
export const choice = (a, b) => write(choiceOf(read(a), read(b)));
export const sum = (a, count) => write(sumOf(read(a), count));
export const product = (a, b, terms) => write(sumOf(binaryOf('*', read(a), read(b)), terms));

/* a formula's space from its tree: { num } | { name } | { ref } | { op, a, b } | { fn, args } (expression.js). Walked
   with a list of its own, since a long sum is a deep tree. A number longer than 40 characters is real, whatever it
   is (the backend reads such a number as a float alone). */
const WORDS = { inf: [X, false], infinity: [X, false], true: [B, false], false: [B, false], none: [null, true] };
export function formula(tree, name = () => undefined){
  const out = [], todo = [[tree, false]];
  while (todo.length){ const [n, ready] = todo.pop();
    if ('num' in n) out.push(n.long ? [R, false] : ofValue(n.num) || [null, false]);
    else if (n.name !== undefined){ const k = n.name.toLowerCase(); out.push(Object.hasOwn(WORDS, k) ? WORDS[k] : read(name(n.name))); }
    else if (n.ref) out.push([A, true]);
    else if (!ready){ todo.push([n, true]); const kids = n.op ? [n.a, n.b] : n.args; for (let i = kids.length - 1; i >= 0; i--) todo.push([kids[i], false]); }
    else if (n.op){ const b = out.pop(), a = out.pop(); out.push(binaryOf(n.op, a, b)); }
    else { const args = out.splice(out.length - n.args.length);
      out.push(n.fn === 'select' ? choiceOf(args[1], args[2]) : n.fn === 'max' || n.fn === 'min' ? binaryOf(n.fn, args[0], args[1]) : unaryOf(n.fn, args[0])); } }
  return write(out[0]);
}

/* ---- a promise against values ---- */
/* a comparison the solver cannot decide (values.js: "cannot be compared exactly") is neither yes nor no: null */
const told = (op, a, b) => { const r = combine(op, a, b); return r === true ? true : r === false ? false : null; };
const HOLDS = {
  boolean: v => typeof v === 'boolean' || v === 0 || v === 1,
  ternary: v => typeof v === 'boolean' || v === 0 || v === 1 || v === -1,
  natural: v => (Number.isInteger(v) && v >= 1) || v === true || bigWhole(v) > 0,
  whole: v => (Number.isInteger(v) && v >= 0) || typeof v === 'boolean' || bigWhole(v) > 0,
  integer: v => Number.isInteger(v) || typeof v === 'boolean' || bigWhole(v) !== 0,
  rational: v => HOLDS.integer(v) || (!!v && typeof v === 'object' && ((Number.isInteger(v.n) && v.k === 0) || (typeof v.sym === 'string' && FRACTION.test(v.sym)))),
  probability: v => { if (infinite(v)) return false; const low = told('>=', v, 0), high = told('<=', v, 1); return low === false || high === false ? false : low === null || high === null ? null : true; },
  real: v => !infinite(v),
  extended: () => true,
  any: () => true,
};
const infinite = v => v === Infinity || v === -Infinity || v === 'inf' || v === '-inf' || (!!v && typeof v === 'object' && typeof v.f === 'number' && !Number.isFinite(v.f));
const bigWhole = v => !!v && typeof v === 'object' && typeof v.sym === 'string' && INT.test(v.sym) ? (v.sym[0] === '-' ? -1 : /^0+$/.test(v.sym) ? 0 : 1) : 0;      /* a whole number too long for a plain one: its sign, else 0 */
export function admits(holds, v){
  const p = parse(holds); if (!p) return true;
  if (v === null || v === undefined || isError(v)) return true;
  if (isNone(v)) return p.none;
  if (v === 'inf') v = Infinity; else if (v === '-inf') v = -Infinity;
  if (typeof v === 'object' && typeof v.f === 'number') return p.space === A || p.space === X || (Number.isFinite(v.f) && (p.space === R || (p.space === P && v.f >= 0 && v.f <= 1)));      /* a decimal is asked only whether it is on the line (or an infinity), and from 0 to 1 */
  return HOLDS[p.space](v);
}
function firstThat(holds, entries, answer){
  const list = entries instanceof Map ? [...entries] : Object.entries(entries || {}); let worst = null;
  for (const [key, value] of list){ if (admits(holds, value) !== answer) continue; const [c, r] = key.split(',').map(Number);
    if (!worst || r < worst.r || (r === worst.r && c < worst.c) || (r === worst.r && c === worst.c && key < worst.key)) worst = { key, value, c, r }; }
  return worst && { key: worst.key, value: worst.value };
}
export const broken = (holds, entries) => firstThat(holds, entries, false);
export const untold = (holds, entries) => firstThat(holds, entries, null);
const shown = v => v === 'inf' ? '∞' : v === '-inf' ? '-∞' : isNone(v) ? 'None' : valueText(v);
export const NOT_HELD = (name, holds, key, value) => `${name} is not ${said(holds)}: it holds ${shown(value)} at ${key.split(',').join(', ')}`;
export const UNPROVEN = (name, holds, inferred) => `${name} cannot be shown to be ${said(holds)}: it is worked out as ${said(inferred)}`;
