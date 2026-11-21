/* A project as a graph of matrix operations. No drawing here: a snapshot in, plain JSON out.

   The graph is the one description of a model that everything reads: the page's evaluator now (evaluate.js), a
   backend and an export later. build turns a whole project into it, validate checks one it did not build.

   build(snapshot) -> graph      snapshot is what gather() in smart-factory.js and read() in project.js give:
                                 { top: space, … }. Pure: the same snapshot gives a deeply equal graph with its keys
                                 in the same order, and it never throws on a snapshot the page can produce: a
                                 half-built canvas is the usual case, so what is wrong is written into the graph.
                                 What it says of a shape does not turn on where in a space's list the shape comes.
   validate(graph) -> []         when well formed, else what is wrong, a sentence each. It answers so for any JSON
                                 value at all, and never throws: a backend calls it on whatever it is sent.
   OPS                           the table of operations: one entry for each `op`, holding its inputs, its own
                                 fields, its type rule and its evaluation rule. build, validate and evaluate are all
                                 written round it, so a new operation is a new entry and nothing else.
   axes(type)                    every axis of a type in order, [{ length, name }]: columns, rows, then the inner ones
   tailsOf(type)                 every inner position of a type as what follows "column,row" in a key ([""]: none)
   AXES                          6, the most inner axes a type has
   VERSION                       4. Version 2 added inner axes, stack, entry and a transpose's order; version 3 the
                                 value None ({ "none": true }) and a type's "value", the number space it lies in
                                 (spaces.js); version 4 choose, and a source of kind "none". An older graph has
                                 none of what came after it, and validate takes it as it stands; one that says
                                 an older version and holds what came later is refused.
   CODES                         every error code
   inferred(graph, id)           the number space a variable would have with no promise (see "Number spaces")
   indexAt(cells, c, r)          the index an entry reads, from the cell it is in (see "Bindings", below)
   readsIndex(node)              whether the node of its own accord differs from cell to cell: a formula of its own
                                 reads the index, it is an arrow repeated through an outer tile, or it is noise

   The graph
       { "version": 4,
         "nodes":     { "<node id>": { "op", "inputs": [node ids], "type": { "cols", "rows", "colsName", "rowsName" }, … } },
                      (a type also has "inner" where its entries hold inner data: see "Inner data", below)
         "functions": { "<function id>": { "input": "<the node of its in block>", "body": "<the node its space comes to>" } },
         "spaces":    { "<space key>": { "owner": "<node id>" | null,
                                         "pieces": [ { "blocks": [block ids], "rule", "node": "<node id>" | null, "error": an error | null } ],
                                         "arrows": [ { "arrow": "<arrow's block id>", "node": "<its output's node>" | null, "error": an error | null } ],
                                         "tiles":  [ { "tile": "t:<frame id>", "blocks": [block ids], "arrows": [arrow ids],
                                                       "node": "<its matrix, a repeat>" | null, "error": an error | null } ] } },
         "blocks":    { "<block id>": "<node id>" } }
   It survives JSON.parse(JSON.stringify(graph)) unchanged: an infinity is written "inf" or "-inf", and there is no
   Map and nothing undefined in it.

   A node is one matrix; the nodes form a directed graph with no cycles. What does not come to a matrix is no node:
   its error is on its piece, its variable or its arrow, and nowhere else. An error is { "code", "note" }:
       mismatch       a touch whose sizes or names do not agree (note: the touch's own, "4 ≠ 3", "embed ≠ key"), or
                      whose sides carry one name and are two lengths; an arrow whose input does not fit its
                      function, or that cannot be repeated in its tile
       not-a-row      shapes that touch without forming a single line
       mixed          touches of more than one rule
       pieces         a definition space that holds more than one piece ("3 pieces")
       size           a definition that comes to another size ("5 × 6 ≠ 4 × 6", what it comes to first, columns
                      first); a block seated on an output of another size; an arrow whose span runs past its
                      input, or that does not come to what it promises
       loop           a variable that depends on itself, through a definition, a formula or a seat; an arrow that
                      reads itself, or whose function applies itself
       no-source      a variable or an arrow that reads what is not there: a block that is gone, a part its source
                      is too small to have, a result that is an error (the note is that error's code), a tile with
                      no matrix (the note says why), a formula that names what nothing is (the note says what), a
                      definition more than 64 definitions deep
       seat           a variable seated on an arrow that has an error (the note is the arrow's code)
       size-unknown   a size that could not be settled when the graph was built (the note is the formula): a tile's
                      count that reads what is not settled, or that depends on its own tile's size
       type           a variable that holds a value outside the number space it promises (the note says which:
                      "W is not natural: it holds -3 at 2, 1"). build never writes it: a promise is held against
                      the values, which evaluate.js has, and evaluate answers with it
   A piece carries mismatch, not-a-row, mixed or size-unknown. A variable with an error keeps its type, which is its
   block's own size, and its entries, formulas and all: only its value is missing, so everything round it goes on
   being checked. (Round a loop, a formula that names anything is left out: what it names is the loop.)

   Ids say what a node is, never where it sits. A variable's is v: and the id of the block it was made as; a
   function's input is param(<function id>); any other node's is its operation written out with its inputs' ids and
   its own fields: matmul(v:b1,v:b2), scale(v:s,matmul(v:b1,v:b2)), block(v:b1@0,0;v:b2@0,3), measure(v:b1;x). So one
   computation in two places is one node, and moving a block without changing what it touches leaves the graph as it
   was. An id written out at more than 96 characters is the operation and a hash of what was written: matmul#1f3a….
   A space's key is top for the Menu, v:<block id> for a variable's definition space and f:<arrow id> for an arrow's;
   a function's id is f: and the id of the arrow it was made as. A block saved with no id is called by its place in
   the snapshot, p:0.2.1 (shape 1 of the definition of shape 2 of the definition of shape 0).

   Operations (OPS has each one's rules in full)
       variable    a named place. defined says where its value comes from: "entries" (its own, which may hold
                   formulas: its inputs are then the nodes those name), or its one input under a name: "definition"
                   (what its definition space comes to), "standing" (the shapes standing in its matrix, once they
                   cover it), "joined" (the shapes it was fused from), "measure" (a side or the mass of another),
                   "range" (a part of another: a cut or an intersection), "entry" (one entry of a shape that holds
                   inner data, taken out), "seat" (an arrow's output, or the result
                   in a pair's hollow) or "source" (zeros, ones, an identity, a data file or noise; or a tile's index
                   as a matrix, a map of zeros by index.x or index.y). Own fields: name, named, defined, entries, and error where it has
                   one (it is then "entries"). An entry is a value (None, { "none": true }, among them), a formula
                   { expr }, or the error { err } that a formula was found to be when the graph was built.
       matmul      left, right: the matrix product. A row of three is two nodes, grouped from the left.
       scale       scalar, matrix: every entry times the scalar. Scalars in a row are pulled to the front.
       transpose   entry c,r is the input's r,c. With order, a list that names every axis of the input once (0 and 1
                   the drawn ones, 2 on the inner ones): axis k of the result is axis order[k] of the input, so an
                   inner axis can be turned to where it is drawn. An order has to move an inner axis.
       add         two or more of one size, entry by entry
       ewise       two; fn "mul" or "div"; broadcast "none", "scalar", "row" or "col". A chain is nested from the left.
       block       parts set into one matrix with no gap and no overlap; at: one { col, row } for each, from 0
       slice       range { col, row, cols, rows }, from 0, of its input
       source      kind "zeros", "ones" or "identity": values by rule, at the node's size. Kind "none": every entry
                   None, at the node's size (the empty side of a choose). Or kind "file" with path
                   "data/….csv": the numbers of that file of the project, which only the backend reads
       choose      a condition, then one side for true and one for false: [c, a, b]. What counts of c, which may be
                   any size, is whether it is true as a whole matrix (values.js: truthOf): true where any known
                   entry is true; false where every entry is known and is zero, false or None; else not known.
                   True, it is a; false, b; not known, every entry of it is unknown, at the size it has. Only the
                   side chosen is worked out: the other may be an error, too large, or the backend's alone, and
                   does no harm. The two sides are one size (drawn sides, inner axes, and no side under two
                   names), and its type is a's. Entry by entry there is select, in a formula: this is no such thing
       noise       seed (a whole number), dist ("uniform" or "normal") and key (the id of the block the variable was
                   made as): numbers that follow from those, the entry's column and row and, in a tile, the cell.
                   Only the backend makes them (backend/arrays.py). It follows its cell without reading the index.
       stack       matrices put into the entries of one: at, one { col, row } for each part, from 0. The parts are one
                   size and hold the same inner data, and cover a rectangle of entries, one part to an entry. Its
                   inner axes are the parts' two drawn sides, then the parts' own inner axes.
       entry       at { col, row }, from 0: that entry of its input, taken out. Its drawn sides are the input's
                   first two inner axes (with one inner axis: that many columns in one row); the rest stay inner.
       measure     side "x", "y" or "m": one number read off its input, its columns, its rows or (a single entry's)
                   mass; of a single entry x and y are the root of its mass. side "d1" to "d6": the length of that
                   inner axis. side "a": an attribute, with its name
                   and its formula, whose inputs after the first are what the formula names
       map         the x matrix, then what its formula names: the formula worked out at every entry
       apply       one input and fn, a function id: functions[fn].body worked out with the input as its param
       param       a function's in block: a type and no value of its own. It is in the graph only with its function.
       repeat      a tile's matrix: its pattern's nodes (at for each, pattern { cols, rows }) set down across by
                   down times, each worked out once for every cell. An input may itself be a repeat: a tile wholly
                   inside another's pattern is one part of it. Which tile a tile is in is said by the frames; that
                   it lies wholly inside the pattern, by its filled size. Tiles that overlap in any other way have
                   no matrix (tiles.js: overlapping): the tile, and an arrow that reads it, have no-source with why.
       mapalong    an arrow repeated in a tile: fn or formula applied to each run of span rows or columns (axis)
                   of its first input from start, count times, the outputs set side by side. through, where it
                   has it: [{ tile: "t:<frame id>", count }], the tiles that tile is in which repeat it again along
                   its input. Its type and value are those of one cell of them; in a later cell it starts as many
                   rows or columns further on as lie before that cell (the cell's x or y), so it follows its cell.
   A formula in the graph names what it depends on as $1, $2 and so on: for a variable its inputs in order, for a
   map, a measure and a mapalong its inputs after the first. It is in the language of expression.js and holds
   nothing else: no capsule, and no name but $n, index.x and index.y, k1 to k6, and x, i and j in an arrow's. So nothing a
   node depends on is hidden in a string, and validate reads every formula to see that it is so. A formula that
   does not read, or names what is not there, is not kept as text: the entry holds the error it comes to, { err },
   and an arrow with such a formula has the error itself.
   A side length that is settled when the graph is built (any shape's but a single entry's) is a measure node, and
   an attribute a measure node with side "a", wherever the shape so named cannot depend on what reads it. Where it
   may (its own width in its own formula; two shapes that read each other's; a width read by a shape that is in
   the other's definition), the length is written into the formula as its number and the attribute's formula is
   written in where it is used: a length is no dependency on a value, and would otherwise read as a loop. Which of
   the two it is is settled from the snapshot alone before anything is built, so it is the same whichever shape
   comes first.

   Number spaces. A type also has value, the number space its numbers lie in (spaces.js): one of ten words, with
   "?" after it where None is admitted, "integer?". It follows from the node's inputs by its operation's rule, as
   the size does, and validate checks it so; a type that says none (every graph before version 3) is not checked,
   and is taken as "any?" by what reads it. A variable may carry holds, a promise in the same words: its value is
   the promise where what it is worked out as lies inside the promise (or its entries say nothing yet), and
   otherwise what it is worked out as: a type never says what might be false. A function's input (param) has for
   its value what its input block promises, "any?" where that promises nothing, and a function applied has its
   body's where what it is given lies in that, and "any?" where it is not known to.

   Inner data. A type's two drawn sides are cols and rows, as ever. Where each entry of the matrix is itself an
   array, the type has inner: the axes of what one entry holds, in order, each { "length", "name" } (name null where
   it has none), the same for every entry. inner is left out where there are no inner axes, as d is left out of an
   exact value where it is 1, and there are at most 6. An entry's key is then "column,row,k1,k2,…", one more number
   from 1 for each inner axis; a type with no inner data keeps "column,row". Every rule acts on the drawn sides and
   is repeated at each inner position (evaluate.js does the repeating: the rules here stay two-dimensional, but
   those marked deep, which read the long keys themselves). Two inputs' inner axes have to agree (algebra.js:
   nested): as many, the same lengths, and no axis under two names. In a product, entry by entry, in a map's named
   matrices and in a function applied, an input with no inner data is used at every inner position of the other; a
   sum, the parts of a block, of a stack and of a tile's pattern have to agree exactly. Nothing is broadcast, and
   nothing lines inner axes up from the right. A scalar is one by one with no inner data: a one by one type that
   holds inner data (a cut down to one entry) is a matrix of one entry, has no mass, does not scale and is not
   passed over in a row. A function's input block that holds inner data takes exactly that, and is applied once;
   one that holds none is run at each inner position of what it is given, and may then not come to inner data of
   its own. In a formula k1, k2, … are the inner position of the entry being worked out.

   Bindings. A node in a function's body has a value for each thing the function is applied to, and a node in a
   tile's pattern may have one for each cell: such a node has "within", the functions (f:<id>) and the tiles
   (t:<frame id>) it belongs to, every one of them, outermost first. It belongs to a function where its value
   follows that function's input, and to a tile where it follows its cell (a formula of it, or of what it is made
   of, reads the index) and is reached from that tile's pattern: from a block of it, a piece of such blocks, the
   output of an arrow in it, or a part of its matrix. The evaluator remembers such a node's value under its id
   together with the whole chain of bindings it sits under. A tile's cell binds the index: index.x of entry c,r is
   the columns of the filled tile that lie before the entry, and one more. Cells nest, outermost first; the index
   an entry reads is that of the innermost cell it is in (indexAt, the one place that says so).

   A conditional arrow. An arrow whose "choose" names two frames of its definition space, { then, else }, is a
   condition: its function's body is choose(its input, what the then frame comes to, what the else frame comes to),
   and its output that function applied to what its base covers, which is the condition (any size). Each frame holds
   one piece or nothing; an empty one is a source of kind none at the other's size. What lies in neither frame takes
   no part. A frame that is gone is no-source on the arrow; sides of two sizes are the error size.

   Reading a canvas. A block whose name begins with // and a block in a frame named .config take no part. A
   definition space whose blocks are all standing shapes has no pieces: once they cover the matrix they are a block
   of it, or, where the variable's entries hold inner data (two axes or more), a stack: each stands for one entry,
   is that entry's size, and lies at its entry's place in a matrix laid out entry for entry, each entry as large as
   the matrix it holds. A block whose from names an entry ({ id, entry: { col, row } }, from 1) is that entry of
   the block with that id, taken out. A reference that carries axes is a turned use: a transpose with that order. Otherwise the pieces are algebra.js's, each
   turned into a node by its rule; an arrow's output is a slice, a map, an apply or a mapalong of what it reads.
   Sizes are settled here: a tile's count that is a formula is worked out from sizes alone (tiles.js: settled), and
   may not depend on its own tile's size (tiles.js: circular). A tile's size follows its own counts only, so a count
   may read what comes of the tile it is in, of a tile beside it or of a tile in its pattern, short of a real cycle.
   A block's zone, for what it touches, is the innermost tile it is in (algebra.js: zoneOf).
   Definitions are read 64 deep, one inside the next, and no deeper. */
import { pieces, touches, zoneOf, rangeIn, nested, combine, rootOf, isError, isNone, isFormula, exact, held as fromExact, truthOf, numbers } from './algebra.js';
import { ROOTS, together } from './values.js';
import { parts as textParts, evaluate as work, namesIn, refs, treeOf } from './expression.js';
import * as S from './spaces.js';
import { covered, coveredType, ends as endsOf, functionFor, check as promised, spread, passed, worked, SIDES } from './arrows.js';
import * as tiles from './tiles.js';
import { kept as sourceKept, kindOf as sourceKind, values as sourceValues, dataPath, DISTS, EMPTY } from './sources.js';
import { FUNCTIONS, CONFIG } from './system.js';

export const VERSION = 4;                     /* 2 added stack, entry, a transpose's order and inner axes; 3 the value None, a type's value and a promise; 4 choose and a source of kind none. An older graph holds none of what came after it and is a version 4 graph as it stands; one that says an older version and holds one of them is refused (versionFor) */
const VERSIONS = [1, 2, 3, 4];
export const CODES = ['mismatch', 'not-a-row', 'mixed', 'pieces', 'size', 'loop', 'no-source', 'seat', 'size-unknown', 'type'];
const PIECE_CODES = ['mismatch', 'not-a-row', 'mixed', 'size-unknown'];
const DEFINED = ['entries', 'definition', 'standing', 'joined', 'measure', 'range', 'seat', 'source', 'entry'];
export const AXES = 6;                           /* the most inner axes a type has */
const DEEP = 64;                                /* how deep definitions are read, one inside the next */
const E = (code, note = '') => ({ code, note: String(note) });
const own = (o, k) => !!o && typeof o === 'object' && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/* ---- types ---- */
/* A type is its two drawn sides, and inner where its entries hold inner data: the axes of what one entry holds, in
   order, each { length, name }. inner is left out where there are none (one spelling), and there are at most AXES. */
