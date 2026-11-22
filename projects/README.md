# Projects

A saved project is a directory in here. Shapes and files are the same tree:

- a space is a directory;
- each shape in it is one `.json` config file;
- a shape with a definition space has a directory of the same name beside its file, holding that space the same way;
- a variable used in several places is a file for each use, with its definition's directory beside one of them only;
- a group is one combined `.group.json` file holding all of its shapes.

- a space where Difference or Intersect has cut something has one more file, `operations.json`, holding each cut
  with the two shapes it took off the canvas, whole, and where each was (its place in the order and its frames).

- the files its file sources and streams read are in `data/` at the top: `data/weights.csv`, a numeric CSV; and, for
  streams, `data/words.txt` (text, UTF-8) and `data/cube.npy` (an array of 32-bit floats). Each is kept as it was chosen.

`project.json` at the top marks the directory as a project, and holds its tick (`"tick": 0`), the project's clock.
The full format is described at the top of [`../project.js`](../project.js).

The format is 9. Format 9 adds to format 8 the `.backend` frame file, saved with the project (holding backend settings
such as `.seconds_per_pass`, typed with a number space). A format 8 project has none and opens as it is using backend
defaults; a program from before format 9 refuses a format 9 project rather than drop `.backend`. Format 8 adds to format 7 `"stream"` on a shape, beside its `"source"` (`{ "length", "start", "step",
"end" }`: see streams/ below), `"tick"` in `project.json`, and `.txt` and `.npy` files under `data/`. A format 7 project
has none of them and opens as it is, at tick 0; a program from before streams refuses a format 8 project rather than
read its streams as blocks that never move on. Format 7 adds to format 6, on a tile's `"repeat"`: `"step"`, the id of the arrow that is the tile's
step; `"until"`, the id of its stop block; and a count of `"inf"`. A format 6 project has none of them and opens as it
is; a program from before loops refuses a format 7 project rather than strip it. Format 6 adds to format 5 `"choose"` on an arrow (`{ "then", "else" }`: the two frames of its definition
space a condition chooses between) and a frame file that holds no shapes, the empty side. A format 5 project has neither
and opens as it is; a program from before conditions refuses a format 6 project rather than strip it.
Format 5 adds to format 4 the value None, written `{ "none": true }` in an entry (typed `none`, drawn `∅`:
nothing, said outright, which is not the same as an entry never given), and `"holds"` on a shape, the number space it
promises (`"integer"`, `"natural?"`: see the README). A format 4 project has neither and opens as it is.
Format 4 adds inner data to format 3: a shape whose entries each hold an array has `"inner"` in its
`size` (the lengths of the inner axes, at most six) and in its `sides` (their names, `null` where unnamed), as in
`"size": { "cols": 3, "rows": 1, "inner": [2, 4] }, "sides": { "cols": null, "rows": null, "inner": ["key", "embed"] }`;
its entries are keyed `"column,row,k1,k2,…"`, one more number from 1 for each inner axis (`"2,1,1,3"` is entry 2,1,
column 1 and row 3 of the matrix it holds); and a block that is one entry of such a shape, taken out, has
`"from": { "id", "entry": { "col": 2, "row": 1 } }` and no entries of its own; and a use of such a shape that is
turned has `"axes": [2, 1, 0]`, the order in which it has its variable's axes (columns 0, rows 1, then the inner
ones), with its `size` and `sides` as it is drawn. A format 3 project has none of these,
opens exactly as it was, and saved again differs only in the format number.

