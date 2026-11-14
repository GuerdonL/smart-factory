/* Drawing a rectangle on the canvas.

   drawRectangle(view, make) -> Promise of what `make` returned, or null if cancelled
     make(rect) -> { el, set(rect) }   called once, at the first click, to create the thing being drawn

   The cursor becomes a pointing finger. The first click fixes one corner on the nearest dot; the rectangle
   then follows the cursor, snapped to the dots, until a second click sets it down. Pressing, dragging and
   releasing works too. Escape or a right click cancels.

   While it is being drawn, dimension lines show its width along the bottom and its height down the left, in
   units of one dot spacing ("u"). Where there is no room on screen, they move to the top or the right. */
import { createMeasure } from './measure.js';

const ROOM = 30;      /* screen pixels a dimension line needs beside the rectangle */

export function drawRectangle(view, make){
  return new Promise(resolve => {
    const g = view.grid(), snap = p => ({ x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g });
    let anchor = null, made = null, dragged = false;
    const measure = createMeasure(view.unit);
    const show = r => { made.set(r);
      const a = view.toScreen(r.x, r.y), b = view.toScreen(r.x + r.w, r.y + r.h);
      measure.set(r, { top: b.y + ROOM > innerHeight && a.y - ROOM >= 0, right: a.x - ROOM < 0 && b.x + ROOM <= innerWidth }); };
    /* from the anchor to the cursor, never smaller than one square of the grid */
    const rect = p => { const c = snap(p), w = Math.max(g, Math.abs(c.x - anchor.x)), h = Math.max(g, Math.abs(c.y - anchor.y));
      return { x: c.x < anchor.x ? anchor.x - w : anchor.x, y: c.y < anchor.y ? anchor.y - h : anchor.y, w, h }; };
    const finish = result => { release(); measure.el.remove(); removeEventListener('keydown', key); if (!result && made) made.el.remove(); resolve(result); };
    const key = e => { if (e.key === 'Escape') finish(null); };
    addEventListener('keydown', key);
    const release = view.tool({ cursor: 'pointer',
      down(p){ if (anchor) return finish(made);          /* the second click sets it down */
        anchor = snap(p); made = make(rect(p)); view.world.append(made.el, measure.el); show(rect(p)); },
      move(p){ if (!anchor) return; const r = rect(p); if (r.w > g || r.h > g) dragged = true; show(r); },
      up(p){ if (anchor && dragged && (Math.abs(snap(p).x - anchor.x) >= g || Math.abs(snap(p).y - anchor.y) >= g)) finish(made); },
      cancel(){ finish(null); } });
  });
}