const innerOf = t => Array.isArray(t.inner) ? t.inner : [];
const T = (cols, rows, colsName = null, rowsName = null, inner = null) => ({ cols, rows, colsName: colsName || null, rowsName: rowsName || null, ...(inner && inner.length ? { inner: inner.map(a => ({ length: a.length, name: a.name || null })) } : {}) });
export const axes = t => [{ length: t.cols, name: t.colsName || null }, { length: t.rows, name: t.rowsName || null }, ...innerOf(t)];      /* every axis of a type in order: the two drawn ones, then the inner ones */
const whole1 = v => Number.isInteger(v) && v >= 1;
const okAxis = a => !!a && typeof a === 'object' && !Array.isArray(a) && Object.keys(a).length === 2 && whole1(a.length) && (a.name === null || (typeof a.name === 'string' && a.name !== ''));
const TYPE_KEYS = ['cols', 'rows', 'colsName', 'rowsName', 'inner', 'value'];
const okType = t => !!t && typeof t === 'object' && !Array.isArray(t) && whole1(t.cols) && whole1(t.rows) && (t.colsName === null || typeof t.colsName === 'string') && (t.rowsName === null || typeof t.rowsName === 'string')
  && (t.inner === undefined || (Array.isArray(t.inner) && t.inner.length >= 1 && t.inner.length <= AXES && t.inner.every(okAxis))) && (t.value === undefined || !!S.parse(t.value)) && Object.keys(t).every(k => TYPE_KEYS.includes(k));      /* its four fields, inner where it has inner axes (never an empty list), value where its number space is said (one of the nine words, "?" after it where None is admitted), and no other key */
/* ---- number spaces (spaces.js) ----
   A type's value is the number space its numbers lie in, written "integer", or "integer?" where None is admitted. It
   follows from the node's inputs by its operation's rule (OPS[op].space), as its size does; a node whose type says
   none is taken as "any?", of which nothing is known. A variable that carries holds, a promise, has that for its
   value only where the graph alone shows it kept: whether its values keep it is asked of them (evaluate.js). */
const ANY = 'any?';
const valueOf = n => (n && n.type && typeof n.type.value === 'string' ? n.type.value : ANY);
const allOf = ins => ins.map(valueOf).reduce((a, b) => S.both(a, b));
/* the space of a formula of the graph: $n is an input (first: which input $1 is), index.x, index.y and k1 to k6 are
   places, counted from 1, and in an arrow's formula x is the arrow's own input (arrow: its space) and i and j places */
function spaceIn(text, ins, first, arrow = null){
  const tree = treeOf(text); if (!tree) return ANY;
  return S.formula(tree, name => { const m = name.match(DOLLAR); if (m) return ins[+m[1] - 1 + first] ? valueOf(ins[+m[1] - 1 + first]) : undefined;
    if (tiles.axisOf(name) !== null || INNER.test(name)) return 'natural';
    const k = name.toLowerCase(); return arrow === null ? undefined : k === 'x' ? arrow : k === 'i' || k === 'j' ? 'natural' : undefined; });
}
/* What a function applied comes to: its body's space, which was worked out for whatever the function's input block
   promises to take. That is true of this use only where what it is given is known, from the graph alone, to lie in
   what the function takes; where it is not, nothing is said of the result (any, or None). Whether the values given
   lie in it is evaluate.js's to say (the error type, where one does not). */
const bodyOf = (n, g, given) => { const f = g.fn(n.fn), p = f && g.node(f.input); return S.within(valueOf(given), valueOf(p)) ? valueOf(f && g.node(f.body)) : ANY; };
const one = t => t.cols === 1 && t.rows === 1 && !innerOf(t).length;      /* a scalar: one number and nothing else. A one by one type that holds inner data is a matrix of one entry */
const drawnSame = (a, b) => a.cols === b.cols && a.rows === b.rows;
const same = (a, b) => drawnSame(a, b) && innerOf(a).length === innerOf(b).length && innerOf(a).every((x, i) => x.length === innerOf(b)[i].length);      /* one size, inner lengths and all */
const alike = (a, b) => same(a, b) && a.colsName === b.colsName && a.rowsName === b.rowsName && innerOf(a).every((x, i) => x.name === innerOf(b)[i].name);
const sizeOf = t => `${t.cols} × ${t.rows}` + (innerOf(t).length ? ' · ' + innerOf(t).map(a => a.length).join(' × ') : '');
const sizes = (a, b) => `${sizeOf(a)} ≠ ${sizeOf(b)}`;
const written = t => `${sizeOf(t)} (${[t.colsName, t.rowsName, ...innerOf(t).map(a => a.name)].map(String).join(', ')})`;
const tailOf = ks => ks.length ? ',' + ks.join(',') : '';
/* every inner position of a type, as what follows "column,row" in a key: [""] for a type with no inner data, else
   ",k1,k2,…" for each, the first axis slowest */
export function tailsOf(t){ let out = ['']; for (const a of innerOf(t)) out = out.flatMap(p => Array.from({ length: a.length }, (_, k) => p + ',' + (k + 1))); return out; }
/* what several types' inner data comes to where all of them have to hold the same (the parts of one matrix), or null */
const agreed = types => { let inner = innerOf(types[0]); for (const t of types.slice(1)){ const n = nested(inner, innerOf(t), true); if (!n.ok) return null; inner = n.inner; } return inner; };
/* the size rules are algebra.js's and no one else's: a rule here sets its inputs down as shapes that touch that way,
   and asks what the piece comes to */
const rectOf = (t, x, y) => ({ x, y, w: t.cols, h: t.rows, wName: t.colsName, hName: t.rowsName, inner: innerOf(t) });
const lone = rects => { const p = pieces(rects); return p.length === 1 && !p[0].type.error ? T(p[0].type.cols, p[0].type.rows, p[0].type.colsName, p[0].type.rowsName, p[0].type.inner) : null; };
const broadcastOf = (a, b) => drawnSame(a, b) ? 'none' : one(a) || one(b) ? 'scalar' : a.cols === b.cols ? 'row' : 'col';
/* parts at their places: whether they cover a cols by rows rectangle exactly, with no gap and no overlap */
function covers(types, at, cols, rows){
  if (!Array.isArray(at) || at.length !== types.length) return false;
  let area = 0;
  for (let i = 0; i < types.length; i++){ const a = at[i], t = types[i];
    if (!a || !Number.isInteger(a.col) || !Number.isInteger(a.row) || a.col < 0 || a.row < 0 || a.col + t.cols > cols || a.row + t.rows > rows) return false;
    for (let j = 0; j < i; j++){ const b = at[j], u = types[j]; if (a.col < b.col + u.cols && b.col < a.col + t.cols && a.row < b.row + u.rows && b.row < a.row + t.rows) return false; }
    area += t.cols * t.rows; }
  return area === cols * rows;
}

/* ---- values, as the graph writes them and as they are worked with ---- */
const held = v => v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v;
/* an exact value in its one stated form: n over d under k square roots, in lowest terms, d left out where it is 1,
   and kept only where it is not a whole number. What values.js makes of it, or undefined where it is none at all. */
/* the entries of a block that hold no formula, as the graph keeps them: a snapshot's entries object -> { cols, rows, entries }.
   A caller that hands over the same object for entries that have not changed (the page does) has them read once. */
const plains = new WeakMap();
const exacts = new WeakMap();                   /* an entry's object -> what it is exactly: the same object is asked for at every build */
function exactly(v){
  if (!exacts.has(v)) exacts.set(v, exactlyNow(v));
  return exacts.get(v);
}
function exactlyNow(v){
  if (!Number.isSafeInteger(v.n) || !Number.isInteger(v.k) || v.k < 0 || v.k > ROOTS || !(v.d === undefined || (Number.isSafeInteger(v.d) && v.d >= 1))) return undefined;
  let e; try { e = fromExact(exact(v.d === undefined ? { n: v.n, k: v.k } : { n: v.n, d: v.d, k: v.k })); } catch { return undefined; }
  return typeof e === 'number' ? (Number.isSafeInteger(e) ? e : undefined) : e && Number.isInteger(e.n) ? Object.freeze(e.d === undefined || e.d === 1 ? { n: e.n, k: e.k } : { n: e.n, d: e.d, k: e.k }) : undefined;
}
/* an entry as the graph keeps it, or undefined for what is no literal value (an error, a decimal, anything else) */
function literal(v){
  if (v === Infinity || v === 'inf') return 'inf';
  if (v === -Infinity || v === '-inf') return '-inf';
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isSafeInteger(v) ? v : undefined;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  if ('n' in v || 'k' in v) return exactly(v);
  if (v.none === true) return NOTHING;      /* None: a value like any other, and kept */
  return typeof v.sym === 'string' && v.sym && !spells(v.sym) ? { sym: v.sym } : undefined;
}
/* a symbolic value is arithmetic the solver wrote out: it never spells None or an infinity, each of which has its one
   form of its own ({ none: true }, "inf"). Text that does is no literal: read as arithmetic it would come to a number
   that it is not (the backend would answer 0 for "none") */
const spells = text => /[∅∞]/.test(text) || (text.match(/[A-Za-z_][\w.]*/g) || []).some(name => ['none', 'inf', 'infinity'].includes(name.toLowerCase()));
/* whether a value is written exactly as the graph writes it: nothing more, and in its one form */
function okLiteral(v){
  const l = literal(v); if (l === undefined) return false;
  if (l === null || typeof l !== 'object') return l === v;
  return !!v && typeof v === 'object' && Object.keys(v).length === Object.keys(l).length && Object.keys(l).every(k => v[k] === l[k]);
}
const NOTHING = Object.freeze({ none: true });
const okError = v => !!v && typeof v === 'object' && typeof v.err === 'string' && Object.keys(v).length === 1;
const cell = (m, key) => { const v = m.get(key); return v === undefined ? null : v; };
/* a value of one of the kinds values.js sets out, or the error that it is none: nothing else is handed on */
const NONE = { err: 'that has no value' };
const sound = v => v === null || v === undefined ? null : typeof v === 'boolean' || (typeof v === 'number' && !Number.isNaN(v)) ? v
  : typeof v === 'object' && (typeof v.err === 'string' || typeof v.sym === 'string' || typeof v.f === 'number' || v.none === true || (Number.isInteger(v.n) && Number.isInteger(v.k))) ? v : NONE;

/* ---- bindings: the index ---- */
/* The index an entry reads: its column and row counted across the whole filled tile. cells is the chain of cells
   the entry sits under, outermost first; the index is read from ONE of them, the innermost (a tile inside a tile
   has its own index). This is the only place that chooses. null where it is in no cell.
   A cell is { x, y, dx, dy, turned }: x and y are the columns and rows of the filled tile that lie before the cell,
   dx and dy those of the pattern that lie before the block's first entry (left out: none). turned: the entries
   are being read through a transpose, so entry c,r stands in column r and row c. */
export function indexAt(cells, c, r){
  const at = cells && cells.length ? cells[cells.length - 1] : null; if (!at) return null;
  const x = at.x + (at.dx || 0), y = at.y + (at.dy || 0);
  return at.turned ? { x: x + r, y: y + c } : { x: x + c, y: y + r };
}

/* ---- formulas in the graph ---- */
const DOLLAR = /^\$([1-9]\d*)$/, INNER = /^k([1-6])$/i;      /* $n: an input; k1 to k6: the inner position of the entry being worked out */
const LONGEST = 10000, DEEPEST = 64;            /* a formula in a graph is at most this long, and nests at most this deep: the backend reads it with these bounds (backend/limits.py), and the two validators are to agree */
const FUNCS = new Set(['select', 'max', 'min', 'abs', 'sqrt', 'exp', 'ln', 'tanh', 'erf']), CONSTS = new Set(['inf', 'infinity', 'true', 'false', 'none']);
/* Whether a formula is one the graph may hold: it reads as arithmetic (expression.js), it is no longer than LONGEST
   characters and nests no deeper than DEEPEST, it holds no capsule, and every
   name in it is $1 to $most, index.x or index.y, or (in an arrow's formula) x, i or j. Nothing a node depends on
   can then be hidden in it. An attribute's may be empty: it has no value yet. */
function formulaOk(text, most, { arrow = false, empty = false } = {}){
  if (typeof text !== 'string') return false;
  if (!text.trim()) return empty;
  if (text.length > LONGEST) return false;
  const got = namesIn(text); if (got.why || got.capsules.length || got.deep > DEEPEST) return false;
  return got.names.every(name => { const m = name.match(DOLLAR); return m ? +m[1] <= most : tiles.axisOf(name) !== null || INNER.test(name) || (arrow && ['x', 'i', 'j'].includes(name.toLowerCase())); });
}
/* what a name in a graph's formula stands for. first: which input $1 is; size: the output's, for an input that is a
   whole matrix (its entry at this place); index(place): the index of the entry at that place, or null */
function lookupIn(n, at, first, size, index){
  return (token, place = { c: 1, r: 1 }) => {
    if (typeof token !== 'string') return undefined;
    const axis = tiles.axisOf(token); if (axis){ const i = index(place); return i ? i[axis] : tiles.NO_INDEX; }
    const ks = place.ks || at.ks || [];           /* the inner position: the entry's own, or the one the rule is being repeated at */
    const inner = token.match(INNER); if (inner) return +inner[1] <= ks.length ? ks[+inner[1] - 1] : { err: ks.length ? `there is no inner axis ${inner[1]}: it has ${ks.length}` : 'no inner data: there is no ' + token.toLowerCase() };
    const m = token.match(DOLLAR); if (!m) return undefined;
    const k = +m[1] - 1 + first; if (k < first || k >= n.inputs.length) return undefined;
    const t = at.type(k);
    /* a whole matrix: the output's own size, inner data and all; or its drawn size with no inner data, read at every inner position; or a scalar */
    return drawnSame(t, size) && (!innerOf(t).length || same(t, size)) ? cell(at.get(k), place.c + ',' + place.r + (innerOf(t).length ? tailOf(place.ks || []) : '')) : one(t) ? cell(at.get(k), '1,1') : { err: 'not the size of the output' };
  };
}
/* whether a formula of the node's own reads the index */
export const readsIndex = n => (n.op === 'variable' && n.defined === 'entries' && Object.values(n.entries || {}).some(v => v && typeof v.expr === 'string' && tiles.reads(v.expr))) || (n.op === 'map' && tiles.reads(n.formula))
  || (n.op === 'mapalong' && Array.isArray(n.through) && n.through.length > 0)      /* an arrow repeated through an outer tile reads another part of its input in each of that tile's cells */
  || n.op === 'noise';      /* noise reads no index, and still every cell holds other numbers: the cell joins its key */

/* ---- the operations ----
   Each: inputs [least, most]; fields(n) -> what is wrong with its own fields (sentences); type(n, ins, g) -> the type
   it must have, given its input nodes (g.fn(id) is a function of the graph), or a sentence where it can have none;
   id(n) -> its id written out; needs(n, ins) -> which inputs its value is worked out from (left out: all of them);
   later(n) -> the inputs it reads only when its value asks for them, with at.pick (a choose's two sides: one is read,
   and which is not known until its condition is worked out);
   value(n, at) -> its entries, a Map from "column,row" (unknown entries absent); deep: true (or deep(n, g) -> whether)
   where the rule reads inner positions itself, its keys then "column,row,k1,…": any other rule is run by
   evaluate.js once for each inner position, on entries keyed "column,row". at is the evaluator's: at.get(k)
   the entries of input k, at.type(k) its type, at.cells the chain of cells, and the rest as evaluate.js sets out. */
const list = xs => xs.join(',');
const HELD_APART = 'a matrix its formula names holds inner data that is not its own';
export const TWO_SIZES = 'its two sides are not one size';
const SIDE = /^(x|y|m|a|d[1-6])$/;               /* what a measure reads: a drawn side, a mass, an attribute, or the length of an inner axis */
const innerText = t => innerOf(t).length ? '·' + innerOf(t).map(a => a.length).join('×') : '';
const unnamed = t => innerOf(t).map(a => ({ length: a.length, name: null }));
const plain = (n, extra = '') => `${n.op}(${list(n.inputs)}${extra})`;
const range = r => `${r.col},${r.row},${r.cols},${r.rows}`;
const okRange = r => !!r && typeof r === 'object' && [r.col, r.row].every(v => Number.isInteger(v) && v >= 0) && whole1(r.cols) && whole1(r.rows);
const okAt = a => a === undefined || (!!a && typeof a === 'object' && Number.isInteger(a.col) && Number.isInteger(a.row));
const okPlaces = n => Array.isArray(n.at) && n.at.length === n.inputs.length && n.at.every(a => a && okAt(a));
/* ---- several shapes added, or multiplied entry by entry: their terms looked at all together (values.js: together) ----
   A sum of several shapes is one node, and its terms are all there. A times of several is one node made of another,
   and so is a sum made of a sum: what the terms set aside in the inner one came to (those that were neither None
   nor unknown) is kept beside its value, by entry, and the outer one reads it, so that None × 0 × ∞ is an error
   whichever two are multiplied first. RESTS: a node's value (the Map) -> { op: '+' | '*', at: Map from an entry's
   key }. It is read only by a node of the same kind made directly of that one: nothing else sees it, and a
   variable between the two ends it. evaluate.js keeps it where a rule is repeated over inner data. */
export const RESTS = new WeakMap();
const CHAIN = { add: '+', scale: '*', ewise: '*' };
const chainOf = n => n && (n.op === 'ewise' ? (n.fn === 'mul' ? '*' : null) : CHAIN[n.op] || null);
/* each(c, r, key) -> [[value, the key it has in input k], …] for one entry: the terms, in the inputs' order */
function allTogether(n, at, op, each){
  const rests = n.inputs.map((i, k) => chainOf(at.graph.nodes[i]) === op ? at.rest(k) : null), out = new Map(), kept = new Map();
  for (let r = 1; r <= n.type.rows; r++) for (let c = 1; c <= n.type.cols; c++){ const key = c + ',' + r, terms = each(c, r, key);
    const got = together(op, terms.map(t => t[0]), null, terms.map((t, k) => rests[k] ? rests[k].get(t[1]) : undefined));
    if (got.value !== null && got.value !== undefined) out.set(key, got.value);
    if (got.rest !== undefined) kept.set(key, got.rest); }
  if (kept.size) RESTS.set(out, { op, at: kept });
  return out;
}
const entrywise = (t, each) => { const out = new Map(); for (let r = 1; r <= t.rows; r++) for (let c = 1; c <= t.cols; c++){ const v = each(c, r, c + ',' + r); if (v !== null && v !== undefined) out.set(c + ',' + r, v); } return out; };
/* one run of a repeated arrow: the part of the input cell k covers, and the cell's type */
const runOf = (n, k) => ({ side: n.axis === 'rows' ? 'e' : 's', start: n.start + (k - 1) * n.span, span: n.span });
/* What a function comes to for what it is given, or why it does not fit. Its input block takes the drawn size it has.
   Where the input block holds inner data, what is given has to hold the same, and the function is applied once.
   Where it holds none and what is given holds some, the body is run at each inner position and the result takes
   those inner axes: so the body may not come to inner data of its own. */
