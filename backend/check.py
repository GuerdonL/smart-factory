"""validate: the checks graph.js makes of a graph it did not build, written again for the backend.

    validate(graph) -> []   when the graph is well formed, else what is wrong, a sentence each. It answers so for
                            any JSON value at all and never raises: the backend calls it on whatever it is sent.

graph.js is the reference: its header sets the graph out, and its table OPS has, for each operation, the fields it
carries and the rule its type follows from its inputs by. RULES below is that table again, one entry for each `op`,
so a new operation is a new entry here as it is there. The two are tested against each other on the same graphs
(backend/fixtures): every graph one accepts the other accepts, and every graph one refuses the other refuses. The
sentences need not be the same words.

What is checked: every input is in the graph; there are no cycles, through inputs or through the functions nodes
apply; every node carries its operation's own fields in their stated form (a formula reads, and names nothing but
its inputs: formula.py); every type follows from its inputs by its operation's rule; every block is covered exactly
by its parts; every node is marked with the functions and the tiles it belongs to, exactly (within); spaces name
pieces, arrows and tiles in their stated form. A type is its four fields, and inner where its entries hold inner
data: the axes of what one entry holds, 1 to 6 of exactly { length, name }; and value where its number space is said
(spaces.py), which is then checked to follow from the node's inputs by its operation's rule, as its size is; it has
no other key. A variable's holds is a promise in the same words, and is then its value. Every rule acts on
the two drawn sides and is repeated at each inner position; whether two shapes' inner data agrees is nested, which
is algebra.js's nested again.

Also here, since the evaluator asks the same things: T, same, one, inner_of, lengths, numbers, fn_whole, covered,
covered_type, run_of, reads_index, tiles_of, data_path, as_int."""
import math
import re

from . import spaces as S
from .formula import DOLLAR, INNER, SPACE as BLANK, Wrong, axis_of, formula_ok, parse as read_formula, reads_index as text_reads_index
from .limits import MAX_JSON_DEPTH

VERSION = 3                 # 2 added stack, entry, a transpose's order and inner axes; 3 the value None and a type's value. An older graph is a version 3 graph as it stands
VERSIONS = (1, 2, 3)
AXES = 6                    # the most inner axes a type has
CODES = ('mismatch', 'not-a-row', 'mixed', 'pieces', 'size', 'loop', 'no-source', 'seat', 'size-unknown', 'type')
PIECE_CODES = ('mismatch', 'not-a-row', 'mixed', 'size-unknown')
DEFINED = ('entries', 'definition', 'standing', 'joined', 'measure', 'range', 'seat', 'source', 'entry')
KINDS = ('zeros', 'ones', 'identity')
DISTS = ('uniform', 'normal')
ROOTS = 6
SAFE = 2 ** 53 - 1
BIGGEST = 2 ** 1024 - 1      # past the largest number JavaScript holds, a number in JSON is an infinity there
PLACE = re.compile(r'[1-9]\d*', re.ASCII)
SIDE = re.compile(r'x|y|m|a|d[1-6]')
TYPE_KEYS = ('cols', 'rows', 'colsName', 'rowsName', 'inner', 'value')
PATH = re.compile(r'data/[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}\.csv')
MISSING = object()


# ---- numbers and text as JavaScript has them ----
def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and (isinstance(v, int) or math.isfinite(v))


def is_int(v):
    return is_num(v) and (isinstance(v, int) or v.is_integer())


def is_safe(v):
    return is_int(v) and -SAFE <= v <= SAFE


def whole1(v):
    return is_int(v) and v >= 1


def as_int(v):
    return int(v)


def is_obj(v):
    return isinstance(v, dict)


def data_path(path):
    """The path where it is one a project may hold a data file at, else None (sources.js: dataPath)."""
    return path if isinstance(path, str) and PATH.fullmatch(path) and '..' not in path else None


# ---- types ----
def inner_of(t):
    return t['inner'] if isinstance(t.get('inner'), list) else []


def lengths(t):
    """The lengths of a type's inner axes, as whole numbers."""
    return tuple(int(a['length']) for a in inner_of(t))


def numbers(t):
    """How many numbers a type holds: its columns times its rows times every inner length (algebra.js: numbers)."""
    n = int(t['cols']) * int(t['rows'])
    for length in lengths(t):
        n *= length
    return n


def T(cols, rows, cols_name=None, rows_name=None, inner=None):
    t = {'cols': cols, 'rows': rows, 'colsName': cols_name or None, 'rowsName': rows_name or None}
    if inner:
        t['inner'] = [{'length': a['length'], 'name': a['name'] or None} for a in inner]
    return t


def axes(t):
    """Every axis of a type in order: the two drawn ones, then the inner ones."""
    return [{'length': t['cols'], 'name': t['colsName'] or None}, {'length': t['rows'], 'name': t['rowsName'] or None}] + list(inner_of(t))


def ok_axis(a):
    return is_obj(a) and len(a) == 2 and whole1(a.get('length')) and 'name' in a and (a['name'] is None or (isinstance(a['name'], str) and a['name'] != ''))


def ok_type(t):
    return (is_obj(t) and whole1(t.get('cols')) and whole1(t.get('rows')) and 'colsName' in t and 'rowsName' in t
            and (t['colsName'] is None or isinstance(t['colsName'], str)) and (t['rowsName'] is None or isinstance(t['rowsName'], str))
            and ('inner' not in t or (isinstance(t['inner'], list) and 1 <= len(t['inner']) <= AXES and all(ok_axis(a) for a in t['inner'])))
            and ('value' not in t or S.parse(t['value']) is not None)      # its number space, where it is said: one of the ten words, "?" after it where None is admitted
            and all(k in TYPE_KEYS for k in t))


# ---- number spaces (spaces.py; graph.js: Number spaces) ----
def value_of(n):
    """A node's number space as its type says it; "any?" where it says none."""
    v = n['type'].get('value') if n and is_obj(n.get('type')) else None
    return v if isinstance(v, str) else S.ANY


def all_of(ins):
    out = value_of(ins[0])
    for i in ins[1:]:
        out = S.both(out, value_of(i))
    return out


