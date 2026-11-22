"""Numerical verification of projects/transformer against an independent NumPy reference."""
import json
import math
import os
import unittest

from .support import HAVE_NUMPY, all_cells, fixture, needs_numpy

if HAVE_NUMPY:
    import numpy as np
    from backend import check as C
    from backend import run as R


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'projects'))
ROOM = 2 << 30


def _load_csv(rel):
    return np.loadtxt(os.path.join(ROOT, 'transformer', rel), delimiter=',', dtype=np.float32, ndmin=2)


def _rmsnorm(x):
    ms = np.mean(x * x, axis=1, keepdims=True)
    return x / np.sqrt(ms + np.float32(1e-5))


def _gelu(x):
    erf_vec = np.vectorize(math.erf)
    return np.float32(0.5) * x * (np.float32(1.0) + erf_vec(x / np.float32(math.sqrt(2.0))).astype(np.float32))


def _causal_head(n, prefix):
    wq = _load_csv(f'data/{prefix}_wq.csv')
    wk = _load_csv(f'data/{prefix}_wk.csv')
    wv = _load_csv(f'data/{prefix}_wv.csv')
    q = n @ wq
    k = n @ wk
    v = n @ wv
    scores = (q @ k.T) / np.float32(math.sqrt(2.0))
    mask = np.tril(np.ones((4, 4), dtype=bool))
    e = np.where(mask, np.exp(scores), np.float32(0.0))
    p = e / np.sum(e, axis=1, keepdims=True)
    return p @ v


def _attn(n, lp):
    h1 = _causal_head(n, f'{lp}_h1')
    h2 = _causal_head(n, f'{lp}_h2')
    cat = np.concatenate([h1, h2], axis=1)
    wo = _load_csv(f'data/{lp}_wo.csv')
    return cat @ wo


def _mlp(m, lp):
    w1 = _load_csv(f'data/{lp}_w1.csv')
    b1 = _load_csv(f'data/{lp}_b1.csv')
    w2 = _load_csv(f'data/{lp}_w2.csv')
    b2 = _load_csv(f'data/{lp}_b2.csv')
    h = _gelu(m @ w1 + b1)
    return h @ w2 + b2


@needs_numpy
class TransformerExample(unittest.TestCase):

    def test_two_layer_transformer_matches_numpy_reference(self):
        graphs = fixture('graphs.json')
        entry = next(g for g in graphs if g['name'] == 'projects/transformer')
        graph = entry['graph']
        self.assertEqual(C.validate(graph), [])

        by_name = {n['name']: nid for nid, n in graph['nodes'].items() if n.get('op') == 'variable'}
        targets = ['X', 'N1', 'Attn 1', 'H1_attn', 'M1', 'MLP 1', 'H1', 'N2', 'Attn 2', 'H2_attn', 'M2', 'MLP 2', 'Out']
        want = [{'node': by_name[name], 'as': name, 'cells': all_cells(graph['nodes'][by_name[name]]['type'])} for name in targets]

        out = R.run(json.dumps({'graph': graph, 'project': 'transformer', 'want': want}).encode(), ROOT, ROOM)
        self.assertEqual(out['errors'], {})

        ref = {}
        ref['X'] = _load_csv('data/x.csv')
        ref['N1'] = _rmsnorm(ref['X'])
        ref['Attn 1'] = _attn(ref['N1'], 'l1')
        ref['H1_attn'] = ref['X'] + ref['Attn 1']
        ref['M1'] = _rmsnorm(ref['H1_attn'])
        ref['MLP 1'] = _mlp(ref['M1'], 'l1')
        ref['H1'] = ref['H1_attn'] + ref['MLP 1']

        ref['N2'] = _rmsnorm(ref['H1'])
        ref['Attn 2'] = _attn(ref['N2'], 'l2')
        ref['H2_attn'] = ref['H1'] + ref['Attn 2']
        ref['M2'] = _rmsnorm(ref['H2_attn'])
        ref['MLP 2'] = _mlp(ref['M2'], 'l2')
        ref['Out'] = ref['H2_attn'] + ref['MLP 2']

        for name in targets:
            res = out['results'][name]
            got = np.zeros((res['rows'], res['cols']), dtype=np.float32)
            for c, r, v in res['cells']:
                got[r - 1, c - 1] = v
            max_diff = float(np.max(np.abs(got - ref[name])))
            self.assertLess(max_diff, 1e-5, f'{name}: max abs diff {max_diff}')


if __name__ == '__main__':
    unittest.main()