const fnFits = (n, g, given) => { const f = g.fn(n.fn), p = f && g.node(f.input), b = f && g.node(f.body);
  if (!f || !p || !b) return 'its function is not in the graph';
  if (!drawnSame(p.type, given)) return `its input is ${given.cols} × ${given.rows} and the function takes ${p.type.cols} × ${p.type.rows}`;
  const pi = innerOf(p.type), gi = innerOf(given);
  if (pi.length){ const ag = nested(pi, gi, true); return ag.ok ? b.type : `its input's inner data is not what the function takes: ${ag.note}`; }
  if (!gi.length) return b.type;
  return innerOf(b.type).length ? 'its function is run at each inner position of its input, and comes to inner data of its own' : T(b.type.cols, b.type.rows, b.type.colsName, b.type.rowsName, gi); };
/* whether a function is handed its input whole, inner data and all: its input block holds inner data */
const fnWhole = (n, g) => { const f = n.fn !== undefined ? g.fn(n.fn) : null, p = f && g.node(f.input); return !!p && innerOf(p.type).length > 0; };
/* a matrix a formula names beside x: the output's own size, inner data and all; or its drawn size with no inner data; or a scalar */
const namedFits = (t, out) => one(t) || (drawnSame(t, out) && (!innerOf(t).length || same(t, out)));
const okEntryKey = (key, t) => { const p = key.split(','), ax = t ? axes(t) : null; return p.length >= 2 && p.every(x => /^[1-9]\d*$/.test(x)) && (!ax || (p.length === ax.length && p.every((x, i) => +x <= ax[i].length))); };

export const OPS = {
  variable: { inputs: [0, Infinity], deep: true, id: n => n.id,
    /* what defines it, or the space of its entries: every value given and every formula. Where it carries a promise
       its value is the promise only where that follows from the graph alone: what it is worked out as lies inside
       the promise, or its entries say nothing yet (nothing known lies inside every space). Otherwise it is what it
       is worked out as, the wider of the two that is known to be true: a type never says what might be false.
       Whether the values keep the promise is evaluate.js's to say, and the backend's of its own numbers. */
    space(n, ins){ let was, quiet = false;
      if (n.defined !== 'entries') was = valueOf(ins[0]);
      else { const all = Object.values(n.entries), values = all.filter(v => !isFormula(v)), more = all.filter(isFormula).map(v => spaceIn(v.expr, ins, 0)); was = S.ofAll(values, more); quiet = S.silent(values, more); }
      return n.holds !== undefined && S.parse(n.holds) && (quiet || S.within(was, n.holds)) ? n.holds : was; },
    fields(n){ const bad = [];
      if (n.holds !== undefined && !S.parse(n.holds)) bad.push('holds is no number space');
      if (typeof n.name !== 'string') bad.push('name is not text'); if (typeof n.named !== 'boolean') bad.push('named is not true or false');
      if (!DEFINED.includes(n.defined)) bad.push(`defined is "${n.defined}"`);
      if (n.error !== undefined && !(n.error && typeof n.error === 'object' && CODES.includes(n.error.code) && typeof n.error.note === 'string' && Object.keys(n.error).length === 2)) bad.push('its error is not { code, note }');
      if (n.error !== undefined && n.defined !== 'entries') bad.push('a variable with an error is "entries": it keeps what was typed into it');
      if (n.defined !== 'entries' && n.inputs.length !== 1) bad.push(`defined "${n.defined}" takes exactly one input`);
      if (!n.entries || typeof n.entries !== 'object' || Array.isArray(n.entries)) return [...bad, 'entries is not an object'];
      for (const [key, v] of Object.entries(n.entries)){      /* a key is a column and a row, and one more number for each inner axis, each within its length */
        if (!okEntryKey(key, okType(n.type) ? n.type : null)) bad.push(`entry ${key} is not an entry of it`);
        else if (v && typeof v === 'object' && 'expr' in v){ if (n.defined !== 'entries' || Object.keys(v).length !== 1 || !formulaOk(v.expr, n.inputs.length)) bad.push(`entry ${key} holds a formula the graph cannot hold: it does not read, or names what is not an input`); }
        else if (!okLiteral(v) && !okError(v)) bad.push(`entry ${key} holds no value in its stated form`); }
      return bad; },
    /* its type is its block's own; what defines it must be that size (and a definition must not call a side by another name) */
    type(n, ins){ if (!okType(n.type)) return 'it has no size of its own';
      /* what an entry's formula names holds inner data only where it is the variable's own size, inner data and all: a size that is settled when the graph is built is checked then, not met as an error in every entry */
      if (n.defined === 'entries' && ins.some(i => innerOf(i.type).length && !same(i.type, n.type))) return HELD_APART;
      if (n.defined === 'entries' || !ins.length) return n.type;
      const t = ins[0].type, kinds = { measure: ['measure'], standing: ['block', 'stack'], joined: ['block'], source: ['source', 'map', 'noise'], entry: ['entry'] };
      if (own(kinds, n.defined) && !kinds[n.defined].includes(ins[0].op)) return `defined "${n.defined}" over a ${ins[0].op}`;
      if (!same(t, n.type)) return 'what defines it is ' + sizes(t, n.type).replace('≠', 'and it is');
      if (n.defined === 'definition'){ for (const k of ['colsName', 'rowsName']) if (t[k] && n.type[k] && t[k] !== n.type[k]) return `its definition's side is ${t[k]} and its own is ${n.type[k]}`;
        const ag = nested(innerOf(t), innerOf(n.type), true); if (!ag.ok) return `its definition's inner data is not its own: ${ag.note}`; }
      return n.type; },
    needs: n => n.error ? [] : n.inputs.map((_, k) => k),
    value(n, at){ if (n.defined !== 'entries') return at.get(0);
      const out = new Map(), names = lookupIn(n, at, 0, n.type, p => indexAt(at.cells, p.c, p.r));
      for (const [key, v] of Object.entries(n.entries)){
        if (!isFormula(v)){ out.set(key, held(v)); continue; }      /* a value; or the error a formula was found to be when the graph was built */
        const [c, r, ...ks] = key.split(',').map(Number), w = sound(work(v.expr, token => names(token, { c, r, ks })).value);
        if (w !== null) out.set(key, w); }
      return out; } },
  matmul: { inputs: [2, 2], fields: () => [], id: n => plain(n),
    space: (n, [a, b]) => S.product(valueOf(a), valueOf(b), a.type.cols),      /* each entry is a sum of as many products as the first has columns */
    /* a type holds real lengths: sides that carry one name are still to be one length */
    /* a single entry is no exception: against a single row or column it is a product like any other, and against anything
       else it is a scale, which is another node. The backend's check.py says the same, in the same words */
    type: (n, [a, b]) => (a.type.cols !== b.type.rows ? null : lone([rectOf(a.type, 0, 0), rectOf(b.type, a.type.cols, 0)]))
      || (a.type.cols === b.type.rows && !nested(innerOf(a.type), innerOf(b.type)).ok ? 'a product of shapes whose inner data does not agree: ' + nested(innerOf(a.type), innerOf(b.type)).note
        : `a product of ${a.type.cols} columns and ${b.type.rows} rows` + (one(a.type) || one(b.type) ? ': a single entry against a matrix is a scale' : '')),
    /* entry c,r is the sum over k of left k,r times right c,k. An unknown term makes the entry unknown, even against
       a known zero: what two values come to is combine's to say, for every pair. The terms that are None or unknown
       are left out of the sum, so that it does not turn on where among the terms they stand: an error among the
       others (∞ − ∞ between two of them) comes first, then unknown, then None */
    value(n, at){ const a = at.type(0), b = at.type(1), L = at.get(0), R = at.get(1), K = a.cols, out = new Map();
      const rowsOf = [], colsOf = [];
      for (let r = 1; r <= a.rows; r++){ const row = new Array(K); for (let k = 1; k <= K; k++) row[k - 1] = cell(L, k + ',' + r); rowsOf.push(row); }
      for (let c = 1; c <= b.cols; c++){ const col = new Array(K); for (let k = 1; k <= K; k++) col[k - 1] = cell(R, c + ',' + k); colsOf.push(col); }
      for (let r = 1; r <= a.rows; r++){ const row = rowsOf[r - 1];
        for (let c = 1; c <= b.cols; c++){ const col = colsOf[c - 1]; let sum, none = false, unknown = false;
          for (let k = 0; k < K; k++){ const term = combine('*', row[k], col[k]);
            if (term === null) unknown = true; else if (isNone(term)) none = true; else sum = sum === undefined ? term : combine('+', sum, term); }
          /* a term that is None makes the entry None, whichever term it is, and an unknown one unknown: unless the
             others come to no value (an error), which comes first, as it does for a pair of values */
          if (!isError(sum)) sum = unknown ? null : none ? NOTHING : sum;
          if (sum !== null && sum !== undefined) out.set(c + ',' + r, sum); } }
      return out; } },
  scale: { inputs: [2, 2], fields: () => [], id: n => plain(n), space: (n, [s, m]) => S.binary('*', valueOf(s), valueOf(m)),
    type: (n, [s, m]) => one(s.type) ? T(m.type.cols, m.type.rows, m.type.colsName, m.type.rowsName, m.type.inner) : 'the first input of a scale is a single number',
    value(n, at){ const s = cell(at.get(0), '1,1'), M = at.get(1); return allTogether(n, at, '*', (c, r, key) => [[s, '1,1'], [cell(M, key), key]]); } },
  transpose: { inputs: [1, 1], deep: true, id: n => plain(n, n.order ? ';' + n.order.join(',') : ''), space: (n, [a]) => valueOf(a),
    fields: n => n.order === undefined || (Array.isArray(n.order) && n.order.length >= 3 && n.order.length <= AXES + 2 && n.order.every((i, k) => Number.isInteger(i) && i >= 0 && i < n.order.length && n.order.indexOf(i) === k)) ? [] : ['order is not its axes, each once, counted from 0'],
    /* with no order it swaps the two drawn sides. order names every axis of the input (the two drawn ones are 0 and 1): axis k of the result is axis order[k] of the input */
    type(n, [a]){ if (!n.order) return T(a.type.rows, a.type.cols, a.type.rowsName, a.type.colsName, a.type.inner);
      const ax = axes(a.type); if (n.order.length !== ax.length) return `order names ${n.order.length} axes and its input has ${ax.length}`;
      if (n.order.slice(2).every((i, k) => i === k + 2)) return 'order moves no inner axis: that is no turn, or a transpose with no order';      /* one spelling */
      const to = n.order.map(i => ax[i]); return T(to[0].length, to[1].length, to[0].name, to[1].name, to.slice(2)); },
    value(n, at){ const out = new Map();
      if (n.order){ const swapped = n.order[0] === 1 && n.order[1] === 0;      /* the index is the cell's, by drawn column and row: read turned only where the turn is of those two */
        for (const [key, v] of at.get(0, swapped ? at.turn() : undefined)){ const p = key.split(','); out.set(n.order.map(i => p[i]).join(','), v); } return out; }
      for (const [key, v] of at.get(0, at.turn())){ const i = key.indexOf(','), j = key.indexOf(',', i + 1); out.set((j < 0 ? key.slice(i + 1) : key.slice(i + 1, j)) + ',' + key.slice(0, i) + (j < 0 ? '' : key.slice(j)), v); } return out; } },
  add: { inputs: [2, Infinity], fields: () => [], id: n => plain(n), space: (n, ins) => ins.map(valueOf).reduce((a, b) => S.binary('+', a, b)),
    type(n, ins){ let y = 0; return lone(ins.map(i => { const r = rectOf(i.type, 0, y); y += i.type.rows; return r; })) || 'a sum of shapes that are not one size'; },
    value(n, at){ const ms = n.inputs.map((_, k) => at.get(k)); return allTogether(n, at, '+', (c, r, key) => ms.map(m => [cell(m, key), key])); } },
  ewise: { inputs: [2, 2], id: n => plain(n, `;${n.fn};${n.broadcast}`), space: (n, [a, b]) => S.binary(n.fn === 'div' ? '/' : '*', valueOf(a), valueOf(b)),
    fields: n => [...(n.fn === 'mul' || n.fn === 'div' ? [] : [`fn is "${n.fn}"`]), ...(['none', 'scalar', 'row', 'col'].includes(n.broadcast) ? [] : [`broadcast is "${n.broadcast}"`])],
    type(n, [a, b]){ const t = lone([rectOf(a.type, 0, 0), rectOf(b.type, a.type.cols, n.fn === 'div' ? a.type.rows : -b.type.rows)]);
      return !t ? 'sizes that do not agree entry by entry' : n.broadcast !== broadcastOf(a.type, b.type) ? `broadcast is "${n.broadcast}" and its inputs make it "${broadcastOf(a.type, b.type)}"` : t; },
    value(n, at){ const a = at.type(0), b = at.type(1), A = at.get(0), B = at.get(1), op = n.fn === 'div' ? '/' : '*';
      const of = (t, m, c, r) => cell(m, (t.cols === 1 ? 1 : c) + ',' + (t.rows === 1 ? 1 : r));      /* a single entry, row or column is applied to every one */
      if (op === '*'){ const keyIn = (t, c, r) => (t.cols === 1 ? 1 : c) + ',' + (t.rows === 1 ? 1 : r); return allTogether(n, at, '*', (c, r) => [[of(a, A, c, r), keyIn(a, c, r)], [of(b, B, c, r), keyIn(b, c, r)]]); }
      return entrywise(n.type, (c, r) => combine(op, of(a, A, c, r), of(b, B, c, r))); } },
  block: { inputs: [1, Infinity], deep: true, space: (n, ins) => allOf(ins), id: n => `block(${n.inputs.map((i, k) => `${i}@${n.at[k].col},${n.at[k].row}`).join(';')})`,
    fields: n => okPlaces(n) ? [] : ['at is not one { col, row } for each part'],
    /* the rectangle round its parts, which must cover it exactly; a side is named as the top-left part names it, where that part spans it */
    type(n, ins){ const ts = ins.map(i => i.type), cols = Math.max(...ts.map((t, k) => n.at[k].col + t.cols)), rows = Math.max(...ts.map((t, k) => n.at[k].row + t.rows));
      if (!covers(ts, n.at, cols, rows)) return 'its parts do not cover it exactly';
      const inner = agreed(ts); if (!inner) return 'its parts do not hold the same inner data';
      const first = ts[n.at.findIndex(a => a.col === 0 && a.row === 0)];
      return T(cols, rows, first.cols === cols ? first.colsName : null, first.rows === rows ? first.rowsName : null, inner); },
    value(n, at){ const out = new Map();
      n.inputs.forEach((_, k) => { const a = n.at[k], t = at.type(k);
        for (const [key, v] of at.get(k, at.shift(a.col, a.row))){ const [c, r, ...ks] = key.split(',').map(Number); if (c <= t.cols && r <= t.rows) out.set((c + a.col) + ',' + (r + a.row) + tailOf(ks), v); } });
      return out; } },
  slice: { inputs: [1, 1], deep: true, id: n => plain(n, ';' + range(n.range)), space: (n, [a]) => valueOf(a),
    fields: n => okRange(n.range) && Object.keys(n.range).length === 4 ? [] : ['range is not { col, row, cols, rows }'],
    type(n, [a]){ const r = n.range; if (r.col + r.cols > a.type.cols || r.row + r.rows > a.type.rows) return 'its range runs past its input';
      return T(r.cols, r.rows, r.cols === a.type.cols ? a.type.colsName : null, r.rows === a.type.rows ? a.type.rowsName : null, a.type.inner); },      /* the range is taken at every inner position */
    value: (n, at) => passed(at.get(0), n.range) },
  source: { inputs: [0, 0], deep: true, space: n => n.kind === 'file' ? 'real' : n.kind === EMPTY ? S.NONE : 'boolean',      /* zeros, ones and an identity hold 0 and 1; a data file any numbers on the line; and the empty one None alone */
    id: n => `source(${n.kind}${n.kind === 'file' ? ':' + n.path : ''};${n.type.cols}×${n.type.rows}${innerText(n.type)})`,
    fields: n => n.kind === 'file' ? (dataPath(n.path) ? [] : ['path is not a file under data/']) : typeof n.kind === 'string' && (n.kind === EMPTY || sourceKept(n.kind)) ? ('path' in n ? ['only a file has a path'] : []) : [`kind is "${n.kind}"`],
    type: n => !okType(n.type) ? 'it has no size of its own' : n.kind === 'file' && innerOf(n.type).length ? 'a data file holds no inner data' : T(n.type.cols, n.type.rows, null, null, unnamed(n.type)),
    value: n => sourceValues(n.kind, n.type.cols, n.type.rows, innerOf(n.type).map(a => a.length)) },      /* (a file's numbers are the backend's: evaluate.js does not ask here for them) */
  noise: { inputs: [0, 0], deep: true, space: n => n.dist === 'uniform' ? 'probability' : 'real', id: n => `noise(${n.seed};${n.dist};${n.key};${n.type.cols}×${n.type.rows}${innerText(n.type)})`,
    fields: n => [...(Number.isSafeInteger(n.seed) ? [] : ['seed is not a whole number']), ...(DISTS.includes(n.dist) ? [] : [`dist is "${n.dist}"`]), ...(typeof n.key === 'string' && n.key ? [] : ['key is not a block id'])],
    type: n => okType(n.type) ? T(n.type.cols, n.type.rows, null, null, unnamed(n.type)) : 'it has no size of its own',
    value: () => new Map() },      /* its numbers are the backend's (backend/arrays.py has the generator) */
  measure: { inputs: [1, Infinity], deep: true,
    /* a length is a natural number; a single entry's side is the root of its mass; an attribute is what its formula comes to */
    space: (n, ins) => n.side === 'a' ? (n.formula.trim() ? spaceIn(n.formula, ins, 1) : 'boolean') : n.side === 'm' ? valueOf(ins[0]) : n.side[0] === 'd' || !one(ins[0].type) ? 'natural' : S.unary('sqrt', valueOf(ins[0])),
    id: n => plain({ op: 'measure', inputs: n.inputs.slice(0, 1) }, ';' + (n.side === 'a' ? 'a:' + n.name : n.side)),
    fields(n){ if (typeof n.side !== 'string' || !SIDE.test(n.side)) return [`side is "${n.side}"`];
      if (n.side !== 'a') return n.inputs.length !== 1 ? ['a side or a mass is read off one input'] : 'name' in n || 'formula' in n ? ['only an attribute has a name and a formula'] : [];
      return [...(typeof n.name === 'string' && n.name ? [] : ['an attribute has a name']), ...(formulaOk(n.formula, n.inputs.length - 1, { empty: true }) ? [] : ['its formula is one the graph cannot hold: it does not read, or names what is not an input'])]; },
    type: (n, [a, ...named]) => n.side === 'm' && !one(a.type) ? 'only a single number has a mass' : n.side[0] === 'd' && +n.side.slice(1) > innerOf(a.type).length ? `its input has no inner axis ${n.side.slice(1)}`
      : n.side === 'a' && named.some(i => innerOf(i.type).length) ? HELD_APART : T(1, 1),      /* an attribute is one number: its formula names no matrix that holds inner data */
    /* a length is read off the type, so the matrix itself is not needed; an attribute's first input only says whose it is */
    needs: (n, ins) => n.side === 'a' ? n.inputs.slice(1).map((_, k) => k + 1) : n.side === 'm' || one(ins[0].type) ? [0] : [],
    value(n, at){ const t = at.type(0), as = v => new Map(v === null || v === undefined ? [] : [['1,1', v]]);
      if (n.side === 'a') return as(n.formula.trim() ? sound(work(n.formula, lookupIn(n, at, 1, T(1, 1), () => null)).value) : null);
      if (n.side[0] === 'd') return as(innerOf(t)[+n.side.slice(1) - 1].length);      /* the length of an inner axis */
      if (!one(t)) return as(n.side === 'x' ? t.cols : t.rows);
      const v = cell(at.get(0), '1,1'); if (n.side === 'm' || v === null || isError(v)) return as(v);
      const root = rootOf(v); return as(root === null ? { err: 'it has no root to be a side' } : root); } },      /* a single entry's side is the root of its mass */
  map: { inputs: [1, Infinity], id: n => plain(n, ';' + n.formula), space: (n, ins) => spaceIn(n.formula, ins, 1, valueOf(ins[0])),
    fields: n => formulaOk(n.formula, n.inputs.length - 1, { arrow: true }) ? [] : ['its formula is one the graph cannot hold: it does not read, or names what is not an input'],
    type(n, ins){ const x = ins[0].type; for (const i of ins.slice(1)) if (!namedFits(i.type, x)) return 'a matrix its formula names is not the size of the output'; return T(x.cols, x.rows, x.colsName, x.rowsName, x.inner); },
    /* i, j and x are arrows.js's; index.x and index.y are the place of the output's entry in the cell it is worked out for */
    value(n, at){ const got = worked(n.formula, { cols: n.type.cols, rows: n.type.rows, x: at.get(0), lookup: lookupIn(n, at, 1, n.type, p => indexAt(at.cells, p.c, p.r)) });
      for (const [key, v] of got) if (sound(v) !== v) got.set(key, NONE); return got; } },
  apply: { inputs: [1, 1], id: n => plain(n, ';' + n.fn), space: (n, ins, g) => bodyOf(n, g, ins[0]),      /* what its function's body comes to, where what it is given lies in what the function's input block promises */
    fields: n => typeof n.fn === 'string' ? [] : ['fn is not a function id'],
    type: (n, [a], g) => { const t = fnFits(n, g, a.type); return typeof t === 'string' ? t : T(t.cols, t.rows, t.colsName, t.rowsName, t.inner); },
    deep: fnWhole,
    value: (n, at) => at.call(n.fn, at.get(0), at.keyOf(0)) },
  param: { inputs: [0, 0], deep: true, fields: () => [], space: n => valueOf(n),      /* its own: what the function's input block promises to take, "any?" where it promises nothing */ id: n => `param(${(n.within || [])[(n.within || []).length - 1] || ''})`,
    type: n => okType(n.type) ? n.type : 'it has no size of its own',
    value: (n, at) => at.given(n) },
  repeat: { inputs: [1, Infinity], deep: true, space: (n, ins) => allOf(ins), id: n => `repeat(${n.inputs.map((i, k) => `${i}@${n.at[k].col},${n.at[k].row}`).join(';')};${n.pattern.cols}×${n.pattern.rows};${n.across}×${n.down})`,
    fields: n => [...(okPlaces(n) ? [] : ['at is not one { col, row } for each input']),
      ...(n.pattern && typeof n.pattern === 'object' && whole1(n.pattern.cols) && whole1(n.pattern.rows) ? [] : ['pattern is not { cols, rows }']), ...(whole1(n.across) && whole1(n.down) ? [] : ['across and down are whole numbers, at least 1'])],
    type: (n, ins) => !covers(ins.map(i => i.type), n.at, n.pattern.cols, n.pattern.rows) ? 'its inputs do not cover its pattern exactly' : !agreed(ins.map(i => i.type)) ? 'its inputs do not hold the same inner data' : T(n.pattern.cols * n.across, n.pattern.rows * n.down, null, null, agreed(ins.map(i => i.type))),
    /* every cell's parts set in their places, each worked out for its cell: the cell is one more binding, under whatever
       cells this tile is itself in. A part that is met again below (an arrow in the pattern that reads it) is at its
       own place there too: places says where each part lies, for every part that is in the pattern once. */
    value(n, at){ const rects = n.inputs.map((_, k) => ({ x: n.at[k].col, y: n.at[k].row, w: at.type(k).cols, h: at.type(k).rows })), places = {};
      n.inputs.forEach((id, k) => { if (n.inputs.indexOf(id) === n.inputs.lastIndexOf(id)) places[id] = n.at[k]; });
      const key = JSON.stringify(places);
      return tiles.entries({ x: 0, y: 0, cols: n.pattern.cols, rows: n.pattern.rows }, n.across, n.down, rects,
        (k, cx, cy) => at.get(k, at.cell({ x: (cx - 1) * n.pattern.cols, y: (cy - 1) * n.pattern.rows, dx: n.at[k].col, dy: n.at[k].row, cx, cy, at: places, atKey: key }))); } },
  mapalong: { inputs: [1, Infinity], space: (n, ins, g) => n.fn !== undefined ? bodyOf(n, g, ins[0]) : spaceIn(n.formula, ins, 1, valueOf(ins[0])), id: n => plain(n, `;${n.fn !== undefined ? n.fn : n.formula};${n.axis};${n.start};${n.span};${n.count}` + (n.at ? `;@${n.at.col},${n.at.row}` : '') + (n.through ? ';through ' + n.through.map(t => `${t.tile}×${t.count}`).join(',') : '')),
    fields: n => [...((n.fn !== undefined) !== (n.formula !== undefined) ? [] : ['it has exactly one of fn and formula']),
      ...(n.fn !== undefined && (typeof n.fn !== 'string' || n.inputs.length !== 1) ? ['fn is a function id, and takes the one input'] : []),
      ...(n.formula !== undefined && !formulaOk(n.formula, n.inputs.length - 1, { arrow: true }) ? ['its formula is one the graph cannot hold: it does not read, or names what is not an input'] : []),
      ...(n.axis === 'rows' || n.axis === 'cols' ? [] : [`axis is "${n.axis}"`]), ...([n.start, n.span, n.count].every(whole1) ? [] : ['start, span and count are whole numbers, at least 1']), ...(okAt(n.at) ? [] : ['at is not { col, row }']),
      ...(n.through === undefined || (Array.isArray(n.through) && n.through.length && n.through.every(t => t && typeof t === 'object' && typeof t.tile === 'string' && t.tile.startsWith('t:') && whole1(t.count) && t.count > 1)) ? [] : ['through is not a list of { tile, count } with counts of 2 or more'])],
    /* its type is one cell's runs; the last run of the last cell of the tiles it is repeated through has to be inside its input too */
    type(n, ins, g){ const x = ins[0].type, side = runOf(n, 1).side, part = coveredType(runOf(n, n.count * (n.through || []).reduce((all, t) => all * t.count, 1)), x) && coveredType(runOf(n, 1), x);
      if (!part) return 'its last run is past its input';
      let came = part;
      if (n.fn !== undefined){ came = fnFits(n, g, part); if (typeof came === 'string') return came; }
      else for (const i of ins.slice(1)) if (!namedFits(i.type, part)) return 'a matrix its formula names is not the size of one output';
      const t = spread(came, n.count, side); return T(t.cols, t.rows, t.colsName, t.rowsName, t.inner); },
    deep: fnWhole,
    /* index.x and index.y in its formula are the arrow's own place in its tile (at), in the run being worked out */
    value(n, at){ const x = at.type(0), X = at.get(0), out = new Map(), rows = n.axis === 'rows';
      /* in a later cell of a tile it is repeated through, it goes on where the cell before ended: as many rows or columns on as lie before that cell */
      const on = (n.through || []).reduce((sum, t) => { const c = at.cells.find(c => c.of && c.of.includes(t.tile)); return sum + (c ? (rows ? c.y : c.x) : 0); }, 0);
      for (let k = 1; k <= n.count; k++){ const run = runOf(n, k), part = covered({ ...run, start: run.start + on }, x); if (!part) continue; const given = passed(X, part), size = T(part.cols, part.rows), off = (k - 1) * n.span;
        /* the key names the rows or columns handed over, where they really begin: two arrows of one function on different runs of one input, or one arrow in two cells of a tile it is repeated through, do not share an answer */
        const got = n.fn !== undefined ? at.call(n.fn, given, at.keyOf(0) + '#' + n.axis + ':' + (run.start + on) + ':' + run.span, null, n.count > 1 ? ' in run ' + k : '')
          : worked(n.formula, { cols: part.cols, rows: part.rows, x: given, lookup: lookupIn(n, at, 1, size, p => n.at ? { x: n.at.col + p.c + (rows ? 0 : off), y: n.at.row + p.r + (rows ? off : 0) } : null) });
        const each = Math.round((rows ? n.type.rows : n.type.cols) / n.count);
        for (const [key, v] of got){ const [c, r, ...ks] = key.split(',').map(Number); out.set((rows ? c + ',' + (r + (k - 1) * each) : (c + (k - 1) * each) + ',' + r) + tailOf(ks), sound(v)); } }
      return out; } },
  /* one of two matrices, by whether a third is true as a whole. The sides are typed and held to one size whether or
     not they are chosen; only the one chosen is worked out (at.pick), so what is wrong with the other does no harm */
  choose: { inputs: [3, 3], deep: true, fields: () => [], id: n => plain(n), space: (n, [, a, b]) => S.choice(valueOf(a), valueOf(b)),
    type: (n, [, a, b]) => !same(a.type, b.type) || !nested(innerOf(a.type), innerOf(b.type), true).ok || ['colsName', 'rowsName'].some(k => a.type[k] && b.type[k] && a.type[k] !== b.type[k]) ? TWO_SIZES
      : T(a.type.cols, a.type.rows, a.type.colsName, a.type.rowsName, a.type.inner),
    needs: () => [0], later: () => [1, 2],
    value(n, at){ const c = at.get(0); let t = truthOf(c.values());
      if (t === false && c.size < numbers(at.type(0))) t = null;      /* an entry never given is absent: with none true, the whole is not known */
      return t === null ? new Map() : at.pick(t ? 1 : 2); } },
  /* matrices put into the entries of one: part k is the whole of entry at[k]. Every part is one size and holds the
     same inner data; between them they cover a rectangle of entries, one part to an entry. The inner axes of the
     result are the parts' two drawn sides, then the parts' own. */
  stack: { inputs: [1, Infinity], deep: true, space: (n, ins) => allOf(ins), id: n => `stack(${n.inputs.map((i, k) => `${i}@${n.at[k].col},${n.at[k].row}`).join(';')})`,
    fields: n => okPlaces(n) && n.at.every(a => a.col >= 0 && a.row >= 0 && Object.keys(a).length === 2) ? [] : ['at is not one { col, row } for each part, from 0'],
    type(n, ins){ const ts = ins.map(i => i.type), cols = Math.max(...n.at.map(a => a.col)) + 1, rows = Math.max(...n.at.map(a => a.row)) + 1;
      if (ts.length !== cols * rows || new Set(n.at.map(a => a.col + ',' + a.row)).size !== ts.length) return 'its parts do not cover its entries, one part to an entry';
      const inner = agreed(ts.map(t => ({ inner: axes(t) }))); if (!inner) return 'its parts are not one size, holding the same inner data';
      return inner.length > AXES ? `it would have ${inner.length} inner axes: there are at most ${AXES}` : T(cols, rows, null, null, inner); },
    value(n, at){ const out = new Map();
      n.inputs.forEach((_, k) => { const pre = (n.at[k].col + 1) + ',' + (n.at[k].row + 1) + ','; for (const [key, v] of at.get(k)) out.set(pre + key, v); });
      return out; } },
  /* one entry of a matrix whose entries hold inner data, taken out: its drawn sides are the input's first two inner
     axes (one inner axis: that many columns in a single row), and the rest stay inner */
  entry: { inputs: [1, 1], deep: true, id: n => plain(n, `;${n.at.col},${n.at.row}`), space: (n, [a]) => valueOf(a),
    fields: n => !!n.at && typeof n.at === 'object' && Number.isInteger(n.at.col) && Number.isInteger(n.at.row) && n.at.col >= 0 && n.at.row >= 0 && Object.keys(n.at).length === 2 ? [] : ['at is not { col, row }, from 0'],
    type(n, [a]){ const inner = innerOf(a.type); if (!inner.length) return 'its input holds no inner data: an entry of it is one number';
      if (n.at.col >= a.type.cols || n.at.row >= a.type.rows) return 'its input has no such entry';
      return T(inner[0].length, inner[1] ? inner[1].length : 1, inner[0].name, inner[1] ? inner[1].name : null, inner.slice(2)); },
    value(n, at){ const out = new Map(), pre = (n.at.col + 1) + ',' + (n.at.row + 1) + ',', short = innerOf(at.type(0)).length === 1;
      for (const [key, v] of at.get(0)) if (key.startsWith(pre)) out.set(key.slice(pre.length) + (short ? ',1' : ''), v);
      return out; } },
};