def space_in(text, ins, first, arrow=None):
    """The space of a formula of the graph (graph.js: spaceIn)."""
    try:
        tree = read_formula(text)
    except Wrong:
        return S.ANY

    def name(word):
        m = DOLLAR.fullmatch(word)
        if m:
            k = (int(m.group(1)) if len(m.group(1)) <= 9 else 10 ** 9) - 1 + first      # (longer than that is past any input there is: Python reads no more than 4,300 digits as a number)
            return value_of(ins[k]) if 0 <= k < len(ins) else None
        if axis_of(word) is not None or INNER.fullmatch(word):
            return 'natural'
        k = word.lower()
        return None if arrow is None else arrow if k == 'x' else 'natural' if k in ('i', 'j') else None
    return S.formula(tree, name)


def body_of(n, g, given):
    """A function applied has its body's space where what it is given lies in what the function takes, and any? where
    that is not known from the graph (graph.js: bodyOf)."""
    f = g['fn'](n['fn'])
    p = g['node'](f['input']) if f else None
    return value_of(g['node'](f['body']) if f else None) if S.within(value_of(given), value_of(p)) else S.ANY


def variable_space(n, ins, g):
    """What it is worked out as; its promise where that is known to lie inside it, or its entries say nothing yet
    (graph.js: OPS.variable.space). A type never says what might be false."""
    quiet = False
    if n['defined'] != 'entries':
        was = value_of(ins[0])
    else:
        entries = list(n['entries'].values())
        is_formula = lambda v: is_obj(v) and isinstance(v.get('expr'), str)
        values, more = [v for v in entries if not is_formula(v)], [space_in(v['expr'], ins, 0) for v in entries if is_formula(v)]
        was, quiet = S.of_all(values, more), S.silent(values, more)
    return n['holds'] if 'holds' in n and S.parse(n['holds']) is not None and (quiet or S.within(was, n['holds'])) else was


def measure_space(n, ins, g):
    if n['side'] == 'a':
        return space_in(n['formula'], ins, 1) if n['formula'].strip(''.join(BLANK - {'\u200b'})) else 'boolean'      # (empty as formula_ok tells it: nothing typed yet)
    if n['side'] == 'm':
        return value_of(ins[0])
    return 'natural' if n['side'][0] == 'd' or not one(ins[0]['type']) else S.unary('sqrt', value_of(ins[0]))


def sum_space(n, ins, g):
    out = value_of(ins[0])
    for i in ins[1:]:
        out = S.binary('+', out, value_of(i))
    return out


def one(t):
    """A scalar: one number and nothing else. A one by one type that holds inner data is a matrix of one entry."""
    return t['cols'] == 1 and t['rows'] == 1 and not inner_of(t)


def drawn_same(a, b):
    return a['cols'] == b['cols'] and a['rows'] == b['rows']


def same(a, b):
    """One size, inner lengths and all."""
    return drawn_same(a, b) and [x['length'] for x in inner_of(a)] == [x['length'] for x in inner_of(b)]


def alike(a, b):
    return same(a, b) and a['colsName'] == b['colsName'] and a['rowsName'] == b['rowsName'] and [x['name'] for x in inner_of(a)] == [x['name'] for x in inner_of(b)]


def nested(a, b, strict=False):
    """Two lists of inner axes that are to be one (algebra.js: nested): what they come to, or None where they do not
    agree. strict: one with none against one with some does not agree."""
    if not a and not b:
        return []
    if not strict and (not a or not b):
        return a or b
    if len(a) != len(b):
        return None
    for x, y in zip(a, b):
        if x['name'] and y['name'] and x['name'] != y['name']:
            return None
    for x, y in zip(a, b):
        if x['length'] != y['length']:
            return None
    return [{'length': x['length'], 'name': x['name'] or y['name'] or None} for x, y in zip(a, b)]


def agreed(lists):
    """What several lists of axes come to where all of them have to be the same (the parts of one matrix), or None."""
    inner = lists[0]
    for other in lists[1:]:
        inner = nested(inner, other, True)
        if inner is None:
            return None
    return inner


def named_fits(t, out):
    """A matrix a formula names beside x: the output's own size, inner data and all; or its drawn size with no inner data; or a scalar."""
    return one(t) or (drawn_same(t, out) and (not inner_of(t) or same(t, out)))


def covers(types, at, cols, rows):
    """Parts at their places: whether they cover a cols by rows rectangle exactly, with no gap and no overlap."""
    if not isinstance(at, list) or len(at) != len(types):
        return False
    area = 0
    for i, (a, t) in enumerate(zip(at, types)):
        if not is_obj(a) or not is_int(a.get('col')) or not is_int(a.get('row')) or a['col'] < 0 or a['row'] < 0 or a['col'] + t['cols'] > cols or a['row'] + t['rows'] > rows:
            return False
        for b, u in zip(at[:i], types[:i]):
            if a['col'] < b['col'] + u['cols'] and b['col'] < a['col'] + t['cols'] and a['row'] < b['row'] + u['rows'] and b['row'] < a['row'] + t['rows']:
                return False
        area += t['cols'] * t['rows']
    return area == cols * rows


# what algebra.js says of two sides that have to be one side: whether they differ (two names that differ, or two lengths)
def differ(la, na, lb, nb):
    return bool(na and nb and na != nb) or la != lb


def together(a, b, broadcast):
    """Two types entry by entry (algebra.js: together): the type they come to, or None."""
    c = differ(a['cols'], a['colsName'], b['cols'], b['colsName'])
    r = differ(a['rows'], a['rowsName'], b['rows'], b['rowsName'])
    ok = (not c and not r) or (broadcast and (one(a) or one(b) or (not c and (a['rows'] == 1 or b['rows'] == 1)) or (not r and (a['cols'] == 1 or b['cols'] == 1))))
    inner = nested(inner_of(a), inner_of(b), not broadcast)      # a sum never broadcasts: its inner data agrees exactly
    if not ok or inner is None:
        return None
    cols, rows = max(a['cols'], b['cols']), max(a['rows'], b['rows'])
    return T(cols, rows, (a['cols'] == cols and a['colsName']) or (b['cols'] == cols and b['colsName']) or None,
             (a['rows'] == rows and a['rowsName']) or (b['rows'] == rows and b['rowsName']) or None, inner)


def broadcast_of(a, b):
    return 'none' if drawn_same(a, b) else 'scalar' if one(a) or one(b) else 'row' if a['cols'] == b['cols'] else 'col'


# ---- arrows: the part of an input a run covers (arrows.js) ----
def run_of(n, k):
    return {'side': 'e' if n['axis'] == 'rows' else 's', 'start': n['start'] + (k - 1) * n['span'], 'span': n['span']}


