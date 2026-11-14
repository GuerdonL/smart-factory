"""Take a slice of a Hugging Face dataset and turn it into something the editor and the trainer can read.

    python hf_data.py search "common corpus"
    python hf_data.py add PleIAs/common_corpus --rows 2000 --where language=English
    python hf_data.py add ylecun/mnist --rows 5000
    python hf_data.py list

Rows are read straight out of the dataset's Parquet files over the network and reading stops as soon as enough
have been taken, so a slice of a multi-terabyte dataset costs a few megabytes. Two kinds are understood:

  text      the column named text (else the longest text column); saved one document per line in text.jsonl
  images    an image column plus a label column; greyscale, one size, saved in packed.npz like a Kaggle dataset

Results go to data/hfds/<owner>/<name>/. Needs `pip install huggingface_hub pyarrow` (and pillow for images).
A token in HF_TOKEN, or `hf auth login`, is only needed for private or gated datasets.
"""
import argparse
import io
import json
import os
import sys
import urllib.parse
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "data", "hfds")
TEXT_NAMES = ("text", "content", "document", "story", "sentence", "body", "article")
LABEL_NAMES = ("label", "labels", "class", "target", "category")
MAX_CHARS = 200_000_000
MAX_SCAN = 150_000            # rows read while looking for matches before giving up; a rare value can need a lot of reading
MAX_VALUES = 400              # a column with at most this many different values is offered as a set of parts to choose from


class HFError(Exception):
    pass


def good_ref(ref):
    parts = ref.split("/")
    if not (len(parts) == 2 and all(p and p not in (".", "..") and all(c.isalnum() or c in "-_." for c in p) for p in parts)):
        raise HFError(f"{ref!r} is not a dataset name like owner/name")
    return ref


def folder(ref):
    return os.path.join(ROOT, *good_ref(ref).split("/"))


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "smart-factory"})
    tok = os.environ.get("HF_TOKEN")
    if tok:
        req.add_header("Authorization", "Bearer " + tok)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            msg = json.load(e).get("error", "")
        except Exception:
            msg = ""
        raise HFError(f"Hugging Face answered {e.code}" + (f": {msg[:200]}" if msg else ""))
    except OSError as e:
        raise HFError(f"could not reach Hugging Face: {e}")


def search(query, limit=20):
    """Datasets matching the words, most downloaded first."""
    rows = _get("https://huggingface.co/api/datasets?" + urllib.parse.urlencode({"search": query, "sort": "downloads", "direction": -1, "limit": limit}))
    kinds = lambda tags: ", ".join(t.split(":", 1)[1] for t in tags if t.startswith("modality:")) or "?"
    return [{"ref": r["id"], "downloads": r.get("downloads", 0), "likes": r.get("likes", 0), "updated": (r.get("lastModified") or "")[:10],
             "gated": bool(r.get("gated")), "kinds": kinds(r.get("tags") or [])} for r in rows if "/" in r.get("id", "")]


def _files(ref, config, split):
    """Parquet files to read, as paths for HfFileSystem: Hugging Face's own converted copies when it has them, else the repo's files."""
    try:
        listed = _get("https://datasets-server.huggingface.co/parquet?dataset=" + urllib.parse.quote(ref)).get("parquet_files", [])
    except HFError:
        listed = []
    if listed:
        configs = sorted({f["config"] for f in listed})
        config = config or ("default" if "default" in configs else configs[0])
        splits = sorted({f["split"] for f in listed if f["config"] == config})
        if not splits:
            raise HFError(f"{ref} has no subset named {config}; it has: {', '.join(configs)}")
        split = split or ("train" if "train" in splits else splits[0])
        mine = [f for f in listed if f["config"] == config and f["split"] == split]
        if not mine:
            raise HFError(f"{ref} / {config} has no split named {split}; it has: {', '.join(splits)}")
        return [f"datasets/{ref}@refs%2Fconvert%2Fparquet/{config}/{split}/{f['filename']}" for f in mine], config, split
    from huggingface_hub import HfApi
    try:
        names = sorted(s.rfilename for s in HfApi().dataset_info(ref).siblings if s.rfilename.endswith(".parquet"))
    except Exception as e:
        raise HFError(f"could not list {ref}: {type(e).__name__}")
    if not names:
        raise HFError(f"{ref} has no Parquet files to read")
    return [f"datasets/{ref}/{n}" for n in names], config or "default", split or "train"


