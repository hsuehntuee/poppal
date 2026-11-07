#!/usr/bin/env python3
"""
從 sitemap.json（爬出來的頁面元素）+ registry 的別名，產生「版面感知」訓練資料：
  目標（使用者講的項目 / 意圖） + 這一頁可以點的標籤清單 → 該點哪一個（1 個字母）
一次把這個任務練進 270M，之後頁面改了只要重爬 sitemap，不用再手寫規則。

  python tools/llm/gen_ui_data.py   → tools/llm/ui_pick.jsonl（finetune_gemma.py 會自動讀）
"""
import json, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PUB = os.path.join(ROOT, 'assistant', 'public')
random.seed(0)

sitemap = json.load(open(os.path.join(PUB, 'data', 'sitemap.json'), encoding='utf-8'))
registry = json.load(open(os.path.join(PUB, 'data', 'registry.json'), encoding='utf-8'))
CODES = 'ABCDEFGHIJKLMNOPQRSTUVWXYabcdefghijklmnopqrstuvwxy'
GENERIC = {'更多', '確認', '清除', '查詢', '送出', '下一步', '上一步', 'Leaflet', 'OpenStreetMap'}

# 別名：index 裡的 term → entity（頁面上的項目名）
alias = {}
for it in registry['index']:
    if it.get('entity'):
        alias.setdefault(it['entity'], set()).add(it['term'])

# 口語化的「目標」說法
def goals_for(label):
    base = label.replace('*', '').strip()
    out = {base}
    for a in alias.get(base, []):
        out.add(a)
    short = base.split('、')[0].split('(')[0].split('（')[0].strip()
    if 2 <= len(short) < len(base):
        out.add(short)
    tmpl = ['我要{}', '{}', '找{}', '我想點{}', '幫我按{}', '去{}', '{}在哪', '我要選{}', '點{}']
    res = set()
    for g in out:
        if len(g) < 2:
            continue
        for t in random.sample(tmpl, 3):
            res.add(t.format(g))
    return list(res)

rows = []
for url, page in sitemap['pages'].items():
    els = [e for e in page['elements'] if e['label'] and e['label'] not in GENERIC]
    # 去重（同標籤只留一個）
    seen = set()
    cands = []
    for e in els:
        if e['label'] in seen:
            continue
        seen.add(e['label'])
        cands.append(e)
    if len(cands) < 2:
        continue
    cands = cands[:len(CODES) - 1]
    for i, e in enumerate(cands):
        for g in goals_for(e['label']):
            # 每個例子隨機打亂候選順序（不要讓模型學位置）
            order = list(range(len(cands)))
            random.shuffle(order)
            opts = [{'code': CODES[k], 'label': cands[j]['label'], 'desc': cands[j]['kind']} for k, j in enumerate(order)]
            answer = CODES[order.index(i)]
            rows.append({'page': url, 'title': page.get('title', ''), 'goal': g, 'options': opts, 'answer': answer})
    # 「都不是」：目標跟這一頁無關
    for g in random.sample(['我要繳水費', '找廁所', '我要陳情', '今天天氣', '打給1999', '我要投票', '動物園', '聽廣播'], 3):
        order = list(range(len(cands)))
        random.shuffle(order)
        opts = [{'code': CODES[k], 'label': cands[j]['label'], 'desc': cands[j]['kind']} for k, j in enumerate(order)]
        if any(g[-2:] in o['label'] for o in opts):
            continue
        rows.append({'page': url, 'title': page.get('title', ''), 'goal': g, 'options': opts, 'answer': 'Z'})

random.shuffle(rows)
out = os.path.join(HERE, 'ui_pick.jsonl')
with open(out, 'w', encoding='utf-8') as f:
    for r in rows:
        f.write(json.dumps(r, ensure_ascii=False) + '\n')
print(f'wrote {out}: {len(rows)} examples from {len(sitemap["pages"])} pages', file=sys.stderr)
