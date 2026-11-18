"""evaluate.py and run.py: a graph worked out, against evaluate.js's exact answers; and what is refused."""
import json
import math
import os
import shutil
import tempfile
import time
import unittest

from .support import HAVE_NUMPY, T, all_cells, changed, close, fixture, graph_of, needs_numpy, variable
from backend import limits

if HAVE_NUMPY:
    from backend import run as R
    from backend import arrays as A
    from backend.evaluate import OPS as E_OPS, Run, Trouble, number_of


ROOM = 2 << 30      # the bytes of arrays a run is given in these tests, whatever machine they are run on


def ask(graph, want, root=None, room=ROOM, **more):
    """A request sent as bytes, as the service sends it, and the answer read as JSON would give it back."""
    return json.loads(json.dumps(R.run(json.dumps(dict({'graph': graph, 'want': want}, **more)).encode(), root, room)))


def whole(graph, node, **more):
    out = ask(graph, [{'node': node, 'cells': all_cells(graph['nodes'][node]['type'])}], **more)
    if node in out['errors'] or '*' in out['errors']:
        return out['errors'].get(node) or out['errors']['*']
    t = graph['nodes'][node]['type']
    cells = {(c, r): v for c, r, v in out['results'][node]['cells']}
    return [[cells[(c, r)] for c in range(1, t['cols'] + 1)] for r in range(1, t['rows'] + 1)]


def as_float(v):
    return math.inf if v == 'inf' else -math.inf if v == '-inf' else math.nan if v == 'err' or isinstance(v, dict) else v


@needs_numpy
class SameAnswers(unittest.TestCase):
    """For every graph the browser works out exactly, the floats here equal the exact values within 1e-5 of the
    value's size or 1e-6, whichever is larger. The exact values are evaluate.js's (backend/fixtures)."""

    def test_every_node_of_every_fixture(self):
        graphs = fixture('graphs.json')
        compared = errors = unknown = 0
        for G in graphs:
            g = G['graph']
            asks = [(i, None, a) for i, a in G['nodes'].items()] + [(b['node'], b['binding'], b['answer']) for b in G['bound']]
            out = ask(g, [{'node': i, 'as': str(k), 'binding': b, 'cells': all_cells(g['nodes'][i]['type'])} for k, (i, b, a) in enumerate(asks)])
            self.assertNotIn('*', out['errors'], G['name'])
            for k, (i, b, a) in enumerate(asks):
                at = '%s, %s%s' % (G['name'], i, ' under ' + json.dumps(b)[:60] if b else '')
                res, err = out['results'].get(str(k)), out['errors'].get(str(k))
                self.assertTrue((res is None) != (err is None), at)
                if 'error' in a:      # worked out from a variable that has an error: an error here too
                    self.assertIsNotNone(err, at)
                    errors += 1
                elif 'deferred' in a:
                    continue      # the browser did not work it out: nothing to hold this to
                elif any(v is None for row in a['rows'] for v in row):      # an entry the browser leaves unknown: never a number here
                    self.assertIsNotNone(err, at)
                    self.assertIn('unknown', err, at)
                    unknown += 1
                elif err is not None:      # the browser has every entry, and this reads a variable some of whose other entries are unknown: refused, never guessed
                    self.assertIn('unknown entries in', err, at)
                    self.assertIn(G['name'], ('unknown entries',), at)
                    unknown += 1
                else:
                    cells = {(c, r): v for c, r, v in res['cells']}
                    self.assertEqual((res['cols'], res['rows']), (len(a['rows'][0]), len(a['rows'])), at)
                    for r, row in enumerate(a['rows']):
                        for c, want in enumerate(row):
                            got = as_float(cells[(c + 1, r + 1)])
                            self.assertTrue(close(got, as_float(want)), '%s, entry %d,%d: %r here and %r exactly' % (at, c + 1, r + 1, got, want))
                            compared += 1
        self.assertGreater(compared, 2000)
        self.assertGreater(errors, 5)
        self.assertGreater(unknown, 5)

    def test_a_64_by_64_product_of_fractions(self):
        n = 64
        a = variable(n, n, [[{'n': (r * 7 + c) % 13 + 1, 'd': (r + c) % 5 + 2, 'k': 0} if ((r * 7 + c) % 13 + 1) % ((r + c) % 5 + 2) else 1 + r + c for c in range(n)] for r in range(n)], 'A')
        # (values in their stated form: lowest terms, never a whole number written as a fraction)
        from math import gcd
        for key, v in list(a['entries'].items()):
            if isinstance(v, dict):
                g = gcd(v['n'], v['d'])
                v['n'], v['d'] = v['n'] // g, v['d'] // g
                if v['d'] == 1:
                    a['entries'][key] = v['n']
        b = {'op': 'source', 'inputs': [], 'type': T(n, n), 'kind': 'ones'}
        g = graph_of({'a': a, 'b': b, 'p': {'op': 'matmul', 'inputs': ['a', 'b'], 'type': T(n, n)}})
        got = whole(g, 'p')
        self.assertIsInstance(got, list, got)
        for r in range(n):
            want = sum(number_of(a['entries']['%d,%d' % (c + 1, r + 1)]) for c in range(n))
            self.assertTrue(close(got[r][0], want))


