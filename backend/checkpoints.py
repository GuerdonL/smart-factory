"""Loop state checkpoints (phase 9E): a cache of 32-bit float .npy files under <project>/data/checkpoints/.

Standard library plus arrays.py (the only module that imports NumPy), data.py, and check.py.

Each checkpoint caches one infinite loop's state (cell tick + 1) at a given tick, keyed by a SHA-256 fingerprint of:
  1. The loop's subgraph: the loop node, every node and function it transitively depends on, and any settled counts
     for loops in that subgraph.
  2. Every data file read by that subgraph, hashed by content (path + SHA-256 of the file's bytes).
  3. The tick itself.

A checkpoint is loaded ONLY on an exact fingerprint match; any change to the graph, data files, or tick produces a
different fingerprint and is worked out from tick 0. A small JSON sidecar beside each .npy holds metadata including
"kept" (false for cache entries; room is left to mark a checkpoint kept rather than cache for non-repeatable runs)
and "masked" (true when a companion .mask.npy holds a None mask). Cache entries are evicted oldest-first whenever
the directory exceeds the size budget; "kept" entries are never evicted."""
import hashlib
import json
import os
import tempfile

from . import arrays as A
from .check import applies, data_path, is_obj, lengths
from .data import NAME, PROJECTS, Refused, read_bytes


def checkpoint_dir(project, root=None):
    """The validated data/checkpoints/ path for a saved project, or None if invalid/missing project."""
    if not isinstance(project, str) or not NAME.fullmatch(project) or project in ('.', '..'):
        return None
    base = os.path.realpath(root or PROJECTS)
    home = os.path.join(base, project)
    if not os.path.isfile(os.path.join(home, 'project.json')):
        return None
    data_dir = os.path.join(home, 'data')
    ckpts = os.path.join(data_dir, 'checkpoints')
    for part in (home, data_dir, ckpts):
        if os.path.islink(part):
            return None
    if os.path.commonpath([base, os.path.realpath(home)]) != base:
        return None
    return ckpts


def reachable(graph, start):
    """(node_ids, fn_ids) transitively reached from node `start`."""
    nodes, fns = graph['nodes'], graph['functions']
    seen_n, seen_f, todo = set(), set(), [start]
    while todo:
        i = todo.pop()
        if i in seen_n or i not in nodes:
            continue
        seen_n.add(i)
        n = nodes[i]
        for d in n.get('inputs', ()):
            if d not in seen_n:
                todo.append(d)
        if applies(n):
            f = n['fn']
            if f not in seen_f and f in fns:
                seen_f.add(f)
                todo.append(fns[f]['input'])
                todo.append(fns[f]['body'])
    return sorted(seen_n), sorted(seen_f)


def fingerprint(graph, loop_id, tick, project, root=None, counts=None):
    """32-char hex SHA-256 fingerprint of (loop subgraph, referenced data file contents, tick), or None if a
    referenced data file cannot be read."""
    node_ids, fn_ids = reachable(graph, loop_id)
    nodes = graph['nodes']
    # Include the tile structure referencing this loop (step/tile metadata) as well as nodes/functions/counts.
    sub_nodes = {i: nodes[i] for i in node_ids}
    sub_fns = {f: graph['functions'][f] for f in fn_ids}
    sub_counts = {i: int(counts[i]) for i in node_ids if counts and i in counts}
    paths = sorted({nodes[i]['path'] for i in node_ids
                    if (nodes[i]['op'] == 'source' and nodes[i].get('kind') == 'file')
                    or (nodes[i]['op'] == 'stream' and nodes[i].get('kind') in ('csv', 'text', 'npy'))
                    if data_path(nodes[i].get('path'))})
    file_hashes = []
    for p in paths:
        try:
            body = read_bytes(project, p, root)
        except Refused:
            return None
        file_hashes.append([p, hashlib.sha256(body).hexdigest()])
    payload = json.dumps({
        'v': 1,
        'loop': loop_id,
        'tick': int(tick),
        'nodes': sub_nodes,
        'functions': sub_fns,
        'counts': sub_counts,
        'files': file_hashes,
    }, sort_keys=True, separators=(',', ':')).encode('utf8')
    return hashlib.sha256(payload).hexdigest()[:32]


