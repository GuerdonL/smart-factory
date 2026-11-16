"""server.py: the PIN. Run with: python3 -B -m unittest discover tests"""
import base64, json, os, shutil, sys, tempfile, threading, unittest
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server

HEAD = {'path': 'project.json', 'text': '{"format": "smart-factory/project", "version": 2}\n'}
basic = lambda pin, user='anyone': {'Authorization': 'Basic ' + base64.b64encode(('%s:%s' % (user, pin)).encode()).decode()}


class PinTest(unittest.TestCase):
    PIN = '4096'

    def setUp(self):
        """A server of its own, over a directory of its own, behind a PIN of its own."""
        self.kept, self.dir = (server.ROOT, server.PROJECTS, server.PIN), tempfile.mkdtemp(prefix='smart-factory-test-')
        shutil.copy(os.path.join(server.ROOT, 'smart-factory.html'), self.dir)
        with open(os.path.join(self.dir, 'smart-factory.js'), 'w') as f:
            f.write('/* the page */')
        server.ROOT, server.PROJECTS, server.PIN = self.dir, os.path.join(self.dir, 'projects'), self.PIN
        # the server's own log_message runs, as it does in use; only the line it would write to stderr is kept off the screen
        quiet = mock.patch.object(BaseHTTPRequestHandler, 'log_message', lambda *a: None)
        quiet.start(); self.addCleanup(quiet.stop)
        server.wrong.clear()
        self.httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=self.httpd.serve_forever, args=(0.01,), daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown(); self.httpd.server_close()
        server.ROOT, server.PROJECTS, server.PIN = self.kept
        server.wrong.clear()
        shutil.rmtree(self.dir, ignore_errors=True)

    def ask(self, method, path, body=None, headers=None):
        c = HTTPConnection('127.0.0.1', self.httpd.server_address[1], timeout=10)
        c.request(method, path, body=None if body is None else json.dumps(body).encode(), headers=headers or {})
        r = c.getresponse(); text = r.read().decode('utf8', 'replace'); c.close()
        return r.status, r.headers, text

    EVERYTHING = [('GET', '/'), ('GET', '/smart-factory.js'), ('HEAD', '/smart-factory.js'), ('GET', '/api/projects'), ('GET', '/api/projects/attention'),
                  ('PUT', '/api/projects/attention'), ('GET', '/no-such-file'), ('GET', '/.pin'), ('POST', '/'), ('DELETE', '/api/projects/attention')]

    def test_without_the_pin_nothing_is_answered_and_the_browser_is_made_to_ask(self):
        for method, path in self.EVERYTHING:
            status, headers, text = self.ask(method, path, [HEAD] if method == 'PUT' else None)
            self.assertEqual(status, 401, (method, path))
            self.assertTrue(headers['WWW-Authenticate'].startswith('Basic realm='), (method, path))
            self.assertNotIn('the page', text); self.assertNotIn('<script', text)
        self.assertFalse(os.path.exists(server.PROJECTS))      # the PUT wrote nothing

    def test_with_the_pin_everything_works_as_before(self):
        pin = basic(self.PIN)
        self.assertEqual(self.ask('GET', '/', headers=pin)[0], 200)
        self.assertEqual(self.ask('GET', '/smart-factory.js', headers=pin)[2], '/* the page */')
        self.assertEqual(self.ask('HEAD', '/smart-factory.js', headers=pin)[0], 200)
        self.assertEqual(self.ask('PUT', '/api/projects/attention', [HEAD], pin)[0], 200)
        self.assertEqual(json.loads(self.ask('GET', '/api/projects', headers=pin)[2]), ['attention'])
        self.assertEqual(json.loads(self.ask('GET', '/api/projects/attention', headers=pin)[2]), [HEAD])
        self.assertEqual(self.ask('GET', '/no-such-file', headers=pin)[0], 404)

    def test_the_user_name_can_be_anything(self):
        for user in ['', 'anyone', 'guest', 'ünïcödé']:
            self.assertEqual(self.ask('GET', '/', headers=basic(self.PIN, user))[0], 200, user)

    def test_a_wrong_pin_is_refused(self):
        for wrong in ['', '0000', self.PIN + '0', self.PIN[:-1], ' ' + self.PIN, self.PIN + ':' + self.PIN]:
            server.wrong.clear()
            self.assertEqual(self.ask('GET', '/', headers=basic(wrong))[0], 401, repr(wrong))
        for user in [self.PIN, self.PIN + ':x']:      # the PIN given as the user name is not the PIN given
            server.wrong.clear()
            self.assertEqual(self.ask('GET', '/', headers=basic('wrong', user))[0], 401, user)

    def test_what_is_not_a_pin_at_all_is_refused(self):
        for value in ['Basic', 'Basic !!!not base64!!!', 'Basic ' + base64.b64encode(b'no colon').decode(), 'Basic ' + base64.b64encode(b'\xff\xfe:\xff').decode(),
                      'Bearer ' + self.PIN, self.PIN, 'Basic ' + self.PIN]:
            server.wrong.clear()
            self.assertEqual(self.ask('GET', '/', headers={'Authorization': value})[0], 401, value)

    def test_a_pin_may_be_any_text(self):
        for pin in ['a longer pass phrase', 'with:colons:in', 'ünïcödé √2', '0']:
            server.PIN = pin
            self.assertEqual(self.ask('GET', '/', headers=basic(pin))[0], 200, pin)
            self.assertEqual(self.ask('GET', '/', headers=basic(pin + 'x'))[0], 401, pin)

    def test_too_many_wrong_pins_and_the_address_is_turned_away_even_with_the_right_one(self):
        for n in range(server.TRIES):
            self.assertEqual(self.ask('GET', '/', headers=basic('0000'))[0], 401, n)
        status, headers, _ = self.ask('GET', '/', headers=basic(self.PIN))
        self.assertEqual(status, 429)
        self.assertTrue(0 < int(headers['Retry-After']) <= server.LOCKED_FOR + 1)
        self.assertEqual(self.ask('GET', '/')[0], 429)
        self.assertEqual(self.ask('PUT', '/api/projects/attention', [HEAD], basic(self.PIN))[0], 429)
        self.assertFalse(os.path.exists(server.PROJECTS))

    def test_after_the_wait_the_address_may_try_again_with_a_fresh_count(self):
        with mock.patch.object(server.time, 'monotonic', return_value=1000.0) as clock:
            for n in range(server.TRIES):
                self.ask('GET', '/', headers=basic('0000'))
            clock.return_value = 1000.0 + server.LOCKED_FOR - 1
            self.assertEqual(self.ask('GET', '/', headers=basic(self.PIN))[0], 429)
            clock.return_value = 1000.0 + server.LOCKED_FOR + 1
            for n in range(server.TRIES - 1):                      # not turned away again at the first wrong one
                self.assertEqual(self.ask('GET', '/', headers=basic('0000'))[0], 401, n)
            self.assertEqual(self.ask('GET', '/', headers=basic(self.PIN))[0], 200)

    def test_asking_without_a_pin_does_not_count_as_a_wrong_one(self):
        for n in range(server.TRIES * 3):                          # a browser asks without it first, every time
            self.assertEqual(self.ask('GET', '/')[0], 401)
        self.assertEqual(self.ask('GET', '/', headers=basic(self.PIN))[0], 200)

    def test_the_right_pin_forgets_the_wrong_ones_before_it(self):
        for round in range(3):
            for n in range(server.TRIES - 1):
                self.assertEqual(self.ask('GET', '/', headers=basic('0000'))[0], 401)
            self.assertEqual(self.ask('GET', '/', headers=basic(self.PIN))[0], 200)

    def test_with_no_pin_set_there_is_no_password(self):
        server.PIN = None
        self.assertEqual(self.ask('GET', '/')[0], 200)
        self.assertEqual(self.ask('PUT', '/api/projects/attention', [HEAD])[0], 200)
        self.assertEqual(self.ask('GET', '/', headers=basic('anything'))[0], 200)

    def test_the_pin_is_read_from_the_environment_or_else_from_the_file(self):
        with mock.patch.dict(os.environ):
            os.environ.pop('SMART_FACTORY_PIN', None)
            self.assertIsNone(server.read_pin())                   # neither
            for text, pin in [('1357\n', '1357'), ('  2468  \n\nsecond line\n', '2468'), ('', None), ('\n', None)]:
                with open(os.path.join(self.dir, '.pin'), 'w') as f:
                    f.write(text)
                self.assertEqual(server.read_pin(), pin, repr(text))
            with open(os.path.join(self.dir, '.pin'), 'w') as f:
                f.write('1357\n')
            os.environ['SMART_FACTORY_PIN'] = ' 9753 '
            self.assertEqual(server.read_pin(), '9753')            # the environment comes first
            os.environ['SMART_FACTORY_PIN'] = '  '
            self.assertEqual(server.read_pin(), '1357')            # unless it is empty

    def test_the_pin_file_is_not_kept_in_the_repository(self):
        repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(repo, '.gitignore')) as f:
            self.assertIn('.pin', f.read().split())


if __name__ == '__main__':
    unittest.main()
