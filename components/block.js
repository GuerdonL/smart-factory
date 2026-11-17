/* A block on the canvas: a solid, slightly raised rectangle in its shape's colour, with its name above it.

   createBlock(shape, rect, name) -> { id, el, nameEl, shape, rect, name, sides, values, set(rect), select(on), dim(on), grips(on), stripes(way, unit), paint(color), off(on), warn(on), call(name), rename(after) }
     id       a name for this block that nothing else has: how messages say which block they mean. null until whoever
              made the block gives it one.
     shape    a config from shapes/; its "color" names the theme variable to use ("tensor" -> --tensor)
     rect     { x, y, w, h } in world coordinates
     name     the text shown above it
     nameEl   the element showing the name
     sides    { w, h }: the names of its width and its height, null where unnamed. Kept here for whoever names them;
              the block itself does nothing with them.
     values   a Map from "column,row" to a number: the entries of this variable that have been given one.
              Kept here for the same reason.
     set      moves and resizes it
     select   shows or hides the selection halo, and brings the block in front of the others
     grips    turns the resize grips on or off
     turn     says whether this block is the transpose of its variable (kept on the block as t): a small raised T is
              written after its name. The block itself is not resized; that is for whoever turns it.
     face     writes a value in the middle of the block's face (text), or takes it off (null)
     inset    writes the name on the block's face in place of above it (for a block in a sum, with another directly above or below), or puts it back
     stripes  bands the block's face, one band to each `unit` of world length, paler and deeper by turns in the
              block's own colour: 'rows' across (one band per row), 'cols' down (one per column), 'both', or
              null for a plain face
     dim      fades the block and its name most of the way to the theme's --fade-to, or brings them back
   Each side and corner has a grip, an element with data-grip = n | s | e | w | nw | ne | sw | se, for whoever
   wants to resize by it.
     off      shows it as commented out: washed out, with a dashed edge
     warn     draws it in the warning colour (--warn), or puts its own back: for a shape that cannot be what it
              is meant to be just now
     paint    changes its colour to another theme variable's ("lazuli" -> --lazuli)
     call     gives it a name outright
     join     draws it as a block joined from several: join(parts, cols, rows), where parts is [{ x, y, w, h, color }],
              rectangles that together fill the block, in units, each with its theme colour, and cols and rows are
              the block's size in units. Each part keeps its colour on the block's face, with a wavy line where two
              meet. Call it again whenever the block or its parts change: the waves are worked out afresh for the
              size given, so they keep their length. null goes back to one plain colour.
     rename   lets the user type a new name in place: Enter or clicking away keeps it, Escape puts the old one back,
              and an empty name is not kept. after(changed, was) is called when they finish, saying whether the
              name is now a different one and what it was. */
import { html, style, editText } from './dom.js';

