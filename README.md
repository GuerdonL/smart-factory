# Smart Factory

A canvas for building models by hand out of shapes: tensors you draw, touch together to multiply, add or combine
entry by entry, name, and open to define.

## Run it

    python3 server.py            # then open http://localhost:8000/

No build step and nothing to install: the page is plain files, and the server is the Python standard library.
The server also keeps saved projects in `projects/` (see `projects/README.md`) and, when run from a git checkout,
pulls its branch from GitHub every 30 seconds, so a push shows up on the next reload.

## Run it on a server, for good

On the machine, in a checkout of this repository on the branch to follow:

    sed "s#/root/smart-factory#$PWD#g; s#^User=root#User=$USER#" smart-factory.service | sudo tee /etc/systemd/system/smart-factory.service
    sudo systemctl daemon-reload && sudo systemctl enable --now smart-factory
    journalctl -u smart-factory -f       # "serving … on port 8000", then "updated to …" after each push

## The PIN

The server's password is a PIN, and it is not kept in the repository. Set it on the machine, in a file called `.pin`
beside `server.py`, and start the server again:

    echo 1234 > .pin && chmod 600 .pin        # your own digits; any text will do
    sudo systemctl restart smart-factory      # or stop and start `python3 server.py`

(or give it as `SMART_FACTORY_PIN` in the environment, which comes first). With a PIN set, nothing is answered without
it: the browser asks once, for a user name and a password. The password is the PIN; the user name can be anything. Five
different wrong PINs from one address within ten minutes and that address is turned away for ten minutes, whatever it
sends; each wrong PIN is written in the server's log.

If `.pin` is there but the server cannot read it (it belongs to another user, say) or its first line is empty, the
server does not start, and says why: it will not quietly run with no password. Only no `.pin` at all means no PIN.

It is a PIN, not a lock: over plain `http` it travels as typed and can be read on the way, so it keeps out whoever
finds the port, not whoever can listen to the network. With no PIN set, the server says so when it starts, and anyone
who can reach the port can read and overwrite the projects.

## Where things are

- `smart-factory.html`, `.css`, `.js`: the page, its theme (every colour and typeface), and the wiring.
- `components/`: one file per thing on screen, each carrying its own markup, styles and behaviour.
- `algebra.js`, `project.js`, `zip.js`: what shapes mean (the four touches, pieces and their rules; what a cut leaves, and what
  a part of a shape is), how a project is written to files, and zip; no drawing.
- `sources.js`, `tiles.js`: what a source is (zeros, ones, identity: an entry from its place alone), and what a tile
  means (its counts, which cells are drawn, the index, its matrix, how an arrow is repeated in it); no drawing.
- `arrows.js`: what an arrow means (where its output is, what it covers, whether its edge is free, what it comes
  to, whether an input fits it, what can be seated on it, its entries one by one); no drawing.
- `values.js`, `expression.js`: what a value is (eight kinds) and how two combine; and a formula as it is typed, read
  and worked out. No drawing. `algebra.js` gives `combine` and the value helpers from `values.js` too.
- `bus.js`: the message bus. Everything the user does takes effect as a named message of plain data (blocks by id)
  sent through it; it keeps a log and can be tapped before and after each message, which is where history and undo
  will attach. What each message does is listed under "messages" in `smart-factory.js`.
- `history.js`: undo and redo, as a tap on the bus: the project before and after each action that changed it.
- `ids.js`: a seeded source of ids and of chance, kept with each project, so groups keep their ids and the same
  messages make the same choices.
- `system.js`: the program's own variables, the tree a `.config` shadows.
- `shapes/`: the kinds of block, one config each, listed in `shapes/index.json`: `tensor`, `data-in` and `arrow`.
- `projects/`: saved projects, including `default-menu`, what the page opens on until you save a `menu` of your own.
- `server.py`, `smart-factory.service`: the server and the unit that keeps it running.
- `tests/`: tests of everything that does no drawing, one file to each file tested.

