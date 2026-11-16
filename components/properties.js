/* The properties of what is selected: a small panel that comes up in the corner while one shape is selected, with
   every attribute of the variable together, each of them editable.

   createProperties({ onName(text), onValue(key, text), onLabel(key, text), onAdd(), onEntry(key, text) }) -> { el, show(what), focus(k) }
     show   takes what to put up, or null to take the panel down:
              { id, name, color, cols, rows, scalar, matrix, attributes }
              id           whatever tells one shape from another: the panel is kept as it is while this stays the same
              name         the variable's name, written large; click it to type another (onName)
              color        a CSS colour for the name (the variable's own); where it is no colour, the text colour is used
              cols, rows   the shape, written "3 wide × 6 tall" (a single entry is "scalar")
              attributes   [{ key, label, text, result, error, custom }], a row each:
                             label   the attribute's name; where custom, it can be typed over (onLabel(key, text))
                             text    its value as it was typed: a number, or arithmetic. Click to type another
                                     (onValue(key, text)). A power written ^(…) is shown raised.
                             result  what the arithmetic comes to, written after it ("= 12"); null for none
                             error   why it cannot be read, written in its place in the warning colour
              matrix       what createMatrix takes, less its cell: the value. A long side is cut short there, to its
                           first three entries, dots, and its last. Click an entry to type a number (onEntry("c,r", text)).
     A plus button under the attributes adds one (onAdd).
     focus  puts the cursor in a cell the next time the panel is drawn: "a2.label", "x.value"

   Typing a value: Enter or clicking away keeps it, Escape puts it back. ^( … ) becomes a raised power as soon as its
   bracket is closed, and Ctrl+. (or Cmd+.) goes into a raised power and comes back out of one. */
import { html, style, editText } from './dom.js';
import { createMatrix } from './matrix.js';

style('properties', `
.properties { position: fixed; z-index: 9; --px: 1px; display: flex; flex-direction: column; gap: 6px; box-sizing: border-box; max-width: min(360px, calc(100% - 32px)); max-height: calc(100% - 130px); overflow: auto;
  left: max(16px, env(safe-area-inset-left, 0px)); bottom: calc(52px + env(safe-area-inset-bottom, 0px)); padding: 10px 14px 12px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 2px 10px var(--shadow); animation: properties-up .12s ease-out; }
@keyframes properties-up { from { opacity: 0; transform: translateY(6px); } }
.properties-name { font-family: var(--font-name); font-size: 22px; line-height: 1.15; letter-spacing: -0.02em; color: var(--named, var(--fg)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 4px; cursor: text; }
.properties-shape { color: var(--muted); font-variant-numeric: tabular-nums; }
.properties-rows { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 3px 12px; align-items: baseline; font-family: var(--font-name); font-size: 14px; }
.properties-rows > .label { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; border-radius: 4px; padding: 1px 3px; margin-left: -3px; }
.properties-rows > .value { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.properties-rows .typed { min-width: 28px; padding: 1px 4px; border-radius: 4px; border: 1px solid transparent; cursor: text; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.properties-rows .typed:hover, .properties-rows .label[contenteditable]:hover, .properties-name:hover { background: var(--hover); }
.properties-rows .typed:focus, .properties-rows .label:focus, .properties-name:focus { outline: none; border-color: var(--line); background: var(--bg); box-shadow: 0 0 0 2px var(--select-halo); }
/* cells here are always ready to be typed in: they show it only under the pointer and while the cursor is in them */
.properties [contenteditable="true"] { outline: none; box-shadow: none; background: none; }
.properties [contenteditable="true"]:hover { background: var(--hover); }
.properties [contenteditable="true"]:focus { background: var(--bg); box-shadow: 0 0 0 2px var(--select-halo); }
.properties-rows .typed:empty::before { content: "–"; color: var(--muted); }
.properties-rows .typed sup { font-size: .72em; vertical-align: .5em; line-height: 0; padding: 0 1px; }
.properties-rows .typed:focus sup { background: var(--hover); border-radius: 2px; }
.properties-rows .outcome { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.properties-rows .outcome.error { color: var(--warn); white-space: normal; font-family: var(--font-ui); font-size: 12px; }
.properties-add { all: unset; box-sizing: border-box; align-self: flex-start; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--line); color: var(--muted); font: 15px/20px var(--font-ui); text-align: center; cursor: pointer; }
.properties-add:hover { color: var(--fg); background: var(--hover); }
.properties-add:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.properties-value { padding: 5px 7px 3px; align-self: flex-start; }
.properties-value .matrix { position: relative; }
.properties-value .matrix > span[data-c] { cursor: text; }
@media (prefers-reduced-motion: reduce) { .properties { animation: none; } }
`);

