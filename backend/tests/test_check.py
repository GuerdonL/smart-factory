"""check.py: validate, against graph.js's on the same graphs. Needs only the standard library."""
import copy
import os
import re
import time
import unittest

from .support import ROOT, T, changed, fixture, graph_of, variable
from backend.check import RULES, data_path, validate


class SameAsGraphJs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.graphs = fixture('graphs.json')
        cls.mutations = fixture('mutations.json')

    def test_every_graph_graph_js_built_is_accepted(self):
        self.assertGreaterEqual(len(self.graphs), 20)
        for g in self.graphs:
            self.assertEqual(validate(g['graph']), [], g['name'])

    def test_the_fixtures_hold_every_operation(self):
        seen = {n['op'] for g in self.graphs for n in g['graph']['nodes'].values()}
        self.assertEqual(seen, set(RULES))

    def test_every_changed_graph_is_judged_as_graph_js_judges_it(self):
        self.assertGreater(len(self.mutations), 5000)
        self.assertGreater(sum(m['valid'] for m in self.mutations), 500)      # both kinds, in number
        for m in self.mutations:
            g = self.graphs[m['graph']]
            said = validate(changed(g['graph'], m))
            self.assertEqual(said == [], m['valid'], '%s, %s %s: graph.js %s it, and here: %s' % (g['name'], '.'.join(m['path']), 'dropped' if m.get('drop') else 'set to %r' % (m.get('set'),), 'accepts' if m['valid'] else 'refuses', said[:2]))
            self.assertTrue(all(isinstance(s, str) for s in said))

    def test_the_table_has_graph_js_operations_and_no_others(self):
        with open(os.path.join(ROOT, 'graph.js'), encoding='utf8') as f:
            text = f.read()
        table = text[text.index('export const OPS = {'):text.index('/* the functions a node belongs to')]
        self.assertEqual(set(re.findall(r'^  (\w+): \{ inputs:', table, re.M)), set(RULES))


class OnItsOwn(unittest.TestCase):
    def good(self):
        return graph_of({'a': variable(2, 2, [[1, 2], [3, 4]]), 'b': {'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'identity'},
                         'matmul(a,b)': {'op': 'matmul', 'inputs': ['a', 'b'], 'type': T(2, 2)}})

    def test_a_type_may_gain_fields(self):
        g = self.good()
        self.assertEqual(validate(g), [])
        for n in g['nodes'].values():
            n['type'] = dict(n['type'], axes=[{'length': 2, 'name': None}], inner=0)
        self.assertEqual(validate(g), [])
        del g['nodes']['a']['type']['rowsName']
        self.assertNotEqual(validate(g), [])

    def test_it_answers_for_any_json_value_and_never_raises(self):
        for junk in [None, 7, 'graph', [], {}, {'version': 1}, {'version': 1, 'nodes': [], 'functions': {}, 'spaces': {}, 'blocks': {}}, graph_of({'a': None}), graph_of({'a': []}), graph_of({'a': {'op': {}}}),
                     graph_of({'a': {'op': 'variable', 'inputs': [['a']]}}), graph_of({'a': {'op': '__class__', 'inputs': []}}), graph_of({}, {'f': 3}, {'top': 4}, {'b': {}}),
                     graph_of({'a': dict(variable(1, 1, [[1]]), entries={'1,1': {'expr': 7}})}),
                     graph_of({'a': variable(1, 1, [[1]])}, spaces={'top': {'owner': None, 'pieces': [7], 'arrows': [[]], 'tiles': [{'tile': 't:x', 'blocks': [[1]], 'arrows': [{}], 'node': None, 'error': None}]}})]:
            said = validate(junk)
            self.assertTrue(isinstance(said, list) and said and all(isinstance(s, str) for s in said), repr(junk)[:80])

    def test_a_cycle_is_refused_through_inputs_and_through_a_function(self):
        g = self.good()
        g['nodes']['t1'] = {'op': 'transpose', 'inputs': ['t2'], 'type': T(2, 2)}
        g['nodes']['t2'] = {'op': 'transpose', 'inputs': ['t1'], 'type': T(2, 2)}
        self.assertIn('the nodes form a cycle', validate(g))
        g = self.good()
        g['nodes']['p'] = {'op': 'param', 'inputs': [], 'type': T(2, 2), 'within': ['f:f']}
        g['nodes']['body'] = {'op': 'apply', 'inputs': ['p'], 'type': T(2, 2), 'fn': 'f:f', 'within': ['f:f']}
        g['functions']['f:f'] = {'input': 'p', 'body': 'body'}
        self.assertIn('the nodes form a cycle', validate(g))

    def test_a_graph_twenty_thousand_deep_is_checked_and_quickly(self):
        g = graph_of({'n0': variable(1, 1, [[1]])})
        for k in range(1, 20000):
            g['nodes']['n%d' % k] = {'op': 'transpose', 'inputs': ['n%d' % (k - 1)], 'type': T(1, 1)}
        began = time.monotonic()
        self.assertEqual(validate(g), [])
        self.assertLess(time.monotonic() - began, 5)
        deep = value = {}
        for _ in range(5000):
            value['x'] = {}
            value = value['x']
        g = self.good()
        g['nodes']['a']['more'] = deep
        self.assertNotEqual(validate(g), [])      # as graph.js: nothing is read more than 200 deep

    def test_formulas_are_read_and_what_they_name_is_checked(self):
        for expr, ok in [('$1 * 2', True), ('$2', False), ('__import__("os")', False), ('eval($1)', False), ('$1.__class__', False), ('(' * 5000 + '1' + ')' * 5000, False), ('index.x + $1', True)]:
            g = self.good()
            g['nodes']['c'] = dict(variable(1, 1, [[{'expr': expr}]]), inputs=['a'])
            self.assertEqual(validate(g) == [], ok, expr[:40])

    def test_the_bounds_of_a_formula_are_graph_js_s(self):
        """The same cases, with the same verdicts, as FORMULA_BOUNDS in tests/graph.test.js."""
        for expr, ok in [('+'.join(['1'] * 5000), True), ('+'.join(['1'] * 5000) + '+', False), ('+'.join(['$1'] * 3334), False), ('(' * 64 + '$1' + ')' * 64, True), ('(' * 65 + '$1' + ')' * 65, False),
                         ('-' * 64 + '1', True), ('-' * 65 + '1', False), ('2' + '^2' * 64, True), ('2' + '^2' * 65, False), ('√' * 64 + '4', True), ('√' * 65 + '4', False),
                         ('abs(' * 64 + '1' + ')' * 64, True), ('abs(' * 65 + '1' + ')' * 65, False), ('(' * 5000 + '1' + ')' * 5000, False), ('1' * 10000, True), ('1' * 10001, False)]:
            g = self.good()
            g['nodes']['c'] = dict(variable(1, 1, [[{'expr': expr}]]), inputs=['a'])
            self.assertEqual(validate(g) == [], ok, '%s… (%d)' % (expr[:30], len(expr)))

    def test_a_data_path_is_one_file_under_data(self):
        for ok in ['data/a.csv', 'data/My Weights-2.v1.csv']:
            self.assertEqual(data_path(ok), ok)
        for no in ['a.csv', 'data/a.json', 'data/../a.csv', 'data/..csv', 'data/sub/a.csv', '/data/a.csv', 'data/.a.csv', 'data\\a.csv', 'data/a.csv\0', 'data/a\0.csv', 'data/a.csv\n', 'DATA/a.csv', 'data/' + 'a' * 81 + '.csv', None, 7, {}, ['data/a.csv']]:
            self.assertIsNone(data_path(no), repr(no))
