"""
Round-2 training-data expansion (hand-written cores x prefixes/suffixes/situations x ASR noise).
Output: tools/tinycls/data/services.generated.jsonl  (read by train_cls.py, finetune_gemma.py, tinycls/train.py)

Method: function first (what the tool does / its parameters), then scenario (elder, student, foreigner,
hurried commuter), then phrasing (colloquial TW Mandarin, keywords, long, ASR errors, mixed zh/en,
English, vi/id/th). NEVER copies from assistant/public/data/testset_1k.json: any generated sentence whose
normalised text equals a test sentence is dropped (the builder prints the count).

  python tools/tinycls/gen_more_data.py
"""
import json, os, random, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_more_none import none_rows

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'data', 'services.generated.jsonl')
random.seed(7)

# ---- cores: zh phrases (object/request, no prefix), en, and foreign (vi/id/th full short sentences)
C = {}
C['A'] = dict(
 zh=['水費', '自來水費', '水費單', '水費帳單', '自來水的錢', '水錢', '這期的水費', '水費繳款', '水費通知單', '水費單上的水號', '自來水公司的帳單', '台北自來水事業處的費用'],
 act=['要繳', '怎麼繳', '還沒付', '想用手機付', '可以線上付嗎', '付一下', '要去哪裡繳', '忘記繳了'],
 en=['pay the water bill', 'my water bill is due', 'how to pay tap water fee on the app', 'water utility payment', 'settle my water charges', 'I need to pay for water'],
 vi=['Tôi muốn thanh toán tiền nước', 'Làm sao để đóng hóa đơn nước qua điện thoại'], id=['Saya ingin bayar tagihan air', 'Cara bayar air PAM lewat aplikasi'], th=['ฉันต้องการชำระค่าน้ำประปา', 'จ่ายบิลค่าน้ำผ่านมือถือได้ไหม'])
C['B'] = dict(
 zh=['水表', '水表的度數', '用水度數', '這期用了幾度水', '自己抄表', '抄水表', '水表數字', '本期度數', '用水量'],
 act=['要怎麼報', '想回報', '怎麼輸入', '在哪裡看', '想查一下', '要上傳', '怎麼填'],
 en=['report my water meter reading', 'submit the number on my water meter', 'how many units of water did I use', 'meter reading for water', 'enter my own water usage'],
 vi=['Tôi muốn nhập chỉ số đồng hồ nước', 'Xem lượng nước tôi đã dùng tháng này'], id=['Saya mau input angka meteran air', 'Lihat pemakaian air bulan ini'], th=['อยากกรอกเลขมิเตอร์น้ำด้วยตัวเอง', 'ดูปริมาณการใช้น้ำเดือนนี้'])
C['C'] = dict(
 zh=['停車費', '路邊停車費', '停車單', '機車停車的錢', '汽車停車費', '停車格的費用', '用車牌查停車費', '停車繳費單', '違規停車的費用單'],
 act=['要繳', '怎麼付', '有沒有欠', '想查一下', '還沒繳', '要線上繳', '忘了繳'],
 en=['pay my parking fee', 'unpaid street parking', 'parking charge for my car', 'look up parking fees by plate number', 'pay the roadside parking bill'],
 vi=['Tôi muốn đóng phí đỗ xe', 'Kiểm tra phí đỗ xe theo biển số'], id=['Saya mau bayar parkir di jalan', 'Cek biaya parkir dengan plat nomor'], th=['ต้องการจ่ายค่าจอดรถ', 'เช็คค่าจอดรถจากทะเบียนรถ'])
C['D'] = dict(
 zh=['房屋稅', '地價稅', '牌照稅', '地方稅', '稅單', '汽車的稅', '機車牌照稅', '稅款繳款書', '土地稅', '燃料稅', '使用牌照稅'],
 act=['要繳', '怎麼繳', '可以手機付嗎', '收到繳款書了', '要去哪裡付', '快到期了', '可以掃條碼嗎'],
 en=['pay my property tax', 'vehicle tax payment', 'local tax bill', 'land tax due this month', 'house tax online'],
 vi=['Tôi muốn nộp thuế nhà đất', 'Thanh toán thuế xe qua điện thoại'], id=['Saya mau bayar pajak rumah', 'Bayar pajak kendaraan bermotor'], th=['ต้องการจ่ายภาษีบ้านและที่ดิน', 'ชำระภาษีรถยนต์ผ่านแอป'])
C['E'] = dict(
 zh=['學費', '學雜費', '註冊費', '學校的費用', '孩子的學費', '大學學費', '高中的雜費', '註冊繳費單', '學校繳費單', '學期的費用'],
 act=['要繳', '怎麼付', '可以線上付嗎', '用繳費編號付', '還沒繳', '開學要付'],
 en=['pay tuition fees', 'school registration fee payment', 'university fees due', 'how to pay my kids school bill', 'tuition payment online'],
 vi=['Tôi muốn đóng học phí', 'Thanh toán phí nhập học cho con'], id=['Saya mau bayar SPP anak', 'Bayar biaya pendaftaran sekolah'], th=['อยากจ่ายค่าเล่าเรียน', 'ชำระค่าลงทะเบียนของลูก'])
