#!/usr/bin/env python3
"""Serves the editor and keeps saved projects, from a checkout of this repository. Standard library only.

    python3 server.py [port]          (default 8000)

What it does:
  - serves the files of this directory; / is smart-factory.html, wrapped into a whole page
  - keeps projects under projects/, one directory each (project.js describes the files):
        GET  /api/projects            -> ["attention", "example"]
        GET  /api/projects/<name>     -> [{"path": "Keys.json", "text": "..."}, ...]
        PUT  /api/projects/<name>     <- the same list; the project's directory becomes exactly these files
    A save that is no good is answered with why, as {"error": ...}, and changes nothing.
    A project's own .config is this machine's: it is not kept in the repository. Until a project has one, it is given
    the file projects/<name>.config, if the repository has that (see project_files).
  - every 30 seconds asks GitHub whether the branch it is on has moved, and if so pulls it. Pages are read from
    disk on each request, so the next reload shows the new version; if this file itself changed, it restarts.
    A project that comes with the repository can be saved over; where that has changed a file the branch has changed
    too, the branch's is taken (see update). What is not in the repository, a .config above all, is never touched.

The password is a PIN, kept out of the repository: the SMART_FACTORY_PIN environment variable, or else the one line of
a file called .pin beside this one. With a PIN set, nothing at all is answered without it: the browser asks for it
once (any user name) and sends it with every request after. Five different wrong PINs from one address within ten
minutes and that address is turned away for ten minutes. It is sent as it is typed, so over plain http it can be read
on the way: it keeps out whoever finds the port, not whoever can listen to the network.
With no PIN set there is no password: anyone who can reach the port can read and overwrite projects. That is only when
there is no .pin at all: one that is there and cannot be read, or has nothing in it, stops the server from starting.
"""
import base64, hashlib, hmac, json, os, re, shutil, subprocess, sys, tempfile, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECTS = os.path.join(ROOT, 'projects')
NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}')            # a project's name: one plain directory name. Used with fullmatch: all of the name has to fit ($ lets a last newline by)
MAX_SAVE = 64 << 20                                                # the most a save's body may be, in bytes
TRIES, LOCKED_FOR = 5, 600                                         # different wrong PINs allowed from one address within LOCKED_FOR seconds, and the seconds it is then turned away
SWALLOWED, SWALLOW_FOR = 64 << 20, 10                              # how much of a refused request's body is read and dropped, in bytes, and for how many seconds at most
clock = time.monotonic                                             # the clock the counting goes by: its own name, so a test can set it and nothing else's
# address -> { since: when its first wrong PIN came, seen: the different wrong PINs since (as digests), until: when it may try again, 0 if it still may }
wrong, wrong_lock = {}, threading.Lock()


def read_pin():
    """The PIN, or None where none is set: SMART_FACTORY_PIN, or else the first line of .pin beside this file.
    None is only for no .pin at all. A .pin that is there and gives no PIN (it cannot be opened, is not text, or its
    first line is empty) stops the server: to go on would be to serve everything with no password, unasked."""
    pin = os.environ.get('SMART_FACTORY_PIN', '').strip()
    if pin:
        return pin
    path = os.path.join(ROOT, '.pin')
    try:
        with open(path, encoding='utf-8-sig') as f:                # -sig: an editor's mark at the start of the file is no part of the PIN
            pin = f.readline().strip()
    except FileNotFoundError:
        return None
    except (OSError, ValueError) as e:                             # ValueError: not UTF-8
        raise SystemExit('%s is there but cannot be read (%s). Not starting: that would be starting with no PIN.' % (path, e))
    if not pin:
        raise SystemExit('%s is there but its first line is empty. Not starting: that would be starting with no PIN.' % path)
    return pin


PIN = read_pin()
PAGE = ('<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>'
        '</head><body>{page}</body></html>')


def project_files(name):
    """Every .json and .config file of a project, as [{path, text}], paths relative to the project's directory.
    A project's top .config is set on each machine and is not in the repository. One that has none yet (a project that
    came with the repository and has not been saved here) is given the one the repository has for it: the file
    <name>.config beside its directory. The first save writes a .config of the project's own, and that is used after."""
    base, out = os.path.join(PROJECTS, name), []
    given = os.path.join(PROJECTS, name + '.config')
    if not os.path.isfile(os.path.join(base, '.config')) and os.path.isfile(given):
        with open(given, encoding='utf8') as text:
            out.append({'path': '.config', 'text': text.read()})
    for folder, _, files in os.walk(base):
        for f in sorted(files):
            if f.endswith('.json') or f == '.config':
                full = os.path.join(folder, f)
                with open(full, encoding='utf8') as text:
                    out.append({'path': os.path.relpath(full, base).replace(os.sep, '/'), 'text': text.read()})
    return out


