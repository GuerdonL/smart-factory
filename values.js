/* What a value is, and how two values combine. No drawing here: values in, a value out.

   A worked-out value is exactly one of nine kinds. Every piece of code that reads an entry handles all of them.

       integer        7                              a JavaScript number that is a safe integer, of either sign
                                                     (called so, not "whole": whole is the space of 0 and up, spaces.js)
       infinity       Infinity, -Infinity            ("inf" and "-inf" in a file: project.js)
       exact          { n: 3, d: 4, k: 1 }           n over d under k square roots (k 0: a fraction; 1: √; 2: ∜), in
                                                     lowest terms, d left out where it is 1, and kept only where it is
                                                     not itself a whole number
       boolean        true, false
       symbolic       { sym: "1+sqrt(2)" }           text the solver can read back: exact, never an approximation
       decimal        { f: 0.4375 }                  made only by the backend (backend/), noise included, never here:
                                                     a 32-bit float, written with 9 significant digits. Never saved.
                                                     It is for showing only: the page hands no decimal to combine
                                                     (see "the backend" in smart-factory.js), though combine takes one.
       error          { err: "divide by zero" }      worked out, never typed and never saved
       None           { none: true }                 nothing, said outright: typed none, written ∅, and saved. It is not
                                                     unknown (which is nothing said yet), and it is not zero: it
                                                     counts as false, and in arithmetic None with anything is None
       unknown        null                           an entry not given a value: it stays a symbol, and is not zero

   How two combine, in this order:
     (Several terms of one sum or one product are looked at all together, so that their order does not matter:
     together, below. An error among them, or one two of them make, comes first; then unknown; then None.)
     an error with anything is that error (the first of two);
     unknown with anything else is unknown: it is never taken as zero or false;
     None with anything else is None: None + 1, None × 0, 1 / None, None < 1, max(None, 3) and exp(None) are all
       None. It is false where true or false is wanted, so !None is true, None && x is false and None || x is
       whether x is true, and select(None, a, b) is b. None == None is true, and None is equal to nothing else:
       None == 0 and None == false are false (!= is the other way round);
     a decimal with anything else is a decimal (a comparison of decimals is still true or false);
     a boolean in arithmetic counts as 1 or 0, and a number where a boolean is wanted is false when it is 0;
     infinity: ∞ + n = ∞, ∞ + ∞ = ∞, n / ∞ = 0, ∞ × n takes n's sign, ∞ / n likewise; ∞ − ∞, 0 × ∞ and ∞ / ∞ are
       errors. In a comparison infinity is larger than every number and equal to itself;
     division by zero is the error "divide by zero";
     whole, exact and symbolic values come back as the simplest kind that holds the answer: a whole number if it is
       one, else exact if it is a single root of a fraction, else symbolic.

   Speed. Whole numbers, fractions and single roots are worked out here, directly: two whole numbers as plain numbers
   where the answer is a safe integer, anything else with BigInt numerators and denominators, so nothing overflows
   and nothing is rounded. The solver (nerdamer, the global the page loads from vendor/) is asked only for a pair
   that involves a symbolic value, or whose answer is not a single root (√2 + √3, 2^(1/3)), and what it answered is
   remembered. Whether a sum of two roots is a single root is settled here, exactly (it is when one is a fraction of
   the other: √8 + √2 = 3√2), and where the solver says an answer is a single root that is checked numerically
   before it is taken, since the solver is sometimes wrong about it.
   A whole number, a fraction or a single root too large to hold as plain numbers (past 2^53) is kept as symbolic
   text of a fixed form, "1208925819614629174706176", "(1208925819614629174706177/1)^(1/2)", which is read back
   here: it stays exact, is worked out with BigInt like any other, and is never handed to the solver, which would
   round it. Where such a number meets something that is not a single root (2^80 + √2), or a bound is passed (see
   MAXBITS), the answer is the error "too large to work out": no step waits long.

   Comparing. Whole numbers, fractions and single roots are compared exactly, here. Where a symbolic value is
   involved, two values are equal when the solver reduces their difference to 0; otherwise their order is the sign
   of the difference worked out numerically at the solver's own precision. That is the only numeric approximation
   made in the browser, and what comes of it is true or false, never a number that is shown. Where the solver
   cannot reduce the difference to 0 and it is smaller than 1e-12 in size, the answer is the error
   "cannot be compared exactly", never a guess. In size means against the larger of 1, the two sides and the terms
   of the difference: see compare. A side past what a floating-point number holds (exp(1000)) is compared by its
   logarithm. Whether a symbolic value counts as true is the same question, asked against 0.

   together(op, terms, signs, rests) -> { value, rest }   several terms of one sum or product, whatever their order: see the function
   combine(op, a, b) -> a value      op is '+' '-' '*' '/' '^', '==' '!=' '<' '>' '<=' '>=', '&&' '||', 'max' or 'min'
   apply(fn, a)      -> a value      fn is 'neg', '!', 'abs', 'sqrt', 'exp', 'ln', 'tanh' or 'erf'. exp, ln, tanh and
                                     erf stay symbolic unless they come out (exp(0) is 1, ln(1) is 0, and at the
                                     infinities: exp(-∞) = 0, exp(∞) = ∞, ln(0) = -∞, ln(∞) = ∞, tanh(±∞) = erf(±∞) = ±1)
   truth(v)          -> whether a value counts as true: false for false, 0 and None, true for everything else that is
                        known; for a symbolic value that cannot be told from 0, the error saying so
   truthOf(values)   -> whether a whole matrix counts as true, from its entries (unknown ones null), three-valued:
                        true where any known entry is true; false where every entry is known and is zero, false or
                        None; null otherwise, which is unknown (an entry that is an error, or cannot be told from 0,
                        is not known). A matrix of no entries is false.
   NONE, isNone(v)   -> the value None, and whether a value is it
   typedNumber(text) -> digits as typed, with at most one point, as a value: "1.25" is 5/4. Never a decimal.
   digits(f)         -> a decimal's number as text, with exactly 9 significant digits: "2.71828175", "1.00000000"
   written(v)        -> a value as text: "7", "∞", "-∞", "3/4", "√2", "2√3", "T", "F", "1+√2", "exp(2)", "0.437500000"; "!" for an
                        error (why is v.err), "∅" for None, and "" for unknown. The one function that turns a value into text.
   kind(v)           -> 'integer' | 'infinity' | 'exact' | 'boolean' | 'symbolic' | 'decimal' | 'error' | 'none' | 'unknown'
   isInteger(v), isSurd(v), isError(v), isFormula(v)
                     -> whether v is an integer, of either sign; an exact value; an error; a formula, { expr } (which is not a
                        value: it is what an entry holds in place of one, see expression.js)
   storable(v)       -> whether a value may be kept in an entry or a file: every kind but an error, a decimal and unknown (None is kept)
   surd(n, k, d)     -> n over d under k roots as a value: a plain number where it comes out whole (surd(9, 1) is 3)
   rootOf(v)         -> the square root of a value, itself a value; null where v has none to write (negative,
                        infinite, an error, unknown). The root of None is None: a single entry that holds None has
                        None for its side as for its mass. A boolean counts as 1 or 0 here as in all arithmetic, so the
                        root of true is 1 and of false 0: the backend, which holds true as 1, says the same
   sideOf(v)         -> { length } | { refused: why }: a value that has to be a matrix's side, which is a whole number
                        of squares, at least 1. Anything else is refused, and the words say why.
   exact(v), held(e) -> a whole or exact value as { p, q, k } (p over q under k roots), and back; null for any other kind
   nearest(v)        -> the whole number a symbolic value comes nearest to, or null: to ask whether it is that number */

