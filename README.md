# Smart Factory

A canvas for building models by hand out of shapes: tensors you draw, touch together to multiply, add or combine
entry by entry, name, and open to define.

## Run it

    python3 server.py            # then open http://localhost:8000/

No build step and nothing to install: the page is plain files, and the server is the Python standard library.
(The backend, which works a model out in floating point and makes noise, is a second process with one dependency;
the page works without it. See "The backend".)
The server also keeps saved projects in `projects/` (see `projects/README.md`) and, when run from a git checkout,
pulls its branch from GitHub every 30 seconds, so a push shows up on the next reload.

The projects that come with the repository (`default-menu` and `example`) can be saved over like any other. A
project's `.config` is the machine's own and is not in the repository, so a save never puts it in the way of a pull;
what else of such a project was changed here gives way, file by file, to what the branch has changed too (see
`projects/README.md`). A save is 64 MB at most, and one that is refused is answered with why and changes nothing.

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
- `sources.js`, `tiles.js`: what a source is (zeros, ones, identity: an entry from its place alone; noise and a data
  file, whose numbers the backend has), and what a tile
  means (its counts, which cells are drawn, the index, its matrix, how an arrow is repeated in it, when one tile
  is inside another and which tiles overlap); no drawing.
- `inner.js`: what a shape holds where each of its entries is itself an array (its inner axes as they are kept,
  the number of data dimensions as it is typed, what an entry opened holds, and how it is all said); no drawing.
- `arrows.js`: what an arrow means (where its output is, what it covers, whether its edge is free, what it comes
  to, whether an input fits it, what can be seated on it, its entries one by one); no drawing.
- `values.js`, `expression.js`: what a value is (eight kinds) and how two combine; and a formula as it is typed, read
  and worked out. No drawing. `algebra.js` gives `combine` and the value helpers from `values.js` too.
- `graph.js`, `evaluate.js`: a whole project as one graph of matrix operations, plain JSON, and that graph worked
  out exactly. No drawing. Every exact number the page shows comes from these two: see "The graph and the evaluator".
- `decimals.js`, `backend.js`: the backend's numbers on the page (which entries are asked for, what is drawn of an
  answer or said in its place, how a decimal is shown) and when the backend is asked (half a second after the last
  change; an answer for an older state is dropped; whether there is a backend is asked again every quarter of a
  minute). No drawing, and the network and the clock are handed in.
- `backend/`: the backend itself, a separate Python process: see "The backend".
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

    node --test                                # the JavaScript: values, expression, algebra, arrows, sources, tiles, inner data, graph, evaluate, project, bus, history, ids, zip
    python3 -B -m unittest discover tests      # the server: saving, opening, what it will not serve, the PIN, and what it passes on to the backend
    backend/.venv/bin/python -B -m unittest discover -s backend/tests -t .      # the backend, with NumPy (see "The backend" for the environment)

Nothing to install: the tests use Node's own test runner (Node 20 or later) and Python's unittest. `tests/solver.js`
loads the maths solver the way the page does. The server's tests run a server of their own over an empty directory,
so they never touch `projects/`. What the server passes on to the backend is tested against a stand-in backend made
from the standard library. The second line also runs the backend's own tests as far as they go without NumPy (its
formula parser, its `validate` against `graph.js`'s, its data files, its limits) and skips the rest, saying so; the
third runs them all. `tests/fixtures.test.js` holds the backend's fixtures to what `graph.js` and `evaluate.js` make now.

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

The result of a product, a sum, or times and over is worked out: an entry whose numbers are all known is written as
its number, exactly (`3/4`, `2√3`, `1+√2`). An entry that depends on one not yet given stays in symbols, as what it is
made from (`a₁₁+b₁₁`; for a product, the row and the column it takes). See "The graph and the evaluator".

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

**What the output shows.** Its numbers, worked out exactly, whatever the function is: a pass-through, an entry
formula, or a definition space, which is worked out for whatever this arrow is given (a named arrow on two inputs
gives two outputs). Inside an arrow's space, `in` and everything made from it show the numbers of the arrow the space
was opened through. An arrow that reads a product, a sum or an elementwise result reads its numbers.

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