def checked(files):
    """What a save sent, as { path: text }, once it is known to be a project's files. A ValueError says what is wrong:
    nothing is written until all of it is right."""
    if not isinstance(files, list):
        raise ValueError('a save is a list of files, each {"path": ..., "text": ...}')
    out = {}
    for f in files:
        if not isinstance(f, dict):
            raise ValueError('each file is {"path": ..., "text": ...}, not %s' % json.dumps(f)[:60])
        for key in ('path', 'text'):
            if key not in f:
                raise ValueError('a file has no %s' % key)
            if not isinstance(f[key], str):
                raise ValueError("a file's %s is text, not %s" % (key, json.dumps(f[key])[:60]))
        path, parts = f['path'], f['path'].split('/')
        if not (path.endswith('.json') or parts[-1] == '.config') or any(p in ('', '.', '..') or '\\' in p or '\0' in p for p in parts):
            raise ValueError('not a path a project may contain: %r' % path)
        if path in out:
            raise ValueError('two files called %r' % path)
        out[path] = f['text']
    for path in out:                                               # a.json and a.json/b.json: one name cannot be a file and a directory
        parts = path.split('/')
        for above in ('/'.join(parts[:i]) for i in range(1, len(parts))):
            if above in out:
                raise ValueError('%r is a file, so %r cannot be inside it' % (above, path))
    if 'project.json' not in out:
        raise ValueError('no project.json among the files')
    return out


