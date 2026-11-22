"""The backend as a process: an HTTP server on the loopback address, and the workers a run is done in.

    python -m backend [port]          (default 8001; run from the repository's root, with backend/requirements.txt installed)

    GET  /health                      -> { "ok": true, "version": 5 }
    POST /run                         <- { "graph", "want", "tick", "project" }   -> { "results", "errors" }   (run.py has both in full)
    POST /data?project=<name>&path=data/<file>.csv     <- the file's bytes        -> { "path", "cols", "rows" } (and "small": see run.py), or { "error": why } where it is refused (413 where it is too large to be read at all)

Whom it answers. It listens on 127.0.0.1 and nowhere else, and it answers only server.py, which the PIN guards:
  - Every request has to carry the token, in the header X-Smart-Factory-Token. The token is 32 random bytes made
    afresh each time the backend starts and written to a file only its owner can read (backend/.token, or the path
    in SMART_FACTORY_BACKEND_TOKEN; never in git). server.py, run by the same user, reads it and sends it. So another
    user of the machine, or a process in a container, that can reach the port still cannot use it: without the
    token nothing is answered but a refusal. It is compared in constant time.
  - A request that carries an Origin, or names a Host other than this address, is refused too, so that a web page
    open in a browser on the same machine cannot reach it either.

Every run, and every file that is uploaded, is worked on in a worker, a process of its own (WORKERS of them,
started with the server). One that takes longer than MAX_SECONDS is stopped by ending its worker, and a new one
takes its place: the server itself reads no graph and no file, so it stays answering whatever a request holds.
Memory: a run is refused before anything is made where what it is worked out from would not fit in the room a
worker has for arrays (limits.py: memory_for_arrays: by default a quarter of the machine's physical memory each
for two workers; SMART_FACTORY_BACKEND_MEMORY sets it, in megabytes for each worker). Behind that, a worker's
address space is capped (its room, its stack and SLACK for Python and NumPy themselves), so that what the count
missed ends as "more memory than the backend may take" and not as a machine out of memory. A graph nested very deep
is worked out on a stack made large for it. At most UPLOADS files are taken at once.

Stopping. On SIGTERM or SIGINT the server ends its workers and goes. A worker also watches for its server: when
the server is gone, however it went, the worker ends itself within a second, whatever it was working out."""
import hmac
import json
import multiprocessing
import os
import queue
import secrets
import signal
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from . import limits

def graph_version():
    """check.py's VERSION, read off its text: this process imports nothing of the graph (the workers do), and so the
    number is written in one place. It is the line that begins "VERSION = "."""
    import re
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'check.py'), encoding='utf8') as f:
        found = re.search(r'^VERSION = (\d+)\b', f.read(), re.M)
    if not found:
        raise RuntimeError('check.py says no VERSION')
    return int(found.group(1))


GRAPH_VERSION = graph_version()      # what GET /health answers
STACK = 256 << 20      # bytes of stack a run has: a graph may be 20,000 nodes deep
SLACK = 1536 << 20     # bytes of address space allowed for Python, NumPy and their threads, beside a worker's arrays and its stack
HEADER = 'X-Smart-Factory-Token'
TOKEN_FILE = os.environ.get('SMART_FACTORY_BACKEND_TOKEN') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '.token')


def new_token(path):
    """Makes the token and writes it where only this user can read it; gives the token."""
    token = secrets.token_hex(32)
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)      # made anew, never written into what was there
    with os.fdopen(fd, 'w') as f:
        f.write(token + '\n')
    return token


