"""Train an exported model wherever it finishes soonest: here, or on a rented GPU through box-boy (bb).

    python run.py models/digits.json                    # 5 epochs, batches of 32
    python run.py models/big.json --data mnist --epochs 20
    python run.py models/big.json --plan                # say what would happen, start nothing

It times a few training steps on this machine and multiplies up. If the whole run is likely to take
longer than --target-min (5 minutes) here, it writes a jobs file and hands the run to `bb launch`,
which shows the instance and its price and asks before renting. Otherwise it trains here.
Either way the result lands in runs/<name>/weights.json, which the editor's "Import weights" loads.
"""
import argparse
import math
import os
import re
import shlex
import shutil
import subprocess
import sys
import time

import trainer

ROOT = os.path.dirname(os.path.abspath(__file__))
LOCAL_MARGIN = 1.3        # a real run is slower than the timed steps (held-out checks, logging); measured at 1.3x on a 5.8M-connection model
GPU_FLOPS = 3e12          # what a single rented card gets through on this kind of work; a rough figure, not a measurement
GPU_STEP_OVERHEAD = 4e-4  # seconds per level per step that no card speeds up


def git(*args, check=True):
    r = subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f"git {' '.join(args)} failed:\n{r.stderr.strip()}")
    return r.stdout.strip()


def minutes(s):
    return f"{s:.0f} s" if s < 90 else f"{s / 60:.1f} min" if s < 5400 else f"{s / 3600:.1f} h"


