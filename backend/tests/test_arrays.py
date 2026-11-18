"""arrays.py: the one module that holds arrays. The arithmetic, the shapes, and the noise generator."""
import ast
import hashlib
import math
import os
import random
import struct
import unittest

from .support import HAVE_NUMPY, ROOT, Plain, close, needs_numpy
from backend.formula import evaluate, parse

if HAVE_NUMPY:
    import numpy as np
    from backend import arrays as A

M64 = (1 << 64) - 1


class Layout(unittest.TestCase):
    """These need no NumPy: they read the backend's own files."""

    def modules(self):
        folder = os.path.join(ROOT, 'backend')
        for name in sorted(os.listdir(folder)):
            if name.endswith('.py'):
                with open(os.path.join(folder, name), encoding='utf8') as f:
                    yield name, ast.parse(f.read())

    def test_only_arrays_py_imports_numpy(self):
        found = {}
        for name, tree in self.modules():
            for node in ast.walk(tree):
                names = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ''] if isinstance(node, ast.ImportFrom) else []
                if any(n.split('.')[0] in ('numpy', 'scipy', 'torch') for n in names):
                    found.setdefault(name, []).append(names)
        self.assertEqual(sorted(found), ['arrays.py'])

    def test_nothing_from_a_request_can_be_run(self):
        """No module of the backend calls eval, exec, compile or __import__, starts a process from text, or imports by name."""
        allowed = {'service.py': {'multiprocessing'}}      # the workers, which are this program's own
        for name, tree in self.modules():
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                    self.assertNotIn(node.func.id, ('eval', 'exec', 'compile', '__import__', 'getattr', 'setattr', 'globals', 'locals', 'vars'), name) if name != 'data.py' or node.func.id != 'getattr' else None
                mods = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ''] if isinstance(node, ast.ImportFrom) else []
                for m in mods:
                    self.assertNotIn(m.split('.')[0], {'subprocess', 'importlib', 'pickle', 'marshal', 'ctypes', 'shlex', 'pty'} | ({'multiprocessing'} - allowed.get(name, set())), name)
                if isinstance(node, ast.Attribute):
                    self.assertNotIn(node.attr, ('system', 'popen', 'spawnv', 'execv', 'import_module'), name)

    def test_the_five_limits_are_together_at_the_top_of_one_file(self):
        with open(os.path.join(ROOT, 'backend', 'limits.py'), encoding='utf8') as f:
            lines = [line for line in f.read().split('\n') if line.startswith(('MAX_', 'WORKERS'))]
        self.assertEqual([line.split(' = ')[0] for line in lines[:5]], ['MAX_BODY', 'MAX_NODES', 'MAX_ENTRIES', 'MAX_SECONDS', 'MAX_UPLOAD'])
        from backend import limits
        self.assertEqual((limits.MAX_BODY, limits.MAX_NODES, limits.MAX_ENTRIES, limits.MAX_SECONDS, limits.MAX_UPLOAD), (5 * 2 ** 20, 20000, 16000000, 30, 50 * 2 ** 20))


