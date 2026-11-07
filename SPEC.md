# 城市通小幫手 — Spec v0.3（一日賽版）

> 一個按鈕。說出你想做的事，它幫你找到服務，再陪你一步一步做完。
> **全部在手機上跑**：語音轉文字、翻譯、決策模型都在手機本地執行。模型只做決策，不寫文字。

---

## 0. 設計理念：System One（參考 Jev）

TypeSafe 的 Jev 主張「非結構化輸入進來，帶機率的型別化決策出去」：放棄逐字產生文字，選項事先定義好，所有選項的機率一次算完，直接拿來當信心分數。

Jev 是雲端 API，沒有公開權重，所以不能直接用。我們在本地重現它的概念：

| Jev 的概念 | 我們的本地做法 |
|---|---|
| 不產生文字，只給決策 | LLM 只算 **1 個 token**（服務代號 A～Z）的機率，`max_tokens = 1` |
| 選項事先定義 | 服務目錄就是選項，模型不可能選出不存在的服務 |
| 平行算出所有選項的機率 | 一次 forward pass 拿到全部字母的 logprob，得到機率分布 |
| 有校準的信心分數 | 用機率分布決定「直接去 / 追問 / 放棄」（見 3.3） |

### 0.1 開源的 Jev 複刻版（可以直接用，也可以微調）

「Luna」查證後是 OpenAI 的閉源 GPT-6 Luna Decisions，**不是開源模型**。開源的複刻版很多，以下兩個最適合我們：

| 模型 | 底座 | 大小 | 授權 | 解讀方式 | 部署 | 適合我們的理由 |
|---|---|---|---|---|---|---|
| **Intern-Decision**（InternLM） | Qwen3.5 | 0.8B / 2B / 4B | Apache-2.0 | 讀取答案欄位前一個位置的 logits，只對該欄位允許的符號做 softmax，再做校準 | 有 llama.cpp / Ollama 量化版；4090 上 0.8B 約 34 ms | 解讀方式**和我們的 3.3 完全一樣**；0.8B 可以放手機；有開源訓練程式 |
| **decider**（Mapika） | Qwen3.5 | 2B / 4B / 12B… | Apache-2.0 | 一次 forward pass 輸出所有選項的機率分布 | 有 GGUF；API 與 Jev 相容（`/v1/systemone`） | 跟 Jev SDK 相容，可以當對照組 |

> ⚠️ 兩者的模型卡都沒有說明是否支援中文（底座 Qwen3.5 是多語模型）。**一定要用我們的中文測試集實測。**
> 另外要驗證：llama.cpp 量化版能不能照它的 prompt 格式，用 `max_tokens=1` + logprobs 重現它的解讀方式。

**策略**
1. 先拿 Intern-Decision-0.8B / 2B 原版，和一般 Qwen3 一起放進測試矩陣
2. 中文效果不夠的話：在 4090 上用它的訓練程式，以我們合成的「台北服務意圖」資料做 LoRA（0.8B 很小，**賽前**就能訓練完）

**由這個理念推出的三條規則**
1. **模型只處理純文字，而且只做挑選。** 聲音和外語交給手機原生功能轉成文字（第 4 節）
2. **所有給使用者看的文字都預先寫好。** 外語版本在賽前用大模型翻好，再人工抽查
3. **thinking 模式一律關閉。** 算力全部用在「快」上

---

## 1. 範圍

**目標族群**：說中文或英文、數位能力低的人，以及長輩。外語是加分項；因為翻譯由手機處理，成本已經大幅降低。

| 必做（Demo 主軸） | 加分（高優先） | 加分 | 不做 |
|---|---|---|---|
| P1 按鈕 → 意圖 → 跳到服務或追問 | **手機本地 LLM（llama-server on Android）** | 外語輸入（ML Kit 翻譯） | 代填 |
| P2 繳水費導覽 | **手機原生語音轉文字** | 第 2 條導覽流程 | 微調 LLM |
| 長輩 / 一般模式 | | 卡關偵測 | |
| **手機本地保底決策器**（transformers.js 向量） | | | |
| 各級模型的評測數據 | | | |

> **一定能交出「手機本地」的保證**：保底決策器在 WebView 裡直接跑向量模型，不需要改 App，也不需要編譯，所以最壞的情況也能拿出手機本地的成果。

---

## 2. 現況與硬體

| 東西 | 規格與位置 | 用途 |
|---|---|---|
| 筆電 | i9-13900H、16GB RAM、**RTX 4050 6GB**；Android NDK 28/29 已安裝 | 開發、跑 M 級模型、交叉編譯 Android 版 llama.cpp |
| **4090 server** | 24GB VRAM | 賽前：產生例句與翻譯、跑 L 級評測、（選做）微調 encoder。**Demo 路徑不依賴它** |
| Android 手機 | 型號與 RAM 待確認 | Demo 主角 |
| TownPass（Flutter） | `TownPass/` | WebView 加 bridge；要新增語音與翻譯 bridge |
| 官方範例微服務（Vue） | `TownPass-Services/` | 被引導的對象，**不修改**；小幫手入口頁另外做 |
| 服務清單 | `TownPass/lib/page/city_service/model/my_service_model.dart` | 約 21 個服務，當作目錄的種子 |

