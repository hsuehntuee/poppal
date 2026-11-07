#!/usr/bin/env python3
"""
從「服務本體」挖訓練句：TownPass-Services 的 mock 資料（每個申辦項目、陳情分類、費用、地點、災情類型、
教學主題、票券…）和各頁面 Vue 檔裡看得到的中文字串，依「頁面 → 服務代號」對應自動產生句子。
目的是讓決策器把每個服務「底下有什麼」全部看過一遍，而不是只認得目錄那一句 desc。

  python tools/tinycls/mine_mock.py            → tools/tinycls/data/services.mined.jsonl
tiny / cls / Gemma 三個訓練腳本都會自動讀這個檔。
"""
import json, os, re, sys, random
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SVC = os.path.join(ROOT, 'TownPass-Services')
MOCK = os.path.join(SVC, 'public', 'mock')
VIEWS = os.path.join(SVC, 'src', 'views')
OUT = os.path.join(HERE, 'data', 'services.mined.jsonl')
random.seed(0)

# 費用名稱 → 代號（其餘費用 → G）
FEE_LABEL = {'水費': 'A', '停車費': 'C', '地方稅': 'D', '學雜費': 'E', '聯合醫院醫療費': 'F'}

# 頁面檔名 → 代號（頁面裡的可見文字屬於哪個服務）
VIEW_LABEL = {
    'HomeView': 'P', 'FormView': 'P',
    'CitizenReportView': 'J', 'CitizenReportListView': 'J', 'CitizenReportFormView': 'J',
    'CitizenReportSearchView': 'K', 'CitizenReportSearchDetailView': 'K',
    'DisasterReportView': 'L', 'DisasterReportFormView': 'L',
    'PoliceReportView': 'M', 'PoliceReportFormView': 'M', 'PoliceReportRecordView': 'M', 'PoliceReportRecordDetailView': 'M',
    'LibraryServiceView': 'N', 'LibraryKeywordSearchView': 'N', 'LibraryRankingListView': 'N', 'LibraryBookDetailView': 'N',
    'LibraryNoticeListView': 'N', 'LibraryNoticeDetailView': 'N',
    'SurroundingServiceView': 'O',
    'CouponView': 'Q', 'CouponListView': 'Q', 'HotSpotView': 'Q', 'CouponDetail': 'Q', 'TicketDetail': 'Q', 'BuyTicketView': 'Q',
    'TicketWallet': 'R', 'TicketExchange': 'R',
    'SubscriptionView': 'S', 'SubscriptionItemListView': 'S', 'SubscriptionItemDetailView': 'S',
    'CounterCallingView': 'I', 'CounterCallingDetailView': 'I',
    'FeePaymentHistoryView': 'H', 'FeePaymentHistoryDetailView': 'H',
    'FeePaymentOthersView': 'G', 'FeePaymentSearchView': 'G', 'FeePaymentScanView': 'G',
    'TopQnAListView': 'X', 'QnAListView': 'X',
}

# 太通用的 UI 字，不當訓練句
STOP = set('確認 取消 送出 返回 下一步 上一步 查詢 搜尋 清除 關閉 刪除 編輯 新增 完成 確定 是 否 全部 更多 載入中 請稍候 登入 註冊 回首頁 回到城市通 '
           '姓名 電話 地址 電子郵件 備註 說明 注意事項 提醒 日期 時間 選擇 請選擇 請輸入 必填 選填 其他 無 有 查看 詳細 列表 項目 名稱 內容 狀態 操作'.split())

rows = []
entities = defaultdict(set)   # label -> 具體項目名稱（給 registry 的 covers / 查表索引）
def ent(name, label):
    name = re.sub(r'[（(].*?[）)]', '', str(name)).strip()
    if 2 <= len(name) <= 20:
        entities[label].add(name)

def add(text, label, src):
    text = re.sub(r'\s+', '', text.strip())
    if 2 <= len(text) <= 40:
        rows.append({'text': text, 'label': label, 'src': src})

def load(p):
    return json.load(open(os.path.join(MOCK, p), encoding='utf-8'))

