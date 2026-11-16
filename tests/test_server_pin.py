"""server.py: the PIN. Run with: python3 -B -m unittest discover tests"""
import base64, json, os, socket, sys, time, unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from serving import ServerCase, server

HEAD = {'path': 'project.json', 'text': '{"format": "smart-factory/project", "version": 2}\n'}
basic = lambda pin, user='anyone': {'Authorization': 'Basic ' + base64.b64encode(('%s:%s' % (user, pin)).encode()).decode()}
guess = lambda n: basic('%04d' % n)      # the nth wrong PIN: each different, as someone guessing would send them


class PinTest(ServerCase):
    PIN = '4096'
    SERVED = {'smart-factory.js': '/* the page */'}
    ask = ServerCase.request

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
            self.assertEqual(self.ask('GET', '/', headers=guess(n))[0], 401, n)
        status, headers, _ = self.ask('GET', '/', headers=basic(self.PIN))
        self.assertEqual(status, 429)
        self.assertTrue(0 < int(headers['Retry-After']) <= server.LOCKED_FOR + 1)
        self.assertEqual(self.ask('GET', '/')[0], 429)
        self.assertEqual(self.ask('PUT', '/api/projects/attention', [HEAD], basic(self.PIN))[0], 429)
        self.assertFalse(os.path.exists(server.PROJECTS))

    def test_after_the_wait_the_address_may_try_again_with_a_fresh_count(self):
        with mock.patch.object(server, 'clock', return_value=1000.0) as clock:      # the server's clock alone, not the whole process's
            for n in range(server.TRIES):
                self.ask('GET', '/', headers=guess(n))
            clock.return_value = 1000.0 + server.LOCKED_FOR - 1
            self.assertEqual(self.ask('GET', '/', headers=basic(self.PIN))[0], 429)
            clock.return_value = 1000.0 + server.LOCKED_FOR + 1
            for n in range(server.TRIES - 1):                      # not turned away again at the first wrong one
                self.assertEqual(self.ask('GET', '/', headers=guess(n))[0], 401, n)
            self.assertEqual(self.ask('GET', '/', headers=basic(self.PIN))[0], 200)

    def test_asking_without_a_pin_does_not_count_as_a_wrong_one(self):
        for n in range(server.TRIES * 3):                          # a browser asks without it first, every time
            self.assertEqual(self.ask('GET', '/')[0], 401)
        self.assertEqual(self.ask('GET', '/', headers=basic(self.PIN))[0], 200)

    def test_the_same_wrong_pin_again_does_not_count_twice(self):
        for n in range(server.TRIES * 4):                          # a page left open, resending the PIN it was given before the PIN was changed
            self.assertEqual(self.ask('GET', '/smart-factory.js', headers=basic('1234'))[0], 401, n)
        self.assertEqual(self.ask('GET', '/', headers=basic(self.PIN))[0], 200)
        for n in range(server.TRIES - 1):                          # but with others it is still one of the five
            self.ask('GET', '/', headers=basic('1234')); self.ask('GET', '/', headers=guess(n))
        self.assertEqual(self.ask('GET', '/', headers=basic(self.PIN))[0], 429)

    def test_the_right_pin_forgets_the_wrong_ones_before_it(self):
        for round in range(3):
            for n in range(server.TRIES - 1):
                self.assertEqual(self.ask('GET', '/', headers=guess(n))[0], 401)
            self.assertEqual(self.ask('GET', '/', headers=basic(self.PIN))[0], 200)

    def test_wrong_pins_are_forgotten_after_a_while(self):
        with mock.patch.object(server, 'clock', return_value=1000.0) as clock:
            for n in range(server.TRIES - 1):
                self.ask('GET', '/', headers=guess(n))
            clock.return_value = 1000.0 + server.LOCKED_FOR + 1      # long after: one more is the first, not the fifth
            for n in range(server.TRIES - 1):
                self.assertEqual(self.ask('GET', '/', headers=guess(10 + n))[0], 401, n)
            self.assertEqual(self.ask('GET', '/', headers=basic(self.PIN))[0], 200)

    def test_addresses_that_gave_wrong_pins_are_not_kept_for_ever(self):
        with mock.patch.object(server, 'clock', return_value=1000.0) as clock:
            with server.wrong_lock:
                for n in range(1000):                              # a thousand addresses, a wrong PIN each, some turned away
                    server.wrong['10.0.%d.%d' % divmod(n, 250)] = {'since': 1000.0, 'seen': {b'x'}, 'until': 1000.0 + server.LOCKED_FOR if n % 2 else 0}
            self.ask('GET', '/')
            self.assertEqual(len(server.wrong), 1000)              # all still within their time
            clock.return_value = 1000.0 + server.LOCKED_FOR + 1
            self.ask('GET', '/')
            self.assertEqual(server.wrong, {})

    def test_a_refused_save_is_told_so_however_large_it_is(self):
        large = [HEAD, {'path': 'Large.json', 'text': 'x' * (20 << 20)}]      # 20 MB: more than is taken in before the answer goes out
        status, headers, text = self.ask('PUT', '/api/projects/attention', large)
        self.assertEqual((status, json.loads(text)), (401, {'error': 'the PIN is needed'}))
        for n in range(server.TRIES):
            self.assertEqual(self.ask('PUT', '/api/projects/attention', large, guess(n))[0], 401, n)
        status, headers, text = self.ask('PUT', '/api/projects/attention', large, basic(self.PIN))
        self.assertEqual((status, json.loads(text)), (429, {'error': 'too many wrong PINs: try again later'}))
        self.assertFalse(os.path.exists(server.PROJECTS))

    def test_a_refused_request_that_goes_on_sending_a_little_at_a_time_is_not_waited_on_for_ever(self):
        with mock.patch.object(server, 'SWALLOW_FOR', 1):
            c = socket.create_connection(self.httpd.server_address, timeout=5); self.addCleanup(c.close)
            c.sendall(b'PUT /api/projects/attention HTTP/1.1\r\nHost: x\r\nContent-Length: 1000000\r\n\r\n')
            self.assertIn(b' 401 ', c.recv(65536).split(b'\r\n')[0])
            began, closed = time.monotonic(), None
            c.settimeout(0.2)
            while closed is None and time.monotonic() - began < 5:      # a byte every fifth of a second: never silent for long
                try:
                    c.sendall(b'x')
                    if c.recv(65536) == b'':
                        closed = time.monotonic() - began
                except socket.timeout:
                    pass
                except OSError:
                    closed = time.monotonic() - began
            self.assertIsNotNone(closed, 'the server was still reading after 5 seconds')
            self.assertLess(closed, 3)

    def test_a_refusal_has_no_body_for_head(self):
        status, headers, text = self.ask('HEAD', '/')
        self.assertEqual((status, text, headers['Content-Length']), (401, '', '0'))

    def test_wrong_pins_are_written_in_the_log_whatever_was_asked_for(self):
        self.ask('GET', '/'); self.ask('GET', '/smart-factory.js')
        self.assertEqual(self.log, [])                             # asking without a PIN is what every browser does first: not logged
        for n in range(server.TRIES):
            self.ask('GET', '/smart-factory.js', headers=guess(n))
        self.ask('GET', '/', headers=basic(self.PIN))
        self.assertEqual(len(self.log), server.TRIES + 1)
        self.assertEqual(self.log[0], 'wrong PIN (1 of 5): "GET /smart-factory.js HTTP/1.1"')
        self.assertIn('wrong PIN (5 of 5): turned away for 600 seconds', self.log[-2])
        self.assertIn('refused while turned away', self.log[-1])
        for line in self.log:                                      # what was given is not written down, right or wrong
            self.assertNotIn(self.PIN, line); self.assertNotIn('0003', line)

    def test_with_no_pin_set_there_is_no_password(self):
        server.PIN = None
        self.assertEqual(self.ask('GET', '/')[0], 200)
        self.assertEqual(self.ask('PUT', '/api/projects/attention', [HEAD])[0], 200)
        self.assertEqual(self.ask('GET', '/', headers=basic('anything'))[0], 200)

    def write_pin(self, content):
        path = os.path.join(self.dir, '.pin')
        if os.path.isdir(path):
            os.rmdir(path)
        with open(path, 'wb') as f:
            f.write(content if isinstance(content, bytes) else content.encode('utf8'))
        return path

    def test_the_pin_is_read_from_the_environment_or_else_from_the_file(self):
        with mock.patch.dict(os.environ):
            os.environ.pop('SMART_FACTORY_PIN', None)
            self.assertIsNone(server.read_pin())                   # neither
            for text, pin in [('1357\n', '1357'), ('1357', '1357'), ('  2468  \n\nsecond line\n', '2468'), ('1357\r\n', '1357'), ('ünïcödé √2\n', 'ünïcödé √2')]:
                self.write_pin(text)
                self.assertEqual(server.read_pin(), pin, repr(text))
            os.environ['SMART_FACTORY_PIN'] = ' 9753 '
            self.assertEqual(server.read_pin(), '9753')            # the environment comes first
            os.environ['SMART_FACTORY_PIN'] = '  '
            self.assertEqual(server.read_pin(), 'ünïcödé √2')      # unless it is empty

    def test_a_mark_an_editor_puts_at_the_start_of_the_file_is_no_part_of_the_pin(self):
        with mock.patch.dict(os.environ):
            os.environ.pop('SMART_FACTORY_PIN', None)
            self.write_pin(b'\xef\xbb\xbf1357\r\n')
            self.assertEqual(server.read_pin(), '1357')

    def test_a_pin_file_that_gives_no_pin_stops_the_server_and_does_not_leave_it_open(self):
        with mock.patch.dict(os.environ):
            os.environ.pop('SMART_FACTORY_PIN', None)
            for content in [b'', b'\n', b'   \n1357\n', b'\xef\xbb\xbf\n', '1357\n'.encode('utf-16'), 'pässword\n'.encode('latin-1'), b'\xff\xfe\x00']:
                self.write_pin(content)
                with self.assertRaises(SystemExit, msg=repr(content)) as stopped:
                    server.read_pin()
                self.assertIn('.pin', str(stopped.exception)); self.assertIn('Not starting', str(stopped.exception))
            os.remove(os.path.join(self.dir, '.pin')); os.mkdir(os.path.join(self.dir, '.pin'))      # not a file at all
            self.assertRaises(SystemExit, server.read_pin)
            os.environ['SMART_FACTORY_PIN'] = '9753'               # with one in the environment the file is not looked at
            self.assertEqual(server.read_pin(), '9753')

    @unittest.skipIf(not hasattr(os, 'geteuid') or os.geteuid() == 0, 'root can read any file')
    def test_a_pin_file_the_server_may_not_read_stops_it(self):
        with mock.patch.dict(os.environ):
            os.environ.pop('SMART_FACTORY_PIN', None)
            os.chmod(self.write_pin('1357\n'), 0)                  # as when it was made by another user
            with self.assertRaises(SystemExit) as stopped:
                server.read_pin()
            self.assertIn('cannot be read', str(stopped.exception))

    def test_the_pin_file_is_not_kept_in_the_repository(self):
        repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(repo, '.gitignore')) as f:
            self.assertIn('.pin', f.read().split())


if __name__ == '__main__':
    unittest.main()