def covered(arrow, size):
    rows = arrow['side'] in ('e', 'w')
    length = size['rows'] if rows else size['cols']
    if not whole1(arrow['start']) or not whole1(arrow['span']) or arrow['start'] + arrow['span'] - 1 > length:
        return None
    if rows:
        return {'col': 0, 'row': as_int(arrow['start']) - 1, 'cols': size['cols'], 'rows': as_int(arrow['span'])}
    return {'col': as_int(arrow['start']) - 1, 'row': 0, 'cols': as_int(arrow['span']), 'rows': size['rows']}


def covered_type(arrow, t):
    part = covered(arrow, t)
    if not part:
        return None
    return T(part['cols'], part['rows'], t['colsName'] if part['cols'] == t['cols'] else None, t['rowsName'] if part['rows'] == t['rows'] else None, inner_of(t))


# ---- values as the graph writes them ----
def isqrt_exact(n):
    r = math.isqrt(n)
    return r if r * r == n else None


def ok_exact(v):
    """An exact value in its one form: n over d under k square roots, lowest terms, d left out where 1, as few roots as it needs, and not a whole number."""
    n, k, d = v.get('n'), v.get('k'), v.get('d', MISSING)
    if not is_safe(n) or not is_int(k) or k < 0 or k > ROOTS or not (d is MISSING or (is_safe(d) and d >= 1)):
        return False
    p, q, k = int(n), 1 if d is MISSING else int(d), int(k)
    if p == 0:
        return False
    g = math.gcd(p, q)
    p, q = p // g, q // g
    while k > 0:
        a, b = isqrt_exact(abs(p)), isqrt_exact(q)
        if a is None or b is None:
            break
        p, q, k = (-a if p < 0 else a), b, k - 1
    if k == 0 and q == 1:
        return False
    form = {'n': p, 'k': k} if q == 1 else {'n': p, 'd': q, 'k': k}
    return len(v) == len(form) and all(key in v and is_num(v[key]) and v[key] == form[key] for key in form)


def ok_literal(v):
    if v == 'inf' or v == '-inf':
        return isinstance(v, str)
    if isinstance(v, bool):
        return True
    if isinstance(v, (int, float)):
        return is_safe(v)
    if not is_obj(v):
        return False
    if 'n' in v or 'k' in v:
        return ok_exact(v)
    if v.get('none') is True:
        return len(v) == 1      # None: a value like any other
    return isinstance(v.get('sym'), str) and bool(v['sym']) and len(v) == 1 and not spells(v['sym'])


SYM_NAME = re.compile(r'[A-Za-z_][\w.]*', re.ASCII)


def spells(text):
    """Whether a symbolic value's text spells None or an infinity, each of which has its one form of its own: such
    text is no literal (graph.js: spells). Read as arithmetic it would come to a number that it is not."""
    return '∅' in text or '∞' in text or any(name.lower() in ('none', 'inf', 'infinity') for name in SYM_NAME.findall(text))


def ok_error_value(v):
    return is_obj(v) and isinstance(v.get('err'), str) and len(v) == 1


def ok_err(e, codes):
    return is_obj(e) and isinstance(e.get('code'), str) and e['code'] in codes and isinstance(e.get('note'), str) and len(e) == 2


def ok_at(a):
    return is_obj(a) and is_int(a.get('col')) and is_int(a.get('row'))


def ok_places(n):
    return isinstance(n.get('at'), list) and len(n['at']) == len(n['inputs']) and all(ok_at(a) for a in n['at'])


def ok_range(r):
    return is_obj(r) and all(is_int(r.get(k)) and r[k] >= 0 for k in ('col', 'row')) and whole1(r.get('cols')) and whole1(r.get('rows'))


def reads_index(n):
    """Whether a node of its own accord differs from cell to cell (graph.js: readsIndex)."""
    op = n.get('op')
    if op == 'variable' and n.get('defined') == 'entries' and is_obj(n.get('entries')):
        return any(is_obj(v) and isinstance(v.get('expr'), str) and text_reads_index(v['expr']) for v in n['entries'].values())
    if op == 'map':
        return text_reads_index(n.get('formula'))
    if op == 'mapalong':
        return isinstance(n.get('through'), list) and len(n['through']) > 0
    return op == 'noise'


# ---- the operations: for each, how many inputs, what is wrong with its own fields, and its type from its inputs' ----
UNHELD = 'its formula is one the graph cannot hold: it does not read, or names what is not an input'


def fn_fits(n, g, given):
    f = g['fn'](n['fn'])
    p = g['node'](f['input']) if f else None
    b = g['node'](f['body']) if f else None
    if not f or not p or not b:
        return 'its function is not in the graph'
    if not drawn_same(p['type'], given):
        return 'its input is %s × %s and the function takes %s × %s' % (given['cols'], given['rows'], p['type']['cols'], p['type']['rows'])
    pi, gi = inner_of(p['type']), inner_of(given)
    if pi:      # its input block holds inner data: what is given holds the same, and it is applied once
        return b['type'] if nested(pi, gi, True) is not None else "its input's inner data is not what the function takes"
    if not gi:
        return b['type']
    if inner_of(b['type']):      # run at each inner position, the result takes those axes: so it may come to none of its own
        return 'its function is run at each inner position of its input, and comes to inner data of its own'
    return T(b['type']['cols'], b['type']['rows'], b['type']['colsName'], b['type']['rowsName'], gi)


def fn_whole(n, g):
    """Whether a function is handed its input whole, inner data and all: its input block holds inner data."""
    f = g['fn'](n['fn']) if 'fn' in n else None
    p = g['node'](f['input']) if f else None
    return bool(p) and len(inner_of(p['type'])) > 0


def ok_entry_key(key, t):
    """A column and a row, and one more number for each inner axis, each within its length."""
    p = key.split(',')
    if len(p) < 2 or not all(PLACE.fullmatch(x) for x in p):
        return False
    if t is None:
        return True
    ax = axes(t)
    return len(p) == len(ax) and all(len(x) <= 9 and int(x) <= a['length'] for x, a in zip(p, ax))      # (a side is far below nine digits long)