@needs_numpy
class Rules(unittest.TestCase):
    def test_it_never_guesses_an_unknown_entry_is_an_error_naming_the_variable(self):
        g = graph_of({'v:k': variable(2, 2, [[1, 2], [3, None]], 'Keys'), 'v:w': variable(2, 2, [[1, 0], [0, 1]], 'W'), 'p': {'op': 'matmul', 'inputs': ['v:k', 'v:w'], 'type': T(2, 2)},
                      't': {'op': 'transpose', 'inputs': ['p'], 'type': T(2, 2)}, 'x': {'op': 'measure', 'inputs': ['v:k'], 'type': T(1, 1), 'side': 'x'}})
        for node in ['v:k', 'p', 't']:
            self.assertEqual(whole(g, node), 'unknown entries in Keys')
        self.assertEqual(whole(g, 'v:w'), [[1, 0], [0, 1]])
        self.assertEqual(whole(g, 'x'), [[2]])      # its width is a size, and no entry is read for it

    def test_exact_values_become_floats_at_the_leaves(self):
        for v, want in [(7, 7.0), ('inf', math.inf), ('-inf', -math.inf), (True, 1.0), (False, 0.0), ({'n': 3, 'd': 4, 'k': 0}, .75), ({'n': 2, 'k': 1}, math.sqrt(2)), ({'n': -2, 'k': 1}, -math.sqrt(2)),
                        ({'n': 1, 'd': 5, 'k': 2}, .2 ** .25), ({'sym': '1+sqrt(2)'}, 1 + math.sqrt(2)), ({'sym': 'e^2'}, math.e ** 2), ({'sym': '1208925819614629174706176'}, 2.0 ** 80)]:
            self.assertTrue(close(number_of(v), want), repr(v))
        self.assertTrue(math.isnan(number_of({'err': 'missing variable'})))
        for sym in ['x + 1', '__import__("os")', '((', 'foo(2)']:
            with self.assertRaises(Trouble):
                number_of({'sym': sym})
        g = graph_of({'v': variable(2, 1, [[{'sym': 'nonsense(1)'}, 1]])})
        self.assertIn('cannot be read here', whole(g, 'v'))

    def test_exp_of_one_is_e_as_a_32_bit_float(self):
        g = graph_of({'v': variable(2, 1, [[0, 1]]), 'm': {'op': 'map', 'inputs': ['v'], 'type': T(2, 1), 'formula': 'exp(x)'}})
        got = whole(g, 'm')
        self.assertEqual(['%.9g' % v for v in got[0]], ['1', '2.71828175'])

    def test_an_entry_with_no_value_is_that_entry_alone(self):
        g = graph_of({'v': variable(3, 1, [[1, 0, 'inf']]), 'm': {'op': 'map', 'inputs': ['v'], 'type': T(3, 1), 'formula': '1/x'}, 's': {'op': 'map', 'inputs': ['v'], 'type': T(3, 1), 'formula': 'select(x == 0, 0, 1/x)'}})
        out = ask(g, [{'node': 'm', 'cells': all_cells(T(3, 1))}, {'node': 's', 'cells': all_cells(T(3, 1))}])
        self.assertEqual(out['results']['m']['cells'], [[1, 1, 1.0], [2, 1, {'err': 'that has no value'}], [3, 1, 0.0]])
        self.assertEqual((out['results']['m']['min'], out['results']['m']['max'], out['results']['m']['mean']), (0.0, 1.0, 0.5))
        self.assertEqual(out['results']['s']['cells'], [[1, 1, 1.0], [2, 1, 0.0], [3, 1, 0.0]])      # the side not chosen does no harm
        inf = graph_of({'v': variable(2, 1, [['inf', '-inf']])})
        self.assertEqual(ask(inf, [{'node': 'v', 'cells': [[1, 1], [2, 1]]}])['results']['v'], {'cols': 2, 'rows': 1, 'cells': [[1, 1, 'inf'], [2, 1, '-inf']], 'min': '-inf', 'max': 'inf', 'mean': None})

    def noise_graph(self, seed=0, key='b1', cols=4, rows=4, dist='uniform'):
        return graph_of({'n': {'op': 'noise', 'inputs': [], 'type': T(cols, rows), 'seed': seed, 'dist': dist, 'key': key}, 'v:%s' % key: {'op': 'variable', 'inputs': ['n'], 'type': T(cols, rows), 'name': 'N', 'named': True, 'defined': 'source', 'entries': {}}})

    def test_noise_is_the_generators_and_follows_seed_block_and_tick(self):
        from .test_arrays import noise_entry
        import struct
        g = self.noise_graph(5, 'b1')
        got = whole(g, 'v:b1')
        for r in range(4):
            for c in range(4):
                self.assertEqual(got[r][c], struct.unpack('f', struct.pack('f', noise_entry(5, 'b1', c + 1, r + 1, 'uniform')))[0])
        self.assertEqual(whole(g, 'v:b1'), got)      # asked again, the same sixteen numbers
        self.assertTrue(all(0 <= v < 1 for row in got for v in row))
        other = whole(self.noise_graph(6, 'b1'), 'v:b1')
        self.assertTrue(all(a != b for ra, rb in zip(got, other) for a, b in zip(ra, rb)))      # another seed: every one changes
        self.assertNotEqual(whole(g, 'v:b1', tick=1), got)
        wider = whole(self.noise_graph(5, 'b1', 6, 5), 'v:b1')
        self.assertEqual([row[:4] for row in wider[:4]], got)      # resized: no entry that still exists changes

    def test_noise_in_a_tile_the_cell_joins_the_key_and_the_blocks_place_does_not(self):
        from .test_arrays import noise_entry
        import struct
        f32 = lambda x: struct.unpack('f', struct.pack('f', x))[0]

        def tiled(col):      # a 2 by 1 noise block at column `col` of a 4 by 1 pattern, beside a block of zeros, tiled 2 across and 2 down
            z = {'op': 'source', 'inputs': [], 'type': T(2, 1), 'kind': 'zeros'}
            n = {'op': 'noise', 'inputs': [], 'type': T(2, 1), 'seed': 1, 'dist': 'uniform', 'key': 'bn', 'within': ['t:t1']}
            v = {'op': 'variable', 'inputs': ['n'], 'type': T(2, 1), 'name': 'N', 'named': True, 'defined': 'source', 'entries': {}, 'within': ['t:t1']}
            vz = {'op': 'variable', 'inputs': ['z'], 'type': T(2, 1), 'name': 'Z', 'named': True, 'defined': 'source', 'entries': {}}
            rep = {'op': 'repeat', 'inputs': ['v:bn', 'v:bz'], 'type': T(8, 2), 'at': [{'col': col, 'row': 0}, {'col': 2 - col, 'row': 0}], 'pattern': {'cols': 4, 'rows': 1}, 'across': 2, 'down': 2}
            return graph_of({'n': n, 'z': z, 'v:bn': v, 'v:bz': vz, 'rep': rep}, spaces={'top': {'owner': None, 'pieces': [{'blocks': ['bn'], 'rule': None, 'node': 'v:bn', 'error': None}, {'blocks': ['bz'], 'rule': None, 'node': 'v:bz', 'error': None}],
                            'arrows': [], 'tiles': [{'tile': 't:t1', 'blocks': ['bn', 'bz'], 'arrows': [], 'node': 'rep', 'error': None}]}}, blocks={'bn': 'v:bn', 'bz': 'v:bz'})
        from backend.check import validate
        left, right = tiled(0), tiled(2)
        self.assertEqual(validate(left), [])
        a, b = whole(left, 'rep'), whole(right, 'rep')
        cell = lambda m, cx, cy, col: m[cy - 1][(cx - 1) * 4 + col:(cx - 1) * 4 + col + 2]
        outside = [f32(noise_entry(1, 'bn', c, 1, 'uniform')) for c in (1, 2)]
        self.assertEqual(cell(a, 1, 1, 0), outside)      # the first cell holds what the block would hold outside the tile
        seen = set()
        for cx in (1, 2):
            for cy in (1, 2):
                want = [f32(noise_entry(1, 'bn', c, 1, 'uniform', 0, [(cx, cy)])) for c in (1, 2)]
                self.assertEqual(cell(a, cx, cy, 0), want)
                self.assertEqual(cell(b, cx, cy, 2), want)      # moved within the pattern: nothing changes
                seen.add(tuple(want))
        self.assertEqual(len(seen), 4)      # every cell holds different noise
        # asked for as the page asks for one drawn copy: under that cell
        one = ask(left, [{'node': 'v:bn', 'cells': [[1, 1], [2, 1]], 'binding': {'cells': [{'x': 4, 'y': 1, 'dx': 0, 'dy': 0, 'cx': 2, 'cy': 2, 'of': ['t:t1']}]}}])['results']['v:bn']['cells']
        self.assertEqual([v for _, _, v in one], cell(a, 2, 2, 0))

    def test_a_768_by_768_noise_block_times_another_within_a_few_seconds(self):
        n = 768
        g = graph_of({'a': {'op': 'noise', 'inputs': [], 'type': T(n, n), 'seed': 0, 'dist': 'uniform', 'key': 'a'}, 'b': {'op': 'noise', 'inputs': [], 'type': T(n, n), 'seed': 0, 'dist': 'normal', 'key': 'b'},
                      'p': {'op': 'matmul', 'inputs': ['a', 'b'], 'type': T(n, n)}})
        began = time.monotonic()
        out = ask(g, [{'node': 'p', 'cells': [[c, r] for r in (1, 2, 3, n) for c in (1, 2, 3, n)]}])
        self.assertLess(time.monotonic() - began, 5)
        self.assertEqual(len(out['results']['p']['cells']), 16)
        self.assertTrue(all(isinstance(v, float) for _, _, v in out['results']['p']['cells']))