def write_project(name, files):
    """Replaces the project's directory with exactly these files, { path: text } as checked() gives them. Written
    beside it first, then swapped in. If that cannot be done (an OSError: the disk is full, say), the project is left
    as it was and nothing half-written stays behind."""
    os.makedirs(PROJECTS, exist_ok=True)
    fresh, old = tempfile.mkdtemp(prefix='.saving-', dir=PROJECTS), None
    try:
        for path, text in files.items():
            full = os.path.join(fresh, *path.split('/'))
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, 'w', encoding='utf8') as out:
                out.write(text)
        target = os.path.join(PROJECTS, name)
        if os.path.exists(target):
            old = tempfile.mkdtemp(prefix='.old-', dir=PROJECTS)
            os.rename(target, os.path.join(old, 'was'))
        try:
            os.rename(fresh, target)
        except OSError:
            if old:
                os.rename(os.path.join(old, 'was'), target)        # the new one did not go in: the old one goes back
            raise
        os.chmod(target, 0o755)
    finally:
        for left in (fresh, old):
            if left:
                shutil.rmtree(left, ignore_errors=True)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')              # always ask, so a pulled update shows on reload
        super().end_headers()

    def parse_request(self):
        """Every request comes through here before anything is done with it: without the PIN it goes no further."""
        return super().parse_request() and self.allowed()

    def allowed(self):
        """Whether the request carries the PIN (or none is set). Where it does not, it is answered here: 401, which
        makes a browser ask for it, or 429 once the address has given too many wrong ones."""
        if PIN is None:
            return True
        who, now, given = self.client_address[0], clock(), None
        kind, _, sent = self.headers.get('Authorization', '').partition(' ')
        if kind.lower() == 'basic':
            try:
                given = base64.b64decode(sent.strip(), validate=True).decode('utf8').partition(':')[2]
            except ValueError:
                given = ''
        wait, note = 0, None
        with wrong_lock:                                           # only the counting is done here: the answer is sent after, so a slow reader holds no one else up
            for a in [a for a, e in wrong.items() if (e['until'] or e['since'] + LOCKED_FOR) <= now]:
                del wrong[a]                                       # forgotten: a wait that is over, or wrong PINs from more than LOCKED_FOR ago
            e = wrong.get(who)
            if e and e['until']:                                   # turned away: not even the right PIN is looked at
                wait = int(e['until'] - now) + 1
            elif given is not None and hmac.compare_digest(given.encode(), PIN.encode()):
                wrong.pop(who, None)
                return True
            elif given is not None:
                # A wrong PIN counts; asking without one does not. The same wrong PIN again does not count twice: a
                # page left open resends the one it has with every request, and that is no one guessing.
                e = wrong.setdefault(who, {'since': now, 'seen': set(), 'until': 0})
                e['seen'].add(hashlib.sha256(given.encode()).digest())
                note = 'wrong PIN (%d of %d)' % (len(e['seen']), TRIES)
                if len(e['seen']) >= TRIES:
                    e['until'] = now + LOCKED_FOR
                    note += ': turned away for %d seconds' % LOCKED_FOR
        if wait:
            self.note('refused while turned away for too many wrong PINs')
            return self.refuse(429, 'too many wrong PINs: try again later', {'Retry-After': str(wait)})
        if note:
            self.note(note)
        return self.refuse(401, 'the PIN is needed', {'WWW-Authenticate': 'Basic realm="Smart Factory PIN (any user name)", charset="UTF-8"'})

    def note(self, what):
        """A line in the log about this request, whatever its address: log_message below keeps to saves and loads."""
        SimpleHTTPRequestHandler.log_message(self, '%s: "%s"', what, self.requestline)

    def refuse(self, status, why, headers):
        data = b'' if self.command == 'HEAD' else json.dumps({'error': why}).encode()
        self.send_response(status)
        for name, value in headers.items():
            self.send_header(name, value)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(data)
        self.wfile.flush()
        self.close_connection = True
        self.swallow()
        return False

    def swallow(self):
        """Reads and drops the body of a request that has been refused. To close on a client still sending is to cut
        it off, and it then sees a broken connection in place of the answer: a save refused for want of the PIN would
        tell the page nothing. Up to SWALLOWED bytes, and for SWALLOW_FOR seconds in all: the time is counted from
        the start, not from the last byte, so a client that sends a little now and then is not waited on for ever."""
        try:
            left, until = min(int(self.headers.get('Content-Length') or 0), SWALLOWED), time.monotonic() + SWALLOW_FOR
            while left > 0 and time.monotonic() < until:
                self.connection.settimeout(max(until - time.monotonic(), 0.01))
                got = self.rfile.read1(min(left, 1 << 16))         # read1: whatever has come, without waiting for all that was asked for
                if not got:
                    break
                left -= len(got)
        except (OSError, ValueError):
            pass

    def reply(self, status, body, kind='application/json'):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', kind + '; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def project(self):
        """The project a /api/projects/<name> address names, or None after answering that it is no good."""
        name = unquote(self.path.split('?')[0][len('/api/projects/'):])
        if NAME.fullmatch(name):
            return name
        self.reply(400, {'error': 'a project name is letters, digits, spaces, _ . and -, up to 64, starting with a letter or digit'})

    def address(self):
        """The address asked for, without whatever follows a ? or a #."""
        return self.path.split('?')[0].split('#')[0]

    def page(self):
        """Answers with the page if the address is the page's, and says whether it was."""
        if self.address() not in ('/', '/index.html'):
            return False
        with open(os.path.join(ROOT, 'smart-factory.html'), encoding='utf8') as f:
            self.reply(200, PAGE.replace('{page}', f.read()).encode(), 'text/html')
        return True

    def do_GET(self):
        path = self.address()
        if self.page():
            return
        if path == '/api/projects':
            names = sorted(n for n in os.listdir(PROJECTS) if os.path.isfile(os.path.join(PROJECTS, n, 'project.json'))) if os.path.isdir(PROJECTS) else []
            return self.reply(200, names)
        if path.startswith('/api/projects/'):
            name = self.project()
            if name is None:
                return
            if not os.path.isfile(os.path.join(PROJECTS, name, 'project.json')):
                return self.reply(404, {'error': 'no project called ' + name})
            return self.reply(200, project_files(name))
        if path.startswith('/api/') or self.hidden():              # nothing else under /api, and no dot-files (.git)
            return self.reply(404, {'error': 'not found'})
        super().do_GET()

    def do_HEAD(self):
        if self.hidden() or self.address().startswith('/api/'):
            return self.send_error(404)
        if not self.page():                                        # the page's headers, as GET gives them, without the page
            super().do_HEAD()

    def hidden(self):
        """Whether the address names a dot-file, read as the file server will read it: %2egit is .git."""
        path = unquote(self.address())
        return '/.' in path or '\\' in path

    def list_directory(self, path):
        """A directory is not listed: a list names the dot-files in it, which are not to be served, and is no use to
        the page, which asks for every file by name."""
        self.send_error(404)

    def do_PUT(self):
        if not self.path.startswith('/api/projects/'):
            return self.reply(404, {'error': 'not found'})
        name = self.project()
        if name is None:
            return
        # The length is looked at before anything is read: a negative one would be read until the client hung up.
        # Where it is no good the body is not read at all, so the answer goes the way a refusal does (see swallow).
        length = self.headers.get('Content-Length', '').strip()
        if not (length.isascii() and length.isdigit()):
            return self.refuse(400, 'a save says how long it is: Content-Length is a whole number of bytes, not %r' % length[:40], {})
        if len(length) > 18 or int(length) > MAX_SAVE:
            return self.refuse(413, 'a save may be %d bytes at most, and this one is %s' % (MAX_SAVE, length[:40]), {})
        sent = self.rfile.read(int(length))
        try:
            files = checked(json.loads(sent))
            write_project(name, files)
        except (ValueError, RecursionError) as e:                  # RecursionError: lists inside lists, thousands deep
            return self.reply(400, {'error': str(e) or 'not a list of files'})
        except OSError as e:                                       # strerror, not all of it: the whole message names the server's directories
            return self.reply(500, {'error': 'could not write the project: %s' % (e.strerror or type(e).__name__)})
        self.reply(200, {'saved': name, 'files': len(files)})

    def log_message(self, fmt, *args):
        if '/api/' in str(args[0] if args else ''):                  # the log is for saves and loads, not every file
            super().log_message(fmt, *args)


