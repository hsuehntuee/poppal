#!/usr/bin/env python3
"""
產生 MCP 式的工具清單 registry.json：
  tools[]  每個工具：id、code、name、description、invoke（怎麼呼叫）、params（要什麼參數）、covers（涵蓋的具體項目）、keywords
  index[]  查表索引：具體項目名稱 / 關鍵字 → 工具（執行時使用者講到就直接命中）

來源：assistant/public/data/catalog.json（工具與路由）+ public/guides/*.json（參數來自有 accept 的步驟）
      + tools/tinycls/data/entities.json（mine_mock.py 從服務本體挖出的項目名稱）

  python tools/tinycls/mine_mock.py && python tools/registry/build_registry.py
"""
import json, os, re, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PUB = os.path.join(ROOT, 'assistant', 'public')

catalog = json.load(open(os.path.join(PUB, 'data', 'catalog.json'), encoding='utf-8'))
entities = json.load(open(os.path.join(ROOT, 'tools', 'tinycls', 'data', 'entities.json'), encoding='utf-8'))
# 找地點：place_list.json 的每個項目名稱（捐血站、親子館、無障礙廁所…）直接進 find_place 的 covers，
# entity 就是頁面上的項目全名，導覽才點得到（mine_mock.py 也會挖，這裡保證不靠它的快取）
_place_list = os.path.join(ROOT, 'TownPass-Services', 'public', 'mock', 'place_list.json')
_place_group = {}  # 項目名稱 → 頁面上的分類標題（導覽要先點開那一類）
if os.path.isfile(_place_list):
    for _g in json.load(open(_place_list, encoding='utf-8'))['list']:
        entities.setdefault('O', [])
        entities['O'] += [p['name'] for p in _g.get('places', []) if p.get('name')]
        for p in _g.get('places', []):
            if p.get('name'):
                _place_group[p['name']] = _g.get('name', '')
guides = {}
for p in glob.glob(os.path.join(PUB, 'guides', 'guide_*.json')):
    g = json.load(open(p, encoding='utf-8'))
    guides[g['id']] = g

# 口語別名 → 頁面上真正的項目名稱（covers 裡的）。使用者說「違停」，導覽就直接帶到「停車管理及收費問題」。
ALIASES = {
    'citizen_report': {
        '違停': '停車管理及收費問題', '違規停車': '停車管理及收費問題', '亂停車': '停車管理及收費問題', '停車收費': '停車管理及收費問題',
        '太吵': '噪音', '很吵': '噪音', '吵鬧': '噪音', '施工噪音': '噪音',
        '亂丟垃圾': '垃圾', '垃圾沒收': '垃圾', '很髒': '垃圾',
        '公車司機': '公車', '公車沒來': '公車', '復康巴士': '復康巴士問題',
        '廢棄車': '有牌廢棄車', '廢車': '有牌廢棄車', '違建': '違建查報及拆除', '違章建築': '違建查報及拆除',
        '污染': '汙染舉發', '汙染': '汙染舉發', '油漬': '道路散落物或油漬處理', '路上掉東西': '道路散落物或油漬處理',
        '學校': '教育事務', '計程車司機': '計程車', '觀光': '觀光及媒體'
    },
    'disaster_report': {
        '停電': '電力停電', '沒電': '電力停電', '電線掉': '電線或纜線受損', '電線斷': '電線或纜線受損', '路燈壞': '路燈故障', '路燈不亮': '路燈故障',
        '失火': '火災', '著火': '火災', '橋斷': '橋樑斷裂', '橋裂': '橋樑斷裂', '山崩': '土石崩落', '落石': '土石崩落'
    },
    'find_place': {
        '廁所': '公廁', '洗手間': '公廁', '化妝室': '公廁', '停車位': '停車場', '充電': '機車充電站', '機車充電': '機車充電站',
        '喝水': '飲水機／提供飲水店家', '直飲台': '地區直飲台', '餵奶': '哺集乳室', '哺乳室': '哺集乳室', 'AED': 'AED 場所', '急救': 'AED 場所', '電擊器': 'AED 場所',
        '捐血': '捐血站', '郵筒': '郵箱', '寄信': '郵箱', '舊衣': '舊衣回收箱', '垃圾車': '垃圾清運點', '倒垃圾': '垃圾清運點', '廚餘': '廚餘週三日收受點', '狗便': '狗便清潔袋',
        '免費wifi': 'TaipeiFree', '免費 wifi': 'TaipeiFree', '無線網路': 'TaipeiFree', '手機充電': '行動裝置充電', '素食': '素食友善店家', '清真': '穆斯林友善店家',
        '公所': '區公所', '學校': '公私立高中職以下學校', '國小': '公私立高中職以下學校', '國中': '公私立高中職以下學校',
        '河濱': '河濱公園', '心理諮商': '心理諮商、治療所', '諮商': '心理諮商、治療所', '身心科': '臺北市心理機構',
        '防空': '防空避難設備', '避難': '防空避難設備', '防空洞': '防空避難設備', '吸菸': '指定吸菸區（Designated Smoking Area）', '抽菸': '指定吸菸區（Designated Smoking Area）', '吸菸區': '指定吸菸區（Designated Smoking Area）',
        '計程車': '計程車招呼站', '施工': '施工資訊', '封路': '今日使用道路集會路段',
        # 英文（小幫手 English 模式直接打英文也要命中）
        'toilet': '公廁', 'restroom': '公廁', 'bathroom': '公廁', 'washroom': '公廁', 'parking': '停車場', 'parking lot': '停車場', 'charging': '機車充電站', 'charger': '機車充電站',
        'water fountain': '飲水機／提供飲水店家', 'drinking water': '飲水機／提供飲水店家', 'nursing room': '哺集乳室', 'breastfeeding': '哺集乳室', 'aed': 'AED 場所', 'defibrillator': 'AED 場所',
        'youbike': '微笑單車 2.0', 'bike': '微笑單車 2.0', 'blood donation': '捐血站', 'mailbox': '郵箱', 'wifi': 'TaipeiFree', 'free wifi': 'TaipeiFree', 'school': '公私立高中職以下學校',
        'district office': '區公所', 'shelter': '防空避難設備', 'smoking area': '指定吸菸區（Designated Smoking Area）', 'smoking': '指定吸菸區（Designated Smoking Area）', 'taxi': '計程車招呼站',
        'riverside park': '河濱公園', 'counseling': '心理諮商、治療所', 'accessible toilet': '無障礙廁所', 'halal': '穆斯林友善店家', 'vegetarian': '素食友善店家'
    },
    'subscription': {
        '空氣': '空氣品質', '空汙': '空氣品質', '淹水': '淹水資訊', '停車位通知': '停車資訊', '油價': '油價', '水費通知': '水費通知'
    },
    'apply_service': {
        '老人健保': '老人全民健康保險保險費自付額補助', '健保補助': '老人全民健康保險保險費自付額補助', '家暴': '臺北市家庭暴力被害人補助', '性侵': '臺北市性侵害被害人補助',
        '原住民': '原住民急難關懷慰問金', '技能檢定': '原住民參加技術士技能檢定獎勵金申請', '交通申訴': '裁決所受理之申訴案件', '罰單申訴': '裁決所受理之申訴案件'
    }
}

