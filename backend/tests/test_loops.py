"""Tiles with a step (phase 9C): loop, and a repeat with fn and state, over arrays; and the step limit.

That the backend gives the page's answers for every fixture loop is test_evaluate.SameAnswers (the graphs named
"loops: …" and "by hand: loop…" in backend/fixtures/graphs.json, made from tests/looping.js); that both validators
judge every changed graph alike is test_check.SameAsGraphJs. Here: what the page does not work out."""
import copy
import unittest

from .support import HAVE_NUMPY, fixture, needs_numpy
from backend import limits
from backend.check import VERSION, validate

if HAVE_NUMPY:
    from backend import evaluate as E
    from .test_evaluate import whole


def named(name):
    return copy.deepcopy(next(g['graph'] for g in fixture('graphs.json') if g['name'] == name))


def tile(g):
    return next(t for t in g['spaces']['top']['tiles'] if t['tile'] == 't:T')


class Validate(unittest.TestCase):
    def test_a_loop_and_a_step_need_version_5(self):
        g = named('by hand: loop')
        self.assertEqual(VERSION, 5)
        self.assertEqual(validate(g), [])
        for version in (1, 2, 3, 4):
            said = validate(dict(g, version=version))
            self.assertTrue(any('which needs version 5, and the graph says version %d' % version in s for s in said), said)

    def test_each_refusal_in_graph_js_s_words(self):
        def bad(change, why):
            g = named('by hand: loop')
            change(g)
            said = validate(g)
            self.assertTrue(any(why in s for s in said), said)
        bad(lambda g: g['nodes']['param(f:1)']['type'].update(rows=3), 'its step takes 1 × 3 and one cell is 1 × 2')
        bad(lambda g: g['nodes']['lp']['state'].update(cols=2), 'its state runs past its pattern')
        bad(lambda g: g['nodes']['lp'].update(state={'col': 0, 'row': 0, 'cols': 1, 'rows': 2}), 'a state block holds something other than its own typed entries')
        bad(lambda g: g['nodes']['lp'].update(count=0), 'count is a whole number, at least 1, "inf", or { input } naming its last input')
        bad(lambda g: g['nodes']['lp'].update(count=True), 'count is a whole number')
        bad(lambda g: g['nodes']['lp'].update(until=2), 'until is null or the place of the stop block among its inputs')
        bad(lambda g: g['nodes']['lp'].update(across='many'), 'across is a whole number, at least 1, or "inf"')
        bad(lambda g: g['nodes']['lp'].pop('fn'), 'fn is a function id and state is { col, row, cols, rows }, both or neither')
        bad(lambda g: g['nodes']['rep'].pop('state'), 'both or neither')
        bad(lambda g: g['nodes']['lp'].update(extra=1), 'a loop holds no extra')
        bad(lambda g: [tile(g).pop('loop'), tile(g).pop('step')], "a loop that is no tile's")
        bad(lambda g: tile(g).pop('step'), 'its step is an arrow and its loop a loop, both or neither')
        bad(lambda g: g['nodes']['s'].pop('within'), 's: within names the tiles none and it belongs to t:T')      # a state block follows its cell


