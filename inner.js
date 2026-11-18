/* Inner data: what a shape holds where each of its entries is itself an array. No drawing here: plain data in, plain
   data out.

   A shape on the canvas stays a scalar, a vector or a matrix: its two drawn sides. Besides them it may have an
   ordered list of inner axes, each { length, name }, the same for every entry of the shape: the first two are the
   columns and rows of one entry when it is opened, a third and fourth are that entry's own inner data, and so on.
   There are at most MOST of them. An axis with a name is one length with every side and axis of that name, as a
   named side is. There are no lists: every entry of one shape holds the same inner size.

   An entry's key is "column,row,k1,k2,…", one more number from 1 for each inner axis; a shape with no inner data
   keeps "column,row". A number never given is unknown, at any depth.

   MOST                          6: the most inner axes a shape has
   kept(inner)                   the axes as they are kept: [{ length, name }], whole lengths of at least 1, a name or
                                 null, at most MOST of them; [] for what is no such list
   tails(inner)                  every inner position as what follows "column,row" in a key: [""] for none, else
                                 ",k1,k2,…" for each, the first axis slowest
   numbers(cols, rows, inner)    how many numbers the shape holds
   counted(value)                { count } | { refused: a sentence }: what was typed for the number of data dimensions,
                                 as a value (values.js: a formula there is worked out once, when typed, and the number
                                 kept): a whole number from 0 to MOST
   countable(shape, count)       { ok: true } | { refused }: whether a shape can be given that many data dimensions.
                                 shape: { name, scalar, arrow, source: 'file' | … | null, part, measure, seated,
                                 input, entry }. A scalar holds one number and nothing else, so a 1 by 1 block is
                                 refused any; what is defined by something else (a part, a measure, a seat, an
                                 entry taken out, a function's input) holds what that holds; a data file holds none.
   resized(inner, count)         the axes with that many of them: raising adds axes of length 1 at the end, lowering
                                 removes the last
   rekeyed(entries, from, to)    { entries: a Map, lost: how many were dropped }: a shape's entries (pairs of key and
                                 value: a Map will do) when its axes go from one list to another by resized. A new
                                 axis has length 1, so every number is at its first position: the key gains ",1". An
                                 axis removed keeps the numbers at its first position and loses the rest. (A key
                                 that is not one of the shape's is kept as it is: a block made smaller may hold
                                 entries beyond its size.)
   axisTyped(text)               { name, length } | { refused }: what was typed on an axis's row, read as a side's
                                 measurement is (algebra.js: readSide): "4" a length, "embed" a name, "embed 4"
                                 both, "-" takes the name off. name is undefined where none was typed, null for "-";
                                 length is undefined where none was typed.
   described(cols, rows, inner)  what the properties panel calls the shape, or null where it holds no inner data:
                                 "vector of 2 × 4 matrices". Never a count of dimensions: the drawn sides are always
                                 two, and a count could only disagree with what is seen.
   measured(inner)               the inner part of a shape's measurement, "2 key × 4 embed" ("" for none): written
                                 after the drawn sides, as "3 × 1 · 2 key × 4 embed"
   bracket(inner)                what an entry that holds inner data is written as in a matrix: "[2×4]"
   entryType(inner)              one entry as a matrix of its own: { cols, rows, colsName, rowsName, inner: the axes
                                 after the first two }; with one axis, that many columns in a single row
   given(values)                 the entries, as a Set of "column,row", in which any number has been given: those are
                                 written as a bracket, the others as their symbol
   opened(values, path, axes)    a Map: the entries of one entry, opened. path is [[column, row], …], one pair for
                                 each level gone down: the first names an entry of the shape, the next an entry of
                                 the matrix that holds, and so on. Keys are what is left after the path, as
                                 "column,row" and on. axes: how many inner axes the shape has (an entry with one
                                 axis left is a single row: its keys are given as "k,1").
   keyAt(path, key, axes)        the shape's own key for the entry `key` of what is opened at path
   pathType(type, path)          the type of what is opened at path ({ cols, rows, colsName, rowsName, inner }), or
                                 null where the path does not lead anywhere in a shape of that type (an entry it
                                 has not got, or deeper than its axes go)
   trail(name, path)             the heading over an opened entry: "QKV › 2,1" */
import { readSide } from './algebra.js';

export const MOST = 6;
const whole = (v, least = 1) => Number.isInteger(v) && v >= least;
export const kept = inner => (Array.isArray(inner) ? inner : []).filter(a => a && typeof a === 'object').slice(0, MOST)
  .map(a => ({ length: whole(a.length) ? a.length : Math.max(1, Math.round(+a.length || 1)), name: typeof a.name === 'string' && a.name ? a.name : null }));
export function tails(inner){ let out = ['']; for (const a of kept(inner)) out = out.flatMap(p => Array.from({ length: a.length }, (_, k) => p + ',' + (k + 1))); return out; }
export const numbers = (cols, rows, inner) => kept(inner).reduce((n, a) => n * a.length, cols * rows);

