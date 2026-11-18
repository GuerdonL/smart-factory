"""service.py: the process. What it answers, whom it answers, and that a run is really stopped."""
import json
import os
import shutil
import tempfile
import threading
import time
import unittest
from http.client import HTTPConnection

from .support import HAVE_NUMPY, T, graph_of, needs_numpy, variable
from backend import limits

if HAVE_NUMPY:
    from backend.service import Server


def endless():
    """A graph that would take minutes: sixteen million cells, each worked out on its own."""
    v = variable(1, 1, [[{'expr': 'index.x + index.y'}]], 'P', within=['t:t'])
    rep = {'op': 'repeat', 'inputs': ['v:p'], 'type': T(4000, 4000), 'at': [{'col': 0, 'row': 0}], 'pattern': {'cols': 1, 'rows': 1}, 'across': 4000, 'down': 4000}
    return graph_of({'v:p': v, 'rep': rep}, spaces={'top': {'owner': None, 'pieces': [], 'arrows': [], 'tiles': [{'tile': 't:t', 'blocks': ['p'], 'arrows': [], 'node': 'rep', 'error': None}]}}, blocks={'p': 'v:p'})


SMALL = graph_of({'s': {'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'identity'}})


@needs_numpy
class Service(unittest.TestCase):
    SECONDS = 2      # the time a run may take in these tests (30 in use: limits.py)

    @classmethod
    def setUpClass(cls):
        cls.root = tempfile.mkdtemp(prefix='smart-factory-service-')
        cls.server = Server(0, seconds=cls.SECONDS, root=cls.root, quiet=True)      # (port 0: any free port, on the loopback address)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, args=(0.05,), daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        shutil.rmtree(cls.root, ignore_errors=True)

    def request(self, method, path, body=None, headers=None, timeout=60):
        c = HTTPConnection('127.0.0.1', self.port, timeout=timeout)
        c.request(method, path, body=body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode(), headers=headers or {})
        r = c.getresponse()
        text = r.read().decode('utf8')
        c.close()
        return r.status, json.loads(text)

    def run_graph(self, graph, want, **more):
        return self.request('POST', '/run', dict({'graph': graph, 'want': want}, **more))

    def test_health_and_a_run(self):
        self.assertEqual(self.request('GET', '/health'), (200, {'ok': True, 'version': 1}))
        self.assertEqual(self.run_graph(SMALL, [{'node': 's', 'cells': [[1, 1], [2, 1]]}]),
                         (200, {'results': {'s': {'cols': 2, 'rows': 2, 'cells': [[1, 1, 1.0], [2, 1, 0.0]], 'min': 0.0, 'max': 1.0, 'mean': 0.5}}, 'errors': {}}))
        self.assertEqual(self.request('GET', '/nothing')[0], 404)
        self.assertEqual(self.request('POST', '/health', b'{}')[0], 404)
        self.assertEqual(self.request('GET', '/run')[0], 404)

    def test_it_listens_on_the_loopback_address_only(self):
        self.assertEqual(self.server.server_address[0], '127.0.0.1')

    def test_a_web_page_cannot_reach_it_behind_the_servers_back(self):
        for headers in [{'Origin': 'http://evil.example'}, {'Origin': 'null'}, {'Host': 'evil.example'}, {'Host': 'evil.example:%d' % self.port}, {'Host': '127.0.0.1.evil.example:%d' % self.port}]:
            self.assertEqual(self.request('GET', '/health', headers=headers)[0], 403, headers)
            self.assertEqual(self.request('POST', '/run', {'graph': SMALL, 'want': []}, headers=headers)[0], 403, headers)
            self.assertEqual(self.request('POST', '/data?project=p&path=data/a.csv', b'1,2\n', headers=headers)[0], 403, headers)
        self.assertFalse(os.path.exists(os.path.join(self.root, 'p')))
        self.assertEqual(self.request('GET', '/health', headers={'Host': 'localhost:%d' % self.port})[0], 200)

    def test_an_outsized_body_is_refused_unread(self):
        c = HTTPConnection('127.0.0.1', self.port, timeout=20)
        c.putrequest('POST', '/run')
        c.putheader('Content-Length', str(limits.MAX_BODY + 1))
        c.endheaders()      # the body is never sent: the answer comes from the headers alone
        r = c.getresponse()
        self.assertEqual((r.status, json.loads(r.read())['errors']), (413, {'*': 'the request is larger than 5 MB'}))
        c.close()
        c = HTTPConnection('127.0.0.1', self.port, timeout=20)
        c.putrequest('POST', '/data?project=p&path=data/a.csv')
        c.putheader('Content-Length', str(limits.MAX_UPLOAD + 1))
        c.endheaders()
        r = c.getresponse()
        self.assertEqual((r.status, json.loads(r.read())), (413, {'error': 'the file is larger than 50 MB', 'results': {}, 'errors': {'*': 'the file is larger than 50 MB'}}))
        c.close()
        status, out = self.request('POST', '/run', b' ' * limits.MAX_BODY)      # the boundary: 5 MB is read (and is no request)
        self.assertEqual((status, out['errors']['*'][:23]), (200, 'the request is not JSON'))
        for headers in [{'Transfer-Encoding': 'chunked'}, {'Content-Length': 'many'}, {'Content-Length': '-5'}]:
            c = HTTPConnection('127.0.0.1', self.port, timeout=20)
            c.putrequest('POST', '/run')
            for k, v in headers.items():
                c.putheader(k, v)
            c.endheaders()
            self.assertEqual(c.getresponse().status, 411, headers)
            c.close()

    def test_a_run_that_takes_too_long_is_stopped_and_the_next_is_answered(self):
        before = [p.pid for p in self.server.workers.all]
        began = time.monotonic()
        status, out = self.run_graph(endless(), [{'node': 'rep', 'cells': [[1, 1]]}])
        took = time.monotonic() - began
        self.assertEqual((status, out), (200, {'results': {}, 'errors': {'*': 'the run took longer than 2 seconds and was stopped'}}))
        self.assertLess(took, self.SECONDS + 4)
        self.assertGreaterEqual(took, self.SECONDS)
        time.sleep(0.3)
        now = [p.pid for p in self.server.workers.all]
        gone = [pid for pid in before if pid not in now]
        self.assertEqual(len(gone), 1)      # the worker that was doing it is ended, not left running
        with self.assertRaises(OSError):
            os.kill(gone[0], 0)
        self.assertEqual(len(now), limits.WORKERS)      # and another has taken its place
        self.assertEqual(self.run_graph(SMALL, [{'node': 's', 'cells': [[1, 1]]}])[1]['errors'], {})

    def test_other_runs_are_answered_while_one_is_being_worked_out(self):
        slow = threading.Thread(target=lambda: self.run_graph(endless(), [{'node': 'rep', 'cells': [[1, 1]]}]))
        slow.start()
        time.sleep(0.3)
        began = time.monotonic()
        self.assertEqual(self.request('GET', '/health')[0], 200)
        self.assertEqual(self.run_graph(SMALL, [{'node': 's', 'cells': [[1, 1]]}])[1]['errors'], {})
        self.assertLess(time.monotonic() - began, 1.5)
        slow.join()

    def test_whatever_is_sent_it_goes_on_answering(self):
        deep = b'{"graph":' + b'[' * 300000 + b']' * 300000 + b'}'
        chain = graph_of({'n0': variable(1, 1, [[1]])})
        for k in range(1, 20000):
            chain['nodes']['n%d' % k] = {'op': 'transpose', 'inputs': ['n%d' % (k - 1)], 'type': T(1, 1)}
        for body in [b'', b'nonsense', b'\x00' * 100, deep, json.dumps({'graph': {'version': 1, 'nodes': {'a': 1}, 'functions': {}, 'spaces': {}, 'blocks': {}}, 'want': [{'node': 'a'}]}).encode()]:
            status, out = self.request('POST', '/run', body)
            self.assertEqual(status, 200)
            self.assertIn('*', out['errors'])
        status, out = self.run_graph(chain, [{'node': 'n19999', 'cells': [[1, 1]]}])      # twenty thousand nodes deep: worked out, on a stack made for it
        self.assertEqual(out, {'results': {'n19999': {'cols': 1, 'rows': 1, 'cells': [[1, 1, 1.0]], 'min': 1.0, 'max': 1.0, 'mean': 1.0}}, 'errors': {}})
        self.assertEqual(self.request('GET', '/health')[0], 200)

    def test_a_file_is_uploaded_into_its_projects_data_and_nowhere_else(self):
        self.assertEqual(self.request('POST', '/data?project=my%20project&path=data/w.csv', b'a,b\n1,2\n3,4\n'), (200, {'path': 'data/w.csv', 'cols': 2, 'rows': 2}))
        with open(os.path.join(self.root, 'my project', 'data', 'w.csv')) as f:
            self.assertEqual(f.read(), 'a,b\n1,2\n3,4\n')
        g = graph_of({'f': {'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'file', 'path': 'data/w.csv'}})
        self.assertEqual(self.run_graph(g, [{'node': 'f', 'cells': [[2, 2]]}], project='my project')[1]['results']['f']['cells'], [[2, 2, 4.0]])
        for query, why in [('project=my%20project&path=../w.csv', 'a data file is at data/'), ('project=..&path=data/w.csv', 'a project name is'), ('project=my%20project&path=data/..%2F..%2Fx.csv', 'a data file is at data/'),
                           ('project=my%20project&path=data/w.csv%00', 'a data file is at data/'), ('project=my%20project', 'a data file is at data/'), ('path=data/w.csv', 'a project name is'), ('', 'a project name is'),
                           ('project=%2Fetc&path=data/w.csv', 'a project name is')]:
            status, out = self.request('POST', '/data?' + query, b'1,2\n')
            self.assertEqual(status, 400, query)
            self.assertIn(why, out['error'], query)
        status, out = self.request('POST', '/data?project=my%20project&path=data/bad.csv', b'1,2\n3,oops\n')
        self.assertEqual((status, out['error'][:21]), (400, 'line 2 is not numbers'))
        self.assertEqual(sorted(os.listdir(self.root)), ['my project'])
        self.assertEqual(os.listdir(os.path.join(self.root, 'my project', 'data')), ['w.csv'])


@needs_numpy
class Memory(unittest.TestCase):
    def test_a_run_that_needs_more_memory_than_a_worker_may_take_is_refused_and_the_worker_goes_on(self):
        server = Server(0, seconds=20, quiet=True, workers=1, memory=1200 << 20)      # 1.2 GB for this worker, its stack included
        threading.Thread(target=server.serve_forever, args=(0.05,), daemon=True).start()
        try:
            port = server.server_address[1]
            nodes = {'n%d' % k: {'op': 'noise', 'inputs': [], 'type': T(4000, 4000), 'seed': k, 'dist': 'normal', 'key': 'b'} for k in range(8)}
            nodes['sum'] = {'op': 'add', 'inputs': list(nodes), 'type': T(4000, 4000)}

            def post(graph, want):
                c = HTTPConnection('127.0.0.1', port, timeout=60)
                c.request('POST', '/run', json.dumps({'graph': graph, 'want': want}).encode())
                out = json.loads(c.getresponse().read())
                c.close()
                return out
            out = post(graph_of(nodes), [{'node': 'sum', 'cells': [[1, 1]]}])
            self.assertIn('more memory than the backend may take', out['errors']['*'])
            self.assertEqual(post(SMALL, [{'node': 's', 'cells': [[1, 1]]}])['errors'], {})
        finally:
            server.shutdown()
            server.server_close()
