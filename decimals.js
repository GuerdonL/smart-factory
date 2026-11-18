/* Decimals on the page: what the backend's numbers are here, which of them are asked for, and how one is shown.
   No drawing here and no network: plain data in, plain data out.

   A value from the backend is the decimal kind, { f: 0.4375 } (values.js): a 32-bit float. It is for showing, and for
   nothing else: exact arithmetic stays the rule in the browser, so nothing the page works out, checks, refuses or
   saves ever reads one. The page keeps the backend's answers apart from the evaluator's and lays one over the other
   only where it draws (smart-factory.js: "the backend"); the laying is merged, below.
   A decimal is never mixed up with an exact number. In a matrix written on the canvas (a result beside a piece, an
   arrow's output, a tile's copies) it is drawn as a filled square, black at 0 or below, white at 1 or above, grey
   between; in the properties panel and in a definition space's equation it is written out with exactly 9
   significant digits (values.js: digits), in a style of its own, with the exact form it stands for beside it
   where it has one (exp(1)). It is never saved: results are asked for again when the project is opened.

   What is asked of the backend, and what is not. An exact value stays exact, always: a whole number, a fraction, a
   root, and a symbolic value the browser holds exactly (1+√2). The backend is asked only for
     - a result the browser does not work out at all: one too large for it, or made of noise or of a data file;
     - an entry that is one of the functions the browser leaves symbolic, or holds one: exp, ln, tanh, erf.

   along(n, name)             -> which entries along a side of n are written: every one up to eight; past that the
                                 first three, the elided middle (null) and the last. A side with a name is a variable
                                 length and is always written that way: [{ i, ghost, last } | null]. (matrix.js draws
                                 by this; it is here so that what is asked of the backend is what is drawn.)
   drawn(type)                -> [[column, row], …]: the entries of a matrix of that type ({ cols, rows, colsName,
                                 rowsName }) that are ever drawn, on the canvas or in the panel: at most 8 by 8 of
                                 them however large it is. Only these are asked of the backend.
   level(f)                   -> how light a decimal's square is, from 0 (black) to 1 (white): f itself, held to
                                 that range. What has no number (NaN) is 0.
   fromBackend(v)             -> a value in the backend's answer as a value here: a number as { f }, "inf" and
                                 "-inf" as { f: ±Infinity }, { err } as that error; anything else is unknown (null)
   functional(v)              -> whether a value is symbolic and holds exp, ln, tanh or erf (as the solver writes
                                 them: e^2, e, log(2), tanh(1), erf(1)): the only exact values a decimal is shown for
   wanted(answer)             -> whether the backend is asked for an evaluator's answer (evaluate.js): one that is
                                 deferred, or one in which an entry is functional
   merged(answer, exact, result, stale) -> the values to draw: a Map from "column,row". answer is the evaluator's,
                                 exact its entries as a Map (toMap), result the backend's for the same node
                                 ({ cells: [[c, r, value], …] }) or null. Where the answer is deferred, every entry
                                 the backend gave is its decimal. Where it was worked out, every entry is as the
                                 evaluator has it, but a functional one, which is the backend's decimal carrying
                                 the exact form it stands for: { f, exact: "exp(1)" }. stale: the result is of an
                                 older state of the project (it is drawn dimmed until the new one comes); the Map
                                 then has stale: true.
   noted(note)                -> an empty Map that carries a note in place of values ("needs the backend", or why the
                                 backend gave none): matrix.js writes the note where the numbers would be. The same
                                 Map for the same note.
   laid(answer, exact, { there, got, why }) -> what is drawn of an evaluator's answer, given what the backend has for
                                 it (backend.js): there is whether a backend answers (true, false, null while not
                                 known), got is { result, stale } or null, why the reason it gave no numbers or null.
                                 An answer the backend is not asked for is drawn as it is (exact, the very Map). One
                                 worked out here that holds a functional entry is exact until its decimals come, and
                                 merged then. One not worked out here (deferred) has nothing to show without the
                                 backend, and says so in place of its values, never silently: with no backend, NEEDS
                                 where it is made of noise or of a data file (one that is only too large stays as the
                                 browser has it, symbols, as it was before there was a backend); with one, its answer,
                                 or why there is none, or ASKING while the first answer is waited for.
                                 exact is never changed, and what is given back is for drawing only.
   NEEDS, ASKING              -> 'needs the backend'; 'asking the backend'
   keyOf(values)              -> what tells one such Map from another, for a component that redraws only when what
                                 it shows has changed: its entries, its note and whether it is stale */
