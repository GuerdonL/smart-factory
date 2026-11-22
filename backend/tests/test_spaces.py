"""spaces.py: the number spaces, held to spaces.js. backend/fixtures/spaces.json is what spaces.js makes of every pair
of spaces and every operation (backend/fixtures/generate.mjs); this file has to say the same of each. These need no
NumPy."""
import unittest

from .support import fixture
from backend import spaces as S
from backend.check import validate
from backend.formula import parse


def pair(key):
    a, b = key.split(' ')
    return a, b


class SameAsSpacesJs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.table = fixture('spaces.json')

    def test_the_nine_spaces_and_which_lies_inside_which(self):
        self.assertEqual(list(S.SPACES), self.table['spaces'])
        self.assertEqual(len(self.table['inside']), 100)
        for key, yes in self.table['inside'].items():
            self.assertEqual(S.inside(*pair(key)), yes, key)

    def test_the_space_of_both_for_every_pair(self):
        self.assertEqual(len(self.table['both']), 21 * 21)
        for key, word in self.table['both'].items():
            self.assertEqual(S.both(*pair(key)), word, key)
        for key, yes in self.table['within'].items():
            self.assertEqual(S.within(*pair(key)), yes, key)
        for key, word in self.table['choice'].items():
            self.assertEqual(S.choice(*pair(key)), word, key)

    def test_every_operation_for_every_pair(self):
        seen = 0
        self.assertEqual(sorted(self.table['binary']), sorted(['+', '-', '*', '/', '^', '==', '!=', '<', '>', '<=', '>=', '&&', '||', 'max', 'min']))
        for op, by in self.table['binary'].items():
            self.assertEqual(len(by), 21 * 21)
            for key, word in by.items():
                self.assertEqual(S.binary(op, *pair(key)), word, '%s %s' % (op, key))
                seen += 1
        self.assertEqual(sorted(self.table['unary']), sorted(['neg', '!', 'abs', 'sqrt', 'exp', 'ln', 'tanh', 'erf']))
        for fn, by in self.table['unary'].items():
            for a, word in by.items():
                self.assertEqual(S.unary(fn, a), word, '%s %s' % (fn, a))
                seen += 1
        for key, word in self.table['sum'].items():
            a, n = key.split(' ')
            self.assertEqual(S.total(a, int(n)), word, key)
        for terms, by in self.table['product'].items():
            for key, word in by.items():
                self.assertEqual(S.product(*pair(key), int(terms)), word, '%s terms, %s' % (terms, key))
                seen += 1
        self.assertGreater(seen, 5000)

    def test_a_word_is_read_the_same(self):
        for word, got in self.table['parse']:
            self.assertEqual(None if S.parse(word) is None else list(S.parse(word)), got, word)
        for no in (None, 7, True, ['real'], {}):
            self.assertIsNone(S.parse(no))

    def test_the_smallest_space_of_a_value(self):
        self.assertGreater(len(self.table['of']), 25)
        for value, word in self.table['of']:
            self.assertEqual(S.of(value), word, value)
        for values, word in self.table['ofAll']:
            self.assertEqual(S.of_all(values), word, values)
        self.assertEqual(S.of(1.0), 'boolean')      # a whole number that JSON wrote with a point is that number
        self.assertEqual(S.of(-2.0), 'integer')
        self.assertEqual(S.of_all([1], ['natural']), 'natural')

    def test_the_space_of_a_formula(self):
        named = ['natural', 'integer?', 'probability']

        def lookup(arrow):
            def name(word):
                if word.startswith('$') and word[1:].isdigit():
                    k = int(word[1:]) - 1
                    return named[k] if 0 <= k < len(named) else None
                low = word.lower()
                if low in ('index.x', 'index.y') or (len(low) == 2 and low[0] == 'k' and low[1] in '123456'):
                    return 'natural'
                return None if not arrow else 'rational' if low == 'x' else 'natural' if low in ('i', 'j') else None
            return name
        self.assertGreater(len(self.table['formulas']), 150)
        for text, arrow, word in self.table['formulas']:
            self.assertEqual(S.formula(parse(text), lookup(arrow)), word, '%s%s' % (text[:60], ' (an arrow\'s)' if arrow else ''))