# ---------- mock 資料 ----------
# 申辦服務：每個項目
for g in load('service_list.json')['data']:
    for a in g['agency']:
        for o in a['options']:
            t = re.sub(r'[（(].*?[）)]', '', o['title']).strip()
            ent(t, 'P')
            for tpl in ['我要申請{}', '{}怎麼辦', '辦理{}', '{}']:
                add(tpl.format(t), 'P', 'service_list')
            if o.get('subtitle'):
                add(o['subtitle'], 'P', 'service_list')

# 陳情：分類（hot + all）
cr = load('citizen_report.json')['data']
seen = set()
for r in cr.get('hot_report', []) + cr.get('all_report', []):
    for n in re.split('[、，/]', r['name']):
        n = n.strip()
        if not n or n in seen:
            continue
        seen.add(n)
        ent(n, 'J')
        for tpl in ['{}的問題要反映', '我要陳情{}', '檢舉{}', '{}有狀況想投訴']:
            add(tpl.format(n), 'J', 'citizen_report')
    for k in ('service_requesting', 'problem_reporting'):
        v = r.get(k)
        for item in (v if isinstance(v, list) else [v] if v else []):
            if isinstance(item, dict):
                item = item.get('name') or item.get('title') or ''
            if isinstance(item, str) and item:
                ent(item, 'J')
                add(item, 'J', 'citizen_report')

# 叫號：機關與分所
for c in load('counter_list.json')['data']:
    ent(c['name'], 'I')
    for tpl in ['{}現在叫到幾號', '{}要等多久', '{}排隊人數']:
        add(tpl.format(c['name']), 'I', 'counter_list')
    for s in c.get('list', []):
        ent(s['name'], 'I')
        for tpl in ['{}叫號', '{}現在幾號', '{}等待人數']:
            add(tpl.format(s['name']), 'I', 'counter_list')
        for cn in [x['name'] for x in s.get('counters', [])]:
            add(f'{s["name"]}{cn}叫到幾號', 'I', 'counter_list')

# 找地點：類型
for p in load('place_list.json')['list']:
    for n in re.split('[、，/]', p['name']):
        n = n.strip()
        if n:
            ent(n, 'O')
            for tpl in ['附近的{}', '哪裡有{}', '最近的{}在哪', '幫我找{}']:
                add(tpl.format(n), 'O', 'place_list')
    for pl in p.get('places', [])[:20]:
        nm = pl.get('name') or pl.get('title')
        if nm:
            ent(nm, 'O')   # 每個項目名稱（捐血站、親子館…）都是 find_place 的 entity
            for tpl in ['{}在哪裡', '附近的{}', '幫我找{}']:
                add(tpl.format(nm), 'O', 'place_list')

# 災情：類型與子項
for d in load('disaster_reporting.json')['data']:
    for n in re.split('[、，/]', d['name']):
        n = n.strip()
        if n:
            ent(n, 'L')
            for tpl in ['{}要通報', '有{}', '我要通報{}']:
                add(tpl.format(n), 'L', 'disaster')
    for o in d.get('options', []):
        n = re.sub(r'[（(].*?[）)]', '', o['name']).strip()
        ent(n, 'L')
        for tpl in ['{}', '通報{}', '這邊{}']:
            add(tpl.format(n), 'L', 'disaster')

# 教學 / 常見問題
for q in load('qna_list.json')['data']:
    ent(q['name'], 'X')
    for tpl in ['{}怎麼用', '{}教學', '{}的問題']:
        add(tpl.format(q['name']), 'X', 'qna')
    for item in q.get('list', []):
        t = item.get('title') or item.get('question') or ''
        if t:
            add(t, 'X', 'qna')

# 費用
for g in load('fee-payment/fee_payment_list.json')['data']:
    for s in g['data']:
        n = s['name']
        lab = FEE_LABEL.get(n, 'G')
        ent(n, lab)
        for tpl in ['我要繳{}', '{}怎麼付', '繳{}', '{}繳費']:
            add(tpl.format(n), lab, 'fee_list')
        for st in s.get('search_type_list', []):
            for ff in st.get('form_format', []):
                if ff.get('label'):
                    add(f'用{ff["label"]}繳{n}', lab, 'fee_list')
