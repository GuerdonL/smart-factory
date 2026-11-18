"""formula.py: the parser written for the formula language. Needs only the standard library."""
import math
import time
import unittest

from .support import Plain, close
from backend.formula import Wrong, axis_of, evaluate, formula_ok, names_in, parse, parse_symbolic, reads_index
from backend.limits import MAX_FORMULA, MAX_NESTING


def worked(text, **names):
    def leaf(name):
        if name.lower() not in names:
            raise KeyError(name)
        return float(names[name.lower()])
    return evaluate(parse(text), leaf, Plain)


class Reading(unittest.TestCase):
    def test_arithmetic_as_expression_js_reads_it(self):
        for text, want in [('1 + 2 * 3', 7), ('(1 + 2) * 3', 9), ('2^3^2', 512), ('-2^2', -4), ('2^-1', .5), ('6/4', 1.5), ('1.25 + .75', 2), ('2(3+1)', 8), ('2√3', 2 * math.sqrt(3)),
                           ('√-4 + 0 * 0', math.nan), ('∜16', 2), ('√√16', 2), ('3 × 4 ÷ 2 − 1', 5), ('2·3', 6), ('1 − −1', 2), ('10 - 2 - 3', 5), ('2 * 3 / 4 * 2', 3), ('- - 3', 3), ('+3', 3),
                           ('1/0', math.nan), ('inf', math.inf), ('-INF', -math.inf), ('∞ - ∞', math.nan), ('0 * infinity', math.nan), ('true + true', 2), ('False', 0),
                           ('2 > 3', 0), ('2 <= 2', 1), ('2 ≠ 3', 1), ('2 ≤ 1', 0), ('3 ≥ 3', 1), ('1 == 1 && 2 != 2', 0), ('0 || 3', 1), ('!0', 1), ('!3', 0), ('1 + 2 == 3', 1), ('1 < 2 == 1', 1),
                           ('select(2 > 3, 1/0, 5)', 5), ('select(1, 7, 1/0)', 7), ('select(1/0, 1, 2)', math.nan), ('max(2, 3) + min(2, 3)', 5), ('abs(-3)', 3), ('sqrt(9)', 3),
                           ('exp(1)', math.e), ('ln(exp(2))', 2), ('tanh(0)', 0), ('erf(inf)', 1), ('exp(-inf)', 0), ('ln(0)', -math.inf), ('(-8)^(1/3)', -2), ('(-8)^(2/3)', 4), ('(-4)^(1/2)', math.nan),
                           ('0^0', 1), ('0^-1', math.nan), ('inf^0', math.nan), ('1^inf', math.nan), ('2^inf', math.inf), ('2^-inf', 0), ('MAX(1, 2)', 2), ('2 3'.replace(' ', '*'), 6)]:
            got = worked(text)
            self.assertTrue(close(got, float(want)), '%s came to %r, not %r' % (text, got, want))

    def test_an_odd_root_is_decided_from_the_formula_as_written_never_from_a_float(self):
        for text, want in [('(0-8)^(1/3)', -2), ('(0-8)^(2/3)', 4), ('(0-32)^0.2', -2), ('(0-32)^(0.6)', -8), ('(0-8)^(1/1025)', -(8 ** (1 / 1025))), ('(0-8)^(-1/3)', -.5), ('(0-8)^-(1/3)', -.5),
                           ('(0-8)^((2-1)/(1+2))', -2), ('(0-8)^(2/6)', -2),
                           ('(0-8)^0.33333334', math.nan), ('(0-8)^0.333333333333333333', math.nan), ('(0-8)^(1/2)', math.nan), ('(0-8)^(3/4)', math.nan), ('(0-8)^0.5', math.nan),
                           ('(0-8)^(1/x)', math.nan), ('(0-8)^(x/9)', math.nan), ('(0-8)^(1/3 + x - x)', math.nan), ('(0-8)^sqrt(1/9)', math.nan), ('(0-8)^(1/3)^1', math.nan),
                           ('8^(1/3)', 2), ('(0-8)^2', 64), ('(0-8)^(4/2)', 64), ('(0-8)^(0-1)', -.125)]:
            got = worked(text, x=3)
            self.assertTrue(close(got, float(want)), '%s came to %r, not %r' % (text, got, want))
        from backend.formula import odd_root, rational
        self.assertEqual(odd_root(parse('1/3')), (1, 3))
        self.assertEqual(odd_root(parse('0.2')), (1, 5))
        self.assertEqual(odd_root(parse('2/6')), (1, 3))
        self.assertIsNone(odd_root(parse('1/2')))
        self.assertIsNone(odd_root(parse('3')))
        self.assertIsNone(odd_root(parse('1/0')))
        self.assertIsNone(odd_root(parse('inf')))
        self.assertIsNone(rational(parse('+'.join('1/%d' % k for k in range(3, 1200, 2)))))      # (not followed past what a fraction of this size is worth)

    def test_names_are_the_callers_to_say(self):
        self.assertEqual(worked('$1 + $2 * x', **{'$1': 1, '$2': 2, 'x': 5}), 11)
        self.assertEqual(worked('2x + index.x', x=3, **{'index.x': 4}), 10)
        self.assertEqual(worked('max', max=3), 3)      # a function's name with no bracket is a name like any other
        self.assertEqual(names_in('select($1 > i, $2, Index.Y) + inf + true + x.'.rstrip('.')), ['$1', 'i', '$2', 'Index.Y', 'x'])
        self.assertEqual(axis_of('Index.X'), 'x')
        self.assertEqual(axis_of('index.z'), None)
        self.assertTrue(reads_index('1 + index.y'))
        self.assertFalse(reads_index('index + y.x'))

    def test_what_cannot_be_read_is_refused_with_why(self):
        for text, why in [('1 +', 'cannot be read'), ('(1 + 2', 'bracket is not closed'), ('max(1)', 'max takes two values'), ('select(1, 2)', 'select takes three'), ('1 2', 'cannot be read'), ('√', 'nothing under it'),
                          ('1 = 2', 'cannot read "="'), ('a & b', 'cannot read "&"'), ('@[b1:x] + 1', 'capsule'), ('"x"', 'cannot read'), ('a[0]', 'cannot read "["'), ('a;b', 'cannot read ";"'),
                          ('x.__class__', None), ('', 'cannot be read'), ('abs()', 'abs takes one value'), ('1,2', 'cannot be read'), ('$', 'cannot read "$"'), ('λ', 'cannot read')]:
            if why is None:
                self.assertEqual(names_in(text), [text])      # dots are part of a name, and a name is only ever looked up
                continue
            with self.assertRaises(Wrong) as e:
                parse(text)
            self.assertIn(why, str(e.exception), text)
        with self.assertRaises(Wrong):
            parse(7)

    def test_what_a_graph_may_hold(self):
        for text, most, arrow, ok in [('$1 + $2', 2, False, True), ('$3', 2, False, False), ('$0', 2, False, False), ('$01', 2, False, False), ('index.x * 2', 0, False, True), ('x + i + j', 0, True, True),
                                      ('x', 0, False, False), ('max(x, 0)', 0, True, True), ('Keys.x', 0, True, False), ('eval(x)', 0, True, False), ('__import__', 5, True, False), ('', 0, True, False),
                                      ('  ', 0, True, False), ('inf + TRUE', 0, False, True), ('((', 0, False, False), ('@[b:x]', 1, True, False), ('exp', 0, True, False)]:
            self.assertEqual(formula_ok(text, most, arrow=arrow), ok, text)
        self.assertTrue(formula_ok('', 0, empty=True))
        self.assertFalse(formula_ok(None, 0, empty=True))
        self.assertFalse(formula_ok(['x'], 0))

    def test_a_symbolic_value_as_the_solver_writes_it(self):
        for text, want in [('1+sqrt(2)', 1 + math.sqrt(2)), ('e^2', math.e ** 2), ('log(2)', math.log(2)), ('2*pi', 2 * math.pi), ('(-1/2)*sqrt(3)', -math.sqrt(3) / 2), ('(1208925819614629174706177/1)^(1/2)', 2.0 ** 40)]:
            got = evaluate(parse_symbolic(text), lambda n: {'e': math.e, 'pi': math.pi}[n], Plain)
            self.assertTrue(close(got, want), text)