@needs_numpy
class DataFiles(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix='smart-factory-run-')
        self.addCleanup(shutil.rmtree, self.root, True)
        self.g = graph_of({'f': {'op': 'source', 'inputs': [], 'type': T(3, 2), 'kind': 'file', 'path': 'data/w.csv'}, 't': {'op': 'transpose', 'inputs': ['f'], 'type': T(2, 3)}})

    def test_a_file_source_reads_the_projects_file(self):
        for name in ('mine', 'other'):
            os.makedirs(os.path.join(self.root, name), exist_ok=True)
            with open(os.path.join(self.root, name, 'project.json'), 'w') as f:
                f.write('{}')
        self.assertEqual(R.upload('mine', 'data/w.csv', b'a,b,c\n1,2,3\n4,5.5,-6\n', self.root), {'path': 'data/w.csv', 'cols': 3, 'rows': 2})
        self.assertEqual(whole(self.g, 'f', root=None), 'data/w.csv: the project has to be saved under a name before its data files can be read')
        out = R.run(json.dumps({'graph': self.g, 'want': [{'node': 't', 'cells': all_cells(T(2, 3))}], 'project': 'mine'}).encode(), self.root, ROOM)
        self.assertEqual([v for _, _, v in out['results']['t']['cells']], [1, 4, 2, 5.5, 3, -6])
        for project, why in [('other', 'data/w.csv is not in the project other'), ('../mine', 'project is not the name of a project'), (7, 'project is not the name')]:
            out = R.run(json.dumps({'graph': self.g, 'want': [{'node': 'f', 'cells': []}], 'project': project}).encode(), self.root, ROOM)
            self.assertIn(why, json.dumps(out['errors']))

    def test_a_file_of_another_size_than_its_block_is_an_error_saying_both(self):
        os.makedirs(os.path.join(self.root, 'mine'))
        with open(os.path.join(self.root, 'mine', 'project.json'), 'w') as f:
            f.write('{}')
        R.upload('mine', 'data/w.csv', b'1,2\n3,4\n', self.root)
        out = R.run(json.dumps({'graph': self.g, 'want': [{'node': 'f', 'cells': []}], 'project': 'mine'}).encode(), self.root, ROOM)
        self.assertEqual(out['errors']['f'], 'data/w.csv holds 2 × 2 numbers, and its block is 3 × 2: make the block the size of its file')

    def test_a_hostile_path_in_a_graph_never_reaches_a_file(self):
        with open(os.path.join(self.root, 'secret.csv'), 'w') as f:
            f.write('1,2,3\n4,5,6\n')
        for path in ['../secret.csv', 'data/../../secret.csv', '/etc/passwd', 'data/../secret.csv', os.path.join(self.root, 'secret.csv'), 'data/w.csv\0']:
            g = json.loads(json.dumps(self.g))
            g['nodes']['f']['path'] = path
            out = R.run(json.dumps({'graph': g, 'want': [{'node': 'f', 'cells': []}], 'project': 'mine'}).encode(), self.root, ROOM)
            self.assertIn('path is not a file under data/', out['errors']['*'])


