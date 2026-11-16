"""server.py: saving and opening projects, and what it will not serve. Run with: python3 -B -m unittest discover tests"""
import json, os, shutil, subprocess, sys, unittest, unittest.mock
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from serving import ServerCase, server

HEAD = {'path': 'project.json', 'text': '{"format": "smart-factory/project", "version": 2}\n'}
FILES = [HEAD, {'path': 'Keys.json', 'text': '{"name": "Keys"}\n'}, {'path': 'Keys/Key Weights.json', 'text': '{"name": "√2 · ∞"}\n'},
         {'path': '.config', 'text': '{"format": "smart-factory/frame"}\n'}, {'path': 'Keys/.config', 'text': '{}\n'}]
by_path = lambda files: sorted(files, key=lambda f: f['path'])


class ServerTest(ServerCase):
    SERVED = {'smart-factory.js': '/* the page */', 'components/block.js': '/* a block */', '.git/config': 'secret', '.git/HEAD': 'secret',
              '.serve-token': 'secret', '.pin': 'secret', 'components/.hidden.js': 'secret', 'outside.txt': 'not secret'}

    def ask(self, method, path, body=None):
        """-> (status, headers, the body read as JSON where it is JSON, else as text)"""
        status, headers, text = self.request(method, path, body)
        try:
            return status, headers, json.loads(text)
        except ValueError:
            return status, headers, text

    def save(self, name, files):
        return self.ask('PUT', '/api/projects/' + quote(name), files)

    def on_disk(self, name):
        base = os.path.join(server.PROJECTS, name)
        return sorted(os.path.relpath(os.path.join(d, f), base).replace(os.sep, '/') for d, _, fs in os.walk(base) for f in fs)

    def assert_nothing_left_over(self):
        self.assertEqual([n for n in os.listdir(server.PROJECTS) if n.startswith('.')] if os.path.isdir(server.PROJECTS) else [], [])

    # saving and opening

    def test_a_saved_project_opens_as_it_was_saved(self):
        status, _, body = self.save('attention', FILES)
        self.assertEqual((status, body), (200, {'saved': 'attention', 'files': 5}))
        status, _, body = self.ask('GET', '/api/projects/attention')
        self.assertEqual(status, 200)
        self.assertEqual(by_path(body), by_path(FILES))
        self.assertEqual(self.on_disk('attention'), sorted(f['path'] for f in FILES))
        self.assert_nothing_left_over()

    def test_saving_again_leaves_exactly_the_new_files(self):
        self.save('attention', FILES)
        again = [HEAD, {'path': 'Other.json', 'text': '{}\n'}]
        self.assertEqual(self.save('attention', again)[0], 200)
        self.assertEqual(self.on_disk('attention'), ['Other.json', 'project.json'])
        self.assertEqual(by_path(self.ask('GET', '/api/projects/attention')[2]), by_path(again))
        self.assert_nothing_left_over()

    def test_the_list_is_the_directories_that_hold_a_project(self):
        self.assertEqual(self.ask('GET', '/api/projects')[2], [])      # no projects directory yet
        self.save('zeta', [HEAD]); self.save('alpha', [HEAD])
        os.makedirs(os.path.join(server.PROJECTS, 'not a project'))
        open(os.path.join(server.PROJECTS, 'stray.json'), 'w').close()
        self.assertEqual(self.ask('GET', '/api/projects'), (200, unittest.mock.ANY, ['alpha', 'zeta']))

    def test_a_name_may_have_spaces_dots_dashes_and_underscores(self):
        for name in ['My project', 'v1.2_final-draft', '0', 'a' * 64]:
            self.assertEqual(self.save(name, [HEAD])[0], 200, name)
            self.assertEqual(self.ask('GET', '/api/projects/' + quote(name))[0], 200, name)

    def test_only_json_and_config_files_are_given_back(self):
        self.save('attention', [HEAD])
        open(os.path.join(server.PROJECTS, 'attention', 'notes.txt'), 'w').close()
        self.assertEqual(self.ask('GET', '/api/projects/attention')[2], [HEAD])

    def test_a_project_that_is_not_there_is_404(self):
        status, _, body = self.ask('GET', '/api/projects/nothing')
        self.assertEqual((status, body), (404, {'error': 'no project called nothing'}))

    # what is refused

    def test_a_name_that_is_not_one_plain_directory_name_is_refused(self):
        for name in ['..', '.', '.hidden', '-dash', ' space', 'a/b', '../up', 'a\\b', 'a' * 65, 'né', 'a:b', '']:
            for method, body in (('PUT', [HEAD]), ('GET', None)):
                if name == '' and method == 'GET':
                    continue                                       # /api/projects/ with nothing after it
                status, _, reply = self.ask(method, '/api/projects/' + quote(name, safe=''), body)
                self.assertEqual(status, 400, (method, name)); self.assertIn('error', reply)
        self.assertFalse(os.path.exists(server.PROJECTS) and os.listdir(server.PROJECTS))

    def test_a_name_that_ends_in_a_newline_is_refused(self):
        for name in ['menu\n', 'menu\r\n', 'menu\n\n', '\n', 'me\nnu']:
            for method, body in (('PUT', [HEAD]), ('GET', None)):
                status, _, reply = self.ask(method, '/api/projects/' + quote(name, safe=''), body)
                self.assertEqual(status, 400, (method, name)); self.assertIn('error', reply)
        self.assertFalse(os.path.exists(server.PROJECTS) and os.listdir(server.PROJECTS))

    def test_a_path_that_would_leave_the_project_is_refused_and_nothing_is_written(self):
        self.save('attention', FILES)
        for path in ['../escaped.json', 'a/../../escaped.json', '/etc/escaped.json', 'a//b.json', './a.json', 'a/./b.json', 'a\\..\\b.json',
                     'a\0.json', 'script.py', 'Keys.json/', 'config', 'a/.config.txt', '']:
            status, _, reply = self.save('attention', [HEAD, {'path': path, 'text': 'x'}])
            self.assertEqual(status, 400, repr(path)); self.assertIn('error', reply)
        self.assertEqual(self.on_disk('attention'), sorted(f['path'] for f in FILES))      # the project is as it was
        self.assert_nothing_left_over()
        found = [os.path.join(d, f) for d, _, fs in os.walk(self.dir) for f in fs if 'escaped' in f]
        self.assertEqual(found, [])

    def test_files_without_a_project_json_are_refused(self):
        status, _, reply = self.save('attention', [{'path': 'Keys.json', 'text': '{}'}])
        self.assertEqual((status, reply), (400, {'error': 'no project.json among the files'}))
        self.assertEqual(self.save('attention', [])[0], 400)
        self.assertEqual(self.save('attention', [{'path': 'sub/project.json', 'text': '{}'}])[0], 400)
        self.assertFalse(os.path.exists(os.path.join(server.PROJECTS, 'attention')))
        self.assert_nothing_left_over()

    def test_a_body_that_is_not_a_list_of_files_is_refused(self):
        self.save('attention', FILES)
        for body in [b'{ not json', b'', b'"text"', b'{"path": "project.json"}', b'[1, 2]', b'[{"text": "no path"}]', b'[{"path": "project.json"}]', b'null']:
            self.assertEqual(self.ask('PUT', '/api/projects/attention', body)[0], 400, body)
        self.assertEqual(self.on_disk('attention'), sorted(f['path'] for f in FILES))
        self.assert_nothing_left_over()

    def test_every_save_that_is_no_good_is_answered_with_why(self):
        self.save('attention', FILES)
        no_good = [({'a': 1}, 'a list of files'), ('text', 'a list of files'), (5, 'a list of files'), ([1, HEAD], 'each file is'), ([[HEAD]], 'each file is'),
                   ([HEAD, {'text': 'x'}], 'no path'), ([HEAD, {'path': 'a.json'}], 'no text'),
                   ([HEAD, {'path': 5, 'text': 'x'}], "path is text"), ([HEAD, {'path': ['a.json'], 'text': 'x'}], "path is text"), ([HEAD, {'path': None, 'text': 'x'}], "path is text"),
                   ([HEAD, {'path': 'a.json', 'text': 5}], "text is text"), ([HEAD, {'path': 'a.json', 'text': {'name': 'a'}}], "text is text"), ([HEAD, {'path': 'a.json', 'text': None}], "text is text"),
                   ([HEAD, HEAD], 'two files called'), ([HEAD, {'path': 'a.json', 'text': 'x'}, {'path': 'a.json/b.json', 'text': 'x'}], 'is a file'),
                   ([HEAD, {'path': 'a.json/b/c.json', 'text': 'x'}, {'path': 'a.json', 'text': 'x'}], 'is a file'), ([HEAD, {'path': 'project.json/b.json', 'text': 'x'}], 'is a file')]
        for body, why in no_good:
            status, _, reply = self.save('attention', body)       # an answer at all: these once dropped the connection
            self.assertEqual(status, 400, body); self.assertIn(why, reply['error'], body)
        status, _, reply = self.ask('PUT', '/api/projects/attention', b'[' * 100000)      # deeper than Python will read
        self.assertEqual(status, 400); self.assertIn('error', reply)
        self.assertEqual(self.on_disk('attention'), sorted(f['path'] for f in FILES))
        self.assert_nothing_left_over()

    def test_a_save_that_cannot_be_written_is_answered_and_leaves_things_as_they_were(self):
        self.save('attention', FILES)
        rename = os.rename
        for fails in ('.old-', '.saving-', 'none of them'):         # moving the old one aside, moving the new one in, the first write
            def failing(src, dst):
                if fails in src or fails in dst:
                    raise OSError(28, 'No space left on device')
                return rename(src, dst)
            patches = [unittest.mock.patch.object(server.os, 'rename', failing)]
            if fails == 'none of them':
                patches.append(unittest.mock.patch.object(server.os, 'makedirs', side_effect=OSError(28, 'No space left on device')))
            for patch in patches: patch.start()
            try:
                for name in ('attention', 'new')[:1 if fails == '.old-' else 2]:      # a new project has no old one to move aside
                    status, _, reply = self.save(name, [HEAD, {'path': 'sub/Other.json', 'text': '{}\n'}])
                    self.assertEqual((status, reply), (500, {'error': 'could not write the project: No space left on device'}), (fails, name))
            finally:
                for patch in patches: patch.stop()
            self.assertEqual(self.on_disk('attention'), sorted(f['path'] for f in FILES), fails)
            self.assertFalse(os.path.exists(os.path.join(server.PROJECTS, 'new')), fails)
            self.assert_nothing_left_over()
        self.assertEqual(self.save('attention', [HEAD])[0], 200)       # and once it can be written, it is

    def test_a_save_larger_than_the_limit_is_refused(self):
        self.assertEqual(server.MAX_SAVE, 64 << 20)
        big = [HEAD, {'path': 'Big.json', 'text': 'x' * 1000}]
        with unittest.mock.patch.object(server, 'MAX_SAVE', len(json.dumps(big)) - 1):
            status, _, reply = self.save('attention', big)
            self.assertEqual(status, 413); self.assertIn('at most', reply['error'])
            self.assertFalse(os.path.exists(server.PROJECTS))
            self.assertEqual(self.save('attention', [HEAD])[0], 200)       # under the limit
        with unittest.mock.patch.object(server, 'MAX_SAVE', len(json.dumps(big))):
            self.assertEqual(self.save('attention', big)[0], 200)          # exactly the limit
        for length in ['%d' % ((64 << 20) + 1), '9' * 30, '9' * 5000]:     # only said to be large: answered before any of it is read
            status, _, text = self.request('PUT', '/api/projects/attention', b'[]', {'Content-Length': length})
            self.assertEqual(status, 413, length); self.assertIn('error', json.loads(text))

    def test_a_save_whose_length_is_not_a_whole_number_is_refused(self):
        self.save('attention', FILES)
        body = json.dumps([HEAD]).encode()
        for length in ['-1', '-%d' % len(body), 'ten', '1.5', '0x10', '+5', '', '²', '5 5']:
            status, _, text = self.request('PUT', '/api/projects/attention', body, {'Content-Length': length})
            self.assertEqual(status, 400, length); self.assertIn('Content-Length', json.loads(text)['error'], length)
        self.assertEqual(self.on_disk('attention'), sorted(f['path'] for f in FILES))
        self.assert_nothing_left_over()

    def test_outside_a_git_checkout_no_project_comes_with_the_program(self):
        self.assertEqual(server.shipped(), set())
        for name in ['default-menu', 'example']:
            self.assertEqual(self.save(name, [HEAD])[0], 200, name)
        with unittest.mock.patch.object(server, 'git', side_effect=FileNotFoundError('git')):      # no git on the machine at all
            self.assertEqual(server.shipped(), set())
            self.assertEqual(self.save('example', [HEAD])[0], 200)

    def test_nothing_else_is_under_api(self):
        self.assertEqual(self.ask('GET', '/api/other')[0], 404)
        self.assertEqual(self.ask('GET', '/api/')[0], 404)
        self.assertEqual(self.ask('PUT', '/api/other', [HEAD])[0], 404)
        self.assertEqual(self.ask('PUT', '/smart-factory.js', [HEAD])[0], 404)

    # the page and its files

    def test_the_page_is_smart_factory_html_wrapped_into_a_whole_page(self):
        for path in ['/', '/index.html', '/?x=1']:
            status, headers, text = self.ask('GET', path)
            self.assertEqual(status, 200); self.assertIn('text/html', headers['Content-Type'])
            self.assertTrue(text.startswith('<!doctype html>')); self.assertIn('src="smart-factory.js"', text); self.assertTrue(text.endswith('</body></html>'))

    def test_the_files_beside_the_server_are_served_and_never_cached(self):
        self.save('attention', FILES)
        for path in ['/smart-factory.js', '/components/block.js', '/smart-factory.js?v=2', '/projects/attention/Keys.json']:
            status, headers, _ = self.ask('GET', path)
            self.assertEqual(status, 200, path); self.assertEqual(headers['Cache-Control'], 'no-cache', path)
        self.assertEqual(self.ask('GET', '/smart-factory.js')[2], '/* the page */')
        self.assertEqual(self.ask('GET', '/api/projects')[1]['Cache-Control'], 'no-cache')
        self.assertEqual(self.ask('GET', '/no-such-file.js')[0], 404)

    def test_the_page_is_the_page_whatever_follows_its_address(self):
        for path in ['/#', '/?', '/#top', '/?x=1#top', '/index.html#top']:
            status, _, text = self.ask('GET', path)
            self.assertEqual(status, 200, path); self.assertIn('src="smart-factory.js"', text, path); self.assertNotIn('Directory listing', text, path)

    def test_head_gives_the_page_s_headers_without_the_page(self):
        got, _, page = self.ask('GET', '/')
        for path in ['/', '/index.html', '/#']:
            status, headers, text = self.ask('HEAD', path)
            self.assertEqual(status, 200, path); self.assertIn('text/html', headers['Content-Type']); self.assertEqual(text, '')
            self.assertEqual(int(headers['Content-Length']), len(page.encode()))
        self.assertEqual(self.ask('HEAD', '/smart-factory.js')[0], 200)
        self.assertEqual(self.ask('HEAD', '/api/projects')[0], 404)

    def test_a_directory_is_not_listed(self):
        self.save('attention', FILES)
        for path in ['/components/', '/components/#', '/components/?x', '/projects/', '/projects/attention/', '/components/../', '/%63omponents/', '/./']:
            for method in ('GET', 'HEAD'):
                status, _, text = self.ask(method, path)
                self.assertEqual(status, 404, (method, path))
                for name in ['Directory listing', '.hidden', '.git', '.pin', '.serve-token', 'block.js', '.config']:
                    self.assertNotIn(name, str(text), (method, path))
        self.assertEqual(self.ask('GET', '/components/block.js')[0], 200)      # what is in it is still served by name
        for path in ['//', '///', '/.', '/..', '/%2e/']:                       # the top directory by other names: the page or nothing, never a list
            self.assertNotIn('Directory listing', str(self.ask('GET', path)[2]), path)

    DOT_FILES = ['/.git/config', '/.git/HEAD', '/.git/', '/.serve-token', '/.pin', '/components/.hidden.js', '/components/../.git/config', '/projects/attention/.config']

    def test_dot_files_are_not_served(self):
        self.save('attention', FILES)
        for path in self.DOT_FILES:
            self.assertEqual(self.ask('GET', path)[0], 404, path)

    def test_dot_files_are_not_served_however_the_address_is_written(self):
        self.save('attention', FILES)
        for path in self.DOT_FILES:
            for written in [path.replace('/.', '/%2e'), path.replace('/.', '/%2E'), path.replace('/.', '%2f.'), path.replace('/.', '/%252e')]:
                status, _, text = self.ask('GET', written)
                self.assertEqual(status, 404, written); self.assertNotIn('secret', text)

    def test_dot_files_are_not_served_to_head_either(self):
        self.save('attention', FILES)
        for path in self.DOT_FILES:
            for written in [path, path.replace('/.', '/%2e')]:
                self.assertEqual(self.ask('HEAD', written)[0], 404, written)

    def test_a_file_outside_the_directory_is_not_served(self):
        shutil.copy(os.path.join(self.dir, 'outside.txt'), self.dir + '.txt')      # a real file, just outside what is served
        self.addCleanup(lambda: os.remove(self.dir + '.txt'))
        name = os.path.basename(self.dir) + '.txt'
        for path in ['/../' + name, '/..%2f' + name, '/%2e%2e/' + name, '/components/../../' + name, '/../../etc/passwd']:
            status, _, text = self.ask('GET', path)
            self.assertEqual(status, 404, path); self.assertNotIn('not secret', text)