style('block', `
.block { position: absolute; box-sizing: border-box; --px: 1px;   /* the measure every detail here is given in: world units, so it all zooms with the canvas */
  border-radius: calc(8 * var(--px));
  /* lit from above: a flat face with a bright top lip, a dark bottom lip, and a shadow underneath.
     These are sized in world units, like everything on the canvas, so the whole picture zooms as one. */
  /* the block's own colours: the theme's, until dim() fades them */
  --face: var(--block); --rim: var(--edge); --lit: var(--raise-light); --shade: var(--raise-dark); --cast: var(--shadow); --ink: var(--fg);
  background: var(--bands, none) var(--face); transition: background-color .15s;
  /* a thin dark rim all round, so two blocks that touch still show where one ends and the next begins */
  box-shadow: var(--halo, 0 0), inset 0 0 0 var(--px) var(--rim),
    inset 0 calc(2.5 * var(--px)) 0 var(--lit), inset 0 calc(-4 * var(--px)) 0 var(--shade); }
/* the shadow underneath is drawn on a layer below every block (z-index -1), so it falls on the canvas and never on another block */
.block::before { content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit; pointer-events: none;
  box-shadow: 0 calc(2 * var(--px)) calc(3 * var(--px)) var(--cast), 0 calc(8 * var(--px)) calc(14 * var(--px)) calc(-4 * var(--px)) var(--cast); }
/* bands start at the block's top and left edge, so each one is exactly a row or a column */
.block.rows { --bands: repeating-linear-gradient(to bottom, var(--stripe-light) 0 var(--u), var(--stripe-deep) var(--u) calc(2 * var(--u))); }
.block.cols { --bands: repeating-linear-gradient(to right, var(--stripe-light) 0 var(--u), var(--stripe-deep) var(--u) calc(2 * var(--u))); }
.block.rows.cols { --bands: repeating-linear-gradient(to bottom, var(--stripe-light) 0 var(--u), var(--stripe-deep) var(--u) calc(2 * var(--u))),
  repeating-linear-gradient(to right, var(--stripe-light) 0 var(--u), var(--stripe-deep) var(--u) calc(2 * var(--u))); }
/* commented out: there, but taking no part. (Before .selected, so a selected one still shows its ring.) */
.block.off { --face: color-mix(in srgb, var(--block) 16%, var(--fade-to)); --ink: var(--muted); --rim: transparent; --lit: transparent; --shade: transparent; --cast: transparent;
  outline: calc(1.5 * var(--px)) dashed var(--muted); outline-offset: calc(-1.5 * var(--px)); }
/* in the warning colour, whatever its own, and whatever parts it was joined from */
.block.warned { --face: var(--warn); }
.block.warned .block-parts { display: none; }
.block.selected { outline: calc(2 * var(--px)) solid var(--select); outline-offset: calc(2 * var(--px));
  --halo: 0 0 0 calc(7 * var(--px)) var(--select-halo); cursor: move; z-index: 1; }
/* faded: every colour mixed most of the way to --fade-to (or to nothing, for the see-through ones), not made transparent,
   so faded blocks that overlap do not show through each other */
.block.dim { --face: color-mix(in srgb, var(--block) 28%, var(--fade-to)); --ink: color-mix(in srgb, var(--fg) 30%, var(--fade-to));
  --rim: color-mix(in srgb, var(--edge) 25%, transparent); --lit: color-mix(in srgb, var(--raise-light) 40%, transparent);
  --shade: color-mix(in srgb, var(--raise-dark) 25%, transparent); --cast: color-mix(in srgb, var(--shadow) 30%, transparent); }
/* a block makes no layer of its own, so its name (z-index 2) sits above every block on the canvas, not just this one */
.block-name { position: absolute; z-index: 2; left: 0; bottom: calc(100% + 9 * var(--px)); padding: 0 calc(3 * var(--px)); margin-left: calc(-3 * var(--px));
  font-family: var(--font-name); font-size: calc(14 * var(--px)); line-height: 1.2; letter-spacing: -0.02em; white-space: nowrap; color: var(--ink); transition: color .15s; border-radius: calc(3 * var(--px)); cursor: default; }
.block.selected .block-name { color: var(--select); }
/* a transpose: a small raised T after its name */
.block.transposed .block-name::after { content: "T"; font-size: .68em; vertical-align: .55em; margin-left: calc(1 * var(--px)); letter-spacing: 0; }
/* in a sum there is no room above a block for its name (the next block up is there), so it is written on the block */
.block.name-inside .block-name, .block.name-inside.selected .block-name { bottom: auto; top: 50%; transform: translateY(-50%); left: calc(7 * var(--px)); margin: 0; padding: 0;
  max-width: calc(100% - 12 * var(--px)); overflow: hidden; text-overflow: ellipsis; font-size: calc(12 * var(--px)); color: var(--on-block); text-shadow: 0 0 2px var(--shadow), 0 0 1px var(--shadow); pointer-events: none; }      /* a press there is a press on the block */
.block.name-inside .block-name[contenteditable] { pointer-events: auto; overflow: visible; max-width: none; }
/* a single entry that holds a value shows it on its face, shrunk to fit where it is long */
.block-value { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; font-family: var(--font-name);
  font-size: calc(min(13, 30 / var(--len, 2)) * var(--px)); line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; color: var(--on-block); text-shadow: 0 0 2px var(--shadow), 0 0 1px var(--shadow); }
.block.name-inside .block-value { display: none; }      /* the name is written there */
/* a joined block: its parts' colours are drawn over the face, and the lips and rim are drawn again over those */
.block-parts { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit; overflow: hidden; pointer-events: none; }
.block-parts .seams { fill: none; stroke: var(--rim); stroke-width: 1.2; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.block.joined::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: var(--bands, none);
  box-shadow: inset 0 0 0 var(--px) var(--rim), inset 0 calc(2.5 * var(--px)) 0 var(--lit), inset 0 calc(-4 * var(--px)) 0 var(--shade); }
.block.dim .block-parts, .block.off .block-parts { opacity: .25; }
/* grips: a strip along each side and a square on each corner, half in and half out, showing which way it stretches */
.block.no-grips .block-grip { display: none; }
/* layer 0: over the blocks, but under a selected block (layer 1), so where two blocks share an edge the selected one's grip is the one you get */
.block-grip { position: absolute; z-index: 0; --t: calc(10 * var(--px)); --c: calc(14 * var(--px)); }
.block-grip[data-grip="n"], .block-grip[data-grip="s"] { left: 0; right: 0; height: var(--t); cursor: ns-resize; }
.block-grip[data-grip="e"], .block-grip[data-grip="w"] { top: 0; bottom: 0; width: var(--t); cursor: ew-resize; }
.block-grip[data-grip="n"] { top: calc(var(--t) / -2); } .block-grip[data-grip="s"] { bottom: calc(var(--t) / -2); }
.block-grip[data-grip="w"] { left: calc(var(--t) / -2); } .block-grip[data-grip="e"] { right: calc(var(--t) / -2); }
.block-grip[data-grip="nw"], .block-grip[data-grip="ne"], .block-grip[data-grip="sw"], .block-grip[data-grip="se"] {
  width: var(--c); height: var(--c); margin: calc(var(--c) / -2); }
.block-grip[data-grip="nw"] { left: 0; top: 0; cursor: nwse-resize; }
.block-grip[data-grip="se"] { right: 0; bottom: 0; cursor: nwse-resize; }
.block-grip[data-grip="ne"] { right: 0; top: 0; cursor: nesw-resize; }
.block-grip[data-grip="sw"] { left: 0; bottom: 0; cursor: nesw-resize; }
`);

