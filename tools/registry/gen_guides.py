#!/usr/bin/env python3
"""產生每個服務的導覽腳本 assistant/public/guides/guide_*.json（繳水費、臨櫃叫號是手寫的，不覆蓋）。
{{entity}} 會在執行時換成使用者講到的具體項目（registry 查表命中）。
  python tools/registry/gen_guides.py
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assistant', 'public', 'guides')


def step(id, url, find, say, more='', done='click', **kw):
    d = {'id': id, 'url': url, 'find': find, 'say': {'zh': say}, 'done_when': done}
    if '{{entity}}' in say:
        d['say_default'] = {'zh': kw.pop('say_default', '點你要的項目')}
    if more:
        d['more'] = {'zh': more}
    d.update(kw)
    return d


def T(t, **k): return dict(text=t, **k)
def L(l): return dict(label=l)
def C(c): return dict(css=c)
def B(t): return dict(role='button', text=t)


def fee_form(gid, name, fee, label, more, accept='digits', length=None):
    extra = {'min_len': length, 'max_len': length} if length else {}
    return {'id': gid, 'title': {'zh': name}, 'entry': f'/fee-payment/detail/{fee}', 'match': {'url': f'^/fee-payment/detail/{fee}'}, 'steps': [
        step('fill', f'^/fee-payment/detail/{fee}', [L(label), C('input')], f'輸入{label}', more, 'input', accept=accept, **extra),
        step('search', f'^/fee-payment/detail/{fee}', [B('查詢')], '按「查詢」', '最下面藍色的大按鈕', 'route'),
        step('select_all', '^/fee-payment/result/', [T('全部繳清', exact=True)], '點「全部繳清」', '會把所有帳單都勾起來', 'click', skip_if_missing=True),
        step('go_pay', '^/fee-payment/result/', [B('前往繳費')], '按「前往繳費」', '最下面藍色的大按鈕', 'route', confirm=True),
        step('choose_way', '^/fee-payment/payment/', [T('請選擇繳費方式')], '選一種付款方式', '信用卡或行動支付都可以，選好後畫面會再問你一次', 'route', confirm=True, final=True)]}


G = {}
G['guide_parking_fee'] = fee_form('guide_parking_fee', '繳停車費', 'fee-5', '車牌號碼', '輸入車牌，例如 ABC1234；也可以切到「繳費編號」分頁', accept='text')
G['guide_local_tax'] = {'id': 'guide_local_tax', 'title': {'zh': '繳地方稅'}, 'entry': '/fee-payment/detail/tax-1', 'match': {'url': '^/fee-payment/detail/tax-1'}, 'steps': [
    step('scan', '^/fee-payment/detail/tax-1', [T('掃描')], '點「掃描」', '地方稅只能掃描繳款書上的條碼，把相機對準條碼', 'route', final=True)]}
G['guide_tuition'] = fee_form('guide_tuition', '繳學雜費', 'fee-7', '繳費編號', '學校繳費單上的繳費編號')
G['guide_hospital_fee'] = fee_form('guide_hospital_fee', '繳聯合醫院醫療費', 'fee-9', '身分證字號', '輸入資料分頁：身分證字號、出生日期；或切到「繳費編號」分頁', accept='text')
G['guide_fee_other'] = {'id': 'guide_fee_other', 'title': {'zh': '繳其他費用'}, 'entry': '/fee-payment/search', 'match': {'url': '^/fee-payment/(others|search)'}, 'steps': [
    step('open_search', '^/fee-payment/others', [T('搜尋項目名稱'), C('a[href*="search"]')], '點最上面的搜尋框', '', 'route'),
    step('fill_search', '^/fee-payment/search', [C('input[placeholder*="關鍵字"]'), C('input')], '輸入要繳的費用名稱', '例如「停車費」、「學雜費」', 'input', accept='text', prefill='keyword'),
    step('do_search', '^/fee-payment/search', [C('.search-button'), B('搜尋')], '按放大鏡搜尋', '', 'click'),
    step('no_result', '^/fee-payment/search', [T('無符合的搜尋結果')], '城市通沒有「{{keyword}}」這個繳費項目', '像電費、瓦斯費是台電、瓦斯公司收的，不在城市通；要問可以打 1999', 'manual', skip_if_missing=True, say_default='這裡沒有這個繳費項目，可以打 1999 問'),
    step('pick', '^/fee-payment/search', [T('{{keyword}}'), T('查詢結果')], '點「{{keyword}}」', '點進去後照畫面輸入繳費資料', 'route', final=True, say_default='點查詢結果裡你要的項目')]}
G['guide_fee_history'] = {'id': 'guide_fee_history', 'title': {'zh': '查繳費紀錄'}, 'entry': '/fee-payment/history', 'match': {'url': '^/fee-payment/history'}, 'steps': [
    step('look', '^/fee-payment/history', [T('帳務紀錄'), C('main')], '看這裡的繳費紀錄', '點任何一筆可以看明細；沒有紀錄會顯示「無紀錄」', 'manual', final=True)]}
G['guide_citizen_report'] = {'id': 'guide_citizen_report', 'title': {'zh': '陳情投訴'}, 'entry': '/citizen-report', 'match': {'url': '^/citizen-report'}, 'steps': [
    step('pick_hot', '^/citizen-report/?$', [T('{{entity}}'), T('更多項目')], '點「{{entity}}」', '常見項目在上面的格子裡；沒看到就點「更多項目」', 'route', say_default='點「更多項目」看全部類別'),
    step('pick_list', '^/citizen-report/list', [T('{{entity}}'), T('民眾陳情')], '點「{{entity}}」', '先點類別展開，再點裡面的項目', 'route', skip_if_missing=True, say_default='點你要反映的類別，再點裡面的項目'),
    step('location', '^/citizen-report/form/', [L('發生地點'), C('#location'), C('input[placeholder*="地址"]')], '輸入發生地點', '寫完整地址，或按旁邊的定位按鈕', 'input', accept='text'),
    step('subject', '^/citizen-report/form/', [L('案件主旨'), C('input[placeholder*="主旨"]')], '輸入案件主旨', '一句話說發生什麼事', 'input', accept='text'),
    step('desc', '^/citizen-report/form/', [L('描述'), C('textarea')], '輸入描述', '人、事、時、地、物，可以用說的', 'input', accept='text'),
    step('agree', '^/citizen-report/form/', [T('同意')], '點「同意」', '同意個資使用才能送出', 'click'),
    step('submit', '^/citizen-report/form/', [B('送出'), B('確認送出')], '按「送出」', '送出前再看一次內容', 'route', confirm=True, final=True)]}
G['guide_citizen_search'] = {'id': 'guide_citizen_search', 'title': {'zh': '查陳情進度'}, 'entry': '/citizen-report?isSearch=1', 'match': {'url': '^/citizen-report/?$'}, 'steps': [
    step('tab', '^/citizen-report', [T('案件查詢'), T('查詢紀錄'), T('搜尋案號關鍵字')], '點「案件查詢」分頁', '上方第二個分頁', 'click', skip_if_missing=True),
    step('search', '^/citizen-report', [C('input[placeholder*="案號"]')], '輸入案號或關鍵字', '不記得案號可以用日期篩選', 'input', accept='text'),
    step('go', '^/citizen-report', [B('搜尋'), C('.search-button')], '按放大鏡搜尋', '結果會列在下面，點一筆看進度', 'manual', final=True)]}
G['guide_disaster_report'] = {'id': 'guide_disaster_report', 'title': {'zh': '災情通報'}, 'entry': '/disaster-report', 'match': {'url': '^/disaster-report'}, 'steps': [
    step('pick', '^/disaster-report/?$', [T('{{entity}}'), C('input[placeholder*="問題"]')], '點「{{entity}}」', '或在搜尋框輸入災情關鍵字', 'route', say_default='點災情的類型，或在搜尋框輸入關鍵字'),
    step('detail', '^/disaster-report/form/', [L('地點描述'), C('textarea'), C('input')], '描述地點與災情', '可以用說的', 'input', accept='text'),
    step('submit', '^/disaster-report/form/', [B('送出')], '按「送出」', '', 'route', confirm=True, final=True)]}
G['guide_police_report'] = {'id': 'guide_police_report', 'title': {'zh': '警政報案'}, 'entry': '/police-report', 'match': {'url': '^/police-report'}, 'steps': [
    step('agree', '^/police-report/?$', [B('同意'), B('我同意'), C('button')], '看完說明，按「同意」', '網路報案前要先同意注意事項', 'route'),
    step('form', '^/police-report/form', [C('input'), C('textarea')], '照畫面填報案資料', '急事請直接打 110', 'manual', final=True)]}
G['guide_library'] = {'id': 'guide_library', 'title': {'zh': '圖書借閱'}, 'entry': '/library-service', 'match': {'url': '^/library-service'}, 'steps': [
    step('search', '^/library-service', [C('input[placeholder]'), T('關鍵字搜尋')], '輸入要找的書名', '也可以看下面的熱門排行', 'input', accept='text'),
    step('go', '^/library-service', [C('.search-button'), B('搜尋')], '按放大鏡', '結果點進去可以預約', 'manual', final=True)]}
G['guide_find_place'] = {'id': 'guide_find_place', 'title': {'zh': '找地點'}, 'entry': '/surrounding-service', 'match': {'url': '^/surrounding-service'}, 'steps': [
    step('pick', '^/surrounding-service', [dict(option='{{entity}}'), C('#findPlace'), C('select')], '選「{{entity}}」', '最上面的下拉選單；按「幫我選」我直接幫你選好', 'change', say_default='在最上面的下拉選單選你要找的地點類型'),
    step('look', '^/surrounding-service', [C('.leaflet-marker-icon'), T('公里')], '點地圖上的標記看地址', '也可以往下滑看清單', 'manual', final=True)]}
G['guide_apply'] = {'id': 'guide_apply', 'title': {'zh': '申辦服務'}, 'entry': '/', 'match': {'url': '^/(form/)?$'}, 'steps': [
    step('pick', '^/$', [T('{{entity}}'), C('input[placeholder*="問題"]')], '點「{{entity}}」', '或在搜尋框輸入要申辦的項目', 'route', say_default='在搜尋框輸入要申辦的項目'),
    step('form', '^/form/', [C('input'), C('select'), C('textarea')], '照畫面填資料', '填完按最下面的「下一步」', 'manual'),
    step('next', '^/form/', [B('下一步')], '按「下一步」', '', 'route', confirm=True, final=True)]}
G['guide_coupon'] = {'id': 'guide_coupon', 'title': {'zh': '優惠票券'}, 'entry': '/coupon', 'match': {'url': '^/coupon'}, 'steps': [
    step('look', '^/coupon', [C('input[placeholder*="票券"]'), C('main')], '輸入場館或票券名稱', '或往下滑看熱門地點', 'manual', final=True)]}
G['guide_ticket_wallet'] = {'id': 'guide_ticket_wallet', 'title': {'zh': '票夾'}, 'entry': '/ticket-wallet', 'match': {'url': '^/ticket-wallet'}, 'steps': [
    step('look', '^/ticket-wallet', [T('票夾'), C('main')], '這裡是你買過的票', '點一張票可以看 QR code 或兌換', 'manual', final=True)]}
G['guide_subscription'] = {'id': 'guide_subscription', 'title': {'zh': '訂閱通知'}, 'entry': '/subscription', 'match': {'url': '^/subscription'}, 'steps': [
    step('pick', '^/subscription', [T('{{entity}}'), C('input[type=checkbox]')], '勾選「{{entity}}」', '可以勾好幾個', 'click', say_default='勾選你想收到的通知'),
    step('submit', '^/subscription', [B('訂閱'), B('送出'), B('確認')], '按「訂閱」', '', 'manual', confirm=True, final=True)]}
G['guide_qna'] = {'id': 'guide_qna', 'title': {'zh': '功能教學'}, 'entry': '/qna', 'match': {'url': '^/qna'}, 'steps': [
    step('pick', '^/qna', [T('{{entity}}'), C('main')], '點「{{entity}}」', '點開會展開說明', 'manual', final=True, say_default='點你想看的主題')]}
G['guide_scan_bill'] = {'id': 'guide_scan_bill', 'title': {'zh': '掃描帳單'}, 'entry': '/fee-payment/scan', 'match': {'url': '^/fee-payment/scan'}, 'steps': [
    step('scan', '^/fee-payment/scan', [C('video'), C('main')], '把相機對準帳單上的條碼', '對準後會自動辨識', 'manual', final=True)]}

G['guide_vaccine'] = {'id': 'guide_vaccine', 'title': {'zh': '疫苗預約'}, 'entry': '/vaccine', 'match': {'url': '^/vaccine'}, 'steps': [
    step('type', '^/vaccine', [dict(option='{{entity}}'), C('#vaccine_type')], '選疫苗種類「{{entity}}」', '', 'change', say_default='選疫苗種類'),
    step('site', '^/vaccine', [C('#site')], '選接種地點', '', 'change'),
    step('date', '^/vaccine', [L('日期'), C('#date')], '選日期', '', 'input', accept='text'),
    step('slot', '^/vaccine', [L('上午'), L('下午')], '選上午或下午', '', 'click'),
    step('submit', '^/vaccine', [B('預約')], '按「預約」', '', 'click', confirm=True, final=True)]}
G['guide_hospital_registration'] = {'id': 'guide_hospital_registration', 'title': {'zh': '聯醫掛號'}, 'entry': '/hospital-registration', 'match': {'url': '^/hospital-registration'}, 'steps': [
    step('branch', '^/hospital-registration', [dict(option='{{entity}}'), C('#branch')], '選院區', '', 'change'),
    step('dept', '^/hospital-registration', [C('#dept')], '選科別', '', 'change'),
    step('slot', '^/hospital-registration', [T('醫師')], '點一個醫師與時段', '', 'click'),
    step('submit', '^/hospital-registration', [B('確認掛號')], '按「確認掛號」', '', 'click', confirm=True, final=True)]}
G['guide_family_center'] = {'id': 'guide_family_center', 'title': {'zh': '親子館'}, 'entry': '/family-center', 'match': {'url': '^/family-center'}, 'steps': [
    step('pick', '^/family-center/?$', [T('{{entity}}'), C('a[href*="family-center/"]')], '點你要去的親子館', '', 'route', say_default='點你要去的親子館'),
    step('activity', '^/family-center/', [B('報名')], '點活動的「報名」', '', 'click'),
    step('name', '^/family-center/', [L('家長姓名'), C('#parent_name')], '輸入家長姓名', '', 'input', accept='text'),
    step('phone', '^/family-center/', [L('聯絡電話'), C('#phone')], '輸入聯絡電話', '', 'input', accept='phone'),
    step('age', '^/family-center/', [C('#child_age')], '選小孩年齡', '', 'change'),
    step('submit', '^/family-center/', [B('送出報名')], '按「送出報名」', '', 'click', confirm=True, final=True)]}
G['guide_ivoting'] = {'id': 'guide_ivoting', 'title': {'zh': '網路投票'}, 'entry': '/ivoting', 'match': {'url': '^/ivoting'}, 'steps': [
    step('pick', '^/ivoting/?$', [T('{{entity}}'), C('a[href*="ivoting/"]')], '點一個投票議題', '', 'route', say_default='點一個投票議題'),
    step('choose', '^/ivoting/', [C('label')], '點你的選擇', '', 'click'),
    step('submit', '^/ivoting/', [B('投票')], '按「投票」', '', 'click', confirm=True, final=True)]}
G['guide_survey'] = {'id': 'guide_survey', 'title': {'zh': '意見調查'}, 'entry': '/survey', 'match': {'url': '^/survey'}, 'steps': [
    step('pick', '^/survey/?$', [T('{{entity}}'), C('a[href*="survey/"]')], '點一份問卷', '', 'route', say_default='點一份問卷'),
    step('answer', '^/survey/', [C('label')], '每一題點一個答案', '', 'manual'),
    step('submit', '^/survey/', [B('送出')], '按「送出」', '', 'click', confirm=True, final=True)]}
G['guide_neighborhood'] = {'id': 'guide_neighborhood', 'title': {'zh': '里辦服務'}, 'entry': '/neighborhood', 'match': {'url': '^/neighborhood'}, 'steps': [
    step('district', '^/neighborhood/?$', [dict(option='{{entity}}'), C('#district')], '選你住的行政區', '', 'change'),
    step('pick', '^/neighborhood/?$', [T('{{entity}}'), C('a[href*="neighborhood/"]')], '點你的里', '', 'route', say_default='點你的里'),
    step('look', '^/neighborhood/', [B('撥打電話'), T('里長')], '這裡有里長電話和公告', '按「撥打電話」可以直接打給里辦公處', 'manual', final=True)]}
G['guide_city_radio'] = {'id': 'guide_city_radio', 'title': {'zh': '台北電台'}, 'entry': '/city-radio', 'match': {'url': '^/city-radio'}, 'steps': [
    step('play', '^/city-radio', [B('播放')], '按「播放」', '下面是節目表', 'click', final=True)]}
G['guide_green_map'] = {'id': 'guide_green_map', 'title': {'zh': '簡單森呼吸'}, 'entry': '/green-map', 'match': {'url': '^/green-map'}, 'steps': [
    step('pick', '^/green-map', [dict(option='{{entity}}'), C('#findPlace'), C('select')], '選「{{entity}}」', '', 'change', say_default='選你想找的綠地類型'),
    step('look', '^/green-map', [C('.leaflet-marker-icon')], '點地圖上的標記看地點', '', 'manual', final=True)]}
G['guide_pet_map'] = {'id': 'guide_pet_map', 'title': {'zh': '寵物安心遛'}, 'entry': '/pet-map', 'match': {'url': '^/pet-map'}, 'steps': [
    step('pick', '^/pet-map', [dict(option='{{entity}}'), C('#findPlace'), C('select')], '選「{{entity}}」', '', 'change', say_default='選你要找的寵物地點類型'),
    step('look', '^/pet-map', [C('.leaflet-marker-icon')], '點地圖上的標記看地點', '', 'manual', final=True)]}
G['guide_essential_goods'] = {'id': 'guide_essential_goods', 'title': {'zh': '民生物資'}, 'entry': '/essential-goods', 'match': {'url': '^/essential-goods'}, 'steps': [
    step('category', '^/essential-goods', [dict(option='{{entity}}'), C('#category')], '選「{{entity}}」', '', 'change', say_default='選一個分類'),
    step('look', '^/essential-goods', [T('今日均價'), C('table')], '看今天的價格', '紅色是漲、綠色是跌', 'manual', final=True)]}
G['guide_zoo'] = {'id': 'guide_zoo', 'title': {'zh': '愛遊動物園'}, 'entry': '/zoo', 'match': {'url': '^/zoo'}, 'steps': [
    step('tab', '^/zoo', [T('{{entity}}'), B('動物介紹')], '點「{{entity}}」', '', 'click', say_default='點上面的分頁看地圖、動物或活動'),
    step('look', '^/zoo', [C('main'), C('.leaflet-marker-icon')], '看這裡的內容', '', 'manual', final=True)]}

os.makedirs(OUT, exist_ok=True)
for gid, g in G.items():
    json.dump(g, open(os.path.join(OUT, gid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
idx_path = os.path.join(OUT, 'index.json')
idx = json.load(open(idx_path, encoding='utf-8'))
have = {g['id'] for g in idx['guides']}
for gid, g in G.items():
    if gid not in have:
        idx['guides'].append({'id': gid, 'match': g['match'], 'title': g['title']})
json.dump(idx, open(idx_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('guides:', len(idx['guides']))
