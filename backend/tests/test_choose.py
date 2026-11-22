"""Conditions (phase 9B): choose, and the source that holds None. graph.js has the rules and evaluate.js the meaning;
here they are held for the backend, which branches: the condition is worked out and reduced to one truth, and then
one side is worked out and the other never.

The fixtures hold the same cases against evaluate.js (test_evaluate.SameAnswers: "by hand: choose" and
"conditions"); what is here is each rule on its own, what differs from the page (a condition with an entry never
given has no value here), and the measurements: a side of 16,000,000 numbers that is not chosen is never made."""
import itertools
import json
import time
import tracemalloc
import unittest

from .support import HAVE_NUMPY, T, all_cells, graph_of, needs_numpy, variable
from backend.check import VERSION, validate

if HAVE_NUMPY:
    import numpy as np
    from backend import arrays as A
    from backend import evaluate as E
    from backend import run as R
    from backend.evaluate import Run, Trouble

NONE = {'none': True}
ROOM = 2 << 30


def G(nodes, functions=None, version=4):
    return graph_of(nodes, functions, version=version)


def CH(c, a, b, cols=2, rows=2, **more):
    return dict({'op': 'choose', 'inputs': [c, a, b], 'type': T(cols, rows)}, **more)


def sides():
    return {'a': variable(2, 2, [[1, 2], [3, 4]], 'A'), 'b': variable(2, 2, [[-1, -2], [-3, -4]], 'B')}


def ask(graph, want, room=ROOM):
    return json.loads(json.dumps(R.run(json.dumps({'graph': graph, 'want': want}).encode(), None, room)))


def whole(graph, node, room=ROOM):
    out = ask(graph, [{'node': node, 'cells': all_cells(graph['nodes'][node]['type'])}], room)
    if node in out['errors'] or '*' in out['errors']:
        return out['errors'].get(node) or out['errors']['*']
    t = graph['nodes'][node]['type']
    cells = {(c, r): v for c, r, v in out['results'][node]['cells']}
    return [[cells[(c, r)] for c in range(1, t['cols'] + 1)] for r in range(1, t['rows'] + 1)]


A2, B2 = [[1.0, 2.0], [3.0, 4.0]], [[-1.0, -2.0], [-3.0, -4.0]]