/* a picture of a block, for where a shape stands in an equation: it looks the part and does nothing.
   likeness({ cols, rows, unit, color, name }) -> { el, width, height } */
export function likeness({ cols, rows, unit, color, name = '' }){
  const b = createBlock({ color }, { x: 0, y: 0, w: cols * unit, h: rows * unit }, name);
  b.grips(false); b.el.classList.add('likeness'); b.el.style.pointerEvents = 'none';
  return { el: b.el, width: cols * unit, height: rows * unit };
}
export function createBlock(shape, rect, name = ''){
  const el = html`<div class="block"><span class="block-name"></span></div>`, nameEl = el.firstElementChild;
  for (const g of ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']) el.append(html`<i class="block-grip" data-grip="${g}"></i>`);      /* corners last, so they sit over the sides */
  nameEl.textContent = name;
  el.style.setProperty('--block', `var(--${shape.color})`);
  let joinedAs = '', valueEl = null;
  const block = { id: null, el, nameEl, shape, rect, name, sides: { w: null, h: null }, values: new Map(), t: false,
    select(on){ el.classList.toggle('selected', on); },
    dim(on){ el.classList.toggle('dim', on); },
    off(on){ el.classList.toggle('off', on); },
    warn(on){ el.classList.toggle('warned', !!on); },
    grips(on){ el.classList.toggle('no-grips', !on); },
    inset(on){ el.classList.toggle('name-inside', on); },
    face(text){ if (text === null || text === undefined || text === ''){ valueEl?.remove(); valueEl = null; return; }      /* a single entry's value, written on the block itself */
      if (!valueEl){ valueEl = html`<span class="block-value"></span>`; el.append(valueEl); }
      valueEl.textContent = text; valueEl.style.setProperty('--len', Math.max(2, String(text).length)); },
    turn(on){ block.t = !!on; el.classList.toggle('transposed', !!on); },
    stripes(way, unit){ el.classList.toggle('rows', way === 'rows' || way === 'both'); el.classList.toggle('cols', way === 'cols' || way === 'both');
      if (way) el.style.setProperty('--u', unit + 'px'); },
    set(r){ block.rect = r; Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); },
    join(parts, cols, rows){
      const key = parts ? JSON.stringify([parts, cols, rows]) : ''; if (key === joinedAs) return; joinedAs = key;
      el.querySelector('.block-parts')?.remove(); el.classList.toggle('joined', !!parts);
      if (!parts) return;
      const a = .13, eps = 1e-6, n = v => +v.toFixed(3);
      /* each part reaches a little under its neighbours above and to the left, and ends in a wave on the right and below
         where another part follows; a wave lies over the part it borders, so a part is drawn after every part to its
         right and below it */
      const right = (p, q) => Math.abs(q.x - p.x - p.w) < eps && q.y < p.y + p.h - eps && q.y + q.h > p.y + eps;
      const below = (p, q) => Math.abs(q.y - p.y - p.h) < eps && q.x < p.x + p.w - eps && q.x + q.w > p.x + eps;
      const order = [], seen = new Set(), visit = p => { if (seen.has(p)) return; seen.add(p); for (const q of parts) if (right(p, q) || below(p, q)) visit(q); order.push(p); };
      parts.forEach(visit);
      const down = p => { const X = p.x + p.w, Y = p.y + p.h; let d = '';      /* the wave down its right side, from the top; a straight line at the block's own edge */
        if (X < cols - eps) for (let y = p.y, i = 0; y < Y - eps; y += .5, i++){ const to = Math.min(Y, y + .5); d += `Q${n(X + (i % 2 ? -2 : 2) * a)} ${n((y + to) / 2)} ${n(X)} ${n(to)}`; }
        return d; };
      const along = p => { const X = p.x + p.w, Y = p.y + p.h; let d = '';     /* the wave along its bottom, from the right */
        if (Y < rows - eps) for (let x = X, i = 0; x > p.x + eps; x -= .5, i++){ const to = Math.max(p.x, x - .5); d += `Q${n((x + to) / 2)} ${n(Y + (i % 2 ? -2 : 2) * a)} ${n(to)} ${n(Y)}`; }
        return d; };
      const path = p => { const X = p.x + p.w, Y = p.y + p.h;
        const in_ = Math.min(3 * a, p.w / 2);      /* the reach under the part above stops short of the corner, where that part's own wave turns away */
        return `M${n(p.x - a)} ${n(p.y - a)}L${n(X - in_)} ${n(p.y - a)}L${n(X - in_)} ${n(p.y)}L${n(X)} ${n(p.y)}${down(p) || `L${n(X)} ${n(Y)}`}${along(p) || `L${n(p.x)} ${n(Y)}`}L${n(p.x - a)} ${n(Y)}Z`; };
      const seams = p => (down(p) ? `M${n(p.x + p.w)} ${n(p.y)}${down(p)}` : '') + (along(p) ? `M${n(p.x + p.w)} ${n(p.y + p.h)}${along(p)}` : '');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'block-parts'); svg.setAttribute('viewBox', `0 0 ${cols} ${rows}`); svg.setAttribute('preserveAspectRatio', 'none');
      for (const p of order){ const part = document.createElementNS('http://www.w3.org/2000/svg', 'path'); part.setAttribute('d', path(p)); part.style.fill = `var(--${p.color})`; svg.append(part); }
      const lines = document.createElementNS('http://www.w3.org/2000/svg', 'path'); lines.setAttribute('d', parts.map(seams).join('')); lines.setAttribute('class', 'seams'); svg.append(lines);      /* the waves' lines, over every part */
      el.prepend(svg); },
    paint(color){ block.shape = { ...block.shape, color }; el.style.setProperty('--block', `var(--${color})`); },
    call(name){ block.name = name; if (!nameEl.isContentEditable) nameEl.textContent = name; },
    rename(after = () => {}){ editText(nameEl, text => { const was = block.name; if (text) block.name = text; nameEl.textContent = block.name; after(block.name !== was, was); }); } };
  block.set(rect);
  return block;
}