---

## 3. P1：懂你要什麼

### 3.1 使用流程

```
[🎤 小幫手] 浮動大按鈕
      │
      ▼
「你想做什麼？」  [🎤 按著說話]（原生語音轉文字）  [⌨️ 打字]
                  常用捷徑：[繳費] [叫號] [陳情] [圖書館]
      │
      ▼  （不是中文或英文 → 原生翻譯成中文）
  決策器（3.3）→ 機率分布
      │
      ├─ GO   → 「要去【繳水費】嗎？」  [去] [不是]
      ├─ ASK  → 「你要做哪一個？」      [繳水費] [報水表度數] [都不是]
      └─ NONE → 「找不到這個服務」      [看全部服務] [打給 1999]
```

- 追問一律給按鈕，最多 2 輪
- 按「不是」，就把該選項的機率歸零，重新判斷一次，不需要再呼叫模型
- 畫面上所有文字都來自 `copy.json` 模板

### 3.2 服務目錄

```jsonc
{
  "id": "water_fee_pay",
  "code": "A",                        // 給模型用的單一 token 代號
  "title": { "zh": "繳水費", "en": "Pay water bill" },
  "desc": "用手機繳台北自來水費",      // 放進 prompt（只用中文）
  "keywords": ["水費", "水單", "繳水錢", "water bill"],
  "examples": ["我要繳水費", "水費單怎麼付", "pay my water bill"],
  "route": { "type": "internal", "target": "/fee-payment" },
  "guide_id": "guide_water_fee"
}
```

範圍是 20～25 個服務，代號用 A～Y，`Z` 代表「都不是」。

### 3.3 決策器：一個介面，三種引擎

```ts
interface Decider { score(text: string): Promise<Record<Code, number>> }  // 回傳機率分布
// 引擎可以切換：llm-remote（電腦/4090） | llm-phone（手機 llama-server） | embed-phone（保底）
```

**LLM 引擎**（電腦和手機共用同一份程式碼，只換網址）

```
[固定前綴，用 KV cache 快取]
你是分類器。選出最符合的服務代號，只輸出一個字母。
A 繳水費：用手機繳台北自來水費
...
Z 都不是
[每次只變動這段，十幾個 token]
使用者：水的那個帳單
答案：
```

請求參數：

```jsonc
{ "max_tokens": 1, "temperature": 0, "logprobs": true, "top_logprobs": 30, "cache_prompt": true }
```

取出 A～Z 的 logprob 後做 softmax，得到機率分布。

**向量保底引擎**（在 WebView 內，用 transformers.js）
- 把使用者的話和每個服務的 `examples` 計算相似度
- 每個服務取最高分，乘上溫度係數後做 softmax，得到機率分布
- 「都不是」：最高相似度低於門檻時，提高 Z 的機率

**決策規則**（三種引擎共用，門檻值用評測調整）

```
p1 ≥ 0.75          → GO(第一名)
p1 + p2 ≥ 0.75     → ASK(前 2 名)
前 3 名加總 ≥ 0.75 → ASK(前 3 名)
否則，或 Z 最高    → NONE
```

---

## 4. 手機原生能力：語音轉文字與翻譯

在 Flutter 新增 bridge，**賽前先 build 好 APK**。網頁只收發純文字。

| bridge name | data | 回傳 | 實作 |
|---|---|---|---|
| `stt` | `{ lang: "zh-TW" \| "en-US" \| "auto" }` | `{ text }` | `speech_to_text` 套件（Android 內建 SpeechRecognizer）。要先下載離線語言包，搭配 `EXTRA_PREFER_OFFLINE` |
| `lang_id` | `{ text }` | `{ lang, conf }` | `google_mlkit_language_id`，在手機本地執行 |
| `translate` | `{ text, from, to }` | `{ text }` | `google_mlkit_translation`，在手機本地執行（每個語言模型約 30MB，**賽前先下載**） |

**外語流程（加分項）**

```
越南語語音 → stt → lang_id = vi → translate(vi → zh) → 決策器
                                                    │
                    畫面文字 ← copy.vi.json（賽前用大模型翻好） ←┘
```

- **輸入**走手機翻譯：使用者說的話是開放內容，只能即時翻譯
- **輸出**不即時翻譯：畫面文字是固定模板，賽前在 4090 上用大模型翻好、人工抽查。這樣品質可控，也解決「翻譯是個問題」
- 第一批語言建議：越南語、印尼語、泰語、英文（依新住民與移工人數）

> ⚠️ 需要驗證的地方：
> - ML Kit 翻成中文時輸出的是簡體。這不影響決策器，因為模型只看字義，不顯示給使用者
> - 離線語音辨識的品質依手機品牌而異

---

## 5. 手機本地部署

### 5.1 三條路線（由穩到酷）

