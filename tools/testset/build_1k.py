#!/usr/bin/env python3
"""Build assistant/public/data/testset_1k.json from src*.txt (hand-written, see format in src1.txt).
Drops any sentence that already exists in a training jsonl / catalog / the 97-item testset."""
import json, os, re, glob, collections, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PUB = os.path.join(ROOT, 'assistant/public/data')
norm = lambda s: re.sub(r'[\s，。？！,.?!、~～「」"\']+', '', s).lower()
cat = json.load(open(f'{PUB}/catalog.json', encoding='utf8'))
train = set()
for p in glob.glob(f'{ROOT}/tools/tinycls/data/*.jsonl') + [f'{ROOT}/tools/llm/ui_pick.jsonl']:
    for line in open(p, encoding='utf8'):
        line = line.strip()
        if line and not line.startswith('#'):
            try: train.add(norm(json.loads(line).get('text', '')))
            except Exception: pass
for s in cat['services']:
    for t in [s['title']['zh']] + s['examples'] + s['keywords']: train.add(norm(t))
for o in cat['commands']['options']:
    for t in [o['label']] + o.get('examples', []): train.add(norm(t))
old = set(norm(i['text']) for i in json.load(open(f'{PUB}/testset.json', encoding='utf8'))['items'])
LANG = {'e': 'en', 'm': 'zh-en', 'v': 'vi', 'i': 'id', 't': 'th'}
STYLE = {'c': 'colloquial', 'k': 'keyword', 'l': 'long', 's': 'asr', 'm': 'mixed', 'e': 'english', 'n': 'nearmiss', 'p': 'param', 'a': 'ambiguous', 'v': 'foreign', 'i': 'foreign', 't': 'foreign'}
items, seen, dropped = [], set(), []
code = None
for f in sorted(glob.glob(f'{HERE}/src*.txt')):
    for line in open(f, encoding='utf8'):
        line = line.rstrip('\n')
        if not line or line.startswith('#'): continue
        m = re.match(r'\[(.)\]$', line)
        if m: code = 'Z' if m.group(1) == 'Z' else m.group(1); continue
        parts = line.split('|')
        st, text = parts[0], parts[1].strip()
        kv = dict(x.split('=', 1) for x in parts[2].split(';') if '=' in x) if len(parts) > 2 and parts[2] else {}
        n = norm(text)
        if n in train or n in old or n in seen:
            dropped.append((code, text)); continue
        seen.add(n)
        it = {'text': text, 'expect': code}
        if code == 'Z': it['tag'] = 'oos'
        elif st in 'vit': it['tag'] = 'foreign'
        elif st == 'a': it['tag'] = 'ambiguous'
        else: it['tag'] = 'normal'
        if st in LANG: it['lang'] = LANG[st]
        if st == 'e' and code == 'Z': pass
        it['style'] = STYLE[st]
        if 'alt' in kv: it['alt'] = kv.pop('alt').split(',')
        if 'entity' in kv: it['entity'] = kv.pop('entity')
        if kv: it['params'] = kv
        items.append(it)
json.dump({'version': '1k-0.1', 'note': f'{len(items)} hand-written utterances; function->scenario->prompt method; deduped against all training jsonl, catalog examples and testset.json. Extra fields: style, entity, params.', 'items': items},
          open(f'{PUB}/testset_1k.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('items', len(items), 'dropped', len(dropped))
for c, t in dropped: print('  dup', c, t)
cnt = collections.Counter(i['expect'] for i in items); print(sorted(cnt.items()))
print(collections.Counter(i['style'] for i in items)); print(collections.Counter(i.get('lang', 'zh') for i in items)); print(collections.Counter(i['tag'] for i in items))