def variable_fields(n):
    bad = []
    if not isinstance(n.get('name'), str):
        bad.append('name is not text')
    if not isinstance(n.get('named'), bool):
        bad.append('named is not true or false')
    if not isinstance(n.get('defined'), str) or n['defined'] not in DEFINED:
        bad.append('defined is "%s"' % (n.get('defined'),))
    if 'error' in n and not ok_err(n['error'], CODES):
        bad.append('its error is not { code, note }')
    if 'holds' in n and S.parse(n['holds']) is None:
        bad.append('holds is no number space')
    if 'error' in n and n.get('defined') != 'entries':
        bad.append('a variable with an error is "entries": it keeps what was typed into it')
    if n.get('defined') != 'entries' and len(n['inputs']) != 1:
        bad.append('defined "%s" takes exactly one input' % (n.get('defined'),))
    if not is_obj(n.get('entries')):
        return bad + ['entries is not an object']
    typed = ok_type(n.get('type'))
    for key, v in n['entries'].items():
        if not ok_entry_key(key, n['type'] if typed else None):
            bad.append('entry %s is not an entry of it' % key)
        elif is_obj(v) and 'expr' in v:
            if n.get('defined') != 'entries' or len(v) != 1 or not formula_ok(v['expr'], len(n['inputs'])):
                bad.append('entry %s holds a formula the graph cannot hold: it does not read, or names what is not an input' % key)
        elif not ok_literal(v) and not ok_error_value(v):
            bad.append('entry %s holds no value in its stated form' % key)
    return bad


HELD_APART = 'a matrix its formula names holds inner data that is not its own'


def variable_type(n, ins, g):
    if not ok_type(n.get('type')):
        return 'it has no size of its own'
    if n['defined'] == 'entries' or not ins:
        for i in ins:      # what an entry's formula names: inner data only where it is the variable's own size, inner data and all
            if inner_of(i['type']) and not same(i['type'], n['type']):
                return HELD_APART
        return n['type']
    t = ins[0]['type']
    kinds = {'measure': ('measure',), 'standing': ('block', 'stack'), 'joined': ('block',), 'source': ('source', 'map', 'noise'), 'entry': ('entry',)}
    if n['defined'] in kinds and ins[0]['op'] not in kinds[n['defined']]:
        return 'defined "%s" over a %s' % (n['defined'], ins[0]['op'])
    if not same(t, n['type']):
        return 'what defines it is %s × %s and it is %s × %s' % (t['cols'], t['rows'], n['type']['cols'], n['type']['rows'])
    if n['defined'] == 'definition':
        for k in ('colsName', 'rowsName'):
            if t[k] and n['type'][k] and t[k] != n['type'][k]:
                return "its definition's side is %s and its own is %s" % (t[k], n['type'][k])
        if nested(inner_of(t), inner_of(n['type']), True) is None:
            return "its definition's inner data is not its own"
    return n['type']


def matmul_type(n, ins, g):
    a, b = ins[0]['type'], ins[1]['type']
    scalar = one(a) or one(b)
    why = 'a product of %s columns and %s rows' % (a['cols'], b['rows']) + (': a single entry against a matrix is a scale' if scalar else '')
    if a['cols'] != b['rows']:      # a single entry is no exception: against a single row or column it is a product, against anything else a scale, which is another node (graph.js says the same, in the same words)
        return why      # a type holds real lengths: sides that carry one name are still to be one length
    if not scalar and a['colsName'] and b['rowsName'] and a['colsName'] != b['rowsName']:
        return why
    # the first one's rows and the last one's columns; a single entry against a single row or column says nothing of the size
    inner = nested(inner_of(a), inner_of(b))      # one product at each inner position; an input with no inner data is used at every one
    if inner is None:
        return 'a product of shapes whose inner data does not agree'
    solid = [t for t in (a, b) if not one(t)] or [a, b]
    return T(solid[-1]['cols'], solid[0]['rows'], solid[-1]['colsName'], solid[0]['rowsName'], inner)


def add_type(n, ins, g):
    t = ins[0]['type']
    acc = T(t['cols'], t['rows'], t['colsName'], t['rowsName'], inner_of(t))
    for before, i in zip(ins, ins[1:]):
        if not together(before['type'], i['type'], False):      # each touch on its own, and then against what came before it
            return 'a sum of shapes that are not one size'
        acc = together(acc, i['type'], False)
        if not acc:
            return 'a sum of shapes that are not one size'
    return acc


def ewise_type(n, ins, g):
    a, b = ins[0]['type'], ins[1]['type']
    t = together(a, b, True)
    if not t:
        return 'sizes that do not agree entry by entry'
    if n['broadcast'] != broadcast_of(a, b):
        return 'broadcast is "%s" and its inputs make it "%s"' % (n['broadcast'], broadcast_of(a, b))
    return t


def block_type(n, ins, g):
    ts = [i['type'] for i in ins]
    cols = max(a['col'] + t['cols'] for a, t in zip(n['at'], ts))
    rows = max(a['row'] + t['rows'] for a, t in zip(n['at'], ts))
    if not covers(ts, n['at'], cols, rows):
        return 'its parts do not cover it exactly'
    inner = agreed([inner_of(t) for t in ts])
    if inner is None:
        return 'its parts do not hold the same inner data'
    first = next(t for a, t in zip(n['at'], ts) if a['col'] == 0 and a['row'] == 0)
    return T(cols, rows, first['colsName'] if first['cols'] == cols else None, first['rowsName'] if first['rows'] == rows else None, inner)


def slice_type(n, ins, g):
    a, r = ins[0]['type'], n['range']
    if r['col'] + r['cols'] > a['cols'] or r['row'] + r['rows'] > a['rows']:
        return 'its range runs past its input'
    return T(r['cols'], r['rows'], a['colsName'] if r['cols'] == a['cols'] else None, a['rowsName'] if r['rows'] == a['rows'] else None, inner_of(a))


def own_size(n, ins, g):
    if not ok_type(n.get('type')):
        return 'it has no size of its own'
    if n.get('kind') == 'file' and inner_of(n['type']):
        return 'a data file holds no inner data'
    return T(n['type']['cols'], n['type']['rows'], None, None, [{'length': a['length'], 'name': None} for a in inner_of(n['type'])])


def source_fields(n):
    if n.get('kind') == 'file':
        return [] if data_path(n.get('path')) else ['path is not a file under data/']
    if isinstance(n.get('kind'), str) and n['kind'] in KINDS:
        return ['only a file has a path'] if 'path' in n else []
    return ['kind is "%s"' % (n.get('kind'),)]


def noise_fields(n):
    return ([] if is_safe(n.get('seed')) else ['seed is not a whole number']) \
        + ([] if isinstance(n.get('dist'), str) and n['dist'] in DISTS else ['dist is "%s"' % (n.get('dist'),)]) \
        + ([] if isinstance(n.get('key'), str) and n['key'] else ['key is not a block id'])


