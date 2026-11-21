"""Number spaces: which numbers a shape may hold. spaces.js written again for the backend, from the same tables.

spaces.js is the reference and sets the ten spaces out: boolean, ternary, natural, whole, integer, rational,
probability, real, extended (the reals with ∞ and -∞) and any, written as the word with "?" after it where None is
admitted ("integer?"); and "none", the space of None alone, which is no number space and takes no "?". They are not
one chain; INSIDE says which lies directly inside which, and BINARY and UNARY hold one list of clauses for each
operation. Everything here is worked from those tables, as it is there, and backend/fixtures/spaces.json (made by
spaces.js) holds what they come to for every pair of spaces and every operation: tests/test_spaces.py holds this
file to it, so the two cannot drift apart.

    parse(text)             -> (space, none) for a word with or without its "?", else None; "none" is (None, True)
    inside(a, b)            -> whether the space a lies inside b (or is b)
    within(a, b)            -> the same of two written spaces, None and all
    both(a, b)              -> the space of both: the smallest listed space that holds the two, written
    of(value)               -> the smallest space a value of the graph lies in, written; None for what is no value
    of_all(values, more)    -> the space of them all; more: written spaces that are among them too
    binary(op, a, b), unary(fn, a), choice(a, b), total(a, count), product(a, b, terms)
    formula(tree, name)     -> of a formula, from its tree (formula.py: parse) and name(text) -> a written space,
                               or None for a name that is not known ("any?")

Only check.py asks this: a graph's values are checked as its sizes are. Nothing here is asked of the numbers a run
works out: whether a promise is kept by them is not the backend's to say yet."""
import math
import re

SPACES = ('boolean', 'ternary', 'natural', 'whole', 'integer', 'rational', 'probability', 'real', 'extended', 'any')
INSIDE = {'boolean': ('whole', 'ternary', 'probability'), 'ternary': ('integer',), 'natural': ('whole',), 'whole': ('integer',), 'integer': ('rational',),
          'rational': ('real',), 'probability': ('real',), 'real': ('extended',), 'extended': ('any',), 'any': ()}
B, T, N, W, Z, Q, P, R, X, A = SPACES      # X: extended, the reals with ∞ and -∞
BINARY = {
    '+': ((N, W, N), (W, N, N), (W, W, W), (Z, Z, Z), (Q, Q, Q), (R, R, R), (X, X, X)),
    '-': ((B, B, T), (Z, Z, Z), (Q, Q, Q), (R, R, R), (X, X, X)),
    '*': ((B, B, B), (T, T, T), (N, N, N), (W, W, W), (Z, Z, Z), (P, P, P), (Q, Q, Q), (R, R, R), (X, X, X)),
    '/': ((Q, Q, Q), (R, X, R), (X, X, X)),
    '^': ((B, N, B), (T, N, T), (N, N, N), (W, N, W), (Z, N, Z), (P, N, P), (Q, N, Q), (R, R, R), (X, X, X)),
}
UNARY = {
    'neg': ((B, T), (T, T), (Z, Z), (Q, Q), (R, R), (X, X)),
    'abs': ((T, B), (N, N), (Z, W), (P, P), (Q, Q), (R, R), (X, X)),
    'sqrt': ((B, B), (P, P), (R, R), (X, X)),
    'exp': ((R, R), (X, X)),
    'ln': ((N, R), (X, X)),
    'tanh': ((W, P), (P, P), (X, R)),
    'erf': ((W, P), (P, P), (X, R)),
}
COMPARES = ('==', '!=', '<', '>', '<=', '>=')
LOGIC = ('&&', '||')
ANY = 'any?'
NONE = 'none'


def _above():
    out = {}
    for s in SPACES:
        seen, todo = {s}, [s]
        while todo:
            for up in INSIDE[todo.pop()]:
                if up not in seen:
                    seen.add(up)
                    todo.append(up)
        out[s] = seen
    return out


ABOVE = _above()


def inside(a, b):
    return a in ABOVE and b in ABOVE[a]


