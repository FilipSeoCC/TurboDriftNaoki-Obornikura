"""
Odtwarza assets/fly-circuit.json — obwód „wzrok → skręt / ucieczka” muchy owocówki
wycięty z pełnego konektomu FlyWire v783.

Krok po kroku:
  1. Ładuje pełny mózg (138 639 neuronów, 15 mln połączeń) z danych Shiu et al. 2024
     i typy komórek z adnotacji FlyWire (Schlegel et al. 2024).
  2. Symuluje CAŁY mózg modelem LIF z parametrami Shiu et al. (krok 0,1 ms) przy
     28 kombinacjach bodźców, które może dać gra (linia z lewej/prawej, mur z lewej/prawej).
  3. Zostawia neurony, które choć raz wystrzeliły, + wszystkie wejścia i wyjścia.
     Neuron, który nigdy nie strzela, nie wpływa na nic (synapsy działają tylko przez impulsy),
     więc wycięcie reszty nie zmienia odpowiedzi obwodu na te bodźce.
  4. Sprawdza okrojony obwód z pełnym mózgiem na nowych, losowych bodźcach.
  5. Zapisuje JSON z macierzą połączeń w formacie CSR (base64), ~800 KB / ~325 KB gzip.

Użycie (Python 3.10+, pip install numpy scipy pandas pyarrow):
  git clone --depth 1 https://github.com/philshiu/Drosophila_brain_model shiu
  git clone --depth 1 https://github.com/flyconnectome/flywire_annotations ann
  python tools/fly/extract_circuit.py shiu ann assets/fly-circuit.json

Pełny przebieg trwa ~5 minut na laptopie.
"""
import base64, json, sys, time
import numpy as np, pandas as pd, scipy.sparse as sp

# Parametry modelu 1:1 z Shiu et al. 2024 (model.py, default_params). Jednostki: mV, ms.
P = dict(v0=-52.0, vrst=-52.0, vth=-45.0, tm=20.0, tau=5.0, trf=2.2, dly=1.8, wsyn=0.275, fpoi=250, dt=0.1)

INPUTS = {  # bodziec z gry -> (typy komórek, półkula)
    'tgtL': (['LC10a'], 'left'), 'tgtR': (['LC10a'], 'right'),
    'loomL': (['LPLC2', 'LC4'], 'left'), 'loomR': (['LPLC2', 'LC4'], 'right'),
}
OUTPUT_TYPES = ['DNa01', 'DNa02', 'DNp01', 'MDN']


def load(shiu_dir, ann_dir):
    comp = pd.read_csv(f'{shiu_dir}/Completeness_783.csv')
    ids = comp.iloc[:, 0].astype(str).values
    con = pd.read_parquet(f'{shiu_dir}/Connectivity_783.parquet',
                          columns=['Presynaptic_Index', 'Postsynaptic_Index', 'Excitatory x Connectivity'])
    n = len(ids)
    W = sp.csr_matrix((con['Excitatory x Connectivity'].values.astype(np.float32),
                       (con['Presynaptic_Index'].values, con['Postsynaptic_Index'].values)), shape=(n, n))
    ann = pd.read_csv(f'{ann_dir}/supplemental_files/Supplemental_file1_neuron_annotations.tsv', sep='\t',
                      dtype={'root_id': str}, low_memory=False, usecols=['root_id', 'cell_type', 'side'])
    idx = pd.Series(np.arange(n), index=ids)
    ann = ann[ann.root_id.isin(idx.index)].copy()
    ann['i'] = idx[ann.root_id].values
    return ids, W, ann


def group(ann, types, side):
    return ann[ann.cell_type.isin(types) & (ann.side == side)].i.values


def run(W, inputs, T_ms, seed):
    """Sterowana zdarzeniami symulacja LIF (te same równania co model Brian2 Shiu et al.)."""
    p = P; rng = np.random.default_rng(seed)
    n = W.shape[0]; dt = p['dt']; d = int(round(p['dly'] / dt))
    v = np.full(n, p['v0'], np.float32); g = np.zeros(n, np.float32)
    ref = np.zeros(n, np.float32); counts = np.zeros(n, np.int32)
    buf = [np.empty(0, np.int64)] * (d + 1)
    w = p['wsyn']; wp = w * p['fpoi']; dec_g = np.exp(-dt / p['tau'])
    for t in range(int(T_ms / dt)):
        arrived = buf[t % (d + 1)]
        if arrived.size:
            g += np.asarray(W[arrived].sum(axis=0)).ravel() * w
        for idx, rate in inputs.values():
            hit = idx[rng.random(idx.size) < rate * dt / 1000.0]
            if hit.size: g[hit] += wp
        active = ref <= 0
        v[active] += (p['v0'] - v[active] + g[active]) * dt / p['tm']
        g[active] *= dec_g
        ref -= dt
        spk = np.nonzero(v > p['vth'])[0]
        v[spk] = p['vrst']; g[spk] = 0; ref[spk] = p['trf']
        counts[spk] += 1
        buf[t % (d + 1)] = spk
    return counts


