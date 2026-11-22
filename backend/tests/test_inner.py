"""Inner data (phase 8) in the backend: validate, the arrays, the evaluator and a request. The same answers as
evaluate.js are held by test_evaluate.SameAnswers on the fixtures; here are the rules one at a time: what is
accepted, what is refused, and the boundary between them."""
import json
import math
import unittest

from .support import HAVE_NUMPY, T, all_cells, deep, graph_of, needs_numpy, positions, variable
from backend import limits
from backend.check import validate, numbers, nested
from backend.formula import formula_ok

if HAVE_NUMPY:
    import numpy as np
    from backend import arrays as A
    from backend import run as R

ROOM = 2 << 30
N = lambda op, inputs, type_, **more: dict({'op': op, 'inputs': inputs, 'type': type_}, **more)
ax = lambda length, name=None: {'length': length, 'name': name}
QKV = T(3, 1, [(2, 'key'), (4, 'embed')])
qkv = lambda c, r, k1, k2: c * 100 + k1 * 10 + k2


def ask(graph, want, **more):
    return json.loads(json.dumps(R.run(json.dumps(dict({'graph': graph, 'want': want}, **more)).encode(), None, ROOM)))


def whole(graph, node):
    """Every number of a node, keyed (c, r, k1, …), or the error it has."""
    out = ask(graph, [{'node': node, 'cells': all_cells(graph['nodes'][node]['type'])}])
    if out['errors']:
        return out['errors'].get(node) or out['errors']['*']
    return {tuple(cell[:-1]): cell[-1] for cell in out['results'][node]['cells']}


