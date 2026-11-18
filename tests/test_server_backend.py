"""server.py and the backend: what is passed on to it, and what is not; and the data files a project keeps.
The backend here is a stand-in made from the standard library, which keeps what it was asked: these tests need no NumPy."""
import base64, json, os, sys, threading, unittest
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from serving import ServerCase, server


class StandIn(ThreadingHTTPServer):
    """A backend that answers what it is told to and keeps every request it was sent."""
    daemon_threads = True

    def __init__(self):
        super().__init__(('127.0.0.1', 0), StandInHandler)
        self.seen, self.answer = [], (200, {}, b'{"ok": true, "version": 1}')
        threading.Thread(target=self.serve_forever, args=(0.01,), daemon=True).start()


class StandInHandler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def handle_any(self):
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0))
        self.server.seen.append({'method': self.command, 'path': self.path, 'headers': {k.lower(): v for k, v in self.headers.items()}, 'body': body})
        status, headers, data = self.server.answer
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    do_GET = do_POST = do_PUT = do_HEAD = handle_any


class Trickle(ThreadingHTTPServer):
    """A backend whose answer comes a byte now and then and never ends."""
    daemon_threads = True

    def __init__(self):
        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                import time
                self.rfile.read(int(self.headers.get('Content-Length') or 0))
                self.send_response(200); self.send_header('Content-Length', '1000000'); self.end_headers()
                try:
                    for _ in range(40):
                        self.wfile.write(b' '); self.wfile.flush(); time.sleep(0.25)
                except OSError:
                    pass
        super().__init__(('127.0.0.1', 0), H)
        threading.Thread(target=self.serve_forever, args=(0.01,), daemon=True).start()


class BackendCase(ServerCase):
    def setUp(self):
        super().setUp()
        self.backend, self.elsewhere = StandIn(), StandIn()
        self.kept_backend, server.BACKEND = server.BACKEND, ('127.0.0.1', self.backend.server_address[1])
        self.kept_token, server.TOKEN = server.TOKEN, os.path.join(self.dir, 'backend-token')      # the backend's token, as it writes it when it starts
        with open(server.TOKEN, 'w') as f:
            f.write('the-backends-token\n')

    def tearDown(self):
        server.BACKEND, server.TOKEN = self.kept_backend, self.kept_token
        for s in (self.backend, self.elsewhere):
            s.shutdown(); s.server_close()
        super().tearDown()


