#!/usr/bin/env python3
"""Serves the editor and keeps saved projects, from a checkout of this repository. Standard library only.

    python3 server.py [port]          (default 8000)

What it does:
  - serves the files of this directory; / is smart-factory.html, wrapped into a whole page
  - keeps projects under projects/, one directory each (project.js describes the files):
        GET  /api/projects            -> ["attention", "example"]
        GET  /api/projects/<name>     -> [{"path": "Keys.json", "text": "..."}, ...]
        PUT  /api/projects/<name>     <- the same list; the project's directory becomes exactly these files
  - every 30 seconds asks GitHub whether the branch it is on has moved, and if so pulls it. Pages are read from
    disk on each request, so the next reload shows the new version; if this file itself changed, it restarts.

The password is a PIN, kept out of the repository: the SMART_FACTORY_PIN environment variable, or else the one line of
a file called .pin beside this one. With a PIN set, nothing at all is answered without it: the browser asks for it
once (any user name) and sends it with every request after. Five wrong PINs from one address and that address is
turned away for ten minutes. It is sent as it is typed, so over plain http it can be read on the way: it keeps out
whoever finds the port, not whoever can listen to the network.
With no PIN set there is no password: anyone who can reach the port can read and overwrite projects.
"""
import base64, hmac, json, os, re, shutil, subprocess, sys, tempfile, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECTS = os.path.join(ROOT, 'projects')
NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$')          # a project's name: one plain directory name
TRIES, LOCKED_FOR = 5, 600                                         # wrong PINs allowed from one address, and the seconds it is then turned away
wrong, wrong_lock = {}, threading.Lock()                           # address -> [wrong PINs so far, when it may try again]


def read_pin():
    """The PIN, or None where none is set: SMART_FACTORY_PIN, or else the first line of .pin beside this file."""
    pin = os.environ.get('SMART_FACTORY_PIN', '').strip()
    if not pin:
        try:
            with open(os.path.join(ROOT, '.pin'), encoding='utf8') as f:
                pin = f.readline().strip()
        except OSError:
            pin = ''
    return pin or None


PIN = read_pin()
PAGE = ('<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>'
        '</head><body>{page}</body></html>')


def project_files(name):
    """Every .json and .config file of a project, as [{path, text}], paths relative to the project's directory."""
    base, out = os.path.join(PROJECTS, name), []
    for folder, _, files in os.walk(base):
        for f in sorted(files):
            if f.endswith('.json') or f == '.config':
                full = os.path.join(folder, f)
                out.append({'path': os.path.relpath(full, base).replace(os.sep, '/'), 'text': open(full, encoding='utf8').read()})
    return out


def write_project(name, files):
    """Replaces the project's directory with exactly these files. Written beside it first, then swapped in."""
    os.makedirs(PROJECTS, exist_ok=True)
    fresh = tempfile.mkdtemp(prefix='.saving-', dir=PROJECTS)
    try:
        for f in files:
            parts = str(f['path']).split('/')
            if not (f['path'].endswith('.json') or parts[-1] == '.config') or any(p in ('', '.', '..') or '\\' in p or '\0' in p for p in parts):
                raise ValueError('not a path a project may contain: %r' % f['path'])
            full = os.path.join(fresh, *parts)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, 'w', encoding='utf8') as out:
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
        who, now, given = self.client_address[0], time.monotonic(), None
        kind, _, sent = self.headers.get('Authorization', '').partition(' ')
        if kind.lower() == 'basic':
            try:
                given = base64.b64decode(sent.strip(), validate=True).decode('utf8').partition(':')[2]
            except ValueError:
                given = ''
        with wrong_lock:
            count, until = wrong.get(who, (0, 0))
            if until > now:                                        # turned away: not even the right PIN is looked at
                return self.refuse(429, 'too many wrong PINs: try again later', {'Retry-After': str(int(until - now) + 1)})
            if given is not None and hmac.compare_digest(given.encode(), PIN.encode()):
                wrong.pop(who, None)
                return True
            if given is not None:                                  # a wrong PIN counts; asking without one does not
                count = count + 1 if until == 0 else 1
                wrong[who] = (count, now + LOCKED_FOR if count >= TRIES else 0)
                if count >= TRIES:
                    print('%d wrong PINs from %s: turned away for %d seconds' % (count, who, LOCKED_FOR), flush=True)
        return self.refuse(401, 'the PIN is needed', {'WWW-Authenticate': 'Basic realm="Smart Factory PIN (any user name)", charset="UTF-8"'})

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
        self.close_connection = True                               # whatever body the request had is not read
        return False

    def reply(self, status, body, kind='application/json'):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', kind + '; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def project(self):
        """The project a /api/projects/<name> address names, or None after answering that it is no good."""
        name = self.path.split('?')[0][len('/api/projects/'):]
        from urllib.parse import unquote
        name = unquote(name)
        if NAME.match(name):
            return name
        self.reply(400, {'error': 'a project name is letters, digits, spaces, _ . and -, up to 64, starting with a letter or digit'})

    def do_GET(self):
        path = self.path.split('?')[0]
        if path in ('/', '/index.html'):
            return self.reply(200, PAGE.replace('{page}', open(os.path.join(ROOT, 'smart-factory.html'), encoding='utf8').read()).encode(), 'text/html')
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
        if path.startswith('/api/') or '/.' in path:               # nothing else under /api, and no dot-files (.git)
            return self.reply(404, {'error': 'not found'})
        super().do_GET()

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
        if '/api/' in (args[0] if args else ''):                   # the log is for saves and loads, not every file
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