C['F'] = dict(
 zh=['醫療費', '醫藥費', '醫院的帳單', '看病的錢', '住院費用', '門診費用', '聯合醫院的費用', '聯醫的帳單', '出院的費用', '醫院欠款'],
 act=['要繳', '還沒付', '想線上付', '怎麼繳', '補繳', '用身分證查'],
 en=['pay the medical bill', 'hospital charges I still owe', 'settle my clinic fees', 'outstanding bill at the city hospital', 'pay for my hospital stay'],
 vi=['Tôi muốn thanh toán viện phí', 'Trả tiền khám bệnh còn nợ'], id=['Saya mau bayar biaya berobat', 'Tagihan rumah sakit belum dibayar'], th=['อยากชำระค่ารักษาพยาบาล', 'ค่าโรงพยาบาลที่ยังค้างอยู่'])
C['G'] = dict(
 zh=['罰款', '罰鍰', '規費', '租金', '登記費', '社宅租金', '國宅的費用', '政府的費用', '行政罰款', '手續費', '各種費用', '不知道是哪種的費用'],
 act=['要繳', '怎麼繳', '要去哪裡付', '想線上付', '收到繳款單了', '還沒付'],
 en=['pay a government penalty', 'pay the registration fee', 'rent for public housing payment', 'miscellaneous city fees', 'I have a bill but I do not know what type'],
 vi=['Tôi cần nộp tiền phạt', 'Đóng lệ phí đăng ký và các khoản khác'], id=['Saya mau bayar denda pemerintah', 'Bayar sewa rumah susun kota'], th=['อยากจ่ายค่าปรับ', 'ชำระค่าเช่าที่อยู่อาศัยของรัฐ'])
C['H'] = dict(
 zh=['繳費紀錄', '以前繳過的費用', '繳過的錢', '帳務紀錄', '繳費證明', '收據', '歷史帳單', '付款紀錄', '之前付的帳單', '繳費成功的證明'],
 act=['想看', '在哪裡查', '幫我查', '有沒有成功', '想列印', '給我看', '去年的'],
 en=['view my past payments', 'payment records', 'did I already pay this', 'show previous bills I paid', 'get a receipt for a payment'],
 vi=['Xem lại các khoản tôi đã thanh toán', 'Biên lai thanh toán của tôi'], id=['Lihat pembayaran yang sudah saya lakukan', 'Bukti pembayaran saya'], th=['ดูรายการที่ชำระไปแล้ว', 'ใบเสร็จการชำระเงินของฉัน'])
C['I'] = dict(
 zh=['戶政事務所的叫號', '地政事務所的號碼', '櫃檯叫到幾號', '現場排隊人數', '戶政現在要等多久', '區公所的號碼牌', '辦事處人多不多', '還要等幾個人', '機關櫃檯的叫號'],
 act=['查一下', '看一下', '現在', '想知道', '幫我看', '先看看'],
 en=['current number being served at the office', 'queue status at the household registration office', 'how many people are ahead of me at the land office', 'wait time at the district office', 'get a queue ticket for the city office'],
 vi=['Văn phòng đăng ký hộ khẩu đang gọi số mấy', 'Có bao nhiêu người đang chờ ở quầy'], id=['Nomor antrean di kantor sekarang sampai berapa', 'Berapa orang yang menunggu di loket'], th=['สำนักงานเขตเรียกคิวถึงเบอร์ไหนแล้ว', 'มีคนรอคิวอีกกี่คน'])
C['J'] = dict(
 zh=['陳情', '投訴', '檢舉', '反映問題', '向市政府反映', '我要抗議', '噪音問題', '路燈壞了', '路面有坑洞', '亂丟垃圾', '違規停車', '騎樓被占用', '公車服務不好', '野狗太多', '空汙問題', '攤販佔道', '工地很吵', '違建'],
 act=['要怎麼辦', '想申訴', '要通報', '一直沒人處理', '想請市府處理', '要去哪裡講', '幫我送出'],
 en=['file a complaint with the city', 'there is a broken streetlight', 'report noise from my neighbor', 'illegal dumping in my street', 'I want to report a pothole', 'complain about a bus driver'],
 vi=['Tôi muốn phản ánh với chính quyền về tiếng ồn', 'Đèn đường bị hỏng, tôi muốn báo'], id=['Saya ingin mengadu soal lampu jalan rusak', 'Lapor sampah menumpuk di jalan'], th=['ต้องการร้องเรียนเรื่องหลุมบนถนน', 'ไฟถนนเสีย อยากแจ้งเจ้าหน้าที่'])
C['K'] = dict(
 zh=['陳情案件', '投訴的案子', '檢舉的結果', '案件編號', '之前反映的事', '我送出的陳情', '申訴的進度', '那個案子'],
 act=['處理得怎麼樣了', '查進度', '有回覆了嗎', '到哪個階段', '結案了沒', '現在的狀態'],
 en=['what is the progress of my complaint', 'check my case number', 'status of the report I filed', 'was my complaint resolved', 'follow up on a previous submission'],
 vi=['Kiểm tra tiến độ xử lý phản ánh của tôi', 'Vụ việc tôi gửi đã được giải quyết chưa'], id=['Cek perkembangan pengaduan saya', 'Apakah laporan saya sudah ditangani'], th=['ตรวจสอบความคืบหน้าเรื่องร้องเรียน', 'เรื่องที่ส่งไปดำเนินการถึงไหนแล้ว'])
