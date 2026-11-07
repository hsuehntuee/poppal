"""Out-of-scope (label Z) sentence generator, imported by gen_more_data.py.
Topics x templates (zh / en / vi / id / th) + hard negatives that sound civic but are not offered."""
import random

ZH_TOPICS = ['火鍋', '拉麵', '鹹酥雞', '披薩', '早餐店', '咖啡廳', '健身房', '瑜珈課', '游泳池', '籃球', '棒球賽', '電玩', '追劇', '演唱會', '電影院', '遊樂場',
             '手搖飲', '蛋糕', '麵包', '壽司', '燒肉', '宵夜', '火車便當', '露營', '海邊', '溫泉', '日本', '韓國', '美國', '歐洲', '登山', '釣魚',
             '股票', '基金', '比特幣', '房貸', '信用卡', '保險', '外幣', '黃金', '薪水', '加薪', '面試', '履歷', '離職', '考試', '作業', '論文',
             '手機', '筆電', '平板', '耳機', '相機', '電視', '冷氣', '洗衣機', '遊戲機', '網路', 'WiFi', '密碼', '臉書', 'Instagram', 'YouTube', 'LINE']
ZH_T = ['我想{t}', '幫我找{t}', '推薦一下{t}', '{t}好玩嗎', '你覺得{t}怎麼樣', '最近想去{t}', '{t}要怎麼選', '我對{t}有興趣', '{t}多少錢', '聊聊{t}', '{t}好不好', '哪一個{t}比較好', '我今天{t}', '教我{t}']
ZH_FEEL = ['我今天好累', '我心情很差', '我好開心', '我有點緊張', '我想放空', '壓力好大', '我想哭', '好無聊', '我睡不飽', '感覺好孤單', '我生氣了', '我怕考不好', '我失眠了', '今天被主管唸', '朋友不理我', '女兒不聽話', '婆婆很難相處', '同事很機車', '我的狗好可愛', '我愛吃甜的']
ZH_ASK = ['一加一等於幾', '地球有多大', '光速是多少', '太陽為什麼是圓的', '恐龍為什麼滅絕', '怎麼煮白飯', '番茄炒蛋怎麼做', '怎麼泡咖啡', '怎麼打領帶', '怎麼折紙飛機', '怎麼學英文', '怎麼減壓', '要怎麼存錢', '怎麼寫自我介紹', '這個字怎麼念', '三國演義是誰寫的', '李白是哪個朝代', '誰發明了電話', '月亮為什麼會變形', '水為什麼是濕的']
ZH_DEVICE = ['調大音量', '調小聲一點', '開藍牙', '關閉飛航模式', '打開手電筒', '設定計時器十分鐘', '幫我拍照', '截圖', '重新開機', '切換成靜音', '亮度調高', '打給我哥', '傳訊息給老婆', '放音樂', '下一首歌', '幫我錄音', '開啟勿擾模式', '換桌布', '更新系統', '清除快取']
HARD = ['我要繳電話費', '我要繳瓦斯費', '我要繳有線電視費', '我要繳健保費', '我要繳勞保', '我要繳車貸', '我要繳卡費', '我要繳管理費', '我要繳網路費', '我要繳手機費', '我要繳保費',
        '我要查機車強制險', '幫我查颱風路徑', '我要查電費帳單', '我要補辦健保卡', '我要換護照', '幫我查郵局包裹', '我要買高鐵票', '我要訂台鐵', '我要叫Uber', '我要訂民宿',
        '幫我預約牙醫', '我要預約美容院', '我要預約剪頭髮', '我要退稅到哪個銀行', '我要辦行動電源租借', '我要辦悠遊卡退費', '我要查公車路線', '我要找房子出租', '幫我查統編',
        '我要申請貸款', '我要開戶', '我要寄快遞', '幫我寄信', '我想訂便當', '幫我買樂透', '我要買票看棒球', '我想找家教', '我要找保母', '我要辦簽證',
        '我要查學測成績', '我想轉學', '我想報名補習班', '我要預約月子中心', '我要報名馬拉松', '我要查勞退', '我要申請信用卡', '我要買手機門號', '幫我查郵遞區號']