What follows is what format 3 holds. An entry is a literal value (a whole number, `"inf"` or `"-inf"`, `{ "n", "d", "k" }`, `true` or
`false`, `{ "sym": "1+sqrt(2)" }`) or a formula, `{ "expr": "1/√(@[b3k2m9x:x])" }`, kept as its text and never with
its result; `@[id:x]` in a formula or an attribute's value names a measure of the variable whose block has that id.
An error or a decimal is never written, and one met in a file is dropped.
The format also adds two things to format 2, both for the boolean tool: a space's `operations.json`, and on a
shape made by a cut or an intersection `from.range`, the columns and rows of its source that it is
(`{ col, row, cols, rows, toEnd: { cols, rows } }`, counted from 0; `toEnd` marks a range that runs to the source's
last column or row whatever size the source becomes). Such a shape's entries are its source's and are not written.
A format 2 project has neither and opens with no operations. The format adds three more for arrows: a shape of
`"type": "arrow"` carries `"arrow"` (`{ input: { id, as }, side, start, span, gap, gapName, output, formula }`: what
it reads, where it stands against it, the output size it promises or `null`, and its entry formula or `null`), and
has a definition directory holding its space, in which the block called `in` carries `"in": true`; and a shape
seated on an arrow's output carries `"seat"`, that arrow's id, or `{ "hollow": [id, id] }` where it sits in the
hollow of the pair those two shapes make. Where an output is written, and what it comes to, are never in a file: a
seated shape's `entries` are whatever it held before it was seated, and are not used while it is. A format 2 project
has no arrows. For sources and tiles it adds: on a shape, `"source"` (`"zeros"`, `"ones"` or `"identity"`; such a shape's
`entries` are empty, since its values follow from its kind and its size); on a standing shape, `"standing": true`,
which was `"tile": true` and is still read under that word; on a frame that is a tile, `"repeat"`
(`{ x, y, cols, rows, across, down }`: where the pattern is and how large, in units, and how many times it repeats
each way, a whole number or `{ "expr": "@[id:y]" }`, a formula of widths, heights and settled masses); `"as": "tile"` in an arrow's `input`, whose `id` is then the
tile's frame; and `"from": { id, index: "x" }` on an index matrix in the definition space of a block that is in a
tile. The copies a tile draws, and what a count comes to, are never in a file. For the backend it adds two more sources, `"source": { "noise": { "seed": 0, "dist": "uniform" } }`
(`dist` is `"uniform"` or `"normal"`) and `"source": { "file": "data/weights.csv" }` (`null` before a file is chosen), and
the `data/` directory. Their numbers are the backend's, and no decimal is ever in a file. What else changed is what a stack means. Shapes of one width set one
directly on the next were rows appended in format 2 and are a sum in format 3. A format 2 project still opens: each
of its stacks is fused into one joined shape on the way in, so it comes to what it did, and the readout says how many
were fused. Shapes that met at a corner, or stood directly under a shape in a product, did not touch in format 2 and
do now: they are not moved, and the readout says how many pieces read differently. Saved again, it is format 4.

A reference is the size of its variable (the shape of the same `"variable"` number without `"reference"`), with its
`cols` and `rows` the other way round where one of the two is `"transposed"` and the other is not, and for a use
with `"axes"` the two axes its order draws. A file written by hand that gives a reference another size is opened
with that reference set to its variable's size, and the readout says so.

## Saving and opening

Run `python3 server.py` in the repository and open the page it serves. Right-click the canvas:

- **Save project** asks for a name and writes `projects/<name>/`, replacing whatever that directory held.
- **Open project** lists the projects here; choosing one replaces everything on the canvas.

Opened anywhere without that server (the published artifact, say), Save hands over a zip of the same tree and
Open takes one back.

## The Menu

The page has one space at the top, the Menu, and a project is what is in it. On opening, the page loads the project
called `menu` if you have saved one, and otherwise `default-menu`, which comes with the repository. Save offers the
name `menu`, so your first save makes the Menu your own without touching `default-menu`.

`default-menu` can be saved over too. Two things keep that from stopping the server following its branch:

- Its `.config` belongs to the machine. A project's top `.config` is not kept in the repository (`.gitignore`); the
  one that comes with `default-menu` is the file `default-menu.config` beside its directory, which the server hands
  over as the project's `.config` until the project has one of its own. The first save writes it, and from then on
  that machine's colours and settings are its own, whatever is pushed.
- Everything round it follows the branch. Where a file of a project that comes with the repository has been changed
  both here (by a save) and on the branch (by a push), the branch's is taken when the update comes in. A file changed
  only here is left, and so is anything the repository does not keep.

## Frames

Shapes framed together (press F on a selection) are a frame; projects saved before call it a group, and are still
read. A frame is one file, `Name.frame.json`, holding its shapes and the frames inside it. A named frame is a variable:
it is in the list at the right edge, and dragged from there all of it is made again. A frame with a `repeat` is a
tile (see the main README): the same file, holding the shapes of its first cell, or none; a tile inside it is one of its `"groups"`, with a `"repeat"` of its own. What is named inside a named frame
is listed under it, not beside it. A frame is no scope of its own. Everything in a frame whose name begins with a dot
is a hidden variable, and its name is made lower case with a dot in front.

## .config and shadowing

