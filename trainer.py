"""Train a model exported from the Perceptron Editor, on whatever device is here (CUDA, Apple MPS or CPU).

    python trainer.py models/digits.json --out runs/digits-1 --epochs 5 --batch 32

The model file is what the editor's "Export model" button saves: one evaluation frame, the dataset
settings in front of it and the cost function behind it. The frame's rule is the editor's:

    neuron output a = f(w * (x + sum over incoming connections of c * a_source))

where w is the neuron's own weight, c a connection weight and x the input value (input neurons only).
Input neurons, and output neurons when "Linear output layer" is on, skip f. Both w and c are trained.

Writes to --out: weights.json (import it in the editor), metrics.json, log.csv, and ckpt.pkl (resume
state; a rerun with the same --out continues from it).
"""
import argparse
import csv
import gzip
import json
import math
import os
import re
import struct
import sys
import time
import urllib.request

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
MNIST_URL = "https://ossci-datasets.s3.amazonaws.com/mnist/"
MNIST_FILES = ["train-images-idx3-ubyte.gz", "train-labels-idx1-ubyte.gz", "t10k-images-idx3-ubyte.gz", "t10k-labels-idx1-ubyte.gz"]
KNOWN_SIZES = {"digits": 1797, "mnist": 70000}
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp")


# ---------------------------------------------------------------- model ---
def load_model(path):
    m = json.load(gzip.open(path, "rt") if path.endswith(".gz") else open(path))
    if m.get("format") != "perceptron-editor/model":
        sys.exit(f"{path} is not a model exported from the Perceptron Editor")
    return m