def worker(conn, root, room, address, parent):
    """A worker's whole life: a job in, its answer out, until the server goes."""
    def watch():      # the server gone, however it went: so is this, at once, whatever it is working out
        import time
        while os.getppid() == parent:
            time.sleep(0.5)
        os._exit(1)
    threading.Thread(target=watch, daemon=True).start()
    signal.signal(signal.SIGINT, signal.SIG_IGN)      # (the server is told to stop, and ends its workers itself)
    # Keep BLAS/OpenMP single-threaded by default so thread-pool arenas do not exhaust RLIMIT_AS on many-core hosts.
    for var in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS', 'NUMEXPR_NUM_THREADS'):
        os.environ.setdefault(var, '1')
    try:
        import resource
        if address:
            resource.setrlimit(resource.RLIMIT_AS, (address, address))
    except (ImportError, ValueError, OSError):
        pass      # (where it cannot be set, the count of what a run needs still holds)
    from . import run
    from .data import Refused
    sys.setrecursionlimit(1_000_000)

    def execute(job, body):
        try:
            if job['kind'] == 'data':
                try:
                    return run.upload(job['project'], job['path'], body, root)
                except Refused as e:
                    return {'error': str(e)}
            return run.run(body, root, room)
        except MemoryError:
            return run.refuse(run.NO_MEMORY) if job['kind'] == 'run' else {'error': run.NO_MEMORY}
        except BaseException as e:
            sys.stderr.write('a worker could not finish: %s: %s\n' % (type(e).__name__, e))
            return run.refuse(run.BROKEN) if job['kind'] == 'run' else {'error': run.BROKEN}

    # One long-lived thread with a 256 MB stack runs every job (a graph may be 20,000 nodes deep) without reserving a
    # fresh stack on every request.
    inbox, outbox = queue.Queue(maxsize=1), queue.Queue(maxsize=1)

    def loop():
        while True:
            item = inbox.get()
            if item is None:
                return
            outbox.put(execute(*item))

    threading.stack_size(STACK)
    runner = threading.Thread(target=loop, daemon=True)
    try:
        runner.start()
    except (MemoryError, RuntimeError):
        runner = None
    while True:
        try:
            job = json.loads(conn.recv_bytes().decode('utf8'))
            body = conn.recv_bytes()
        except (EOFError, OSError):
            if runner is not None:
                inbox.put(None)
            return
        if runner is not None:
            inbox.put((job, body))
            answer = outbox.get()
        else:
            answer = run.refuse(run.NO_MEMORY) if job['kind'] == 'run' else {'error': run.NO_MEMORY}
        conn.send_bytes(json.dumps(answer).encode())


class Workers:
    def __init__(self, count=limits.WORKERS, seconds=limits.MAX_SECONDS, root=None, memory=None, address=None):
        self.seconds, self.root = seconds, root
        self.room = limits.memory_for_arrays(os.environ.get('SMART_FACTORY_BACKEND_MEMORY'), count) if memory is None else memory
        self.address = self.room + STACK + SLACK if address is None else address
        self.spawn = multiprocessing.get_context('spawn')
        self.free = queue.Queue()
        self.all = []
        self.lock = threading.Lock()
        self.closed = False
        for _ in range(count):
            self.free.put(self.start())

    def start(self):
        here, there = self.spawn.Pipe()
        p = self.spawn.Process(target=worker, args=(there, self.root, self.room, self.address, os.getpid()), daemon=True)
        p.start()
        there.close()
        with self.lock:
            self.all.append(p)
        return p, here

    def end(self, w):
        p, conn = w
        conn.close()
        p.kill()
        p.join(5)
        with self.lock:
            if p in self.all:
                self.all.remove(p)

    def ask(self, job, body):
        """A job done in a worker: its answer as bytes. Never longer than the time a run may take, and the wait for a worker."""
        why = lambda text: json.dumps({'results': {}, 'errors': {'*': text}} if job['kind'] == 'run' else {'error': text}).encode()
        try:
            w = self.free.get(timeout=limits.MAX_WAIT)
        except queue.Empty:
            return why('the backend is busy with other runs: try again')
        p, conn = w
        try:
            conn.send_bytes(json.dumps(job).encode())
            conn.send_bytes(body)
            if conn.poll(self.seconds):
                answer = conn.recv_bytes()
                self.free.put(w)
                return answer
            said = 'it took longer than %s and was stopped' % limits.plural(self.seconds, 'second')
            said = ('the run took' + said[7:]) if job['kind'] == 'run' else ('reading the file took' + said[7:])
        except (EOFError, OSError):      # the worker went: out of memory past what it could say, or ended from outside
            said = 'it ended before it was done: it needed more memory than the backend may take'
        self.end(w)
        if not self.closed:
            self.free.put(self.start())
        return why(said)

    def close(self):
        self.closed = True
        with self.lock:
            every = list(self.all)
        for p in every:
            p.kill()
        for p in every:
            p.join(5)