C['L'] = dict(
 zh=['淹水', '路樹倒了', '土石流', '火災', '電線斷了', '招牌掉下來', '地震後的損壞', '坍方', '道路塌陷', '積水', '瓦斯外洩', '山崩', '橋斷了', '路面積水很深'],
 act=['要通報', '怎麼報', '很危險', '趕快處理', '要通知誰', '需要救援'],
 en=['report a flood', 'a tree has fallen on the road', 'there is a fire nearby', 'power line is down', 'sinkhole in the street', 'report storm damage'],
 vi=['Tôi muốn báo cáo cây đổ chắn đường', 'Có hỏa hoạn gần nhà tôi'], id=['Saya mau lapor pohon tumbang di jalan', 'Ada kebakaran dekat rumah saya'], th=['ต้องการแจ้งต้นไม้ล้มขวางถนน', 'มีไฟไหม้ใกล้บ้าน'])
C['M'] = dict(
 zh=['被偷', '被搶', '被詐騙', '遺失物品', '車禍', '失竊', '錢包不見', '詐騙電話', '被騙錢', '東西被扒', '身分證遺失', '報案', '報警', '網路購物被騙', '機車被偷'],
 act=['要報案', '要報警', '怎麼處理', '想線上報案', '查報案紀錄', '怎麼辦'],
 en=['I was robbed and need to report', 'report a scam to the police', 'my wallet was stolen', 'lost my id card and want to file a report', 'traffic accident, call the police', 'check the status of my police report'],
 vi=['Tôi bị lừa đảo và muốn trình báo', 'Tôi bị mất điện thoại, muốn báo công an'], id=['Saya jadi korban penipuan dan mau lapor', 'Ponsel saya hilang, mau lapor polisi'], th=['ถูกหลอกลวงอยากแจ้งตำรวจ', 'โทรศัพท์หาย ต้องการแจ้งความ'])
C['N'] = dict(
 zh=['借書', '還書', '續借', '圖書館', '市立圖書館的書', '借閱紀錄', '找書', '預約書', '圖書證', '逾期的書', '繪本', '小說'],
 act=['想借', '怎麼續借', '什麼時候到期', '有沒有', '想查', '怎麼預約'],
 en=['borrow a book from the library', 'library loan records', 'extend my book loan', 'is this book available at the library', 'return date for my library books'],
 vi=['Tôi muốn mượn sách', 'Gia hạn sách thư viện'], id=['Saya mau pinjam buku', 'Perpanjang peminjaman buku perpustakaan'], th=['ต้องการยืมหนังสือ', 'ต่ออายุหนังสือห้องสมุด'])
C['O'] = dict(
 zh=['廁所', '公廁', 'YouBike', '停車場', '飲水機', '垃圾車', 'AED', '捐血站', '充電站', '郵筒', '舊衣回收', '派出所', '哺乳室', '無障礙廁所', '吸菸區', '計程車站', '避難所', '直飲台', '電動車充電', '機車停車位', '清潔箱', '區公所'],
 act=['在哪裡', '附近有嗎', '最近的', '怎麼去', '找一下', '哪裡有'],
 en=['find the nearest toilet', 'where is a bike sharing station', 'parking lot nearby', 'where to donate blood', 'look for a charging spot around me', 'is there a water fountain nearby'],
 vi=['Tìm nhà vệ sinh gần đây', 'Trạm YouBike gần nhất ở đâu'], id=['Cari toilet umum terdekat', 'Di mana stasiun YouBike terdekat'], th=['หาห้องน้ำสาธารณะใกล้ ๆ', 'จุดจอดจักรยาน YouBike ใกล้สุดอยู่ที่ไหน'])
C['P'] = dict(
 zh=['補助', '津貼', '證明文件', '申請', '市府的福利', '急難救助', '低收入戶補助', '敬老金', '托育補助', '身心障礙補助', '申訴', '戶籍謄本', '獎學金', '租屋補助'],
 act=['怎麼申請', '要準備什麼', '可以線上辦嗎', '有資格嗎', '想辦', '在哪裡辦'],
 en=['apply for a welfare subsidy', 'how to get a household certificate online', 'application for city benefits', 'file an appeal with the city', 'request an official document'],
 vi=['Tôi muốn nộp đơn xin trợ cấp', 'Xin giấy chứng nhận trực tuyến'], id=['Saya mau ajukan subsidi dari pemerintah kota', 'Minta surat keterangan secara online'], th=['ต้องการยื่นขอสวัสดิการ', 'ขอเอกสารรับรองออนไลน์'])
C['Q'] = dict(
 zh=['優惠', '折價券', '門票', '票券', '優惠券', '展覽的票', '遊樂園的票', '特價票', '活動票', '套票', '電影票優惠', '博物館的票'],
 act=['想買', '哪裡領', '有沒有', '怎麼買', '最近有什麼', '想看看'],
 en=['are there any special offers', 'buy admission tickets', 'discount vouchers available', 'get tickets for the exhibition', 'city coupons'],
 vi=['Có ưu đãi hay phiếu giảm giá không', 'Tôi muốn mua vé tham quan'], id=['Ada promo atau kupon diskon', 'Saya mau beli tiket masuk'], th=['มีโปรโมชั่นหรือคูปองไหม', 'อยากซื้อบัตรเข้าชม'])
