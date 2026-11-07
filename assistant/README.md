# 城市通小幫手（assistant）

一個按鈕。說出你想做的事，它幫你找到服務（P1），再陪你一步一步做完（P2）。
全部在手機上跑：語音轉文字、翻譯、決策模型都在本地。模型只做決策，不寫文字。

對應 `../SPEC.md`。這份文件只講「怎麼跑、東西在哪」。

## 資料夾

```
assistant/
  public/data/catalog.json        服務目錄（25 個服務 A～Y，Z 都不是；指令集 A～G）
  public/data/copy.{zh,en,vi,id,th}.json   畫面文字模板（外語版賽前翻好）
  public/data/testset.json        評測用 100 句 + 外語 20 句
  public/guides/*.json            導覽腳本（繳水費、臨櫃叫號）
  public/models/                  手機端模型（tinycls.*.json、cls-services/、e5-small、embeddings.json）
  src/core/   decide.ts（機率→GO/ASK/NONE）prompt.ts rules.ts extract.ts bridge.ts catalog.ts copy.ts settings.ts
  src/engines/ llm.ts（llama-server logprob）cls.ts（微調編碼器）tiny.ts（字元 n-gram）embed.ts（零樣本向量）
  src/ui/     AssistantHome.vue（P1）EvalView.vue（/eval）
  src/overlay/index.ts            引導層 guide-overlay.js（P2，注入到每個服務頁）
  src/eval/runner.ts              評測邏輯（瀏覽器與 Node 共用）
  scripts/    serve-local 用的輔助腳本、模型下載與預算向量、prompt 匯出
../scripts/serve-local.mjs        本機單一 port 伺服器（服務頁 + 小幫手 + /llm 轉發 + 注入 overlay）
../eval/eval.ts, matrix.ts        評測 CLI 與測試矩陣
../tools/tinycls/                 tiny 引擎訓練器與種子訓練句
../tools/encoder/train_cls.py     微調 multilingual-e5-small 分類器 + 裁詞表 + ONNX int8
../tools/llm/finetune_gemma.py    LoRA 微調 Gemma 3 270M 成 1-token 決策器，轉 GGUF
../deploy/                        Docker（nginx + llama-server）與 server 部署腳本（選配）
```

## 本機跑起來（Demo 主線：筆電 + 手機同內網）

```bash
# 1. 建置（服務頁不修改，只是 build 一次）
cd TownPass-Services && pnpm build-only
cd ../assistant && pnpm install && pnpm build      # 也會把 guide-overlay.js 複製到 TownPass/assets/js/

# 2. （選）LLM 引擎：llama-server
tools/llama/llama-server.exe -m tools/models/<model>.gguf --port 8080 -ngl 99 -c 4096 --cache-reuse 256

# 3. 單一 port 伺服器（綁 0.0.0.0，手機同內網用筆電 IP）
node scripts/serve-local.mjs --port 5180 --llm http://127.0.0.1:8080
#   小幫手 http://<筆電IP>:5180/assistant/   評測頁 .../assistant/#/eval
```

手機：`.\dev-phone.ps1 -Url http://<筆電IP>:5180/assistant/`（debug 版允許 http）。
App 裡的「小幫手」入口與每個服務頁的引導層注入都在 `TownPass/lib/service/assistant_service.dart`。

網址參數：`?engine=auto|llm|cls|tiny|embed`、`?llm=http://localhost:8080`（手機本地 llama-server）、`?lang=zh|en|vi|id|th`、`?q=句子`（直接判斷）。

## 手機（Galaxy S26 Ultra）

```bash
# App：debug APK 指向筆電伺服器（手機熱點或同內網）
cd TownPass && .\.fvmlutter_sdkinlutter.bat build apk --debug --dart-define=DEV_SERVICE_URL=http://<筆電IP>:5180/
adb install -r buildpp\outputslutter-apkpp-debug.apk

# NPU：官方 Snapdragon 版 llama.cpp + 微調 Gemma 270M，全部放 /data/local/tmp/llama（不 root、不安裝）
.\scripts\phone-npu.ps1 -Push -Start      # 之後 App 內的小幫手會自動優先用 localhost:8080（引擎 llm-phone）
.\scripts\phone-npu.ps1 -Forward          # 筆電評測：pnpm eval --engine llm --url http://127.0.0.1:18080 --fuse
.\scripts\phone-npu.ps1 -Remove -Uninstall   # 清乾淨
```
實測（S26 Ultra，Hexagon v81）：prompt 處理 NPU 9288 tok/s vs CPU 2662 tok/s；固定前綴 79 token 39 ms、之後每句 26 ms；評測首輪 90.7%、兩輪 95.9%。

## 決策器：一個介面，四種引擎 + 工具層

`Decider.score(text) → 機率分布` → 查表先驗融合（`core/registry.ts`）→ `decide()` 依門檻給 GO / ASK / NONE；按「不是」就歸零重判，不呼叫模型。
模型從頭到尾只「選一個」，不產生文字；工具的呼叫、參數、頁面都由 registry 定義，所以結構上不可能叫到不存在的工具或編參數。