The program's own variables exist from the start, above the Menu. The tree is in `system.js`: `.config` holds
`.integer_precision` (a whole number, not read yet), `.dark_mode` (0 for the light colours, 1 for the dark ones; left
blank, whatever the computer asks for), `.show_hadamard_copies` (in how many of its two hollows the result of a
Times or Over pair is written: 0, 1 or 2; left blank, 1), `.dark_colors` (the colours used while `.dark_mode` is 1, laid out like
`.colors`) and `.colors`, whose two groups hold the colours, each a shape of
three entries, red, green, blue: `Shapes` (`.tensor_default`, `.data-in`, and `.function`, the colour of an arrow's triangle) and `UI` (`.bg`, `.fg`, `.select`, ...).
`Shapes` also holds `.variable_colors`, an array of six colours, a row each: the ones a newly named shape takes at
random. The stylesheet has no colours for these (they are `--variable-1` to `--variable-6`, set from the array), and
the program has none of its own either. In the default Menu each `.variable_colors` (light and dark) is defined in its own definition
space: open it, and six colour vectors stand in the definition's matrix, a row each, ordinary shapes. Together they
fill it, and that is what `.variable_colors` equals. They are the only listing of the colours: change one's entries, or drag them to reorder.

A row of `.variable_colors` that is not given in full (the matrix has a hole, or a shape standing in it leaves an
entry as a symbol) is no colour: shapes that wear it are drawn with no fill. Nothing stands in for it.

A shape is defined only in its definition space, and only by standing shapes, the shapes standing in the
definition's matrix (snap to matrix): once they cover every entry, the shape's entries are theirs, and until then it
keeps its own. A standing shape's file carries `"standing": true` (`"tile": true` in projects saved before, which is
still read). Shapes set anywhere else, in that space or beside the shape on its
own canvas, are only pieces and define nothing.

Neither the program nor the stylesheet holds a value for any of these. They are written out, entry by entry, in the
Menu's `.config` (the default Menu gives every one, light and dark), and that is the only place they are set. A
colour no `.config` gives in full does not exist: a project with no `.config` has no canvas colour, no text colour
and no shape colours, and is drawn in whatever the browser does with none. Two variables that are not colours have a
fallback: `.dark_mode`, left blank, is whatever the computer asks for, and `.show_hadamard_copies` is 1.

A group named `.config` shadows the program's from its space downwards, and one further down shadows it again. It
covers only what it gives: a colour shape with one entry filled changes that one entry. It is saved as a file called
`.config` in its space's directory, so there can be one at every level; the Menu's is the project's root `.config`.

Every variable works this way: a shape with the name of one higher up shadows it from there down, entry by entry.

A `.config` reaches as far as the group it is in. One in no group covers its whole space and everything below; one
inside a group covers that group alone, with everything below its shapes. The default Menu uses this: `.dark_colors`
holds a small `.config` of its own with `.dark_mode` = 1, so that group is drawn in the dark colours it sets while the
rest of the Menu stays light.

The program's seven functions (`.recip`, `.sqrt`, `.exp`, `.ln`, `.abs`, `.tanh`, `.erf`) are in `system.js` too, each a
name and a formula. They have no shape in a `.config`: a function is not on a canvas until it is used. An arrow of
a project's own with one of their names shadows it from its space downwards, as above.

## example/

A small hand-written project showing every kind of file: a shape with a definition, a shape with numbers typed
into it, a named group, a commented-out shape, two shapes with the same name, and a name that is not a legal file
name.

## touch-algebra/

