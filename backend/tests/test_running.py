"""Running, .backend ceiling, and checkpoints (phase 9E): play/poll/stop, concurrency with /run, unpolled timeout,
per-pass timeout and ceiling, checkpoint write/restore/eviction/invalidation, and auth on every new endpoint."""
import json
import os
import shutil
import tempfile
import threading
import time
import unittest
from http.client import HTTPConnection

from .support import HAVE_NUMPY, T, fixture, graph_of, needs_numpy, variable
from backend import checkpoints as C
from backend import limits

if HAVE_NUMPY:
    from backend.service import Server
    from backend import evaluate as E

TOKEN = 'running-test-token'
HEADER = 'X-Smart-Factory-Token'
SMALL = graph_of({'s': {'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'identity'}})


def named(name):
    import copy
    return copy.deepcopy(next(g['graph'] for g in fixture('graphs.json') if g['name'] == name))


def slow_loop_graph():
    """A graph whose single pass takes well over 1 second (4000x4000 repeat)."""
    v = variable(1, 1, [[{'expr': 'index.x + index.y'}]], 'P', within=['t:t'])
    rep = {'op': 'repeat', 'inputs': ['v:p'], 'type': T(4000, 4000), 'at': [{'col': 0, 'row': 0}], 'pattern': {'cols': 1, 'rows': 1}, 'across': 4000, 'down': 4000}
    return graph_of({'v:p': v, 'rep': rep}, spaces={'top': {'owner': None, 'pieces': [], 'arrows': [], 'tiles': [{'tile': 't:t', 'blocks': ['p'], 'arrows': [], 'node': 'rep', 'error': None}]}}, blocks={'p': 'v:p'})


@needs_numpy
class Running(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix='smart-factory-running-')
        self.addCleanup(shutil.rmtree, self.root, True)
        os.makedirs(os.path.join(self.root, 'p', 'data'))
        with open(os.path.join(self.root, 'p', 'project.json'), 'w') as f:
            f.write('{}')
        with open(os.path.join(self.root, 'p', 'data', 'total.csv'), 'w') as f:
            f.write('3\n1\n4\n1\n5\n')
        self.server = Server(0, seconds=5, root=self.root, quiet=True, token=TOKEN, memory=2 << 30,
                             max_seconds=5, unpolled=10, checkpoint_idle=0.05)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, args=(0.02,), daemon=True).start()
        self.addCleanup(self._stop_server)

    def _stop_server(self):
        self.server.shutdown()
        self.server.server_close()

    def req(self, method, path, body=None, headers=None, token=TOKEN):
        c = HTTPConnection('127.0.0.1', self.port, timeout=30)
        hdrs = {} if token is None else {HEADER: token}
        if headers:
            hdrs.update(headers)
        data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
        c.request(method, path, body=data, headers=hdrs)
        r = c.getresponse()
        raw = r.read().decode('utf8')
        c.close()
        return r.status, json.loads(raw)

    def walk_graph(self):
        """A noise stream feeding an infinite loop (projects/running)."""
        g = named('projects/running')
        loop = next(t['loop'] for t in g['spaces']['top']['tiles'] if 'loop' in t)
        return g, loop

    def test_play_poll_stop_50_ticks_matches_run(self):
        g, loop = self.walk_graph()
        status, started = self.req('POST', '/play', {'graph': g, 'want': [{'node': loop, 'cells': [[1, 1]]}], 'from': 0, 'to': 50, 'project': 'p'})
        self.assertEqual(status, 200)
        self.assertIn('run', started)
        self.assertEqual((started['seconds'], started['ceiling']), (5, 5))
        run_id = started['run']
        after = -1
        last = None
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            st, polled = self.req('GET', '/play/%s?after=%d' % (run_id, after))
            self.assertEqual(st, 200)
            if polled.get('tick') is not None:
                after = polled['tick']
                last = polled
            if not polled.get('running'):
                break
            time.sleep(0.02)
        self.assertIsNotNone(last)
        self.assertEqual(last['tick'], 50)
        self.assertFalse(last['running'])
        # Compare tick 50 result with standalone /run at tick 50 (on a fresh project with no checkpoints)
        _, ref = self.req('POST', '/run', {'graph': g, 'want': [{'node': loop, 'cells': [[1, 1]]}], 'tick': 50})
        self.assertAlmostEqual(last['results'][loop]['cells'][0][2], ref['results'][loop]['cells'][0][2], places=5)
        # Stopping an already finished run answers its last tick cleanly
        st, stopped = self.req('POST', '/stop', {'run': run_id})
        self.assertEqual((st, stopped), (200, {'tick': 50}))
        # Checkpoint at tick 50 was written on stop
        self.assertTrue(C.has_any('p', self.root))

    def test_second_play_refused_and_run_works_while_playing(self):
        g, loop = self.walk_graph()
        st, started = self.req('POST', '/play', {'graph': g, 'want': [{'node': loop, 'cells': [[1, 1]]}], 'from': 0, 'to': None, 'project': 'p'})
        self.assertEqual(st, 200)
        run_id = started['run']
        try:
            # Second play is refused with a sentence
            st2, second = self.req('POST', '/play', {'graph': g, 'want': [{'node': loop, 'cells': [[1, 1]]}], 'from': 0, 'to': 5})
            self.assertEqual(st2, 200)
            self.assertIn('already playing', second['error'])
            # Regular /run still answers promptly while playing
            began = time.monotonic()
            st3, ans = self.req('POST', '/run', {'graph': SMALL, 'want': [{'node': 's', 'cells': [[1, 1]]}]})
            self.assertEqual((st3, ans['errors']), (200, {}))
            self.assertLess(time.monotonic() - began, 2.0)
        finally:
            st4, stopped = self.req('POST', '/stop', {'run': run_id})
            self.assertEqual(st4, 200)
            self.assertIsInstance(stopped['tick'], int)

    def test_stream_ended_stops_play_cleanly(self):
        g = named('streams: the running total of a stream')
        s = g['nodes']['v:x']['inputs'][0]
        g['nodes'][s]['path'] = 'data/total.csv'
        loop = g['spaces']['top']['tiles'][0]['loop']
        st, started = self.req('POST', '/play', {'graph': g, 'want': [{'node': loop, 'cells': [[1, 1]]}], 'from': 0, 'to': None, 'project': 'p'})
        self.assertEqual(st, 200)
        run_id = started['run']
        final = None
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            _, p = self.req('GET', '/play/%s?after=-1' % run_id)
            if not p.get('running'):
                final = p
                break
            time.sleep(0.02)
        self.assertIsNotNone(final)
        self.assertEqual(final['tick'], 6)
        self.assertEqual(final['ended'], [s])

    def test_unpolled_run_stops_automatically(self):
        srv = Server(0, seconds=5, root=self.root, quiet=True, token=TOKEN, memory=2 << 30, unpolled=0.5)
        port = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, args=(0.02,), daemon=True).start()
        try:
            g, loop = self.walk_graph()
            c = HTTPConnection('127.0.0.1', port, timeout=15)
            c.request('POST', '/play', json.dumps({'graph': g, 'want': [{'node': loop, 'cells': [[1, 1]]}], 'from': 0, 'to': None}).encode(), {HEADER: TOKEN})
            started = json.loads(c.getresponse().read())
            c.close()
            run_id = started['run']
            time.sleep(1.0)      # no poll for > 0.5s -> watchdog stops it
            c = HTTPConnection('127.0.0.1', port, timeout=15)
            c.request('GET', '/play/%s?after=-1' % run_id, headers={HEADER: TOKEN})
            polled = json.loads(c.getresponse().read())
            c.close()
            self.assertFalse(polled['running'])
            self.assertIn('no poll', polled.get('reason', ''))
        finally:
            srv.shutdown()
            srv.server_close()

    def test_seconds_per_pass_timeout_and_ceiling(self):
        g, loop = self.walk_graph()
        # Requesting more than ceiling (5) grants ceiling and sets capped: True
        st, started = self.req('POST', '/play', {'graph': g, 'want': [{'node': loop, 'cells': [[1, 1]]}], 'from': 0, 'to': 2, 'seconds': 25})
        self.assertEqual(st, 200)
        self.assertEqual((started['seconds'], started['ceiling'], started.get('capped')), (5, 5, True))
        self.req('POST', '/stop', {'run': started['run']})

        # A pass exceeding seconds per pass (1s) stops the run with its sentence and respawns the playing worker
        st, slow = self.req('POST', '/play', {'graph': slow_loop_graph(), 'want': [{'node': 'rep', 'cells': [[1, 1]]}], 'from': 0, 'to': 2, 'seconds': 1})
        self.assertEqual(st, 200)
        run_id = slow['run']
        deadline = time.monotonic() + 10
        final = None
        while time.monotonic() < deadline:
            _, p = self.req('GET', '/play/%s?after=-1' % run_id)
            if not p.get('running'):
                final = p
                break
            time.sleep(0.05)
        self.assertIsNotNone(final)
        self.assertIn('longer than 1 second', final.get('reason', ''))
        # Playing worker recovered and can play again
        st, again = self.req('POST', '/play', {'graph': g, 'want': [{'node': loop, 'cells': [[1, 1]]}], 'from': 0, 'to': 2})
        self.assertEqual(st, 200)
        self.assertIn('run', again)
        self.req('POST', '/stop', {'run': again['run']})

    def test_checkpoints_save_restore_changed_loop_and_budget(self):
        g, loop = self.walk_graph()
        # 1. Checkpoint written via POST /checkpoint at tick 500
        st, ck = self.req('POST', '/checkpoint', {'graph': g, 'tick': 500, 'project': 'p'})
        self.assertEqual((st, ck), (200, {'ok': True, 'written': 1, 'tick': 500}))
        # Repeating /checkpoint at tick 500 is a no-op (already cached)
        st, ck2 = self.req('POST', '/checkpoint', {'graph': g, 'tick': 500, 'project': 'p'})
        self.assertEqual((st, ck2), (200, {'ok': True, 'written': 0, 'tick': 500}))

        # 2. Reopening / running at tick 500 restores from checkpoint without running 500 steps
        # Verify directly with MAX_STEPS = 5 in-process: without checkpoint tick 500 fails, with checkpoint it succeeds!
        from backend import run as R
        body = json.dumps({'graph': g, 'want': [{'node': loop, 'cells': [[1, 1]]}], 'tick': 500, 'project': 'p'}).encode()
        was = E.MAX_STEPS
        try:
            E.MAX_STEPS = 5
            restored = R.run(body, self.root)
            self.assertEqual(restored['errors'], {})
            self.assertNotIn('recomputed', restored)
            # Without project (no checkpoint), tick 500 exceeds MAX_STEPS = 5
            no_ckpt = R.run(json.dumps({'graph': g, 'want': [{'node': loop, 'cells': [[1, 1]]}], 'tick': 500}).encode(), self.root)
            self.assertIn('not stopped after 5 steps', no_ckpt['errors'][loop])
        finally:
            E.MAX_STEPS = was
        # Verify exact match with uncheckpointed tick 500 result
        _, fresh = self.req('POST', '/run', {'graph': g, 'want': [{'node': loop, 'cells': [[1, 1]]}], 'tick': 500})
        self.assertAlmostEqual(restored['results'][loop]['cells'][0][2], fresh['results'][loop]['cells'][0][2], places=6)

        # 3. Changing the loop (e.g. changing noise seed) does NOT load the old checkpoint and reports recomputed
        g2 = json.loads(json.dumps(g))
        stream_id = next(i for i, n in g2['nodes'].items() if n['op'] == 'stream')
        g2['nodes'][stream_id]['seed'] = 99
        _, miss = self.req('POST', '/run', {'graph': g2, 'want': [{'node': loop, 'cells': [[1, 1]]}], 'tick': 10, 'project': 'p'})
        self.assertEqual(miss['errors'], {})
        self.assertEqual(miss.get('recomputed'), [loop])

        # 4. Budget eviction removes oldest non-kept checkpoints first and preserves kept checkpoints
        d = C.checkpoint_dir('p', self.root)
        # Clear existing and save three checkpoints with tight budget
        shutil.rmtree(d)
        from backend import arrays as A
        arr = A.full(2, 2, 1.0)
        C.save('p', self.root, 'a' * 32, arr, 1, loop, budget=10000, kept=True)
        time.sleep(0.02)
        C.save('p', self.root, 'b' * 32, arr, 2, loop, budget=10000, kept=False)
        time.sleep(0.02)
        # Measure size of one entry (npy + json) and set budget so only 2 fit -> 'b' evicted, 'a' (kept) + 'c' (new) stay
        one_size = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d) if f.startswith('b' * 32))
        C.save('p', self.root, 'c' * 32, arr, 3, loop, budget=one_size * 2 + 10, kept=False)
        present = {f[:-4] for f in os.listdir(d) if f.endswith('.npy') and not f.endswith('.mask.npy')}
        self.assertEqual(present, {'a' * 32, 'c' * 32})

    def test_idle_checkpoints_written_during_play(self):
        g, loop = self.walk_graph()
        # checkpoint_idle=0.05 on self.server -> playing for ~0.2s writes at least one idle checkpoint before stop
        st, started = self.req('POST', '/play', {'graph': g, 'want': [{'node': loop, 'cells': [[1, 1]]}], 'from': 0, 'to': None, 'project': 'p'})
        self.assertEqual(st, 200)
        run_id = started['run']
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and not C.has_any('p', self.root):
                self.req('GET', '/play/%s?after=-1' % run_id)
                time.sleep(0.05)
            self.assertTrue(C.has_any('p', self.root))
        finally:
            self.req('POST', '/stop', {'run': run_id})

    def test_auth_origin_and_host_refused_on_all_new_endpoints(self):
        routes = [
            ('POST', '/play', {'graph': SMALL, 'want': []}),
            ('GET', '/play/' + 'a' * 16 + '?after=0', None),
            ('POST', '/stop', {'run': 'a' * 16}),
            ('POST', '/checkpoint', {'graph': SMALL, 'tick': 1, 'project': 'p'}),
        ]
        # Missing / wrong token
        for bad_tok in [None, '', 'wrong-token']:
            for method, path, body in routes:
                st, out = self.req(method, path, body, token=bad_tok)
                self.assertEqual(st, 403, (bad_tok, method, path))
                self.assertIn('server.py', out['error'])
        # Origin / wrong Host
        for hdrs in [{'Origin': 'http://evil.example'}, {'Origin': 'null'}, {'Host': 'evil.example'}, {'Host': 'evil.example:%d' % self.port}]:
            for method, path, body in routes:
                st, _ = self.req(method, path, body, headers=hdrs)
                self.assertEqual(st, 403, (hdrs, method, path))


if __name__ == '__main__':
    unittest.main()