export function counted(value){
  if (value && typeof value === 'object' && typeof value.err === 'string') return { refused: value.err };
  return whole(value, 0) && value <= MOST ? { count: value } : { refused: `The number of data dimensions is a whole number from 0 to ${MOST}` };
}
export function countable(shape, count){
  const name = shape.name || 'It';
  if (shape.arrow) return { refused: 'An arrow has no data of its own: its output holds what its function comes to' };
  if (shape.input) return { refused: 'in is the function\'s input: it holds what the arrow is given' };
  if (shape.part) return { refused: `${name} is part of another shape: it holds what that holds` };
  if (shape.entry) return { refused: `${name} is an entry of another shape: it holds what that entry holds` };
  if (shape.measure) return { refused: `${name} is a measure of another shape: it is one number` };
  if (shape.seated) return { refused: `${name} is seated: it holds what the arrow's output holds` };
  if (!count) return { ok: true };
  if (shape.scalar) return { refused: 'A scalar holds one number' };
  if (shape.source === 'file') return { refused: `${name} is a data file: a CSV file holds no inner data` };
  return { ok: true };
}
export function resized(inner, count){
  const now = kept(inner), n = Math.max(0, Math.min(MOST, Math.round(+count || 0)));
  return n <= now.length ? now.slice(0, n) : [...now, ...Array.from({ length: n - now.length }, () => ({ length: 1, name: null }))];
}
export function rekeyed(entries, from, to){
  const a = kept(from).length, b = kept(to).length, out = new Map(); let lost = 0;
  for (const [key, v] of entries){ const p = String(key).split(',');
    if (p.length !== a + 2){ out.set(key, v); continue; }      /* not one of its entries as it stood: left alone */
    if (b >= a){ out.set(key + ',1'.repeat(b - a), v); continue; }
    if (p.slice(b + 2).every(k => k === '1')) out.set(p.slice(0, b + 2).join(','), v); else lost++; }
  return { entries: out, lost };
}
export function axisTyped(text){
  const read = readSide(text);
  if (read.length === undefined || (read.length !== null && read.length < 1)) return { refused: `${String(text).trim()}: only a whole number, at least 1, can be an axis's length` };
  if (!read.name && read.length === null) return { refused: 'Type a length, a name, or both: "4", "embed", "embed 4"' };
  return { name: read.name === '-' ? null : read.name || undefined, length: read.length === null ? undefined : read.length };
}

const times = inner => inner.map(a => a.length).join(' × ');
export function described(cols, rows, inner){
  const ax = kept(inner); if (!ax.length) return null;
  const outer = cols === 1 && rows === 1 ? 'single entry holding' : (cols === 1 || rows === 1 ? 'vector' : 'matrix') + ' of';
  const one = outer.endsWith('holding');
  const what = ax.length === 1 ? (one ? `a vector of ${ax[0].length}` : `vectors of ${ax[0].length}`) : ax.length === 2 ? (one ? `a ${times(ax)} matrix` : `${times(ax)} matrices`) : (one ? `a ${times(ax)} array` : `${times(ax)} arrays`);
  return outer + ' ' + what;
}
export const measured = inner => kept(inner).map(a => a.length + (a.name ? ' ' + a.name : '')).join(' × ');
export const bracket = inner => '[' + kept(inner).map(a => a.length).join('×') + ']';
export function entryType(inner){
  const ax = kept(inner);
  return { cols: ax[0] ? ax[0].length : 1, rows: ax[1] ? ax[1].length : 1, colsName: ax[0] ? ax[0].name : null, rowsName: ax[1] ? ax[1].name : null, inner: ax.slice(2) };
}
export function given(values){
  const out = new Set();
  for (const key of values.keys()){ const i = key.indexOf(','), j = key.indexOf(',', i + 1); if (j > 0) out.add(key.slice(0, j)); }
  return out;
}
/* what is opened at a path has the axes that are left after it: with exactly one left it is a single row, written
   "k,1" here, and its row is not in the shape's key */
const short = (path, axes) => Number.isFinite(axes) && axes - 2 * (path.length - 1) === 1;
export function opened(values, path, axes = Infinity){
  if (!path.length) return values;
  const pre = path.flat().join(',') + ',', one = short(path, axes), out = new Map();
  for (const [key, v] of values) if (key.startsWith(pre)){ const rest = key.slice(pre.length); out.set(one ? rest + ',1' : rest, v); }
  return out;
}
export function keyAt(path, key, axes = Infinity){
  if (!path.length) return key;
  const p = String(key).split(',');
  return [...path.flat(), ...(short(path, axes) ? [p[0], ...p.slice(2)] : p)].join(',');
}
export function pathType(type, path){
  let at = { cols: type.cols, rows: type.rows, colsName: type.colsName || null, rowsName: type.rowsName || null, inner: kept(type.inner) };
  for (const pair of path){
    if (!Array.isArray(pair) || !whole(pair[0]) || !whole(pair[1]) || pair[0] > at.cols || pair[1] > at.rows || !at.inner.length) return null;
    at = entryType(at.inner); }
  return at;
}
export const trail = (name, path) => [name, ...path.map(p => p[0] + ',' + p[1])].join(' › ');
