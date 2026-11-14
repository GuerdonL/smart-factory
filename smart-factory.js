/* The page: makes the components and connects them. Components never reach into each other;
   anything one needs from another passes through here. */
import { createView } from './components/view.js';
import { createMenu } from './components/menu.js';
import { createHud } from './components/hud.js';

/* the shapes registry: shapes/index.json names the configs in shapes/. Choosing one does nothing yet. */
let shapes = [];
fetch('shapes/index.json').then(r => r.json()).then(list => { shapes = list; }).catch(() => {});

const menu = createMenu([{ label: 'New', items: () => shapes.map(name => ({ label: name })) }]);
const hud = createHud({ onHome: () => view.home() });
const view = createView({
  onChange: cam => { hud.show(cam); menu.close(); },
  onMenu: (x, y) => menu.openAt(x, y),
});
document.body.append(view.el, menu.el, hud.el);
hud.show(view.camera());