New, then Data in, draws a noise block; resting on Data in offers Noise and File. Their numbers are the backend's
(see "The backend"): with none running, such a block says "needs the backend" where its numbers would be.

| Kind | Its entries | On its face | In its panel |
| --- | --- | --- | --- |
| Noise | Numbers drawn from its distribution. They follow from its seed, the id of the block the variable was made as, and each entry's column and row, and from nothing else: moving it or resizing it changes no entry that still exists, every reference shows the same numbers, and the same project shows the same numbers on any machine. In a tile every cell holds other numbers, and the first cell holds what the block would hold outside the tile | `~` | seed (a whole number, 0 at first) and distribution (`uniform`, from 0 up to 1, at first; or `normal`, mean 0 and deviation 1) |
| File | The numbers of a CSV file: numbers with commas between them, every row as many, with or without a first row of names. The file is sent to the backend, which checks it, and the block takes its size. It is kept in the project's directory under `data/` and saved with the project | `csv` | Choose a CSV file… |

A file is chosen once the project has been saved under a name, since that is where it is kept: until the project
is on the server under the name it has, choosing is refused, and nothing is written. A file that is not a table of
numbers is refused with the line that is wrong, and an empty cell is never taken as zero. A number too large for
32 bits is refused; one too small for them (`1e-60`) is read as 0, and the block's panel says how many were. A file is never written
over: a second file of the same name is kept under a name of its own (`weights-2.csv`). A save keeps the files
some block reads and those an undo or a redo can still come back to, so a step back never finds its file gone;
a file nothing can come back to any more is let go at the next save after the project is opened again.

A source is drawn, moved, resized, named, referenced, fused and touched like any block, and its matrix shows its
values. It stores no entries: resizing it, or tying a side to a named length, changes how many it has and never
what they are. Typing an entry into one, standing a shape in its matrix (snap to matrix) and seating it on an
arrow's output are each refused, with the reason in the readout.

### Tiles

- **Make one.** New, then Tile, then drag a rectangle round blocks or over empty canvas. The rectangle is the
  pattern, in whole units; blank space inside it is part of the pattern. The blocks wholly inside it are in the tile.
- **Counts.** A tile repeats `across` and `down`, each a whole number of at least 1, starting at 1. Pull its right
  edge or its bottom edge to change one: the count changes by the whole patterns the pointer moves, from the count
  it had, whatever is drawn of the tile. Its filled size is the pattern times the counts.
- **Select it** by its frame's top or left line, or its name; drag there to move it with what is in it. Selected, its
  panel has the pattern's size and the two counts. A count can be typed as a formula, such as `@Keys.y`: it then
  follows that size, and the tile is drawn as one pattern with an ellipsis on the side it repeats toward. Such a
  formula reads only what is settled before anything is worked out: a width, a height, or the mass of a scalar that
  holds a number or a formula of those. A count that is not a whole number of at least 1, that reads anything else
  (an attribute, a gap, a mass that is worked out), or that depends on the tile's own size (the width of the block
  seated on the tile's own arrow, say) is refused; one found in a project that is opened counts as 1, and the tile
  is drawn in the warning colour. Where tiles lie one inside another (below), each tile's size is its own: an
  inner tile's count may read the block seated on the outer tile's arrow, or on the arrow of a tile beside it, and
  an outer tile's count what comes of a tile in its pattern. Only a real cycle is refused.
- **What is real.** Only the blocks of the first cell, the top-left one, exist. The others are drawn copies that
  cannot be selected. At most 64 cells are drawn; beyond that, the first three and the last each way, with an
  ellipsis between.
- **What is in it** is what is in its frame: drag a block onto the pattern to put it in, hold Shift to drag one out,
  name the tile by its name. Dragged without Shift, a block of a tile stops at the pattern's edge. Delete with the
  tile selected takes the tile off and leaves its blocks. A tile that an arrow is repeated in (see Map) is not moved
  on its own: it moves when that arrow's input moves.
- **A tile is not a matrix and touches nothing.** Blocks inside it touch one another as usual; nothing outside
  touches a block inside, however they lie.

### Tiles inside tiles

A tile may lie wholly inside another tile's pattern (its first cell, where the real blocks are). It is then part of
that pattern and is repeated with it, and it stays a tile in its own right, with its own counts, name, arrows and
panel.

