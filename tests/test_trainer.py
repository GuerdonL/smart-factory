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


def test_remote_plan_rents_nothing(tmp_path, monkeypatch):
    import remote
    monkeypatch.setattr(remote, "HERE", str(tmp_path))
    monkeypatch.setattr(remote, "STATE", str(tmp_path / "runs" / "_remote"))
    monkeypatch.setenv("PATH", str(tmp_path))                      # no bb here
    model = {"format": "perceptron-editor/model", "name": "Frame 1", "data": {"source": "digits"},
             "frame": {"edges": {"s": [1, 2], "d": [3, 3], "w": [0.1, 0.2]}}}
    p = remote.plan(model, epochs=5, batch=32, levels=2)
    assert p["steps"] == 5 * 51 and p["hours_cap"] == 0.5 and p["state"] == "planned" and p["price"] is None
    assert any("bb" in x for x in p["problems"])
    assert (tmp_path / p["path"]).exists() and (tmp_path / p["jobs"]).read_text().startswith(p["name"] + ": python trainer.py models/")
    try:
        remote.launch(p["name"])                                   # a plan with problems can never be launched
        assert False
    except remote.RemoteError:
        pass
    q = remote.plan(model)                                         # an untaken plan is cleaned up by the next one
    assert q["name"] == p["name"] or not (tmp_path / p["jobs"]).exists()
    assert remote.hours_cap(3600) == 4.0 and remote.gpu_seconds(1_000_000, 3, 1000, 32) > 1
    folder = dict(model, data={"source": "folder"})
    try:
        remote.plan(folder)
        assert False
    except remote.RemoteError as e:
        assert "folder" in str(e)


def reversal_graph(pos):
    n = 6
    return {"format": "perceptron-editor/graph", "v": 1, "name": "Cost function 1", "cost": 5, "train": [3, 4], "est": {"work": 100, "levels": 4, "samples": 10000},
            "blocks": [{"id": 1, "type": "dist", "kind": "uniform", "a": 0, "b": 1}, {"id": 2, "type": "samp", "n": n},
                       {"id": 3, "type": "attn", "name": "Attention 1", "dk": 4, "d": 1, "dq": 1 + (n if pos else 0), "n": n, "causal": False, "pos": pos, "lr": 0.2,
                        "wq": list(np.random.default_rng(0).uniform(-1, 1, (1 + (n if pos else 0)) * 4)), "wk": list(np.random.default_rng(1).uniform(-1, 1, (1 + (n if pos else 0)) * 4)), "wv": [0.7]},
                       {"id": 4, "type": "perc", "name": "Frame", "act": "linear", "linOut": False, "lr": 0.01, "in": list(range(1, n + 1)), "out": list(range(n + 1, 2 * n + 1)),
                        "ns": {"id": list(range(1, 2 * n + 1)), "w": [1.0] * (2 * n)}, "edges": {"s": list(range(1, n + 1)), "d": list(range(n + 1, 2 * n + 1)), "w": [1.0] * n}},
                       {"id": 6, "type": "lin", "mode": "rows", "rev": [True]}, {"id": 5, "type": "read", "loss": "se"}],
            "wires": [{"from": 1, "to": 2, "fp": 0, "tp": 0}, {"from": 2, "to": 3, "fp": 0, "tp": 0}, {"from": 3, "to": 4, "fp": 0, "tp": 0}, {"from": 4, "to": 5, "fp": 0, "tp": 0},
                      {"from": 2, "to": 6, "fp": 0, "tp": 0}, {"from": 6, "to": 5, "fp": 0, "tp": 1}]}


def test_graph_trainer_learns_reversal_only_with_positions(tmp_path):
    losses = {}
    for pos in (True, False):
        model = tmp_path / f"g{pos}.json"
        json.dump(reversal_graph(pos), open(model, "w"))
        out = tmp_path / f"run{pos}"
        subprocess.run([sys.executable, "trainer.py", str(model), "--out", str(out), "--device", "cpu", "--epochs", "0.6", "--batch", "4"], cwd=ROOT, check=True)
        losses[pos] = json.load(open(out / "metrics.json"))["train_loss"]
        w = json.load(open(out / "weights.json"))
        assert w["v"] == 2 and set(w["blocks"]) == {"3", "4"} and len(w["blocks"]["3"]["wq"]) == (7 if pos else 1) * 4
    assert losses[True] < 0.02 and losses[False] > 0.2


def test_graph_tokenizer_and_linearize_match_the_editor():
    import graph
    g = {"format": "perceptron-editor/graph", "cost": 3, "train": [], "blocks": [
        {"id": 1, "type": "text", "text": "Hi, yo~\nu"}, {"id": 2, "type": "tok", "fmt": "onehot", "n": 4}, {"id": 3, "type": "read", "loss": "ce"}],
        "wires": [{"from": 1, "to": 2, "fp": 0, "tp": 0}, {"from": 2, "to": 3, "fp": 0, "tp": 0}, {"from": 2, "to": 3, "fp": 1, "tp": 1}]}
    net = graph.Graph(g, torch.float64)
    _, toks, labs = net({}, 2, torch.device("cpu"))
    assert toks.shape == (2, 4, 97) and toks[0].argmax(-1).tolist() == [41, 74, 13, 1] and labs[0].argmax(-1).tolist() == [74, 13, 1, 90]   # as the editor shows them
    lin = {"id": 9, "mode": "rows", "rev": [False, False, True]}
    assert net._lin_index(lin, (2, 2, 3)).tolist() == [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]


def test_local_run_on_the_server(tmp_path, monkeypatch):
    import remote
    import shutil as sh
    import time as tm
    for f in ("trainer.py", "graph.py", "hf_data.py", "kaggle_data.py"):
        sh.copy(os.path.join(ROOT, f), tmp_path / f)
    monkeypatch.setattr(remote, "HERE", str(tmp_path))
    monkeypatch.setattr(remote, "STATE", str(tmp_path / "runs" / "_remote"))
    p = remote.local_plan(reversal_graph(True), epochs=0.05, batch=4)
    assert p["kind"] == "local" and not p["problems"] and p["steps"] == 125 and p["est_s"] > 0 and p["val"] == 0
    try:
        remote.launch(p["name"])                                   # a local plan can never become a rental
        assert False
    except remote.RemoteError:
        pass
    m = remote.local_start(p["name"])
    assert m["state"] == "running"
    assert remote._local_alive(m)                                  # which is what makes the server refuse a second run meanwhile
    for _ in range(120):
        m = remote.status(p["name"])
        if m["state"] != "running":
            break
        tm.sleep(0.5)
    assert m["state"] == "done" and m["metrics"]["steps"] == 125
    assert set(remote.weights(p["name"])["blocks"]) == {"3", "4"}
