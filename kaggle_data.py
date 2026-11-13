"""Find Kaggle datasets and turn them into something the editor and the trainer can read.

    python kaggle_data.py search "sign language"
    python kaggle_data.py add datamunge/sign-language-mnist        # optional: --size 32
    python kaggle_data.py list

Needs the Kaggle CLI logged in on this machine (`pip install kaggle`, then `kaggle auth login`, or a token in
KAGGLE_API_TOKEN / ~/.kaggle/access_token). `add` downloads into data/kaggle/<owner>/<name>/raw and packs it
into packed.npz beside that: greyscale images of one size with a label each. Two layouts are understood:

  image files      label = the folder the file is in. Mixed sizes are scaled to --size (default 32) square.
  CSV of pixels    one row per image: a label column plus a square number of pixel columns (the MNIST-style files).
  IDX files        the original MNIST layout: an images file and a labels file per split, gzipped or not.

Train on it with `--data kaggle:<owner>/<name>`.
"""
import argparse
import csv
import io
import json
import os
import shutil
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "data", "kaggle")
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp")
LABEL_NAMES = ("label", "labels", "class", "target", "y", "digit")
MAX_IMAGES = 200_000


class KaggleError(Exception):
    pass


def good_ref(ref):
    parts = ref.split("/")
    ok = len(parts) == 2 and all(p and p not in (".", "..") and all(c.isalnum() or c in "-_." for c in p) for p in parts)
    if not ok:
        raise KaggleError(f"{ref!r} is not a dataset reference like owner/name")
    return ref


def folder(ref):
    return os.path.join(ROOT, *good_ref(ref).split("/"))


