/* Arithmetic as it is typed into an attribute: numbers, names, + - * / ^ and brackets, worked out exactly.
   No drawing here: text in, a value out.

   The order is the usual one: brackets, then powers (right to left: 2^3^2 is 2^(3^2)), then times and divide, then
   plus and minus. × · ÷ − are read as * * / -, and a number or a bracket set straight against another multiplies
   (2(3+1), 2x). A power is written ^ and then a number, a name, or a bracket: 2^(1/2).
   √ and ∜ before a number, a name or a bracket are its square and fourth root, so a result can be typed back in: 2√3.

   Nothing is ever rounded. A value is { p, q, k }: the fraction p over q in lowest terms, under k square roots (k 0:
   a whole number or a fraction; k 1: its square root, so 2^(1/2) is { 2, 1, 1 }, written √2). Roots multiply,
   divide and take powers exactly. A result that is none of these, such as √2 + 1 or 2^(1/3), is not worked out at
   all: it is left as it was written (see "How results are written" in the README).

   evaluate(text, lookup) -> { value: { p, q } }      worked out exactly
                           | { inexact: true }        well formed, but not a whole number or a fraction: leave it as written
                           | { error: 'why' }         not something that can be read: "unknown name: w", "divide by zero", …
                           | { empty: true }          nothing typed
       lookup(name) is asked for each name in it and gives { p, q }, the word 'inexact', or undefined for a name it does not know
   written(value)    -> "7", "-3", "3/4", "√2", "2√3", "√(1/2)"
   whole(value)      -> the whole number a value is, or null where it is not one
   number(n)         -> a whole number as a value;  value(p, q, k) -> any value, in lowest terms
   power(value, exponent) -> one value to the power of another, or the word 'inexact' */
class Wrong extends Error {}
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
const INEXACT = 'inexact';
const sq = n => { const r = Math.round(Math.sqrt(n)); return r * r === n ? r : null; };
/* a value in lowest terms: p over q, under k square roots, as few of them as it needs (√(9/4) is 3/2) */
function make(p, q = 1, k = 0){
  if (q < 0){ p = -p; q = -q; } const g = gcd(p, q); p /= g; q /= g;
  if (p === 0) return { p: 0, q: 1, k: 0 };
  while (k > 0){ const a = sq(Math.abs(p)), b = sq(q); if (a === null || b === null) break; p = Math.sign(p) * a; q = b; k--; }
  return Number.isSafeInteger(p) && Number.isSafeInteger(q) && k <= 6 ? { p, q, k } : INEXACT;
}
export const value = make;
export const number = n => make(n, 1);
export const whole = v => v && v !== INEXACT && v.q === 1 && !v.k ? v.p : null;
export function written(v){
  if (!v.k) return v.q === 1 ? String(v.p) : v.p + '/' + v.q;
  const sign = v.p < 0 ? '-' : '', n = Math.abs(v.p), e = 2 ** v.k, mark = v.k === 1 ? '√' : v.k === 2 ? '∜' : null;
  if (v.q !== 1) return sign + (mark ? `${mark}(${n}/${v.q})` : `(${n}/${v.q})^(1/${e})`);
  let c = Math.floor(Math.pow(n, 1 / e) + 1e-9); while (c > 1 && n % (c ** e)) c--;      /* the largest whole factor that comes out from under the root */
  const rest = n / (c ** e); return sign + (c > 1 ? c : '') + (mark ? mark + rest : `${rest}^(1/${e})`);
}

