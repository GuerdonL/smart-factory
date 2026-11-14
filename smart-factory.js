/* The page: makes the components and connects them. Components never reach into each other;
   anything one needs from another passes through here. */
import { createView } from './components/view.js';
import { createMenu } from './components/menu.js';
import { createHud } from './components/hud.js';

const menu = createMenu([{ label: 'New', more: true }]);          /* "New" will open a submenu; it does nothing yet */
const hud = createHud({ onHome: () => view.home() });
const view = createView({
  onChange: cam => { hud.show(cam); menu.close(); },
  onMenu: (x, y) => menu.openAt(x, y),
});
document.body.append(view.el, menu.el, hud.el);
hud.show(view.camera());