What touching means, one piece for each case, beside a copy of the default Menu's `.config`: a sum (`Signal` on
`Bias`); Times (`Mask` and `Weights` at a rising diagonal, the result in the hollow between them); Over with a 1 by 1
shape holding 1 (the reciprocal of `Scale`, written beside the piece since neither hollow is its size); Over with a
single row (`Logits` over `Norm`, in the one hollow that is the result's size); and a product with a third shape
stacked under it, which is `mixed rules`. Change `.show_hadamard_copies` in its `.config` to 2 or 0 to see the result
of `Mask` and `Weights` move.

## entries-and-values/

Formulas in entries, beside a copy of the default Menu's `.config`. `Scale` holds `1/√(@Keys.x)`, which shows `1/2`
while `Keys` is 4 wide (make `Keys` 5 wide and it shows `√(1/5)`), a formula using `Keys`' attribute `heads`, the
fraction `3/4`, and a root of `Heat`'s mass. `Logic` holds `select(2 > 3, 1/0, 5)`, which is 5; `1/0` alone, which is
the error mark (select `Logic` and the panel says why); a comparison, `max`, and an infinity chosen by a `select`.
`Functions` holds `exp(2) + 1`, shown as `1+exp(2)`, beside functions that come out (`exp(0)`, `tanh(inf)`,
`exp(-inf)`). `Waits` uses the mass of `Tau`, a scalar not yet given a number, and shows a symbol, not 0; type a
number as `Tau`'s mass and it follows. Delete `Keys` to see the warning and the formulas left without it.

## boolean-tool/

Difference and Intersect, beside a copy of the default Menu's `.config`. At the top left, `Left` and `Right` fused
into one shape (Revert takes it apart). Below it, `Keys` (6 by 4, its columns named `embed`) was used twice, and one
use was cut by `Head`, a 2 by 4 shape laid over its columns 3 and 4: the two shapes left are columns 1 to 2 and
5 to 6 of `Keys`. Open the `Keys` that is still on the canvas and type a number into its first or last two columns:
the matching part shows it at once. Select a part to see its side's label (`embed-Head.x.1`). At the top right,
`Window` (2 by 2) lay in the middle of `Table` (8 by 6), touching no edge, where a Difference is refused; Intersect
made the one 2 by 2 shape that is there now. Revert on any of these puts the original shapes back.

## arrows/

Arrows, beside a copy of the default Menu's `.config`. At the top, an arrow carries `Keys` across unchanged: `H` is
seated on its output, and `B`, set against `H`, makes a product. Below, `relu` is a named arrow with the formula
`max(x, 0)`, used on `V` (2 and -5 give 2 and 0) and again on `U`: select either and change the formula, and both
change. `mask` writes `-∞` above the diagonal of `Scores` (`select(i > j, -inf, x)`), and `.exp`, one of the
program's functions, is set against `mask`'s output. `linear` is defined in its space: open it to find `in` against
`W`, a product, and the size it promises, 2 by 3; type another output size in its panel and it turns to the warning
colour. On the right, the result of `Weights` and `Gate` was named `Gated` in its hollow and dragged out along its
row, which made the arrow that carries it.

## sources-and-tiles/

Sources and tiles, beside a copy of the default Menu's `.config`. Along the top, `Eye` and `Wide` are identities
(`Wide` is 4 by 2), `Zero` is zeros and `One` ones: resize any of them and its matrix follows. Below, `Bias` (1, 2,
3, 4) is in the tile `Every row`, whose `down` is `X`'s height, so it is drawn as one pattern and an ellipsis; the
arrow out of the tile carries its matrix, `Bias` in every row, to `B`, which is seated on the output and stacked
under `X`: a sum. Make `X` taller and the count, the arrow and the output follow it (the tile then wants moving
down, level with `X`'s new bottom edge, for `B` to sit under `X` again). `Place` is one entry holding `index.x + index.y`, in the
tile `Index`, 2 by 2: it reads 2, 3, 3, 4. `Pair` holds `index.x` and `10 * index.y` in a tile 3 by 2. Under `M`,
the arrow `relu` (`max(x, 0)`) sits under column 1 in the tile `Every column`, across 4: one arrow, mapped over
every column, its outputs one 4 by 2 output with `R` seated on it. `Stack` is defined by two standing shapes: open
it to find `Bias` standing in each row of its matrix.

## tiles-inside-tiles/

A tile inside a tile, beside a copy of the default Menu's `.config`. Above, `Pair` (1, 2) is in the tile `Twice`,
twice across, and `Twice` lies wholly inside the pattern of the tile `Rows`, 4 by 1 and three down: it is part of
that pattern, so every row of `Rows` is `Twice` again. The arrow on the right reads `Rows`: a 4 by 3 matrix, 1 2 1 2
in every row. The arrow on the left reads `Twice` alone: 1 2 1 2. Pull `Twice`'s right edge and it is refused: it
would run past the pattern it is in.

Below, `Place` holds `index.x` in both entries, in the tile `Inner` (twice across) inside the tile `Outer`, whose
pattern is 4 by 2 and which repeats twice down; `Under`, a block of `Outer` itself, holds `index.y`. The index a
block reads is that of the innermost tile it is in: `Place` reads 1 2 and then 3 4 across `Inner`, the same in both
cells of `Outer`, while `Under` reads `Outer`'s rows, 2 and then 4. The arrow out of `Outer` shows all of it.

In a file, a tile inside a tile is a frame with a `"repeat"` among the `"groups"` of a frame with a `"repeat"`.

## graph-and-evaluator/

What the page works out, beside a copy of the default Menu's `.config`: every number here comes from the graph
(`graph.js`) and the evaluator (`evaluate.js`). Along the top, `M` (1, 2, 3, 4) against the identity `Eye` is a
product, and reads 1, 2, 3, 4. `A` on `C` is a sum, worked out entry by entry; one entry of `C` was never given, so
that one entry of the result stays in symbols (`a₃₂+c₃₂`) and the rest are numbers. `Num` over `Den` is written in
their hollow: `Den` holds a zero, so one entry is the error mark (divide by zero) and the others are fractions.

In the second row, `Keys` is defined in its space: open it to find `Embedding` against `Key Weights`, and the
product on the left of its equation; back in the Menu, `Keys` holds the same numbers. Beside it the scalar `two`
scales `Twice`, whose entries were never given: each stays a symbol, written against the 2. `linear` is an arrow
defined in its space (`in` against `W`) and used twice, on `X` and on `Y`: one function, two inputs, two outputs.
Open either arrow and `in`, and the product it makes, show that arrow's numbers.

In the third row, `Scale` holds two formulas, `1/√(X.x + 1)` and `Tau.mass × 2`, and its product with `Ones` is
`7/2`: give `Tau` another number, or make `X` wider, and it follows. `Loop` holds `Loop.mass + 1`: it depends on
itself, so it has no value, its panel says so, and `After`, which reads it, has none either. Everything else on the
canvas is worked out as if they were not there.

## inner-data/

Shapes whose entries are themselves matrices, beside a copy of the default Menu's `.config`. `QKV` is 3 by 1, and
each of its entries holds a matrix of 2 columns (`key`) by 4 rows (`embed`): select it, and its panel says
"vector of 2 × 4 matrices", with its data dimensions and each axis's length and name. Its numbers are not typed:
open it, and `W_Q`, `W_K` and `W_V`, the three matrices above it in the Menu, stand one in each entry. Back in the
Menu, press an entry in `QKV`'s panel to open it and see the matrix it holds.

Under `QKV` is the arrow `attend`, which reads all three entries at once: the three matrices of an attention layer
travelling as one input. Open it: `in` is 3 by 1 of 2 by 4, and `Q`, `K` and `V` are its three entries taken out
(select `in`, open an entry in its panel, and drag the trail onto the canvas to take one out yourself). They touch
`X` in one row of ordinary products, `X · Q · Kᵀ · Xᵀ · X · V`, and what that comes to is the arrow's output, 18,
16 and 14 down each column.

At the right, `X` against `Heads`, which is 2 by 4 and holds 3 numbers to an entry (`head`): one product for each
head, written as brackets, `[3]`. Select `Heads` and press an entry to see its three numbers.

Under them is a second `Heads`, the same variable turned: its panel lists its axes as `head y | x`, so it is drawn
3 wide (the heads) by 4 tall and each entry holds 2 numbers. The arrow under it covers its second and third
columns, which are heads 2 and 3: an arrow reaching along what is an inner axis of the variable. Drag `x` back
before the bar in the panel's list, and it lies as `Heads` does again.

In a file, the turned use has `"axes": [2, 1, 0]`. `QKV` has `"size": { "cols": 3, "rows": 1, "inner": [2, 4] }` and
`"sides": { …, "inner": ["key", "embed"] }`; `Heads` has entries keyed `"1,1,1"` to `"2,4,3"`; and each of `Q`, `K`
and `V` has `"from": { "id": <in's id>, "entry": { "col": 1, "row": 1 } }`.

## noise-and-data/

What the backend adds, beside a copy of the default Menu's `.config` (see "The backend" in the main README for how to
run one). `Noise` is a 4 by 4 noise block: uniform, seed 0. With the backend its result is sixteen grey squares, the
same sixteen on any machine, and its panel has its seed and its distribution: change the seed and every square
changes (the old ones are dimmed until the new arrive); move the block and none does. With no backend it says
"needs the backend".

Below it, `Draw` is noise from the normal distribution (seed 7), set against `Weights`, which reads the four rows of
two numbers in `data/weights.csv`: a product only the backend can work out, written as squares (black for 0 and
below). Select `Weights` and its panel names its file and offers another.

At the bottom, `V` holds 0 and 1, and the arrow under it has the formula `exp(x)`. Without the backend its output
reads `1` and `exp(1)`, exactly. With it, the 1 stays the whole number it is and `exp(1)` is a white square; select
the arrow, and its panel writes it out, `≈2.71828175`, with `exp(1)`, the exact value it stands for, under it.

In a file, a noise block has `"source": { "noise": { "seed": 0, "dist": "uniform" } }`, a file block
`"source": { "file": "data/weights.csv" }`, and neither has entries: nothing the backend worked out is ever saved.

## conditions/

Conditions and truth as height, beside a copy of the default Menu's `.config`.

At the top left `Go` holds `true`, and the arrow `gate` beside it, with a `?` on its triangle, is a condition: its
output, where `Out` is seated, is `Keys · Weights`. Select the arrow and double-click it for its two sides: the
frame `true` holds `Keys` and `Weights`, and the frame `false` is empty. Type `false` into `Go` and `Out` holds `∅`
in all four entries, None at the true side's size, and inside the arrow the true side is faded.

Under it `No` holds `false`, and the same `gate`, used again from the list, gives `∅` there.

`Mask` holds 0, `∅` and 5: a whole matrix for a condition. One true entry makes it true, so its arrow gives `Then`
(1, 2); make the 5 a 0 and it gives `Else` (7, 8), its false side.

`Each` is a column of `true`, `false` and `∅`, and the arrow beside it is in the tile `Rows`, which repeats it down
the column: three conditions, three outputs, (1, 2), then (-1, -2) twice.

On the right, truth as height. `Zero`, a source of zeros, and `Nothing`, which holds only `∅`, are false, and are
drawn sunk: no shadow, set down, the light along their bottom edge. `Some` holds a 3 and stands as a block always
has. `Open` has an entry never given: its truth is not known, and it stands too. `No` is sunk, and so is
`.dark_mode` in the `.config`, which holds 0.

A conditional arrow's file carries `"choose": { "then": "<frame id>", "else": "<frame id>" }` in its `"arrow"`, and
its definition directory holds `in.json`, `true.frame.json` and `false.frame.json`; the empty side is a frame file
with no shapes.

## running-total/

A loop, beside a copy of the default Menu's `.config`. It was made by mouse, from New > Tensor, Function and Tile.

`X` holds 3, 1, 4, 1. Under its first column is the arrow `take`, and the block `x` is seated on its output; under
`x` is `S`, holding 0. The tile `Total` is drawn round `x` and `S` and is 4 across. The arrow east of the tile,
`add`, is the tile's **step** (right-click an arrow on a tile's east side, Step): it is given one whole cell, `x`
over `S`, and gives the state of the next cell. Open it: two arrows cut `in` into its two rows, and the blocks
seated on them, `a` over `b`, are a sum.