def git(*args):
    return subprocess.run(['git', '-C', ROOT, *args], capture_output=True, text=True, timeout=120)


def update():
    """Brings the checkout up to what was last fetched (FETCH_HEAD). -> None, or why it could not be done.
    A save over a project that comes with the repository changes files git tracks, and git will not bring in a change
    to a file that has been changed here. Where that is all that stands in the way, the branch's files are taken: each
    file under projects/ changed both here and on the branch is put back as it was, and the update goes in. Nothing
    outside projects/ is ever put back: if a file changed here stands in the way there, the update waits, as before.
    A file the branch no longer keeps (a .config, from when they were kept in the repository) stays as it is here."""
    merged = git('merge', '--ff-only', 'FETCH_HEAD')
    if not merged.returncode:
        return None
    why = merged.stderr.strip() or merged.stdout.strip() or 'git would not merge'
    names = lambda *args: {p for p in git(*args, '-z').stdout.split('\0') if p}
    theirs = names('diff', '--name-only', 'HEAD', 'FETCH_HEAD')
    way = (names('diff', '--name-only', 'HEAD') | names('ls-files', '--others', '--exclude-standard')) & theirs      # changed here, or made here, and changed there
    if not way or not all(p.startswith('projects/') for p in way):
        return why
    kept = {}                                                      # what the branch has let go of: put back afterwards, as it is here
    for p in way:
        full = os.path.join(ROOT, *p.split('/'))
        if os.path.isfile(full) and git('cat-file', '-e', 'FETCH_HEAD:' + p).returncode:
            with open(full, 'rb') as f:
                kept[full] = f.read()
    tracked = sorted(p for p in way if not git('cat-file', '-e', 'HEAD:' + p).returncode)
    if tracked and git('checkout', 'HEAD', '--', *tracked).returncode:
        return why
    for p in way - set(tracked):                                   # made here where the branch now has a file of its own: the branch's is taken
        full = os.path.join(ROOT, *p.split('/'))
        if os.path.isfile(full):
            os.remove(full)
    merged = git('merge', '--ff-only', 'FETCH_HEAD')
    for full, data in kept.items():
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, 'wb') as f:
            f.write(data)
    if merged.returncode:
        return merged.stderr.strip() or why
    taken = sorted(p for p in way if os.path.join(ROOT, *p.split('/')) not in kept)
    if taken:
        print('changed here and on the branch, under projects/: the branch\'s taken (%s)' % ', '.join(taken), flush=True)
    if kept:
        print('no longer kept on the branch, and left as it is here: %s' % ', '.join(sorted(os.path.relpath(full, ROOT) for full in kept)), flush=True)
    return None


def follow(every=30):
    """Keeps this checkout level with its branch on GitHub."""
    if git('rev-parse', '--is-inside-work-tree').returncode:
        return print('not a git checkout: updates will not be followed', flush=True)
    branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.strip()
    print('following origin/%s' % branch, flush=True)
    me = os.path.getmtime(__file__)
    while True:
        time.sleep(every)
        try:
            if git('fetch', '--quiet', 'origin', branch).returncode:
                continue
            here, there = git('rev-parse', 'HEAD').stdout.strip(), git('rev-parse', 'FETCH_HEAD').stdout.strip()
            if not there or here == there:
                continue
            failed = update()
            print(('could not update: ' + failed) if failed else ('updated to ' + there[:7]), flush=True)
            if not failed and os.path.getmtime(__file__) != me:
                print('the server itself changed: restarting', flush=True)
                os.execv(sys.executable, [sys.executable, os.path.abspath(__file__), *sys.argv[1:]])
        except Exception as e:                                     # a lost connection, a slow fetch: try again next time
            print('update check failed: %s' % e, flush=True)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    threading.Thread(target=follow, args=(float(os.environ.get('FOLLOW_EVERY', 30)),), daemon=True).start()
    ThreadingHTTPServer.allow_reuse_address = True
    print('serving %s on port %d, %s' % (ROOT, port, 'behind a PIN' if PIN else 'with no PIN: anyone who can reach the port can read and overwrite projects'), flush=True)
    ThreadingHTTPServer(('', port), Handler).serve_forever()
