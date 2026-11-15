/* Box selection: drag out a rectangle on the canvas.

   boxSelect(view) -> { done, cancel() }
     done     a promise of the rectangle dragged, { x, y, w, h } in world coordinates, or null if cancelled
     cancel   gives up
   The cursor becomes a crosshair until the drag ends. Escape or a right click cancels. */
import { html, style } from './dom.js';

style('marquee', `
.marquee { position: absolute; z-index: 3; pointer-events: none; --px: 1px;
  background: var(--select-halo); border: var(--px) dashed var(--select); border-radius: calc(2 * var(--px)); }
`);

export function boxSelect(view){
  let finish;
  const done = new Promise(resolve => {
    const el = html`<div class="marquee"></div>`;
    let from = null, rect = null;
    finish = result => { release(); removeEventListener('keydown', key); el.remove(); resolve(result); };
    const key = e => { if (e.key === 'Escape') finish(null); };
    addEventListener('keydown', key);
    const show = p => { rect = { x: Math.min(from.x, p.x), y: Math.min(from.y, p.y), w: Math.abs(p.x - from.x), h: Math.abs(p.y - from.y) };
      Object.assign(el.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' }); };
    const release = view.tool({ cursor: 'crosshair',
      down(p){ from = p; view.world.append(el); show(p); },
      move(p){ if (from) show(p); },
      up(p){ if (from){ show(p); finish(rect); } },
      cancel(){ finish(null); } });
  });
  return { done, cancel: () => finish(null) };
}
