/* What a source is. No drawing here: a kind and a size in, entries out.

   A source is a block that has values at any size without storing them. Nothing is kept for it in a project but
   what kind it is ("source" in the shape's file); resizing one, or tying a side of it to a named length, changes how
   many entries it has and never what they are.

   Three kinds are worked out here, in the browser: what each entry is follows from its column and its row alone.
       kind        entry at column i, row j (both from 1)             on its face     kept as
       zeros       0                                                   0               "zeros"
       ones        1                                                   1               "ones"
       identity    1 where i equals j, else 0. It need not be square   I               "identity"
   Two more are made from the Data in card, and only the backend has their numbers (backend/): here they have a
   kind, a size and nothing else, and the page says "needs the backend" where there is none.
       noise       a number drawn from its distribution, fixed by its  ~               { "noise": { "seed": 0, "dist": "uniform" } }
                   seed, the id of the block the variable was made
                   as, and the entry's column and row: never by where
                   the block is. seed is a whole number; dist is
                   "uniform" (from 0 up to 1) or "normal" (mean 0,
                   deviation 1)
       file        the numbers of a CSV file kept with the project,    csv             { "file": "data/weights.csv" }, or
                   under data/                                                         { "file": null } before one is chosen

   SOURCES                       -> [{ kind, label, face }]: the three kinds worked out here, in the order the New menu offers them
   DATA                          -> [{ kind, label, face }]: the two the Data in card makes
   DISTS                         -> the distributions of noise: ['uniform', 'normal']
   kept(source)                  -> the source as it is kept where it is one of those, else null: one of the three
                                    words, { noise: { seed, dist } } or { file }, with every field of its kind and
                                    nothing else. What is read from a file or carried by a message is a source only
                                    if it is one this program has. (A noise with a seed that is no whole number, or
                                    a distribution there is none of, is given 0 and "uniform"; a file whose path is
                                    not one a project may hold is no file chosen.)
   kindOf(source)                -> 'zeros' | 'ones' | 'identity' | 'noise' | 'file', or null for no source
   remote(source)                -> whether only the backend has its numbers: noise, and a file
   labelOf(source)               -> what it is called in a sentence: "zeros", "an identity", "noise", "a data file"
   faceOf(source)                -> what is written on such a block's face, or null for no source
   noise(seed, dist)             -> { noise: { seed, dist } } as it is kept
   seedOf(value)                 -> { seed } | { refused: a sentence }: a value typed for a seed (values.js), which
                                    has to be a whole number
   dataPath(path)                -> the path where it is one a project may hold a data file at, else null: "data/",
                                    then one file name of letters, digits, spaces, _ . and -, ending ".csv". No
                                    directory below data/, and nothing that climbs out of it.
   dataName(name, taken)         -> such a path made from a file's own name ("My Weights.CSV" -> "data/My Weights.csv"),
                                    different from every path in taken (a Set, or anything with has)
   entry(kind, column, row)      -> that entry: 0 or 1. undefined where kind is none of the three, or the place is
                                    not a whole column and row from 1
   values(kind, cols, rows)      -> a Map from "column,row" to every entry of a source that size; empty for noise and
                                    for a file. The same Map is given for the same question: it is not to be changed
   typable(source, name)         -> { ok: true } | { refused: a sentence }: whether entries can be typed into a block.
                                    Not into a source: its entries are what it is
   holds(source, name)           -> { ok: true } | { refused }: whether shapes can stand in its matrix (snap to
                                    matrix). Not in a source's: nothing but its kind defines it */
export const SOURCES = [{ kind: 'zeros', label: 'Zeros', face: '0' }, { kind: 'ones', label: 'Ones', face: '1' }, { kind: 'identity', label: 'Identity', face: 'I' }];
export const DATA = [{ kind: 'noise', label: 'Noise', face: '~' }, { kind: 'file', label: 'File', face: 'csv' }];
export const DISTS = ['uniform', 'normal'];
const byKind = new Map(SOURCES.map(s => [s.kind, s])), byData = new Map(DATA.map(s => [s.kind, s]));
const PATH = /^data\/[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}\.csv$/;
export const dataPath = path => typeof path === 'string' && PATH.test(path) && !path.includes('..') ? path : null;
export function dataName(name, taken = new Set()){
  const stem = String(name ?? '').replace(/\.csv$/i, '').replace(/[^A-Za-z0-9 _.-]/g, '-').replace(/\.{2,}/g, '.').replace(/^[^A-Za-z0-9]+/, '').trim().slice(0, 60) || 'data';
  let path = `data/${stem}.csv`; for (let n = 2; taken.has(path); n++) path = `data/${stem}-${n}.csv`;
  return path;
}
export const noise = (seed = 0, dist = 'uniform') => ({ noise: { seed: Number.isSafeInteger(seed) ? seed : 0, dist: DISTS.includes(dist) ? dist : 'uniform' } });
export function kept(source){
  if (typeof source === 'string') return byKind.has(source) ? source : null;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  if (source.noise && typeof source.noise === 'object') return noise(source.noise.seed, source.noise.dist);
  if ('file' in source && !('noise' in source)) return { file: dataPath(source.file) };
  return null;
}
export const kindOf = source => { const k = kept(source); return k === null ? null : typeof k === 'string' ? k : k.noise ? 'noise' : 'file'; };
export const remote = source => { const k = kindOf(source); return k === 'noise' || k === 'file'; };
export const labelOf = source => ({ zeros: 'zeros', ones: 'ones', identity: 'an identity', noise: 'noise', file: 'a data file' })[kindOf(source)] ?? null;
export const faceOf = source => { const k = kindOf(source); return k === null ? null : (byKind.get(k) || byData.get(k)).face; };
export function seedOf(value){
  return Number.isSafeInteger(value) ? { seed: value } : { refused: 'A seed is a whole number' };
}
const place = n => Number.isInteger(n) && n >= 1;
export const entry = (kind, column, row) => !byKind.has(kind) || !place(column) || !place(row) ? undefined : kind === 'zeros' ? 0 : kind === 'ones' ? 1 : column === row ? 1 : 0;
const made = new Map();                         /* "kind cols rows" -> its Map: a source is asked for its entries often, and they never differ */
export function values(kind, cols, rows){
  if (!byKind.has(kind) || !place(cols) || !place(rows)) return new Map();
  const key = kind + ' ' + cols + ' ' + rows;
  if (!made.has(key)){ if (made.size > 200) made.clear();
    const out = new Map(); for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) out.set(c + ',' + r, entry(kind, c, r));
    made.set(key, out); }
  return made.get(key);
}
const called = (source, name) => `${name || 'It'} is ${labelOf(source)}: a source`;
export const typable = (source, name) => kept(source) ? { refused: `${called(source, name)} stores no entries, so none can be typed. Resize it for more of them` } : { ok: true };
export const holds = (source, name) => kept(source) ? { refused: `${called(source, name)} is defined by its kind alone: nothing stands in its matrix` } : { ok: true };
