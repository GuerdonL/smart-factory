"""What the server's tests share: a server of its own for each test, over a directory of its own, and a way to ask it.
Not a test itself (unittest looks for test_*.py)."""
import json, os, shutil, sys, tempfile, threading, unittest
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server


class ServerCase(unittest.TestCase):
    PIN = None      # the PIN the test's server is behind; None for none. Never this machine's own: that is not the tests'.
    SERVED = {}     # the files beside the test's server, besides smart-factory.html: { path: text }

    def setUp(self):
        self.kept, self.dir = (server.ROOT, server.PROJECTS, server.PIN), tempfile.mkdtemp(prefix='smart-factory-test-')
        shutil.copy(os.path.join(server.ROOT, 'smart-factory.html'), self.dir)
        for path, text in self.SERVED.items():
            os.makedirs(os.path.dirname(os.path.join(self.dir, path)), exist_ok=True)
            with open(os.path.join(self.dir, path), 'w') as f:
                f.write(text)
        server.ROOT, server.PROJECTS, server.PIN = self.dir, os.path.join(self.dir, 'projects'), self.PIN
        server.wrong.clear()
        # the server's own log_message runs, as it does in use; the lines it would write to stderr are kept here instead
        self.log = []
        quiet = mock.patch.object(BaseHTTPRequestHandler, 'log_message', lambda handler, fmt, *args: self.log.append(fmt % args))
        quiet.start(); self.addCleanup(quiet.stop)
        self.httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=self.httpd.serve_forever, args=(0.01,), daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown(); self.httpd.server_close()
        server.ROOT, server.PROJECTS, server.PIN = self.kept
        server.wrong.clear()
        shutil.rmtree(self.dir, ignore_errors=True)

    def request(self, method, path, body=None, headers=None):
        """-> (status, headers, text). body: bytes as they are, anything else as JSON."""
        c = HTTPConnection('127.0.0.1', self.httpd.server_address[1], timeout=20)
        c.request(method, path, body=body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode(), headers=headers or {})
        r = c.getresponse(); text = r.read().decode('utf8', 'replace'); c.close()
        return r.status, r.headers, text
