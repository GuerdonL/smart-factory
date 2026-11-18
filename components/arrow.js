/* An arrow on the canvas: a function, drawn as a triangle that points away from its input.

   createArrow(shape, rect, name) -> everything createBlock gives (block.js), and point(side, tri, w, h)
     An arrow is a kind of block: it is selected, named, faded, warned and deleted as one, and messages name it by its
     id in the same way. What differs is how it looks. Its rectangle is the gap between its input's edge and its
     output (arrows.js: strip), and nothing of that is drawn but:
       the triangle, in the shape's colour (the theme's --function), centred in the gap;
       a bar along the input's edge under the triangle's base, which is what the arrow covers of its input;
       its name, above it, once it has been given one;
       and, while it is selected, a handle at each end of the bar: elements with data-handle = first | last, for
       whoever wants to change its span by them.
     point   says which way it points and where the triangle is: side is n, e, s or w (the edge of the input its base
             lies on); tri is the triangle's three corners, base first and last its point, in units from the
             rectangle's top-left corner; w and h are the rectangle's size in units.
     Only the triangle, the bar and the handles take the pointer: the rest of the gap lets it through.
   A warned arrow (warn) is drawn in the warning colour, a faded one fades, as a block does. */
import { html, style } from './dom.js';
import { createBlock } from './block.js';

style('arrow', `
/* no face, no lips, no shadow: only what is drawn inside it */
.block.arrow { background: none; box-shadow: none; border-radius: 0; pointer-events: none; }
.block.arrow::before { display: none; }
.block.arrow .block-grip, .block.arrow .block-value { display: none; }
.block.arrow.selected { outline: none; }
.block.arrow.anon .block-name { display: none; }
.block.arrow .block-name { pointer-events: auto; }
.arrow-shape { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.arrow-shape polygon { fill: var(--face); pointer-events: auto; cursor: pointer; transition: fill .15s; }
.block.arrow.selected .arrow-shape polygon { cursor: move; }
.arrow-bar { position: absolute; background: var(--face); border-radius: calc(2 * var(--px)); pointer-events: auto; cursor: pointer; transition: background-color .15s; --t: calc(4 * var(--px)); }
.block.arrow.e .arrow-bar { left: calc(var(--t) / -2); top: 0; bottom: 0; width: var(--t); }
.block.arrow.w .arrow-bar { right: calc(var(--t) / -2); top: 0; bottom: 0; width: var(--t); }
.block.arrow.s .arrow-bar { top: calc(var(--t) / -2); left: 0; right: 0; height: var(--t); }
.block.arrow.n .arrow-bar { bottom: calc(var(--t) / -2); left: 0; right: 0; height: var(--t); }
/* the handles: a round knob at each end of the bar, there while the arrow is selected */
.arrow-handle { position: absolute; display: none; box-sizing: border-box; width: calc(11 * var(--px)); height: calc(11 * var(--px)); margin: calc(-5.5 * var(--px)); border-radius: 50%;
  background: var(--panel); border: calc(2 * var(--px)) solid var(--select); pointer-events: auto; z-index: 2; }
.block.arrow.selected .arrow-handle { display: block; }
.block.arrow.e .arrow-handle, .block.arrow.w .arrow-handle { cursor: ns-resize; } .block.arrow.n .arrow-handle, .block.arrow.s .arrow-handle { cursor: ew-resize; }
.block.arrow.e .arrow-handle { left: 0; } .block.arrow.w .arrow-handle { left: 100%; }
.block.arrow.e .arrow-handle[data-handle="first"], .block.arrow.w .arrow-handle[data-handle="first"] { top: 0; }
.block.arrow.e .arrow-handle[data-handle="last"], .block.arrow.w .arrow-handle[data-handle="last"] { top: 100%; }
.block.arrow.s .arrow-handle { top: 0; } .block.arrow.n .arrow-handle { top: 100%; }
.block.arrow.s .arrow-handle[data-handle="first"], .block.arrow.n .arrow-handle[data-handle="first"] { left: 0; }
.block.arrow.s .arrow-handle[data-handle="last"], .block.arrow.n .arrow-handle[data-handle="last"] { left: 100%; }
`);

export function createArrow(shape, rect, name = ''){
  const b = createBlock(shape, rect, name), NS = 'http://www.w3.org/2000/svg';
  b.el.classList.add('arrow');
  const svg = document.createElementNS(NS, 'svg'), tri = document.createElementNS(NS, 'polygon');
  svg.setAttribute('class', 'arrow-shape'); svg.setAttribute('preserveAspectRatio', 'none'); svg.append(tri);
  b.el.append(svg, html`<i class="arrow-bar"></i>`, html`<i class="arrow-handle" data-handle="first"></i>`, html`<i class="arrow-handle" data-handle="last"></i>`);
  let drawn = '';
  b.point = (side, points, w, h) => {
    const key = JSON.stringify([side, points, w, h]); if (key === drawn) return; drawn = key;
    for (const s of ['n', 'e', 's', 'w']) b.el.classList.toggle(s, s === side);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`); tri.setAttribute('points', points.map(p => p.join(',')).join(' ')); };
  return b;
}