# 帳單 / 紀錄
for b in load('fee-payment/pay_history_list.json')['data'][:10]:
    nm = b.get('name') or b.get('title') or ''
    if nm:
        add(f'{nm}的繳費紀錄', 'H', 'pay_history')

# 圖書館熱門關鍵字
for k in load('library/library_search_hot_keywords.json')['data']:
    ent(k, 'N')
    for tpl in ['圖書館有{}嗎', '我想借{}', '找{}這本書']:
        add(tpl.format(k), 'N', 'library')

# 票券 / 優惠 / 熱門地點
cp = load('coupon_data.json')['data']
for t in cp.get('ticket_list', []):
    ent(t['name'], 'Q')
    for tpl in ['我要買{}', '{}的票', '{}門票']:
        add(tpl.format(t['name']), 'Q', 'coupon')
for c in cp.get('coupon_list', []):
    for tpl in ['{}的優惠', '{}折價券']:
        add(tpl.format(c['name']), 'Q', 'coupon')
for h in cp.get('hot_spot_list', []):
    ent(h['name'], 'Q')
    add(f'{h["name"]}有什麼優惠', 'Q', 'coupon')
    add(f'{h["name"]}的門票', 'Q', 'coupon')

# 訂閱主題（mock 沒有清單，用服務頁圖示對應的主題名）
for topic in ['空氣品質', '社區公告', '藝文活動', '托育資訊', '淹水資訊', '油價', '健康資訊', '圖書館通知', '水表', '新住民支援',
              '停車資訊', '幼兒園資訊', '公聽會', '學校資訊', '長者資訊', '社會住宅', '運動公園', '台北畫刊', '台北旅遊快訊', '交通資訊', '水費通知']:
    ent(topic, 'S')
    for tpl in ['訂閱{}', '我要收到{}的通知', '{}有更新通知我']:
        add(tpl.format(topic), 'S', 'subscription')

# ---------- 頁面本體：Vue 檔裡看得到的中文字 ----------
def vue_strings(path):
    src = open(path, encoding='utf-8').read()
    tpl = src.split('<template>', 1)[1] if '<template>' in src else src
    out = set()
    for m in re.finditer(r'>\s*([^<>{}]*?[一-鿿][^<>{}]*?)\s*<', tpl):
        out.add(m.group(1).strip())
    for m in re.finditer(r'(?:placeholder|title|label|alt)="([^"]*[一-鿿][^"]*)"', tpl):
        out.add(m.group(1).strip())
    return out

for fn, lab in VIEW_LABEL.items():
    p = os.path.join(VIEWS, fn + '.vue')
    if not os.path.exists(p):
        continue
    for s in vue_strings(p):
        s = re.sub(r'[：:。！？!?]+$', '', s)
        if len(s) < 3 or len(s) > 20 or s in STOP or re.search(r'[0-9]{3,}|http|\$|\{', s) or re.match(r'^(請輸入|請選擇|請填|輸入|選擇|點擊|按下)', s):
            continue
        add(s, lab, 'view:' + fn)

# ---------- 13 個 demo 服務的 mock（子代理產生） ----------
def _load_opt(rel):
    try:
        return load(rel)
    except Exception:
        return None

d = _load_opt('family-center/centers.json')
if d:
    for c in d['data']:
        ent(c['name'], 'Y')
        for tpl in ['我要去{}', '{}的活動', '{}怎麼報名', '{}在哪裡']:
            add(tpl.format(c['name']), 'Y', 'family_center')
d = _load_opt('ivoting/polls.json')
if d:
    for pl in d['data']:
        ent(pl['title'], 'f')
        for tpl in ['我要投{}', '{}的投票', '對{}投票']:
            add(tpl.format(pl['title']), 'f', 'ivoting')
d = _load_opt('survey/surveys.json')
if d:
    for sv in d['data']:
        ent(sv['title'], 'g')
        for tpl in ['我要填{}', '{}問卷', '{}的意見調查']:
            add(tpl.format(sv['title']), 'g', 'survey')
d = _load_opt('neighborhood/villages.json')
if d:
    for dist in d.get('districts', []):
        ent(dist['name'], 'h')
        add(f"{dist['name']}的里長", 'h', 'neighborhood')
    for v in d['data'][:60]:
        ent(v['name'], 'h')
        for tpl in ['{}里長電話', '{}的里辦公處', '我住{}']:
            add(tpl.format(v['name']), 'h', 'neighborhood')