@unittest.skipUnless(shutil.which('git'), 'needs git')
class ShippedTest(ServerCase):
    """The server in a git checkout of its own: default-menu is tracked, as it is in the repository; mine is not."""
    ask, save, on_disk, assert_nothing_left_over = ServerTest.ask, ServerTest.save, ServerTest.on_disk, ServerTest.assert_nothing_left_over
    SERVED = {'projects/default-menu/project.json': HEAD['text'], 'projects/default-menu/colors/red.json': '{}\n', 'projects/README.md': 'Projects',
              'projects/mine/project.json': HEAD['text']}

    def setUp(self):
        super().setUp()
        self.git('init', '--quiet')
        self.git('add', 'projects/default-menu', 'projects/README.md')

    def git(self, *args):
        return subprocess.run(['git', '-C', self.dir, *args], check=True, capture_output=True, text=True).stdout

    def test_the_projects_that_come_with_the_program_are_the_ones_git_tracks(self):
        self.assertEqual(server.shipped(), {'default-menu'})          # not mine, and not README.md, which is no directory
        self.git('add', 'projects/mine')
        self.assertEqual(server.shipped(), {'default-menu', 'mine'})  # asked each time: right after a pull brings a new one

    def test_a_project_that_comes_with_the_program_is_not_saved_over(self):
        for name in ['default-menu', 'Default-Menu', 'DEFAULT-MENU']:      # on a disk that ignores capitals these are one directory
            status, _, reply = self.save(name, [HEAD, {'path': 'Other.json', 'text': '{}\n'}])
            self.assertEqual((status, reply), (403, {'error': name + ' comes with the program: save under another name'}))
        self.assertEqual(self.on_disk('default-menu'), ['colors/red.json', 'project.json'])
        self.assertEqual(self.git('diff', '--name-only'), '')      # nothing tracked has changed: the branch can still be followed
        self.assert_nothing_left_over()

    def test_it_is_still_opened_and_other_names_are_still_saved(self):
        self.assertEqual(self.ask('GET', '/api/projects')[2], ['default-menu', 'mine'])
        self.assertEqual(self.ask('GET', '/api/projects/default-menu')[0], 200)
        for name in ['mine', 'menu', 'default-menu 2']:
            self.assertEqual(self.save(name, [HEAD, {'path': 'Other.json', 'text': '{}\n'}])[0], 200, name)
            self.assertEqual(self.on_disk(name), ['Other.json', 'project.json'])
        self.assertEqual(self.git('diff', '--name-only'), '')


if __name__ == '__main__':
    unittest.main()
