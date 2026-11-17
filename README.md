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
- `bus.js`: the message bus. Everything the user does takes effect as a named message of plain data (blocks by id)
  sent through it; it keeps a log and can be tapped before and after each message, which is where history and undo
  will attach. What each message does is listed under "messages" in `smart-factory.js`.
- `history.js`: undo and redo, as a tap on the bus: the project before and after each action that changed it.
- `ids.js`: a seeded source of ids and of chance, kept with each project, so groups keep their ids and the same
  messages make the same choices.
- `system.js`: the program's own variables, the tree a `.config` shadows.
- `shapes/`: the kinds of block, one config each, listed in `shapes/index.json`.
- `projects/`: saved projects, including `default-menu`, what the page opens on until you save a `menu` of your own.
- `server.py`, `smart-factory.service`: the server and the unit that keeps it running.
- `tests/`: tests of everything that does no drawing, one file to each file tested.

## Tests

    node --test                                # the JavaScript: expression, algebra, project, bus, history, ids, zip
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
the result's size), then touch that. So `x · W + b` is two steps.

**Where a result is written.** Beside its piece, after an `=`. A Times or Over pair is different: the two shapes
enclose two empty rectangles, and the result is written in one of them, on the bare canvas (the lower right one for
Times, the lower one for Over). `.show_hadamard_copies` in the `.config` chooses: `1` (the default) writes it in one,
`2` in both, `0` beside the piece like any other result. Only a rectangle the size of the result is used, so with a
repeated operand there may be one, or none, and the result goes beside the piece. Clicking the matrix names the
result, wherever it is written.

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
were. If one of the shapes to be removed has been named and is used elsewhere, the usual warning is shown first.

A menu item that the selection does not allow is greyed. Choose it anyway and the readout says why.

**What a cut or an intersection makes.** The two shapes are taken off the canvas and kept, whole. Each new shape is
a part of one of them, its source, in whole columns and rows:

- It has no entries of its own. Its entries are the source's in those columns and rows, whatever they are now. If
  the source is one use of a variable, typing a number into the variable anywhere changes the part at once, and the
  variable itself is untouched by the cut. Nothing can be typed into a part: the readout says to change the source.
- Columns 3 and 4 stay columns 3 and 4 however the source is resized. A part that reached the source's right or
  bottom edge keeps reaching it as the source grows or shrinks. A part is always the size of its range, so it cannot
  be resized by hand.
- If the source becomes too small to have the part at all, the part is drawn in the warning colour and has `no value`
  until the source is large enough again.
- New shapes are unnamed and take the tensor colour. Named, a part is a variable like any other.
- A side that takes in the source's whole side keeps the name given to that side. A side that was shortened shows a
  label made from what the two shapes called that side: `A-B` on what is left of a, `B-A` on what is left of b,
  `A&B` on an intersection, with `.1` and `.2` where one cut left two shapes of one source (`embed-Head.x.1`). A
  label is only a label, like a shape's automatic `Keys.x`: it makes no sides one length, lets no product pass by
  name, and does not shorten the written matrix. Type a name on the side to give it a real one.

Shapes standing in a definition's matrix that together cover it still define the variable with no command; that is
the other way to append.

`projects/boolean-tool` shows a fused shape, a cut and an intersection.

## How results are written

A result that would not come out as a whole number is left in algebraic form, never rounded to decimals: the side of
a scalar holding 2 is `√2u`, not `1.41u`; of 12, `2√3u`; of 9, `3u`. Roots are the only case so far, but this is the
rule for anything worked out later.

A scalar can hold any exact number: a whole number, a fraction or a root. Typing `3/2` as its side gives it a mass of
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

Arithmetic typed into the properties panel is worked out by [nerdamer](https://github.com/jiggzson/nerdamer), a
symbolic maths solver, version 1.1.13 (MIT licence). It is kept in the repository as `vendor/nerdamer.min.js`, with
its licence beside it, and loaded by the page before its own code, so nothing is fetched from elsewhere and there is
still no build step. `expression.js` is the only file that talks to it: it gets what was typed ready (root signs,
names turned into their values) and reads the answer back. To change solver, change that file.

## Attributes

Select one shape and the panel in the corner shows everything the variable has, together: its name, its two side
lengths (x and y), a scalar's mass, any attributes added to it, and its value. All of them can be typed over.

The plus button adds an attribute. Its name is whatever is typed; its value is a number or arithmetic with
`+ - * /`, powers and brackets, in the usual order (brackets, powers, times and divide, plus and minus). The
variable's other attributes can be used in it by name: `x`, `y`, `mass`, and the added ones. A power is written
`^( … )`, which is raised as soon as the bracket is closed, or by pressing Ctrl+. (Cmd+.) to go into a raised power
and again to come out. What the arithmetic comes to is written after it; a result that is not a whole number or a
fraction is left as it was typed. An attribute emptied of both name and value is removed. Attributes belong to the
variable, so every reference to it has the same ones; a pasted copy gets its own.