class Validate(unittest.TestCase):
    def ok(self, g):
        self.assertEqual(validate(g), [])

    def bad(self, g, why=None):
        self.assertNotEqual(validate(g), [], why)

    def test_nested_is_algebra_js_s(self):
        self.assertEqual(nested([], []), [])
        self.assertEqual(nested([ax(3, 'head')], [ax(3)]), [ax(3, 'head')])
        self.assertEqual(nested([ax(3)], [ax(3, 'head')]), [ax(3, 'head')])
        self.assertIsNone(nested([ax(3, 'head')], [ax(3, 'layer')]))
        self.assertIsNone(nested([ax(3)], [ax(2)]))
        self.assertIsNone(nested([ax(2), ax(4)], [ax(3)]))
        self.assertEqual(nested([ax(2)], []), [ax(2)])      # one with none: used at every position
        self.assertIsNone(nested([ax(2)], [], True))        # but for where it is to be exact
        self.assertIsNone(nested([], [ax(2)], True))
        self.assertEqual(numbers(T(4, 4, [16, 16])), 4096)

    def test_a_type_s_inner_is_one_to_six_axes_of_length_and_name(self):
        g = lambda inner: graph_of({'a': dict(deep(T(2, 2), lambda *at: None), type=dict(T(2, 2), inner=inner))})
        self.ok(g([ax(1)]))
        self.ok(g([ax(2, 'key'), ax(4)]))
        self.ok(g([ax(2)] * 6))
        for inner in ([], [ax(2)] * 7, [ax(0)], [ax(1.5)], [{'length': 2}], [ax(2, '')], [ax(2, 7)], [dict(ax(2), x=1)], [2], 'x', None, 0, [ax(True)]):
            self.bad(g(inner), inner)

    def test_both_versions_are_read(self):
        for version, good in ((1, True), (2, True), (3, True), (4, True), (5, True), (6, False), (0, False), ('2', False), (True, False)):
            self.assertEqual(validate(graph_of({'a': variable(1, 1, [[1]])}, version=version)) == [], good, version)

    def test_an_entry_key_has_one_number_for_each_axis(self):
        g = lambda t, key: graph_of({'a': dict(deep(t, lambda *at: None), entries={key: 7})})
        for key in ('2,1,1,3', '3,1,2,4'):
            self.ok(g(QKV, key))
        for key in ('2,1', '2,1,1', '2,1,1,3,1', '4,1,1,1', '3,2,1,1', '3,1,3,1', '3,1,2,5', '3,1,0,1', '3,1,01,1', '3,1,,1'):
            self.bad(g(QKV, key), key)
        self.ok(g(T(3, 1), '3,1'))
        self.bad(g(T(3, 1), '3,1,1'))

    def test_a_product_is_repeated_where_inner_data_agrees_or_one_has_none(self):
        g = lambda a, b, out: graph_of({'a': deep(a, lambda *at: None), 'b': deep(b, lambda *at: None), 'p': N('matmul', ['a', 'b'], out)})
        self.ok(g(T(4, 5), T(2, 4, [(3, 'head')]), T(2, 5, [(3, 'head')])))
        self.ok(g(T(4, 5, [(3, 'head')]), T(2, 4, [3]), T(2, 5, [(3, 'head')])))
        self.bad(g(T(4, 5, [2]), T(2, 4, [3]), T(2, 5, [3])))
        self.bad(g(T(4, 5, [(3, 'layer')]), T(2, 4, [(3, 'head')]), T(2, 5, [(3, 'head')])))
        self.bad(g(T(4, 5), T(2, 4, [3]), T(2, 5)))

    def test_a_one_by_one_that_holds_inner_data_is_no_scalar(self):
        g = lambda a, b, out: graph_of({'a': deep(a, lambda *at: None), 'b': deep(b, lambda *at: None), 'p': N('matmul', ['a', 'b'], out)})
        self.bad(g(T(1, 1, [2]), T(3, 3), T(3, 3, [2])), 'passed over by size in a product')
        self.bad(g(T(1, 1), T(3, 3), T(3, 3)), 'a single entry against a matrix is a scale, another node: 1 column against 3 rows is no product')
        self.assertEqual(validate(g(T(1, 1), T(3, 3), T(3, 3))), ['p: a product of 1 columns and 3 rows: a single entry against a matrix is a scale'])
        self.assertEqual(validate(g(T(3, 3), T(1, 1), T(3, 3))), ['p: a product of 3 columns and 1 rows: a single entry against a matrix is a scale'])
        self.ok(g(T(1, 1), T(3, 1), T(3, 1)))      # a single entry against a single row: 1 column against 1 row
        self.ok(g(T(1, 3), T(1, 1), T(1, 3)))      # a single column against a single entry
        self.ok(g(T(1, 1), T(1, 1), T(1, 1)))
        self.ok(g(T(1, 1, [2]), T(3, 1), T(3, 1, [2])))      # it is a 1 by 1 matrix: 1 column against 1 row
        scale = lambda s, m, out: graph_of({'s': deep(s, lambda *at: None), 'm': deep(m, lambda *at: None), 'p': N('scale', ['s', 'm'], out)})
        self.ok(scale(T(1, 1), T(3, 2, [2, 4]), T(3, 2, [2, 4])))
        self.bad(scale(T(1, 1, [2]), T(3, 2, [2]), T(3, 2, [2])), 'it does not scale')
        mass = lambda t: graph_of({'a': deep(t, lambda *at: None), 'm': N('measure', ['a'], T(1, 1), side='m')})
        self.ok(mass(T(1, 1)))
        self.bad(mass(T(1, 1, [2])), 'it has no mass')
        ew = lambda b, broadcast: graph_of({'a': deep(T(3, 2, [2]), lambda *at: None), 'b': deep(b, lambda *at: None), 'p': N('ewise', ['a', 'b'], T(3, 2, [2]), fn='mul', broadcast=broadcast)})
        self.ok(ew(T(1, 1), 'scalar'))
        self.bad(ew(T(1, 1, [2]), 'scalar'), 'it is not applied to every entry')

    def test_a_sum_against_no_inner_data_is_refused_and_entry_by_entry_is_not(self):
        g = lambda op, a, b, **more: graph_of({'a': deep(a, lambda *at: None), 'b': deep(b, lambda *at: None), 'p': N(op, ['a', 'b'], T(3, 2, [2]), **more)})
        self.ok(g('add', T(3, 2, [2]), T(3, 2, [2])))
        self.bad(g('add', T(3, 2, [2]), T(3, 2)))
        self.bad(g('add', T(3, 2), T(3, 2, [2])))
        self.bad(g('add', T(3, 2, [2]), T(3, 2, [3])))
        self.ok(g('ewise', T(3, 2, [2]), T(3, 2), fn='mul', broadcast='none'))
        self.ok(g('ewise', T(3, 2), T(3, 2, [2]), fn='div', broadcast='none'))
        self.ok(g('ewise', T(3, 2, [2]), T(3, 1), fn='mul', broadcast='row'))
        self.bad(g('ewise', T(3, 2, [2]), T(3, 2, [3]), fn='mul', broadcast='none'))

    def test_stack_entry_and_a_transpose_s_order(self):
        part = lambda cols=2, rows=4, inner=None, names=('key', 'embed'): deep(T(cols, rows, inner, *names), lambda *at: None)
        at3 = [{'col': 0, 'row': 0}, {'col': 1, 'row': 0}, {'col': 2, 'row': 0}]
        g = lambda parts, at, out: graph_of(dict({'w%d' % i: p for i, p in enumerate(parts)}, q=N('stack', ['w%d' % i for i in range(len(parts))], out, at=at)))
        self.ok(g([part(), part(), part()], at3, QKV))
        self.ok(g([part(2, 4, [5])], at3[:1], T(1, 1, [(2, 'key'), (4, 'embed'), 5])))
        self.bad(g([part(), part()], at3[:2], QKV), 'two parts for three entries')
        self.bad(g([part(), part(), part()], [at3[0], at3[1], at3[1]], QKV), 'two parts on one entry')
        self.bad(g([part(), part(3, 4), part()], at3, QKV), 'a part of another size')
        self.bad(g([part(), part(2, 4, None, ('query', 'embed')), part()], at3, QKV), 'a side of another name')
        self.bad(g([part(), part(2, 4, [2]), part()], at3, QKV), 'inner data in one part only')
        self.bad(g([deep(T(2, 2, [2] * 5), lambda *at: None)], at3[:1], T(1, 1, [2] * 7)), 'seven inner axes')
        e = lambda at, out, of=QKV: graph_of({'q': deep(of, lambda *at: None), 'e': N('entry', ['q'], out, at=at)})
        self.ok(e({'col': 2, 'row': 0}, T(2, 4, None, 'key', 'embed')))
        self.bad(e({'col': 3, 'row': 0}, T(2, 4, None, 'key', 'embed')))
        self.bad(e({'col': -1, 'row': 0}, T(2, 4, None, 'key', 'embed')))
        self.bad(e({'col': 0, 'row': 0}, T(1, 1), T(3, 1)), 'an entry of a shape with no inner data')
        self.ok(e({'col': 0, 'row': 0}, T(5, 1), T(3, 1, [5])))
        self.ok(e({'col': 0, 'row': 0}, T(2, 4, [5]), T(3, 1, [2, 4, 5])))
        t = lambda order, out: graph_of({'a': deep(QKV, lambda *at: None), 'p': N('transpose', ['a'], out, **({'order': order} if order is not None else {}))})
        self.ok(t([2, 3, 0, 1], T(2, 4, [3, 1], 'key', 'embed')))
        self.ok(t([0, 1, 3, 2], T(3, 1, [(4, 'embed'), (2, 'key')])))
        self.ok(t(None, T(1, 3, [(2, 'key'), (4, 'embed')])))
        for order in ([0, 1, 2, 3], [1, 0, 2, 3], [0, 1, 2], [0, 1, 2, 2], [0, 1, 2, 4], [2, 3, 0, '1'], [0, 1], 'x', []):
            self.bad(t(order, QKV), order)
        self.bad(t([2, 3, 0, 1], T(4, 2, [3, 1])), 'a type the order does not give')

    def test_measures_of_inner_axes_and_the_names_k1_to_k6(self):
        g = lambda t, side: graph_of({'a': deep(t, lambda *at: None), 'm': N('measure', ['a'], T(1, 1), side=side)})
        self.ok(g(QKV, 'd1'))
        self.ok(g(QKV, 'd2'))
        for t, side in ((QKV, 'd3'), (T(3, 1), 'd1'), (T(3, 1, [2]), 'd0'), (T(3, 1, [2]), 'd7'), (T(3, 1, [2]), 'D1')):
            self.bad(g(t, side), side)
        for name, good in (('k1', True), ('K6', True), ('k7', False), ('k0', False), ('k', False), ('k12', False)):
            self.assertEqual(formula_ok('x + ' + name, 0, arrow=True), good, name)
            self.assertEqual(formula_ok('1 + ' + name, 0), good, name)

    def test_a_formula_names_inner_data_only_of_its_own_size(self):
        # graph.js refuses these when the graph is built, so no formula here ever meets a matrix whose inner data is not its output's
        named = lambda t, w, key: graph_of({'w': deep(w, lambda *at: 1), 'v': dict(deep(t, lambda *at: None), inputs=['w'], entries={key: {'expr': '$1 + 0'}})})
        self.bad(named(T(2, 1, [2]), T(2, 1, [3]), '1,1,1'), 'inner 3 read by inner 2')
        self.bad(named(T(2, 1), T(1, 1, [2]), '1,1'), 'a 1 by 1 of inner data named by a plain variable')
        self.ok(named(T(2, 1, [2]), T(2, 1, [2]), '1,1,1'))
        self.ok(named(T(2, 1, [2]), T(1, 1), '1,1,1'))
        attr = lambda w: graph_of({'o': deep(T(3, 1), lambda *at: 1), 'w': deep(w, lambda *at: 1), 'a': N('measure', ['o', 'w'], T(1, 1), side='a', name='heads', formula='$1 * 2')})
        self.bad(attr(T(1, 1, [2])), 'an attribute naming inner data')
        self.ok(attr(T(1, 1)))

    def test_a_function_fits_its_input_s_inner_data_or_holds_none(self):
        def g(p, given, out, body=None):
            nodes = {'x': deep(given, lambda *at: None), 'p': N('param', [], p, within=['f:1']), 'y': N('apply', ['x'], out, fn='f:1')}
            if body:
                nodes['body'] = N('transpose', ['p'], body, within=['f:1'])
            return graph_of(nodes, {'f:1': {'input': 'p', 'body': 'body' if body else 'p'}})
        self.ok(g(QKV, QKV, QKV))
        self.ok(g(T(3, 2), T(3, 2, [5]), T(2, 3, [5]), T(2, 3)))
        self.bad(g(QKV, T(3, 1, [2, 5]), QKV))
        self.bad(g(T(3, 1, [2]), T(3, 1), T(3, 1, [2])))
        self.bad(g(T(3, 2), T(3, 2, [5]), T(2, 3), T(2, 3)), 'the inner axes left off the result')
        own = graph_of({'x': deep(T(2, 1, [5]), lambda *at: None), 'w': deep(T(2, 1), lambda *at: None), 'p': N('param', [], T(2, 1), within=['f:1']),
                        'body': N('stack', ['p', 'w'], T(2, 1, [2, 1]), at=[{'col': 0, 'row': 0}, {'col': 1, 'row': 0}], within=['f:1']), 'y': N('apply', ['x'], T(2, 1, [2, 1]), fn='f:1')}, {'f:1': {'input': 'p', 'body': 'body'}})
        self.bad(own, 'a body that comes to inner data of its own')
        own['nodes']['x'] = deep(T(2, 1), lambda *at: None)
        self.ok(own)

    def test_a_data_file_holds_no_inner_data(self):
        self.ok(graph_of({'f': N('source', [], T(2, 2), kind='file', path='data/w.csv')}))
        self.bad(graph_of({'f': N('source', [], T(2, 2, [2]), kind='file', path='data/w.csv')}))
        self.ok(graph_of({'f': N('source', [], T(2, 2, [2]), kind='identity')}))
        self.ok(graph_of({'n': N('noise', [], T(2, 2, [2]), seed=1, dist='normal', key='b')}))