| 引擎 | 模型 | 大小 | 首輪 / 兩輪 / 範圍外辨識 | 怎麼來 |
|---|---|---|---|---|
| `cls` **（主力）** | multilingual-e5-small（Microsoft）微調分類頭，裁詞表 250k→13k，ONNX int8 | 27.5MB，5 ms | 93.8% / 97.9% / 80%（top-1 97.2%） | `python tools/encoder/train_cls.py --eval` |
| `tiny` | 字元 n-gram embedding bag（fastText 式，自己實作） | 2MB，<1 ms | 87.6% / 89.7% / 90% | `python tools/tinycls/train.py --set services --eval` |
| `embed` | e5-small 零樣本：和每個工具的例句算相似度（不用訓練） | 118MB，5 ms | 88.7% / 99.0% / 80% | `pnpm fetch-embed-model && pnpm precompute` |
| `llm` | **Gemma 3 270M（Google）LoRA 微調成 1-token 決策器**，llama-server `max_tokens=1` 取 A～Z/a～e 的 logprob，固定前綴 KV cache | GGUF Q8_0 292MB，筆電 GPU 37 ms | 90.7% / 96.9% / 80%（top-1 94.4%）；零樣本 270M/1B 只有 0～6% | `tools/llm/finetune_gemma.py`（模型在 `tools/llm/out/`） |

數字來自 `../eval/MATRIX.md`（107 句測試集，含查表融合）。`auto` 的順序：llm → cls → tiny → embed。

### 工具層（MCP 式）

```
服務本體（mock 資料、頁面文字）──mine_mock.py──▶ 訓練句 + entities.json
catalog.json + guides/*.json + entities.json ──build_registry.py──▶ public/data/registry.json
```
`registry.json`：每個工具的 id / code / 說明 / `invoke`（page | guide | external | bridge | ui）/ `params`（例如水號 10 碼）/ `covers`（涵蓋的具體項目）/ `index`（項目名稱 → 工具，標出有歧義的詞）。
執行時：`lookup()` 最長匹配 → `fuse()` 以先驗融進分布（歧義詞只拉高相關幾個、讓系統走 ASK）→ `extractParams()` 只抽不猜 → `invoke()` 開頁 / 啟動導覽並預填（使用者要按「對」才算）/ 切長輩模式 / 朗讀 / 打電話。
目錄變動後：`python tools/tinycls/mine_mock.py && python tools/registry/build_registry.py && python tools/encoder/train_cls.py --eval && python tools/tinycls/train.py --set services`。

## 評測

```bash
pnpm eval --engine cls --fuse        # --fuse = 加上 registry 查表融合（上線行為）
pnpm eval --engine tiny --fuse
pnpm eval --engine embed --fuse
pnpm eval --engine llm --url http://127.0.0.1:8080 --name <模型名> --where laptop-gpu
pnpm matrix          # 彙整 eval/results/*.json → eval/MATRIX.md
```
手機上：開 `/assistant/#/eval` 直接跑測試集。

## 導覽怎麼知道該點什麼（三層）

1. **腳本**：`public/guides/*.json` 寫死的步驟（text / label / role / css / option 定位；`{{entity}}`、`{{keyword}}` 由工具層帶入）。
2. **sitemap**：`tools/crawl/crawler.js` 在瀏覽器裡把 App 爬成一張圖（每一頁可點的元素、穩定選擇器、點下去到哪一頁、要先展開什麼）→ `public/data/sitemap.json`。
   執行時不在目標頁就用 BFS 找路（「先點「更多項目」才會到那一頁」），鎖定時用穩定選擇器＋標籤比對。頁面改了只要重爬，不用重訓。
3. **版面感知**：腳本與 sitemap 都失敗時，即時抓這一頁所有可互動元素，用目標文字打分（字元相似度＋別名）挑最像的；有 LLM 就讓它從候選裡選一個字母。
   `tools/llm/gen_ui_data.py` 會從 sitemap 產生「目標 + 標籤清單 → 字母」的訓練資料，和服務集一起練進 Gemma 270M，手機 NPU 就能即時做這件事。

鎖定與手機細節：亮框每一幀重新對位（rAF + interval），目標不見就收掉並重找；目標被提示視窗蓋住會先引導關掉；面板永遠不蓋住目標（上下對調）；鍵盤彈出時注入 `interactive-widget=resizes-content`、面板縮小移到上方、欄位捲進可見區；App 只注入載入器，每次從伺服器抓最新的 `guide-overlay.js`。

## 導覽腳本（P2）

`public/guides/<id>.json`：`entry` 起點網址、`steps[]` 每步的 `url`、`find[]`（text / label / role / css 依序嘗試）、`say` / `more`、`done_when`（click / input / route / manual）、`accept`（digits / phone / date）、`confirm`（長輩模式多確認一次）。
找不到元素時不會壞掉，改成純文字說明。引導層會自動跳到符合目前網址的步驟。

步驟內的指令：先跑 `rules.ts` 的固定說法，比對不到才交給決策器（指令集 A～G，同樣只算 1 個 token）。
FILL 的內容由 `extract.ts` 用規則抽出（含中文數字）。

## 手機原生 bridge（TownPass）

`stt`、`lang_id`、`translate`、`translate_prepare`、`tts`，實作在 `TownPass/lib/util/web_message_handler/tp_assistant_message_handler.dart`。
一般瀏覽器沒有 bridge 時退回 Web Speech API / 啟發式語言判斷，方便在電腦上開發。
