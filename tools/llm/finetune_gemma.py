#!/usr/bin/env python3
"""
把 Gemma 3 270M（Google）LoRA 微調成「1 個 token 的決策器」：
  固定前綴（服務清單）+ 使用者：句子 + 答案： → 只對最後一個字母算 loss。
訓練完合併 LoRA、存成 HF 格式，再轉 GGUF（Q8_0）給 llama-server / 手機用。
prompt 由 assistant/scripts/dump-prompts.ts 倒出，和前端推論一字不差。

  pnpm -s tsx scripts/dump-prompts.ts          # 在 assistant/ 裡先跑
  python tools/llm/finetune_gemma.py            # 訓練 + 合併 + 匯出 HF + 轉 GGUF
  python tools/llm/finetune_gemma.py --eval-only --hf tools/llm/out/gemma-270m-decider-hf

需要：torch(CUDA)、transformers、peft、gguf；llama.cpp 的 convert_hf_to_gguf.py（會自動抓）與 llama-quantize.exe。
"""
import argparse, json, os, random, sys, time, subprocess, urllib.request
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PUB = os.path.join(ROOT, 'assistant', 'public')
TINY_DATA = os.path.join(ROOT, 'tools', 'tinycls', 'data')
LLAMA_DIR = os.path.join(ROOT, 'tools', 'llama')
LLAMA_TAG = 'b12180'