| 路線 | 做法 | 優點 | 風險 | 定位 |
|---|---|---|---|---|
| **A. 向量模型放進 WebView** | transformers.js + multilingual-e5-small（q8，約 30MB）放在微服務的靜態檔 | 不用改 App、不用編譯 | 準確度低於 LLM | **必做保底** |
| **B. llama-server 跑在手機** | 用 NDK 交叉編譯 llama.cpp（arm64），`adb push` 二進位檔和 GGUF，以 `adb shell nohup ./llama-server --port 8080 &` 啟動 | **跟電腦同一套 API**，前端程式完全不用改；可以用 logprob；拔線後仍會繼續跑 | 編譯、效能、記憶體 | **加分主力，賽前要驗證** |
| C. Flutter 原生 plugin | llama.cpp 包成 plugin，加上 `llm_infer` bridge | 產品級，不用 adb | 開發量大 | 賽後 |

> ❌ MediaPipe / LiteRT-LM 的高階 API 拿不到 logprob，不適合我們的「只算機率」設計，所以不採用。

### 5.2 路線 B 的手機目標

| 模型 | GGUF Q4 大小 | 預期 | 備註 |
|---|---|---|---|
| Qwen3-0.6B | 約 0.4GB | 一定跑得動 | 首選驗證對象 |
| Qwen3-1.7B | 約 1.1GB | 中高階手機可以 | 準確度與速度的平衡點 |
| Gemma 3 1B | 約 0.8GB | 可以 | 對照組 |
| Qwen3-4B | 約 2.5GB | 只限 8GB RAM 以上的手機 | 上限測試 |

**關鍵加速**：固定前綴（服務清單，約 400 token）在啟動時先算一次並快取。之後每次查詢只處理約 20 個 token 加 1 個輸出 token，所以手機 CPU 也有機會做到 1 秒內（以實測為準）。

### 5.3 （選做）把 encoder 微調成分類器

如果路線 A 的準確度不夠：在 4090 上用合成例句微調 e5-small 的分類頭（約 2～5k 句，幾分鐘就能訓練完），匯出成 ONNX，替換路線 A 的模型。這是最接近 Jev 的本地做法：百 M 參數級、直接輸出機率。

---

## 6. P2：陪我做

### 6.0 核心原則：疊在原本的服務上面，不改寫服務

```
┌───────────── 原本的服務頁（一行都不改）─────────────┐
│                                                      │
│  ░░░░ 變暗 ░░░░  ┌──────────┐  ░░░░ 變暗 ░░░░       │
│                  │ 水號 [___]│ ← 只有這裡發亮         │
│                  └──────────┘                        │
├──────────── 引導層（注入的 overlay）──────────────────┤
│  輸入帳單上的水號                                     │
│  [🎤 用說的]  [🔊 再說一次]  [❓ 我不會]  [✕]          │
└──────────────────────────────────────────────────────┘
```

**做法**
- `TPInAppWebView` 已經支援 `initialUserScripts`（`TownPass/lib/util/tp_web_view.dart:118`）
- 由 Flutter 把一支 `guide-overlay.js` 注入**每一個服務的 WebView**，包括外部網址的服務
- 服務頁本身不需要任何修改

**好處**
- **零修改**：服務照常運作，我們只是多一層引導
- **可擴充**：每支援一個新服務，只要寫一份 JSON 腳本，不需要服務方配合開發。這是簡報上最強的論點
- **可退出**：關掉引導層，服務就跟原本一模一樣

### 6.1 互動

畫面變暗，只亮出該操作的地方，下方用一句話說明這一步要做什麼。使用者有三種方式完成這一步：

| 方式 | 例子 | 引導層的反應 |
|---|---|---|
| 自己點或自己打字 | 直接在欄位輸入水號 | 偵測到完成，進到下一步 |
| **說出要填的內容** | 「水號是 1234567890」 | 用規則抽出數字，填進發亮的欄位，**顯示出來讓使用者確認** |
| **說出指令** | 「下一步」、「我不會」、「回去」、「再念一次」、「不要了」 | 交給決策器，從固定指令集挑一個（第 6.4 節） |

- 填入內容一定是使用者自己說出來的，引導層只是代替打字，不會自己去抓資料填
- 送出和付款按鈕**只發亮，不代按**，一定由使用者自己按
- 「我不會」只顯示預先寫好的 `more` 文字

### 6.2 導覽腳本：用現有頁面上看得到的東西定位

因為不改服務，所以不能加 `data-guide` 標記。改成依照現有 DOM 定位，多個定位方式依序嘗試：

```jsonc
{ "id": "guide_water_fee",
  "match": { "url": "/fee-payment" },          // 進到這個網址就自動提示「要我陪你做嗎？」
  "steps": [
    { "find": [{ "text": "水費" }],                         "say": "點「水費」",
      "more": "藍色水滴的圖示", "done_when": "click" },
    { "find": [{ "label": "繳費編號" }, { "css": "input[name=payment_number]" }],
      "say": "輸入繳費編號", "more": "帳單上的號碼",
      "accept": "digits", "done_when": "input" },
    { "find": [{ "role": "button", "text": "查詢" }],        "say": "按「查詢」",
      "done_when": "route" }
  ] }
```