def expected_shape(node):
    """The numpy array shape of a loop's state: tuple(inner) + (rows, cols)."""
    t = node['type']
    return lengths(t) + (int(t['rows']), int(t['cols']))


def has_any(project, root=None):
    """Whether the project has any checkpoint files under data/checkpoints/."""
    d = checkpoint_dir(project, root)
    if not d or not os.path.isdir(d):
        return False
    try:
        return any(n.endswith('.npy') and not n.endswith('.mask.npy') for n in os.listdir(d))
    except OSError:
        return False


def _paths(folder, fp):
    return (os.path.join(folder, fp + '.npy'),
            os.path.join(folder, fp + '.mask.npy'),
            os.path.join(folder, fp + '.json'))


def _read_meta(meta_path):
    try:
        with open(meta_path, encoding='utf8') as f:
            m = json.load(f)
            return m if is_obj(m) else {}
    except (OSError, ValueError):
        return {}


def load(project, root, fp, shape):
    """Loads the checkpoint for `fp` matching `shape`, or None if missing/corrupt/mismatched."""
    d = checkpoint_dir(project, root)
    if not d or not fp:
        return None
    npy_path, mask_path, meta_path = _paths(d, fp)
    if not os.path.isfile(npy_path) or os.path.islink(npy_path):
        return None
    try:
        with open(npy_path, 'rb') as f:
            body = f.read()
        meta = _read_meta(meta_path)
        mask_body = None
        if meta.get('masked'):
            if not os.path.isfile(mask_path) or os.path.islink(mask_path):
                return None
            with open(mask_path, 'rb') as f:
                mask_body = f.read()
        return A.load_checkpoint(body, shape, mask_body)
    except (OSError, ValueError):
        return None


def _atomic_write(folder, target, data_bytes):
    fd, tmp = tempfile.mkstemp(prefix='.ckpt-', dir=folder)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data_bytes)
        os.chmod(tmp, 0o644)
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def _entry_files(folder, fp):
    return [p for p in _paths(folder, fp) if os.path.isfile(p) and not os.path.islink(p)]


def evict(folder, budget, preserve=None):
    """Evicts oldest non-kept checkpoints until total size under `folder` is <= `budget`."""
    if not os.path.isdir(folder):
        return
    entries = []
    total = 0
    for name in os.listdir(folder):
        if not name.endswith('.npy') or name.endswith('.mask.npy') or name.startswith('.'):
            continue
        fp = name[:-4]
        files = _entry_files(folder, fp)
        size = sum(os.path.getsize(p) for p in files)
        meta = _read_meta(os.path.join(folder, fp + '.json'))
        mtime = os.path.getmtime(os.path.join(folder, name))
        total += size
        if not meta.get('kept') and fp != preserve:
            entries.append((mtime, fp, size, files))
    if total <= budget:
        return
    entries.sort(key=lambda e: e[0])
    for _, _, size, files in entries:
        if total <= budget:
            break
        for p in files:
            try:
                os.unlink(p)
            except OSError:
                pass
        total -= size


def save(project, root, fp, value, tick, loop_id, budget, kept=False):
    """Saves `value` under `<project>/data/checkpoints/<fp>.npy` (+ optional mask + sidecar) and enforces `budget`.
    Returns True if written, False if skipped (e.g. unsaved project or single checkpoint exceeds budget)."""
    d = checkpoint_dir(project, root)
    if not d or not fp:
        return False
    body, mask_body = A.save_checkpoint(value)
    meta = json.dumps({'kept': bool(kept), 'tick': int(tick), 'node': loop_id, 'masked': mask_body is not None}, sort_keys=True).encode('utf8')
    needed = len(body) + (len(mask_body) if mask_body is not None else 0) + len(meta)
    if not kept and budget is not None and needed > budget:
        return False
    try:
        os.makedirs(d, exist_ok=True)
        if os.path.islink(d):
            return False
        npy_path, mask_path, meta_path = _paths(d, fp)
        _atomic_write(d, npy_path, body)
        if mask_body is not None:
            _atomic_write(d, mask_path, mask_body)
        elif os.path.exists(mask_path):
            try:
                os.unlink(mask_path)
            except OSError:
                pass
        _atomic_write(d, meta_path, meta)
        if budget is not None:
            evict(d, budget, preserve=fp)
        return True
    except OSError:
        return False