@needs_numpy
class Arrays(unittest.TestCase):
    def test_rows_and_columns_are_the_last_two_axes(self):
        for made in (A.full(2, 3, 1.0, (4, 5)), A.identity(2, 3, (4, 5)), A.blank(2, 3, (4, 5)), A.noise(0, 'b', 2, 3, 'uniform', 0, (), (4, 5)), A.spread(A.number(1.0), 2, 3, (4, 5))):
            self.assertEqual(made.shape, (4, 5, 2, 3))
            self.assertEqual(A.shape(made), (2, 3))
            self.assertEqual(A.inner(made), (4, 5))
            self.assertEqual(made.dtype, np.float32)
        self.assertEqual(A.full(2, 3, 1.0).shape, (2, 3))
        eye = A.identity(2, 3, (2,))
        self.assertEqual(eye.tolist(), [[[1, 0, 0], [0, 1, 0]]] * 2)
        # entry "column,row,k1,k2" is a[k1 - 1, k2 - 1, row - 1, column - 1]
        a = A.blank(1, 3, (2, 4))
        A.put(a, [0], [1], A.row([7.0]), [[0], [2]])
        self.assertEqual(A.item(a, 0, 1, (0, 2)), 7.0)
        self.assertEqual(float(a[0, 2, 0, 1]), 7.0)
        self.assertEqual(A.take(a, [0], [1], [[0], [2]]).tolist(), [[7.0]])

    def test_a_product_repeats_over_the_leading_axes_and_an_array_with_none_is_used_at_each(self):
        x = np.array([[1, 2], [3, 4]], dtype=np.float32)
        w = np.stack([np.eye(2, dtype=np.float32) * h for h in (1, 2, 3)])
        self.assertEqual(A.matmul(x, w).shape, (3, 2, 2))
        self.assertEqual(A.matmul(x, w)[2].tolist(), [[3, 6], [9, 12]])
        self.assertEqual(A.binary('+', w, x)[1].tolist(), [[3, 2], [3, 6]])
        self.assertEqual(A.transpose(A.matmul(x, w)).shape, (3, 2, 2))
        self.assertEqual(A.part(w, 0, 1, 2, 1).shape, (3, 2, 1))
        self.assertEqual(A.repeat(w, 2, 3).shape, (3, 4, 6))

    def test_stack_entry_and_reorder_move_whole_axes(self):
        parts = [np.arange(8, dtype=np.float32).reshape(4, 2) + 100 * k for k in (1, 2, 3)]      # each 2 columns by 4 rows
        q = A.stack(parts, [(0, 0), (1, 0), (2, 0)], 1, 3)
        self.assertEqual(q.shape, (2, 4, 1, 3))      # inner: the parts' columns, then their rows
        self.assertEqual(float(q[1, 2, 0, 1]), float(parts[1][2, 1]))
        for k in range(3):
            self.assertTrue(np.array_equal(A.entry(q, k, 0), parts[k]))
        self.assertEqual(A.entry(np.arange(6, dtype=np.float32).reshape(3, 1, 2), 1, 0).tolist(), [[1, 3, 5]])      # one inner axis: a single row
        drawn = A.reorder(q, [2, 3, 0, 1])      # the entry's own sides drawn
        self.assertEqual(drawn.shape, (3, 1, 4, 2))
        self.assertEqual(float(drawn[1, 0, 2, 1]), float(q[1, 2, 0, 1]))
        self.assertTrue(np.array_equal(A.reorder(drawn, [2, 3, 0, 1]), q))
        self.assertTrue(np.array_equal(A.reorder(q, [1, 0, 2, 3]), A.transpose(q)))
        self.assertEqual(A.reorder(q, [0, 1, 3, 2]).shape, (4, 2, 1, 3))
        self.assertEqual([a.shape for a in A.along((2, 4))], [(2, 1, 1, 1), (4, 1, 1)])
        self.assertEqual(A.join([parts[0], parts[1], parts[2], parts[0]], (2, 2)).shape, (2, 2, 4, 2))

    def test_noise_given_inner_data_keeps_the_numbers_it_had(self):
        for dist in ('uniform', 'normal'):
            for cells in ((), ((2, 3),)):
                flat = A.noise(5, 'blk', 3, 4, dist, 2, cells)
                for inner in ((1,), (2,), (3, 2), (1, 1, 1)):
                    made = A.noise(5, 'blk', 3, 4, dist, 2, cells, inner)
                    first = made[(0,) * len(inner)]
                    self.assertEqual(first.tobytes(), flat.tobytes(), (dist, cells, inner))      # bit for bit
                    seen = {made[where].tobytes() for where in np.ndindex(*inner)}
                    self.assertEqual(len(seen), int(np.prod(inner)), 'every inner position has numbers of its own')

    def test_the_key_at_an_inner_position_is_one_mix_for_each_axis(self):
        """k' = mix(mix(k xor k1 xor 2^63) xor k2), and k itself at the first position: written out again here in plain Python."""
        import hashlib
        M = (1 << 64) - 1

        def mix(z):
            z = (z + 0x9E3779B97F4A7C15) & M
            z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & M
            z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & M
            return z ^ (z >> 31)

        def number(seed, key, c, r, ks, tick=0):
            k = int.from_bytes(hashlib.sha256(('%d:%s' % (seed, key)).encode()).digest()[:8], 'big')
            if any(x != 1 for x in ks):
                for axis, x in enumerate(ks):
                    k = mix(k ^ x ^ ((1 << 63) if axis == 0 else 0))
            h = mix(mix(mix(mix(k ^ c) ^ r) ^ tick) ^ 0)
            return np.float32(min((h >> 11) / 2 ** 53, float(np.nextafter(np.float32(1), np.float32(0)))))
        made = A.noise(9, 'b7', 2, 3, 'uniform', 0, (), (2, 3))
        for k1 in (1, 2):
            for k2 in (1, 2, 3):
                for r in (1, 2):
                    for c in (1, 2, 3):
                        self.assertEqual(float(made[k1 - 1, k2 - 1, r - 1, c - 1]), float(number(9, 'b7', c, r, (k1, k2))), (c, r, k1, k2))

    def test_an_inner_position_is_no_cell_of_a_tile(self):
        """Cell (2, 1) at inner position (1, 1) had the key of cell (1, 1) at inner position (2, 1): 2^63 parts them."""
        for dist in ('uniform', 'normal'):
            for inner in ((3, 3), (3,), (3, 1), (2, 2, 2)):
                seen = {}
                for cell in ((1, 1), (2, 1), (1, 2), (2, 2), (3, 1), (3, 2)):
                    made = A.noise(3, 'b1', 2, 2, dist, 0, (cell,), inner)
                    for where in np.ndindex(*inner):
                        seen.setdefault(made[where].tobytes(), []).append((cell, where))
                self.assertEqual([v for v in seen.values() if len(v) > 1], [], (dist, inner))
            there = A.noise(3, 'b1', 2, 2, dist, 0, ((2, 1),), (2, 2))[0, 0]
            here = A.noise(3, 'b1', 2, 2, dist, 0, ((1, 1),), (2, 2))[1, 0]
            self.assertFalse((there == here).any())
            self.assertEqual(there.tobytes(), A.noise(3, 'b1', 2, 2, dist, 0, ((2, 1),)).tobytes())      # the first position is still the block's own numbers

    def test_noise_of_many_inner_positions_is_made_some_at_a_time(self):
        made = A.noise(1, 'b', 2, 2, 'normal', 0, (), (300, 300))      # more positions than are keyed at once
        again = A.noise(1, 'b', 2, 2, 'normal', 0, (), (300, 300))
        self.assertEqual(made.tobytes(), again.tobytes())
        self.assertEqual(made[0, 0].tobytes(), A.noise(1, 'b', 2, 2, 'normal').tobytes())
        self.assertFalse(np.isnan(made).any())