class PassedOn(BackendCase):
    def test_health_and_a_run_are_passed_on_and_the_answer_comes_back(self):
        status, _, text = self.request('GET', '/api/backend/health')
        self.assertEqual((status, json.loads(text)), (200, {'ok': True, 'version': 1}))
        self.backend.answer = (200, {}, b'{"results": {"a": 1}, "errors": {}}')
        status, headers, text = self.request('POST', '/api/backend/run', {'graph': {'nodes': {}}, 'want': []}, {'Cookie': 'secret=1', 'Origin': 'http://page.example', 'X-Other': 'x', 'Authorization': 'Basic abc'})
        self.assertEqual((status, json.loads(text)), (200, {'results': {'a': 1}, 'errors': {}}))
        self.assertIn('application/json', headers['Content-Type'])
        seen = self.backend.seen
        self.assertEqual([(r['method'], r['path']) for r in seen], [('GET', '/health'), ('POST', '/run')])
        self.assertEqual(json.loads(seen[1]['body']), {'graph': {'nodes': {}}, 'want': []})
        # nothing of the browser's goes on: not its PIN, its cookies, or where the page came from
        for r in seen:
            self.assertEqual(sorted(k for k in r['headers'] if k not in ('accept-encoding',)), sorted(['host', 'content-type', 'x-smart-factory-token'] + (['content-length'] if r['method'] == 'POST' else [])))
            self.assertEqual(r['headers']['x-smart-factory-token'], 'the-backends-token')      # what shows the backend that this is the server
            self.assertEqual(r['headers']['host'], '127.0.0.1:%d' % self.backend.server_address[1])

    def test_what_the_backend_refuses_comes_back_as_it_said_it(self):
        self.backend.answer = (400, {}, b'{"error": "line 2 is not numbers"}')
        status, _, text = self.request('POST', '/api/backend/data?project=p&path=data/a.csv', b'1,2\nx\n')
        self.assertEqual((status, json.loads(text)), (400, {'error': 'line 2 is not numbers'}))

    def test_only_the_three_addresses_are_passed_on(self):
        for method, path in [('GET', '/api/backend'), ('GET', '/api/backend/'), ('GET', '/api/backend/run'), ('GET', '/api/backend/data'), ('POST', '/api/backend/health'), ('GET', '/api/backend/other'), ('POST', '/api/backend/run/x'),
                             ('POST', '/api/backend/../projects/x'), ('POST', '/api/backend//run'), ('POST', '/api/backend/run%2F..'), ('GET', '/api/backend/health/'), ('PUT', '/api/backend/run'), ('POST', '/api/backendrun'),
                             ('POST', '/api/projects/x'), ('POST', '/'), ('GET', '/api/backend/http://127.0.0.1:%d/health' % self.elsewhere.server_address[1])]:
            status, _, _ = self.request(method, path, b'{}' if method != 'GET' else None)
            self.assertIn(status, (404, 400), (method, path))
        self.assertEqual(self.backend.seen, [])
        self.assertEqual(self.elsewhere.seen, [])
        # a query is not passed on with a run, and a file's is written out again: its two names and nothing else
        self.request('POST', '/api/backend/run?to=http://evil.example&x=1', b'{}')
        self.request('GET', '/api/backend/health?x=1#frag')
        self.request('POST', '/api/backend/data?project=my%20project&path=data/w.csv&other=1&project=last', b'1\n')
        self.request('POST', '/api/backend/data?project=a%26path%3Devil%0d%0aX-Injected:%201&path=../../x', b'1\n')
        self.assertEqual([r['path'] for r in self.backend.seen], ['/run', '/health', '/data?project=last&path=data%2Fw.csv', '/data?project=a%26path%3Devil%0D%0AX-Injected%3A%201&path=..%2F..%2Fx'])
        self.assertNotIn('x-injected', self.backend.seen[-1]['headers'])

    def test_an_answer_that_sends_the_request_elsewhere_is_not_followed(self):
        there = 'http://127.0.0.1:%d/run' % self.elsewhere.server_address[1]
        for code in (301, 302, 303, 307, 308):
            self.backend.answer = (code, {'Location': there}, b'')
            status, headers, text = self.request('POST', '/api/backend/run', {'graph': {}})
            self.assertEqual(status, 502, code)
            self.assertIn('not followed', json.loads(text)['error'])
            self.assertIsNone(headers.get('Location'))
        self.assertEqual(self.elsewhere.seen, [])

    def test_no_more_is_read_than_is_said(self):
        for path, most in [('/api/backend/run', 5 * 2 ** 20), ('/api/backend/data?project=p&path=data/a.csv', 50 * 2 ** 20)]:
            c = HTTPConnection('127.0.0.1', self.httpd.server_address[1], timeout=20)
            c.putrequest('POST', path); c.putheader('Content-Length', str(most + 1)); c.endheaders()      # the body is never sent
            r = c.getresponse()
            self.assertEqual((r.status, json.loads(r.read())['error']), (413, 'that is larger than the %d MB the backend takes' % (most >> 20)))
            c.close()
        for headers in [{'Transfer-Encoding': 'chunked'}, {'Content-Length': 'x'}, {'Content-Length': '-1'}, {}]:
            c = HTTPConnection('127.0.0.1', self.httpd.server_address[1], timeout=20)
            c.putrequest('POST', '/api/backend/run')
            for k, v in headers.items():
                c.putheader(k, v)
            c.endheaders()
            self.assertEqual(c.getresponse().status, 411, headers)
            c.close()
        self.assertEqual(self.backend.seen, [])
        status, _, _ = self.request('POST', '/api/backend/run', b' ' * (5 * 2 ** 20))      # the boundary: 5 MB goes on
        self.assertEqual((status, len(self.backend.seen[0]['body'])), (200, 5 * 2 ** 20))
        self.backend.answer = (200, {}, b' ' * (server.ANSWER + 1))      # and an answer larger than is read is not handed on
        status, _, text = self.request('POST', '/api/backend/run', b'{}')
        self.assertEqual((status, json.loads(text)['error']), (502, 'the backend answered with more than 8 MB'))
        self.backend.answer = (200, {}, b' ' * server.ANSWER)
        self.assertEqual(self.request('POST', '/api/backend/run', b'{}')[0], 200)

    def test_with_no_backend_the_page_is_told_so(self):
        gone = StandIn(); port = gone.server_address[1]; gone.shutdown(); gone.server_close()
        server.BACKEND = ('127.0.0.1', port)
        for method, path in [('GET', '/api/backend/health'), ('POST', '/api/backend/run'), ('POST', '/api/backend/data?project=p&path=data/a.csv')]:
            status, _, text = self.request(method, path, b'{}' if method == 'POST' else None)
            self.assertEqual(status, 200)      # that there is none is an answer, said in the form the address answers in
            self.assertEqual(json.loads(text)['ok'], False)
            self.assertIn('the backend is not answering', json.loads(text)['error'])
        self.assertEqual(json.loads(self.request('POST', '/api/backend/run', b'{}')[2])['errors'], {'*': json.loads(text)['error']})
        self.assertEqual(self.request('GET', '/api/projects')[0], 200)      # and everything else goes on as it did

    def test_the_token_is_read_each_time_and_without_it_there_is_no_backend_to_talk_to(self):
        with open(server.TOKEN, 'w') as f:
            f.write('a-new-one\n')      # the backend was started again
        self.request('GET', '/api/backend/health')
        self.assertEqual(self.backend.seen[-1]['headers']['x-smart-factory-token'], 'a-new-one')
        for make in (lambda: os.unlink(server.TOKEN), lambda: self.write(b''), lambda: self.write(b'\xff\xfe')):
            with open(server.TOKEN, 'w') as f:
                f.write('x')
            make()
            seen = len(self.backend.seen)
            status, _, text = self.request('POST', '/api/backend/run', b'{}')
            self.assertEqual((status, json.loads(text)['ok']), (200, False))
            self.assertIn('its token', json.loads(text)['error'])
            self.assertEqual(len(self.backend.seen), seen)      # nothing is sent without it

    @staticmethod
    def write(data):
        with open(server.TOKEN, 'wb') as f:
            f.write(data)

    def test_neither_a_slow_request_nor_a_slow_answer_is_waited_on_past_its_time(self):
        import socket, time
        kept = server.READ, server.WAIT
        try:
            server.READ = server.WAIT = 1
            s = socket.create_connection(('127.0.0.1', self.httpd.server_address[1]))
            s.sendall(b'POST /api/backend/run HTTP/1.1\r\nHost: x\r\nContent-Length: 100\r\n\r\n')
            began = time.monotonic()
            for _ in range(6):      # a body that comes a byte at a time, for ever: each byte in time, the whole never
                time.sleep(0.3)
                try:
                    s.sendall(b'{')
                except OSError:
                    break
            s.settimeout(5)
            answer = s.recv(4096).decode()
            s.close()
            self.assertIn(' 408 ', answer.split('\r\n')[0])
            self.assertIn('took longer than 1 seconds to arrive', answer)
            self.assertLess(time.monotonic() - began, 3)
            self.assertEqual(self.backend.seen, [])
            # and a backend that answers a little now and then, for ever
            slow = Trickle()
            server.BACKEND = ('127.0.0.1', slow.server_address[1])
            began = time.monotonic()
            status, _, text = self.request('POST', '/api/backend/run', b'{}')
            self.assertLess(time.monotonic() - began, 3)
            self.assertEqual((status, json.loads(text)['ok']), (200, False))
            self.assertIn('the backend is not answering', json.loads(text)['error'])
            slow.shutdown(); slow.server_close()
        finally:
            server.READ, server.WAIT = kept

    def test_the_limits_here_are_the_backends_own(self):
        sys.path.insert(0, server.ROOT if os.path.isdir(os.path.join(server.ROOT, 'backend')) else os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from backend import limits
        self.assertEqual((server.PASSED['/run'], server.PASSED['/data'], server.ANSWER), (limits.MAX_BODY, limits.MAX_UPLOAD, limits.MAX_ANSWER))
        self.assertGreater(server.WAIT, limits.MAX_SECONDS + limits.MAX_WAIT)

    def test_the_backends_address_is_one_http_address_or_the_server_does_not_start(self):
        for given, want in [('', ('127.0.0.1', 8001)), ('http://127.0.0.1:8123', ('127.0.0.1', 8123)), ('http://localhost:9000/', ('localhost', 9000)), (' http://10.0.0.5:81 ', ('10.0.0.5', 81))]:
            with mock.patch.dict(os.environ, {'SMART_FACTORY_BACKEND': given}):
                self.assertEqual(server.read_backend(), want)
        for given in ['https://127.0.0.1:8001', '127.0.0.1:8001', 'http://127.0.0.1:8001/api', 'http://user:pw@127.0.0.1:8001', 'http://127.0.0.1:8001?x=1', 'http://', 'file:///etc/passwd', 'http://127.0.0.1:port']:
            with mock.patch.dict(os.environ, {'SMART_FACTORY_BACKEND': given}):
                with self.assertRaises(SystemExit, msg=given):
                    server.read_backend()


class BehindThePin(BackendCase):
    PIN = '4821'

    def test_nothing_reaches_the_backend_without_the_pin(self):
        right = {'Authorization': 'Basic ' + base64.b64encode(b'anyone:4821').decode()}
        for headers in [{}, {'Authorization': 'Basic ' + base64.b64encode(b'anyone:0000').decode()}, {'Authorization': 'Bearer 4821'}, {'Cookie': 'pin=4821'}]:
            for method, path in [('GET', '/api/backend/health'), ('POST', '/api/backend/run'), ('POST', '/api/backend/data?project=p&path=data/a.csv')]:
                status, _, _ = self.request(method, path, b'{}' if method == 'POST' else None, headers)
                self.assertEqual(status, 401, (method, path, headers))
        self.assertEqual(self.backend.seen, [])
        self.assertEqual(self.request('GET', '/api/backend/health', None, right)[0], 200)
        self.assertEqual(self.request('POST', '/api/backend/run', b'{}', right)[0], 200)
        self.assertEqual(len(self.backend.seen), 2)
        self.assertNotIn('authorization', self.backend.seen[1]['headers'])      # the PIN itself is not passed on


class DataFiles(ServerCase):
    HEAD = {'path': 'project.json', 'text': '{}'}

    def test_a_projects_csv_files_under_data_are_kept_and_given_back(self):
        files = [self.HEAD, {'path': 'Keys.json', 'text': '{}'}, {'path': 'data/w.csv', 'text': 'a,b\r\n1,2\n'}, {'path': 'data/My Weights-2.csv', 'text': '1\n'}]
        self.assertEqual(self.request('PUT', '/api/projects/p', files)[0], 200)
        status, _, text = self.request('GET', '/api/projects/p')
        self.assertEqual(sorted(json.loads(text), key=lambda f: f['path']), sorted(files, key=lambda f: f['path']))      # as they were sent, line ends and all
        self.assertEqual(self.request('PUT', '/api/projects/p', [self.HEAD])[0], 200)      # saved without it, it is gone: the directory is exactly the files
        self.assertFalse(os.path.exists(os.path.join(self.dir, 'projects', 'p', 'data')))

    def test_a_csv_anywhere_else_is_refused_and_nothing_is_written(self):
        for path in ['data/a..csv', 'data/a...b.csv', 'w.csv', 'data/../w.csv', '../data/w.csv', 'data/sub/w.csv', 'Keys/data/w.csv', 'data/.hidden.csv', 'data/w.csv/', '/data/w.csv', 'data\\w.csv', 'data/w\0.csv', 'data/w.CSV', 'data/' + 'a' * 81 + '.csv', 'data/w.txt', 'data/w.csv\n']:
            status, _, text = self.request('PUT', '/api/projects/q', [self.HEAD, {'path': path, 'text': '1\n'}])
            self.assertEqual(status, 400, path)
            self.assertIn('not a path a project may contain', json.loads(text)['error'])
        self.assertFalse(os.path.exists(os.path.join(self.dir, 'projects', 'q')))
        self.assertEqual(os.listdir(os.path.join(self.dir, 'projects')) if os.path.isdir(os.path.join(self.dir, 'projects')) else [], [])

    def test_a_link_among_the_data_files_is_not_read(self):
        self.request('PUT', '/api/projects/p', [self.HEAD, {'path': 'data/w.csv', 'text': '1\n'}])
        secret = os.path.join(self.dir, 'secret.csv')
        with open(secret, 'w') as f:
            f.write('9\n')
        os.symlink(secret, os.path.join(self.dir, 'projects', 'p', 'data', 'link.csv'))
        with open(os.path.join(self.dir, 'projects', 'p', 'data', 'bytes.csv'), 'wb') as f:
            f.write(b'\xff\xfe\x00')
        # nor one among its shapes: a .json or a .config that is a link is no file of the project, and what it points at is never given out
        os.symlink(secret, os.path.join(self.dir, 'projects', 'p', 'Linked.json'))
        os.symlink(secret, os.path.join(self.dir, 'projects', 'p', '.config'))
        os.makedirs(os.path.join(self.dir, 'outside'))
        with open(os.path.join(self.dir, 'outside', 'In.json'), 'w') as f:
            f.write('{"secret": true}')
        os.symlink(os.path.join(self.dir, 'outside'), os.path.join(self.dir, 'projects', 'p', 'Dir'))
        status, _, text = self.request('GET', '/api/projects/p')
        self.assertEqual(sorted(f['path'] for f in json.loads(text)), ['data/w.csv', 'project.json'])
        self.assertNotIn('9', ''.join(f['text'] for f in json.loads(text) if f['path'] != 'data/w.csv'))