const solver = () => globalThis.nerdamer;
const err = why => ({ err: why });
const DIV0 = 'divide by zero', EVEN = 'an even root of a negative number', NOVALUE = 'that has no value', LARGE = 'too large to work out';

export const isInteger = v => typeof v === 'number' && Number.isInteger(v);
export const isSurd = v => !!v && typeof v === 'object' && Number.isInteger(v.n) && Number.isInteger(v.k);
export const isError = v => !!v && typeof v === 'object' && typeof v.err === 'string';
export const isFormula = v => !!v && typeof v === 'object' && typeof v.expr === 'string';
const isSym = v => !!v && typeof v === 'object' && typeof v.sym === 'string';
const isDec = v => !!v && typeof v === 'object' && typeof v.f === 'number';
const isInf = v => v === Infinity || v === -Infinity;
export const NONE = Object.freeze({ none: true });
export const isNone = v => !!v && typeof v === 'object' && v.none === true;
export function kind(v){
  if (v === null || v === undefined) return 'unknown';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return isInf(v) ? 'infinity' : Number.isInteger(v) ? 'integer' : Number.isNaN(v) ? 'error' : 'decimal';
  return isError(v) ? 'error' : isSurd(v) ? 'exact' : isSym(v) ? 'symbolic' : isDec(v) ? 'decimal' : isNone(v) ? 'none' : 'unknown';
}
export const storable = v => { const k = kind(v); return k !== 'error' && k !== 'decimal' && k !== 'unknown'; };
/* whether a value counts as true: false for false and 0. A symbolic value is asked whether it is 0 as any comparison
   is, so one that cannot be told from 0 is the error "cannot be compared exactly", which is what this then gives. */
export function truth(v){
  if (typeof v === 'boolean') return v;
  if (isNone(v)) return false;
  if (isDec(v)) return v.f !== 0;
  if (isSym(v)){ const c = compare(v, 0); return isError(c) ? c : c !== 0; }
  return v !== 0 && v !== null && v !== undefined;
}
/* whether a whole matrix counts as true, three-valued: one known true entry settles it; false needs every entry known */
export function truthOf(values){
  let open = false;
  for (const v of values){
    if (v === null || v === undefined || isError(v) || Number.isNaN(v)){ open = true; continue; }
    const t = truth(v); if (t === true) return true; if (t !== false) open = true; }
  return open ? null : false;
}

/* ---- whole numbers, fractions and single roots, exactly ----
   Inside, such a number is [p, q, k]: BigInt p over BigInt q (q above 0, lowest terms), under k square roots, the
   sign carried by p: -√2 is [-2n, 1n, 1]. */