def pick_device(name="auto"):
    if name != "auto":
        return torch.device(name)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class Frame(torch.nn.Module):
    """One evaluation frame. Neurons are sorted into levels (the longest chain of connections behind each);
    a level's connections are one matrix when they are dense enough, else a list of single connections."""

    DENSE_CELLS = 1 << 22      # a level whose full matrix has at most this many cells is always stored as a matrix

    def __init__(self, frame, dtype=torch.float32):
        super().__init__()
        ids = np.asarray(frame["ns"]["id"], dtype=np.int64)
        nw = np.asarray(frame["ns"]["w"], dtype=np.float64)
        es, ed, ew = (np.asarray(frame["edges"][k]) for k in ("s", "d", "w"))
        es, ed, ew = es.astype(np.int64), ed.astype(np.int64), ew.astype(np.float64)
        vin, vout = np.asarray(frame["in"], dtype=np.int64), np.asarray(frame["out"], dtype=np.int64)
        self.act, self.frame, self.dtype = frame.get("act", "linear"), frame, dtype
        top = int(max(ids.max(), es.max() if len(es) else 0, ed.max() if len(ed) else 0)) + 1
        row = np.full(top, -1, dtype=np.int64)
        row[ids] = np.arange(len(ids))
        s, d = row[es], row[ed]
        live = (s >= 0) & (d >= 0)                       # a connection from or to a deleted neuron does nothing
        e_orig = np.nonzero(live)[0]
        s, d = s[live], d[live]
        n = len(ids)
        # keep only what the output depends on, like the editor does
        need = np.zeros(n, dtype=bool)
        need[row[vout]] = True
        order = np.argsort(d, kind="stable")
        starts = np.searchsorted(d[order], np.arange(n + 1))
        stack = list(row[vout])
        while stack:
            k = stack.pop()
            for src in s[order[starts[k]:starts[k + 1]]]:
                if not need[src]:
                    need[src] = True
                    stack.append(src)
        keep = need[s] & need[d]
        s, d, e_orig = s[keep], d[keep], e_orig[keep]
        # levels: 0 for a neuron with nothing coming in, else one more than its deepest source
        level = np.zeros(n, dtype=np.int64)
        indeg = np.bincount(d, minlength=n)
        o2 = np.argsort(s, kind="stable")
        st2 = np.searchsorted(s[o2], np.arange(n + 1))
        ready = [k for k in np.nonzero(need)[0] if indeg[k] == 0]
        done = 0
        while ready:
            k = ready.pop()
            done += 1
            for dst in d[o2[st2[k]:st2[k + 1]]]:
                level[dst] = max(level[dst], level[k] + 1)
                indeg[dst] -= 1
                if indeg[dst] == 0:
                    ready.append(dst)
        if done != int(need.sum()):
            sys.exit("the connections form a loop")
        nodes = np.nonzero(need)[0]
        nodes = nodes[np.argsort(level[nodes], kind="stable")]
        pos = np.full(n, -1, dtype=np.int64)
        pos[nodes] = np.arange(len(nodes))
        lv = level[nodes]
        self.n_levels = int(lv.max()) + 1
        bounds = np.searchsorted(lv, np.arange(self.n_levels + 1))
        in_x = np.full(n, -1, dtype=np.int64)
        in_x[row[vin]] = np.arange(len(vin))
        is_out = np.zeros(n, dtype=bool)
        is_out[row[vout]] = True
        self.n_in, self.n_out = len(vin), len(vout)
        self.out_pos = torch.as_tensor(pos[row[vout]])
        self.node_rows, self.bounds, self.plan, self.n_edges = nodes, bounds, [], int(len(s))
        self.nw = torch.nn.ParameterList()
        self.mats = torch.nn.ParameterList()
        e_level = level[d]
        for L in range(self.n_levels):
            lo, hi = bounds[L], bounds[L + 1]
            mine = nodes[lo:hi]
            self.nw.append(torch.nn.Parameter(torch.as_tensor(nw[mine], dtype=dtype)))
            xi = in_x[mine]
            lin = (xi >= 0) | (is_out[mine] if frame.get("linOut") else False)
            p = {"x_local": None, "lin": None if lin.all() or not lin.any() else self._buf(f"lin{L}", torch.as_tensor(lin)),
                 "all_lin": bool(lin.all()), "kind": None}
            if (xi >= 0).any():
                p["x_local"] = self._buf(f"xl{L}", torch.as_tensor(np.nonzero(xi >= 0)[0]))
                p["x_src"] = self._buf(f"xs{L}", torch.as_tensor(xi[xi >= 0]))
                p["x_whole"] = bool((xi >= 0).all() and (xi == np.arange(len(xi))).all())
            sel = np.nonzero(e_level == L)[0] if L else np.zeros(0, dtype=np.int64)
            if len(sel):
                sp, dl = pos[s[sel]], pos[d[sel]] - lo
                uniq, col = np.unique(sp, return_inverse=True)
                cells = (hi - lo) * len(uniq)
                p["e_orig"] = e_orig[sel]
                span = bool(uniq[-1] - uniq[0] + 1 == len(uniq))
                p["src"] = (int(uniq[0]), int(uniq[-1]) + 1) if span else self._buf(f"src{L}", torch.as_tensor(uniq))
                if cells <= self.DENSE_CELLS or len(sel) >= 0.2 * cells:
                    W = torch.zeros(hi - lo, len(uniq), dtype=dtype)
                    W[torch.as_tensor(dl), torch.as_tensor(col)] = torch.as_tensor(ew[e_orig[sel]], dtype=dtype)
                    p["kind"], p["dl"], p["col"] = "dense", torch.as_tensor(dl), torch.as_tensor(col)
                    if len(sel) < cells:
                        mask = torch.zeros(hi - lo, len(uniq), dtype=dtype)
                        mask[p["dl"], p["col"]] = 1
                        p["mask"] = self._buf(f"mask{L}", mask)
                    self.mats.append(torch.nn.Parameter(W))
                else:
                    p["kind"] = "list"
                    p["dl"], p["col"] = self._buf(f"dl{L}", torch.as_tensor(dl)), self._buf(f"col{L}", torch.as_tensor(col))
                    self.mats.append(torch.nn.Parameter(torch.as_tensor(ew[e_orig[sel]], dtype=dtype)))
            else:
                self.mats.append(torch.nn.Parameter(torch.zeros(0, dtype=dtype), requires_grad=False))
            self.plan.append(p)

    def _buf(self, name, t):
        self.register_buffer(name, t, persistent=False)
        return name

    def _f(self, z):
        a = self.act
        return (torch.relu(z) if a == "relu" else torch.sigmoid(z) if a == "sigmoid" else torch.tanh(z) if a == "tanh"
                else (z > 0).to(z.dtype) if a == "step" else z)

    def forward(self, x):
        acts, B = None, x.shape[0]
        for L, p in enumerate(self.plan):
            n = int(self.bounds[L + 1] - self.bounds[L])
            if p["kind"]:
                src = p["src"]
                a_src = acts[:, src[0]:src[1]] if isinstance(src, tuple) else acts.index_select(1, getattr(self, src))
                if p["kind"] == "dense":
                    W = self.mats[L] * getattr(self, p["mask"]) if "mask" in p else self.mats[L]
                    total = a_src @ W.t()
                else:
                    total = torch.zeros(B, n, dtype=x.dtype, device=x.device).index_add(
                        1, getattr(self, p["dl"]), a_src.index_select(1, getattr(self, p["col"])) * self.mats[L])
            else:
                total = None
            if p["x_local"]:
                if p["x_whole"] and total is None:
                    total = x
                else:
                    if total is None:
                        total = torch.zeros(B, n, dtype=x.dtype, device=x.device)
                    total = total.index_add(1, getattr(self, p["x_local"]), x.index_select(1, getattr(self, p["x_src"])))
            if total is None:
                total = torch.zeros(B, n, dtype=x.dtype, device=x.device)
            z = total * self.nw[L]
            a = z if p["all_lin"] else self._f(z) if p["lin"] is None else torch.where(getattr(self, p["lin"]), z, self._f(z))
            acts = a if acts is None else torch.cat([acts, a], dim=1)
        return acts.index_select(1, self.out_pos.to(x.device))

    def weights(self):
        """The frame's weights in the editor's own numbering; anything the output does not depend on is unchanged."""
        nw = np.asarray(self.frame["ns"]["w"], dtype=np.float64).copy()
        ew = np.asarray(self.frame["edges"]["w"], dtype=np.float64).copy()
        for L, p in enumerate(self.plan):
            nw[self.node_rows[self.bounds[L]:self.bounds[L + 1]]] = self.nw[L].detach().double().cpu().numpy()
            if p["kind"] == "dense":
                ew[p["e_orig"]] = self.mats[L].detach()[p["dl"], p["col"]].double().cpu().numpy()
            elif p["kind"] == "list":
                ew[p["e_orig"]] = self.mats[L].detach().double().cpu().numpy()
        return nw, ew


