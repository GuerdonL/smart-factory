/* Helpers every component uses: carrying its own markup and styles, and editing a piece of text in place. */

/* html`<div>…</div>` -> the element */
export function html(strings, ...values){
  const t = document.createElement('template');
  t.innerHTML = String.raw({ raw: strings }, ...values).trim();
  return t.content.firstElementChild;
}

/* adds a component's stylesheet to the page once, however many instances are made */
const added = new Set();
export function style(name, css){
  if (added.has(name)) return; added.add(name);
  const el = document.createElement('style'); el.dataset.component = name; el.textContent = css;
  document.head.append(el);
}

/* editText(el, done): lets the user type over el's text in place.
   Enter or clicking away finishes with done(text); Escape finishes with done(null). The caller decides what
   el shows afterwards. While typing, keys do not reach the rest of the page. */
style('edit', `
[contenteditable="true"] { cursor: text; user-select: text; -webkit-user-select: text; min-width: 1ch; border-radius: 3px;
  background: var(--panel); color: var(--fg); outline: 1.5px solid var(--select); outline-offset: 1px; }
`);
export function editText(el, done){
  if (el.isContentEditable) return;
  el.contentEditable = 'true'; el.focus(); getSelection().selectAllChildren(el);
  const finish = keep => { el.removeEventListener('keydown', key); el.removeEventListener('blur', blur);
    el.contentEditable = 'false'; getSelection().removeAllRanges();
    done(keep ? el.textContent.replace(/\s+/g, ' ').trim() : null); };
  const key = e => { e.stopPropagation();
    if (e.key === 'Enter'){ e.preventDefault(); el.blur(); } else if (e.key === 'Escape'){ e.preventDefault(); finish(false); el.blur(); } };
  const blur = () => finish(true);
  el.addEventListener('keydown', key); el.addEventListener('blur', blur);
}
