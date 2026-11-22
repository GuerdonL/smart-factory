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
        for name in ('mine', 'other'):      # both are saved projects
            with open(os.path.join(self.root, name, 'project.json'), 'w') as f:
                f.write('{}')
        with open(os.path.join(self.root, 'other', 'data', 'secret.csv'), 'w') as f:
            f.write('9,9\n')
        self.outside = tempfile.mkdtemp(prefix='smart-factory-outside-')
        self.addCleanup(shutil.rmtree, self.outside, True)
        with open(os.path.join(self.outside, 'passwd.csv'), 'w') as f:
            f.write('1,2\n')

    def test_a_file_is_kept_and_read_back(self):
        self.assertEqual(data.keep('mine', 'data/w.csv', b'a,b\n1,2\n3,4\n5,6\n', self.root), (2, 3))
        self.assertEqual(data.read_text('mine', 'data/w.csv', self.root), 'a,b\n1,2\n3,4\n5,6\n')
        self.assertEqual(sorted(os.listdir(os.path.join(self.root, 'mine', 'data'))), ['w.csv'])      # and nothing is left beside it

    def test_a_kept_file_says_how_many_of_its_numbers_are_too_small_for_32_bits(self):
        self.assertEqual(data.take('mine', 'data/tiny.csv', b'1e-60,2\n3,1E-99\n', self.root), (2, 2, 2))
        self.assertEqual(data.take('mine', 'data/tiny.csv', b'1e-60,2\n3,1E-99\n', self.root), (2, 2, 2))      # and the same file again says the same
        self.assertEqual(data.take('mine', 'data/w.csv', b'1,2\n', self.root), (2, 1, 0))

    def test_a_text_and_a_npy_are_data_files_too_and_a_text_is_looked_at_here(self):
        for path in ('data/w.txt', 'data/w.npy', 'data/w.csv'):
            self.assertTrue(data.where('mine', path, self.root).endswith(path[5:]))
        self.assertEqual(data.taken('mine', 'data/w.txt', 'h\u00e9llo\n'.encode('utf8'), self.root), {'cols': 1, 'rows': 1, 'length': 6})
        self.assertEqual(data.read_bytes('mine', 'data/w.txt', self.root), 'h\u00e9llo\n'.encode('utf8'))
        self.assertEqual(data.text_of(b'\xef\xbb\xbfhi'), 'hi')      # a byte order mark is no character
        for body, why in ((b'\xff\xfe', 'is not UTF-8 text: its byte 1 is no part of a UTF-8 character'), (b'', 'is empty: a text has at least one character'), (b'\xef\xbb\xbf', 'is empty')):
            with self.assertRaises(data.Refused) as e:
                data.taken('mine', 'data/bad.txt', body, self.root)
            self.assertIn(why, str(e.exception))
        with self.assertRaises(data.Refused) as e:      # what a .npy is, is arrays.py's to say: with nothing handed in to look at it, it is not taken
            data.taken('mine', 'data/w.npy', b'x', self.root)
        self.assertEqual(str(e.exception), 'data/w.npy is not a kind of data file that is read here')
        self.assertEqual(data.taken('mine', 'data/w.npy', b'x', self.root, lambda body, path: {'cols': 1, 'rows': 1, 'length': 1}), {'cols': 1, 'rows': 1, 'length': 1})
        self.assertEqual(sorted(os.listdir(os.path.join(self.root, 'mine', 'data'))), ['w.npy', 'w.txt'])
        with self.assertRaises(data.Refused) as e:
            data.where('mine', 'data/w.json', self.root)
        self.assertEqual(str(e.exception), 'a data file is at data/ and one name ending .csv, .txt or .npy, of letters, digits, spaces, _ . and -')

    def test_only_into_a_project_that_has_been_saved(self):
        os.makedirs(os.path.join(self.root, 'half made'))      # a directory, and no project.json in it
        for project in ['new project', 'half made', 'menu']:
            with self.assertRaises(data.Refused) as e:
                data.keep(project, 'data/w.csv', b'1\n', self.root)
            self.assertIn('there is no saved project called ' + project, str(e.exception))
        self.assertEqual(sorted(os.listdir(self.root)), ['half made', 'mine', 'other'])      # nothing was made
        self.assertEqual(os.listdir(os.path.join(self.root, 'half made')), [])

    def test_a_file_that_is_there_is_never_replaced(self):
        data.keep('mine', 'data/w.csv', b'1,2\n', self.root)
        self.assertEqual(data.keep('mine', 'data/w.csv', b'1,2\n', self.root), (2, 1))      # the same bytes again: the file that is there
        for body in [b'1,3\n', b'1,2\n\n', b'9\n']:
            with self.assertRaises(data.Refused) as e:
                data.keep('mine', 'data/w.csv', body, self.root)
            self.assertIn('a data file is not replaced', str(e.exception))
        self.assertEqual(data.read_text('mine', 'data/w.csv', self.root), '1,2\n')

    def test_a_project_keeps_only_so_many_files_and_so_many_bytes(self):
        from backend import limits
        for k in range(limits.MAX_DATA_FILES):
            data.keep('mine', 'data/f%d.csv' % k, b'%d\n' % k, self.root)
        with self.assertRaises(data.Refused) as e:
            data.keep('mine', 'data/one-more.csv', b'1\n', self.root)
        self.assertIn('already has 64 data files', str(e.exception))
        self.assertEqual(len(os.listdir(os.path.join(self.root, 'mine', 'data'))), limits.MAX_DATA_FILES)
        real = data.MAX_DATA_BYTES
        try:
            data.MAX_DATA_BYTES = 10      # (the boundary, with a small number in place of 200 MB)
            self.assertEqual(data.keep('other', 'data/a.csv', b'1,2\n', self.root), (2, 1))      # 5 bytes beside the 4 that are there: 9
            with self.assertRaises(data.Refused) as e:
                data.keep('other', 'data/b.csv', b'1,2\n', self.root)      # and 5 more would be 14
            self.assertIn('would come to more than', str(e.exception))
        finally:
            data.MAX_DATA_BYTES = real
        self.assertEqual(sorted(os.listdir(os.path.join(self.root, 'other', 'data'))), ['a.csv', 'secret.csv'])

    def test_no_path_leaves_the_projects_own_data(self):
        for project, path in [('mine', '../other/data/secret.csv'), ('mine', 'data/../../other/data/secret.csv'), ('mine', '/etc/passwd'), ('mine', 'data/../project.json'), ('mine', 'data/a/b.csv'),
                              ('mine', 'data/w.csv\0'), ('mine', 'data/\0.csv'), ('mine', 'data/w.json'), ('mine', 'data/w.csv.txt.exe'), ('mine', 'project.json'), ('mine', ''), ('mine', None), ('mine', 7), ('mine', ['data/w.csv']),
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
        with open(os.path.join(self.root, 'half', 'project.json'), 'w') as f:
            f.write('{}')
        with open(os.path.join(self.outside, 'project.json'), 'w') as f:
            f.write('{}')
        os.symlink(self.outside, os.path.join(self.root, 'half', 'data'))                                          # a data/ that is a link
        for project, path in [('mine', 'data/link.csv'), ('linked', 'data/passwd.csv'), ('half', 'data/passwd.csv')]:
            with self.assertRaises(data.Refused):
                data.read_text(project, path, self.root)
            with self.assertRaises(data.Refused):
                data.keep(project, path, b'1,2\n', self.root)
        with open(os.path.join(self.outside, 'passwd.csv')) as f:
            self.assertEqual(f.read(), '1,2\n')      # nothing outside was written
        self.assertEqual(sorted(os.listdir(self.outside)), ['passwd.csv', 'project.json'])


class Tables(unittest.TestCase):
    def test_numbers_with_or_without_a_header(self):
        self.assertEqual(data.inspect('1,2,3\n4,5,6\n'), (0, 3, 2))
        self.assertEqual(data.inspect('x,y,z\n1,2,3\n4,5,6'), (1, 3, 2))
        self.assertEqual(data.inspect('1\n'), (0, 1, 1))
        self.assertEqual(data.inspect(' 1 , -2.5 ,.5\r\n"3",4e-2,+6E3\r\n\r\n'), (0, 3, 2))
        self.assertEqual(data.inspect('﻿a\n1\n'.lstrip('﻿')), (1, 1, 1))
        self.assertEqual(data.decode(b'\xef\xbb\xbf1,2\n'), '1,2\n')      # an editor's mark at the start is no part of it
        self.assertEqual(data.inspect('3.4e38,-3.4e38\n1e-60,' + '9' * 38 + '\n'), (0, 2, 2))      # the largest a 32-bit float holds is read; one too small for it is read, as 0
        # what is written as other than nought and is nought in 32 bits is counted; a nought however written, and the smallest number 32 bits hold, are not
        self.assertEqual(data.survey('3.4e38,-3.4e38\n1e-60,' + '9' * 38 + '\n'), (0, 2, 2, 1))
        self.assertEqual(data.survey('a,b,c\n1e-46, "-7e-46" ,1e-400\n0e-99,0.0,1.5e-45\n0.' + '0' * 50 + '1,-0,7.1e-46\n'), (1, 3, 3, 4))
        self.assertEqual(data.survey('1,2\n3,4\n')[3], 0)

    def test_what_is_not_a_table_of_numbers_is_refused_with_why(self):
        for text, why in [('', 'empty'), ('\n\n', 'empty'), ('a,b\n', 'a header and no numbers'), ('1,2\n3\n', 'line 2 has 1 numbers and the first row has 2'), ('1,2\n3,x\n', 'line 2 is not numbers'),
                          ('1,,3\n', 'line 1 holds numbers, and its cell 2 is not one: it is empty'), ('1,,3\n4,5,6\n', 'line 1 holds numbers'), ('a,2\n3,4\n', 'its cell 1 is not one: "a"'), ('1,2,x\n', 'its cell 3 is not one'), ('a,b\n1,,3\n', 'its header names 2 columns'), ('a,b,c\n1,,3\n', 'line 2 is not numbers'), ('1,2\nnan,3\n', 'line 2'), ('1,2\ninf,3\n', 'line 2'), ('1,2\n\n3,4\n', 'line 2 is not numbers with commas between them: it is empty'),
                          ('1,2\n0x10,3\n', 'line 2'), ('1,2\n1_000,3\n', 'line 2'), ('a,b,c\n1,2\n', 'its header names 3 columns and its first row has 2'), ('1;2\n3;4\n5;6\n', 'line 2'), ('=1+1,2\n1,2\n', 'line 1 holds numbers'), ('=1+1,=2\n1,2\n', None),
                          ('1,2\n3e39,4\n', 'line 2, number 1 is too large for a 32-bit float: "3e39"'), ('1,2\n3,-3.5e38\n', 'line 2, number 2 is too large'), ('1,2\n3,' + '9' * 40 + '\n', 'line 2, number 2 is too large'),
                          ('1e400\n', 'line 1, number 1 is too large')]:
            if why is None:
                self.assertEqual(data.inspect(text), (1, 2, 1))      # a first line of which no cell is a number is a header, whatever it says: it is never worked out
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