**定位方式**
- `text`：畫面上的文字
- `label`：表單的標籤文字
- `role`：按鈕或輸入框
- `css`：最後的備案

**容錯**：所有定位方式都找不到時，不要壞掉，改成只顯示文字說明（「找到『查詢』按鈕按下去」）。

### 6.4 步驟內的指令（也是 Jev 式決策）

指令集是固定的：`NEXT` 下一步、`BACK` 回上一步、`HELP` 我不會、`REPEAT` 再念一次、`FILL` 這句話是要填的內容、`EXIT` 不要了、`OTHER` 想做別的事（回到 P1 的意圖判斷）。

1. **先跑規則**：「下一步」、「再一次」這類固定說法，直接比對，不呼叫模型
2. **比對不到才交給決策器**：一樣只算 1 個 token。prompt 會帶入「目前這一步要做什麼」，所以模型能分辨「1234567890」是要填的內容，「我要去繳停車費」則是 `OTHER`
3. `FILL` 的內容用 `accept` 規則抽取（數字、手機號碼、日期），不用模型產生

**文案規則**
1. 動詞開頭，12 個字以內
2. 一步只做一個動作
3. 不用術語，不說「您好」、「請」
4. 引號內放畫面上的按鈕文字

**流程**：必做「繳水費」（`/fee-payment`），加分做「臨櫃叫號」（`/counter-calling`）。

> 已確認：`public/mock/fee-payment/fee_payment_list.json` 裡有「水費」，另外還有停車費、地方稅、學雜費、聯合醫院醫療費等約 20 種費用。
> 這些費用正好可以示範追問：使用者說「我要繳費」，系統就問「繳哪一種？」。目錄可以直接從這份 mock 資料產生。
>
> 賽後的延伸：在 4090 上讓大模型讀服務頁的 DOM，自動產生導覽腳本草稿，再由人工審核。這樣支援新服務的成本會更低。

### 6.3 長輩 / 一般模式

第一次使用時只問一題：「字要大一點嗎？」 [要] [不用]

| | 長輩 | 一般 |
|---|---|---|
| 字級 | 1.5 倍 | 1 倍 |
| 說明文字 | `say` + `more` | `say` |
| 朗讀 | 自動念（`speechSynthesis`；不支援就加 `tts` bridge） | 不念 |
| 付款與送出 | 多確認一次 | 一般 |

---

## 7. 模型分級與評測

| 級別 | 跑在哪裡 | 候選模型（GGUF Q4_K_M） |
|---|---|---|
| L | 4090 server | Qwen3-14B、Qwen3-30B-A3B、Gemma 3 27B、Llama-3.1-TAIDE-LX-8B |
| M | 筆電 RTX 4050（6GB） | Qwen3-4B、Gemma 3 4B、Llama-Breeze2-3B |
| S | **手機**（同時也在筆電 CPU 上測一次） | **Intern-Decision-0.8B / 2B**、Qwen3-1.7B、Qwen3-0.6B、Gemma 3 1B |
| 對照 | 4090 | decider-2b / 4b（Jev 相容） |
| 保底 | 手機 WebView | multilingual-e5-small（transformers.js） |

**測試矩陣**（評測腳本自動產生）

| 模型 / 引擎 | 跑在哪裡 | 首輪命中率 | 2 輪內命中率 | 不在範圍內的辨識率 | 平均追問次數 | 延遲 p50 | 記憶體 |
|---|---|---|---|---|---|---|---|
| e5-small 向量 | 手機 | | | | | | |
| Qwen3-0.6B | 手機 | | | | | | |
| Qwen3-1.7B | 手機 | | | | | | |
| Qwen3-4B | 筆電 GPU | | | | | | |
| Qwen3-14B | 4090 | | | | | | |

- 「2 輪內命中率」用模擬計算：遇到 ASK 時，自動按正確答案的按鈕
- 測試集共 100 句：每個服務 4 句、模糊句 10 句、不在範圍內的 10 句。加分項：外語 20 句，用來測 ML Kit 翻譯接上決策器的效果
- 手機上的評測：WebView 開 `/eval` 頁面，直接在手機上跑完測試集

---

## 8. 技術分級總表

