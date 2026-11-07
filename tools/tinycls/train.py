#!/usr/bin/env python3
"""
tiny 引擎的訓練器：fastText 式的字元 n-gram 分類器（embedding bag + linear）。
只用 numpy，幾秒就訓練完；匯出成 JSON 給 assistant/src/engines/tiny.ts 推論。
前處理與 hash 和 tiny.ts 完全一致（normalizeText / FNV-1a / 'u:' 'n:' 前綴），
所以 Python 和 JS 算出來的 logits 一樣。

用法：
  python tools/tinycls/train.py --set services                 # 讀 data/services.jsonl → public/models/tinycls.services.json
  python tools/tinycls/train.py --set commands
  python tools/tinycls/train.py --set services --eval          # 順便在 testset 上算一次命中率
選項：--dim 32 --buckets 100000 --epochs 60 --lr 0.1
"""
import argparse, base64, json, math, os, re, sys, unicodedata
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PUB = os.path.join(ROOT, 'assistant', 'public')

PUNCT = '。，、！？；：「」『』（）()[]【】《》,.!?;:\'"-_~～…·'

def normalize_text(text: str) -> str:
    t = text.lower()
    t = ''.join(chr(ord(ch) - 0xFEE0) if 0xFF01 <= ord(ch) <= 0xFF5E else ch for ch in t)
    t = re.sub(r'[\s　]+', '', t)
    t = ''.join(ch for ch in t if ch not in PUNCT)
    return t

def fnv1a(s: str) -> int:
    h = 0x811C9DC5
    for b in s.encode('utf-8'):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h

def feature_ids(vocab, buckets, ngram, text):
    chars = list(normalize_text(text))
    V = len(vocab)
    ids = []
    for ch in chars:
        idx = vocab.get(ch)
        ids.append(idx if idx is not None else V + fnv1a('u:' + ch) % buckets)
    for n in range(2, ngram + 1):
        for i in range(len(chars) - n + 1):
            ids.append(V + fnv1a('n:' + ''.join(chars[i:i + n])) % buckets)
    if not ids:
        ids.append(V)
    return ids

def load_jsonl(p):
    rows = []
    with open(p, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                rows.append(json.loads(line))
    return rows

def softmax(z):
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--set', default='services')
    ap.add_argument('--data', default=None)
    ap.add_argument('--dim', type=int, default=32)
    ap.add_argument('--buckets', type=int, default=100000)
    ap.add_argument('--ngram', type=int, default=2)
    ap.add_argument('--epochs', type=int, default=60)
    ap.add_argument('--lr', type=float, default=0.1)
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--eval', action='store_true')
    ap.add_argument('--temperature', type=float, default=1.0)
    args = ap.parse_args()

    data_path = args.data or os.path.join(HERE, 'data', f'{args.set}.jsonl')
    rows = load_jsonl(data_path)
    for extra in ('mined', 'generated', 'en'):
        ep = data_path.replace('.jsonl', f'.{extra}.jsonl')
        if os.path.exists(ep):
            rows += load_jsonl(ep)
            print(f'+ {ep}', file=sys.stderr)
    catalog = json.load(open(os.path.join(PUB, 'data', 'catalog.json'), encoding='utf-8'))
    if args.set == 'services':
        labels = [s['code'] for s in catalog['services']] + [catalog['none_code']]
        # 目錄裡的 examples / keywords / title 也放進訓練
        for s in catalog['services']:
            for ex in [s['title']['zh']] + s['examples'] + s['keywords']:
                rows.append({'text': ex, 'label': s['code']})
    else:
        labels = [o['code'] for o in catalog['commands']['options']]
        for o in catalog['commands']['options']:
            for ex in [o['label']] + o.get('examples', []):
                rows.append({'text': ex, 'label': o['code']})
    lab2i = {l: i for i, l in enumerate(labels)}
    rows = [r for r in rows if r['label'] in lab2i]
    print(f'{len(rows)} training sentences, {len(labels)} labels', file=sys.stderr)

    # 字元表：出現 ≥ 1 次的字
    chars = {}
    for r in rows:
        for ch in normalize_text(r['text']):
            chars[ch] = chars.get(ch, 0) + 1
    vocab = {ch: i for i, ch in enumerate(sorted(chars))}
    V = len(vocab)
    N = V + args.buckets + 1
    rng = np.random.default_rng(args.seed)
    E = (rng.standard_normal((N, args.dim)) * 0.1).astype(np.float32)
    W = np.zeros((len(labels), args.dim), dtype=np.float32)
    b = np.zeros(len(labels), dtype=np.float32)

    feats = [feature_ids(vocab, args.buckets, args.ngram, r['text']) for r in rows]
    y = np.array([lab2i[r['label']] for r in rows])

    # SGD，和 fastText 一樣線性遞減 lr
    total = args.epochs * len(rows)
    step = 0
    for ep in range(args.epochs):
        order = rng.permutation(len(rows))
        loss_sum = 0.0
        for i in order:
            lr = args.lr * (1 - step / total)
            step += 1
            ids = np.array(feats[i])
            x = E[ids].mean(axis=0)
            logits = W @ x + b
            p = softmax(logits)
            loss_sum += -math.log(max(p[y[i]], 1e-9))
            g = p.copy()
            g[y[i]] -= 1.0                      # dL/dlogits
            gx = W.T @ g                        # dL/dx
            W -= lr * np.outer(g, x)
            b -= lr * g
            np.add.at(E, ids, -lr * gx / len(ids))
        if ep % 10 == 0 or ep == args.epochs - 1:
            print(f'epoch {ep:3d} loss {loss_sum / len(rows):.4f}', file=sys.stderr)

    # 量化 embedding 為 int8
    scale = float(np.abs(E).max() / 127.0) or 1.0
    Eq = np.clip(np.round(E / scale), -127, 127).astype(np.int8)
    model = {
        'type': 'tinycls', 'version': 1, 'set': args.set, 'labels': labels,
        'dim': args.dim, 'buckets': args.buckets, 'ngram': args.ngram, 'vocab': vocab,
        'emb_q': base64.b64encode(Eq.tobytes()).decode('ascii'), 'emb_scale': scale,
        'out_w': base64.b64encode(W.astype('<f4').tobytes()).decode('ascii'), 'out_b': b.tolist(),
        'temperature': args.temperature
    }
    out = os.path.join(PUB, 'models', f'tinycls.{args.set}.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(model, f, ensure_ascii=False)
    print(f'wrote {out} ({os.path.getsize(out) / 1e6:.2f} MB), vocab {V}', file=sys.stderr)

    if args.eval and args.set == 'services':
        Ef = Eq.astype(np.float32) * scale
        ts = json.load(open(os.path.join(PUB, 'data', 'testset.json'), encoding='utf-8'))['items']
        hit = n = 0
        for it in ts:
            if it.get('tag') == 'foreign':
                continue
            ids = feature_ids(vocab, args.buckets, args.ngram, it['text'])
            p = softmax((W @ Ef[ids].mean(axis=0) + b) / args.temperature)
            pred = labels[int(p.argmax())]
            ok = pred in {it['expect'], *it.get('alt', [])}
            hit += ok
            n += 1
            if not ok:
                print(f'  ✗ {it["text"]}  expect {it["expect"]} got {pred} ({p.max():.2f})', file=sys.stderr)
        print(f'testset top-1 accuracy: {hit}/{n} = {hit / n:.3f}', file=sys.stderr)

if __name__ == '__main__':
    main()