@needs_numpy
class Loops(unittest.TestCase):
    def test_the_running_total_is_9_and_its_cells_show_0_3_4_8(self):
        g = named('loops: the running total')
        self.assertEqual(whole(g, tile(g)['loop']), [[9.0]])
        self.assertEqual(whole(g, tile(g)['node']), [[3.0, 1.0, 4.0, 1.0], [0.0, 3.0, 4.0, 8.0]])

    def test_a_loop_the_page_gives_up_on_after_256_steps_is_finished_here(self):
        g = named('loops: more steps than are worked out in the browser')
        self.assertEqual(whole(g, tile(g)['loop']), [[300 * 301 / 2]])
        rows = whole(g, tile(g)['node'])
        self.assertEqual((rows[0][299], rows[1][0], rows[1][1], rows[1][299]), (300.0, 0.0, 1.0, 299 * 300 / 2))      # every cell with its state

    def test_stop_when_true_and_a_count_settled_when_run(self):
        g = named('loops: Stop when true')
        self.assertEqual(whole(g, tile(g)['loop']), [[6.0]])
        g = named('loops: a count settled only when it is run')
        self.assertEqual(whole(g, tile(g)['loop']), [[15.0]])
        g = named('by hand: loop, a count that is no whole number')
        self.assertEqual(whole(g, 'lp'), [[{'err': 'that has no value'}]])      # an entry with no value, as on the page

    def test_a_tile_with_a_step_in_a_function_has_a_state_for_each_thing_the_function_is_given(self):
        # by hand (tests/looping.js: inFunction): f(x) = 2x, so f(5) = 10, f(7) = 14 and f along [5; 7] is [10; 14], whatever was asked before
        want = {'fa': [10.0], 'fb': [14.0], 'fx': [10.0, 14.0]}
        for order in (['fa', 'fb', 'fx'], ['fb', 'fa', 'fx'], ['fx', 'fb', 'fa']):
            g = named('by hand: loop, in a function')
            run = E.Run(g)      # one run, so that what the first remembered is there for the next
            got = {i: [float(E.A.item(run.value(i), r, 0)) for r in range(g['nodes'][i]['type']['rows'])] for i in order}
            self.assertEqual(got, want, order)

    def test_a_tile_with_a_step_in_a_step_starts_from_what_that_step_was_given(self):
        # by hand (tests/looping.js: inStep): s' = 2s + c with c = 1, 2, 3: the cells hold 0, 1, 4 and the loop gives 11
        for order in (['lp', 'rep'], ['rep', 'lp']):
            g = named('by hand: loop, in a step')
            run = E.Run(g)
            got = {i: [[float(E.A.item(run.value(i), r, c)) for c in range(g['nodes'][i]['type']['cols'])] for r in range(g['nodes'][i]['type']['rows'])] for i in order}
            self.assertEqual(got, {'lp': [[11.0]], 'rep': [[1.0, 2.0, 3.0], [0.0, 1.0, 4.0]]}, order)

    def test_a_count_that_is_true_is_one_step_and_false_is_no_count(self):
        g = named('by hand: loop, a count that is true')      # as on the page: true counts as 1, false as 0
        self.assertEqual(whole(g, 'lp'), [[1.0]])
        g = named('by hand: loop, a count that is false')
        self.assertEqual(whole(g, 'lp'), [[{'err': 'that has no value'}]])

    def test_no_end_and_no_stop_block_runs_until_stopped(self):
        g = named('loops: no end and no stop block')
        self.assertEqual(whole(g, tile(g)['loop']), 'it runs until stopped: its count is infinite and it has no stop block')

    def test_the_step_limit_and_its_sentence(self):
        self.assertEqual(limits.MAX_STEPS, 1_000_000)
        g = named('loops: more steps than are worked out in the browser')
        was = E.MAX_STEPS
        E.MAX_STEPS = 50
        try:
            self.assertEqual(whole(g, tile(g)['loop']), 'not stopped after 50 steps: a loop is stopped then')
            never = named('loops: Stop when true')      # S >= 4 is true at the fourth cell: within the limit it stops, and with the limit under that it is stopped
            self.assertEqual(whole(never, tile(never)['loop']), [[6.0]])
            E.MAX_STEPS = 2
            self.assertEqual(whole(never, tile(never)['loop']), 'not stopped after 2 steps: a loop is stopped then')
        finally:
            E.MAX_STEPS = was

    def test_twenty_thousand_steps_keep_two_states_and_few_values(self):
        g = named('by hand: loop, 256 steps')
        n = 20_000
        g['nodes']['lp'].update(count=n, across=n)
        g['nodes']['rep'].update(across=n)
        g['nodes']['rep']['type']['cols'] = n
        self.assertEqual(validate(g), [])
        run = E.Run(g)
        got = run.value('lp')
        self.assertAlmostEqual(float(E.A.item(got, 0, 0)) / (n * (n + 1) / 2), 1.0, places=3)      # (32-bit sums)
        self.assertLessEqual(max(len(v) for v in run.stepped.values()), 2)      # the state before and the state now
        self.assertLessEqual(len(run.kept), E.MAX_KEPT)


if __name__ == '__main__':
    unittest.main()
