"""A graph worked out in floating point. A graph (graph.js) and what is wanted of it in, numbers out.

evaluate.js is the reference for what every operation means, and this is tested against it (backend/fixtures):
wherever the browser works a node out exactly, the numbers here are those, to within what a 32-bit float holds.
Each operation's rule is an entry of OPS below, as it is an entry of OPS in graph.js; the rules ask arrays.py for
every array and hold no number of their own. This file does not import NumPy.

    Run(graph, read_file=None, tick=0, room, counts, read_roll=None)      one run over one graph that validate (check.py) has accepted
      .needs(node)        -> { most, where, bad }: the most numbers (columns times rows times every inner length) of anything the node's value is worked out from
                             (and which node has them), and why it has no value where a variable it is worked out
                             from has an error
      .value(node, binding=None) -> its array; raises Trouble(why) where it has none

What differs from the browser, by the specification's rule that the backend never guesses a value:
  - A variable with an entry that was never given is no value at all, "unknown entries in Keys", and so is every
    node worked out from it. (The browser works out the entries that do not depend on the unknown one. A side
    length is no dependency on the entries: @Keys.x is a number however many of Keys' entries are unknown.)
  - An entry that has no value (a division by zero, ∞ − ∞) is that entry alone, as in the browser: it is NaN here.
None is the browser's None: an entry given as { "none": true } is None here, and arrays.py carries which entries
are None beside the numbers, by values.js's rules. It is a value that was given, not an entry that was not.
Numbers are 32-bit floats. An exact value becomes a float at a leaf, in number_of and nowhere else.

Bindings are evaluate.js's: a node within a function has a value for each thing the function is applied to, and one
that follows its cell has one for each cell; it is remembered under its id together with the whole chain it sits
under. Which cells a block's node sits in is read off the graph's spaces (homes), as there. A binding handed in
(what the page draws inside a function or a tile) is { params, cells }, set out at the top of evaluate.js.

Inner data. An array is held with its rows and columns as its last two axes and its inner axes before them
(arrays.py), so a product, a sum and everything entry by entry are repeated at each inner position by the arrays
themselves, and an input with no inner data is used at every one. A formula is worked out over the whole array at
once, k1, k2 and so on being each entry's inner position. Only a function is run position by position, as
evaluate.js runs it: where its input block holds no inner data and what it is given holds some, its body is worked
out once for the matrix at each inner position (the body's nodes are two-dimensional, and stay so) and the results
are joined. A function whose input block holds inner data is handed its input whole.

Formulas are read once each (formula.py) and applied to whole arrays: a variable's formula to all the entries that
hold it at once, a map's to the whole matrix. A select works both its sides out and keeps the chosen one.

A choose branches: its condition is worked out and reduced to one truth (arrays.truth), and then one side is worked
out and the other never. So the side not chosen may be an error, or worked out from more than is worked out at all,
and does no harm: what the chosen side needs is looked at when it is chosen (Run.chosen), as run.py looks at every
other node before anything is made. For memory a choose counts its condition, what is made through one side alone
for the heavier side only, and what a side shares with anything else whichever is taken (weight); and room to work
on the largest thing in either (needs: room), since which side it takes is not known before it runs. A condition with no truth (an entry with no value and none that is true) leaves it with no value.

A tile with a step (graph.js: a repeat with fn and state, and a loop) is worked out cell by cell in order, as
evaluate.js does it: the state of cell k is what the step's function made of cell k - 1, and a state block asked for
in a later cell is its part of that state. Only the last two states of a tile are kept (state_in); the states of a tile with a step inside another's step, or
in another's pattern, are let go when that step is done, so a loop in a loop holds what one pass holds; what is kept is
counted against the run's room (stepped_held, and weight counts two states for each such tile); and no more than
MAX_KEPT values of any size are remembered at once, so a loop of a million steps holds no more than a short one;
what a step's body came to is let go like any other value. What a loop and a stepped tile's matrix come to, looked
at from no function or cell, is kept for the whole run (finished), and a cell's state asked for after the matrix is
read off the matrix; run.py asks for a tile's matrix first, then its cells in order, then the rest, so that one
pass serves them. Letting go never changes an answer: what is gone is worked out again, noise included. A loop is stopped after MAX_STEPS steps (limits.py), "not
stopped after 1,000,000 steps: a loop is stopped then", as a run is at MAX_SECONDS. A stop block with no truth is
no value, as a condition is.

The tick is the project's clock, a whole number the run is given. Three things read it. Noise does not: a noise
block holds the same numbers at every tick. A loop with an infinite count and no stop block takes one step each
tick: at tick t it is the state of cell t + 1, worked out from the first cell every run (any tick's value follows
from the graph and the tick alone), and refused past MAX_STEPS like any loop. And a stream (v_stream) shows the
values at its place, start + tick × step. Inside a tile that takes a step each tick, cell k is what the tile was at
tick k - 1, so a stream there is read at that tick (tick_at): the running total of a stream's rows is such a tile.
A stream that stops at its file's end and is asked for past it raises Ended, which run.py answers under "ended".

A stream's file is read whole once for a run (roll) and kept as its units; what is kept of files counts against the
run's room beside what is remembered (rolls_held), the oldest file is let go first where they outgrow it, and a
file that alone is more than half the room is refused, as a node that would not fit is.

What has been worked out is remembered for the run, up to half the room the run was given for its arrays (room, in
bytes: limits.py says how it follows from the machine's memory): past that the oldest results are let go, and worked
out again if they are asked for again. weight(node) says how many entries a node is worked out from in all, and
bytes_for(node, …) how many bytes that may come to (the mask of an array that may hold None counted, as arrays.size
counts it), so that run.py can refuse one that would not fit before any of it is made."""
import json
import math
from collections import OrderedDict

from . import arrays as A
from . import spaces as S
import itertools

from .check import applies, state_at, covered, data_path, fn_whole, inner_of, is_int, is_obj, lengths, numbers, ok_range, one, reads_index, run_of
from .formula import DOLLAR, INNER, SYMBOLIC, Wrong, axis_of, evaluate as work, parse, parse_symbolic
from .limits import MAX_STEPS, BYTES_AN_ENTRY, MAX_BINDING_CELLS, MAX_ENTRIES, MEMORY_LEAST

NAN = math.nan
MAX_KEPT = 50_000      # values a run keeps at once, however small: a loop of a million steps makes several each step, and each is more in memory than its numbers


class Trouble(Exception):
    """A node has no value; str() says why, plainly."""


class Ended(Trouble):
    """A stream that stops at its end was asked for past it. node: the stream's id; tick: the first tick at which it
    has no value."""

    def __init__(self, why, node, tick):
        Trouble.__init__(self, why)
        self.node, self.tick = node, tick


class Broken(Trouble):
    """A promise broken by a number worked out here: the error type, with the page's own sentence (spaces.js:
    NOT_HELD), "W is not natural: it holds ∞ at 3, 1". node: the node whose promise it is."""
    code = 'type'

    def __init__(self, why, node):
        Trouble.__init__(self, why)
        self.node = node


def said(holds):
    p = S.parse(holds)
    return 'None' if p[0] is None else p[0] + (' or None' if p[1] else '')


def shown(x):
    """A number as the sentence writes it: a whole number plainly, an infinity as its sign, any other to nine digits."""
    if x is None:
        return 'None'
    if math.isinf(x):
        return '∞' if x > 0 else '-∞'
    return str(int(x)) if x == int(x) and abs(x) < 1e15 else '%.9g' % x


