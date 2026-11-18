/* A tile on the canvas: a region whose contents repeat. What a tile means is tiles.js's to say; this draws one.

   createTile() -> { el, overEl, nameEl, set(options) }
     set    draws the tile. options:
              x, y       where its top-left corner is, in world coordinates
              unit       world units to one "u"
              xs, ys     the slots drawn across and down (tiles.js: layout): { cell, at, size } for a cell, or
                         { dots, at, size } for an ellipsis, at and size in units
              w, h       the size of all that is drawn, in units
              name       its name, written above its top-left corner; with none, "tile" is written faintly
              counts     what is written after the name: how many times it repeats ("3 × 2")
              selected   drawn in the selection colour
              warn       drawn in the warning colour: a count that cannot be worked out, or an arrow repeated in it
                         that runs past its input
              copies     what is drawn in the cells that are not the first: [{ cx, cy, x, y, w, h, color, name,
                         values, tri }], one for each block in each drawn cell. cx, cy are the places of the slots
                         it is in (indexes into xs and ys); x, y its corner in units from the cell's corner; w, h its
                         size in units; color its theme colour. values, where given, is a Map from "column,row" to
                         text, written on its face one to a square (a block that reads the index is a different
                         matrix in each cell). tri, where given, makes it an arrow: the triangle's three corners in
                         units from its own corner. A copy is a picture: it takes no press.
              written    the same for blocks of the first cell, whose own faces do not show their entries: only
                         values are drawn, over the real block, and take no press
     nameEl   the element showing the name: the page watches for clicks on it
     overEl   a second element, for the view's world after the blocks: what is written over the real blocks
              (written) is drawn in it, since el itself lies beneath them
   What takes the pointer, each carrying data-tile (set by the page to say which tile):
     the name and the frame's top and left lines   data-tile-grab: press to select the tile, drag to move it
     the frame's right and bottom lines            data-tile-edge = across | down: drag to change that count
   Everything else lets the pointer through to the blocks. Put el in the view's world, beneath the blocks. */
import { html, style } from './dom.js';
import { likeness } from './block.js';

style('tile', `
.tile { position: absolute; pointer-events: none; --px: 1px; --ink: var(--muted); --out: calc(7 * var(--px)); }
.tile.selected { --ink: var(--select); } .tile.warned { --ink: var(--warn); }
/* the frame round all that is drawn, standing a little off it so that it is clear of the blocks' own edges */
.tile-frame { position: absolute; inset: calc(-1 * var(--out)); border: calc(1.5 * var(--px)) dashed var(--ink); border-radius: calc(8 * var(--px)); }
.tile.selected .tile-frame { background: color-mix(in srgb, var(--select) 6%, transparent); }
/* each cell's outline; the first, the pattern, is drawn firmer */
.tile-cell { position: absolute; box-sizing: border-box; border: var(--px) dotted var(--ink); opacity: .55; }
.tile-cell.first { border-style: solid; opacity: .8; }
.tile-dots { position: absolute; display: grid; place-items: center; color: var(--ink); font-family: var(--font-ui); font-size: calc(18 * var(--px)); line-height: 1; }
.tile-over { position: absolute; pointer-events: none; z-index: 1; --px: 1px; }
.tile-copy { position: absolute; }
.tile-copy .block { opacity: .5; }
.tile-copy .block .block-name { font-size: calc(11 * var(--px)); opacity: .8; }
.tile-copy svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; opacity: .45; }
.tile-copy polygon { fill: var(--function); }
.tile-value { position: absolute; display: grid; place-items: center; color: var(--fg); font-family: var(--font-ui); font-weight: 600; font-variant-numeric: tabular-nums;
  font-size: calc(min(12, 26 / var(--len, 2)) * var(--px)); line-height: 1; text-shadow: 0 0 calc(2 * var(--px)) var(--bg), 0 0 calc(2 * var(--px)) var(--bg); }
.tile-value.error { color: var(--warn); }
/* the name, and after it the counts, stand a line clear of the frame: the names of the blocks in the top row are written there */
.tile-label { position: absolute; left: calc(-1 * var(--out)); bottom: calc(100% + var(--out) + 22 * var(--px)); display: flex; align-items: baseline; gap: calc(7 * var(--px)); white-space: nowrap; }
.tile-name { pointer-events: auto; cursor: default; padding: 0 calc(3 * var(--px)); font-family: var(--font-name); font-size: calc(14 * var(--px)); line-height: 1.2; color: var(--ink); }
.tile-name:empty::before { content: "tile"; opacity: .7; }
.tile-counts { font-family: var(--font-ui); font-size: calc(11 * var(--px)); line-height: 1.5; color: var(--ink); font-variant-numeric: tabular-nums; }
/* the lines that take the pointer: a strip along each side of the frame */
.tile-grab, .tile-edge { position: absolute; pointer-events: auto; --t: calc(8 * var(--px)); }
.tile-grab { cursor: move; }
.tile-grab.n { left: calc(-1 * var(--out)); right: calc(-1 * var(--out)); top: calc(-1 * var(--out) - var(--t) / 2); height: var(--t); }
.tile-grab.w { top: calc(-1 * var(--out)); bottom: calc(-1 * var(--out)); left: calc(-1 * var(--out) - var(--t) / 2); width: var(--t); }
.tile-edge[data-tile-edge="across"] { top: calc(-1 * var(--out)); bottom: calc(-1 * var(--out)); right: calc(-1 * var(--out) - var(--t) / 2); width: var(--t); cursor: ew-resize; }
.tile-edge[data-tile-edge="down"] { left: calc(-1 * var(--out)); right: calc(-1 * var(--out)); bottom: calc(-1 * var(--out) - var(--t) / 2); height: var(--t); cursor: ns-resize; }
/* a knob in the middle of each of those two, to say it can be pulled */
.tile-edge::after { content: ""; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); border-radius: calc(3 * var(--px)); background: var(--ink); }
.tile-edge[data-tile-edge="across"]::after { width: calc(4 * var(--px)); height: calc(18 * var(--px)); }
.tile-edge[data-tile-edge="down"]::after { width: calc(18 * var(--px)); height: calc(4 * var(--px)); }
`);

