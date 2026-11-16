/* A warning that has to be answered before something goes ahead: a short statement, a table, and two buttons.

   createWarning() -> { el, ask({ title, note, head, rows, proceed, onProceed, onCancel }), close(), open }
     ask      puts the warning up
                title      what is about to happen, in a line
                note       a sentence under it, if any
                head       the table's column headings: ['Variable', 'Instances']
                rows       the table's rows, an array of cells each; a number is set to the right
                proceed    the label of the button that goes ahead ("Delete")
                onProceed  called if the user goes ahead;  onCancel  called if not (Cancel, Escape, a click outside)
     open     whether it is up now
   Nothing happens until one of the two is chosen. Cancel has the focus when it comes up. */
import { html, style } from './dom.js';

style('warning', `
.warning-veil { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: color-mix(in srgb, var(--fade-to, #000) 55%, transparent);
  padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)); }
.warning { box-sizing: border-box; width: min(420px, 100%); max-height: 100%; display: flex; flex-direction: column; gap: 10px; padding: 16px 18px 14px;
  background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-top: 3px solid var(--warn); border-radius: 8px; box-shadow: 0 8px 30px var(--shadow); }
.warning h2 { margin: 0; font: 600 15px/1.3 var(--font-ui); text-wrap: balance; }
.warning p { margin: 0; color: var(--muted); }
.warning-table { overflow: auto; min-height: 0; border: 1px solid var(--line); border-radius: 6px; }
.warning table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.warning th, .warning td { text-align: left; padding: 5px 10px; border-bottom: 1px solid var(--line); }
.warning th { position: sticky; top: 0; background: var(--panel); color: var(--muted); font-weight: 500; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
.warning tr:last-child td { border-bottom: 0; }
.warning td { font-family: var(--font-name); font-size: 14px; }
.warning .n { text-align: right; }
.warning-buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
.warning button { font: inherit; color: var(--fg); background: none; border: 1px solid var(--line); border-radius: 5px; padding: 5px 14px; cursor: pointer; }
.warning button:hover { background: var(--hover); }
.warning button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.warning button.go { color: var(--warn); border-color: var(--warn); }
`);

export function createWarning(){
  const el = html`<div class="warning-veil" hidden><div class="warning" role="alertdialog" aria-modal="true" aria-labelledby="warning-title">
    <h2 id="warning-title"></h2><p></p><div class="warning-table"><table><thead><tr></tr></thead><tbody></tbody></table></div>
    <div class="warning-buttons"><button type="button">Cancel</button><button type="button" class="go"></button></div></div></div>`;
  const box = el.firstElementChild, [title, note] = box.children, headRow = box.querySelector('thead tr'), body = box.querySelector('tbody'), [cancel, go] = box.querySelectorAll('button');
  let answer = null;
  const done = yes => { if (!answer) return; const a = answer; answer = null; el.hidden = true; (yes ? a.onProceed : a.onCancel)?.(); };
  cancel.addEventListener('click', () => done(false)); go.addEventListener('click', () => done(true));
  el.addEventListener('pointerdown', e => { if (e.target === el) done(false); });
  el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape'){ e.preventDefault(); done(false); } });
  el.addEventListener('contextmenu', e => e.preventDefault());
  const cell = (tag, text) => { const c = document.createElement(tag); c.textContent = text; if (typeof text === 'number') c.className = 'n'; return c; };
  return { el, get open(){ return !!answer; }, close(){ done(false); },
    ask({ title: t, note: n = '', head = [], rows = [], proceed = 'Proceed', onProceed, onCancel }){
      answer = { onProceed, onCancel }; title.textContent = t; note.textContent = n; note.hidden = !n; go.textContent = proceed;
      headRow.replaceChildren(...head.map((h, i) => { const c = cell('th', h); if (rows.some(r => typeof r[i] === 'number')) c.className = 'n'; return c; }));
      body.replaceChildren(...rows.map(r => { const tr = document.createElement('tr'); tr.append(...r.map(v => cell('td', v))); return tr; }));
      el.hidden = false; cancel.focus(); } };
}
