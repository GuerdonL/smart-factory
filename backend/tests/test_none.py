"""None (phase 9): the value that is nothing, said outright. values.js has its rules; here they are held for the
backend, where a float cannot say None and arrays.py carries which entries are None beside the numbers.

Every row of the table that can arise where every number is a float is here, one at a time (the fixtures hold the
same rows against evaluate.js: test_evaluate.SameAnswers). What cannot arise here: None against unknown (an entry
never given is refused whole) and None against a decimal (every number here is one)."""
import json
import math
import unittest

from .support import HAVE_NUMPY, T, graph_of, needs_numpy, variable
from backend.check import validate
from backend.formula import Wrong, formula_ok, names_in, parse

if HAVE_NUMPY:
    import numpy as np
    from backend import arrays as A
    from backend import run as R
    from backend.formula import evaluate

NONE = {'none': True}
ROOM = 2 << 30


class Read(unittest.TestCase):
    """These need no NumPy."""

    def test_none_is_a_word_of_the_language(self):
        self.assertEqual(parse('none'), ('name', 'none'))
        self.assertEqual(parse('∅'), ('name', 'none'))
        self.assertEqual(names_in('none + $1 * None'), ['$1'])
        self.assertTrue(formula_ok('select($1 == none, 0, $1)', 1))
        self.assertTrue(formula_ok('∅ + 1', 0))
        for text in ('√∅', '∜∅', '2∅'):      # the sign under a root and against a number, as expression.js reads it
            self.assertTrue(formula_ok(text, 0), text)
        self.assertFalse(formula_ok('nothing + 1', 0))

    def test_none_is_a_literal_in_its_one_form(self):
        ok = lambda v: validate(graph_of({'a': variable(1, 1, [[v]])}, version=3)) == []
        self.assertTrue(ok(NONE))
        for v in ({'none': 1}, {'none': False}, {'none': True, 'sym': 'x'}, {'none': True, 'n': 1, 'k': 0}, {'none': 'true'}, 'none'):
            self.assertFalse(ok(v), v)

    def test_versions_1_2_and_3_are_read(self):
        for version, good in ((1, True), (2, True), (3, True), (4, True), (5, False), (0, False), ('3', False), (None, False)):
            self.assertEqual(validate(graph_of({'a': variable(1, 1, [[7]])}, version=version)) == [], good, version)

    def test_a_graph_that_says_a_version_too_low_for_what_it_holds_is_refused(self):
        # ruled 21 November 2026: None, a value and a promise need 3; inner data needs 2 (graph.js: versionFor)
        self.assertEqual(validate(graph_of({'a': variable(1, 1, [[NONE]])}, version=3)), [])
        for version in (1, 2):
            self.assertEqual(validate(graph_of({'a': variable(1, 1, [[NONE]])}, version=version)), ['a: it holds None, which needs version 3, and the graph says version %d' % version])
            self.assertEqual(validate(graph_of({'a': variable(1, 1, [[7]], holds='natural')}, version=version)), ['a: it holds a promise, which needs version 3, and the graph says version %d' % version])
            valued = variable(1, 1, [[7]])
            valued['type'] = dict(valued['type'], value='natural')
            self.assertEqual(validate(graph_of({'a': valued}, version=version)), ['a: it holds a number space, which needs version 3, and the graph says version %d' % version])
        inner = variable(1, 1, [[None]])
        inner['type'] = dict(inner['type'], inner=[{'length': 2, 'name': None}])
        self.assertEqual(validate(graph_of({'a': inner}, version=1)), ['a: it holds inner data, which needs version 2, and the graph says version 1'])
        self.assertEqual(validate(graph_of({'a': inner}, version=2)), [])


def says(a):
    """An array as rows of what each entry is: a float, 'none', or 'err'."""
    rows, cols = A.shape(a)
    one = lambda r, c: 'none' if A.is_none(a, r, c) else 'err' if math.isnan(A.item(a, r, c)) else A.item(a, r, c)
    return [[one(r, c) for c in range(cols)] for r in range(rows)]


