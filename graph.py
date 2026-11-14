"""Train a whole graph exported from the Perceptron Editor: everything behind one Cost function.

The file ("perceptron-editor/graph") lists the blocks with their settings and weights, the wires between them, and which
blocks to train. This module computes exactly what the editor computes for each block, on batches, and lets PyTorch work
out the gradients. Blocks understood: Dataset (images or text), Text buffer, Pixel array, Distribution, Random sampler,
Tokenizer (characters), Linearize, Attention, Evaluation frame, Cost function.

trainer.py calls train() when it is handed such a file; the options are trainer.py's.
"""
import base64
import csv
import json
import math
import os
import sys
import time

import numpy as np
import torch

import trainer

TOKV = 97                    # the Tokenizer's one-hot alphabet: new line, 95 printable ASCII characters, anything else
SAMPLER_PASS = 10_000        # with no Dataset block there is no "once through the data"; this many draws count as one pass


def utf16(text):
    """Text as the editor's JavaScript sees it: UTF-16 code units."""
    return np.frombuffer(text.encode("utf-16-le", "surrogatepass"), dtype="<u2").astype(np.int64)


class Graph(torch.nn.Module):
    def __init__(self, g, dtype=torch.float32):
        super().__init__()
        self.g, self.dtype = g, dtype
        self.by = {b["id"]: b for b in g["blocks"]}
        self.ins = {}
        for w in g["wires"]:
            self.ins.setdefault(w["to"], {})[w["tp"]] = (w["from"], w["fp"])
        order, seen = [], set()

        def visit(i, path=()):
            if i in seen:
                return
            if i in path:
                sys.exit("the wires form a loop")
            for src, _ in self.ins.get(i, {}).values():
                visit(src, path + (i,))
            seen.add(i)
            order.append(i)
        visit(g["cost"])
        self.order = order
        self.frames = torch.nn.ModuleDict()
        self.attn = torch.nn.ParameterDict()
        for i in order:
            b = self.by[i]
            if b["type"] == "perc":
                self.frames[str(i)] = trainer.Frame(b, dtype)
            elif b["type"] == "attn":
                for k, rows, cols in (("wq", b["dq"], b["dk"]), ("wk", b["dq"], b["dk"]), ("wv", b["d"], b["d"])):
                    self.attn[f"{i}_{k}"] = torch.nn.Parameter(torch.as_tensor(b[k], dtype=dtype).view(rows, cols))
            elif b["type"] == "mlp":                    # rows of neurons, each fully connected to the next: one sizes[l] x sizes[l+1] matrix a layer
                for l, w in enumerate(b["w"]):
                    m = np.frombuffer(base64.b64decode(w), dtype="<f4").astype(np.float64).reshape(b["sizes"][l], b["sizes"][l + 1])
                    self.attn[f"{i}_m{l}"] = torch.nn.Parameter(torch.as_tensor(m, dtype=dtype))
            elif b["type"] not in ("data", "text", "pixels", "dist", "samp", "tok", "lin", "read"):
                sys.exit(f"{b.get('name', i)}: {b['type']} blocks cannot be trained outside the browser yet")
        self.train_ids = [i for i in g["train"] if i in self.by]
        self._lin = {}

    def groups(self, lr_scale=1.0, lr=None):
        """Each trained block keeps the rate it has in the editor (or all get `lr`)."""
        out = []
        for i in self.train_ids:
            b = self.by[i]
            ps = ([p for p in self.frames[str(i)].parameters() if p.requires_grad] if b["type"] == "perc" else
                  [self.attn[f"{i}_m{l}"] for l in range(len(b["w"]))] if b["type"] == "mlp" else [self.attn[f"{i}_{k}"] for k in ("wq", "wk", "wv")])
            out.append({"params": ps, "lr": lr if lr is not None else float(b.get("lr") or 0.01) * lr_scale})
        return out

    def _lin_index(self, b, shape):
        key = (b["id"], tuple(shape))
        if key not in self._lin:
            rev = list(b.get("rev") or [])
            r = lambda k: bool(rev[k]) if k < len(rev) else False
            w = shape[-1]
            h = shape[-2] if len(shape) > 1 else 1
            lead = list(shape[:-2])
            ordr = trainer.fold_order(h, w, b.get("mode") or "rows", (r(0), r(1)))
            idx = []
            for k in range(int(np.prod(lead)) if lead else 1):
                src, rem, mul = 0, k, 1
                for a in range(len(lead) - 1, -1, -1):
                    dgt = rem % lead[a]
                    rem //= lead[a]
                    src += (lead[a] - 1 - dgt if r(len(shape) - 1 - a) else dgt) * mul
                    mul *= lead[a]
                idx += [src * h * w + o for o in ordr]
            self._lin[key] = torch.as_tensor(idx)
        return self._lin[key]

    def forward(self, feed, B, device, gen=None):
        """feed: {data block id: {"image", "label", "text"}}. Returns the per-sample loss, the prediction and the ground truth."""
        out, dt = {}, self.dtype
        get = lambda i, port=0: out[self.ins[i][port][0]][self.ins[i][port][1]] if port in self.ins.get(i, {}) else None
        for i in self.order:
            b, t = self.by[i], self.by[i]["type"]
            if t == "data":
                f = feed[i]
                out[i] = [f.get("image"), f.get("label"), f.get("text")]
            elif t == "text":
                out[i] = [torch.as_tensor(utf16(b["text"]), device=device).unsqueeze(0).expand(B, -1)]
            elif t == "pixels":
                out[i] = [torch.as_tensor(b["px"], dtype=dt, device=device).view(1, b["h"], b["w"]).expand(B, -1, -1)]
            elif t == "dist":
                out[i] = [b]
            elif t == "samp":
                d = get(i)
                u = torch.rand(B, b["n"], dtype=dt, device=device, generator=gen) if d["kind"] == "uniform" else torch.randn(B, b["n"], dtype=dt, device=device, generator=gen)
                out[i] = [d["a"] + (d["b"] - d["a"]) * u if d["kind"] == "uniform" else d["a"] + d["b"] * u]
            elif t == "tok":
                u, n = get(i), b["n"]
                def take(start):
                    part = u[:, start:start + n]
                    pad = n - part.shape[1]
                    real = torch.ones(part.shape, dtype=torch.bool, device=device)
                    if pad > 0:
                        part = torch.cat([part, torch.zeros(B, pad, dtype=part.dtype, device=device)], 1)
                        real = torch.cat([real, torch.zeros(B, pad, dtype=torch.bool, device=device)], 1)
                    if b["fmt"] != "onehot":
                        return part.to(dt)
                    k = torch.where(part == 10, torch.zeros_like(part), torch.where((part >= 32) & (part <= 126), part - 31, torch.full_like(part, TOKV - 1)))
                    return torch.nn.functional.one_hot(k, TOKV).to(dt) * real.unsqueeze(-1)
                nxt = take(n)[:, 0]                              # the one token after the context: [B, 97] one-hot, or [B] as a number
                out[i] = [take(0), take(1), nxt if b["fmt"] == "onehot" else nxt.unsqueeze(1)]
            elif t == "lin":
                x = get(i)
                out[i] = [x.reshape(B, -1).index_select(1, self._lin_index(b, x.shape[1:]).to(device))]
            elif t == "attn":
                x = get(i)
                X = x.unsqueeze(-1) if x.dim() == 2 else x
                n, d = X.shape[1], X.shape[2]
                wq, wk, wv = (self.attn[f"{i}_{k}"] for k in ("wq", "wk", "wv"))
                if d != b["d"] or (b["pos"] and n != b["dq"] - d):
                    sys.exit(f"{b.get('name', i)} was built for {b['dq'] - b['d'] if b['pos'] else 'any number of'} items of {b['d']} features but is getting {n} of {d}")
                Q, K = X @ wq[:d], X @ wk[:d]
                if b["pos"]:
                    Q, K = Q + wq[d:], K + wk[d:]
                S = Q @ K.transpose(1, 2) / math.sqrt(b["dk"])
                if b["causal"]:
                    S = S.masked_fill(torch.triu(torch.ones(n, n, dtype=torch.bool, device=device), 1), float("-inf"))
                P = torch.softmax(S, -1)
                Y = P @ (X @ wv)
                out[i] = [Y.reshape(x.shape), P]
            elif t == "mlp":
                x = get(i)
                if x.dim() != 2 or x.shape[1] != b["sizes"][0]:
                    sys.exit(f"{b.get('name', i)} takes a 1-D input of {b['sizes'][0]} values but is getting {tuple(x.shape[1:])}")
                a, last = x.to(dt), len(b["w"]) - 1
                for l in range(last + 1):
                    a = a @ self.attn[f"{i}_m{l}"]
                    if not (l == last and b["linOut"]):
                        a = torch.relu(a) if b["act"] == "relu" else torch.sigmoid(a) if b["act"] == "sigmoid" else torch.tanh(a) if b["act"] == "tanh" else a
                out[i] = [a]
            elif t == "perc":
                x = get(i)
                if x.dim() != 2:
                    sys.exit(f"{b.get('name', i)} needs a 1-D input; put a Linearize block before it")
                out[i] = [self.frames[str(i)](x.to(dt))]
            elif t == "read":
                p, tr = get(i, 0), get(i, 1).to(dt)
                if p.shape[1:] != tr.shape[1:] and p[0].numel() == tr[0].numel():
                    p = p.reshape(tr.shape)
                if p.shape != tr.shape:
                    sys.exit(f"the prediction is {tuple(p.shape[1:])} but the ground truth is {tuple(tr.shape[1:])}")
                if b["loss"] == "ce" and tr.dim() == 3:            # one prediction per row, averaged over the rows that have a label
                    rows = -(tr * torch.log_softmax(p, -1)).sum(-1)
                    has = (tr.sum(-1) > 0).to(dt)
                    loss = (rows * has).sum(-1) / has.sum(-1).clamp(min=1)
                elif b["loss"] == "ce":
                    flat_p, flat_t = p.reshape(B, -1), tr.reshape(B, -1)
                    loss = -(flat_t * torch.log_softmax(flat_p, -1)).sum(-1)
                else:
                    loss = ((p - tr) ** 2).reshape(B, -1).sum(-1)
                return loss, p, tr
        sys.exit("the graph has no Cost function")

    def weights(self):
        res = {}
        for i in self.train_ids:
            b = self.by[i]
            if b["type"] == "mlp":
                res[str(i)] = {"w": [base64.b64encode(self.attn[f"{i}_m{l}"].detach().cpu().numpy().astype("<f4").tobytes()).decode() for l in range(len(b["w"]))]}
            elif b["type"] == "perc":
                nw, ew = self.frames[str(i)].weights()
                res[str(i)] = {"ns": {"id": b["ns"]["id"], "w": [float(v) for v in nw]}, "edges": {"s": b["edges"]["s"], "d": b["edges"]["d"], "w": [float(v) for v in ew]}}
            else:
                res[str(i)] = {k: [float(v) for v in self.attn[f"{i}_{k}"].detach().double().cpu().reshape(-1)] for k in ("wq", "wk", "wv")}
        return res


