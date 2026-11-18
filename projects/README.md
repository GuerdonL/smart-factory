# Projects

A saved project is a directory in here. Shapes and files are the same tree:

- a space is a directory;
- each shape in it is one `.json` config file;
- a shape with a definition space has a directory of the same name beside its file, holding that space the same way;
- a variable used in several places is a file for each use, with its definition's directory beside one of them only;
- a group is one combined `.group.json` file holding all of its shapes.

`project.json` at the top marks the directory as a project.
The full format is described at the top of [`../project.js`](../project.js).

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
it is in the list at the right edge, and dragged from there all of it is made again. What is named inside a named frame
is listed under it, not beside it. A frame is no scope of its own. Everything in a frame whose name begins with a dot
is a hidden variable, and its name is made lower case with a dot in front.

## .config and shadowing

The program's own variables exist from the start, above the Menu. The tree is in `system.js`: `.config` holds
`.integer_precision` (a whole number, not read yet), `.dark_mode` (0 for the light colours, 1 for the dark ones; left
blank, whatever the computer asks for), `.dark_colors` (the colours used while `.dark_mode` is 1, laid out like
`.colors`) and `.colors`, whose two groups hold the colours, each a shape of
three entries, red, green, blue: `Shapes` (`.tensor_default`, `.data-in`, `.function`) and `UI` (`.bg`, `.fg`, `.select`, ...).
`Shapes` also holds `.variable_colors`, an array of six colours, a row each: the ones a newly named shape takes at
random. The stylesheet has no colours for these (they are `--variable-1` to `--variable-6`, set from the array), and
the program has none of its own either. In the default Menu each `.variable_colors` (light and dark) is defined in its own definition
space: open it, and six colour vectors stand in the definition's matrix, a row each, ordinary shapes. Together they
fill it, and that is what `.variable_colors` equals. They are the only listing of the colours: change one's entries, or drag them to reorder.

A row of `.variable_colors` that is not given in full (the matrix has a hole, or a shape standing in it leaves an
entry as a symbol) is no colour: shapes that wear it are drawn with no fill. Nothing stands in for it.

A shape is defined only in its definition space, and only by shapes standing in the definition's matrix: once they
cover every entry, the shape's entries are theirs. Shapes set anywhere else, in that space or beside the shape on its
own canvas, are only pieces and define nothing.

Neither the program nor the stylesheet holds a value for any of these. They are written out, entry by entry, in the
Menu's `.config` (the default Menu gives every one, light and dark), and that is the only place they are set. A
colour no `.config` gives in full does not exist: a project with no `.config` has no canvas colour, no text colour
and no shape colours, and is drawn in whatever the browser does with none. `.dark_mode` alone has a fallback: left
blank, it is whatever the computer asks for.

A group named `.config` shadows the program's from its space downwards, and one further down shadows it again. It
covers only what it gives: a colour shape with one entry filled changes that one entry. It is saved as a file called
`.config` in its space's directory, so there can be one at every level; the Menu's is the project's root `.config`.

Every variable works this way: a shape with the name of one higher up shadows it from there down, entry by entry.

A `.config` reaches as far as the group it is in. One in no group covers its whole space and everything below; one
inside a group covers that group alone, with everything below its shapes. The default Menu uses this: `.dark_colors`
holds a small `.config` of its own with `.dark_mode` = 1, so that group is drawn in the dark colours it sets while the
rest of the Menu stays light.

## example/

A small hand-written project showing every kind of file: a shape with a definition, a shape with numbers typed
into it, a named group, a commented-out shape, two shapes with the same name, and a name that is not a legal file
name.