C['R'] = dict(
 zh=['票夾', '我的票', '買好的票', '票券', '電子票', '已購買的票', '收到的票', '門票的QR code', '兌換碼'],
 act=['在哪裡看', '怎麼兌換', '要出示', '打開', '怎麼用', '找不到'],
 en=['show my purchased tickets', 'my e-ticket', 'where is the ticket I bought', 'redeem a ticket code', 'open the wallet with my tickets'],
 vi=['Mở ví vé của tôi', 'Vé điện tử tôi đã mua ở đâu'], id=['Buka dompet tiket saya', 'Tiket elektronik yang sudah dibeli ada di mana'], th=['เปิดกระเป๋าตั๋วของฉัน', 'ตั๋วที่ซื้อไว้อยู่ไหน'])
C['S'] = dict(
 zh=['通知', '推播', '訂閱', '提醒', '空氣品質的提醒', '停車提醒', '社區公告', '交通資訊的通知', '健康資訊', '公聽會通知', '活動通知', '水費提醒'],
 act=['想訂閱', '要取消', '怎麼關掉', '怎麼開啟', '設定一下', '不要再收到', '傳給我'],
 en=['sign up for alerts', 'turn off push alerts', 'notify me about air quality', 'manage my subscriptions', 'stop the notifications'],
 vi=['Tôi muốn đăng ký nhận thông báo', 'Hủy nhận thông báo'], id=['Saya ingin berlangganan pemberitahuan', 'Matikan notifikasi'], th=['อยากสมัครรับการแจ้งเตือน', 'ยกเลิกการแจ้งเตือน'])
C['T'] = dict(
 zh=['1999', '市民熱線', '客服', '真人', '服務專線', '市政府電話', '人工客服', '市府總機', '電話諮詢'],
 act=['幫我撥', '打給', '我要找', '轉接', '電話是多少', '要聊聊', '想直接問'],
 en=['dial the city helpline', 'speak to a human operator', 'phone number for city services', 'call customer support', 'transfer me to a person'],
 vi=['Gọi cho đường dây nóng 1999', 'Tôi muốn gặp nhân viên thật'], id=['Hubungi nomor layanan 1999', 'Saya mau bicara dengan petugas'], th=['โทรสายด่วน 1999', 'ขอคุยกับเจ้าหน้าที่ตัวจริง'])
C['U'] = dict(
 zh=['疫苗', '流感疫苗', '新冠疫苗', '打針', '預防針', '肺炎疫苗', '兒童疫苗', '帶寶寶打預防針', 'HPV疫苗', '追加劑'],
 act=['要預約', '哪裡可以打', '約時間', '還有名額嗎', '想打', '幫我約'],
 en=['book a vaccination', 'flu jab appointment', 'covid booster shot', 'vaccine for my baby', 'where to get vaccinated'],
 vi=['Đặt lịch tiêm chủng', 'Tôi muốn tiêm vắc-xin cho con'], id=['Buat janji untuk vaksinasi', 'Vaksin untuk anak saya di mana'], th=['จองคิวฉีดวัคซีน', 'อยากฉีดวัคซีนให้ลูก'])
C['V'] = dict(
 zh=['掛號', '看醫生', '門診', '預約看診', '小兒科', '內科', '骨科', '看診時間', '聯合醫院的門診', '複診', '回診', '醫師的號'],
 act=['要掛', '怎麼預約', '想約', '想看', '還有號嗎', '幫我掛'],
 en=['register for a clinic visit', 'see a doctor at the municipal hospital', 'outpatient registration', 'book an appointment with a specialist', 'follow-up visit booking'],
 vi=['Tôi muốn đăng ký khám bệnh', 'Đặt lịch gặp bác sĩ'], id=['Saya mau daftar poliklinik', 'Buat janji dengan dokter'], th=['อยากลงทะเบียนพบหมอ', 'จองคิวตรวจที่โรงพยาบาล'])
C['W'] = dict(
 zh=['儀表板', '即時數據', '城市數據', '統計', '空氣品質', '交通狀況', '人口資料', '市政資訊', '即時路況', '數據看板', '指標圖表'],
 act=['想看', '在哪裡', '打開', '怎麼看', '給我看', '現在的'],
 en=['city statistics', 'live traffic and air data', 'open the data dashboard', 'show current air quality numbers', 'population figures for Taipei'],
 vi=['Xem số liệu thành phố theo thời gian thực', 'Mở bảng điều khiển dữ liệu'], id=['Lihat data real-time kota', 'Buka dasbor statistik'], th=['ดูข้อมูลเมืองแบบเรียลไทม์', 'เปิดแดชบอร์ดสถิติ'])
C['X'] = dict(
 zh=['怎麼用', '使用方法', '教學', '說明', '常見問題', '功能介紹', '操作步驟', '新手教學', '怎麼綁定', '怎麼登入', '客服說明'],
 act=['這個app', '這個功能', '我不會', '教我', '有沒有', '在哪裡看'],
 en=['help me use this app', 'tutorial for beginners', 'frequently asked questions', 'how does this feature work', 'instructions please'],
 vi=['Hướng dẫn sử dụng ứng dụng này', 'Tôi không biết dùng chức năng này'], id=['Panduan cara pakai aplikasi ini', 'Saya tidak mengerti fitur ini'], th=['ขอวิธีใช้แอปนี้', 'ไม่เข้าใจฟังก์ชันนี้'])
