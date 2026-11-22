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

   A stream (phase 9) is a noise or a file block that shows successive values, and moves on with the project's tick. It
   is drawn as a tile: one value's size is its pattern and its length, the number of successive values it shows at
   once, the count across, so the block is length values wide. Beside its source it keeps
       stream      { "length": 8, "start": 0, "step": 1, "end": "stop" }
   and where it stands is never kept: value j of its window (from 0) at tick t begins at unit start + t × step +
   j × span. What a unit is, and how many of them one value spans, follows from its kind:
       kind    its file     a unit            one value                                 its span          the value's size
       noise   none         a draw            the generator with the unit as its tick   1                 free
       csv     data/….csv   a row             as many rows as the block is tall         the block's rows  the file's columns wide; as tall as it is pulled
       text    data/….txt   a character       as many characters as the value is wide   the value's cols  one row; as wide as it is pulled
               (UTF-8)      (a code point)
       npy     data/….npy   an index along    the array at that index: its shape past   1                 the file's
               (32-bit      its first axis    the first axis
               floats)
   step is how many units the window moves on each tick: a value's span unless another is typed, so that the next
   value begins where the last ended. end says what happens past the file's last unit: "stop" (the stream has no
   value, and says it has ended) or "wrap" (it begins again). start and step may be null in a file: not known, and
   the stream then has no value. Only the backend has a stream's numbers.

   One more is worked out here and is no block's kind: nothing offers it, and no file holds it.
       none        None ({ none: true }, values.js), at every entry. It is the empty side of a condition: the graph
                   has it as a source of kind "none" (graph.js), and values and entry answer for it. kept does not
                   take it: a shape whose file says "source": "none" is an ordinary shape.

   SOURCES                       -> [{ kind, label, face }]: the three kinds worked out here, in the order the New menu offers them
   EMPTY                         -> "none", the kind that holds None at every entry
   DATA                          -> [{ kind, label, face }]: the two the Data in card makes
   STREAMS                       -> [{ kind, label }]: and the two streams it makes, of noise and of a file
   ENDS                          -> what a stream does at its file's end: ['stop', 'wrap']
   stream(length, start, step, end) -> { length, start, step, end } as it is kept: a whole length of at least 1 (else
                                    1), a whole start from 0 or null, a whole step of at least 1 or null, and one
                                    of ENDS (else "stop")
   streamOf(source)              -> its stream as it is kept, or null where it is no stream
   streamKind(source)            -> 'noise' | 'csv' | 'text' | 'npy' for a stream, null for what is none or has no
                                    file chosen yet
   streamRead(raw)               -> { stream, said: [what was not understood, a clause each] }: what a file holds
                                    for "stream", read; said is empty where every word of it is known
   fileKind(path)                -> 'csv' | 'text' | 'npy': what a data file is, by its ending; null for no data file
   spanOf(source, cols, rows)    -> how many units one value of a stream spans, for a block that size
   valueOf(source, cols, rows)   -> { cols, rows }: the size of one value of a stream in a block that size
   pulled(source, was, to, name) -> { source, cols, rows } | { refused: a sentence }: a stream block pulled from
                                    one size to another by an edge (both { cols, rows }): where the value's width
                                    is its own to choose (noise, text) the width pulled is the value's, and the
                                    length stays; where it is the file's (csv, npy) the length is pulled. The
                                    height is the value's rows: free for noise and for a CSV, refused for text and
                                    .npy. A step that was the value's span follows it.
   resized(source, was, set, name) -> the same for what is typed: set is { length } | { cols } | { rows } (a
                                    value's), | { start } | { step } | { end }
   DISTS                         -> the distributions of noise: ['uniform', 'normal']
   kept(source)                  -> the source as it is kept where it is one of those, else null: one of the three
                                    words, { noise: { seed, dist } } or { file }, with every field of its kind and
                                    nothing else; a stream is one of the last two with stream beside it, { noise,
                                    stream } or { file, stream }. A plain file block reads a CSV and nothing else. What is read from a file or carried by a message is a source only
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
                                    then one file name of letters, digits, spaces, _ . and -, ending ".csv", ".txt"
                                    or ".npy". No directory below data/, and nothing that climbs out of it.
   dataName(name, taken)         -> such a path made from a file's own name ("My Weights.CSV" -> "data/My Weights.csv"),
                                    different from every path in taken (a Set, or anything with has); a name
                                    that ends in none of the three is given ".csv"
   tooSmall(text)                -> how many numbers of a numeric CSV are written as other than nought and are too
                                    small for a 32-bit float (1e-60), so that the backend reads them as 0. The same
                                    count as backend/data.py's survey: the backend says it when a file is chosen
                                    (POST /data: "small"), and this says it of a file opened with its project
   smallSays(n)                  -> the sentence for that in the file block's panel, or null where n is 0
   entry(kind, column, row)      -> that entry: 0 or 1, or None for the empty kind. undefined where kind is none of
                                    those four, or the place is not a whole column and row from 1
   values(kind, cols, rows, inner) -> a Map from "column,row" to every entry of a source that size; empty for noise and
                                    for a file. The same Map is given for the same question: it is not to be changed.
                                    inner: the lengths of the inner axes of a source whose entries hold inner data
                                    (left out: none). Its keys are then "column,row,k1,k2,…", and what a number is
                                    still follows from its column and row alone: zeros and ones everywhere, an
                                    identity 1 where column equals row at every inner position
   typable(source, name)         -> { ok: true } | { refused: a sentence }: whether entries can be typed into a block.
                                    Not into a source: its entries are what it is
   sizable(source, name)         -> { ok: true } | { refused: a sentence }: whether such a block's size can be changed.
                                    Not that of a block that reads a file: its size is the file's, which it took
                                    when the file was chosen, and another file is how it comes to another size. One
                                    that has no file chosen yet, and every other source, can be any size.
   holds(source, name)           -> { ok: true } | { refused }: whether shapes can stand in its matrix (snap to
                                    matrix). Not in a source's: nothing but its kind defines it */
export const SOURCES = [{ kind: 'zeros', label: 'Zeros', face: '0' }, { kind: 'ones', label: 'Ones', face: '1' }, { kind: 'identity', label: 'Identity', face: 'I' }];
export const DATA = [{ kind: 'noise', label: 'Noise', face: '~' }, { kind: 'file', label: 'File', face: 'csv' }];
export const DISTS = ['uniform', 'normal'];
export const EMPTY = 'none';
const NOTHING = Object.freeze({ none: true }), ruled = kind => byKind.has(kind) || kind === EMPTY;      /* what is worked out here by rule */
const byKind = new Map(SOURCES.map(s => [s.kind, s])), byData = new Map(DATA.map(s => [s.kind, s]));
export const STREAMS = [{ kind: 'noise', label: 'Noise stream' }, { kind: 'file', label: 'File stream' }];
export const ENDS = ['stop', 'wrap'];
const ENDINGS = { csv: 'csv', txt: 'text', npy: 'npy' };
const PATH = /^data\/[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}\.(?:csv|txt|npy)$/;
export const dataPath = path => typeof path === 'string' && PATH.test(path) && !path.includes('..') ? path : null;
export const fileKind = path => dataPath(path) ? ENDINGS[path.slice(path.lastIndexOf('.') + 1)] : null;
export function dataName(name, taken = new Set()){
  const said = String(name ?? '').match(/\.(csv|txt|npy)$/i), ending = said ? said[1].toLowerCase() : 'csv';
  const stem = String(name ?? '').replace(/\.(csv|txt|npy)$/i, '').replace(/[^A-Za-z0-9 _.-]/g, '-').replace(/\.{2,}/g, '.').replace(/^[^A-Za-z0-9]+/, '').trim().slice(0, 60) || 'data';
  let path = `data/${stem}.${ending}`; for (let n = 2; taken.has(path); n++) path = `data/${stem}-${n}.${ending}`;
  return path;
}
const natural = (v, least) => Number.isSafeInteger(v) && v >= least;
export const stream = (length = 1, start = 0, step = 1, end = 'stop') => ({ length: natural(length, 1) ? length : 1, start: start === null || natural(start, 0) ? start : 0, step: step === null || natural(step, 1) ? step : 1, end: ENDS.includes(end) ? end : 'stop' });
const isStream = raw => !!raw && typeof raw === 'object' && !Array.isArray(raw);
export function streamRead(raw){
  if (!isStream(raw)) return { stream: null, said: raw === undefined || raw === null ? [] : ['its stream is not { length, start, step, end }, and it is read as no stream'] };
  const said = [];
  if (raw.length !== undefined && !natural(raw.length, 1)) said.push(`a length of ${JSON.stringify(raw.length) ?? 'nothing'} is read as 1`);
  if (!(raw.start === undefined || raw.start === null || natural(raw.start, 0))) said.push(`a start of ${JSON.stringify(raw.start) ?? 'nothing'} is read as 0`);
  if (!(raw.step === undefined || raw.step === null || natural(raw.step, 1))) said.push(`a step of ${JSON.stringify(raw.step) ?? 'nothing'} is read as 1`);
  if (raw.end !== undefined && !ENDS.includes(raw.end)) said.push(`an end of ${JSON.stringify(raw.end) ?? 'nothing'} is read as "stop"`);
  return { stream: stream(raw.length, raw.start === undefined ? 0 : raw.start, raw.step === undefined ? 1 : raw.step, raw.end), said };
}
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/, MAY_BE_SMALL = /[eE]|\d{39}/;      /* (only a line with an exponent or a long run of digits can hold one) */
export function tooSmall(text){ let n = 0;
  for (const line of String(text ?? '').split(/\r\n|\r|\n/)){ if (!MAY_BE_SMALL.test(line)) continue;
    for (const c of line.split(',')){ const cell = c.replace(/^[ \t"]+|[ \t"]+$/g, '');
      if (NUMBER.test(cell) && Math.fround(Number(cell)) === 0 && /[1-9]/.test(cell.split(/[eE]/)[0])) n++; } }
  return n; }
export const smallSays = n => Number.isSafeInteger(n) && n > 0 ? `${n === 1 ? '1 number' : n.toLocaleString('en-US') + ' numbers'} too small for 32 bits ${n === 1 ? 'was' : 'were'} read as 0` : null;
export const noise = (seed = 0, dist = 'uniform') => ({ noise: { seed: Number.isSafeInteger(seed) ? seed : 0, dist: DISTS.includes(dist) ? dist : 'uniform' } });
export function kept(source){
  if (typeof source === 'string') return byKind.has(source) ? source : null;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const s = isStream(source.stream) ? { stream: streamRead(source.stream).stream } : null;
  if (source.noise && typeof source.noise === 'object') return { ...noise(source.noise.seed, source.noise.dist), ...s };
  if ('file' in source && !('noise' in source)) return { file: s ? dataPath(source.file) : fileKind(source.file) === 'csv' ? source.file : null, ...s };      /* (a plain file block reads a CSV; text and .npy are read as streams) */
  return null;
}
export const streamOf = source => { const k = kept(source); return k && typeof k === 'object' && k.stream ? k.stream : null; };
export const streamKind = source => { const k = kept(source); return !k || typeof k !== 'object' || !k.stream ? null : k.noise ? 'noise' : fileKind(k.file); };
export const spanOf = (source, cols, rows) => { const s = streamOf(source), kind = streamKind(source); return !s ? null : kind === 'csv' ? rows : kind === 'text' ? cols / s.length : 1; };
export const valueOf = (source, cols, rows) => { const s = streamOf(source); return s ? { cols: cols / s.length, rows } : null; };
const WHOLE = 'a whole number, at least 1';
/* a stream at a new size or with a new setting: its step follows the value's span where it was that span */
function restreamed(source, was, length, vcols, vrows, name, more = {}){
  const k = kept(source), s = k.stream, kind = streamKind(k), it = name || 'It', mine = valueOf(k, was.cols, was.rows), file = k.file ? ` (${k.file})` : '';
  if (![length, vcols, vrows].every(n => natural(n, 1))) return { refused: `${it} is a stream: its length and its value's sides are each ${WHOLE}` };
  if (vcols !== mine.cols && (kind === 'csv' || kind === 'npy')) return { refused: `${it} reads ${k.file}: one value of it is as wide as the file makes it, ${mine.cols} ${mine.cols === 1 ? 'column' : 'columns'}, and that is not typed or pulled. Its length is` };
  if (vrows !== mine.rows && kind === 'npy') return { refused: `${it} reads ${k.file}: one value of it is the size the file gives, ${mine.cols} × ${mine.rows}. Its length can be changed` };
  if (vrows !== mine.rows && kind === 'text') return { refused: `${it} is a stream of text${file}: one value of it is one row of characters. Make it wider for more characters in a value` };
  const span = spanOf(k, was.cols, was.rows), next = { ...k, stream: { ...s, length, ...more } }, now = spanOf(next, vcols * length, vrows);
  if (!('step' in more) && s.step === span && now !== span) next.stream.step = now;      /* the next value still begins where the last ended */
  return { source: next, cols: vcols * length, rows: vrows };
}
export function pulled(source, was, to, name){
  const s = streamOf(source), kind = streamKind(source); if (!s) return { refused: `${name || 'It'} is no stream` };
  const mine = valueOf(source, was.cols, was.rows), free = kind === 'noise' || kind === 'text' || kind === null;      /* whether the value's width is its own to choose */
  return free ? restreamed(source, was, s.length, Math.max(1, Math.round(to.cols / s.length)), to.rows, name) : restreamed(source, was, Math.max(1, Math.round(to.cols / mine.cols)), mine.cols, to.rows, name);
}
export function resized(source, was, set, name){
  const s = streamOf(source), it = name || 'It'; if (!s) return { refused: `${it} is no stream` };
  const mine = valueOf(source, was.cols, was.rows);
  if ('length' in set) return natural(set.length, 1) ? restreamed(source, was, set.length, mine.cols, mine.rows, name) : { refused: `A stream's length is ${WHOLE}: how many values it shows at once` };
  if ('cols' in set) return natural(set.cols, 1) ? restreamed(source, was, s.length, set.cols, mine.rows, name) : { refused: `A value's columns are ${WHOLE}` };
  if ('rows' in set) return natural(set.rows, 1) ? restreamed(source, was, s.length, mine.cols, set.rows, name) : { refused: `A value's rows are ${WHOLE}` };
  if ('start' in set) return natural(set.start, 0) ? restreamed(source, was, s.length, mine.cols, mine.rows, name, { start: set.start }) : { refused: 'A stream\'s start is a whole number, from 0: the unit its first value begins at when the tick is 0' };
  if ('step' in set) return natural(set.step, 1) ? restreamed(source, was, s.length, mine.cols, mine.rows, name, { step: set.step }) : { refused: `A stream's step is ${WHOLE}: how many units it moves on each tick` };
  if ('end' in set) return ENDS.includes(set.end) ? restreamed(source, was, s.length, mine.cols, mine.rows, name, { end: set.end }) : { refused: `A stream's end is ${ENDS.join(' or ')}` };
  return { refused: `${it} has no such setting` };
}
export const kindOf = source => { const k = kept(source); return k === null ? null : typeof k === 'string' ? k : k.noise ? 'noise' : 'file'; };
export const remote = source => { const k = kindOf(source); return k === 'noise' || k === 'file'; };
export const labelOf = source => streamOf(source) ? (kindOf(source) === 'noise' ? 'a stream of noise' : 'a stream of a data file') : ({ zeros: 'zeros', ones: 'ones', identity: 'an identity', noise: 'noise', file: 'a data file' })[kindOf(source)] ?? null;
export const faceOf = source => { const k = kindOf(source), kind = streamKind(source); return k === null ? null : kind && kind !== 'noise' ? { csv: 'csv', text: 'txt', npy: 'npy' }[kind] : (byKind.get(k) || byData.get(k)).face; };
export function seedOf(value){
  return Number.isSafeInteger(value) ? { seed: value } : { refused: 'A seed is a whole number' };
}
const place = n => Number.isInteger(n) && n >= 1;
export const entry = (kind, column, row) => !ruled(kind) || !place(column) || !place(row) ? undefined : kind === EMPTY ? NOTHING : kind === 'zeros' ? 0 : kind === 'ones' ? 1 : column === row ? 1 : 0;
const made = new Map();                         /* "kind cols rows" -> its Map: a source is asked for its entries often, and they never differ */
export function values(kind, cols, rows, inner = []){
  if (!ruled(kind) || !place(cols) || !place(rows) || !Array.isArray(inner) || !inner.every(place)) return new Map();
  const key = kind + ' ' + [cols, rows, ...inner].join(' ');
  if (!made.has(key)){ if (made.size > 200) made.clear();
    let tails = ['']; for (const n of inner) tails = tails.flatMap(t => Array.from({ length: n }, (_, k) => t + ',' + (k + 1)));      /* every inner position, the first axis slowest */
    const out = new Map(); for (const t of tails) for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) out.set(c + ',' + r + t, entry(kind, c, r));
    made.set(key, out); }
  return made.get(key);
}
const called = (source, name) => `${name || 'It'} is ${labelOf(source)}: a source`;
export const typable = (source, name) => kept(source) ? { refused: `${called(source, name)} stores no entries, so none can be typed. Resize it for more of them` } : { ok: true };
export const holds = (source, name) => kept(source) ? { refused: `${called(source, name)} is defined by its kind alone: nothing stands in its matrix` } : { ok: true };
export const sizable = (source, name) => { const k = kept(source); return kindOf(k) === 'file' && k.file && !k.stream ? { refused: `${name || 'It'} reads ${k.file}: its size is the file's. Choose another CSV file to change it` } : { ok: true }; };
