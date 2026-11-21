/* A formula as it is typed into an entry or an attribute, read and worked out. No drawing here: text in, a value out.

   This file reads what was typed and says what it means; what two values come to is values.js's to say (combine,
   apply), which works whole numbers, fractions and single roots out directly and hands anything else to nerdamer, a
   symbolic maths solver (vendor/nerdamer.min.js, version 1.1.13, MIT licence: vendor/nerdamer.license.txt).

   What can be typed, from what binds loosest to what binds tightest:
       a || b                    or
       a && b                    and
       == != < > <= >=           a comparison, giving true or false (≠ ≤ ≥ are read too)
       + -
       * /                       × · ÷ − are read as * * / -, and a number or a bracket set straight against a
                                 bracket, a name or a root multiplies: 2(3+1), 2x, 2√3
       -a  !a                    minus, and not
       a ^ b                     a power, right to left: 2^3^2 is 2^9. ^ is followed by a number, a name or a bracket
       √a  ∜a                    a square or fourth root of the number, name or bracket that follows: 2√3. A sign
                                 straight after the root sign goes under it: √-4 is √(-4)
       numbers (a decimal is taken as a fraction: 0.5 is 1/2), brackets, names, capsules, and these and no others:
       select(c, a, b)           a where c is true, else b. Only the chosen side is worked out, so an error or an
                                 infinity in the other does no harm
       max(a, b)  min(a, b)  abs(a)  sqrt(a)         worked out exactly
       exp(a)  ln(a)  tanh(a)  erf(a)                stay symbolic unless they come out (exp(0) is 1)
       inf, infinity, ∞          infinity;   true, false;   none, ∅: None (values.js)
   An odd root of a negative number is the real one: (-8)^(1/3) is -2. An even root of one is an error.
   Nothing is ever rounded. The kinds of value, and how they combine, are set out in values.js.
   A name may have dots in it (Keys.x, index.x). What a name stands for is the lookup's to say: x, i and j in an
   arrow's formula are arrows.js's, and index.x and index.y, an entry's place in its tile, are tiles.js's. k1, k2
   and so on are the inner position of the entry a formula is in, where its shape's entries hold inner data.
   $ and a number is a name too: $1, $2 and so on are how a formula in the graph (graph.js) names the nodes it
   depends on. Nothing on the page knows such a name, so typed there it is an unknown name, as any other is.

   A capsule is a reference to a measure of a variable, by the id of the block the variable was made as, so that
   renaming the variable breaks nothing. In the text it is one of
       @[b3k2m9x:x]   @[b3k2m9x:y]      the variable's width and height
       @[b3k2m9x:m]                     a scalar's mass
       @[b3k2m9x:d1]  …  @[b3k2m9x:d6]  the length of an inner axis of a variable whose entries hold inner data
                                        (inner.js): d1 the first, the columns of one entry
       @[b3k2m9x:a:heads]               an attribute, by name
       @[b3k2m9x:g]                     an arrow's gap, where it has been given a name (it is layout, and a number)
       @[b3k2m9x]                       the whole matrix: read here, and refused everywhere but in an arrow's entry
                                        formula ({ matrices: true }), with "choose one of its measures"
   and as an object { id, measure: 'x' | 'y' | 'm' | 'g' | 'd1' … 'd6' | 'a' | null, name: the attribute's or null }.

   evaluate(text, lookup, { matrices }) -> { value }             what it comes to: any kind of value (values.js)
                                         | { value, unread: true }   the text itself cannot be read (not arithmetic, an
                                                                 unknown name, a whole matrix where none is taken):
                                                                 value is the error saying why
                                         | { empty: true }       nothing typed
       lookup(token) is asked once for every name and capsule in the text, whichever side of a select it is on. token
       is a name (a string) or a capsule (an object). It gives a value of any kind, null for one not yet known, or
       undefined for a name it does not know, which is the error "unknown name: w". For a capsule, undefined is the
       error "missing variable".
   written(value)  -> a value as text (values.js): the one function that does that
   treeOf(text)    -> the text as a tree, { num } | { name } | { ref } | { op, a, b } | { fn, args }, or null where it
                      cannot be read: for telling a formula's number space without working it out (spaces.js)
   namesIn(text)   -> { why } where the text cannot be read, else { names, capsules, deep }: the names in it that are not
                      words of the language, its capsules, and how deep it nests (brackets, signs, roots and powers
                      one inside the next). For whoever must know what a formula depends on
                      without working it out (graph.js).

   An entry holds a literal value or a formula, { expr: "…" }, never a formula with its result.
   entered(text, lookup, { settle, matrices }) -> what typing text into an entry stores:
                        { clear: true }        nothing typed: the entry goes back to being a symbol
                      | { value }              a literal value, or { expr: text }
                      | { refused: why }       the text cannot be read; nothing is stored
       What was typed is kept as a literal where it is a value written out ("7", "-inf", "3/4", "2√3", "true", "none"), and
       as a formula otherwise ("6/4", "exp(2) + 1", "1/0": a formula is kept whatever it comes to). With settle, a
       formula that uses no name and no capsule and comes to a whole, infinite, exact or boolean value, or None, is kept as
       that value instead (for a number worked out from what was typed, such as a mass from a side).
   typed(stored)   -> the text to type over: a formula's own text, a literal as it is written ("true" for true, "none" for None)

   refs(text)                -> every capsule in a text: [{ id, measure, name, text }]
   refersTo(text, ids)       -> whether the text has a capsule naming one of these ids (a Set)
   repoint(text, from, to)   -> the text with every capsule that names the block from naming to instead
   capsuleText(capsule)      -> "@[id:x]"
   parts(text)               -> the text in order as plain runs and capsules: ["1/√(", { id, measure, name }, ")"]
   label(capsule, name)      -> what a capsule's pill reads, for a variable called name: up to ten characters of the
                                name, then the measure: "Keys.x", "Tau.mass", "Keys.heads"

   Choosing a variable. A variable is { id, name, scalar, attributes: [names] } (anything else on it is kept).
   measuresOf(variable)      -> its measures: [{ measure, name, label }]: x, y, a scalar's mass, then its attributes
   offers(typed, variables, { matrices }) -> what the list under an @ offers for what has been typed after it:
                                { options: [variable] } while a variable is being chosen (those whose names begin
                                with what was typed, then those that have it anywhere), and { of: variable,
                                options: [measure] } once a variable's name and a dot have been typed. Where whole
                                matrices are taken, the first thing offered of a variable that is not a scalar is
                                all of it: { measure: null, name: null, label: 'all of it' }
   wholeOf(variable, matrices) -> { capsule } | { refused }: a whole shape used as a value. A scalar is its mass; any
                                other is refused with "choose one of its measures" (unless matrices are taken)
   bound(text, variables, { matrices }) -> { text } | { refused: why }
                                a text in which @Keys.x was typed out by hand, with each such name turned into its
                                capsule. The longest variable name that fits is taken (a name of more than ten
                                characters can be given by its first ten), then the longest measure. A name no
                                variable has, or a measure the variable has not, is refused.

   guard() -> working(key, work): works out things that may depend on one another. working(key, work) gives work(),
       unless key is already being worked out further up, in which case the thing depends on itself and what it
       gives is the error "depends on itself". */
