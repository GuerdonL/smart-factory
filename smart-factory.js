/* The page: makes the components and connects them. Components never reach into each other;
   anything one needs from another passes through here. */
import { createView } from './components/view.js';
import { createMenu } from './components/menu.js';
import { createHud } from './components/hud.js';
import { createBlock } from './components/block.js';
import { drawRectangle } from './components/draw.js';

/* the shapes registry: shapes/index.json names the configs in shapes/ */
let shapes = [];
fetch('shapes/index.json').then(r => r.json())
  .then(names => Promise.all(names.map(name => fetch(`shapes/${name}.json`).then(r => r.json()).then(shape => ({ name, ...shape })))))
  .then(list => { shapes = list; }).catch(() => {});

const blocks = [];
/* selection: click a block to select it alone, shift-click to add or remove one, click empty canvas or press Escape to clear */
const selected = new Set();
function select(list, { toggle = false } = {}){
  if (!toggle){ for (const b of selected) b.select(false); selected.clear(); }
  for (const b of list){ const on = !(toggle && selected.has(b)); b.select(on); on ? selected.add(b) : selected.delete(b); }
}
addEventListener('keydown', e => { if (e.key === 'Escape') select([]); });
/* what choosing a shape from "New" does, by the shape's "draw" */
const draw = {
  rectangle: shape => drawRectangle(view, rect => createBlock(shape, rect)).then(block => { if (block) blocks.push(block); }),
};

const menu = createMenu([{ label: 'New', items: () => shapes.map(shape => ({ label: shape.label || shape.name, run: () => draw[shape.draw]?.(shape) })) }]);
const hud = createHud({ onHome: () => view.home() });
const view = createView({
  onChange: cam => { hud.show(cam); menu.close(); },
  onMenu: (x, y) => menu.openAt(x, y),
  onClick: (el, e) => { const b = blocks.find(b => b.el.contains(el)); select(b ? [b] : [], { toggle: !!b && e.shiftKey }); },
});
document.body.append(view.el, menu.el, hud.el);
hud.show(view.camera());
