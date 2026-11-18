"""data.py: where a project's data files are, and what a numeric CSV is. Needs only the standard library."""
import os
import shutil
import tempfile
import time
import unittest

from .support import ROOT  # noqa: F401
from backend import data
from backend.limits import MAX_ENTRIES, MAX_UPLOAD


class Files(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix='smart-factory-data-')
        self.addCleanup(shutil.rmtree, self.root, True)
        os.makedirs(os.path.join(self.root, 'mine', 'data'))
        os.makedirs(os.path.join(self.root, 'other', 'data'))
        with open(os.path.join(self.root, 'other', 'data', 'secret.csv'), 'w') as f:
            f.write('9,9\n')
        self.outside = tempfile.mkdtemp(prefix='smart-factory-outside-')
        self.addCleanup(shutil.rmtree, self.outside, True)
        with open(os.path.join(self.outside, 'passwd.csv'), 'w') as f:
            f.write('1,2\n')

    def test_a_file_is_kept_and_read_back(self):
        self.assertEqual(data.keep('mine', 'data/w.csv', b'a,b\n1,2\n3,4\n5,6\n', self.root), (2, 3))
        self.assertEqual(data.read_text('mine', 'data/w.csv', self.root), 'a,b\n1,2\n3,4\n5,6\n')
        self.assertEqual(data.keep('new project', 'data/w.csv', b'1\n', self.root), (1, 1))      # a project not saved yet has its data/ made
        self.assertEqual(sorted(os.listdir(os.path.join(self.root, 'mine', 'data'))), ['w.csv'])      # and nothing is left beside it

    def test_no_path_leaves_the_projects_own_data(self):
        for project, path in [('mine', '../other/data/secret.csv'), ('mine', 'data/../../other/data/secret.csv'), ('mine', '/etc/passwd'), ('mine', 'data/../project.json'), ('mine', 'data/a/b.csv'),
                              ('mine', 'data/w.csv\0'), ('mine', 'data/\0.csv'), ('mine', 'data/w.txt'), ('mine', 'project.json'), ('mine', ''), ('mine', None), ('mine', 7), ('mine', ['data/w.csv']),
                              ('..', 'data/w.csv'), ('.', 'data/w.csv'), ('mine/../other', 'data/secret.csv'), ('/etc', 'data/w.csv'), ('', 'data/w.csv'), ('mine\0', 'data/w.csv'), (None, 'data/w.csv'),
                              ('other/data', 'data/w.csv'), ('a' * 65, 'data/w.csv'), ('.git', 'data/w.csv')]:
            for act in (lambda: data.where(project, path, self.root), lambda: data.read_text(project, path, self.root), lambda: data.keep(project, path, b'1,2\n', self.root)):
                with self.assertRaises(data.Refused, msg='%r %r' % (project, path)):
                    act()
        self.assertEqual(data.read_text('other', 'data/secret.csv', self.root), '9,9\n')      # each project reads its own, by its own name
        with self.assertRaises(data.Refused) as e:
            data.read_text('mine', 'data/secret.csv', self.root)
        self.assertIn('is not in the project mine', str(e.exception))

    def test_a_link_is_never_followed(self):
        os.symlink(os.path.join(self.outside, 'passwd.csv'), os.path.join(self.root, 'mine', 'data', 'link.csv'))      # a file that is a link
        os.symlink(self.outside, os.path.join(self.root, 'linked'))                                                # a project that is a link
        os.makedirs(os.path.join(self.root, 'half'))
        os.symlink(self.outside, os.path.join(self.root, 'half', 'data'))                                          # a data/ that is a link
        for project, path in [('mine', 'data/link.csv'), ('linked', 'data/passwd.csv'), ('half', 'data/passwd.csv')]:
            with self.assertRaises(data.Refused):
                data.read_text(project, path, self.root)
            with self.assertRaises(data.Refused):
                data.keep(project, path, b'1,2\n', self.root)
        with open(os.path.join(self.outside, 'passwd.csv')) as f:
            self.assertEqual(f.read(), '1,2\n')      # nothing outside was written
        self.assertEqual(os.listdir(self.outside), ['passwd.csv'])


class Tables(unittest.TestCase):
    def test_numbers_with_or_without_a_header(self):
        self.assertEqual(data.inspect('1,2,3\n4,5,6\n'), (0, 3, 2))
        self.assertEqual(data.inspect('x,y,z\n1,2,3\n4,5,6'), (1, 3, 2))
        self.assertEqual(data.inspect('1\n'), (0, 1, 1))
        self.assertEqual(data.inspect(' 1 , -2.5 ,.5\r\n"3",4e-2,+6E3\r\n\r\n'), (0, 3, 2))
        self.assertEqual(data.inspect('﻿a\n1\n'.lstrip('﻿')), (1, 1, 1))
        self.assertEqual(data.decode(b'\xef\xbb\xbf1,2\n'), '1,2\n')      # an editor's mark at the start is no part of it

    def test_what_is_not_a_table_of_numbers_is_refused_with_why(self):
        for text, why in [('', 'empty'), ('\n\n', 'empty'), ('a,b\n', 'a header and no numbers'), ('1,2\n3\n', 'line 2 has 1 numbers and the first row has 2'), ('1,2\n3,x\n', 'line 2 is not numbers'),
                          ('1,,3\n', 'no numbers'), ('a,b\n1,,3\n', 'its header names 2 columns'), ('a,b,c\n1,,3\n', 'line 2 is not numbers'), ('1,2\nnan,3\n', 'line 2'), ('1,2\ninf,3\n', 'line 2'), ('1,2\n\n3,4\n', 'line 2 is not numbers with commas between them: it is empty'),
                          ('1,2\n0x10,3\n', 'line 2'), ('1,2\n1_000,3\n', 'line 2'), ('a,b,c\n1,2\n', 'its header names 3 columns and its first row has 2'), ('1;2\n3;4\n5;6\n', 'line 2'), ('=1+1,2\n1,2\n', None)]:
            if why is None:
                self.assertEqual(data.inspect(text), (1, 2, 1))      # a first line that is not numbers is a header, whatever it says: it is never worked out
                continue
            with self.assertRaises(data.Refused, msg=text) as e:
                data.inspect(text)
            self.assertIn(why, str(e.exception))
        for body in [b'\xff\xfe1,2', b'1,2\0\n', b'\x80abc']:
            with self.assertRaises(data.Refused):
                data.decode(body)

    def test_the_limits(self):
        with self.assertRaises(data.Refused) as e:
            data.decode(b'1' * (MAX_UPLOAD + 1))
        self.assertIn('larger than 50 MB', str(e.exception))
        wide = ','.join(['1'] * 4001) + '\n'
        with self.assertRaises(data.Refused) as e:
            data.inspect(wide * 4000)      # 16,004,000 numbers
        self.assertIn('more than the 16,000,000 entries', str(e.exception))
        self.assertGreater(4001 * 4000, MAX_ENTRIES)
        began = time.monotonic()
        with self.assertRaises(data.Refused):
            data.inspect('1,2\n' + '9' * 3000000 + 'x,1\n')      # a long run of digits and then a letter: read once, not again and again
        with self.assertRaises(data.Refused):
            data.inspect('1,2\n' + ' ' * 3000000 + 'x,1\n')
        self.assertLess(time.monotonic() - began, 3)
