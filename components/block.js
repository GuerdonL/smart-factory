/* A block on the canvas: a solid, slightly raised rectangle in its shape's colour, with its name above it.

   createBlock(shape, rect, name) -> { el, nameEl, shape, rect, name, sides, values, set(rect), select(on), dim(on), grips(on), stripes(way, unit), paint(color), off(on), rename(after) }
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
     stripes  bands the block's face, one band to each `unit` of world length, paler and deeper by turns in the
              block's own colour: 'rows' across (one band per row), 'cols' down (one per column), 'both', or
              null for a plain face
     dim      fades the block and its name most of the way to the theme's --fade-to, or brings them back
   Each side and corner has a grip, an element with data-grip = n | s | e | w | nw | ne | sw | se, for whoever
   wants to resize by it.
     off      shows it as commented out: washed out, with a dashed edge
     paint    changes its colour to another theme variable's ("lazuli" -> --lazuli)
     rename   lets the user type a new name in place: Enter or clicking away keeps it, Escape puts the old one back,
              and an empty name is not kept. after(changed, was) is called when they finish, saying whether the
              name is now a different one and what it was. */
import { html, style, editText } from './dom.js';

style('block', `
.block { position: absolute; box-sizing: border-box; --px: calc(1px / var(--zoom, 1));   /* one screen pixel, whatever the zoom */
  border-radius: calc(8 * var(--px));
  /* lit from above: a flat face with a bright top lip, a dark bottom lip, and a shadow underneath.
     These are sized in screen pixels, so a block looks the same zoomed in or out. */
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

export function createBlock(shape, rect, name = ''){
  const el = html`<div class="block"><span class="block-name"></span></div>`, nameEl = el.firstElementChild;
  for (const g of ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']) el.append(html`<i class="block-grip" data-grip="${g}"></i>`);      /* corners last, so they sit over the sides */
  nameEl.textContent = name;
  el.style.setProperty('--block', `var(--${shape.color})`);
  const block = { el, nameEl, shape, rect, name, sides: { w: null, h: null }, values: new Map(),
    select(on){ el.classList.toggle('selected', on); },
    dim(on){ el.classList.toggle('dim', on); },
    off(on){ el.classList.toggle('off', on); },
    grips(on){ el.classList.toggle('no-grips', !on); },
    stripes(way, unit){ el.classList.toggle('rows', way === 'rows' || way === 'both'); el.classList.toggle('cols', way === 'cols' || way === 'both');
      if (way) el.style.setProperty('--u', unit + 'px'); },
    set(r){ block.rect = r; Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); },
    paint(color){ block.shape = { ...block.shape, color }; el.style.setProperty('--block', `var(--${color})`); },
    rename(after = () => {}){ editText(nameEl, text => { const was = block.name; if (text) block.name = text; nameEl.textContent = block.name; after(block.name !== was, was); }); } };
  block.set(rect);
  return block;
}