`S` is the tile's state, because its value is its own typed entry; `x` is worked out afresh in each cell, and since
it lies in the pattern of a tile with a step it holds the k-th column of `X` in cell k. So the cells show `S` as
0, 3, 4, 8, the total so far, and the step's output, east of the fourth cell, shows 9. An arrow on any other side of
the tile reads its whole matrix, every cell with its state.

Change an entry of `X`, or type another number into `S`, and every later cell follows. Type `inf` for the tile's
`across` and the arrow `take` cannot be repeated, since an arrow cannot be repeated in a tile that does not end:
the tile and the arrow are drawn in the warning colour, the cells are blank, and the tile's, the arrow's and the
step's panels say why. The same is so where the tile has more cells than `X` has columns, or repeats down. (A tile
that does not end and reads nothing outside it shows its first three cells, and takes one step each tick: at tick t
its step gives the state of cell t + 1, which its panel says. `streams/` has one.) Right-click a block of a pattern and choose Stop when true, and the tile stops at the first cell where
that block is true.

In a file the tile's `"repeat"` has `"step"`, the arrow's id.

## streams/

Streams and the tick, beside a copy of the default Menu's `.config`. Its numbers are the backend's: with none
running, every block here says "needs the backend". It was made in the browser, by messages and the file chooser.