def right(p, tr):
    """Per sample: the share of labelled rows whose largest prediction is where the label is; None when the truth is not a label."""
    if tr.dim() == 2:
        if not bool(((tr == 0) | (tr == 1)).all()) or not bool((tr.sum(-1) == 1).all()) or tr.shape[1] < 2:
            return None
        return (p.argmax(-1) == tr.argmax(-1)).to(p.dtype)
    if tr.dim() == 3:
        if not bool(((tr == 0) | (tr == 1)).all()) or bool((tr.sum(-1) > 1).any()) or tr.shape[2] < 2:
            return None
        has = tr.sum(-1) > 0
        return ((p.argmax(-1) == tr.argmax(-1)) & has).sum(-1) / has.sum(-1).clamp(min=1)
    return None


def load_feeds(g, spec_override, dtype):
    """The Dataset block's samples as tensors (at most one Dataset block), and how many samples there are."""
    datas = [b for b in g["blocks"] if b["type"] == "data"]
    if len(datas) > 1:
        sys.exit("only one Dataset block can feed a run")
    if not datas:
        return None, None, SAMPLER_PASS
    b = datas[0]
    spec = spec_override or ("digits" if b["source"] == "digits" else f"{b['source']}:{b['ref']}")
    if b.get("text"):
        if not spec.startswith("hf:"):
            sys.exit("a text Dataset block has to come from Hugging Face")
        import hf_data
        i, sl = hf_data.info(spec[3:]), b.get("slice") or {}
        if not i:
            i = hf_data.add(spec[3:], sl.get("rows") or 2000, sl.get("where"), sl.get("config"), sl.get("split"))
        win, rows = int(b["win"]), []
        for doc in hf_data.docs(spec[3:]):
            u = utf16(doc)
            k = len(u) // win
            if k:
                rows.append(u[:k * win].reshape(k, win))
        if not rows:
            sys.exit(f"no document in {spec} is as long as the {win}-character window")
        text = torch.as_tensor(np.concatenate(rows))
        return b["id"], {"text": text}, len(text)
    pix, labels, w, h, mx = trainer.load_data(spec, b.get("slice") if b["source"] == "hf" else None)
    if (w, h) != (b["w"], b["h"]):
        sys.exit(f"the graph was built for {b['w']}x{b['h']} images but {spec} has {w}x{h}")
    classes = {c: k for k, c in enumerate(b["classes"])}
    keep = [k for k, l in enumerate(labels) if l in classes]
    x = torch.as_tensor(pix[keep]).to(dtype)
    x = x / mx if b["as"] == "float" else (x >= mx / 2).to(dtype) if b["as"] == "bool" else x
    lab = torch.nn.functional.one_hot(torch.as_tensor([classes[labels[k]] for k in keep]), len(classes)).to(dtype)
    return b["id"], {"image": x.view(-1, h, w), "label": lab}, len(x)