@needs_numpy
class Arithmetic(unittest.TestCase):
    def test_every_sign_and_function_is_plain_arithmetic_done_to_whole_arrays(self):
        values = [0.0, 1.0, -1.0, 2.0, -8.0, 0.5, 1 / 3, 3.0, -0.25, 1e-3, 40.0, math.inf, -math.inf, math.nan]
        a = A.spread(A.row(values), len(values), len(values))
        b = A.transpose(a)
        for op in ['+', '-', '*', '/', '^', '==', '!=', '<', '>', '<=', '>=', '&&', '||']:
            got = A.binary(op, a, b)
            self.assertEqual(got.dtype, np.float32, op)
            for r, y in enumerate(values):
                for c, x in enumerate(values):
                    want = Plain.binary(op, float(np.float32(x)), float(np.float32(y)))
                    self.assertTrue(close(A.item(got, r, c), want), '%r %s %r is %r here and %r one at a time' % (x, op, y, A.item(got, r, c), want))
        for fn in ['neg', '!', 'abs', 'sqrt', 'exp', 'ln', 'tanh', 'erf']:
            got = A.call(fn, [a])
            self.assertEqual(got.dtype, np.float32, fn)
            for c, x in enumerate(values):
                self.assertTrue(close(A.item(got, 0, c), Plain.call(fn, [float(np.float32(x))])), '%s(%r)' % (fn, x))
        for fn in ['max', 'min']:
            got = A.call(fn, [a, b])
            for r, y in enumerate(values):
                for c, x in enumerate(values):
                    self.assertTrue(close(A.item(got, r, c), Plain.call(fn, [x, y])), '%s(%r, %r)' % (fn, x, y))

    def test_the_side_of_a_select_that_is_not_chosen_does_no_harm(self):
        """Both sides are whole arrays, worked out before one is chosen: an error, a division by zero or an infinity on
        the side not taken must not reach the answer, and nothing may be raised or warned of on the way."""
        x = A.row([2.0, 0.0, -4.0, 0.0])
        names = {'x': x, 'i': A.row([1, 2, 3, 4])}
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter('error')
            for text, want in [('select(x == 0, 0, 1/x)', [0.5, 0, -0.25, 0]), ('select(x > 0, ln(x), 7)', [math.log(2), 7, 7, 7]), ('select(x >= 0, sqrt(x), -sqrt(-x))', [math.sqrt(2), 0, -2, 0]),
                               ('select(i > 2, -inf, x) + select(i > 2, inf, 0) * 0 + 1', [3, 1, math.nan, math.nan]), ('select(x != 0, 10/x, inf - inf) * 0 + select(x == 0, 5, 1/0 * 0 + 1)', [math.nan, math.nan, math.nan, math.nan]),
                               ('select(1, 5, 1/0)', [5] * 4), ('select(0, (0-1)^(1/2), x)', [2, 0, -4, 0]), ('select(1/0, 1, 2)', [math.nan] * 4), ('max(select(x == 0, 1, 1/x), 0)', [0.5, 1, 0, 1])]:
                got = A.spread(evaluate(parse(text), lambda n: names[n.lower()], A), 1, 4)
                for c, w in enumerate(want):
                    self.assertTrue(close(A.item(got, 0, c), float(w)), '%s at %d: %r, not %r' % (text, c, A.item(got, 0, c), w))

    def test_random_formulas_come_to_what_they_do_one_number_at_a_time(self):
        rnd = random.Random(7)
        leaves = ['x', 'i', '2', '0.5', '3', '(0-1)', '0', 'inf']

        def make(depth):
            if depth == 0 or rnd.random() < .25:
                return rnd.choice(leaves)
            kind = rnd.random()
            if kind < .55:
                return '(%s %s %s)' % (make(depth - 1), rnd.choice(['+', '-', '*', '/', '^', '<', '>=', '==', '&&', '||']), make(depth - 1))
            if kind < .8:
                return '%s(%s)' % (rnd.choice(['abs', 'sqrt', 'exp', 'ln', 'tanh', 'erf', '-', '!']), make(depth - 1))
            if kind < .9:
                return '%s(%s, %s)' % (rnd.choice(['max', 'min']), make(depth - 1), make(depth - 1))
            return 'select(%s, %s, %s)' % (make(depth - 1), make(depth - 1), make(depth - 1))
        xs = [0.0, 1.0, -2.0, 0.5, 3.0, -0.5]
        checked = 0
        for _ in range(400):
            text = make(4)
            tree = parse(text)
            got = A.spread(evaluate(tree, lambda n: {'x': A.row(xs), 'i': A.row(range(1, 7))}[n], A), 1, 6)
            for c, x in enumerate(xs):
                want = evaluate(tree, lambda n: {'x': x, 'i': float(c + 1)}[n], Narrow)
                one = A.item(got, 0, c)
                if not self.unsteady(tree, x, c):
                    self.assertTrue(close(one, want), '%s with x = %r: %r here, %r one at a time' % (text, x, one, want))
                    checked += 1
        self.assertGreater(checked, 1500)

    @staticmethod
    def unsteady(tree, x, c):
        """Whether the formula is one a small change in a number sends somewhere else: such a one says nothing about
        whether 32-bit arithmetic is right. Told by working it out again with every number a hair larger."""
        a = evaluate(tree, lambda n: {'x': x, 'i': float(c + 1)}[n], Narrow)
        b = evaluate(tree, lambda n: {'x': x * (1 + 3e-7) + 1e-9, 'i': float(c + 1)}[n], Nudged)
        return not (close(b, a) or (math.isnan(a) and math.isnan(b)))

    def test_arrays_hold_their_rows_and_columns_last_so_axes_can_be_added_in_front(self):
        a = np.arange(24, dtype=np.float32).reshape(2, 3, 4)      # two 3 by 4 matrices
        b = np.ones((2, 4, 2), dtype=np.float32)
        self.assertEqual(A.matmul(a, b).shape, (2, 3, 2))
        self.assertEqual(A.transpose(a).shape, (2, 4, 3))
        self.assertEqual(A.shape(a), (3, 4))
        self.assertEqual(A.part(a, 1, 2, 2, 2).shape, (2, 2, 2))
        self.assertTrue((A.part(a, 1, 2, 2, 2)[1] == a[1, 1:3, 2:4]).all())
        self.assertEqual(A.repeat(a, 2, 3).shape, (2, 6, 12))
        self.assertTrue((A.repeat(a, 2, 3)[1, 3:6, 4:8] == a[1]).all())
        out = np.zeros((2, 5, 5), dtype=np.float32)
        A.place(out, a, 1, 1)
        self.assertTrue((out[:, 1:4, 1:5] == a).all())
        self.assertEqual(A.take(a, [0, 2], [1, 3]).shape, (2, 1, 2))
        self.assertEqual(A.take(a, [0, 2], [1, 3])[1].tolist(), [[13.0, 23.0]])
        A.put(out, [0, 4], [0, 4], A.take(a, [0, 2], [1, 3]))
        self.assertEqual(out[1, 4, 4], 23.0)
        self.assertEqual(A.binary('+', a, A.row([1, 2, 3, 4])).shape, (2, 3, 4))      # a row is spread over every matrix
        self.assertEqual(A.call('select', [a > 5, a, A.number(0)]).shape, (2, 3, 4))
        i, j = A.grid(3, 4)
        self.assertEqual((i.shape, j.shape), ((1, 4), (3, 1)))
        self.assertEqual(A.spread(A.number(2), 3, 4).shape, (3, 4))

    def test_what_is_read_out_is_plain_python(self):
        a = A.row([1.5, math.nan, math.inf])
        self.assertEqual(A.summary(a), (1.5, math.inf, math.inf))
        self.assertEqual(A.summary(A.row([math.nan])), (None, None, None))
        self.assertEqual(A.summary(A.row([1, 2, math.nan, 6])), (1.0, 6.0, 3.0))
        self.assertIs(type(A.item(a, 0, 0)), float)
        self.assertEqual(A.table('a,b\n 1,"2.5"\r\n3,4e1\n', 1).tolist(), [[1.0, 2.5], [3.0, 40.0]])
        self.assertEqual(A.table('1\n', 0).shape, (1, 1))
        self.assertEqual(A.identity(2, 3).tolist(), [[1, 0, 0], [0, 1, 0]])


