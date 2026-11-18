/* A project on disk: the whole tree of shapes written as a tree of files, and read back.
   No drawing and no browser here: plain data in, file texts out, and the reverse.

   Shapes and files are the same tree. A space is a directory. Each shape in it is one config file, and a shape that
   has a definition space has a directory of the same name beside its file, holding that space in the same way.
   A frame (several shapes framed together; once called a group) is one combined file holding all of its shapes.

       my-project/
         project.json              what this is, and when it was saved
         Embedding.json            a shape
         Keys.json                 a shape with a definition ...
         Keys/                     ... which is this directory
           Embedding.json
           Key Weights.json
         Pair.frame.json           a frame: several shapes in one file
         .config                   the frame called .config, under exactly that name (see below)
         operations.json           what Difference and Intersect have cut in this space, if anything (see below)

   The project's own directory is the top space, the Menu.

   No two things written in one directory have the same name, whatever the shapes are called, and none differ only
   in capitals (some file systems take those for one name). Where two would, the later one's name gets a number:
   "Keys (2).json". That goes for a file against a directory too, and for a shape called "Keys.frame" beside a frame
   called "Keys", which would both be Keys.frame.json. Beyond its ending, nothing is read from a file's name: a
   shape's name is in its config, and so is the directory of its definition.

   A shape's config:
       { "format": "smart-factory/shape", "version": 1,
         "id": "b0x7m2c",                          the block's id, kept so that it is the same block when opened again
         "type": "tensor",                       which config in shapes/ it is an instance of
         "name": "Keys", "named": true,          named: it has been given a name of its own
         "commented": false,                     its name begins with //, so it takes no part
         "color": "variable-3",                     a theme colour; null for an unnamed shape, which has its type's
         "position": { "x": -12, "y": 4 },       its top-left corner, in units from the space's origin
         "size": { "cols": 4, "rows": 6 },
         "sides": { "cols": "key", "rows": "context" },      the names of its sides, null where unnamed
         "value": { "as": "computation",         how its value stands (see below)
                    "entries": { "1,1": 7, "2,1": "-inf", "3,1": { "n": 1, "d": 2, "k": 1 }, "1,2": true,
                                 "2,2": { "expr": "1/√(@[b3k2m9x:x])" } } },
                                                 entries given a value, by "column,row": a literal value or a
                                                 formula (see "Entries", below)
         "definition": "Keys/",                  the directory holding its definition space, if it has one with anything in it
         "order": 3,                             its place among the shapes of its space, back to front
         "standing": true,                       a standing shape: it stands in its owner's matrix (it was dropped onto that matrix), and
                                                 its place in the definition space is its place among the entries. Written
                                                 "tile": true before phase 5; either is read
         "source": "zeros",                      it is a source (sources.js): "zeros", "ones" or "identity". Its entries follow
                                                 from its kind and its size, and none are written: its "entries" are empty
         "attributes": [ { "name": "heads", "value": "2^(3) + 1" } ],
                                                 attributes given to the variable by hand: a name, and a value as it was
                                                 typed (a number, or a formula; ^( ) is a power). It may hold
                                                 capsules, @[b3k2m9x:x], as an entry's formula may
         "reference": true,                      it is a reference to its variable (it came from the list), not the shape the
                                                 variable was made as: delete that shape and this goes with it
         "from": { "id": "b3k…", "side": "x" },    it is a measure of the shape with that id (x its width, y its height, m a scalar's mass):
                                                 its one entry is that length, whatever it is now, and is not written here
         "from": { "id": "b3k…", "range": { "col": 2, "row": 0, "cols": 2, "rows": 4, "toEnd": { "cols": false, "rows": true } } },
                                                 or, with a range in place of a side: it was made by a cut or an intersection,
                                                 and is that part of the shape with that id (its source, kept in the
                                                 space's operations): cols columns from column col and rows rows from row
                                                 row, counted from 0. Where toEnd.cols is true it runs to the source's
                                                 last column whatever size the source now is, and cols is not looked at;
                                                 toEnd.rows likewise. Its entries are the source's, and are not written here.
         "from": { "id": "b3k…", "index": "x" },   or, with index: it is the index (tiles.js) of the block with that id, which is
                                                 in a tile, as a matrix that block's size: index.x, or index.y for "y". It
                                                 stands in that block's definition space, and its entries are not written here.
         "transposed": true,                     it is the transpose of its variable: its columns and rows here are the
                                                 transpose's, and its entries are written as the variable's own
         "joined": [ { "at": { "x": 0, "y": 0, "w": 0.5, "h": 1 }, "shape": { a shape's config } }, … ],
                                                 only on a shape joined from several: the shapes it was joined from,
                                                 whole, each with the part of this one it takes up (as fractions).
                                                 Its entries are theirs: they are written there, not here.
         "type": "arrow", "arrow": { "input": { "id": "b3k…", "as": "block" }, "side": "e", "start": 1, "span": 3, "gap": 2,
                                     "gapName": null, "output": { "cols": 4, "rows": 3 }, "formula": "max(x, 0)" },
                                                 an arrow, a function drawn as a triangle (arrows.js has what each field
                                                 means). input.as is "block", or "result" for the drawn result of the
                                                 piece holding that block (with "hollow": 1 or 2 for a times or over
                                                 pair's hollow) or, where the id is an arrow's, that arrow's output, or
                                                 "tile" where the id is a tile's frame and it reads the tile's matrix.
                                                 output is null where nothing is promised, formula null where there is
                                                 no entry formula. An arrow's definition space is written as any
                                                 shape's is. Its position and size are where it is drawn, worked out
                                                 from its input on opening: nothing reads them back. Where its output
                                                 is drawn is never written.
         "seat": "b7q…",                         it is seated on the output of the arrow with that id: its value is that
                                                 output, and the entries written here are kept and not used
         "seat": { "hollow": ["b3k…", "b9z…"] }, or in the hollow of the times or over pair those two blocks make
         "in": true,                             it is the input block of the arrow whose definition space it is in
         "variable": 2 }                         shapes carrying the same number are one variable used in several
                                                 places: one name, size, colour, set of entries and definition.
                                                 The definition is written once: one of them has the definition
                                                 directory (the first to be written), the others have none, and it
                                                 is the definition of them all. Projects saved before gave every
                                                 one a directory, each holding the same thing: opened, one is kept.
   value.as is "computation" when its definition space has shapes that work it out, "resolved" when every entry has
   been given a value or a formula (or it is a source, which has them all), and "variable" otherwise.

   Entries. An entry is stored as one of two things, never as a formula with its result:
       a literal value    7                               a whole number
                          "inf", "-inf"                   an infinity
                          { "n": 3, "d": 4, "k": 1 }      exact: n over d under k square roots, d left out where it is 1
                          true, false                     a boolean, as a JSON boolean
                          { "sym": "1+sqrt(2)" }          symbolic: text the solver reads back
       a formula          { "expr": "1/√(@[b3k2m9x:x])" } the text as it was typed, worked out each time it is shown.
                                                          A capsule in it names a measure of a variable by the id of
                                                          the block it was made as: @[id:x], @[id:y], @[id:m] (a
                                                          scalar's mass), @[id:a:name] (an attribute), @[id] (the
                                                          whole matrix). expression.js has the language.
   An entry that is absent is unknown: it is a symbol, not zero. Never written: an error ({ "err" }), a decimal
   ({ "f" }), or anything else that was worked out. Reading, an entry holding either of those, or anything that is
   none of the above, is dropped: the entry is unknown again.

   A named side's length is not stored anywhere else: it is the size of the sides that carry the name.

   A frame's config:
       { "format": "smart-factory/frame", "version": 1, "id": "g4k09zq", "name": "Pair", "named": true,
         "shapes": [ { a shape's config }, … ],            the shapes directly in the frame
         "groups": [ { "name", "named", "shapes", "groups" }, … ],      the frames inside it, written the same way
         "repeat": { "x": 2, "y": -3, "cols": 3, "rows": 2, "across": 3, "down": { "expr": "@[b3k2m9x:y]" } } }
                                                           only on a tile: a frame whose contents repeat (tiles.js).
                                                           x, y: where the pattern's top-left corner is, in units;
                                                           cols, rows: the pattern's size; across, down: how many
                                                           times it is repeated each way, a whole number of at least
                                                           1 or a formula that comes to one from sizes alone. Its
                                                           shapes are those of the first cell: the copies, and what
                                                           the counts come to, are never written. A tile may hold no
                                                           shapes. A frame inside another may be a tile too; a
                                                           tile directly or further inside a tile is in that tile:
                                                           it lies in its pattern and is repeated with it (its x
                                                           and y are still counted from the space's origin).
                                                           Absent: an ordinary frame.

   A frame with no name is the file "frame n.frame.json", n its place among the frames of its space, from 1. Reading,
   it is put back at that place, whatever order the files come in, so a project saved again keeps its file names.
   A frame named .config is written as the file .config in its space's directory, in the same form as any frame.
   The page reads it for root variables: see configure in smart-factory.js. There may be one at every level.

   A space's operations, the file operations.json in its directory (there only when the space has any):
       { "format": "smart-factory/operations", "version": 3,
         "operations": [ { "id": "o4k09zq",                    the operation's id
                           "op": "difference",                 or "intersect"
                           "sources": [ { a shape's config }, { a shape's config } ],
                                                               the two shapes it was done to, whole, as they were and
                                                               where they were: they are off the canvas, kept for
                                                               Revert and for the shapes made of them to read
                           "results": [ "b0x7m2c", … ],        the ids of the shapes it made
                           "was": [ { "order": 3, "frames": [ { "id": "g4k09zq", "name": "Pair" }, … ] }, { … } ] } ] }
                                                               where each source was, for Revert to put it back
                                                               exactly: its place among the shapes of the space,
                                                               back to front, and the frames it was in, innermost
                                                               first. Left out where that is not known (the shapes
                                                               were since folded into another space): the sources
                                                               then come back in front, in no frame.
   A source is written as any shape is, its definition directory (if it has one) beside the file. A shape fused
   from several keeps them in its own "joined", as before; no operation is written for that.

   write(project) -> [{ path, text }]       paths are relative to the project's directory, with / between parts
   read(files)    -> project                files: [{ path, text }]; throws if there is no project.json
   project: { top: space, saved: an ISO date, ids: where the project's source of ids has got to (ids.js), kept in project.json }

   read's project also carries converted: how many old stacks were fused on the way in, and changed: how many other
   pieces of an old project now read differently (see below for both); each 0 for a project of this format.

   The format is 3. Format 3 adds to format 2 a space's operations and a shape's from.range, both set out above; a
   format 2 project has neither, and is read as having no operations. It adds arrows: a shape of type "arrow" with
   its "arrow", a shape's "seat", and "in" on an arrow's input block; a format 2 project has no arrows. Reading, an
   arrow with a field missing or wrong is given a safe one (side e, start, span and gap 1, no promise, no formula; an
   input with no id is an input that is gone), and a seat that names an arrow or a block the project has not got is
   dropped, so that nothing is left naming what is not there. It adds tiles: a frame's "repeat", an arrow's input.as "tile", and from.index. A format 2 project has none of
   them. Reading, a repeat is given whole numbers, a pattern of at least 1 by 1 and counts of at least 1 (a count
   that is neither a number nor a formula is 1).
   It adds sources: a shape's "source". Reading, a source this program has not got (anything but those three
   words; a format 2 project has none) is dropped, and the shape is an ordinary one with whatever entries its file has.
   A standing shape's "standing": true was "tile": true in format 2 and in format 3 projects saved before the
   word tile was given to a region that repeats; "tile": true is read as "standing": true, and never written.
   It also adds to what an entry can hold:
   booleans, symbolic values and formulas, and capsules in an attribute's value. A format 2 project's entries
   (numbers, "inf" and "-inf", { n, d, k }) and attributes are read unchanged. What else changed is what a file means: shapes of one width set one
   directly on the next were a stack in format 2, its rows theirs (rows appended), and are a sum in format 3. Nothing
   in a file marks a stack, so the format number is all that tells the two apart. Reading format 2 or lower, every
   stack as it was then (lone shapes of one width, one directly on the next, in a space whose shapes are worked out:
   not commented out, and not standing in their owner's matrix) is fused into one shape, as joining them would: a new
   unnamed shape with the stack's shapes in "joined", in whatever frame held them all, its columns named as the
   stack's first shape's were (which is what the stack's columns were called). A fused shape appends, so the
   project comes to what it did. A format 3 project is never converted: its stacks are sums.
   A stack is not the only arrangement that gained a meaning. In format 2 shapes meeting at a corner did not touch,
   and a shape directly under one that was in a product was on its own; in format 3 the first are times or over and
   the second makes its piece one of mixed rules. Nothing can be done to such shapes that keeps what they meant
   without moving them, so they are left exactly as they are and counted: changed is how many pieces, after the
   fusing, are a sum, elementwise or of mixed rules, none of which a format 2 project could hold. The page says so.
   A variable used in several places has its definition written once for each use; a stack or a changed piece in it
   is counted once.

   Format 1 had two spaces at the top: the top level, in the project's directory, and the settings, in _settings/.
   Now there is one, the Menu, which is what the settings were. Reading a format 1 project, _settings/ becomes the
   top; if the old top level had shapes too, they are kept inside one block called "Top level", set beside it.
   space:   { shapes: [shape], groups: [group], operations: [{ id, op: 'difference' | 'intersect', sources: [shape, shape], results: [shape ids],
              was: [{ order, frames: [{ id, name }] }, the same for the second source] | null }] }
   group:   { id, name, members: [index into shapes, for the shapes directly in it], groups: [the groups inside it],
              repeat: { x, y, cols, rows, across, down } only where the frame is a tile }
   shape:   { type, name, color, x, y, cols, rows, colsName, rowsName, entries: { "c,r": a literal value (Infinity for an infinity) or { expr } },
              inside: space | null, standing: true for a standing shape, source: 'zeros' | 'ones' | 'identity' | null,
              variable: a number shared by shapes that are one variable, or null,
              from: { id, side } | { id, range: { col, row, cols, rows, toEnd: { cols, rows } } } | { id, index: 'x' | 'y' } | null,
              arrow: { input: { id, as, hollow }, side, start, span, gap, gapName, output: { cols, rows } | null, formula } for type 'arrow', else null,
              seat: an arrow's id | { hollow: [id, id] } | null, in: true for an arrow's input block,
              joined: [{ fx, fy, fw, fh, shape }] for a shape joined from several, or null } */