import { combine, apply, truth, typedNumber, written, kind, isError, isFormula, isNone, NONE } from './values.js';
export { written };

class Wrong extends Error {}
const ARITY = { select: 3, max: 2, min: 2, abs: 1, sqrt: 1, exp: 1, ln: 1, tanh: 1, erf: 1 };
const CONSTANT = { inf: Infinity, infinity: Infinity, true: true, false: false, none: NONE };
const SIGN = { '×': '*', '·': '*', '∙': '*', '÷': '/', '−': '-', '–': '-', '≠': '!=', '≤': '<=', '≥': '>=' };
const ONE = /^@\[([^\]:\s]+)(?::([xymg]|d[1-6])|:a:([^\]]+))?\]/, CAPSULE = new RegExp(ONE.source.slice(1), 'g');
const capsuleOf = m => ({ id: m[1], measure: m[3] !== undefined ? 'a' : m[2] || null, name: m[3] ?? null });

export const capsuleText = ({ id, measure, name }) => '@[' + id + (measure === 'a' ? ':a:' + name : measure ? ':' + measure : '') + ']';
export const refs = text => [...String(text).matchAll(CAPSULE)].map(m => ({ ...capsuleOf(m), text: m[0] }));
export function parts(text){ const s = String(text), out = []; let at = 0;
  for (const m of s.matchAll(CAPSULE)){ if (m.index > at) out.push(s.slice(at, m.index)); out.push(capsuleOf(m)); at = m.index + m[0].length; }
  if (at < s.length) out.push(s.slice(at)); return out; }
export const refersTo = (text, ids) => refs(text).some(r => ids.has(r.id));
export const repoint = (text, from, to) => String(text).replace(CAPSULE, (all, id) => id === from ? '@[' + to + all.slice(2 + id.length) : all);
export const label = (capsule, name) => String(name).slice(0, 10) + (capsule.measure ? '.' + (capsule.measure === 'm' ? 'mass' : capsule.measure === 'g' ? 'gap' : capsule.measure === 'a' ? capsule.name : capsule.measure) : '');