function tokens(text){
  const out = [], s = text.replace(/[×·∙*]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-'); let i = 0;
  while (i < s.length){ const c = s[i];
    if (/\s/.test(c)){ i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))){ const m = s.slice(i).match(/^\d*\.?\d*/)[0]; out.push({ n: m }); i += m.length; continue; }
    if (/[A-Za-z_]/.test(c)){ const m = s.slice(i).match(/^[A-Za-z_][\w.]*/)[0].replace(/\.+$/, ''); out.push({ id: m }); i += m.length; continue; }
    if ('+-*/^()√∜'.includes(c)){ out.push({ op: c }); i++; continue; }
    throw new Wrong(`cannot read "${c}"`);
  }
  return out;
}
/* a value's whole numbers lifted under more roots, so that two values are under the same number of them */
const lift = (v, K) => { const e = 2 ** (K - v.k); return [Math.sign(v.p) || 1, Math.pow(Math.abs(v.p), e), Math.pow(v.q, e)]; };
const add = (a, b) => a === INEXACT || b === INEXACT || a.k || b.k ? (a !== INEXACT && b !== INEXACT && a.p === 0 ? b : a !== INEXACT && b !== INEXACT && b.p === 0 ? a : INEXACT) : make(a.p * b.q + b.p * a.q, a.q * b.q);      /* a sum with a root in it is not one number */
function mul(a, b){ if (a === INEXACT || b === INEXACT) return INEXACT; const K = Math.max(a.k, b.k), [sa, pa, qa] = lift(a, K), [sb, pb, qb] = lift(b, K); return make(sa * sb * pa * pb, qa * qb, K); }
const neg = a => a === INEXACT ? INEXACT : { ...a, p: -a.p };
const inv = a => { if (a.p === 0) throw new Wrong('divide by zero'); return { p: Math.sign(a.p) * a.q, q: Math.abs(a.p), k: a.k }; };
const div = (a, b) => { if (b !== INEXACT && b.p === 0) throw new Wrong('divide by zero'); return a === INEXACT || b === INEXACT ? INEXACT : mul(a, inv(b)); };
/* the exact n-th root of a whole number, or null where it has none */
const root = (v, n) => { const r = Math.round(Math.pow(v, 1 / n)); return Math.pow(r, n) === v ? r : null; };
function pow(a, e){
  if (a === INEXACT || e === INEXACT || e.k) return INEXACT;
  if (a.p === 0){ if (e.p <= 0) throw new Wrong(e.p ? 'divide by zero' : '0^0 has no value'); return make(0); }
  if (Math.abs(e.p) > 64) return INEXACT;
  let sign = Math.sign(a.p), p = Math.abs(a.p), q = a.q, k = a.k, n = e.q, twos = 0;
  while (n % 2 === 0){ n /= 2; twos++; }
  if (twos){ if (sign < 0) throw new Wrong('an even root of a negative number'); k += twos; }      /* a square root is kept as a root */
  if (n > 1){ if (k) return INEXACT; p = root(p, n); q = root(q, n); if (p === null || q === null) return INEXACT; }      /* any other root has to come out whole */
  const m = Math.abs(e.p), out = make((m % 2 ? sign : 1) * Math.pow(p, m), Math.pow(q, m), k);
  return out === INEXACT ? INEXACT : e.p < 0 ? make(Math.sign(out.p) * out.q, Math.abs(out.p), out.k) : out;
}
export const power = pow;
export function evaluate(text, lookup = () => undefined){
  if (!String(text).trim()) return { empty: true };
  try {
    const ts = tokens(String(text)); let i = 0;
    const peek = () => ts[i], op = c => ts[i]?.op === c && (i++, true);
    const starts = () => { const t = peek(); return !!t && (t.n !== undefined || t.id !== undefined || t.op === '(' || t.op === '√' || t.op === '∜'); };
    const atom = () => { const t = ts[i++];
      if (!t) throw new Wrong('something is missing at the end');
      if (t.n !== undefined){ const [w, f = ''] = t.n.split('.'); return make(Number(w + f), Math.pow(10, f.length)); }      /* a decimal typed in is a fraction: 0.25 is 1/4 */
      if (t.id !== undefined){ const v = lookup(t.id); if (v === undefined) throw new Wrong('unknown name: ' + t.id); return v; }
      if (t.op === '√' || t.op === '∜') return pow(power(), make(1, t.op === '√' ? 2 : 4));      /* a root sign, as results are written: √2, 2√3 */
      if (t.op === '('){ const v = sum(); if (!op(')')) throw new Wrong('a bracket is not closed'); return v; }
      throw new Wrong(`"${t.op}" is out of place`); };
    const power = () => { const base = atom(); return op('^') ? pow(base, unary()) : base; };
    const unary = () => op('-') ? neg(unary()) : op('+') ? unary() : power();
    const product = () => { let v = unary(); for (;;){ if (op('*')) v = mul(v, unary()); else if (op('/')) v = div(v, unary()); else if (starts()) v = mul(v, power()); else return v; } };
    const sum = () => { let v = product(); for (;;){ if (op('+')) v = add(v, product()); else if (op('-')) v = add(v, neg(product())); else return v; } };
    const v = sum(); if (i < ts.length) throw new Wrong(ts[i].op === ')' ? 'a bracket is closed that was never opened' : 'two values with nothing between them');
    return v === INEXACT ? { inexact: true } : { value: v };
  } catch (e){ if (e instanceof Wrong) return { error: e.message }; throw e; }
}