def narrow(x):
    try:
        return struct.unpack('f', struct.pack('f', x))[0]
    except OverflowError:
        return math.copysign(math.inf, x)


class Narrow(Plain):
    """Plain arithmetic with every step made a 32-bit float, as the backend's numbers are: a sum past what 32 bits
    hold is an infinity at that step, not at the end."""
    number = staticmethod(lambda x: narrow(float(x)))
    binary = classmethod(lambda cls, op, a, b: narrow(Plain.binary(op, a, b)))
    root = classmethod(lambda cls, a, p, q: narrow(Plain.root(a, p, q)))
    call = classmethod(lambda cls, fn, args: narrow(Plain.call(fn, args)))


class Nudged(Narrow):
    @staticmethod
    def number(x):
        return narrow(float(x) * (1 + 3e-7))


def mix(z):
    z = (z + 0x9E3779B97F4A7C15) & M64
    z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & M64
    z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & M64
    return z ^ (z >> 31)


def noise_entry(seed, key, c, r, dist, tick=0, cells=()):
    """The generator as the specification writes it, one entry at a time in plain Python integers: a second telling,
    with nothing shared with arrays.py."""
    k = int.from_bytes(hashlib.sha256(('%d:%s' % (seed, key)).encode()).digest()[:8], 'big')
    for cx, cy in cells:
        if (cx, cy) != (1, 1):
            k = mix(mix(k ^ cx) ^ cy)
    h = lambda n: mix(mix(mix(mix(k ^ c) ^ r) ^ tick) ^ n)
    u = lambda n: (h(n) >> 11) / 2 ** 53
    return u(0) if dist == 'uniform' else math.sqrt(-2 * math.log(1 - u(0))) * math.cos(2 * math.pi * u(1))


