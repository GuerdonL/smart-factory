/* A place where a value is typed: a number, or a formula (expression.js has the language). Everywhere a value is
   typed is one of these: an attribute's value, the x, y and mass rows, and every matrix entry.

   createFormula({ text, look(capsule), reach(), onKeep(text, next), onLeave(next), onOpen(field), onClose(field) })
       -> { el, focus(), insert(capsule), over(x, y), text }
     text     what is there to begin with, as it is stored: capsules as @[id:x]
     look     asked for each capsule to be drawn: { label, color } (a theme colour's name), or null where the
              variable it names is gone, which is drawn as "missing" in the warning colour
     reach    asked whenever an @ is typed: the variables that can be referred to, [{ id, name, color, scalar,
              attributes }] (see expression.js, "choosing a variable")
     onKeep   Enter, or clicking away, with what is there now where that is different; onLeave where it is the same,
              and after Escape, which puts back what was there. next is whatever the cursor went to, if anything.
     onOpen, onClose   the cursor came into the field, and left it: the page keeps track of the one that is open
     insert   puts a capsule in at the cursor (a measure dragged in from the list of variables)
     over     whether a point on the screen is on the field
     text     what is in it now, as it would be stored

   Typing. ^( … ) becomes a raised power as soon as its bracket is closed, and Ctrl+. (or Cmd+.) goes into a raised
   power and comes back out of one. @ opens a list of the variables in reach, narrowed as more is typed; the arrow
   keys move in it, and Enter, Tab or a click chooses. Choosing a variable then offers its measures the same way, and
   choosing a measure puts its capsule in. Escape shuts the list, and pressed again leaves the field.

   A capsule is drawn as a pill in its variable's colour, holding up to ten characters of the variable's name and
   the measure: Keys.x. It is one character to the cursor and cannot be typed inside. Its sizes are in ems, so it
   is the size of the text it stands in and zooms with it. */
import { html, style } from './dom.js';
import { parts, capsuleText, offers } from '../expression.js';

style('formula', `
.formula { outline: none; }
.formula sup { font-size: .72em; vertical-align: .5em; line-height: 0; padding: 0 1px; }
.formula:focus sup { background: var(--hover); border-radius: 2px; }
.capsule { display: inline-block; padding: 0 .5em; margin: 0 .12em; border-radius: 1em; background: var(--pill, var(--muted)); color: var(--on-block);
  font: 600 .8em/1.55 var(--font-name); font-style: normal; white-space: nowrap; cursor: default; user-select: all; -webkit-user-select: all; }
.capsule.missing { background: var(--warn); }
/* a field opened over a matrix entry: wide enough for what is typed, and lying over its neighbours */
.matrix > span > .formula { position: relative; z-index: 3; display: inline-block; min-width: 1.6em; font-size: calc(var(--cell) * .5); padding: 0 .3em; line-height: 1.6; font-style: normal; font-weight: 400; font-family: var(--font-ui);
  color: var(--fg); background: var(--panel); border-radius: .2em; box-shadow: 0 0 0 .1em var(--select); }
.formula-list { position: fixed; z-index: 45; min-width: 120px; max-width: 260px; padding: 4px; display: flex; flex-direction: column; gap: 1px;
  background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: 7px; box-shadow: 0 4px 16px var(--shadow); font: 13px/1.3 var(--font-name); }
.formula-list div { display: flex; align-items: center; gap: 7px; padding: 3px 8px; border-radius: 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.formula-list div.at, .formula-list div:hover { background: var(--hover); }
.formula-list i { flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--pill, var(--muted)); }
.formula-list small { color: var(--muted); font-size: 11px; margin-left: auto; padding-left: 10px; }
`);