@needs_numpy
class Refused(unittest.TestCase):
    """Everything outsized or malformed is refused with a plain reason, quickly, and nothing is raised."""

    def test_a_request_that_is_not_a_request(self):
        for body, why in [(b'', 'not JSON'), (b'{', 'not JSON'), (b'[1, 2]', 'holds no graph'), (b'{"graph": 7}', 'holds no graph'), (b'{"graph": {}, "want": []}', 'not well formed'), (b'{"graph": NaN}', 'not JSON'),
                          (b'{"graph": {"nodes": Infinity}}', 'not JSON'), (b'\xff\xfe', 'not JSON'), (b'[' * 200000, 'nested too deep'), (json.dumps({'graph': {}, 'want': 7}).encode(), 'want is a list'),
                          (json.dumps({'graph': {}, 'want': [], 'tick': -1}).encode(), 'tick is a whole number'), (json.dumps({'graph': {}, 'want': [], 'tick': 'x'}).encode(), 'tick is a whole number')]:
            began = time.monotonic()
            out = R.run(body, None, ROOM)
            self.assertLess(time.monotonic() - began, 2)
            self.assertEqual(out['results'], {})
            self.assertIn(why, out['errors']['*'], body[:30])

    def test_the_limits_each_with_its_reason(self):
        self.assertEqual(R.run(b' ' * (limits.MAX_BODY + 1), None, ROOM)['errors'], {'*': 'the request is larger than 5 MB'})
        many = graph_of({'n%d' % k: {'op': 'source', 'inputs': [], 'type': T(1, 1), 'kind': 'ones'} for k in range(limits.MAX_NODES + 1)})
        self.assertEqual(ask(many, [])['errors'], {'*': 'the graph has 20,001 nodes, more than 20,000'})
        del many['nodes']['n0']
        self.assertEqual(ask(many, [{'node': 'n1', 'cells': [[1, 1]]}])['errors'], {})      # the boundary: 20,000 are worked out
        big = graph_of({'ok': {'op': 'source', 'inputs': [], 'type': T(4000, 4000), 'kind': 'zeros'}, 'big': {'op': 'source', 'inputs': [], 'type': T(4000, 4001), 'kind': 'zeros'},
                        'huge': {'op': 'source', 'inputs': [], 'type': T(10 ** 5, 10 ** 4), 'kind': 'ones'}, 'small': {'op': 'slice', 'inputs': ['huge'], 'type': T(1, 1), 'range': {'col': 0, 'row': 0, 'cols': 1, 'rows': 1}},
                        'wide': {'op': 'measure', 'inputs': ['huge'], 'type': T(1, 1), 'side': 'x'}})
        began = time.monotonic()
        out = ask(big, [{'node': n, 'cells': [[1, 1]]} for n in big['nodes']])
        self.assertLess(time.monotonic() - began, 5)
        self.assertEqual(out['errors'], {'big': '4,000 × 4,001 entries, more than the 16,000,000 that are worked out', 'huge': '100,000 × 10,000 entries, more than the 16,000,000 that are worked out',
                                         'small': '100,000 × 10,000 entries in what it is worked out from, more than the 16,000,000 that are worked out'})
        self.assertEqual(out['results']['wide']['cells'], [[1, 1, 100000.0]])      # a size is read off the type: nothing that large is made
        self.assertEqual(out['results']['ok']['cells'], [[1, 1, 0.0]])      # the boundary: 16,000,000 entries are worked out

    def test_outsized_counts_are_refused_by_their_size_before_anything_is_repeated(self):
        v = variable(1, 1, [[{'expr': 'index.x'}]], 'P', within=['t:t'])
        rep = {'op': 'repeat', 'inputs': ['v:p'], 'type': T(10 ** 9, 10 ** 9), 'at': [{'col': 0, 'row': 0}], 'pattern': {'cols': 1, 'rows': 1}, 'across': 10 ** 9, 'down': 10 ** 9}
        g = graph_of({'v:p': v, 'rep': rep}, spaces={'top': {'owner': None, 'pieces': [], 'arrows': [], 'tiles': [{'tile': 't:t', 'blocks': ['p'], 'arrows': [], 'node': 'rep', 'error': None}]}}, blocks={'p': 'v:p'})
        began = time.monotonic()
        self.assertIn('more than the 16,000,000', whole_error(g, 'rep'))
        m = graph_of({'x': {'op': 'source', 'inputs': [], 'type': T(10 ** 9, 1), 'kind': 'ones'}, 'm': {'op': 'mapalong', 'inputs': ['x'], 'type': T(10 ** 9, 1), 'formula': 'x', 'axis': 'cols', 'start': 1, 'span': 1, 'count': 10 ** 9}})
        self.assertIn('more than the 16,000,000', whole_error(m, 'm'))
        past = graph_of({'x': {'op': 'source', 'inputs': [], 'type': T(4, 1), 'kind': 'ones'}, 'm': {'op': 'mapalong', 'inputs': ['x'], 'type': T(4, 1), 'formula': 'x', 'axis': 'cols', 'start': 1, 'span': 1, 'count': 4,
                                                                                                    'through': [{'tile': 't:o', 'count': 10 ** 12}]}})
        self.assertIn('not well formed', whole_error(past, 'm'))      # its last run would lie past its input
        self.assertLess(time.monotonic() - began, 2)

    def test_a_graph_with_a_cycle_or_a_hostile_formula_is_refused_whole(self):
        g = graph_of({'a': {'op': 'transpose', 'inputs': ['b'], 'type': T(1, 1)}, 'b': {'op': 'transpose', 'inputs': ['a'], 'type': T(1, 1)}})
        self.assertIn('the nodes form a cycle', ask(g, [{'node': 'a', 'cells': []}])['errors']['*'])
        for formula in ['__import__("os").system("touch /tmp/owned")', 'eval(x)', 'x.__class__', '(' * 100000 + 'x', 'x' + '^2' * 5000, '9' * 20000]:
            g = graph_of({'v': variable(1, 1, [[1]]), 'm': {'op': 'map', 'inputs': ['v'], 'type': T(1, 1), 'formula': formula}})
            began = time.monotonic()
            self.assertIn('its formula is one the graph cannot hold', ask(g, [{'node': 'm', 'cells': [[1, 1]]}])['errors']['*'])
            self.assertLess(time.monotonic() - began, 2)
        g = graph_of({'v': variable(1, 1, [[2]]), 'm': {'op': 'map', 'inputs': ['v'], 'type': T(1, 1), 'formula': 'x^x^x^x^x^x^x^x * 10^(10^10)'}})
        self.assertEqual(ask(g, [{'node': 'm', 'cells': [[1, 1]]}])['results']['m']['cells'], [[1, 1, 'inf']])      # huge powers are infinities, at once

    def test_what_is_wanted_is_checked_too(self):
        g = graph_of({'v': variable(2, 1, [[1, 2]])})
        for want, why in [({'node': 'nope', 'cells': []}, 'no such node'), ({'node': 'v', 'cells': [[3, 1]]}, 'it has no entry [3, 1]: it is 2 × 1'), ({'node': 'v', 'cells': [[0, 1]]}, 'it has no entry'),
                          ({'node': 'v', 'cells': [[1.5, 1]]}, 'it has no entry'), ({'node': 'v', 'cells': 'all'}, 'cells is a list'), ({'node': 'v', 'cells': [[1, 1]] * (limits.MAX_CELLS + 1)}, 'cells is a list of at most'),
                          ({'node': 'v', 'cells': [], 'binding': {'params': {'f:x': 'v'}}}, 'its binding gives the function f:x'), ({'node': 'v', 'cells': [], 'binding': {'cells': [{}] * 99}}, 'more than 16 cells')]:
            out = ask(g, [want])
            self.assertIn(why, out['errors'].get(want['node'], ''), want)
        self.assertEqual(ask(g, [7])['errors'], {'*': 'want holds what names no node'})
        self.assertEqual(ask(g, [{'node': 'v', 'cells': [[2, 1]], 'binding': {'cells': [{'x': 'a', 'cx': -5, 'of': [1], 'at': {'v': 3}}], 'params': 9}}])['results']['v']['cells'], [[2, 1, 2.0]])      # a binding of nonsense is a binding of nothing

    def test_nothing_is_raised_whatever_graph_is_sent(self):
        graphs, mutations = fixture('graphs.json'), fixture('mutations.json')
        for m in mutations[::7]:
            g = changed(graphs[m['graph']]['graph'], m)
            nodes = [i for i in (g.get('nodes') if isinstance(g.get('nodes'), dict) else {})][:40]
            out = R.run(json.dumps({'graph': g, 'want': [{'node': i, 'cells': [[1, 1]]} for i in nodes]}).encode(), None, ROOM)
            self.assertEqual(set(out), {'results', 'errors'})
            self.assertEqual('*' in out['errors'], not m['valid'])
            self.assertNotIn('could not work this out', json.dumps(out['errors']))      # every refusal is one that was meant

    def test_results_are_let_go_past_what_may_be_held_and_the_answers_do_not_change(self):
        g = graph_of({'a': {'op': 'noise', 'inputs': [], 'type': T(300, 300), 'seed': 1, 'dist': 'normal', 'key': 'a'}, 't': {'op': 'transpose', 'inputs': ['a'], 'type': T(300, 300)},
                      'p': {'op': 'matmul', 'inputs': ['a', 't'], 'type': T(300, 300)}, 'q': {'op': 'add', 'inputs': ['p', 'a', 't'], 'type': T(300, 300)}})
        want = [{'node': n, 'cells': [[1, 1], [300, 300], [7, 211]]} for n in ('q', 'p', 'a', 'q')]
        kept = ask(g, want)
        self.assertEqual(ask(g, want, room=4 * 300 * 300 * 12), kept)      # room for the run and no more: results are let go and worked out again, and nothing changes

    def test_a_run_that_would_not_fit_in_memory_is_refused_before_anything_is_made(self):
        """A request of a few kilobytes: one entry of 40 sums, one inside the next, of 4000 by 4000. Refused from the
        sizes alone, at once."""
        n = 4000
        nodes = {'n0': {'op': 'source', 'inputs': [], 'type': T(n, n), 'kind': 'ones'}, 'm': {'op': 'source', 'inputs': [], 'type': T(n, n), 'kind': 'identity'}}
        for k in range(1, 41):
            nodes['n%d' % k] = {'op': 'add', 'inputs': ['n%d' % (k - 1), 'm'], 'type': T(n, n)}
        g = graph_of(nodes)
        began = time.monotonic()
        out = ask(g, [{'node': 'n40', 'cells': [[1, 1]]}, {'node': 'n1', 'cells': [[1, 1]]}], room=977 << 20)
        self.assertLess(time.monotonic() - began, 1)
        self.assertEqual(out['errors'], {'n40': 'it is worked out from 672,000,000 entries in all, which needs about 2929 MB of memory, more than the 977 MB this backend may take for a run'})
        self.assertEqual(out['results']['n1']['cells'], [[1, 1, 2.0]])      # what does fit is worked out: three such matrices, and room to work
        small = ask(graph_of({'s': {'op': 'source', 'inputs': [], 'type': T(4000, 4000), 'kind': 'ones'}}), [{'node': 's', 'cells': [[1, 1]]}], room=64 << 20)
        self.assertIn('more than the 64 MB this backend may take', small['errors']['s'])
        from backend import limits
        self.assertEqual(limits.memory_for_arrays('300'), 300 << 20)      # SMART_FACTORY_BACKEND_MEMORY, megabytes for each worker
        have = limits.physical_memory()
        self.assertEqual(limits.memory_for_arrays(None, 2), max(limits.MEMORY_LEAST, int(have * .5 / 2)))      # else half the machine's memory between the workers
        self.assertLessEqual(2 * limits.memory_for_arrays(None, 2), max(have, 2 * limits.MEMORY_LEAST))

    def test_all_the_entries_one_run_asks_for_are_bounded_so_its_answer_is(self):
        g = graph_of({'s': {'op': 'source', 'inputs': [], 'type': T(64, 64), 'kind': 'ones'}})
        cells = [[c, r] for r in range(1, 65) for c in range(1, 65)]      # 4,096 of them
        self.assertEqual(ask(g, [{'node': 's', 'as': str(k), 'cells': cells} for k in range(17)])['errors'], {'*': 'the request asks for 69,632 entries in all, more than the 65,536 one run gives'})
        full = R.run(json.dumps({'graph': g, 'want': [{'node': 's', 'as': str(k), 'cells': cells} for k in range(16)]}).encode(), None, ROOM)      # the boundary
        self.assertEqual((len(full['results']), full['errors']), (16, {}))
        self.assertLess(len(json.dumps(full)), limits.MAX_ANSWER)

    def test_one_want_that_cannot_be_worked_out_fails_alone_and_says_so_in_plain_words(self):
        p = {'op': 'param', 'inputs': [], 'type': T(2, 2), 'within': ['f:f']}
        body = {'op': 'transpose', 'inputs': ['p'], 'type': T(2, 2), 'within': ['f:f']}
        g = graph_of({'p': p, 'body': body, 'three': variable(3, 3, [[1, 2, 3]] * 3), 'two': variable(2, 2, [[1, 2], [3, 4]]), 'ap': {'op': 'apply', 'inputs': ['two'], 'type': T(2, 2), 'fn': 'f:f'}}, {'f:f': {'input': 'p', 'body': 'body'}})
        out = ask(g, [{'node': 'body', 'as': 'wrong', 'cells': [[1, 1]], 'binding': {'params': {'f:f': 'three'}}}, {'node': 'body', 'as': 'part', 'cells': [[1, 1]], 'binding': {'params': {'f:f': {'of': 'three', 'range': {'col': 0, 'row': 0, 'cols': 3, 'rows': 2}}}}},
                      {'node': 'body', 'as': 'right', 'cells': [[2, 1]], 'binding': {'params': {'f:f': 'two'}}}, {'node': 'two', 'cells': [[1, 1]]}])
        self.assertEqual(out['errors'], {'wrong': 'its binding gives the function f:f 3 × 3, and the function takes 2 × 2', 'part': 'its binding gives the function f:f 3 × 2, and the function takes 2 × 2'})
        self.assertEqual((out['results']['right']['cells'], out['results']['two']['cells']), ([[2, 1, 3.0]], [[1, 1, 1.0]]))      # the others have their answers
        huge = graph_of({'s': {'op': 'source', 'inputs': [], 'type': T(10 ** 400, 1), 'kind': 'ones'}, 'x': {'op': 'measure', 'inputs': ['s'], 'type': T(1, 1), 'side': 'x'}})
        said = ask(huge, [{'node': 'x', 'cells': [[1, 1]]}])['errors']      # a size JSON's own numbers do not reach: no graph, as graph.js has it
        self.assertEqual(list(said), ['*'])
        self.assertIn('not well formed', said['*'])
        # and where something does go wrong inside, that want alone says so, with nothing of Python in the answer
        real = E_OPS['transpose']
        try:
            E_OPS['transpose'] = lambda n, at: 1 // 0
            out = ask(g, [{'node': 'ap', 'cells': [[1, 1]]}, {'node': 'two', 'cells': [[1, 1]]}])
        finally:
            E_OPS['transpose'] = real
        self.assertEqual(out['errors'], {'ap': 'the backend could not work this out: what went wrong is in its log'})
        self.assertEqual(out['results']['two']['cells'], [[1, 1, 1.0]])
        self.assertNotIn('ZeroDivision', json.dumps(out))


def whole_error(graph, node):
    out = ask(graph, [{'node': node, 'cells': [[1, 1]]}])
    return out['errors'].get(node) or out['errors'].get('*') or ''
