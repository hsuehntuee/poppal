#!/usr/bin/env python3
"""
產生「找地點 / 周邊服務」的分類樹與每個項目的示範資料（天母體育館周邊）。

  python -I tools/gen_find_place.py

輸出（全部可重跑、固定 seed、內容不變）：
  TownPass-Services/public/mock/place_list.json          9 個分類、每個項目一筆 Place
  TownPass-Services/public/mock/find-place/<slug>.json   每個項目 4–8 個地點（士林區，天母體育館 1.2 km 內）

保留兩份真實資料（不重寫）：
  公廁   → /mock/find-place/public_toilet_taipei.json
  停車場 → /mock/find-place/TCMSV_alldesc.json
"""
import json
import math
import os
import random

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SVC = os.path.join(ROOT, 'TownPass-Services')
PUB = os.path.join(SVC, 'public')
MOCK = os.path.join(PUB, 'mock')
OUT_DIR = os.path.join(MOCK, 'find-place')

# 天母體育館（天母棒球場）
CENTER_LAT, CENTER_LNG = 25.1169, 121.5318
MAX_RADIUS_M = 1200
AREA = '士林區'

STREETS = [
    ('忠誠路二段', 20, 220), ('忠誠路一段', 10, 190), ('士東路', 10, 300), ('天母東路', 10, 100),
    ('天母西路', 10, 120), ('中山北路七段', 10, 230), ('中山北路六段', 200, 450), ('德行東路', 20, 320),
    ('天母北路', 10, 90), ('天玉街', 10, 60), ('天母街', 10, 50), ('克強路', 10, 60),
]
LANDMARKS = [
    '天母體育館', '天母棒球場', '天母公園', '士東市場', '天母國小', '天母國中', '蘭雅公園', '蘭雅國小',
    '芝山公園', '天母運動公園', '三玉宮', '忠誠公園', '天母廣場', '士林運動中心', '天母商圈', '磺溪步道',
    '天和公園', '東和公園', '士東國小', '天母圖書館', '三玉里民活動中心', '天玉里民活動中心',
]
PHONES = ['02-2871-{:04d}', '02-2873-{:04d}', '02-2874-{:04d}', '02-2876-{:04d}', '02-2838-{:04d}']
HOURS = ['24 小時', '06:00–22:00', '08:00–17:00', '08:30–17:30', '09:00–21:00', '07:00–23:00', '10:00–22:00']

# 固定欄位（示範資料都是扁平 JSON，直接對應 Spot）
FLAT_FIELDS = {'id': 'id', 'name': 'name', 'area': 'area', 'address': 'address', 'lat': 'lat', 'lng': 'lng'}


def si(title, field):
    return {'title': title, 'value_field': field}


# ---------------------------------------------------------------------------
# 分類樹：group → [(名稱, slug, icon, 機關, 命名樣板, service_infos, 欄位值池)]
#   命名樣板：{lm}=地標、{st}=街名、{n}=流水號
#   欄位值池：field → list（隨機挑）或 callable(rng) → value
# ---------------------------------------------------------------------------
def item(name, slug, icon, agency, templates, infos, pools):
    return dict(name=name, slug=slug, icon=icon, agency=agency, templates=templates, infos=infos, pools=pools)


NOTE_GENERIC = ['免費使用', '請依現場標示使用', '依現場告示為準', '假日人潮較多', '設有無障礙動線', '鄰近公車站牌']