const CELL = 26, GAP = '​';      /* GAP: a letter of no width, so the cursor has somewhere to stand in an empty raised power */
/* arithmetic as text, to and from what is on the page: ^( … ) is a <sup>, however deep */
function draw(text, into){
  into.replaceChildren(); let at = into, depth = [], buf = '';
  const flush = () => { if (buf){ at.append(buf); buf = ''; } };
  for (let i = 0; i < text.length; i++){ const c = text[i];
    if (c === '^' && text[i + 1] === '('){ flush(); const sup = document.createElement('sup'); at.append(sup); depth.push([at, 0]); at = sup; i++; continue; }
    if (depth.length && c === '('){ depth[depth.length - 1][1]++; buf += c; continue; }
    if (depth.length && c === ')'){ if (depth[depth.length - 1][1]){ depth[depth.length - 1][1]--; buf += c; continue; } flush(); if (!at.childNodes.length) at.append(GAP); at = depth.pop()[0]; buf = GAP; continue; }      /* GAP: what follows a raised power starts in a text of its own, outside it */
    buf += c; }
  flush();
}
const read = node => [...node.childNodes].map(n => n.nodeType === 3 ? n.data : n.nodeName === 'SUP' ? '^(' + read(n) + ')' : read(n)).join('').replaceAll(GAP, '').replace(/ /g, ' ');
/* where the cursor is, counted in letters of the text read() gives, and back again */
function caretIn(root){
  const sel = getSelection(); if (!sel.rangeCount || !root.contains(sel.anchorNode)) return null;
  let n = 0, found = null;
  const walk = node => { if (found !== null) return;
    if (node === sel.anchorNode && node.nodeType === 3){ found = n + node.data.slice(0, sel.anchorOffset).replaceAll(GAP, '').length; return; }
    if (node.nodeType === 3){ n += node.data.replaceAll(GAP, '').length; return; }
    if (node.nodeName === 'SUP' && node !== root) n += 2;
    [...node.childNodes].forEach((c, i) => { if (found === null && node === sel.anchorNode && i === sel.anchorOffset) found = n; walk(c); });
    if (found === null && node === sel.anchorNode && sel.anchorOffset >= node.childNodes.length) found = n;
    if (node.nodeName === 'SUP' && node !== root) n += 1; };
  walk(root); return found ?? n;
}
function putCaret(root, at){
  let n = 0, done = false; const sel = getSelection();
  const set = (node, off) => { const r = document.createRange(); r.setStart(node, off); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); done = true; };
  const walk = node => { if (done) return;
    if (node.nodeType === 3){ const len = node.data.replaceAll(GAP, '').length; if (at <= n + len){ let off = 0, seen = 0; while (seen < at - n){ if (node.data[off] !== GAP) seen++; off++; } while (node.data[off] === GAP) off++; return set(node, off); } n += len; return; }
    if (node.nodeName === 'SUP' && node !== root){ if (at <= n){ return set(node.parentNode, [...node.parentNode.childNodes].indexOf(node)); } n += 2; }
    for (const c of [...node.childNodes]){ walk(c); if (done) return; }
    if (node.nodeName === 'SUP' && node !== root){ if (at <= n) return set(node, node.childNodes.length); n += 1; } };
  walk(root); if (!done) set(root, root.childNodes.length);
}