@needs_numpy
class Masks(unittest.TestCase):
    def row(self, *values):
        return A.row([None if v == 'none' else math.nan if v == 'err' else v for v in values])

    def test_none_with_a_number_is_none(self):
        x = self.row('none', 1, 0, 'none', 'err')
        y = self.row(1, 'none', 'none', 'none', 'none')
        for op in '+-*/^':
            self.assertEqual(says(A.binary(op, x, y)), [['none', 'none', 'none', 'none', 'err']], op)      # also None × 0 and 1 / None; and what has no value has none still
        for op in ('<', '>', '<=', '>='):
            self.assertEqual(says(A.binary(op, x, y)), [['none', 'none', 'none', 'none', 'err']], op)
        for fn in ('max', 'min'):
            self.assertEqual(says(A.call(fn, [x, y])), [['none', 'none', 'none', 'none', 'err']], fn)

    def test_none_is_equal_to_none_and_to_nothing_else(self):
        x, y = self.row('none', 'none', 0, 'none', 'err', 2), self.row(0, 'none', 'none', math.inf, 'none', 2)
        self.assertEqual(says(A.binary('==', x, y)), [[0.0, 1.0, 0.0, 0.0, 'err', 1.0]])
        self.assertEqual(says(A.binary('!=', x, y)), [[1.0, 0.0, 1.0, 1.0, 'err', 0.0]])
        self.assertNotIsInstance(A.binary('==', x, y), A.Held)      # true or false, never None

    def test_x_is_not_none_tests_that_a_value_is_present(self):
        # ruled 21 November 2026: != is the opposite of ==, never None
        x = self.row('none', 0, 3, math.inf, 'err')
        got = evaluate(parse('x != none'), lambda name: x, A)
        self.assertEqual(says(got), [[0.0, 1.0, 1.0, 1.0, 'err']])
        self.assertNotIsInstance(got, A.Held)
        self.assertEqual(says(evaluate(parse('select(x != none, x, 0 - 1)'), lambda name: x, A)), [[-1.0, 0.0, 3.0, math.inf, 'err']])

    def test_a_sum_or_product_of_several_terms_does_not_turn_on_their_order(self):
        # ruled 21 November 2026: an error two of the terms make comes before None, wherever the None stands
        from itertools import permutations
        says_one = lambda a: says(A.spread(a, 1, 1))[0][0]
        for op, terms, want in (('+', ('none', math.inf, -math.inf), 'err'), ('+', ('none', 1, 2), 'none'), ('+', ('none', math.inf, math.inf), 'none'), ('+', ('none', 'none', math.inf, -math.inf), 'err'), ('+', (1, 2, 3), 6.0),
                                ('*', ('none', 0, math.inf), 'err'), ('*', ('none', 0, 0), 'none'), ('*', ('none', 2, -math.inf), 'none'), ('*', ('none', 'none', math.inf, 0), 'err'), ('*', (2, 3, 4), 24.0), ('+', ('none', 'err', 1), 'err')):
            for p in permutations(terms):
                vs = [self.row(v) for v in p]
                left = vs[0]
                for k, v in enumerate(vs[1:]):
                    left = A.step(op, left, v, (k > 0, False))
                self.assertEqual(says_one(left), want, 'from the left, %s %r' % (op, p))
                right = vs[-1]
                for k, v in enumerate(reversed(vs[:-1])):
                    right = A.step(op, v, right, (False, k > 0))
                self.assertEqual(says_one(right), want, 'from the right, %s %r' % (op, p))
        # a term taken away: ∞ − (None + ∞) is ∞ − ∞ beside a None
        inner = A.step('+', self.row('none'), self.row(math.inf), (False, False))
        self.assertEqual(says_one(A.step('-', self.row(math.inf), inner, (False, True))), 'err')
        self.assertEqual(says_one(A.step('-', self.row(-math.inf), inner, (False, True))), 'none')
        # what was set aside is read by the next step of the same sum alone: a pair on its own, or a product, sees None
        self.assertEqual(says_one(A.binary('+', inner, self.row(-math.inf))), 'none')
        self.assertEqual(says_one(A.step('*', inner, self.row(0.0), (False, False))), 'none')
        self.assertEqual(says(A.step('+', A.spread(inner, 2, 2), self.row(-math.inf), (True, False))), [['err', 'err'], ['err', 'err']])      # and it is spread with its matrix
        plain = A.step('+', A.number(1.0), A.number(2.0), (False, False))
        self.assertNotIsInstance(plain, A.Held)      # with no None among them nothing is kept, and nothing is made that was not made before

    def test_none_is_false(self):
        x, y = self.row('none', 'none', 'none', 3, 'none'), self.row(3, 0, 'none', 'none', 'err')
        self.assertEqual(says(A.binary('&&', x, y)), [[0.0, 0.0, 0.0, 0.0, 'err']])
        self.assertEqual(says(A.binary('||', x, y)), [[1.0, 0.0, 0.0, 1.0, 'err']])
        self.assertEqual(says(A.call('!', [x])), [[1.0, 1.0, 1.0, 0.0, 1.0]])
        # select(None, a, b) is b; what is chosen may itself be None; a condition with no value has none
        c, a, b = self.row('none', 1, 0, 'err', 1), self.row(10, 'none', 30, 40, 50), self.row(-1, -2, 'none', -4, 'none')
        self.assertEqual(says(A.call('select', [c, a, b])), [[-1.0, 'none', 'none', 'err', 50.0]])
        self.assertEqual(says(A.call('select', [A.nothing(), A.number(1), A.number(2)]).reshape(1, 1)), [[2.0]])

    def test_a_product_with_none_is_each_entry_s_own_terms_whatever_special_values_are_in_it(self):
        """Every entry against a model that takes one entry and one term at a time: its kind, and its number where it
        is one (an infinity included). With infinities of one sign and of both, on one side and on both, with
        zeros, errors and None, sparse and dense, and with inner axes."""
        rng = np.random.default_rng(21)

        def made(shape, none, up, down, zero, lost):
            v = rng.integers(1, 4, size=shape).astype(np.float32)
            v = np.where(rng.random(shape) < 0.3, -v, v)
            for value, p in ((0, zero), (math.inf, up), (-math.inf, down), (math.nan, lost)):
                v = np.where(rng.random(shape) < p, np.float32(value), v)
            m = rng.random(shape) < none
            return np.where(m, np.float32(0), v).astype(np.float32), m

        def model(a, ma, b, mb, at):
            lead, i, j = at[:-2], at[-2], at[-1]
            none, known = False, []
            for k in range(a.shape[-1]):
                x, y, nx, ny = float(a[lead + (i, k)]), float(b[lead + (k, j)]), bool(ma[lead + (i, k)]), bool(mb[lead + (k, j)])
                if (not nx and math.isnan(x)) or (not ny and math.isnan(y)):
                    return 'err'
                if nx or ny:
                    none = True
                elif (x == 0 and math.isinf(y)) or (y == 0 and math.isinf(x)):
                    return 'err'
                else:
                    known.append(x * y)
            if math.inf in known and -math.inf in known:
                return 'err'
            return 'none' if none else float(sum(known))

        kinds, asked = set(), 0
        for shape_a, shape_b in (((4, 5), (5, 3)), ((1, 6), (6, 1)), ((2, 3, 4), (2, 4, 5)), ((2, 1, 3, 4), (1, 3, 4, 2)), ((7, 2), (2, 7))):
            for none_a, none_b in ((0.2, 0), (0, 0.2), (0.15, 0.15), (0.6, 0.6)):
                for up, down in ((0, 0), (0.2, 0), (0, 0.2), (0.15, 0.15), (0.5, 0.4), (0.02, 0)):
                    for zero, lost in ((0, 0), (0.2, 0), (0.2, 0.05)) * 3:
                        (a, ma), (b, mb) = made(shape_a, none_a, up, down, zero, lost), made(shape_b, none_b, up, down, zero, lost)
                        got = A.matmul(A.Held(a, ma) if ma.any() else a, A.Held(b, mb) if mb.any() else b)
                        values, none = (got.values, got.none) if isinstance(got, A.Held) else (got, np.zeros(np.shape(got), dtype=bool))
                        wide = np.broadcast_shapes(shape_a[:-2], shape_b[:-2])
                        full = [np.broadcast_to(x, wide + shape[-2:]) for x, shape in ((a, shape_a), (ma, shape_a), (b, shape_b), (mb, shape_b))]
                        self.assertEqual(values.shape, wide + (shape_a[-2], shape_b[-1]))
                        for at in np.ndindex(values.shape):
                            want = model(*full, at)
                            said = 'none' if none[at] else 'err' if math.isnan(values[at]) else float(values[at])
                            self.assertEqual(said, want, (shape_a, shape_b, at, a.tolist(), ma.tolist(), b.tolist(), mb.tolist()))
                            if none[at]:
                                self.assertEqual(float(values[at]), 0.0)      # the number under a None is 0
                            kinds.add(want if isinstance(want, str) else 'inf' if math.isinf(want) else 'number')
                            asked += 1
        self.assertEqual(kinds, {'err', 'none', 'number', 'inf'})
        self.assertGreater(asked, 20000)

    def test_a_product_with_none_and_infinities_never_takes_more_room_than_a_run_is_given(self):
        """limits.ROOM_TO_WORK results, the inputs aside, however many None and infinities there are and wherever
        they lie: the check before a run counts on it."""
        import tracemalloc
        from backend import limits
        n = 300
        rng = np.random.default_rng(3)
        a, b = rng.random((n, n), dtype=np.float32), rng.random((n, n), dtype=np.float32)
        none, upper = np.eye(n, dtype=bool), np.triu(np.ones((n, n), dtype=bool), 1)

        def scattered(x, signs):
            m = rng.random((n, n)) < 0.01
            v = x.copy()
            for sign in signs:
                v[rng.random((n, n)) < 0.01] = sign * math.inf
            v[rng.random((n, n)) < 0.01] = 0
            return A.Held(np.where(m, np.float32(0), v), m)

        cases = {'an attention mask': (A.Held(np.where(none, np.float32(0), a), none), np.where(upper, np.float32(-math.inf), b)),
                 'None and ∞ scattered on both sides': (scattered(a, [1]), scattered(b, [1])),
                 'None, ∞ and -∞ scattered on both sides': (scattered(a, [1, -1]), scattered(b, [1, -1])),
                 'None in every row but two, ∞ and -∞': (A.Held(np.where(none, np.float32(0), a), none & (np.arange(n) > 1)[:, None]), scattered(b, [1, -1]).values)}
        for name, (x, y) in cases.items():
            A.matmul(x, y)
            tracemalloc.start()
            A.matmul(x, y)
            peak = tracemalloc.get_traced_memory()[1]
            tracemalloc.stop()
            self.assertLessEqual(peak / (4 * n * n), limits.ROOM_TO_WORK, name)

    def test_every_function_of_none_is_none(self):
        x = self.row('none', 4, 'err')
        for fn, four in (('neg', -4.0), ('abs', 4.0), ('sqrt', 2.0), ('exp', float(np.float32(math.exp(4)))), ('ln', float(np.float32(math.log(4)))), ('tanh', float(np.float32(math.tanh(4)))), ('erf', float(np.float32(math.erf(4))))):
            self.assertEqual(says(A.call(fn, [x])), [['none', four, 'err']], fn)
        self.assertEqual(says(A.root(self.row('none', -8), 1, 3)), [['none', -2.0]])

    def test_a_product_entry_with_a_none_term_is_none(self):
        a = A.Held(np.array([[0, 0], [1, 2]], dtype=np.float32), np.array([[False, True], [False, False]]))
        b = A.Held(np.array([[0, 1], [math.inf, 4]], dtype=np.float32), np.array([[True, False], [False, False]]))
        self.assertEqual(says(A.matmul(a, b)), [['none', 'none'], ['none', 9.0]])      # a None against an infinity or a zero is still None, not 0 × ∞
        self.assertEqual(says(A.matmul(self.row(0, 'none'), np.array([[math.inf], [1]], dtype=np.float32))), [['err']])      # 0 × ∞ beside a None term: no value
        for row in ((math.inf, 'none', -math.inf), (math.inf, -math.inf, 'none'), ('none', math.inf, -math.inf)):      # ∞ − ∞ likewise, wherever the None stands
            self.assertEqual(says(A.matmul(self.row(*row), np.ones((3, 1), dtype=np.float32))), [['err']], row)
        self.assertEqual(says(A.matmul(self.row(math.inf, 'none', math.inf), np.ones((3, 1), dtype=np.float32))), [['none']])
        self.assertEqual(says(A.matmul(self.row('err', 'none'), np.ones((2, 1), dtype=np.float32))), [['err']])
        self.assertEqual(says(A.matmul(self.row(1, 2), np.ones((2, 1), dtype=np.float32))), [[3.0]])

    def test_a_product_with_none_and_an_infinity_is_told_term_by_term_wherever_the_infinities_lie(self):
        """The answer must be what counting every term gives, for few infinities and many, with and without inner
        axes (arrays._told asks the product again only where a None meets an infinity)."""
        rng = np.random.default_rng(9)

        def made(shape, rare):
            pool = np.array([0, 1, -1, 2, 0.5, -3], dtype=np.float32)
            v = rng.choice(pool, size=shape)
            v[rng.random(shape) < rare] = math.inf
            v[rng.random(shape) < rare] = -math.inf
            v[rng.random(shape) < rare / 2] = math.nan
            m = rng.random(shape) < 0.08
            v[m] = 0
            return v, m

        def told(a, ma, b, mb):      # one entry at a time, one term at a time
            out = np.empty(a.shape[:-1] + b.shape[-1:], dtype=object)
            for at in np.ndindex(out.shape):
                lead, i, j = at[:-2], at[-2], at[-1]
                none = bad = up = down = False
                for k in range(a.shape[-1]):
                    x, y, nx, ny = a[lead + (i, k)], b[lead + (k, j)], ma[lead + (i, k)], mb[lead + (k, j)]
                    if (not nx and math.isnan(x)) or (not ny and math.isnan(y)):
                        bad = True
                    elif nx or ny:
                        none = True
                    else:
                        with np.errstate(all='ignore'):
                            t = float(np.float32(x) * np.float32(y))
                        bad = bad or math.isnan(t)
                        up, down = up or t == math.inf, down or t == -math.inf
                out[at] = 'err' if bad or (up and down) else 'none' if none else 'number'
            return out

        seen = set()
        for shape_a, shape_b in (((5, 6), (6, 4)), ((2, 5, 6), (2, 6, 4)), ((3, 1, 4, 7), (3, 2, 7, 3)), ((1, 9), (9, 1))):
            for rare in (0.0, 0.02, 0.1, 0.5):
                for _ in range(12):
                    (a, ma), (b, mb) = made(shape_a, rare), made(shape_b, rare)
                    got = A.matmul(A.Held(a, ma) if ma.any() else a, A.Held(b, mb) if mb.any() else b)
                    values, none = (got.values, got.none) if isinstance(got, A.Held) else (got, np.zeros(np.shape(got), dtype=bool))
                    wide = np.broadcast_shapes(shape_a[:-2], shape_b[:-2])
                    want = told(np.broadcast_to(a, wide + shape_a[-2:]), np.broadcast_to(ma, wide + shape_a[-2:]), np.broadcast_to(b, wide + shape_b[-2:]), np.broadcast_to(mb, wide + shape_b[-2:]))
                    said = np.where(none, 'none', np.where(np.isnan(values), 'err', 'number')).astype(object)
                    self.assertEqual(said.tolist(), want.tolist(), (shape_a, shape_b, rare))
                    seen.update(want.reshape(-1).tolist())
        self.assertEqual(seen, {'err', 'none', 'number'})

    def test_only_an_array_that_holds_a_none_is_held(self):
        x, y = A.row([1.0, 2.0]), A.row([0.0, math.nan])
        for made in (A.binary('+', x, y), A.binary('/', x, y), A.call('select', [x, x, y]), A.matmul(x, A.transpose(y)), A.spread(x, 2, 2), A.part(x, 0, 0, 1, 1), A.place(A.blank(1, 2), x, 0, 0), A.put(A.blank(1, 2), [0, 0], [0, 1], x)):
            self.assertIsInstance(made, np.ndarray)
        held = self.row('none', 2)
        self.assertIsInstance(A.binary('+', held, x), A.Held)
        self.assertIsInstance(A.call('select', [held, x, x]), np.ndarray)      # the None chose, and what it chose is a number
        self.assertIsInstance(A.part(held, 0, 1, 1, 1), np.ndarray)      # the part that holds no None is plain again
        self.assertEqual(A.size(held), 8 + 2)
        self.assertEqual(A.nones(held), 1)
        self.assertEqual(float(held.values[0, 0]), 0.0)      # the number under a None is 0

    def test_none_goes_where_its_entry_goes(self):
        m = A.Held(np.array([[0, 2, 3], [4, 0, 6]], dtype=np.float32), np.array([[True, False, False], [False, True, False]]))
        self.assertEqual(says(A.transpose(m)), [['none', 4.0], [2.0, 'none'], [3.0, 6.0]])
        self.assertEqual(says(A.part(m, 1, 0, 1, 2)), [[4.0, 'none']])
        self.assertEqual(says(A.repeat(m, 1, 2))[0], ['none', 2.0, 3.0, 'none', 2.0, 3.0])
        self.assertEqual(says(A.spread(self.row('none', 5), 2, 2)), [['none', 5.0], ['none', 5.0]])
        self.assertEqual(says(A.take(m, [0, 1], [0, 1])), [['none', 'none']])
        out = A.place(A.blank(2, 4), m, 0, 1)
        self.assertEqual(says(out), [['err', 'none', 2.0, 3.0], ['err', 4.0, 'none', 6.0]])
        out = A.place(out, A.full(2, 2, 7.0), 0, 0)      # a number set over a None is a number
        self.assertEqual(says(out), [[7.0, 7.0, 2.0, 3.0], [7.0, 7.0, 'none', 6.0]])
        self.assertEqual(says(A.put(A.blank(1, 3), [0, 0], [0, 2], self.row('none', 1))), [['none', 'err', 1.0]])
        stacked = A.stack([m, A.full(2, 3, 1.0)], [(0, 0), (1, 0)], 1, 2)
        self.assertEqual(A.inner(stacked), (3, 2))
        self.assertEqual(says(A.entry(stacked, 0, 0)), says(m))
        self.assertNotIsInstance(A.entry(stacked, 1, 0), A.Held)
        joined = A.join([m, A.full(2, 3, 1.0)], (2,))
        self.assertEqual(says(A.at_position(joined, (0,))), says(m))
        self.assertEqual(says(A.at_position(A.reorder(joined, [0, 2, 1]), (0,))), [['none', 2.0, 3.0], [1.0, 1.0, 1.0]])

    def test_a_summary_leaves_none_out(self):
        self.assertEqual(A.summary(self.row('none', 2, 4, 'err')), (2.0, 4.0, 3.0))
        self.assertEqual(A.summary(self.row('none', 'none')), (None, None, None))

    def test_a_formula_reads_none(self):
        self.assertIsInstance(evaluate(parse('none + 1'), None, A), A.Held)
        self.assertEqual(float(evaluate(parse('select(∅, 1, 2) + (none == none) + !none'), None, A)), 4.0)
        self.assertRaises(Wrong, parse, 'none(')