TREE = [
    ('交通運輸、停車場、充電站', 'pa', [
        item('微笑單車 2.0', 'youbike', '/images/map/youbike/icon-info-ubike-green.svg', '臺北市政府交通局',
             ['YouBike2.0_{lm}', 'YouBike2.0_{st}口', 'YouBike2.0_{lm}({st})'],
             [{'title': '備註', 'value_fields': [{'title': '可借車輛', 'value_field': 'available_rent_bikes'},
                                                {'title': '可停空位', 'value_field': 'available_return_bikes'}]},
              si('更新時間', 'updateTime')],
             {'available_rent_bikes': lambda r: r.randint(0, 18), 'available_return_bikes': lambda r: r.randint(0, 20),
              'updateTime': lambda r: f'2026-11-07 {r.randint(7, 21):02d}:{r.choice([0, 15, 30, 45]):02d}:00'}),
        item('機車充電站', 'scooter-charging', '/images/subscription/icon_meter.svg', '臺北市政府產業發展局',
             ['{lm}機車充電站', '{st}機車充電站'],
             [si('充電規格', 'spec'), si('開放時間', 'open_hours'), si('備註', 'note')],
             {'spec': ['Gogoro 電池交換', '110V 插座 ×4', '220V 快充 ×2', '110V 插座 ×6'], 'open_hours': HOURS,
              'note': ['免費充電 2 小時', '需使用停車場月票', '請勿長時間佔用', '收費依停車場費率']}),
        item('施工資訊', 'roadwork', '/images/report/report-transport.svg', '臺北市政府工務局新建工程處',
             ['{st}道路施工', '{st}管線更新工程', '{lm}周邊人行道改善'],
             [si('施工期間', 'period'), si('施工單位', 'unit'), si('備註', 'note')],
             {'period': ['2026/11/01–2026/11/30', '2026/10/20–2026/12/15', '2026/11/05–2026/11/20', '2026/11/10–2027/01/31'],
              'unit': ['臺北自來水事業處', '台灣電力公司', '新建工程處', '欣欣天然氣'],
              'note': ['夜間施工 22:00–06:00', '單側車道縮減', '請改道行駛', '人行道暫時封閉']}),
        '停車場',  # 真實資料，見 REAL
        item('計程車招呼站', 'taxi-stand', '/images/subscription/icon_traffic_info.svg', '臺北市政府交通局',
             ['{lm}計程車招呼站', '{st}計程車招呼站'],
             [si('車位數', 'slots'), si('備註', 'note')],
             {'slots': lambda r: f'{r.randint(2, 6)} 格', 'note': ['24 小時可候車', '尖峰時段排班', '鄰近捷運接駁', '限排班計程車停靠']}),
        item('營業用共用臨停區', 'shared-loading-zone', '/images/subscription/icon_parking.svg', '臺北市停車管理工程處',
             ['{st}臨停區', '{lm}貨車臨停區'],
             [si('使用時段', 'open_hours'), si('限停', 'limit'), si('備註', 'note')],
             {'open_hours': ['07:00–20:00', '06:00–22:00', '08:00–18:00'], 'limit': ['30 分鐘', '15 分鐘', '20 分鐘'],
              'note': ['限營業用車輛', '裝卸貨專用', '請勿熄火久停']}),
        item('今日使用道路集會路段', 'road-event-today', '/images/subscription/icon_public_meeting.svg', '臺北市政府警察局士林分局',
             ['{st}路跑活動', '{lm}周邊封路', '{st}踩街活動'],
             [si('活動時間', 'period'), si('管制範圍', 'scope'), si('備註', 'note')],
             {'period': ['11/07 06:00–10:00', '11/07 14:00–18:00', '11/07 09:00–12:00', '11/07 17:00–21:00'],
              'scope': ['單側車道', '全線封閉', '部分路段'], 'note': ['請提前改道', '公車改道行駛', '交通警察現場指揮']}),
    ]),
    ('飲水機、公廁、哺集乳室、AED 場所', 'pb', [
        item('飲水機／提供飲水店家', 'water-fountain', '/images/subscription/icon_water_bill.svg', '臺北市政府環境保護局',
             ['{lm}飲水機', '{st}飲水店家'],
             [si('類型', 'kind'), si('開放時間', 'open_hours'), si('備註', 'note')],
             {'kind': ['公共飲水機', '提供飲水店家', '冷熱飲水機'], 'open_hours': HOURS, 'note': ['可自備水壺裝水', '每季水質檢驗合格', '店家營業時間內提供']}),
        item('地區直飲台', 'direct-drinking', '/images/subscription/icon_water_bill.svg', '臺北自來水事業處',
             ['{lm}直飲台', '{st}直飲台'],
             [si('開放時間', 'open_hours'), si('備註', 'note')],
             {'open_hours': ['24 小時', '06:00–22:00', '07:00–21:00'], 'note': ['自來水直飲', '每月檢驗', '設有兒童高度出水口']}),
        '公廁',  # 真實資料，見 REAL
        item('無障礙廁所', 'accessible-toilet', '/images/icon_toilet.svg', '臺北市政府環境保護局',
             ['{lm}無障礙廁所', '{lm}公廁(無障礙)'],
             [si('開放時間', 'open_hours'), si('設備', 'facility'), si('等級', 'grade')],
             {'open_hours': HOURS, 'facility': ['扶手、緊急呼叫鈴', '扶手、自動門', '扶手、尿布台'], 'grade': ['特優級', '優等級', '良級']}),
        item('親子友善廁所', 'family-toilet', '/images/icon_toilet.svg', '臺北市政府環境保護局',
             ['{lm}親子廁所', '{lm}公廁(親子)'],
             [si('開放時間', 'open_hours'), si('設備', 'facility')],
             {'open_hours': HOURS, 'facility': ['尿布台、兒童馬桶', '尿布台、兒童洗手台', '尿布台、嬰兒座椅']}),
        item('性別友善廁所', 'gender-friendly-toilet', '/images/icon_toilet.svg', '臺北市政府環境保護局',
             ['{lm}性別友善廁所', '{lm}公廁(性別友善)'],
             [si('開放時間', 'open_hours'), si('備註', 'note')],
             {'open_hours': HOURS, 'note': ['獨立隔間', '不分性別皆可使用', '設有無障礙隔間']}),
        item('哺集乳室', 'nursing-room', '/images/subscription/icon_daycare.svg', '臺北市政府衛生局',
             ['{lm}哺集乳室', '{lm}哺乳室'],
             [si('開放時間', 'open_hours'), si('設備', 'facility'), si('電話', 'phone')],
             {'open_hours': ['08:30–17:30', '09:00–21:00', '08:00–22:00', '10:00–22:00'], 'facility': ['沙發、尿布台、洗手台', '沙發、冰箱、尿布台', '沙發、熱水、尿布台'], 'phone': 'phone'}),
        item('捐血站', 'blood-donation', '/images/subscription/icon_health_info.svg', '台灣血液基金會臺北捐血中心',
             ['{lm}捐血站', '{st}捐血室', '{lm}捐血車'],
             [si('開放時間', 'open_hours'), si('電話', 'phone'), si('備註', 'note')],
             {'open_hours': ['09:00–17:00', '10:00–18:00', '09:00–17:30', '12:00–20:00'], 'phone': 'phone', 'note': ['請攜帶身分證', '捐血車定點', '週一公休']}),
        item('AED 場所', 'aed', '/images/subscription/icon_health_info.svg', '臺北市政府衛生局',
             ['{lm}', '{lm}服務台', '{st}便利商店'],
             [si('放置位置', 'location'), si('開放時間', 'open_hours'), si('電話', 'phone')],
             {'location': ['1 樓服務台', '大門警衛室', '1 樓大廳', '櫃台旁牆面', '2 樓辦公室'], 'open_hours': HOURS, 'phone': 'phone'}),
        item('郵箱', 'mailbox', '/images/subscription/icon_community_bulletin.svg', '中華郵政臺北郵局',
             ['{st}郵筒', '{lm}郵筒'],
             [si('收件時間', 'pickup'), si('備註', 'note')],
             {'pickup': ['平日 10:30、16:30', '平日 11:00、17:00', '平日 15:30', '平日 10:00、15:00'], 'note': ['紅色限時郵筒', '綠色普通郵筒', '紅綠雙筒']}),
    ]),
    ('垃圾清潔、舊衣回收', 'pc', [
        item('舊衣回收箱', 'clothes-recycling', '/images/report/report-env.svg', '臺北市政府環境保護局',
             ['{st}舊衣回收箱', '{lm}舊衣回收箱'],
             [si('設置單位', 'unit'), si('備註', 'note')],
             {'unit': ['士林區清潔隊', '伊甸基金會', '創世基金會', '陽光基金會'], 'note': ['請勿投入棉被、枕頭', '衣物請清洗後投入', '每週清運一次']}),
        item('垃圾清運點', 'garbage-point', '/images/report/report-env.svg', '臺北市政府環境保護局士林區清潔隊',
             ['{st}垃圾清運點', '{lm}前垃圾車停靠點'],
             [si('清運時間', 'time'), si('路線', 'route'), si('備註', 'note')],
             {'time': ['17:30–17:40', '18:05–18:15', '19:20–19:30', '20:10–20:20', '21:00–21:10'], 'route': ['士林 12 路線', '士林 15 路線', '士林 18 路線'],
              'note': ['週三、週日停收', '請使用專用垃圾袋', '資源回收車同時停靠']}),
        item('垃圾限時收受點', 'garbage-timed', '/images/report/report-env.svg', '臺北市政府環境保護局士林區清潔隊',
             ['{st}限時收受點', '{lm}限時收受點'],
             [si('收受時間', 'time'), si('備註', 'note')],
             {'time': ['每日 08:00–10:00', '每日 15:00–17:00', '每日 06:30–08:30'], 'note': ['請使用專用垃圾袋', '限一般垃圾', '週日停收']}),
        item('廚餘週三日收受點', 'kitchen-waste-wed-sun', '/images/report/report-env.svg', '臺北市政府環境保護局士林區清潔隊',
             ['{st}廚餘收受點', '{lm}廚餘回收點'],
             [si('收受時間', 'time'), si('備註', 'note')],
             {'time': ['週三、週日 08:00–10:00', '週三、週日 17:30–18:30', '週三、週日 19:00–20:00'], 'note': ['生、熟廚餘分開', '請瀝乾水分', '限家庭廚餘']}),
        item('清潔箱', 'litter-bin', '/images/report/report-env.svg', '臺北市政府環境保護局',
             ['{st}清潔箱', '{lm}清潔箱'],
             [si('類型', 'kind'), si('備註', 'note')],
             {'kind': ['一般垃圾', '一般垃圾＋資源回收', '資源回收'], 'note': ['請勿丟棄家戶垃圾', '每日清理', '公車站旁']}),
        item('狗便清潔袋', 'dog-waste-bag', '/images/report/report-env.svg', '臺北市動物保護處',
             ['{lm}狗便清潔袋箱', '{st}狗便袋取用點'],
             [si('備註', 'note')],
             {'note': ['免費取用', '請隨手清理', '每週補充', '請丟入一般垃圾']}),
    ]),
    ('TaipeiFree', 'pd', [
        item('TaipeiFree', 'taipeifree', '/images/subscription/icon_community_bulletin.svg', '臺北市政府資訊局',
             ['{lm}', '{lm}TaipeiFree 熱點', '{st}公車亭'],
             [si('熱點類型', 'kind'), si('開放時間', 'open_hours'), si('備註', 'note')],
             {'kind': ['室內', '室外', '公車亭'], 'open_hours': HOURS, 'note': ['連線 TPE-Free 免登入', '每次 24 小時', '訊號涵蓋 1 樓大廳']}),
    ]),
    ('友善店家', 'pe', [
        item('哺集乳室友善店家', 'nursing-friendly-store', '/images/subscription/icon_daycare.svg', '臺北市政府衛生局',
             ['{lm}親子餐廳', '{st}咖啡館', '{st}藥局'],
             [si('營業時間', 'open_hours'), si('電話', 'phone'), si('備註', 'note')],
             {'open_hours': ['09:00–21:00', '10:00–22:00', '08:00–20:00'], 'phone': 'phone', 'note': ['提供哺乳空間', '可借用尿布台', '提供溫奶服務']}),
        item('月經友善', 'period-friendly', '/images/subscription/icon_health_info.svg', '臺北市政府社會局',
             ['{st}便利商店', '{st}藥妝店', '{lm}服務台'],
             [si('營業時間', 'open_hours'), si('備註', 'note')],
             {'open_hours': HOURS, 'note': ['免費提供衛生棉', '設有生理用品取用箱', '可借用廁所']}),
        item('公平貿易友善店家', 'fair-trade-store', '/images/subscription/icon_gas_price.svg', '臺北市政府產業發展局',
             ['{st}咖啡館', '{st}茶坊', '{lm}商店'],
             [si('營業時間', 'open_hours'), si('電話', 'phone'), si('備註', 'note')],
             {'open_hours': ['10:00–21:00', '11:00–20:00', '09:00–18:00'], 'phone': 'phone', 'note': ['販售公平貿易咖啡', '公平貿易巧克力', '公平貿易茶葉']}),
        item('便利支付友善店家', 'easy-payment-store', '/images/payment/icon_bill.svg', '臺北市政府產業發展局',
             ['{st}小吃店', '{st}早餐店', '{lm}商店'],
             [si('營業時間', 'open_hours'), si('支付方式', 'pay')],
             {'open_hours': ['06:00–14:00', '11:00–21:00', '10:00–22:00', '07:00–19:00'], 'pay': ['悠遊付、LINE Pay', '悠遊卡、街口', '信用卡、LINE Pay', '悠遊付、台灣 Pay']}),
        item('無障礙友善店家', 'accessible-store', '/images/subscription/icon_senior_info.svg', '臺北市政府社會局',
             ['{st}餐廳', '{st}書店', '{lm}商店'],
             [si('營業時間', 'open_hours'), si('無障礙設施', 'facility'), si('電話', 'phone')],
             {'open_hours': ['10:00–21:00', '11:00–22:00', '09:00–18:00'], 'facility': ['無障礙坡道、無障礙廁所', '平面入口、寬走道', '無障礙坡道、電梯'], 'phone': 'phone'}),
        item('素食友善店家', 'vegetarian-store', '/images/subscription/icon_migrant_support.svg', '臺北市政府產業發展局',
             ['{st}蔬食', '{st}素食坊', '{lm}素食'],
             [si('營業時間', 'open_hours'), si('電話', 'phone'), si('備註', 'note')],
             {'open_hours': ['11:00–20:00', '10:30–21:00', '06:00–14:00'], 'phone': 'phone', 'note': ['全素', '蛋奶素', '提供純素選項']}),
        item('穆斯林友善店家', 'muslim-friendly-store', '/images/subscription/icon_migrant_support.svg', '臺北市政府觀光傳播局',
             ['{st}清真餐廳', '{st}餐館', '{lm}餐廳'],
             [si('營業時間', 'open_hours'), si('認證', 'cert'), si('電話', 'phone')],
             {'open_hours': ['11:00–21:00', '11:30–22:00', '10:00–20:00'], 'cert': ['清真認證', '穆斯林友善餐旅', '清真認證（無豬肉、無酒精）'], 'phone': 'phone'}),
        item('Free Wifi', 'free-wifi-store', '/images/subscription/icon_meter.svg', '臺北市政府資訊局',
             ['{st}咖啡館', '{st}早午餐', '{lm}商店'],
             [si('營業時間', 'open_hours'), si('備註', 'note')],
             {'open_hours': ['08:00–20:00', '10:00–22:00', '09:00–21:00'], 'note': ['向店員索取密碼', '免費 Wi-Fi 免登入', '消費即可使用']}),
        item('行動裝置充電', 'mobile-charging-store', '/images/subscription/icon_meter.svg', '臺北市政府資訊局',
             ['{st}便利商店', '{st}咖啡館', '{lm}服務台'],
             [si('營業時間', 'open_hours'), si('備註', 'note')],
             {'open_hours': HOURS, 'note': ['提供 USB 充電', '提供插座', '提供 Type-C 充電線']}),
        item('性別友善店家', 'gender-friendly-store', '/images/subscription/icon_migrant_support.svg', '臺北市政府社會局',
             ['{st}書店', '{st}咖啡館', '{lm}商店'],
             [si('營業時間', 'open_hours'), si('備註', 'note')],
             {'open_hours': ['10:00–21:00', '12:00–22:00', '11:00–20:00'], 'note': ['性別友善空間', '設有性別友善廁所', '友善多元性別']}),
        item('友善廁所', 'friendly-toilet-store', '/images/icon_toilet.svg', '臺北市政府環境保護局',
             ['{st}便利商店', '{st}速食店', '{lm}商店'],
             [si('營業時間', 'open_hours'), si('備註', 'note')],
             {'open_hours': HOURS, 'note': ['免消費可借用廁所', '請向店員告知', '設有無障礙廁所']}),
        item('英文友善店家', 'english-friendly-store', '/images/subscription/icon_taipei_travelnews.svg', '臺北市政府觀光傳播局',
             ['{st}餐廳', '{st}咖啡館', '{lm}商店'],
             [si('營業時間', 'open_hours'), si('備註', 'note')],
             {'open_hours': ['11:00–21:00', '10:00–22:00', '09:00–18:00'], 'note': ['提供英文菜單', '店員可英語溝通', '英文菜單、英語服務']}),
    ]),
    ('區公所、學校、遊戲場所', 'pf', [
        item('區公所', 'district-office', '/images/icon_district_office.svg', '臺北市士林區公所',
             ['臺北市士林區公所', '士林區公所天母聯合服務站', '士林區戶政事務所天母站', '士林區健康服務中心', '士林區公所天母里民服務處'],
             [si('開放時間', 'open_hours'), si('電話', 'phone'), si('備註', 'note')],
             {'open_hours': ['週一至週五 08:30–17:30', '週一至週五 08:00–17:00'], 'phone': 'phone', 'note': ['中午不休息', '設有無障礙電梯', '提供自助取號']}),
        item('公私立高中職以下學校', 'school', '/images/subscription/icon_school_info.svg', '臺北市政府教育局',
             ['臺北市立天母國小', '臺北市立天母國中', '臺北市立蘭雅國小', '臺北市立蘭雅國中', '臺北市立士東國小', '臺北市立三玉國小', '臺北市立芝山國小', '臺北美國學校'],
             [si('類型', 'kind'), si('電話', 'phone'), si('備註', 'note')],
             {'kind': ['國小', '國中', '高中', '國際學校'], 'phone': 'phone', 'note': ['操場假日開放', '設有游泳池', '鄰近公車站']}),
        item('親子館', 'parent-child-center', '/images/subscription/icon_preschool_info.svg', '臺北市政府社會局',
             ['臺北市士林親子館', '天母親子館', '蘭雅親子館', '士林區托育資源中心', '天母公共托育家園', '芝山親子共讀站'],
             [si('開放時間', 'open_hours'), si('電話', 'phone'), si('備註', 'note')],
             {'open_hours': ['週二至週日 09:30–17:00', '週二至週日 09:00–17:30'], 'phone': 'phone', 'note': ['需線上預約', '週一休館', '0–6 歲親子免費入館']}),
    ]),
    ('河岸樂騎', 'pg', [
        item('河濱公園', 'riverside-park', '/images/subscription/icon_sports_park.svg', '臺北市政府工務局水利工程處',
             ['雙溪河濱公園', '磺溪河濱公園', '雙溪左岸河濱公園', '福林河濱公園', '雙溪自行車道起點', '磺溪親水公園'],
             [si('設施', 'facility'), si('備註', 'note')],
             {'facility': ['自行車道、籃球場', '自行車道、兒童遊戲場', '自行車道、棒球場', '自行車道、狗活動區'], 'note': ['全天開放', '堤防出入口設有坡道', '汛期請注意水位']}),
        item('河濱廁所', 'riverside-toilet', '/images/icon_toilet.svg', '臺北市政府工務局水利工程處',
             ['雙溪河濱公廁', '磺溪河濱公廁', '雙溪左岸公廁', '福林橋下公廁', '雙溪自行車道公廁'],
             [si('開放時間', 'open_hours'), si('等級', 'grade')],
             {'open_hours': ['24 小時', '06:00–22:00'], 'grade': ['特優級', '優等級', '良級']}),
        item('河濱休憩點', 'riverside-rest', '/images/subscription/icon_sports_park.svg', '臺北市政府工務局水利工程處',
             ['雙溪河濱涼亭', '磺溪河濱觀景平台', '雙溪左岸休憩區', '福林橋下休憩點', '雙溪自行車驛站'],
             [si('設施', 'facility'), si('備註', 'note')],
             {'facility': ['涼亭、座椅', '觀景平台、座椅', '飲水機、座椅', '自行車打氣筒、座椅'], 'note': ['全天開放', '夜間照明至 22:00', '可停自行車']}),
    ]),
    ('可通訊心理諮商之心理機構', 'ph', [
        item('心理諮商、治療所', 'counseling-clinic', '/images/subscription/icon_health_info.svg', '臺北市政府衛生局',
             ['{st}心理諮商所', '天母心理治療所', '{st}心理諮商所', '士林心理治療所'],
             [si('服務時間', 'open_hours'), si('電話', 'phone'), si('備註', 'note')],
             {'open_hours': ['週一至週六 10:00–21:00', '週一至週五 13:00–21:00', '週二至週日 09:00–18:00'], 'phone': 'phone',
              'note': ['提供通訊心理諮商', '需事先預約', '可通訊諮商（視訊）']}),
        item('臺北市心理機構', 'mental-health-institution', '/images/subscription/icon_health_info.svg', '臺北市政府衛生局',
             ['臺北市社區心理衛生中心士林站', '士林區健康服務中心心理諮詢', '天母身心診所', '{st}身心科診所', '士林心理衛生服務站'],
             [si('服務時間', 'open_hours'), si('電話', 'phone'), si('備註', 'note')],
             {'open_hours': ['週一至週五 08:30–17:30', '週一至週六 09:00–20:00', '週一至週五 09:00–18:00'], 'phone': 'phone',
              'note': ['提供通訊心理諮商', '安心專線 1925', '需健保卡掛號']}),
    ]),
    ('其他獨立項目', 'pi', [
        item('防空避難設備', 'air-raid-shelter', '/images/disaster/icon-general-damage.svg', '臺北市政府警察局士林分局',
             ['{lm}地下室', '{st}大樓地下停車場', '{lm}地下停車場'],
             [si('可容納人數', 'capacity'), si('樓層', 'floor'), si('備註', 'note')],
             {'capacity': lambda r: f'{r.randrange(200, 2600, 50)} 人', 'floor': ['B1', 'B2', 'B1–B2', 'B1–B3'], 'note': ['警報時開放', '出入口設有標示', '請由側門進入']}),
        item('指定吸菸區（Designated Smoking Area）', 'smoking-area', '/images/subscription/icon_air_quality.svg', '臺北市政府衛生局',
             ['{lm}吸菸區', '{st}指定吸菸區'],
             [si('開放時間', 'open_hours'), si('備註', 'note')],
             {'open_hours': ['24 小時', '06:00–23:00', '08:00–22:00'], 'note': ['請勿在區外吸菸', '設有菸蒂桶', '未滿 18 歲禁止進入']}),
    ]),
]