const RATIONAL = /^(-?\d+)(?:\/(\d+))?$/;
const B = BigInt, big = x => x < 0n ? -x : x, ZERO = [0n, 1n, 0];
const gcd = (a, b) => { a = big(a); b = big(b); while (b) [a, b] = [b, a % b]; return a || 1n; };
/* the whole w-th root of n (n at least 0), or null where it has none */
function iroot(n, w){
  if (n < 2n) return n;
  const W = B(w); let x = 1n << B(Math.ceil(n.toString(2).length / w));            /* from above, coming down */
  for (;;){ const y = ((W - 1n) * x + n / x ** (W - 1n)) / W; if (y >= x) break; x = y; }
  return x ** W === n ? x : null;
}
function norm(p, q, k){
  if (q < 0n){ p = -p; q = -q; }
  if (p === 0n) return ZERO;
  const g = gcd(p, q); if (g !== 1n){ p /= g; q /= g; }
  while (k > 0){ const a = iroot(big(p), 2); if (a === null) break; const b = iroot(q, 2); if (b === null) break; p = p < 0n ? -a : a; q = b; k--; }      /* as few roots as it needs: √(9/4) is 3/2 */
  return [p, q, k];
}
const SAFE = B(Number.MAX_SAFE_INTEGER), safe = x => x <= SAFE && x >= -SAFE;
/* The bounds that keep any one step short. A number here has at most MAXBITS binary digits above and below its line
   (some 1,200 decimal digits) and stands under at most MAXK square roots (a 64th root); a root that is asked for has
   an index of at most MAXROOT. Past a bound the answer is the error "too large to work out", not a long wait. */
const MAXBITS = 4096, MAXK = 6, MAXROOT = 1024;
export const ROOTS = MAXK;                    /* the most square roots an exact value stands under: { n, d, k } has k from 0 to this */
const bits = x => big(x).toString(2).length;
/* such a number as a value: a whole number; an exact value; or, too large for plain numbers, symbolic text that is
   still exact and is read back by numberOf, so it is still worked out here and never by the solver */
function valueOf([p, q, k]){
  if (!k && q === 1n && safe(p)) return Number(p);
  if (safe(p) && safe(q)) return { n: Number(p), ...(q !== 1n ? { d: Number(q) } : {}), k };
  return bits(p) > MAXBITS || bits(q) > MAXBITS ? err(LARGE) : { sym: textOf([p, q, k]) };
}
/* the text such a number is kept as where it is too large: "123…", "-123…/45…", "(123…/1)^(1/2)", "-(123…/45…)^(1/4)" */
const textOf = ([p, q, k]) => { const body = k ? `(${big(p)}/${q})^(1/${2 ** k})` : q === 1n ? String(big(p)) : `${big(p)}/${q}`; return p < 0n ? '-' + body : body; };
const ROOTED = /^(-?)\((\d+)\/(\d+)\)\^\(1\/(2|4|8|16|32|64)\)$/;
/* a symbolic text that is such a number, as one; null for any other text */
function largeOf(text){
  let m = text.match(RATIONAL), t = null;
  if (m) t = m[2] === '0' ? null : norm(B(m[1]), B(m[2] || 1), 0);
  else if ((m = text.match(ROOTED)) && m[3] !== '0' && text.length < 2600) t = norm(B(m[1] + m[2]), B(m[3]), Math.log2(+m[4]));
  return t && bits(t[0]) <= MAXBITS && bits(t[1]) <= MAXBITS ? t : null;
}
/* a value as such a number, or null for a kind that is not one */
const numberOf = v => typeof v === 'number' ? (Number.isInteger(v) ? [B(v), 1n, 0] : null) : isSurd(v) ? [B(v.n), B(v.d || 1), v.k] : isSym(v) ? largeOf(v.sym) : null;
/* whether a value is one of those too large for plain numbers: the solver is never handed one, since it would round it */
const isLarge = v => isSym(v) && !!largeOf(v.sym);
/* such a number as a floating-point number, near enough to tell a sign or check an answer by; never shown */
function approx([p, q, k]){
  const shift = bits(q) - bits(p) + 64, m = shift > 0 ? (big(p) << B(shift)) / q : big(p) / (q << B(-shift)), e = 1 / 2 ** k;
  return (p < 0n ? -1 : 1) * Number(m) ** e * 2 ** (-shift * e);
}
const sign = a => a[0] < 0n ? -1 : a[0] > 0n ? 1 : 0;
/* both brought under the same number of roots: [|a|, |b|] as fractions [p, q] under K roots */
function level(a, b){ const K = Math.max(a[2], b[2]), up = (x, by) => [big(x[0]) ** by, x[1] ** by];
  return [up(a, 2n ** B(K - a[2])), up(b, 2n ** B(K - b[2])), K]; }
