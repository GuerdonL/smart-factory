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
        for version, good in ((1, True), (2, True), (3, True), (4, False), (0, False), ('3', False), (None, False)):
            self.assertEqual(validate(graph_of({'a': variable(1, 1, [[NONE]])}, version=version)) == [], good, version)


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

    def test_none_is_false(self):
        x, y = self.row('none', 'none', 'none', 3, 'none'), self.row(3, 0, 'none', 'none', 'err')
        self.assertEqual(says(A.binary('&&', x, y)), [[0.0, 0.0, 0.0, 0.0, 'err']])
        self.assertEqual(says(A.binary('||', x, y)), [[1.0, 0.0, 0.0, 1.0, 'err']])
        self.assertEqual(says(A.call('!', [x])), [[1.0, 1.0, 1.0, 0.0, 1.0]])
        # select(None, a, b) is b; what is chosen may itself be None; a condition with no value has none
        c, a, b = self.row('none', 1, 0, 'err', 1), self.row(10, 'none', 30, 40, 50), self.row(-1, -2, 'none', -4, 'none')
        self.assertEqual(says(A.call('select', [c, a, b])), [[-1.0, 'none', 'none', 'err', 50.0]])
        self.assertEqual(says(A.call('select', [A.nothing(), A.number(1), A.number(2)]).reshape(1, 1)), [[2.0]])

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
