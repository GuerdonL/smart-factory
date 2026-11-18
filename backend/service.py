"""The backend as a process: an HTTP server on the loopback address, and the workers a run is done in.

    python -m backend [port]          (default 8001; run from the repository's root, with backend/requirements.txt installed)

    GET  /health                      -> { "ok": true, "version": 1 }
    POST /run                         <- { "graph", "want", "tick", "project" }   -> { "results", "errors" }   (run.py has both in full)
    POST /data?project=<name>&path=data/<file>.csv     <- the file's bytes        -> { "path", "cols", "rows" }, or { "error": why } with 400 or 413

It listens on 127.0.0.1 and nowhere else, and has no password of its own: the page reaches it through server.py,
which passes /api/backend/* on to it and is what the PIN guards. So that a web page open in a browser on the same
machine cannot reach it behind server.py's back, a request that carries an Origin, or names a Host other than this
address, is refused.

Every run is worked out in a worker, a process of its own (WORKERS of them, started with the server). A run that
takes longer than MAX_SECONDS is stopped by ending its worker, and a new one takes its place: the server itself does
no arithmetic, so it stays answering whatever a run does. A worker may take MAX_MEMORY bytes and no more; a run that
needs more ends with "more memory than the backend may take". A graph nested very deep is worked out on a stack made
large for it. The limits are limits.py's."""
import json
import multiprocessing
import os
import queue
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from . import limits
from .data import Refused

STACK = 512 << 20      # bytes of stack a run has: a graph may be 20,000 nodes deep


def worker(conn, root, memory):
    """A worker's whole life: a request's bytes in, the answer's bytes out, until the server goes."""
    try:
        import resource
        if memory:
            resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
    except (ImportError, ValueError, OSError):
        pass      # (where it cannot be set, the other limits still hold)
    from . import run
    sys.setrecursionlimit(1_000_000)
    threading.stack_size(STACK)
    while True:
        try:
            body = conn.recv_bytes()
        except (EOFError, OSError):
            return
        out = []

        def work():
            try:
                out.append(json.dumps(run.run(body, root)).encode())
            except BaseException as e:      # (a MemoryError met while the answer was being written, say)
                out.append(json.dumps(run.refuse('the backend could not work this out (%s)' % type(e).__name__)).encode())
        t = threading.Thread(target=work)
        t.start()
        t.join()
        conn.send_bytes(out[0])


class Workers:
    def __init__(self, count=limits.WORKERS, seconds=limits.MAX_SECONDS, root=None, memory=None):
        self.seconds, self.root = seconds, root
        self.memory = limits.MAX_MEMORY if memory is None else memory
        self.spawn = multiprocessing.get_context('spawn')
        self.free = queue.Queue()
        self.all = []
        self.lock = threading.Lock()
        for _ in range(count):
            self.free.put(self.start())

    def start(self):
        here, there = self.spawn.Pipe()
        p = self.spawn.Process(target=worker, args=(there, self.root, self.memory), daemon=True)
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

    def run(self, body):
        from .run import refuse
        try:
            w = self.free.get(timeout=limits.MAX_WAIT)
        except queue.Empty:
            return json.dumps(refuse('the backend is busy with other runs: try again')).encode()
        p, conn = w
        try:
            conn.send_bytes(body)
            if conn.poll(self.seconds):
                answer = conn.recv_bytes()
                self.free.put(w)
                return answer
            why = 'the run took longer than %s and was stopped' % limits.plural(self.seconds, 'second')
        except (EOFError, OSError):      # the worker went: out of memory past what it could say, or ended from outside
            why = 'the run ended before it was worked out: it needed more memory than the backend may take'
        self.end(w)
        self.free.put(self.start())
        return json.dumps(refuse(why)).encode()

    def close(self):
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

    def local(self):
        """Whether the request came the way it is meant to: for this address, and from no web page."""
        host = (self.headers.get('Host') or '').strip().lower()
        ours = ('127.0.0.1:%d' % self.server.server_address[1], 'localhost:%d' % self.server.server_address[1])
        if self.headers.get('Origin') is not None or host not in ours:
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
        if not self.local():
            return
        if urlsplit(self.path).path == '/health':
            from .run import health
            return self.reply(200, health())
        self.reply(404, {'error': 'not found'})

    def do_POST(self):
        if not self.local():
            return
        url = urlsplit(self.path)
        if url.path == '/run':
            body = self.body(limits.MAX_BODY, 'the request')
            if body is not None:
                self.reply(200, self.server.workers.run(body))
            return
        if url.path == '/data':
            body = self.body(limits.MAX_UPLOAD, 'the file')
            if body is None:
                return
            asked = parse_qs(url.query, keep_blank_values=True)
            from .run import upload
            try:
                return self.reply(200, upload((asked.get('project') or [None])[-1], (asked.get('path') or [None])[-1], body, self.server.workers.root))
            except Refused as e:
                return self.reply(400, {'error': str(e)})
            except MemoryError:
                return self.reply(400, {'error': 'the file is too large to be read'})
        self.reply(404, {'error': 'not found'})


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, port, seconds=limits.MAX_SECONDS, root=None, workers=limits.WORKERS, quiet=False, memory=None):
        super().__init__(('127.0.0.1', port), Handler)      # the loopback address, and no other
        self.quiet = quiet
        self.workers = Workers(workers, seconds, root, memory)

    def server_close(self):
        super().server_close()
        self.workers.close()


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    port = int(argv[0]) if argv else 8001
    memory = os.environ.get('SMART_FACTORY_BACKEND_MEMORY')
    server = Server(port, memory=int(memory) if memory else None)
    print('the backend is answering on http://127.0.0.1:%d (loopback only)' % port, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