def hold(value, holds, name, node, where=''):
    """Holds what was worked out to a promise (a variable's holds; what a function's input block promises to take):
    raises Broken, naming the first entry outside it. A promise that is no written space says nothing."""
    p = S.parse(holds) if isinstance(holds, str) else None
    if p is None or holds == S.ANY:
        return
    out = A.outside(value, p[0], p[1])
    if out is not None:
        r, c, ks, x = out
        raise Broken('%s is not %s: it holds %s at %s%s' % (name, said(holds), shown(x), ', '.join(str(k + 1) for k in (c, r) + ks), where), node)


def number_of(v):
    """A value as the graph writes it, as a float. The one place an exact value becomes one."""
    if v == 'inf':
        return math.inf
    if v == '-inf':
        return -math.inf
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if 'err' in v:
        return NAN      # the error a formula was found to be when the graph was built: an entry with no value
    if v.get('none') is True:
        return None      # None: arrays.py holds it as a mask beside the numbers (arrays.row)
    if 'sym' in v:
        try:
            return A.item(A.spread(work(parse_symbolic(v['sym']), symbol, A), 1, 1), 0, 0)
        except Wrong as e:
            raise Trouble('the symbolic value "%s" cannot be read here: %s' % (v['sym'][:60], e))
    n, d, k = v['n'], v.get('d', 1), v['k']      # n over d under k square roots, the sign carried by n
    return math.copysign((abs(n) / d) ** (0.5 ** k), n)


def symbol(name):
    if name.lower() not in SYMBOLIC:
        raise Wrong('it names %s' % name)
    return A.number(SYMBOLIC[name.lower()])


def a_cell(c):
    """A cell of a binding with every field of its kind (evaluate.js: aCell)."""
    whole = lambda v, least=None: int(v) if is_int(v) and abs(v) < 2 ** 53 and (least is None or v >= least) else (0 if least is None else least)
    at = {k: {'col': int(p['col']), 'row': int(p['row'])} for k, p in c['at'].items() if is_obj(p) and is_int(p.get('col')) and is_int(p.get('row'))} if is_obj(c.get('at')) else None
    of = tuple(c['of']) if isinstance(c.get('of'), (list, tuple)) and c['of'] and all(isinstance(t, str) for t in c['of']) else None
    return {'x': whole(c.get('x')), 'y': whole(c.get('y')), 'dx': whole(c.get('dx')), 'dy': whole(c.get('dy')), 'cx': whole(c.get('cx'), 1), 'cy': whole(c.get('cy'), 1),
            'turned': bool(c.get('turned')), 'of': of, 'at': at, 'atKey': c['atKey'] if isinstance(c.get('atKey'), str) else json.dumps(at, sort_keys=True) if at is not None else ''}


def cell_key(c):
    return '%d,%d,%d,%d,%d,%d%s@%s' % (c['x'], c['y'], c['dx'], c['dy'], c['cx'], c['cy'], 't' if c['turned'] else '', c['atKey'])


def index_at(cells):
    """The index an entry reads: (x, y, turned) of the innermost cell, or None in no cell (graph.js: indexAt)."""
    if not cells:
        return None
    c = cells[-1]
    return c['x'] + c['dx'], c['y'] + c['dy'], c['turned']


def functions_of(n):
    return [w for w in n.get('within', ()) if w.startswith('f:')]


def params_key(params):
    """What every function round a node was given, as one text (evaluate.js: paramsKey)."""
    return '|'.join('%s=%s' % (f, params[f]['key']) for f in sorted(params))


class Env:
    __slots__ = ('params', 'cells', 'active')

    def __init__(self, params, cells, active):
        self.params, self.cells, self.active = params, cells, active


class At:
    """Everything a rule may ask (evaluate.js sets the same out)."""

    def __init__(self, run, node_id, n, env):
        self.run, self.id, self.n, self.env, self.cells = run, node_id, n, env, env.cells

    def type(self, k):
        return self.run.nodes[self.n['inputs'][k]]['type']

    def size(self, k):
        t = self.type(k)
        return int(t['rows']), int(t['cols'])

    def whole(self):
        """Whether its function is handed its input whole (check.py: fn_whole)."""
        return fn_whole(self.n, {'fn': self.run.functions.get, 'node': self.run.nodes.get})

    def get(self, k, env=None):
        return self.run.work(self.n['inputs'][k], env or self.env)

    def key_of(self, k):
        i = self.n['inputs'][k]
        return i + self.run.key_for(i, self.run.nodes[i], self.env)

    def inner(self, change):
        cells = self.env.cells
        return Env(self.env.params, cells[:-1] + (change(cells[-1]),) if cells else cells, self.env.active)

    def turn(self):
        return self.inner(lambda c: dict(c, turned=not c['turned']))

    def shift(self, dx, dy):
        return self.inner(lambda c: dict(c, dx=c['dx'] + dy, dy=c['dy'] + dx) if c['turned'] else dict(c, dx=c['dx'] + dx, dy=c['dy'] + dy))

    def cell(self, c):
        self.run.homes()
        return Env(self.env.params, self.env.cells + (a_cell(dict(c, of=self.run.repeats.get(self.id))),), self.env.active)

    def call(self, fn, values, key, where=''):
        f = self.run.functions[fn]
        if fn in self.env.active:
            raise Trouble('a function applies itself')
        # what the function's input block promises to take, held against what it is given (evaluate.js: call)
        hold(values, self.run.nodes[f['input']]['type'].get('value'), 'in', self.id, self.said_tail() + where)
        return self.run.work(f['body'], Env(dict(self.env.params, **{fn: {'values': values, 'key': key}}), (), self.env.active + (fn,)))

    def said_tail(self):
        return ''

    def given(self, node):
        fn = (functions_of(node) or [None])[-1]
        p = self.env.params.get(fn)
        if p is None:
            raise Trouble('unknown: it is the input of a function, and was asked for without what the function is given')
        if p.get('values') is None:
            spec = p['spec']
            of = spec if isinstance(spec, str) else spec['of']
            rest = {k: v for k, v in self.env.params.items() if k != fn}      # what it was given is not worked out from itself
            whole = self.run.work(of, Env(rest, self.env.cells, self.env.active))
            r = None if isinstance(spec, str) else spec.get('range')
            p['values'] = whole if r is None else A.part(whole, r['row'], r['col'], r['rows'], r['cols'])
        return p['values']

    # ---- formulas ----
    def names(self, first, size, index, more=None):
        """What a name in this node's formula stands for (graph.js: lookupIn). first: which input $1 is; size: the
        (rows, cols) an input that is a whole matrix has to be; index(axis) -> the index as an array, or None in no
        cell; more: names of the caller's own. pick(array) takes the entries the formula is being worked out at."""
        n = self.n

        def leaf(name):
            if more and name.lower() in more:
                return more[name.lower()]
            axis = axis_of(name)
            if axis:
                got = index(axis)
                return A.number(NAN) if got is None else got      # not in a tile: there is no index
            if INNER.fullmatch(name):
                return A.number(NAN)      # no inner data here, or no such inner axis: there is no such position
            m = DOLLAR.fullmatch(name)
            k = int(m.group(1)) - 1 + first if m else -1
            if k < first or k >= len(n['inputs']):
                return A.number(NAN)
            rows, cols = self.size(k)
            if (rows, cols) == size[:2]:
                return size[2](self.get(k)) if len(size) > 2 else self.get(k)
            return self.get(k) if (rows, cols) == (1, 1) else A.number(NAN)      # a single entry stands for itself everywhere; any other size is not the size of the output
        return leaf


