"""Run with: python -m pytest tests"""
import json
import os
import subprocess
import sys

import numpy as np
import torch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import trainer  # noqa: E402


def frame(act="tanh", lin_out=False):
    # 2 inputs (ids 1, 2) -> 2 hidden (3, 4) -> 1 output (5), plus a skip connection 1 -> 5
    return {"act": act, "linOut": lin_out, "lr": 0.1, "in": [1, 2], "out": [5],
            "ns": {"id": [1, 2, 3, 4, 5], "w": [2.0, 1.0, 0.5, 1.5, 1.0]},
            "edges": {"s": [1, 2, 1, 3, 4, 1], "d": [3, 3, 4, 5, 5, 5], "w": [0.5, -1.0, 0.25, 2.0, -0.5, 0.1]}}


def test_forward_matches_hand_calculation():
    x1, x2 = 0.3, -0.7
    a1, a2 = 2.0 * x1, 1.0 * x2                        # input neurons: weight times input, no activation
    a3 = np.tanh(0.5 * (0.5 * a1 - 1.0 * a2))
    a4 = np.tanh(1.5 * (0.25 * a1))
    want = np.tanh(1.0 * (2.0 * a3 - 0.5 * a4 + 0.1 * a1))
    got = trainer.Frame(frame(), torch.float64)(torch.tensor([[x1, x2]], dtype=torch.float64))
    assert abs(got.item() - want) < 1e-12
    lin = trainer.Frame(frame(lin_out=True), torch.float64)(torch.tensor([[x1, x2]], dtype=torch.float64))
    assert abs(lin.item() - (2.0 * a3 - 0.5 * a4 + 0.1 * a1)) < 1e-12


def test_connection_list_agrees_with_matrix():
    rng = np.random.default_rng(1)
    ids = list(range(1, 115))
    e = [(a, b, rng.normal()) for a in range(1, 65) for b in range(65, 105) if rng.random() < 0.1]
    e += [(a, b, rng.normal()) for a in range(65, 105) for b in range(105, 115)]
    f = {"act": "relu", "linOut": True, "in": ids[:64], "out": ids[104:], "ns": {"id": ids, "w": [1.0] * 114},
         "edges": {"s": [q[0] for q in e], "d": [q[1] for q in e], "w": [q[2] for q in e]}}
    x, outs, old = torch.rand(4, 64, dtype=torch.float64), [], trainer.Frame.DENSE_CELLS
    try:
        for cells in (old, 0):
            trainer.Frame.DENSE_CELLS = cells
            net = trainer.Frame(f, torch.float64)
            outs.append((net(x), net.plan[1]["kind"]))
    finally:
        trainer.Frame.DENSE_CELLS = old
    assert (outs[0][1], outs[1][1]) == ("dense", "list")
    assert (outs[0][0] - outs[1][0]).abs().max() < 1e-12


def test_weights_round_trip_and_unused_neurons_untouched():
    f = frame()
    f["ns"]["id"].append(9); f["ns"]["w"].append(7.0)           # a neuron the output does not depend on
    f["edges"]["s"].append(1); f["edges"]["d"].append(9); f["edges"]["w"].append(3.0)
    nw, ew = trainer.Frame(f, torch.float64).weights()
    assert list(nw) == f["ns"]["w"] and list(ew) == f["edges"]["w"]


def test_fold_orders():
    assert trainer.fold_order(2, 3, "rows") == [0, 1, 2, 3, 4, 5]
    assert trainer.fold_order(2, 3, "cols") == [0, 3, 1, 4, 2, 5]
    assert trainer.fold_order(2, 3, "snake") == [0, 1, 2, 5, 4, 3]
    assert trainer.fold_order(3, 3, "spiral") == [0, 1, 2, 5, 8, 7, 6, 3, 4]
    assert trainer.fold_order(3, 3, "zigzag") == [0, 1, 3, 6, 4, 2, 5, 7, 8]
    assert trainer.fold_order(2, 3, "rows", (True, False)) == [2, 1, 0, 5, 4, 3]
    assert trainer.fold_order(2, 3, "rows", (False, True)) == [3, 4, 5, 0, 1, 2]
    assert trainer.fold_order(2, 3, "cols", (True, True)) == [5, 2, 4, 1, 3, 0]
    for mode in ("snakec", "spiral", "zigzag"):
        assert sorted(trainer.fold_order(5, 7, mode)) == list(range(35))


def test_training_learns_digits_and_resumes(tmp_path):
    model = tmp_path / "m.json"
    subprocess.run([sys.executable, "make_model.py", str(model), "--layers", "64,32,10", "--data", "digits"], cwd=ROOT, check=True)
    out = tmp_path / "run"
    cmd = [sys.executable, "trainer.py", str(model), "--out", str(out), "--device", "cpu", "--epochs"]
    subprocess.run(cmd + ["10"], cwd=ROOT, check=True)
    m = json.load(open(out / "metrics.json"))
    assert m["val_accuracy"] > 0.9
    w = json.load(open(out / "weights.json"))
    assert w["format"] == "perceptron-editor/weights" and len(w["edges"]["w"]) == 64 * 32 + 32 * 10
    r = subprocess.run(cmd + ["12"], cwd=ROOT, check=True, capture_output=True, text=True)     # same folder: continues from ckpt.pkl
    assert f"resuming at step {m['steps']}" in r.stdout
    assert json.load(open(out / "metrics.json"))["steps"] > m["steps"]


