"""Plan, launch and follow a training run on a rented GPU through box-boy (bb). No PyTorch needed here: this is what
serve.py calls when the editor offers to move a large training load off the browser.

    plan()    saves the model, writes the jobs file, asks `bb launch --dry-run` what it would rent and at what price
    launch()  publishes the model file to GitHub and runs `bb launch --yes`. Only ever called after the person has
              confirmed the plan and its cost in the editor's dialog; never call it for any other reason.
    status()  where the run is; once its instance is gone, downloads the result with `bb collect`
"""
import gzip
import json
import math
import os
import re
import shlex
import shutil
import subprocess
import time

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "runs", "_remote")
GPU_FLOPS = 3e12          # what a single rented card gets through on this kind of work; a rough figure, not a measurement
GPU_STEP_OVERHEAD = 4e-4  # seconds per level per step that no card speeds up
STARTUP_S = 8 * 60        # renting, pulling the image, cloning and checking, before training starts; billed like the rest
KNOWN_SIZES = {"digits": 1797, "mnist": 70000}


class RemoteError(Exception):
    pass


def _run(cmd, timeout=600):
    try:
        r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True, timeout=timeout)
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
    if os.path.isdir(STATE):                             # drop plans that were looked at and not taken
        for f in os.listdir(STATE):
            old = json.load(open(os.path.join(STATE, f)))
            if old.get("state") == "planned":
                for q in (old["path"], old["jobs"], os.path.join("runs", "_remote", f)):
                    if os.path.exists(os.path.join(HERE, q)):
                        os.remove(os.path.join(HERE, q))
    epochs, batch = max(0.01, float(epochs)), max(1, int(batch))
    if graph and d is None:
        val = 0                                          # nothing to hold out: every sample is a fresh draw
    edges = int(model["est"]["work"]) if graph else len(model["frame"]["edges"]["w"])
    if graph:
        levels = int(model["est"].get("levels") or levels)
    steps = max(1, round(epochs * math.ceil(n * (1 - val) / batch)))
    gpu_s = gpu_seconds(edges, int(levels), steps, batch)
    cap = hours_cap(gpu_s)
    stem = re.sub(r"[^A-Za-z0-9]+", "-", model.get("name") or "model").strip("-").lower() or "model"
    name = f"{stem}-{time.strftime('%m%d-%H%M%S')}"
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
    meta = {"name": name, "frame": model.get("name"), "path": path, "jobs": jobs, "job": job, "spec": spec, "samples": n, "edges": edges,
            "steps": steps, "epochs": epochs, "batch": batch, "gpu_s": gpu_s, "startup_s": STARTUP_S, "hours_cap": cap, "state": "planned",
            "problems": [], "price": None, "offer": None, "dry_run": ""}
    if size > 95:
        meta["problems"].append(f"the model file is {size:.0f} MB and GitHub refuses files over 100 MB; use fewer connections")
    if not shutil.which("bb"):
        meta["problems"].append("bb (box-boy) is not installed on the server, so nothing can be rented from here")
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


def _git(*args):
    code, out = _run(["git", "-C", HERE, *args], timeout=180)
    if code != 0:
        raise RemoteError(f"git {args[0]} failed: {out.splitlines()[-1] if out else 'no output'}")
    return out


def launch(name):
    """Rent the instance for a planned run. The caller must already hold the person's confirmation of its cost."""
    meta = _meta(name)
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
    _git("add", "--", meta["path"])                       # the instance clones the public repo, so the model has to be in it
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