function times(a, b){ const [x, y, K] = level(a, b), s = B(sign(a) * sign(b)); return norm(s * x[0] * y[0], x[1] * y[1], K); }
const flip = a => [a[0] < 0n ? -a[1] : a[1], big(a[0]), a[2]];      /* one over it (it is not 0) */
/* a + b, or null where that is not a single root */
function plus(a, b){
  if (!a[2] && !b[2]) return norm(a[0] * b[1] + b[0] * a[1], a[1] * b[1], 0);
  if (!sign(a)) return b; if (!sign(b)) return a;
  const ratio = times(a, flip(b));            /* a is b times this: where it is a fraction, a + b is b times one more than it (√8 + √2 = 3√2) */
  return ratio[2] ? null : times(b, norm(ratio[0] + ratio[1], ratio[1], 0));
}
/* a to the power b: such a number, null where it is not a single root (the solver's to say), or words where it has no value */
function power(a, b){
  /* what to say where this cannot work it out: the solver's, unless the number is one the solver would be slow or wrong with */
  const hard = () => safe(a[0]) && safe(a[1]) && big(a[0]) <= 10n ** 12n && a[1] <= 10n ** 12n ? null : LARGE;
  if (b[2]) return safe(a[0]) && safe(a[1]) ? null : LARGE;
  let [u, v] = b; if (u === 0n) return [1n, 1n, 0];
  if (!sign(a)) return u > 0n ? ZERO : DIV0;
  if (big(u) > 4096n || Math.max(bits(a[0]), bits(a[1])) * Number(big(u)) > 1e6) return LARGE;
  if (u < 0n){ a = flip(a); u = -u; }
  let j = 0; while (v % 2n === 0n){ v /= 2n; j++; }            /* the roots in it: j square roots, then a v-th root with v odd */
  if (j > 64) return LARGE;
  if (v !== 1n){ if (v > B(MAXROOT)) return hard(); const top = iroot(big(a[0]), Number(v)), under = iroot(a[1], Number(v)); if (top === null || under === null) return hard();
    a = [a[0] < 0n ? -top : top, under, a[2]]; }      /* an odd root of a negative number is the real one; of a root, the root of what is under it */
  if (j && a[0] < 0n) return EVEN;
  const s = a[0] < 0n && u % 2n ? -1n : 1n, r = norm(s * big(a[0]) ** u, a[1] ** u, a[2] + j);
  return r[2] > MAXK ? (safe(r[0]) && safe(r[1]) && j <= 64 ? null : LARGE) : r;
}
/* -1, 0 or 1 as a is below, level with or above b */
function order(a, b){
  if (sign(a) !== sign(b)) return sign(a) < sign(b) ? -1 : 1;
  const [x, y] = level(a, b), l = x[0] * y[1], r = y[0] * x[1];
  return l === r ? 0 : (l < r) === (sign(a) > 0) ? -1 : 1;
}

/* ---- the solver, for what is not a single root ---- */
const said = new Map();                        /* what was asked -> what it came to. The same question has the same answer. */
/* a value as the solver reads it */
const forSolver = v => typeof v === 'boolean' ? (v ? '(1)' : '(0)') : typeof v === 'number' ? `(${v})` : isSym(v) ? `(${v.sym})` : `(${textOf(numberOf(v))})`;
/* single: false where it is already known here that the answer is no single root (a sum of two roots of which neither is a fraction of the other) */
function solve(text, single = true){
  const N = solver(); if (!N) return err('the maths solver did not load');
  if (text.length > 4000) return err(LARGE);
  const key = (single ? '' : '~') + text;
  if (!said.has(key)){ if (said.size > 4000) said.clear(); said.set(key, solveNow(N, text, single)); }
  return said.get(key);
}
function solveNow(N, typed, single){
  exactly(N);
  let answer; try { answer = N(typed); } catch (e){ const m = String(e.message || e);
    return err(/zero/i.test(m) ? DIV0 : 'that cannot be worked out'); }
  let text = answer.toString(); if (/(^|[^a-z])i([^a-z]|$)/.test(text)) return err(EVEN);
  /* Two things the solver leaves undone, finished here.
     A root of a negative number comes back as a power of -1: (-2)^(1/3) as (-1)^(1/3)*2^(1/3). An odd root of a
     negative number is the real one, so (-1)^(p/q) with q odd is (-1)^p; with q even there is none.
     And some whole roots are left standing: whatever comes out from under a root whole is brought out, so
     54^(1/3) is 3*2^(1/3). */
  const MINUS = /\(-1\)\^\((-?\d+)\/(\d+)\)/g, ROOT = /(?<![\w.])(\d+)\^\((-?\d+)\/(\d+)\)/g;
  if ([...text.matchAll(MINUS)].some(m => m[2] % 2 === 0)) return err(EVEN);
  const finished = text.replace(MINUS, (_, p) => `(-1)^(${p})`).replace(ROOT, (all, n, p, q) => { n = +n; q = +q;
    if (!Number.isSafeInteger(n) || n < 2 || q > 64) return all;
    let c = Math.floor(Math.pow(n, 1 / q) + 1e-9); while (c > 1 && n % (c ** q)) c--;
    return c > 1 ? `((${c})^(${p})*(${n / c ** q})^(${p}/${q}))` : all; });
  try { if (finished !== text){ answer = N(finished); text = answer.toString(); }
    if (!text || /NaN|Infinity/.test(text)) return err(NOVALUE);
    /* and a third: the root of a square comes back as abs( … ), (1+√2)² under a root as abs(1+sqrt(2)). Its sign can be
       told, so the bars come off: what is inside, or that turned round. Left as it is where the sign cannot be told. */
    for (let m; (m = text.match(/^abs\((.*)\)$/)) && closes(m[1]);){ const n = numeric(N, m[1]); if (!(Math.abs(n) >= 1e-12)) break;
      answer = N(n > 0 ? m[1] : `-(${m[1]})`); text = answer.toString(); }
    /* A single root comes out whole, or as a fraction, when it is squared enough times. The solver is not believed
       when it says so: it gives 8 for (√2-√6)², dropping the cross term. What it claims is checked against the
       number the text itself comes to, and taken only where the two agree. */
    const is = single ? numeric(N, text) : NaN;
    for (let k = 0; single && k <= 3; k++){ let up; try { up = N(`expand((${text})^${2 ** k})`).toString(); } catch (e){ break; }
      const m = up.match(RATIONAL); if (!m || m[2] === '0') continue;
      const top = B(m[1]); if (k > 0 && top < 0n) continue;      /* an even power is never negative */
      const claimed = norm(k > 0 && is < 0 ? -top : top, B(m[2] || 1), k), near = approx(claimed);
      if (Math.abs(near - is) <= 1e-9 * Math.max(1, Math.abs(is))) return valueOf(claimed); }
    /* the solver works in numbers of its own that may round a long one: an answer holding one is not kept */
    if (/\d{16}/.test(text)) return err(LARGE);
  } catch (e){ return err('that cannot be worked out'); }
  return { sym: text };
}
/* whether a text's brackets all close within it, so that abs(a)+abs(b) is not taken for one abs */
const closes = t => { let d = 0; for (const c of t){ if (c === '(') d++; else if (c === ')' && --d < 0) return false; } return d === 0; };
/* The solver works in numbers only while it is asked for one (evaluate), and is to be exact again after. It does not
   put itself back where the asking throws (0 to a power below 0, say): from then on it would answer everything in
   numbers, and an irrational value would come back as a fraction that looks exact (-173472523/87017948 for
   -(1/2)^erf(-2)). So it is put back here, every time, whatever happened. */
