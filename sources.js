/* What a source is. No drawing here: a kind and a size in, entries out.

   A source is a block that has values at any size without storing them: what each entry is follows from its column
   and its row alone. Resizing one, or tying a side of it to a named length, changes how many entries it has and
   never what they are. Nothing is kept for it in a project but its kind ("source": "zeros" in the shape's file).

       kind        entry at column i, row j (both from 1)             on its face
       zeros       0                                                   0
       ones        1                                                   1
       identity    1 where i equals j, else 0. It need not be square   I

   Random sources and sources read from a file come in phase 7; nothing here knows of them, and kept() drops them.

   SOURCES                       -> [{ kind, label, face }]: the kinds, in the order the New menu offers them
   kept(source)                  -> the kind where source is one of those, else null: what is read from a file or
                                    carried by a message is a source only if it is one this program has
   faceOf(kind)                  -> what is written on such a block's face, or null for no source
   entry(kind, column, row)      -> that entry: 0 or 1. undefined where kind is no source, or the place is not a
                                    whole column and row from 1
   values(kind, cols, rows)      -> a Map from "column,row" to every entry of a source that size. The same Map is
                                    given for the same question: it is not to be changed
   typable(source, name)         -> { ok: true } | { refused: a sentence }: whether entries can be typed into a block.
                                    Not into a source: its entries are what it is
   holds(source, name)           -> { ok: true } | { refused }: whether shapes can stand in its matrix (snap to
                                    matrix). Not in a source's: nothing but its kind defines it */
export const SOURCES = [{ kind: 'zeros', label: 'Zeros', face: '0' }, { kind: 'ones', label: 'Ones', face: '1' }, { kind: 'identity', label: 'Identity', face: 'I' }];
const byKind = new Map(SOURCES.map(s => [s.kind, s]));
export const kept = source => typeof source === 'string' && byKind.has(source) ? source : null;
export const faceOf = kind => byKind.get(kind)?.face ?? null;
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
const called = (source, name) => `${name || 'It'} is ${source === 'identity' ? 'an identity' : source}: a source`;
export const typable = (source, name) => kept(source) ? { refused: `${called(source, name)} stores no entries, so none can be typed. Resize it for more of them` } : { ok: true };
export const holds = (source, name) => kept(source) ? { refused: `${called(source, name)} is defined by its kind alone: nothing stands in its matrix` } : { ok: true };