def _joins():
    out = {}
    for a in SPACES:
        for b in SPACES:
            common = [s for s in SPACES if inside(a, s) and inside(b, s)]
            out[(a, b)] = next(s for s in common if all(inside(s, o) for o in common))
    return out


JOINS = _joins()
WORD = re.compile(r'([a-z]+)(\?)?', re.ASCII)
INT = re.compile(r'-?\d+', re.ASCII)
FRACTION = re.compile(r'(-?)(\d+)/(\d+)', re.ASCII)


def _join(a, b):
    """Inside, a space is (word or None, whether None is admitted): no word is no number at all."""
    return b if a is None else a if b is None else JOINS[(a, b)]


def parse(text):
    if isinstance(text, str) and text == NONE:
        return (None, True)
    m = WORD.fullmatch(text) if isinstance(text, str) else None
    return (m.group(1), bool(m.group(2))) if m and m.group(1) in SPACES else None


def _read(text):
    return parse(text) or (A, True)      # what is not written is not known: any, or None


def _write(s):
    return (NONE if s[1] else B) if s[0] is None else s[0] + ('?' if s[1] else '')


def within(a, b):
    x, y = parse(a), parse(b)
    return bool(x and y) and (x[0] is None or (y[0] is not None and inside(x[0], y[0]))) and (not x[1] or y[1])


def both(a, b):
    x, y = _read(a), _read(b)
    return _write((_join(x[0], y[0]), x[1] or y[1]))


def _wholes(n):
    """The spaces a whole number lies in. n: -2 for anything below -1, 2 for anything above 1."""
    return SPACES if n == 1 else (B, T, W, Z, Q, P, R, X, A) if n == 0 else (T, Z, Q, R, X, A) if n == -1 else (N, W, Z, Q, R, X, A) if n > 1 else (Z, Q, R, X, A)


def _clamp(n):
    return max(-2, min(2, int(n)))


def _sign_and_size(text):
    """A whole number written in digits, of any length, as _clamp gives it: -2, -1, 0, 1 or 2. Read from its digits
    and never made a number: Python refuses to read more than 4,300 digits as one, and spaces.js reads any."""
    digits = text.lstrip('-').lstrip('0')
    size = 0 if not digits else 1 if digits == '1' else 2
    return -size if text.startswith('-') else size


def _more(a, b):
    """Whether the whole number written a is more than the one written b: digits of any length, no sign."""
    a, b = a.lstrip('0'), b.lstrip('0')
    return (len(a), a) > (len(b), b)


