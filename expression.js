/* Arithmetic as it is typed into an attribute: numbers, names, + - * / ^ and brackets, worked out exactly.
   No drawing here: text in, a value out.

   The order is the usual one: brackets, then powers (right to left: 2^3^2 is 2^(3^2)), then times and divide, then
   plus and minus. × · ÷ − are read as * * / -, and a number or a bracket set straight against another multiplies
   (2(3+1), 2x). A power is written ^ and then a number, a name, or a bracket: 2^(1/2).

   Nothing is ever rounded. A value is a whole number or a fraction, kept as { p, q } in lowest terms. A result that
   is neither, such as 2^(1/2), is not worked out at all: it is left as it was written (see "How results are
   written" in the README).

   evaluate(text, lookup) -> { value: { p, q } }      worked out exactly
                           | { inexact: true }        well formed, but not a whole number or a fraction: leave it as written
                           | { error: 'why' }         not something that can be read: "unknown name: w", "divide by zero", …
                           | { empty: true }          nothing typed
       lookup(name) is asked for each name in it and gives { p, q }, the word 'inexact', or undefined for a name it does not know
   written(value)    -> "7", "-3", "3/4"
   whole(value)      -> the whole number a value is, or null where it is a fraction
   number(n)         -> a whole number as a value */
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
const make = (p, q = 1) => { if (q < 0){ p = -p; q = -q; } const g = gcd(p, q); p /= g; q /= g; return Number.isSafeInteger(p) && Number.isSafeInteger(q) ? { p, q } : INEXACT; };
const INEXACT = 'inexact';
export const number = n => make(n, 1);
export const whole = v => v && v !== INEXACT && v.q === 1 ? v.p : null;
export const written = v => v.q === 1 ? String(v.p) : v.p + '/' + v.q;

class Wrong extends Error {}
function tokens(text){
  const out = [], s = text.replace(/[×·∙*]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-'); let i = 0;
  while (i < s.length){ const c = s[i];
    if (/\s/.test(c)){ i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))){ const m = s.slice(i).match(/^\d*\.?\d*/)[0]; out.push({ n: m }); i += m.length; continue; }
    if (/[A-Za-z_]/.test(c)){ const m = s.slice(i).match(/^[A-Za-z_][\w.]*/)[0].replace(/\.+$/, ''); out.push({ id: m }); i += m.length; continue; }
    if ('+-*/^()'.includes(c)){ out.push({ op: c }); i++; continue; }
    throw new Wrong(`cannot read "${c}"`);
  }
  return out;
}
const add = (a, b) => a === INEXACT || b === INEXACT ? INEXACT : make(a.p * b.q + b.p * a.q, a.q * b.q);
const mul = (a, b) => a === INEXACT || b === INEXACT ? INEXACT : make(a.p * b.p, a.q * b.q);
const neg = a => a === INEXACT ? INEXACT : make(-a.p, a.q);
function div(a, b){ if (b !== INEXACT && b.p === 0) throw new Wrong('divide by zero'); return a === INEXACT || b === INEXACT ? INEXACT : make(a.p * b.q, a.q * b.p); }
/* the exact n-th root of a whole number, or null where it has none */
const root = (v, n) => { if (v < 0) return n % 2 ? (r => r === null ? null : -r)(root(-v, n)) : null; const r = Math.round(Math.pow(v, 1 / n)); return Math.pow(r, n) === v ? r : null; };
function pow(a, e){
  if (a === INEXACT || e === INEXACT) return INEXACT;
  if (a.p === 0){ if (e.p <= 0) throw new Wrong(e.p ? 'divide by zero' : '0^0 has no value'); return make(0); }
  if (Math.abs(e.p) > 64) return INEXACT;
  let p = a.p, q = a.q;
  if (e.q !== 1){ if (a.p < 0 && e.q % 2 === 0) throw new Wrong('an even root of a negative number'); p = root(p, e.q); q = root(q, e.q); if (p === null || q === null) return INEXACT; }      /* not a whole number or a fraction: left as written */
  const n = Math.abs(e.p), P = Math.pow(p, n), Q = Math.pow(q, n);
  return e.p < 0 ? make(Q, P) : make(P, Q);
}
export function evaluate(text, lookup = () => undefined){
  if (!String(text).trim()) return { empty: true };
  try {
    const ts = tokens(String(text)); let i = 0;
    const peek = () => ts[i], op = c => ts[i]?.op === c && (i++, true);
    const starts = () => { const t = peek(); return !!t && (t.n !== undefined || t.id !== undefined || t.op === '('); };
    const atom = () => { const t = ts[i++];
      if (!t) throw new Wrong('something is missing at the end');
      if (t.n !== undefined){ const [w, f = ''] = t.n.split('.'); return make(Number(w + f), Math.pow(10, f.length)); }      /* a decimal typed in is a fraction: 0.25 is 1/4 */
      if (t.id !== undefined){ const v = lookup(t.id); if (v === undefined) throw new Wrong('unknown name: ' + t.id); return v; }
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
