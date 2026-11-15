/* A project on disk: the whole tree of shapes written as a tree of files, and read back.
   No drawing and no browser here: plain data in, file texts out, and the reverse.

   Shapes and files are the same tree. A space is a directory. Each shape in it is one config file, and a shape that
   has a definition space has a directory of the same name beside its file, holding that space in the same way.
   A group is one combined file holding all of its shapes.

       my-project/
         project.json              what this is, and when it was saved
         Embedding.json            a shape
         Keys.json                 a shape with a definition ...
         Keys/                     ... which is this directory
           Embedding.json
           Key Weights.json
         Pair.group.json           a group: several shapes in one file
         .config                   the group called .config, under exactly that name (see below)

   The project's own directory is the top space, the Menu.

   A shape's config:
       { "format": "smart-factory/shape", "version": 1,
         "type": "tensor",                       which config in shapes/ it is an instance of
         "name": "Keys", "named": true,          named: it has been given a name of its own
         "commented": false,                     its name begins with //, so it takes no part
         "color": "lazuli",                      a theme colour; null for an unnamed shape, which has its type's
         "position": { "x": -12, "y": 4 },       its top-left corner, in units from the space's origin
         "size": { "cols": 4, "rows": 6 },
         "sides": { "cols": "key", "rows": "context" },      the names of its sides, null where unnamed
         "value": { "as": "computation",         how its value stands (see below)
                    "entries": { "2,1": 0, "3,1": "-inf" } },   entries given a number, by "column,row"
         "definition": "Keys/",                  the directory holding its definition space, if it has one
         "order": 3,                             its place among the shapes of its space, back to front
         "parts": [ { "x": 0, "y": 0, "w": 3, "h": 2, "color": "lazuli" }, … ],      only on a shape joined from several:
                                                 the rectangles it was joined from, each with its colour
         "variable": 2 }                         shapes carrying the same number are one variable used in several
                                                 places: one name, size, colour, set of entries and definition
                                                 (each has the definition directory; they hold the same thing)
   value.as is "computation" when its definition space has shapes that work it out, "resolved" when every entry has
   been given a number, and "variable" otherwise. Infinity is written "inf" and "-inf".

   A named side's length is not stored anywhere else: it is the size of the sides that carry the name.

   A group's config:
       { "format": "smart-factory/group", "version": 1, "name": "Pair", "named": true,
         "shapes": [ { a shape's config }, … ],            the shapes directly in the group
         "groups": [ { "name", "named", "shapes", "groups" }, … ] }      the groups inside it, written the same way

   A group named .config is written as the file .config in its space's directory, in the same form as any group.
   The page reads it for root variables: see configure in smart-factory.js. There may be one at every level.

   write(project) -> [{ path, text }]       paths are relative to the project's directory, with / between parts
   read(files)    -> project                files: [{ path, text }]; throws if there is no project.json
   project: { top: space, saved: an ISO date }

   Format 1 had two spaces at the top: the top level, in the project's directory, and the settings, in _settings/.
   Now there is one, the Menu, which is what the settings were. Reading a format 1 project, _settings/ becomes the
   top; if the old top level had shapes too, they are kept inside one block called "Top level", set beside it.
   space:   { shapes: [shape], groups: [group] }
   group:   { name, members: [index into shapes, for the shapes directly in it], groups: [the groups inside it] }
   shape:   { type, name, color, x, y, cols, rows, colsName, rowsName, entries: { "c,r": number }, inside: space | null,
              variable: a number shared by shapes that are one variable, or null } */

export const FORMAT = 2;
const isCommented = name => /^\s*\/\//.test(name);
const bare = name => name.replace(/^\s*\/\/\s*/, '');
export const isNamed = name => !/^Shape \d+$/.test(bare(name));
const out = v => v === Infinity ? 'inf' : v === -Infinity ? '-inf' : v;
const back = v => v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v;

/* a name made safe to be a file's name, and different from every other in its directory */
function stem(name, taken){
  let s = bare(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+/, '').trim().slice(0, 80) || 'shape';
  if (/^(project|_settings)$/i.test(s)) s += ' shape';
  let t = s; for (let n = 2; taken.has(t.toLowerCase()); n++) t = `${s} (${n})`;
  taken.add(t.toLowerCase()); return t;
}

function valueOf(shape){
  const entries = Object.fromEntries(Object.entries(shape.entries || {}).map(([k, v]) => [k, out(v)]));
  const computed = !!shape.inside && shape.inside.shapes.some(s => !isCommented(s.name));
  let full = true; for (let c = 1; c <= shape.cols && full; c++) for (let r = 1; r <= shape.rows; r++) if (!(c + ',' + r in entries)){ full = false; break; }
  return { as: computed ? 'computation' : full ? 'resolved' : 'variable', entries };
}