import { stacks, pieces, isFormula, isSurd, isWhole, storable } from './algebra.js';
import { kept as sourceOf } from './sources.js';
import { kept as repeatOf } from './tiles.js';

export const FORMAT = 3;
const isCommented = name => /^\s*\/\//.test(name);
const bare = name => name.replace(/^\s*\/\/\s*/, '');
export const isNamed = name => !/^Shape \d+$/.test(bare(name));
/* an entry as it is written: a formula's text and nothing it came to, or a literal value. What may not be kept (an error, a decimal) is undefined. */
const out = v => isFormula(v) ? { expr: v.expr } : !storable(v) ? undefined : v === Infinity ? 'inf' : v === -Infinity ? '-inf' : v;
/* and as it is read: undefined for what is no entry (an error, a decimal, or nothing this format knows) */
const back = v => v === 'inf' ? Infinity : v === '-inf' ? -Infinity : typeof v === 'boolean' || isWhole(v) ? v : !v || typeof v !== 'object' ? undefined
  : typeof v.expr === 'string' ? { expr: v.expr } : isSurd(v) && (v.d === undefined || Number.isInteger(v.d)) ? { n: v.n, ...(v.d !== undefined && v.d !== 1 ? { d: v.d } : {}), k: v.k }
  : typeof v.sym === 'string' ? { sym: v.sym } : undefined;
