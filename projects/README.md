# Projects

A saved project is a directory in here. Shapes and files are the same tree:

- a space is a directory;
- each shape in it is one `.json` config file;
- a shape with a definition space has a directory of the same name beside its file, holding that space the same way;
- a group is one combined `.group.json` file holding all of its shapes.

`project.json` at the top marks the directory as a project and records the lengths of the named sides.
The full format is described at the top of [`../project.js`](../project.js).

## Saving

Right-click the canvas and choose **Save project**.

- Opened from your own copy of this repository in Chrome or Edge, it asks for a folder. Make and choose
  `projects/<name>/`, and the files are written straight into it.
- Anywhere else, including the published artifact, it hands you `smart-factory-project.zip`. Unpack it here and
  rename the `project` folder inside.

Saving into a folder that already holds a project overwrites files of the same name but does not remove files for
shapes that no longer exist. Save into an empty folder if shapes have been deleted or renamed.

## Opening

Right-click and choose **Open project**, then **From a folder** or **From a zip**. Opening replaces everything on
the canvas.

## example/

A small hand-written project showing every kind of file: a shape with a definition, a shape with numbers typed
into it, a named group, a commented-out shape, two shapes with the same name, and a name that is not a legal file
name.
