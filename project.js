/* A project on disk: the whole tree of shapes written as a tree of files, and read back.
   No drawing and no browser here: plain data in, file texts out, and the reverse.

   Shapes and files are the same tree. A space is a directory. Each shape in it is one config file, and a shape that
   has a definition space has a directory of the same name beside its file, holding that space in the same way.
   A group is one combined file holding all of its shapes.

       my-project/
         project.json              what this is, when it was saved, and the lengths of the named sides
         Embedding.json            a shape
         Keys.json                 a shape with a definition ...
         Keys/                     ... which is this directory
           Embedding.json
           Key Weights.json
         Pair.group.json           a group: several shapes in one file
         _settings/                the settings space, when there is anything in it

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
         "order": 3 }                            its place among the shapes of its space, back to front
   value.as is "computation" when its definition space has shapes that work it out, "resolved" when every entry has
   been given a number, and "variable" otherwise. Infinity is written "inf" and "-inf".

   A group's config:
       { "format": "smart-factory/group", "version": 1, "name": "Pair", "named": true,
         "shapes": [ { a shape's config }, … ] }

   write(project) -> [{ path, text }]       paths are relative to the project's directory, with / between parts
   read(files)    -> project                files: [{ path, text }]; throws if there is no project.json
   project: { top: space, settings: space, lengths: { name: units }, saved: an ISO date }
   space:   { shapes: [shape], groups: [{ name, members: [index into shapes] }] }
   shape:   { type, name, color, x, y, cols, rows, colsName, rowsName, entries: { "c,r": number }, inside: space | null } */

export const FORMAT = 1;
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
    const taken = new Set(), grouped = new Set(s.groups.flatMap(g => g.members));
    const config = (shape, order) => { const name = stem(shape.name, taken);
      if (shape.inside) space(shape.inside, dir + name + '/');
      return [name, { format: 'smart-factory/shape', version: FORMAT, type: shape.type, name: shape.name, named: isNamed(shape.name), commented: isCommented(shape.name),
        color: isNamed(shape.name) ? shape.color : null, position: { x: shape.x, y: shape.y }, size: { cols: shape.cols, rows: shape.rows },
        sides: { cols: shape.colsName || null, rows: shape.rowsName || null }, value: valueOf(shape), ...(shape.inside ? { definition: name + '/' } : {}), order }]; };
    s.shapes.forEach((shape, i) => { if (grouped.has(i)) return; const [name, c] = config(shape, i); files.push({ path: dir + name + '.json', text: JSON.stringify(c, null, 2) + '\n' }); });
    s.groups.forEach((g, n) => { const shapes = g.members.map(i => config(s.shapes[i], i)[1]);
      const name = stem(g.name || 'group ' + (n + 1), taken);
      files.push({ path: dir + name + '.group.json', text: JSON.stringify({ format: 'smart-factory/group', version: FORMAT, name: g.name || null, named: !!g.name, shapes }, null, 2) + '\n' }); });
  };
  files.push({ path: 'project.json', text: JSON.stringify({ format: 'smart-factory/project', version: FORMAT, saved: project.saved || null, lengths: project.lengths || {} }, null, 2) + '\n' });
  space(project.top, '');
  if (project.settings && project.settings.shapes.length) space(project.settings, '_settings/');
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
    const found = [], groups = [];                       /* found: [config, group index or null] */
    for (const [path, text] of at){
      if (!path.startsWith(dir) || path.slice(dir.length).includes('/') || !path.endsWith('.json') || path === 'project.json') continue;
      let c; try { c = JSON.parse(text); } catch (e) { throw new Error(path + ' is not valid JSON'); }
      if (c.format === 'smart-factory/shape') found.push([c, null]);
      else if (c.format === 'smart-factory/group'){ groups.push({ name: c.named ? c.name : null, members: [] }); for (const s of c.shapes || []) found.push([s, groups.length - 1]); }
    }
    found.sort((a, b) => (a[0].order ?? 0) - (b[0].order ?? 0));
    const shapes = found.map(([c, g], i) => { if (g !== null) groups[g].members.push(i);
      const inside = c.definition && [...at.keys()].some(p => p.startsWith(dir + c.definition)) ? space(dir + c.definition) : null;
      return { type: c.type || 'tensor', name: String(c.name ?? 'Shape'), color: c.color || null, x: +c.position?.x || 0, y: +c.position?.y || 0,
        cols: Math.max(1, Math.round(+c.size?.cols || 1)), rows: Math.max(1, Math.round(+c.size?.rows || 1)), colsName: c.sides?.cols || null, rowsName: c.sides?.rows || null,
        entries: Object.fromEntries(Object.entries(c.value?.entries || {}).map(([k, v]) => [k, back(v)])), inside }; });
    return { shapes, groups: groups.filter(g => g.members.length > 1) };
  };
  return { top: space(''), settings: [...at.keys()].some(p => p.startsWith('_settings/')) ? space('_settings/') : { shapes: [], groups: [] }, lengths: meta.lengths || {}, saved: meta.saved || null };
}
