"""A project's data files: where they are, and what a numeric CSV is. Standard library only.

A file source reads a table of numbers kept with its project, at projects/<project>/data/<name>.csv. A path that
comes in a request is never joined to anything as it stands: the project's name has to be one plain directory name
(as server.py has it), the path has to be "data/" and one .csv file name (check.py: data_path, the same rule as
sources.js), and what the two then name has to lie inside the projects directory with no symbolic link on the way.
So no request can read or write outside a project's own data/ directory.

    PROJECTS                         the projects directory: SMART_FACTORY_PROJECTS, or projects/ beside backend/
    where(project, path, root)       -> the file's full path; raises Refused(why)
    read_text(project, path, root)   -> the file's text; raises Refused
    keep(project, path, body, root)  -> writes an uploaded file there (bytes) once it is seen to be a numeric CSV, and
                                        gives (cols, rows); raises Refused. take(…) is the same, and gives
                                        (cols, rows, small) (see survey). Only into a project that has been saved
                                        (its project.json is there); never over a file that is there already and
                                        holds something else (the same bytes again are taken as said); and only
                                        while the project's data/ holds no more than MAX_DATA_FILES files and
                                        MAX_DATA_BYTES bytes in all. Written beside it first, then moved in.
    inspect(text)                    -> (skip, cols, rows): how many lines at its head are a header (0 or 1), and the
                                        table's size; raises Refused where it is not a table of numbers
    survey(text)                     -> (skip, cols, rows, small): the same, and how many of its numbers are written
                                        as other than nought and are too small for a 32-bit float, so are read as 0

A numeric CSV: lines of numbers with commas between them, every line as many as the first; an optional first line
of names (a header: a first line of which no cell is a number; one that mixes numbers with anything else is a row
with a mistake in it, and is refused, naming the cell); blank lines at the end are passed over. A number is digits
with an optional point, sign and exponent (1, -2.5, .5, 3e-4), which may stand in double quotes. An empty cell, a
word, "nan" or "inf" is refused: a missing number is never taken as zero. So is a number too large for a 32-bit
float (past 3.4e38), which would be an infinity. One too small for it (1e-60) is read as 0, and is counted
(survey), so that whoever chose the file can be told: a nought the file does not hold is never passed off in silence."""
from contextlib import contextmanager
import os
import re
import struct
import tempfile

try:
    import fcntl
except ImportError:
    fcntl = None

from .check import data_path
from .limits import MAX_DATA_BYTES, MAX_DATA_FILES, MAX_ENTRIES, MAX_UPLOAD, megabytes

PROJECTS = os.environ.get('SMART_FACTORY_PROJECTS') or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'projects')
NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}')          # a project's name: one plain directory name (server.py)
NUMBER = r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?'      # (written so that a long run of digits is read once, never again and again)
CELL = r'[ \t]*(?:%s|"%s")[ \t]*' % (NUMBER, NUMBER)
LINE = re.compile(r'%s(?:,%s)*' % (CELL, CELL), re.ASCII)
ONE = re.compile(CELL, re.ASCII)
LARGE = re.compile(r'[eE]|\d{39}', re.ASCII)      # a line that may hold a number past what 32 bits hold: only such a line is read number by number
FLOAT_MAX = 3.4028235677973366e38      # what rounds to the largest 32-bit float; past it a number would be an infinity
WRITTEN = re.compile(r'[1-9]', re.ASCII)      # a digit that makes a number other than nought, in what stands before its exponent


def lost(cell):
    """Whether a number as it is written is not nought, and is nought as a 32-bit float (1e-60; and 1e-400, which is
    nought as soon as it is read at all)."""
    return struct.unpack('f', struct.pack('f', float(cell)))[0] == 0 and bool(WRITTEN.search(re.split('[eE]', cell)[0]))


class Refused(ValueError):
    """What was asked for is not allowed, or is not there; str() says why, plainly."""


def where(project, path, root=None):
    root = os.path.realpath(root or PROJECTS)
    if not isinstance(project, str) or not NAME.fullmatch(project) or project in ('.', '..'):
        raise Refused('a project name is letters, digits, spaces, _ . and -, up to 64, starting with a letter or digit')
    if data_path(path) is None:
        raise Refused('a data file is at data/ and one name ending .csv, of letters, digits, spaces, _ . and -')
    home = os.path.join(root, project)
    folder = os.path.join(home, 'data')
    full = os.path.join(folder, path[len('data/'):])
    for part in (home, folder, full):      # nothing on the way may be a link to somewhere else
        if os.path.islink(part):
            raise Refused('%s is a link, and a data file is read only from the project itself' % os.path.relpath(part, root))
    if os.path.commonpath([root, os.path.realpath(full)]) != root or os.path.dirname(os.path.realpath(full)) != os.path.realpath(folder):
        raise Refused('that is not a file of the project')
    return full