C['Y'] = dict(
 zh=['親子館', '親子活動', '親子課程', '寶寶的課', '親子館場次', '小孩的遊戲課', '親子律動', '親子共讀', '親子手作'],
 act=['要預約', '想報名', '有什麼', '怎麼訂', '還有名額嗎', '想帶小孩去'],
 en=['book the parent-child center', 'sign up for a toddler class', 'activities for babies at the family center', 'reserve a play session for my kid', 'family center schedule'],
 vi=['Đặt chỗ ở trung tâm gia đình', 'Đăng ký lớp cho bé'], id=['Pesan sesi di pusat keluarga', 'Daftarkan anak saya ke kelas'], th=['จองกิจกรรมศูนย์ครอบครัว', 'สมัครคลาสสำหรับเด็ก'])
C['a'] = dict(
 zh=['字體放大', '字好小', '字看不清', '大字', '長輩版', '老人模式', '視力不好', '眼睛花', '放大畫面', '大一點的字'],
 act=['幫我', '想要', '可以嗎', '我需要', '開啟', '拜託'],
 en=['enlarge the font', 'bigger letters please', 'senior mode', 'my eyesight is poor, zoom in', 'increase text size'],
 vi=['Phóng to chữ cho dễ đọc', 'Bật chế độ người lớn tuổi'], id=['Perbesar ukuran huruf', 'Aktifkan mode lansia'], th=['ขยายตัวอักษรให้ใหญ่ขึ้น', 'เปิดโหมดผู้สูงอายุ'])
C['b'] = dict(
 zh=['一般模式', '字縮小', '回到普通', '不要放大', '字太大', '關掉長輩模式', '不用念', '恢復原本大小', '標準模式', '安靜模式'],
 act=['換回', '幫我', '請', '我想', '切換', '取消'],
 en=['regular mode', 'shrink the text back', 'turn off large print', 'standard size please', 'no need to read out loud'],
 vi=['Quay lại chế độ thông thường', 'Thu nhỏ chữ lại'], id=['Kembali ke mode biasa', 'Perkecil ukuran huruf'], th=['กลับสู่โหมดปกติ', 'ย่อตัวอักษรลง'])
C['c'] = dict(
 zh=['念出來', '唸給我聽', '讀出來', '朗讀', '語音播報', '用講的', '讀給我聽', '聽內容', '大聲念', '唸這一頁'],
 act=['幫我', '請', '可以', '我想', '拜託', '把畫面'],
 en=['read it aloud', 'speak the content', 'text to speech please', 'narrate this screen', 'I want to listen to it'],
 vi=['Đọc to nội dung cho tôi', 'Tôi muốn nghe thay vì đọc'], id=['Bacakan isinya dengan suara', 'Saya mau mendengarkan saja'], th=['อ่านออกเสียงให้ฟัง', 'ฉันอยากฟังแทนการอ่าน'])
C['d'] = dict(
 zh=['掃描', '掃條碼', '掃QR', '相機掃描', '掃帳單', '掃繳費單', '拍照繳費', '用鏡頭掃', '掃描條碼', '三段條碼'],
 act=['幫我', '開啟', '我要', '想用', '可以', '打開相機'],
 en=['scan the barcode', 'use the camera to pay', 'scan a payment slip', 'QR code scanner', 'point the camera at my bill'],
 vi=['Quét mã vạch hóa đơn', 'Dùng camera để thanh toán'], id=['Scan barcode tagihan', 'Pakai kamera untuk membayar'], th=['สแกนบาร์โค้ดบิล', 'ใช้กล้องเพื่อชำระเงิน'])
C['e'] = dict(
 zh=['首頁', '全部服務', '所有功能', '服務清單', '主選單', '主畫面', '功能列表', '其他服務', '回到最前面', '總覽'],
 act=['回去', '帶我去', '我要看', '打開', '顯示', '讓我自己選'],
 en=['home screen', 'list of everything', 'main menu', 'browse all features', 'go back to the start'],
 vi=['Về trang chủ', 'Hiển thị danh sách tất cả dịch vụ'], id=['Kembali ke beranda', 'Tampilkan daftar semua layanan'], th=['กลับหน้าหลัก', 'แสดงรายการบริการทั้งหมด'])
C['f'] = dict(
 zh=['投票', '網路投票', '市民投票', '公共議題投票', '票選活動', '表決', '公民參與', '燈節票選', '議題投票', '參與投票'],
 act=['我想', '在哪裡', '有哪些', '怎麼參加', '要投', '現在可以'],
 en=['cast a vote', 'online voting for citizens', 'public poll on city issues', 'participate in the referendum', 'vote on a proposal'],
 vi=['Tôi muốn bỏ phiếu', 'Có cuộc bỏ phiếu nào đang diễn ra không'], id=['Saya mau memberikan suara', 'Ada pemungutan suara apa sekarang'], th=['อยากลงคะแนนเสียง', 'ตอนนี้มีโหวตอะไรบ้าง'])
C['g'] = dict(
 zh=['問卷', '意見調查', '滿意度調查', '填寫問卷', '民意調查', '回饋意見', '調查表', '市民意見', '施政滿意度'],
 act=['我想填', '在哪裡', '有哪些', '怎麼填', '要回答', '現在有'],
 en=['take a survey', 'give my opinion in a questionnaire', 'city feedback form', 'fill in the satisfaction poll', 'public opinion survey'],
 vi=['Tôi muốn trả lời khảo sát', 'Có bảng khảo sát nào không'], id=['Saya mau isi survei', 'Ada kuesioner apa sekarang'], th=['อยากตอบแบบสอบถาม', 'มีแบบสำรวจอะไรบ้าง'])