const GAP = '​';      /* a letter of no width, so the cursor has somewhere to stand in an empty raised power, and after a capsule */
const isCapsule = node => node.nodeType === 1 && node.dataset.ref !== undefined;
/* a formula as text, from what is on the page: a raised power is ^( … ), a pill is its capsule */
const read = node => [...node.childNodes].map(n => n.nodeType === 3 ? n.data : isCapsule(n) ? n.dataset.ref : n.nodeName === 'SUP' ? '^(' + read(n) + ')' : read(n)).join('').replaceAll(GAP, '').replace(/ /g, ' ');
/* where the cursor is, counted in letters of the text read() gives, and back again */
function caretIn(root){
  const sel = getSelection(); if (!sel.rangeCount || !root.contains(sel.anchorNode)) return null;
  let n = 0, found = null;
  const walk = node => { if (found !== null) return;
    if (node === sel.anchorNode && node.nodeType === 3){ found = n + node.data.slice(0, sel.anchorOffset).replaceAll(GAP, '').length; return; }
    if (node.nodeType === 3){ n += node.data.replaceAll(GAP, '').length; return; }
    if (isCapsule(node)){ n += node.dataset.ref.length; return; }
    if (node.nodeName === 'SUP' && node !== root) n += 2;
    [...node.childNodes].forEach((c, i) => { if (found === null && node === sel.anchorNode && i === sel.anchorOffset) found = n; walk(c); });
    if (found === null && node === sel.anchorNode && sel.anchorOffset >= node.childNodes.length) found = n;
    if (node.nodeName === 'SUP' && node !== root) n += 1; };
  walk(root); return found ?? n;
}
function putCaret(root, at){
  let n = 0, done = false; const sel = getSelection();
  const set = (node, off) => { const r = document.createRange(); r.setStart(node, off); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); done = true; };
  const before = node => set(node.parentNode, [...node.parentNode.childNodes].indexOf(node));
  const walk = node => { if (done) return;
    if (node.nodeType === 3){ const len = node.data.replaceAll(GAP, '').length; if (at <= n + len){ let off = 0, seen = 0; while (seen < at - n){ if (node.data[off] !== GAP) seen++; off++; } while (node.data[off] === GAP) off++; return set(node, off); } n += len; return; }
    if (isCapsule(node)){ if (at <= n) return before(node); n += node.dataset.ref.length; return; }
    if (node.nodeName === 'SUP' && node !== root){ if (at <= n) return before(node); n += 2; }
    for (const c of [...node.childNodes]){ walk(c); if (done) return; }
    if (node.nodeName === 'SUP' && node !== root){ if (at <= n) return set(node, node.childNodes.length); n += 1; } };
  walk(root); if (!done) set(root, root.childNodes.length);
}
const FLAT = /\^\([^()]*\)/;                    /* a power written out whose bracket is closed: to be raised */