## Tests

    node --test                                # the JavaScript: values, expression, algebra, arrows, sources, tiles, project, bus, history, ids, zip
    python3 -B -m unittest discover tests      # the server: saving, opening, what it will not serve, and the PIN

Nothing to install: the tests use Node's own test runner (Node 20 or later) and Python's unittest. `tests/solver.js`
loads the maths solver the way the page does. The server's tests run a server of their own over an empty directory,
so they never touch `projects/`.

## Touching

Shapes are combined by touching, and only by touching. There are four ways to touch, and each draws a mark where
the shapes meet:

    PRODUCT  A · B          SUM  A + B        TIMES  A ∘ B            OVER  A ⊘ B

    +-----+-----+           +-----+                  +-----+           +-----+
    |  A  |  B  |           |  A  |                  |  B  |           |  A  |
    +-----+-----+           +-----+            +-----+-----+           +-----+-----+
                            |  B  |            |  A  |                       |  B  |
                            +-----+            +-----+                       +-----+

- **Product**: side by side along an edge. A's columns must be B's rows (by name where both sides are named). The
  mark is a `·` on the shared edge. A 1 by 1 shape scales whatever it touches.
- **Sum**: one directly on the other, the same width and the same left edge. They must be the same height too. The
  mark is a `+` on the shared edge. Any number of shapes can be stacked in one sum. A stack never appends rows, and a
  sum never repeats a smaller shape to fit a larger one.
- **Times**: B's bottom-left corner on A's top-right corner. Entry by entry, A times B. The mark is a `∘` in a ring
  on the corner.
- **Over**: B's top-left corner on A's bottom-right corner. Entry by entry, A divided by B. The mark is a `÷` in a
  ring on the corner.

