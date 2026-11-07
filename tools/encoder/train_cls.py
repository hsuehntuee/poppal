#!/usr/bin/env python3
"""
把多語小型編碼器（預設 intfloat/multilingual-e5-small，Microsoft）微調成服務分類器，
然後**裁剪詞表**（25 萬個 token 只留我們用得到的）+ ONNX int8，讓手機 WebView 用 transformers.js 直接跑。

  python tools/encoder/train_cls.py                      # 訓練 + 匯出到 assistant/public/models/cls-services/
  python tools/encoder/train_cls.py --no-prune           # 不裁詞表（檔案大、但 tokenizer 原封不動）
  python tools/encoder/train_cls.py --base microsoft/Multilingual-MiniLM-L12-H384
  python tools/encoder/train_cls.py --eval               # 順便在 testset 上算 top-1

輸出目錄的格式和 transformers.js 的 text-classification pipeline 相容：
  config.json  tokenizer.json  tokenizer_config.json  special_tokens_map.json  onnx/model_quantized.onnx
"""
import argparse, json, os, sys, time, random, re
import numpy as np
import torch
from torch import nn

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PUB = os.path.join(ROOT, 'assistant', 'public')
TINY_DATA = os.path.join(ROOT, 'tools', 'tinycls', 'data')


def load_jsonl(p):
    rows = []
    with open(p, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                rows.append(json.loads(line))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='intfloat/multilingual-e5-small')
    ap.add_argument('--set', default='services')
    ap.add_argument('--out', default=None)
    ap.add_argument('--epochs', type=int, default=12)
    ap.add_argument('--lr', type=float, default=5e-5)
    ap.add_argument('--batch', type=int, default=16)
    ap.add_argument('--max-len', type=int, default=48)
    ap.add_argument('--no-prune', action='store_true')
    ap.add_argument('--eval', action='store_true')
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--resume', action='store_true', help='跳過訓練，載入上次存的 checkpoint 再做裁剪/匯出')
    args = ap.parse_args()
    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed)
    out_dir = args.out or os.path.join(PUB, 'models', f'cls-{args.set}')

    from transformers import AutoTokenizer, AutoModel, AutoConfig

    catalog = json.load(open(os.path.join(PUB, 'data', 'catalog.json'), encoding='utf-8'))
    rows = load_jsonl(os.path.join(TINY_DATA, f'{args.set}.jsonl'))
    for extra in ('mined', 'generated', 'en'):
        ep = os.path.join(TINY_DATA, f'{args.set}.{extra}.jsonl')
        if os.path.exists(ep):
            rows += load_jsonl(ep)
            print(f'+ {ep}', file=sys.stderr)
    if args.set == 'services':
        labels = [s['code'] for s in catalog['services']] + [catalog['none_code']]
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
    texts = [r['text'] for r in rows]
    y = torch.tensor([lab2i[r['label']] for r in rows])
    print(f'{len(rows)} sentences, {len(labels)} labels, base {args.base}', file=sys.stderr)

    tok = AutoTokenizer.from_pretrained(args.base)
    enc_model = AutoModel.from_pretrained(args.base)
    prefix = 'query: ' if 'e5' in args.base else ''

    class Clf(nn.Module):
        def __init__(self, enc, n):
            super().__init__()
            self.enc = enc
            self.drop = nn.Dropout(0.1)
            self.head = nn.Linear(enc.config.hidden_size, n)

        def forward(self, input_ids, attention_mask):
            h = self.enc(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
            m = attention_mask.unsqueeze(-1).float()
            pooled = (h * m).sum(1) / m.sum(1).clamp(min=1)   # mean pooling，和 e5 一致
            return self.head(self.drop(pooled))

    model = Clf(enc_model, len(labels))
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model.to(device)
    ckpt = os.path.join(HERE, 'ckpt', f'cls-{args.set}.ckpt.pt')  # 不放 public/，免得被打包進網站
    if args.resume and not os.path.exists(ckpt) and os.path.exists(os.path.join(HERE, 'ckpt', 'cls-services.ckpt.pt')):
        ckpt = os.path.join(HERE, 'ckpt', 'cls-services.ckpt.pt')
    if args.resume and os.path.exists(ckpt):
        model.load_state_dict(torch.load(ckpt, map_location=device))
        print('resumed from', ckpt, file=sys.stderr)
        args.epochs = 0
    opt = torch.optim.AdamW([
        {'params': model.enc.parameters(), 'lr': args.lr},
        {'params': model.head.parameters(), 'lr': args.lr * 20}
    ], weight_decay=0.01)
    steps = args.epochs * ((len(rows) + args.batch - 1) // args.batch)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: max(0.0, 1 - s / max(steps, 1)))
    lossf = nn.CrossEntropyLoss(label_smoothing=0.05)

    def batches():
        idx = list(range(len(rows)))
        random.shuffle(idx)
        for i in range(0, len(idx), args.batch):
            b = idx[i:i + args.batch]
            e = tok([prefix + texts[j] for j in b], padding=True, truncation=True, max_length=args.max_len, return_tensors='pt')
            yield e['input_ids'].to(device), e['attention_mask'].to(device), y[b].to(device)

    t0 = time.time()
    model.train()
    for ep in range(args.epochs):
        tot = 0.0; n = 0
        for ids, am, yb in batches():
            logits = model(ids, am)
            loss = lossf(logits, yb)
            opt.zero_grad(); loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step()
            tot += loss.item() * len(yb); n += len(yb)
        print(f'epoch {ep + 1}/{args.epochs} loss {tot / n:.4f}  ({time.time() - t0:.0f}s)', file=sys.stderr)
    model.eval()
    model.to('cpu')
    if args.epochs > 0:
        os.makedirs(os.path.dirname(ckpt), exist_ok=True)
        torch.save(model.state_dict(), ckpt)
        print('checkpoint', ckpt, file=sys.stderr)

    # ---------- 裁剪詞表 ----------
    keep_tok = tok
    if not args.no_prune:
        tokenizer_json = json.load(open(os.path.join(tok.name_or_path if os.path.isdir(tok.name_or_path) else _hf_file(args.base, 'tokenizer.json')), encoding='utf-8'))
        assert tokenizer_json['model']['type'] == 'Unigram', 'vocab pruning 只實作了 Unigram（XLM-R 系列）'
        keep = set(tok.all_special_ids)
        for at in tokenizer_json.get('added_tokens', []):
            keep.add(at['id'])
        # 1) 特殊 token、ASCII 與常用符號的單字 token
        for t_, i in tok.get_vocab().items():
            if i < 5 or (len(t_.lstrip('▁')) == 1 and ord(t_.lstrip('▁')[-1]) < 0x3000) or t_ in ('▁',):
                keep.add(i)
        # 2) 訓練句 + 測試集 + 目錄文字 + 文案 實際用到的 token
        corpus = texts[:]
        ts = os.path.join(PUB, 'data', 'testset.json')
        corpus += [it['text'] for it in json.load(open(ts, encoding='utf-8'))['items']]
        for lang in ['zh', 'en', 'vi', 'id', 'th']:
            cp = os.path.join(PUB, 'data', f'copy.{lang}.json')
            if os.path.exists(cp):
                corpus += list(json.load(open(cp, encoding='utf-8')).values())
        for s in catalog['services']:
            corpus += list(s['title'].values()) + [s['desc']] + s['keywords'] + s['examples']
        extra = os.path.join(HERE, 'extra_vocab.txt')   # 可放常用中文字清單
        if os.path.exists(extra):
            corpus += open(extra, encoding='utf-8').read().split()
        for t_ in corpus:
            keep.update(tok(prefix + t_, add_special_tokens=True)['input_ids'])
        # 3) 詞表裡所有「單一 CJK 字」的 token：沒看過的中文句子也能切成字
        for t_, i in tok.get_vocab().items():
            core = t_.lstrip('▁')
            if len(core) == 1 and 0x4E00 <= ord(core) <= 0x9FFF:
                keep.add(i)
        keep = sorted(keep)
        old2new = {o: n for n, o in enumerate(keep)}
        print(f'vocab {len(tok)} → {len(keep)}', file=sys.stderr)

        # 重建 tokenizer.json
        vocab_list = tokenizer_json['model']['vocab']           # [[piece, score], ...] 依 id 排序
        new_vocab = [vocab_list[o] for o in keep]
        tokenizer_json['model']['vocab'] = new_vocab
        tokenizer_json['model']['unk_id'] = old2new[tokenizer_json['model']['unk_id']]
        for at in tokenizer_json.get('added_tokens', []):
            at['id'] = old2new[at['id']]
        for key in ('post_processor',):
            pp = tokenizer_json.get(key) or {}
            for st in (pp.get('special_tokens') or {}).values():
                st['ids'] = [old2new[i] for i in st['ids']]
        os.makedirs(out_dir, exist_ok=True)
        json.dump(tokenizer_json, open(os.path.join(out_dir, 'tokenizer.json'), 'w', encoding='utf-8'), ensure_ascii=False)
        # 縮小 embedding
        emb = model.enc.embeddings.word_embeddings
        new_emb = nn.Embedding(len(keep), emb.embedding_dim, padding_idx=old2new.get(emb.padding_idx, 0) if emb.padding_idx is not None else None)
        new_emb.weight.data = emb.weight.data[keep].clone()
        model.enc.embeddings.word_embeddings = new_emb
        model.enc.config.vocab_size = len(keep)
        model.enc.config.pad_token_id = old2new.get(tok.pad_token_id, 0)
        from transformers import PreTrainedTokenizerFast
        keep_tok = PreTrainedTokenizerFast(tokenizer_file=os.path.join(out_dir, 'tokenizer.json'),
                                           bos_token=tok.bos_token, eos_token=tok.eos_token, unk_token=tok.unk_token,
                                           sep_token=tok.sep_token, pad_token=tok.pad_token, cls_token=tok.cls_token, mask_token=tok.mask_token)
        # 檢查：裁剪前後 tokenization 對訓練句結果一樣
        bad = 0
        for t_ in texts[:200]:
            a = [old2new.get(i, -1) for i in tok(prefix + t_)['input_ids']]
            b = keep_tok(prefix + t_)['input_ids']
            bad += a != b
        print(f'tokenization mismatches after pruning: {bad}/200', file=sys.stderr)

    # ---------- 匯出 ----------
    os.makedirs(os.path.join(out_dir, 'onnx'), exist_ok=True)
    keep_tok.save_pretrained(out_dir)
    cfg = model.enc.config.to_dict()
    cfg.update({
        'architectures': ['XLMRobertaForSequenceClassification' if 'roberta' in cfg.get('model_type', '') else 'BertForSequenceClassification'],
        'id2label': {str(i): l for i, l in enumerate(labels)},
        'label2id': {l: i for i, l in enumerate(labels)},
        'tp_prefix': prefix,
        'tp_set': args.set,
        'tp_pooling': 'mean'
    })
    json.dump(cfg, open(os.path.join(out_dir, 'config.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False)

    class Export(nn.Module):
        def __init__(self, m):
            super().__init__(); self.m = m
        def forward(self, input_ids, attention_mask):
            return self.m(input_ids, attention_mask)

    ex = keep_tok([prefix + '我要繳水費', prefix + 'hello'], padding=True, return_tensors='pt')
    fp32 = os.path.join(out_dir, 'onnx', 'model.onnx')
    torch.onnx.export(Export(model), (ex['input_ids'], ex['attention_mask']), fp32,
                      input_names=['input_ids', 'attention_mask'], output_names=['logits'],
                      dynamic_axes={'input_ids': {0: 'batch', 1: 'seq'}, 'attention_mask': {0: 'batch', 1: 'seq'}, 'logits': {0: 'batch'}},
                      opset_version=14, dynamo=False)
    from onnxruntime.quantization import quantize_dynamic, QuantType
    q = os.path.join(out_dir, 'onnx', 'model_quantized.onnx')
    quantize_dynamic(fp32, q, weight_type=QuantType.QUInt8)
    os.remove(fp32)
    print(f'wrote {q} ({os.path.getsize(q) / 1e6:.1f} MB)', file=sys.stderr)

    # ---------- 評測 ----------
    if args.eval and args.set == 'services':
        import onnxruntime as ort
        sess = ort.InferenceSession(q, providers=['CPUExecutionProvider'])
        items = json.load(open(os.path.join(PUB, 'data', 'testset.json'), encoding='utf-8'))['items']
        hit = n = 0
        t0 = time.time()
        for it in items:
            if it.get('tag') == 'foreign':
                continue
            e = keep_tok(prefix + it['text'], return_tensors='np')
            logits = sess.run(None, {'input_ids': e['input_ids'].astype(np.int64), 'attention_mask': e['attention_mask'].astype(np.int64)})[0][0]
            pred = labels[int(logits.argmax())]
            ok = pred in {it['expect'], *it.get('alt', [])}
            hit += ok; n += 1
            if not ok:
                p = np.exp(logits - logits.max()); p /= p.sum()
                print(f'  ✗ {it["text"]}  expect {it["expect"]} got {pred} ({p.max():.2f})', file=sys.stderr)
        print(f'testset top-1: {hit}/{n} = {hit / n:.3f}  ({(time.time() - t0) * 1000 / n:.1f} ms/句 CPU int8)', file=sys.stderr)


def _hf_file(repo, name):
    from huggingface_hub import hf_hub_download
    return hf_hub_download(repo, name)


if __name__ == '__main__':
    main()