def read_text(project, path, root=None):
    full = where(project, path, root)
    try:
        if os.path.getsize(full) > MAX_UPLOAD:
            raise Refused('%s is larger than %s' % (path, megabytes(MAX_UPLOAD)))
        fd = os.open(full, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
        with os.fdopen(fd, 'rb') as f:
            return decode(f.read(MAX_UPLOAD + 1), path)
    except FileNotFoundError:
        raise Refused('%s is not in the project %s: choose the file again' % (path, project))
    except OSError as e:
        raise Refused('%s cannot be read (%s)' % (path, e.strerror or 'it is not a file'))


def decode(body, path='the file'):
    if len(body) > MAX_UPLOAD:
        raise Refused('%s is larger than %s' % (path, megabytes(MAX_UPLOAD)))
    if b'\0' in body:
        raise Refused('%s is not text: a data file is a CSV of numbers' % path)
    try:
        return body.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise Refused('%s is not text: a data file is a CSV of numbers' % path)


def lines_of(text):
    lines = text.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def inspect(text):
    return survey(text)[:3]


def survey(text):
    lines = lines_of(text)
    small = 0
    if not lines:
        raise Refused('the file is empty')
    skip = 0
    if not LINE.fullmatch(lines[0]):      # a first line that is not all numbers: a header, if none of it is a number
        cells = lines[0].split(',')
        numbers = [k for k, cell in enumerate(cells) if ONE.fullmatch(cell)]
        if numbers:
            bad = next(k for k, cell in enumerate(cells) if not ONE.fullmatch(cell))
            raise Refused('line 1 holds numbers, and its cell %d is not one: %s. (A first line of names is passed over; this is neither)' % (bad + 1, shown(cells[bad])))
        skip = 1
    if len(lines) == skip:
        raise Refused('the file has a header and no numbers')
    cols = lines[skip].count(',') + 1
    rows = len(lines) - skip
    if cols * rows > MAX_ENTRIES:
        raise Refused('the file has %s × %s numbers, more than the %s entries a matrix may have' % (format(cols, ','), format(rows, ','), format(MAX_ENTRIES, ',')))
    if skip and lines[0].count(',') + 1 != cols:
        raise Refused('its header names %d columns and its first row has %d' % (lines[0].count(',') + 1, cols))
    for k in range(skip, len(lines)):
        line = lines[k]
        if not LINE.fullmatch(line):
            raise Refused('line %d is not numbers with commas between them: %s' % (k + 1, shown(line)))
        if line.count(',') + 1 != cols:
            raise Refused('line %d has %d numbers and the first row has %d' % (k + 1, line.count(',') + 1, cols))
        if LARGE.search(line):
            for n, cell in enumerate(line.split(',')):
                if abs(float(cell.strip(' \t"'))) >= FLOAT_MAX:
                    raise Refused('line %d, number %d is too large for a 32-bit float: %s' % (k + 1, n + 1, shown(cell.strip())))
                small += lost(cell.strip(' \t"'))
    return skip, cols, rows, small


def shown(line):
    return '"%s"' % (line if len(line) <= 40 else line[:40] + '…') if line.strip() else 'it is empty'


def keep(project, path, body, root=None):
    return take(project, path, body, root)[:2]


@contextmanager
def _project_lock(project_json):
    """Serializes uploads into one project across worker processes using an advisory flock on project.json."""
    if fcntl is None:
        yield
        return
    fd = os.open(project_json, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)


def _same_file(full, body):
    with open(full, 'rb') as f:
        return os.path.getsize(full) == len(body) and f.read() == body


def take(project, path, body, root=None):
    full = where(project, path, root)
    home = os.path.dirname(os.path.dirname(full))
    project_json = os.path.join(home, 'project.json')
    if not os.path.isfile(project_json):
        raise Refused('there is no saved project called %s: save the project under a name first, and its data files are kept with it' % project)
    _, cols, rows, small = survey(decode(body, path))
    folder = os.path.dirname(full)
    try:
        with _project_lock(project_json):
            if os.path.lexists(full):      # never over what is there: the same file again is the file that is there
                if _same_file(full, body):
                    return cols, rows, small
                raise Refused('%s is already a file of %s, and holds something else: a data file is not replaced' % (path, project))
            there = [os.path.join(folder, n) for n in os.listdir(folder) if not n.startswith('.')] if os.path.isdir(folder) else []
            if len(there) >= MAX_DATA_FILES:
                raise Refused('%s already has %d data files, which is as many as a project keeps' % (project, len(there)))
            if sum(os.path.getsize(f) for f in there if os.path.isfile(f) and not os.path.islink(f)) + len(body) > MAX_DATA_BYTES:
                raise Refused('the data files of %s would come to more than %s' % (project, megabytes(MAX_DATA_BYTES)))
            os.makedirs(folder, exist_ok=True)
            if os.path.islink(folder) or os.path.islink(home):
                raise Refused('that is not a directory of the project')
            fd, fresh = tempfile.mkstemp(prefix='.uploading-', dir=folder)
            try:
                with os.fdopen(fd, 'wb') as f:
                    f.write(body)
                os.chmod(fresh, 0o644)
                os.link(fresh, full)      # (a link fails where the name has been taken meanwhile: nothing is ever written over)
            except FileExistsError:
                if os.path.isfile(full) and not os.path.islink(full) and _same_file(full, body):
                    return cols, rows, small
                raise Refused('%s is already a file of %s: a data file is not replaced' % (path, project))
            finally:
                if os.path.exists(fresh):
                    os.unlink(fresh)
    except OSError as e:
        raise Refused('%s could not be kept (%s)' % (path, e.strerror or 'the directory cannot be written'))
    return cols, rows, small
