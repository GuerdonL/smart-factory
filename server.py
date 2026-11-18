#!/usr/bin/env python3
"""Serves the editor and keeps saved projects, from a checkout of this repository. Standard library only.

    python3 server.py [port]          (default 8000)

What it does:
  - serves the files of this directory; / is smart-factory.html, wrapped into a whole page
  - keeps projects under projects/, one directory each (project.js describes the files):
        GET  /api/projects            -> ["attention", "example"]
        GET  /api/projects/<name>     -> [{"path": "Keys.json", "text": "..."}, ...]
        PUT  /api/projects/<name>     <- the same list; the project's directory becomes exactly these files
    A project's files are its .json files, its .config files and, under data/ at its top, the .csv files its file
    sources read (data/weights.csv): no other path is kept, and none that climbs out of the project.
  - passes three addresses on to the backend (backend/, a separate process that works a model out in floating point):
        GET  /api/backend/health      -> the backend's /health, or 503 where there is none
        POST /api/backend/run         -> its /run
        POST /api/backend/data?project=<name>&path=data/<file>.csv     -> its /data
    The backend's address is the SMART_FACTORY_BACKEND environment variable (default http://127.0.0.1:8001). These
    go through the PIN like everything else, so the backend, which listens on this machine only and has no password
    of its own, is never reached without it. Only those three are passed on, to that one address; an answer that
    sends the request elsewhere is not followed; and no more is read of a request (5 MB for a run, 50 MB for a
    file) or of an answer (8 MB) than is said here.
  - every 30 seconds asks GitHub whether the branch it is on has moved, and if so pulls it. Pages are read from
    disk on each request, so the next reload shows the new version; if this file itself changed, it restarts.

The password is a PIN, kept out of the repository: the SMART_FACTORY_PIN environment variable, or else the one line of
a file called .pin beside this one. With a PIN set, nothing at all is answered without it: the browser asks for it
once (any user name) and sends it with every request after. Five different wrong PINs from one address within ten
minutes and that address is turned away for ten minutes. It is sent as it is typed, so over plain http it can be read
on the way: it keeps out whoever finds the port, not whoever can listen to the network.
With no PIN set there is no password: anyone who can reach the port can read and overwrite projects. That is only when
there is no .pin at all: one that is there and cannot be read, or has nothing in it, stops the server from starting.
"""
import base64, hashlib, hmac, http.client, json, os, re, shutil, subprocess, sys, tempfile, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, quote, unquote, urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECTS = os.path.join(ROOT, 'projects')
NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$')          # a project's name: one plain directory name
DATA = re.compile(r'data/[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}\.csv')    # a data file: data/ and one .csv name (sources.js: dataPath)
# what is passed on to the backend: how much of a request's body is read for each address, in bytes (the backend's own
# limits: backend/limits.py), how much of its answer, and how many seconds it is waited on
PASSED = {'/health': 0, '/run': 5 * 1024 * 1024, '/data': 50 * 1024 * 1024}
ANSWER, WAIT = 8 * 1024 * 1024, 90
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


def read_backend():
    """Where the backend is, as (host, port): SMART_FACTORY_BACKEND, or http://127.0.0.1:8001. It is an http address
    with a host and nothing after it; anything else stops the server, since to go on would be to pass requests on to
    somewhere that was not meant."""
    given = os.environ.get('SMART_FACTORY_BACKEND', '').strip() or 'http://127.0.0.1:8001'
    try:
        url = urlsplit(given)
        host, port = url.hostname, url.port or 80
    except ValueError:
        url = host = port = None
    if not host or url.scheme != 'http' or url.path not in ('', '/') or url.query or url.fragment or url.username or url.password:
        raise SystemExit('SMART_FACTORY_BACKEND is %r, which is not an address like http://127.0.0.1:8001. Not starting.' % given)
    return host, port


PIN = read_pin()
BACKEND = read_backend()
PAGE = ('<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>'
        '</head><body>{page}</body></html>')


def project_files(name):
    """Every .json and .config file of a project, as [{path, text}], paths relative to the project's directory."""
    base, out = os.path.join(PROJECTS, name), []
    for folder, _, files in os.walk(base):
        for f in sorted(files):
            full = os.path.join(folder, f)
            path = os.path.relpath(full, base).replace(os.sep, '/')
            if f.endswith('.json') or f == '.config':
                with open(full, encoding='utf8') as text:
                    out.append({'path': path, 'text': text.read()})
            elif DATA.fullmatch(path) and not os.path.islink(full):     # a data file, at the top of the project
                try:
                    with open(full, encoding='utf8', newline='') as data:
                        out.append({'path': path, 'text': data.read()})
                except ValueError:                                 # not text: it is no table of numbers, and the page could not hold it
                    pass
    return out