- **Make one.** Draw a tile inside another tile's pattern, or draw a tile round all of another tile; or drag a tile
  by its frame and let it go wholly inside a pattern. The readout says which tile it is now in. Tiles lie one inside
  the next at most 8 deep.
- **It has to fit.** The inner tile's filled size (its pattern times its counts) lies inside the outer pattern,
  and clear of the filled size of any other tile in that pattern: inside a pattern it is the filled size that
  counts, whatever is drawn (an ellipsis takes no room in the matrix).
  Pulling its edge, typing a count, or making the outer pattern smaller is refused where it would run past. A count
  that follows a size can still grow past it afterwards: both tiles are then drawn in the warning colour, their
  panels say why, neither has a matrix, and the outer tile's copies show only what fits their cell.
- **Moving.** Dragged by its frame, an inner tile stays inside the outer pattern; hold Shift to drag it out, and it
  repeats on its own again. Moving the outer tile takes everything in it. Taking the outer tile off leaves the
  inner one a tile; taking the inner one off leaves its blocks in the outer tile.
- **What is in which.** A block belongs to the innermost tile it was put in: drag it onto the inner pattern to put
  it there, and Shift-drag it out onto the outer pattern or right away. A block of the inner tile touches only
  blocks of the inner tile; a block of the outer tile beside it does not touch it.
- **Its matrix.** The outer tile's matrix has the inner tile's matrix set in its place, in every cell. It exists
  when the inner tile has a matrix and the outer pattern is covered exactly by its own blocks and its inner tiles'
  filled sizes. An arrow on the inner tile reads the inner tile's matrix alone; where the two tiles share an edge,
  a click there means the inner tile, and the outer tile has the rest of that edge.
- **The index** a block reads is that of the innermost tile the block itself is in, whoever reads it: `index.x`
  in a block of the inner tile counts across the inner tile, and is the same in every cell of the outer tile; a
  block of the outer tile named in a formula of the inner tile, or read by an arrow there, still reads the outer
  tile's index; and a block in no tile has no index, though an arrow in a tile reads it.
- **What is drawn.** The outer tile's copies show the inner tile's cells too. No tile is drawn more than 64 times in
  all, counting the copies of it in the cells of the tiles it is in: an inner tile draws as many cells as that
  leaves it (its first three and its last each way, or just its first, with an ellipsis).

### Tiles that overlap