def v_variable(n, at):
    if n['defined'] != 'entries':
        return at.get(0)
    rows, cols, inner = int(n['type']['rows']), int(n['type']['cols']), lengths(n['type'])
    if len(n['entries']) < numbers(n['type']):      # it never guesses a value: an entry not given is not zero
        raise Trouble('unknown entries in %s' % (n.get('name') or at.id))
    out = A.blank(rows, cols, inner)
    fresh = lambda: ([], [], [[] for _ in inner])      # rows, columns, and the places along each inner axis, from 0
    plain, numbers_of, formulas = fresh(), [], {}
    for key, v in n['entries'].items():
        c, r, *ks = [int(x) - 1 for x in key.split(',')]
        rs, cs, kss = formulas.setdefault(v['expr'], fresh()) if is_obj(v) and 'expr' in v else plain
        rs.append(r)
        cs.append(c)
        for held, k in zip(kss, ks):
            held.append(k)
        if rs is plain[0]:
            numbers_of.append(number_of(v))
    if plain[0]:
        out = A.put(out, plain[0], plain[1], A.row(numbers_of), plain[2])
    where = index_at(at.cells)
    for text, (rs, cs, kss) in formulas.items():      # one formula, worked out for every entry that holds it at once
        def index(axis, rs=rs, cs=cs):
            if where is None:
                return None
            x, y, turned = where
            return A.row([x + (r if turned else c) + 1 for r, c in zip(rs, cs)] if axis == 'x' else [y + (c if turned else r) + 1 for r, c in zip(rs, cs)])
        own = {'k%d' % (j + 1): A.row([k + 1 for k in held]) for j, held in enumerate(kss)}      # each entry's inner position
        leaf = at.names(0, (rows, cols, lambda a, rs=rs, cs=cs, kss=kss: A.take(a, rs, cs, kss)), index, own)
        out = A.put(out, rs, cs, A.spread(work(at.run.tree(text), leaf, A), 1, len(rs), ()), kss)
    return out


def over_matrix(at, formula, rows, cols, x, first, index_of, inner=()):
    """A formula worked out at every entry of a rows by cols matrix, at every inner position: x, i and j are
    arrows.js's, and k1, k2 and so on the entry's place along each inner axis."""
    i, j = A.grid(rows, cols)

    def index(axis):
        where = index_of()
        if where is None:
            return None
        bx, by, turned = where
        return (bx + (j if turned else i)) if axis == 'x' else (by + (i if turned else j))
    more = {'x': x, 'i': i, 'j': j}
    more.update(('k%d' % (k + 1), a) for k, a in enumerate(A.along(inner)))
    leaf = at.names(first, (rows, cols), index, more)
    return A.spread(work(at.run.tree(formula), leaf, A), rows, cols, inner)


def v_matmul(n, at):
    if at.type(0)['cols'] != at.type(1)['rows']:
        raise Trouble('a product of %d columns and %d rows: a single entry against a matrix is a scale' % (at.type(0)['cols'], at.type(1)['rows']))
    return A.matmul(at.get(0), at.get(1))


CHAIN = {'add': '+', 'scale': '*', 'ewise': '*'}


def chain_of(n):
    """'+' or '*' for a node that is a sum, or a product entry by entry: one made directly of another of its kind
    is one sum or product with it, its terms looked at together whatever their order (graph.js: RESTS)."""
    return None if n['op'] == 'ewise' and n['fn'] != 'mul' else CHAIN.get(n['op'])


def is_step(at, k, of):
    return chain_of(at.run.nodes[at.n['inputs'][k]]) == of


def v_add(n, at):
    out = at.get(0)
    for k in range(1, len(n['inputs'])):
        out = A.binary('+', out, at.get(k), (k > 1 or is_step(at, 0, '+'), is_step(at, k, '+')))
    return out


def v_ewise(n, at):
    if n['fn'] == 'div':
        made = A.binary('/', at.get(0), at.get(1))
    else:
        made = A.binary('*', at.get(0), at.get(1), (is_step(at, 0, '*'), is_step(at, 1, '*')))
    return A.spread(made, int(n['type']['rows']), int(n['type']['cols']), lengths(n['type']))


def v_block(n, at):
    out = A.blank(int(n['type']['rows']), int(n['type']['cols']), lengths(n['type']))
    for k, a in enumerate(n['at']):
        out = A.place(out, at.get(k, at.shift(int(a['col']), int(a['row']))), int(a['row']), int(a['col']))
    return out


def v_slice(n, at):
    r = n['range']
    return A.part(at.get(0), int(r['row']), int(r['col']), int(r['rows']), int(r['cols']))


def v_source(n, at):
    rows, cols, inner = int(n['type']['rows']), int(n['type']['cols']), lengths(n['type'])
    if n['kind'] == 'file':
        got = at.run.file(n['path'])
        if A.shape(got) != (rows, cols):
            raise Trouble('%s holds %d × %d numbers, and its block is %d × %d: make the block the size of its file' % (n['path'], A.shape(got)[1], A.shape(got)[0], cols, rows))
        return got
    if n['kind'] == 'none':
        return A.empty(rows, cols, inner)      # None at every entry: the empty side of a choose
    return A.identity(rows, cols, inner) if n['kind'] == 'identity' else A.full(rows, cols, 1.0 if n['kind'] == 'ones' else 0.0, inner)


def v_noise(n, at):
    # the same at every tick: a noise block does not move on with the clock (only a stream does)
    return A.noise(int(n['seed']), n['key'], int(n['type']['rows']), int(n['type']['cols']), n['dist'], 0, [(c['cx'], c['cy']) for c in at.cells], lengths(n['type']))


UNITS = {'csv': ('row', 'rows'), 'text': ('character', 'characters'), 'npy': ('value', 'values')}


def v_stream(n, at):
    """Successive values side by side (graph.js: stream; sources.js sets out the kinds). Value j begins at unit
    start + tick × step + j × span. Noise: the generator's draw with the unit for its tick and no cell in its key.
    A file: span units from there, of the file's roll."""
    run, kind = at.run, n['kind']
    rows, cols, length = int(n['type']['rows']), int(n['type']['cols']), int(n['length'])
    wide = cols // length
    for setting in ('start', 'step'):
        if n[setting] is None:      # a setting that is not known: no value, never a guess
            raise Trouble('its %s is not known: a stream with a setting that is not known has no value' % setting)
    start, step = int(n['start']), int(n['step'])
    first = start + run.tick_at(at.cells) * step
    if kind == 'noise':
        return A.beside([A.noise(int(n['seed']), n['key'], rows, wide, n['dist'], first + j, (), ()) for j in range(length)])
    roll = run.roll(kind, n['path'])
    most, (unit_rows, unit_cols) = A.units(roll), A.unit(roll)
    one, many = UNITS[kind]
    if kind == 'csv':
        span, down, fits = rows, True, unit_cols == wide
    elif kind == 'text':
        span, down, fits = wide, False, True
    else:
        span, down, fits = 1, True, (unit_rows, unit_cols) == (rows, wide)
    if not fits:
        raise Trouble('%s holds values of %d × %d, and one value of its stream is %d × %d: choose the file again, and the stream takes its size' % (n['path'], unit_cols, unit_rows if kind == 'npy' else rows, wide, rows))
    need = length * span      # the units its window takes in, from first
    if n['end'] == 'stop' and first + need > most:
        last = most - need - start      # the furthest its window can have moved on and still lie in the file
        ended = 0 if last < 0 else last // step + 1
        raise Ended('it ended at tick %s: %s has %s, and it stops at its end' % (format(ended, ','), n['path'], '%s %s' % (format(most, ','), one if most == 1 else many)), at.id, ended)
    return A.window(roll, [(first + j * span) % most for j in range(length)], span, down)