/* the functions a node belongs to: those whose input its value follows. A function's input belongs to that function;
   what a function is applied to does not belong to it, and its body's other functions are passed on. */
function scopes(n, ins, fn){
  if (n.op === 'param') return (n.within || []).filter(w => w.startsWith('f:')).slice(-1);
  const out = new Set(ins.flatMap(i => (i.within || []).filter(w => w.startsWith('f:'))));
  if ((n.op === 'apply' || n.op === 'mapalong') && n.fn !== undefined){ const f = fn(n.fn); for (const w of (f && f.within) || []) if (w.startsWith('f:') && w !== n.fn) out.add(w); }
  return [...out];
}
/* The tiles a node belongs to. A node follows its cell where a formula of its own reads the index or what it is made
   of does; such a node belongs to every tile from whose pattern it is reached: from a block of the tile, from a
   piece of such blocks, from the output of an arrow in the tile, or from a part of the tile's matrix. So a tile in a
   tile's pattern, and all that follows its cell there, belongs to the outer tile as well. nodeOf(id), spaces as the
   graph has them, blocks likewise -> a Map from node id to the Set of its tiles ("t:<id>"). build and validate both
   ask this, so the marks are checked exactly. */
function tilesOf(nodeOf, spaces, blocks){
  const follows = new Map(), cellular = id => { if (!follows.has(id)){ follows.set(id, false); const n = nodeOf(id); follows.set(id, !!n && (readsIndex(n) || n.inputs.some(cellular))); } return follows.get(id); };
  const out = new Map();
  for (const s of Object.values(spaces)) for (const t of (s && Array.isArray(s.tiles) ? s.tiles : [])){ if (!t || typeof t.tile !== 'string') continue;
    const inside = new Set(Array.isArray(t.blocks) ? t.blocks : []), arrows = new Set(Array.isArray(t.arrows) ? t.arrows : []), roots = [];
    for (const b of inside) if (own(blocks, b)) roots.push(blocks[b]);
    for (const p of Array.isArray(s.pieces) ? s.pieces : []) if (p && p.node && Array.isArray(p.blocks) && p.blocks.every(b => inside.has(b))) roots.push(p.node);
    for (const a of Array.isArray(s.arrows) ? s.arrows : []) if (a && a.node && arrows.has(a.arrow)) roots.push(a.node);
    const whole = t.node && nodeOf(t.node); if (whole) roots.push(...whole.inputs);
    const seen = new Set(), walk = id => { if (seen.has(id) || typeof id !== 'string') return; seen.add(id); const n = nodeOf(id); if (!n) return;
      if (cellular(id)){ if (!out.has(id)) out.set(id, new Set()); out.get(id).add(t.tile); } n.inputs.forEach(walk); };
    roots.forEach(walk); }
  return out;
}