The **tick** is the project's clock, top-centre: a whole number, typed or stepped by one with − and +. This project
was saved at tick 3. It is saved with the project and is no step of undo.

`Noise` is a plain noise block: it holds the same eight numbers at every tick. `Draws` beside it is a **noise
stream** (New > Data in > Noise stream): four values of 2 × 2 side by side, with a line between them. Step the tick
and the window moves on by its `step`, 1: what the second value showed, the first now shows.

`Rows` is a **file stream** of `data/rows.csv`, ten rows of two numbers. One value is as wide as the file's columns,
which cannot be typed, and as tall as the block is pulled: here 2 rows, so its `step` is 2 and the next value begins
where the last ended. It shows 2 values at once (`length`), and its `end` is `wrap`: past the tenth row it begins
again. At tick 3 it shows rows 7 to 10. Type 1 for its step and successive values overlap; type `stop` for its end,
and at tick 4 it has no value and the readout says that the stream has ended, and at which tick.

`Letters` reads `data/letters.txt` as text, one Unicode code point to a character: five characters a value. `Cube`
reads `data/cube.npy`, an array of 4 by 3 by 2 32-bit floats: one value for each index along its first axis, each
3 rows of 2.

`Total` is the running total of a stream's rows. It is a tile that does not end (`across` is `inf`) round `x`, a
stream of `data/total.csv` (3, 1, 4, 1, 5), over `S`, which holds 0 and is the tile's state; `add`, east of it, is
its step and adds the two. Such a tile takes one step each tick, and in cell k the stream stands where it stood at
tick k − 1: so at tick 3 `add` gives 8, the sum of the first three rows, and the three cells drawn show 3, 1, 4 over
0, 3, 4.