def v_measure(n, at):
    t = at.type(0)
    if n['side'] == 'a':
        if not n['formula'].strip():
            raise Trouble('unknown: the attribute %s has nothing typed for it' % n['name'])
        return A.spread(work(at.run.tree(n['formula']), at.names(1, (1, 1), lambda axis: None), A), 1, 1)
    if n['side'][0] == 'd':
        return A.full(1, 1, float(inner_of(t)[int(n['side'][1:]) - 1]['length']))      # the length of an inner axis
    if not one(t):
        return A.full(1, 1, float(t['cols'] if n['side'] == 'x' else t['rows']))      # a length is read off the type
    v = at.get(0)
    if n['side'] == 'm':
        return v
    # a single entry's side is the root of its mass; an infinite mass, or one below 0, has no root to be a side
    side = A.call('select', [A.binary('<', A.call('abs', [v]), A.number(math.inf)), A.call('sqrt', [v]), A.number(NAN)])
    return A.call('select', [A.binary('==', v, A.nothing()), A.nothing(), side])      # and the side of None is None, as its mass is


def v_map(n, at):
    rows, cols = int(n['type']['rows']), int(n['type']['cols'])
    return over_matrix(at, n['formula'], rows, cols, at.get(0), 1, lambda: index_at(at.cells), lengths(n['type']))


def v_repeat(n, at):
    pc, pr, across, down = int(n['pattern']['cols']), int(n['pattern']['rows']), int(n['across']), int(n['down'])
    ids = n['inputs']
    places = {i: {'col': int(n['at'][k]['col']), 'row': int(n['at'][k]['row'])} for k, i in enumerate(ids) if ids.count(i) == 1}
    key = json.dumps(places, sort_keys=True)
    cell = lambda k, cx, cy: at.cell({'x': (cx - 1) * pc, 'y': (cy - 1) * pr, 'dx': int(n['at'][k]['col']), 'dy': int(n['at'][k]['row']), 'cx': cx, 'cy': cy, 'at': places, 'atKey': key})
    pattern, each = A.blank(pr, pc, lengths(n['type'])), []
    for k, i in enumerate(ids):
        if at.run.follows(i):
            each.append(k)      # a part that follows its cell is worked out once for every cell
        else:
            pattern = A.place(pattern, at.get(k, cell(k, 1, 1)), int(n['at'][k]['row']), int(n['at'][k]['col']))      # and one that does not is the same in all of them
    out = A.repeat(pattern, down, across)
    for cy in range(1, down + 1):
        for cx in range(1, across + 1):
            for k in each:
                out = A.place(out, at.get(k, cell(k, cx, cy)), (cy - 1) * pr + int(n['at'][k]['row']), (cx - 1) * pc + int(n['at'][k]['col']))
    return out


# ---- a tile with a step (evaluate.js sets the same out): a repeat with fn and state, and a loop ----
def places_of(n):
    ids = n['inputs'][:len(n['at'])]
    return {i: {'col': int(n['at'][k]['col']), 'row': int(n['at'][k]['row'])} for k, i in enumerate(ids) if n['inputs'].count(i) == 1}


def cell_at(n, k):
    """Where cell k of a tile with a step lies: left to right, then the next row down (graph.js: cellAt)."""
    if n['across'] == 'inf':
        return k, 1
    across = int(n['across'])
    return (k - 1) % across + 1, (k - 1) // across + 1


def step_number(n, c):
    return c['cx'] if n['across'] == 'inf' else (c['cy'] - 1) * int(n['across']) + c['cx']


def cell_env(run, tile, n, outer, j, k):
    cx, cy = cell_at(n, j)
    places = places_of(n)
    c = a_cell({'x': (cx - 1) * int(n['pattern']['cols']), 'y': (cy - 1) * int(n['pattern']['rows']), 'dx': int(n['at'][k]['col']), 'dy': int(n['at'][k]['row']), 'cx': cx, 'cy': cy,
                'of': [tile], 'at': places, 'atKey': json.dumps(places, sort_keys=True)})
    return Env(outer.params, outer.cells + (c,), outer.active)


def whole_cell(run, tile, n, outer, j):
    """Cell j of a tile with a step, whole: every part of its pattern as it is in that cell, set in its place."""
    first = run.nodes[n['inputs'][0]]['type']
    out = A.blank(int(n['pattern']['rows']), int(n['pattern']['cols']), lengths(first))
    for k, a in enumerate(n['at']):
        out = A.place(out, run.work(n['inputs'][k], cell_env(run, tile, n, outer, j, k)), int(a['row']), int(a['col']))
    return out


def state_in(run, tile, outer, k):
    """The state of cell k (2 or more) of a tile with a step: what the step made of cell k - 1 (evaluate.js: stateIn).
    Worked out in order, one step each; the last two are kept (a cell is made of the state before it, and is asked
    for its own while it is set down), so a loop of a million steps holds two states and no more. One asked for
    that is no longer kept is worked out again from the first cell."""
    run.homes()
    i = run.loops[tile]
    n = run.nodes[i]
    key = tile + '|' + params_key(outer.params) + '|' + ';'.join('%d,%d' % (c['x'], c['y']) for c in outer.cells)
    kept = run.stepped.get(key)
    if kept is None or (kept and k not in kept and k < max(kept)):
        run.let_go(lambda other: other == key)
        kept = run.stepped[key] = {}
        run.stepped_cells[key] = tuple((c['x'], c['y']) for c in outer.cells)
    f = run.functions[n['fn']]
    j = max(kept) + 1 if kept else 2
    steps = 0
    while j <= k:
        steps += 1
        if steps > MAX_STEPS:
            raise Trouble('not stopped after %s steps: a loop is stopped then' % format(MAX_STEPS, ','))
        if n['fn'] in outer.active:
            raise Trouble('a function applies itself')
        values = whole_cell(run, tile, n, outer, j - 1)
        hold(values, run.nodes[f['input']]['type'].get('value'), 'in', i, ' in cell %d' % (j - 1))      # (the tile's node, its matrix else its loop, whoever asked: as evaluate.js names it)
        call = 'step %s#%d' % (key, j)
        made = run.work(f['body'], Env(dict(outer.params, **{n['fn']: {'values': values, 'key': call}}), (), outer.active + (n['fn'],)))
        kept = run.stepped.get(key)      # (let go meanwhile, where the run ran short of room: begun again from here)
        if kept is None:
            kept = run.stepped[key] = {}
            run.stepped_cells[key] = tuple((c['x'], c['y']) for c in outer.cells)
        kept[j] = made
        run.stepped_held += A.size(made)
        gone = kept.pop(j - 2, None)
        if gone is not None:
            run.stepped_held -= A.size(gone)
        # This step is done: the states of every tile with a step inside its function are of no more use, since no
        # other step is given what this one was; nor are those of a tile in the pattern, in the cell before the one
        # the step was given. They are let go, so that a loop inside a loop holds what one pass of it holds.
        here, before = call + '|', None
        if j > 2:
            cx, cy = cell_at(n, j - 2)
            before = run.stepped_cells[key] + (((cx - 1) * int(n['pattern']['cols']), (cy - 1) * int(n['pattern']['rows'])),)
        run.let_go(lambda other: other != key and (here in other or (before is not None and run.stepped_cells[other][:len(before)] == before)))
        if run.stepped_held > run.room:
            raise Trouble('the states of its tiles with a step take more memory than the run may: %s MB' % format(run.room >> 20, ','))
        j += 1
    return kept[k]


COUNT_NEAR = 1e-5      # how far from a whole number, for its size, a count worked out in 32-bit floats may lie
COUNT_MOST = 1e-2      # and never further than this


def whole_count(x):
    """A count that was worked out here, in 32-bit floats, as the natural it stands for. A count is a whole number of
    at least 1 (or an infinity): (1/7) * 21 comes to 3.0000002 here and is 3, so a value within COUNT_NEAR of its own
    size of a whole number, and never further than COUNT_MOST from it, is that whole number. (Past 2 ** 24 a float is
    a whole number already.) Anything else is refused with the number. None for an entry with no value."""
    if math.isnan(x):
        return None
    if x == math.inf:
        return x
    near = round(x) if abs(x) < 2 ** 62 else x
    if near >= 1 and abs(x - near) <= min(COUNT_MOST, max(1e-6, COUNT_NEAR * abs(x))):
        return int(near)
    raise Trouble('its count comes to %s: a count is a whole number, at least 1' % shown(x))