/* ---- hashing long ids ---- */
function hash(text){
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < text.length; i++){ const ch = text.charCodeAt(i); a = Math.imul(a ^ ch, 0x01000193); b = Math.imul(b + ch, 0x85ebca6b) ^ (b >>> 13); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/* ---- reading a snapshot ---- */
const text = v => typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v);
const isOff = d => /^\s*\/\//.test(text(d.name));
const bare = name => text(name).replace(/^\s*\/\/\s*/, '');
const isNamed = d => !/^Shape \d+$/.test(bare(d.name));
const len = v => Math.max(1, Math.round(Number(v)) || 1);
const at0 = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const sideName = v => typeof v === 'string' && v ? v : null;      /* a side's name, or none */
/* a shape's inner axes as a snapshot gives them, [{ length, name }]: what is no such list is none, and no more than AXES are read */
const innerRead = v => (Array.isArray(v) ? v : []).filter(a => a && typeof a === 'object').slice(0, AXES).map(a => ({ length: len(a.length), name: sideName(a.name) }));
const hollowSeat = d => !!d.seat && typeof d.seat === 'object';
class Unbound extends Error { constructor(why){ super(why); this.why = why; } }      /* a reference in a formula that stands for nothing: the formula is that error */
const DROPPED = { dropped: true };              /* a formula that names a node, where none may be named */
const UNKNOWN = { unknown: true };              /* a reference to what has no value yet: so has the formula */