class NoneAlone(unittest.TestCase):
    """Ruled 21 November 2026: None has a space of its own, none."""

    def test_none_is_read_joined_and_held_within_as_spaces_js_has_it(self):
        self.assertEqual(S.parse('none'), (None, True))
        self.assertIsNone(S.parse('none?'))
        self.assertEqual(S.of({'none': True}), 'none')
        self.assertEqual(S.of_all([{'none': True}, None]), 'none')
        for s in S.SPACES:
            self.assertEqual(S.both('none', s), s + '?')
            self.assertTrue(S.within('none', s + '?'))
            self.assertFalse(S.within('none', s))
            self.assertFalse(S.within(s + '?', 'none'))
            self.assertEqual(S.binary('*', 'none', s), 'none')
            self.assertEqual(S.binary('==', 'none', s), 'boolean')
        self.assertTrue(S.within('none', 'none'))

    def test_a_graph_may_say_none_for_a_value_and_for_a_promise(self):
        t = {'cols': 1, 'rows': 1, 'colsName': None, 'rowsName': None, 'value': 'none'}
        g = {'version': 3, 'functions': {}, 'spaces': {}, 'blocks': {}, 'nodes': {'v': {'op': 'variable', 'inputs': [], 'type': t, 'name': 'V', 'named': True, 'defined': 'entries', 'entries': {'1,1': {'none': True}}, 'holds': 'none'}}}
        self.assertEqual(validate(g), [])
        g['nodes']['v']['type']['value'] = 'none?'
        self.assertNotEqual(validate(g), [])
        g['nodes']['v']['type']['value'] = 'boolean?'
        self.assertNotEqual(validate(g), [])


class NeverFalse(unittest.TestCase):
    """Ruled 21 November 2026: a promise is a type only where the graph alone shows it kept (graph.js says the same)."""

    def graph(self, entries, value, holds='natural'):
        t = {'cols': 2, 'rows': 1, 'colsName': None, 'rowsName': None, 'value': value}
        return {'version': 3, 'functions': {}, 'spaces': {}, 'blocks': {}, 'nodes': {'v': {'op': 'variable', 'inputs': [], 'type': t, 'name': 'V', 'named': True, 'defined': 'entries', 'entries': entries, 'holds': holds}}}

    def test_the_type_is_the_promise_where_the_inferred_space_lies_inside_it_and_else_what_is_worked_out(self):
        self.assertEqual(validate(self.graph({'1,1': 2, '2,1': -3}, 'integer')), [])
        self.assertNotEqual(validate(self.graph({'1,1': 2, '2,1': -3}, 'natural')), [])
        self.assertEqual(validate(self.graph({'1,1': 2, '2,1': 3}, 'integer', 'integer')), [])
        self.assertNotEqual(validate(self.graph({'1,1': 2, '2,1': 3}, 'natural', 'integer')), [])

    def test_nothing_known_lies_inside_every_space(self):
        self.assertEqual(validate(self.graph({}, 'natural')), [])
        self.assertNotEqual(validate(self.graph({}, 'boolean')), [])
        self.assertEqual(validate(self.graph({'1,1': 1}, 'boolean')), [])      # one entry given: what is known is said
        self.assertTrue(S.silent([], []))
        self.assertTrue(S.silent([None, {'err': 'x'}], []))
        self.assertFalse(S.silent([{'none': True}], []))
        self.assertFalse(S.silent([], ['natural']))