| 元件 | 難度 | 風險 | 時機 |
|---|---|---|---|
| 浮動按鈕、對話 UI、三種決策 UI | ★ | 低 | 比賽當天 |
| 目錄、測試集、copy.json | ★ | 低 | **賽前初稿**（例句由 4090 產生，人工挑選） |
| 決策器介面與決策規則 | ★ | 低 | 比賽當天 |
| LLM logprob 引擎 | ★★ | 中 | **賽前驗證**拿得到 logprob |
| 路線 A：transformers.js 向量 | ★★ | 低 | 比賽當天 |
| **路線 B：Android llama-server** | ★★★ | 中高 | **賽前一定要先跑通**（編譯、push、跑出 logprob） |
| `stt` bridge | ★★ | 中 | **賽前 build 進 APK** |
| `lang_id`、`translate` bridge | ★★ | 中 | 賽前 build 進 APK，並先下載語言模型 |
| 外語模板翻譯 | ★ | 低 | 賽前用 4090 翻好 |
| 引導層注入（initialUserScripts） | ★★ | 中 | **賽前**先驗證能注入到服務頁 |
| 引導層（變暗、發亮、說明）與繳水費腳本 | ★★ | 低 | 比賽當天 |
| 步驟內指令（規則加決策器）、語音填入 | ★★ | 中 | 比賽當天 |
| 長輩模式 | ★ | 低 | 比賽當天 |
| 卡關偵測 | ★★ | 低 | 加分 |
| 微調 encoder | ★★ | 中 | 選做（4090） |
| Intern-Decision LoRA 微調 | ★★ | 中 | 選做，**只在賽前**做（4090），依中文實測結果決定 |
| 代填、路線 C | – | – | 不做 |

---

## 9. 架構

```
┌──────────────────── Android 手機（全部本地）──────────────────┐
│ TownPass (Flutter)                                           │
│  ├─ bridge：open_link / phone_call / stt / lang_id / translate │
│  ├─ initialUserScripts → 注入 guide-overlay.js 到每個服務頁    │
│  └─ WebView: 原本的服務（不修改）+ 小幫手入口頁                 │
│       ├─ 引導層：變暗、發亮、說明、指令決策                     │
│       └─ assistant/                                          │
│            ├─ ui:   AssistantButton / ChatSheet / GuideOverlay│
│            ├─ data: catalog.json  guides/*.json  copy.{zh,en,vi,…}.json
│            ├─ core: decide.ts（機率 → GO/ASK/NONE）           │
│            ├─ engines: llm.ts（http://localhost:8080）         │
│            │           embed.ts（transformers.js，在 WebView 內）│
│            └─ eval/   /eval 頁面                              │
│                                                              │
│ llama-server（arm64，adb 啟動）:8080 ← Qwen3-0.6B / 1.7B GGUF  │
└──────────────────────────────────────────────────────────────┘
   開發期：localhost:8080 透過 adb reverse 指到筆電或 4090
           切換方式就是同一個網址，前端零修改
```

---

## 10. 時程

### 賽前（如果規則允許；這一段決定成敗）
1. **路線 B 驗證**：NDK 編譯 llama-server，在手機上跑 Qwen3-0.6B，用 curl 拿到 logprob，記錄延遲
2. **APK**：加入 `stt`、`lang_id`、`translate` 三個 bridge，build 好，並在手機上先下載離線語音與翻譯模型
3. **資料**：在 4090 上產生目錄例句、測試集，以及外語版的 copy.json
4. 下載好所有 GGUF 和 e5-small 的 ONNX 檔

### 比賽當天（10 小時，3～4 人）

| 時間 | A：前端 | B：模型與部署 | C：內容與導覽 |
|---|---|---|---|
| 0–1h | fork、浮動按鈕、ChatSheet | 手機啟動 llama-server；筆電啟動 M 級 | 最後確認目錄與測試集 |
| 1–3h | GO / ASK / NONE 三種 UI、stt 串接 | decide.ts、llm.ts、embed.ts | copy.json、繳水費頁面的 DOM 定位 |
| 3–4h | **手機全程走通** | /eval 頁面 | 繳水費導覽腳本 |
| 4–6h | GuideOverlay | 在手機上跑測試矩陣、調門檻值 | 長輩模式文案 |
| 6–7h | 長輩模式、P1 接到 P2 | 外語流程（加分） | 第 2 條流程（加分） |
| 7–8h | 修 bug、卡關偵測（加分） | 飛航模式下的 Demo 測試 | 找人實測 |
| 8–10h | 錄 Demo 備份影片 | 數據圖表 | 簡報 |

**第 4 小時檢查點**：手機上的 P1 必須走通（至少用路線 A）。路線 B 卡住就先擱置，用路線 A 繼續。

---

## 11. Demo 劇本（90 秒）

1. **打開飛航模式**：「接下來全部在手機上跑。」
2. 阿公按住大按鈕說「水的那個帳單」→ 追問 [繳水費] [報水表度數] → 點「繳水費」
3. 畫面變暗，亮出「水費」→ 水號欄位 →「我不會」→ 出現「帳單右上角的數字」
4. （加分）越南媽媽用越南語說話 → 畫面以越南語顯示按鈕 → 一樣跳到正確的服務
5. 投影片：模型**只輸出 1 個 token**；手機上 1.7B 模型命中率 X%、延遲 Y ms；零幻覺；個資不出手機

---

## 12. 目前狀態（2026-11-07 檢查）

### 環境