export function build(snapshot){
  const nodes = new Map(), scope = new Map(), functions = {}, hashed = new Map(), takes = new Map();
  const blocks = new Map(), variables = new Map(), spaces = [], rank = new Map(), groupsById = new Map();

  /* ---- first pass: every block, the variable it is a use of, and every space, in one fixed walk ---- */
  function space(sp, path, owner, parent){
    const ctx = { sp, path, owner, parent, depth: parent ? parent.depth + 1 : 0, recs: [], groupOf: new Map(), groups: new Map(), read: null, tile: new Map() };
    spaces.push(ctx);
    const frames = (list, up, at) => (Array.isArray(list) ? list : []).forEach((g, i) => { if (!g || typeof g !== 'object' || (up && up.deep >= DEEP)) return;
      const node = { id: typeof g.id === 'string' && g.id ? g.id : `p:${path}g${at}${i}`, name: text(g.name).trim(), up, repeat: tiles.kept(g.repeat), deep: up ? up.deep + 1 : 0, ctx };
      ctx.groups.set(node.id, node); if (!groupsById.has(node.id)) groupsById.set(node.id, node);
      for (const m of Array.isArray(g.members) ? g.members : []) if (!ctx.groupOf.has(m)) ctx.groupOf.set(m, node);
      frames(g.groups, node, at + i + '.'); });
    frames(sp.groups, null, '');
    (Array.isArray(sp.shapes) ? sp.shapes : []).forEach((d, i) => { if (d && typeof d === 'object') ctx.recs.push(shape(d, path + i, ctx, i, 0)); });
    (Array.isArray(sp.operations) ? sp.operations : []).forEach((o, k) => (Array.isArray(o?.sources) ? o.sources : []).forEach((d, i) => { if (d && typeof d === 'object') shape(d, `${path}o${k}.${i}`, ctx, -1, 0); }));
    return ctx;
  }
  function shape(d, path, ctx, at, fused){
    const rec = { d, id: typeof d.id === 'string' && d.id ? d.id : 'p:' + path, ctx, at, arrow: d.arrow && typeof d.arrow === 'object' ? d.arrow : null, members: [], x: at0(d.x), y: at0(d.y), cols: len(d.cols), rows: len(d.rows), inner: d.arrow && typeof d.arrow === 'object' ? [] : innerRead(d.inner) };
    let key = (rec.arrow ? 'a' : 'b') + (d.variable !== null && d.variable !== undefined ? 'n' + d.variable : 'i' + rec.id);
    /* two blocks of one id that are not one variable (no page saves such a thing; a file may hold it): the later is called by its place, as a block with no id is, so that an id names one thing */
    if (blocks.has(rec.id) && blocks.get(rec.id).v.key !== key){ rec.id = 'p:' + path; if (key.endsWith('i' + d.id)) key = key[0] + 'i' + rec.id; }
    if (!blocks.has(rec.id)) blocks.set(rec.id, rec);
    if (!variables.has(key)) variables.set(key, { key, uses: [], inside: null, state: null, looped: false, deep: false });
    const v = rec.v = variables.get(key); v.uses.push(rec);
    if (fused < DEEP) (Array.isArray(d.joined) ? d.joined : []).forEach((j, k) => { if (j && j.shape && typeof j.shape === 'object') rec.members.push({ j, rec: shape(j.shape, `${path}.j${k}`, ctx, -1, fused + 1) }); });
    if (d.inside && typeof d.inside === 'object' && !v.inside){      /* each use carries a copy of the definition: the first one met is read */
      if (ctx.depth >= DEEP) v.deep = true;        /* past DEEP it is not read at all: nothing here goes down without end */
      else v.inside = space(d.inside, path + '.', rec, ctx); }
    return rec;
  }
  space(snapshot && typeof snapshot === 'object' && snapshot.top && typeof snapshot.top === 'object' ? snapshot.top : {}, '', null, null);
  for (const v of variables.values()){
    v.src = v.uses.find(r => !r.d.reference) || v.uses[0];
    const d = v.src.d, over = !!d.transposed && !v.src.members.length;      /* the variable's own way round */
    v.type = over ? T(v.src.rows, v.src.cols, sideName(d.rowsName), sideName(d.colsName), v.src.inner) : T(v.src.cols, v.src.rows, sideName(d.colsName), sideName(d.rowsName), v.src.inner);
    v.nid = 'v:' + v.src.id;
    v.given = v.uses.find(r => r.d.in && r.ctx.owner && r.ctx.owner.arrow) || null;                       /* a function's input block: a param, not a variable */
    v.from = (d.from && typeof d.from === 'object' ? v.src : v.uses.find(r => r.d.from && typeof r.d.from === 'object')) || null;
    v.seat = (d.seat ? v.src : v.uses.find(r => r.d.seat)) || null;
    v.scalar = one(v.type) && !v.src.members.length;
  }
  const chain = rec => { const out = []; for (let g = rec.ctx.groupOf.get(rec.at); g; g = g.up) out.push(g); return out; };
  const inConfig = rec => chain(rec).some(g => g.name === CONFIG);
  const tileOf = rec => chain(rec).find(g => g.repeat) || null;      /* the innermost tile it is in */
  const tileUp = grp => { for (let g = grp.up; g; g = g.up) if (g.repeat) return g; return null; };      /* the tile a tile is in */
  const upTiles = grp => { const out = []; for (let g = tileUp(grp); g; g = tileUp(g)) out.push(g); return out; };      /* every tile a tile is in, innermost first */
  const takesPart = rec => !isOff(rec.d) && !inConfig(rec);
  const arrowsIn = ctx => ctx.recs.filter(r => r.arrow && !isOff(r.d));
  const spaceKey = ctx => !ctx.owner ? 'top' : ctx.owner.arrow ? 'f:' + ctx.owner.v.src.id : ctx.owner.v.nid;
  const entriesOf = v => v.src.d.entries && typeof v.src.d.entries === 'object' ? Object.entries(v.src.d.entries) : [];
  const attributesOf = v => (Array.isArray(v.src.d.attributes) ? v.src.d.attributes : []).filter(a => a && typeof a === 'object');
  const capsulesOf = t => typeof t === 'string' ? refs(t) : [];

  /* ---- what may depend on what, from the snapshot alone ----
     Whether a side length or an attribute may be named as a node of its own, or must be written into the formula
     that reads it, cannot turn on which of two shapes happens to be built first. So it is settled before anything
     is built: a thing (a variable, or an arrow) may depend on whatever its entries and attributes name, what is in
     its definition space, what it is a measure or a part of, what it is seated on or fused from; an arrow on what it
     reads and what its function holds. This is more than the graph will say (a width is no dependency), and that is
     all it needs to be: where the thing named may depend on the reader, the reader takes the length as a number. */
  const thing = rec => rec.arrow ? 'A' + rec.id : rec.v.key, arrowOf = new Map([...blocks.values()].filter(r => r.arrow).map(r => ['A' + r.id, r]));
  const near = new Map();
  function nearOf(key){
    if (near.has(key)) return near.get(key);
    const out = new Set(), add = rec => { if (rec) out.add(thing(rec)); }, named = t => { for (const c of capsulesOf(t)) add(blocks.get(c.id)); };
    near.set(key, out);
    const a = arrowOf.get(key);
    if (a){ const inp = a.arrow.input && typeof a.arrow.input === 'object' ? a.arrow.input : {}, at = a.ctx.recs.find(r => r.id === inp.id);
      if (inp.as === 'block' || (at && at.arrow)) add(at); else for (const r of a.ctx.recs) if (!r.arrow) add(r);      /* a result, or a tile: whatever is on that canvas */
      const home = homeOf(a); named(a.arrow.formula); if (home){ named(home.arrow.formula); add(home); }
      for (const r of ((home || a).v.inside || { recs: [] }).recs) add(r);
      return out; }
    const v = variables.get(key); if (!v) return out;
    for (const [, e] of entriesOf(v)) if (e && typeof e === 'object') named(e.expr);
    for (const at of attributesOf(v)) named(at.value);
    for (const r of (v.inside || { recs: [] }).recs) add(r);
    if (v.from) add(blocks.get(v.from.d.from.id));
    if (v.seat){ const s = v.seat.d.seat; if (typeof s === 'string') add(v.seat.ctx.recs.find(r => r.id === s)); else for (const id of Array.isArray(s.hollow) ? s.hollow : []) add(blocks.get(id)); }
    for (const m of v.src.members) add(m.rec);
    return out;
  }
  const far = new Map();
  function mayFollow(key, reader){      /* whether the thing called key may depend on the thing called reader */
    if (key === reader) return true;
    if (!far.has(key)){ const seen = new Set(), todo = [key]; while (todo.length) for (const k of nearOf(todo.pop())) if (!seen.has(k)){ seen.add(k); todo.push(k); } far.set(key, seen); }
    return far.get(key).has(reader);
  }

  /* ---- nodes ---- */
  const g = { node: id => nodes.get(id), fn: id => own(functions, id) ? { ...functions[id], within: [...(scope.get(functions[id].body) || [])] } : undefined };
  const short = (op, written) => { if (written.length <= 96) return written;
    let id = op + '#' + hash(written); while (hashed.has(id) && hashed.get(id) !== written) id += '~'; hashed.set(id, written); return id; };
  const scoped = (id, n) => scope.set(id, new Set(scopes(n, n.inputs.map(i => ({ within: [...scope.get(i)] })), g.fn)));
  /* a node of this op over these inputs, made once: its id, or null where the rule gives it no type */
  function N(op, inputs, fields = {}, type = null){
    const ins = inputs.map(i => nodes.get(i)); if (inputs.some(i => typeof i !== 'string') || ins.some(i => !i)) return null;
    const n = { op, inputs, type, ...fields }; if (OPS[op].fields(n).length) return null;
    const t = OPS[op].type(n, ins, g); if (typeof t === 'string') return null;
    n.type = t;
    const id = short(op, OPS[op].id(n)); if (nodes.has(id)) return id;
    nodes.set(id, n); scoped(id, n); return id;
  }
  const typeOf = id => nodes.get(id).type;
  const paramOf = ctx => { const key = spaceKey(ctx), id = `param(${key})`, rec = ctx.recs.find(r => r.d.in);
    if (!nodes.has(id)){ nodes.set(id, { op: 'param', inputs: [], type: rec ? T(rec.cols, rec.rows, sideName(rec.d.colsName), sideName(rec.d.rowsName), rec.inner) : T(1, 1) }); scope.set(id, new Set([key])); rank.set(key, ctx.depth);
      if (rec && S.parse(rec.d.holds)) takes.set(id, rec.d.holds); }      /* what the function's input block promises to take */
    return id; };
  /* what a variable's value is read from: its node, or the param it is where it is a function's input */
  const base = v => v.given ? paramOf(v.given.ctx) : varNode(v);
  /* a use stands for its variable; for its transpose where it is a transposed use; and, where it is a turned use (a
     reference with axes, an order of all its variable's axes that moves an inner one), for that turn of it. An order
     that is none of the variable's is no turn: the use is then the variable as it stands. */
  const blockNode = rec => { const id = base(rec.v), flat = rec.d.transposed && !rec.members.length ? N('transpose', [id]) : id, order = rec.d.axes;
    if (!flat || !rec.d.reference || rec.members.length || !Array.isArray(order)) return flat;
    return N('transpose', [flat], { order: [...order] }) || flat; };

  const stack = [];
  function varNode(v){
    if (v.state === 'done') return v.nid;
    if (v.state === 'building'){ for (let i = stack.indexOf(v); i >= 0 && i < stack.length; i++) stack[i].looped = true; return v.nid; }      /* reached again while it is being built: every variable round the loop depends on itself */
    v.state = 'building'; stack.push(v);
    /* while it is being built it is in the graph as its size and nothing more, which is all it will be if it is met again: what is made of it meanwhile stays true */
    nodes.set(v.nid, { op: 'variable', inputs: [], type: v.type, name: '', named: false, defined: 'entries', entries: {} }); scope.set(v.nid, new Set());
    /* with an error it keeps what was typed into it: its entries, and their formulas with what they name. Round a
       loop, a formula that names anything is left out, since what it names is the loop, or cannot be told from it */
    let made; try { made = define(v); if (made.error && !v.looped) made = { error: made.error, ...typed(v, false) }; } finally { stack.pop(); }
    if (v.looped) made = { error: E('loop'), ...typed(v, true) };
    const d = v.src.d, n = { op: 'variable', inputs: made.inputs, type: v.type, name: text(d.name), named: isNamed(d), defined: made.error ? 'entries' : made.defined, entries: made.error || made.defined === 'entries' ? made.entries : literals(v) };
    if (made.error) n.error = made.error;
    if (S.parse(d.holds)) n.holds = d.holds;      /* what it promises to hold: the variable's, said on the block it was made as */
    nodes.set(v.nid, n); scoped(v.nid, n);
    v.state = 'done'; return v.nid;
  }
  const inside = (v, key) => okEntryKey(key, v.type);      /* an entry of it, in its one spelling: a column, a row and an inner position, each within its length */
  /* a variable's own entries that are plain values: what it keeps where something else defines it */
  function literals(v){ const out = {}; for (const [key, e] of entriesOf(v)) if (inside(v, key)){ const l = literal(e); if (l !== undefined) out[key] = l; } return out; }
  /* a variable's own entries as the graph holds them: values, and formulas with what they name as inputs. A formula
     that stands for an error (it does not read, or names what is not there) is that error; one that names what has
     no value yet is left out, as an entry never given is. alone: only what names nothing. */
  function typed(v, alone){
    const raw = v.src.d.entries, was = raw && typeof raw === 'object' ? plains.get(raw) : null;
    if (was && was.size === sizeOf(v.type)) return { inputs: [], entries: was.entries };      /* the very entries of the last build, where they hold no formula */
    const inputs = [], entries = {}; let plain = true;
    for (const [key, e] of entriesOf(v)){ if (!inside(v, key)) continue;      /* a block made smaller can still hold entries beyond its size */
      if (e && typeof e === 'object' && typeof e.expr === 'string'){ plain = false; const before = inputs.length, r = rewrite(e.expr, { self: v, reader: v.key, inputs, first: 0, mode: 'entry', alone });
        if (r.dropped){ inputs.length = before; continue; }
        if (r.err !== undefined) entries[key] = { err: r.err }; else if (!r.unknown) entries[key] = { expr: r.text }; }
      else { const l = literal(e); if (l !== undefined) entries[key] = l; } }
    if (plain && raw && typeof raw === 'object') plains.set(raw, { size: sizeOf(v.type), entries: Object.freeze(entries) });
    return { inputs, entries };
  }
  const under = (id, v, defined, strict = false) => { if (!id) return { error: E('no-source') };
    const t = typeOf(id); if (!same(t, v.type)) return { error: E('size', sizes(t, v.type)) };
    if (strict){ for (const k of ['colsName', 'rowsName']) if (t[k] && v.type[k] && t[k] !== v.type[k]) return { error: E('size', `${t[k]} ≠ ${v.type[k]}`) };
      const ag = nested(innerOf(t), innerOf(v.type), true); if (!ag.ok) return { error: E('size', ag.note) }; }
    return { defined, inputs: [id] }; };

  /* where a variable's value comes from: the first of these that applies */
  function define(v){
    const d = v.src.d;
    if (v.deep) return { error: E('no-source', `its definition lies more than ${DEEP} definitions deep, and is not read`) };
    if (v.from){ const f = v.from.d.from, target = blocks.get(f.id);
      if (f.index === 'x' || f.index === 'y')      /* the index of a block in a tile, as a matrix: by rule, at any size, each entry its own place in the cell it is worked out for */
        return under(N('map', [N('source', [], { kind: 'zeros' }, T(v.type.cols, v.type.rows))], { formula: 'index.' + f.index }), v, 'source');
      if (!target || target.arrow) return { error: E('no-source') };
      if (f.range && typeof f.range === 'object'){      /* a part of the shape as it stands, a transpose included */
        const of = blockNode(target), t = of && typeOf(of), r = f.range, ok = t && Number.isInteger(r.col) && Number.isInteger(r.row) && r.col >= 0 && r.row >= 0 && r.toEnd && typeof r.toEnd === 'object';
        const now = ok ? rangeIn(r, t.cols, t.rows) : null; if (!now) return { error: E('no-source', t ? `columns ${r.col + 1} to ${r.col + (r.cols || 1)}, rows ${r.row + 1} to ${r.row + (r.rows || 1)} of ${t.cols} × ${t.rows}` : '') };
        return under(now.cols === t.cols && now.rows === t.rows ? of : N('slice', [of], { range: now }), v, 'range'); }
      if (f.entry && typeof f.entry === 'object'){      /* one entry of the shape as it stands, taken out: the file counts its column and row from 1 */
        const of = blockNode(target), t = of && typeOf(of), col = f.entry.col, row = f.entry.row;
        if (!t || !innerOf(t).length) return { error: E('no-source', t ? 'it holds no inner data: an entry of it is one number' : '') };
        if (!whole1(col) || !whole1(row) || col > t.cols || row > t.rows) return { error: E('no-source', `entry ${col},${row} of ${t.cols} × ${t.rows}`) };
        return under(N('entry', [of], { at: { col: col - 1, row: row - 1 } }), v, 'entry'); }
      const side = f.side === 'm' || f.side === 'y' ? f.side : 'x', of = target.v;
      if (side === 'm' && !of.scalar) return { error: E('no-source', 'not a single entry: it has no mass') };
      /* a length that is settled, of a shape that may itself depend on this one: the number, and no node between them */
      if (side !== 'm' && !of.scalar && (mayFollow(of.key, v.key) || of.state === 'building')) return { defined: 'entries', inputs: [], entries: { '1,1': side === 'x' ? of.type.cols : of.type.rows } };
      return under(N('measure', [base(of)], { side }), v, 'measure'); }
    if (v.seat){ const s = v.seat.d.seat, ctx = v.seat.ctx;
      if (typeof s === 'string'){ const a = ctx.recs.find(r => r.id === s && r.arrow && !isOff(r.d)); if (!a) return { error: E('seat', 'no-source') };
        const o = arrowOut(a); return o.error ? { error: E('seat', o.error.code) } : under(o.node, v, 'seat'); }      /* (of another size than the output: its own error, size) */
      const pair = Array.isArray(s.hollow) ? s.hollow : [], R = read(ctx), k = R.ps.findIndex(p => p.members.length === 2 && p.members.every(m => pair.includes(R.active[m].id)));      /* in a pair's hollow: the pair's result */
      if (k < 0) return { error: E('no-source') };
      const p = pieceNode(ctx, k); return p.error ? { error: E('no-source', p.error.code) } : under(p.node, v, 'seat'); }
    if (v.src.members.length){      /* fused from others: a member's place is kept as fractions of the whole */
      const parts = v.src.members.map(m => blockNode(m.rec)), at = v.src.members.map(m => ({ col: Math.round(Number(m.j.fx) * v.type.cols) || 0, row: Math.round(Number(m.j.fy) * v.type.rows) || 0 }));
      if (parts.some(p => !p) || !covers(parts.map(typeOf), at, v.type.cols, v.type.rows)) return { error: E('size', 'the shapes it was fused from do not cover it') };
      if (!agreed(parts.map(typeOf))) return { error: E('size', 'the shapes it was fused from do not hold the same inner data') };
      return under(N('block', parts, { at }), v, 'joined'); }
    const src = sourceKept(d.source), size = T(v.type.cols, v.type.rows, null, null, unnamed(v.type));
    if (src && sourceKind(src) === 'file' && innerOf(v.type).length) return { error: E('no-source', 'a data file holds no inner data') };
    if (src && src.noise) return under(N('noise', [], { seed: src.noise.seed, dist: src.noise.dist, key: v.src.id }, size), v, 'source');      /* keyed by the block the variable was made as, so every use of it shows the same numbers */
    if (src && sourceKind(src) === 'file') return src.file ? under(N('source', [], { kind: 'file', path: src.file }, size), v, 'source') : { error: E('no-source', 'no file has been chosen for it') };
    if (src) return under(N('source', [], { kind: src }, size), v, 'source');
    const stood = v.inside && standingIn(v);
    if (stood && stood.reduce((sum, t) => sum + t.w * t.h, 0) === v.type.cols * v.type.rows){
      const parts = stood.map(t => blockNode(t.rec)), at = stood.map(t => ({ col: t.x, row: t.y }));
      if (cellOf(v)){ if (parts.every(Boolean)){ const made = N('stack', parts, { at }); return made ? under(made, v, 'standing', true) : { error: E('size', 'the shapes standing in its entries are not all what an entry holds') }; } }      /* matrices in its entries: one to each */
      else if (parts.every(Boolean) && covers(parts.map(typeOf), at, v.type.cols, v.type.rows)) return under(N('block', parts, { at }), v, 'standing'); }
    if (v.inside && !stood){ const came = comesTo(v.inside);
      if (came.error) return { error: came.error };
      if (came.node) return under(came.node, v, 'definition', true); }
    return { defined: 'entries', ...typed(v, false) };
  }
  /* the shapes standing in a variable's matrix: [{ rec, x, y, w, h }] in entries, or null where its definition space is not just such shapes */
  /* In a variable whose entries hold inner data (two axes or more) a standing shape stands for one entry and is that
     entry's size: its matrix's place is laid out entry for entry, each as large as the matrix it holds, and x, y, w
     and h here are still in entries (w and h are 1). */
  const cellOf = v => { const inner = innerOf(v.type); return inner.length >= 2 ? { cols: inner[0].length, rows: inner[1].length } : null; };
  function standingIn(v){
    if (v.stood !== undefined) return v.stood;
    const cell = cellOf(v), sx = cell ? cell.cols : 1, sy = cell ? cell.rows : 1;
    const act = v.inside.recs.filter(takesPart), slot = { x: -1 - v.type.cols * sx, y: Math.round(-v.type.rows * sy / 2) }, out = [];
    let ok = act.length > 0;
    for (const rec of act){ const x = (rec.x - slot.x) / sx, y = (rec.y - slot.y) / sy, w = cell ? 1 : rec.cols, h = cell ? 1 : rec.rows;
      if (cell && (rec.cols !== cell.cols || rec.rows !== cell.rows)){ ok = false; break; }      /* not the size of an entry: it does not stand in one */
      if (!rec.d.standing || rec.arrow || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + w > v.type.cols || y + h > v.type.rows || out.some(o => x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h)){ ok = false; break; }
      out.push({ rec, x, y, w, h }); }
    return v.stood = ok ? out : null;
  }

  /* ---- a space: its pieces and its arrows ---- */
  function read(ctx){
    if (ctx.read) return ctx.read;
    const owner = ctx.owner && !ctx.owner.arrow ? ctx.owner.v : null, stood = !!owner && owner.inside === ctx && !!standingIn(owner);      /* shapes standing in the matrix are entries, not pieces */
    const active = stood ? [] : ctx.recs.filter(r => !r.arrow && takesPart(r) && !hollowSeat(r.d));
    const rects = active.map(r => ({ x: r.x, y: r.y, w: r.cols, h: r.rows, wName: sideName(r.d.colsName), hName: sideName(r.d.rowsName), inner: r.inner, zone: zoneOf(chain(r).filter(g => g.repeat).map(g => g.id)) }));
    const ts = touches(rects), ps = pieces(rects);
    return ctx.read = { active, rects, ts, ps, out: ps.map(() => null), stood };
  }
  /* why a piece that algebra.js calls undefined is: a touch that does not agree, a step of a line that does not, or no single line */
  function whyNot(R, p){
    const mine = R.ts.filter(t => p.members.includes(t.a)), bad = mine.find(t => !t.ok); if (bad) return E('mismatch', bad.note);
    const line = mine.length === p.members.length - 1 && p.members.slice(1).every((m, i) => mine.some(t => t.a === p.members[i] && t.b === m)); if (!line) return E('not-a-row');
    /* every touch agrees and the line as a whole does not (A · s · B, with a single entry between): the step that fails, asked of algebra.js */
    const solid = p.rule === 'product' ? p.members.filter(m => !one(T(R.rects[m].w, R.rects[m].h, null, null, R.rects[m].inner))) : p.members; let acc = solid.length ? { ...R.rects[solid[0]], x: 0, y: 0, zone: null } : null;
    for (const m of solid.slice(1)){ const b = R.rects[m], kind = p.rule === 'product' ? 'product' : p.rule === 'sum' ? 'sum' : mine.find(t => t.b === m)?.kind;
      const next = { ...b, zone: null, x: kind === 'sum' ? 0 : acc.w, y: kind === 'sum' ? acc.h : kind === 'over' ? acc.h : kind === 'times' ? -b.h : 0 }, t = touches([acc, next])[0], after = lone([acc, next]);
      if (!t || !t.ok || !after) return E('mismatch', t ? t.note : ''); acc = { ...rectOf(after, 0, 0), zone: null }; }
    return E('mismatch');
  }
  function pieceNode(ctx, k){
    const R = read(ctx); if (R.out[k] && R.out[k] !== 'building') return R.out[k];
    const p = R.ps[k], ids = p.members.map(m => R.active[m].id);
    if (R.out[k] === 'building'){ for (let i = R.started.get(k); i < stack.length; i++) stack[i].looped = true; return { blocks: ids, rule: p.rule, node: null, error: E('loop') }; }      /* it is read by what it is made of */
    R.out[k] = 'building'; (R.started ||= new Map()).set(k, stack.length);
    const done = (node, error = null) => R.out[k] = { blocks: ids, rule: p.rule, node: node || null, error: node ? null : error || E('mismatch') };
    if (p.type.error) return done(null, p.type.error === 'mixed rules' ? E('mixed') : whyNot(R, p));
    const of = p.members.map(m => blockNode(R.active[m])); if (of.some(n => !n)) return done(null);
    if (of.length === 1) return done(of[0]);
    if (p.rule === 'sum') return done(N('add', of));
    if (p.rule === 'elementwise'){ let acc = of[0];      /* read left to right, grouped from the left */
      for (let i = 1; acc && i < of.length; i++){ const over = R.ts.some(t => t.kind === 'over' && t.a === p.members[i - 1] && t.b === p.members[i]);
        acc = N('ewise', [acc, of[i]], { fn: over ? 'div' : 'mul', broadcast: broadcastOf(typeOf(acc), typeOf(of[i])) }); }
      return done(acc); }
    /* a row of products: the matrices folded from the left, and one scale for each single entry, the leftmost outermost */
    const scalars = of.map((n, i) => one(T(R.rects[p.members[i]].w, R.rects[p.members[i]].h, null, null, R.rects[p.members[i]].inner)) ? i : -1).filter(i => i >= 0), rest = of.filter((_, i) => !scalars.includes(i));
    const left = scalars.map(i => of[i]); let acc = rest.length ? rest[0] : left.pop();
    for (const n of rest.slice(1)){ const next = N('matmul', [acc, n]);
      if (!next) return done(null, E('mismatch', `${typeOf(acc).cols} ≠ ${typeOf(n).rows}`)); acc = next; }      /* sides of one name and two lengths: the name lets the touch pass, and the lengths do not multiply */
    for (const s of left.reverse()) acc = acc && N('scale', [s, acc]);
    return done(acc);
  }
  /* what a space comes to: its ends, the pieces and outputs nothing reads from (arrows.js). Told from the shapes alone:
     { none } for nothing, or for a function's input alone; { error } for several; { piece: k } | { arrow: rec } for the one */
  function endOf(ctx, input = null, side = null){      /* side: one frame of a conditional arrow's space; what it comes to is asked of what lies wholly in it */
    const R = read(ctx), inSide = r => !side || chain(r).includes(side), list = arrowsIn(ctx).filter(inSide);
    const es = endsOf(R.ps.map((p, k) => ({ ids: [...p.members.map(m => R.active[m].id), ...new Set(p.members.map(m => R.rects[m].zone).filter(z => z !== null))], type: p.type, k })).filter(p => R.ps[p.k].members.every(m => inSide(R.active[m]))),
      list.map(a => ({ id: a.id, reads: a.arrow.input && a.arrow.input.id, seated: ctx.recs.some(r => r.d.seat === a.id), type: {}, rec: a })),
      ctx.recs.filter(r => !r.arrow && takesPart(r) && r.d.from && typeof r.d.from === 'object' && r.d.from.entry).map(r => r.d.from.id));      /* a block an entry is taken out of is read from, as an arrow's input is: its piece is no end */
    if (!es.length || (input && es.length === 1 && es[0].piece && es[0].piece.ids.length === 1 && es[0].piece.ids[0] === input.id)) return { none: true };
    if (es.length > 1) return { error: E('pieces', es.length + ' pieces') };
    return es[0].piece ? { piece: es[0].piece.k } : { arrow: es[0].arrow.rec };
  }
  function comesTo(ctx, input = null, side = null){
    const end = endOf(ctx, input, side); if (end.none) return {}; if (end.error) return { error: end.error };
    const made = end.piece !== undefined ? pieceNode(ctx, end.piece) : arrowOut(end.arrow);
    return made.node ? { node: made.node } : { error: made.error };
  }
  /* An arrow's function, where it is defined in a space: { loop } where it applies itself, { error }, or
     { fn, param, body, pass }. A space that holds its input alone is the function that gives its input back (pass:
     an arrow of it is its covered part and no more). A function's input is in the graph only with its function:
     where the space comes to no one matrix there is neither, and what is made of the input there has no node. */
  function fnRead(av){
    if (av.fnState === 'done') return av.fn;
    if (av.fnState === 'building') return { loop: true };
    av.fnState = 'building';
    const ctx = av.inside, input = ctx && ctx.recs.find(r => r.d.in), end = ctx && input ? endOf(ctx, input) : { none: true };
    const sides = ctx && input ? conditionOf(av.src.arrow) : null;
    if (!ctx || !input) av.fn = { pass: true };
    else if (sides) av.fn = chosen(ctx, sides);
    else if (end.error) av.fn = { error: end.error };
    else { const fid = spaceKey(ctx), param = paramOf(ctx), came = end.none ? { node: param } : comesTo(ctx, input);
      if (came.node){ av.fn = { fn: fid, param, body: came.node, pass: !!end.none }; functions[fid] = { input: param, body: came.node }; rank.set(fid, ctx.depth); }
      else av.fn = { error: came.error || E('mismatch') }; }
    av.fnState = 'done'; return av.fn;
  }
  /* A conditional arrow (its arrow carries choose: { then, else }, two frames of its definition space): its function
     is choose(its input, what the then frame comes to, what the else frame comes to). A frame holds one piece or
     nothing: an empty one is None at the other's size (both empty: at the size the arrow promises, else one by
     one); several pieces in one are the error pieces. What lies in neither frame takes no part. A frame that is
     gone leaves the arrow no-source; two sides of two sizes are the error size. */
  const conditionOf = A => A && A.choose && typeof A.choose === 'object' && typeof A.choose.then === 'string' && typeof A.choose.else === 'string' ? A.choose : null;
  function chosen(ctx, sides){
    const frames = [ctx.groups.get(sides.then), ctx.groups.get(sides.else)]; if (frames.some(f => !f) || frames[0] === frames[1]) return { error: E('no-source', 'a side of its condition is gone') };
    const fid = spaceKey(ctx), param = paramOf(ctx), came = frames.map(f => comesTo(ctx, null, f)), lost = came.find(c => c.error); if (lost) return { error: lost.error };
    const out = ctx.owner.arrow.output, full = came.find(c => c.node), size = full ? typeOf(full.node) : out && whole1(out.cols) && whole1(out.rows) ? T(out.cols, out.rows) : T(1, 1);
    const [a, b] = came.map(c => c.node || N('source', [], { kind: EMPTY }, T(size.cols, size.rows, null, null, unnamed(size))));
    const body = a && b && N('choose', [param, a, b]);
    if (!body) return { error: a && b ? E('size', sizes(typeOf(a), typeOf(b))) : E('mismatch') };
    functions[fid] = { input: param, body }; rank.set(fid, ctx.depth);
    return { fn: fid, param, body, pass: false };
  }
  const usable = ctx => { const f = fnRead(ctx.owner.v); return !f.error && !f.loop; };
  /* the arrow whose function a use applies (null: the program's own, or none): arrows.js says which shadows which */
  function homeOf(a){
    if (!a.v.src.d.reference) return a.v.src;
    const levels = []; for (let s = a.ctx; s; s = s.parent) levels.push(s.recs.filter(r => r.arrow).map(r => ({ id: r.id, name: bare(r.d.name), reference: !!r.d.reference, off: isOff(r.d), rec: r })));
    const id = functionFor(bare(a.d.name), levels); return id === null ? null : levels.flat().find(r => r.id === id).rec;
  }

  /* ---- tiles ---- */
  const plainScalar = v => v.scalar && !v.given && !v.from && !v.seat && !sourceKept(v.src.d.source) && !v.deep && !(v.inside && v.inside.recs.some(takesPart));
  const entryOf = id => { const rec = blocks.get(id); return rec && !rec.arrow && plainScalar(rec.v) ? (rec.v.src.d.entries || {})['1,1'] : undefined; };
  function settledMass(v, depth = 0){ const e = entryOf(v.src.id);
    return typeof e === 'number' || (e && Number.isInteger(e.n)) ? e : e && typeof e.expr === 'string' && depth < 16 ? work(e.expr, t => sizeLookup(t, depth + 1)).value ?? null : null; }
  function sizeLookup(token, depth = 0){
    if (typeof token === 'string') return undefined;
    const rec = blocks.get(token.id); if (!rec || rec.arrow) return undefined;
    if (token.measure === 'm') return rec.v.scalar ? settledMass(rec.v, depth) : { err: 'not a scalar: it has no mass' };
    if (/^d[1-6]$/.test(token.measure)){ const a = innerOf(rec.v.type)[+token.measure[1] - 1]; return a ? a.length : { err: 'it has no such inner axis' }; }
    if (token.measure !== 'x' && token.measure !== 'y') return undefined;
    if (!rec.v.scalar) return token.measure === 'x' ? rec.v.type.cols : rec.v.type.rows;
    const m = settledMass(rec.v, depth); if (m === null || isError(m)) return m; const root = rootOf(m); return root === null ? { err: 'it has no root to be a side' } : root;
  }
  /* what the size of a thing follows, by id, for tiles.js (circular): a tile, what its counts read; an arrow, what
     it reads, the arrows of its function and the tile it is repeated in; a seated block, its seat; a measure, a part
     or an index matrix, its source; a use of a variable, the other uses; a function's input, its arrow; a named
     side, the sides of that name on its canvas; a single entry whose number is a formula, what that reads */
  function sizeNext(id){
    const grp = groupsById.get(id); if (grp && grp.repeat) return ['across', 'down'].flatMap(k => grp.repeat[k] && typeof grp.repeat[k] === 'object' ? capsulesOf(grp.repeat[k].expr).map(c => c.id) : []);      /* a tile: what its counts read, and nothing else */
    const rec = blocks.get(id); if (!rec) return [];
    const out = [], ctx = rec.ctx;
    if (rec.arrow){ const inp = rec.arrow.input && typeof rec.arrow.input === 'object' ? rec.arrow.input : {}, at = ctx.recs.find(r => r.id === inp.id), home = homeOf(rec), mine = tileOf(rec);
      if (inp.as === 'tile'){ const t = ctx.groups.get(inp.id); if (t) out.push(t.id, ...ctx.recs.filter(r => chain(r).includes(t)).map(r => r.id)); }
      else if (at && !at.arrow && inp.as === 'result'){ const R = read(ctx), p = R.ps.find(p => p.members.some(m => R.active[m] === at)); out.push(...(p ? p.members.map(m => R.active[m].id) : [at.id])); }
      else if (at) out.push(at.id);
      for (const r of ((home || rec).v.inside || { recs: [] }).recs) if (r.arrow) out.push(r.id);
      if (mine) out.push(mine.id);
      return out; }
    const s = rec.d.seat; if (typeof s === 'string') out.push(s); else if (s && Array.isArray(s.hollow)) out.push(...s.hollow);
    if (rec.d.from && typeof rec.d.from === 'object') out.push(rec.d.from.id);
    for (const u of rec.v.uses) if (u !== rec) out.push(u.id);
    if (rec.d.in && ctx.owner) out.push(ctx.owner.id, ctx.owner.v.src.id);
    for (const k of ['colsName', 'rowsName']){ const name = sideName(rec.d[k]); if (name) for (const r of ctx.recs) if (r !== rec && (r.d.colsName === name || r.d.rowsName === name)) out.push(r.id); }
    const e = (rec.d.entries || {})['1,1']; if (e && typeof e === 'object') out.push(...capsulesOf(e.expr).map(c => c.id));
    return out.filter(k => typeof k === 'string');
  }
  /* a tile's counts, settled from sizes alone, or the error where one cannot be: it reads what is not settled, or its own tile's size */
  function countsOf(grp){
    if (grp.counts) return grp.counts;
    const out = {};
    for (const k of ['across', 'down']){ const stored = grp.repeat[k], formula = stored && typeof stored === 'object' ? stored.expr : null;
      const c = tiles.count(stored, sizeLookup, loopsIn(grp, k));
      if (c.refused) return grp.counts = { error: E('size-unknown', formula !== null ? formula : String(stored)) }; out[k] = c.count; }
    return grp.counts = out;
  }
  /* the tiles of a space as tiles.js takes them: which tile each is in (by the frames), and what its counts come to,
     with 1 standing for a count that cannot be settled, as the page draws it */
  const loopsIn = (grp, k) => { const stored = grp.repeat[k]; return { entryOf, loops: !!stored && typeof stored === 'object' && tiles.circular(grp.id, capsulesOf(stored.expr).map(c => c.id), sizeNext) }; };
  function tilesIn(ctx){
    if (!ctx.tilesList) ctx.tilesList = [...ctx.groups.values()].filter(t => t.repeat).map(t => ({ id: t.id, in: tileUp(t)?.id ?? null, grp: t }));
    return ctx.tilesList;
  }
  function overlapsIn(ctx){
    if (!ctx.overlaps) ctx.overlaps = tiles.overlapping(tilesIn(ctx).map(t => { const c = tiles.counts(t.grp.repeat, sizeLookup, { across: loopsIn(t.grp, 'across'), down: loopsIn(t.grp, 'down') });
      return { id: t.id, in: t.in, name: t.grp.name || null, repeat: t.grp.repeat, across: c.across, down: c.down, formula: c.formula }; }));
    return ctx.overlaps;
  }
  /* a tile's matrix: { node } | { error }. A tile wholly inside its pattern is one part of it: that tile's matrix.
     A tile that overlaps another without lying wholly inside its pattern, or being lain in so, has none (tiles.js: overlapping). */
  function tileNode(ctx, grp){
    if (ctx.tile.has(grp.id)) return ctx.tile.get(grp.id);
    ctx.tile.set(grp.id, { error: E('loop') });
    const done = out => { ctx.tile.set(grp.id, out); return out; }, c = countsOf(grp); if (c.error) return done({ error: c.error });
    const lies = overlapsIn(ctx).get(grp.id); if (lies) return done({ error: E('no-source', lies) });
    const rep = grp.repeat, parts = ctx.recs.filter(r => !r.arrow && !isOff(r.d) && !hollowSeat(r.d) && tileOf(r) === grp).map(r => ({ node: () => blockNode(r), rect: { x: r.x, y: r.y, w: r.cols, h: r.rows, inner: r.inner } }));
    for (const t of ctx.groups.values()) if (t.repeat && tileUp(t) === grp){ const made = tileNode(ctx, t);
      if (made.error) return done({ error: E(made.error.code === 'size-unknown' ? 'size-unknown' : 'no-source', made.error.code === 'size-unknown' ? made.error.note : tiles.lostWithin(made.error.note)) });
      const size = typeOf(made.node); parts.push({ node: () => made.node, rect: { x: t.repeat.x, y: t.repeat.y, w: size.cols, h: size.rows, inner: innerOf(size), tile: true } }); }
    const m = tiles.matrix(rep, c.across, c.down, parts.map(p => p.rect)); if (m.error) return done({ error: E('no-source', m.error) });
    const node = N('repeat', parts.map(p => p.node()), { at: parts.map(p => ({ col: p.rect.x - rep.x, row: p.rect.y - rep.y })), pattern: { cols: rep.cols, rows: rep.rows }, across: c.across, down: c.down });
    return done(node ? { node } : { error: E('no-source', 'its blocks are not the sizes they are drawn') });
  }

  /* ---- an arrow's output: { node, error } ---- */
  const arrowStack = [];
  function arrowOut(a){
    if (a.out && a.out !== 'building') return a.out;
    if (a.out === 'building'){ for (let i = arrowStack.indexOf(a); i >= 0 && i < arrowStack.length; i++) arrowStack[i].loops = true; for (let i = a.started; i < stack.length; i++) stack[i].looped = true; return { node: null, error: E('loop') }; }
    a.out = 'building'; a.started = stack.length; arrowStack.push(a);
    let out; try { out = outputOf(a); } finally { arrowStack.pop(); }
    if (a.loops) out = { error: E('loop') };
    return a.out = { node: out.node || null, error: out.node ? null : out.error || E('mismatch') };
  }
  function outputOf(a){
    const A = a.arrow, ctx = a.ctx, inp = A.input && typeof A.input === 'object' ? A.input : {}, side = SIDES.includes(A.side) ? A.side : 'e', rows = side === 'e' || side === 'w';
    let node = null, outside = null;
    if (inp.as === 'tile'){ const grp = ctx.groups.get(inp.id); if (!grp || !grp.repeat) return { error: E('no-source') };
      const t = tileNode(ctx, grp); if (t.error) return { error: t.error.code === 'size-unknown' ? t.error : E('no-source', t.error.note) }; node = t.node; outside = grp; }
    else { const rec = ctx.recs.find(r => r.id === inp.id);
      if (!rec || isOff(rec.d)) return { error: E('no-source') };
      outside = rec;
      if (rec.arrow){ if (inp.as !== 'result') return { error: E('no-source') }; const o = arrowOut(rec); if (o.error) return { error: E('no-source', o.error.code) }; node = o.node; }
      else if (inp.as !== 'result') node = blockNode(rec);
      else { const R = read(ctx), k = R.ps.findIndex(p => p.members.some(m => R.active[m] === rec)); if (k < 0) return { error: E('no-source') };      /* the result of whichever piece holds that block */
        const p = pieceNode(ctx, k); if (p.error) return { error: E('no-source', p.error.code) }; node = p.node; } }
    if (!node) return { error: E('no-source') };
    const type = typeOf(node), n = rows ? type.rows : type.cols;
    const use = inp.as === 'tile' ? { side, start: 1, span: n } : { side, start: A.start, span: A.span };      /* an arrow on a tile reads all of it */
    const part = coveredType(use, type);
    if (!part) return { error: E('size', `${rows ? 'rows' : 'columns'} ${use.start} to ${use.start + use.span - 1} of ${n}`) };
    /* in a tile, with its input outside it, it is repeated along that input: how often, and whether it can be, is tiles.js's to say */
    const mine = tileOf(a), isMapped = !!mine && (inp.as === 'tile' ? outside !== mine && !upTiles(outside).includes(mine) : !chain(outside).includes(mine)); let count = 1;      /* a tile in this tile's pattern is not outside it */
    const through = [];      /* the tiles its tile is in that repeat it again along its input: { tile, count } */
    if (isMapped){ const c = countsOf(mine); if (c.error) return { error: c.error };
      const above = inp.as === 'tile' ? [] : upTiles(mine).filter(t => !chain(outside).includes(t)), counted = above.map(countsOf), lost = counted.find(k => k.error); if (lost) return { error: lost.error };
      const m = tiles.mapped(use, mine.repeat, c.across, c.down, n, { tile: inp.as === 'tile', outer: above.map((t, i) => ({ repeat: t.repeat, across: counted[i].across, down: counted[i].down })) });
      if (m.warn) return { error: E(/runs past/.test(m.warn) ? 'size' : 'mismatch', m.warn) }; count = m.count;
      m.through.forEach((k, i) => { if (k > 1) through.push({ tile: 't:' + above[i].id, count: k }); }); }
    const more = through.length ? { through } : {}, many = count > 1 || through.length > 0;
    const all = { [rows ? 'row' : 'col']: use.start - 1, [rows ? 'col' : 'row']: 0, [rows ? 'rows' : 'cols']: use.span * count, [rows ? 'cols' : 'rows']: rows ? type.cols : type.rows };
    const cut = r => r.cols === type.cols && r.rows === type.rows ? node : N('slice', [node], { range: { col: r.col, row: r.row, cols: r.cols, rows: r.rows } });
    const x = () => cut(covered(use, type));
    const home = homeOf(a), builtin = !home && a.v.src.d.reference ? FUNCTIONS.find(f => f.name === bare(a.d.name).trim()) : null;
    const formula = text((home ? home.arrow.formula : builtin ? builtin.formula : A.formula) || '').trim();
    const repeated = { axis: rows ? 'rows' : 'cols', start: use.start, span: use.span, count };
    let made;
    if (formula){ const first = many ? node : x(), inputs = [first], f = rewrite(formula, { self: null, reader: 'A' + a.id, inputs, first: 1, mode: 'map', size: part });
      if (f.err !== undefined || f.unknown) return { error: E(f.err === 'not the size of the output' ? 'mismatch' : 'no-source', f.err || '') };      /* a formula that stands for an error: the arrow has it */
      const spot = many && tiles.reads(formula) ? { at: { col: Math.round(a.x - mine.repeat.x), row: Math.round(a.y - mine.repeat.y) } } : {};
      made = many ? N('mapalong', inputs, { formula: f.text, ...repeated, ...spot, ...more }) : N('map', inputs, { formula: f.text }); }
    else { const F = fnRead((home || a).v);
      if (F.loop) return { error: E('loop') };
      if (F.error) return { error: F.error };
      if (F.pass) made = through.length ? N('mapalong', [node], { formula: 'x', ...repeated, ...more }) : cut(all);      /* passed through, and from another part of its input in each cell of the outer tile: said as the formula x */
      else { const p = typeOf(F.param); if (!drawnSame(p, part)) return { error: E('mismatch', sizes(part, p)) };
        const fit = fnFits({ fn: F.fn }, g, part); if (typeof fit === 'string') return { error: E('mismatch', innerOf(p).length ? nested(innerOf(p), innerOf(part), true).note : 'it is run at each inner position, and comes to inner data of its own') };
        made = many ? N('mapalong', [node], { fn: F.fn, ...repeated, ...more }) : N('apply', [x()], { fn: F.fn }); } }
    if (!made) return { error: E('mismatch') };
    const seat = ctx.recs.find(r => r.d.seat === a.id), out = A.output && whole1(A.output.cols) && whole1(A.output.rows) ? A.output : null;
    const kept = promised(out ? { cols: out.cols, rows: out.rows, colsName: sideName(seat?.d.colsName), rowsName: sideName(seat?.d.rowsName) } : null, typeOf(made));
    if (!kept.ok){ const t = typeOf(made); return { error: E('size', same(t, out) ? kept.note : sizes(t, out)) }; }
    return { node: made };
  }

  /* ---- formulas: every capsule and every name of the variable's own becomes $n, an input ----
     rewrite(formula, o) -> { text } | { err: why } | { unknown: true } | { dropped: true }. The text is one the graph
     may hold (formulaOk): it names its inputs and nothing else. A formula that does not read as arithmetic, or that
     names what is not there (a block that is gone, an attribute it has not got, a name nothing knows), comes to
     that error whatever else is in it: it is given back as the error, and the entry holds the error value. One
     that names an attribute with nothing typed has no value yet. o.alone: a formula that names any node is dropped. */
  const busy = new Set();                          /* the attributes being written out: one met again depends on itself */
  function rewrite(formula, o){
    if (!text(formula).trim()) return { unknown: true };
    const got = namesIn(formula); if (got.why) return { err: got.why };
    try { return { text: write(formula, o) }; }
    catch (e){ if (e instanceof Unbound) return { err: e.why }; if (e === UNKNOWN) return { unknown: true }; if (e === DROPPED) return { dropped: true }; throw e; }
  }
  function write(formula, o){
    const ref = make => { if (o.alone) throw DROPPED; const id = make(); if (!id) throw new Unbound('missing variable'); let i = o.inputs.indexOf(id); if (i < 0){ o.inputs.push(id); i = o.inputs.length - 1; } return '$' + (i + 1 - o.first); };
    /* a side: settled when the graph is built unless the shape is a single entry, whose side is the root of its mass.
       A settled side is a measure node, but where the shape may depend on what reads it: there it is its number */
    const measure = (v, side) => {
      if (side === 'm' && !v.scalar) throw new Unbound('not a scalar: it has no mass');
      const inner = /^d[1-6]$/.test(side) ? innerOf(v.type)[+side[1] - 1] : null;      /* the length of an inner axis: settled, as a side is */
      if (side[0] === 'd' && !inner) throw new Unbound(innerOf(v.type).length ? `it has no inner axis ${side.slice(1)}` : 'it holds no inner data');
      if (side !== 'm' && !v.scalar && (mayFollow(v.key, o.reader) || v.state === 'building')) return `(${inner ? inner.length : side === 'x' ? v.type.cols : v.type.rows})`;
      return ref(() => N('measure', [base(v)], { side })); };
    const attribute = (v, a) => { const name = text(a.name).trim(), key = v.key + ' ' + name.toLowerCase(), value = text(a.value);
      if (busy.has(key)) throw new Unbound('depends on itself');
      if (mayFollow(v.key, o.reader) || v.state === 'building' || v.given){      /* where its variable may depend on what reads it, it is written in where it is used */
        if (!value.trim()) throw UNKNOWN; const got = namesIn(value); if (got.why) throw new Unbound(got.why);
        busy.add(key); try { return `(${write(value, { ...o, self: v, mode: 'entry' })})`; } finally { busy.delete(key); } }
      return ref(() => { const of = base(v), id = `measure(${of};a:${name})`;
        if (!nodes.has(id)){ busy.add(key);
          try { const inputs = [of], f = rewrite(value, { self: v, reader: v.key, inputs, first: 1, mode: 'entry' });
            if (f.err !== undefined) throw new Unbound(f.err);
            nodes.set(id, { op: 'measure', inputs, type: T(1, 1), side: 'a', name, formula: f.unknown ? '' : f.text }); scoped(id, nodes.get(id)); }
          finally { busy.delete(key); } }
        return id; }); };
    const attrOf = (v, name) => attributesOf(v).find(a => text(a.name).trim().toLowerCase() === name);
    const capsule = c => { const rec = blocks.get(c.id); if (!rec) throw new Unbound('missing variable');
      if (c.measure === 'g'){ if (!rec.arrow) throw new Unbound('not an arrow: it has no gap'); return `(${len(rec.arrow.gap)})`; }      /* a gap is layout: a number */
      if (rec.arrow) throw new Unbound('an arrow has no such measure');
      if (c.measure === null){ if (o.mode !== 'map') throw new Unbound('choose one of its measures');
        return ref(() => { const id = blockNode(rec); if (!id || one(typeOf(id)) || !namedFits(typeOf(id), o.size)) throw new Unbound('not the size of the output'); return id; }); }
      if (c.measure !== 'a') return measure(rec.v, c.measure);
      const a = attrOf(rec.v, text(c.name).trim().toLowerCase()); if (!a) throw new Unbound('missing attribute'); return attribute(rec.v, a); };
    const name = word => { const low = word.toLowerCase();
      if (tiles.axisOf(word)) return word;
      if (INNER.test(word) && !(o.mode !== 'map' && o.self && attrOf(o.self, low))) return word;      /* k1, k2, …: the inner position of the entry (an attribute of that name, where the shape has one, is still the attribute) */
      if (o.mode === 'map'){ if (['x', 'i', 'j'].includes(low)) return word; throw new Unbound('unknown name: ' + word); }      /* x, i and j in an arrow's formula are the arrow's */
      if (!o.self) throw new Unbound('unknown name: ' + word);
      const mine = bare(o.self.src.d.name).trim().slice(0, 10).toLowerCase() + '.', k = low.startsWith(mine) ? low.slice(mine.length) : low;
      if (k === 'x' || k === 'y') return measure(o.self, k);
      if (k === 'mass' && o.self.scalar) return measure(o.self, 'm');
      const a = attrOf(o.self, low); if (!a) throw new Unbound('unknown name: ' + word); return attribute(o.self, a); };
    let out = '';
    for (const part of textParts(formula)){
      if (typeof part !== 'string'){ out += capsule(part); continue; }
      for (let i = 0; i < part.length;){ const rest = part.slice(i), num = rest.match(/^(\d+\.?\d*|\.\d+)/), word = !num && rest.match(/^[A-Za-z_][\w.]*/);
        if (num){ out += num[0]; i += num[0].length; }
        else if (word){ const w = word[0].replace(/\.+$/, ''), low = w.toLowerCase(), called = /^\s*\(/.test(rest.slice(w.length));
          out += CONSTS.has(low) || (FUNCS.has(low) && called) ? w : name(w); i += w.length; }
        else if (part[i] === '$') throw new Unbound('cannot read "$"');      /* $1 typed by hand names nothing: only the graph writes one */
        else { out += part[i]; i++; } } }
    return out;
  }

  /* ---- second pass: every space, top first, and every block that takes part ---- */
  const outSpaces = {}, outBlocks = {}, order = [];
  const note = rec => { if (own(outBlocks, rec.id)) return; const id = rec.v.given && !usable(rec.v.given.ctx) ? null : blockNode(rec); if (id) outBlocks[rec.id] = id; for (const m of rec.members) note(m.rec); };
  for (const ctx of spaces){
    const key = spaceKey(ctx); if (own(outSpaces, key)) continue;
    if (ctx.owner && ctx.owner.arrow) fnRead(ctx.owner.v);
    const R = read(ctx), owner = ctx.owner && !ctx.owner.arrow && !ctx.owner.v.given ? varNode(ctx.owner.v) : null;
    for (const rec of ctx.recs) if (!rec.arrow && takesPart(rec)) note(rec);
    const ps = R.ps.map((_, k) => pieceNode(ctx, k)), as = arrowsIn(ctx).map(a => { const o = arrowOut(a); return { arrow: a.id, node: o.node, error: o.error }; });
    const ts = [...ctx.groups.values()].filter(t => t.repeat).map(t => { const made = tileNode(ctx, t); rank.set('t:' + t.id, ctx.depth + .5 + t.deep / 1000);
      return { tile: 't:' + t.id, blocks: ctx.recs.filter(r => !r.arrow && takesPart(r) && chain(r).includes(t)).map(r => r.id), arrows: arrowsIn(ctx).filter(a => chain(a).includes(t)).map(a => a.id), node: made.node || null, error: made.node ? null : made.error }; });
    outSpaces[key] = { owner, pieces: ps.map(p => ({ blocks: p.blocks, rule: p.rule, node: p.node, error: p.error })), arrows: as, tiles: ts }; order.push(key);
  }
  for (const rec of blocks.values()) if (rec.at < 0 && !rec.arrow && rec.v.state === 'done') note(rec);      /* what a cut keeps, where something reads it */

  /* a function's input is in the graph only with its function. Where a space came to no one matrix, its input and all
     that is made of it go: a piece or an arrow of theirs has no node, and a variable defined by one has an error */
  let relost = false;
  for (let again = true; again;){ again = false;
    for (const [id, n] of [...nodes]){
      const lost = (n.op === 'param' && ![...scope.get(id)].some(f => own(functions, f) && functions[f].input === id)) || n.inputs.some(i => !nodes.has(i)) || ((n.op === 'apply' || n.op === 'mapalong') && n.fn !== undefined && !own(functions, n.fn));
      if (!lost) continue; again = true;
      if (n.op === 'variable'){ const kept = Object.fromEntries(Object.entries(n.entries).filter(([, e]) => !(e && typeof e === 'object' && 'expr' in e)));
        nodes.set(id, { op: 'variable', inputs: [], type: n.type, name: n.name, named: n.named, defined: 'entries', entries: kept, error: n.error || E('no-source', 'what defines it has no value'), ...(n.holds !== undefined ? { holds: n.holds } : {}) }); scope.set(id, new Set()); }
      else { nodes.delete(id); scope.delete(id); } }
    for (const [fid, f] of Object.entries(functions)) if (!nodes.has(f.input) || !nodes.has(f.body)){ delete functions[fid]; again = true; }
    if (again) relost = true; }
  /* what was made of a variable that has just lost its value no longer follows the function that variable was in: the functions each node belongs to are settled again, until none changes */
  for (let again = relost; again;){ again = false;
    for (const [id, n] of nodes){ if (n.op === 'param' || n.inputs.some(i => !scope.has(i))) continue;
      const now = scopes(n, n.inputs.map(i => ({ within: [...scope.get(i)] })), g.fn), was = scope.get(id);
      if (now.length !== was.size || now.some(f => !was.has(f))){ scope.set(id, new Set(now)); again = true; } } }
  for (const s of Object.values(outSpaces)){
    if (s.owner && !nodes.has(s.owner)) s.owner = null;
    for (const p of s.pieces) if (p.node && !nodes.has(p.node)){ p.node = null; p.error = E('mismatch', 'the function it is in comes to no one matrix'); }
    for (const a of s.arrows) if (a.node && !nodes.has(a.node)){ a.node = null; a.error = E('no-source', 'the function it is in comes to no one matrix'); }
    for (const t of s.tiles) if (t.node && !nodes.has(t.node)){ t.node = null; t.error = E('no-source', 'the function it is in comes to no one matrix'); } }
  for (const [b, id] of Object.entries(outBlocks)) if (!nodes.has(id)) delete outBlocks[b];
  for (const s of Object.values(outSpaces)) for (const t of s.tiles) t.blocks = t.blocks.filter(b => own(outBlocks, b));

  valued(nodes, functions, takes);
  const marks = tilesOf(id => nodes.get(id), outSpaces, outBlocks), outNodes = {};
  for (const [id, n] of nodes){ const within = [...scope.get(id), ...(marks.get(id) || [])].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0));      /* outermost first */
    outNodes[id] = within.length ? { ...n, within } : n; }
  return { version: VERSION, nodes: outNodes, functions, spaces: outSpaces, blocks: outBlocks };
}