d = _load_opt('city-radio/programs.json')
if d:
    for pr in d['data']:
        ent(pr['title'], 'i')
        add(f"我要聽{pr['title']}", 'i', 'city_radio')
for rel, lab, src in [('green-map/spots.json', 'j', 'green_map'), ('pet-map/spots.json', 'k', 'pet_map')]:
    d = _load_opt(rel)
    if d:
        for c in d.get('categories', []):
            ent(c['name'], lab)
            for tpl in ['附近的{}', '找{}', '哪裡有{}']:
                add(tpl.format(c['name']), lab, src)
        for sp in d['data']:
            ent(sp['name'], lab)
            for tpl in ['{}在哪', '我想去{}']:
                add(tpl.format(sp['name']), lab, src)
d = _load_opt('essential-goods/prices.json')
if d:
    for c in d.get('categories', []):
        ent(c['name'], 'l')
        for tpl in ['{}的價格', '{}多少錢', '今天{}價格']:
            add(tpl.format(c['name']), 'l', 'goods')
    for it in d['data']:
        ent(it['name'], 'l')
        for tpl in ['{}多少錢', '{}的價錢', '{}漲價了嗎']:
            add(tpl.format(it['name']), 'l', 'goods')
d = _load_opt('zoo/zoo.json')
if d:
    for a in d.get('areas', []):
        ent(a['name'], 'm')
        add(f"{a['name']}在哪", 'm', 'zoo')
    for an in d.get('animals', []):
        ent(an['name'], 'm')
        for tpl in ['我想看{}', '{}在哪一館', '{}的介紹']:
            add(tpl.format(an['name']), 'm', 'zoo')
    for ev in d.get('events', []):
        ent(ev['title'], 'm')
        add(f"動物園的{ev['title']}", 'm', 'zoo')
d = _load_opt('hotline-1999/faq.json')
if d:
    for sv in d.get('services', []):
        ent(sv['name'], 'T')
    for q in d['data']:
        add(q['question'], 'T', 'hotline')
d = _load_opt('vaccine/vaccine_sites.json')
if d:
    for t in d.get('vaccine_types', []):
        ent(t['name'], 'U')
        for tpl in ['我要打{}', '預約{}', '{}哪裡可以打']:
            add(tpl.format(t['name']), 'U', 'vaccine')
    for st in d.get('sites', []):
        ent(st['name'], 'U')
        add(f"在{st['name']}打疫苗", 'U', 'vaccine')
d = _load_opt('hospital-registration/doctors.json')
if d:
    for b in d.get('branches', []):
        ent(b['name'], 'V')
        for tpl in ['{}掛號', '我要去{}看醫生']:
            add(tpl.format(b['name']), 'V', 'hospital')
    for dp in d.get('depts', []):
        ent(dp['name'], 'V')
        for tpl in ['掛{}', '{}門診', '我要看{}']:
            add(tpl.format(dp['name']), 'V', 'hospital')

# ---------- 去重、限量、輸出 ----------
by = defaultdict(list)
seen = set()
for r in rows:
    key = (r['text'], r['label'])
    if key in seen:
        continue
    seen.add(key)
    by[r['label']].append(r)
cap = 140
final = []
for lab, lst in sorted(by.items()):
    random.shuffle(lst)
    final += lst[:cap]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('# 由 mine_mock.py 從 TownPass-Services 的 mock 資料與頁面文字自動產生，請勿手改\n')
    for r in sorted(final, key=lambda r: r['label']):
        f.write(json.dumps(r, ensure_ascii=False) + '\n')
ENT = os.path.join(HERE, 'data', 'entities.json')
with open(ENT, 'w', encoding='utf-8') as f:
    json.dump({k: sorted(v) for k, v in sorted(entities.items())}, f, ensure_ascii=False, indent=1)
print('wrote', ENT, {k: len(v) for k, v in sorted(entities.items())}, file=sys.stderr)
print(f'wrote {OUT}: {len(final)} sentences', {k: len(v[:cap]) for k, v in sorted(by.items())}, file=sys.stderr)