function tokens(text){
  const s = String(text), out = [];
  for (let i = 0; i < s.length;){ const c = SIGN[s[i]] || s[i], rest = s.slice(i);
    if (/\s/.test(c) || c === '​'){ i++; continue; }
    if (c === '@'){ const m = rest.match(ONE); if (!m) throw new Wrong('after @, choose a variable from the list'); out.push({ t: 'ref', v: capsuleOf(m) }); i += m[0].length; continue; }
    const n = rest.match(/^(\d+\.?\d*|\.\d+)/); if (n){ out.push({ t: 'num', v: typedNumber(n[0]), long: n[0].length > 40 }); i += n[0].length; continue; }
    if (/[A-Za-z_]/.test(c)){ const id = rest.match(/^[A-Za-z_][\w.]*/)[0].replace(/\.+$/, ''); out.push({ t: 'name', v: id }); i += id.length; continue; }
    const input = rest.match(/^\$\d+/); if (input){ out.push({ t: 'name', v: input[0] }); i += input[0].length; continue; }      /* $1: an input, in a formula of the graph */
    const two = c.length === 2 ? c : (c + (s[i + 1] || ''));
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)){ out.push({ t: two }); i += c.length === 2 ? 1 : 2; continue; }
    if ('+-*/^(),<>!√∜∞∅'.includes(c)){ out.push({ t: c }); i++; continue; }
    throw new Wrong(`cannot read "${s[i]}"`);
  }
  return out;
}
/* the text as a tree: { num } | { name } | { ref } | { op, a, b } | { fn, args } */
function parse(text){
  const ts = tokens(text); let i = 0, depth = 0, deepest = 0;
  /* how deep the text nests: brackets, signs, roots and powers one inside the next. Counted, not refused: a graph's
     formula is held to a bound (graph.js), since the backend reads it with that bound */
  const inside = read => { deepest = Math.max(deepest, ++depth); try { return read(); } finally { depth--; } };
  const UNREAD = 'that cannot be read as arithmetic';
  const take = t => ts[i]?.t === t ? ts[i++] : null;
  const starts = t => !!t && ['name', 'ref', '(', '√', '∜', '∞', '∅'].includes(t.t);      /* what, set straight against a number or a bracket, multiplies it */
  const level = (next, ops) => () => { let a = next(); while (ts[i] && ops.includes(ts[i].t)) a = { op: ts[i++].t, a, b: next() }; return a; };
  function atom(){
    const t = ts[i++]; if (!t) throw new Wrong(UNREAD);
    if (t.t === 'num') return t.long ? { num: t.v, long: true } : { num: t.v };      /* long: typed with more than 40 characters (spaces.js) */
    if (t.t === '∞') return { num: Infinity };
    if (t.t === '∅') return { num: NONE };
    if (t.t === 'ref') return { ref: t.v };
    if (t.t === '('){ const e = inside(or); if (!take(')')) throw new Wrong('a bracket is not closed'); return e; }
    if (t.t === '√' || t.t === '∜'){ const root = { fn: 'sqrt', args: [inside(under)] }; return t.t === '∜' ? { fn: 'sqrt', args: [root] } : root; }
    if (t.t !== 'name') throw new Wrong(UNREAD);
    const fn = t.v.toLowerCase();
    if (!Object.hasOwn(ARITY, fn) || ts[i]?.t !== '(') return { name: t.v };      /* (its own names only: constructor and __proto__ are names like any other) */
    i++; const args = [];
    inside(() => { if (!take(')')){ do args.push(or()); while (take(',')); if (!take(')')) throw new Wrong('a bracket is not closed'); } });
    if (args.length !== ARITY[fn]) throw new Wrong(`${fn} takes ${['no', 'one', 'two', 'three'][ARITY[fn]]} value${ARITY[fn] === 1 ? '' : 's'}`);
    return { fn, args };
  }
  /* what a root sign applies to: a number, a name, a bracket or another root, with any sign it carries (√-4 is read as √(-4)) */
  function under(){ if (take('-')) return { fn: 'neg', args: [inside(under)] }; if (take('+')) return inside(under);
    if (!ts[i] || !(starts(ts[i]) || ts[i].t === 'num')) throw new Wrong('a root sign with nothing under it'); return atom(); }
  const power = () => { const a = atom(); return take('^') ? { op: '^', a, b: inside(unary) } : a; };
  function unary(){ return take('-') ? { fn: 'neg', args: [inside(unary)] } : take('+') ? inside(unary) : take('!') ? { fn: '!', args: [inside(unary)] } : power(); }
  function term(){ let a = unary();
    for (;;){ if (ts[i] && (ts[i].t === '*' || ts[i].t === '/')) a = { op: ts[i++].t, a, b: unary() };
      else if (starts(ts[i])) a = { op: '*', a, b: power() };
      else return a; } }
  const sum = level(term, ['+', '-']), compared = level(sum, ['==', '!=', '<', '>', '<=', '>=']), and = level(compared, ['&&']);
  function or(){ return level(and, ['||'])(); }
  const tree = or(); if (i < ts.length) throw new Wrong(UNREAD);
  depths.set(tree, deepest);
  return tree;
}
const depths = new WeakMap();                  /* a tree -> how deep its text nests */
const trees = new Map();                        /* a text -> its tree, or why it has none: the same text is read the same way every time */
function read(text){
  if (!trees.has(text)){ if (trees.size > 2000) trees.clear();
    try { trees.set(text, { tree: parse(text) }); } catch (e){ if (!(e instanceof Wrong)) throw e; trees.set(text, { why: e.message }); } }
  return trees.get(text);
}
/* (walked with a list of its own: a sum of five thousand terms is a tree five thousand deep, and deeper than a stack) */
const leaves = tree => { const out = [], todo = [tree];
  while (todo.length){ const n = todo.pop(); if (n.name !== undefined || n.ref) out.push(n); else { for (let i = (n.args || []).length - 1; i >= 0; i--) todo.push(n.args[i]); if (n.op){ todo.push(n.b); todo.push(n.a); } } }
  return out; };

