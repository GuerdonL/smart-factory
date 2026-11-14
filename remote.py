"""Plan, launch and follow a training run on a rented GPU through box-boy (bb). No PyTorch needed here: this is what
serve.py calls when the editor offers to move a large training load off the browser.

    plan()    saves the model, writes the jobs file, asks `bb launch --dry-run` what it would rent and at what price
    launch()  publishes the model file to GitHub and runs `bb launch --yes`. Only ever called after the person has
              confirmed the plan and its cost in the editor's dialog; never call it for any other reason.
    status()  where the run is; once its instance is gone, downloads the result with `bb collect`

"Run locally" from the editor means on this machine, the one serving the page, which is assumed to be small:
    local_plan()   saves the model and times a few steps here to say how long the run would take
    local_start()  runs trainer.py as one low-priority, single-threaded process with a time limit; one at a time
"""
import gzip
import json
import math
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "runs", "_remote")
GPU_FLOPS = 3e12          # what a single rented card gets through on this kind of work; a rough figure, not a measurement
GPU_STEP_OVERHEAD = 4e-4  # seconds per level per step that no card speeds up
STARTUP_S = 8 * 60        # renting, pulling the image, cloning and checking, before training starts; billed like the rest
KNOWN_SIZES = {"digits": 1797, "mnist": 70000}
LOCAL_MINUTES = float(os.environ.get("SF_LOCAL_MINUTES", 10))   # a run on this machine is stopped after this long
LOCAL_MARGIN = 1.3        # a real run is slower than the timed steps
PYTHON = os.environ.get("SF_PYTHON") or sys.executable          # the Python that runs training here; it needs PyTorch
PROCS = {}                # local runs started by this server process


class RemoteError(Exception):
    pass


def _env():
    """The environment commands run in. A server started by systemd or cron does not read ~/.bashrc, which is where box-boy's
    setup puts ~/.local/bin (bb, vastai, hf) on the PATH, so the usual places are added here."""
    home = os.path.expanduser("~")
    extra = [os.path.dirname(os.environ["SF_BB"])] if os.environ.get("SF_BB") else []
    extra += [os.path.join(home, ".local", "bin"), os.path.join(home, "bin"), os.path.dirname(sys.executable), "/usr/local/bin", "/usr/bin", "/bin"]
    have = os.environ.get("PATH", "").split(os.pathsep)
    env = dict(os.environ)
    env["PATH"] = os.pathsep.join([p for p in extra if p and p not in have] + have)
    return env


def _which(cmd):
    return shutil.which(cmd, path=_env()["PATH"])


def _bb_missing():
    import getpass
    return (f"bb (box-boy) was not found for the user this server runs as ({getpass.getuser()}, home {os.path.expanduser('~')}). "
            "Run serve.py as the user that set box-boy up, or set SF_BB to the full path of bb (see `which bb` in your own shell)")


def _run(cmd, timeout=600):
    try:
        r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True, timeout=timeout, env=_env())
    except FileNotFoundError:
        raise RemoteError(f"{cmd[0]} is not installed on the server")
    except subprocess.TimeoutExpired:
        raise RemoteError(f"{' '.join(cmd[:3])} did not finish in {timeout} s")
    return r.returncode, (r.stdout + ("\n" + r.stderr if r.stderr.strip() else "")).strip()


def gpu_seconds(edges, levels, steps, batch):
    return steps * (GPU_STEP_OVERHEAD * max(1, levels) + 6 * edges * batch / GPU_FLOPS)


def hours_cap(gpu_s):
    """The time limit handed to bb: four times the estimate, at least half an hour, so a stuck job cannot run up a bill."""
    return max(0.5, math.ceil(gpu_s * 4 / 360) / 10)


def _meta(name):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", name or ""):
        raise RemoteError("bad run name")
    p = os.path.join(STATE, name + ".json")
    if not os.path.exists(p):
        raise RemoteError(f"no planned run named {name}")
    return json.load(open(p))