In a file a stream is `"stream": { "length": 2, "start": 0, "step": 2, "end": "wrap" }` beside the shape's
`"source"`. Where it stands is never written: it is `start + tick × step`.

## running/

Running the clock, `.backend`, and checkpoints, beside a copy of the default Menu's `.config`. `Walk` is an infinite
tile whose pattern is a normal noise stream `draw` over state `S` (starting at `0`), with step arrow `add` summing
them. Press **Play** beside the tick to advance it continuously on the backend (one step per tick in the playing
worker) and **Stop** to pause; saving writes loop checkpoints under `data/checkpoints/` so reopening at a high tick
restores immediately. The `.backend` frame holds `.seconds_per_pass` (`30`, promised `natural`), saved with the
project and undoable.

## none-and-spaces/

None and the number spaces, beside a copy of the default Menu's `.config`.

`W` holds 1, `∅`, 3 and 4: the second entry was typed `none`. Select `W` and its **Holds** row reads `natural`, with
**or None** ticked: it promises natural numbers or None, and keeps the promise. Untick the box and the row turns to
the warning colour and says which entry breaks it.

`Pick` holds the formula `select(none, 2, 3)` and shows 3: None counts as false, so `select` takes its other side.
Its Holds row is greyed, `natural (from its entries)`: it promises nothing, and that is what it is worked out as.
`V`, holding 1 and 2, reads the same.

`Bad` holds 2 and -3 and promises `natural`. Its row says "Bad is not natural: it holds -3 at 2, 1", and anything
made of it has no value until the promise is changed or the entry is.

At the bottom, `X` is read by the arrow `linear`, whose function multiplies its input by `Wf`, and `Out` is seated
on the output. Select the arrow: **Takes** is `natural`, what the function's `in` block promises, held against what
`X` gives it; **Gives** is `whole`, what `Out` promises. Type -4 into `X` and Takes says which entry breaks it:
the arrow's output then has no value, and nor has `Out`.

In a file, `W` has `"holds": "natural?"` and the entry `"2,1": { "none": true }`; a shape that promises nothing has
no `holds`.

## transformer/

A complete 2-layer Pre-RMSNorm causal Transformer with multi-head self-attention and GELU MLPs, beside a copy of the
default Menu's `.config`. Its weights and pre-embedded input sequence `X` ($T = 4$ tokens $\times$ $d = 4$ embedding
dimension) live in 23 deterministic CSVs under `data/`, so the browser defers evaluation cleanly to the NumPy backend.

On the top canvas, `Layer 1` and `Layer 2` sit in two horizontal frames (`X` → `rmsnorm` → `N1` → `Attn 1` → `H1_attn`
→ `rmsnorm` → `M1` → `MLP 1` → `H1`, and then `H1` → `rmsnorm` → `N2` → `Attn 2` → `H2_attn` → `rmsnorm` → `M2` →
`MLP 2` → `Out`):

- **`rmsnorm`** is one reusable arrow definition applied four times across both layers: it squares `in` (`x^2`), takes
  the row mean via `inv_d · Sq · Ones4` ($\frac{1}{4}\sum_c x_{rc}^2$), applies `sqrt(x + 1/100000)` ($\epsilon = 10^{-5}$),
  and divides `in` by `Rms` using the corner-touch Over broadcast.