const NS = 'http://www.w3.org/2000/svg';
export function createTile(){
  const el = html`<div class="tile"><div class="tile-frame"></div><div class="tile-body"></div><div class="tile-label"><span class="tile-name" data-tile-grab="name"></span><span class="tile-counts"></span></div>
    <i class="tile-grab n" data-tile-grab="n"></i><i class="tile-grab w" data-tile-grab="w"></i><i class="tile-edge" data-tile-edge="across"></i><i class="tile-edge" data-tile-edge="down"></i></div>`;
  const body = el.children[1], [nameEl, countsEl] = el.children[2].children, overEl = html`<div class="tile-over"></div>`;
  let drawn = '';
  const values = (into, map) => { for (const [key, text] of map){ const [c, r] = key.split(',').map(Number), v = html`<span class="tile-value"></span>`;
    v.textContent = text; if (text === '!') v.classList.add('error'); v.style.setProperty('--len', Math.max(2, String(text).length));
    Object.assign(v.style, { left: `calc(${c - 1} * var(--tu))`, top: `calc(${r - 1} * var(--tu))`, width: 'var(--tu)', height: 'var(--tu)' }); into.append(v); } };
  return { el, overEl, nameEl,
    set({ x, y, unit, xs, ys, w, h, name = '', counts = '', selected = false, warn = false, copies = [], written = [] }){
      Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w * unit + 'px', height: h * unit + 'px' }); el.style.setProperty('--tu', unit + 'px');
      Object.assign(overEl.style, { left: x + 'px', top: y + 'px' }); overEl.style.setProperty('--tu', unit + 'px');
      el.classList.toggle('selected', selected); el.classList.toggle('warned', !!warn);
      if (!nameEl.isContentEditable) nameEl.textContent = name;      /* a name being typed is left alone */
      countsEl.textContent = counts;
      const key = JSON.stringify([unit, xs, ys, copies.map(c => ({ ...c, values: c.values ? [...c.values] : null })), written.map(c => ({ ...c, values: [...c.values] }))]);
      if (key === drawn) return; drawn = key; body.replaceChildren(); overEl.replaceChildren();
      const box = (o, at) => Object.assign(o.style, { left: at.x * unit + 'px', top: at.y * unit + 'px', width: at.w * unit + 'px', height: at.h * unit + 'px' });
      for (const ys_ of ys) for (const xs_ of xs){ const at = { x: xs_.at, y: ys_.at, w: xs_.size, h: ys_.size };
        if (xs_.dots || ys_.dots){ const d = html`<div class="tile-dots"></div>`; d.textContent = xs_.dots && ys_.dots ? '⋱' : xs_.dots ? '⋯' : '⋮'; box(d, at); body.append(d); continue; }
        const cell = html`<div class="tile-cell"></div>`; cell.classList.toggle('first', xs_.cell === 1 && ys_.cell === 1); box(cell, at); body.append(cell); }
      for (const c of copies){ const sx = xs[c.cx], sy = ys[c.cy]; if (!sx || !sy || sx.dots || sy.dots) continue;
        const holder = html`<div class="tile-copy"></div>`; box(holder, { x: sx.at + c.x, y: sy.at + c.y, w: c.w, h: c.h });
        if (c.tri){ const svg = document.createElementNS(NS, 'svg'), tri = document.createElementNS(NS, 'polygon'); svg.setAttribute('viewBox', `0 0 ${c.w} ${c.h}`); svg.setAttribute('preserveAspectRatio', 'none');
          tri.setAttribute('points', c.tri.map(p => p.join(',')).join(' ')); svg.append(tri); holder.append(svg); }
        else { const b = likeness({ cols: c.w, rows: c.h, unit, color: c.color, name: c.values ? '' : c.name }); holder.append(b.el); if (c.values) values(holder, c.values); }
        body.append(holder); }
      for (const c of written){ const holder = html`<div class="tile-copy"></div>`; box(holder, { x: c.x, y: c.y, w: c.w, h: c.h }); values(holder, c.values); overEl.append(holder); } } };
}