def measure_fields(n):
    if not isinstance(n.get('side'), str) or not SIDE.fullmatch(n['side']):
        return ['side is "%s"' % (n.get('side'),)]
    if n['side'] != 'a':
        return ['a side or a mass is read off one input'] if len(n['inputs']) != 1 else ['only an attribute has a name and a formula'] if 'name' in n or 'formula' in n else []
    return ([] if isinstance(n.get('name'), str) and n['name'] else ['an attribute has a name']) \
        + ([] if formula_ok(n.get('formula'), len(n['inputs']) - 1, empty=True) else [UNHELD])


def measure_type(n, ins, g):
    if n['side'] == 'm' and not one(ins[0]['type']):
        return 'only a single number has a mass'
    if n['side'][0] == 'd' and int(n['side'][1:]) > len(inner_of(ins[0]['type'])):
        return 'its input has no inner axis %s' % n['side'][1:]
    if n['side'] == 'a' and any(inner_of(i['type']) for i in ins[1:]):      # an attribute is one number: its formula names no matrix that holds inner data
        return HELD_APART
    return T(1, 1)


def map_type(n, ins, g):
    x = ins[0]['type']
    for i in ins[1:]:
        if not named_fits(i['type'], x):
            return 'a matrix its formula names is not the size of the output'
    return T(x['cols'], x['rows'], x['colsName'], x['rowsName'], inner_of(x))


def apply_type(n, ins, g):
    t = fn_fits(n, g, ins[0]['type'])
    return t if isinstance(t, str) else T(t['cols'], t['rows'], t['colsName'], t['rowsName'], inner_of(t))


def repeat_fields(n):
    p = n.get('pattern')
    return ([] if ok_places(n) else ['at is not one { col, row } for each input']) \
        + ([] if is_obj(p) and whole1(p.get('cols')) and whole1(p.get('rows')) else ['pattern is not { cols, rows }']) \
        + ([] if whole1(n.get('across')) and whole1(n.get('down')) else ['across and down are whole numbers, at least 1'])


def repeat_type(n, ins, g):
    p = n['pattern']
    if not covers([i['type'] for i in ins], n['at'], p['cols'], p['rows']):
        return 'its inputs do not cover its pattern exactly'
    inner = agreed([inner_of(i['type']) for i in ins])
    if inner is None:
        return 'its inputs do not hold the same inner data'
    return T(p['cols'] * n['across'], p['rows'] * n['down'], None, None, inner)


def ok_through(v):
    return isinstance(v, list) and len(v) > 0 and all(is_obj(t) and isinstance(t.get('tile'), str) and t['tile'].startswith('t:') and whole1(t.get('count')) and t['count'] > 1 for t in v)


def mapalong_fields(n):
    bad = []
    if ('fn' in n) == ('formula' in n):
        bad.append('it has exactly one of fn and formula')
    if 'fn' in n and (not isinstance(n['fn'], str) or len(n['inputs']) != 1):
        bad.append('fn is a function id, and takes the one input')
    if 'formula' in n and not formula_ok(n['formula'], len(n['inputs']) - 1, arrow=True):
        bad.append(UNHELD)
    if n.get('axis') not in ('rows', 'cols') or not isinstance(n.get('axis'), str):
        bad.append('axis is "%s"' % (n.get('axis'),))
    if not all(whole1(n.get(k)) for k in ('start', 'span', 'count')):
        bad.append('start, span and count are whole numbers, at least 1')
    if 'at' in n and not ok_at(n['at']):
        bad.append('at is not { col, row }')
    if 'through' in n and not ok_through(n['through']):
        bad.append('through is not a list of { tile, count } with counts of 2 or more')
    return bad


def mapalong_type(n, ins, g):
    x = ins[0]['type']
    runs = n['count']
    for t in n.get('through', ()):
        runs *= t['count']
    part = covered_type(run_of(n, runs), x) and covered_type(run_of(n, 1), x)      # the last run of the last cell has to be inside its input too
    if not part:
        return 'its last run is past its input'
    came = part
    if 'fn' in n:
        came = fn_fits(n, g, part)
        if isinstance(came, str):
            return came
    else:
        for i in ins[1:]:
            if not named_fits(i['type'], part):
                return 'a matrix its formula names is not the size of one output'
    if n['count'] == 1:
        return T(came['cols'], came['rows'], came['colsName'], came['rowsName'], inner_of(came))
    if n['axis'] == 'rows':
        return T(came['cols'], came['rows'] * n['count'], came['colsName'], None, inner_of(came))
    return T(came['cols'] * n['count'], came['rows'], None, came['rowsName'], inner_of(came))


def transpose_fields(n):
    if 'order' not in n:
        return []
    o = n['order']
    ok = isinstance(o, list) and 3 <= len(o) <= AXES + 2 and all(is_int(i) and 0 <= i < len(o) for i in o) and len(set(o)) == len(o)
    return [] if ok else ['order is not its axes, each once, counted from 0']


def transpose_type(n, ins, g):
    """With no order it swaps the two drawn sides. order names every axis of the input: axis k of the result is axis order[k] of the input."""
    a = ins[0]['type']
    if 'order' not in n:
        return T(a['rows'], a['cols'], a['rowsName'], a['colsName'], inner_of(a))
    ax, o = axes(a), [int(i) for i in n['order']]
    if len(o) != len(ax):
        return 'order names %d axes and its input has %d' % (len(o), len(ax))
    if all(i == k + 2 for k, i in enumerate(o[2:])):
        return 'order moves no inner axis: that is no turn, or a transpose with no order'      # one spelling
    to = [ax[i] for i in o]
    return T(to[0]['length'], to[1]['length'], to[0]['name'], to[1]['name'], to[2:])


def stack_fields(n):
    ok = ok_places(n) and all(a['col'] >= 0 and a['row'] >= 0 and len(a) == 2 for a in n['at'])
    return [] if ok else ['at is not one { col, row } for each part, from 0']


def stack_type(n, ins, g):
    """Matrices put into the entries of one: one part to an entry, all of one size and holding the same. Its inner
    axes are the parts' two drawn sides, then the parts' own."""
    ts = [i['type'] for i in ins]
    cols, rows = max(a['col'] for a in n['at']) + 1, max(a['row'] for a in n['at']) + 1
    if len(ts) != cols * rows or len(set((a['col'], a['row']) for a in n['at'])) != len(ts):
        return 'its parts do not cover its entries, one part to an entry'
    inner = agreed([axes(t) for t in ts])
    if inner is None:
        return 'its parts are not one size, holding the same inner data'
    if len(inner) > AXES:
        return 'it would have %d inner axes: there are at most %d' % (len(inner), AXES)
    return T(cols, rows, None, None, inner)