- **`Attn 1` / `Attn 2`** compute 2-head causal scaled dot-product self-attention ($H = 2$, $d_h = 2$): open either to
  see `Concat · W_O`, where `Concat` is defined by two standing shapes (`Head 1` and `Head 2`) placed side by side. Open
  a head to see `P · V`; inside `P` is `E` over `Z` (row-wise softmax); inside `E` is `(1/sqrt(2)) · Q · K_T` passed
  through `causal_exp` (`select(i <= j, exp(x), 0)`), and inside `Z` is `E · Ones4`.
- **`MLP 1` / `MLP 2`** compute a two-layer feed-forward block ($d = 4 \to d_{ff} = 8 \to d = 4$) with exact GELU
  (`0.5 * x * (1 + erf(x / sqrt(2)))`) and broadcast row biases (`Ones4 · b_1` and `Ones4 · b_2` stacked vertically onto
  `Up` and `Down` to add).
- **`H1_attn`, `H1`, `H2_attn`, `Out`** are residual sums (two references stacked vertically).

### Tooling limitations noted while building `transformer/`

Building a working 2-layer Transformer surfaced several real limitations in the currently implemented tooling (and one
graph-builder bug in `graph.js:valued()`, fixed alongside this example, where diamond DAGs such as `E / (E · Ones)`
failed number-space validation):

1. **No reduction operations (`sum`, `max`, `mean`, `argmax`):** Row sums must be emulated by multiplying with an
   all-ones column (`E · Ones4`), and row-wise `max` cannot be computed cleanly. Softmax therefore uses unshifted
   `exp(x)` rather than the numerically stable `exp(x - max(x))` (which would overflow `float32` for logits above
   $\approx 88.7$), and output logits cannot be decoded via `argmax`.
2. **No `reshape` / `flatten` / `unstack` between inner axes and drawn axes:** Multi-head projections can run in
   parallel over an `inner: [head]` axis (as in `inner-data/`), but there is no inverse of `stack` to flatten
   `(inner=[H], cols=d_h, rows=T)` back into a drawn `H*d_h × T` matrix for `W_O`. Multi-head concatenation therefore
   requires separate per-head blocks assembled as `standing` shapes.
3. **Single-input arrows and no heterogeneous parameter bundles:** An arrow takes one input (`in`), and inner-data
   `stack` requires identical inner shapes. You cannot pass a bundle `(X, W_Q, W_K, W_V, W_O, W_1, b_1, W_2, b_2)` to
   reuse a single untied `TransformerLayer` arrow across layers; only weight-free operations like `rmsnorm` can be
   shared, while untied layers require separate definitions.
4. **Definition-space `ends()` ignores cross-space variable references:** `arrows.js:ends()` and `graph.js:endOf()`
   only treat a piece as consumed if an arrow *in the same space* reads it. Placing helper blocks (`Q`, `K_T`, `V`,
   `Head 1`, `Head 2`) beside the final piece on one canvas and referencing them from child spaces triggers `pieces`
   errors (`N pieces`), forcing deep nested definition spaces so every space has a single unconsumed end.
5. **No broadcasting on addition (`+`) and no subtraction (`-`) touch rule:** Corner-touch Times/Over broadcast scalars,
   rows, and columns, but vertical stack addition requires identical shapes. Adding a `1 × d` bias vector $b$ to a
   `T × d` activation requires materializing `Ones_T · b` (or a `Tile`), and subtraction requires scaling by `-1` or an
   entry formula.
6. **No dynamic indexing / `gather` for token embeddings:** `text` streams emit integer Unicode code points and `slice`
   only supports static ranges, so token-ID lookup $E[\text{ids}]$ cannot be expressed; the input must be pre-embedded
   $X \in \mathbb{R}^{T \times d}$.
7. **No `sin` / `cos` in `expression.js` / `backend/formula.py`:** Formulas support `select`, `max`, `min`, `abs`,
   `sqrt`, `exp`, `ln`, `tanh`, and `erf`, but not trigonometric functions, so sinusoidal positional encodings and RoPE
   cannot be written directly as formulas.
8. **No numeric/backend toggle for typed blocks (symbolic blowup):** Typing exact numeric weights into a 2-layer
   Transformer causes `evaluate.js` (`nerdamer`) to build exponentially large nested symbolic `exp`/`erf`/`sqrt`
   expressions instead of deferring to float32. Weights must be stored in `data/*.csv` (or `noise` blocks) to trigger
   backend execution.
9. **Inference only (no `grad` / autograd):** Automatic differentiation and parameter updates are not yet implemented.