def _grey(raw, size):
    from PIL import Image
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    if size and im.size != (size, size):
        im = im.resize((size, size), Image.BILINEAR)
    a = np.asarray(im, dtype=np.float64)
    return np.floor((0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]) * a[..., 3] / 255 + 0.5).astype(np.uint8)


def add(ref, rows=2000, where=None, config=None, split=None, size=None, column=None):
    """Read up to `rows` rows (those matching `where`, a {column: value} dict) and save them. Returns the dataset's info."""
    try:
        import pyarrow.parquet as pq
        from huggingface_hub import HfFileSystem
    except ImportError:
        raise HFError("this needs two packages on the server: pip install huggingface_hub pyarrow")
    rows = max(1, min(int(rows), 200_000))
    where = {k: [str(x).lower() for x in (v if isinstance(v, (list, tuple)) else [v])] for k, v in (where or {}).items() if v not in ([], None, "")}
    files, config, split = _files(good_ref(ref), config, split)
    fs = HfFileSystem()
    try:
        first = pq.ParquetFile(fs.open(files[0], block_size=4 << 20), buffer_size=1 << 20, pre_buffer=False)
    except Exception as e:
        raise HFError(f"could not open {ref}: {type(e).__name__}: {str(e)[:160]}" + (" (gated or private: set HF_TOKEN on the server)" if "401" in str(e) or "403" in str(e) or "Gated" in type(e).__name__ else ""))
    schema = first.schema_arrow
    feats = {}
    try:
        feats = json.loads(schema.metadata[b"huggingface"])["info"]["features"]
    except Exception:
        pass
    names = schema.names
    for k in where:
        if k not in names:
            raise HFError(f"{ref} has no column named {k}; its columns are: {', '.join(names)}")
    is_img = lambda n: (feats.get(n) or {}).get("_type") == "Image" or (str(schema.field(n).type).startswith("struct") and "bytes" in str(schema.field(n).type))
    img = next((n for n in names if is_img(n)), None)
    strings = [n for n in names if str(schema.field(n).type) in ("string", "large_string")]
    if column and column not in names:
        raise HFError(f"{ref} has no column named {column}; its columns are: {', '.join(names)}")
    if img and not column:
        lab = next((n for n in names if (feats.get(n) or {}).get("_type") == "ClassLabel"), None) or next((n for n in names if n.lower() in LABEL_NAMES), None)
        if not lab:
            raise HFError(f"{ref} has images but no label column (its columns are: {', '.join(names)})")
        cols, kind = [img, lab], "images"
    else:
        text = column or next((n for n in names if n.lower() in TEXT_NAMES), None)
        if not text and strings:
            head = next(first.iter_batches(batch_size=32, columns=strings)).to_pydict()
            text = max(strings, key=lambda n: sum(len(v or "") for v in head[n]))
        if not text:
            raise HFError(f"{ref} has no text column and no image column (its columns are: {', '.join(names)})")
        cols, kind = [text], "text"
    cols += [k for k in where if k not in cols]
    d = folder(ref)
    os.makedirs(d, exist_ok=True)
    taken, seen, chars, pix, labels, target = 0, 0, 0, [], [], None
    out = open(os.path.join(d, "text.jsonl.tmp"), "w", encoding="utf-8") if kind == "text" else None
    try:
        for path in files:
            f = first if path == files[0] else pq.ParquetFile(fs.open(path, block_size=4 << 20), buffer_size=1 << 20, pre_buffer=False)
            for batch in f.iter_batches(batch_size=128, columns=cols):
                for r in batch.to_pylist():
                    seen += 1
                    if any(str(r.get(k)).lower() not in v for k, v in where.items()):
                        continue
                    if kind == "text":
                        s = r[cols[0]]
                        if not s or not s.strip():
                            continue
                        out.write(json.dumps(s, ensure_ascii=False) + "\n")
                        chars += len(s)
                    else:
                        cell = r[cols[0]]
                        if not cell or not cell.get("bytes"):
                            continue
                        if target is None:                       # the first image decides: small ones keep their size, large ones become 32 px square
                            g0 = _grey(cell["bytes"], size)
                            target = size or (g0.shape[0] if g0.shape[0] == g0.shape[1] and g0.shape[0] <= 128 else 32)
                        pix.append(_grey(cell["bytes"], target).reshape(-1))
                        labels.append(r[cols[1]])
                    taken += 1
                    if taken >= rows or chars >= MAX_CHARS:
                        break
                if taken >= rows or chars >= MAX_CHARS or seen >= MAX_SCAN:
                    break
            if taken >= rows or chars >= MAX_CHARS or seen >= MAX_SCAN:
                break
    finally:
        if out:
            out.close()
    if not taken:
        raise HFError(f"none of the first {seen:,} rows of {ref} matched" + (" " + ", ".join(f"{k}={'|'.join(v)}" for k, v in where.items()) if where else "") + ". Check the spelling, or pick from the parts the editor lists.")
    info = {"ref": ref, "src": "hf", "name": ref.split("/")[1], "kind": kind, "config": config, "split": split, "n": taken, "read": seen,
            "where": where or None, "column": cols[0]}
    if kind == "text":
        os.replace(os.path.join(d, "text.jsonl.tmp"), os.path.join(d, "text.jsonl"))
        info.update(chars=chars, note=f"{taken:,} documents, {chars:,} characters from column {cols[0]}" + (f" (only {taken:,} of the first {seen:,} rows matched)" if taken < rows and seen >= MAX_SCAN else ""))
    else:
        names_ = (feats.get(cols[1]) or {}).get("names")
        labels = [names_[v] if names_ and isinstance(v, int) and 0 <= v < len(names_) else str(v) for v in labels]
        classes = names_ if names_ else sorted(set(labels), key=lambda s: (len(s), s))
        index = {c: i for i, c in enumerate(classes)}
        np.savez_compressed(os.path.join(d, "packed.npz"), pix=np.stack(pix), lab=np.array([index[l] for l in labels], dtype=np.int32))
        info.update(w=target, h=target, max=255, classes=classes, note=f"{taken:,} images, {target}x{target} greyscale")
    json.dump(info, open(os.path.join(d, "info.json"), "w"), indent=1)
    return info


