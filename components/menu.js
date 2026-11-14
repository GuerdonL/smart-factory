/* A pop-up menu, with submenus.

   createMenu(items) -> { el, openAt(x, y), close() }
     items   [{ label, run, items }]
               run     called when the item is chosen; the menu then closes
               items   a list of the same kind, or a function returning one: makes the item open a submenu
                       on hover or click. A function is asked each time the menu opens, so the list can change.
   It closes itself on a click elsewhere, Escape, or the window losing focus. */
import { html, style } from './dom.js';

style('menu', `
.menu, .menu ul { position: fixed; z-index: 20; min-width: 140px; margin: 0; padding: 4px; list-style: none;
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 6px 20px var(--shadow); }
.menu li { position: relative; }
.menu button { display: flex; justify-content: space-between; gap: 24px; width: 100%; font: inherit; color: var(--fg);
  background: none; border: 0; border-radius: 4px; padding: 5px 10px; text-align: left; cursor: default; }
.menu button:hover, .menu button:focus-visible, .menu li.open > button { background: var(--hover); outline: none; }
.menu-more, .menu-empty { color: var(--muted); }
.menu-empty { padding: 5px 10px; }
`);

export function createMenu(items = []){
  const el = html`<ul class="menu" role="menu" hidden></ul>`;
  const close = () => { el.hidden = true; el.replaceChildren(); };

  /* keeps a list inside the window; a submenu that will not fit on the right opens to the left of its parent */
  function place(ul, x, y, flipX){
    const w = ul.offsetWidth, h = ul.offsetHeight;
    if (flipX != null && x + w > innerWidth - 4) x = flipX - w;
    ul.style.left = Math.max(4, Math.min(x, innerWidth - w - 4)) + 'px';
    ul.style.top = Math.max(4, Math.min(y, innerHeight - h - 4)) + 'px';
  }
  function fill(ul, list){
    if (!list.length) ul.append(html`<li class="menu-empty" role="none">Nothing here yet</li>`);
    for (const it of list){
      const li = html`<li role="none"><button type="button" role="menuitem"><span></span></button></li>`, b = li.firstElementChild;
      b.firstElementChild.textContent = it.label;
      const shut = () => { for (const o of ul.querySelectorAll(':scope > li.open')){ o.classList.remove('open'); o.querySelector('ul').remove(); } };
      if (it.items){
        b.setAttribute('aria-haspopup', 'true'); b.append(html`<span class="menu-more">+</span>`);
        const open = () => { if (li.classList.contains('open')) return; shut();
          const sub = html`<ul role="menu"></ul>`; fill(sub, typeof it.items === 'function' ? it.items() : it.items);
          li.classList.add('open'); li.append(sub);
          const r = li.getBoundingClientRect(); place(sub, r.right + 6, r.top - 5, r.left - 6); };
        b.addEventListener('pointerenter', open); b.addEventListener('click', open);
      } else {
        b.addEventListener('pointerenter', shut);
        b.addEventListener('click', () => { if (it.run){ close(); it.run(); } });
      }
      ul.append(li);
    }
  }

  el.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('pointerdown', e => { if (!el.hidden && !el.contains(e.target)) close(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  addEventListener('blur', close);
  return { el, close, openAt(x, y){ el.replaceChildren(); fill(el, items); el.hidden = false; place(el, x, y); } };
}