def publish(paths, yes):
    """The instance clones this repo from GitHub, so the files the job reads must be committed and pushed."""
    changed = [p for p in paths if git("status", "--porcelain", "--", p)]
    if changed:
        print("not yet on GitHub (the instance needs them): " + ", ".join(changed))
        if not yes and input("commit and push them to the public repo? [y/N] ").strip().lower() != "y":
            sys.exit("nothing pushed, nothing rented")
        git("add", "--", *changed)
        git("commit", "-m", "Add " + ", ".join(os.path.basename(p) for p in changed), "--", *changed)
    if not git("branch", "-r", "--contains", "HEAD", check=False):
        if not changed and not yes and input("the current commit is not pushed; push it? [y/N] ").strip().lower() != "y":
            sys.exit("nothing pushed, nothing rented")
        git("push")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("model")
    ap.add_argument("--data", default=None, help="digits | mnist | hf:<dataset repo> | folder in this repo; default: what the model was built on")
    ap.add_argument("--samples", type=int, default=None, help="how many samples the data has, when that cannot be counted from here (hf:)")
    ap.add_argument("--epochs", type=float, default=5)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=None)
    ap.add_argument("--val", type=float, default=0.1)
    ap.add_argument("--target-min", type=float, default=5, help="rent a GPU when this machine would take longer than this")
    ap.add_argument("--where", choices=["auto", "local", "remote"], default="auto")
    ap.add_argument("--name", default=None, help="run name; default: the model's file name and the time")
    ap.add_argument("--plan", action="store_true", help="print the decision (and bb's dry run) and stop")
    ap.add_argument("--wait", action="store_true", help="after renting: wait for the job and download its results")
    ap.add_argument("--yes-push", action="store_true", help="commit and push the model file without asking")
    a = ap.parse_args()

    path = os.path.relpath(os.path.abspath(a.model), ROOT)
    if path.startswith(".."):
        sys.exit("the model file must be inside this project (put it in models/)")
    model = trainer.load_model(os.path.join(ROOT, path))
    spec = a.data or trainer.default_data(model)
    if not spec:
        sys.exit("this model was built on a folder loaded in the browser; say where the data is with --data")
    n = a.samples or trainer.data_size(spec)
    if n is None:
        sys.exit(f"cannot count the samples in {spec} from here; pass --samples N")
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "-", os.path.splitext(os.path.basename(path))[0]).strip("-") or "model"
    name = a.name or f"{stem}-{time.strftime('%m%d-%H%M%S')}"
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
        sys.exit("--name may only use letters, digits, _ . and -")

    device = trainer.pick_device()
    per_step, net = trainer.bench(model, a.batch, device)
    steps = max(1, round(a.epochs * math.ceil(n * (1 - a.val) / a.batch)))
    local_s = per_step * steps * LOCAL_MARGIN
    gpu_s = steps * (GPU_STEP_OVERHEAD * net.n_levels + 6 * net.n_edges * a.batch / GPU_FLOPS)
    remote = a.where == "remote" or (a.where == "auto" and local_s > a.target_min * 60)
    print(f"model   {path}: {net.n_edges:,} connections in {net.n_levels} levels")
    print(f"data    {spec}: {n:,} samples, {steps:,} steps of {a.batch}")
    print(f"here    {device}: {per_step * 1000:.2f} ms a step measured, so about {minutes(local_s)}")
    why = "forced with --where" if a.where != "auto" else f"{'over' if remote else 'within'} the {a.target_min:g} min target"
    print(f"choice  {'rent a GPU through bb' if remote else 'train on this machine'} ({why})")

    args = [path, "--out", f"runs/{name}", "--epochs", f"{a.epochs:g}", "--batch", str(a.batch), "--val", f"{a.val:g}"]
    args += (["--data", spec] if a.data else []) + (["--lr", f"{a.lr:g}"] if a.lr is not None else [])
    done = f"result: runs/{name}/weights.json  (in the editor: select the frame, Import weights)"

    if not remote:
        if a.plan:
            return
        sys.exit(subprocess.run([sys.executable, os.path.join(ROOT, "trainer.py"), *args], cwd=ROOT).returncode or print(done))

    if not path.endswith(".gz") and os.path.getsize(os.path.join(ROOT, path)) > 20e6:     # GitHub refuses files over 100 MB
        import gzip
        with open(os.path.join(ROOT, path), "rb") as src, gzip.open(os.path.join(ROOT, path + ".gz"), "wb", compresslevel=6) as dst:
            shutil.copyfileobj(src, dst)
        path += ".gz"
        args[0] = path
        print(f"packed  {path} (the instance gets the compressed copy)")
    size = os.path.getsize(os.path.join(ROOT, path)) / 1e6
    if size > 95:
        sys.exit(f"{path} is {size:.0f} MB and GitHub refuses files over 100 MB, so the instance could not get it. "
                 "Use fewer connections, or build the model on the instance with make_model.py in the job command")
    need = [path]
    if os.path.isdir(os.path.join(ROOT, spec)):
        if not git("ls-files", "--", spec):
            sys.exit(f"{spec} is not committed, so the instance would not have it. Commit it, or put it in a Hugging Face dataset repo and pass --data hf:<repo>")
    elif spec not in ("digits", "mnist") and not spec.startswith("hf:"):
        sys.exit(f"{spec} is outside this project, so the instance cannot read it")
    hours = max(0.5, math.ceil(gpu_s * 4 / 360) / 10)          # a stuck or slow job stops here instead of running up a bill
    print(f"gpu     about {minutes(gpu_s)} of training by a rough rule of thumb, plus 5 to 10 min for the instance to start; "
          f"stopped after {hours:g} h whatever happens")
    job = f"{name}: python trainer.py {' '.join(shlex.quote(x) for x in args)} --max-minutes {hours * 48:g}"
    os.makedirs(os.path.join(ROOT, "jobs"), exist_ok=True)
    jobs = os.path.join("jobs", name + ".txt")
    open(os.path.join(ROOT, jobs), "w").write(job + "\n")
    print(f"job     {jobs}: {job}")
    if not shutil.which("bb"):
        sys.exit("bb is not on this machine's PATH; install box-boy (github.com/GuerdonL/box-boy), run `bb doctor`, then run this again")
    if a.plan and git("status", "--porcelain", "--", *need):
        print(f"note    {path} is not on GitHub yet; a real run commits and pushes it first (it asks)")
    elif not a.plan:
        publish(need, a.yes_push)
    launch = ["bb", "launch", jobs, "--max-hours", f"{hours:g}"]
    if subprocess.run(launch + ["--dry-run"], cwd=ROOT).returncode != 0 or a.plan:
        return
    if subprocess.run(launch, cwd=ROOT).returncode != 0:        # bb asks "rent these?" itself
        sys.exit(1)
    if a.wait:
        if subprocess.run(["bb", "wait", name, "--every", "30"], cwd=ROOT).returncode == 0:
            subprocess.run(["bb", "collect", name], cwd=ROOT)
            print(done)
    else:
        print(f"then: bb wait {name} && bb collect {name}\n{done}")


if __name__ == "__main__":
    main()