const kept = (entries, as) => Object.fromEntries(Object.entries(entries || {}).map(([k, v]) => [k, as(v)]).filter(([, v]) => v !== undefined));

/* a range as it is kept: whole numbers, a start not before 0, at least one column and one row, and toEnd's two fields true or false */
const rangeOf = r => { const n = (v, least) => Math.max(least, Math.round(+v || 0));
  return { col: n(r.col, 0), row: n(r.row, 0), cols: n(r.cols, 1), rows: n(r.rows, 1), toEnd: { cols: !!r.toEnd?.cols, rows: !!r.toEnd?.rows } }; };

/* an arrow as it is kept: every field there and of its kind (arrows.js) */
const arrowOf = a => { a = a && typeof a === 'object' ? a : {}; const n = v => Math.max(1, Math.round(+v || 1)), as = a.input?.as === 'result' ? 'result' : a.input?.as === 'tile' ? 'tile' : 'block';
  return { input: { id: typeof a.input?.id === 'string' ? a.input.id : '', as, ...(as === 'result' && (a.input.hollow === 1 || a.input.hollow === 2) ? { hollow: a.input.hollow } : {}) },
    side: ['n', 'e', 's', 'w'].includes(a.side) ? a.side : 'e', start: n(a.start), span: n(a.span), gap: n(a.gap), gapName: typeof a.gapName === 'string' && a.gapName.trim() ? a.gapName.trim() : null,
    output: a.output && typeof a.output === 'object' && +a.output.cols >= 1 && +a.output.rows >= 1 ? { cols: n(a.output.cols), rows: n(a.output.rows) } : null,
    formula: typeof a.formula === 'string' && a.formula.trim() ? a.formula : null }; };