import { written } from './values.js';
export const NEEDS = 'needs the backend', ASKING = 'asking the backend';
export const along = (n, name = null) => name ? [...[1, 2, 3].map(i => ({ i, ghost: i >= n })), null, { i: n, last: true }]
  : (n <= 8 ? Array.from({ length: n }, (_, i) => i + 1) : [1, 2, 3, null, n]).map(i => i === null ? null : { i });
const side = n => n <= 8 ? Array.from({ length: n }, (_, i) => i + 1) : [1, 2, 3, n];      /* a named side shows 1, 2, 3 and the last, which are among these */
export function drawn(type){
  const out = []; if (!type || !(type.cols >= 1) || !(type.rows >= 1)) return out;
  for (const r of side(type.rows)) for (const c of side(type.cols)) out.push([c, r]);
  return out;
}
export const level = f => !(f > 0) ? 0 : f >= 1 ? 1 : f;
export const fromBackend = v => typeof v === 'number' && Number.isFinite(v) ? { f: v } : v === 'inf' ? { f: Infinity } : v === '-inf' ? { f: -Infinity }
  : v && typeof v === 'object' && typeof v.err === 'string' ? { err: v.err } : null;
/* exp, ln, tanh and erf as the solver writes them: a call of exp, log, ln, tanh or erf, or the number e standing alone or raised (e^2) */
const FUNCTION = /(^|[^\w.])(?:(?:exp|log|ln|tanh|erf)\(|e(?![\w.(]))/;
export const functional = v => !!v && typeof v === 'object' && typeof v.sym === 'string' && FUNCTION.test(v.sym);
const wants = new WeakMap();
export function wanted(answer){
  if (!answer || typeof answer !== 'object') return false;
  if (answer.deferred) return true;
  if (!answer.entries) return false;
  if (!wants.has(answer)) wants.set(answer, Object.values(answer.entries).some(functional));
  return wants.get(answer);
}
export function merged(answer, exact, result, stale = false){
  const cells = result && Array.isArray(result.cells) ? result.cells : [];
  const out = answer.deferred ? new Map() : new Map(exact);
  for (const cell of cells){ if (!Array.isArray(cell)) continue; const key = cell[0] + ',' + cell[1], v = fromBackend(cell[2]), was = out.get(key);
    if (v === null) continue;
    if (answer.deferred) out.set(key, v);
    else if (functional(was)) out.set(key, 'f' in v ? { f: v.f, exact: written(was) } : v); }
  if (stale) out.stale = true;
  return out;
}
export function laid(answer, exact, { there = null, got = null, why = null } = {}){
  if (!wanted(answer)) return exact;
  if (!answer.deferred) return got ? merged(answer, exact, got.result, got.stale) : exact;
  if (there === false) return answer.backend ? noted(NEEDS) : exact;
  if (got) return merged(answer, exact, got.result, got.stale);
  return why ? noted(why) : there ? noted(ASKING) : exact;
}
const notes = new Map();
export function noted(note){ if (!notes.has(note)){ if (notes.size > 200) notes.clear(); notes.set(note, Object.assign(new Map(), { note })); } return notes.get(note); }
export const keyOf = values => values ? [values.note || '', values.stale ? 1 : 0, ...values] : [];
