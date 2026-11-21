"""service.py: the process. What it answers, whom it answers, and that a run is really stopped."""
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import http.client
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


TOKEN = 'a-token-for-these-tests'
HEADER = 'X-Smart-Factory-Token'
SMALL = graph_of({'s': {'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'identity'}})


@needs_numpy
class Service(unittest.TestCase):
    SECONDS = 2      # the time a run may take in these tests (30 in use: limits.py)

    @classmethod
    def setUpClass(cls):
        cls.root = tempfile.mkdtemp(prefix='smart-factory-service-')
        os.makedirs(os.path.join(cls.root, 'my project'))
        with open(os.path.join(cls.root, 'my project', 'project.json'), 'w') as f:
            f.write('{}')
        cls.server = Server(0, seconds=cls.SECONDS, root=cls.root, quiet=True, token=TOKEN, memory=2 << 30)      # (port 0: any free port, on the loopback address)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, args=(0.05,), daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        shutil.rmtree(cls.root, ignore_errors=True)

    def request(self, method, path, body=None, headers=None, timeout=60, token=TOKEN):
        c = HTTPConnection('127.0.0.1', self.port, timeout=timeout)
        c.request(method, path, body=body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode(), headers=dict({} if token is None else {HEADER: token}, **(headers or {})))
        r = c.getresponse()
        text = r.read().decode('utf8')
        c.close()
        return r.status, json.loads(text)

    def run_graph(self, graph, want, **more):
        return self.request('POST', '/run', dict({'graph': graph, 'want': want}, **more))

    def test_health_and_a_run(self):
        self.assertEqual(self.request('GET', '/health'), (200, {'ok': True, 'version': 3}))
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

    def test_nothing_is_answered_without_the_token(self):
        """Any process on the machine can reach the port; only one that can read the token's file is answered."""
        for token in [None, '', 'wrong', TOKEN + 'x', TOKEN[:-1], TOKEN.upper(), 'ü' * 40]:
            headers = {} if token is None else {HEADER: token.encode('utf8').decode('latin1')}
            for method, path, body in [('GET', '/health', None), ('POST', '/run', {'graph': SMALL, 'want': [{'node': 's', 'cells': [[1, 1]]}]}), ('POST', '/data?project=my%20project&path=data/t.csv', b'1,2\n')]:
                status, out = self.request(method, path, body, headers, token=None)
                self.assertEqual((status, out), (403, {'error': 'the backend answers server.py on this machine, and nothing else'}), (token, path))
        self.assertFalse(os.path.exists(os.path.join(self.root, 'my project', 'data', 't.csv')))      # and nothing was written

    def test_the_token_is_made_anew_in_a_file_only_its_owner_can_read(self):
        from backend.service import new_token
        path = os.path.join(self.root, 'token')
        with open(path, 'w') as f:
            f.write('an old one, readable by all')
        os.chmod(path, 0o644)
        first = new_token(path)
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
        with open(path) as f:
            self.assertEqual(f.read(), first + '\n')
        self.assertEqual(len(first), 64)
        self.assertNotEqual(new_token(path), first)
        os.unlink(path)

    def test_an_outsized_body_is_refused_unread(self):
        c = HTTPConnection('127.0.0.1', self.port, timeout=20)
        c.putrequest('POST', '/run')
        c.putheader(HEADER, TOKEN)
        c.putheader('Content-Length', str(limits.MAX_BODY + 1))
        c.endheaders()      # the body is never sent: the answer comes from the headers alone
        r = c.getresponse()
        self.assertEqual((r.status, json.loads(r.read())['errors']), (413, {'*': 'the request is larger than 5 MB'}))
        c.close()
        c = HTTPConnection('127.0.0.1', self.port, timeout=20)
        c.putrequest('POST', '/data?project=p&path=data/a.csv')
        c.putheader(HEADER, TOKEN)
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
            c.putheader(HEADER, TOKEN)
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
        self.assertEqual(self.request('POST', '/data?project=my%20project&path=data/tiny.csv', b'1e-60,2\n-1e-50,1e-45\n'), (200, {'path': 'data/tiny.csv', 'cols': 2, 'rows': 2, 'small': 2}))      # too small for 32 bits: taken, read as 0, and counted
        tiny = graph_of({'f': {'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'file', 'path': 'data/tiny.csv'}})
        status, out = self.run_graph(tiny, [{'node': 'f', 'cells': [[1, 1], [1, 2]]}], project='my project')
        self.assertEqual([c[2] for c in out['results']['f']['cells']], [0.0, -0.0])
        g = graph_of({'f': {'op': 'source', 'inputs': [], 'type': T(2, 2), 'kind': 'file', 'path': 'data/w.csv'}})
        self.assertEqual(self.run_graph(g, [{'node': 'f', 'cells': [[2, 2]]}], project='my project')[1]['results']['f']['cells'], [[2, 2, 4.0]])
        for query, why in [('project=my%20project&path=../w.csv', 'a data file is at data/'), ('project=..&path=data/w.csv', 'a project name is'), ('project=my%20project&path=data/..%2F..%2Fx.csv', 'a data file is at data/'),
                           ('project=my%20project&path=data/w.csv%00', 'a data file is at data/'), ('project=my%20project', 'a data file is at data/'), ('path=data/w.csv', 'a project name is'), ('', 'a project name is'),
                           ('project=%2Fetc&path=data/w.csv', 'a project name is')]:
            status, out = self.request('POST', '/data?' + query, b'1,2\n')
            self.assertEqual(status, 200, query)      # refused, and said so in the answer
            self.assertEqual(list(out), ['error'], query)
            self.assertIn(why, out['error'], query)
        for project in ['not saved', 'menu']:      # a project that has not been saved has no directory made for it
            status, out = self.request('POST', '/data?project=%s&path=data/w.csv' % project.replace(' ', '%20'), b'1,2\n')
            self.assertEqual((status, out), (200, {'error': 'there is no saved project called %s: save the project under a name first, and its data files are kept with it' % project}))
        status, out = self.request('POST', '/data?project=my%20project&path=data/w.csv', b'9,9\n')      # and a file that is there is not replaced
        self.assertIn('a data file is not replaced', out['error'])
        self.assertEqual(self.request('POST', '/data?project=my%20project&path=data/w.csv', b'a,b\n1,2\n3,4\n'), (200, {'path': 'data/w.csv', 'cols': 2, 'rows': 2}))      # the same file again is the file
        status, out = self.request('POST', '/data?project=my%20project&path=data/bad.csv', b'1,2\n3,oops\n')
        self.assertEqual((status, out['error'][:21]), (200, 'line 2 is not numbers'))
        self.assertEqual(sorted(os.listdir(self.root)), ['my project'])
        self.assertEqual(sorted(os.listdir(os.path.join(self.root, 'my project', 'data'))), ['tiny.csv', 'w.csv'])

    def test_a_file_is_read_in_a_worker_under_the_same_time_as_a_run(self):
        """The server itself reads no file: one that takes too long to read is stopped as a run is, and the server goes on."""
        slow = (','.join(['1'] * 2000) + '\n').encode() * 5000      # ten million numbers: more than two seconds of reading, here
        began = time.monotonic()
        status, out = self.request('POST', '/data?project=my%20project&path=data/slow.csv', slow)
        self.assertEqual((status, out), (200, {'error': 'reading the file took longer than 2 seconds and was stopped'}))
        self.assertLess(time.monotonic() - began, self.SECONDS + 5)
        self.assertEqual(self.request('GET', '/health')[0], 200)
        self.assertEqual([n for n in os.listdir(os.path.join(self.root, 'my project', 'data')) if not n.startswith('.')] if os.path.isdir(os.path.join(self.root, 'my project', 'data')) else [], [n for n in ['w.csv'] if os.path.exists(os.path.join(self.root, 'my project', 'data', n))])

    def test_only_so_many_files_are_taken_at_once(self):
        held = [self.server.uploads.acquire(blocking=False) for _ in range(limits.UPLOADS)]
        try:
            self.assertEqual(self.request('POST', '/data?project=my%20project&path=data/x.csv', b'1\n'), (200, {'error': 'the backend is taking other files just now: choose the file again in a moment'}))
        finally:
            for h in held:
                self.server.uploads.release()


@needs_numpy
class Memory(unittest.TestCase):
    def post(self, port, graph, want):
        c = HTTPConnection('127.0.0.1', port, timeout=60)
        c.request('POST', '/run', json.dumps({'graph': graph, 'want': want}).encode(), {HEADER: TOKEN})
        out = json.loads(c.getresponse().read())
        c.close()
        return out

    def test_what_the_count_of_a_runs_memory_missed_ends_in_a_refusal_and_the_worker_goes_on(self):
        """The backstop: a worker told it has room it has not got (8 GB) with an address space of 1.2 GB."""
        server = Server(0, seconds=20, quiet=True, workers=1, memory=8 << 30, address=1200 << 20, token=TOKEN)
        threading.Thread(target=server.serve_forever, args=(0.05,), daemon=True).start()
        try:
            port = server.server_address[1]
            nodes = {'n%d' % k: {'op': 'noise', 'inputs': [], 'type': T(4000, 4000), 'seed': k, 'dist': 'normal', 'key': 'b'} for k in range(12)}
            nodes['sum'] = {'op': 'add', 'inputs': list(nodes), 'type': T(4000, 4000)}
            out = self.post(port, graph_of(nodes), [{'node': 'sum', 'cells': [[1, 1]]}])
            self.assertIn('more memory than the backend may take', out['errors']['*'])
            self.assertEqual(self.post(port, SMALL, [{'node': 's', 'cells': [[1, 1]]}])['errors'], {})
        finally:
            server.shutdown()
            server.server_close()

    def test_a_tiny_request_for_a_great_deal_is_refused_by_a_worker_with_the_machines_share(self):
        server = Server(0, seconds=20, quiet=True, workers=1, memory=limits.memory_for_arrays(None, 2), token=TOKEN)
        threading.Thread(target=server.serve_forever, args=(0.05,), daemon=True).start()
        try:
            n = 4000
            nodes = {'n0': {'op': 'source', 'inputs': [], 'type': T(n, n), 'kind': 'ones'}, 'm': {'op': 'source', 'inputs': [], 'type': T(n, n), 'kind': 'identity'}}
            for k in range(1, 400):
                nodes['n%d' % k] = {'op': 'add', 'inputs': ['n%d' % (k - 1), 'm'], 'type': T(n, n)}
            began = time.monotonic()
            out = self.post(server.server_address[1], graph_of(nodes), [{'node': 'n399', 'cells': [[1, 1]]}])
            self.assertLess(time.monotonic() - began, 3)
            self.assertIn('which needs about', out['errors']['n399'])
            self.assertIn('this backend may take for a run', out['errors']['n399'])
        finally:
            server.shutdown()
            server.server_close()


@needs_numpy
class Stopping(unittest.TestCase):
    """The backend as it is run, `python -m backend`: told to stop, or gone without being told, no worker is left working."""

    def start(self):
        self.dir = tempfile.mkdtemp(prefix='smart-factory-stop-')
        self.addCleanup(shutil.rmtree, self.dir, True)
        env = dict(os.environ, SMART_FACTORY_BACKEND_TOKEN=os.path.join(self.dir, 'token'), SMART_FACTORY_PROJECTS=self.dir, PYTHONDONTWRITEBYTECODE='1')
        from .support import ROOT
        p = subprocess.Popen([sys.executable, '-B', '-m', 'backend', '0'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        self.addCleanup(lambda: (p.poll() is None and p.kill(), p.stdout.close(), p.wait()))
        line = p.stdout.readline()
        port = int(line.split('127.0.0.1:')[1].split(' ')[0])
        with open(os.path.join(self.dir, 'token')) as f:
            token = f.read().strip()
        self.assertEqual(os.stat(os.path.join(self.dir, 'token')).st_mode & 0o777, 0o600)
        for _ in range(100):      # the workers, once they are up
            with open('/proc/%d/task/%d/children' % (p.pid, p.pid)) as f:
                kids = [int(k) for k in f.read().split()]
            if len(kids) >= limits.WORKERS:
                break
            time.sleep(0.1)

        def busy():
            c = HTTPConnection('127.0.0.1', port, timeout=60)
            try:
                c.request('POST', '/run', json.dumps({'graph': endless(), 'want': [{'node': 'rep', 'cells': [[1, 1]]}]}).encode(), {HEADER: token})
                c.getresponse().read()
            except (OSError, http.client.HTTPException):
                pass
            finally:
                c.close()
        threading.Thread(target=busy, daemon=True).start()
        time.sleep(1.5)      # a worker is now deep in a run that would take minutes
        return p, kids

    @staticmethod
    def alive(pid):
        try:
            with open('/proc/%d/stat' % pid) as f:
                return f.read().split(') ')[1][0] != 'Z'
        except OSError:
            return False

    def gone(self, pids, within):
        until = time.monotonic() + within
        while time.monotonic() < until:
            left = [k for k in pids if self.alive(k)]
            if not left:
                return True
            time.sleep(0.1)
        return False

    def test_told_to_stop_it_ends_its_workers_whatever_they_are_working_out(self):
        p, kids = self.start()
        p.send_signal(signal.SIGTERM)
        self.assertEqual(p.wait(10), 0)
        self.assertTrue(self.gone(kids, 5), 'a worker outlived the backend that was told to stop')

    def test_gone_without_being_told_its_workers_end_themselves(self):
        p, kids = self.start()
        p.kill()      # nothing of the server's own runs: the workers have to see it for themselves
        p.wait(10)
        self.assertTrue(self.gone(kids, 5), 'a worker went on working after its backend was gone')