Two tiles may overlap only in that way. Drawing, moving or pulling a tile so that it would lie partly over another
is refused, with the reason in the readout. Tiles can still come to overlap: pasted over one another, opened from a
project file, grown by a count that follows a size, or carried along by an arrow repeated in them. Both tiles of
such a pair are then drawn in the warning colour, each one's panel says why, neither has a matrix, and an arrow on
either says so, naming the other tile where it has a name. Move one clear by its frame (or wholly inside the
other's pattern) and both are well again. Framing blocks (F, or dragging them onto a frame) never moves a tile's
pattern, so a framing gesture that would take a tile's frame out of the tile it lies in is refused.

### The index

Each cell has a place, counted from 1. A block in a tile is a different matrix in each cell only through the index:

- In any entry's formula, and in an arrow's entry formula, `index.x` and `index.y` are that entry's column and row
  counted across the whole filled tile: for a block at offset `(ox, oy)` in a pattern `pw` by `ph`, entry `c, r` in
  cell `(cx, cy)` has `index.x = (cx - 1) * pw + ox + c` and `index.y = (cy - 1) * ph + oy + r`. A block that reads
  the index has its entries written on its face and on every copy. Outside a tile the index is an error.
- In the block's definition space, `index.x` and `index.y` are listed as two matrices the size of the block, and can
  be dragged in: onto the canvas, or onto the definition's matrix to stand there. They go with the tile: when the
  tile is taken off, or the block is dragged out of it, the warning lists them and they are deleted.
- In the list on the right, a named block in a tile hangs under the tile, named or not, with `index.x` and `index.y`
  beside its `x` and `y`. Dragged onto a formula that is open, the name goes in.

### A matrix out of a tile

An arrow can be set against any edge of a tile (New, Function, then a click on the tile's edge, beside a copy where
the edge is also a block's). It reads the tile's matrix: every cell's blocks set in their places, the filled size.
The matrix exists when the pattern is covered exactly by blocks, with no gap and no overlap; otherwise the arrow is
drawn in the warning colour and its panel says what is wrong. Such an arrow always reads the whole tile, so its
start and span are not typed: seat a block on the output and take rows from that. Against a tile drawn elided, the
arrow's base runs along the edge as it is drawn, and only what lies against that drawn edge is in its way; the
output is the matrix's real size. A matrix of more than 4096 entries, or one worked out from such a matrix, is not
worked out in the page: the output shows its size, and the arrow's panel says why.

That is how a bias is added to every row: a tile round the 1-row bias, `down` set to the matrix's `y`, an arrow out,
and the seated result stacked under the matrix.

### Map

An arrow inside a tile whose input is outside the tile is repeated along its input. The tile must repeat only along
the edge the arrow sits on (across for `n` and `s`, down for `e` and `w`), and the pattern must be as long that way
as the arrow's span. In cell k the arrow starts `(k - 1)` spans further on. Every cell's output is one output, set
side by side, seated and used like any other. If the last cell runs past the input, the tile and the arrow are
drawn in the warning colour. The tile follows the arrow when the input moves. An arrow in one tile cannot be
repeated along another tile (it reads all of that tile): it warns, and says to seat the other tile's output first.
An arrow in a tile that reads a tile in that tile's own pattern is not repeated: its input is inside. An arrow in a
tile in a tile, whose input is outside both, is repeated along its input through both: in the next cell of the outer
tile it goes on where the cell before ended, so with the inner tile 4 across and the outer tile twice across it
covers eight columns. The same rules hold at each level (the outer tile repeats only along the arrow's edge, and its
pattern is as long that way as what the inner tile covers); where one fails, the arrow and both tiles warn. Its
output is one cell's; a block seated on it, in the outer pattern, holds each cell's numbers in that cell.

One `max(x, 0)` arrow under column 1 of a matrix, in a tile with `across` 4, is that function on every column.

`projects/sources-and-tiles` shows each of these, and `projects/tiles-inside-tiles` a tile in a tile.

## Inner data

A shape on the canvas stays a scalar, a vector or a matrix: its two drawn sides. Each of its entries may itself be
an array. The shape then has **inner axes**, an ordered list of lengths, each with a name or none, the same for
every entry: a 3 by 1 shape whose inner axes are 2 and 4 is three entries, each a matrix of 2 columns by 4 rows, 24
numbers in all. There are at most six. There are no lists: every entry of one shape holds the same inner size.

- **Setting them.** Select the shape. Its panel has a row, **data dimensions**, a whole number from 0 to 6 (a
  formula typed there is worked out once, when typed, and the number kept, as a side's length is). Raising it adds
  axes of length 1 at the end, and every number typed into the shape stays, at the first position of the new axis.
  Lowering it removes the last, after asking if numbers past its first position would be lost. Under it each axis
  has two rows: `d1` its length, and `d1 name` its name. An axis with a name is one length with every side and axis
  of that name, as a named side is: give a side that name and it takes the axis's length, and resizing either
  resizes the other. A scalar holds one number and nothing else: a 1 by 1 block is refused data dimensions, and
  says so. What something else defines holds what that gives it, and says so too: a part, an entry taken out, a
  seated block, a function's `in`.
- **How it looks.** The block has one paler sheet behind its face for each inner axis, down and to the right (at most
  three are drawn), and its measurement gains a line: `· 2 key × 4 embed`. The panel says what it is, `3 wide × 1
  tall · vector of 2 × 4 matrices`, and never counts dimensions. In a written matrix (a result, a definition's
  equation, the panel) such an entry is not a number: one in which any number has been given is a small bracket
  with its size, `[2×4]`, and one with nothing set in it is its symbol, `q₂`, as ever.
- **Opening an entry.** Press a bracket or a symbol in the panel's matrix (or in the result written beside a named
  shape on the canvas): the panel shows that entry's own matrix, written in full, under a trail, `‹ QKV › 2,1`.
  Type a number or a formula into any of its entries as into any other. Where there are more axes, its entries are
  brackets again, and pressing one goes a level further down. Press the trail, or Escape, to go back up. A number
  never given is unknown, at any depth: an entry with half its numbers typed is half known.
- **In a formula.** `k1`, `k2` and so on are the inner position of the entry the formula is in, as `index.x` is its
  place in a tile; an arrow's entry formula reads them too (`x + k1`). `@QKV.d1`, `@QKV.d2` are the lengths of the
  inner axes, beside `@QKV.x` and `@QKV.y`.
- **Touching.** Every rule acts on the two drawn sides and is repeated at each inner position. Two shapes' inner
  axes have to agree: as many, the same lengths, and no axis under two names. In a product, and in times and over,
  a shape with no inner data may meet one that has some, and is used at every inner position: one `X` against a `W`
  that holds three heads is three products. A sum never broadcasts: a shape with inner data and one with none do
  not add. A touch that does not agree is drawn in the warning colour with what differs beside it, `inner 3 ≠ 2`
  or `head ≠ layer`, as a side mismatch is. Nothing is broadcast, and nothing lines inner axes up from the right.
- **A 1 by 1 that holds inner data** cannot be made by typing; it arises as a result (a cut down to one entry of a
  shape of matrices). It is a matrix of one entry, not a scalar: it has no mass, does not scale what it touches,
  and is not passed over in a row of products.
- **Matrices into entries.** A shape dragged from the list onto the matrix of a shape whose entries hold matrices
  (two inner axes or more) stands for one entry, and has to be that entry's size. In the receiving shape's
  definition space its matrix is laid out entry for entry, each as large as the matrix it holds, and each standing
  shape lies at its entry's place. As ever, standing shapes are all or nothing: they define the shape once every
  entry has one, and are never mixed with typed numbers.
- **An entry taken out.** With an entry open in the panel, drag its trail onto the canvas: the block set down is
  that entry, the size of what it holds, and follows it, as a measure follows a side. It touches like any block.
  Nothing is typed into it: its numbers are the entry's. Delete the shape, and it goes with it, after the warning.
- **Functions.** An arrow set against a shape with inner data hands its function the covered rows or columns with
  what they hold: `in` is then, say, 3 by 1 of 2 by 4, and its entries are taken out inside the function. That is
  how several matrices travel as one input. A named arrow whose `in` holds no inner data can be set against a shape
  that has some: its function is run at each inner position, and its output holds those axes (so the function may
  not come to inner data of its own). An arrow's span, a cut's range and a tile's counts stay in drawn rows and
  columns, and carry inner data along untouched.
- **Sources** hold inner data like any shape: zeros and ones everywhere, an identity 1 where column equals row at
  every inner position, noise a different number at each. A data file holds none.
- **How much is worked out here.** The browser's limit counts numbers: columns times rows times every inner length,
  4,096 as before. A 4 by 4 shape of 16 by 16 matrices is worked out; one of 17 by 16 is the backend's.

- **Turning.** An arrow's span, a cut's range and a tile's counts never name an inner axis. To work along one, turn
  a use so that the axis is drawn. Each use of a variable has an axis order, as each use has T. Select a use of a
  shape that holds inner data: its panel lists its axes, `x y | head`, with a bar after the two that are drawn.
  Drag one to another place in the list, `head x | y`, and this use draws those two and holds the rest: its
  entries are still the variable's, read in that order, so a number typed into a turned use is typed into the
  variable. Now an arrow set under it covers heads, a cut takes a range of heads, and a tile repeats it as it lies.
  T on a turned use swaps the two axes it draws; dragging the axes back to `x y | …` takes the turn off, and an
  order that only swaps x and y is the transpose. The shape a variable was made as keeps the variable's own way
  round and is not turned (its rectangle is where the variable's two drawn lengths are kept): drag another use of
  it from the list and turn that. A turned use is the size its variable gives it, so nothing is typed on its
  sides or its data dimensions: change those on the shape it was made as, and every turned use follows. Copied
  and pasted, it is a shape of its own, lying as the use lay. In the graph it is a `transpose` with `order`.

`projects/inner-data` shows these.

## The graph and the evaluator

The page does no arithmetic. The whole project is built into a graph (`graph.js`), once for each state of the
project, and every number that is drawn is asked of the evaluator (`evaluate.js`). Looking about (the camera, the
selection) builds nothing, and after a change only what the change reaches is worked out again. The graph is plain JSON, and is the one description
of the model that anything else is to read: the backend (see "The backend"), an export.

    import { build, validate } from './graph.js';
    import { evaluate } from './evaluate.js';
    const graph = build(snapshot);             // snapshot: what project.js read() gives
    validate(graph);                           // [] when well formed, else what is wrong
    evaluate(graph, graph.blocks['b0x7m2c']);  // { type, entries } | { type, deferred: true } | { error: { code, note, node } }
                                               // (deferred with backend: true: made of noise or a data file, which only the backend has)

- A node is one matrix. Its `op` is one of `variable`, `matmul`, `scale`, `transpose`, `add`, `ewise`, `block`,
  `slice`, `source`, `noise`, `measure`, `map`, `apply`, `param`, `repeat`, `mapalong`, `stack` and `entry`; its `inputs` are the nodes it is
  worked out from, and nothing it depends on is anywhere else: a formula names its inputs `$1`, `$2`, holds no
  other name but `index.x`, `index.y`, `k1` to `k6` and an arrow's `x`, `i`, `j`, and `validate` reads every one to see that it is so.
- A node's `type` is `{ cols, rows, colsName, rowsName }`, with `inner`, the list of its inner axes
  (`[{ "length": 2, "name": "key" }, …]`), where its entries hold inner data, and no other key. An entry's key is
  then `"column,row,k1,k2,…"`. The rules stay two-dimensional: the evaluator runs each once for every inner
  position. `stack` puts matrices into the entries of one, `entry` takes one out, and a `transpose` with `order`
  turns the axes. The graph's `version` is 2; a version 1 graph holds none of this and is still accepted.
- A node's id says what it is, never where it sits: `matmul(v:b1,v:b2)`. The same product in two places is one
  node, and moving a block without changing what it touches leaves the graph exactly as it was.
- `spaces` says what each canvas comes to (each piece, each arrow and each tile, with its node or its error), and
  `blocks` which node each block stands for.
- A node in a function's body or a tile's pattern has `within`: every function and tile it belongs to, outermost
  first. A tile wholly inside another's pattern is one part of it (a `repeat` in a `repeat`). Tiles that overlap
  in any other way have no matrix: the tile and the arrow on it carry `no-source`, with why.
- What is wrong is written in the graph, never thrown: a piece whose touches do not agree, a variable whose
  definition is another size, an arrow whose span runs past its input. An error is `{ code, note }`, on a piece, a
  variable, an arrow or a tile. A variable with an error keeps its size and its entries, so everything round it is
  still checked. A formula that does not read, or names what is not there, is the error value in its entry.

What changes on the canvas with this:

- **A definition is a value.** A shape whose definition space comes to one matrix of its own size has that matrix
  for its value, wherever it is used; entries typed into it are kept and not used. Where its definition comes to
  another size, or to more than one piece, it keeps the entries typed into it, and its panel says why.
- **Unknown stays unknown.** An entry that depends on one not given is not worked out: a known zero times an
  unknown is still unknown, since the unknown could be an infinity.
- **One entry's error is one entry's.** A division by zero, or `∞ − ∞`, is the error mark in that entry and the rest
  of the matrix is worked out. Nothing times an infinity is such an error.
- **A variable that depends on itself** (through its definition, a formula or a seat) has no value, and its panel
  says so; everything that does not depend on it is worked out as usual.
- **Large matrices.** A result of more than 4096 entries, or one worked out from a matrix that large, is not
  worked out in the browser: its size is shown, and its entries stay symbols. (A length read off a large matrix
  is still a number: `@Big.x` does not wait on `Big`.)

`projects/graph-and-evaluator` shows each of these.

## The backend

A second process, in `backend/`, reads the same graph and works it out in floating point: at any size, including
the functions the browser leaves symbolic (`exp`, `ln`, `tanh`, `erf`), and it makes noise and reads data files. The
page works without it, and everything above is as it is without it.

    uv venv backend/.venv && uv pip install --python backend/.venv/bin/python -r backend/requirements.txt
    backend/.venv/bin/python -m backend 8001        # from the repository's root; then start server.py as ever

(any way of making a Python environment with `backend/requirements.txt` installed will do; it is NumPy and nothing
else, held to one exact version). It listens on this machine only, `127.0.0.1`. The page never talks to it:
`server.py` passes `/api/backend/health`, `/api/backend/run` and `/api/backend/data` on to the address in the
`SMART_FACTORY_BACKEND` environment variable (`http://127.0.0.1:8001` where it is not set), so the PIN covers it.
Its projects directory is `projects/` beside `backend/`, or `SMART_FACTORY_PROJECTS`.

Nothing but `server.py` can ask it anything. Each time it starts, the backend makes a token, 32 random bytes, and
writes it to a file only its owner can read: `backend/.token` (never in git), or the path in the
`SMART_FACTORY_BACKEND_TOKEN` environment variable. `server.py` reads that file and sends the token with whatever
it passes on; a request without it is answered with a refusal and nothing else. So the two have to be able to read
the one file: run them as the same user, and give both the variable where it is set.

Each of its two workers may hold a quarter of the machine's physical memory in arrays, and a run that would need
more is refused before any of it is made. `SMART_FACTORY_BACKEND_MEMORY` sets that figure, in megabytes for each
worker (`SMART_FACTORY_BACKEND_MEMORY=512`): set it on a machine that has other work to do.

To keep it running beside the server, a unit of its own, `/etc/systemd/system/smart-factory-backend.service`. It
runs as a user with no privileges, here one called `smart-factory`, which can gain none, is held to a share of the
machine's memory whatever a run does, and can write in two places only: its own directory under `/run`, where the
token goes, and `projects/`. Change the user and the path (`/srv/smart-factory` here) to your own:

    [Unit]
    Description=Smart Factory backend
    After=network-online.target
    [Service]
    User=smart-factory
    Group=smart-factory
    WorkingDirectory=/srv/smart-factory
    RuntimeDirectory=smart-factory-backend
    RuntimeDirectoryMode=0700
    Environment=SMART_FACTORY_BACKEND_TOKEN=/run/smart-factory-backend/token
    ExecStart=/srv/smart-factory/backend/.venv/bin/python -B -m backend 8001
    NoNewPrivileges=true
    MemoryMax=60%
    ProtectSystem=strict
    PrivateTmp=true
    ReadWritePaths=/srv/smart-factory/projects
    Restart=always
    RestartSec=2
    [Install]
    WantedBy=multi-user.target

- `MemoryMax` is a little above the half of the machine's memory the two workers may take between them, with room
  for Python itself; where `SMART_FACTORY_BACKEND_MEMORY` is set (an `Environment=` line), set it to a little
  over twice that many megabytes. Past it the kernel stops the backend, and systemd starts it again.
- `ProtectSystem=strict` leaves the whole machine read-only to it but for `ReadWritePaths` and its directory under
  `/run`. What it writes there is a data file a user chose, into `projects/<name>/data/` and nowhere else
  (`backend/data.py`). A unit cannot name `projects/*/data` for projects not yet made, so the unit holds it to
  `projects/` and the backend's own rule to `data/` within it.
- The backend makes `data/` inside a project's directory, so that directory has to be its user's to write in, and
  `server.py` has to read the token. Both are so where `server.py` runs as the same user: `User=smart-factory` in
  the server's unit as well, `projects/` owned by that user, and the same `Environment=` line for the token
  (`systemctl edit smart-factory` adds both without changing the file). A server left running as root reads the
  token but makes project directories the backend cannot put a file in: choosing a file is then refused ("could
  not be kept"), and nothing else is affected.

**On the page.** The page asks, as it loads, whether there is a backend, and asks again every quarter of a minute
and at once after a run that could not be asked for, so one started or stopped later is noticed without loading
the page again. With one, whatever the browser does not work out (a result of more than 4,096 entries, anything
made of noise or of a data file) and every entry it leaves as one of `exp`, `ln`, `tanh` and `erf` (`exp(1)`,
`1+exp(2)`) is asked of it, half a second after the last change, and only at the entries that are drawn: the first
three and the last of a long side, never a whole large matrix. What the browser has exactly stays exact, and stays
as it is written: a whole number, a fraction, a root, `1+√2`. What comes back is a decimal. A decimal is for
showing and for nothing else, and is never mixed up with an exact number:

- in a matrix written on the canvas (a result beside a piece, an arrow's output, a tile's copies) it is a filled
  square: black at 0 or below, white at 1 or above, grey between, with its number as its title;
- in the properties panel and in a definition space's equation it is written out with exactly 9 significant digits
  (`2.71828175`, `1.00000000`, `1000000.00`, `2.90488498e13`), slanted and with `≈` before it, so that even one
  with a whole value is never written as an exact number is. Where it stands for a value the browser holds exactly
  (`exp(1)`), that is written under it;
- a single entry whose number is the backend's shows it on its face marked the same way;
- nothing the page works out reads one. An attribute, a side, a mass, a comparison, a formula that names such an
  entry all read the exact value (`@S.mass*2` with `S` holding `exp(2)` is `2·exp(2)`, with a backend and without
  one), and where the browser has no exact value (noise, a file, a result too large) they have none;
- while a newer answer is waited for, the previous numbers in that place are drawn dimmed (a noise block given a
  new seed shows its old numbers dimmed until the new arrive); an answer that arrives for an older state of the
  project is dropped;
- it is never saved, and is no entry of any block: results are asked for again when the project is opened.

With no backend, whatever is made of noise or of a data file says "needs the backend" where its numbers would be,
on the canvas and in its panel, whether it is one block, a piece of several or an arrow's output; nothing else
changes. Where there is a backend and it gives no numbers, why is written in their place ("unknown entries in
Keys", "asking the backend" while the first answer is waited for) and in the readout when the reason arrives.

**What it answers.** `GET /health` gives `{ "ok": true, "version": 2 }` (the version of graph it reads; it still takes a version 1 graph). `POST /run` takes
`{ "graph", "want": [{ "node", "cells": [[c, r], …], "binding", "as" }], "tick": 0, "project" }` and gives
`{ "results": { key: { "cols", "rows", "cells": [[c, r, value], …], "min", "max", "mean" } }, "errors": { key: why } }`
(for a node whose entries hold inner data a cell is `[c, r, k1, …]`, the result has `"inner"`, its inner lengths,
and each answer is `[c, r, k1, …, value]`; it holds every array with rows and columns as its last two axes);
`POST /data?project=<name>&path=data/<file>.csv`, with the file as its body, gives `{ "path", "cols", "rows" }`, and
`"small"` where some of its numbers are too small for 32 bits and are read as 0: how many.
`backend/run.py` has each in full.

**Its rules.**

- It never guesses a value. A node worked out from a variable with an entry that was never given is an error
  naming it, `unknown entries in Keys`, never zeros.
- It runs data, not code. The graph is JSON; a formula is read by a parser written for the formula language
  (`backend/formula.py`), and nothing in a request reaches `eval`, `exec`, a shell or an import. A file's path is
  resolved inside the named project's `data/` directory and nowhere else, and no link is followed.
- It checks everything it is sent with the same checks as `validate` in `graph.js`, written again in Python
  (`backend/check.py`) and held to the JavaScript on the same graphs.
- Numbers are 32-bit floats. For every graph the browser works out exactly, its numbers equal the exact ones within
  1e-5 of the value's size or 1e-6, whichever is larger: `backend/fixtures/` holds graphs and their exact results,
  generated by `node backend/fixtures/generate.mjs` from `evaluate.js`.
- Noise is the generator written out at the top of `backend/arrays.py`, the same on any machine.
- All array code is in `backend/arrays.py`, the one module that imports NumPy, so another library can take its place.
- It refuses what is outsized, with the reason: a request of more than 5 MB; a graph of more than 20,000 nodes; any
  node of more than 16 million entries; a run that takes longer than 30 seconds, which is stopped; an uploaded file
  of more than 50 MB. The five numbers are together at the top of `backend/limits.py`, with its smaller bounds
  beneath them: a run that would hold more in arrays than a worker may (see above), more than 65,536 entries asked
  for in one run, more than 64 files or 200 MB under one project's `data/`.
- A file goes only into a project that has been saved (it has a `project.json`), and never over another file. Its
  first line is a row of names only where none of its cells is a number; a number that 32 bits cannot hold is
  refused, naming the line.
- Told to stop, it ends its workers; a worker whose backend has gone ends itself.

`projects/noise-and-data` shows a noise block, a block that reads a data file, and `exp` of a block holding 0 and 1.

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
