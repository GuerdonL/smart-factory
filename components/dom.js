/* Two helpers every component uses to carry its own markup and styles. */

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
