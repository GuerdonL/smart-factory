/* A variable written out in matrix notation, laid on the dot grid.

   createMatrix({ cols, rows, cell, letter, color, values, product, combined }) -> { el, width, height }
     cols, rows   the variable's promised shape
     cell         the size of one entry's square, in world units
     letter       what the entries are called: the variable's initials, say "k" for Keys (default "x")
     color        a theme colour to write the entries in ("lazuli" -> --lazuli), numbers included: the colour of
                  the block they come from. Left out, they are written in the ordinary text colour.
     product      for a matrix that is a product: { rows: { letter, color }, cols: { letter, color } }, the block
                  its rows come from (the first of the chain) and the block its columns come from (the last).
                  Each entry is then written as the pair it is made from, each half in its block's colour:
                  k₂·q₃ is the second row of k against the third column of q.
     combined     for a matrix that is a sum or an elementwise chain: { parts: [{ letter, color, cols, rows,
                  transposed }], signs: ['+' | '·' | '/'] }, the blocks it is made from, in order, each with its size,
                  and the sign between each and the next. Each entry is then written as the entries it is made from
                  with the signs between them, each in its block's colour: a₁₁+b₁₁. A part that is broadcast is
                  written as what is repeated: a single entry by its letter alone, a single row by its column, a
                  single column by its row.
     inherited    a Map of the same kind: entries not given here but given by a definition this one shadows. They are
                  written faintly, and a value of the block's own covers them.
     transposed   the matrix is a variable's transpose: each symbol carries the variable's own column and row, so the
                  entry in column 1, row 2 reads k₂₁
     colsName, rowsName   the names of the sides, where they have them. A named side is a variable length, and is
                  written elided however long it is now: first three, dots, last (numbered by the name's initials)
     standing     [{ x, y, w, h, color, name, id }]: shapes that stand in for the entries they cover, drawn in their
                  places inside the brackets (x, y from 0, in entries), each with its name on it. One given an id can
                  be pressed, and carries the id as data-standing for whoever handles the click. Left out where the matrix is elided.
     values       a Map from "column,row" (say "2,1") to a value, for entries that have come to one: any kind of
                  value but unknown (values.js). Those are written as the value, upright, in place of the symbol:
                  7, 3/4, √2, 1+√2, T or F for a boolean, and infinity as ∞ or -∞. An error is written as ! in the
                  warning colour, with why as the entry's title. An entry not in the Map is unknown, and is its symbol.
                  With product or combined, an entry that has a value is written as the value (in the ordinary text
                  colour: it is no one block's), and only one that has none as what it is made from.
                  A decimal ({ f }: a number from the backend, see decimals.js) is never written like an exact
                  number. With decimal: 'square' it is a filled square, black at 0 or below, white at 1 or above
                  and grey between, with its number as its title; otherwise it is written out to 9 significant
                  digits. Where the Map is marked stale (the numbers are of an older state of the project, and
                  new ones are on their way) its decimals are drawn dimmed. Where it carries a note ("needs the
                  backend") no entry is written, and the note is, across the middle.
     decimal      'square' for a matrix written on the canvas; left out, decimals are written as numbers
     width, height  the size of what was made, in world units (for placing it)

   One row or one column is a vector, written k₁ … kₙ. Otherwise it is a matrix, each entry carrying its column then
   its row: k₁₁ … kₙ₁ down to k₁ₙ … kₙₙ (with a comma between them once either passes nine: k₁₀,₃). Past eight along
   a side, the middle is elided the way it is on paper: the first three, dots, and the last.
   Each entry's element carries data-c and data-r, its column and row, for whoever wants to act on a click. */

/* a value as it is written in a matrix */
export const written = v => typeof v === 'number' && Number.isFinite(v) ? String(v).replace('-', '−') : valueText(v);
import { html, style } from './dom.js';
import { likeness } from './block.js';
import { isError, valueText } from '../algebra.js';
import { along, level, keyOf } from '../decimals.js';
export const valuesKey = keyOf;                /* what tells one values Map from another, for whoever redraws only on a change */
const isDecimal = v => !!v && typeof v === 'object' && typeof v.f === 'number';