/* a text's tree, for whoever reads a formula without working it out (spaces.js: formula); null where it cannot be read */
export const treeOf = text => read(String(text)).tree || null;
/* what a text names, without working it out: { why } where it cannot be read, else { names, capsules }: every name in
   it that is not one of the words of the language (a function, inf, true, false), and every capsule */
export function namesIn(text){
  const { tree, why } = read(String(text)); if (!tree) return { why };
  const all = leaves(tree);
  return { names: all.filter(l => !l.ref && !Object.hasOwn(CONSTANT, l.name.toLowerCase())).map(l => l.name), capsules: all.filter(l => l.ref).map(l => l.ref), deep: depths.get(tree) || 0 };
}
export function evaluate(text, lookup = () => undefined, { matrices = false } = {}){
  text = String(text); if (!text.trim()) return { empty: true };
  const { tree, why } = read(text), unread = why => ({ value: { err: why }, unread: true });
  if (!tree) return unread(why);
  /* every name and capsule is asked for first, so that a name nothing knows is said whichever side of a select it is on */
  const known = new Map();
  for (const leaf of leaves(tree)){
    if (leaf.ref){ if (!leaf.ref.measure && !matrices) return unread('choose one of its measures');
      const v = lookup(leaf.ref); known.set(leaf, v === undefined ? { err: 'missing variable' } : v); continue; }
    const fixed = leaf.name.toLowerCase(), v = Object.hasOwn(CONSTANT, fixed) ? CONSTANT[fixed] : lookup(leaf.name);
    if (v === undefined) return unread('unknown name: ' + leaf.name);
    known.set(leaf, v);
  }
  const run = n => {
    if ('num' in n) return n.num;
    if (known.has(n)) return known.get(n);
    if (n.op && n.a.op){      /* a long run of signs is a tree deep on its left: it is gone down with a list, not the stack, and worked out coming back up */
      const spine = []; let at = n; while (at.op && at.a.op){ spine.push(at); at = at.a; }
      let v = run(at); while (spine.length){ const up = spine.pop(); v = combine(up.op, v, run(up.b)); } return v; }
    if (n.op) return combine(n.op, run(n.a), run(n.b));
    if (n.fn === 'select'){ const c = run(n.args[0]); if (isError(c)) return c; if (kind(c) === 'unknown') return null;
      const chosen = truth(c); return isError(chosen) ? chosen : run(n.args[chosen ? 1 : 2]); }      /* only the chosen side; a condition that cannot be told from 0 is that error */
    if (n.fn === 'max' || n.fn === 'min') return combine(n.fn, run(n.args[0]), run(n.args[1]));
    return apply(n.fn, run(n.args[0]));
  };
  return { value: run(tree) };
}

