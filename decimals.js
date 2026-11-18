/* Decimals on the page: what the backend's numbers are here, which of them are asked for, and how one is shown.
   No drawing here and no network: plain data in, plain data out.

   A value from the backend is the decimal kind, { f: 0.4375 } (values.js): a 32-bit float. It is never mixed up with
   an exact number. In a matrix written on the canvas (a result beside a piece, an arrow's output) it is drawn as a
   filled square, black at 0 or below, white at 1 or above, grey between; in the properties panel and in a
   definition space's equation it is written out, to 9 significant digits (values.js: digits). It is never saved:
   results are asked for again when the project is opened.

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
   wanted(answer)             -> whether the backend is asked for an evaluator's answer (evaluate.js): one that is
                                 deferred (too large for the browser, or made of noise or a data file), or one in
                                 which an entry is symbolic (exp(1): exact, and not a number that can be drawn)
   merged(answer, exact, result, stale) -> the values to draw: a Map from "column,row". answer is the evaluator's,
                                 exact its entries as a Map (toMap), result the backend's for the same node
                                 ({ cells: [[c, r, value], …] }) or null. Where the answer is deferred, every entry
                                 the backend gave is its decimal. Where it was worked out, an exact entry stays
                                 exact: only a symbolic one is replaced by the backend's decimal. stale: the result
                                 is of an older state of the project (it is drawn dimmed until the new one comes);
                                 the Map then has stale: true.
   noted(note)                -> an empty Map that carries a note in place of values ("needs the backend"): matrix.js
                                 writes the note where the numbers would be. The same Map for the same note.
   NEEDS                      -> 'needs the backend'
   keyOf(values)              -> what tells one such Map from another, for a component that redraws only when what
                                 it shows has changed: its entries, its note and whether it is stale */
export const NEEDS = 'needs the backend';
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
const isSym = v => !!v && typeof v === 'object' && typeof v.sym === 'string';
const wants = new WeakMap();
export function wanted(answer){
  if (!answer || typeof answer !== 'object') return false;
  if (answer.deferred) return true;
  if (!answer.entries) return false;
  if (!wants.has(answer)) wants.set(answer, Object.values(answer.entries).some(isSym));
  return wants.get(answer);
}
export function merged(answer, exact, result, stale = false){
  const cells = result && Array.isArray(result.cells) ? result.cells : [];
  const out = answer.deferred ? new Map() : new Map(exact);
  for (const cell of cells){ if (!Array.isArray(cell)) continue; const key = cell[0] + ',' + cell[1], v = fromBackend(cell[2]);
    if (v !== null && (answer.deferred || isSym(out.get(key)))) out.set(key, v); }
  if (stale) out.stale = true;
  return out;
}
const notes = new Map();
export function noted(note){ if (!notes.has(note)) notes.set(note, Object.assign(new Map(), { note })); return notes.get(note); }
export const keyOf = values => values ? [values.note || '', values.stale ? 1 : 0, ...values] : [];