def entry_fields(n):
    a = n.get('at')
    ok = is_obj(a) and is_int(a.get('col')) and is_int(a.get('row')) and a['col'] >= 0 and a['row'] >= 0 and len(a) == 2
    return [] if ok else ['at is not { col, row }, from 0']


def entry_type(n, ins, g):
    """One entry taken out: its drawn sides are the input's first two inner axes (one: that many columns in one row)."""
    a = ins[0]['type']
    inner = inner_of(a)
    if not inner:
        return 'its input holds no inner data: an entry of it is one number'
    if n['at']['col'] >= a['cols'] or n['at']['row'] >= a['rows']:
        return 'its input has no such entry'
    second = inner[1] if len(inner) > 1 else {'length': 1, 'name': None}
    return T(inner[0]['length'], second['length'], inner[0]['name'], second['name'], inner[2:])


def none(n):
    return []


INF = math.inf
RULES = {
    'variable': {'inputs': (0, INF), 'fields': variable_fields, 'type': variable_type, 'space': variable_space},
    'matmul': {'inputs': (2, 2), 'fields': none, 'type': matmul_type, 'space': lambda n, ins, g: S.product(value_of(ins[0]), value_of(ins[1]), ins[0]['type']['cols'])},
    'scale': {'inputs': (2, 2), 'fields': none, 'space': lambda n, ins, g: S.binary('*', value_of(ins[0]), value_of(ins[1])), 'type': lambda n, ins, g: T(ins[1]['type']['cols'], ins[1]['type']['rows'], ins[1]['type']['colsName'], ins[1]['type']['rowsName'], inner_of(ins[1]['type'])) if one(ins[0]['type']) else 'the first input of a scale is a single number'},
    'transpose': {'inputs': (1, 1), 'fields': transpose_fields, 'type': transpose_type, 'space': lambda n, ins, g: value_of(ins[0])},
    'add': {'inputs': (2, INF), 'fields': none, 'type': add_type, 'space': sum_space},
    'ewise': {'inputs': (2, 2), 'type': ewise_type, 'space': lambda n, ins, g: S.binary('/' if n['fn'] == 'div' else '*', value_of(ins[0]), value_of(ins[1])),
              'fields': lambda n: ([] if n.get('fn') in ('mul', 'div') and isinstance(n['fn'], str) else ['fn is "%s"' % (n.get('fn'),)])
              + ([] if isinstance(n.get('broadcast'), str) and n['broadcast'] in ('none', 'scalar', 'row', 'col') else ['broadcast is "%s"' % (n.get('broadcast'),)])},
    'block': {'inputs': (1, INF), 'fields': lambda n: [] if ok_places(n) else ['at is not one { col, row } for each part'], 'type': block_type, 'space': lambda n, ins, g: all_of(ins)},
    'slice': {'inputs': (1, 1), 'fields': lambda n: [] if ok_range(n.get('range')) and len(n['range']) == 4 else ['range is not { col, row, cols, rows }'], 'type': slice_type, 'space': lambda n, ins, g: value_of(ins[0])},
    'source': {'inputs': (0, 0), 'fields': source_fields, 'type': own_size, 'space': lambda n, ins, g: 'real' if n['kind'] == 'file' else 'boolean'},
    'noise': {'inputs': (0, 0), 'fields': noise_fields, 'type': lambda n, ins, g: own_size(dict(n, kind=None), ins, g), 'space': lambda n, ins, g: 'probability' if n['dist'] == 'uniform' else 'real'},
    'measure': {'inputs': (1, INF), 'fields': measure_fields, 'type': measure_type, 'space': measure_space},
    'map': {'inputs': (1, INF), 'fields': lambda n: [] if formula_ok(n.get('formula'), len(n['inputs']) - 1, arrow=True) else [UNHELD], 'type': map_type, 'space': lambda n, ins, g: space_in(n['formula'], ins, 1, value_of(ins[0]))},
    'apply': {'inputs': (1, 1), 'fields': lambda n: [] if isinstance(n.get('fn'), str) else ['fn is not a function id'], 'type': apply_type, 'space': lambda n, ins, g: body_of(n, g, ins[0])},
    'param': {'inputs': (0, 0), 'fields': none, 'type': lambda n, ins, g: n['type'] if ok_type(n.get('type')) else 'it has no size of its own', 'space': lambda n, ins, g: value_of(n)},
    'repeat': {'inputs': (1, INF), 'fields': repeat_fields, 'type': repeat_type, 'space': lambda n, ins, g: all_of(ins)},
    'mapalong': {'inputs': (1, INF), 'fields': mapalong_fields, 'type': mapalong_type, 'space': lambda n, ins, g: body_of(n, g, ins[0]) if 'fn' in n else space_in(n['formula'], ins, 1, value_of(ins[0]))},
    'stack': {'inputs': (1, INF), 'fields': stack_fields, 'type': stack_type, 'space': lambda n, ins, g: all_of(ins)},
    'entry': {'inputs': (1, 1), 'fields': entry_fields, 'type': entry_type, 'space': lambda n, ins, g: value_of(ins[0])},
}


def applies(n):
    return n.get('op') in ('apply', 'mapalong') and 'fn' in n


def functions_of(within):
    return [w for w in (within if isinstance(within, list) else []) if isinstance(w, str) and w.startswith('f:')]


def scopes(n, ins, fn):
    """The functions a node belongs to: those whose input its value follows (graph.js: scopes)."""
    if n['op'] == 'param':
        return functions_of(n.get('within'))[-1:]
    out = set()
    for i in ins:
        out.update(functions_of(i.get('within')))
    if applies(n):
        f = fn(n['fn'])
        for w in functions_of(f.get('within') if f else None):
            if w != n['fn']:
                out.add(w)
    return sorted(out)


