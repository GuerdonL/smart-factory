/* A pop-up menu.

   createMenu(items) -> { el, openAt(x, y), close() }
     items   [{ label, more, run }]: `more` marks an item that will open a submenu; `run` is called when it is chosen
   It closes itself on a click elsewhere, Escape, or the window losing focus. */
import { html, style } from './dom.js';

style('menu', `
.menu { position: fixed; z-index: 20; min-width: 140px; margin: 0; padding: 4px; list-style: none;
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 6px 20px var(--shadow); }
.menu button { display: flex; justify-content: space-between; gap: 24px; width: 100%; font: inherit; color: var(--fg);
  background: none; border: 0; border-radius: 4px; padding: 5px 10px; text-align: left; cursor: default; }
.menu button:hover, .menu button:focus-visible { background: var(--hover); outline: none; }
.menu-more { color: var(--muted); }
`);

export function createMenu(items = []){
  const el = html`<ul class="menu" role="menu" hidden></ul>`;
  const close = () => { el.hidden = true; };
  for (const it of items){
    const li = html`<li role="none"><button type="button" role="menuitem"><span></span></button></li>`, b = li.firstElementChild;
    b.firstElementChild.textContent = it.label;
    if (it.more){ b.setAttribute('aria-haspopup', 'true'); b.append(html`<span class="menu-more">+</span>`); }
    b.addEventListener('click', () => { if (it.run){ close(); it.run(); } });
    el.append(li);
  }
  el.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('pointerdown', e => { if (!el.hidden && !el.contains(e.target)) close(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  addEventListener('blur', close);
  return { el, close,
    openAt(x, y){ el.hidden = false;        /* kept inside the window */
      el.style.left = Math.max(4, Math.min(x, innerWidth - el.offsetWidth - 4)) + 'px';
      el.style.top = Math.max(4, Math.min(y, innerHeight - el.offsetHeight - 4)) + 'px'; } };
}
