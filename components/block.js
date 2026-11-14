/* A block on the canvas: a solid, slightly raised rectangle in its shape's colour, with its name above it.

   createBlock(shape, rect, name) -> { el, nameEl, shape, rect, name, set(rect), select(on), rename() }
     shape    a config from shapes/; its "color" names the theme variable to use ("tensor" -> --tensor)
     rect     { x, y, w, h } in world coordinates
     name     the text shown above it
     nameEl   the element showing the name
     set      moves and resizes it
     select   shows or hides the selection halo
     rename   lets the user type a new name in place: Enter or clicking away keeps it, Escape puts the old one back,
              and an empty name is not kept */
import { html, style } from './dom.js';

style('block', `
.block { position: absolute; box-sizing: border-box; --px: calc(1px / var(--zoom, 1));   /* one screen pixel, whatever the zoom */
  border-radius: calc(8 * var(--px));
  /* lit from above: a soft highlight fading down the face, a bright top lip, a dark bottom lip, and a shadow underneath.
     These are sized in screen pixels, so a block looks the same zoomed in or out. */
  background: linear-gradient(var(--raise-light), transparent 55%) var(--block);
  box-shadow: var(--halo, 0 0), inset 0 calc(1.5 * var(--px)) 0 var(--raise-light), inset 0 calc(-4 * var(--px)) 0 var(--raise-dark),
    0 calc(2 * var(--px)) calc(3 * var(--px)) var(--shadow), 0 calc(8 * var(--px)) calc(14 * var(--px)) calc(-4 * var(--px)) var(--shadow); }
.block.selected { outline: calc(2 * var(--px)) solid var(--select); outline-offset: calc(2 * var(--px));
  --halo: 0 0 0 calc(7 * var(--px)) var(--select-halo); }
.block-name { position: absolute; left: 0; bottom: calc(100% + 9 * var(--px)); padding: 0 calc(3 * var(--px)); margin-left: calc(-3 * var(--px));
  font-size: calc(12 * var(--px)); line-height: 1.3; white-space: nowrap; color: var(--fg); border-radius: calc(3 * var(--px)); cursor: default; }
.block-name[contenteditable="true"] { cursor: text; user-select: text; -webkit-user-select: text; min-width: calc(12 * var(--px));
  background: var(--panel); outline: calc(1.5 * var(--px)) solid var(--select); }
`);

export function createBlock(shape, rect, name = ''){
  const el = html`<div class="block"><span class="block-name"></span></div>`, nameEl = el.firstElementChild;
  nameEl.textContent = name;
  el.style.setProperty('--block', `var(--${shape.color})`);
  const block = { el, nameEl, shape, rect, name,
    select(on){ el.classList.toggle('selected', on); },
    set(r){ block.rect = r; Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); },
    rename(){
      if (nameEl.isContentEditable) return;
      nameEl.contentEditable = 'true'; nameEl.focus(); getSelection().selectAllChildren(nameEl);
      const done = keep => { nameEl.removeEventListener('keydown', key); nameEl.removeEventListener('blur', blur);
        nameEl.contentEditable = 'false'; getSelection().removeAllRanges();
        const text = nameEl.textContent.replace(/\s+/g, ' ').trim(); if (keep && text) block.name = text; nameEl.textContent = block.name; };
      const key = e => { e.stopPropagation();          /* typing stays in the name: Escape here does not reach the page */
        if (e.key === 'Enter'){ e.preventDefault(); nameEl.blur(); } else if (e.key === 'Escape'){ e.preventDefault(); done(false); nameEl.blur(); } };
      const blur = () => done(true);
      nameEl.addEventListener('keydown', key); nameEl.addEventListener('blur', blur);
    } };
  block.set(rect);
  return block;
}