EN_T = ['how do I make {t}', 'tell me about {t}', 'what is the best {t}', 'recommend a good {t}', 'I want to learn {t}', 'can you explain {t}', 'is {t} worth it']
EN_TOP = ['sushi', 'ramen', 'yoga', 'guitar', 'python programming', 'machine learning', 'basketball', 'chess', 'bitcoin', 'index funds', 'a laptop', 'a smartphone', 'a travel plan to Europe', 'camping gear', 'a birthday cake', 'pancakes', 'cold brew coffee', 'the French revolution', 'black holes', 'photosynthesis']
EN_FREE = ['how is your day', 'do you know any good jokes', 'what is the meaning of life', 'who is the richest person', 'how tall is Mount Everest', 'write me a poem', 'tell me about dinosaurs', 'what is 12 times 12', 'what is the time in London', 'I feel sad today', 'I just got a new puppy', 'let us talk about football', 'translate hello into Spanish', 'can you sing happy birthday', 'my phone is overheating', 'turn up the volume', 'open the flashlight', 'take a screenshot', 'send a message to my wife', 'remind me to buy milk']
VI = ['Hôm nay bạn thế nào', 'Kể cho tôi một câu chuyện cười', 'Món phở này nấu thế nào', 'Tôi muốn học tiếng Anh', 'Cho tôi biết giá vàng hôm nay', 'Bật nhạc giúp tôi', 'Giờ này là mấy giờ', 'Tôi buồn quá', 'Bóng đá tối nay có trận nào', 'Đặt giúp tôi vé máy bay', 'Tôi cần mua điện thoại mới', 'Công thức làm bánh mì', 'Thời tiết ngày mai ra sao', 'Tôi muốn đi du lịch Nhật Bản', 'Hát một bài đi']
ID = ['Apa kabar hari ini', 'Ceritakan lelucon', 'Resep nasi goreng', 'Saya mau belajar bahasa Inggris', 'Berapa harga emas hari ini', 'Putar lagu pop', 'Jam berapa sekarang', 'Saya sedih', 'Jadwal sepak bola malam ini', 'Pesankan tiket pesawat', 'Saya mau beli HP baru', 'Cara membuat kue', 'Bagaimana cuaca besok', 'Saya mau liburan ke Jepang', 'Nyanyikan sebuah lagu']
TH = ['วันนี้เป็นยังไงบ้าง', 'เล่ามุขตลกหน่อย', 'สูตรผัดกะเพรา', 'อยากเรียนภาษาอังกฤษ', 'ราคาทองวันนี้เท่าไหร่', 'เปิดเพลงให้หน่อย', 'ตอนนี้กี่โมงแล้ว', 'ฉันเศร้า', 'คืนนี้มีบอลไหม', 'จองตั๋วเครื่องบินให้หน่อย', 'อยากซื้อมือถือใหม่', 'วิธีทำขนมปัง', 'พรุ่งนี้อากาศเป็นยังไง', 'อยากไปเที่ยวญี่ปุ่น', 'ร้องเพลงให้ฟังหน่อย']
LONG = ['最近工作一直很忙，晚上都睡不好，不知道有沒有什麼放鬆的方法', '我想幫我媽媽挑一個生日禮物，她喜歡花跟茶，你有沒有建議', '昨天看了一部很好看的韓劇，男主角好帥，你知道還有什麼類似的嗎',
        '我們公司下個月要辦尾牙，想找一個適合三十個人的餐廳還要有包廂', '我孩子最近不愛吃青菜，不知道要怎麼讓他願意吃', '我想換一台新的筆電，預算三萬塊左右，主要是剪影片用',
        '下週要跟女朋友去花蓮玩，想問有沒有推薦的民宿跟行程', '我這幾天一直咳嗽，也不知道是不是感冒，吃什麼比較好', '我想學習一個新的興趣，像是畫畫或是烘焙，你覺得哪個比較容易上手',
        'I have been thinking about changing my career and I am not sure what field to go into', 'My friend is coming to visit next month and I want to plan a fun itinerary for the weekend',
        'I would like to bake a cake for my sister but I have never done it before, any tips']


def none_rows(rng):
    out = []
    for t in ZH_TOPICS:
        for tpl in rng.sample(ZH_T, 3):
            out.append(tpl.format(t=t))
    out += ZH_FEEL + ZH_ASK + ZH_DEVICE + HARD + VI + ID + TH + LONG + EN_FREE
    for t in EN_TOP:
        out.append(rng.choice(EN_T).format(t=t))
    for s in rng.sample(ZH_FEEL + ZH_ASK + ZH_DEVICE, 40):
        out.append(rng.choice(['欸', '那個', '喂', '對了', '嗯']) + s + rng.choice(['', '啦', '喔', '啊']))
    for s in rng.sample(ZH_ASK + HARD, 25):
        out.append(s.replace('我要', '偶要').replace('怎麼', '怎嚒'))
    return out