/* a shape's from, as it is written and as it is read: a range, the index, or a measure's side */
const fromOut = f => f.range ? { id: f.id, range: rangeOf(f.range) } : f.index ? { id: f.id, index: f.index === 'y' ? 'y' : 'x' } : { id: f.id, side: f.side };
const fromBack = f => !f || typeof f.id !== 'string' ? null : f.range && typeof f.range === 'object' ? { id: f.id, range: rangeOf(f.range) } : f.index === 'x' || f.index === 'y' ? { id: f.id, index: f.index }
  : { id: f.id, side: f.side === 'y' || f.side === 'm' ? f.side : 'x' };
const seatOf = s => typeof s === 'string' && s ? s : s && typeof s === 'object' && Array.isArray(s.hollow) && s.hollow.length === 2 && s.hollow.every(id => typeof id === 'string' && id) ? { hollow: [...s.hollow] } : null;

/* a name made safe to be a file's name, and different from every other in its directory.
   taken: every name used in the directory so far, in lower case: each stem (which is also the name of a shape's
   definition directory) and each file written from one, stem + ext. A stem is free only if neither it nor its file
   is there already, so no file is written over another, and no file has the name of a directory. */
function stem(name, taken, ext = '.json'){
  let s = bare(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+/, '').trim().slice(0, 80) || 'shape';
  if (/^(project|_settings|operations)$/i.test(s)) s += ' shape';
  const used = t => taken.has(t.toLowerCase()) || taken.has((t + ext).toLowerCase());
  let t = s; for (let n = 2; used(t); n++) t = `${s} (${n})`;
  taken.add(t.toLowerCase()); taken.add((t + ext).toLowerCase()); return t;
}