class Validate(unittest.TestCase):
    """These need no NumPy."""

    def of(self, ta, tb, tc=None, out=None, version=4):
        v = lambda t: dict(variable(1, 1, [[None]]), type=t)
        return G({'c': v(tc or T(1, 1)), 'a': v(ta), 'b': v(tb), 'ch': {'op': 'choose', 'inputs': ['c', 'a', 'b'], 'type': out or ta}}, version=version)

    def test_the_version_is_4_and_the_older_ones_are_read(self):
        self.assertEqual(VERSION, 6)
        for version in (1, 2, 3, 4):
            self.assertEqual(validate(G({'a': variable(1, 1, [[7]])}, version=version)), [])

    def test_its_two_sides_are_one_size_whatever_size_its_condition_is(self):
        self.assertEqual(validate(self.of(T(2, 3), T(2, 3))), [])
        self.assertEqual(validate(self.of(T(2, 3), T(2, 3), T(5, 4))), [])
        self.assertEqual(validate(self.of(T(2, 3, None, 'key'), T(2, 3))), [])
        self.assertEqual(validate(self.of(T(2, 3, [2]), T(2, 3, [2]), T(1, 1, [3]))), [])
        for ta, tb in ((T(2, 3), T(3, 2)), (T(2, 3), T(2, 4)), (T(2, 3, None, 'key'), T(2, 3, None, 'query')), (T(2, 3, None, None, 'r'), T(2, 3, None, None, 's')),
                       (T(2, 3, [2]), T(2, 3)), (T(2, 3, [2]), T(2, 3, [3])), (T(2, 3, [(2, 'k')]), T(2, 3, [(2, 'q')]))):
            self.assertEqual(validate(self.of(ta, tb)), ['ch: its two sides are not one size'], (ta, tb))

    def test_its_type_is_the_first_sides(self):
        self.assertEqual(validate(self.of(T(2, 3), T(2, 3, None, 'key'))), [])
        self.assertEqual(len(validate(self.of(T(2, 3), T(2, 3, None, 'key'), None, T(2, 3, None, 'key')))), 1)
        self.assertEqual(len(validate(self.of(T(2, 3), T(2, 3), None, T(3, 2)))), 1)

    def test_it_takes_exactly_three_inputs(self):
        for inputs in (['c', 'a'], ['c', 'a', 'b', 'b'], []):
            g = self.of(T(2, 2), T(2, 2))
            g['nodes']['ch']['inputs'] = inputs
            self.assertTrue(validate(g))

    def test_its_value_is_the_space_of_both_sides(self):
        t = lambda value, cols=2: dict(T(cols, 2), value=value)
        g = G({'c': dict(variable(1, 2, [[True], [0]]), type=dict(T(1, 2), value='boolean')), 'a': dict(variable(2, 2, [[1, 2], [3, 4]]), type=t('natural')), 'e': {'op': 'source', 'inputs': [], 'type': t('none'), 'kind': 'none'},
               'ch': {'op': 'choose', 'inputs': ['c', 'a', 'e'], 'type': t('natural?')}})
        self.assertEqual(validate(g), [])
        g['nodes']['ch']['type']['value'] = 'natural'
        self.assertEqual(validate(g), ['ch: its value is natural and its inputs give natural?'])
        g['nodes']['ch']['type']['value'] = 'natural?'
        g['nodes']['e']['type']['value'] = 'boolean'
        self.assertEqual(validate(g)[0], 'e: its value is boolean and its inputs give none')

    def test_they_hold_their_own_fields_and_no_other(self):
        for k, v in (('fn', 'mul'), ('formula', 'x'), ('kind', 'zeros'), ('name', 'A')):
            g = self.of(T(2, 2), T(2, 2))
            g['nodes']['ch'][k] = v
            self.assertEqual(validate(g), ['ch: a choose holds no %s' % k])
        v = lambda t: dict(variable(1, 1, [[None]]), type=t)
        within = G({'p': {'op': 'param', 'inputs': [], 'type': T(1, 1), 'within': ['f:1']}, 'a': v(T(2, 2)), 'b': v(T(2, 2)), 'ch': {'op': 'choose', 'inputs': ['p', 'a', 'b'], 'type': T(2, 2), 'within': ['f:1']}}, {'f:1': {'input': 'p', 'body': 'ch'}})
        self.assertEqual(validate(within), [])      # within is every node's
        none = lambda **more: G({'e': dict({'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'none'}, **more)})
        for k, v in (('seed', 1), ('holds', 'any'), ('entries', {}), ('dist', 'uniform')):
            self.assertEqual(validate(none(**{k: v})), ['e: a source of None holds no %s' % k])

    def test_a_choose_and_a_source_of_none_need_version_4(self):
        for version in (1, 2, 3):
            self.assertEqual(validate(self.of(T(2, 2), T(2, 2), version=version)), ['ch: it holds a choose, which needs version 4, and the graph says version %d' % version])
            self.assertEqual(validate(G({'e': {'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'none'}}, version=version)), ['e: it holds a source of None, which needs version 4, and the graph says version %d' % version])
        self.assertEqual(validate(G({'e': {'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'none'}})), [])
        self.assertEqual(validate(G({'e': {'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'none', 'path': 'data/a.csv'}})), ['e: only a file has a path'])
        self.assertEqual(validate(G({'e': {'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'None'}})), ['e: kind is "None"'])


@needs_numpy
class Truth(unittest.TestCase):
    def test_the_truth_of_a_whole_matrix_is_three_valued(self):
        row = lambda *xs: A.row(list(xs))
        for values in ((0, 0, 5), (0, None, -1), (float('inf'),), (float('nan'), 2), (0.5,)):      # one entry that is a number other than 0 settles it, beside an entry with no value too
            self.assertIs(A.truth(row(*values)), True, values)
        for values in ((0, 0), (0, None), (None, None), (0,), (-0.0,)):      # every entry 0 or None
            self.assertIs(A.truth(row(*values)), False, values)
        for values in ((float('nan'),), (0, float('nan')), (None, float('nan'))):      # an entry with no value, and none true
            self.assertIsNone(A.truth(row(*values)), values)
        self.assertIs(A.truth(A.empty(3, 2, (4,))), False)
        self.assertIs(A.truth(A.full(3, 2, 0.0, (4,))), False)
        deep = A.full(1, 1, 0.0, (2, 3))
        deep[1, 2, 0, 0] = 7      # at one inner position
        self.assertIs(A.truth(deep), True)

    def test_an_answer_says_the_truth_of_the_whole_matrix_not_of_the_entries_asked_for(self):
        big = lambda kind: G({'s': {'op': 'source', 'inputs': [], 'type': T(300, 300), 'kind': kind}})
        self.assertIs(ask(big('zeros'), [{'node': 's', 'cells': [[1, 1]]}])['results']['s']['truth'], False)
        self.assertIs(ask(big('none'), [{'node': 's', 'cells': []}])['results']['s']['truth'], False)
        self.assertIs(ask(big('identity'), [{'node': 's', 'cells': [[2, 1]]}])['results']['s']['truth'], True)      # the entry asked for is 0, and the matrix is true
        lost = dict(variable(2, 1, [[0, None]]), entries={'1,1': 0, '2,1': {'err': 'divide by zero'}})
        self.assertIsNone(ask(G({'v': lost}), [{'node': 'v', 'cells': [[1, 1]]}])['results']['v']['truth'])

    def test_what_lies_under_a_none_is_not_looked_at_and_a_large_matrix_is_read_in_pieces(self):
        held = A.Held(np.array([[np.nan, 0.0]], dtype=np.float32), np.array([[True, False]]))      # a None whose number, beside it, is not 0
        self.assertIs(A.truth(held), False)
        self.assertIs(A.truth(A.Held(np.array([[7.0, 0.0]], dtype=np.float32), np.array([[True, False]]))), False)
        self.assertIsNone(A.truth(A.Held(np.array([[np.nan, np.nan]], dtype=np.float32), np.array([[True, False]]))))
        for inner in ((), (3,), (2, 2)):      # and every way an array is cut gives what the whole gives
            was = A.TRUTH_AT_ONCE
            try:
                A.TRUTH_AT_ONCE = 5
                for last, want in ((0.0, False), (2.0, True), (np.nan, None)):
                    a = np.zeros(inner + (4, 7), dtype=np.float32)
                    a[(-1,) * a.ndim] = last
                    self.assertIs(A.truth(a), want, (inner, last))
                    self.assertIs(A.truth(A.Held(a, np.zeros(a.shape, dtype=bool))), want, (inner, last))
                    gone = np.zeros(a.shape, dtype=bool)
                    gone[(-1,) * a.ndim] = True
                    self.assertIs(A.truth(A.Held(a, gone)), False, (inner, last))
            finally:
                A.TRUTH_AT_ONCE = was
        big = A.Held(np.zeros((4000, 4000), dtype=np.float32), np.zeros((4000, 4000), dtype=bool))      # the largest there is, with a mask
        tracemalloc.start()
        self.assertIs(A.truth(big), False)
        peak = tracemalloc.get_traced_memory()[1]
        tracemalloc.stop()
        self.assertLess(peak, 8 << 20)      # (45 MB when its flags were made for the whole of it at once)

    def test_empty_is_none_at_every_entry(self):
        e = A.empty(2, 3, (2,))
        self.assertEqual((A.shape(e), A.inner(e), A.nones(e)), ((2, 3), (2,), 12))
        self.assertTrue(A.is_none(e, 1, 2, (1,)))
        self.assertEqual(A.summary(e), (None, None, None))


@needs_numpy
class Chosen(unittest.TestCase):
    def test_true_false_and_none(self):
        g = G(dict(sides(), yes=variable(1, 1, [[True]]), one=variable(1, 1, [[1]]), no=variable(1, 1, [[False]]), zero=variable(1, 1, [[0]]), nil=variable(1, 1, [[NONE]]),
                   t=CH('yes', 'a', 'b'), t1=CH('one', 'a', 'b'), f=CH('no', 'a', 'b'), f0=CH('zero', 'a', 'b'), n=CH('nil', 'a', 'b')))
        self.assertEqual(validate(g), [])
        for node in ('t', 't1'):
            self.assertEqual(whole(g, node), A2, node)
        for node in ('f', 'f0', 'n'):
            self.assertEqual(whole(g, node), B2, node)

    def test_a_condition_of_any_size_counts_as_a_whole_matrix(self):
        g = G(dict(sides(), some=variable(3, 2, [[0, 0, 5], [NONE, False, 0]]), none=variable(2, 2, [[0, NONE], [False, 0]]), all_none=variable(2, 1, [[NONE, NONE]]),
                   s=CH('some', 'a', 'b'), z=CH('none', 'a', 'b'), n=CH('all_none', 'a', 'b')))
        self.assertEqual((whole(g, 's'), whole(g, 'z'), whole(g, 'n')), (A2, B2, B2))

    def test_a_condition_with_an_entry_never_given_has_no_value_here_whatever_its_other_entries(self):
        # ruling 14: the backend never guesses. The page takes one true entry beside an unknown one as true
        g = G(dict(sides(), open=variable(1, 1, [[None]], 'Open'), part=variable(2, 1, [[None, 1]], 'Part'), u=CH('open', 'a', 'b'), p=CH('part', 'a', 'b')))
        self.assertEqual(whole(g, 'u'), 'unknown entries in Open')
        self.assertEqual(whole(g, 'p'), 'unknown entries in Part')

    def test_a_condition_whose_truth_is_not_known_has_no_value(self):
        lost = dict(variable(2, 1, [[0, None]]), entries={'1,1': 0, '2,1': {'err': 'divide by zero'}})
        settled = dict(variable(2, 1, [[0, None]]), entries={'1,1': {'err': 'divide by zero'}, '2,1': 3})
        g = G(dict(sides(), lost=lost, settled=settled, e=CH('lost', 'a', 'b'), s=CH('settled', 'a', 'b')))
        self.assertEqual(whole(g, 'e'), 'unknown: its condition has an entry with no value, and none that is true')
        self.assertEqual(whole(g, 's'), A2)      # one true entry settles it

    def test_a_condition_that_is_an_error_is_an_error(self):
        g = G(dict(sides(), bad=dict(variable(1, 1, [[1]], 'Bad'), error={'code': 'loop', 'note': ''}), c=CH('bad', 'a', 'b')))
        self.assertEqual(whole(g, 'c'), 'Bad has no value (a cycle)')      # the error code loop is said as a cycle: a loop is a tile with a step

    def test_an_error_on_the_side_not_chosen_does_no_harm(self):
        bad = dict(variable(2, 2, [[1, 1], [1, 1]], 'Bad'), error={'code': 'size', 'note': '5 × 6 ≠ 2 × 2'})
        part = variable(2, 2, [[None, 1], [1, 1]], 'Part')
        g = G(dict(sides(), yes=variable(1, 1, [[True]]), no=variable(1, 1, [[False]]), bad=bad, part=part,
                   tb=CH('yes', 'a', 'bad'), fb=CH('no', 'a', 'bad'), bt=CH('no', 'bad', 'b'), tp=CH('yes', 'a', 'part'), fp=CH('no', 'a', 'part'),
                   after={'op': 'add', 'inputs': ['tb', 'tp'], 'type': T(2, 2)}, after_bad={'op': 'add', 'inputs': ['a', 'fb'], 'type': T(2, 2)}))
        self.assertEqual((whole(g, 'tb'), whole(g, 'bt'), whole(g, 'tp')), (A2, B2, A2))
        self.assertEqual(whole(g, 'after'), [[2.0, 4.0], [6.0, 8.0]])
        self.assertEqual(whole(g, 'fb'), 'Bad has no value (size: 5 × 6 ≠ 2 × 2)')      # chosen, it is what it would be of any node
        self.assertEqual(whole(g, 'after_bad'), 'Bad has no value (size: 5 × 6 ≠ 2 × 2)')
        self.assertEqual(whole(g, 'fp'), 'unknown entries in Part')

    def test_a_promise_broken_on_the_side_not_chosen_is_never_held(self):
        w = variable(2, 2, [[1, -3], [2, 2]], 'W', holds='natural')
        g = G(dict(sides(), yes=variable(1, 1, [[True]]), no=variable(1, 1, [[False]]), w=w, t=CH('yes', 'a', 'w'), f=CH('no', 'a', 'w')))
        self.assertEqual(whole(g, 't'), A2)
        out = ask(g, [{'node': 'f', 'cells': [[1, 1]]}])
        self.assertEqual((out['errors'], out['codes']), ({'f': 'W is not natural: it holds -3 at 2, 1'}, {'f': {'code': 'type', 'node': 'w'}}))

    def test_the_source_of_none_and_inner_data(self):
        deep = lambda fill: {'op': 'variable', 'inputs': [], 'type': T(2, 1, [2]), 'name': 'D', 'named': True, 'defined': 'entries',
                             'entries': {'%d,1,%d' % (c, k): fill + c + 10 * k for c in (1, 2) for k in (1, 2)}}
        ci = {'op': 'variable', 'inputs': [], 'type': T(1, 1, [3]), 'name': 'C', 'named': True, 'defined': 'entries', 'entries': {'1,1,1': 0, '1,1,2': NONE, '1,1,3': 2}}
        g = G(dict(sides(), no=variable(1, 1, [[0]]), e={'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'none'}, fe=CH('no', 'a', 'e'), s={'op': 'add', 'inputs': ['fe', 'a'], 'type': T(2, 2)},
                   ai=deep(0), bi=deep(100), ci=ci, ti=dict(CH('ci', 'ai', 'bi'), type=T(2, 1, [2])), fi=dict(CH('no', 'ai', 'bi'), type=T(2, 1, [2])), ei={'op': 'source', 'inputs': [], 'type': T(2, 1, [2]), 'kind': 'none'}))
        self.assertEqual(validate(g), [])
        self.assertEqual(whole(g, 'e'), [[NONE, NONE], [NONE, NONE]])
        self.assertEqual(whole(g, 'fe'), [[NONE, NONE], [NONE, NONE]])
        self.assertEqual(whole(g, 's'), [[NONE, NONE], [NONE, NONE]])      # None with anything is None
        out = ask(g, [{'node': n, 'cells': all_cells(g['nodes'][n]['type'])} for n in ('ti', 'fi', 'ei')])
        self.assertEqual([c[-1] for c in out['results']['ti']['cells']], [11.0, 12.0, 21.0, 22.0])
        self.assertEqual([c[-1] for c in out['results']['fi']['cells']], [111.0, 112.0, 121.0, 122.0])
        self.assertEqual([c[-1] for c in out['results']['ei']['cells']], [NONE] * 4)
        self.assertEqual(out['results']['ei']['min'], None)

    def test_inside_a_function_it_has_a_value_for_each_thing_the_function_is_given(self):
        g = G(dict(sides(), e={'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'none'}, p={'op': 'param', 'inputs': [], 'type': T(1, 1), 'within': ['f:1']}, body=CH('p', 'a', 'e', within=['f:1']),
                   yes=variable(1, 1, [[True]]), nil=variable(1, 1, [[NONE]]), y1={'op': 'apply', 'inputs': ['yes'], 'type': T(2, 2), 'fn': 'f:1'}, y0={'op': 'apply', 'inputs': ['nil'], 'type': T(2, 2), 'fn': 'f:1'},
                   col=variable(1, 3, [[1], [0], [NONE]]), runs={'op': 'mapalong', 'inputs': ['col'], 'type': T(2, 6), 'fn': 'f:1', 'axis': 'rows', 'start': 1, 'span': 1, 'count': 3}), {'f:1': {'input': 'p', 'body': 'body'}})
        self.assertEqual(validate(g), [])
        self.assertEqual((whole(g, 'y1'), whole(g, 'y0')), (A2, [[NONE, NONE], [NONE, NONE]]))
        self.assertEqual(whole(g, 'runs'), A2 + [[NONE, NONE]] * 4)


@needs_numpy
class OnlyTheChosenSide(unittest.TestCase):
    """The backend branches. n by n is 16,000,000 numbers, as many as any one node may hold (limits.MAX_ENTRIES)."""
    N = 4000

    def graph(self):
        n, t = self.N, T(self.N, self.N)
        return G({'yes': variable(1, 1, [[True]]), 'no': variable(1, 1, [[0]]), 'cheap': {'op': 'source', 'inputs': [], 'type': t, 'kind': 'ones'},
                  'n1': {'op': 'noise', 'inputs': [], 'type': t, 'seed': 1, 'dist': 'normal', 'key': 'n1'}, 'n2': {'op': 'noise', 'inputs': [], 'type': t, 'seed': 2, 'dist': 'normal', 'key': 'n2'},
                  'dear': {'op': 'matmul', 'inputs': ['n1', 'n2'], 'type': t}, 'ch': {'op': 'choose', 'inputs': ['yes', 'cheap', 'dear'], 'type': t}, 'other': {'op': 'choose', 'inputs': ['no', 'dear', 'cheap'], 'type': t}})

    def test_a_side_of_16_000_000_numbers_that_is_not_chosen_is_never_worked_out(self):
        g = self.graph()
        self.assertEqual(validate(g), [])
        made, was = [], dict(E.OPS)
        try:
            for op in was:      # every node that is worked out, by its operation
                E.OPS[op] = (lambda rule, op: lambda n, at: (made.append((op, at.id)), rule(n, at))[1])(was[op], op)
            for node in ('ch', 'other'):
                del made[:]
                work = Run(g, room=ROOM)
                tracemalloc.start()
                began = time.monotonic()
                value = work.value(node)
                took, (_, peak) = time.monotonic() - began, tracemalloc.get_traced_memory()
                tracemalloc.stop()
                self.assertEqual(sorted(made), sorted([('choose', node), ('variable', 'yes' if node == 'ch' else 'no'), ('source', 'cheap')]), node)      # the condition, the chosen side, and nothing of the other
                self.assertEqual({k[0] for k in work.kept}, {node, 'yes' if node == 'ch' else 'no', 'cheap'})
                self.assertEqual((A.shape(value), A.item(value, 3999, 3999)), ((self.N, self.N), 1.0))
                self.assertLess(peak, 3 * 4 * self.N * self.N, node)      # one array of 64 MB was made, and room for a copy: never the three of the other side and the room a product works in
                self.assertLess(took, 5, node)      # (the product of two 4,000 by 4,000 matrices alone takes many times as long)
        finally:
            E.OPS.update(was)

    def test_through_a_request_too_and_what_is_wrong_with_the_other_side_is_not_looked_for(self):
        g = self.graph()
        g['nodes']['n1'] = dict(variable(1, 1, [[1]], 'Lost'), type=T(self.N, self.N), entries={}, error={'code': 'no-source', 'note': ''})      # the side not chosen is an error as well
        began = time.monotonic()
        out = ask(g, [{'node': 'ch', 'cells': [[1, 1], [4000, 4000]]}, {'node': 'other', 'cells': [[2, 2]]}])
        self.assertEqual(out['errors'], {})
        self.assertEqual((out['results']['ch']['cells'], out['results']['other']['cells']), ([[1, 1, 1.0], [4000, 4000, 1.0]], [[2, 2, 1.0]]))
        self.assertLess(time.monotonic() - began, 8)

    def test_for_memory_it_counts_its_condition_and_the_heavier_of_its_sides(self):
        g = self.graph()
        work, each = Run(g, room=ROOM), self.N * self.N
        self.assertEqual(work.weight('ch'), each + 1 + 3 * each)      # itself, yes, and dear with its two noises: never cheap as well
        self.assertEqual(work.weight('other'), work.weight('ch'))      # whichever side is the heavier
        self.assertEqual(work.needs('ch')['most'], each)
        light = G({'yes': g['nodes']['yes'], 'cheap': g['nodes']['cheap'], 'same': dict(g['nodes']['cheap'], kind='zeros'), 'ch': {'op': 'choose', 'inputs': ['yes', 'cheap', 'same'], 'type': T(self.N, self.N)}})
        self.assertEqual(Run(light, room=ROOM).weight('ch'), 2 * each + 1)
        # a run is refused, before anything is made, by what it may come to hold: the heavier side is counted though it is not the one taken
        self.assertIn('more than the 700 MB this backend may take for a run', ask(g, [{'node': 'ch', 'cells': [[1, 1]]}], room=700 << 20)['errors']['ch'])
        self.assertEqual(ask(light, [{'node': 'ch', 'cells': [[1, 1]]}], room=700 << 20)['results']['ch']['cells'], [[1, 1, 1.0]])

    def test_the_room_to_work_is_that_of_the_largest_thing_in_either_side(self):
        # a small choose one of whose sides is cut out of something large: either side may be the one taken
        big = {'op': 'source', 'inputs': [], 'type': T(3000, 3000), 'kind': 'ones'}
        g = G(dict(sides(), yes=variable(1, 1, [[True]]), no=variable(1, 1, [[0]]), big=big, cut={'op': 'slice', 'inputs': ['big'], 'type': T(2, 2), 'range': {'col': 0, 'row': 0, 'cols': 2, 'rows': 2}},
                   t=CH('yes', 'a', 'cut'), f=CH('no', 'a', 'cut')))
        work = Run(g, room=ROOM)
        self.assertEqual((work.needs('t')['most'], work.needs('t')['room'], work.needs('t')['room_where']), (4, 9_000_000, 'big'))
        self.assertGreater(work.bytes_for('t', 6, 4), 6 * 4 * 9_000_000)
        self.assertEqual((whole(g, 't'), whole(g, 'f')), (A2, [[1.0, 1.0], [1.0, 1.0]]))

    def test_a_chosen_side_worked_out_from_too_much_is_refused_when_it_is_chosen(self):
        huge = {'op': 'source', 'inputs': [], 'type': T(5000, 4000), 'kind': 'ones'}      # 20,000,000 numbers: more than are worked out
        g = G(dict(sides(), yes=variable(1, 1, [[True]]), no=variable(1, 1, [[0]]), huge=huge, cut={'op': 'slice', 'inputs': ['huge'], 'type': T(2, 2), 'range': {'col': 0, 'row': 0, 'cols': 2, 'rows': 2}},
                   t=CH('yes', 'a', 'cut'), f=CH('no', 'a', 'cut')))
        self.assertEqual(whole(g, 't', 8 << 30), A2)      # not chosen: no harm
        self.assertEqual(whole(g, 'f', 8 << 30), '5,000 × 4,000 numbers in what it is worked out from, more than the 16,000,000 that are worked out')
        self.assertEqual(whole(g, 'cut', 8 << 30), '5,000 × 4,000 numbers in what it is worked out from, more than the 16,000,000 that are worked out')      # as it is of the node itself


@needs_numpy
class Counted(unittest.TestCase):
    """Run.weight over chooses: each node visited once however they are nested, and never less than what a run may
    come to hold, whichever side each choose takes."""

    def chain(self, n, shape):
        nodes = {'yes': variable(1, 1, [[True]]), 'no': variable(1, 1, [[0]]), 'leaf': variable(1, 1, [[3]])}
        for i in range(n):
            after = 'c%d' % (i + 1) if i + 1 < n else 'leaf'
            nodes['c%d' % i] = {'op': 'choose', 'inputs': {'unchosen': ['yes', 'leaf', after], 'then': ['yes', after, 'leaf'], 'else': ['no', 'leaf', after], 'both': ['yes', after, after], 'condition': [after, 'leaf', 'leaf']}[shape], 'type': T(1, 1)}
        return G(nodes)

    def test_a_chain_of_chooses_as_deep_as_a_graph_may_be_is_counted_once_a_node_and_worked_out(self):
        import sys
        import threading
        from backend.limits import MAX_NODES
        n, out = MAX_NODES - 3, {}

        def work():      # as service.py runs one: a deep stack, since a value is asked for through what reads it
            for shape in ('unchosen', 'then', 'else', 'both', 'condition'):
                g = self.chain(n, shape)
                began, asked, deps = time.monotonic(), [], Run.deps
                Run.deps = lambda self, i: (asked.append(i), deps(self, i))[1]
                try:
                    counted = Run(g, room=ROOM).weight('c0')
                finally:
                    Run.deps = deps
                out[shape] = (counted, time.monotonic() - began, len(asked), ask(g, [{'node': 'c0', 'cells': [[1, 1]]}]))
        limit, stack = sys.getrecursionlimit(), threading.stack_size(256 << 20)
        sys.setrecursionlimit(1_000_000)
        try:
            t = threading.Thread(target=work)
            t.start()
            t.join()
        finally:
            sys.setrecursionlimit(limit)
            threading.stack_size(stack)
        for shape, (counted, took, asked, answer) in out.items():
            self.assertEqual(counted, n + (1 if shape == 'condition' else 2), shape)      # every choose, the leaf and the one condition: each once
            self.assertLessEqual(asked, 2 * 3 * (n + 3), shape)      # each node and each side asked what it reads twice (once to walk, once to say who reads it), never once for each choose above it
            self.assertLess(took, 10, shape)
            self.assertEqual((answer['errors'], answer['results']['c0']['cells']), ({}, [[1, 1, 3.0]]), shape)
        self.assertEqual(len(out), 5)

    def test_a_thousand_chooses_side_by_side_over_one_shared_chain_take_what_as_many_sums_take(self):
        def flat(op):
            nodes = {'yes': variable(1, 1, [[True]]), 'leaf': variable(1, 1, [[1]])}
            for i in range(4000):
                nodes['d%d' % i] = {'op': 'add', 'inputs': ['d%d' % (i - 1) if i else 'leaf', 'leaf'], 'type': T(1, 1)}
            for k in range(1000):
                nodes['s%d' % k] = {'op': 'add', 'inputs': ['d3999', 'leaf'], 'type': T(1, 1)}
                nodes['c%d' % k] = {'op': 'choose', 'inputs': ['yes', 'leaf', 's%d' % k], 'type': T(1, 1)} if op == 'choose' else {'op': 'add', 'inputs': ['leaf', 's%d' % k], 'type': T(1, 1)}
            nodes['all'] = {'op': 'block', 'inputs': ['c%d' % k for k in range(1000)], 'type': T(1000, 1), 'at': [{'col': k, 'row': 0} for k in range(1000)]}
            began = time.monotonic()
            return Run(G(nodes), room=ROOM).weight('all'), time.monotonic() - began
        (chooses, took), (sums, plain) = flat('choose'), flat('add')
        self.assertEqual(sums, 1000 + 1000 + 1000 + 4000 + 1)
        self.assertEqual(chooses, sums + 1)      # the chain is under every side: all of it may be made, and the condition
        self.assertLess(took, 2 + 20 * plain)

    def test_a_side_that_is_read_outside_the_choose_as_well_does_not_stand_for_the_other(self):
        # the reviewers' case: out is worked out from exactly what plain is, and from ch
        N = 4000
        nz = lambda k: {'op': 'noise', 'inputs': [], 'type': T(N, N), 'seed': k, 'dist': 'uniform', 'key': 'k%d' % k}
        mm = lambda a, b: {'op': 'matmul', 'inputs': [a, b], 'type': T(N, N)}
        for c in ('yes', 'no'):
            g = G({'yes': variable(1, 1, [[True]]), 'no': variable(1, 1, [[0]]), 'x1': nz(1), 'x2': nz(2), 'r': nz(3), 's': nz(4), 'P': mm('x1', 'x2'), 'Q': mm('r', 's'),
                   'ch': {'op': 'choose', 'inputs': [c, 'P', 'Q'], 'type': T(N, N)}, 'out': {'op': 'add', 'inputs': ['ch', 'P'], 'type': T(N, N)}, 'plain': {'op': 'add', 'inputs': ['Q', 'P'], 'type': T(N, N)}})
            work, each = Run(g, room=ROOM), N * N
            self.assertEqual(work.weight('plain'), 7 * each)
            self.assertEqual(work.weight('ch'), each + 1 + 3 * each)      # alone, one side
            self.assertEqual(work.weight('out'), work.weight('plain') + each + 1)      # P whichever side is taken, and Q, which may be
            self.assertGreaterEqual(work.bytes_for('out', 6, 4), work.bytes_for('plain', 6, 4))

    def test_it_is_never_less_than_what_any_choice_of_sides_makes_and_is_exactly_that_where_nothing_is_shared(self):
        import random
        rng = random.Random(9)
        entry, mask = 4, lambda n: n['type']['cols'] * (2 if n['op'] == 'add' else 1)      # a graph of version 4 whose types say no value: every array may hold None
        tight = 0
        for trial in range(400):
            count, shared = rng.randint(2, 12), trial % 2 == 0
            nodes, free = {}, list(range(1, count))
            for i in range(count):
                def below():
                    if shared:
                        return rng.randint(i + 1, count) if i + 1 < count else count
                    return free.pop(0) if free and free[0] > i and rng.random() < 0.8 else count      # each read by one node only: a tree
                op = rng.choice(['add', 'choose', 'choose', 'slice'])
                inputs = [below() for _ in range({'add': 2, 'choose': 3, 'slice': 1}[op])]
                nodes['n%d' % i] = {'op': op, 'inputs': ['n%d' % k if k < count else 'leaf%d' % (rng.randint(0, 2) if shared else 3 * i + at) for at, k in enumerate(inputs)], 'type': T(rng.randint(1, 9), 1)}
            for i in {i for n in list(nodes.values()) for i in n['inputs'] if i.startswith('leaf')}:
                nodes[i] = {'op': 'source', 'inputs': [], 'type': T(rng.randint(1, 9), 1), 'kind': 'ones'}
            chooses = [i for i, n in nodes.items() if n['op'] == 'choose']
            most = 0
            for taken in itertools.product((1, 2), repeat=len(chooses)):
                side, made, todo = dict(zip(chooses, taken)), set(), ['n0']
                while todo:
                    i = todo.pop()
                    if i not in made:
                        made.add(i)
                        n = nodes[i]
                        todo.extend([n['inputs'][0], n['inputs'][side[i]]] if n['op'] == 'choose' else n['inputs'])
                most = max(most, sum(entry * nodes[i]['type']['cols'] + mask(nodes[i]) for i in made))
            work = Run(G(nodes), room=ROOM)
            got = entry * work.weight('n0') + work._masked['n0']
            reached, todo = set(), ['n0']
            while todo:
                i = todo.pop()
                if i not in reached:
                    reached.add(i)
                    todo.extend(nodes[i]['inputs'])
            self.assertGreaterEqual(got, most, nodes)
            self.assertLessEqual(got, sum(entry * nodes[i]['type']['cols'] + mask(nodes[i]) for i in reached), nodes)
            if sum(len(nodes[i]['inputs']) for i in reached) == len(reached) - 1:
                self.assertEqual(got, most, nodes)      # a tree: the heavier side of each choose, exactly
                tight += 1
        self.assertGreater(tight, 150)

    def test_a_choose_whose_condition_has_a_truth_for_each_thing_a_function_is_given_may_take_both_sides(self):
        big = lambda kind: {'op': 'source', 'inputs': [], 'type': T(30, 30), 'kind': kind}
        g = G({'one': big('ones'), 'zero': big('zeros'), 'p': {'op': 'param', 'inputs': [], 'type': T(1, 1), 'within': ['f:1']}, 'body': dict(CH('p', 'one', 'zero', 30, 30), within=['f:1']),
               'col': variable(1, 2, [[1], [0]]), 'runs': {'op': 'mapalong', 'inputs': ['col'], 'type': T(30, 60), 'fn': 'f:1', 'axis': 'rows', 'start': 1, 'span': 1, 'count': 2},
               'yes': variable(1, 1, [[True]]), 'fixed': CH('yes', 'one', 'zero', 30, 30)}, {'f:1': {'input': 'p', 'body': 'body'}})
        self.assertEqual(validate(g), [])
        work = Run(g, room=ROOM)
        work.value('runs')
        self.assertEqual({k[0] for k in work.kept} >= {'one', 'zero'}, True)      # both were made, one in each run
        self.assertEqual(work.weight('runs'), 30 * 60 + 2 + 900 + 1 + 900 + 900)      # itself, col, body, p, and both sides
        self.assertEqual(work.weight('fixed'), 900 + 1 + 900)      # one condition, one truth: one side

    def test_a_function_that_applies_itself_is_counted_and_not_walked_for_ever(self):
        g = G({'p': {'op': 'param', 'inputs': [], 'type': T(1, 1), 'within': ['f:1']}, 'a': variable(1, 1, [[1]]), 'b': variable(1, 1, [[2]]),
               'again': {'op': 'apply', 'inputs': ['p'], 'type': T(1, 1), 'fn': 'f:1', 'within': ['f:1']}, 'body': dict(CH('p', 'again', 'b', 1, 1), within=['f:1']),
               'use': {'op': 'apply', 'inputs': ['a'], 'type': T(1, 1), 'fn': 'f:1'}}, {'f:1': {'input': 'p', 'body': 'body'}})
        self.assertEqual(Run(g, room=ROOM).weight('use'), 6)      # use, a, body, p, again, b: every node reached, once