export function write(project){
  const files = [];
  const space = (s, dir) => {
    const every = g => [...g.members, ...(g.groups || []).flatMap(every)];
    const taken = new Set(), grouped = new Set(s.groups.flatMap(every));
    const config = (shape, order) => { const name = stem(shape.name, taken);
      if (shape.inside) space(shape.inside, dir + name + '/');
      return [name, { format: 'smart-factory/shape', version: FORMAT, type: shape.type, name: shape.name, named: isNamed(shape.name), commented: isCommented(shape.name),
        color: isNamed(shape.name) ? shape.color : null, position: { x: shape.x, y: shape.y }, size: { cols: shape.cols, rows: shape.rows },
        sides: { cols: shape.colsName || null, rows: shape.rowsName || null }, value: valueOf(shape), ...(shape.inside ? { definition: name + '/' } : {}), order, ...(shape.variable != null ? { variable: shape.variable } : {}), ...(shape.parts ? { parts: shape.parts } : {}) }]; };
    s.shapes.forEach((shape, i) => { if (grouped.has(i)) return; const [name, c] = config(shape, i); files.push({ path: dir + name + '.json', text: JSON.stringify(c, null, 2) + '\n' }); });
    const inner = g => ({ name: g.name || null, named: !!g.name, shapes: g.members.map(i => config(s.shapes[i], i)[1]), groups: (g.groups || []).map(inner) });
    let hasConfig = false;
    s.groups.forEach((g, n) => { const body = inner(g), own = !hasConfig && (g.name || '').trim() === '.config', name = own ? '' : stem(g.name || 'group ' + (n + 1), taken);
      if (own) hasConfig = true;
      files.push({ path: own ? dir + '.config' : dir + name + '.group.json', text: JSON.stringify({ format: 'smart-factory/group', version: FORMAT, ...body }, null, 2) + '\n' }); });
  };
  files.push({ path: 'project.json', text: JSON.stringify({ format: 'smart-factory/project', version: FORMAT, saved: project.saved || null }, null, 2) + '\n' });
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
    const found = [], groups = [];                       /* found: [config, the group it is directly in, or null] */
    const take = c => { const g = { name: c.named ? c.name : null, members: [], groups: (c.groups || []).map(take) };
      for (const shape of c.shapes || []) found.push([shape, g]); return g; };
    for (const [path, text] of at){
      if (!path.startsWith(dir) || path.slice(dir.length).includes('/') || !(path.endsWith('.json') || path.slice(dir.length) === '.config') || path === 'project.json') continue;
      let c; try { c = JSON.parse(text); } catch (e) { throw new Error(path + ' is not valid JSON'); }
      if (c.format === 'smart-factory/shape') found.push([c, null]);
      else if (c.format === 'smart-factory/group') groups.push(take(c));
    }
    found.sort((a, b) => (a[0].order ?? 0) - (b[0].order ?? 0));
    const shapes = found.map(([c, g], i) => { if (g !== null) g.members.push(i);
      const inside = c.definition && [...at.keys()].some(p => p.startsWith(dir + c.definition)) ? space(dir + c.definition) : null;
      return { type: c.type || 'tensor', name: String(c.name ?? 'Shape'), color: c.color || null, x: +c.position?.x || 0, y: +c.position?.y || 0,
        cols: Math.max(1, Math.round(+c.size?.cols || 1)), rows: Math.max(1, Math.round(+c.size?.rows || 1)), colsName: c.sides?.cols || null, rowsName: c.sides?.rows || null,
        entries: Object.fromEntries(Object.entries(c.value?.entries || {}).map(([k, v]) => [k, back(v)])), inside, variable: Number.isInteger(c.variable) ? c.variable : null, parts: Array.isArray(c.parts) ? c.parts : null }; });
    return { shapes, groups };
  };
  const top = space('');
  if ((meta.version || 1) < 2 && [...at.keys()].some(p => p.startsWith('_settings/'))){      /* format 1: see the note above */
    const menu = space('_settings/');
    if (top.shapes.length) menu.shapes.push({ type: 'tensor', name: 'Top level', color: 'lazuli', x: Math.min(0, ...menu.shapes.map(s => s.x)) - 5, y: Math.min(0, ...menu.shapes.map(s => s.y)),
      cols: 3, rows: 2, colsName: null, rowsName: null, entries: {}, inside: top, variable: null });
    return { top: menu, saved: meta.saved || null };
  }
  return { top, saved: meta.saved || null };
}