def v_loop(n, at):
    run = at.run
    run.homes()
    tile = (run.repeats.get(at.id) or [None])[0]
    if tile is None:
        raise Trouble("a loop that is no tile's")
    count = n['count']
    if is_obj(count):
        by = n['inputs'][count['input']]
        if at.id in run.counts and not run.nodes[by].get('within'):      # the page has it exactly, and it is the same wherever it is looked at from
            count = run.counts[at.id]
        else:
            got = at.get(count['input'])
            if A.is_none(got, 0, 0):
                raise Trouble('its count comes to None: a count is a whole number, at least 1')
            count = whole_count(A.item(got, 0, 0))
            if count is None:      # its count is an entry with no value: every entry is the error, as on the page
                t = n['type']
                return A.full(int(t['rows']), int(t['cols']), NAN, lengths(t))
    if count == 'inf':
        count = math.inf
    state = lambda k: state_in(run, tile, at.env, k) if k > 1 else A.part(whole_cell(run, tile, n, at.env, 1), int(n['state']['row']), int(n['state']['col']), int(n['state']['rows']), int(n['state']['cols']))
    if count == math.inf and n['until'] is None:      # it has no last cell: it takes one step each tick, and is the state of the cell after as many
        k = run.tick + 1
        if k > 1 and not at.env.params and not at.env.cells and run.read_checkpoint is not None:
            key = tile + '||'
            kept = run.stepped.get(key)
            if not (kept and (k in kept or max(kept) == k - 1)):
                loaded = run.read_checkpoint(at.id, run.tick)
                if loaded is not None:
                    run.let_go(lambda other: other == key)
                    run.stepped[key] = {k: loaded}
                    run.stepped_cells[key] = ()
                    run.stepped_held += A.size(loaded)
                    run.restored.add(at.id)
                    return loaded
                run.missed.add(at.id)
        return state(k)
    k = 1
    while n['until'] is not None and k <= count:
        if k - 1 > MAX_STEPS:
            raise Trouble('not stopped after %s steps: a loop is stopped then' % format(MAX_STEPS, ','))
        t = A.truth(run.work(n['inputs'][n['until']], cell_env(run, tile, n, at.env, k, n['until'])))
        if t is None:      # (the page leaves every entry unknown; here what is not known is no value)
            raise Trouble('unknown: its stop block has an entry with no value, and none that is true')
        if t:
            run.stops[at.id] = k
            return state(k)
        k += 1
    return state(int(count) + 1)      # (state_in takes each step in its turn from the last state it has: after the tile's matrix was made, that is one step)


def v_mapalong(n, at):
    x, X, rows = at.type(0), at.get(0), n['axis'] == 'rows'
    count, span = int(n['count']), int(n['span'])
    on = 0      # in a later cell of a tile it is repeated through, it goes on where the cell before ended
    for t in n.get('through', ()):
        c = next((c for c in at.cells if c['of'] and t['tile'] in c['of']), None)
        on += (c['y'] if rows else c['x']) if c else 0
    out = A.blank(int(n['type']['rows']), int(n['type']['cols']), lengths(n['type']))
    each = (int(n['type']['rows']) if rows else int(n['type']['cols'])) // count
    for k in range(1, count + 1):
        run = run_of(n, k)
        part = covered(dict(run, start=run['start'] + on), x)
        if not part:
            raise Trouble('run %d of the arrow lies past its input' % k)
        given, off = A.part(X, part['row'], part['col'], part['rows'], part['cols']), (k - 1) * span
        if 'fn' in n:
            got = at.call(n['fn'], given, '%s#%s:%d:%d' % (at.key_of(0), n['axis'], run['start'] + on, run['span']), ' in run %d' % k if count > 1 else '')      # the rows or columns really handed over (graph.js: mapalong): two arrows of one function on different runs of one input do not share an answer
        else:
            spot = n.get('at')
            where = (int(spot['col']) + (0 if rows else off), int(spot['row']) + (off if rows else 0), False) if spot else None
            got = over_matrix(at, n['formula'], part['rows'], part['cols'], given, 1, lambda: where, lengths(n['type']))
        out = A.place(out, got, (k - 1) * each if rows else 0, 0 if rows else (k - 1) * each)
    return out


class Here(At):
    """What a rule may ask while it is run at one inner position of its first input (evaluate.js: repeated): that
    input is its matrix there and nothing more, and a key for it names the position."""

    def __init__(self, at, whole, where):
        At.__init__(self, at.run, at.id, at.n, at.env)
        self.given_here = A.at_position(whole, where)
        self.flat = {k: v for k, v in At.type(self, 0).items() if k != 'inner'}
        self.tail = '#k' + ''.join(',%d' % (w + 1) for w in where)

    def type(self, k):
        return self.flat if k == 0 else At.type(self, k)

    def said_tail(self):
        return self.tail[2:].replace(',', ', ')      # the inner position, after the column and the row

    def get(self, k, env=None):
        return self.given_here if k == 0 and env is None else At.get(self, k, env)

    def key_of(self, k):
        return At.key_of(self, k) + (self.tail if k == 0 else '')


def positioned(rule):
    """A rule that applies a function: handed its input whole where the function's input block holds inner data (or
    there is none to hand), and otherwise run once for the matrix at each inner position, the results joined."""
    def value(n, at):
        inner = lengths(at.type(0))
        if not inner or at.whole():
            return rule(n, at)
        whole, flat = at.get(0), dict(n, type={k: v for k, v in n['type'].items() if k != 'inner'})
        return A.join([rule(flat, Here(at, whole, where)) for where in itertools.product(*(range(length) for length in inner))], inner)
    return value


def v_transpose(n, at):
    if 'order' not in n:
        return A.transpose(at.get(0, at.turn()))
    order = [int(i) for i in n['order']]
    # the index is the cell's, by drawn column and row: read turned only where the turn is of those two
    return A.reorder(at.get(0, at.turn() if order[:2] == [1, 0] else None), order)


def v_stack(n, at):
    return A.stack([at.get(k) for k in range(len(n['inputs']))], [(int(a['col']), int(a['row'])) for a in n['at']], int(n['type']['rows']), int(n['type']['cols']))


def v_choose(n, at):
    t = A.truth(at.get(0))
    if t is None:      # (the page leaves every entry unknown; here what is not known is no value)
        raise Trouble('unknown: its condition has an entry with no value, and none that is true')
    k = 1 if t else 2
    at.run.chosen(n['inputs'][k])
    return at.get(k)


OPS = {
    'variable': v_variable,
    'matmul': v_matmul,
    'scale': lambda n, at: A.binary('*', at.get(0), at.get(1), (is_step(at, 0, '*'), is_step(at, 1, '*'))),
    'transpose': v_transpose,
    'add': v_add,
    'ewise': v_ewise,
    'block': v_block,
    'slice': v_slice,
    'source': v_source,
    'noise': v_noise,
    'stream': v_stream,
    'measure': v_measure,
    'map': v_map,
    'apply': positioned(lambda n, at: at.call(n['fn'], at.get(0), at.key_of(0))),
    'param': lambda n, at: at.given(n),
    'repeat': v_repeat,
    'loop': v_loop,
    'mapalong': lambda n, at: (positioned(v_mapalong) if 'fn' in n else v_mapalong)(n, at),
    'stack': v_stack,
    'entry': lambda n, at: A.entry(at.get(0), int(n['at']['col']), int(n['at']['row'])),
    'choose': v_choose,
}


