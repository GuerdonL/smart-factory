"""Write a fully connected model file without the editor, for sizes too large to build by hand.

    python make_model.py models/mnist-512.json --layers 784,512,10 --data mnist --act relu --loss ce

The file trains like an exported one. The editor cannot open it (it only imports weights into a frame it already has).
"""
import argparse
import json

import numpy as np

SETS = {"digits": (8, 8, 16), "mnist": (28, 28, 255)}

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("out")
ap.add_argument("--layers", required=True, help="neurons per layer, input first, e.g. 784,512,10")
ap.add_argument("--data", choices=list(SETS), default="mnist")
ap.add_argument("--act", default="relu", choices=["linear", "relu", "sigmoid", "tanh"])
ap.add_argument("--loss", default="ce", choices=["se", "ce"])
ap.add_argument("--lr", type=float, default=0.05)
ap.add_argument("--seed", type=int, default=0)
a = ap.parse_args()
sizes = [int(v) for v in a.layers.split(",")]
w, h, mx = SETS[a.data]
assert sizes[0] == w * h and sizes[-1] == 10, f"{a.data} needs {w * h} inputs and 10 outputs"
rng, ids, nxt = np.random.default_rng(a.seed), [], 1
for n in sizes:
    ids.append(np.arange(nxt, nxt + n)); nxt += n
s, d, wt = [], [], []
for p, q in zip(ids, ids[1:]):
    s.append(np.repeat(p, len(q))); d.append(np.tile(q, len(p)))
    wt.append(rng.uniform(-1, 1, len(p) * len(q)) / np.sqrt(len(p)))
model = {"format": "perceptron-editor/model", "v": 1, "name": a.layers,
         "data": {"source": a.data, "name": a.data, "w": w, "h": h, "max": mx, "as": "float", "classes": [str(i) for i in range(10)]},
         "fold": "rows", "loss": a.loss,
         "frame": {"act": a.act, "linOut": True, "lr": a.lr, "in": ids[0].tolist(), "out": ids[-1].tolist(),
                   "ns": {"id": np.concatenate(ids).tolist(), "w": [1] * (nxt - 1)},
                   "edges": {"s": np.concatenate(s).tolist(), "d": np.concatenate(d).tolist(), "w": np.round(np.concatenate(wt), 4).tolist()}}}
json.dump(model, open(a.out, "w"), separators=(",", ":"))
print(f"{a.out}: {sum(len(x) for x in wt):,} connections")
