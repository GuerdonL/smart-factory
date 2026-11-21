/* The properties of what is selected: a small panel that comes up in the corner while one shape is selected, with
   every attribute of the variable together, each of them editable.

   createProperties({ onName(text), onValue(key, text), onLabel(key, text), onAdd(), onAction(key), onEntry(key, text), textOf(key), onInto(c, r), onUp(), onTake(x, y), onTurn(from, to), onHolds(key, holds), look, reach, onOpen, onClose }) -> { el, show(what), focus(k) }
     show   takes what to put up, or null to take the panel down:
              { id, name, color, cols, rows, scalar, matrix, attributes, notes, shape, plain, fixed }
              id           whatever tells one shape from another: the panel is kept as it is while this stays the same
              name         the variable's name, written large; click it to type another (onName)
              color        a CSS colour for the name (the variable's own); where it is no colour, the text colour is used
              cols, rows   the shape, written "3 wide × 6 tall" (a single entry is "scalar")
              shape        where given, written in place of that (an arrow says what kind of function it is, a
                           source its kind, a tile its pattern and its counts)
              plain        no plus button: this has only the rows it is given
              fixed        the matrix's entries cannot be pressed: they are worked out (an arrow's output)
              attributes   [{ key, label, text, result, error, custom }], a row each:
                             label   the attribute's name; where custom, it can be typed over (onLabel(key, text))
                             text    its value as it was typed: a number, or a formula, in its stored form (capsules
                                     as @[id:x]). Click to type another (onValue(key, text)).
                             result  what the formula comes to, written after it ("= 12"); null for none
                             error   why it has no value, written in its place in the warning colour
                             matrices   the field takes a whole matrix (an arrow's entry formula)
              spaces       [{ key, label, holds, inferred, from, note, fixed }], a row each after the attributes: the
                           number space the shape holds ("Holds"; of an arrow, what it "Takes" and "Gives").
                             holds     what it promises, "integer?" (spaces.js), or null: then inferred is written
                                       in its place, greyed, with from after it: "integer (from its entries)"
                             note      where the promise is not met, or cannot be shown to be: the sentence, in
                                       the warning colour, the promise's word in that colour too
                             fixed     the row can only be read (there is no block to hold the promise)
                             hint      a sentence written after the list: what to do to promise it
                           A row is a list of the nine words (the first choice is no promise) and an "or None" box;
                           a choice is handed on as onHolds(key, "integer?"), and no promise as onHolds(key, null).
                           words: the nine, in order. reserved: words kept back for what is not built
                           (complex), listed after them as "complex (not built)"; choosing one is handed on like
                           any other, for whoever is told to refuse with its sentence.
              matrix       what createMatrix takes, less its cell: the value (null: none is drawn). A long side is cut short there, to its
                           first three entries, dots, and its last. Click an entry to type a value over it: the
                           field opens holding textOf("c,r"), what the entry holds as it would be typed, and what
                           is typed is handed to onEntry("c,r", text).
                           Where the matrix has inner (its entries hold inner data: matrix.js), an entry is not
                           typed over: pressing one opens it, onInto(column, row), and whoever is told puts up
                           that entry's own matrix in its place, with a trail.
              trail        where given, the heading over an opened entry, "QKV › 2,1": written above the matrix.
                           Pressing it goes back up one level (onUp()). A press that becomes a drag and is let
                           go off the panel is handed on as onTake(x, y), where it was let go on the screen:
                           the opened entry dragged out onto the canvas.
              axes         where given, { labels: [text], drawn: 2 }: the axes of the shape in the order this use has
                           them, written as a list with a bar after the ones that are drawn: key, embed | head.
                           Dragging one to another place in the list turns the use: onTurn(from, to), places
                           counted from 0.
              notes        lines written under the matrix in the warning colour: why an entry shows the error mark
              actions      [{ key, label }]: buttons under the rows, each handed to onAction(key) when pressed (a file
                           source's "Choose a CSV file…")
     A plus button under the attributes adds one (onAdd).
     focus  puts the cursor in a cell the next time the panel is drawn: "a2.label", "x.value"
     look, reach, onOpen, onClose   handed on to every formula field the panel makes (formula.js): how a capsule is
              drawn, the variables an @ offers, and word of which field is open

   Every value is typed in a formula field (formula.js): Enter or clicking away keeps it, Escape puts it back. A
   label is plain text, typed over in place the same way. */
