"""Conditions (phase 9B): choose, and the source that holds None. graph.js has the rules and evaluate.js the meaning;
here they are held for the backend, which branches: the condition is worked out and reduced to one truth, and then
one side is worked out and the other never.

The fixtures hold the same cases against evaluate.js (test_evaluate.SameAnswers: "by hand: choose" and
"conditions"); what is here is each rule on its own, what differs from the page (a condition with an entry never
given has no value here), and the measurements: a side of 16,000,000 numbers that is not chosen is never made."""
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
        self.assertEqual(VERSION, 4)
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
        self.assertEqual(whole(g, 'c'), 'Bad has no value (loop)')

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