style('matrix', `
.matrix { position: absolute; display: grid; color: var(--fg); font-family: var(--font-math); font-style: italic; line-height: 1; }
.matrix > span { text-align: center; line-height: var(--cell); white-space: nowrap; }      /* centred in its square */
.matrix > span.set { font-style: normal; font-family: var(--font-ui); font-weight: 600; font-size: .92em; font-variant-numeric: tabular-nums; }
/* a shape standing in for some of the entries: its name is written on it, small, since above it is the next row up */
.matrix > .likeness .block-name { left: 0; right: 0; bottom: auto; top: 50%; transform: translateY(-50%); margin: 0; padding: 0; text-align: center;
  font-size: 10px; font-style: normal; color: var(--on-block); text-shadow: 0 0 2px var(--shadow), 0 0 1px var(--shadow); overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.matrix > span.set.inherited { opacity: .45; font-weight: 400; }
.matrix > span.set.error { color: var(--warn) !important; }      /* an entry that came to an error: over the block's own colour */
.matrix i { font-style: inherit; }           /* half of a product's entry, or one part of a combined one */
.matrix b { font-style: normal; font-weight: normal; color: var(--muted); margin: 0 .06em; }      /* the dot between the halves, or the sign between two parts */
.matrix > span.dots { font-style: normal; color: var(--muted); }
.matrix > span.ghost { opacity: .5; }      /* an entry a variable side would have were it longer */
.matrix > span.set.decimal { font-size: 0; line-height: 0; display: grid; place-items: center; }
/* a decimal's square. Its two ends are the specification's own black and white, whatever the theme: they say a number, not a taste */
.matrix .square { display: block; width: calc(var(--cell) * .62); height: calc(var(--cell) * .62); box-sizing: border-box; border: 1px solid var(--muted); border-radius: 2px;
  background: color-mix(in srgb, #fff calc(var(--level) * 100%), #000); }
.matrix > span.set.stale { opacity: .4; }      /* numbers of an older state of the project, while the new ones are waited for */
.matrix > span.blank { visibility: hidden; }
.matrix > .matrix-note { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 0 .4em; white-space: nowrap; font: 11px/1.5 var(--font-ui); font-style: normal; color: var(--muted); background: var(--bg); border-radius: 3px; }
.matrix sub { font-style: normal; font-size: .68em; vertical-align: -0.35em; line-height: 0; margin-left: .04em; }
/* the brackets: a tall stroke each side with short feet turned inwards */
.matrix::before, .matrix::after { content: ""; position: absolute; top: -3px; bottom: -3px; width: 5px; border: 1.2px solid var(--fg); }
.matrix::before { left: -5px; border-right: 0; } .matrix::after { right: -5px; border-left: 0; }
`);

/* which entries along a side are written: every one up to eight; past that the first three, dots, and the last (null
   is the elided middle). A side whose length is a variable (it has a name) is always written that way, as if it were
   long, since it may be: 1, 2, 3, dots, and the last, which carries the name's initials for its number. Where the
   side is shorter than that just now, the entries that are not there yet are written as symbols only (ghost). */
const shown = along;                           /* (the rule is decimals.js's, so that what is asked of the backend is what is drawn) */
const short = name => (String(name).match(/[A-Za-z]+/g) || []).map(w => w[0].toLowerCase()).join('').slice(0, 3) || 'n';
/* how many squares a side of n takes once written (the elided middle is one) */
export const squares = (n, name = null) => shown(n, name).length;