# 真實資料（原樣保留）
REAL = {
    '停車場': {
        'name': '停車場', 'icon': '/images/subscription/icon_parking.svg', 'agency': '台北市停車管理工程處',
        'data_type': 'json', 'request_url': '/mock/find-place/TCMSV_alldesc.json', 'data_path': '',
        'format_fields': {'id': 'id', 'name': 'name', 'area': 'area', 'address': 'address',
                          'lat': 'EntranceCoord.EntrancecoordInfo[0]?.Xcod', 'lng': 'EntranceCoord.EntrancecoordInfo[0]?.Ycod'},
        'service_infos': [si('概況', 'summary'), si('費率', 'payex')],
    },
    '公廁': {
        'name': '公廁', 'icon': '/images/icon_toilet.svg', 'agency': '',
        'data_type': 'json', 'request_url': '/mock/find-place/public_toilet_taipei.json', 'data_path': '',
        'format_fields': {'id': 'id', 'name': 'name', 'area': 'city', 'address': 'address', 'lat': 'latitude', 'lng': 'longitude'},
        'service_infos': [si('等級', 'grade')],
    },
}


def offset(rng):
    """天母體育館為圓心，150–1200 m 內的隨機點。"""
    r = rng.uniform(150, MAX_RADIUS_M)
    a = rng.uniform(0, 2 * math.pi)
    dlat = r * math.cos(a) / 111_000
    dlng = r * math.sin(a) / (111_000 * math.cos(math.radians(CENTER_LAT)))
    return round(CENTER_LAT + dlat, 6), round(CENTER_LNG + dlng, 6)