C['h'] = dict(
 zh=['里長', '里辦公處', '里辦', '鄰里', '里民大會', '里的公告', '里長的電話', '里長伯', '社區辦公室', '里幹事'],
 act=['在哪裡', '電話幾號', '我想找', '怎麼聯絡', '有什麼活動', '是誰'],
 en=['my village chief', 'neighborhood office address', 'contact the ward leader', 'local community notices', 'who is the borough warden'],
 vi=['Liên lạc với trưởng khu phố', 'Văn phòng phường ở đâu'], id=['Hubungi kepala lingkungan saya', 'Di mana kantor kelurahan'], th=['ติดต่อผู้ใหญ่บ้านของฉัน', 'สำนักงานชุมชนอยู่ที่ไหน'])
C['i'] = dict(
 zh=['廣播', '電台', '收音機', '節目表', '聽廣播', '臺北廣播電台', '電台節目', '聽節目', '重播', '主持人'],
 act=['我想聽', '現在播什麼', '打開', '幾點播', '怎麼收聽', '幫我開'],
 en=['listen to the radio', 'radio station schedule', 'turn on Taipei broadcasting', 'what program is airing', 'live radio stream'],
 vi=['Mở đài phát thanh', 'Lịch chương trình radio'], id=['Putar radio kota', 'Jadwal acara radio'], th=['เปิดวิทยุ', 'ตารางรายการวิทยุ'])
C['j'] = dict(
 zh=['公園', '綠地', '步道', '河濱', '散步的地方', '運動公園', '登山步道', '親山步道', '森林公園', '賞花的地方', '慢跑的地方', '野餐的草地'],
 act=['附近有', '在哪裡', '推薦', '想去', '有沒有', '怎麼走'],
 en=['a park for a walk', 'riverside trail', 'green space nearby', 'hiking path near here', 'places to jog outdoors'],
 vi=['Công viên để đi dạo', 'Đường mòn đi bộ gần đây'], id=['Taman untuk jalan santai', 'Jalur hiking terdekat'], th=['สวนสาธารณะสำหรับเดินเล่น', 'เส้นทางเดินป่าใกล้ ๆ'])
C['k'] = dict(
 zh=['遛狗', '寵物', '動物醫院', '獸醫', '狗公園', '寵物餐廳', '寵物登記', '貓咪', '帶狗狗出門', '寵物友善', '晶片植入', '寵物住宿'],
 act=['去哪裡', '附近有', '推薦', '怎麼登記', '有沒有', '想帶'],
 en=['walk my dog somewhere', 'vet clinic nearby', 'restaurants that allow pets', 'register my pet', 'dog run areas'],
 vi=['Chỗ dắt chó đi dạo', 'Phòng khám thú y gần đây'], id=['Tempat jalan-jalan dengan anjing', 'Klinik hewan terdekat'], th=['ที่พาสุนัขไปเดินเล่น', 'โรงพยาบาลสัตว์ใกล้ ๆ'])
C['l'] = dict(
 zh=['菜價', '蔬菜的價格', '水果價錢', '雞蛋的價錢', '豬肉', '米價', '市場行情', '物價', '魚的價格', '高麗菜', '漲價', '批發價'],
 act=['今天多少', '漲了嗎', '貴不貴', '想查', '現在', '查一下'],
 en=['market prices today', 'cost of vegetables', 'did egg prices go up', 'fruit price check', 'groceries price trend'],
 vi=['Giá rau củ hôm nay', 'Giá trứng có tăng không'], id=['Harga sayur hari ini', 'Apakah harga telur naik'], th=['ราคาผักวันนี้', 'ราคาไข่ขึ้นไหม'])
C['m'] = dict(
 zh=['動物園', '貓熊', '企鵝', '無尾熊', '園區地圖', '動物介紹', '餵食秀', '動物園的活動', '大象', '長頸鹿', '兒童動物區', '鳥園'],
 act=['在哪裡', '怎麼逛', '今天有什麼', '想看', '地圖', '幾點'],
 en=['zoo guide', 'where are the koalas', 'animal show times', 'map of the zoo park', 'feeding time at the zoo'],
 vi=['Hướng dẫn tham quan sở thú', 'Chim cánh cụt ở đâu'], id=['Panduan kebun binatang', 'Di mana pandanya'], th=['แผนที่สวนสัตว์', 'หมีแพนด้าอยู่ตรงไหน'])