def _save(meta):
    os.makedirs(STATE, exist_ok=True)
    json.dump(meta, open(os.path.join(STATE, meta["name"] + ".json"), "w"), indent=1)


def plan(model, epochs=5, batch=32, levels=3, val=0.1):
    """Save the model and work out what a rented run would be and cost. Rents nothing."""
    graph = model.get("format") == "perceptron-editor/graph"
    if not graph and model.get("format") != "perceptron-editor/model":
        raise RemoteError("that is not a model exported from the editor")
    d = next((b for b in model["blocks"] if b["type"] == "data"), None) if graph else model["data"]
    src, ref = (d or {}).get("source"), (d or {}).get("ref")
    if graph and d is None:                              # samplers only: a pass is a fixed number of draws
        spec, n = "random samples", int(model.get("est", {}).get("samples") or 10000)
    elif src in KNOWN_SIZES:
        spec, n = src, KNOWN_SIZES[src]
    elif src in ("kaggle", "hf") and ref:
        mod = __import__("kaggle_data" if src == "kaggle" else "hf_data")
        i = mod.info(ref)
        if not i:
            raise RemoteError(f"{ref} is not on the server any more; add it again from the Dataset block")
        spec, n = f"{src}:{ref}", (max(1, i.get("chars", 0) // int(d.get("win") or 64)) if i.get("kind") == "text" else i["n"])
    else:
        raise RemoteError("this model's images were loaded from a folder in the browser, which a rented machine cannot reach. "
                          "Load the data through the Dataset block's Kaggle or Hugging Face button instead.")
    _sweep()
    epochs, batch = max(0.01, float(epochs)), max(1, int(batch))
    if graph and d is None:
        val = 0                                          # nothing to hold out: every sample is a fresh draw
    edges = int(model["est"]["work"]) if graph else len(model["frame"]["edges"]["w"])
    if graph:
        levels = int(model["est"].get("levels") or levels)
    steps = max(1, round(epochs * math.ceil(n * (1 - val) / batch)))
    gpu_s = gpu_seconds(edges, int(levels), steps, batch)
    cap = hours_cap(gpu_s)
    name = f"{_stem(model)}-{time.strftime('%m%d-%H%M%S')}"
    os.makedirs(os.path.join(HERE, "models"), exist_ok=True)
    os.makedirs(os.path.join(HERE, "jobs"), exist_ok=True)
    path = f"models/{name}.json.gz"
    with gzip.open(os.path.join(HERE, path), "wt") as f:
        json.dump(model, f, separators=(",", ":"))
    size = os.path.getsize(os.path.join(HERE, path)) / 1e6
    args = [path, "--out", f"runs/{name}", "--epochs", f"{epochs:g}", "--batch", str(batch), "--val", f"{val:g}"] + ([] if graph else ["--data", spec]) + ["--max-minutes", f"{cap * 48:g}"]
    job = f"{name}: python trainer.py {' '.join(shlex.quote(a) for a in args)}"
    jobs = f"jobs/{name}.txt"
    open(os.path.join(HERE, jobs), "w").write(job + "\n")
    meta = {"name": name, "kind": "gpu", "frame": model.get("name"), "path": path, "jobs": jobs, "job": job, "spec": spec, "samples": n, "edges": edges,
            "steps": steps, "epochs": epochs, "batch": batch, "gpu_s": gpu_s, "startup_s": STARTUP_S, "hours_cap": cap, "state": "planned",
            "problems": [], "price": None, "offer": None, "dry_run": ""}
    if size > 95:
        meta["problems"].append(f"the model file is {size:.0f} MB and GitHub refuses files over 100 MB; use fewer connections")
    if not _which("bb"):
        meta["problems"].append(_bb_missing())
    else:
        code, out = _run(["bb", "launch", jobs, "--dry-run", "--max-hours", f"{cap:g}"], timeout=180)
        meta["dry_run"] = out
        m = re.search(rf"^\s*{re.escape(name)}\s+(\d+x .+?) \$([\d.]+)/h\s+(.*?)\s*\|", out, re.M)
        if code != 0 or not m:
            meta["problems"].append("bb could not price this run: " + (out.splitlines()[-1] if out else "no output"))
        else:
            meta["offer"], meta["price"] = f"{m.group(1)} in {m.group(3) or 'an unnamed place'}", float(m.group(2))
    if meta["price"] is not None:
        meta["expected_cost"] = round((STARTUP_S + gpu_s) / 3600 * meta["price"], 2)
        meta["max_cost"] = round(cap * meta["price"], 2)
    _save(meta)
    return meta


def _stem(model):
    return re.sub(r"[^A-Za-z0-9]+", "-", model.get("name") or "model").strip("-").lower() or "model"


def _sweep():
    """Drop plans that were looked at and not taken."""
    if os.path.isdir(STATE):
        for f in os.listdir(STATE):
            old = json.load(open(os.path.join(STATE, f)))
            if old.get("state") == "planned":
                for q in (old["path"], old.get("jobs") or "", os.path.join("runs", "_remote", f)):
                    if q and os.path.isfile(os.path.join(HERE, q)):
                        os.remove(os.path.join(HERE, q))


def _local_alive(meta):
    p = PROCS.get(meta["name"])
    if p is not None:
        return p.poll() is None
    try:                                                 # started by an earlier server process: look the pid up
        return meta["name"] in open(f"/proc/{meta['pid']}/cmdline").read()
    except (OSError, KeyError):
        return False


def local_plan(model, epochs=5, batch=32, val=0.1):
    """Save the graph and time a few of its training steps on this machine. Starts nothing."""
    if model.get("format") != "perceptron-editor/graph":
        raise RemoteError("that is not a graph exported from the editor")
    _sweep()
    epochs, batch = max(0.01, float(epochs)), max(1, int(batch))
    name = f"{_stem(model)}-{time.strftime('%m%d-%H%M%S')}"
    os.makedirs(os.path.join(HERE, "models"), exist_ok=True)
    path = f"models/{name}.json.gz"
    with gzip.open(os.path.join(HERE, path), "wt") as f:
        json.dump(model, f, separators=(",", ":"))
    meta = {"name": name, "kind": "local", "frame": model.get("name"), "path": path, "epochs": epochs, "batch": batch, "val": val, "state": "planned",
            "problems": [], "limit_min": LOCAL_MINUTES, "est_s": None, "steps": None, "samples": None}
    code, out = _run([PYTHON, "graph.py", "bench", path, "--batch", str(batch)], timeout=180)
    try:
        b = json.loads(out.strip().splitlines()[-1])
        held = b["held"]
        meta["samples"] = b["n"]
        meta["steps"] = max(1, round(epochs * math.ceil(b["n"] * (1 - (val if held else 0)) / batch)))
        meta["est_s"] = b["per_step"] * meta["steps"] * LOCAL_MARGIN
        if not held:
            meta["val"] = 0
    except (ValueError, IndexError, KeyError):
        last = out.strip().splitlines()[-1] if out.strip() else "no output"
        ver = _run([PYTHON, "-c", "import sys; print(sys.version.split()[0])"], timeout=30)[1].strip()
        meta["problems"].append(f"PyTorch is not installed for the server's Python ({PYTHON}, version {ver}): {PYTHON} -m pip install torch --index-url https://download.pytorch.org/whl/cpu"
                                if "No module named 'torch'" in out else f"the server could not run this graph with Python {ver} ({PYTHON}): " + last[:300])
    if any(m.get("kind") == "local" and m["state"] == "running" and _local_alive(m) for m in _all()):
        meta["problems"].append("another run is already going on the server; it does one at a time")
    _save(meta)
    return meta


def local_start(name):
    meta = _meta(name)
    if meta.get("kind") != "local" or meta["state"] != "planned":
        raise RemoteError(f"{name} cannot be started")
    if meta["problems"]:
        raise RemoteError("this run cannot start: " + "; ".join(meta["problems"]))
    if any(m.get("kind") == "local" and m["state"] == "running" and _local_alive(m) for m in _all()):
        raise RemoteError("another run is already going on the server; it does one at a time")
    out_dir = os.path.join(HERE, "runs", name)
    os.makedirs(out_dir, exist_ok=True)
    cmd = [PYTHON, "trainer.py", meta["path"], "--out", f"runs/{name}", "--epochs", f"{meta['epochs']:g}", "--batch", str(meta["batch"]),
           "--val", f"{meta['val']:g}", "--threads", "1", "--device", "cpu", "--log-s", "4", "--max-minutes", f"{meta['limit_min']:g}"]
    if _which("nice"):
        cmd = ["nice", "-n", "15"] + cmd                 # the page and everything else on this machine come first
    p = subprocess.Popen(cmd, cwd=HERE, stdout=open(os.path.join(out_dir, "out.txt"), "w"), stderr=subprocess.STDOUT, env=_env())
    PROCS[name] = p
    meta.update(state="running", pid=p.pid, launched=time.time())
    _save(meta)
    return meta


def stop(name):
    meta = _meta(name)
    if meta.get("kind") != "local" or meta["state"] != "running":
        raise RemoteError("only a run on the server can be stopped from here; for a rented one use `bb destroy` on the server")
    if _local_alive(meta):
        os.kill(meta["pid"], signal.SIGTERM)
    meta.update(state="failed", error="stopped before it finished")
    _save(meta)
    return meta


def _local_status(meta):
    d = os.path.join(HERE, "runs", meta["name"])
    log = os.path.join(d, "log.csv")
    if os.path.exists(log):
        rows = open(log).read().strip().splitlines()
        if len(rows) > 1:
            c = rows[-1].split(",")
            meta["progress"] = {"step": int(c[0]), "of": meta.get("steps"), "loss": float(c[3]) if c[3] else None}
    if _local_alive(meta):
        return meta
    mp = os.path.join(d, "metrics.json")
    if os.path.exists(mp) and os.path.exists(os.path.join(d, "weights.json")):
        meta["state"], meta["metrics"] = "done", json.load(open(mp))
    else:
        tail = open(os.path.join(d, "out.txt")).read().strip().splitlines()[-1:] if os.path.exists(os.path.join(d, "out.txt")) else []
        meta["state"], meta["error"] = "failed", "the run ended without a result" + (": " + tail[0][:300] if tail else "")
    return meta


def _all():
    out = []
    if os.path.isdir(STATE):
        for f in sorted(os.listdir(STATE)):
            if f.endswith(".json"):
                out.append(json.load(open(os.path.join(STATE, f))))
    return out


def _git(*args):
    code, out = _run(["git", "-C", HERE, *args], timeout=180)
    if code != 0:
        raise RemoteError(f"git {args[0]} failed: {out.splitlines()[-1] if out else 'no output'}")
    return out


def launch(name):
    """Rent the instance for a planned run. The caller must already hold the person's confirmation of its cost."""
    meta = _meta(name)
    if meta.get("kind") == "local":
        raise RemoteError(f"{name} is a run for this machine, not a rental")
    if meta["state"] != "planned":
        raise RemoteError(f"{name} was already started")
    if meta["problems"]:
        raise RemoteError("this run cannot start: " + "; ".join(meta["problems"]))
    if meta["spec"].startswith("kaggle:"):                # the instance has no Kaggle login: the pack rides in box-boy's private Hugging Face repo
        import tomllib
        import kaggle_data
        from huggingface_hub import HfApi
        cfg, api = tomllib.load(open(os.path.join(HERE, "boxboy.toml"), "rb")), HfApi()
        try:
            repo = cfg.get("hf_repo") or f"{api.whoami()['name']}/{cfg.get('name') or os.path.basename(HERE)}-runs"
            api.create_repo(repo, private=True, exist_ok=True)
            api.upload_folder(repo_id=repo, folder_path=kaggle_data.folder(meta["spec"][7:]), path_in_repo=kaggle_data.hf_path(meta["spec"][7:]),
                              allow_patterns=["packed.npz", "info.json"], commit_message=f"dataset {meta['spec']}")
        except Exception as e:
            raise RemoteError(f"could not copy the dataset to Hugging Face: {type(e).__name__}: {str(e)[:160]}")
    _git("add", "-f", "--", meta["path"])                       # the instance clones the public repo, so the model has to be in it
    if _git("status", "--porcelain", "--", meta["path"]):
        _git("commit", "-m", f"Add {os.path.basename(meta['path'])}", "--", meta["path"])
    _git("push")
    meta["state"], meta["launched"] = "launching", time.time()
    _save(meta)
    code, out = _run(["bb", "launch", meta["jobs"], "--max-hours", f"{meta['hours_cap']:g}", "--yes"], timeout=900)
    meta["launch_out"] = out
    ok = code == 0 and re.search(rf"^\s*{re.escape(name)}: instance ", out, re.M)
    meta["state"] = "running" if ok else "failed"
    if not ok:
        meta["error"] = "bb did not rent an instance: " + (out.splitlines()[-1] if out else "no output")
    _save(meta)
    if not ok:
        raise RemoteError(meta["error"])
    return meta


def status(name):
    """Where a run is. While its instance exists: its state and price. Once it is gone: fetch the result and report done or failed."""
    meta = _meta(name)
    if meta["state"] in ("planned", "done", "failed"):
        return meta
    if meta.get("kind") == "local":
        meta = _local_status(meta)
        _save(meta)
        return meta
    code, out = _run(["bb", "status"], timeout=120)
    line = next((l for l in out.splitlines() if l.split()[:1] == [name]), None)
    if line:
        m = re.search(r"id \d+\s+(\S+)", line)
        meta["instance"] = line.strip()
        meta["state"] = "running"
        meta["phase"] = m.group(1) if m else "?"
        if meta["phase"] in ("exited", "stopped", "offline"):   # bb stops, rather than destroys, an instance whose job failed
            meta["state"], meta["error"] = "failed", f"the instance stopped without finishing; on the server run `bb logs {name}`, then `bb destroy {name}`"
    elif code != 0:
        meta["note"] = "could not ask bb for the status: " + (out.splitlines()[-1] if out else "no output")
    elif time.time() - meta.get("launched", 0) > 90:            # gone: finished and destroyed itself, or never came up
        _run(["bb", "collect", name], timeout=600)
        d = os.path.join(HERE, "runs", name)
        st = os.path.join(d, "STATUS.json")
        code_ = json.load(open(st)).get("exit_code") if os.path.exists(st) else None
        if code_ == 0 and os.path.exists(os.path.join(d, "weights.json")):
            meta["state"] = "done"
            mp = os.path.join(d, "metrics.json")
            meta["metrics"] = json.load(open(mp)) if os.path.exists(mp) else None
        elif code_ is not None:
            meta["state"], meta["error"] = "failed", f"the job ended with exit code {code_}; see runs/{name}/log on the server"
        elif time.time() - meta.get("launched", 0) > 20 * 60:
            meta["state"], meta["error"] = "failed", "the instance is gone and left no result"
    _save(meta)
    return meta


def weights(name):
    _meta(name)
    p = os.path.join(HERE, "runs", name, "weights.json")
    if not os.path.exists(p):
        raise RemoteError(f"{name} has no weights yet")
    return json.load(open(p))


def runs():
    out = []
    if os.path.isdir(STATE):
        for f in sorted(os.listdir(STATE)):
            if f.endswith(".json"):
                m = json.load(open(os.path.join(STATE, f)))
                if m["state"] != "planned":
                    out.append({k: m.get(k) for k in ("name", "frame", "state", "launched", "price", "expected_cost", "max_cost", "error")})
    return out