import { html, style, editText } from './dom.js';
import { createMatrix, valuesKey } from './matrix.js';
import { createFormula } from './formula.js';

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
.properties-notes { color: var(--warn); font: 12px/1.35 var(--font-ui); }
.properties-rows .space { font: inherit; color: inherit; background: none; border: 1px solid var(--line); border-radius: 4px; padding: 0 2px; max-width: 100%; }
.properties-rows .space.inferred { color: var(--muted); }
.properties-rows .space.unmet { color: var(--warn); }
.properties-rows .space-none { display: inline-flex; align-items: baseline; gap: 3px; color: var(--muted); white-space: nowrap; font-family: var(--font-ui); font-size: 12px; }
.properties-rows .value.spaced { flex-wrap: wrap; }
.properties-rows .outcome { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.properties-rows .outcome.error { color: var(--warn); white-space: normal; font-family: var(--font-ui); font-size: 12px; }
.properties-rows .outcome.hint { white-space: normal; font-family: var(--font-ui); font-size: 12px; }
.properties-add { all: unset; box-sizing: border-box; align-self: flex-start; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--line); color: var(--muted); font: 15px/20px var(--font-ui); text-align: center; cursor: pointer; }
.properties-add:hover { color: var(--fg); background: var(--hover); }
.properties-add:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.properties-action { font: 13px var(--font-ui); color: var(--fg); background: none; border: 1px solid var(--line); border-radius: 5px; padding: 3px 9px; cursor: pointer; }
.properties-action:hover { background: var(--hover); } .properties-action:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.properties-value { padding: 5px 7px 3px; align-self: flex-start; }
/* the axes of a use, in the order it has them: those before the bar are drawn. Each can be dragged to another place */
.properties-axes { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font: 12px/1.4 var(--font-ui); color: var(--muted); user-select: none; -webkit-user-select: none; }
.properties-axes .axis { padding: 1px 7px; border: 1px solid var(--line); border-radius: 10px; color: var(--fg); background: var(--bg); cursor: grab; touch-action: none; }
.properties-axes .axis.held { opacity: .5; cursor: grabbing; } .properties-axes .axis.over { border-color: var(--select); box-shadow: 0 0 0 2px var(--select-halo); }
.properties-axes .bar { width: 1px; align-self: stretch; margin: 0 3px; background: var(--muted); }
/* the heading over an opened entry: where it is, and the way back up */
.properties-trail { all: unset; box-sizing: border-box; align-self: flex-start; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 1px 6px 1px 3px; border-radius: 4px; cursor: pointer;
  font: 12px/1.5 var(--font-ui); color: var(--muted); font-variant-numeric: tabular-nums; touch-action: none; user-select: none; -webkit-user-select: none; }