/* Every node's number space, written into its type as value: worked out once the graph is whole, each node after
   what it is made of (its inputs, and the body of a function it applies), by its operation's rule. takes: what each
   function's input promises, by its node. (Walked with a list of its own: a graph may be deeper than a stack.) */
function valued(nodes, functions, takes){
  const g = { node: id => nodes.get(id), fn: id => (own(functions, id) ? functions[id] : undefined) }, done = new Set();
  const deps = n => (n.op === 'apply' || n.op === 'mapalong') && n.fn !== undefined && own(functions, n.fn) ? [...n.inputs, functions[n.fn].body] : n.inputs;
  for (const start of nodes.keys()){ if (done.has(start)) continue; const todo = [start], open = new Set([start]);
    while (todo.length){ const id = todo[todo.length - 1], n = nodes.get(id), wait = deps(n).filter(d => nodes.has(d) && !done.has(d) && !open.has(d));
      if (wait.length){ for (const d of wait){ open.add(d); todo.push(d); } continue; }
      todo.pop(); if (done.has(id)) continue; done.add(id);
      const value = n.op === 'param' ? takes.get(id) || ANY : OPS[n.op].space(n, n.inputs.map(i => nodes.get(i)), g);
      n.type = { ...n.type, value }; } }
}
/* what a variable's space would be with no promise: what defines it, or its entries. For whoever says of a promise
   that it cannot be shown to be kept (the page). undefined for what is no variable of the graph. */