def loss_fn(kind, pred, truth_idx, n_out):
    """Per-sample loss as the editor's Cost function computes it, averaged over the batch."""
    if kind == "ce":
        return torch.nn.functional.cross_entropy(pred, truth_idx)
    onehot = torch.nn.functional.one_hot(truth_idx, n_out).to(pred.dtype)
    return ((pred - onehot) ** 2).sum(dim=1).mean()


# ----------------------------------------------------------------- data ---
def natural(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def fold_order(h, w, mode):
    """The Linearize block's read-out order, as indices into the row-major image."""
    o, at = [], lambda r, c: o.append(r * w + c)
    if mode == "cols":
        [at(r, c) for c in range(w) for r in range(h)]
    elif mode == "snake":
        [at(r, w - 1 - c if r % 2 else c) for r in range(h) for c in range(w)]
    elif mode == "snakec":
        [at(h - 1 - r if c % 2 else r, c) for c in range(w) for r in range(h)]
    elif mode == "spiral":
        t, l, b, rt = 0, 0, h - 1, w - 1
        while t <= b and l <= rt:
            [at(t, c) for c in range(l, rt + 1)]
            [at(r, rt) for r in range(t + 1, b + 1)]
            if t < b:
                [at(b, c) for c in range(rt - 1, l - 1, -1)]
            if l < rt:
                [at(r, l) for r in range(b - 1, t, -1)]
            t, l, b, rt = t + 1, l + 1, b - 1, rt - 1
    elif mode == "zigzag":
        for dg in range(h + w - 1):
            cells = [(r, dg - r) for r in range(max(0, dg - w + 1), min(h - 1, dg) + 1)]
            [at(r, c) for r, c in (cells[::-1] if dg % 2 == 0 else cells)]
    else:
        o = list(range(h * w))
    return o


def folder_files(path):
    out = []
    for root, _, files in os.walk(path):
        out += [os.path.join(root, f) for f in files if f.lower().endswith(IMAGE_EXT)]
    return sorted(out, key=lambda p: natural(os.path.relpath(p, path)))


def load_folder(path):
    """Same rules as the editor's Dataset block: greyscale, every file the size of the first,
    label = the subfolder, else the file name's text before "_"."""
    from PIL import Image
    files = folder_files(path)
    if not files:
        sys.exit(f"no image files under {path}")
    pix, labels, size = [], [], None
    for f in files:
        im = np.asarray(Image.open(f).convert("RGBA"), dtype=np.float64)
        if size is None:
            size = im.shape[:2]
        if im.shape[:2] != size:
            continue
        g = np.floor((0.299 * im[..., 0] + 0.587 * im[..., 1] + 0.114 * im[..., 2]) * im[..., 3] / 255 + 0.5)
        pix.append(g.astype(np.uint8).reshape(-1))
        rel, name = os.path.relpath(f, path).split(os.sep), os.path.basename(f)
        labels.append(rel[-2] if len(rel) > 1 else name.split("_")[0] if "_" in name else "")
    return np.stack(pix), labels, size[1], size[0], 255


def load_mnist(cache):
    os.makedirs(cache, exist_ok=True)
    arrs = []
    for f in MNIST_FILES:
        p = os.path.join(cache, f)
        if not os.path.exists(p):
            print(f"downloading {f}", flush=True)
            urllib.request.urlretrieve(MNIST_URL + f, p + ".part")
            os.replace(p + ".part", p)
        raw = gzip.open(p, "rb").read()
        dims = struct.unpack(">" + "I" * raw[3], raw[4:4 + 4 * raw[3]])
        arrs.append(np.frombuffer(raw, dtype=np.uint8, offset=4 + 4 * raw[3]).reshape(dims))
    pix = np.concatenate([arrs[0], arrs[2]]).reshape(-1, 784)
    return pix, [str(v) for v in np.concatenate([arrs[1], arrs[3]])], 28, 28, 255


def load_data(spec):
    """spec: digits | mnist | kaggle:<owner>/<name> | hf:<dataset repo of image folders> | a folder of images. -> pixels [n, w*h] uint8, labels, w, h, max"""
    if spec == "digits":
        j = json.load(open(os.path.join(HERE, "data", "digits.json")))
        pix = np.array([int(c, 17) for c in j["pixels"]], dtype=np.uint8).reshape(j["n"], -1)
        return pix, list(j["labels"]), j["w"], j["h"], j["max"]
    if spec == "mnist":
        return load_mnist(os.path.join(HERE, "data", "cache", "mnist"))
    if spec.startswith("kaggle:"):
        import kaggle_data
        return kaggle_data.load(spec[7:])
    if spec.startswith("hf:"):
        from huggingface_hub import snapshot_download
        return load_folder(snapshot_download(spec[3:], repo_type="dataset"))
    if os.path.isdir(spec):
        return load_folder(spec)
    sys.exit(f"dataset {spec!r}: expected digits, mnist, kaggle:<owner>/<name>, hf:<dataset repo> or a folder of images")


def data_size(spec):
    """How many samples, without loading them when that can be avoided (None if it cannot be known cheaply)."""
    if spec in KNOWN_SIZES:
        return KNOWN_SIZES[spec]
    if spec.startswith("kaggle:"):
        import kaggle_data
        i = kaggle_data.info(spec[7:])
        return i["n"] if i else None
    return len(folder_files(spec)) if os.path.isdir(spec) else None


def default_data(model):
    d = model["data"]
    if d.get("source") == "kaggle" and d.get("ref"):
        return "kaggle:" + d["ref"]
    return d.get("source") if d.get("source") in ("digits", "mnist") else None


def tensors(model, spec, dtype):
    """Images as the frame receives them (Dataset setting, then Linearize order) and labels as class numbers."""
    pix, labels, w, h, mx = load_data(spec)
    d = model["data"]
    if (w, h) != (d["w"], d["h"]):
        sys.exit(f"the model was built for {d['w']}x{d['h']} images but {spec} has {w}x{h}")
    classes = {c: i for i, c in enumerate(d["classes"])}
    keep = [i for i, l in enumerate(labels) if l in classes]
    if not keep:
        sys.exit(f"none of the labels in {spec} are among the model's classes {d['classes'][:12]}")
    if len(keep) < len(labels):
        print(f"{len(labels) - len(keep)} samples skipped: label not among the model's classes")
    pix = pix[keep][:, fold_order(h, w, model.get("fold") or "rows")]
    x = torch.as_tensor(pix).to(dtype)
    x = x / mx if d.get("as") == "float" else (x >= mx / 2).to(dtype) if d.get("as") == "bool" else x
    return x, torch.as_tensor([classes[labels[i]] for i in keep])


# ------------------------------------------------------------- training ---
def bench(model, batch, device, seconds=3.0, dtype=torch.float32):
    """Seconds per training step on this device, measured on random inputs of the model's size."""
    net = Frame(model["frame"], dtype).to(device)
    opt = torch.optim.SGD([p for p in net.parameters() if p.requires_grad], lr=0.0)
    x = torch.rand(batch, net.n_in, dtype=dtype, device=device)
    y = torch.randint(0, net.n_out, (batch,), device=device)

    def step():
        opt.zero_grad(set_to_none=True)
        loss_fn(model.get("loss", "se"), net(x), y, net.n_out).backward()
        opt.step()
    def settle():
        if device.type == "cuda":
            torch.cuda.synchronize()
        elif device.type == "mps":
            torch.mps.synchronize()
    step(); step(); settle()
    t0, n = time.perf_counter(), 0
    while n < 3 or (time.perf_counter() - t0 < seconds and n < 2000):
        step(); n += 1
    settle()
    return (time.perf_counter() - t0) / n, net


def atomic(path, write):
    write(path + ".tmp")
    os.replace(path + ".tmp", path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("model")
    ap.add_argument("--out", required=True, help="folder for the results, e.g. runs/<name>")
    ap.add_argument("--data", default=None, help="digits | mnist | kaggle:<owner>/<name> | hf:<dataset repo> | folder; default: what the model was built on")
    ap.add_argument("--epochs", type=float, default=5)
    ap.add_argument("--batch", type=int, default=32, help="1 with --no-shuffle reproduces the editor's own training exactly")
    ap.add_argument("--lr", type=float, default=None, help="default: the frame's rate in the editor")
    ap.add_argument("--val", type=float, default=0.1, help="share of the samples held out and never trained on")
    ap.add_argument("--no-shuffle", action="store_true")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--device", default="auto")
    ap.add_argument("--double", action="store_true", help="64-bit floats, like the editor")
    ap.add_argument("--max-minutes", type=float, default=None, help="stop cleanly and save after this long")
    ap.add_argument("--ckpt-s", type=float, default=120)
    a = ap.parse_args()

    model = load_model(a.model)
    spec = a.data or default_data(model)
    if not spec:
        sys.exit("this model was built on a folder loaded in the browser; say where the data is with --data")
    dtype = torch.float64 if a.double else torch.float32
    device = pick_device(a.device)
    os.makedirs(a.out, exist_ok=True)
    torch.manual_seed(a.seed)
    net = Frame(model["frame"], dtype)
    x, y = tensors(model, spec, dtype)
    if x.shape[1] != net.n_in:
        sys.exit(f"the frame's input vector has {net.n_in} neurons but each sample has {x.shape[1]} values")
    if len(model["data"]["classes"]) != net.n_out:
        sys.exit(f"the frame outputs {net.n_out} values but the data has {len(model['data']['classes'])} classes")
    n = len(x)
    n_val = int(n * a.val) if a.val > 0 else 0
    perm = torch.randperm(n, generator=torch.Generator().manual_seed(a.seed)) if n_val else torch.arange(n)
    xv, yv = x[perm[:n_val]].to(device), y[perm[:n_val]].to(device)
    xt, yt = x[perm[n_val:]].to(device), y[perm[n_val:]].to(device)
    net.to(device)
    lr = a.lr if a.lr is not None else float(model["frame"].get("lr") or 0.01)
    opt = torch.optim.SGD([p for p in net.parameters() if p.requires_grad], lr=lr)
    kind, nt = model.get("loss", "se"), len(xt)
    per_epoch = math.ceil(nt / a.batch)
    total = max(1, round(a.epochs * per_epoch))
    step, ck = 0, os.path.join(a.out, "ckpt.pkl")
    gen = torch.Generator().manual_seed(a.seed + 1)
    if os.path.exists(ck):
        st = torch.load(ck, map_location=device, weights_only=False)
        net.load_state_dict(st["net"]); step = st["step"]; gen.set_state(st["gen"])
        print(f"resuming at step {step}")
    print(f"{net.n_edges:,} connections in {net.n_levels} levels; {nt:,} training samples, {n_val:,} held out; "
          f"{total:,} steps of {a.batch} on {device}; rate {lr}", flush=True)

    def evaluate(xs, ys):
        if not len(xs):
            return None, None
        with torch.no_grad():
            tot, hit = 0.0, 0
            for i in range(0, len(xs), 4096):
                p = net(xs[i:i + 4096])
                tot += loss_fn(kind, p, ys[i:i + 4096], net.n_out).item() * len(p)
                hit += (p.argmax(1) == ys[i:i + 4096]).sum().item()
        return tot / len(xs), hit / len(xs)

    def save_ckpt():
        atomic(ck, lambda p: torch.save({"net": net.state_dict(), "step": step, "gen": gen.get_state()}, p))

    def order(epoch):          # the same order on a resumed run: reseeded per epoch
        if a.no_shuffle:
            return torch.arange(nt)
        return torch.randperm(nt, generator=torch.Generator().manual_seed(a.seed * 100003 + epoch))

    log_path = os.path.join(a.out, "log.csv")
    new_log = not os.path.exists(log_path) or step == 0
    log = open(log_path, "w" if new_log else "a", newline="")
    wr = csv.writer(log)
    if new_log:
        wr.writerow(["step", "epoch", "seconds", "train_loss", "val_loss", "val_accuracy"])
    t0 = last_ck = last_log = time.time()
    run, seen, stopped, epoch, idx = 0.0, 0, None, -1, None
    while step < total:
        e, k = divmod(step, per_epoch)
        if e != epoch:
            epoch, idx = e, order(e).to(device)
        b = idx[k * a.batch:(k + 1) * a.batch]
        opt.zero_grad(set_to_none=True)
        loss = loss_fn(kind, net(xt[b]), yt[b], net.n_out)
        loss.backward()
        opt.step()
        step += 1
        if step % 20 == 0 or step == total or a.batch == 1:
            v = loss.item()
            if not math.isfinite(v):
                sys.exit("a weight grew without limit; lower --lr or feed inputs between 0 and 1")
            run, seen = run + v, seen + 1
        now = time.time()
        if now - last_log > 15 or step == total:
            vl, va = evaluate(xv, yv)
            wr.writerow([step, round(step / per_epoch, 3), round(now - t0, 1), run / max(seen, 1), vl, va]); log.flush()
            print(f"step {step:,}/{total:,}  loss {run / max(seen, 1):.4f}" + (f"  held-out accuracy {va:.1%}" if va is not None else ""), flush=True)
            run, seen, last_log = 0.0, 0, now
        if now - last_ck > a.ckpt_s:
            save_ckpt(); last_ck = now
        if a.max_minutes and now - t0 > a.max_minutes * 60:
            stopped = f"stopped at the {a.max_minutes} minute limit"
            print(stopped)
            break
    save_ckpt()
    tl, ta = evaluate(xt, yt)
    vl, va = evaluate(xv, yv)
    nw, ew = net.weights()
    f = model["frame"]
    out = {"format": "perceptron-editor/weights", "v": 1, "name": model.get("name"), "steps": step,
           "ns": {"id": f["ns"]["id"], "w": [float(v) for v in nw]},
           "edges": {"s": f["edges"]["s"], "d": f["edges"]["d"], "w": [float(v) for v in ew]}}
    atomic(os.path.join(a.out, "weights.json"), lambda p: json.dump(out, open(p, "w"), separators=(",", ":")))
    metrics = {"steps": step, "of": total, "seconds": round(time.time() - t0, 1), "device": str(device), "batch": a.batch,
               "rate": lr, "train_loss": tl, "train_accuracy": ta, "val_loss": vl, "val_accuracy": va, "note": stopped}
    atomic(os.path.join(a.out, "metrics.json"), lambda p: json.dump(metrics, open(p, "w"), indent=1))
    print(json.dumps(metrics))


if __name__ == "__main__":
    main()
