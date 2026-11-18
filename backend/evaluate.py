"""A graph worked out in floating point. A graph (graph.js) and what is wanted of it in, numbers out.

evaluate.js is the reference for what every operation means, and this is tested against it (backend/fixtures):
wherever the browser works a node out exactly, the numbers here are those, to within what a 32-bit float holds.
Each operation's rule is an entry of OPS below, as it is an entry of OPS in graph.js; the rules ask arrays.py for
every array and hold no number of their own. This file does not import NumPy.

    Run(graph, read_file=None, tick=0)      one run over one graph that validate (check.py) has accepted
      .needs(node)        -> { most, where, bad }: the most numbers (columns times rows times every inner length) of anything the node's value is worked out from
                             (and which node has them), and why it has no value where a variable it is worked out
                             from has an error
      .value(node, binding=None) -> its array; raises Trouble(why) where it has none

What differs from the browser, by the specification's rule that the backend never guesses a value:
  - A variable with an entry that was never given is no value at all, "unknown entries in Keys", and so is every
    node worked out from it. (The browser works out the entries that do not depend on the unknown one. A side
    length is no dependency on the entries: @Keys.x is a number however many of Keys' entries are unknown.)
  - An entry that has no value (a division by zero, ∞ − ∞) is that entry alone, as in the browser: it is NaN here.
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

What has been worked out is remembered for the run, up to half the room the run was given for its arrays (room, in
bytes: limits.py says how it follows from the machine's memory): past that the oldest results are let go, and worked
out again if they are asked for again. weight(node) says how many entries a node is worked out from in all, so that
run.py can refuse one that would not fit before any of it is made."""
import json
import math
from collections import OrderedDict

from . import arrays as A
import itertools

from .check import covered, data_path, fn_whole, inner_of, is_int, is_obj, lengths, numbers, ok_range, one, reads_index, run_of
from .formula import DOLLAR, INNER, SYMBOLIC, Wrong, axis_of, evaluate as work, parse, parse_symbolic
from .limits import MAX_BINDING_CELLS, MEMORY_LEAST

NAN = math.nan


class Trouble(Exception):
    """A node has no value; str() says why, plainly."""


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

    def call(self, fn, values, key):
        f = self.run.functions[fn]
        if fn in self.env.active:
            raise Trouble('a function applies itself')
        return self.run.work(f['body'], Env(dict(self.env.params, **{fn: {'values': values, 'key': key}}), (), self.env.active + (fn,)))

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
        A.put(out, plain[0], plain[1], A.row(numbers_of), plain[2])
    where = index_at(at.cells)
    for text, (rs, cs, kss) in formulas.items():      # one formula, worked out for every entry that holds it at once
        def index(axis, rs=rs, cs=cs):
            if where is None:
                return None
            x, y, turned = where
            return A.row([x + (r if turned else c) + 1 for r, c in zip(rs, cs)] if axis == 'x' else [y + (c if turned else r) + 1 for r, c in zip(rs, cs)])
        own = {'k%d' % (j + 1): A.row([k + 1 for k in held]) for j, held in enumerate(kss)}      # each entry's inner position
        leaf = at.names(0, (rows, cols, lambda a, rs=rs, cs=cs, kss=kss: A.take(a, rs, cs, kss)), index, own)
        A.put(out, rs, cs, A.spread(work(at.run.tree(text), leaf, A), 1, len(rs), ()), kss)
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


def v_add(n, at):
    out = at.get(0)
    for k in range(1, len(n['inputs'])):
        out = A.binary('+', out, at.get(k))
    return out


def v_block(n, at):
    out = A.blank(int(n['type']['rows']), int(n['type']['cols']), lengths(n['type']))
    for k, a in enumerate(n['at']):
        A.place(out, at.get(k, at.shift(int(a['col']), int(a['row']))), int(a['row']), int(a['col']))
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
    return A.identity(rows, cols, inner) if n['kind'] == 'identity' else A.full(rows, cols, 1.0 if n['kind'] == 'ones' else 0.0, inner)


def v_noise(n, at):
    return A.noise(int(n['seed']), n['key'], int(n['type']['rows']), int(n['type']['cols']), n['dist'], at.run.tick, [(c['cx'], c['cy']) for c in at.cells], lengths(n['type']))


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
    return A.call('select', [A.binary('<', A.call('abs', [v]), A.number(math.inf)), A.call('sqrt', [v]), A.number(NAN)])


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
            A.place(pattern, at.get(k, cell(k, 1, 1)), int(n['at'][k]['row']), int(n['at'][k]['col']))      # and one that does not is the same in all of them
    out = A.repeat(pattern, down, across)
    for cy in range(1, down + 1):
        for cx in range(1, across + 1):
            for k in each:
                A.place(out, at.get(k, cell(k, cx, cy)), (cy - 1) * pr + int(n['at'][k]['row']), (cx - 1) * pc + int(n['at'][k]['col']))
    return out


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
            got = at.call(n['fn'], given, '%s#%s:%d:%d' % (at.key_of(0), n['axis'], run['start'] + on, run['span']))      # the rows or columns really handed over (graph.js: mapalong): two arrows of one function on different runs of one input do not share an answer
        else:
            spot = n.get('at')
            where = (int(spot['col']) + (0 if rows else off), int(spot['row']) + (off if rows else 0), False) if spot else None
            got = over_matrix(at, n['formula'], part['rows'], part['cols'], given, 1, lambda: where, lengths(n['type']))
        A.place(out, got, (k - 1) * each if rows else 0, 0 if rows else (k - 1) * each)
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