/* a space with nothing in it writes no file, so there is no directory for a shape's "definition" to name: the word
   is left out, and the project reads back as it was written */
const holdsAny = s => s.shapes.length + s.groups.length + (s.operations?.length || 0) > 0;
function valueOf(shape, inside){                  /* inside: its definition space, which another use of its variable may be the one to carry */
  if (sourceOf(shape.source)) return { as: 'resolved', entries: {} };      /* a source has every entry, and stores none */
  const entries = kept(shape.entries, out);
  const computed = !!inside && inside.shapes.some(s => !isCommented(s.name));
  let full = true; for (let c = 1; c <= shape.cols && full; c++) for (let r = 1; r <= shape.rows; r++) if (!(c + ',' + r in entries)){ full = false; break; }
  return { as: computed ? 'computation' : full ? 'resolved' : 'variable', entries };
}

export function write(project){
  const files = [];
  /* A variable's definition is written once, under the first of its uses that carries one. defs: a variable's number
     -> its definition, whichever use carries it; written: the variables whose definition has gone out already. */
  const defs = new Map(), written = new Set();
  const look = s => { for (const shape of s.shapes) each(shape); for (const o of s.operations || []) for (const shape of o.sources) each(shape); };      /* the two shapes a cut keeps are written too (operations.json), after the shapes */
  const each = shape => { const v = shape.variable ?? null;
    if (shape.inside && !(v !== null && defs.has(v))){ if (v !== null) defs.set(v, shape.inside); look(shape.inside); }
    for (const j of shape.joined || []) each(j.shape); };
  look(project.top);
  const space = (s, dir) => {
    const every = g => [...g.members, ...(g.groups || []).flatMap(every)];
    const taken = new Set(['project.json']), grouped = new Set(s.groups.flatMap(every));
    const config = (shape, order) => { const name = stem(shape.name, taken), v = shape.variable ?? null, inside = shape.inside && !written.has(v) ? shape.inside : null;
      if (inside){ if (v !== null) written.add(v); space(inside, dir + name + '/'); }
      return [name, { format: 'smart-factory/shape', version: FORMAT, ...(shape.id ? { id: shape.id } : {}), type: shape.type, name: shape.name, named: isNamed(shape.name), commented: isCommented(shape.name),
        color: isNamed(shape.name) ? shape.color : null, position: { x: shape.x, y: shape.y }, size: { cols: shape.cols, rows: shape.rows },
        sides: { cols: shape.colsName || null, rows: shape.rowsName || null }, value: valueOf(shape, v !== null && defs.has(v) ? defs.get(v) : shape.inside), ...(inside && holdsAny(inside) ? { definition: name + '/' } : {}), order, ...(shape.variable != null ? { variable: shape.variable } : {}), ...(shape.standing ? { standing: true } : {}), ...(sourceOf(shape.source) ? { source: sourceOf(shape.source) } : {}), ...(shape.transposed ? { transposed: true } : {}),
        ...(shape.attributes?.length ? { attributes: shape.attributes.map(a => ({ name: a.name, value: a.value })) } : {}),
        ...(shape.reference ? { reference: true } : {}), ...(shape.from ? { from: fromOut(shape.from) } : {}),
        ...(shape.type === 'arrow' ? { arrow: arrowOf(shape.arrow) } : {}), ...(seatOf(shape.seat) ? { seat: seatOf(shape.seat) } : {}), ...(shape.in ? { in: true } : {}),
        ...(shape.joined ? { joined: shape.joined.map(j => ({ at: { x: j.fx, y: j.fy, w: j.fw, h: j.fh }, shape: config(j.shape, 0)[1] })) } : {}) }]; };
    s.shapes.forEach((shape, i) => { if (grouped.has(i)) return; const [name, c] = config(shape, i); files.push({ path: dir + name + '.json', text: JSON.stringify(c, null, 2) + '\n' }); });
    const inner = g => ({ ...(g.id ? { id: g.id } : {}), name: g.name || null, named: !!g.name, shapes: g.members.map(i => config(s.shapes[i], i)[1]), groups: (g.groups || []).map(inner), ...(repeatOf(g.repeat) ? { repeat: repeatOf(g.repeat) } : {}) });      /* a tile */
    let hasConfig = false;
    s.groups.forEach((g, n) => { const body = inner(g), own = !hasConfig && (g.name || '').trim() === '.config', name = own ? '' : stem(g.name || 'frame ' + (n + 1), taken, '.frame.json');
      if (own) hasConfig = true;
      files.push({ path: own ? dir + '.config' : dir + name + '.frame.json', text: JSON.stringify({ format: 'smart-factory/frame', version: FORMAT, ...body }, null, 2) + '\n' }); });
    /* what was cut here: each operation with its two sources whole, written as shapes are (a definition goes in a directory beside) */
    if (s.operations?.length) files.push({ path: dir + 'operations.json', text: JSON.stringify({ format: 'smart-factory/operations', version: FORMAT,
      operations: s.operations.map(o => ({ id: o.id, op: o.op, sources: o.sources.map(shape => config(shape, 0)[1]), results: [...o.results], ...(o.was ? { was: o.was.map(w => ({ order: w.order, frames: w.frames.map(f => ({ id: f.id, name: f.name ?? null })) })) } : {}) })) }, null, 2) + '\n' });
  };
  files.push({ path: 'project.json', text: JSON.stringify({ format: 'smart-factory/project', version: FORMAT, saved: project.saved || null, ...(project.ids ? { ids: project.ids } : {}) }, null, 2) + '\n' });
  space(project.top, '');
  return files;
}