def test_kaggle_packing(tmp_path, monkeypatch):
    import kaggle_data
    from PIL import Image
    monkeypatch.setattr(kaggle_data, "ROOT", str(tmp_path))
    rng = np.random.default_rng(0)
    # image folders of mixed sizes: scaled to one size, label = the folder
    for i in range(12):
        d = tmp_path / "o" / "imgs" / "raw" / ("train" if i % 2 else "test") / ("cat" if i % 3 else "dog")
        d.mkdir(parents=True, exist_ok=True)
        Image.fromarray(rng.integers(0, 255, (20 + i, 30, 3), dtype=np.uint8)).save(d / f"{i}.png")
    i = kaggle_data.pack("o/imgs")
    assert (i["w"], i["h"], i["n"], i["classes"]) == (32, 32, 12, ["cat", "dog"])
    pix, labels, w, h, mx = kaggle_data.load("o/imgs")
    assert pix.shape == (12, 1024) and labels.count("dog") == 4 and mx == 255
    # MNIST-style CSV: label column anywhere, pixel values 0-255
    raw = tmp_path / "o" / "csv" / "raw"
    raw.mkdir(parents=True)
    rows = rng.integers(0, 256, (7, 16))
    with open(raw / "train.csv", "w") as f:
        f.write(",".join(f"p{k}" for k in range(16)) + ",Label\n")
        for k, r in enumerate(rows):
            f.write(",".join(map(str, r)) + f",{k % 3}\n")
    (raw / "notes.csv").write_text("a,b\n1,2\n")
    i = kaggle_data.pack("o/csv")
    assert (i["w"], i["h"], i["n"], i["classes"]) == (4, 4, 7, ["0", "1", "2"])
    pix, labels, *_ = kaggle_data.load("o/csv")
    assert (pix == rows).all() and labels[:4] == ["0", "1", "2", "0"]
    for bad in ("../x", "a/b/c", "a/..", "x"):
        try:
            kaggle_data.folder(bad)
            assert False, bad
        except kaggle_data.KaggleError:
            pass


def test_kaggle_idx_files(tmp_path, monkeypatch):
    import gzip
    import struct
    import kaggle_data
    monkeypatch.setattr(kaggle_data, "ROOT", str(tmp_path))
    rng = np.random.default_rng(3)
    raw = tmp_path / "o" / "idx" / "raw"
    (raw / "train-images-idx3-ubyte").mkdir(parents=True)
    tr, trl = rng.integers(0, 256, (9, 5, 5), dtype=np.uint8), rng.integers(0, 4, 9, dtype=np.uint8)
    te, tel = rng.integers(0, 256, (4, 5, 5), dtype=np.uint8), rng.integers(0, 4, 4, dtype=np.uint8)
    idx = lambda a: struct.pack(">BBBB", 0, 0, 8, a.ndim) + struct.pack(">" + "I" * a.ndim, *a.shape) + a.tobytes()
    (raw / "train-images.idx3-ubyte").write_bytes(idx(tr))
    (raw / "train-images-idx3-ubyte" / "train-images-idx3-ubyte").write_bytes(idx(tr))      # shipped twice, as on Kaggle
    (raw / "train-labels.idx1-ubyte").write_bytes(idx(trl))
    (raw / "t10k-images.idx3-ubyte.gz").write_bytes(gzip.compress(idx(te)))
    (raw / "t10k-labels.idx1-ubyte").write_bytes(idx(tel))
    (raw / "readme.txt").write_text("hello")
    i = kaggle_data.pack("o/idx")
    assert (i["w"], i["h"], i["n"], i["kind"]) == (5, 5, 13, "IDX files")
    pix, labels, *_ = kaggle_data.load("o/idx")
    assert (pix[4:] == tr.reshape(9, -1)).all() and labels[:4] == [str(v) for v in tel]


def test_hf_helpers(tmp_path, monkeypatch):
    import hf_data
    monkeypatch.setattr(hf_data, "ROOT", str(tmp_path))
    assert hf_data.parse_where("language=English|French, open_type = 'Open Culture'") == {"language": ["English", "French"], "open_type": ["Open Culture"]}
    assert hf_data.parse_where({"language": ["English"], "x": "y"}) == {"language": ["English"], "x": ["y"]}
    assert hf_data.parse_where("") == {}
    for bad in ("../x", "a/b/c", "x"):
        try:
            hf_data.folder(bad)
            assert False, bad
        except hf_data.HFError:
            pass
    d = tmp_path / "o" / "t"
    d.mkdir(parents=True)
    (d / "text.jsonl").write_text('"abcdef"\n"gh\\nij"\n"klm"\n', encoding="utf-8")
    assert hf_data.docs("o/t") == ["abcdef", "gh\nij", "klm"]
    assert hf_data.docs("o/t", 8) == ["abcdef", "gh"]