def pick(rng, pool):
    if pool == 'phone':
        return rng.choice(PHONES).format(rng.randint(1000, 9999))
    if callable(pool):
        return pool(rng)
    return rng.choice(pool)


def gen_spots(slug, spec, prefix_id):
    rng = random.Random(f'find-place:{slug}')
    n = rng.randint(4, 8)
    lms = LANDMARKS[:]
    rng.shuffle(lms)
    spots, used = [], set()
    for i in range(n):
        st, lo, hi = rng.choice(STREETS)
        lm = lms[i % len(lms)]
        for _ in range(10):
            name = rng.choice(spec['templates']).format(lm=lm, st=st, n=i + 1)
            if name not in used:
                break
            lm = rng.choice(lms)
        used.add(name)
        lat, lng = offset(rng)
        row = {
            'id': f'{prefix_id}-{i + 1:02d}', 'name': name, 'area': AREA,
            'address': f'臺北市{AREA}{st}{rng.randrange(lo, hi, 2) + 1}號', 'lat': lat, 'lng': lng,
        }
        for field, pool in spec['pools'].items():
            row[field] = pick(rng, pool)
        spots.append(row)
    return spots


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    groups, written, n_items = [], [], 0
    for gname, prefix, items in TREE:
        places = []
        for idx, spec in enumerate(items, 1):
            pid = f'{prefix}-{idx}'
            if isinstance(spec, str):
                places.append({'id': pid, **REAL[spec], 'type': gname})
                n_items += 1
                continue
            icon_path = os.path.join(PUB, spec['icon'].lstrip('/'))
            assert os.path.isfile(icon_path), f'icon missing: {spec["icon"]}'
            spots = gen_spots(spec['slug'], spec, pid)
            fn = os.path.join(OUT_DIR, f'{spec["slug"]}.json')
            with open(fn, 'w', encoding='utf-8', newline='\n') as f:
                json.dump(spots, f, ensure_ascii=False, indent=2)
                f.write('\n')
            written.append((spec['slug'], len(spots)))
            places.append({
                'id': pid, 'name': spec['name'], 'icon': spec['icon'], 'agency': spec['agency'], 'type': gname,
                'data_type': 'json', 'request_url': f'/mock/find-place/{spec["slug"]}.json', 'data_path': '',
                'format_fields': dict(FLAT_FIELDS), 'service_infos': spec['infos'],
            })
            n_items += 1
        groups.append({'name': gname, 'places': places})
    ids = [p['id'] for g in groups for p in g['places']]
    assert len(ids) == len(set(ids)), 'duplicate ids'
    out = os.path.join(MOCK, 'place_list.json')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'list': groups}, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'wrote {out}: {len(groups)} groups, {n_items} items')
    print(f'wrote {len(written)} spot files under {OUT_DIR}: ' + ', '.join(f'{s}({n})' for s, n in written))


if __name__ == '__main__':
    main()
