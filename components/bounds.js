/* The box drawn round a selection of several blocks, with a group button under its bottom-left corner.

   createBounds() -> { el, button, set(rect, { grouped }) }
     set      fits the box round rect ({ x, y, w, h } in world coordinates). `grouped` says the selection is already
              one group, which turns the button into "ungroup".
     button   the button's element. The canvas hands clicks to the page, so the page watches for clicks on it;
              this component does not act on them itself.
   Put el in the view's world; remove it when there is nothing to surround. */
import { html, style } from './dom.js';

const ICON = {
  group: `<rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke-dasharray="2.6 2"/><rect x="4" y="4" width="4.6" height="4.6" rx=".6"/><rect x="7.4" y="7.4" width="4.6" height="4.6" rx=".6"/>`,
  ungroup: `<rect x="2" y="2" width="5.2" height="5.2" rx=".6"/><rect x="8.8" y="8.8" width="5.2" height="5.2" rx=".6"/><path d="M9.5 3.5h3v3M6.5 12.5h-3v-3" stroke-dasharray="1.6 1.4"/>`,
};

style('bounds', `
.bounds { position: absolute; z-index: 2; pointer-events: none; --px: calc(1px / var(--zoom, 1)); --pad: calc(12 * var(--px)); }
.bounds::before { content: ""; position: absolute; inset: calc(-1 * var(--pad)); border: calc(1.5 * var(--px)) dashed var(--select); border-radius: calc(10 * var(--px)); }
.bounds-button { position: absolute; left: calc(-1 * var(--pad)); top: calc(100% + var(--pad) + 6 * var(--px)); pointer-events: auto; cursor: pointer;
  display: grid; place-items: center; width: calc(26 * var(--px)); height: calc(26 * var(--px)); padding: 0; color: var(--select);
  background: var(--panel); border: var(--px) solid var(--line); border-radius: calc(6 * var(--px)); box-shadow: 0 calc(1 * var(--px)) calc(3 * var(--px)) var(--shadow); }
.bounds-button:hover { background: var(--hover); }
.bounds-button svg { width: calc(16 * var(--px)); height: calc(16 * var(--px)); fill: none; stroke: currentColor; stroke-width: 1.3; pointer-events: none; }
`);

export function createBounds(){
  const el = html`<div class="bounds"><button class="bounds-button" type="button"><svg viewBox="0 0 16 16"></svg></button></div>`;
  const button = el.firstElementChild, svg = button.firstElementChild;
  return { el, button, set(r, { grouped = false } = {}){
    Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    svg.innerHTML = grouped ? ICON.ungroup : ICON.group;
    button.title = grouped ? 'Ungroup' : 'Group'; button.setAttribute('aria-label', button.title); } };
}
