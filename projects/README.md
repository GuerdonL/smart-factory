# Projects

A saved project is a directory in here. Shapes and files are the same tree:

- a space is a directory;
- each shape in it is one `.json` config file;
- a shape with a definition space has a directory of the same name beside its file, holding that space the same way;
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

## .config and shadowing

The program's own variables exist from the start, above the Menu. The tree is in `system.js`: `.config` holds
`.integer_precision` (a whole number, not read yet) and `.colors`, whose two groups hold the colours, each a shape of
three entries, red, green, blue: `Shapes` (`.tensor_default`, `.data-in`) and `UI` (`.bg`, `.fg`, `.select`, ...).
`Shapes` also holds `.variable_colors`, an array of six colours, a row each: the ones a newly named shape takes at
random. The named colours themselves (`.lavender`, `.fanta`, ...) are not system variables: the default Menu carries
them as ordinary dotted shapes in a group called `Default Colors`.
They are behind the plus button under the list at the right edge, and can be dragged in from there.

A group named `.config` shadows the program's from its space downwards, and one further down shadows it again. It
covers only what it gives: a colour shape with one entry filled changes that one entry. It is saved as a file called
`.config` in its space's directory, so there can be one at every level; the Menu's is the project's root `.config`.

Every variable works this way: a shape with the name of one higher up shadows it from there down, entry by entry.

## example/

A small hand-written project showing every kind of file: a shape with a definition, a shape with numbers typed
into it, a named group, a commented-out shape, two shapes with the same name, and a name that is not a legal file
name.