def load_jsonl(p):
    rows = []
    if not os.path.exists(p):
        return rows
    with open(p, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                rows.append(json.loads(line))
    return rows


def build_prefix(options, instruction, none_code):
    """assistant/src/core/prompt.ts 的 buildPrefix 的 Python 版，一字不差（main() 會和 prompts.json 核對）"""
    lines = [instruction, '']
    for o in options:
        lines.append(f"{o['code']} {o['label']}：{o['desc']}")
    lines += ['', '規則：只回答一個代號字母。如果都不符合就回答 ' + none_code + '。', '']
    cands = [o for o in options if o['code'] != none_code]
    pick = cands[max(0, len(cands) - 2)] if cands else None
    if pick:
        ex = (pick.get('examples') or [None])[0] or pick['label']
        lines += [f'使用者：{ex}', f"答案：{pick['code']}", '']
    lines += ['使用者：今天天氣真好', f'答案：{none_code}', '']
    return '\n'.join(lines)


UI_INSTRUCTION = '你是畫面導覽員。下面是畫面上可以點的東西，選出為了達成目標應該點的那一個，只輸出一個字母。'


def ui_examples(prompts):
    """版面感知：目標 + 這一頁可點的標籤 → 字母（tools/llm/gen_ui_data.py 產生）"""
    rows = load_jsonl(os.path.join(HERE, 'ui_pick.jsonl'))
    ex = []
    for r in rows:
        options = [{'code': o['code'], 'label': o['label'], 'desc': o['desc']} for o in r['options']]
        options.append({'code': 'Z', 'label': '都不是', 'desc': '沒有適合的'})
        prefix = build_prefix(options, UI_INSTRUCTION, 'Z')
        text = f"目標：{r['goal']}。這一步：{r['title'] or '這一頁'}"
        q = prompts['query_format'].format(text=text, context='')
        ex.append((prefix + q, r['answer']))
    return ex


def build_examples(prompts, catalog):
    """回傳 [(prompt_text, answer_letter)]，服務集 + 指令集一起練"""
    ex = []
    # 服務
    rows = load_jsonl(os.path.join(TINY_DATA, 'services.jsonl')) + load_jsonl(os.path.join(TINY_DATA, 'services.mined.jsonl')) + load_jsonl(os.path.join(TINY_DATA, 'services.generated.jsonl'))
    for s in catalog['services']:
        for t in [s['title']['zh']] + s['examples'] + s['keywords']:
            rows.append({'text': t, 'label': s['code']})
    labels = set(prompts['services']['labels'])
    for r in rows:
        if r['label'] in labels:
            q = prompts['query_format'].format(text=r['text'], context='')
            ex.append((prompts['services']['prefix'] + q, r['label']))
    # 指令（帶「目前步驟」）
    contexts = ['輸入水號', '點「水費」', '按「查詢」', '按「前往繳費」', '選一種付款方式', '點你要去的機關']
    rows = load_jsonl(os.path.join(TINY_DATA, 'commands.jsonl'))
    for o in catalog['commands']['options']:
        for t in [o['label']] + o.get('examples', []):
            rows.append({'text': t, 'label': o['code']})
    labels = set(prompts['commands']['labels'])
    for r in rows:
        if r['label'] in labels:
            ctx = prompts['context_format'].format(context=random.choice(contexts))
            q = prompts['query_format'].format(text=r['text'], context=ctx)
            ex.append((prompts['commands']['prefix'] + q, r['label']))
    ex += ui_examples(prompts)
    return ex


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='unsloth/gemma-3-270m-it')   # google/gemma-3-270m-it 的未 gated 鏡像
    ap.add_argument('--out', default=os.path.join(HERE, 'out'))
    ap.add_argument('--epochs', type=int, default=3)
    ap.add_argument('--lr', type=float, default=2e-4)
    ap.add_argument('--batch', type=int, default=4)
    ap.add_argument('--accum', type=int, default=4)
    # 訓練時 PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True 可減少碎片
    ap.add_argument('--rank', type=int, default=16)
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--eval-only', action='store_true')
    ap.add_argument('--hf', default=None, help='已經合併好的 HF 目錄（eval-only 用）')
    ap.add_argument('--no-gguf', action='store_true')
    ap.add_argument('--quant', default='Q8_0')
    args = ap.parse_args()
    random.seed(args.seed); torch.manual_seed(args.seed)

    from transformers import AutoTokenizer, AutoModelForCausalLM
    prompts = json.load(open(os.path.join(HERE, 'prompts.json'), encoding='utf-8'))
    catalog = json.load(open(os.path.join(PUB, 'data', 'catalog.json'), encoding='utf-8'))
    # 核對：Python 版 buildPrefix 必須和前端一字不差
    svc_opts = [{'code': s_['code'], 'label': s_['title']['zh'], 'desc': s_['desc'], 'examples': s_['examples']} for s_ in catalog['services']]
    svc_opts.append({'code': catalog['none_code'], 'label': '都不是', 'desc': '以上都不是，或是跟市政服務無關', 'examples': ['今天天氣真好', '你是誰', '唱首歌給我聽', 'hello']})
    assert build_prefix(svc_opts, catalog['instruction'], catalog['none_code']) == prompts['services']['prefix'], 'build_prefix 和 prompts.json 不一致，先跑 pnpm -s tsx scripts/dump-prompts.ts 並檢查 prompt.ts'
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    dtype = torch.bfloat16 if device == 'cuda' else torch.float32
    hf_dir = args.hf or os.path.join(args.out, 'gemma-270m-decider-hf')

    if not args.eval_only:
        tok = AutoTokenizer.from_pretrained(args.base)
        model = AutoModelForCausalLM.from_pretrained(args.base, torch_dtype=dtype, attn_implementation='eager')
        model.to(device)
        model.gradient_checkpointing_enable()
        model.config.use_cache = False
        from peft import LoraConfig, get_peft_model
        lcfg = LoraConfig(r=args.rank, lora_alpha=args.rank * 2, lora_dropout=0.05, bias='none', task_type='CAUSAL_LM',
                          target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'])
        model = get_peft_model(model, lcfg)
        model.print_trainable_parameters()

        examples = build_examples(prompts, catalog)
        print(f'{len(examples)} training examples', file=sys.stderr)
        # 檢查答案字母都是單一 token，而且 prompt 結尾 tokenization 穩定
        letter_ids = {}
        for L in set(a for _, a in examples):
            ids = tok(L, add_special_tokens=False)['input_ids']
            assert len(ids) == 1, f'letter {L} is not a single token: {ids}'
            letter_ids[L] = ids[0]

        # 左側 padding：答案字母永遠在最後一個位置，就只需要算最後一個位置的 logits（26 萬詞表，省下好幾 GB）
        tok.padding_side = 'left'

        def encode(batch):
            # 輸入只到「答案：」，最後一個位置的 logits 要預測的才是答案字母（不能把答案放進輸入！）
            texts = [p for p, _ in batch]
            enc = tok(texts, return_tensors='pt', padding=True, add_special_tokens=True)
            target = torch.tensor([letter_ids[a] for _, a in batch])
            return enc['input_ids'], enc['attention_mask'], target
        opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=args.lr, weight_decay=0.0)
        steps_per_epoch = (len(examples) + args.batch - 1) // args.batch
        total = args.epochs * steps_per_epoch // args.accum
        sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / 10) * max(0.0, 1 - s / max(1, total)))
        model.train()
        t0 = time.time(); step = 0
        for ep in range(args.epochs):
            random.shuffle(examples)
            tot = 0.0; n = 0
            for i in range(0, len(examples), args.batch):
                ids, am, target = encode(examples[i:i + args.batch])
                out = model(input_ids=ids.to(device), attention_mask=am.to(device), logits_to_keep=1)
                loss = torch.nn.functional.cross_entropy(out.logits[:, -1, :].float(), target.to(device))
                (loss / args.accum).backward()
                tot += loss.item(); n += 1
                if n % args.accum == 0:
                    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                    opt.step(); sched.step(); opt.zero_grad(); step += 1
                if n % 20 == 0:
                    print(f'epoch {ep + 1} batch {n}/{steps_per_epoch} loss {tot / n:.4f} ({time.time() - t0:.0f}s)', file=sys.stderr)
            print(f'== epoch {ep + 1}/{args.epochs} loss {tot / max(n, 1):.4f} ({time.time() - t0:.0f}s)', file=sys.stderr)
        model.eval()
        merged = model.merge_and_unload()
        merged.config.use_cache = True
        os.makedirs(hf_dir, exist_ok=True)
        merged.save_pretrained(hf_dir, safe_serialization=True)
        tok.save_pretrained(hf_dir)
        print('saved', hf_dir, file=sys.stderr)
        del model, merged
        torch.cuda.empty_cache() if device == 'cuda' else None

    # ---------- 評測（HF 權重，logits 只看字母） ----------
    tok = AutoTokenizer.from_pretrained(hf_dir)
    model = AutoModelForCausalLM.from_pretrained(hf_dir, torch_dtype=dtype).to(device).eval()
    labels = prompts['services']['labels']
    lid = [tok(L, add_special_tokens=False)['input_ids'][0] for L in labels]
    items = json.load(open(os.path.join(PUB, 'data', 'testset.json'), encoding='utf-8'))['items']
    hit = n = 0; conf = []
    with torch.no_grad():
        for it in items:
            if it.get('tag') == 'foreign':
                continue
            q = prompts['query_format'].format(text=it['text'], context='')
            enc = tok(prompts['services']['prefix'] + q, return_tensors='pt').to(device)
            logits = model(**enc, logits_to_keep=1).logits[0, -1].float()
            lp = torch.log_softmax(logits[lid], -1)
            pred = labels[int(lp.argmax())]
            ok = pred in {it['expect'], *it.get('alt', [])}
            hit += ok; n += 1; conf.append(float(lp.max().exp()))
            if not ok:
                print(f'  ✗ {it["text"]}  expect {it["expect"]} got {pred} ({lp.max().exp():.2f})', file=sys.stderr)
    print(f'testset top-1 (HF): {hit}/{n} = {hit / n:.3f}, median conf {sorted(conf)[len(conf) // 2]:.2f}', file=sys.stderr)

    if args.no_gguf or args.eval_only:
        return
    # ---------- 轉 GGUF ----------
    # 轉換器要跟 conversion/ 與 gguf-py/ 一起用，來自同一個 tag 的 sparse checkout：
    #   git clone --depth 1 --branch b12180 --filter=blob:none --sparse https://github.com/ggml-org/llama.cpp tools/llama-src
    #   cd tools/llama-src && git sparse-checkout set conversion gguf-py convert_hf_to_gguf.py
    conv = os.path.join(ROOT, 'tools', 'llama-src', 'convert_hf_to_gguf.py')
    if not os.path.exists(conv):
        raise SystemExit('缺少 tools/llama-src/convert_hf_to_gguf.py，請先照上面的指令 sparse checkout llama.cpp ' + LLAMA_TAG)
    f16 = os.path.join(args.out, 'gemma-3-270m-decider-F16.gguf')
    subprocess.check_call([sys.executable, conv, hf_dir, '--outfile', f16, '--outtype', 'f16'])
    quant = os.path.join(args.out, f'gemma-3-270m-decider-{args.quant}.gguf')
    qexe = os.path.join(LLAMA_DIR, 'llama-quantize.exe' if os.name == 'nt' else 'llama-quantize')
    subprocess.check_call([qexe, f16, quant, args.quant])
    print('wrote', quant, f'{os.path.getsize(quant) / 1e6:.0f} MB', file=sys.stderr)
    print(f'test: {os.path.join(LLAMA_DIR, "llama-server")} -m {quant} --port 8080 -ngl 99 && pnpm eval --engine llm --name gemma-270m-decider', file=sys.stderr)


if __name__ == '__main__':
    main()
