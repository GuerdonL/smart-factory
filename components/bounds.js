/* A frame round several blocks, with a name above its top-left corner and buttons under its bottom-left corner.
   It has two uses: the dashed box round a selection of several blocks, and the solid box that stays round a named
   group whether it is selected or not.

   createBounds() -> { el, nameEl, groupButton, foldButton, set(rect, options) }
     set    fits the frame round rect ({ x, y, w, h } in world coordinates), leaving room inside for the blocks' own
            names. options:
              name      the name to show above it; none shows a faint "name" to press, where tools are on
              solid     a solid line in place of the dashed one: a named group
              selected  drawn in the selection colour
              tools     shows the name field and the buttons: on for whatever is selected
              grouped   the blocks are one group, so the group button reads "ungroup"
              fold      shows the fold button: move the blocks into a new block of the same name
              grow      how many levels of named groups are framed inside this one; the frame stands that much
                        further off, so frames nest without touching
     nameEl, groupButton, foldButton   the elements. The canvas hands clicks to the page, so the page watches for
            clicks on them; this component does not act on them itself.
   Put el in the view's world; remove it when there is nothing to surround. */
import { html, style } from './dom.js';

const ICON = {
  group: `<rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke-dasharray="2.6 2"/><rect x="4" y="4" width="4.6" height="4.6" rx=".6"/><rect x="7.4" y="7.4" width="4.6" height="4.6" rx=".6"/>`,
  ungroup: `<rect x="2" y="2" width="5.2" height="5.2" rx=".6"/><rect x="8.8" y="8.8" width="5.2" height="5.2" rx=".6"/><path d="M9.5 3.5h3v3M6.5 12.5h-3v-3" stroke-dasharray="1.6 1.4"/>`,
  fold: `<path d="M8 1.2v6.3M5.4 5.1 8 7.7l2.6-2.6"/><path d="M4.5 7.5H3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1h-1.5"/>`,
};

style('bounds', `
.bounds { position: absolute; z-index: 2; pointer-events: none; --px: calc(1px / var(--zoom, 1)); --grow: 0;
  --pad: calc((12 + 14 * var(--grow)) * var(--px)); --top: calc((32 + 34 * var(--grow)) * var(--px)); --ink: var(--muted); }
.bounds.selected { --ink: var(--select); }
.bounds::before { content: ""; position: absolute; inset: calc(-1 * var(--top)) calc(-1 * var(--pad)) calc(-1 * var(--pad));
  border: calc(1.5 * var(--px)) dashed var(--ink); border-radius: calc(10 * var(--px)); }
.bounds.solid::before { border-style: solid; }
.bounds-name { position: absolute; left: calc(-1 * var(--pad)); bottom: calc(100% + var(--top) + 5 * var(--px)); pointer-events: auto; cursor: default;
  padding: 0 calc(3 * var(--px)); font-family: var(--font-name); font-size: calc(14 * var(--px)); line-height: 1.2; white-space: nowrap; color: var(--fg); }
.bounds.selected .bounds-name { color: var(--select); }
.bounds-name:empty::before { content: "name"; color: var(--muted); }
.bounds-tools { position: absolute; left: calc(-1 * var(--pad)); top: calc(100% + var(--pad) + 6 * var(--px)); display: flex; gap: calc(6 * var(--px)); }
.bounds-tools button { pointer-events: auto; cursor: pointer; display: grid; place-items: center; width: calc(26 * var(--px)); height: calc(26 * var(--px)); padding: 0; color: var(--select);
  background: var(--panel); border: var(--px) solid var(--line); border-radius: calc(6 * var(--px)); box-shadow: 0 calc(1 * var(--px)) calc(3 * var(--px)) var(--shadow); }
.bounds-tools button:hover { background: var(--hover); }
.bounds-tools svg { width: calc(16 * var(--px)); height: calc(16 * var(--px)); fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
`);

export function createBounds(){
  const el = html`<div class="bounds"><span class="bounds-name"></span><div class="bounds-tools">
    <button type="button"><svg viewBox="0 0 16 16"></svg></button><button type="button" title="Move into a new block" aria-label="Move into a new block"><svg viewBox="0 0 16 16">${ICON.fold}</svg></button></div></div>`;
  const nameEl = el.firstElementChild, tools = el.lastElementChild, [groupButton, foldButton] = tools.children;
  return { el, nameEl, groupButton, foldButton,
    set(r, { name = '', solid = false, selected = false, tools: on = false, grouped = false, fold = false, grow = 0 } = {}){
      el.style.setProperty('--grow', grow);
      Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      el.classList.toggle('solid', solid); el.classList.toggle('selected', selected);
      if (!nameEl.isContentEditable) nameEl.textContent = name;             /* a name being typed is left alone */
      nameEl.hidden = !name && !on; tools.hidden = !on; foldButton.hidden = !fold;
      groupButton.firstElementChild.innerHTML = grouped ? ICON.ungroup : ICON.group;
      groupButton.title = grouped ? 'Ungroup' : 'Group'; groupButton.setAttribute('aria-label', groupButton.title); } };
}