export function createProperties({ onName = () => {}, onValue = () => {}, onLabel = () => {}, onAdd = () => {}, onEntry = () => {} } = {}){
  const el = html`<div class="properties" aria-label="Properties" hidden><div class="properties-name" tabindex="0"></div><div class="properties-shape"></div><div class="properties-rows"></div><button type="button" class="properties-add" aria-label="Add an attribute" title="Add an attribute">+</button><div class="properties-value"></div></div>`;
  const [name, shape, rows, add, value] = el.children;
  let showing = '', want = null, held = null, shownId = null;      /* want: the cell to put the cursor in once drawn; held: what was last asked to be shown while a cell was being typed in */
  el.addEventListener('contextmenu', e => e.stopPropagation());
  el.addEventListener('pointerdown', e => { const c = e.target.closest?.('[data-k]'); want = c && !c.matches(':focus') ? c.dataset.k : null; e.stopPropagation(); });
  el.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  add.addEventListener('click', () => onAdd());
  name.addEventListener('click', () => { if (name.isContentEditable) return; const was = name.textContent; editText(name, text => { if (text && text !== was) onName(text); else name.textContent = was; }); });
  name.addEventListener('keydown', e => { if (e.key === 'Enter' && !name.isContentEditable){ e.preventDefault(); name.click(); } });
  /* one cell that is typed in: a label (plain) or a value (arithmetic, with raised powers) */
  function typed(cell, text, keep, rich){
    const fill = () => { if (rich) draw(text, cell); else cell.textContent = text; };
    fill(); cell.contentEditable = 'true'; cell.spellcheck = false;
    cell.addEventListener('focus', () => { if (cell.dataset.sel !== 'no') getSelection().selectAllChildren(cell); });
    cell.addEventListener('blur', e => { const now = (rich ? read(cell) : cell.textContent.replace(/\s+/g, ' ')).trim(); const next = e.relatedTarget?.closest?.('[data-k]'); if (next) want = next.dataset.k;
      const waiting = held; held = null;
      if (now !== text){ showing = ''; keep(now); } else if (waiting !== null) self.show(waiting); });      /* whatever comes of it, the panel is drawn afresh */
    cell.addEventListener('keydown', e => { e.stopPropagation();
      if (e.key === 'Enter'){ e.preventDefault(); want = null; cell.blur(); }
      else if (e.key === 'Escape'){ e.preventDefault(); fill(); want = null; cell.blur(); }
      else if (rich && e.key === '.' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); raise(cell); } });
    if (rich) cell.addEventListener('input', () => {      /* a ^( … ) whose bracket has just been closed is raised */
      const t = read(cell), flat = [...cell.childNodes].some(n => n.nodeType === 3 && /\^\([^()]*\)/.test(n.data)) || [...cell.querySelectorAll('sup')].some(s => [...s.childNodes].some(n => n.nodeType === 3 && /\^\([^()]*\)/.test(n.data)));
      if (!flat) return; const at = caretIn(cell); draw(t, cell); putCaret(cell, at ?? t.length); });
  }
  /* Ctrl+.: into a new raised power where the cursor is, or out of the one it is in */
  function raise(cell){
    const sel = getSelection(); if (!sel.rangeCount || !cell.contains(sel.anchorNode)) return;
    const inside = (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentNode : sel.anchorNode).closest('sup');
    const r = document.createRange();
    if (inside && cell.contains(inside)){ let after = inside.nextSibling; if (!after || after.nodeType !== 3){ after = document.createTextNode(GAP); inside.after(after); } else if (!after.data.startsWith(GAP)) after.insertData(0, GAP);      /* somewhere outside it for the cursor to stand */
      r.setStart(after, 1); }
    else { sel.deleteFromDocument(); const sup = document.createElement('sup'); sup.append(GAP); sel.getRangeAt(0).insertNode(sup); r.setStart(sup.firstChild, 1); }
    r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
  }
  const self = { el, focus(k){ want = k; },
    show(what){
      if (!what){ el.hidden = true; showing = ''; held = null; return; }
      const key = JSON.stringify([what.id, what.name, what.color, what.cols, what.rows, what.scalar, what.attributes, { ...what.matrix, values: [...(what.matrix.values || [])] }]);
      if (key === showing && !want) return;
      if (el.contains(document.activeElement) && document.activeElement.isContentEditable && what.id === shownId){ held = what; return; }      /* being typed in: drawn again when that is done */
      showing = key; held = null; shownId = what.id;
      if (!name.isContentEditable) name.textContent = what.name; name.style.setProperty('--named', what.color || 'initial');
      shape.textContent = what.scalar ? 'scalar' : `${what.cols} wide × ${what.rows} tall`;
      rows.replaceChildren();
      for (const a of what.attributes || []){
        const label = html`<span class="label"></span>`, cellV = html`<span class="value"><span class="typed"></span></span>`, t = cellV.firstChild;
        if (a.custom){ label.dataset.k = a.key + '.label'; typed(label, a.label, text => onLabel(a.key, text), false); } else label.textContent = a.label;
        t.dataset.k = a.key + '.value'; typed(t, a.text ?? '', text => onValue(a.key, text), true);
        if (a.error){ const r = html`<span class="outcome error"></span>`; r.textContent = a.error; cellV.append(r); }
        else if (a.result != null){ const r = html`<span class="outcome"></span>`; r.textContent = '= ' + a.result; cellV.append(r); }
        rows.append(label, cellV); }
      const m = createMatrix({ ...what.matrix, cols: what.cols, rows: what.rows, cell: CELL });
      m.el.addEventListener('click', e => { const s = e.target.closest('span[data-c]'); if (!s || s.isContentEditable) return; const k = s.dataset.c + ',' + s.dataset.r, was = s.cloneNode(true);
        s.textContent = s.classList.contains('set') ? s.textContent : ''; editText(s, text => { if (text === null) return s.replaceWith(was); showing = ''; onEntry(k, text); }); });
      value.replaceChildren(m.el);
      el.hidden = false;
      if (want){ const c = el.querySelector(`[data-k="${CSS.escape(want)}"]`); want = null; if (c) c.focus(); } } };
  return self;
}