export function read(files){
  /* whatever directory project.json is in is the project's; everything is read relative to it */
  const all = files.map(f => ({ path: f.path.replace(/\\/g, '/').replace(/^\/+/, ''), text: f.text }));
  const head = all.filter(f => /(^|\/)project\.json$/.test(f.path)).sort((a, b) => a.path.length - b.path.length)[0];
  if (!head) throw new Error('no project.json: this is not a saved project');
  const root = head.path.slice(0, -'project.json'.length), at = new Map();
  for (const f of all) if (f.path.startsWith(root)) at.set(f.path.slice(root.length), f.text);
  const meta = JSON.parse(head.text);
  if (meta.format !== 'smart-factory/project') throw new Error('project.json is not a smart-factory project');
  if (meta.version > FORMAT) throw new Error('this project was saved by a newer version (format ' + meta.version + ')');

  const space = dir => {
    const found = [], groups = [], places = [], cuts = [];      /* places: for a frame with no name, the place among the frames that its file's name says it had */            /* found: [config, the group it is directly in, or null]; cuts: the operations as written */
    const take = c => { const g = { id: typeof c.id === 'string' ? c.id : null, name: c.named ? c.name : null, members: [], groups: (c.groups || []).map(take), ...(repeatOf(c.repeat) ? { repeat: repeatOf(c.repeat) } : {}) };
      for (const shape of c.shapes || []) found.push([shape, g]); return g; };
    for (const [path, text] of at){
      if (!path.startsWith(dir) || path.slice(dir.length).includes('/') || !(path.endsWith('.json') || path.slice(dir.length) === '.config') || path === 'project.json') continue;
      let c; try { c = JSON.parse(text); } catch (e) { throw new Error(path + ' is not valid JSON'); }
      if (c.format === 'smart-factory/shape') found.push([c, null]);
      else if (c.format === 'smart-factory/frame' || c.format === 'smart-factory/group'){ const n = !c.named && path.slice(dir.length).match(/^frame (\d+)\.frame\.json$/); groups.push(take(c)); places.push(n ? +n[1] - 1 : null); }      /* 'group' is what a frame was called in projects saved before */
      else if (c.format === 'smart-factory/operations' && Array.isArray(c.operations)) cuts.push(...c.operations);
    }
    found.sort((a, b) => (a[0].order ?? 0) - (b[0].order ?? 0));
    const make = c => {
      const inside = c.definition && [...at.keys()].some(p => p.startsWith(dir + c.definition)) ? space(dir + c.definition) : null;
      return { id: typeof c.id === 'string' ? c.id : null, type: c.type || 'tensor', name: String(c.name ?? 'Shape'), color: c.color || null, x: +c.position?.x || 0, y: +c.position?.y || 0,
        cols: Math.max(1, Math.round(+c.size?.cols || 1)), rows: Math.max(1, Math.round(+c.size?.rows || 1)), colsName: c.sides?.cols || null, rowsName: c.sides?.rows || null,
        entries: kept(c.value?.entries, back), inside, variable: Number.isInteger(c.variable) ? c.variable : null, standing: !!(c.standing || c.tile), source: sourceOf(c.source), transposed: !!c.transposed,
        attributes: Array.isArray(c.attributes) ? c.attributes.map(a => ({ name: String(a?.name ?? ''), value: String(a?.value ?? '') })) : [],
        reference: !!c.reference, from: fromBack(c.from),
        arrow: c.type === 'arrow' ? arrowOf(c.arrow) : null, seat: seatOf(c.seat), in: !!c.in,
        joined: Array.isArray(c.joined) ? c.joined.map(j => ({ fx: +j.at?.x || 0, fy: +j.at?.y || 0, fw: +j.at?.w || 1, fh: +j.at?.h || 1, shape: make(j.shape || {}) })) : null }; };
    const shapes = found.map(([c, g], i) => { if (g !== null) g.members.push(i); return make(c); });
    /* an operation that is not one (no such op, not two sources, nothing made) is passed over */
    const operations = cuts.filter(o => o && (o.op === 'difference' || o.op === 'intersect') && Array.isArray(o.sources) && o.sources.length === 2 && Array.isArray(o.results) && o.results.some(id => typeof id === 'string'))
      .map(o => ({ id: typeof o.id === 'string' ? o.id : null, op: o.op, sources: o.sources.map(c => make(c || {})), results: o.results.filter(id => typeof id === 'string'),
        was: Array.isArray(o.was) && o.was.length === 2 ? o.was.map(w => ({ order: Number.isInteger(w?.order) && w.order >= 0 ? w.order : null, frames: (Array.isArray(w?.frames) ? w.frames : []).filter(f => typeof f?.id === 'string').map(f => ({ id: f.id, name: typeof f.name === 'string' ? f.name : null })) })) : null }));
    /* a frame with no name is written as "frame n", n its place among the space's frames, and files come back in the
       order of their names ("frame 10" before "frame 2"): each is put back at the place its name says, the named ones
       among them in the order they came, so that saved again every file has the name it had */
    const set = new Array(groups.length).fill(null), rest = [];
    groups.forEach((g, i) => { const at = places[i]; if (at !== null && at < set.length && !set[at]) set[at] = g; else rest.push(g); });
    return { shapes, groups: set.map(g => g || rest.shift()), operations };
  };
  const top = space('');
  let project = { top, saved: meta.saved || null, ids: meta.ids || null };
  if ((meta.version || 1) < 2 && [...at.keys()].some(p => p.startsWith('_settings/'))){      /* format 1: see the note above */
    const menu = space('_settings/');
    if (top.shapes.length) menu.shapes.push({ type: 'tensor', name: 'Top level', color: 'variable-3', x: Math.min(0, ...menu.shapes.map(s => s.x)) - 5, y: Math.min(0, ...menu.shapes.map(s => s.y)),
      cols: 3, rows: 2, colsName: null, rowsName: null, entries: {}, inside: top, variable: null });
    project = { ...project, top: menu };
  }
  /* a seat names an arrow, or the two blocks of a pair: one that names what the project has not got is no seat */
  const every = [], walk = s => { const one = d => { every.push(d); if (d.inside) walk(d.inside); for (const j of d.joined || []) one(j.shape); }; s.shapes.forEach(one); for (const o of s.operations || []) o.sources.forEach(one); };
  walk(project.top);
  const arrows = new Set(every.filter(d => d.arrow && d.id).map(d => d.id)), known = new Set(every.map(d => d.id).filter(Boolean));
  for (const d of every) if (d.seat && !(typeof d.seat === 'string' ? arrows.has(d.seat) : d.seat.hollow.every(id => known.has(id)))) d.seat = null;
  const old = (meta.version || 1) < 3 ? fuseStacks(project.top) : { fused: 0, changed: 0 };
  return { ...project, converted: old.fused, changed: old.changed };
}

