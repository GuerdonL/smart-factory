/* The canvas: an endless dot grid that pans and zooms.

   createView({ onChange(camera), onMenu(x, y) }) -> { el, world, grid, camera(), home(), toWorld(x, y), tool(t) }
     el        the element to put on the page
     world     put things here to place them on the canvas, in world coordinates
     grid      the spacing of the dots, in world units; there is a dot at every multiple of it
     camera()  { x, y, zoom }: the world point at the centre of the screen, and the zoom
     home()    back to 0, 0 at 100%
     toWorld   screen coordinates -> world coordinates
     tool(t)   hands the pointer to a tool: while one is set, a left press, moves and release go to
               t.down(point), t.move(point), t.up(point) (world coordinates) instead of panning, a right click
               goes to t.cancel(), and the cursor is t.cursor. Scrolling and zooming still work.
               Returns a function that takes the tool away again.
     onChange  called whenever the camera moves
     onMenu    called with screen coordinates on right click (the browser's own menu is suppressed) */
import { html, style } from './dom.js';

const ZMIN = 0.1, ZMAX = 4, GRID = 24, STORE = 'sf-cam';

style('view', `
.view { position: fixed; inset: 0; overflow: hidden; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;
  background-image: radial-gradient(circle, var(--dot-strong) 1.2px, transparent 1.6px), radial-gradient(circle, var(--dot) 1px, transparent 1.4px); }
.view.panning { cursor: grabbing; }
.view-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.view-origin { position: absolute; left: -5px; top: -5px; width: 10px; height: 10px; border: 1px solid var(--muted); border-radius: 50%; }
`);

export function createView({ onChange = () => {}, onMenu = () => {} } = {}){
  const el = html`<div class="view"><div class="view-world"><div class="view-origin" title="0, 0"></div></div></div>`;
  const world = el.firstElementChild;
  /* world point (x, y) appears at screen (x * z + tx, y * z + ty) */
  const cam = { tx: innerWidth / 2, ty: innerHeight / 2, z: 1 };
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && isFinite(s.tx + s.ty + s.z)) Object.assign(cam, s); } catch (e) {}
  const camera = () => ({ x: (innerWidth / 2 - cam.tx) / cam.z, y: (innerHeight / 2 - cam.ty) / cam.z, zoom: cam.z });

  let saveT = 0;
  function draw(){
    world.style.transform = `translate(${cam.tx}px,${cam.ty}px) scale(${cam.z})`;
    /* the grid is a background, so it never runs out; minor dots drop away when zoomed far out */
    const g = GRID * cam.z, major = g * 5;
    el.style.backgroundSize = `${major}px ${major}px, ${g >= 9 ? `${g}px ${g}px` : '0 0'}`;
    el.style.backgroundPosition = `${cam.tx - major / 2}px ${cam.ty - major / 2}px, ${cam.tx - g / 2}px ${cam.ty - g / 2}px`;
    clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(cam)); } catch (e) {} }, 300);
  }
  function moved(){ draw(); onChange(camera()); }
  function zoomAt(sx, sy, f){
    const z = Math.min(ZMAX, Math.max(ZMIN, cam.z * f)), k = z / cam.z;
    cam.tx = sx - (sx - cam.tx) * k; cam.ty = sy - (sy - cam.ty) * k; cam.z = z;
  }

  const toWorld = (sx, sy) => ({ x: (sx - cam.tx) / cam.z, y: (sy - cam.ty) / cam.z });
  let tool = null;
  const at = e => toWorld(e.clientX, e.clientY);

  /* drag to pan; two fingers pan and pinch */
  const pts = new Map();
  el.addEventListener('pointerdown', e => {
    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) return;        /* right click belongs to the menu, or cancels a tool */
    if (tool){ if (e.button === 0){ el.setPointerCapture(e.pointerId); tool.down?.(at(e)); } return; }
    el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); el.classList.add('panning');
  });
  el.addEventListener('pointermove', e => {
    if (tool) return tool.move?.(at(e));
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1){ cam.tx += e.clientX - p.x; cam.ty += e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; return moved(); }
    const [a0, b0] = [...pts.values()].map(q => ({ ...q })); p.x = e.clientX; p.y = e.clientY;
    const [a, b] = [...pts.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    cam.tx += mx - (a0.x + b0.x) / 2; cam.ty += my - (a0.y + b0.y) / 2;
    const d = Math.hypot(a.x - b.x, a.y - b.y), d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
    zoomAt(mx, my, d0 > 0 ? d / d0 : 1); moved();
  });
  const up = e => { pts.delete(e.pointerId); if (!pts.size) el.classList.remove('panning'); };
  el.addEventListener('pointerup', e => { if (tool && e.button === 0) return tool.up?.(at(e)); up(e); });
  el.addEventListener('pointercancel', up);

  /* wheel and trackpad: scroll pans; pinch, or ctrl/cmd + wheel, zooms about the pointer */
  el.addEventListener('wheel', e => { e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)));
    else { const m = e.deltaMode ? 16 : 1, side = e.shiftKey && !e.deltaX; cam.tx -= (side ? e.deltaY : e.deltaX) * m; cam.ty -= (side ? 0 : e.deltaY) * m; }
    moved();
  }, { passive: false });

  el.addEventListener('contextmenu', e => { e.preventDefault(); if (tool) return tool.cancel?.(); onMenu(e.clientX, e.clientY); });
  addEventListener('resize', moved);
  draw();

  return { el, world, grid: GRID, camera, toWorld,
    home(){ cam.tx = innerWidth / 2; cam.ty = innerHeight / 2; cam.z = 1; moved(); },
    tool(t){ tool = t; pts.clear(); el.classList.remove('panning'); el.style.cursor = t.cursor || '';
      return () => { if (tool === t){ tool = null; el.style.cursor = ''; } }; } };
}
