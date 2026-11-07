# 產生「原 App 點不進去」的那些入口的靜態示範頁（同一套城市通配色），放進 TownPass-Services/public/<name>/index.html
# 跑完 pnpm build 後就會在 dist 裡，再由 bundle-web.mjs 打進 APK（http://townpass.local/<name>/）。
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'TownPass-Services', 'public')

CSS = """
*{box-sizing:border-box}body{margin:0;font-family:'PingFang TC',Roboto,system-ui,'Noto Sans TC',sans-serif;background:#f1f3f4;color:#171b1d;font-size:16px}
header{position:sticky;top:0;background:#fff;padding:14px 16px;font-weight:700;font-size:18px;text-align:center;border-bottom:1px solid #e6eaec;display:flex;align-items:center}
header a{color:#2eb6c7;text-decoration:none;font-size:22px;width:32px}header span{flex:1}
main{padding:12px 16px 32px;max-width:640px;margin:0 auto}
.card{background:#fff;border-radius:14px;padding:14px 16px;margin:10px 0;box-shadow:0 2px 8px rgba(0,0,0,.05)}
.card h3{margin:0 0 4px;font-size:16px}.muted{color:#738995;font-size:13px}.tag{display:inline-block;background:#e6f7fa;color:#238d9b;border-radius:999px;padding:2px 10px;font-size:12px;margin-right:6px}
.kpi{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kpi .card{margin:0}.kpi .v{font-size:28px;font-weight:800;color:#2eb6c7}.kpi .k{color:#738995;font-size:13px}
.btn{display:block;width:100%;border:0;border-radius:12px;padding:12px;background:#2eb6c7;color:#fff;font:inherit;font-weight:700;margin-top:10px}
.btn.secondary{background:#fff;color:#2eb6c7;border:2px solid #2eb6c7}
a.row{display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit}a.row .ic{font-size:28px}a.row .chev{margin-left:auto;color:#91a0a8}
.bar{height:8px;background:#e6eaec;border-radius:4px;overflow:hidden}.bar i{display:block;height:100%;background:#2eb6c7}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:8px 4px;border-bottom:1px solid #eef1f3;text-align:left}th{color:#738995;font-weight:600}
.note{background:#fff8e6;border-radius:10px;padding:10px 12px;font-size:13px;color:#8a6d1f;margin-top:10px}
"""

def page(name, title, body, script=''):
    d = os.path.join(OUT, name)
    os.makedirs(d, exist_ok=True)
    html = f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>{title}</title><style>{CSS}</style></head>