export function createMatrix({ cols, rows, cell, letter = 'x', color = null, values = new Map(), inherited = new Map(), product = null, combined = null, standing = [], transposed = false, colsName = null, rowsName = null, decimal = 'number' }){
  const cs = shown(cols, colsName), rs = shown(rows, rowsName), vector = (cols === 1 && !colsName) || (rows === 1 && !rowsName);
  const num = (e, name) => e.last && name ? short(name) : e.i;      /* an entry's number along a side: the last of a variable side is that side's name */
  const el = html`<div class="matrix"></div>`, elided = cs.includes(null) || rs.includes(null);
  /* one size of type for the whole matrix, small enough that its widest entry fits its square:
     a letter is about half an em wide and a subscript digit about a third */
  const comma = cols > 9 || rows > 9 || colsName || rowsName ? ',' : '', digits = n => String(n).length;      /* a name among the numbers needs the comma too */
  const symbol = combined ? combined.parts.reduce((sum, p) => sum + .5 * p.letter.length + .34 * (digits(Math.min(p.cols, cols)) + digits(Math.min(p.rows, rows))) + .1, .7 * combined.signs.length)
    : product ? .5 * (product.rows.letter.length + product.cols.letter.length) + .34 * (digits(rows) + digits(cols)) + .3
    : .5 * letter.length + .34 * (vector ? digits(Math.max(cols, rows)) : digits(cols) + digits(rows) + (comma ? .6 : 0));
  /* a value written at length (1+exp(2), a long fraction) does not make the whole matrix small: past LONG it is
     written smaller on its own, to fit its square, and carries what it says in full as its title */
  const LONG = 2.9, wide = v => written(v).length * .72;
  const square = v => decimal === 'square' && isDecimal(v);
  const widest = Math.max(symbol, ...[...values.values(), ...inherited.values()].filter(v => !square(v)).map(wide).filter(w => w <= LONG));
  /* a value in its entry: an error as the mark, a decimal as its square or its digits, anything else as it is written */
  const put = (entry, v) => { entry.className = isError(v) ? 'set error' : 'set'; if (isError(v)) entry.title = v.err;
    if (isDecimal(v) && values.stale) entry.classList.add('stale');
    if (square(v)){ entry.classList.add('decimal'); entry.title = written(v); const s = html`<i class="square"></i>`; s.style.setProperty('--level', String(level(v.f))); entry.replaceChildren(s); return; }
    entry.textContent = written(v); fit(entry, v); };
  const size = Math.min(cell * .6, cell * .8 / widest);
  const fit = (entry, v) => { if (wide(v) > LONG){ entry.style.fontSize = Math.min(1, cell * .92 / (written(v).length * .56) / size) + 'em'; if (!entry.title) entry.title = written(v); } };
  el.style.fontSize = size + 'px';
  el.style.gridTemplateColumns = `repeat(${cs.length}, ${cell}px)`; el.style.gridAutoRows = cell + 'px'; el.style.setProperty('--cell', cell + 'px');
  for (const re of rs) for (const ce of cs){
    if (re === null || ce === null){ el.append(html`<span class="dots">${re === null && ce === null ? '⋱' : re === null ? '⋮' : '⋯'}</span>`); continue; }
    const c = ce.i, r = re.i, ghost = ce.ghost || re.ghost, cn = num(ce, colsName), rn = num(re, rowsName);
    const entry = ghost ? html`<span class="ghost"></span>` : html`<span data-c="${c}" data-r="${r}"></span>`, key = ghost ? '' : c + ',' + r;
    const half = (from, n) => { const h = html`<i><sub></sub></i>`; h.prepend(from.letter); h.lastChild.textContent = n; if (from.color) h.style.color = `var(--${from.color})`; return h; };
    /* one part of a combined entry: its own entry at this place. A part smaller than the matrix is broadcast, and is numbered only along the side it has */
    const part = p => { const one = p.cols === 1 && p.rows === 1 && !(cols === 1 && rows === 1), row = p.rows === 1 && rows > 1, col = p.cols === 1 && cols > 1;
      return half(p, one ? '' : row ? cn : col ? rn : vector ? (cols === 1 ? rn : cn) : p.transposed ? rn + comma + cn : cn + comma + rn); };
    const worked = (combined || product) && values.has(key);      /* a product, a sum or a chain whose entry here has come to a value: the value, in place of what it is made from */
    if (values.note && !ghost){ entry.classList.add('blank'); entry.textContent = '·'; }      /* nothing can be said of it here: the note says why */
    else if (worked) put(entry, values.get(key));
    else if (combined) combined.parts.forEach((p, n) => { if (n){ const sign = html`<b></b>`; sign.textContent = combined.signs[n - 1]; entry.append(sign); } entry.append(part(p)); });
    else if (product) entry.append(half(product.rows, rn), html`<b>·</b>`, half(product.cols, cn));
    else { if (color) entry.style.color = `var(--${color})`;              /* symbols and typed numbers alike */
      if (values.has(key)) put(entry, values.get(key));
      else if (inherited.has(key)){ entry.className = 'set inherited'; entry.textContent = written(inherited.get(key)); fit(entry, inherited.get(key)); }      /* not given here: what a definition higher up gives */
      else { entry.append(letter, html`<sub></sub>`); entry.lastChild.textContent = vector ? (cols === 1 ? rn : cn) : transposed ? rn + comma + cn : cn + comma + rn; } }
    if (!elided && standing.some(t => c > t.x && c <= t.x + t.w && r > t.y && r <= t.y + t.h)) entry.replaceChildren();      /* a shape stands here */
    el.append(entry);
  }
  if (!elided) for (const t of standing){ const b = likeness({ cols: t.w, rows: t.h, unit: cell, color: t.color, name: t.name }); b.el.title = t.name;
    if (t.id){ b.el.dataset.standing = t.id; b.el.style.pointerEvents = 'auto'; b.el.style.cursor = 'pointer'; }      /* it can be pressed: the page hears of it by this id */
    Object.assign(b.el.style, { left: t.x * cell + 'px', top: t.y * cell + 'px' }); el.append(b.el); }
  if (values.note){ const n = html`<span class="matrix-note"></span>`; n.textContent = values.note; el.append(n); }
  return { el, width: cs.length * cell, height: rs.length * cell };
}