def _is_int(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and not (isinstance(x, float) and (math.isinf(x) or math.isnan(x))) and x == int(x)


def _lies(v):
    """A value as the graph writes it, as (the spaces it lies in, whether it is None); None for what is no value.
    A value lies in several spaces at once (1 is boolean and natural): spaces.js says why that is kept."""
    if v is None:
        return None
    if isinstance(v, bool):
        return (SPACES, False)
    if v == 'inf' or v == '-inf':
        return ((X, A), False) if isinstance(v, str) else None
    if isinstance(v, (int, float)):
        if isinstance(v, float) and (math.isinf(v) or math.isnan(v)):
            return ((X, A), False) if math.isinf(v) else None
        return (_wholes(_clamp(v)), False) if v == int(v) else None
    if not isinstance(v, dict):
        return None
    if isinstance(v.get('err'), str):
        return None
    if v.get('none') is True:
        return (SPACES, True)
    n, k = v.get('n'), v.get('k')
    if _is_int(n) and _is_int(k):
        d = v['d'] if 'd' in v else 1
        unit = 0 <= n <= d
        if not k and d == 1:
            return (_wholes(_clamp(n)), False)
        return (((P, R, X, A) if unit else (R, X, A)) if k else (Q, P, R, X, A) if unit else (Q, R, X, A), False)
    if isinstance(v.get('sym'), str):
        text = v['sym']
        if INT.fullmatch(text):
            return (_wholes(_sign_and_size(text)), False)
        m = FRACTION.fullmatch(text)
        if m and m.group(3).strip('0'):
            return ((Q, P, R, X, A) if not m.group(1) and not _more(m.group(2), m.group(3)) else (Q, R, X, A), False)
        return ((R, X, A), False)
    return None


FIRST = (B, T, N, W, Z, P, Q, R, X, A)      # a smaller space before any it lies inside; and which of two smallest comes first (spaces.js)


def _smallest(values, more=()):
    held, none, number = list(FIRST), False, False
    for v in values:
        s = _lies(v)
        if s:
            held, none, number = [x for x in held if x in s[0]], none or s[1], number or not s[1]
    for w in more:
        s = _read(w)
        held, none, number = [x for x in held if s[0] is None or inside(s[0], x)], none or s[1], number or s[0] is not None
    return (held[0] if number or not none else None, none)      # None and no number among them: None alone


def _of(v):
    s = _lies(v)
    return None if s is None else (None, True) if s[1] else (next(x for x in FIRST if x in s[0]), False)


def of(v):
    s = _of(v)
    return None if s is None else _write(s)


def of_all(values, more=()):
    return _write(_smallest(values, more))


def _first(clauses, *xs):
    for c in clauses:
        if all(inside(x, c[i]) for i, x in enumerate(xs)):
            return c[len(xs)]
    return A


def _binary(op, a, b):
    if op in LOGIC or op in ('==', '!='):
        return (B, False)
    none = a[1] or b[1]
    if a[0] is None or b[0] is None:
        return (None, none)
    if op in COMPARES:
        return (B, none)
    if op in ('max', 'min'):
        return (_join(a[0], b[0]), none)
    return (_first(BINARY[op], a[0], b[0]) if op in BINARY else A, none)


def _unary(fn, a):
    if fn == '!':
        return (B, False)
    if a[0] is None:
        return (None, a[1])
    return (_first(UNARY[fn], a[0]) if fn in UNARY else A, a[1])


def _choice(a, b):
    return (_join(a[0], b[0]), a[1] or b[1])


def _total(a, count):
    s = a
    for _ in range(1, count):
        nxt = _binary('+', s, a)
        if nxt == s:
            break
        s = nxt
    return s


def binary(op, a, b):
    return _write(_binary(op, _read(a), _read(b)))


def unary(fn, a):
    return _write(_unary(fn, _read(a)))


def choice(a, b):
    return _write(_choice(_read(a), _read(b)))


def total(a, count):
    return _write(_total(_read(a), count))


def product(a, b, terms):
    return _write(_total(_binary('*', _read(a), _read(b)), terms))


WORDS = {'inf': (X, False), 'infinity': (X, False), 'true': (B, False), 'false': (B, False), 'none': (None, True)}


def _number(node):
    """A number written in a formula: one of more than 40 characters is real, whatever it is (spaces.js: formula)."""
    if len(node) > 3 and node[3]:
        return (R, False)
    if node[2] is None:
        return (X, False) if math.isinf(node[1]) else (R, False)
    f = node[2]
    return (next(x for x in FIRST if x in _wholes(_clamp(f.numerator))), False) if f.denominator == 1 else (P if 0 <= f <= 1 else Q, False)


def formula(tree, name=lambda text: None):
    out, todo = [], [(tree, False)]
    while todo:
        node, ready = todo.pop()
        kind = node[0]
        if kind == 'num':
            out.append(_number(node))
        elif kind == 'name':
            k = node[1].lower()
            out.append(WORDS[k] if k in WORDS else _read(name(node[1])))
        elif not ready:
            todo.append((node, True))
            for child in reversed((node[2], node[3]) if kind == 'op' else node[2]):
                todo.append((child, False))
        elif kind == 'op':
            b = out.pop()
            a = out.pop()
            out.append(_binary(node[1], a, b))
        else:
            n = len(node[2])
            args = out[len(out) - n:]
            del out[len(out) - n:]
            fn = 'ln' if node[1] == 'log' else node[1]
            out.append(_choice(args[1], args[2]) if fn == 'select' else _binary(fn, args[0], args[1]) if fn in ('max', 'min') else _unary(fn, args[0]))
    return _write(out[0])