const exactly = N => { try { if (N.get('PARSE2NUMBER')) N.set('PARSE2NUMBER', false); } catch (e){ /* a solver with no such setting has nothing to put back */ } };
/* what the solver's text comes to as a number, at its own precision: used only to tell a sign, never shown */
const numbers = new Map();
function numeric(N, text){
  if (!numbers.has(text)){ if (numbers.size > 4000) numbers.clear(); let n; try { n = Number(N(text).evaluate().text('decimals')); } catch (e){ n = NaN; } finally { exactly(N); } numbers.set(text, n); }
  return numbers.get(text);
}

/* -1, 0 or 1 as a is below, level with or above b, or an error. a and b: any of whole, infinite, exact, symbolic.
   Two numbers this file holds exactly are compared exactly. Otherwise the solver is asked for the difference, and
   where that is not a number it has reduced, its sign is told numerically. A numeric difference means something only
   against the size of what was subtracted, so the band inside which nothing is decided is 1e-12 of the larger of 1,
   the two sides, and the terms of the difference as the solver left it (all taken as positive): (1+√2)(1+√3)·10⁶
   against its own expansion differs by 1e-9 of floating-point noise, and is not decided by it. */
/* a difference with every additive minus turned positive, keeping signs inside exponents and function calls intact,
   so e^(-50) is not turned into e^(+50) while estimating the size of subtracted terms */