class InAGraph(unittest.TestCase):
    def graph(self):
        t = lambda value: {'cols': 2, 'rows': 1, 'colsName': None, 'rowsName': None, 'value': value}
        v = lambda entries, value, **more: dict({'op': 'variable', 'inputs': [], 'type': t(value), 'name': 'v', 'named': True, 'defined': 'entries', 'entries': entries}, **more)
        return {'version': 3, 'functions': {}, 'spaces': {}, 'blocks': {}, 'nodes': {
            'a': v({'1,1': 1, '2,1': 2}, 'whole', holds='whole'), 'c': v({'1,1': 1, '2,1': -1}, 'ternary'), 'n': v({'1,1': {'none': True}, '2,1': {'expr': '2 ^ 3'}}, 'natural?'),
            's': {'op': 'add', 'inputs': ['a', 'c'], 'type': t('integer')}}}

    def test_a_value_follows_by_its_operations_rule(self):
        self.assertEqual(validate(self.graph()), [])
        for change, what in ((lambda g: g['nodes']['c']['type'].update(value='integer'), 'a value its entries do not give'), (lambda g: g['nodes']['s']['type'].update(value='real'), 'a value its inputs do not give'),
                             (lambda g: g['nodes']['c']['type'].update(value='complex'), 'no space'), (lambda g: g['nodes']['c']['type'].update(value=None), 'no word'), (lambda g: g['nodes']['c']['type'].update(holds='ternary'), 'another key'),
                             (lambda g: g['nodes']['a'].update(holds='natural'), 'a promise that is not its value'), (lambda g: g['nodes']['a'].update(holds='complex'), 'a promise that is no space'),
                             (lambda g: g['nodes']['a'].pop('holds'), 'a value that was its promise'), (lambda g: g['nodes']['c']['type'].pop('value'), 'an input that says none is any?')):
            g = self.graph()
            change(g)
            self.assertNotEqual(validate(g), [], what)

    def test_a_symbolic_value_never_spells_none_or_an_infinity_and_any_length_of_digits_is_read(self):
        def g(sym, value):
            return {'version': 3, 'nodes': {'v': {'op': 'variable', 'inputs': [], 'type': {'cols': 1, 'rows': 1, 'colsName': None, 'rowsName': None, 'value': value}, 'name': 'V', 'named': True, 'defined': 'entries', 'entries': {'1,1': {'sym': sym}}}},
                    'functions': {}, 'spaces': {}, 'blocks': {}}
        for sym in ('none', 'None', '∅', 'none + 1', 'inf', '2 * inf', 'Infinity', '∞', '1/∞'):      # each has its one form of its own (graph.js: spells)
            self.assertEqual(validate(g(sym, 'real')), ['v: entry 1,1 holds no value in its stated form'], sym)
        for sym in ('1+sqrt(2)', 'e^(-1)', 'information', 'nonexistent'):
            self.assertFalse([w for w in validate(g(sym, 'real')) if 'stated form' in w], sym)
        nines = '9' * 4301      # more digits than Python reads as a number: told from the digits themselves, as spaces.js tells them
        for sym, value in ((nines, 'natural'), ('-' + nines, 'integer'), ('1/' + nines, 'probability'), (nines + '/7', 'rational'), (nines + '/' + nines, 'probability'), ('0' * 4400, 'boolean'), ('0' * 4400 + '1', 'boolean')):
            self.assertEqual(S.of({'sym': sym}), value, sym[:12])
            self.assertEqual(validate(g(sym, value)), [], sym[:12])
        self.assertRegex(validate(g('1+sqrt(2)', 'complex'))[0], r'^v: its type is not .*and value, one of the ten number spaces')

    def test_a_type_that_says_none_is_not_checked(self):
        g = self.graph()
        for n in g['nodes'].values():
            n['type'].pop('value')
        self.assertEqual(validate(g), [])
        g = self.graph()
        g['nodes']['s']['type'].pop('value')
        self.assertEqual(validate(g), [])
        g = self.graph()
        g['nodes']['c']['holds'] = 'ternary'
        self.assertEqual(validate(g), [])