def ask(graph, want):
    return json.loads(json.dumps(R.run(json.dumps({'graph': graph, 'want': want}).encode(), None, ROOM)))


@needs_numpy
class Answers(unittest.TestCase):
    def test_the_room_a_run_needs_counts_the_byte_that_says_none(self):
        """Refused from the sizes alone, before anything is made: an array that may hold None takes 5 bytes an
        entry (arrays.size), and so does the room to work on it. An older graph, whose types say no value, is
        counted as it always was."""
        n = 1000
        def graph(value, version):      # ones, and a variable seated on them that promises what it holds
            t = lambda v: dict(T(n, n), **({'value': v} if v else {}))
            return graph_of({'s': {'op': 'source', 'inputs': [], 'type': t(value and 'boolean'), 'kind': 'ones'},
                             'v': dict({'op': 'variable', 'inputs': ['s'], 'type': t(value), 'name': 'V', 'named': True, 'defined': 'seat', 'entries': {}}, **({'holds': value} if value else {}))}, version=version)
        def asked(value, version, room):
            return json.loads(json.dumps(R.run(json.dumps({'graph': graph(value, version), 'want': [{'node': 'v', 'cells': [[1, 1]]}]}).encode(), None, room)))
        plain = 4 * n * n * (2 + 6)      # the two of them, and six more of the larger to work in
        self.assertEqual(asked('boolean', 3, plain)['results']['v']['cells'], [[1, 1, 1.0]])
        self.assertIn('needs about 37 MB of memory', asked('boolean?', 3, plain)['errors']['v'])      # a byte more for the variable, and for each of the six
        self.assertEqual(asked('boolean?', 3, plain + n * n * (1 + 6))['results']['v']['cells'], [[1, 1, 1.0]])
        self.assertIn('needs about 38 MB of memory', asked(None, 3, plain)['errors']['v'])      # a type that says no value reads as any or None: both of them
        self.assertEqual(asked(None, 2, plain)['results']['v']['cells'], [[1, 1, 1.0]])

    def test_a_run_says_which_entries_are_none(self):
        g = graph_of({'a': variable(3, 1, [[NONE, 2, {'expr': 'none * 0'}]]), 'b': variable(3, 1, [[1, 1, 1]]),
                      'sum': {'op': 'add', 'inputs': ['a', 'b'], 'type': T(3, 1)}}, version=3)
        self.assertEqual(validate(g), [])
        out = ask(g, [{'node': 'sum', 'cells': [[1, 1], [2, 1], [3, 1]]}, {'node': 'a', 'cells': [[1, 1]]}])
        self.assertEqual(out['errors'], {})
        self.assertEqual(out['results']['sum']['cells'], [[1, 1, NONE], [2, 1, 3.0], [3, 1, NONE]])
        self.assertEqual((out['results']['sum']['min'], out['results']['sum']['max'], out['results']['sum']['mean']), (3.0, 3.0, 3.0))      # of the entries that are numbers
        self.assertEqual(out['results']['a']['cells'], [[1, 1, NONE]])

    def test_none_is_a_value_that_was_given_and_an_entry_not_given_is_still_refused(self):
        g = graph_of({'a': variable(2, 1, [[NONE, None]])}, version=3)
        self.assertIn('unknown entries in', ask(g, [{'node': 'a', 'cells': [[1, 1]]}])['errors']['a'])

    def test_the_side_and_the_mass_of_none_are_none(self):
        g = graph_of({'s': variable(1, 1, [[NONE]]), 'x': {'op': 'measure', 'inputs': ['s'], 'type': T(1, 1), 'side': 'x'}, 'm': {'op': 'measure', 'inputs': ['s'], 'type': T(1, 1), 'side': 'm'}}, version=3)
        out = ask(g, [{'node': 'x', 'cells': [[1, 1]]}, {'node': 'm', 'cells': [[1, 1]]}])
        self.assertEqual((out['results']['x']['cells'], out['results']['m']['cells']), ([[1, 1, NONE]], [[1, 1, NONE]]))