function positive(t){
  let out = '';
  for (let i = 0; i < t.length; i++){
    const c = t[i];
    if ((c === '^' || /[a-zA-Z_]/.test(c)) && t[i + 1] === '('){
      let j = i + 1, d = 0;
      for (; j < t.length; j++){ if (t[j] === '(') d++; else if (t[j] === ')' && !--d){ j++; break; } }
      out += t.slice(i, j); i = j - 1;
    } else if (c === '^' && t[i + 1] === '-'){ out += '^-'; i++; }
    else if (c === '-') out += !out || /[(+*/]\s*$/.test(out) ? '' : '+';
    else out += c;
  }
  return out;
}
const UNDECIDED = 'cannot be compared exactly';
function compare(a, b){
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;      /* whole numbers and infinities */
  if (isInf(a)) return a > 0 ? 1 : -1; if (isInf(b)) return b > 0 ? -1 : 1;
  const x = numberOf(a), y = numberOf(b);
  if (x && y) return order(x, y);
  const N = solver(); if (!N) return err('the maths solver did not load');
  const within = (gap, ...sizes) => Math.abs(gap) >= 1e-12 * Math.max(1, ...sizes.map(Math.abs).filter(Number.isFinite)) ? (gap < 0 ? -1 : 1) : err(UNDECIDED);
  /* one side too large to hand to the solver: by the numbers the two come to, which here are far apart or not told apart */
  if (isLarge(a) || isLarge(b)){ const na = x ? approx(x) : numeric(N, a.sym), nb = y ? approx(y) : numeric(N, b.sym);
    return Number.isNaN(na) || Number.isNaN(nb) ? err(UNDECIDED) : Math.abs(na - nb) >= 1e-9 * Math.max(1, Math.abs(na), Math.abs(nb)) ? (na < nb ? -1 : 1) : err(UNDECIDED); }
  const A = forSolver(a), B_ = forSolver(b), d = solve(A + '-' + B_);
  if (isError(d)) return d;
  const exactly = numberOf(d); if (exactly) return sign(exactly);
  const na = numeric(N, A), nb = numeric(N, B_);
  if (Number.isNaN(na) || Number.isNaN(nb)) return err(UNDECIDED);
  if (Number.isFinite(na) && Number.isFinite(nb)) return within(numeric(N, d.sym), na, nb, numeric(N, positive(d.sym)));
  /* one side is past what a floating-point number holds (exp(1000)). Against a side that is not, that settles it; two
     such sides of one sign are compared by their logarithms, which the solver reduces (ln(exp(1000)) is 1000). */
  if (na !== nb) return na < nb ? -1 : 1;
  const s = na > 0 ? '' : '-', la = numeric(N, `log(${s}${A})`), lb = numeric(N, `log(${s}${B_})`);
  if (!Number.isFinite(la) || !Number.isFinite(lb)) return err(UNDECIDED);
  const c = within(la - lb, la, lb); return isError(c) || na > 0 ? c : -c;
}
const COMPARE = { '==': c => c === 0, '!=': c => c !== 0, '<': c => c < 0, '>': c => c > 0, '<=': c => c <= 0, '>=': c => c >= 0 };
const INF = n => n > 0 ? Infinity : -Infinity;
/* arithmetic where a or b is an infinity */
function infinite(op, a, b){
  if (op === '-') return infinite('+', a, isInf(b) ? -b : 0);      /* what is taken from an infinity makes no difference unless it is one */
  if (op === '+') return isInf(a) && isInf(b) ? (a === b ? a : err('∞ − ∞ has no value')) : isInf(a) ? a : b;
  const sa = compare(a, 0), sb = compare(b, 0); if (isError(sa)) return sa; if (isError(sb)) return sb;
  if (op === '*') return sa * sb === 0 ? err('0 × ∞ has no value') : INF(sa * sb);
  if (op === '/') return isInf(a) && isInf(b) ? err('∞ / ∞ has no value') : isInf(b) ? 0 : sb === 0 ? err(DIV0) : INF(sa * sb);
  /* a power. An infinity raised: to more than 0 it is infinite (-∞ only to a whole power, whose evenness gives the sign), to less than 0 it is 0. */
  if (isInf(a) && !isInf(b)){ if (sb === 0) return err('∞^0 has no value'); if (sb < 0) return 0; if (a > 0) return Infinity;
    return isInteger(b) ? (b % 2 ? -Infinity : Infinity) : err(NOVALUE); }
  /* raised to an infinity: what is above 1 grows without end and what is between 0 and 1 dies away; 1 and anything below 0 have no value */
  const one = compare(a, 1); if (isError(one)) return one;
  if (sa < 0 || one === 0) return err(NOVALUE);
  return one > 0 ? (b > 0 ? Infinity : 0) : b > 0 ? 0 : sa === 0 ? err(DIV0) : Infinity;
}
/* The whole number a symbolic value comes nearest to, as the solver's own precision tells it, or null where that is
   no number a plain one holds. It is never shown and settles nothing: it is the one whole number the value can be
   asked against exactly (combine('==', v, nearest(v))), which is how a number space tells ln(8)/ln(2) to be 3. */
export function nearest(v){
  if (!isSym(v)) return null;
  const x = numberOf(v), N = x ? null : solver(); if (!x && !N) return null;
  const n = Math.round(x ? approx(x) : numeric(N, v.sym)); return Number.isSafeInteger(n) ? n + 0 : null;      /* (+ 0: never -0) */
}
/* a value as a floating-point number, for where a decimal is involved */
const float = v => isDec(v) ? v.f : typeof v === 'boolean' ? +v : typeof v === 'number' ? v : numberOf(v) ? approx(numberOf(v)) : numeric(solver(), v.sym);
const decimal = f => Number.isNaN(f) ? err(NOVALUE) : { f };
const FLOAT = { '+': (x, y) => x + y, '-': (x, y) => x - y, '*': (x, y) => x * y, '^': (x, y) => x ** y, max: Math.max, min: Math.min };

export function combine(op, a, b){
  if (typeof a === 'number' && typeof b === 'number' && Number.isInteger(a) && Number.isInteger(b)){      /* two whole numbers: the usual case, and the quick one */
    const r = op === '+' ? a + b : op === '*' ? a * b : op === '-' ? a - b : op === '/' && b !== 0 && a % b === 0 ? a / b : NaN;
    if (Number.isSafeInteger(r)) return r || 0;      /* (never -0) */
  }
  if (isError(a)) return a; if (isError(b)) return b;
  if (a === null || a === undefined || b === null || b === undefined) return null;
  if (Number.isNaN(a) || Number.isNaN(b)) return err(NOVALUE);
  if (isNone(a) || isNone(b)){ if (op === '==' || op === '!=') return (isNone(a) && isNone(b)) === (op === '=='); if (op !== '&&' && op !== '||') return NONE; }      /* None with anything is None; it is equal only to None; and it is false */
  if (op === '&&' || op === '||'){ const p = truth(a), q = truth(b); return isError(p) ? p : isError(q) ? q : op === '&&' ? p && q : p || q; }
  if (isDec(a) || isDec(b) || kind(a) === 'decimal' || kind(b) === 'decimal'){ const x = float(a), y = float(b);
    return COMPARE[op] ? COMPARE[op](x < y ? -1 : x > y ? 1 : 0) : op === '/' ? (y === 0 ? err(DIV0) : decimal(x / y)) : decimal(FLOAT[op](x, y)); }
  if (typeof a === 'boolean') a = +a; if (typeof b === 'boolean') b = +b;
  if (COMPARE[op] || op === 'max' || op === 'min'){ const c = compare(a, b); if (isError(c)) return c;
    return COMPARE[op] ? COMPARE[op](c) : (op === 'max') === (c >= 0) ? a : b; }
  if (isInf(a) || isInf(b)) return infinite(op, a, b);
  const x = numberOf(a), y = numberOf(b);
  if (x && y){
    const r = op === '+' ? plus(x, y) : op === '-' ? plus(x, [-y[0], y[1], y[2]]) : op === '*' ? times(x, y) : op === '/' ? (sign(y) ? times(x, flip(y)) : DIV0) : power(x, y);
    if (typeof r === 'string') return err(r);
    if (r) return valueOf(r);
    if (!isLarge(a) && !isLarge(b) && (op === '+' || op === '-')) return solve(forSolver(a) + op + forSolver(b), false);      /* two roots, neither a fraction of the other: settled here that their sum is no single root */
  }
  if (isLarge(a) || isLarge(b)) return err(LARGE);      /* not a single root, and too long for the solver to be trusted with */
  /* a root of a value below 0 that was not worked out above: an even one there is none of, and the solver would not say so */
  if (op === '^' && y && !y[2] && y[1] !== 1n){ const s = x ? sign(x) : compare(a, 0); if (isError(s)) return s;
    if (s < 0 && y[1] % 2n === 0n) return err(EVEN);
    if (s < 0){ const r = combine('^', combine('-', 0, a), b); return y[0] % 2n ? combine('-', 0, r) : r; } }      /* and an odd root of one below 0 is the real one: the root of it turned round, turned back */
  return solve(forSolver(a) + op + forSolver(b));
}

/* Several terms of one sum, or factors of one product, looked at all together, so that what they come to does not
   turn on the order they stand in. A chain of combine calls does: None + ∞ is None, and None − ∞ after it None
   again, where ∞ − ∞ before the None is an error. Here the terms that are None or unknown are set aside and the
   others are added (or multiplied) in their order: if those come to an error (one of them is one, or two of them
   make one between them, ∞ + −∞, 0 × ∞) the whole is that error; otherwise it is unknown if any term is unknown,
   None if any is None, and what the others came to where none is either, which is the chain of combine calls it
   always was.
       together(op, terms, signs, rests) -> { value, rest }
   op: '+' or '*'. signs: for a sum, -1 for a term that is taken away (a − b + c: [1, -1, 1]; the first is never);
   left out, every term is added. rests: for a term that is itself the None or the unknown of such a sum or product
   (one node of a graph made of another), what the terms set aside there came to, undefined where there were none.
   rest: the same for this one, undefined where nothing was set aside or nothing was left. */
export function together(op, terms, signs = null, rests = null){
  let unknown = false, none = false;
  for (const v of terms){ if (v === null || v === undefined) unknown = true; else if (isNone(v)) none = true; }
  const step = (acc, v, k) => { const minus = !!signs && signs[k] < 0; return acc === undefined ? (minus ? combine('-', 0, v) : v) : combine(minus ? '-' : op, acc, v); };
  let acc;
  if (!unknown && !none){ for (let k = 0; k < terms.length; k++) acc = step(acc, terms[k], k); return { value: acc }; }
  for (let k = 0; k < terms.length; k++){ const v = terms[k], aside = v === null || v === undefined || isNone(v), w = aside ? (rests ? rests[k] : undefined) : v;
    if (w !== undefined && w !== null) acc = step(acc, w, k); }
  if (isError(acc)) return { value: acc };
  return { value: unknown ? null : NONE, rest: acc };
}

const HALF = { n: 1, d: 2, k: 0 };
/* erf for a decimal (Abramowitz and Stegun 7.1.26: good to 1.5e-7, which is finer than the 32-bit numbers a decimal comes from) */
const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x < 0 ? -y : y; };
const FLOAT1 = { neg: x => -x, abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, tanh: Math.tanh, erf };
export function apply(fn, a){
  if (isError(a)) return a;
  if (a === null || a === undefined) return null;
  if (fn === '!'){ const t = truth(a); return isError(t) ? t : !t; }
  if (isNone(a)) return NONE;
  if (isDec(a) || kind(a) === 'decimal') return decimal(FLOAT1[fn](float(a)));
  if (typeof a === 'boolean') a = +a;
  if (fn === 'neg') return combine('-', 0, a);
  if (fn === 'sqrt') return a === Infinity ? Infinity : a === -Infinity ? err(EVEN) : combine('^', a, HALF);
  const s = compare(a, 0); if (isError(s)) return s;
  if (fn !== 'abs' && isLarge(a)) return err(LARGE);
  if (fn === 'abs') return s < 0 ? combine('-', 0, a) : a;
  if (fn === 'exp') return a === Infinity ? Infinity : a === -Infinity ? 0 : s === 0 ? 1 : solve(`exp${forSolver(a)}`);
  if (fn === 'ln') return s < 0 ? err('ln of a negative number') : s === 0 ? -Infinity : a === Infinity ? Infinity : a === 1 ? 0 : solve(`log${forSolver(a)}`);
  if (fn === 'tanh' || fn === 'erf') return isInf(a) ? s : s === 0 ? 0 : solve(fn + forSolver(a));
  return err('unknown function: ' + fn);
}