const squeezed = t => String(t).replace(/[\s​]+/g, '').replace(/−/g, '-');
export function entered(text, lookup = () => undefined, { settle = false, matrices = false } = {}){
  text = String(text ?? '').trim();
  const got = evaluate(text, lookup, { matrices });
  if (got.empty) return { clear: true };
  if (got.unread) return { refused: got.value.err };
  const v = got.value, k = kind(v), t = squeezed(text).toLowerCase(), literal = ['integer', 'infinity', 'exact', 'boolean', 'none'].includes(k);
  const plain = literal && (t === squeezed(written(v)) || t === String(v) || (k === 'infinity' && /^[+-]?(inf|infinity|∞)$/.test(t)) || (k === 'integer' && /^[+-]?\d+$/.test(t)) || (k === 'none' && t === 'none'));
  if (plain || (settle && literal && !leaves(read(text).tree).length)) return { value: isNone(v) ? { none: true } : v };      /* (an object of the entry's own, to be kept) */
  return { value: { expr: text } };
}
export const typed = stored => stored === null || stored === undefined ? '' : isFormula(stored) ? stored.expr : typeof stored === 'boolean' ? String(stored) : isNone(stored) ? 'none' : written(stored);

/* ---- choosing a variable ---- */
export const measuresOf = v => [{ measure: 'x', name: null, label: 'x' }, { measure: 'y', name: null, label: 'y' }, ...(v.scalar ? [{ measure: 'm', name: null, label: 'mass' }] : []),
  ...Array.from({ length: Math.max(0, Math.min(6, v.inner | 0)) }, (_, k) => ({ measure: 'd' + (k + 1), name: null, label: 'd' + (k + 1) })),      /* the lengths of its inner axes */
  ...(v.attributes || []).map(name => ({ measure: 'a', name, label: name }))];
/* the variable whose name the text begins with: [variable, how many letters of the text are its name], the longest that fits */
function named(text, variables){
  const t = text.toLowerCase(); let best = null;
  for (const v of variables) for (const name of new Set([v.name, v.name.slice(0, 10)])){ const n = name.toLowerCase();
    if (n && t.startsWith(n) && (!best || n.length > best[1])) best = [v, n.length]; }
  return best;
}
export function offers(typed, variables, { matrices = false } = {}){
  const t = String(typed).toLowerCase(), of = named(typed, variables);
  if (of && t[of[1]] === '.'){ const rest = t.slice(of[1] + 1), all = matrices && !of[0].scalar ? [{ measure: null, name: null, label: 'all of it' }] : [];
    return { of: of[0], options: [...all, ...measuresOf(of[0])].filter(m => m.label.toLowerCase().startsWith(rest)) }; }
  const has = variables.filter(v => v.name.toLowerCase().includes(t));
  return { options: [...has.filter(v => v.name.toLowerCase().startsWith(t)), ...has.filter(v => !v.name.toLowerCase().startsWith(t))] };
}
export const wholeOf = (variable, matrices = false) => matrices ? { capsule: { id: variable.id, measure: null, name: null } }
  : variable.scalar ? { capsule: { id: variable.id, measure: 'm', name: null } } : { refused: 'choose one of its measures' };
export function bound(text, variables, { matrices = false } = {}){
  const s = String(text); let out = '';
  for (let i = 0; i < s.length;){
    if (s[i] !== '@' || s[i + 1] === '['){ const m = s[i] === '@' && s.slice(i).match(ONE); out += m ? m[0] : s[i]; i += m ? m[0].length : 1; continue; }
    const rest = s.slice(i + 1), of = named(rest, variables);
    if (!of) return { refused: `No variable in reach is called ${rest.match(/^[\w.]*/)[0] || 'that'}` };
    const [v, len] = of; let capsule;
    if (rest[len] === '.'){ const after = rest.slice(len + 1).toLowerCase(), fits = l => after.startsWith(l) && !/\w/.test(after[l.length] || '');
      const m = measuresOf(v).map(m => [m, m.label.toLowerCase()]).concat(v.scalar ? [[{ measure: 'm', name: null }, 'm']] : []).filter(([, l]) => fits(l)).sort((a, b) => b[1].length - a[1].length)[0];
      if (!m) return { refused: `${v.name} has no measure called ${after.match(/^[\w.]*/)[0] || 'that'}` };
      capsule = { id: v.id, measure: m[0].measure, name: m[0].name }; i += 1 + len + 1 + m[1].length; }
    else { const whole = wholeOf(v, matrices); if (whole.refused) return { refused: `${v.name}: ${whole.refused}` }; capsule = whole.capsule; i += 1 + len; }
    out += capsuleText(capsule);
  }
  return { text: out };
}

export function guard(){
  const open = new Set();
  return (key, work) => { if (open.has(key)) return { err: 'depends on itself' };
    open.add(key); try { return work(); } finally { open.delete(key); } };
}