| 項目 | 狀態 | 下一步 |
|---|---|---|
| TownPass App 加上開發入口 | ✅ 已修改（3 個檔案，尚未 commit） | – |
| TownPass-Services 套件 | ✅ 已安裝，git 乾淨 | fork 一個分支來做小幫手 |
| Android NDK 28/29、SDK cmake 3.22 | ✅ 已安裝 | 用來交叉編譯 llama.cpp |
| Python 3.12 / Node 20 / pnpm | ✅ | – |
| 手機 | ❌ 目前沒接上（`adb devices` 是空的） | 接上後跑 `dev-phone.ps1` |
| llama.cpp（筆電） | ❌ 沒有安裝 | 下載 Windows CUDA 版的 release |
| llama.cpp（Android） | ❌ 還沒編譯 | NDK 交叉編譯（路線 B） |
| 語音與翻譯 bridge | ❌ `pubspec.yaml` 還沒有 speech / mlkit 套件 | 加入 3 個套件，寫 3 個 handler |
| 4090 server | ❓ 連線方式未知 | 確認 SSH |
| 繳水費的頁面與資料 | ✅ mock 資料裡有「水費」 | 依照現有 DOM 寫導覽腳本 |
| WebView 腳本注入 | ✅ `TPInAppWebView` 已支援 `initialUserScripts` | 把 guide-overlay.js 接進去 |

### 各階段

| 階段 | 內容 | 狀態 | 阻塞點 |
|---|---|---|---|
| 賽前 1 | 路線 B：手機上的 llama-server 吐出 logprob | ⬜ 未開始 | 手機、llama.cpp 編譯 |
| 賽前 2 | APK 加入 stt / lang_id / translate | ⬜ 未開始 | – |
| 賽前 3 | 目錄、測試集、外語 copy（4090 產生） | ⬜ 未開始 | 4090 連線 |
| 賽前 4 | 中文實測 Intern-Decision，決定要不要 LoRA | ⬜ 未開始 | 測試集 |
| P1 | 按鈕 → 決策器 → GO / ASK / NONE | ⬜ 未開始 | 測試集 |
| P2 | 繳水費導覽與長輩模式 | ⬜ 未開始 | – |
| 加分 | 外語、卡關偵測、第 2 條流程 | ⬜ 未開始 | P1、P2 |

---

## 13. 待確認
- [ ] Demo 手機的型號與 RAM（決定路線 B 能跑 0.6B 還是 1.7B）
- [ ] 比賽是否允許賽前準備
- [ ] 團隊人數
- [ ] 4090 server 的連線方式（賽前用 SSH 即可；Demo 不依賴它）

---

## 14. 實作紀錄（2026-11-07，Claude 實作）

程式都在這個資料夾，怎麼跑看 `assistant/README.md`。

### 已完成
- **P1**：`assistant/`（Vite + Vue3 + TS）：浮動大按鈕、語音/打字/捷徑、GO / ASK / NONE 三種 UI、按「不是」歸零重判（最多 2 輪）、長輩/一般模式（1.5 倍字、自動朗讀）、外語流程（lang_id → 翻成中文 → 決策器，畫面切成該語言的 copy.json；zh/en/vi/id/th 模板都寫好了）。
- **決策器**：一個 `Decider` 介面、四種引擎（llm / cls / tiny / embed），決策規則與門檻共用，`/eval` 頁與 `eval/eval.ts` CLI 自動產生測試矩陣（`eval/MATRIX.md`）。
- **P2**：`guide-overlay.js` 注入到每個服務頁（本機用 `scripts/serve-local.mjs`、Docker 用 nginx `sub_filter`、App 內用 `initialUserScripts`），變暗 + 發亮 + 一句話說明；定位用 text / label / role / css；三種完成方式（自己操作、說出內容 → 規則抽取、說出指令 → 規則 → 決策器）；長輩模式付款前多確認；卡關 45 秒提示；繳水費與臨櫃叫號兩份腳本。
- **TownPass**：`stt` / `lang_id` / `translate` / `translate_prepare` / `tts` 五個 bridge、「小幫手」服務入口、overlay 注入、RECORD_AUDIO 與 RecognitionService 宣告。`flutter analyze` 通過（只剩原本就有的警告）。還沒在真機跑過。
- **部署**：`deploy/`（nginx + llama-server 的 docker compose、`deploy.ps1` 推到 CPU server 的 `~/tmp/tmp`）。**沒有推**，等指示。

### 和原 spec 不同的決定
1. **不用中國模型**（Qwen、Intern-Decision、bge、hfl 全部排除）。LLM 層改用 Google **Gemma 3**；編碼器用 Microsoft 的 multilingual-e5-small（底座是 Multilingual-MiniLM）。
2. **零樣本的小 LLM 不能用**：Gemma 3 270M / 1B 在 25 選 1 的字母題上接近亂猜（首輪命中 0～6%），因此 LLM 層改走「微調 Gemma 3 270M 成 1-token 決策器」（`tools/llm/finetune_gemma.py`），這也是 Google 對 270M 的建議用法。
3. **加了兩個更小的引擎**：`tiny`（自製 fastText 式字元 n-gram，2MB、<1ms）與 `cls`（e5-small 微調分類頭 + 裁詞表，約 25MB）。零樣本向量 `embed` 保留當「不用訓練、改目錄就生效」的保底。
4. **導覽起點直接進水費頁**：原服務「其他」頁的分類展開在 build 後壞掉（`grid-rows-[0fr]` 蓋過 `[1fr]`），依「不改服務」原則不修，改讓引導層自動跳到符合網址的步驟。
5. 小幫手入口頁是獨立專案放在 `/assistant/`，服務頁零改動。