def kaggle(*args, timeout=3600):
    if not shutil.which("kaggle"):
        raise KaggleError("the Kaggle CLI is not installed here: pip install kaggle, then kaggle auth login")
    r = subprocess.run(["kaggle", *args], capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0 or "Authentication required" in r.stdout:
        text = (r.stderr.strip() or r.stdout.strip()).splitlines()
        if any("uthentic" in t or "401" in t or "403" in t for t in text):
            raise KaggleError("Kaggle is not logged in on this machine: run `kaggle auth login`, or set KAGGLE_API_TOKEN")
        raise KaggleError("kaggle " + " ".join(args[:2]) + " failed: " + (text[-1] if text else "no output"))
    return r.stdout


def search(query, max_mb=2000):
    """Datasets matching the words, most popular first: ref, title, size, downloads, votes, usability, updated."""
    out = kaggle("datasets", "list", "-s", query, "--sort-by", "votes", "--max-size", str(int(max_mb * 1e6)), "--csv", timeout=60)
    lines = out.splitlines()
    start = next((i for i, l in enumerate(lines) if l.startswith("ref,")), None)
    if start is None:
        return []
    rows = list(csv.DictReader(io.StringIO("\n".join(lines[start:]))))
    return [{"ref": r.get("ref", ""), "title": r.get("title", ""), "size": r.get("size", ""), "updated": (r.get("lastUpdated") or "")[:10],
             "downloads": r.get("downloadCount", ""), "votes": r.get("voteCount", ""), "usability": r.get("usabilityRating", "")}
            for r in rows if "/" in r.get("ref", "")]


def _natural(s):
    import re
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def _pack_images(files, raw, size):
    from PIL import Image
    files = sorted(files, key=lambda p: _natural(os.path.relpath(p, raw)))[:MAX_IMAGES]
    sizes = set()
    for f in files[:: max(1, len(files) // 200)]:
        try:
            sizes.add(Image.open(f).size)
        except Exception:
            pass
    if not sizes:
        raise KaggleError("none of the image files could be opened")
    scaled = len(sizes) > 1 or size is not None or max(next(iter(sizes))) > 128
    w, h = (size or 32,) * 2 if scaled else next(iter(sizes))
    pix, labels, skipped = [], [], 0
    for f in files:
        try:
            im = Image.open(f).convert("RGBA")
            if scaled:
                im = im.resize((w, h), Image.BILINEAR)
            a = np.asarray(im, dtype=np.float64)
            if a.shape[:2] != (h, w):
                skipped += 1
                continue
        except Exception:
            skipped += 1
            continue
        g = np.floor((0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]) * a[..., 3] / 255 + 0.5)
        pix.append(g.astype(np.uint8).reshape(-1))
        labels.append(os.path.basename(os.path.dirname(f)))
    note = (f"images scaled to {w}x{h} greyscale" if scaled else "greyscale") + (f"; {skipped} unreadable or odd-sized files skipped" if skipped else "")
    return np.stack(pix), labels, w, h, 255, "image files", note


def _pack_csv(paths):
    best = None
    for p in sorted(paths, key=lambda q: _natural(os.path.basename(q))):
        with open(p, newline="", encoding="utf-8", errors="replace") as f:
            head = next(csv.reader(f), None)
        if not head:
            continue
        names = [c.strip().lower() for c in head]
        lab = next((i for i, c in enumerate(names) if c in LABEL_NAMES), None)
        side = round((len(head) - 1) ** 0.5)
        if lab is None or side < 4 or side * side != len(head) - 1:
            continue
        try:
            rows = np.loadtxt(p, delimiter=",", skiprows=1, dtype=np.float64, ndmin=2)
        except ValueError:
            continue
        got = (np.delete(rows, lab, axis=1), rows[:, lab], side)
        if best is None:
            best = [got]
        elif got[2] == best[0][2]:
            best.append(got)
    if not best:
        return None
    pix = np.concatenate([b[0] for b in best])
    top = float(pix.max()) if pix.size else 255.0
    mx = 1 if top <= 1 else 255
    pix = np.clip(np.rint(pix * (255 if mx == 1 else 1)), 0, 255).astype(np.uint8)
    labels = [str(int(v)) if float(v).is_integer() else str(v) for v in np.concatenate([b[1] for b in best])]
    side = best[0][2]
    return pix, labels, side, side, 255, "CSV of pixels", f"{len(best)} CSV file{'s' if len(best) > 1 else ''} with a label column and {side * side} pixel columns"


def _read_idx(path):
    """An IDX file (the original MNIST layout, optionally gzipped) as an array, or None if the file is something else."""
    import gzip
    import struct
    try:
        with (gzip.open if path.lower().endswith(".gz") else open)(path, "rb") as f:
            head = f.read(4)
            if len(head) < 4 or head[:3] != b"\x00\x00\x08" or head[3] not in (1, 3):
                return None
            dims = struct.unpack(">" + "I" * head[3], f.read(4 * head[3]))
            body = f.read()
    except OSError:
        return None
    if len(body) != int(np.prod(dims)):
        return None
    return np.frombuffer(body, dtype=np.uint8).reshape(dims)


def _pack_idx(paths):
    seen, images, labels = set(), [], []
    for p in sorted(paths, key=lambda q: _natural(os.path.basename(q))):
        a = _read_idx(p)
        if a is None:
            continue
        key = (a.shape, a[:64].tobytes(), a[-64:].tobytes())          # some datasets ship every file twice
        if key in seen:
            continue
        seen.add(key)
        (images if a.ndim == 3 else labels).append(a)
    pairs = []
    for im in images:
        match = next((l for l in labels if len(l) == len(im)), None)
        if match is not None and (not pairs or im.shape[1:] == pairs[0][0].shape[1:]):
            pairs.append((im, match))
            labels = [l for l in labels if l is not match]
    if not pairs:
        return None
    h, w = pairs[0][0].shape[1:]
    pix = np.concatenate([im.reshape(len(im), -1) for im, _ in pairs])
    return pix, [str(v) for v in np.concatenate([l for _, l in pairs])], w, h, 255, "IDX files", f"{len(pairs)} image file{'s' if len(pairs) > 1 else ''} in the original MNIST layout"


def pack(ref, size=None):
    """Read data/kaggle/<ref>/raw and write packed.npz + info.json beside it."""
    d = folder(ref)
    raw = os.path.join(d, "raw")
    images, csvs, rest = [], [], []
    for root, _, files in os.walk(raw):
        for f in files:
            if f.lower().endswith(IMAGE_EXT):
                images.append(os.path.join(root, f))
            elif f.lower().endswith(".csv"):
                csvs.append(os.path.join(root, f))
            else:
                rest.append(os.path.join(root, f))
    got = _pack_images(images, raw, size) if images else None
    got = got or (_pack_csv(csvs) if csvs else None) or (_pack_idx(rest) if rest else None)
    if got is None:
        seen = sorted(os.listdir(raw))[:8] if os.path.isdir(raw) else []
        raise KaggleError(f"{ref} has no image files, no CSV with a label column plus a square number of pixel columns, and no MNIST-style IDX files "
                          f"(it holds: {', '.join(seen) or 'nothing'}). Only image datasets can be used here.")
    pix, labels, w, h, mx, kind, note = got
    classes = sorted(set(labels), key=_natural)
    if len(classes) < 2:
        raise KaggleError(f"{ref}: every image has the same label ({classes[0] if classes else 'none'}), so there is nothing to learn. "
                          "Labels come from the folder each image is in.")
    index = {c: i for i, c in enumerate(classes)}
    np.savez_compressed(os.path.join(d, "packed.npz"), pix=pix, lab=np.array([index[l] for l in labels], dtype=np.int32))
    info = {"ref": ref, "name": ref.split("/")[1], "w": w, "h": h, "n": int(len(pix)), "max": mx, "classes": classes, "kind": kind, "note": note}
    json.dump(info, open(os.path.join(d, "info.json"), "w"), indent=1)
    return info


def add(ref, size=None, force=False):
    """Download a dataset (once) and pack it. Returns its info."""
    d = folder(ref)
    raw = os.path.join(d, "raw")
    if force or not os.path.isdir(raw) or not os.listdir(raw):
        os.makedirs(raw, exist_ok=True)
        kaggle("datasets", "download", ref, "-p", raw, "--unzip", "-q", *(["-o"] if force else []))
    return pack(ref, size)


def info(ref):
    p = os.path.join(folder(ref), "info.json")
    return json.load(open(p)) if os.path.exists(p) else None


def added():
    out = []
    for root, _, files in os.walk(ROOT):
        if "info.json" in files and "packed.npz" in files:
            out.append(json.load(open(os.path.join(root, "info.json"))))
    return sorted(out, key=lambda i: i["ref"])


def load(ref):
    """-> pixels [n, w*h] uint8, labels (class names), w, h, max. Fetches the pack if it is not here:
    on a rented instance from the box-boy Hugging Face repo (run.py puts it there), otherwise from Kaggle."""
    d = folder(ref)
    p = os.path.join(d, "packed.npz")
    if not os.path.exists(p):
        repo = os.environ.get("BB_HF_REPO")
        if repo:
            from huggingface_hub import hf_hub_download
            for name in ("packed.npz", "info.json"):
                hf_hub_download(repo, f"{hf_path(ref)}/{name}", local_dir=os.path.join(HERE, "data", "hf"))
            src = os.path.join(HERE, "data", "hf", hf_path(ref))
            os.makedirs(d, exist_ok=True)
            for name in ("packed.npz", "info.json"):
                shutil.copy(os.path.join(src, name), os.path.join(d, name))
        else:
            add(ref)
    i, z = info(ref), np.load(p)
    return z["pix"], [i["classes"][k] for k in z["lab"]], i["w"], i["h"], i["max"]


def hf_path(ref):
    return "_data/kaggle/" + good_ref(ref)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search"); s.add_argument("query"); s.add_argument("--max-mb", type=float, default=2000)
    a = sub.add_parser("add"); a.add_argument("ref"); a.add_argument("--size", type=int, default=None, help="scale every image to this many pixels square")
    a.add_argument("--force", action="store_true", help="download again")
    sub.add_parser("list")
    args = ap.parse_args()
    try:
        if args.cmd == "search":
            for r in search(args.query, args.max_mb):
                print(f"{r['ref']:<48} {r['size']:>10}  {r['downloads']:>8} downloads  {r['title']}")
        elif args.cmd == "add":
            i = add(args.ref, args.size, args.force)
            print(f"{i['ref']}: {i['n']:,} images, {i['w']}x{i['h']}, {len(i['classes'])} classes ({i['kind']}; {i['note']})\n"
                  f"build a frame with {i['w'] * i['h']} inputs and {len(i['classes'])} outputs, then train with --data kaggle:{i['ref']}")
        else:
            for i in added():
                print(f"{i['ref']:<48} {i['n']:>8,} images  {i['w']}x{i['h']}  {len(i['classes'])} classes")
    except KaggleError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
