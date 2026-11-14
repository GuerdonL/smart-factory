/* The readout in the corner: where the centre of the screen is, the zoom, and a way back.

   createHud({ onHome() }) -> { el, show(camera), say(text) }
     show     takes the view's camera, { x, y, zoom }
     say      shows a short message in place of the readout for a few seconds, such as "Saved"
     onHome   called when "Centre" is pressed */
import { html, style } from './dom.js';

style('hud', `
.hud { position: fixed; display: flex; gap: 8px; align-items: center; color: var(--muted); font-variant-numeric: tabular-nums;
  left: max(16px, env(safe-area-inset-left, 0px)); bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px 4px 10px; }
.hud button { font: inherit; color: var(--fg); background: none; border: 1px solid var(--line); border-radius: 4px; padding: 2px 8px; cursor: pointer; }
.hud button:hover { background: var(--hover); }
.hud button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
`);

export function createHud({ onHome = () => {} } = {}){
  const el = html`<div class="hud"><span></span><button type="button">Centre</button></div>`;
  const [pos, home] = el.children;
  home.addEventListener('click', onHome);
  el.addEventListener('contextmenu', e => e.preventDefault());
  let text = '', note = '', until = 0, timer = 0;
  const draw = () => { pos.textContent = Date.now() < until ? note : text; };
  return { el, show({ x, y, zoom }){ text = `${Math.round(x)}, ${Math.round(y)} · ${Math.round(zoom * 100)}%`; draw(); },
    say(message){ note = message; until = Date.now() + 5000; draw(); clearTimeout(timer); timer = setTimeout(draw, 5100); } };
}