def parts(ref, config=None, split=None):
    """What a dataset can be narrowed by: its subsets and splits, and every text column with few enough different values
    (language, collection, licence...) with how often each value occurs in the first file."""
    try:
        import pyarrow.compute as pc
        import pyarrow.parquet as pq
        from huggingface_hub import HfFileSystem
    except ImportError:
        raise HFError("this needs two packages on the server: pip install huggingface_hub pyarrow")
    good_ref(ref)
    try:
        listed = _get("https://datasets-server.huggingface.co/parquet?dataset=" + urllib.parse.quote(ref)).get("parquet_files", [])
    except HFError:
        listed = []
    subsets = {}
    for f in listed:
        subsets.setdefault(f["config"], [])
        if f["split"] not in subsets[f["config"]]:
            subsets[f["config"]].append(f["split"])
    files, config, split = _files(ref, config, split)
    try:
        f = pq.ParquetFile(HfFileSystem().open(files[0], block_size=1 << 20))
    except Exception as e:
        raise HFError(f"could not open {ref}: {type(e).__name__}: {str(e)[:160]}")
    schema, md = f.schema_arrow, f.metadata
    sizes = {}
    for g in range(md.num_row_groups):
        for i in range(md.row_group(g).num_columns):
            c = md.row_group(g).column(i)
            sizes[c.path_in_schema] = sizes.get(c.path_in_schema, 0) + c.total_compressed_size
    cols = []
    for n in schema.names:
        if str(schema.field(n).type) not in ("string", "large_string") or sizes.get(n, 1 << 40) > 3_000_000:
            continue                                         # skip the text itself and anything else too big to be a category
        counts = pc.value_counts(f.read(columns=[n]).column(0)).to_pylist()
        vals = sorted(((c["values"], c["counts"]) for c in counts if c["values"] not in (None, "")), key=lambda t: -t[1])
        if 1 < len(vals) <= MAX_VALUES:
            cols.append({"name": n, "values": [[v, int(k)] for v, k in vals]})
    return {"ref": ref, "subsets": subsets or {config: [split]}, "config": config, "split": split, "sampled": md.num_rows,
            "files": len(files), "columns": cols}


