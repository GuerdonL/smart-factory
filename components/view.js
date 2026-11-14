/* The canvas: an endless dot grid that pans and zooms.

   createView({ onChange(camera), onMenu(x, y), onClick(element, event), onDrag(element, point) }) -> { el, world, unit, grid(), camera(), look(camera), home(), toWorld(x, y), toScreen(x, y), tool(t) }
     el        the element to put on the page
     world     put things here to place them on the canvas, in world coordinates. It carries the CSS variable
               --zoom, so a thing can keep a detail the same size on screen: calc(8px / var(--zoom))
     grid()    the spacing of the dots now on screen, in world units; there is a dot at every multiple of it.
               Zoomed far out, the dots thin to every 2nd, 4th… so they stay apart, and grid() follows.
     camera()  { x, y, zoom }: the world point at the centre of the screen, and the zoom
     look      puts the camera where an earlier camera() said it was
     home()    back to 0, 0 at 100%
     unit      the spacing of the dots at 100%, in world units: the size of one "u"
     toWorld   screen coordinates -> world coordinates; toScreen goes the other way
     tool(t)   hands the pointer to a tool: while one is set, a left press, moves and release go to
               t.down(point), t.move(point), t.up(point) (world coordinates) instead of panning, a right click
               goes to t.cancel(), and the cursor is t.cursor. Zooming still works.
               Returns a function that takes the tool away again.
     onChange  called whenever the camera moves
     onMenu    called with screen coordinates on right click (the browser's own menu is suppressed)
     onClick   called with (element, event) for a press and release without dragging: the element is whatever
               was under the pointer, the view's own el for empty canvas. A drag is not a click.
     onDrag    called when a drag begins, with the element it began on and that point in world coordinates.
               Return { move(point), end() } to take the drag; return nothing and the drag pans the canvas. */
import { html, style } from './dom.js';

const ZMIN = 0.1, ZMAX = 4, GRID = 24, STORE = 'sf-cam';

style('view', `
.view { position: fixed; inset: 0; overflow: hidden; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;
  background-image: radial-gradient(circle, var(--dot) 1.3px, transparent 1.7px); }
.view.panning { cursor: grabbing; }
.view-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.view-origin { position: absolute; left: -5px; top: -5px; width: 10px; height: 10px; border: 1px solid var(--muted); border-radius: 50%; }
`);

export function createView({ onChange = () => {}, onMenu = () => {}, onClick = () => {}, onDrag = () => {} } = {}){
  const el = html`<div class="view"><div class="view-world"><div class="view-origin" title="0, 0"></div></div></div>`;
  const world = el.firstElementChild;
  /* world point (x, y) appears at screen (x * z + tx, y * z + ty) */
  const cam = { tx: innerWidth / 2, ty: innerHeight / 2, z: 1 };
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && isFinite(s.tx + s.ty + s.z)) Object.assign(cam, s); } catch (e) {}
  const camera = () => ({ x: (innerWidth / 2 - cam.tx) / cam.z, y: (innerHeight / 2 - cam.ty) / cam.z, zoom: cam.z });

  /* dots are GRID apart, doubling when zoomed out so they never crowd closer than 14px on screen */
  const grid = () => GRID * 2 ** Math.max(0, Math.ceil(Math.log2(14 / (GRID * cam.z))));

  let saveT = 0;
  function draw(){
    world.style.transform = `translate(${cam.tx}px,${cam.ty}px) scale(${cam.z})`;
    world.style.setProperty('--zoom', cam.z);
    /* the grid is a background, so it never runs out. One kind of dot: every dot on screen is a place things snap to. */
    const g = grid() * cam.z;
    el.style.backgroundSize = `${g}px ${g}px`;
    el.style.backgroundPosition = `${cam.tx - g / 2}px ${cam.ty - g / 2}px`;
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
  const pts = new Map(); let press = null, drag = null;      /* press: where a possible click began; drag: who took the drag, if not panning */
  el.addEventListener('pointerdown', e => {
    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) return;        /* right click belongs to the menu, or cancels a tool */
    if (e.target.isContentEditable) return;                              /* text being edited keeps its own clicks */
    if (tool){ if (e.button === 0){ el.setPointerCapture(e.pointerId); tool.down?.(at(e)); } return; }
    el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); el.classList.add('panning');
    press = pts.size === 1 ? { target: e.target, x: e.clientX, y: e.clientY } : null;
  });
  el.addEventListener('pointermove', e => {
    if (tool) return tool.move?.(at(e));
    const p = pts.get(e.pointerId); if (!p) return;
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4){      /* moved: a drag, not a click */
      drag = onDrag(press.target, toWorld(press.x, press.y)) || null; press = null; }
    if (press) return;
    if (drag) return drag.move(at(e));
    if (pts.size === 1){ cam.tx += e.clientX - p.x; cam.ty += e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; return moved(); }
    const [a0, b0] = [...pts.values()].map(q => ({ ...q })); p.x = e.clientX; p.y = e.clientY;
    const [a, b] = [...pts.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    cam.tx += mx - (a0.x + b0.x) / 2; cam.ty += my - (a0.y + b0.y) / 2;
    const d = Math.hypot(a.x - b.x, a.y - b.y), d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
    zoomAt(mx, my, d0 > 0 ? d / d0 : 1); moved();
  });
  const up = e => { pts.delete(e.pointerId); if (!pts.size) el.classList.remove('panning'); };
  el.addEventListener('pointerup', e => { if (tool && e.button === 0) return tool.up?.(at(e));
    const p = press, d = drag; press = drag = null; up(e); if (d) d.end?.(); if (p) onClick(p.target, e); });
  el.addEventListener('pointercancel', e => { const d = drag; press = drag = null; up(e); if (d) d.end?.(); });

  /* the wheel zooms about the pointer (so does a trackpad pinch); a wheel notch is about a quarter step. Panning is by dragging. */
  el.addEventListener('wheel', e => { e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-Math.max(-25, Math.min(25, e.deltaY * (e.deltaMode ? 16 : 1))) * 0.01));
    moved();
  }, { passive: false });

  el.addEventListener('contextmenu', e => { e.preventDefault(); if (tool) return tool.cancel?.(); onMenu(e.clientX, e.clientY); });
  addEventListener('resize', moved);
  draw();

  return { el, world, unit: GRID, grid, camera, toWorld, toScreen: (x, y) => ({ x: x * cam.z + cam.tx, y: y * cam.z + cam.ty }),
    home(){ cam.tx = innerWidth / 2; cam.ty = innerHeight / 2; cam.z = 1; moved(); },
    look({ x, y, zoom }){ cam.z = Math.min(ZMAX, Math.max(ZMIN, zoom)); cam.tx = innerWidth / 2 - x * cam.z; cam.ty = innerHeight / 2 - y * cam.z; moved(); },
    tool(t){ tool = t; press = drag = null; pts.clear(); el.classList.remove('panning'); el.style.cursor = t.cursor || '';
      return () => { if (tool === t){ tool = null; el.style.cursor = ''; } }; } };
}