# contrastive extras for pairs the first retrain confused (K/J, W/S, H/G/D, V/F, j/O, a/b)
EXTRA = {
 'K': ['我的申訴有結果嗎', '陳情送出後多久會回覆', '追蹤我送出的案子', '檢舉之後有沒有人處理', '之前寄的反映現在進度', '看我的案件狀態', '陳情案件處理情形', '我想知道案子結了沒', '輸入案號看進度', '投訴後面都沒下文', 'case progress lookup', 'did the city answer my complaint'],
 'J': ['我要向市政府投訴', '新增一筆陳情', '我要提出新的檢舉', '想送出一個反映', '我要申訴鄰居', 'file a new complaint'],
 'W': ['PM2.5現在多少', '河川水位即時資料', '看交通儀表板', '雨量統計', '全市的即時數字', '台北市人口有多少', '現在捷運人流', 'city data panel', 'live numbers of the city'],
 'S': ['開啟空氣品質推播', '通知訂閱管理', '取消所有推播', '我要收停車提醒', '訂閱社區公告', 'subscribe to alerts about parking'],
 'H': ['我繳過水費嗎', '歷史繳費明細', '看已繳清的帳單', '繳費成功畫面在哪', '去年繳了多少稅', '之前付的停車費記錄', '我的付款明細', '有沒有繳成功', 'my previous payments list'],
 'G': ['罰單怎麼繳', '交通罰鍰繳費', '違規罰款要付', '社宅房租繳納', '行政規費繳款', 'where to pay my traffic fine'],
 'V': ['預約門診看醫生', '掛骨科的號', '網路掛號看診', '想掛下週的門診', '聯合醫院掛號系統', 'make a hospital appointment online'],
 'F': ['醫院的欠費', '住院費要補繳', '看診完的費用要付', 'unpaid medical balance'],
 'j': ['附近的公園', '步道推薦', '有綠地的地方', '想去公園運動', '河濱散步', 'where is a green park'],
 'O': ['最近的公廁', '找YouBike站', '哪裡有停車場', '垃圾車時間地點', '附近的AED', '飲水機位置'],
 'a': ['字放大', '長輩版', '字大一點', '看不清楚字', '請把字變大', '切到長輩模式'],
 'b': ['字太大了', '縮小字體', '取消放大', '一般大小就好', '不用念出來', '關掉朗讀', '切回普通模式', 'smaller font please'],
 'T': ['我要找真人客服', '打電話給市政府', '轉接1999專線', '想跟人說話', 'talk to a person'],
 'e': ['回到服務清單', '看全部功能', '我想看有哪些服務', '首頁在哪', 'show the full service list'],
 'X': ['這個app怎麼操作', '使用教學在哪', '常見問題解答', '我不會用', 'how does this work'],
 'c': ['把內容念給我', '用聲音唸', '讀出螢幕上的字', '朗讀這頁', 'read the page for me'],
 'l': ['今天蔬菜價格', '雞蛋行情', '豬肉價格', '水果行情', '米多少錢一公斤', 'price of eggs today'],
}

ZH_PRE = ['', '', '', '我想', '我要', '請幫我', '幫我', '欸', '那個', '可以幫我', '麻煩', '嗯', '請問', '我想問一下', '拜託你', '老闆', '喂', '我想知道']
ZH_SUF = ['', '', '', '', '啦', '喔', '啊', '嗎', '謝謝', '一下', '拜託', '，快一點', '，我不太會', '，謝謝你']
SITU = ['我阿嬤問我', '剛剛朋友跟我說', '因為最近太忙', '我是第一次用', '早上出門前', '在捷運上', '我爸媽不太會用手機', '昨天晚上', '我老公說', '等一下要出門', '上禮拜就想了', '我現在在家', '請問', '我今天剛好有空', '老師叫我們', '我人在國外']
EN_PRE = ['', 'please ', 'hey, ', 'hi, ']
HOMO = {'繳': '缴', '費': '廢', '稅': '睡', '報': '抱', '掛': '褂', '查': '茶', '票': '飄', '圖書館': '圖書管', '疫苗': '意苗', '陳情': '陳青', '申請': '申清', '補助': '補住', '度數': '渡數', '叫號': '叫好', '朗讀': '狼讀', '放大': '方大', '公園': '公圓', '步道': '步到', '電台': '電太', '廣播': '光播', '淹水': '煙水', '詐騙': '炸騙', '報案': '抱岸', '停車': '亭車', '里長': '李長', '問卷': '問捲', '投票': '頭票', '訂閱': '定閱', '優惠': '有惠', '折價券': '折價卷', '掃描': '騷描', '掃': '嫂', '首頁': '手頁', '客服': '可服'}
NUMW = {'1999': '一九九九', '10': '十'}


def asr(s):
    keys = [k for k in HOMO if k in s]
    if keys and random.random() < 0.7:
        k = random.choice(keys)
        s = s.replace(k, HOMO[k], 1)
    return s


def zh_sent(c):
    core = random.choice(c['zh'])
    act = random.choice(c['act'])
    form = random.choice([0, 0, 1, 2, 3, 4])
    if form == 0:
        s = random.choice(ZH_PRE) + core + act
    elif form == 1:
        s = random.choice(ZH_PRE) + act + core
    elif form == 2:
        s = core
    elif form == 3:
        s = random.choice(SITU) + '，' + random.choice(ZH_PRE) + core + act
    else:
        s = core + act
    s += random.choice(ZH_SUF)
    if random.random() < 0.18:
        s = asr(s)
    if random.random() < 0.08:
        s = s.replace('1999', '一九九九')
    return s.strip('，')


def mixed_sent(c):
    """zh + English token code-switch"""
    zh = random.choice(c['zh']); en = random.choice(c['en']).split()
    w = random.choice(en)
    return random.choice(['我要', '幫我', '那個', '']) + random.choice([f'{w} {zh}', f'{zh} {w}', f'{zh}的 {w}']) + random.choice(['', '怎麼弄', '在哪', '啦'])