def reads(n, ins):
    """Which inputs a node's value is worked out from (graph.js: OPS[op].needs)."""
    if n['op'] == 'variable':
        return [] if 'error' in n else n['inputs']
    if n['op'] == 'measure':
        return n['inputs'][1:] if n['side'] == 'a' else n['inputs'][:1] if n['side'] == 'm' or one(ins[0]['type']) else []
    if n['op'] == 'choose':
        return n['inputs'][:1]      # its condition; the side it takes is read once that is known (v_choose)
    return n['inputs']


def later(n):
    """The inputs a node reads only once its value asks for them (graph.js: OPS[op].later): a choose's two sides."""
    return n['inputs'][1:] if n['op'] == 'choose' else []


def too_many(nodes, need, node):
    """The sentence for a node worked out from more numbers than are worked out at all."""
    at = nodes[need['where']]['type']
    return '%s numbers%s, more than the %s that are worked out' % (' × '.join(format(int(x), ',') for x in (at['cols'], at['rows']) + lengths(at)),
                                                                     '' if need['where'] == node else ' in what it is worked out from', format(MAX_ENTRIES, ','))


class Run:
    def __init__(self, graph, read_file=None, tick=0, room=MEMORY_LEAST, counts=None, read_roll=None, read_checkpoint=None):
        self.read_roll, self.rolls, self.rolls_held = read_roll, OrderedDict(), 0      # the files streams read, as their units: (kind, path) -> a roll, and the bytes of them all
        self.read_checkpoint, self.restored, self.missed = read_checkpoint, set(), set()      # checkpoint restore callback and which infinite loops hit or missed it
        self.counts = counts or {}      # loop -> its count, where the page settled it exactly (run.py: counts)
        self.graph, self.nodes, self.functions, self.tick = graph, graph['nodes'], graph['functions'], tick
        self.room, self._weights, self._masked = room, {}, {}      # room: the bytes its arrays may take in all
        self.read_file, self.files, self.trees = read_file, {}, {}
        self.kept, self.held = OrderedDict(), 0
        self.finished = {}      # what each tile with a step came to (its loop, its matrix), looked at from nowhere: never let go
        self._needs, self._follows, self._carries, self._homes, self.repeats = {}, {}, {}, None, {}
        self.stepped_cells, self.stepped_held = {}, 0      # for each kept list of states, the outer cells it is under; and the bytes of all the states kept, counted against the room beside what is remembered
        self.loops, self.state_ids, self.stepped, self.stops = {}, {}, {}, {}      # tiles with a step: tile -> the node that says its pattern, state and function; a state block -> { tile: where it lies in the state }; the states kept; where each loop stopped

    def advance(self, tick):
        """Advances a long-lived Run to a new tick while keeping top-level ticking loop states and loaded stream rolls."""
        self.homes()
        self.tick = tick
        self.kept.clear()
        self.held = 0
        self.finished.clear()
        self.stops.clear()
        self.restored.clear()
        self.missed.clear()
        keep_keys = {tile + '||' for tile in self.loops if self.ticking(tile)}
        self.let_go(lambda key: key not in keep_keys)

    def ticking_states(self):
        """Yields (loop_id, state_array) for every top-level infinite loop whose state at self.tick + 1 is held."""
        self.homes()
        k = self.tick + 1
        if k <= 1:
            return
        for tile, loop_id in self.loops.items():
            if not self.ticking(tile):
                continue
            kept = self.stepped.get(tile + '||')
            if kept and k in kept:
                yield loop_id, kept[k]

    def let_go(self, which):
        """Forgets the states kept under every key that which(key) picks (state_in): they are worked out again if asked for."""
        for key in [key for key in self.stepped if which(key)]:
            for state in self.stepped.pop(key).values():
                self.stepped_held -= A.size(state)
            self.stepped_cells.pop(key, None)

    def tree(self, text):
        if text not in self.trees:
            self.trees[text] = parse(text)
        return self.trees[text]

    def file(self, path):
        if path not in self.files:
            if data_path(path) is None or self.read_file is None:
                raise Trouble('%s: a data file is read from a project, and the run names none' % path)
            self.files[path] = self.read_file(path)
        return self.files[path]

    def roll(self, kind, path):
        """A stream's file as its units (arrays.py: a roll), read once for the run. What is kept of files counts against
        the run's room: the oldest are let go where they outgrow half of it (and are read again if asked for), and a
        file that alone is more than that is refused."""
        key = (kind, path)
        if key in self.rolls:
            self.rolls.move_to_end(key)
            return self.rolls[key]
        if data_path(path) is None or self.read_roll is None:
            raise Trouble('%s: a data file is read from a project, and the run names none' % path)
        got = self.read_roll(kind, path)
        size = A.size(got)
        if size > self.room // 2:
            raise Trouble('%s holds %s numbers, which need about %d MB of memory, more than the %d MB a run may take for one file' % (path, format(size // BYTES_AN_ENTRY, ','), max(1, size >> 20), max(1, self.room >> 21)))
        self.rolls[key] = got
        self.rolls_held += size
        while self.rolls_held > self.room // 2 and len(self.rolls) > 1:
            _, gone = self.rolls.popitem(last=False)
            self.rolls_held -= A.size(gone)
        return got

    def ticking(self, tile):
        """Whether a tile takes one step each tick: its loop has an infinite count and no stop block."""
        self.homes()
        i = self.loops.get(tile)
        n = self.nodes[i] if i is not None else None
        return n is not None and n['op'] == 'loop' and n['count'] == 'inf' and n['until'] is None

    def tick_at(self, cells):
        """The tick a stream is read at, and a loop with no last cell stepped to, looked at from these cells: the
        run's, but inside cell k of a tile that takes a step each tick it is k - 1, the innermost such tile's."""
        for c in reversed(cells):
            for tile in c['of'] or ():
                if self.ticking(tile):
                    return step_number(self.nodes[self.loops[tile]], c) - 1
        return self.tick

    def follows(self, i):
        """Whether a node's value follows the cell it is worked out in (evaluate.js: follows)."""
        self.homes()
        todo, opened = [i], set()
        while todo:
            k = todo[-1]
            if k in self._follows:
                todo.pop()
                continue
            n = self.nodes[k]
            if k in self.state_ids or reads_index(n):      # (a state block of a tile with a step holds what the step made of the cell before)
                self._follows[k] = True
            else:
                waiting = [d for d in n['inputs'] if d not in self._follows and d not in opened]
                if waiting:
                    opened.add(k)
                    todo.extend(waiting)
                    continue
                self._follows[k] = any(self._follows.get(d, False) for d in n['inputs'])
            todo.pop()
        return self._follows[i]

    def carries(self, i):
        """Whether a node's value is worked out from the state of a tile with a step (evaluate.js: carries)."""
        self.homes()
        todo, opened = [i], set()
        while todo:
            k = todo[-1]
            if k in self._carries:
                todo.pop()
                continue
            n = self.nodes[k]
            if k in self.state_ids:
                self._carries[k] = True
            else:
                waiting = [d for d in n['inputs'] if d not in self._carries and d not in opened]
                if waiting:
                    opened.add(k)
                    todo.extend(waiting)
                    continue
                self._carries[k] = any(self._carries.get(d, False) for d in n['inputs'])
            todo.pop()
        return self._carries[i]

    def chosen(self, side):
        """The side a choose has taken, looked at as run.py looks at a node before it is worked out: refused where a
        variable it is worked out from has an error, or where anything it is worked out from is too large."""
        need = self.needs(side)
        if need['most'] > MAX_ENTRIES:
            raise Trouble(too_many(self.nodes, need, side))
        if need['bad']:
            raise Trouble(need['bad'])

    def needs(self, start):
        """-> { most, where, bad, room, room_where }, walked with a list of its own (evaluate.js: needsOf). room: the
        most numbers of anything it may come to be worked out from, the sides of a choose included, either of which
        it may take: what there has to be room to work on (bytes_for)."""
        todo = [start]
        while todo:
            i = todo[-1]
            if i in self._needs:
                todo.pop()
                continue
            n = self.nodes[i]
            deps = list(reads(n, [self.nodes[k] for k in n['inputs']]))
            if applies(n):
                deps.append(self.functions[n['fn']]['body'])
            waiting = [d for d in deps + later(n) if d not in self._needs]
            if waiting:
                todo.extend(waiting)
                continue
            most, where = numbers(n['type']), i
            room, room_where = most, i
            bad = None
            if n['op'] == 'variable' and 'error' in n:
                e = n['error']
                bad = '%s has no value (%s%s)' % (n.get('name') or i, 'a cycle' if e['code'] == 'loop' else e['code'], ': ' + e['note'] if e['note'] else '')      # (the error code loop is a cycle: the word loop is kept for a tile with a step)
            for d in deps:
                got = self._needs[d]
                if got['most'] > most:
                    most, where = got['most'], got['where']
                bad = bad or got['bad']
            for d in deps + later(n):
                got = self._needs[d]
                if got['room'] > room:
                    room, room_where = got['room'], got['room_where']
            self._needs[i] = {'most': most, 'where': where, 'bad': bad, 'room': room, 'room_where': room_where}
            todo.pop()
        return self._needs[start]

    def weight(self, start, extra=()):
        """How many entries there are in everything a run of a node may come to hold at once: itself and what its
        value is worked out from, each node counted once. Walked with lists of its own, each node visited once.
        Of a choose's two sides only one is worked out, so of what is made through one side alone (and through
        nothing else the run makes) only the heavier side's is counted, by the bytes it may take. What a side
        shares with the other, or with anything else that is worked out, is counted whichever side is taken: the
        count is of the nodes that may be made, and is never less than what is. A choose whose condition is inside a
        function, or follows its cell, has a truth for each thing the function is given and each cell, and may take
        both sides in one run: both are counted."""
        if extra:
            return self.count(start, extra)[0]
        if start not in self._weights:
            self._weights[start], self._masked[start] = self.count(start)
        return self._weights[start]

    def deps(self, i):
        """Everything a node may be worked out from: a side of a choose is ('side', choose, k), a step of its own on
        the way to that input, so that what is reached through one side alone can be told (count)."""
        if not isinstance(i, str):
            return list(i[1]) if i[0] == 'root' else [self.nodes[i[1]]['inputs'][i[2]]]
        n = self.nodes[i]
        deps = list(reads(n, [self.nodes[k] for k in n['inputs']]))
        if applies(n):
            deps.append(self.functions[n['fn']]['body'])
        return deps + [('side', i, k) for k in range(1, len(n['inputs']))] if n['op'] == 'choose' else deps

    def count(self, start, extra=()):
        """-> (entries, bytes of masks) for weight. With no choose it is the sum over what is reached. With one, each
        thing reached has the one nearest thing that every way to it from start passes through (its dominator: in a
        graph with no loop, the nearest common one of all that read it), and a count is passed up that tree: a
        choose takes the heavier of what hangs under its two sides alone."""
        root = ('root', tuple(dict.fromkeys([start] + list(extra)))) if extra else start
        order, seen, done, todo, chooses, loops = [], {root}, set(), [(root, iter(self.deps(root)))], False, False
        while todo:      # every node after all it is worked out from
            i, rest = todo[-1]
            d = None
            for d in rest:
                if d not in seen:
                    break
                loops = loops or d not in done      # it is on the way to itself: a function that applies itself
            else:
                d = None
            if d is None:
                done.add(i)
                order.append(todo.pop()[0])
            else:
                seen.add(d)
                chooses = chooses or (not isinstance(d, str) and d[0] == 'side')
                todo.append((d, iter(self.deps(d))))
        own = {}
        for i in order:
            if isinstance(i, str):
                n = self.nodes[i]
                size = numbers(n['type'])
                if 'fn' in n and 'state' in n:      # a tile with a step keeps two states beside its value (state_in)
                    size += 2 * int(n['state']['cols']) * int(n['state']['rows']) * (numbers(n['type']) // max(1, int(n['type']['cols']) * int(n['type']['rows'])))
                own[i] = (size, size * (2 if chain_of(n) else 1) if self.may_be_none(n['type']) else 0)      # (a sum or a product of several may keep a second byte an entry: arrays.py, Held.rest)
            else:
                own[i] = (0, 0)
        if not chooses or loops:      # (in a loop nothing is nearest: everything reached is counted)
            return sum(w for w, _ in own.values()), sum(m for _, m in own.values())
        order.reverse()      # every node before all it is worked out from
        # the tree, with a second way up from each node that skips ahead, so that the nearest thing above two nodes is found in few steps
        above, depth, skip, readers = {root: root}, {root: 0}, {root: root}, {}
        for i in order:
            if i != root:
                up = None
                for r in readers[i]:
                    if up is None:
                        up = r
                        continue
                    a, b = (up, r) if depth[up] >= depth[r] else (r, up)
                    while depth[a] > depth[b]:
                        a = skip[a] if depth[skip[a]] >= depth[b] else above[a]
                    while a != b:
                        a, b = (skip[a], skip[b]) if skip[a] != skip[b] else (above[a], above[b])
                    up = a
                above[i], depth[i] = up, depth[up] + 1
                s = skip[up]
                skip[i] = skip[s] if depth[up] - depth[s] == depth[s] - depth[skip[s]] else up
            for d in self.deps(i):
                readers.setdefault(d, []).append(i)
        total, sides = dict(own), {}
        for i in reversed(order):      # what hangs under a node is counted before the node
            w, m = total[i]
            if i in sides:
                c = self.nodes[i]['inputs'][0]      # one condition, worked out once, takes one side however often the choose is asked for
                both = bool(functions_of(self.nodes[c])) or self.follows(c)
                took = [sum(x) for x in zip(*sides[i])] if both else max(sides[i], key=lambda side: BYTES_AN_ENTRY * side[0] + side[1])
                w, m = w + took[0], m + took[1]
            if i != root:
                if isinstance(i, str):
                    up = total[above[i]]
                    total[above[i]] = (up[0] + w, up[1] + m)
                else:
                    sides.setdefault(above[i], []).append((w, m))
            else:
                return w, m

    def may_be_none(self, t):
        """Whether an array of this type may carry a mask beside its numbers (arrays.py: Held), a byte an entry more:
        its value admits None ("integer?"), or, in a graph of version 3, says nothing, which reads as any or None.
        An older graph's types say no value and are counted as they always were."""
        value = t.get('value')
        return value.endswith('?') or value == S.NONE if isinstance(value, str) else self.graph.get('version', 0) >= 3

    def bytes_for(self, start, room_to_work, bytes_an_entry, extra=()):
        """The bytes a run of a node may come to hold at once: everything it is worked out from, held together, and
        room to work on the largest of it; with the byte an entry that says which entries are None, where one may."""
        weight, masked = self.count(start, extra) if extra else (self.weight(start), self._masked[start])
        room, room_where = 0, start
        for s in [start] + list(extra):
            need = self.needs(s)
            if need['room'] > room:
                room, room_where = need['room'], need['room_where']
        most = self.nodes[room_where]['type']
        return bytes_an_entry * (weight + room_to_work * room) + masked + (room_to_work * room if self.may_be_none(most) else 0)

    def homes(self):
        """The tiles each block's node is itself in, and which tiles each repeat is the matrix of (evaluate.js: homesOf)."""
        if self._homes is not None:
            return self._homes
        homes, repeats, spaces, blocks = {}, {}, self.graph['spaces'], self.graph['blocks']
        loops, state_ids = {}, {}

        def add(i, tiles):
            if i not in self.nodes:
                return False
            if i not in homes:
                homes[i] = set(tiles)
                return True
            grew = not tiles <= homes[i]
            homes[i] |= tiles
            return grew
        again, passes = True, 0
        while again and passes < 64:
            again, passes = False, passes + 1
            for key, s in spaces.items():
                context = set() if key == 'top' else homes.get(s['owner']) if isinstance(s['owner'], str) else None
                if context is None:
                    continue
                inside = lambda field, i: context | {t['tile'] for t in s['tiles'] if i in t[field]}
                seen = []
                for b in [b for p in s['pieces'] for b in p['blocks']] + [b for t in s['tiles'] for b in t['blocks']]:
                    if b in seen or b not in blocks:
                        continue
                    seen.append(b)
                    i, tiles = blocks[b], inside('blocks', b)
                    again = add(i, tiles) or again
                    if self.nodes[i]['op'] == 'transpose':
                        again = add(self.nodes[i]['inputs'][0], tiles) or again
                for a in s['arrows']:
                    if a['node'] is not None and self.nodes[a['node']]['op'] == 'map':
                        again = add(a['node'], inside('arrows', a['arrow'])) or again
                for t in s['tiles']:
                    for i in (t['node'], t.get('loop')):
                        if i is None:
                            continue
                        if t['tile'] not in repeats.setdefault(i, []):
                            repeats[i].append(t['tile'])
                        n = self.nodes[i]
                        if 'fn' in n and 'state' in n:      # a tile with a step
                            loops.setdefault(t['tile'], i)
                            for k in range(len(n['at'])):
                                where = state_at(n, k, self.nodes[n['inputs'][k]]['type'])
                                if where:
                                    state_ids.setdefault(n['inputs'][k], {})[t['tile']] = where
        self._homes, self.repeats, self.loops, self.state_ids = homes, repeats, loops, state_ids
        return homes

    def key_for(self, i, n, env):
        in_cells = bool(env.cells) and self.follows(i)
        fns = functions_of(n)
        if not fns and not in_cells:
            return ''
        if in_cells and self.carries(i):      # worked out from a tile's state, in a cell: under all that the state is remembered under (state_in)
            given = params_key(env.params)
        else:
            given = '|'.join(env.params[f]['key'] if f in env.params else '' for f in fns)
        return '|' + given + ('|' + ';'.join(cell_key(c) for c in env.cells) if in_cells else '')

    def work(self, i, env):
        n = self.nodes[i]
        if env.cells:
            home = self.homes().get(i)
            # a block is in the cells of the tiles it is itself in, and no others, whoever reads it
            if home is not None and any(c['of'] and not any(t in home for t in c['of']) for c in env.cells):
                env = Env(env.params, tuple(c for c in env.cells if not c['of'] or any(t in home for t in c['of'])), env.active)
        if env.cells:
            last = env.cells[-1]
            # a part of the pattern met again below its tile: it is at its own place, not the reader's
            p = last['at'].get(i) if last['at'] else None
            if p is not None and (last['dx'] != p['col'] or last['dy'] != p['row'] or last['turned']):
                env = Env(env.params, env.cells[:-1] + (dict(last, dx=p['col'], dy=p['row'], turned=False),), env.active)
        key = (i, self.key_for(i, n, env))
        if key in self.finished:
            return self.finished[key]
        if key in self.kept:
            self.kept.move_to_end(key)
            return self.kept[key]
        value = None
        if env.cells and env.cells[-1]['of'] and i in self.state_ids:      # a state block in a later cell of its tile holds what the step made of the cell before
            last, where = env.cells[-1], self.state_ids[i]
            tile = next((t for t in last['of'] if t in where), None)
            k = step_number(self.nodes[self.loops[tile]], last) if tile else 1
            if k > 1:
                w = where[tile]
                whole = self.finished.get((self.loops[tile], '')) if len(env.cells) == 1 and not env.params and self.nodes[self.loops[tile]]['op'] == 'repeat' else None
                if whole is not None:      # the tile's matrix has been worked out in this run: the cell's state is read off it, and no step is taken again
                    t = n['type']
                    value = A.part(whole, last['y'] + last['dy'], last['x'] + last['dx'], int(t['rows']), int(t['cols']))
                else:
                    value = A.part(state_in(self, tile, Env(env.params, env.cells[:-1], env.active), k), w['row'], w['col'], w['rows'], w['cols'])
        if value is None:
            value = OPS[n['op']](n, At(self, i, n, env))
        if n['op'] == 'variable' and 'holds' in n:      # a promise is held against the numbers worked out here, as the page holds it against its own (evaluate.js: run)
            in_cells = bool(env.cells) and self.follows(i)
            hold(value, n['holds'], n.get('name') or i, i, ' in cell ' + ' of cell '.join('%d, %d' % (c['cx'], c['cy']) for c in reversed(env.cells)) if in_cells else '')
        self.held += A.size(value)
        if 'fn' in n and 'state' in n and key[1] == '':
            # What a tile with a step comes to, outside every function and tile, is kept for the life of the run: it is
            # as many steps to make again as it has cells, and letting the oldest go must never cost a pass (one such
            # value for each tile's loop and matrix: a number the graph bounds, counted in held like any other).
            self.finished[key] = value
            return value
        self.kept[key] = value
        while (self.held + self.stepped_held + self.rolls_held > self.room // 2 or len(self.kept) > MAX_KEPT) and len(self.kept) > 1:      # the oldest are let go: they are worked out again if they are asked for
            _, gone = self.kept.popitem(last=False)
            self.held -= A.size(gone)
        return value

    def value(self, node, binding=None):
        binding = binding if is_obj(binding) else {}
        params = {}
        for fn, spec in (binding.get('params') if is_obj(binding.get('params')) else {}).items():
            of = spec if isinstance(spec, str) else spec.get('of') if is_obj(spec) else None
            if fn not in self.functions or not isinstance(of, str) or of not in self.nodes:
                raise Trouble('its binding gives the function %s what is not in the graph' % fn)
            if is_obj(spec) and spec.get('range') is not None:
                r, t = spec['range'], self.nodes[of]['type']
                if not ok_range(r) or r['col'] + r['cols'] > t['cols'] or r['row'] + r['rows'] > t['rows']:
                    raise Trouble('its binding gives the function %s a part its input has not got' % fn)
                spec = {'of': of, 'range': {k: int(r[k]) for k in ('col', 'row', 'cols', 'rows')}}
            else:
                spec = of
            why = self.needs(of)['bad']
            if why:
                raise Trouble(why)
            given, takes = (spec['range'] if is_obj(spec) else self.nodes[of]['type']), self.nodes[self.functions[fn]['input']]['type']
            if (given['cols'], given['rows']) != (takes['cols'], takes['rows']):      # what a function is given is the size of its input, or it is given nothing
                raise Trouble('its binding gives the function %s %s × %s, and the function takes %s × %s' % (fn, given['cols'], given['rows'], takes['cols'], takes['rows']))
            if lengths(self.nodes[of]['type']) != lengths(takes):      # (inside a function that is run at each inner position there is no one input to look at it from)
                raise Trouble('its binding gives the function %s inner data its input does not hold' % fn)
            params[fn] = {'spec': spec, 'values': None, 'key': 'given ' + json.dumps(spec, sort_keys=True)}
        cells = [c for c in (binding.get('cells') if isinstance(binding.get('cells'), list) else []) if is_obj(c)]
        if len(cells) > MAX_BINDING_CELLS:
            raise Trouble('its binding names more than %d cells, one inside the next' % MAX_BINDING_CELLS)
        return self.work(node, Env(params, tuple(a_cell(c) for c in cells), ()))
