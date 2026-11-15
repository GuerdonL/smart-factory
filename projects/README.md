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

## .config

A group named `.config` gives values to the theme's root variables (the ones in `smart-factory.css`) for the space it
is in and every space below it. Each shape in the group stands for the variable of its name: `tensor`, `data in` and
`--data-in` all work. A shape of three entries is a colour, as red, green, blue; a shape of one entry is a number.
A `.config` further down overrides the ones above it, for its own space and below. It is saved as a file called
`.config` in its space's directory, so there can be one at every level; the Menu's is the project's root `.config`.

## example/

A small hand-written project showing every kind of file: a shape with a definition, a shape with numbers typed
into it, a named group, a commented-out shape, two shapes with the same name, and a name that is not a legal file
name.