@needs_numpy
class Promises(unittest.TestCase):
    """Ruled 21 November 2026: the backend holds its numbers to a promise, and says so in the page's own sentence."""

    def graph(self, entries, holds, cols=3, value=None):
        t = {'cols': cols, 'rows': 1, 'colsName': None, 'rowsName': None}
        g = {'version': 3, 'functions': {}, 'spaces': {}, 'blocks': {}, 'nodes': {'w': {'op': 'variable', 'inputs': [], 'type': t, 'name': 'W', 'named': True, 'defined': 'entries', 'entries': entries, 'holds': holds}}}
        return g

    def says(self, entries, holds, cols=3):
        out = ask(self.graph(entries, holds, cols), [{'node': 'w', 'cells': [[1, 1]]}])
        return out['errors'].get('w'), out.get('codes', {}).get('w')

    def test_each_space_is_held_against_the_numbers(self):
        inf, half, none = 'inf', {'n': 1, 'd': 2, 'k': 0}, {'none': True}
        for holds, entries, why in (
                ('natural', {'1,1': 1, '2,1': 2, '3,1': inf}, 'W is not natural: it holds ∞ at 3, 1'), ('natural', {'1,1': 1, '2,1': 0, '3,1': -3}, 'W is not natural: it holds 0 at 2, 1'),
                ('whole', {'1,1': 0, '2,1': half, '3,1': 2}, 'W is not whole: it holds 0.5 at 2, 1'), ('integer', {'1,1': -7, '2,1': 2, '3,1': '-inf'}, 'W is not integer: it holds -∞ at 3, 1'),
                ('ternary', {'1,1': -1, '2,1': 2, '3,1': 0}, 'W is not ternary: it holds 2 at 2, 1'), ('boolean', {'1,1': -1, '2,1': 1, '3,1': 0}, 'W is not boolean: it holds -1 at 1, 1'),
                ('probability', {'1,1': 0, '2,1': 1, '3,1': {'n': 3, 'd': 2, 'k': 0}}, 'W is not probability: it holds 1.5 at 3, 1'), ('rational', {'1,1': half, '2,1': inf, '3,1': 2}, 'W is not rational: it holds ∞ at 2, 1'),
                ('real', {'1,1': half, '2,1': 2, '3,1': inf}, 'W is not real: it holds ∞ at 3, 1'), ('real', {'1,1': none, '2,1': 2, '3,1': 3}, 'W is not real: it holds None at 1, 1'),
                ('integer?', {'1,1': none, '2,1': half, '3,1': 3}, 'W is not integer or None: it holds 0.5 at 2, 1'), ('none', {'1,1': none, '2,1': none, '3,1': 3}, 'W is not None: it holds 3 at 3, 1'),
                ('extended', {'1,1': none, '2,1': inf, '3,1': 3}, 'W is not extended: it holds None at 1, 1')):
            self.assertEqual(self.says(entries, holds), (why, {'code': 'type', 'node': 'w'}), holds)
        for holds, entries in (('natural', {'1,1': 1, '2,1': 2, '3,1': 3}), ('whole', {'1,1': 0, '2,1': 2, '3,1': True}), ('integer', {'1,1': -7, '2,1': 2, '3,1': 0}), ('ternary', {'1,1': -1, '2,1': 1, '3,1': 0}),
                               ('boolean', {'1,1': 1, '2,1': 0, '3,1': False}), ('probability', {'1,1': 0, '2,1': 1, '3,1': half}), ('rational', {'1,1': half, '2,1': -2, '3,1': 0}), ('real', {'1,1': {'sym': 'e^2'}, '2,1': -2, '3,1': 0}),
                               ('extended', {'1,1': inf, '2,1': '-inf', '3,1': 0}), ('any', {'1,1': inf, '2,1': half, '3,1': 0}), ('any?', {'1,1': none, '2,1': half, '3,1': inf}), ('natural?', {'1,1': none, '2,1': 4, '3,1': 1}),
                               ('none', {'1,1': none, '2,1': none, '3,1': none}), ('natural', {'1,1': {'expr': '1/0'}, '2,1': 4, '3,1': 1}), ('extended', {'1,1': {'expr': 'inf - inf'}, '2,1': 4, '3,1': 1})):      # an entry that is itself an error is not held against a promise
            self.assertEqual(self.says(entries, holds), (None, None), holds)

    def test_what_is_made_of_it_has_no_value_and_an_answer_without_a_broken_promise_has_no_codes(self):
        g = self.graph({'1,1': 1, '2,1': 2, '3,1': -3}, 'natural')
        g['nodes']['v'] = {'op': 'variable', 'inputs': [], 'type': dict(g['nodes']['w']['type']), 'name': 'V', 'named': True, 'defined': 'entries', 'entries': {'1,1': 1, '2,1': 1, '3,1': 1}}
        g['nodes']['s'] = {'op': 'add', 'inputs': ['w', 'v'], 'type': dict(g['nodes']['w']['type'])}
        out = ask(g, [{'node': 's', 'cells': [[1, 1]]}, {'node': 'v', 'cells': [[1, 1]]}])
        self.assertEqual(out['errors'], {'s': 'W is not natural: it holds -3 at 3, 1'})
        self.assertEqual(out['codes'], {'s': {'code': 'type', 'node': 'w'}})
        self.assertNotIn('codes', ask(g, [{'node': 'v', 'cells': [[1, 1]]}]))

    def test_the_first_entry_is_by_row_then_column_then_inner_position(self):
        a = np.zeros((2, 3, 2, 2), dtype=np.float32)
        a[1, 2, 0, 1] = -1
        a[0, 0, 1, 0] = -2
        self.assertEqual(A.outside(a, 'whole', False), (0, 1, (1, 2), -1.0))
        self.assertIsNone(A.outside(a, 'integer', False))
        self.assertEqual(A.outside(A.row([1, None, 0.5]), 'natural', True), (0, 2, (), 0.5))
        self.assertEqual(A.outside(A.row([1, None, 0.5]), 'real', False), (0, 1, (), None))

    def test_a_boolean_that_breaks_a_promise_of_none_is_written_1_or_0_as_on_the_page(self):
        self.assertEqual(self.says({'1,1': True, '2,1': {'none': True}, '3,1': {'none': True}}, 'none')[0], 'W is not None: it holds 1 at 1, 1')      # tests/spaces.test.js has the same sentence of spaces.js
        self.assertEqual(self.says({'1,1': {'none': True}, '2,1': False, '3,1': {'none': True}}, 'none')[0], 'W is not None: it holds 0 at 2, 1')

    def test_an_inner_position_past_nine_is_after_the_second_as_on_the_page(self):
        """One entry with an inner axis of 12, -5 at inner positions 2 and 10: "at 1, 1, 2", which is what the page
        says of the same graph (tests/spaces.test.js), where the keys were once compared as text."""
        entries = {'1,1,%d' % k: (-5 if k in (2, 10) else 1) for k in range(1, 13)}
        t = {'cols': 1, 'rows': 1, 'colsName': None, 'rowsName': None, 'inner': [{'length': 12, 'name': None}]}
        g = {'version': 3, 'functions': {}, 'spaces': {}, 'blocks': {}, 'nodes': {'d': {'op': 'variable', 'inputs': [], 'type': t, 'name': 'D', 'named': True, 'defined': 'entries', 'entries': entries, 'holds': 'natural'}}}
        self.assertEqual(validate(g), [])
        self.assertEqual(ask(g, [{'node': 'd', 'cells': [[1, 1, 1]]}])['errors'], {'d': 'D is not natural: it holds -5 at 1, 1, 2'})

    def test_the_sentences_are_the_pages_own_for_a_shape_a_product_made_of_it_and_what_an_arrow_takes(self):
        from .support import fixture
        g = next(G['graph'] for G in fixture('graphs.json') if G['name'] == 'promises broken by a value')
        want = {'v:Wb': ('Wb is not natural: it holds -3 at 3, 1', 'v:Wb'), 'matmul(v:Wb,v:Wu)': ('Wb is not natural: it holds -3 at 3, 1', 'v:Wb'),
                'apply(v:X;f:lin)': ('in is not natural: it holds -4 at 2, 2', 'apply(v:X;f:lin)'), 'v:Out': ('in is not natural: it holds -4 at 2, 2', 'apply(v:X;f:lin)'),
                'mapalong(v:N;f:g;rows;1;2;2)': ('in is not natural: it holds -6 at 2, 1 in run 2', 'mapalong(v:N;f:g;rows;1;2;2)')}      # (tests/spaces.test.js holds evaluate.js to the same sentences)
        out = ask(g, [{'node': i, 'cells': [[1, 1]]} for i in want])
        for i, (why, node) in want.items():
            self.assertEqual((out['errors'].get(i), out['codes'].get(i)), (why, {'code': 'type', 'node': node}), i)