OPS = {
    'variable': v_variable,
    'matmul': v_matmul,
    'scale': lambda n, at: A.binary('*', at.get(0), at.get(1)),
    'transpose': v_transpose,
    'add': v_add,
    'ewise': lambda n, at: A.spread(A.binary('/' if n['fn'] == 'div' else '*', at.get(0), at.get(1)), int(n['type']['rows']), int(n['type']['cols']), lengths(n['type'])),
    'block': v_block,
    'slice': v_slice,
    'source': v_source,
    'noise': v_noise,
    'measure': v_measure,
    'map': v_map,
    'apply': positioned(lambda n, at: at.call(n['fn'], at.get(0), at.key_of(0))),
    'param': lambda n, at: at.given(n),
    'repeat': v_repeat,
    'mapalong': lambda n, at: (positioned(v_mapalong) if 'fn' in n else v_mapalong)(n, at),
    'stack': v_stack,
    'entry': lambda n, at: A.entry(at.get(0), int(n['at']['col']), int(n['at']['row'])),
}


def reads(n, ins):
    """Which inputs a node's value is worked out from (graph.js: OPS[op].needs)."""
    if n['op'] == 'variable':
        return [] if 'error' in n else n['inputs']
    if n['op'] == 'measure':
        return n['inputs'][1:] if n['side'] == 'a' else n['inputs'][:1] if n['side'] == 'm' or one(ins[0]['type']) else []
    return n['inputs']


class Run:
    def __init__(self, graph, read_file=None, tick=0, room=MEMORY_LEAST):
        self.graph, self.nodes, self.functions, self.tick = graph, graph['nodes'], graph['functions'], tick
        self.room, self._weights = room, {}      # room: the bytes its arrays may take in all
        self.read_file, self.files, self.trees = read_file, {}, {}
        self.kept, self.held = OrderedDict(), 0
        self._needs, self._follows, self._homes, self.repeats = {}, {}, None, {}

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

    def follows(self, i):
        """Whether a node's value follows the cell it is worked out in (evaluate.js: follows)."""
        todo = [i]
        while todo:
            k = todo[-1]
            if k in self._follows:
                todo.pop()
                continue
            n = self.nodes[k]
            if reads_index(n):
                self._follows[k] = True
            else:
                waiting = [d for d in n['inputs'] if d not in self._follows and d not in todo]
                if waiting:
                    todo.extend(waiting)
                    continue
                self._follows[k] = any(self._follows.get(d, False) for d in n['inputs'])
            todo.pop()
        return self._follows[i]

    def needs(self, start):
        """-> { most, where, bad }, walked with a list of its own (evaluate.js: needsOf)."""
        todo = [start]
        while todo:
            i = todo[-1]
            if i in self._needs:
                todo.pop()
                continue
            n = self.nodes[i]
            deps = list(reads(n, [self.nodes[k] for k in n['inputs']]))
            if n['op'] in ('apply', 'mapalong') and 'fn' in n:
                deps.append(self.functions[n['fn']]['body'])
            waiting = [d for d in deps if d not in self._needs]
            if waiting:
                todo.extend(waiting)
                continue
            most, where = numbers(n['type']), i
            bad = None
            if n['op'] == 'variable' and 'error' in n:
                e = n['error']
                bad = '%s has no value (%s%s)' % (n.get('name') or i, e['code'], ': ' + e['note'] if e['note'] else '')
            for d in deps:
                got = self._needs[d]
                if got['most'] > most:
                    most, where = got['most'], got['where']
                bad = bad or got['bad']
            self._needs[i] = {'most': most, 'where': where, 'bad': bad}
            todo.pop()
        return self._needs[start]

    def weight(self, start):
        """How many entries there are in everything a node's value is worked out from, itself included, each node
        counted once: what a run of it may come to hold at once. Walked with a list of its own."""
        if start not in self._weights:
            seen, todo, total = {start}, [start], 0
            while todo:
                n = self.nodes[todo.pop()]
                total += numbers(n['type'])
                deps = list(reads(n, [self.nodes[k] for k in n['inputs']]))
                if n['op'] in ('apply', 'mapalong') and 'fn' in n:
                    deps.append(self.functions[n['fn']]['body'])
                for d in deps:
                    if d not in seen:
                        seen.add(d)
                        todo.append(d)
            self._weights[start] = total
        return self._weights[start]

    def homes(self):
        """The tiles each block's node is itself in, and which tiles each repeat is the matrix of (evaluate.js: homesOf)."""
        if self._homes is not None:
            return self._homes
        homes, repeats, spaces, blocks = {}, {}, self.graph['spaces'], self.graph['blocks']

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
                    if t['node'] is not None and t['tile'] not in repeats.setdefault(t['node'], []):
                        repeats[t['node']].append(t['tile'])
        self._homes, self.repeats = homes, repeats
        return homes

    def key_for(self, i, n, env):
        in_cells = bool(env.cells) and self.follows(i)
        fns = functions_of(n)
        if not fns and not in_cells:
            return ''
        return '|' + '|'.join(env.params[f]['key'] if f in env.params else '' for f in fns) + ('|' + ';'.join(cell_key(c) for c in env.cells) if in_cells else '')

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
        if key in self.kept:
            self.kept.move_to_end(key)
            return self.kept[key]
        value = OPS[n['op']](n, At(self, i, n, env))
        self.kept[key] = value
        self.held += A.size(value)
        while self.held > self.room // 2 and len(self.kept) > 1:      # the oldest are let go: they are worked out again if they are asked for
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