<body><header><a href="javascript:history.length>1?history.back():location.assign('/')">‹</a><span>{title}</span><span style="width:32px"></span></header><main>{body}</main>{script}</body></html>"""
    open(os.path.join(d, 'index.html'), 'w', encoding='utf-8', newline='\n').write(html)
    print('wrote', name)

def cards(items):
    return ''.join(f'<div class="card"><h3>{t}</h3><div class="muted">{m}</div>{x}</div>' for t, m, x in items)

page('news', '市政新聞', cards([
    ('北市 12 月起試辦「夜間垃圾車延後收運」', '2026-11-06 · 環境保護局', '<p>信義、大安兩區 18 條路線延後 30 分鐘，方便晚下班的市民。</p>'),
    ('臺北通 App 新增「小幫手」語音導覽', '2026-11-05 · 資訊局', '<p>說一句話就能找到服務、陪你一步一步填完；長輩與小朋友都有專屬介面。</p>'),
    ('公共自行車 YouBike 2.0 新增 40 站', '2026-11-04 · 交通局', '<p>北投、士林、內湖新增站點，12 月全面啟用。</p>'),
    ('流感疫苗第二階段開打', '2026-11-03 · 衛生局', '<p>50 歲以上成人及高風險族群可至合約院所免費接種。</p>'),
    ('冬季限定「臺北燈節」12/20 登場', '2026-11-02 · 觀光傳播局', '<p>今年以「光之城市」為主題，西門町至中山北路設置 30 組燈飾。</p>'),
    ('市立圖書館延長週日開放時間', '2026-11-01 · 教育局', '<p>總館與 6 個分館週日開放至 21:00。</p>'),
]))

page('construction', '施工資訊', '<div class="muted" style="margin:4px 0 8px">更新時間 2026-11-07 16:00 · 共 7 件進行中</div>' + cards([
    ('忠孝東路四段（復興南路–敦化南路）', '道路刨鋪 · 2026-11-05 ～ 11-12 · 22:00–06:00', '<span class="tag">夜間施工</span><span class="tag">單向封閉</span>'),
    ('信義路五段 松仁路口', '捷運信義線東延段 · 2025-03 ～ 2027-12', '<span class="tag">長期</span><span class="tag">改道</span>'),
    ('民生東路三段 136 號前', '自來水管線汰換 · 2026-11-07 ～ 11-09', '<span class="tag">佔用慢車道</span>'),
    ('中山北路二段（長春路–民權東路）', '人行道改善 · 2026-10-20 ～ 11-30', '<span class="tag">人行道縮減</span>'),
    ('羅斯福路三段 公館圓環', '號誌更新 · 2026-11-08 ～ 11-08 · 00:00–05:00', '<span class="tag">夜間施工</span>'),
    ('內湖路一段（港墘路–文德路）', '電纜地下化 · 2026-11-01 ～ 12-15', '<span class="tag">佔用外側車道</span>'),
    ('萬華區 西園路二段', '污水下水道接管 · 2026-10-28 ～ 11-20', '<span class="tag">巷道封閉</span>'),
]))

apps = [('臺北通', '市政服務單一入口', '🏙️'), ('臺北等公車', '即時公車動態', '🚌'), ('YouBike 2.0', '公共自行車租借', '🚲'), ('臺北市立圖書館', '借閱、預約、電子書', '📚'),
        ('臺北市動物園', '園區導覽、活動', '🐼'), ('臺北旅遊網', '景點、活動、住宿', '🗺️'), ('臺北市停車', '路邊停車查詢、繳費', '🅿️'), ('臺北市消防局', '防災資訊、避難所', '🚒')]
page('apps', '市政 APP', ''.join(f'<div class="card"><a class="row" href="#"><span class="ic">{i}</span><span><h3>{n}</h3><div class="muted">{d}</div></span><span class="chev">›</span></a></div>' for n, d, i in apps)
     + '<div class="note">示範資料：實際版本會連到各 App 的商店頁。</div>')

life = [('親子館', '/family-center', '🧸'), ('愛遊動物園', '/zoo', '🐼'), ('簡單森呼吸', '/green-map', '🌳'), ('寵物安心遛', '/pet-map', '🐶'), ('台北電台', '/city-radio', '📻'), ('民生物資', '/essential-goods', '🛒'), ('圖書借閱', '/library-service/', '📚'), ('找地點', '/surrounding-service/', '📍')]
page('city-life', '城市生活', ''.join(f'<div class="card"><a class="row" href="{u}"><span class="ic">{i}</span><span><h3>{n}</h3></span><span class="chev">›</span></a></div>' for n, u, i in life))

page('invoice', '電子發票', '''<div class="kpi"><div class="card"><div class="k">本期中獎</div><div class="v">1 張</div></div><div class="card"><div class="k">已歸戶發票</div><div class="v">37 張</div></div></div>
<div class="card"><h3>手機條碼</h3><div style="font:700 28px ui-monospace,monospace;letter-spacing:2px;text-align:center;padding:10px 0">/AB12+CD</div><div class="muted" style="text-align:center">結帳時出示給店員掃描</div></div>
<div class="card"><h3>最近發票</h3><table><tr><th>日期</th><th>店家</th><th>金額</th></tr>
<tr><td>11/06</td><td>全聯福利中心 信義店</td><td>NT$ 486</td></tr><tr><td>11/05</td><td>7-ELEVEN 松高門市</td><td>NT$ 120</td></tr><tr><td>11/04</td><td>臺北市立圖書館 影印</td><td>NT$ 12</td></tr><tr><td>11/02</td><td>家樂福 內湖店</td><td>NT$ 1,280</td></tr><tr><td>10/30</td><td>臺北捷運 加值</td><td>NT$ 500</td></tr></table></div>
<div class="card"><h3>115 年 9–10 月開獎</h3><div>六獎 NT$ 200 · 發票號碼 AB-12345678 · <span class="tag">中獎</span></div><button class="btn">領獎說明</button></div>''')

page('receipt', '繳費收據', '''<div class="card"><h3>收據清單</h3><table><tr><th>日期</th><th>項目</th><th>金額</th><th></th></tr>
<tr><td>2026-11-05</td><td>水費 115/09-10</td><td>NT$ 486</td><td><a href="#" style="color:#2eb6c7">下載</a></td></tr>
<tr><td>2026-10-28</td><td>停車費 10 月</td><td>NT$ 1,240</td><td><a href="#" style="color:#2eb6c7">下載</a></td></tr>
<tr><td>2026-10-15</td><td>地方稅 房屋稅</td><td>NT$ 8,920</td><td><a href="#" style="color:#2eb6c7">下載</a></td></tr>
<tr><td>2026-09-30</td><td>聯合醫院 門診</td><td>NT$ 350</td><td><a href="#" style="color:#2eb6c7">下載</a></td></tr>
<tr><td>2026-09-12</td><td>公訓處 自費課程</td><td>NT$ 1,500</td><td><a href="#" style="color:#2eb6c7">下載</a></td></tr></table></div>
<div class="note">示範資料：下載會產生 PDF 收據。</div>''')

page('bill-settings', '我的帳單設定', '''<div class="card"><h3>已綁定帳單</h3>
<label style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eef1f3"><span>水費 · 水號 0123456789</span><input type="checkbox" checked></label>
<label style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eef1f3"><span>停車費 · ABC-1234</span><input type="checkbox" checked></label>
<label style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eef1f3"><span>地方稅 · 房屋稅</span><input type="checkbox" checked></label>
<label style="display:flex;justify-content:space-between;padding:8px 0"><span>聯合醫院醫療費</span><input type="checkbox"></label></div>
<div class="card"><h3>提醒</h3><label style="display:flex;justify-content:space-between;padding:8px 0"><span>繳費期限前 3 天通知我</span><input type="checkbox" checked></label>
<label style="display:flex;justify-content:space-between;padding:8px 0"><span>新帳單產生時通知我</span><input type="checkbox" checked></label></div>
<a class="btn secondary" style="text-align:center;text-decoration:none" href="/fee-payment/others/">＋ 新增綁定</a><button class="btn" onclick="alert('已儲存')">儲存</button>''')

page('dashboard', '市政資訊儀表板', '''<div class="muted" style="margin:4px 0 8px">2026-11-07 · 即時</div>
<div class="kpi"><div class="card"><div class="k">空氣品質 AQI</div><div class="v">42 <small style="font-size:14px;color:#2a9d4a">良好</small></div></div>
<div class="card"><div class="k">氣溫</div><div class="v">23°C</div></div>
<div class="card"><div class="k">YouBike 可借</div><div class="v">8,214</div></div>
<div class="card"><div class="k">公車準點率</div><div class="v">93%</div></div>
<div class="card"><div class="k">1999 今日受理</div><div class="v">1,062</div></div>
<div class="card"><div class="k">捷運今日運量</div><div class="v">183 萬</div></div></div>
<div class="card"><h3>水庫蓄水率</h3><div class="muted">翡翠水庫 87%</div><div class="bar"><i style="width:87%"></i></div></div>
<div class="card"><h3>垃圾回收率</h3><div class="muted">本月 68%</div><div class="bar"><i style="width:68%"></i></div></div>
<div class="card"><h3>市民滿意度</h3><div class="muted">本季 4.3 / 5</div><div class="bar"><i style="width:86%"></i></div></div>
<div class="note">示範資料；正式版連到 dashboard.gov.taipei。</div>''')

page('faq', '功能教學', cards([
    ('小幫手怎麼用？', '', '<p>按首頁右下角的「小幫手」，說一句話（例如「我要繳水費」），它會幫你找到服務並陪你一步一步做。</p>'),
    ('小幫手什麼時候會自己出現？', '', '<p>只有在你連續亂點 5 下的時候，它才會出來問要不要幫忙；其他時候都安靜躲著。</p>'),
    ('字太小怎麼辦？', '', '<p>小幫手 ⚙ 裡選「長輩」，字會放大並且每一步唸給你聽。</p>'),
    ('沒有網路也能用嗎？', '', '<p>可以。服務頁與小幫手都在手機裡；語音辨識需先下載離線語言包。</p>'),
    ('怎麼綁定帳單？', '', '<p>帳務 → 新增綁定，選擇項目並輸入號碼。</p>'),
]))

page('privacy', '隱私權政策', '''<div class="card"><h3>資料蒐集</h3><p>臺北通僅在提供服務所需的範圍內蒐集個人資料，並依個人資料保護法處理。</p></div>
<div class="card"><h3>小幫手的語音與文字</h3><p>語音辨識、翻譯與意圖判斷全部在你的手機上完成，不會上傳到任何伺服器。</p></div>
<div class="card"><h3>資料保存</h3><p>導覽進度只存在手機瀏覽器的工作階段中，離開服務即清除。</p></div>
<div class="card"><h3>聯絡我們</h3><p>CodeFestTaipei@gov.taipei</p></div>''')
print('static pages done')