def main(shiu_dir, ann_dir, out_path):
    ids, W, ann = load(shiu_dir, ann_dir)
    G = {k: np.concatenate([group(ann, [t], s) for t in types]) for k, (types, s) in INPUTS.items()}
    OUT = {f'{t}_{s}': group(ann, [t], s) for t in OUTPUT_TYPES for s in ('left', 'right')}
    print('wejścia', {k: v.size for k, v in G.items()}, 'wyjścia', {k: v.size for k, v in OUT.items()})

    # 2. przegląd bodźców na pełnym mózgu
    ever = np.zeros(W.shape[0], np.int64)
    k = 0
    for tl, tr in [(150, 0), (0, 150), (80, 0), (0, 80), (150, 60), (60, 150), (0, 0)]:
        for ll, lr in [(0, 0), (150, 0), (0, 150), (100, 100)]:
            cond = dict(tgtL=tl, tgtR=tr, loomL=ll, loomR=lr)
            t0 = time.time()
            ever += run(W, {g: (G[g], r) for g, r in cond.items() if r > 0}, 400.0, seed=k)
            print(f'{k:2d} {cond} {time.time()-t0:.0f}s, aktywne łącznie: {(ever > 0).sum()}', flush=True)
            k += 1

    # 3. wycięcie obwodu
    keep = np.union1d(np.nonzero(ever > 0)[0], np.concatenate(list(G.values()) + list(OUT.values())))
    remap = -np.ones(W.shape[0], np.int64); remap[keep] = np.arange(keep.size)
    Ws = W[keep][:, keep].tocsr(); Ws.eliminate_zeros(); Ws.sort_indices()
    print('obwód:', keep.size, 'neuronów,', Ws.nnz, 'połączeń,', int(abs(Ws).sum()), 'synaps')

    # 4. walidacja na nowych bodźcach
    Gs = {k: remap[v] for k, v in G.items()}; Os = {k: remap[v] for k, v in OUT.items()}
    rng = np.random.default_rng(42); err = []
    for k in range(6):
        cond = {g: float(rng.choice([0, 50, 90, 130])) for g in G}
        a = run(W, {g: (G[g], r) for g, r in cond.items() if r > 0}, 400.0, 100 + k)
        b = run(Ws, {g: (Gs[g], r) for g, r in cond.items() if r > 0}, 400.0, 100 + k)
        err += [abs(a[OUT[o]].mean() - b[Os[o]].mean()) / 0.4 for o in OUT]
    print(f'różnica pełny mózg vs obwód: średnio {np.mean(err):.2f} Hz, maks. {np.max(err):.1f} Hz')

    # 5. zapis
    sub = ann.set_index('i').reindex(keep)
    b64 = lambda a: base64.b64encode(a.tobytes()).decode()
    data = Ws.data.astype(np.int64)
    assert np.abs(data).max() < 32768 and Ws.shape[0] < 65536
    out = {
        'source': 'FlyWire v783 connectome (Dorkenwald et al. 2024, Schlegel et al. 2024) via Shiu et al. 2024 model data',
        'license_note': 'Connectome: FlyWire Consortium (Dorkenwald et al. 2024 Nature; Schlegel et al. 2024 Nature). '
                        'Edge table and LIF parameters: Shiu et al. 2024 Nature, github.com/philshiu/Drosophila_brain_model (MIT).',
        'params': {k: P[k] for k in ['v0', 'vrst', 'vth', 'tm', 'tau', 'trf', 'dly', 'wsyn', 'fpoi']},
        'n': int(keep.size),
        'root_ids': [ids[i] for i in keep],
        'type': [t if isinstance(t, str) else '' for t in sub.cell_type.values],
        'side': [{'left': 'L', 'right': 'R'}.get(s, '') for s in sub.side.values],
        'rowptr': b64(Ws.indptr.astype('<u4')), 'post': b64(Ws.indices.astype('<u2')), 'w': b64(data.astype('<i2')),
        'inputs': {k: v.tolist() for k, v in Gs.items()},
        'outputs': {k: v.tolist() for k, v in Os.items()},
    }
    with open(out_path, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print('zapisano', out_path)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
