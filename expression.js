/* Arithmetic as it is typed into an attribute: numbers, names, + - * / ^ and brackets, worked out exactly.
   No drawing here: text in, a value out.

   The working out is not done here. It is handed to nerdamer, a symbolic maths solver (vendor/nerdamer.min.js,
   version 1.1.13, MIT licence: vendor/nerdamer.license.txt), which the page loads before its own code and which is
   found as the global `nerdamer`. This file only gets what was typed ready for it and reads its answer.

   What can be typed: the usual order holds (brackets, then powers, right to left, then times and divide, then plus
   and minus). × · ÷ − are read as * * / -, and a number or a bracket set straight against another multiplies
   (2(3+1), 2x). A power is written ^ and then a number, a name, or a bracket: 2^(1/2). √ and ∜ before a number, a
   name or a bracket are its square and fourth root, so a result can be typed back in: 2√3.

   Nothing is ever rounded: the solver works in whole numbers, fractions and roots, and decimals typed in are taken
   as fractions. An answer that is a single root is given as a value, { p, q, k }: the fraction p over q in lowest
   terms, under k square roots (k 0: a whole number or a fraction; k 1: its square root, so 2^(1/2) is { 2, 1, 1 },
   written √2). Any other answer, such as √2 + 1 or 2^(1/3), stays as the solver simplified it, in words.

   evaluate(text, lookup) -> { value: { p, q, k } }        it comes to one such value
                           | { inexact: true, text }       well formed, but not one such value: text is its simplest form ("1+√2")
                           | { error: 'why' }              not something that can be read: "unknown name: w", "divide by zero", …
                           | { empty: true }               nothing typed
       lookup(name) is asked for each name in it and gives { p, q, k }, the word 'inexact', or undefined for a name it does not know
   written(value)    -> "7", "-3", "3/4", "√2", "2√3", "√(1/2)"
   whole(value)      -> the whole number a value is, or null where it is not one
   number(n)         -> a whole number as a value;  value(p, q, k) -> any value, in lowest terms */
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

const solver = () => globalThis.nerdamer;
/* a value as the solver reads it */
const forSolver = v => { const body = v.k ? `((${Math.abs(v.p)}/${v.q})^(1/${2 ** v.k}))` : `(${Math.abs(v.p)}/${v.q})`; return v.p < 0 ? `(-${body})` : body; };
/* what was typed, made ready: signs the solver does not know turned into ones it does, a root sign into a power, and
   each name into the value it stands for */
function prepared(text, lookup){
  const s = String(text).replace(/[×·∙]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-'); let out = '', i = 0;
  const operand = () => {      /* what a root sign applies to: a bracket, a number or a name */
    while (s[i] === ' ') i++;
    if (s[i] === '('){ let depth = 0, from = i; for (; i < s.length; i++){ if (s[i] === '(') depth++; else if (s[i] === ')' && !--depth){ i++; return piece(s.slice(from + 1, i - 1)); } } throw new Wrong('a bracket is not closed'); }
    if (s[i] === '√' || s[i] === '∜'){ const four = s[i] === '∜'; i++; return `((${operand()})^(1/${four ? 4 : 2}))`; }
    const m = s.slice(i).match(/^(\d*\.?\d+|\d+\.?|[A-Za-z_][\w.]*)/); if (!m) throw new Wrong('a root sign with nothing under it'); i += m[0].length; return piece(m[0]); };
  const piece = t => prepared(t, lookup);
  while (i < s.length){ const c = s[i];
    if (c === '√' || c === '∜'){ i++; out += `((${operand()})^(1/${c === '∜' ? 4 : 2}))`; continue; }
    if (/[A-Za-z_]/.test(c)){ const id = s.slice(i).match(/^[A-Za-z_][\w.]*/)[0].replace(/\.+$/, ''); i += id.length; const v = lookup(id);
      if (v === undefined) throw new Wrong('unknown name: ' + id); if (v === INEXACT) throw new Inexact(); out += forSolver(v); continue; }
    if (/[0-9.+\-*\/^()\s]/.test(c)){ out += c; i++; continue; }
    throw new Wrong(`cannot read "${c}"`);
  }
  return out;
}
class Inexact extends Error {}
const RATIONAL = /^(-?\d+)(?:\/(\d+))?$/;
/* the solver's answer in the signs results are written in here */
const pretty = t => t.replace(/sqrt\(/g, '√(').replace(/√\((\d+)\)/g, '√$1').replace(/(\d)\*√/g, '$1√').replace(/\*/g, '·');
export function evaluate(text, lookup = () => undefined){
  if (!String(text).trim()) return { empty: true };
  const N = solver(); if (!N) return { error: 'the maths solver did not load' };
  try {
    const typed = prepared(text, lookup);
    let answer; try { answer = N(typed); } catch (e){ const m = String(e.message || e);
      throw new Wrong(/zero/i.test(m) ? 'divide by zero' : /bracket/i.test(m) ? 'a bracket is not closed' : 'that cannot be read as arithmetic'); }
    const said = answer.toString(); if (/(^|[^a-z])i([^a-z]|$)/.test(said)) throw new Wrong('an even root of a negative number');
    if (!said || /NaN|Infinity/.test(said)) throw new Wrong('that has no value');
    /* a single root comes out whole, or as a fraction, when it is squared enough times */
    for (let k = 0; k <= 3; k++){ let up; try { up = N(`expand((${said})^${2 ** k})`).toString(); } catch (e){ break; }
      const m = up.match(RATIONAL); if (!m) continue;
      const top = Number(m[1]), sign = k > 0 && Number(answer.evaluate().text()) < 0 ? -1 : 1; if (k > 0 && top < 0) continue;      /* an even power is never negative */
      const v = make(sign * top, Number(m[2] || 1), k);
      return v === INEXACT ? { inexact: true, text: pretty(said) } : { value: v }; }
    return { inexact: true, text: pretty(said) };
  } catch (e){ if (e instanceof Wrong) return { error: e.message }; if (e instanceof Inexact) return { inexact: true, text: null }; throw e; }
}