# 太短或太通用的詞不進索引（會到處命中）
GENERIC = set('服務 申請 查詢 問題 資訊 通知 台北 臺北 市政府 市民 其他 一般 全部 自己 帳單 優惠 票券 訂閱 登入 註冊 水表 繳費'.split())
# 教學 / 常見問題的分類名稱太通用（帳單、優惠、票券…），只放進 covers，不進查表索引
NO_INDEX_TOOLS = {'qna'}


def invoke_of(svc):
    r = svc['route']
    t = r['type']
    if svc.get('guide_id') and svc['guide_id'] in guides:
        g = guides[svc['guide_id']]
        return {'kind': 'guide', 'guide': svc['guide_id'], 'entry': g.get('entry') or r.get('target') or '/'}
    if t == 'internal':
        return {'kind': 'page', 'path': r['target']}
    if t == 'external':
        return {'kind': 'external', 'url': r['target']}
    if t == 'phone':
        return {'kind': 'bridge', 'name': 'phone_call', 'data': r['target']}
    if t == 'ui':
        action, _, value = r['target'].partition(':')
        return {'kind': 'ui', 'action': action, 'value': value}
    return {'kind': 'unavailable'}


def params_of(svc):
    out = []
    g = guides.get(svc.get('guide_id', ''))
    if not g:
        return out
    for st in g['steps']:
        if st.get('accept'):
            out.append({
                'name': st['id'],
                'type': st['accept'],
                'len': st.get('min_len') if st.get('min_len') == st.get('max_len') else None,
                'min_len': st.get('min_len'), 'max_len': st.get('max_len'),
                'label': (st['find'][0].get('label') or st['find'][0].get('text') or st['id']),
                'step': st['id']
            })
    return out


tools = []
index = []
seen_terms = {}
for s in catalog['services']:
    covers = sorted(set(entities.get(s['code'], [])))
    tool = {
        'id': s['id'], 'code': s['code'],
        'name': s['title'], 'description': s['desc'],
        'invoke': invoke_of(s),
        'params': params_of(s),
        'keywords': s.get('keywords', []),
        'covers': covers,
        'examples': s.get('examples', [])
    }
    tools.append(tool)
    # 索引：title（各語言）、keywords、covers
    terms = set([s['title']['zh']] + s.get('keywords', []) + ([] if s['id'] in NO_INDEX_TOOLS else covers))
    for t in terms:
        t = t.strip()
        if len(t) < 2 or t in GENERIC or re.fullmatch(r'[A-Za-z0-9 ]+', t) and len(t) < 4:
            continue
        seen_terms.setdefault(t, set()).add(s['id'])

for term, ids in seen_terms.items():
    # 同一個詞對應多個工具 → 標成 ambiguous，執行時只提高這幾個，讓系統走 ASK
    index.append({'term': term, 'tools': sorted(ids), 'ambiguous': len(ids) > 1})
for tool_id, amap in ALIASES.items():
    covers = set(next(t for t in tools if t['id'] == tool_id)['covers'])
    for alias, target in amap.items():
        if target not in covers:
            print(f'  alias target not in covers: {tool_id} {alias} → {target}', file=sys.stderr)
            continue
        if any(i['term'] == alias for i in index):
            for i in index:
                if i['term'] == alias and tool_id in i['tools']:
                    i['entity'] = target
            continue
        index.append({'term': alias, 'tools': [tool_id], 'ambiguous': False, 'entity': target})
for i in index:
    if 'find_place' in i['tools']:
        g = _place_group.get(i.get('entity') or i['term'])
        if g:
            i['group'] = g
index.sort(key=lambda x: (-len(x['term']), x['term']))

registry = {
    'version': 1,
    'generated_from': ['catalog.json', 'guides/*.json', 'tools/tinycls/data/entities.json'],
    'none_code': catalog['none_code'],
    'tools': tools,
    'index': index
}
out = os.path.join(PUB, 'data', 'registry.json')
json.dump(registry, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
amb = sum(1 for i in index if i['ambiguous'])
print(f'wrote {out}: {len(tools)} tools, {len(index)} index terms ({amb} ambiguous)', file=sys.stderr)
for i in index:
    if i['ambiguous']:
        print('  ambiguous:', i['term'], i['tools'], file=sys.stderr)