export function typedNumber(text){
  const [rawWhole = '', rawPart = ''] = String(text).split('.');
  const whole = rawWhole.replace(/^0+/, ''), part = rawPart.replace(/0+$/, '');
  if (!whole && !part) return 0;
  /* past 1,300 whole digits or 4,100 fractional digits, no reduced fraction can fit inside MAXBITS (4096 bits) */
  if (whole.length > 1300 || part.length > 4100) return err(LARGE);
  return valueOf(norm(B((whole || '0') + part), 10n ** B(part.length), 0));
}

/* the solver's text in the signs results are written in here: e^2 as exp(2), log as ln, sqrt as √, * as · */
function pretty(t){
  let out = '';
  for (let i = 0; i < t.length; i++){
    if (t[i] !== 'e' || /[\w.]/.test(t[i - 1] || '') || /[\w.(]/.test(t[i + 1] || '')){ out += t[i]; continue; }      /* only e standing alone: the number */
    if (t[i + 1] !== '^'){ out += 'exp(1)'; continue; }
    let j = i + 2, depth = 0;
    if (t[j] === '(') for (; j < t.length; j++){ if (t[j] === '(') depth++; else if (t[j] === ')' && !--depth){ j++; break; } }
    else while (j < t.length && /[\w.]/.test(t[j])) j++;
    const power = t.slice(i + 2, j); out += 'exp' + (power[0] === '(' ? power : `(${power})`); i = j - 1;
  }
  return out.replace(/(?<![\w.])log\(/g, 'ln(').replace(/sqrt\(/g, '√(').replace(/√\((\d+)\)/g, '√$1').replace(/(\d)\*√/g, '$1√').replace(/\*/g, '·');
}
/* a decimal written out: always with exactly 9 significant digits, which is every digit a 32-bit float has, so that it
   is never written like an exact number: 1 is "1.00000000", a million "1000000.00", 0.1 as such a float
   "0.100000001". A number of ten digits or more before its point, or six noughts or more after it, is written with
   its size apart: "2.90488498e13", "1.00000000e-7". One of exactly nine digits before its point ends in the point,
   "123456792.", so that even that is not written as a whole number is. */
export const digits = f => f === Infinity ? '∞' : f === -Infinity ? '-∞' : Number.isNaN(f) ? '!' : f.toPrecision(9).replace('e+', 'e').replace(/^-?\d+$/, '$&.');
export function written(v){
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'T' : 'F';
  if (typeof v === 'number') return v === Infinity ? '∞' : v === -Infinity ? '-∞' : String(v);
  if (isError(v)) return '!';
  if (isNone(v)) return '∅';
  if (isSym(v)){ const t = largeOf(v.sym); if (!t || !t[2]) return pretty(v.sym);      /* a root of a number too large for plain numbers: written as a root, with nothing brought out from under it */
    const mark = t[2] === 1 ? '√' : t[2] === 2 ? '∜' : null, under = t[1] === 1n ? String(big(t[0])) : `(${big(t[0])}/${t[1]})`;
    return (t[0] < 0n ? '-' : '') + (mark ? mark + under : `${under}^(1/${2 ** t[2]})`); }
  if (isDec(v)) return digits(v.f);
  if (!isSurd(v)) return '';
  const p = v.n, q = v.d || 1;
  if (!v.k) return q === 1 ? String(p) : p + '/' + q;
  const minus = p < 0 ? '-' : '', n = Math.abs(p), e = 2 ** v.k, mark = v.k === 1 ? '√' : v.k === 2 ? '∜' : null;
  if (q !== 1) return minus + (mark ? `${mark}(${n}/${q})` : `(${n}/${q})^(1/${e})`);
  let c = Math.floor(Math.pow(n, 1 / e) + 1e-9); while (c > 1 && n % (c ** e)) c--;      /* the largest whole factor that comes out from under the root */
  const rest = n / (c ** e); return minus + (c > 1 ? c : '') + (mark ? mark + rest : `${rest}^(1/${e})`);
}

export function surd(n, k, d = 1){ return valueOf(norm(B(n), B(d), k)); }
export function rootOf(v){
  if (typeof v === 'boolean') v = +v;
  if (isNone(v)) return NONE;
  if (!(isInteger(v) || isSurd(v) || isSym(v))) return null;
  const s = compare(v, 0); if (isError(s) || s < 0) return null;
  const r = combine('^', v, HALF); return isError(r) ? null : r;
}
export function sideOf(v){
  if (isError(v)) return { refused: v.err };
  if (v === null || v === undefined) return { refused: 'it has no value yet' };
  if (!isInteger(v)) return { refused: `a matrix's side is a whole number of squares: it cannot be ${written(v)}` };
  return v >= 1 ? { length: v } : { refused: 'it has to be at least 1' };
}
export const exact = v => { const a = isInteger(v) || isSurd(v) ? numberOf(v) : null; return a && { p: Number(a[0]), q: Number(a[1]), k: a[2] }; };
export const held = e => !e || typeof e !== 'object' || !Number.isInteger(e.p) ? null : valueOf(norm(B(e.p), B(e.q || 1), e.k || 0));