export function inferred(graph, id){
  const n = graph && graph.nodes && own(graph.nodes, id) ? graph.nodes[id] : null; if (!n || n.op !== 'variable' || !Array.isArray(n.inputs)) return undefined;
  const { holds: _, ...bare } = n; return OPS.variable.space(bare, n.inputs.map(i => graph.nodes[i]));
}

/* ---- checking a graph that was built elsewhere ---- */
export function validate(graph){
  try { return check(graph); }
  catch (e){ return ['it could not be checked: ' + (e && e.message ? e.message : String(e))]; }      /* whatever it is handed, it answers with what is wrong */
}
/* The version a node needs for what it holds: a choose and a source of kind none need 4; None among its entries, a
   number space (a type's value) or a promise need 3; inner data, a stack, an entry and a transpose's order need 2. -> [version, what it holds], or null. A
   graph that says an older version than something in it needs was not written by a program of that version, and
   whoever reads it by that version would not see what it holds: it is refused. */
function versionFor(n){
  if (n.op === 'choose') return [4, 'a choose'];
  if (n.op === 'source' && n.kind === EMPTY) return [4, 'a source of None'];
  if (n.type.value !== undefined) return [3, 'a number space'];
  if (n.holds !== undefined) return [3, 'a promise'];
  if (n.op === 'variable' && n.entries && typeof n.entries === 'object' && Object.values(n.entries).some(v => !!v && typeof v === 'object' && v.none === true)) return [3, 'None'];
  if (n.type.inner !== undefined || n.op === 'stack' || n.op === 'entry' || (n.op === 'transpose' && n.order !== undefined)) return [2, 'inner data'];
  return null;
}
function check(graph){
  const bad = [];
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return ['it is not a graph'];
  if (!VERSIONS.includes(graph.version)) bad.push(`version is ${graph.version}, not ${VERSION}`);
  for (const k of ['nodes', 'functions', 'spaces', 'blocks']) if (!graph[k] || typeof graph[k] !== 'object' || Array.isArray(graph[k])) return [...bad, `${k} is not an object`];
  const jsonSafe = (v, deep = 0) => deep < 200 && (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'object' && Object.values(v).every(x => jsonSafe(x, deep + 1))));
  if (!jsonSafe(graph)) return [...bad, 'it holds something JSON cannot: an infinity is written "inf", and nothing is undefined'];
  if (JSON.stringify(JSON.parse(JSON.stringify(graph))) !== JSON.stringify(graph)) bad.push('it does not survive being written as JSON');
  const nodes = graph.nodes, has = id => own(nodes, id) && !!nodes[id] && typeof nodes[id] === 'object';
  const okErr = (e, codes) => !!e && typeof e === 'object' && codes.includes(e.code) && typeof e.note === 'string' && Object.keys(e).length === 2;
  /* each node on its own */
  const sound = new Set();
  for (const [id, n] of Object.entries(nodes)){
    if (!n || typeof n !== 'object' || Array.isArray(n)){ bad.push(`${id}: it is not a node`); continue; }
    const rule = own(OPS, n.op) ? OPS[n.op] : null; if (!rule){ bad.push(`${id}: "${n.op}" is no operation`); continue; }
    if (!Array.isArray(n.inputs) || n.inputs.length < rule.inputs[0] || n.inputs.length > rule.inputs[1]){ bad.push(`${id}: ${n.op} does not take ${Array.isArray(n.inputs) ? n.inputs.length : 'no'} inputs`); continue; }
    const gone = n.inputs.filter(i => !has(i)); if (gone.length){ bad.push(`${id}: its input ${gone[0]} is not in the graph`); continue; }
    if (!okType(n.type)){ bad.push(`${id}: its type is not { cols, rows, colsName, rowsName }, with inner, a list of 1 to ${AXES} of { length, name }, where it holds inner data, and value, one of the ten number spaces (with ? after it where None is admitted), where its space is said`); continue; }
    const need = VERSIONS.includes(graph.version) ? versionFor(n) : null;
    if (need && need[0] > graph.version){ bad.push(`${id}: it holds ${need[1]}, which needs version ${need[0]}, and the graph says version ${graph.version}`); continue; }
    if (n.within !== undefined && !(Array.isArray(n.within) && n.within.length && n.within.every(w => typeof w === 'string' && /^[ft]:/.test(w)) && new Set(n.within).size === n.within.length)){ bad.push(`${id}: within is not a list of functions and tiles`); continue; }
    const wrong = rule.fields(n); if (wrong.length){ bad.push(...wrong.map(w => `${id}: ${w}`)); continue; }
    sound.add(id);
  }
  /* functions: each has its input and its body, and every input has its function */
  const fnOk = id => { const f = own(graph.functions, id) ? graph.functions[id] : null; return !!f && typeof f === 'object' && has(f.input) && has(f.body); };
  const inputOf = new Map();
  for (const [fid, f] of Object.entries(graph.functions)){
    if (!fnOk(fid)) bad.push(`function ${fid}: its input or its body is not in the graph`);
    else if (nodes[f.input].op !== 'param') bad.push(`function ${fid}: its input is not a param`);
    else if (!Array.isArray(nodes[f.input].within) || nodes[f.input].within.filter(w => w[0] === 'f').slice(-1)[0] !== fid) bad.push(`function ${fid}: its input does not belong to it`);
    else inputOf.set(f.input, fid); }
  for (const id of sound) if (nodes[id].op === 'param' && !inputOf.has(id)) bad.push(`${id}: a function's input with no function`);
  /* no cycles, through inputs or through the functions nodes apply. (Walked with a list of its own: a graph may be deeper than a stack.) */
  const state = new Map(), after = []; let cyclic = false;
  const next = id => { const n = nodes[id], out = Array.isArray(n.inputs) ? n.inputs.filter(has) : [];
    return (n.op === 'apply' || n.op === 'mapalong') && typeof n.fn === 'string' && fnOk(n.fn) ? [...out, graph.functions[n.fn].body] : out; };
  for (const start of Object.keys(nodes)){ if (!has(start) || state.has(start)) continue;
    const todo = [[start, next(start), 0]]; state.set(start, 1);
    while (todo.length){ const top = todo[todo.length - 1];
      if (top[2] < top[1].length){ const id = top[1][top[2]++];
        if (state.get(id) === 1) cyclic = true; else if (!state.has(id)){ state.set(id, 1); todo.push([id, next(id), 0]); } }
      else { state.set(top[0], 2); after.push(top[0]); todo.pop(); } } }
  if (cyclic) return [...bad, 'the nodes form a cycle'];
  /* every type follows from its inputs by its operation's rule; every node is marked with the functions it belongs to */
  const g = { node: id => (has(id) ? nodes[id] : undefined), fn: id => (fnOk(id) ? { ...graph.functions[id], within: nodes[graph.functions[id].body].within || [] } : undefined) };
  const order = after.filter(id => sound.has(id)), typed = new Set();
  for (const id of order){ const n = nodes[id], ins = n.inputs.map(i => nodes[i]);
    if (n.inputs.some(i => !typed.has(i))){ bad.push(`${id}: an input of it is not well formed`); continue; }
    if ((n.op === 'apply' || n.op === 'mapalong') && n.fn !== undefined && !(fnOk(n.fn) && typed.has(graph.functions[n.fn].body) && typed.has(graph.functions[n.fn].input))){ bad.push(`${id}: its function ${n.fn} is not in the graph`); continue; }
    const t = OPS[n.op].type(n, ins, g);
    if (typeof t === 'string'){ bad.push(`${id}: ${t}`); continue; }
    if (!alike(t, n.type)){ bad.push(`${id}: its type is ${written(n.type)} and its inputs give ${written(t)}`); continue; }
    if (n.type.value !== undefined && n.type.value !== OPS[n.op].space(n, ins, g)){ bad.push(`${id}: its value is ${n.type.value} and its inputs give ${OPS[n.op].space(n, ins, g)}`); continue; }      /* its number space follows by its operation's rule too */
    typed.add(id);
    const want = scopes(n, ins, g.fn).sort(), got = (n.within || []).filter(w => w.startsWith('f:')).sort();
    if (n.op === 'param' ? got.length !== 1 : want.join(' ') !== got.join(' ')) bad.push(`${id}: within names the functions ${got.join(', ') || 'none'} and it belongs to ${want.join(', ') || 'none'}`);
  }
  /* spaces and blocks */
  for (const [b, id] of Object.entries(graph.blocks)) if (!has(id)) bad.push(`block ${b}: its node ${id} is not in the graph`);
  const repeats = new Set();
  for (const [key, s] of Object.entries(graph.spaces)){
    if (!s || typeof s !== 'object' || !(s.owner === null || has(s.owner)) || !Array.isArray(s.pieces) || !Array.isArray(s.arrows) || !Array.isArray(s.tiles)){ bad.push(`space ${key}: it is not { owner, pieces, arrows, tiles }`); continue; }
    s.pieces.forEach((p, i) => { const at = `space ${key}, piece ${i + 1}: `;
      if (!p || typeof p !== 'object' || !Array.isArray(p.blocks) || !p.blocks.length || p.blocks.some(b => typeof b !== 'string')) return bad.push(at + 'it names no blocks');
      if (![null, 'product', 'sum', 'elementwise', 'mixed'].includes(p.rule)) bad.push(at + `its rule is "${p.rule}"`);
      if (p.node === null ? !okErr(p.error, PIECE_CODES) : !has(p.node) || p.error !== null) bad.push(at + 'it has either a node or an error, one of them'); });
    s.arrows.forEach((a, i) => { const at = `space ${key}, arrow ${i + 1}: `;
      if (!a || typeof a !== 'object' || typeof a.arrow !== 'string') return bad.push(at + 'it names no arrow');
      if (a.node === null ? !okErr(a.error, CODES) : !has(a.node) || a.error !== null) bad.push(at + 'it has either a node or an error, one of them'); });
    s.tiles.forEach((t, i) => { const at = `space ${key}, tile ${i + 1}: `;
      if (!t || typeof t !== 'object' || typeof t.tile !== 'string' || !t.tile.startsWith('t:') || !Array.isArray(t.blocks) || !Array.isArray(t.arrows) || [...t.blocks, ...t.arrows].some(b => typeof b !== 'string')) return bad.push(at + 'it is not { tile, blocks, arrows, node, error }');
      if (t.blocks.some(b => !own(graph.blocks, b))) bad.push(at + 'it names a block that takes no part');
      if (t.node === null ? !okErr(t.error, CODES) : !has(t.node) || nodes[t.node].op !== 'repeat' || t.error !== null) bad.push(at + 'it has either a repeat for its node or an error, one of them');
      else if (t.node) repeats.add(t.node); });
  }
  /* every node is marked with the tiles it belongs to, exactly; and every repeat is some tile's matrix, so that what
     it works out once for each cell can be told */
  for (const id of typed) if (nodes[id].op === 'repeat' && !repeats.has(id)) bad.push(`${id}: a repeat that is no tile's matrix: spaces names no tile for it`);
  const marks = tilesOf(id => (typed.has(id) ? nodes[id] : undefined), graph.spaces, graph.blocks);
  for (const id of typed){ const want = [...(marks.get(id) || [])].sort(), got = (nodes[id].within || []).filter(w => w.startsWith('t:')).sort();
    if (want.join(' ') !== got.join(' ')) bad.push(`${id}: within names the tiles ${got.join(', ') || 'none'} and it belongs to ${want.join(', ') || 'none'}`); }
  return bad;
}