.properties-trail::before { content: "‹ "; }
.properties-trail:hover { color: var(--fg); background: var(--hover); }
.properties-trail.taken { color: var(--select); cursor: grabbing; }
.properties-trail:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.properties-value .matrix > span[data-nested] { cursor: pointer; border-radius: 3px; }
.properties-value .matrix > span[data-nested]:hover { background: var(--hover); }
.properties-value .matrix { position: relative; }
.properties-value .matrix > span[data-c] { cursor: text; }
.properties-value .matrix .formula { font-size: 13px; }
@media (prefers-reduced-motion: reduce) { .properties { animation: none; } }
`);

const CELL = 26;

export function createProperties({ onName = () => {}, onValue = () => {}, onLabel = () => {}, onAdd = () => {}, onAction = () => {}, onEntry = () => {}, textOf = () => '', onInto = () => {}, onUp = () => {}, onTake = () => {}, onTurn = () => {}, onHolds = () => {}, look = () => null, reach = () => [], onOpen = () => {}, onClose = () => {} } = {}){
  const el = html`<div class="properties" aria-label="Properties" hidden><div class="properties-name" tabindex="0"></div><div class="properties-shape"></div><div class="properties-rows"></div><button type="button" class="properties-add" aria-label="Add an attribute" title="Add an attribute">+</button><div class="properties-actions" hidden></div><div class="properties-axes" aria-label="Axes: drag one to turn the shape" title="The axes of this use: those before the bar are drawn. Drag one to another place to turn it" hidden></div><button type="button" class="properties-trail" title="Back up one level (Escape). Drag it onto the canvas to take the entry out as a block" hidden></button><div class="properties-value"></div><div class="properties-notes" hidden></div></div>`;
  const [name, shape, rows, add, actions, axes, trail, value, notes] = el.children;
  /* an axis held and let go over another: it takes that place (the pointer is followed on the window) */
  axes.addEventListener('pointerdown', e => { const chip = e.target.closest?.('.axis'); if (!chip) return; const from = +chip.dataset.at; chip.classList.add('held'); let to = from;
    const at = ev => { const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.properties-axes .axis'); return over ? +over.dataset.at : null; };
    const move = ev => { const now = at(ev); for (const c of axes.querySelectorAll('.axis')) c.classList.toggle('over', now !== null && now !== from && +c.dataset.at === now); if (now !== null) to = now; else to = from; };
    const up = ev => { removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
      for (const c of axes.querySelectorAll('.axis')) c.classList.remove('held', 'over');
      if (ev.type === 'pointerup' && to !== from){ showing = ''; onTurn(from, to); } };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true); });
  /* the trail: a press goes back up; a press that moves is the entry being dragged out, and where it is let go is handed on.
     (The pointer is followed on the window: it leaves the trail at once.) */
  let dragged = false;
  trail.addEventListener('pointerdown', e => { const from = { x: e.clientX, y: e.clientY }; dragged = false;
    const move = ev => { if (!dragged && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) > 6){ dragged = true; trail.classList.add('taken'); } };
    const up = ev => { removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); trail.classList.remove('taken');
      if (dragged && ev.type === 'pointerup' && !el.contains(document.elementFromPoint(ev.clientX, ev.clientY))) onTake(ev.clientX, ev.clientY); };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true); });
  trail.addEventListener('click', () => { if (dragged){ dragged = false; return; } onUp(); });
  el.addEventListener('dragstart', e => { if (trail.classList.contains('taken') || e.target === trail) e.preventDefault(); });      /* text that happens to be selected in the panel is not what is being dragged */
  let showing = '', want = null, held = null, shownId = null;      /* want: the cell to put the cursor in once drawn; held: what was last asked to be shown while a cell was being typed in */
  el.addEventListener('contextmenu', e => e.stopPropagation());
  el.addEventListener('pointerdown', e => { const c = e.target.closest?.('[data-k]'); want = c && !c.matches(':focus') ? c.dataset.k : null; e.stopPropagation(); });
  el.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  add.addEventListener('click', () => onAdd());
  name.addEventListener('click', () => { if (name.isContentEditable) return; const was = name.textContent; editText(name, text => { if (text && text !== was) onName(text); else name.textContent = was; }); });
  name.addEventListener('keydown', e => { if (e.key === 'Enter' && !name.isContentEditable){ e.preventDefault(); name.click(); } });
  /* a label: plain text, typed over in place */
  function typed(cell, text, keep){
    cell.textContent = text; cell.contentEditable = 'true'; cell.spellcheck = false;
    cell.addEventListener('focus', () => { if (cell.dataset.sel !== 'no') getSelection().selectAllChildren(cell); });
    cell.addEventListener('blur', e => { const now = cell.textContent.replace(/\s+/g, ' ').trim(); const next = e.relatedTarget?.closest?.('[data-k]'); if (next) want = next.dataset.k;
      const waiting = held; held = null;
      if (now !== text){ showing = ''; keep(now); } else if (waiting !== null) self.show(waiting); });      /* whatever comes of it, the panel is drawn afresh */
    cell.addEventListener('keydown', e => { e.stopPropagation();
      if (e.key === 'Enter'){ e.preventDefault(); want = null; cell.blur(); }
      else if (e.key === 'Escape'){ e.preventDefault(); cell.textContent = text; want = null; cell.blur(); } });
  }
  /* a value: a formula field (formula.js). Whatever comes of what was typed, the panel is drawn afresh. */
  const after = next => { const to = next?.closest?.('[data-k]'); want = to ? to.dataset.k : null; const waiting = held; held = null; return waiting; };
  const valued = (text, keep, matrices = false) => createFormula({ text, look, reach, matrices, onOpen, onClose,
    onKeep: (now, next) => { after(next); showing = ''; keep(now); }, onLeave: next => { const waiting = after(next); if (waiting !== null) self.show(waiting); } });
  const self = { el, focus(k){ want = k; },
    show(what){
      if (!what){ el.hidden = true; showing = ''; held = null; return; }
      const key = JSON.stringify([what.id, what.name, what.color, what.cols, what.rows, what.scalar, what.attributes, what.spaces, what.notes, what.shape, what.plain, what.fixed, what.actions, what.trail, what.axes, what.matrix && { ...what.matrix, values: valuesKey(what.matrix.values) }]);
      if (key === showing && !want) return;
      if (el.contains(document.activeElement) && document.activeElement.isContentEditable && what.id === shownId){ held = what; return; }      /* being typed in: drawn again when that is done */
      showing = key; held = null; shownId = what.id;
      if (!name.isContentEditable) name.textContent = what.name; name.style.setProperty('--named', what.color || 'initial');
      shape.textContent = what.shape || (what.scalar ? 'scalar' : `${what.cols} wide × ${what.rows} tall`); add.hidden = !!what.plain;
      rows.replaceChildren();
      for (const a of what.attributes || []){
        const label = html`<span class="label"></span>`, cellV = html`<span class="value"></span>`, t = valued(a.text ?? '', text => onValue(a.key, text), !!a.matrices).el;
        if (a.custom){ label.dataset.k = a.key + '.label'; typed(label, a.label, text => onLabel(a.key, text)); } else label.textContent = a.label;
        t.classList.add('typed'); t.dataset.k = a.key + '.value'; cellV.append(t);
        if (a.error){ const r = html`<span class="outcome error"></span>`; r.textContent = a.error; cellV.append(r); }
        else if (a.result != null){ const r = html`<span class="outcome"></span>`; r.textContent = '= ' + a.result; cellV.append(r); }
        rows.append(label, cellV); }
      /* the number space it holds: a promise chosen from the nine words, with "or None"; or, greyed, what it is worked out as */
      for (const sp of what.spaces || []){
        const label = html`<span class="label"></span>`, cellV = html`<span class="value spaced"></span>`, pick = html`<select class="space"></select>`, box = html`<label class="space-none"><input type="checkbox"> or None</label>`, tick = box.firstElementChild;
        const word = sp.holds ? sp.holds.replace(/\?$/, '') : '', none = sp.holds ? sp.holds.endsWith('?') : !!sp.inferred && sp.inferred.endsWith('?'), said = sp.inferred ? sp.inferred.replace(/\?$/, '') + (sp.inferred.endsWith('?') ? ' or None' : '') : 'not known yet';
        label.textContent = sp.label; pick.dataset.k = sp.key + '.space'; pick.setAttribute('aria-label', sp.label + ': the number space'); tick.dataset.k = sp.key + '.none';
        const free = html`<option value=""></option>`; free.textContent = said + (sp.from ? ` (${sp.from})` : ''); pick.append(free);
        for (const w of what.words || []){ const o = html`<option></option>`; o.value = w; o.textContent = w; pick.append(o); }
        /* a word that is kept back for what is not built: listed, so that it is seen to be none of the spaces, and choosing it is refused with its sentence by whoever is told (the list goes back to what it showed) */
        for (const w of what.reserved || []){ const o = html`<option class="reserved"></option>`; o.value = w; o.textContent = w + ' (not built)'; pick.append(o); }
        pick.value = word; pick.classList.toggle('inferred', !word); pick.classList.toggle('unmet', !!sp.note); tick.checked = none; pick.disabled = !!sp.fixed; tick.disabled = !!sp.fixed || !word;
        const tell = () => { showing = ''; onHolds(sp.key, pick.value ? pick.value + (tick.checked ? '?' : '') : null); };
        pick.addEventListener('change', tell); tick.addEventListener('change', tell);
        cellV.append(pick, box);
        if (sp.note){ const r = html`<span class="outcome error"></span>`; r.textContent = sp.note; cellV.append(r); }
        if (sp.hint){ const r = html`<span class="outcome hint"></span>`; r.textContent = sp.hint; cellV.append(r); }      /* what to do to promise it, where the row can only be read: beside the list, never inside it, where it was cut short */
        rows.append(label, cellV); }
      trail.hidden = !what.trail; trail.textContent = what.trail || '';
      axes.hidden = !what.axes; axes.replaceChildren();
      (what.axes?.labels || []).forEach((label, i) => { if (i === what.axes.drawn) axes.append(html`<i class="bar"></i>`); const chip = html`<span class="axis" data-at="${i}"></span>`; chip.textContent = label; axes.append(chip); });
      actions.replaceChildren(...(what.actions || []).map(a => { const b = html`<button type="button" class="properties-action"></button>`; b.textContent = a.label; b.addEventListener('click', () => onAction(a.key)); return b; })); actions.hidden = !what.actions?.length;
      if (!what.matrix){ value.replaceChildren(); notes.replaceChildren(...(what.notes || []).map(n => { const p = html`<div></div>`; p.textContent = n; return p; })); notes.hidden = !what.notes?.length; el.hidden = false;
        if (want){ const c = el.querySelector(`[data-k="${CSS.escape(want)}"]`); want = null; if (c) c.focus(); } return; }
      const m = createMatrix({ ...what.matrix, cols: what.cols, rows: what.rows, cell: CELL, noteMax: 11 * CELL });      /* (a note longer than the panel has room for is cut short there: the notes beneath say it in full) */
      /* an entry pressed: a formula field opens over it, holding what the entry holds (its formula, not what that comes to) */
      m.el.addEventListener('click', e => { const s = e.target.closest('span[data-c]'); if (!s || s.querySelector('.formula')) return;
        if (s.dataset.nested){ showing = ''; return onInto(+s.dataset.c, +s.dataset.r); }      /* it holds inner data: opened, not typed over (and a source's, or a result's, can be looked into too) */
        if (what.fixed) return; const k = s.dataset.c + ',' + s.dataset.r, was = [...s.childNodes];
        const f = createFormula({ text: textOf(k), look, reach, onOpen, onClose, onKeep: text => { s.replaceChildren(...was); showing = ''; onEntry(k, text); }, onLeave: () => s.replaceChildren(...was) });
        s.replaceChildren(f.el); f.focus(); });
      notes.replaceChildren(...(what.notes || []).map(n => { const p = html`<div></div>`; p.textContent = n; return p; })); notes.hidden = !what.notes?.length;
      value.replaceChildren(m.el);
      el.hidden = false;
      if (want){ const c = el.querySelector(`[data-k="${CSS.escape(want)}"]`); want = null; if (c) c.focus(); } } };
  return self;
}