class Handler(BaseHTTPRequestHandler):
    timeout = 60                     # seconds a connection may sit silent before it is dropped
    server_version = 'SmartFactoryBackend/1'
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        if self.server.quiet:
            return
        super().log_message(fmt, *args)

    def reply(self, status, body):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        if status >= 400:
            self.send_header('Connection', 'close')
            self.close_connection = True
        self.end_headers()
        self.wfile.write(data)

    def allowed(self):
        """Whether the request is server.py's: for this address, from no web page, and carrying the token. Nothing
        else is answered but this refusal, which says nothing of what is here."""
        host = (self.headers.get('Host') or '').strip().lower()
        port = self.server.server_address[1]
        ours = ('127.0.0.1:%d' % port, 'localhost:%d' % port) + (('127.0.0.1', 'localhost') if port == 80 else ())
        given = self.headers.get(HEADER) or ''
        if self.headers.get('Origin') is not None or host not in ours or not hmac.compare_digest(given.encode('utf8', 'replace'), self.server.token.encode()):
            self.reply(403, {'error': 'the backend answers server.py on this machine, and nothing else'})
            return False
        return True

    def body(self, most, what):
        """The request's body, or None after answering that it is too large or was not all sent."""
        try:
            n = int(self.headers.get('Content-Length') or '')
        except ValueError:
            n = -1
        if n < 0 or self.headers.get('Transfer-Encoding'):
            self.reply(411, {'error': 'the request has to say how long it is', 'results': {}, 'errors': {'*': 'the request has to say how long it is'}})
            return None
        if n > most:
            why = '%s is larger than %s' % (what, limits.megabytes(most))
            self.reply(413, {'error': why, 'results': {}, 'errors': {'*': why}})
            return None
        data = self.rfile.read(n)
        if len(data) != n:
            self.close_connection = True
            return None
        return data

    def do_GET(self):
        if not self.allowed():
            return
        if urlsplit(self.path).path == '/health':
            return self.reply(200, {'ok': True, 'version': GRAPH_VERSION})
        self.reply(404, {'error': 'not found'})

    def do_POST(self):
        if not self.allowed():
            return
        url = urlsplit(self.path)
        if url.path == '/run':
            body = self.body(limits.MAX_BODY, 'the request')
            if body is not None:
                self.reply(200, self.server.workers.ask({'kind': 'run'}, body))
            return
        if url.path == '/data':
            if not self.server.uploads.acquire(blocking=False):      # a file is up to 50 MB held here on its way to a worker: only so many at once
                return self.reply(200, {'error': 'the backend is taking other files just now: choose the file again in a moment'})
            try:
                body = self.body(limits.MAX_UPLOAD, 'the file')
                if body is None:
                    return
                asked = parse_qs(url.query, keep_blank_values=True)
                answer = json.loads(self.server.workers.ask({'kind': 'data', 'project': (asked.get('project') or [None])[-1], 'path': (asked.get('path') or [None])[-1]}, body))
                return self.reply(200, {'error': answer['error']} if 'error' in answer else answer)      # refused: an answer, not a failure of the service
            finally:
                self.server.uploads.release()
        self.reply(404, {'error': 'not found'})


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, port, seconds=limits.MAX_SECONDS, root=None, workers=limits.WORKERS, quiet=False, memory=None, address=None, token=None):
        super().__init__(('127.0.0.1', port), Handler)      # the loopback address, and no other
        self.quiet = quiet
        self.token = token if token is not None else new_token(TOKEN_FILE)
        self.uploads = threading.BoundedSemaphore(limits.UPLOADS)
        self.workers = Workers(workers, seconds, root, memory, address)

    def server_close(self):
        super().server_close()
        self.workers.close()


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    port = int(argv[0]) if argv else 8001
    server = Server(port)

    def stop(*_):      # asked to stop: the workers are ended with it, whatever they are working out
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print('the backend is answering on http://127.0.0.1:%d (loopback only, and only with the token in %s); each of its %d workers may hold %s in arrays'
          % (server.server_address[1], TOKEN_FILE, limits.WORKERS, limits.megabytes(server.workers.room)), flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