def info(ref):
    p = os.path.join(folder(ref), "info.json")
    return json.load(open(p)) if os.path.exists(p) else None


def added():
    out = []
    for root, _, files in os.walk(ROOT):
        if "info.json" in files:
            out.append(json.load(open(os.path.join(root, "info.json"))))
    return sorted(out, key=lambda i: i["ref"])


def docs(ref, max_chars=None):
    """The saved documents of a text dataset, stopping once max_chars have been returned."""
    out, total = [], 0
    with open(os.path.join(folder(ref), "text.jsonl"), encoding="utf-8") as f:
        for line in f:
            s = json.loads(line)
            if max_chars and total + len(s) > max_chars:
                s = s[:max(0, max_chars - total)]
            if s:
                out.append(s)
                total += len(s)
            if max_chars and total >= max_chars:
                break
    return out


def load_images(ref, slice_=None):
    """-> pixels [n, w*h] uint8, labels (class names), w, h, max. If the slice is not here (a rented machine), it is read from
    Hugging Face first, the way `slice_` says: {rows, where, config, split} as the editor recorded it."""
    sl = slice_ or {}
    i = info(ref) or add(ref, sl.get("rows") or 2000, sl.get("where"), sl.get("config"), sl.get("split"))
    if i["kind"] != "images":
        raise HFError(f"{ref} is a text dataset; the trainer only handles images so far")
    z = np.load(os.path.join(folder(ref), "packed.npz"))
    return z["pix"], [i["classes"][k] for k in z["lab"]], i["w"], i["h"], i["max"]


def parse_where(text):
    if isinstance(text, dict):                               # from the editor: {column: [values]}
        return {str(k): [str(x) for x in (v if isinstance(v, list) else [v])] for k, v in text.items()}
    out = {}
    for part in (text or "").split(","):
        if part.strip():
            if "=" not in part:
                raise HFError(f"a filter is written column=value, such as language=English; got {part.strip()!r}")
            k, v = part.split("=", 1)
            out[k.strip()] = [x.strip().strip("'\"") for x in v.split("|")]
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search"); s.add_argument("query")
    a = sub.add_parser("add"); a.add_argument("ref"); a.add_argument("--rows", type=int, default=2000)
    a.add_argument("--where", default="", help="keep only rows where column=value, e.g. language=English or language=English|French,collection=Wikipedia")
    a.add_argument("--config", default=None); a.add_argument("--split", default=None); a.add_argument("--column", default=None, help="the text column, if the guess is wrong")
    a.add_argument("--size", type=int, default=None, help="scale every image to this many pixels square")
    sub.add_parser("list")
    pp = sub.add_parser("parts", help="show the subsets, splits and column values a dataset can be narrowed by"); pp.add_argument("ref")
    args = ap.parse_args()
    try:
        if args.cmd == "search":
            for r in search(args.query):
                print(f"{r['ref']:<52} {r['downloads']:>10,} downloads  {r['kinds']}{'  (gated)' if r['gated'] else ''}")
        elif args.cmd == "add":
            i = add(args.ref, args.rows, parse_where(args.where), args.config, args.split, args.size, args.column)
            print(f"{i['ref']} ({i['config']}/{i['split']}): {i['note']}; read {i['read']:,} rows to get them")
        elif args.cmd == "parts":
            p = parts(args.ref)
            print("subsets:", "; ".join(f"{c} ({', '.join(sp)})" for c, sp in p["subsets"].items()))
            for c in p["columns"]:
                print(f"{c['name']} (counts in the first {p['sampled']:,} rows): " + ", ".join(f"{v} {k:,}" for v, k in c["values"][:12]) + (" ..." if len(c["values"]) > 12 else ""))
        else:
            for i in added():
                print(f"{i['ref']:<52} {i['kind']:<7} {i['note']}")
    except HFError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