### 工具層與結果（2026-11-07 下午）
- 加了 MCP 式的 **registry**（`assistant/public/data/registry.json`，由服務本體自動產生）：30 個工具（25 個服務 + 字放大 / 一般模式 / 念出來 / 掃描帳單 / 看全部服務）、291 個查表索引詞、參數定義（水號 10 碼）。使用者講到具體項目名稱就直接命中（例：「復康巴士的問題要跟誰說」→ 陳情 98.8%），講到參數就預填進導覽並請使用者確認。
- 從服務本體挖了 646 句訓練句（`tools/tinycls/mine_mock.py`），加上手寫 380 句與目錄例句。
- 測試矩陣（`eval/MATRIX.md`）：**cls（e5-small 微調，27.5MB）首輪 93.8%、兩輪 97.9%、範圍外 80%**；tiny（2MB）87.6% / 89.7% / 90%；e5 零樣本 88.7% / 99.0% / 80%；Gemma 3 270M / 1B 零樣本 0～6%（不能用）；**Gemma 3 270M LoRA 微調後 90.7% / 96.9% / 80%（top-1 94.4%，GGUF Q8_0 292MB，筆電 GPU 37 ms）**，這就是「手機 LLM 只算 1 個 token」的版本，待手機實測。
- 路線 B 補充：官方 release 已有 `llama-b12180-bin-android-arm64.tar.gz` 預編好的 Android 二進位，搭配 `tools/llm/out/gemma-3-270m-decider-Q8_0.gguf` 就能在手機上跑同一套 API。

### 第二輪（2026-11-07 下午，真機回饋後）
- **引導層重做**：圖示面板、主鍵「幫我按／幫我選」真的代按（付款送出先問）、面板內輸入框同步填進頁面、狀態感知跳過已完成步驟、亮框逐幀追蹤且不鎖空、提示視窗蓋住先引導關掉、面板不蓋目標、鍵盤彈出處理、離開流程自動收掉、返回鍵回網頁上一頁、迷路偵測「不要再亂點亂滑了，因為我來了」登場畫面。
- **三層「該點什麼」**：腳本 → `sitemap.json`（`tools/crawl/crawler.js` 把 32 頁爬成圖，BFS 找路）→ 版面感知（即時抓元素打分；`tools/llm/gen_ui_data.py` 產生 965 筆訓練資料一次練進 270M）。
- **13 個原本空的服務**全部有 demo 頁與完整假資料（用水服務、疫苗預約、聯醫掛號、親子館、網路投票、意見調查、里辦服務、台北電台、簡單森呼吸、寵物安心遛、民生物資、愛遊動物園、1999），目錄 38 個工具、32 份導覽腳本；Flutter 服務入口全部指到這些頁。
- **語音**：0.9～1.4 秒無新字即結束、即時字幕、數字欄位只抓數字、主畫面中／English 切換；英文訓練句加入後 cls top-1 98.1%（加入 13 個新服務後 95.3%）。
- **除錯**：主畫面標題連點三下 → `#/debug`（引擎、LLM 吞吐、裝置、狀態、log）；導覽「第 n 步」連點三下 → 狀態框。
- **App 只注入載入器**，每次從伺服器抓最新 `guide-overlay.js`；地圖改 OpenStreetMap。

### 第三輪（2026-11-07 傍晚：三件嚴肅的事 + 分齡）
- **鍵盤彈出無限閃動**：`visualViewport` 改成去抖動的遲滯判斷（比例 <0.7 才算開、>0.85 才算關），打字中凍結面板上下切換、padding 與捲動；每一步有 `stepToken`，延遲觸發的監聽器拿到舊 token 就作廢（不會前進兩次）。
- **獨占面板模式**：導覽中頁面罩一層 `.shield`，除了「自己操作」的步驟外都不能直接點頁面；打字、選項、「幫我按」全部在面板上做，點到頁面會提示「請用面板操作」。
- **離線**：`scripts/bundle-web.mjs` 把 `TownPass-Services/dist` + `assistant/dist`（63MB，不含零樣本 e5 模型）打進 APK 的 `assets/web/`，`OfflineWebService` 用 `shouldInterceptRequest` 把 `http://townpass.local/*` 全部從 APK 回檔（SPA 路由回 `index.html`）；`DEV_SERVICE_URL` 預設改成 `http://townpass.local/`，LLM 走手機本地 `localhost:8080`（Hexagon NPU）。飛航模式下首頁、服務頁、導覽、決策全部可用；只有語音辨識要先下載離線語言包，恢復網路後 bridge 功能自動回來。
- **分齡介面**：第一次打開問「你是哪一種？」→ 🧒 小朋友／學生、🙂 一般、👓 長輩；之後在 ⚙ 改。文案依模式覆蓋（`key_kid` / `key_elder`，五種語言都有），小朋友版用簡單口語、每步唸出來、**付款前要「找大人一起看過」**；長輩版字大 1.35 倍但版面重排（麥克風改整排膠囊、捷徑兩欄等寬、標題縮小），不再爆版。
- **隱藏儀表板**：標題連點三下**或長按 1.2 秒** → `#/debug`，即時曲線（決策耗時、LLM 吞吐、llama-server RTT、FPS）+ 指標磚 + log。
- 修了一個藏很久的 bug：迷路偵測的門檻 `const` 宣告在 `boot()` 之後，模組載入時 TDZ 例外會把整個引導層的啟動吃掉（只在某些載入順序下發作）。