/* Fuses every stack of a space read from format 2 or lower, and of every space below it, in place. Gives
   { fused, changed }: how many stacks were fused, and how many pieces that are left read differently now (see the
   note at the top). owner: the shape whose definition space this is, or null for the Menu. seen: the variables whose
   definition has been counted already (every use of a variable carries the same definition: each is fused, so that
   they stay the same, and counted once). */
function fuseStacks(s, owner = null, seen = new Set()){
  const count = { fused: 0, changed: 0 };
  const below = shape => {
    if (shape.inside){ const inner = fuseStacks(shape.inside, shape, seen);
      if (shape.variable == null || !seen.has(shape.variable)){ count.fused += inner.fused; count.changed += inner.changed; }
      if (shape.variable != null) seen.add(shape.variable); }
    for (const j of shape.joined || []) below(j.shape); };
  s.shapes.forEach(below);
  const rectOf = d => ({ x: d.x, y: d.y, w: d.cols, h: d.rows, wName: d.colsName, hName: d.rowsName });
  /* the frames each shape is in, innermost first */
  const chains = new Map(), walk = (g, up) => { const mine = [g, ...up]; for (const i of g.members) chains.set(i, mine); for (const inner of g.groups || []) walk(inner, mine); };
  for (const g of s.groups) walk(g, []);
  const chain = i => chains.get(i) || [];
  /* what is left to read differently once the stacks are fused: a piece of a rule no format 2 project had */
  const differing = () => pieces(s.shapes.filter(d => !isCommented(d.name)).map(rectOf)).filter(p => p.rule && p.rule !== 'product').length;
  const live = s.shapes.map((_, i) => i).filter(i => !isCommented(s.shapes[i].name));
  /* shapes standing in their owner's matrix are its entries, and were never worked out as a stack: that is so when
     every shape of the space outside a .config stands there, inside the matrix and over no other (as the page has it) */
  const standing = (() => { if (!owner) return false;
    const act = live.filter(i => !chain(i).some(g => (g.name || '').trim() === '.config')).map(i => s.shapes[i]), x0 = -1 - owner.cols, y0 = Math.round(-owner.rows / 2), placed = [];
    for (const t of act){ const x = t.x - x0, y = t.y - y0;
      if (!t.standing || x % 1 || y % 1 || x < 0 || y < 0 || x + t.cols > owner.cols || y + t.rows > owner.rows) return false;
      if (placed.some(o => x < o.x + o.w && o.x < x + t.cols && y < o.y + o.h && o.y < y + t.rows)) return false;
      placed.push({ x, y, w: t.cols, h: t.rows }); }
    return act.length > 0; })();
  if (standing) return count;
  const runs = stacks(live.map(i => rectOf(s.shapes[i]))).filter(p => p.stack).map(p => p.members.map(m => live[m]));
  if (!runs.length){ count.changed += differing(); return count; }
  const gone = new Set(), made = new Map();            /* made: the place among the shapes of a stack's first shape -> what the stack is fused into */
  for (const run of runs){
    const first = s.shapes[run[0]], rows = run.reduce((sum, i) => sum + s.shapes[i].rows, 0), used = new Set([...s.shapes.filter((_, i) => !gone.has(i) && !run.includes(i)), ...made.values()].map(d => d.name));
    let n = 1; while (used.has('Shape ' + n)) n++;      /* a name no shape of the space has, as a newly joined shape is given */
    const at = Math.min(...run), holder = chain(run[0]).find(g => run.every(i => chain(i).includes(g)));      /* the innermost frame holding them all */
    made.set(at, { id: null, type: 'tensor', name: 'Shape ' + n, color: null, x: first.x, y: first.y, cols: first.cols, rows, colsName: first.colsName || null, rowsName: null, entries: {}, inside: null, variable: null,      /* the stack's columns had its first shape's name */
      standing: false, source: null, transposed: false, attributes: [], reference: false, from: null, arrow: null, seat: null, in: false,
      joined: run.map(i => ({ fx: 0, fy: (s.shapes[i].y - first.y) / rows, fw: 1, fh: s.shapes[i].rows / rows, shape: s.shapes[i] })) });
    for (const i of run){ gone.add(i); for (const g of chain(i)) g.members = g.members.filter(m => m !== i); }
    if (holder) holder.members.push(at);
    count.fused++;
  }
  /* the shapes that are left, each stack's fused shape where its first shape was; the frames follow, and a frame the fusing emptied is no frame */
  const kept = s.shapes.map((_, i) => i).filter(i => made.has(i) || !gone.has(i)), now = new Map(kept.map((i, n) => [i, n]));
  s.shapes = kept.map(i => made.get(i) || s.shapes[i]);
  const settle = g => { g.members = g.members.map(i => now.get(i)).sort((a, b) => a - b); g.groups = (g.groups || []).filter(settle); return g.members.length + g.groups.length > 0; };
  s.groups = s.groups.filter(settle);
  count.changed += differing();
  return count;
}
