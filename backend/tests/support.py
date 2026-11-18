"""What the backend's tests share. Not a test itself (unittest looks for test_*.py).

Run them all from the repository's root with the backend's environment (README: The backend):
    backend/.venv/bin/python -B -m unittest discover -s backend/tests -t .
Under a Python with no NumPy the tests that need it are skipped, each saying so, and the rest run: the formula
parser, validate, the data files and the limits need only the standard library."""
import copy
import json
import math
import os
import sys
import unittest

sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
FIXTURES = os.path.join(ROOT, 'backend', 'fixtures')

try:
    import numpy      # noqa: F401  (only to know whether it is here: arrays.py is the one module that uses it)
    HAVE_NUMPY = True
except ImportError:
    HAVE_NUMPY = False
needs_numpy = unittest.skipUnless(HAVE_NUMPY, "NumPy is not installed in this Python: run these with the backend's environment (README: The backend)")


def fixture(name):
    with open(os.path.join(FIXTURES, name), encoding='utf8') as f:
        return json.load(f)


def changed(graph, m):
    """A fixture graph changed in one place, as backend/fixtures/generate.mjs changes it."""
    g = copy.deepcopy(graph)
    host = g
    for k in m['path'][:-1]:
        host = host[int(k)] if isinstance(host, list) else host[k]
    last = m['path'][-1]
    if isinstance(host, list):
        if m.get('drop'):
            del host[int(last)]
        else:
            host[int(last)] = m['set']
    elif m.get('drop'):
        del host[last]
    else:
        host[last] = m['set']
    return g


T = lambda cols, rows: {'cols': cols, 'rows': rows, 'colsName': None, 'rowsName': None}


def graph_of(nodes, functions=None, spaces=None, blocks=None):
    return {'version': 1, 'nodes': nodes, 'functions': functions or {}, 'spaces': spaces or {}, 'blocks': blocks or {}}


def variable(cols, rows, values, name='V', **more):
    """A variable holding rows of values (None: an entry never given)."""
    entries = {'%d,%d' % (c + 1, r + 1): v for r, row in enumerate(values) for c, v in enumerate(row) if v is not None}
    return dict({'op': 'variable', 'inputs': [], 'type': T(cols, rows), 'name': name, 'named': True, 'defined': 'entries', 'entries': entries}, **more)


def all_cells(t):
    return [[c, r] for r in range(1, t['rows'] + 1) for c in range(1, t['cols'] + 1)]


class Plain:
    """The arithmetic of a formula for one number at a time, in plain Python: a second telling of what arrays.py
    does for whole arrays, to test that one against. NaN is an entry with no value."""
    nan = math.nan

    @staticmethod
    def number(x):
        return float(x)

    @classmethod
    def binary(cls, op, a, b):
        if math.isnan(a) or math.isnan(b):
            return cls.nan
        try:
            if op == '+':
                return a + b if not (math.isinf(a) and math.isinf(b) and a != b) else cls.nan
            if op == '-':
                return a - b if not (math.isinf(a) and math.isinf(b) and a == b) else cls.nan
            if op == '*':
                return cls.nan if (a == 0 and math.isinf(b)) or (b == 0 and math.isinf(a)) else a * b
            if op == '/':
                return cls.nan if b == 0 or (math.isinf(a) and math.isinf(b)) else a / b
            if op == '^':
                return cls.power(a, b)
        except OverflowError:
            return math.inf
        if op == '&&':
            return float(a != 0 and b != 0)
        if op == '||':
            return float(a != 0 or b != 0)
        return float({'==': a == b, '!=': a != b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b}[op])

    @classmethod
    def power(cls, a, b):
        if (a == 0 and b < 0) or (math.isinf(a) and b == 0) or (math.isinf(b) and (a < 0 or a == 1)):
            return cls.nan
        if a < 0 and not math.isinf(a) and not math.isinf(b) and b != math.floor(b):
            for q in range(2, 1024):
                p = round(b * q)
                if abs(b * q - p) <= 1.2e-7 * q * abs(b):
                    return cls.nan if q % 2 == 0 else (1 if p % 2 == 0 else -1) * (-a) ** b
            return cls.nan
        if a == -math.inf and b > 0 and b != math.floor(b):
            return cls.nan
        try:
            return math.pow(a, b)
        except OverflowError:
            return math.inf
        except ValueError:
            return cls.nan

    @classmethod
    def call(cls, fn, args):
        a = args[0]
        if fn == 'select':
            return cls.nan if math.isnan(a) else args[1] if a != 0 else args[2]
        if math.isnan(a) or (fn in ('max', 'min') and math.isnan(args[1])):
            return cls.nan
        if fn in ('max', 'min'):
            return max(a, args[1]) if fn == 'max' else min(a, args[1])
        if fn == 'neg':
            return -a
        if fn == '!':
            return float(a == 0)
        if fn == 'abs':
            return abs(a)
        if fn == 'sqrt':
            return cls.nan if a < 0 else math.sqrt(a)
        if fn == 'exp':
            try:
                return math.exp(a)
            except OverflowError:
                return math.inf
        if fn == 'ln':
            return cls.nan if a < 0 else -math.inf if a == 0 else math.log(a)
        return math.tanh(a) if fn == 'tanh' else math.erf(a)


def close(got, want):
    """The specification's "same answers": within 1e-5 of the value's size or 1e-6, whichever is larger. A value
    past what a 32-bit float holds is an infinity there."""
    if isinstance(want, float) and math.isnan(want):
        return isinstance(got, float) and math.isnan(got)
    if math.isinf(want) or abs(want) > 3.4028234663852886e38:
        return got == math.copysign(math.inf, want)
    return isinstance(got, (int, float)) and not math.isnan(got) and abs(got - want) <= max(1e-5 * abs(want), 1e-6)