class Hostile(unittest.TestCase):
    """Nothing typed is ever executed, and nothing typed is slow to refuse."""

    def quick(self, text):
        began = time.monotonic()
        try:
            parse(text)
            ok = True
        except Wrong:
            ok = False
        self.assertLess(time.monotonic() - began, 1.0, 'reading %d characters took too long' % len(text))
        return ok

    def test_names_from_python_are_only_names(self):
        for text in ['__import__("os").system("id")', "__import__('os')", 'eval(1)', 'exec(1)', 'open(1)', 'os.system(1)', '().__class__.__bases__', 'lambda: 1', '[x for x in y]', 'a if b else c', '1; import os', '`id`', '$(id)']:
            self.assertFalse(formula_ok(text, 9, arrow=True), text)
        # one that does read is a tree of names and nothing more: what a name stands for is asked of the caller, who knows only its own
        seen = []
        evaluate(parse('__builtins__ + __import__ * globals'), lambda n: seen.append(n) or 1.0, Plain)
        self.assertEqual(seen, ['__builtins__', '__import__', 'globals'])
        with self.assertRaises(KeyError):
            worked('__import__ + 1')

    def test_very_deep_nesting_is_refused_at_once(self):
        for text in ['(' * 100000 + '1' + ')' * 100000, '-' * 5000 + '1', '√' * 5000 + '4', '2' + '^2' * 5000, '!' * 200 + '1', 'abs(' * 3000 + '1' + ')' * 3000]:
            self.assertFalse(self.quick(text))
        self.assertTrue(self.quick('(' * (MAX_NESTING - 1) + '1' + ')' * (MAX_NESTING - 1)))      # the boundary: this deep is read
        self.assertFalse(self.quick('(' * (MAX_NESTING + 1) + '1' + ')' * (MAX_NESTING + 1)))

    def test_a_long_formula_is_read_without_going_deep_and_one_too_long_is_refused(self):
        text = '+'.join(['1'] * 2500)
        self.assertEqual(worked(text), 2500)      # a long sum is walked with a list, not the stack
        self.assertFalse(self.quick('1+' * (MAX_FORMULA // 2) + '1'))
        self.assertFalse(self.quick('9' * (MAX_FORMULA + 1)))

    def test_huge_numbers_are_infinities_not_long_waits(self):
        began = time.monotonic()
        self.assertEqual(worked('9^9^9^9'), math.inf)
        self.assertEqual(worked('9' * 5000), math.inf)
        self.assertEqual(worked('10^(10^10) * 0 + 1'.replace('* 0', '* 1') + ' > 5'), 1)
        self.assertEqual(worked('exp(10^6)'), math.inf)
        self.assertLess(time.monotonic() - began, 1.0)
