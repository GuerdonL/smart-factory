/* The trail of spaces you are inside, top-left:  Top › Shape 1 › Shape 3

   createCrumbs({ onGo(index) }) -> { el, show(labels) }
     show   takes the names from the outermost space to the current one. With only one, the trail hides.
     onGo   called with the index of an earlier name when it is pressed */
import { html, style } from './dom.js';

style('crumbs', `
.crumbs { position: fixed; z-index: 10; display: flex; align-items: center; gap: 2px; max-width: calc(100% - 32px); overflow: hidden;
  left: max(16px, env(safe-area-inset-left, 0px)); top: calc(12px + env(safe-area-inset-top, 0px));
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; font-family: var(--font-name); font-size: 14px; }
.crumbs button { font: inherit; color: var(--muted); background: none; border: 0; border-radius: 4px; padding: 2px 6px; cursor: pointer; white-space: nowrap; }
.crumbs button:hover { background: var(--hover); color: var(--fg); }
.crumbs button:focus-visible { outline: 2px solid var(--focus); outline-offset: -1px; }
.crumbs span { padding: 2px 6px; color: var(--fg); white-space: nowrap; }
.crumbs i { color: var(--muted); font-style: normal; }
`);

export function createCrumbs({ onGo = () => {} } = {}){
  const el = html`<nav class="crumbs" aria-label="Where you are" hidden></nav>`;
  el.addEventListener('contextmenu', e => e.preventDefault());
  return { el, show(labels){
    el.replaceChildren(); el.hidden = labels.length < 2;
    labels.forEach((label, i) => {
      if (i) el.append(html`<i aria-hidden="true">›</i>`);
      const last = i === labels.length - 1, item = last ? html`<span aria-current="page"></span>` : html`<button type="button"></button>`;
      item.textContent = label; if (!last) item.addEventListener('click', () => onGo(i));
      el.append(item);
    }); } };
}