### 第三輪補充（2026-11-07 晚：真機再驗後）
- **真機上引導層其實一直沒載入**：App 注入的 user script 把備援 overlay 原始碼塞進字串卻沒跳脫換行 → 整段 SyntaxError，連載入器都沒跑。改用 `jsonEncode`。另外修掉迷路門檻 `const` 的 TDZ。
- **Flutter 端**：所有還指到 `taipei-pass-service.vercel.app` 的入口（找地點、帳務、訂閱、警政、優惠…共 26 處）全部改成 `kDevServiceUrl`（= APK 內建的 `townpass.local`），所以「找地點」真的是 OpenStreetMap 了、離線也能開；WebView 包 `SafeArea`（Android 15 edge-to-edge 之前把表單最底下的按鈕畫到系統導覽列下面）；`onRenderProcessGone` 改成重載而不是讓整個 App 被殺；改出 **release** APK（184MB，debug 版 318MB、記憶體 1.1GB）。
- **迷路偵測**用 pointer 事件數「點」（Leaflet 地圖會吃掉 touch 的 click），門檻：3 個不同頁 / 60 秒、8 次點擊 / 15 秒、4 次來回滑 / 12 秒；登場後 2 分鐘冷卻。
- **使用者看得到的畫面不放 dev 資訊**：⚙ 只有語言與模式；引擎、LLM URL、機率、build 版本全部搬到隱藏儀表板（標題連點三下或長按 1.2 秒）。
- 「幫我按「」」空標籤：步驟的 `{{entity}}` 沒值時改用目標元素的文字。
- 還查不到今天閃退的紀錄（`dumpsys activity exit-info` 只有安裝與「一次性權限被收回」的 kill）：麥克風權限若選「僅限這次」，App 退到背景後會被系統砍掉，請選「使用 App 時允許」。

### 第四輪（2026-11-07 晚：陪伴模式重做、入口全部修通）
- **陪伴 = 框住真正的欄位，讓使用者自己操作 App**：拿掉罩住頁面的 shield 與面板內的輸入框；面板只說明這一步該做什麼（輸入步驟留「🎤 用說的」與「填好了，下一步」，長輩／小朋友多一顆備援的「幫我按」）。
- **該陪的時候陪、不需要就躲起來**：使用者連續兩步自己完成 → 面板收成右下角「👋 需要我再點我」小圓鈕，亮框與變暗都收掉，只默默看進度；卡住 45 秒或點圓鈕就回來。隨時可按 ✕「我自己來」結束；做到最後一步顯示「完成了」後關閉；離開流程範圍自動收掉。
- **小幫手是獨立微服務，不躲在別的服務裡**：不再於每個服務頁自動問「要我陪你做嗎」。陪伴只從小幫手（GO → 帶 hash 進頁面）或登場畫面進來。
- **登場只有一種觸發**：6 秒內連點 5 下（換頁、來回滑都不算）。已從小幫手進來的頁面（sessionStorage 旗標）、導覽進行中、小幫手主頁都不會登場；登場後 2 分鐘冷卻。
- **離線語音**：網頁端離線時叫 App 用手機內建的離線辨識（`onDevice`）；失敗時提示先到「設定 → Google → 語音 → 離線語音辨識」下載「中文（台灣）」。
- **原 App 點不進去的 24 個入口全部修通**（市政服務、防疫醫療、市政APP、城市生活、施工資訊、市政新聞、發票、收據、帳單設定、新增綁定、歷程與授權、訂閱、通知／快速登入開關、登出、語言、停用帳號、意見回饋送出、訊息清除／全部已讀…），需要頁面的用 `tools/gen_static_pages.py` 產生的內建示範頁（news / construction / apps / city-life / invoice / receipt / bill-settings / dashboard / faq / privacy），外連 dashboard.gov.taipei 與 id.taipei 也改成內建頁，離線都能開。Flutter 本身沒有任何網路 API；只剩首頁橫幅／活動的遠端圖片離線時顯示不出來。

### 還沒做 / 待驗證
- 真機：bridge、離線語音、ML Kit 模型下載、路線 B（官方 release 有 `llama-<tag>-bin-android-arm64.tar.gz` 預編好的 Android 二進位，不用自己 NDK 編譯）。
- 第二批訓練句（`tools/tinycls/gen_examples.py` 在 GPU 上用大模型擴增）、英文句子的訓練資料偏少。
- 4090 的 L 級評測、Breeze / TAIDE 對照組。
