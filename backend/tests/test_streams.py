"""Streams and the tick (phase 9D): what a stream of each kind holds at each tick, worked out here by hand; a plain
noise block at every tick; a loop with no last cell stepped by the tick; and what is refused, each with its sentence.

evaluate.js has no number of a stream (they are the backend's alone), so nothing here is held to the fixtures'
answers: every value below is said outright, or is the noise generator told a second time (test_arrays.noise_entry).
That both validators judge every changed graph alike is test_check.SameAsGraphJs, over the same fixtures."""
import copy
import json
import os
import shutil
import struct
import tempfile
import unittest

from .support import HAVE_NUMPY, T, fixture, graph_of, needs_numpy
from backend import data, limits
from backend.check import VERSION, validate

if HAVE_NUMPY:
    import numpy as np      # only to write .npy files for the tests: the backend itself reads them in arrays.py alone
    from backend import arrays as A
    from backend import run as R
    from backend.evaluate import Run
    from .test_arrays import noise_entry
    from .test_evaluate import ROOM, ask, whole


def f32(x):
    return struct.unpack('f', struct.pack('f', x))[0]


def named(name):
    return copy.deepcopy(next(g['graph'] for g in fixture('graphs.json') if g['name'] == name))


def stream(kind, cols, rows, length=1, start=0, step=1, end='stop', **more):
    """A graph of one stream, s, and the variable it defines, v:b."""
    n = dict({'op': 'stream', 'inputs': [], 'type': T(cols, rows), 'kind': kind, 'length': length, 'start': start, 'step': step, 'end': end}, **more)
    v = {'op': 'variable', 'inputs': ['s'], 'type': T(cols, rows), 'name': 'B', 'named': True, 'defined': 'source', 'entries': {}}
    return graph_of({'s': n, 'v:b': v}, blocks={'b': 'v:b'}, version=6)


def noise(cols, rows, length=1, start=0, step=1, seed=5, dist='uniform', key='b', **more):
    return stream('noise', cols, rows, length, start, step, seed=seed, dist=dist, key=key, **more)


ROWS = '\n'.join('%d,%d' % (10 * r, 10 * r + 1) for r in range(10)) + '\n'      # ten rows of two: row r holds 10r and 10r + 1
TEXT = 'aé\U0001F600b\n'      # a, e acute (two bytes of UTF-8), a face outside the basic plane (four), b, a new line


class Project(unittest.TestCase):
    """A saved project, p, in a directory of its own, with the data files the tests below read."""

    def setUp(self):
        self.root = tempfile.mkdtemp(prefix='smart-factory-streams-')
        self.addCleanup(shutil.rmtree, self.root, True)
        os.makedirs(os.path.join(self.root, 'p', 'data'))
        with open(os.path.join(self.root, 'p', 'project.json'), 'w') as f:
            f.write('{}')
        self.put('rows.csv', ROWS.encode())
        self.put('named.csv', ('x,y\n' + ROWS).encode())
        self.put('total.csv', b'3\n1\n4\n1\n5\n')
        self.put('words.txt', TEXT.encode('utf8'))

    def put(self, name, body):
        with open(os.path.join(self.root, 'p', 'data', name), 'wb') as f:
            f.write(body)

    def npy(self, name, array):
        import io
        out = io.BytesIO()
        np.save(out, array)
        self.put(name, out.getvalue())
        return out.getvalue()

    def at(self, g, tick=0, node='v:b', **more):
        return whole(g, node, root=self.root, project='p', tick=tick, **more)

    def full(self, g, want, tick=0, **more):
        return ask(g, want, root=self.root, project='p', tick=tick, **more)


