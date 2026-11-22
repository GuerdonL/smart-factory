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
        self.assertEqual(whole(g, 'lp'), 'its count comes to 0.5: a count is a whole number, at least 1')      # (on the page every entry is the error)

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
        self.assertEqual(whole(g, 'lp'), 'its count comes to 0: a count is a whole number, at least 1')

    def test_a_count_worked_out_in_floats_is_the_whole_number_it_is_within_rounding_of(self):
        self.assertEqual((E.COUNT_NEAR, E.COUNT_MOST), (1e-5, 1e-2))
        for x, want in ((3.0000002, 3), (2.9999998, 3), (1.0, 1), (0.9999999, 1), (1000.004, 1000), (16777216.0, 16777216), (float('inf'), float('inf'))):
            self.assertEqual(E.whole_count(x), want, x)
        self.assertIsNone(E.whole_count(float('nan')))
        for x, said in ((3.5, '3.5'), (3.001, '3.001'), (1000.02, '1000.02'), (0.4, '0.4'), (0.0, '0'), (-2.0, '-2'), (float('-inf'), '-∞')):
            with self.assertRaises(E.Trouble) as told:
                E.whole_count(x)
            self.assertEqual(str(told.exception), 'its count comes to %s: a count is a whole number, at least 1' % said)
        # (1/7) * 21 and sqrt(2) * sqrt(2) + 1, which are 3 on the page and not 3 in 32-bit floats: three steps, 0 + 1 + 2 + 3
        for text in ('(1/7)*21', 'sqrt(2)*sqrt(2) + 1'):
            g = named('by hand: loop, a count that is an input')
            g['nodes']['n']['entries'] = {'1,1': {'expr': text}}
            self.assertEqual(validate(g), [])
            self.assertEqual(whole(g, 'lp'), [[6.0]], text)
        g['nodes']['n']['entries'] = {'1,1': {'expr': '7/2'}}
        self.assertEqual(whole(g, 'lp'), 'its count comes to 3.5: a count is a whole number, at least 1')

    def test_a_count_the_page_settled_is_taken_as_given(self):
        import json
        from backend import run as R
        g = named('by hand: loop, a count that is an input')
        g['nodes']['n']['entries'] = {'1,1': {'expr': '7/2'}}      # (what the backend would refuse, so that it is seen not to look)
        ask = lambda counts: R.run(json.dumps({'graph': g, 'want': [{'node': 'lp', 'cells': [[1, 1]]}], 'counts': counts}).encode(), None, 2 << 30)
        self.assertEqual(ask({'lp': 3})['results']['lp']['cells'], [[1, 1, 6.0]])
        self.assertIn('its count comes to 3.5', ask({})['errors']['lp'])
        for bad in ({'lp': 0}, {'lp': 2.5}, {'lp': True}, {'lp': 'inf'}, {'c': 2}, {'nowhere': 2}, [], 3):
            self.assertEqual(ask(bad)['errors'], {'*': 'counts gives a whole number, at least 1, to loops whose count is settled when they are run'}, bad)
        fixed = named('by hand: loop')
        out = R.run(json.dumps({'graph': fixed, 'want': [], 'counts': {'lp': 2}}).encode(), None, 2 << 30)      # a loop whose count is written on it takes none
        self.assertIn('*', out['errors'])

    def test_a_loop_in_a_step_keeps_the_states_of_one_pass_and_they_are_counted(self):
        g = named('by hand: loop, in a step')      # the outer step holds an inner tile with a step: one more list of states at every outer step, before
        n = 400
        g['nodes']['lp'].update(count=n, across=n)
        g['nodes']['rep'].update(across=n)
        g['nodes']['rep']['type']['cols'] = n
        g['nodes']['c']['entries'] = {'1,1': {'expr': 'index.x - index.x'}}      # (so that s' = 2s + c stays 0)
        self.assertEqual(validate(g), [])
        run = E.Run(g)
        self.assertEqual(float(E.A.item(run.value('lp'), 0, 0)), 0.0)
        self.assertLessEqual(len(run.stepped), 2)      # the outer tile's, and at most the last inner pass
        self.assertEqual(set(run.stepped), set(run.stepped_cells))
        self.assertEqual(run.stepped_held, sum(E.A.size(a) for kept in run.stepped.values() for a in kept.values()))
        self.assertGreater(run.stepped_held, 0)
        self.assertEqual(run.weight('ilp') - sum(E.numbers(g['nodes'][i]['type']) for i in ('ilp', 'ic', 'is', 'bot', 'param(f:1)', 'ibody', 'itop', 'ibot', 'param(f:3)')), 2)      # two states of one number
        small = E.Run(g, room=1)      # and what is kept is held against the room
        with self.assertRaises(E.Trouble) as told:
            small.value('lp')
        self.assertIn('take more memory than the run may', str(told.exception))

    def test_wants_of_one_loop_are_served_by_one_pass_whatever_their_order(self):
        import json
        import random
        from backend import run as R
        g = named('by hand: loop, 256 steps')
        n = 3000
        g['nodes']['lp'].update(count=n, across=n)
        g['nodes']['rep'].update(across=n)
        g['nodes']['rep']['type']['cols'] = n
        g['nodes']['reader'] = {'op': 'add', 'inputs': ['lp', 'lp'], 'type': g['nodes']['lp']['type']}
        self.assertEqual(validate(g), [])
        cell = lambda k: {'cells': [{'x': k - 1, 'y': 0, 'dx': 0, 'dy': 1, 'cx': k, 'cy': 1, 'of': ['t:T'], 'at': {'c': {'col': 0, 'row': 0}, 's': {'col': 0, 'row': 1}}}]}
        made, real = [0], E.whole_cell

        def counted(*a):
            made[0] += 1
            return real(*a)

        def ask(want):
            made[0] = 0
            out = R.run(json.dumps({'graph': g, 'want': want}).encode(), None, 2 << 30)
            self.assertEqual(out['errors'], {})
            return {k: v['cells'][0][-1] for k, v in out['results'].items()}, made[0]
        E.whole_cell = counted
        try:
            ks = list(range(2, n + 1, 250))
            cells = [{'node': 's', 'as': 's%d' % k, 'binding': cell(k), 'cells': [[1, 1]]} for k in ks]
            want = {'s%d' % k: (k - 1) * k / 2 for k in ks}      # by hand: the state of cell k is 1 + 2 + … + (k - 1)
            up, passes = ask(cells)
            self.assertEqual(up, want)
            self.assertLessEqual(passes, n)
            random.Random(1).shuffle(cells)
            mixed, passes = ask(cells)
            self.assertEqual(mixed, want)
            self.assertLessEqual(passes, n)      # one pass, not one for each want that came out of order
            # the loop, its matrix and a reader of the loop: the matrix's pass serves all three, and the cells are read off it
            three = [{'node': 'lp', 'cells': [[1, 1]]}, {'node': 'reader', 'cells': [[1, 1]]}, {'node': 'rep', 'cells': [[n, 2]]}]
            got, passes = ask(three + cells)
            self.assertEqual(got, dict(want, lp=n * (n + 1) / 2, reader=n * (n + 1), rep=(n - 1) * n / 2))
            self.assertLessEqual(passes, n + 1)
            was = E.MAX_KEPT
            E.MAX_KEPT = 50      # and with next to nothing remembered the answers are the same, and the loop is not made again for its reader
            try:
                few, passes = ask(three + cells)
                self.assertEqual(few, got)
                self.assertLessEqual(passes, n + 1)
            finally:
                E.MAX_KEPT = was
        finally:
            E.whole_cell = real

    def test_a_promise_broken_on_a_step_s_in_names_the_tile_s_node_as_the_page_does(self):
        import json
        from backend import run as R
        g = named('by hand: loop')
        g['nodes']['s']['entries'] = {'1,1': -1}
        g['nodes']['param(f:1)']['type']['value'] = 'natural'
        self.assertEqual(validate(g), [])
        out = R.run(json.dumps({'graph': g, 'want': [{'node': 'lp', 'cells': [[1, 1]]}, {'node': 'rep', 'cells': [[1, 1]]}]}).encode(), None, 2 << 30)
        self.assertEqual(out['errors']['lp'], 'in is not natural: it holds -1 at 1, 2 in cell 1')
        self.assertEqual(out['codes'], {'lp': {'code': 'type', 'node': 'rep'}, 'rep': {'code': 'type', 'node': 'rep'}})      # tests/loops.test.js holds the page to the same node

    def test_the_answer_says_the_cell_a_loop_was_stopped_at(self):
        import json
        from backend import run as R
        g = named('loops: Stop when true')
        lp = tile(g)['loop']
        out = R.run(json.dumps({'graph': g, 'want': [{'node': lp, 'cells': [[1, 1]]}]}).encode(), None, 2 << 30)
        self.assertEqual((out['results'][lp]['cells'], out['results'][lp]['stopped']), ([[1, 1, 6.0]], 4))      # as the page's stoppedAt says of the same loop
        g = named('by hand: loop')
        self.assertNotIn('stopped', R.run(json.dumps({'graph': g, 'want': [{'node': 'lp', 'cells': [[1, 1]]}]}).encode(), None, 2 << 30)['results']['lp'])

    def test_the_fixtures_hold_the_300_step_loop_and_cells_of_tiles_with_an_open_count(self):
        G = {x['name']: x for x in fixture('graphs.json')}
        long = G['loops: more steps than are worked out in the browser']
        lp = tile(long['graph'])['loop']
        self.assertEqual(long['nodes'][lp], {'rows': [[45150]]})      # worked out by evaluate.js with more steps allowed: SameAnswers holds the backend to it
        for name in ('loops: Stop when true', 'loops: no end and no stop block', 'loops: a count settled only when it is run'):
            third = [b for b in G[name]['bound'] if b['binding']['cells'][0]['cx'] == 3]
            self.assertGreaterEqual(len(third), 2, name)
            self.assertTrue(all('rows' in b['answer'] for b in third), name)

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