def write_project(name, files):
    """Replaces the project's directory with exactly these files. Written beside it first, then swapped in."""
    os.makedirs(PROJECTS, exist_ok=True)
    fresh = tempfile.mkdtemp(prefix='.saving-', dir=PROJECTS)
    try:
        for f in files:
            parts = str(f['path']).split('/')
            csv = str(f['path']).endswith('.csv')
            if not (f['path'].endswith('.json') or parts[-1] == '.config' or csv) or any(p in ('', '.', '..') or '\\' in p or '\0' in p for p in parts) or (csv and not DATA.fullmatch(str(f['path']))):
                raise ValueError('not a path a project may contain: %r' % f['path'])
            full = os.path.join(fresh, *parts)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, 'w', encoding='utf8', newline='') as out:
                out.write(str(f['text']))
        if not os.path.isfile(os.path.join(fresh, 'project.json')):
            raise ValueError('no project.json among the files')
        target, old = os.path.join(PROJECTS, name), None
        if os.path.exists(target):
            old = tempfile.mkdtemp(prefix='.old-', dir=PROJECTS)
            os.rename(target, os.path.join(old, 'was'))
        os.rename(fresh, target)
        os.chmod(target, 0o755)
        if old:
            shutil.rmtree(old, ignore_errors=True)
    finally:
        shutil.rmtree(fresh, ignore_errors=True)


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
        if NAME.match(name):
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
        if self.backend():
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

    def backend(self):
        """Passes the request on to the backend if its address is one of the three that are, and answers with what the
        backend answered. Gives whether the address was under /api/backend/ at all. Nothing of the request goes on
        but its body and, for a file, the project and the path it names: no header of the browser's, no other
        address, and nothing to any host but the one this server was started with."""
        path = self.address()
        if not path.startswith('/api/backend/') and path != '/api/backend':
            return False
        to = path[len('/api/backend'):]
        if to not in PASSED or (self.command == 'GET') != (to == '/health'):
            self.reply(404, {'error': 'not found'})
            return True
        body = b''
        if self.command == 'POST':
            try:
                length = int(self.headers.get('Content-Length') or '')
            except ValueError:
                length = -1
            if length < 0 or self.headers.get('Transfer-Encoding'):
                self.refuse(411, 'the request has to say how long it is', {})
                return True
            if length > PASSED[to]:
                self.refuse(413, 'that is larger than the %d MB the backend takes' % (PASSED[to] >> 20), {})
                return True
            body = self.rfile.read(length)
            if len(body) != length:
                self.close_connection = True
                return True
        if to == '/data':                                          # the two things a file's address says, written out again: nothing else of it goes on
            asked = parse_qs(urlsplit(self.path).query, keep_blank_values=True)
            to += '?project=%s&path=%s' % (quote((asked.get('project') or [''])[-1], safe=''), quote((asked.get('path') or [''])[-1], safe=''))
        try:
            c = http.client.HTTPConnection(BACKEND[0], BACKEND[1], timeout=WAIT)
            try:
                c.request(self.command, to, body=body if self.command == 'POST' else None,
                          headers={'Content-Type': 'application/octet-stream' if to.startswith('/data') else 'application/json'})
                r = c.getresponse()
                status, answer = r.status, r.read(ANSWER + 1)
            finally:
                c.close()
        except (OSError, http.client.HTTPException) as e:
            self.reply(503, {'error': 'the backend is not answering (%s)' % (getattr(e, 'strerror', None) or type(e).__name__)})
            return True
        if 300 <= status < 400:                                    # it is never followed: the request goes to the backend and nowhere else
            self.reply(502, {'error': 'the backend answered by sending the request elsewhere, which is not followed'})
        elif len(answer) > ANSWER:
            self.reply(502, {'error': 'the backend answered with more than %d MB' % (ANSWER >> 20)})
        else:
            self.reply(status, answer)
        return True

    def do_POST(self):
        if not self.backend():
            self.reply(404, {'error': 'not found'})

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
        try:
            files = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)))
            write_project(name, files)
        except (ValueError, KeyError, TypeError) as e:
            return self.reply(400, {'error': str(e)})
        self.reply(200, {'saved': name, 'files': len(files)})

    def log_message(self, fmt, *args):
        if '/api/' in str(args[0] if args else ''):                  # the log is for saves and loads, not every file
            super().log_message(fmt, *args)


def git(*args):
    return subprocess.run(['git', '-C', ROOT, *args], capture_output=True, text=True, timeout=120)


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
            merged = git('merge', '--ff-only', 'FETCH_HEAD')
            print(('updated to ' + there[:7]) if not merged.returncode else ('could not update: ' + merged.stderr.strip()), flush=True)
            if not merged.returncode and os.path.getmtime(__file__) != me:
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