def bench(g, batch, device, spec=None, seconds=3.0, dtype=torch.float32):
    """Seconds per training step on this device, measured on the graph's own data. Also how many samples a pass has, and
    whether there is a dataset to hold some of it out."""
    net = Graph(g, dtype).to(device)
    did, feed, n = load_feeds(g, spec, dtype)
    opt = torch.optim.SGD(net.groups(lr=0.0))
    idx = torch.arange(min(batch, n))
    f = {did: {k: v[idx].to(device) for k, v in feed.items()}} if feed else {}
    B = len(idx) if feed else batch

    def step():
        opt.zero_grad(set_to_none=True)
        net(f, B, device)[0].mean().backward()
        opt.step()
    step(); step()
    if device.type == "cuda":
        torch.cuda.synchronize()
    t0, k = time.perf_counter(), 0
    while k < 3 or (time.perf_counter() - t0 < seconds and k < 2000):
        step(); k += 1
    if device.type == "cuda":
        torch.cuda.synchronize()
    return (time.perf_counter() - t0) / k, n, feed is not None


def train(g, a):
    dtype = torch.float64 if a.double else torch.float32
    device = trainer.pick_device(a.device)
    os.makedirs(a.out, exist_ok=True)
    torch.manual_seed(a.seed)
    net = Graph(g, dtype).to(device)
    did, feed, n = load_feeds(g, a.data, dtype)
    n_val = int(n * a.val) if a.val > 0 and feed else 0
    perm = torch.randperm(n, generator=torch.Generator().manual_seed(a.seed)) if n_val else torch.arange(n)
    if feed:
        feed = {k: v.to(device) for k, v in feed.items()}
    tr_idx, va_idx = perm[n_val:].to(device), perm[:n_val].to(device)
    nt = len(tr_idx)
    per_epoch = math.ceil(nt / a.batch)
    total = max(1, round(a.epochs * per_epoch))
    opt = torch.optim.SGD(net.groups(lr=a.lr))
    gen = torch.Generator(device=device).manual_seed(a.seed + 7)
    batch_of = lambda idx: ({did: {k: v[idx] for k, v in feed.items()}} if feed else {}, len(idx))
    step, ck = 0, os.path.join(a.out, "ckpt.pkl")
    if os.path.exists(ck):
        st = torch.load(ck, map_location=device, weights_only=False)
        net.load_state_dict(st["net"]); step = st["step"]
        print(f"resuming at step {step}")
    names = ", ".join(net.by[i].get("name", str(i)) for i in net.train_ids)
    print(f"training {names}; {nt:,} samples a pass" + (f", {n_val:,} held out" if n_val else "") + f"; {total:,} steps of {a.batch} on {device}", flush=True)

    def evaluate(idx):
        if feed is not None and not len(idx):
            return None, None
        tot, hit, cnt, has_acc = 0.0, 0.0, 0, True
        with torch.no_grad():
            chunks = [idx[k:k + 2048] for k in range(0, len(idx), 2048)] if feed is not None else [torch.arange(2048)] * 2
            for c in chunks:
                f, B = batch_of(c)
                loss, p, t = net(f, B, device, gen)
                r = right(p, t)
                tot += loss.sum().item(); cnt += B
                if r is None:
                    has_acc = False
                else:
                    hit += r.sum().item()
        return tot / cnt, (hit / cnt if has_acc else None)

    log_path = os.path.join(a.out, "log.csv")
    new_log = not os.path.exists(log_path) or step == 0
    log = open(log_path, "w" if new_log else "a", newline="")
    wr = csv.writer(log)
    if new_log:
        wr.writerow(["step", "epoch", "seconds", "train_loss", "val_loss", "val_accuracy"])
    t0 = last_ck = last_log = time.time()
    run, seen, stopped, epoch, order = 0.0, 0, None, -1, None
    save_ck = lambda: trainer.atomic(ck, lambda p: torch.save({"net": net.state_dict(), "step": step}, p))
    while step < total:
        e, k = divmod(step, per_epoch)
        if e != epoch:
            epoch = e
            order = torch.arange(nt, device=device) if a.no_shuffle else torch.randperm(nt, generator=torch.Generator().manual_seed(a.seed * 100003 + e)).to(device)
        f, B = batch_of(tr_idx[order[k * a.batch:(k + 1) * a.batch]])
        opt.zero_grad(set_to_none=True)
        loss = net(f, B, device, gen)[0].mean()
        loss.backward()
        opt.step()
        step += 1
        if step % 20 == 0 or step == total or a.batch == 1:
            v = loss.item()
            if not math.isfinite(v):
                sys.exit("a weight grew without limit; lower the blocks' rates in the editor, or pass a smaller --lr")
            run, seen = run + v, seen + 1
        now = time.time()
        if now - last_log > getattr(a, 'log_s', 15) or step == total:
            vl, va = evaluate(va_idx)
            wr.writerow([step, round(step / per_epoch, 3), round(now - t0, 1), run / max(seen, 1), vl, va]); log.flush()
            print(f"step {step:,}/{total:,}  loss {run / max(seen, 1):.4f}" + (f"  held-out accuracy {va:.1%}" if va is not None else f"  held-out loss {vl:.4f}" if vl is not None else ""), flush=True)
            run, seen, last_log = 0.0, 0, now
        if now - last_ck > a.ckpt_s:
            save_ck(); last_ck = now
        if a.max_minutes and now - t0 > a.max_minutes * 60:
            stopped = f"stopped at the {a.max_minutes} minute limit"
            print(stopped)
            break
    save_ck()
    tl, ta = evaluate(tr_idx[:20000])
    vl, va = evaluate(va_idx) if feed is not None else (tl, ta)
    out = {"format": "perceptron-editor/weights", "v": 2, "name": g.get("name"), "steps": step, "blocks": net.weights()}
    trainer.atomic(os.path.join(a.out, "weights.json"), lambda p: json.dump(out, open(p, "w"), separators=(",", ":")))
    metrics = {"steps": step, "of": total, "seconds": round(time.time() - t0, 1), "device": str(device), "batch": a.batch, "trained": names,
               "train_loss": tl, "train_accuracy": ta, "val_loss": vl, "val_accuracy": va, "note": stopped}
    trainer.atomic(os.path.join(a.out, "metrics.json"), lambda p: json.dump(metrics, open(p, "w"), indent=1))
    print(json.dumps(metrics))


if __name__ == "__main__":                               # python graph.py bench models/x.json.gz --batch 32  ->  one line of JSON
    if len(sys.argv) >= 3 and sys.argv[1] == "bench":
        torch.set_num_threads(1)
        batch = int(sys.argv[sys.argv.index("--batch") + 1]) if "--batch" in sys.argv else 32
        per_step, n, held = bench(trainer.load_model(sys.argv[2]), batch, torch.device("cpu"), seconds=2.0)
        print(json.dumps({"per_step": per_step, "n": n, "held": held}))
    else:
        sys.exit("usage: python graph.py bench <model file> [--batch N]")