@needs_numpy
class WorkedOut(unittest.TestCase):
    def test_a_product_with_three_heads_is_three_products(self):
        X = [[1, 2], [3, 4]]
        g = graph_of({'x': variable(2, 2, X), 'w': deep(T(2, 2, [(3, 'head')]), lambda c, r, h: h if c == r else 0), 'p': N('matmul', ['x', 'w'], T(2, 2, [(3, 'head')]))})
        self.assertEqual(validate(g), [])
        got = whole(g, 'p')
        self.assertEqual(len(got), 12)
        for (c, r, h), v in got.items():
            self.assertEqual(v, X[r - 1][c - 1] * h)

    def test_cells_carry_the_inner_position_and_a_result_its_inner_lengths(self):
        g = graph_of({'q': deep(QKV, qkv), 's': variable(1, 1, [[2]]), 'p': N('scale', ['s', 'q'], QKV), 'x': N('measure', ['q'], T(1, 1), side='d2')})
        out = ask(g, [{'node': 'p', 'cells': [[2, 1, 1, 3], [3, 1, 2, 4], [1, 1, 1, 1]]}, {'node': 'x', 'cells': [[1, 1]]}, {'node': 's', 'cells': [[1, 1]]}])
        self.assertEqual(out['errors'], {})
        p = out['results']['p']
        self.assertEqual((p['cols'], p['rows'], p['inner']), (3, 1, [2, 4]))
        self.assertEqual(p['cells'], [[2, 1, 1, 3, 2 * qkv(2, 1, 1, 3)], [3, 1, 2, 4, 2 * qkv(3, 1, 2, 4)], [1, 1, 1, 1, 2 * qkv(1, 1, 1, 1)]])
        self.assertEqual((p['min'], p['max']), (2 * qkv(1, 1, 1, 1), 2 * qkv(3, 1, 2, 4)))      # of every number it holds
        self.assertEqual(out['results']['x'], {'cols': 1, 'rows': 1, 'cells': [[1, 1, 4.0]], 'min': 4.0, 'max': 4.0, 'mean': 4.0, 'truth': True})      # a node that holds none answers as it always did
        self.assertNotIn('inner', out['results']['s'])

    def test_cells_of_the_wrong_length_or_past_an_axis_are_that_want_s_error(self):
        g = graph_of({'q': deep(QKV, qkv), 's': variable(1, 1, [[2]])})
        for cells, why in (([[2, 1]], 'names 2 numbers, and an entry of it is named by 4'), ([[2, 1, 1]], 'names 3 numbers'), ([[2, 1, 1, 3, 1]], 'names 5 numbers'),
                           ([[2, 1, 3, 1]], 'it has no entry [2, 1, 3, 1]: it is 3 × 1 × 2 × 4'), ([[2, 1, 2, 5]], 'it has no entry'), ([[2, 1, 0, 1]], 'it has no entry'), ([[4, 1, 1, 1]], 'it has no entry'),
                           ([[2, 1, 1.5, 1]], 'it has no entry'), ([[2, 1, '1', 1]], 'it has no entry'), (['x'], 'it has no entry')):
            out = ask(g, [{'node': 'q', 'cells': cells}, {'node': 's', 'cells': [[1, 1]]}])
            self.assertIn(why, out['errors'].get('q', ''), cells)
            self.assertEqual(out['results']['s']['cells'], [[1, 1, 2.0]])      # the others have their answers
        out = ask(g, [{'node': 's', 'cells': [[1, 1, 1]]}])
        self.assertIn('names 3 numbers, and an entry of it is named by 2: it is 1 × 1', out['errors']['s'])
        self.assertEqual(ask(g, [{'node': 'q', 'cells': [[2, 1, 2, 4]]}])['results']['q']['cells'], [[2, 1, 2, 4, 224.0]])      # the last of every axis is there

    def test_an_entry_never_given_at_any_depth_is_no_value(self):
        g = graph_of({'q': deep(QKV, lambda c, r, k1, k2: None if (c, k1, k2) == (2, 2, 3) else 1, name='QKV'), 'full': deep(QKV, qkv)})
        self.assertEqual(whole(g, 'q'), 'unknown entries in QKV')
        self.assertEqual(len(whole(g, 'full')), 24)

    def test_formulas_read_k1_and_a_matrix_with_no_inner_data_is_read_at_every_position(self):
        g = graph_of({'a': deep(T(2, 1, [2, 2]), lambda *at: 1), 'm': variable(2, 1, [[1000, 2000]]),
                      'p': N('map', ['a', 'm'], T(2, 1, [2, 2]), formula='x + 10*i + 100*k1 + k2/2 + $1'), 'q': N('map', ['m'], T(2, 1), formula='x + k1'),
                      'e': dict(deep(T(1, 1, [3]), lambda *at: None), entries={'1,1,1': {'expr': 'k1 * 2'}, '1,1,2': 5, '1,1,3': {'expr': 'k1 + k2'}})})
        self.assertEqual(validate(g), [])
        got = whole(g, 'p')
        for (c, r, k1, k2), v in got.items():
            self.assertEqual(v, 1 + 10 * c + 100 * k1 + k2 / 2 + 1000 * c)
        self.assertEqual(whole(g, 'q'), {(1, 1): {'err': R.NO_VALUE}, (2, 1): {'err': R.NO_VALUE}})      # no inner data: there is no k1
        self.assertEqual(whole(g, 'e'), {(1, 1, 1): 2.0, (1, 1, 2): 5.0, (1, 1, 3): {'err': R.NO_VALUE}})      # and no second inner axis

    def test_a_function_is_applied_once_or_at_each_position_as_its_input_block_says(self):
        fn = {'f:1': {'input': 'p', 'body': 'body'}}
        g = graph_of({'x': deep(T(2, 1, [3]), lambda c, r, k: c * k), 'w': variable(1, 2, [[1], [2]]), 'p': N('param', [], T(2, 1), within=['f:1']),
                      'body': N('matmul', ['p', 'w'], T(1, 1), within=['f:1']), 'y': N('apply', ['x'], T(1, 1, [3]), fn='f:1')}, fn)
        self.assertEqual(validate(g), [])
        self.assertEqual(whole(g, 'y'), {(1, 1, 1): 5.0, (1, 1, 2): 10.0, (1, 1, 3): 15.0})
        out = ask(g, [{'node': 'body', 'cells': [[1, 1]], 'binding': {'params': {'f:1': 'x'}}}])      # inside it there is no one input to look from
        self.assertIn('inner data its input does not hold', out['errors']['body'])
        key = T(2, 4, None, 'key', 'embed')
        h = graph_of({'q': deep(QKV, qkv), 'p': N('param', [], QKV, within=['f:1']), 'body': N('entry', ['p'], key, at={'col': 1, 'row': 0}, within=['f:1']), 'y': N('apply', ['q'], key, fn='f:1')}, fn)
        self.assertEqual(validate(h), [])
        got = whole(h, 'y')
        self.assertEqual(len(got), 8)
        for (c, r), v in got.items():
            self.assertEqual(v, qkv(2, 1, c, r))
        self.assertEqual(ask(h, [{'node': 'body', 'cells': [[2, 4]], 'binding': {'params': {'f:1': 'q'}}}])['results']['body']['cells'], [[2, 4, float(qkv(2, 1, 2, 4))]])

    def test_the_limit_counts_numbers(self):
        big = graph_of({'ok': N('source', [], T(40, 40, [100, 100]), kind='zeros'), 'big': N('source', [], T(40, 40, [100, 101]), kind='zeros'), 'flat': N('source', [], T(4000, 4001), kind='zeros'),
                        'd': N('measure', ['big'], T(1, 1), side='d2'), 'cut': N('slice', ['big'], T(1, 1, [100, 101]), range={'col': 0, 'row': 0, 'cols': 1, 'rows': 1})})
        self.assertEqual(numbers(big['nodes']['ok']['type']), limits.MAX_ENTRIES)
        out = ask(big, [{'node': k, 'cells': []} for k in ('big', 'flat', 'cut')] + [{'node': 'd', 'cells': [[1, 1]]}])
        self.assertEqual(out['errors'], {'big': '40 × 40 × 100 × 101 numbers, more than the 16,000,000 that are worked out', 'flat': '4,000 × 4,001 numbers, more than the 16,000,000 that are worked out',
                                         'cut': '40 × 40 × 100 × 101 numbers in what it is worked out from, more than the 16,000,000 that are worked out'})
        self.assertEqual(out['results']['d']['cells'], [[1, 1, 101.0]])      # a length is read off the type
        small = R.run(json.dumps({'graph': big, 'want': [{'node': 'ok', 'cells': [[40, 40, 100, 100]]}]}).encode(), None, 64 * 1024 * 1024)      # at the limit it is not refused for its size: only for the room this run has
        self.assertIn('memory', small['errors']['ok'])

    def test_sources_and_noise_at_an_inner_size(self):
        g = graph_of({'i': N('source', [], T(2, 2, [2]), kind='identity'), 'n': N('noise', [], T(2, 2, [2]), seed=4, dist='uniform', key='b'), 'n0': N('noise', [], T(2, 2), seed=4, dist='uniform', key='b')})
        self.assertEqual(whole(g, 'i'), {(c, r, k): float(c == r) for k in (1, 2) for r in (1, 2) for c in (1, 2)})
        deep_, flat = whole(g, 'n'), whole(g, 'n0')
        self.assertEqual({k[:2]: v for k, v in deep_.items() if k[2] == 1}, flat)
        self.assertNotEqual({k[:2]: v for k, v in deep_.items() if k[2] == 2}, flat)
        self.assertTrue(all(0 <= v < 1 for v in deep_.values()))


if __name__ == '__main__':
    unittest.main()
