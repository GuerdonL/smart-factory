"""Serve the editor, with Kaggle and Hugging Face dataset search and loading behind it.

    python serve.py                 # http://<this machine>:8000
    python serve.py --port 8080 --token my-passphrase

The page works as plain files too; what this adds is the Dataset block's "Kaggle" and "Hugging Face" buttons.
Searching and adding run on this machine with its Kaggle and Hugging Face logins, so those calls need the access
token this prints at start (kept in .serve-token, or set with --token / SF_TOKEN). Anyone can still open the editor itself.
"""
import argparse
import base64
import json
import os
import secrets
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np

import hf_data
import kaggle_data

HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN = None
BUSY = threading.Lock()          # one download at a time


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=os.path.join(HERE, "editor"), **k)

    def send(self, code, obj):
        body = json.dumps(obj, separators=(",", ":")).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        return secrets.compare_digest(self.headers.get("X-Token", ""), TOKEN)

    def api(self, method):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == "/api/ping":
            return self.send(200, {"ok": True, "token": self.allowed()})
        if not self.allowed():
            return self.send(401, {"error": "wrong or missing access token"})
        try:
            if u.path == "/api/kaggle/search" and method == "GET":
                return self.send(200, {"results": kaggle_data.search(q.get("q", ""))})
            if u.path == "/api/hf/search" and method == "GET":
                return self.send(200, {"results": hf_data.search(q.get("q", ""))})
            if u.path == "/api/hf/parts" and method == "GET":
                return self.send(200, hf_data.parts(q.get("ref", ""), q.get("config") or None, q.get("split") or None))
            if u.path == "/api/hf/add" and method == "POST":
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
                if not BUSY.acquire(blocking=False):
                    return self.send(409, {"error": "another dataset is downloading; try again when it finishes"})
                try:
                    size = body.get("size")
                    return self.send(200, {"info": hf_data.add(body.get("ref", ""), int(body.get("rows") or 2000), hf_data.parse_where(body.get("where")),
                                                               body.get("config") or None, body.get("split") or None, int(size) if size else None)})
                finally:
                    BUSY.release()
            if u.path == "/api/datasets" and method == "GET":
                return self.send(200, {"datasets": hf_data.added() if q.get("src") == "hf" else kaggle_data.added()})
            if u.path == "/api/kaggle/add" and method == "POST":
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
                if not BUSY.acquire(blocking=False):
                    return self.send(409, {"error": "another dataset is downloading; try again when it finishes"})
                try:
                    size = body.get("size")
                    return self.send(200, {"info": kaggle_data.add(body.get("ref", ""), int(size) if size else None)})
                finally:
                    BUSY.release()
            if u.path == "/api/dataset" and method == "GET":
                ref = q.get("ref", "")
                mod = hf_data if q.get("src") == "hf" else kaggle_data
                i = mod.info(ref)
                if i and i.get("kind") == "text":                # the browser gets the first few million characters; the files hold the rest
                    docs = hf_data.docs(ref, max(1000, min(int(q.get("chars", 3_000_000)), 20_000_000)))
                    return self.send(200, {**i, "shown": sum(len(d) for d in docs), "docs": docs})
                if not i:
                    return self.send(404, {"error": f"{ref} has not been added on this machine"})
                z = np.load(os.path.join(mod.folder(ref), "packed.npz"))
                limit = max(1, min(int(q.get("limit", 5000)), 50000))
                pick = np.arange(i["n"]) if i["n"] <= limit else np.linspace(0, i["n"] - 1, limit).astype(np.int64)
                return self.send(200, {**i, "shown": int(len(pick)), "labels": [int(v) for v in z["lab"][pick]],
                                       "pix": base64.b64encode(np.ascontiguousarray(z["pix"][pick]).tobytes()).decode()})
        except (kaggle_data.KaggleError, hf_data.HFError) as e:
            return self.send(400, {"error": str(e)})
        except Exception as e:                                   # a broken download should not take the server down
            return self.send(500, {"error": f"{type(e).__name__}: {e}"})
        self.send(404, {"error": "no such call"})

    def do_GET(self):
        return self.api("GET") if self.path.startswith("/api/") else super().do_GET()

    def do_POST(self):
        return self.api("POST") if self.path.startswith("/api/") else self.send(404, {"error": "no such call"})

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/"):
            super().log_message(fmt, *args)


def main():
    global TOKEN
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--token", default=os.environ.get("SF_TOKEN"))
    a = ap.parse_args()
    path = os.path.join(HERE, ".serve-token")
    TOKEN = a.token or (open(path).read().strip() if os.path.exists(path) else None)
    if not TOKEN:
        TOKEN = secrets.token_urlsafe(12)
        with open(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
            f.write(TOKEN)
    print(f"editor on port {a.port}; access token for the Kaggle panel: {TOKEN}", flush=True)
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