export function createFormula({ text = '', look = () => null, reach = () => [], onKeep = () => {}, onLeave = () => {}, onOpen = () => {}, onClose = () => {} } = {}){
  const el = html`<span class="formula"></span>`; el.contentEditable = 'true'; el.spellcheck = false;
  const pill = capsule => { const seen = look(capsule), c = document.createElement('span'); c.className = 'capsule' + (seen ? '' : ' missing'); c.contentEditable = 'false'; c.dataset.ref = capsuleText(capsule);
    c.textContent = seen ? seen.label : 'missing'; if (seen?.color) c.style.setProperty('--pill', `var(--${seen.color})`); return c; };
  /* the text onto the page: ^( … ) is a <sup>, however deep, and a capsule is a pill */
  function draw(text){
    el.replaceChildren(); let at = el, depth = [], buf = '';
    const flush = () => { if (buf){ at.append(buf); buf = ''; } };
    for (const part of parts(text)){
      if (typeof part !== 'string'){ flush(); at.append(pill(part)); buf = GAP; continue; }      /* GAP: what follows a pill starts in a text of its own, where the cursor can stand */
      for (let i = 0; i < part.length; i++){ const c = part[i];
        if (c === '^' && part[i + 1] === '('){ flush(); const sup = document.createElement('sup'); at.append(sup); depth.push([at, 0]); at = sup; i++; continue; }
        if (depth.length && c === '('){ depth[depth.length - 1][1]++; buf += c; continue; }
        if (depth.length && c === ')'){ if (depth[depth.length - 1][1]){ depth[depth.length - 1][1]--; buf += c; continue; } flush(); if (!at.childNodes.length) at.append(GAP); at = depth.pop()[0]; buf = GAP; continue; }      /* GAP: what follows a raised power starts outside it */
        buf += c; } }
    flush();
  }
  /* Ctrl+.: into a new raised power where the cursor is, or out of the one it is in */
  function raise(){
    const sel = getSelection(); if (!sel.rangeCount || !el.contains(sel.anchorNode)) return;
    const inside = (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentNode : sel.anchorNode).closest('sup');
    const r = document.createRange();
    if (inside && el.contains(inside)){ let after = inside.nextSibling; if (!after || after.nodeType !== 3){ after = document.createTextNode(GAP); inside.after(after); } else if (!after.data.startsWith(GAP)) after.insertData(0, GAP);      /* somewhere outside it for the cursor to stand */
      r.setStart(after, 1); }
    else { sel.deleteFromDocument(); const sup = document.createElement('sup'); sup.append(GAP); sel.getRangeAt(0).insertNode(sup); r.setStart(sup.firstChild, 1); }
    r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
  }
  /* the list under an @: what is offered for what has been typed after it, and which of them the arrow keys are on */
  const list = html`<div class="formula-list" role="listbox" hidden></div>`;
  let token = null, options = [], on = 0;
  list.addEventListener('mousedown', e => e.preventDefault());      /* a click in the list leaves the cursor in the field */
  list.addEventListener('click', e => { const row = e.target.closest('[data-n]'); if (row) choose(+row.dataset.n); });
  const shut = () => { list.hidden = true; list.remove(); token = null; options = []; };
  function suggest(){
    const sel = getSelection(), node = sel.anchorNode; token = null;
    if (sel.rangeCount && sel.isCollapsed && node?.nodeType === 3 && el.contains(node)){
      const before = node.data.slice(0, sel.anchorOffset), m = before.match(/@([^@()+*\/^,<>=!&|√∜​]*)$/);
      if (m) token = { node, from: before.length - m[0].length, to: sel.anchorOffset, typed: m[1] }; }
    const got = token ? offers(token.typed, reach()) : { options: [] };
    options = got.options.slice(0, 9).map(o => got.of ? { of: got.of, measure: o } : { variable: o });
    if (!options.length) return shut();
    on = Math.min(on, options.length - 1);
    list.replaceChildren(...options.map((o, n) => { const row = html`<div role="option"><i></i><span></span></div>`; row.dataset.n = n; row.classList.toggle('at', n === on);
      const v = o.variable || o.of; if (v.color) row.firstChild.style.setProperty('--pill', `var(--${v.color})`);
      row.lastChild.textContent = o.variable ? v.name : v.name.slice(0, 10) + '.' + o.measure.label; if (o.variable && v.scalar) row.append(html`<small>scalar</small>`); return row; }));
    const r = document.createRange(); r.setStart(token.node, token.from); r.collapse(true); const box = r.getBoundingClientRect(), base = box.width || box.height ? box : el.getBoundingClientRect();
    Object.assign(list.style, { left: Math.max(4, Math.min(base.left, innerWidth - 270)) + 'px', top: base.bottom + 5 + 'px' }); list.hidden = false; if (!list.isConnected) document.body.append(list);
  }
  function choose(n){
    const o = options[n]; if (!o || !token) return;
    const { node, from, to } = token, sel = getSelection(), r = document.createRange();
    if (o.variable){ const name = '@' + o.variable.name + '.'; node.replaceData(from, to - from, name); r.setStart(node, from + name.length); }      /* the variable chosen: now its measures */
    else { const after = node.splitText(to); node.deleteData(from, to - from); if (!after.data.startsWith(GAP)) after.insertData(0, GAP);
      after.before(pill({ id: o.of.id, measure: o.measure.measure, name: o.measure.name })); r.setStart(after, 1); }
    r.collapse(true); sel.removeAllRanges(); sel.addRange(r); on = 0; suggest();
  }
  let kept = text;
  draw(text);
  el.addEventListener('focus', () => { onOpen(self); if (el.dataset.sel !== 'no') getSelection().selectAllChildren(el); });
  el.addEventListener('blur', e => { shut(); onClose(self); const now = read(el).replace(/\s+/g, ' ').trim();
    if (now !== kept){ kept = now; onKeep(now, e.relatedTarget); } else onLeave(e.relatedTarget); });
  el.addEventListener('keydown', e => { e.stopPropagation();
    const open = !list.hidden;
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')){ e.preventDefault(); on = (on + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length; suggest(); }
    else if (open && (e.key === 'Enter' || e.key === 'Tab')){ e.preventDefault(); choose(on); }
    else if (open && e.key === 'Escape'){ e.preventDefault(); shut(); }
    else if (e.key === 'Enter'){ e.preventDefault(); el.blur(); }
    else if (e.key === 'Escape'){ e.preventDefault(); draw(kept); el.blur(); }
    else if (e.key === '.' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); raise(); } });
  el.addEventListener('input', () => {
    const flat = [el, ...el.querySelectorAll('sup')].some(s => [...s.childNodes].some(n => n.nodeType === 3 && FLAT.test(n.data)));      /* a ^( … ) whose bracket has just been closed is raised */
    if (flat){ const t = read(el), at = caretIn(el); draw(t); putCaret(el, at ?? t.length); }
    on = 0; suggest(); });
  const self = { el, focus(){ el.focus(); }, get text(){ return read(el); },
    over(x, y){ const r = el.getBoundingClientRect(); return x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12; },
    insert(capsule){
      const sel = getSelection(); let r;
      if (sel.rangeCount && el.contains(sel.anchorNode)){ r = sel.getRangeAt(0); r.collapse(false); }      /* at the cursor; with everything selected, at its end */
      else { el.focus(); r = document.createRange(); r.selectNodeContents(el); r.collapse(false); }
      const inPill = (r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer).closest?.('.capsule'); if (inPill) r.setStartAfter(inPill);
      const gap = document.createTextNode(GAP); r.insertNode(gap); gap.before(pill(capsule));
      const c = document.createRange(); c.setStart(gap, 1); c.collapse(true); sel.removeAllRanges(); sel.addRange(c); shut(); } };
  return self;
}