NONE_SEEDS = '''今天天氣很好
下雨了怎麼辦
我好餓
我想睡覺
你會做什麼
幫我寫一首詩
你有男朋友嗎
推薦一部電影
附近有好吃的牛肉麵嗎
我要訂餐廳
幫我點一杯奶茶
最近有什麼新聞
今天股市怎麼樣
我想買衣服
你覺得我適合什麼髮型
我要去旅行
幫我設定鬧鐘
現在幾點
我的手機好慢
怎麼減肥
我想學游泳
考試好難
我被老闆罵了
怎麼煮咖哩
這道數學題怎麼算
翻譯成日文
我要看電影
唱一首歌
講一個故事
你幾歲
你住在哪裡
我愛你
無聊死了
好冷喔
好熱喔
週末要幹嘛
明天放假嗎
哪個球隊會贏
我要買彩券
幫我查機票
訂高鐵票
訂飯店
租車
外送
打車
點歌
打遊戲
聊天
哈哈哈
嗯嗯
喔喔
欸
謝謝
不用了
沒事
再見
晚安
午安
how are you
what is your name
good morning
good night
thank you
tell me a story
who is the president
what is the weather
play some jazz
order a pizza
call a taxi
book a hotel room
how to lose weight
what time is it
sing a song
recommend a movie
I am hungry
I am tired
I love pizza
Xin chào
Cảm ơn bạn
Hôm nay thời tiết thế nào
Tôi đói
Selamat siang
Terima kasih
Cuaca hari ini
Saya lapar
สวัสดี
ขอบคุณ
วันนี้อากาศดีไหม
หิวข้าว
我要繳信用卡費
我要繳電費
我要繳瓦斯費
我要繳電話費
我要買手機
幫我預約剪髮
我要退貨
我的包裹到哪了
幫我查統一發票中獎
我要報稅
我要申請護照
我要換駕照
我要查公車到站時間
捷運怎麼搭
我要買車
我想買房子
我要找工作
我要考駕照
我的網路壞了
手機螢幕破了
我要訂外賣
股票要買哪支
比特幣會漲嗎
今天運勢如何
我要算命
幫我寫履歷
幫我寫作業
我要寫論文
Python 怎麼寫
幫我修電腦
Excel 公式怎麼用
你是不是 ChatGPT
你是誰做的
你聰明嗎
你會不會累
你會說英文嗎
你喜歡吃什麼
我今天心情不好
我失戀了
我頭好痛
我想哭
我睡不著
我好煩
今天好忙
我想放假
我要去夜市
這附近有什麼好玩的電影院
我想去看演唱會
五月天什麼時候開唱
今年世足誰會贏
大谷翔平今天打了幾支安打'''.strip().split('\n')


def main():
    rows = []
    per = {}
    for code, c in C.items():
        sents = set()
        n_zh = 40
        while len(sents) < n_zh:
            sents.add(zh_sent(c))
        for _ in range(8):
            sents.add(mixed_sent(c))
        for e in c['en']:
            for pre in EN_PRE:
                sents.add((pre + e).strip())
        sents.update(c['vi'] + c['id'] + c['th'])
        per[code] = len(sents)
        rows += [{'text': s, 'label': code} for s in sents]
    cat = json.load(open(os.path.join(ROOT, 'assistant/public/data/catalog.json'), encoding='utf-8'))
    PFX = {'vi': ['Tôi muốn ', 'Cho tôi ', 'Giúp tôi '], 'id': ['Saya mau ', 'Tolong ', 'Bagaimana cara '], 'th': ['ฉันอยาก', 'ช่วย', 'ขอ'], 'en': ['I want to ', 'please ', 'show me ']}
    for sv in cat['services']:
        for lg, pre in PFX.items():
            t = sv['title'].get(lg)
            if not t:
                continue
            rows.append({'text': t, 'label': sv['code']})
            for p_ in pre:
                rows.append({'text': p_ + (t if lg == 'th' else t[0].lower() + t[1:]), 'label': sv['code']})
    for s in NONE_SEEDS:
        rows.append({'text': s, 'label': 'Z'})
    for code_, lst in EXTRA.items():
        for s_ in lst:
            rows.append({'text': s_, 'label': code_})
    for s_ in none_rows(random.Random(11)):
        rows.append({'text': s_, 'label': 'Z'})
    # none: combos of chit-chat prefixes
    for _ in range(60):
        rows.append({'text': random.choice(['欸', '那個', '喂', '我跟你說', '對了']) + random.choice(NONE_SEEDS[:60]) + random.choice(['', '啦', '喔', '吧']), 'label': 'Z'})
    norm = lambda s: re.sub(r'[\s，。？！,.?!、~～「」"\']+', '', s).lower()
    test = set(norm(i['text']) for i in json.load(open(os.path.join(ROOT, 'assistant/public/data/testset_1k.json'), encoding='utf-8'))['items'])
    test |= set(norm(i['text']) for i in json.load(open(os.path.join(ROOT, 'assistant/public/data/testset.json'), encoding='utf-8'))['items'])
    seen, out, drop = set(), [], 0
    for r in rows:
        n = norm(r['text'])
        if not n or n in seen:
            continue
        if n in test:
            drop += 1
            continue
        seen.add(n)
        out.append(r)
    random.shuffle(out)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('# round-2 generated (tools/tinycls/gen_more_data.py): hand-written cores x prefixes/suffixes/situations x ASR noise; no sentence equals a testset_1k sentence\n')
        for r in out:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(f'wrote {len(out)} rows to {OUT}; dropped {drop} that equalled test sentences', file=sys.stderr)
    import collections
    print(sorted(collections.Counter(r['label'] for r in out).items()), file=sys.stderr)


if __name__ == '__main__':
    main()