Times and Over need equal sizes, or one of three repeats: a 1 by 1 shape is applied to every entry (a scalar holding
1 over A is A's reciprocal, entry by entry); a single row with the other's number of columns is applied to every row;
a single column with the other's number of rows is applied to every column. Several shapes can run along diagonals
in one chain, mixing the two; it is read left to right, `(A ∘ B) ⊘ C`. There is no touch for subtraction: scale by a
scalar holding -1, name the result, and stack it.

A touch that is not defined draws its mark in the warning colour with what does not agree (`2 ≠ 3`, `embed ≠ key`).

**One rule per piece.** Shapes joined by touching are a piece, and a piece is all products, all one sum, or all
times and over. A piece that mixes them is `mixed rules`, and every mark in it turns to the warning colour. To use
one result inside another rule, name it first (click its matrix and type a name: its shapes fold into a new shape of
the result's size), then touch that; or carry it out with an arrow (see "Arrows") and touch the block seated on the
arrow's output. So `x · W + b` is two steps.

**Where a result is written.** Beside its piece, after an `=`. A Times or Over pair is different: the two shapes
enclose two empty rectangles, and the result is written in one of them, on the bare canvas (the lower right one for
Times, the lower one for Over). `.show_hadamard_copies` in the `.config` chooses: `1` (the default) writes it in one,
`2` in both, `0` beside the piece like any other result. Only a rectangle the size of the result is used, so with a
repeated operand there may be one, or none, and the result goes beside the piece. Clicking the matrix names the
result, wherever it is written. Named in a hollow, the result is not folded away: a block of that name is seated in
the hollow and the two shapes stay where they are (see "Arrows").

The result of a sum, or of times and over, is written as its size and its entries in symbols (`a₁₁+b₁₁`), as a
product's is; it is not worked out in numbers yet.

Projects saved before this (format 2) took a stack to mean rows appended. Opening one, each such stack is fused into
one shape, as Difference would fuse it, which still appends, so the project means what it did; the readout says how many were fused.
Two other arrangements meant nothing then and mean something now: shapes that meet at a corner, and a shape directly
under one that is in a product. Those are left exactly where they are, and the readout says how many pieces read
differently, so that you can look for them.

## Difference, Intersect and Revert

Three commands in the right-click menu work on the selected shapes by where they lie, not by touching.

**Difference** is what exactly one of the selected shapes covers. It does one of two things:

- *Fuse.* Two or more shapes that do not overlap and together fill one rectangle exactly become one shape, that
  rectangle. It keeps the shapes it was fused from: each keeps its colour on the face, with a wavy seam where two
  meet, and its entries are theirs. This is how rows or columns are appended.
- *Cut.* Exactly two shapes laid one over the other. The part they share is taken out of both, and what is left of
  each becomes new shapes. Neither is the cutter: the order does not matter.

```
band at an edge          band in the middle        partial overlap, same rows     refused
+------+----+            +----+----+----+          +------+---+------+            +----------+
| left | I  |            |left| I  |left|          | left | I | left |            | a  +---+ |
+------+----+            +----+----+----+          +------+---+------+            |    | b | |
 one shape                two shapes                two shapes                    +----+---+-+
```

What is left of a shape has to be one rectangle, or two either side of a band that crosses it; a shape that lies
wholly inside the other leaves nothing. If what is left would turn a corner or go round a hole, the whole cut is
refused, and so is a cut of two shapes that are the same rectangle. Three or more shapes of which some overlap are
refused: a cut takes exactly two.

**Intersect** takes exactly two overlapping shapes and makes one new shape of the part they share. Its entries are
those of the lower shape (the one drawn first); the upper one is only a stencil. Lay a block over the columns you
want of a matrix and Intersect: that is how one head is taken out. A small shape in the middle of a large one can be
intersected, though it cannot be cut.

**Revert** undoes any of these: a fused shape comes apart into the shapes it was fused from, and for a shape made by
a cut or an intersection every shape that command made is removed and the two original shapes come back where they
were: at the same place in the drawing order and in the same frames, so the project is as it was before the
command. If one of the shapes to be removed has been named and is used elsewhere, the usual warning is shown first.

A menu item that the selection does not allow is greyed. Choose it anyway and the readout says why.

**What a cut or an intersection makes.** The two shapes are taken off the canvas and kept, whole. Each new shape is
a part of one of them, its source, in whole columns and rows:

- It has no entries of its own. Its entries are the source's in those columns and rows, whatever they are now. If
  the source is one use of a variable, typing a number into the variable anywhere changes the part at once, and the
  variable itself is untouched by the cut. Nothing can be typed into a part: the readout says to change the source.
  A named source stays in the list at the right edge while it is kept, so a use of it can be dragged out and
  changed even when the cut took its only one.
- Columns 3 and 4 stay columns 3 and 4 however the source is resized. A part that reached the source's right or
  bottom edge keeps reaching it as the source grows or shrinks. A part is always the size of its range, so it cannot
  be resized by hand.
- If the source becomes too small to have the part at all, the part is drawn in the warning colour and has `no value`
  until the source is large enough again. A shape fused from such a part is drawn and valued the same way.
- Deleting every shape a cut made deletes the two kept shapes too, and with them whatever refers to them (a
  reference, a length taken from one), after the usual warning. Deleting the variable a kept shape is a use of
  takes that cut's shapes with it, also after the warning, and puts the other kept shape back on the canvas.
- New shapes are unnamed and take the tensor colour. Named, a part is a variable like any other.
- A side that takes in the source's whole side keeps the name given to that side. A side that was shortened shows a
  label made from what the two shapes called that side: `A-B` on what is left of a, `B-A` on what is left of b,
  `A&B` on an intersection, with `.1` and `.2` where one cut left two shapes of one source (`embed-Head.x.1`). A
  label is only a label, like a shape's automatic `Keys.x`: it makes no sides one length, lets no product pass by
  name, and does not shorten the written matrix. Type a name on the side to give it a real one; a part cannot
  change size, so every side of that name then stays that length, and the readout says why when you try.

Standing shapes (snap to matrix) are the other way to append, with no command: a variable dragged from the list
onto a shape's matrix stands there in place of the entries it covers. Standing shapes define the variable only once
together they cover every entry of its matrix; until then it keeps its own typed entries, and the two are never
mixed. (The code and the file format called a standing shape a `tile` before phase 5; a tile is now a region that
repeats.)

`projects/boolean-tool` shows a fused shape, a cut and an intersection.

## Entries, values and formulas

Every value is typed in the same kind of field: an attribute's value, the x, y and mass rows of the properties
panel, and every matrix entry. An entry can be typed in three places: in the panel's matrix, in the shape's definition
space, and in the `= [ … ]` written beside a named shape that stands on its own. Enter or clicking away keeps what was
typed, Escape puts back what was there, and typing nothing puts an entry back to its symbol.

What is typed is a value or a formula. A value written out is kept as that value: `7`, `-inf`, `3/4`, `2√3`, `true`.
Anything else is a formula and is kept as its text, never as its result: it is worked out each time it is shown, so
it follows whatever it refers to. A formula has:

- numbers, `+ - * /`, powers (`^`), brackets and the root signs `√` and `∜`, as before;
- comparisons, `== != < > <= >=`, which give true or false (written `T` and `F`), and `!a`, `a && b`, `a || b`;
- `select(c, a, b)`: a where c is true, else b. Only the chosen side is worked out, so `select(2 > 3, 1/0, 5)` is 5;
- `max(a, b)`, `min(a, b)`, `abs(a)` and `sqrt(a)`, worked out exactly;
- `exp(a)`, `ln(a)`, `tanh(a)` and `erf(a)`, which stay as they are unless they come out: `exp(0)` is 1, and
  `exp(2) + 1` is written `1+exp(2)`;
- `inf` (or `∞`), `true` and `false`.

No other function is read. A name that nothing knows, or text that is not arithmetic, is not kept, and the readout
says why.

**Referring to a variable.** Type `@` and a list of the variables in reach opens, narrowed as you type; the arrow
keys and Enter, or a click, choose one, and then one of its measures: its width `x`, its height `y`, a scalar's
`mass`, or an attribute. What goes in is a capsule, a pill in the variable's colour reading `Keys.x`. It is one
character to the cursor, and it holds the variable's block, not its name, so renaming the variable breaks nothing. A
measure can also be dragged from the list at the right edge onto a formula that is open, and goes in at the cursor;
a whole shape dragged there is its mass if it is a scalar, and otherwise is refused with "choose one of its
measures". A name typed out in full, `@Keys.x`, is turned into its capsule when the formula is kept. Inside a
variable's own formulas its attributes can still be used by bare name: `x`, `y`, `mass`, `heads`. So an entry typed
as `1/√(@Keys.x)` on a 4-wide `Keys` shows `1/2`, and `√(1/5)` once `Keys` is 5 wide.

**What an entry can come to.** A whole number; an infinity; an exact fraction or root (`3/4`, `√2`); true or false; a
symbolic value the browser cannot reduce to one number (`1+√2`, `exp(2)`), which is exact and is never turned into a
decimal; an error; or nothing yet. An entry not given a value is unknown and stays a symbol: it is not zero, and
whatever uses it is unknown too, so an entry using the mass of a scalar that has no number shows as a symbol. An
error is written `!` in the warning colour, and the properties panel says why: `divide by zero` (for that entry
only, not the whole matrix), `missing variable`, `depends on itself` (a formula that refers to itself, directly or
through others), `cannot be compared exactly` (two symbolic values so close that their order cannot be told), `too large to work out`
(a number of more than some 1,200 digits, or a very large one mixed with something that is not a single root), and
`∞ − ∞`, `0 × ∞` and `∞ / ∞`, which have no value. In a comparison infinity is larger than every number.

A matrix's sides are still whole numbers. A formula typed for one is worked out once, there and then, and has to
come to a whole number of at least 1. A scalar's sides and mass take any kind of value, or a formula.

Deleting a variable that formulas refer to warns first, saying how many; going ahead leaves those formulas in
place, each showing the error mark with "missing variable". Undo brings the variable back and they work again.

`projects/entries-and-values` shows each of these.

## Arrows

An arrow is a function, drawn as a triangle. Its base lies against rows or columns of an input, it points away, and
its output is written on the far side, as a matrix on the bare canvas. With nothing defined it passes its input
through unchanged, which makes it the way to carry a result somewhere else.

                gap
              |<---->|
    +---------+      +---------+
    |         |\     |         |
    |  input  | >    | output  |      side: e     start: 1     span: 3 (all rows)
    |         |/     |         |
    +---------+      +---------+

**Making one.** Right-click, New, Function, then click a free edge of a block, of a written result (beside a piece
of several shapes, or in a hollow) or of another arrow's output. The arrow appears there covering the one row or
column clicked, with a gap of 2. The edge under its base has to be free: no other block may lie against that part of
it. A click anywhere else makes nothing, and the readout says so.

**What it is made of.** Its input; the side of the input it is on (`n`, `e`, `s`, `w`: on `e` and `w` the base runs
along rows, on `n` and `s` along columns); the first row or column it covers and how many (start and span); the gap,
in units, from the input's edge to the output; an output size it promises, or none; and its function. The output's
place is never stored: it starts the gap away from the edge, level with the first row or column covered, always on
whole units. (A written result that an arrow reads is itself written on whole units: under its piece, that is half a
unit further right than a result nothing reads.) Move the input and the arrow and its output go with it. One arrow over twenty rows is one function
applied once to those twenty rows, and gives one output.

**Changing it.** Click the triangle to select it: a frame goes round it and its output. Drag it along its line to
change the gap, along the input's edge to change the start, and pull the knob at either end of its base to change
the span. Or type in the properties panel: name, side, start, span, gap, a name for the gap, the output size
(`4 × 3`, or empty for no promise) and the formula. Start, span and gap take a formula that comes to a whole number
of at least 1, worked out once. A gap given a name is listed at the right edge and can be dragged into a formula as
a measure; it never means anything but layout. What is refused (a span past the input, a gap of 0, an edge that is
not free) is said in the readout, and the arrow stays as it was.

**What the function is.** One of three things:

- *Nothing.* The covered rows or columns pass through unchanged.
- *An entry formula*, typed in the panel, worked out once for every entry of the output, in the language of
  "Entries, values and formulas". In it `x` is the input's entry at this place; `i` and `j` are this entry's column
  and row, from 1; a capsule for a whole matrix the size of the output (type `@`, choose the variable, then "all of
  it"; or drag the shape from the list onto the formula) is that matrix's entry at this place; and a capsule for a
  measure is that number. So ReLU is `max(x, 0)`, a causal mask is `select(i > j, -inf, x)`, an identity is
  `i == j`, and the larger of two matrices is `max(x, @B)`. A matrix that is not the size of the output is an
  error in every entry, and the panel says why. Nowhere else can a formula refer to a whole matrix.
- *A definition space.* Click an arrow that is selected to open it, as for a block. The space holds one block that
  cannot be deleted, renamed or resized, called `in`, drawn pale with a dashed edge: it is the covered part of the
  input, in size, side names and entries (for a named arrow used in several places, the size and side names are
  those of the arrow it was made as, which every other use has to fit). `= [output]` stands at the centre. What the space comes to is the
  function's result: touch `in` against a 4-row block and the arrow gives that product. Any variable in reach can
  be used there, `in` itself more than once (drag it from the list). Where the space holds arrows of its own, its
  result is the one thing in it nothing reads from.

A formula comes first; with none, the definition space; and where that holds only `in`, the input passes through. A
function never changes its input.

**What the output shows.** A pass-through and an entry formula show their numbers, worked out exactly. An arrow
defined in its space shows its size and its entries as symbols; so does one whose input is a product, a sum or an
elementwise result, which are not worked out in numbers yet.

**Checking.** With no output size set, the output is whatever size the function comes to. With one set, an arrow
whose function does not come to it is drawn in the warning colour, with its output, and its definition space shows
`≠`; where a block is seated on the output and both it and the result name a side, the names must agree too. An
arrow is also drawn in the warning colour when its input is gone, when its span runs past its input, and when
another block has been set against the edge under its base. Select it and the panel says which. All of this is
worked out from the project itself, for every space at once, whether or not it is on screen: changing an arrow
changes what is inside its definition space there and then, and going into a space never changes anything.

**The seat.** The output is not a block, so it touches nothing. To use it in a product, a sum or on a diagonal it
needs a block, and a block that sits on an output is seated:

- Click the output and type a name: a block of that name is made, seated on it.
- Or drag a block onto the output. The arrow's output size becomes the block's size.
- A seated block is drawn inside the output's brackets, a little inset. Its value is the arrow's output; nothing can
  be typed into it, and the entries it held before are kept in the file and not used. It is the size of the output
  and follows it.
- It is an ordinary block for touching: set a 4-row block against the right edge of a 4-wide seated block and that
  is a product.
- Drag it along the arrow's line to change the gap. Drag it off the line and it stays seated, and a reference to it
  is set down where it was dropped. References to a seated variable show the arrow's output.
- Only an unnamed block, or the one use of a variable that nothing else defines, can be seated: a reference, a
  variable used in several places, one with shapes in its definition space, a part of another shape, a fused shape
  and a block that is seated already are each refused, with the reason. So is the block the arrow itself reads,
  directly or through other arrows: an output cannot be the block it is made from.
- A seat is what defines a seated variable, so its definition space cannot be gone into: the readout says so.
- A seat is never put on another block. Where the output's place would lie over one (its input was moved, or the
  pair it read from was split), the seated block is left where it was, and it and the arrow turn to the warning
  colour until there is room.
- Unseat, in the right-click menu, takes a block off its seat and leaves it where it is, with the entries it had.
- An arrow, the block `in` and a seated block are not cut, fused, folded away or transposed; the readout says why.

**In a hollow.** Naming the result of a Times or Over pair in its hollow seats a block there in the same way, and
leaves the pair alone. A block in a hollow lies between the two shapes and takes no part in touching: drag it
straight out along its row or its column, at least a unit clear, and a pass-through arrow is made from the hollow's
result to it, with the block seated on that arrow. Where `.show_hadamard_copies` is 1, the hollow the result is
written in is the one an arrow reads from.

**Deleting.** Deleting an arrow's input deletes the arrow, and deleting an arrow deletes the block seated on it and
any arrow that reads its output, after the usual warning. Deleting a seated block leaves the arrow.

**Named arrows.** An arrow given a name is a variable, listed at the right edge with a small triangle. Drag it from
the list onto a free edge and it is the same function on a new input: change the formula through either and both
change. The new input has to fit the function's own input: each side of `in` that has a name must meet a side of
that name, and each side without one a side of the same length. Dropped anywhere but an edge it is refused with
"set it against rows or columns".

**The program's functions.** Seven come with the program, behind the plus in the list with the other dotted names:
`.recip` (`1/x`), `.sqrt`, `.exp`, `.ln`, `.abs`, `.tanh` and `.erf`. Each is an ordinary entry formula, read in the
panel of an arrow that uses it. Dragged onto a free edge, one makes an arrow there over the whole side that refers
to it by name; it cannot be changed from there. An arrow of your own given one of those names shadows it, from its
space downwards, as a shape shadows a variable of the `.config`: every use of that name then applies yours. ReLU,
softmax and layer norm are not shipped: they are built from these, touching and `max`.

`projects/arrows` shows each of these.

## Sources and tiles

A source is a block that has values at any size without storing them. A tile is a region whose contents repeat a
whole number of times. Together they give constants, broadcasting and map. What a source is, is in `sources.js`;
what a tile means, in `tiles.js`; neither draws.

### Sources

New, then rest on Tensor: Zeros, Ones and Identity. (A click on Tensor itself draws a plain tensor, as before.)

| Kind | Entry at column i, row j | On its face |
| --- | --- | --- |
| Zeros | 0 | `0` |
| Ones | 1 | `1` |
| Identity | 1 where i equals j, else 0. It need not be square | `I` |

A source is drawn, moved, resized, named, referenced, fused and touched like any block, and its matrix shows its
values. It stores no entries: resizing it, or tying a side to a named length, changes how many it has and never
what they are. Typing an entry into one, standing a shape in its matrix (snap to matrix) and seating it on an
arrow's output are each refused, with the reason in the readout.

### Tiles

- **Make one.** New, then Tile, then drag a rectangle round blocks or over empty canvas. The rectangle is the
  pattern, in whole units; blank space inside it is part of the pattern. The blocks wholly inside it are in the tile.
- **Counts.** A tile repeats `across` and `down`, each a whole number of at least 1, starting at 1. Pull its right
  edge or its bottom edge to change one, in whole patterns. Its filled size is the pattern times the counts.
- **Select it** by its frame's top or left line, or its name; drag there to move it with what is in it. Selected, its
  panel has the pattern's size and the two counts. A count can be typed as a formula of sizes, such as `@Keys.y`:
  it then follows that size, and the tile is drawn as one pattern with an ellipsis on the side it repeats toward. A
  count that is not a whole number of at least 1, or that reads anything but a width or a height, is refused.
- **What is real.** Only the blocks of the first cell, the top-left one, exist. The others are drawn copies that
  cannot be selected. At most 64 cells are drawn; beyond that, the first three and the last each way, with an
  ellipsis between.
- **What is in it** is what is in its frame: drag a block onto the pattern to put it in, hold Shift to drag one out,
  name the tile by its name. Delete with the tile selected takes the tile off and leaves its blocks.
- **A tile is not a matrix and touches nothing.** Blocks inside it touch one another as usual; nothing outside
  touches a block inside, however they lie.

### The index

Each cell has a place, counted from 1. A block in a tile is a different matrix in each cell only through the index:

- In any entry's formula, and in an arrow's entry formula, `index.x` and `index.y` are that entry's column and row
  counted across the whole filled tile: for a block at offset `(ox, oy)` in a pattern `pw` by `ph`, entry `c, r` in
  cell `(cx, cy)` has `index.x = (cx - 1) * pw + ox + c` and `index.y = (cy - 1) * ph + oy + r`. A block that reads
  the index has its entries written on its face and on every copy. Outside a tile the index is an error.
- In the block's definition space, `index.x` and `index.y` are listed as two matrices the size of the block, and can
  be dragged in: onto the canvas, or onto the definition's matrix to stand there.
- In the list on the right, a named block in a tile hangs under the tile, named or not, with `index.x` and `index.y`
  beside its `x` and `y`. Dragged onto a formula that is open, the name goes in.

### A matrix out of a tile

An arrow can be set against any edge of a tile (New, Function, then a click on the tile's edge, beside a copy where
the edge is also a block's). It reads the tile's matrix: every cell's blocks set in their places, the filled size.
The matrix exists when the pattern is covered exactly by blocks, with no gap and no overlap; otherwise the arrow is
drawn in the warning colour and its panel says what is wrong. Such an arrow always reads the whole tile, so its
start and span are not typed: seat a block on the output and take rows from that.

That is how a bias is added to every row: a tile round the 1-row bias, `down` set to the matrix's `y`, an arrow out,
and the seated result stacked under the matrix.

### Map

An arrow inside a tile whose input is outside the tile is repeated along its input. The tile must repeat only along
the edge the arrow sits on (across for `n` and `s`, down for `e` and `w`), and the pattern must be as long that way
as the arrow's span. In cell k the arrow starts `(k - 1)` spans further on. Every cell's output is one output, set
side by side, seated and used like any other. If the last cell runs past the input, the tile and the arrow are
drawn in the warning colour. The tile follows the arrow when the input moves.

One `max(x, 0)` arrow under column 1 of a matrix, in a tile with `across` 4, is that function on every column.

`projects/sources-and-tiles` shows each of these.

## How results are written

A result that would not come out as a whole number is left in algebraic form, never rounded to decimals: the side of
a scalar holding 2 is `√2u`, not `1.41u`; of 12, `2√3u`; of 9, `3u`. Roots are the only case so far, but this is the
rule for anything worked out later.

A scalar can hold a value of any kind. Typing `3/2` as its side gives it a mass of
`9/4`; typing `2^(1/2)` (or `√2`) gives it a mass of 2. Only a matrix's sides have to be whole, because a matrix is
drawn on the grid.

A root is kept as a value in its own right (saved in an entry as `{ "n": 30, "k": 1 }`, n over an optional `d`, under k square roots), so
dropping the length `√30u` on the canvas gives an entry holding `√30`, whose own sides are `∜30u`. Nothing is turned
into decimals along the way.

Only whole numbers can be a side's length, with no exceptions and no rounding. A length that is not whole cannot be
dropped or typed onto a side, and a side that was following a scalar's side lets go of the name, keeping its size,
when the scalar's value stops giving a whole root.

## References and copies

What comes out of the list on the right is never a copy.

- A shape dragged from the list is a reference to its variable: the same entries, size, name, colour and definition
  as the shape the variable was made as (its source), and every one changes when any is edited.
- A length dragged from the list onto the canvas is an entry that *is* that side's length, in the source's colour:
  resize the source and the entry follows. It cannot be typed over; change the source.
- A named frame dragged from the list is made again with each named shape in it a reference to the original.

Copy and paste (Ctrl/Cmd+C, Ctrl/Cmd+V, or the menu) is how a separate thing is made: a paste is a variable of its
own, with its own entries, and takes a new colour every time.

Deleting a reference removes only that reference. Deleting a source removes everything that refers to it, in any
space; before it does, a warning lists the variables and how many instances of each would go, and the deletion can be
cancelled. In a project file a reference carries `"reference": true`, and a length taken from a shape carries
`"from": { "id": …, "side": "x" | "y" }`.

## The maths solver

Whole numbers, fractions and single roots are worked out by the program itself, exactly, in `values.js`. Anything
else (`√2 + √3`, `exp(2)`, comparing two such values) is handed to [nerdamer](https://github.com/jiggzson/nerdamer), a
symbolic maths solver, version 1.1.13 (MIT licence). It is kept in the repository as `vendor/nerdamer.min.js`, with
its licence beside it, and loaded by the page before its own code, so nothing is fetched from elsewhere and there is
still no build step. `values.js` is the only file that talks to it. To change solver, change that file.

## Attributes

Select one shape and the panel in the corner shows everything the variable has, together: its name, its two side
lengths (x and y), a scalar's mass, any attributes added to it, and its value. All of them can be typed over.

The plus button adds an attribute. Its name is whatever is typed; its value is a number or a formula (see
"Entries, values and formulas"), in the usual order (brackets, powers, times and divide, plus and minus). The
variable's other attributes can be used in it by name: `x`, `y`, `mass`, and the added ones, and any other
variable's measures through `@`. A power is written
`^( … )`, which is raised as soon as the bracket is closed, or by pressing Ctrl+. (Cmd+.) to go into a raised power
and again to come out. What the formula comes to is written after it, or why it comes to nothing. An attribute emptied of both name and value is removed. Attributes belong to the
variable, so every reference to it has the same ones; a pasted copy gets its own.