@needs_numpy
class Noise(unittest.TestCase):
    def test_mix_is_the_one_written_in_the_specification(self):
        self.assertEqual(mix(0), 0xE220A8397B1DCDAF)      # splitmix64's first output from 0, known from its own reference
        self.assertEqual(mix(0x9E3779B97F4A7C15), 0x6E789E6AA1B965F4)
        zs = [0, 1, M64, 0x123456789ABCDEF, 1 << 63]
        self.assertEqual([int(v) for v in A._mix(np.array(zs, dtype=np.uint64))], [mix(z) for z in zs])

    def test_every_entry_is_what_the_second_implementation_makes_it(self):
        for seed, key, rows, cols, dist, tick, cells in [(0, 'b1', 4, 4, 'uniform', 0, ()), (7, 'b0x7m2c', 3, 5, 'normal', 0, ()), (-3, 'p:0.2', 2, 2, 'uniform', 5, ()), (2 ** 53 - 1, 'ключ', 1, 7, 'normal', 0, ()),
                                                         (1, 'b1', 2, 3, 'uniform', 0, ((2, 1),)), (1, 'b1', 2, 3, 'normal', 0, ((1, 1), (3, 2))), (1, 'b1', 2, 3, 'uniform', 9, ((4, 4), (1, 1), (2, 5)))]:
            got = A.noise(seed, key, rows, cols, dist, tick, cells)
            self.assertEqual((got.shape, got.dtype), ((rows, cols), np.float32))
            for r in range(1, rows + 1):
                for c in range(1, cols + 1):
                    want = noise_entry(seed, key, c, r, dist, tick, cells)
                    self.assertEqual(A.item(got, r - 1, c - 1), float(np.float32(want)), (seed, key, c, r, dist))      # the very number, made 32-bit

    def test_it_depends_on_the_seed_the_block_the_entry_and_the_tick_and_on_nothing_else(self):
        base = A.noise(3, 'b1', 4, 4, 'uniform')
        self.assertTrue((A.noise(3, 'b1', 6, 9, 'uniform')[:4, :4] == base).all())      # resized: no entry that still exists changes
        self.assertTrue((A.noise(3, 'b1', 2, 2, 'uniform') == base[:2, :2]).all())
        for other in [A.noise(4, 'b1', 4, 4, 'uniform'), A.noise(3, 'b2', 4, 4, 'uniform'), A.noise(3, 'b1', 4, 4, 'uniform', 1), A.noise(3, 'b1', 4, 4, 'uniform', 0, ((2, 1),)), A.noise(3, 'b1', 4, 4, 'uniform', 0, ((1, 2),))]:
            self.assertFalse((other == base).any())      # a new seed, block, tick or cell changes every one of them
        self.assertTrue((A.noise(3, 'b1', 4, 4, 'uniform', 0, ((1, 1),)) == base).all())      # the first cell holds what the block holds outside a tile
        self.assertTrue((A.noise(3, 'b1', 4, 4, 'uniform', 0, ((1, 1), (1, 1))) == base).all())

    def test_uniform_is_from_0_up_to_1_and_normal_has_mean_0_and_deviation_1(self):
        u = A.noise(11, 'b9', 400, 400, 'uniform')
        self.assertTrue(((u >= 0) & (u < 1)).all())
        self.assertAlmostEqual(float(u.mean()), 0.5, 2)
        self.assertAlmostEqual(float(u.var()), 1 / 12, 2)
        g = A.noise(11, 'b9', 400, 400, 'normal')
        self.assertAlmostEqual(float(g.mean()), 0.0, 1)
        self.assertAlmostEqual(float(g.std()), 1.0, 1)
        self.assertTrue(np.isfinite(g).all())

    def test_a_uniform_number_never_rounds_up_to_1(self):
        """u(0) can be as large as 1 - 2^-53, which as a 32-bit float is 1.0. With the generator made to give its
        largest number everywhere, what comes out is still below 1."""
        real = A._mix
        try:
            A._mix = lambda z: np.full(np.shape(z), M64, dtype=np.uint64)
            self.assertEqual(float(np.float32((M64 >> 11) / 2 ** 53)), 1.0)      # what it would have been
            top = A.noise(0, 'b1', 2, 2, 'uniform')
        finally:
            A._mix = real
        self.assertTrue((top < 1).all())
        self.assertEqual(float(top[0, 0]), float(np.nextafter(np.float32(1), np.float32(0))))