def tiles_of(node_of, spaces, blocks):
    """The tiles each node belongs to (graph.js: tilesOf): node id -> the set of its tiles ("t:<id>")."""
    follows = {}

    def cellular(start):      # whether its value follows the cell it is worked out in; walked with a list of its own
        todo = [start]
        while todo:
            i = todo[-1]
            if i in follows:
                todo.pop()
                continue
            n = node_of(i)
            if not n:
                follows[i] = False
            elif reads_index(n):
                follows[i] = True
            else:
                waiting = [k for k in n['inputs'] if isinstance(k, str) and k not in follows and k not in todo]
                if waiting:
                    todo.extend(waiting)
                    continue
                follows[i] = any(follows.get(k, False) for k in n['inputs'] if isinstance(k, str))
            todo.pop()
        return follows[start]

    out = {}
    arr = lambda v: v if isinstance(v, list) else []
    for s in spaces.values():
        for t in arr(s.get('tiles')) if is_obj(s) else []:
            if not is_obj(t) or not isinstance(t.get('tile'), str):
                continue
            inside = set(b for b in arr(t.get('blocks')) if isinstance(b, str))
            arrows = set(a for a in arr(t.get('arrows')) if isinstance(a, str))
            roots = [blocks[b] for b in inside if b in blocks]
            for p in arr(s.get('pieces')):
                if is_obj(p) and p.get('node') and isinstance(p.get('blocks'), list) and all(isinstance(b, str) and b in inside for b in p['blocks']):
                    roots.append(p['node'])
            for a in arr(s.get('arrows')):
                if is_obj(a) and a.get('node') and isinstance(a.get('arrow'), str) and a['arrow'] in arrows:
                    roots.append(a['node'])
            whole = node_of(t['node']) if isinstance(t.get('node'), str) else None
            if whole:
                roots.extend(whole['inputs'])
            seen, todo = set(), list(roots)
            while todo:
                i = todo.pop()
                if not isinstance(i, str) or i in seen:
                    continue
                seen.add(i)
                n = node_of(i)
                if not n:
                    continue
                if cellular(i):
                    out.setdefault(i, set()).add(t['tile'])
                todo.extend(n['inputs'])
    return out


def json_safe(value):
    """Nothing JSON cannot hold, and nothing deeper than validate reads. Walked with a list of its own."""
    todo = [(value, 0)]
    while todo:
        v, deep = todo.pop()
        if deep >= MAX_JSON_DEPTH:
            return False
        if v is None or isinstance(v, (str, bool)):
            continue
        if isinstance(v, (int, float)):
            if (isinstance(v, float) and not math.isfinite(v)) or (isinstance(v, int) and abs(v) > BIGGEST):      # (JSON read in JavaScript makes such a number an infinity, which no graph holds)
                return False
        elif isinstance(v, dict):
            if any(not isinstance(k, str) for k in v):
                return False
            todo.extend((x, deep + 1) for x in v.values())
        elif isinstance(v, list):
            todo.extend((x, deep + 1) for x in v)
        else:
            return False
    return True


def validate(graph):
    try:
        return check(graph)
    except Exception as e:      # whatever it is handed, it answers with what is wrong
        return ['it could not be checked: %s' % (str(e) or type(e).__name__)]


def version_for(n):
    """The version a node needs for what it holds (graph.js: versionFor): None among its entries, a number space or a
    promise need 3; inner data, a stack, an entry and a transpose's order need 2. -> (version, what), or None."""
    if 'value' in n['type']:
        return (3, 'a number space')
    if 'holds' in n:
        return (3, 'a promise')
    if n['op'] == 'variable' and is_obj(n.get('entries')) and any(is_obj(v) and v.get('none') is True for v in n['entries'].values()):
        return (3, 'None')
    if 'inner' in n['type'] or n['op'] in ('stack', 'entry') or (n['op'] == 'transpose' and 'order' in n):
        return (2, 'inner data')
    return None