class Validate(unittest.TestCase):
    def test_a_stream_needs_version_6(self):
        g = noise(4, 1, 2)
        self.assertEqual(VERSION, 6)
        self.assertEqual(validate(g), [])
        for version in (1, 2, 3, 4, 5):
            self.assertIn('s: it holds a stream, which needs version 6, and the graph says version %d' % version, validate(dict(g, version=version)))

    def test_each_refusal_in_graph_js_s_words(self):
        def bad(change, why, g=None):
            g = copy.deepcopy(g or noise(4, 1, 2))
            change(g['nodes']['s'])
            said = validate(g)
            self.assertTrue(any(why in s for s in said), (said, why))

        bad(lambda n: n.update(kind='video'), 'kind is "video"')
        bad(lambda n: n.pop('kind'), 'kind is "None"')
        bad(lambda n: n.update(seed=1.5), 'seed is not a whole number')
        bad(lambda n: n.update(dist='flat'), 'dist is "flat"')
        bad(lambda n: n.update(key=''), 'key is not a block id')
        bad(lambda n: n.update(path='data/a.csv'), 'a stream holds no path')
        bad(lambda n: n.update(position=3), 'a stream holds no position')
        for length in (0, -1, 1.5, '4', None, True, 2 ** 53):
            bad(lambda n: n.update(length=length), 'length is not a whole number, at least 1')
        bad(lambda n: n.pop('length'), 'length is not a whole number')
        for start in (-1, 1.5, '0', True, 2 ** 53):
            bad(lambda n: n.update(start=start), 'start is not a whole number, from 0, or null')
        bad(lambda n: n.pop('start'), 'start is not')
        for step in (0, -1, 1.5, '1', False):
            bad(lambda n: n.update(step=step), 'step is not a whole number, at least 1, or null')
        bad(lambda n: n.pop('step'), 'step is not')
        for end in ('loop', '', None, 1):
            bad(lambda n: n.update(end=end), 'end is "')
        bad(lambda n: n.update(length=3), 'its columns are not a whole number of values')
        bad(lambda n: n['type'].update(inner=[{'length': 2, 'name': None}]), 'a stream holds no inner data')
        bad(lambda n: n['type'].update(value='real'), 'its value is real and its inputs give probability')
        bad(lambda n: n.update(inputs=['v:b']), 'stream does not take 1 inputs')
        csv = stream('csv', 4, 1, 2, path='data/rows.csv')
        self.assertEqual(validate(csv), [])
        for path in ('data/a.txt', 'data/a.npy', '../a.csv', 'data/a', None):
            bad(lambda n: n.update(path=path), 'path is not a .csv file under data/', csv)
        bad(lambda n: n.update(seed=1), 'a stream holds no seed', csv)
        text = stream('text', 4, 1, 2, path='data/words.txt')
        self.assertEqual(validate(text), [])
        bad(lambda n: n.update(path='data/a.csv'), 'path is not a .txt file under data/', text)
        bad(lambda n: n['type'].update(rows=2), 'a value of text is one row', text)
        self.assertEqual(validate(stream('npy', 2, 3, path='data/cube.npy')), [])
        for ok in (dict(start=None, step=None), dict(length=4), dict(length=1), dict(end='wrap')):
            g = noise(4, 1, 2)
            g['nodes']['s'].update(ok)
            self.assertEqual(validate(g), [], ok)

    def test_a_streams_number_space_and_a_plain_files_path(self):
        for g, space in ((noise(2, 1), 'probability'), (noise(2, 1, dist='normal'), 'real'), (stream('csv', 2, 1, path='data/a.csv'), 'real'), (stream('text', 2, 1, path='data/a.txt'), 'whole'), (stream('npy', 2, 1, path='data/a.npy'), 'real')):
            for i in ('s', 'v:b'):
                g['nodes'][i]['type']['value'] = space
            self.assertEqual(validate(g), [], space)
            g['nodes']['s']['type']['value'] = 'integer'
            self.assertTrue(validate(g), space)
        plain = lambda path: graph_of({'f': {'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'file', 'path': path}})
        self.assertEqual(validate(plain('data/w.csv')), [])
        for path in ('data/w.txt', 'data/w.npy'):
            self.assertEqual(validate(plain(path)), ['f: path is not a .csv file under data/'])


@needs_numpy
class Noise(Project):
    def test_a_plain_noise_block_holds_the_same_numbers_at_ticks_0_1_and_1000(self):
        n = {'op': 'noise', 'inputs': [], 'type': T(3, 2), 'seed': 5, 'dist': 'uniform', 'key': 'b'}
        g = graph_of({'n': n})
        want = [[f32(noise_entry(5, 'b', c, r, 'uniform', 0)) for c in (1, 2, 3)] for r in (1, 2)]
        for tick in (0, 1, 1000, 2 ** 53 - 1):
            self.assertEqual(self.at(g, tick, 'n'), want, tick)
        # and in a tile: the cell joins its key as it did, the tick does not
        tiled = named('noise and a data file')
        cells = [{'node': 'v:Nt', 'as': '%d' % cx, 'cells': [[1, 1], [2, 1]], 'binding': {'cells': [{'x': 2 * (cx - 1), 'y': 0, 'dx': 0, 'dy': 0, 'cx': cx, 'cy': 1, 'of': ['t:t1']}]}} for cx in (1, 2)]
        first = self.full(tiled, cells, 0)['results']
        self.assertEqual(self.full(tiled, cells, 1000)['results'], first)
        self.assertEqual([c[2] for c in first['2']['cells']], [f32(noise_entry(1, 'Nt', c, 1, 'uniform', 0, [(2, 1)])) for c in (1, 2)])

    def test_at_tick_0_a_stream_of_one_value_from_0_is_the_block(self):
        for dist in ('uniform', 'normal'):
            plain = graph_of({'n': {'op': 'noise', 'inputs': [], 'type': T(3, 2), 'seed': 5, 'dist': dist, 'key': 'b'}})
            self.assertEqual(self.at(noise(3, 2, dist=dist), 0), self.at(plain, 0, 'n'), dist)
            self.assertEqual(self.at(noise(3, 2, dist=dist), 0), [[f32(noise_entry(5, 'b', c, r, dist, 0)) for c in (1, 2, 3)] for r in (1, 2)])

    def test_the_window_moves_on_by_step_and_one_place_is_one_draw_in_whichever_cell(self):
        # eight values of 2 by 1, from place 4, three places a tick: value j at tick t is the draw at place 4 + 3t + j
        g = noise(16, 1, 8, 4, 3)
        draw = lambda place: [f32(noise_entry(5, 'b', c, 1, 'uniform', place)) for c in (1, 2)]
        for tick in (0, 1, 2, 1000):
            got = self.at(g, tick)[0]
            self.assertEqual([got[2 * j:2 * j + 2] for j in range(8)], [draw(4 + 3 * tick + j) for j in range(8)], tick)
        at0, at1 = self.at(g, 0)[0], self.at(g, 1)[0]
        self.assertEqual(at0[6:16], at1[0:10])      # what cells 3 to 7 showed at tick 0, cells 0 to 4 show at tick 1
        self.assertNotEqual(at0[0:2], at0[2:4])
        one = noise(2, 1, 1, 4, 3)                  # the same stream, one value long: its value at tick 2 is place 10
        self.assertEqual(self.at(one, 2)[0], draw(10))
        self.assertEqual(self.at(g, 2)[0][0:2], draw(10))
        normal = noise(2, 2, 1, 0, 1, dist='normal')
        self.assertEqual(self.at(normal, 7), [[f32(noise_entry(5, 'b', c, r, 'normal', 7)) for c in (1, 2)] for r in (1, 2)])
        self.assertEqual(self.at(noise(1, 1, 1, 2 ** 53 - 1, 2 ** 53 - 1), 2 ** 53 - 1)[0][0], f32(noise_entry(5, 'b', 1, 1, 'uniform', ((2 ** 53 - 1) + (2 ** 53 - 1) ** 2) % 2 ** 64)))      # a place past 64 bits goes round

    def test_a_stream_in_a_tile_is_the_same_in_every_cell(self):
        g = named('streams: in a tile')
        rep = g['spaces']['top']['tiles'][0]['node']
        value = [f32(noise_entry(3, 'Sn', 1, 1, 'uniform', place)) for place in (2, 3)]      # at tick 2: places 2 and 3
        self.assertEqual(self.at(g, 2, rep), [value + value, value + value])

    def test_a_setting_that_is_not_known_is_no_value(self):
        self.assertEqual(self.at(noise(2, 1, 2, None, 1)), 'its start is not known: a stream with a setting that is not known has no value')
        self.assertEqual(self.at(noise(2, 1, 2, 0, None)), 'its step is not known: a stream with a setting that is not known has no value')
        self.assertEqual(self.at(named('streams: one of each kind'), 0, 'v:Su'), 'its start is not known: a stream with a setting that is not known has no value')


@needs_numpy
class Csv(Project):
    def of(self, cols, rows, length=1, start=0, step=1, end='stop', path='data/rows.csv'):
        return stream('csv', cols, rows, length, start, step, end, path=path)

    def test_one_row_a_value_by_default(self):
        g = self.of(2, 1)
        self.assertEqual([self.at(g, t) for t in (0, 1, 9)], [[[0, 1]], [[10, 11]], [[90, 91]]])
        self.assertEqual(self.at(self.of(2, 1, path='data/named.csv'), 3), [[30, 31]])      # a header is no row

    def test_four_rows_a_value_and_the_next_begins_four_rows_on(self):
        g = self.of(2, 4, step=4)
        self.assertEqual(self.at(g, 0), [[0, 1], [10, 11], [20, 21], [30, 31]])
        self.assertEqual(self.at(g, 1), [[40, 41], [50, 51], [60, 61], [70, 71]])

    def test_a_step_of_1_gives_windows_that_overlap(self):
        g = self.of(2, 4, step=1)
        self.assertEqual(self.at(g, 1), [[10, 11], [20, 21], [30, 31], [40, 41]])
        self.assertEqual(self.at(g, 6), [[60, 61], [70, 71], [80, 81], [90, 91]])

    def test_several_values_side_by_side_from_a_start(self):
        g = self.of(4, 2, length=2, start=1, step=2)      # two values of two rows; value j at tick t begins at row 1 + 2t + 2j
        self.assertEqual(self.at(g, 0), [[10, 11, 30, 31], [20, 21, 40, 41]])
        self.assertEqual(self.at(g, 1), [[30, 31, 50, 51], [40, 41, 60, 61]])

    def test_past_its_end_a_stream_that_stops_has_ended_and_one_that_wraps_begins_again(self):
        g = self.of(2, 4, step=4)      # rows 0 to 3 at tick 0, 4 to 7 at tick 1, and at tick 2 it would need rows 8 to 11
        why = 'it ended at tick 2: data/rows.csv has 10 rows, and it stops at its end'
        self.assertEqual(self.at(g, 2), why)
        out = self.full(g, [{'node': 'v:b', 'cells': [[1, 1]]}, {'node': 's', 'cells': []}], 5)
        self.assertEqual(out, {'results': {}, 'errors': {'v:b': why, 's': why}, 'codes': {'v:b': {'code': 'ended', 'node': 's', 'tick': 2}, 's': {'code': 'ended', 'node': 's', 'tick': 2}}, 'ended': ['s']})
        self.assertNotIn('ended', self.full(g, [{'node': 'v:b', 'cells': [[1, 1]]}], 1))
        self.assertEqual(self.at(self.of(2, 1), 10), 'it ended at tick 10: data/rows.csv has 10 rows, and it stops at its end')
        self.assertEqual(self.at(self.of(2, 1, start=12), 0), 'it ended at tick 0: data/rows.csv has 10 rows, and it stops at its end')
        self.assertEqual(self.at(self.of(2, 1, path='data/total.csv'), 0), 'data/total.csv holds values of 1 × 1, and one value of its stream is 2 × 1: choose the file again, and the stream takes its size')
        wrap = self.of(2, 4, step=4, end='wrap')
        self.assertEqual(self.at(wrap, 2), [[80, 81], [90, 91], [0, 1], [10, 11]])
        self.assertEqual(self.at(wrap, 1000), self.at(wrap, 0))      # 4,000 rows on is 400 times round
        self.assertEqual(self.at(self.of(2, 1, end='wrap'), 2 ** 53 - 1), [[10 * ((2 ** 53 - 1) % 10), 10 * ((2 ** 53 - 1) % 10) + 1]])
        self.assertEqual(self.at(self.of(2, 12, end='wrap'), 0)[10:], [[0, 1], [10, 11]])      # a value longer than the file goes round too

    def test_a_file_that_is_gone_or_no_table_is_said(self):
        self.assertIn('data/none.csv is not in the project p', self.at(self.of(2, 1, path='data/none.csv')))
        self.put('bad.csv', b'1,x\n')
        self.assertIn('line 1', self.at(self.of(2, 1, path='data/bad.csv')))
        self.assertEqual(whole(self.of(2, 1), 'v:b'), 'data/rows.csv: the project has to be saved under a name before its data files can be read')


@needs_numpy
class Text(Project):
    def of(self, cols, length=1, start=0, step=1, end='stop', path='data/words.txt'):
        return stream('text', cols, 1, length, start, step, end, path=path)

    def test_one_code_point_to_a_character(self):
        points = [97, 233, 128512, 98, 10]      # by hand: U+0061, U+00E9, U+1F600, U+0062, U+000A
        self.assertEqual([ord(c) for c in TEXT], points)
        self.assertEqual(len(TEXT.encode('utf8')), 9)      # nine bytes, five characters
        self.assertEqual([self.at(self.of(1), t)[0][0] for t in range(5)], points)
        self.assertEqual(self.at(self.of(5)), [points])
        self.assertEqual(self.at(self.of(4, length=2, step=2), 0), [[97, 233, 128512, 98]])      # two values of two characters
        self.assertEqual(self.at(self.of(4, length=2, step=2), 1), 'it ended at tick 1: data/words.txt has 5 characters, and it stops at its end')      # from the third there are three left, and it shows four
        self.assertEqual(self.at(self.of(4, length=2, step=2, end='wrap'), 1), [[128512, 98, 10, 97]])      # two values of two characters, from the third
        self.assertEqual(self.at(self.of(2, start=1), 0), [[233, 128512]])
        self.assertEqual(self.at(self.of(1), 5), 'it ended at tick 5: data/words.txt has 5 characters, and it stops at its end')
        self.put('one.txt', b'x')
        self.assertEqual(self.at(self.of(1, path='data/one.txt'), 1), 'it ended at tick 1: data/one.txt has 1 character, and it stops at its end')

    def test_a_byte_order_mark_is_no_character_and_what_is_not_utf_8_is_refused(self):
        self.put('marked.txt', b'\xef\xbb\xbfhi')
        self.assertEqual(self.at(self.of(2, path='data/marked.txt')), [[104, 105]])
        self.put('latin.txt', 'café'.encode('latin-1'))
        why = 'data/latin.txt is not UTF-8 text: its byte 4 is no part of a UTF-8 character. A text file is read as UTF-8, one code point to a character'
        self.assertEqual(self.at(self.of(1, path='data/latin.txt')), why)
        with self.assertRaises(data.Refused) as e:
            R.upload('p', 'data/new.txt', 'café'.encode('latin-1'), self.root)
        self.assertEqual(str(e.exception), why.replace('latin', 'new'))
        self.assertFalse(os.path.exists(os.path.join(self.root, 'p', 'data', 'new.txt')))      # and nothing was kept
        with self.assertRaises(data.Refused) as e:
            R.upload('p', 'data/empty.txt', b'', self.root)
        self.assertEqual(str(e.exception), 'data/empty.txt is empty: a text has at least one character')
        self.assertEqual(R.upload('p', 'data/new.txt', TEXT.encode('utf8'), self.root), {'path': 'data/new.txt', 'cols': 1, 'rows': 1, 'length': 5})
        self.assertEqual(R.upload('p', 'data/nul.txt', b'a\x00b', self.root)['length'], 3)      # every code point is a character, the first of them too


@needs_numpy
class Npy(Project):
    def of(self, cols, rows, length=1, start=0, step=1, end='stop', path='data/a.npy'):
        return stream('npy', cols, rows, length, start, step, end, path=path)

    def test_one_value_for_each_index_along_the_first_axis(self):
        cube = np.arange(24, dtype=np.float32).reshape(4, 3, 2)      # value i is rows [[6i, 6i + 1], [6i + 2, 6i + 3], [6i + 4, 6i + 5]]
        self.npy('a.npy', cube)
        value = lambda i: [[6 * i, 6 * i + 1], [6 * i + 2, 6 * i + 3], [6 * i + 4, 6 * i + 5]]
        self.assertEqual([self.at(self.of(2, 3), t) for t in range(4)], [value(i) for i in range(4)])
        self.assertEqual(self.at(self.of(4, 3, length=2, step=2), 1), [a + b for a, b in zip(value(2), value(3))])
        self.assertEqual(self.at(self.of(2, 3), 4), 'it ended at tick 4: data/a.npy has 4 values, and it stops at its end')
        self.assertEqual(self.at(self.of(2, 3, end='wrap'), 5), value(1))
        self.assertEqual(self.at(self.of(3, 2)), 'data/a.npy holds values of 2 × 3, and one value of its stream is 3 × 2: choose the file again, and the stream takes its size')
        self.npy('row.npy', np.array([[1, 2, 3], [4, 5, 6]], dtype=np.float32))      # two axes: a value is a row
        self.assertEqual(self.at(self.of(3, 1, path='data/row.npy'), 1), [[4, 5, 6]])
        self.npy('line.npy', np.array([1.5, -2, 3], dtype=np.float32))      # one axis: a value is a number
        self.assertEqual(self.at(self.of(3, 1, length=3, path='data/line.npy')), [[1.5, -2, 3]])
        self.npy('big.npy', np.arange(6, dtype='>f4').reshape(3, 2))      # the other byte order: the same numbers
        self.assertEqual(self.at(self.of(2, 1, path='data/big.npy'), 2), [[4, 5]])
        self.npy('fortran.npy', np.asfortranarray(np.arange(6, dtype=np.float32).reshape(3, 2)))
        self.assertEqual(self.at(self.of(2, 1, path='data/fortran.npy'), 2), [[4, 5]])

    def test_only_32_bit_floats_are_taken_and_nothing_is_converted(self):
        def refused(name, body, why):
            with self.assertRaises(data.Refused) as e:
                R.upload('p', 'data/' + name, body, self.root)
            self.assertIn(why, str(e.exception))
            self.assertTrue(str(e.exception).startswith('data/%s is not read: ' % name), str(e.exception))
            self.assertFalse(os.path.exists(os.path.join(self.root, 'p', 'data', name)))
            self.put(name, body)      # and where such a file is there all the same, a run says the same
            self.assertIn(why, self.at(self.of(1, 1, path='data/' + name)))

        import io
        saved = lambda a, **more: (lambda out: (np.save(out, a, **more), out.getvalue())[1])(io.BytesIO())
        refused('wide.npy', saved(np.array([0.1, 0.2])), 'it holds 64-bit floats, and a .npy data file holds 32-bit floats: nothing is converted, since that could change its numbers. Save it again with astype("float32")')
        refused('whole.npy', saved(np.array([1, 2], dtype=np.int32)), 'it holds 32-bit whole numbers')
        refused('half.npy', saved(np.array([1, 2], dtype=np.float16)), 'it holds 16-bit floats')
        refused('flags.npy', saved(np.array([True, False])), 'it holds 8-bit booleans')
        refused('things.npy', saved(np.array([{}, []], dtype=object), allow_pickle=True), 'it holds objects')
        refused('none.npy', saved(np.array(1.0, dtype=np.float32)), 'it has no axes: a .npy data file has one to three')
        refused('four.npy', saved(np.zeros((2, 2, 2, 2), dtype=np.float32)), 'it has 4 axes: a .npy data file has one to three, the first being the one a stream moves along')
        refused('empty.npy', saved(np.zeros((0, 2), dtype=np.float32)), 'it holds no numbers')
        refused('nan.npy', saved(np.array([1, np.nan], dtype=np.float32)), 'it holds an entry that is no number (NaN)')
        refused('junk.npy', b'1,2\n3,4\n', 'it is not a .npy file')
        refused('zip.npy', b'PK\x03\x04' + b'\0' * 30, 'it is not a .npy file')
        refused('short.npy', saved(np.arange(6, dtype=np.float32))[:-4], 'its header says 6 numbers and it holds 20 bytes of them')
        self.assertEqual(R.upload('p', 'data/ok.npy', saved(np.zeros((5, 3, 2), dtype=np.float32)), self.root), {'path': 'data/ok.npy', 'cols': 2, 'rows': 3, 'length': 5})
        self.assertEqual(R.upload('p', 'data/inf.npy', saved(np.array([np.inf, 1], dtype=np.float32)), self.root)['length'], 2)      # an infinity is a number
        self.assertEqual(self.at(self.of(2, 1, length=2, path='data/inf.npy')), [['inf', 1]])
        self.assertEqual(R.upload('p', 'data/t.csv', b'a,b\n1,2\n3,4\n', self.root), {'path': 'data/t.csv', 'cols': 2, 'rows': 2, 'length': 2})      # a CSV says its length too: its rows


@needs_numpy
class Tick(Project):
    def test_a_loop_with_no_end_and_no_stop_block_is_the_state_of_cell_tick_plus_1(self):
        # by hand: C is index.x, S the state from 0, the step adds them: the cells hold 0, 1, 3, 6
        g = named('loops: no end and no stop block')
        loop = g['spaces']['top']['tiles'][0]['loop']
        self.assertEqual([self.at(g, t, loop) for t in range(5)], [[[0]], [[1]], [[3]], [[6]], [[10]]])
        self.assertEqual(self.at(g, 1000, loop), [[500500]])      # asked for at once: nothing was run before it
        self.assertEqual(self.at(g, 3, 'v:S'), [[0]])      # the block itself, looked at from nowhere, holds what was typed
        was = limits.MAX_STEPS
        try:
            import backend.evaluate as E
            E.MAX_STEPS = 50
            self.assertEqual(self.at(g, 50, loop), [[1275]])
            self.assertEqual(self.at(g, 51, loop), 'not stopped after 50 steps: a loop is stopped then')
        finally:
            E.MAX_STEPS = was
        out = ask(g, [{'node': loop, 'cells': [[1, 1]]}], tick=-1)
        self.assertEqual(out['errors']['*'], 'tick is a whole number, from 0')

    def test_the_running_total_of_a_streams_rows(self):
        # total.csv holds 3, 1, 4, 1, 5. In cell k the stream stands where it stood at tick k - 1, so at tick t the loop is the sum of the first t rows
        g = named('streams: the running total of a stream')
        g['nodes'][g['nodes']['v:x']['inputs'][0]]['path'] = 'data/total.csv'
        loop, s = g['spaces']['top']['tiles'][0]['loop'], g['nodes']['v:x']['inputs'][0]
        self.assertEqual(validate(g), [])
        self.assertEqual([self.at(g, t, loop) for t in range(6)], [[[0]], [[3]], [[4]], [[8]], [[9]], [[14]]])
        cell = lambda k: {'cells': [{'x': k - 1, 'y': 0, 'dx': 0, 'dy': 0, 'cx': k, 'cy': 1, 'of': ['t:T']}]}
        drawn = self.full(g, [{'node': 'v:x', 'as': 'x%d' % k, 'cells': [[1, 1]], 'binding': cell(k)} for k in (1, 2, 3)] + [{'node': 'v:S', 'as': 'S%d' % k, 'cells': [[1, 1]], 'binding': dict(cells=[dict(cell(k)['cells'][0], dy=1)])} for k in (1, 2, 3)], 4)
        self.assertEqual({k: v['cells'][0][2] for k, v in drawn['results'].items()}, {'x1': 3, 'x2': 1, 'x3': 4, 'S1': 0, 'S2': 3, 'S3': 4})      # the drawn cells are ticks 0, 1 and 2, whatever the clock says
        self.assertEqual(self.at(g, 4, 'v:x'), [[5]])      # and looked at from no cell the stream is at the clock's tick
        why = 'it ended at tick 5: data/total.csv has 5 rows, and it stops at its end'
        self.assertEqual(self.at(g, 5, loop), [[14]])      # five steps read rows 0 to 4
        out = self.full(g, [{'node': loop, 'cells': [[1, 1]]}], 6)      # the sixth would read a row that is not there
        self.assertEqual(out, {'results': {}, 'errors': {loop: why}, 'codes': {loop: {'code': 'ended', 'node': s, 'tick': 5}}, 'ended': [s]})
        g['nodes'][s]['end'] = 'wrap'
        self.assertEqual(self.at(g, 7, loop), [[18]])      # round again: 14, and then 3 and 1
        self.assertEqual(self.at(g, 1000, loop), [[200 * 14]])

    def test_a_stream_outside_an_infinite_tile_stands_at_the_clocks_tick(self):
        # O is a stream of total.csv (3, 1, 4, 1, 5) lying OUTSIDE infinite tile T; C inside T reads O by formula,
        # over state S (0), and the step adds them. Unlike a stream inside T (cell k -> tick k - 1), O stands at the
        # clock's tick in every cell, so at tick t the loop adds O(t) to S t times: 0, 1*1, 2*4, 3*1, 4*5.
        g = named('streams: the running total of a stream')
        s, tx = g['nodes']['v:x']['inputs'][0], copy.deepcopy(g['nodes']['v:x']['type'])
        g['nodes'][s]['path'] = 'data/total.csv'
        g['nodes']['v:O'] = {'op': 'variable', 'inputs': [s], 'type': copy.deepcopy(tx), 'name': 'O', 'named': True, 'defined': 'source', 'entries': {}, 'within': ['t:T']}
        g['nodes']['v:x'] = {'op': 'variable', 'inputs': ['v:O'], 'type': tx, 'name': 'x', 'named': True, 'defined': 'entries', 'entries': {'1,1': {'expr': '$1'}}, 'within': ['t:T']}
        g['blocks']['O'] = 'v:O'
        g['spaces']['top']['pieces'].append({'blocks': ['O'], 'rule': None, 'node': 'v:O', 'error': None})
        self.assertEqual(validate(g), [])
        loop = g['spaces']['top']['tiles'][0]['loop']
        self.assertEqual([self.at(g, t, loop) for t in range(5)], [[[0]], [[1]], [[8]], [[3]], [[20]]])
        cell = lambda k: {'cells': [{'x': k - 1, 'y': 0, 'dx': 0, 'dy': 0, 'cx': k, 'cy': 1, 'of': ['t:T']}]}
        drawn = self.full(g, [{'node': 'v:x', 'as': 'x%d' % k, 'cells': [[1, 1]], 'binding': cell(k)} for k in (1, 2, 3)], 4)
        self.assertEqual({k: v['cells'][0][2] for k, v in drawn['results'].items()}, {'x1': 5, 'x2': 5, 'x3': 5})      # every cell sees O at tick 4

    def test_a_streams_file_is_counted_against_the_runs_room_and_let_go(self):
        self.put('long.csv', ('\n'.join('%d' % r for r in range(5000)) + '\n').encode())      # 5,000 numbers: 20,000 bytes
        self.put('longer.csv', ('\n'.join('%d' % r for r in range(6000)) + '\n').encode())
        a, b = stream('csv', 1, 1, path='data/long.csv'), stream('csv', 1, 1, path='data/longer.csv')
        both = graph_of({'s': a['nodes']['s'], 't': b['nodes']['s']}, version=6)
        self.assertEqual(whole(a, 'v:b', root=self.root, project='p', tick=7, room=30000), 'data/long.csv holds 5,000 numbers, which need about 1 MB of memory, more than the 1 MB a run may take for one file')
        read = []

        def roll(kind, path):
            read.append(path)
            return A.rows_of(A.table(data.read_text('p', path, self.root), 0))

        work = Run(both, None, 3, 60000, None, roll)
        self.assertEqual(A.item(work.value('s'), 0, 0), 3)
        self.assertEqual(work.rolls_held, 20000)
        self.assertEqual(A.item(work.value('t'), 0, 0), 3)
        self.assertEqual((list(work.rolls), work.rolls_held), ([('csv', 'data/longer.csv')], 24000))      # the two together are more than half the room: the older was let go
        work.kept.clear()
        self.assertEqual(A.item(work.value('s'), 0, 0), 3)      # and is read again when it is asked for
        self.assertEqual(read, ['data/long.csv', 'data/longer.csv', 'data/long.csv'])
        roomy = Run(both, None, 3, ROOM, None, roll)
        roomy.value('s'), roomy.value('t'), roomy.value('s')
        self.assertEqual((len(roomy.rolls), roomy.rolls_held), (2, 44000))      # with room for both, each is read once
        self.assertEqual(read[3:], ['data/long.csv', 'data/longer.csv'])

    def test_every_fixture_with_a_stream_is_taken_and_the_health_says_version_6(self):
        self.assertEqual(R.health(), {'ok': True, 'version': 6, 'play': True})
        self.put('table.csv', b'1,2,3\n4,5,6\n7,8,9\n10,11,12\n')
        self.npy('cube.npy', np.arange(12, dtype=np.float32).reshape(2, 3, 2))
        g = named('streams: one of each kind')
        self.assertEqual(self.at(g, 0, 'v:Sc'), [[1, 2, 3, 7, 8, 9], [4, 5, 6, 10, 11, 12]])
        self.assertEqual(self.at(g, 1, 'v:Sc'), 'it ended at tick 1: data/table.csv has 4 rows, and it stops at its end')
        self.assertEqual(self.at(g, 1, 'v:St'), [[128512, 98, 10, 97]])
        self.assertEqual(self.at(g, 1, 'v:Sp'), [[6, 7], [8, 9], [10, 11]])
        self.assertEqual(self.at(g, 0, 'v:Sg'), [[f32(noise_entry(3, 'Sg', c, 1, 'normal', 5)) for c in (1, 2, 3)]])
        piece = next(p['node'] for p in g['spaces']['top']['pieces'] if 'Sm' in p['blocks'])
        n = [[f32(noise_entry(4, 'Sm', c, r, 'uniform', 2)) for c in (1, 2)] for r in (1, 2)]
        got = self.at(g, 2, piece)      # M is [[1, 0], [0, 2]]: the product's rows are the stream's first row and twice its second
        self.assertEqual(got[0], n[0])
        self.assertEqual(got[1], [f32(2 * n[1][0]), f32(2 * n[1][1])])


@needs_numpy
class Shipped(unittest.TestCase):
    def test_projects_streams_at_the_tick_it_was_saved_at(self):
        """The example that comes with the repository, read from its own data/ (the .npy among them, as its bytes): every
        number below is worked out by hand from the files, or is the generator told a second time."""
        from .support import ROOT
        g = named('projects/streams')
        root = os.path.join(ROOT, 'projects')
        name = {n['name']: i for i, n in g['nodes'].items() if n['op'] == 'variable' and n.get('named')}
        at = lambda block, tick=3: whole(g, name[block], root=root, project='streams', tick=tick)
        self.assertEqual(at('Rows'), [[60, 61, 80, 81], [70, 71, 90, 91]])      # two values of two rows, from row 6: rows 7 to 10 of ten
        self.assertEqual(at('Rows', 4), [[80, 81, 0, 1], [90, 91, 10, 11]])      # and round again
        self.assertEqual(at('Letters'), [[32, 104, 233, 108, 108]])      # " héll": the fifteenth character on, the factory before it being one
        self.assertEqual(at('Letters', 2), [[111, 114, 121, 32, 0x1F3ED]])      # "ory " and the factory, U+1F3ED
        self.assertEqual(at('Cube'), [[18, 19], [20, 21], [22, 23]])
        seed, key = 7, name['Draws'][2:]
        self.assertEqual(at('Draws'), [[f32(noise_entry(seed, key, c, r, 'uniform', 3 + j)) for j in range(4) for c in (1, 2)] for r in (1, 2)])
        plain = [[f32(noise_entry(7, name['Noise'][2:], c, r, 'uniform', 0)) for c in (1, 2, 3, 4)] for r in (1, 2)]
        self.assertEqual([at('Noise', t) for t in (0, 3, 1000)], [plain, plain, plain])
        loop = next(t['loop'] for t in g['spaces']['top']['tiles'] if 'loop' in t)
        total = lambda tick: whole(g, loop, root=root, project='streams', tick=tick)
        self.assertEqual([total(t) for t in (0, 1, 2, 3, 4, 5, 6)], [[[0]], [[3]], [[4]], [[8]], [[9]], [[14]], [[17]]])      # 3, 1, 4, 1, 5, and round again


if __name__ == '__main__':
    unittest.main()