def check(graph):
    bad = []
    if not is_obj(graph):
        return ['it is not a graph']
    if not is_num(graph.get('version')) or graph['version'] not in VERSIONS:
        bad.append('version is %s, not %s' % (graph.get('version'), VERSION))
    for k in ('nodes', 'functions', 'spaces', 'blocks'):
        if not is_obj(graph.get(k)):
            return bad + ['%s is not an object' % k]
    if not json_safe(graph):
        return bad + ['it holds something JSON cannot, or lies more than %d deep' % MAX_JSON_DEPTH]
    nodes, functions = graph['nodes'], graph['functions']
    has = lambda i: isinstance(i, str) and is_obj(nodes.get(i))
    # each node on its own
    sound = set()
    for i, n in nodes.items():
        if not is_obj(n):
            bad.append('%s: it is not a node' % i)
            continue
        rule = RULES.get(n['op']) if isinstance(n.get('op'), str) else None
        if not rule:
            bad.append('%s: "%s" is no operation' % (i, n.get('op')))
            continue
        ins = n.get('inputs')
        if not isinstance(ins, list) or len(ins) < rule['inputs'][0] or len(ins) > rule['inputs'][1]:
            bad.append('%s: %s does not take %s inputs' % (i, n['op'], len(ins) if isinstance(ins, list) else 'no'))
            continue
        gone = [k for k in ins if not has(k)]
        if gone:
            bad.append('%s: its input %s is not in the graph' % (i, gone[0]))
            continue
        if not ok_type(n.get('type')):
            bad.append('%s: its type is not { cols, rows, colsName, rowsName }, with inner, a list of 1 to %d of { length, name }, where it holds inner data, and value, one of the ten number spaces (with ? after it where None is admitted), where its space is said' % (i, AXES))
            continue
        need = version_for(n) if is_num(graph.get('version')) and graph['version'] in VERSIONS else None
        if need and need[0] > graph['version']:
            bad.append('%s: it holds %s, which needs version %d, and the graph says version %s' % (i, need[1], need[0], graph['version']))
            continue
        w = n.get('within', MISSING)
        if w is not MISSING and not (isinstance(w, list) and w and all(isinstance(x, str) and x[:2] in ('f:', 't:') for x in w) and len(set(w)) == len(w)):
            bad.append('%s: within is not a list of functions and tiles' % i)
            continue
        wrong = rule['fields'](n)
        if wrong:
            bad.extend('%s: %s' % (i, x) for x in wrong)
            continue
        sound.add(i)
    # functions: each has its input and its body, and every input has its function
    fn_ok = lambda f: isinstance(f, str) and is_obj(functions.get(f)) and has(functions[f].get('input')) and has(functions[f].get('body'))
    input_of = {}
    for fid, f in functions.items():
        if not fn_ok(fid):
            bad.append('function %s: its input or its body is not in the graph' % fid)
        elif nodes[f['input']].get('op') != 'param':
            bad.append('function %s: its input is not a param' % fid)
        elif functions_of(nodes[f['input']].get('within'))[-1:] != [fid]:
            bad.append('function %s: its input does not belong to it' % fid)
        else:
            input_of[f['input']] = fid
    for i in sound:
        if nodes[i]['op'] == 'param' and i not in input_of:
            bad.append("%s: a function's input with no function" % i)

    # no cycles, through inputs or through the functions nodes apply
    def following(i):
        n = nodes[i]
        out = [k for k in n['inputs'] if has(k)] if isinstance(n.get('inputs'), list) else []
        if applies(n) and fn_ok(n['fn']):
            out.append(functions[n['fn']]['body'])
        return out

    state, after, cyclic = {}, [], False
    for start in nodes:
        if not has(start) or start in state:
            continue
        todo = [[start, following(start), 0]]
        state[start] = 1
        while todo:
            top = todo[-1]
            if top[2] < len(top[1]):
                k = top[1][top[2]]
                top[2] += 1
                if state.get(k) == 1:
                    cyclic = True
                elif k not in state:
                    state[k] = 1
                    todo.append([k, following(k), 0])
            else:
                state[top[0]] = 2
                after.append(top[0])
                todo.pop()
    if cyclic:
        return bad + ['the nodes form a cycle']
    # every type follows from its inputs by its operation's rule; every node is marked with the functions it belongs to
    g = {'node': lambda i: nodes[i] if has(i) else None,
         'fn': lambda f: dict(functions[f], within=nodes[functions[f]['body']].get('within') or []) if fn_ok(f) else None}
    typed = set()
    for i in after:
        if i not in sound:
            continue
        n = nodes[i]
        ins = [nodes[k] for k in n['inputs']]
        if any(k not in typed for k in n['inputs']):
            bad.append('%s: an input of it is not well formed' % i)
            continue
        if applies(n) and not (fn_ok(n['fn']) and functions[n['fn']]['body'] in typed and functions[n['fn']]['input'] in typed):
            bad.append('%s: its function %s is not in the graph' % (i, n['fn']))
            continue
        t = RULES[n['op']]['type'](n, ins, g)
        if isinstance(t, str):
            bad.append('%s: %s' % (i, t))
            continue
        if not alike(t, n['type']):
            said = lambda u: '%s (%s)' % (' × '.join(str(x['length']) for x in axes(u)), ', '.join(str(x['name']) for x in axes(u)))
            bad.append('%s: its type is %s and its inputs give %s' % (i, said(n['type']), said(t)))
            continue
        if 'value' in n['type'] and n['type']['value'] != RULES[n['op']]['space'](n, ins, g):      # its number space follows by its operation's rule too
            bad.append('%s: its value is %s and its inputs give %s' % (i, n['type']['value'], RULES[n['op']]['space'](n, ins, g)))
            continue
        typed.add(i)
        want, got = scopes(n, ins, g['fn']), sorted(functions_of(n.get('within')))
        if (len(got) != 1) if n['op'] == 'param' else (want != got):
            bad.append('%s: within names the functions %s and it belongs to %s' % (i, ', '.join(got) or 'none', ', '.join(want) or 'none'))
    # spaces and blocks
    for b, i in graph['blocks'].items():
        if not has(i):
            bad.append('block %s: its node %s is not in the graph' % (b, i))
    repeats = set()
    for key, s in graph['spaces'].items():
        if not is_obj(s) or 'owner' not in s or not (s['owner'] is None or has(s['owner'])) or not all(isinstance(s.get(k), list) for k in ('pieces', 'arrows', 'tiles')):
            bad.append('space %s: it is not { owner, pieces, arrows, tiles }' % key)
            continue
        either = lambda x, codes: ok_err(x.get('error'), codes) if x.get('node', MISSING) is None else (has(x.get('node')) and 'error' in x and x['error'] is None)
        for k, p in enumerate(s['pieces']):
            at = 'space %s, piece %d: ' % (key, k + 1)
            if not is_obj(p) or not isinstance(p.get('blocks'), list) or not p['blocks'] or any(not isinstance(b, str) for b in p['blocks']):
                bad.append(at + 'it names no blocks')
                continue
            rule = p.get('rule', MISSING)
            if not (rule is None or (isinstance(rule, str) and rule in ('product', 'sum', 'elementwise', 'mixed'))):
                bad.append(at + 'its rule is "%s"' % (rule,))
            if not either(p, PIECE_CODES):
                bad.append(at + 'it has either a node or an error, one of them')
        for k, a in enumerate(s['arrows']):
            at = 'space %s, arrow %d: ' % (key, k + 1)
            if not is_obj(a) or not isinstance(a.get('arrow'), str):
                bad.append(at + 'it names no arrow')
            elif not either(a, CODES):
                bad.append(at + 'it has either a node or an error, one of them')
        for k, t in enumerate(s['tiles']):
            at = 'space %s, tile %d: ' % (key, k + 1)
            if (not is_obj(t) or not isinstance(t.get('tile'), str) or not t['tile'].startswith('t:') or not isinstance(t.get('blocks'), list) or not isinstance(t.get('arrows'), list)
                    or any(not isinstance(b, str) for b in t['blocks'] + t['arrows'])):
                bad.append(at + 'it is not { tile, blocks, arrows, node, error }')
                continue
            if any(b not in graph['blocks'] for b in t['blocks']):
                bad.append(at + 'it names a block that takes no part')
            if not either(t, CODES) or (t.get('node') is not None and nodes[t['node']].get('op') != 'repeat'):
                bad.append(at + 'it has either a repeat for its node or an error, one of them')
            elif t.get('node'):
                repeats.add(t['node'])
    # every node is marked with the tiles it belongs to, exactly; and every repeat is some tile's matrix
    for i in typed:
        if nodes[i]['op'] == 'repeat' and i not in repeats:
            bad.append("%s: a repeat that is no tile's matrix: spaces names no tile for it" % i)
    marks = tiles_of(lambda i: nodes[i] if isinstance(i, str) and i in typed else None, graph['spaces'], graph['blocks'])
    for i in typed:
        want = sorted(marks.get(i, ()))
        got = sorted(w for w in nodes[i].get('within', []) if w.startswith('t:'))
        if want != got:
            bad.append('%s: within names the tiles %s and it belongs to %s' % (i, ', '.join(got) or 'none', ', '.join(want) or 'none'))
    return bad
