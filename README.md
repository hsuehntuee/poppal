# 台北城市通（TownPass）微服務開發環境

這個資料夾是我們黑客松的工作空間：用 **Android 手機 + USB 傳輸線**，在真機上跑「台北城市通 TownPass」，並開發一個嵌在城市通裡面的**微服務**。

> **TL;DR（環境都裝好之後，每天只要做這些）**
> ```powershell
> # 終端機 1：啟動微服務
> npx --yes vite bridge-tester --host --port 5173
> # 終端機 2：接上手機，啟動 App（可以 hot reload）
> powershell -ExecutionPolicy Bypass -File .\dev-phone.ps1 -Worktree dev
> ```
> 手機上：**服務** 分頁 → **開發中服務**。

---

## 1. 架構：微服務是怎麼接進城市通的

```
┌──────────── Android 手機 ────────────┐          ┌──────── 電腦 ────────┐
│ TownPass App (Flutter)               │   USB    │                      │
│  └─ WebView ── http://localhost:5173 ─┼─ adb ───►│ 微服務 dev server     │
│        ▲  flutterObject.postMessage  │ reverse  │ (vite, port 5173)    │
│        └─ 原生功能：定位/掃碼/通知…   │          │                      │
└──────────────────────────────────────┘          └──────────────────────┘
```

- **微服務 = 一個網頁**。城市通用 WebView 把它開起來。
- 網頁和 App 用 JS bridge 溝通：
  - 網頁送出：`flutterObject.postMessage(JSON.stringify({ name, data }))`
  - App 回覆：`flutterObject.addEventListener('message', e => e.data)`，`e.data` 是一個 JSON 字串
- `adb reverse` 會把手機的 `localhost:5173` 透過傳輸線轉到電腦。**不需要同一個 Wi-Fi，也不需要對外網址。**

### App 已經提供的原生功能（`name`）

| name | data | 回傳 |
|---|---|---|
| `userinfo` | – | 使用者資料 |
| `deviceinfo` | – | 裝置資訊 |
| `location` | – | 目前位置（需要定位權限） |
| `qr_code_scan` | – | 掃碼結果 |
| `notify` | `{title, content}` | 跳出本機通知 |
| `open_link` | `"網址"` | 用 App 開連結 |
| `launch_map` | `"地圖網址"` | 開啟地圖 App |
| `phone_call` | `"電話號碼"` | 撥打電話 |
| `1999agree` | 任意值 | 1999 撥號流程 |

原始碼：`lib/util/web_message_handler/tp_web_message_handler.dart`。
如果要**新增**原生功能：寫一個新的 `TPWebMessageHandler`，再註冊到 `tp_web_message_listener.dart` 的清單裡。

---

## 2. 資料夾內容

```
taipei_codefest/
├─ TownPass/              主 checkout（main 分支）—— 也是 git 本體，worktree 都從這裡長出來
├─ worktrees/
│   └─ dev/               我們的開發 worktree（分支 dev/local-env）← 平常 build / run 用這個
├─ TownPass-Services/     官方微服務範例（Vue 3 + Vite + Tailwind）
├─ bridge-tester/         bridge 測試頁：每個按鈕呼叫一個原生功能
├─ tools/env.ps1          共用環境設定（Flutter 3.47.6、JDK、adb 路徑）
├─ new-worktree.ps1       建立新的 worktree，並裝好依賴
├─ dev-phone.ps1          接手機開發：adb reverse + flutter run（可以 hot reload）
└─ build-apk.ps1          編譯 APK（debug / release），可以直接裝到手機
```

### `worktrees/dev` 對 TownPass 做的修改（只有開發用途，分支 `dev/local-env`）

1. `lib/page/city_service/model/my_service_model.dart`：新增一個服務入口「**開發中服務**」，放在「其他服務」分類。
   - 網址預設是 `http://localhost:5173/`，可以用 `--dart-define=DEV_SERVICE_URL=...` 改掉（腳本會自動帶入）。
2. `lib/page/city_service/widget/pinned_service_widget_controller.dart`：把它放在預設常用服務的第一個。
3. `android/app/src/debug/AndroidManifest.xml`：**只有 debug 版**允許 http（cleartext），WebView 才能連 dev server。release 版不受影響。

> 這些修改目前還**沒有 commit**，只存在 `worktrees/dev` 的工作目錄裡。

---

## 3. 為什麼用 git worktree

同一個資料夾**同時只能有一個人或一個 session 在 build**。兩個 `flutter pub get` / `flutter build` 同時改 `.dart_tool/`、`pubspec.lock`、`build/` 就會互相卡住。我們實際遇過這個狀況。

git worktree 讓同一個 repo 有**多個獨立的工作資料夾**，每個資料夾對應一個分支：
- 共用同一份 git 歷史，commit 在任何一個 worktree 都看得到。
- 各自有自己的 `build/`、`.dart_tool/`、產生的 `*.g.dart`，build 不會互相打架。
- Gradle 和 pub 的下載快取是全電腦共用的，所以開新 worktree **不會重新下載**套件。

**規則：一個 session、一個功能，就用一個 worktree。** 主 checkout `TownPass/` 保留給已經在用它的那個 session（目前另一個 session 正在那裡開發語音助理）。

### 建立新的 worktree

```powershell
powershell -ExecutionPolicy Bypass -File .\new-worktree.ps1 -Name voice
```
這個指令會：
1. 從 `main` 開一個新分支 `wt/voice`，資料夾放在 `worktrees\voice\`。
2. 執行 `flutter pub get`。
3. 執行 `build_runner`，產生 `*.g.dart` 和 `lib/gen/assets.gen.dart`。這些檔案被 gitignore 了，**每個新的 worktree 都要產生一次**。

其他用法：
```powershell
.\new-worktree.ps1 -Name demo -Base dev/local-env               # 從我們的開發分支開
.\new-worktree.ps1 -Name x -Branch some/branch -Existing        # 掛上一個已經存在的分支
.\new-worktree.ps1 -Name dev                                    # 資料夾已存在：只重裝依賴
```

### 管理 worktree
```powershell
git -C TownPass worktree list                      # 列出所有 worktree
git -C TownPass worktree remove worktrees\voice    # 刪掉一個（有未 commit 的修改時會拒絕）
```
> 不要直接刪 `worktrees\xxx` 資料夾，請用 `worktree remove`，git 才會清掉紀錄。

---

## 4. 已安裝的環境

| 項目 | 版本 / 位置 | 備註 |
|---|---|---|
| Flutter | **3.47.6**，在 `%USERPROFILE%\fvm\versions\3.47.6` | 依照專案的 `.fvmrc`。腳本會直接用這一版。全域的 `C:\flutter\flutter` 仍是 **3.24.1，不要用它跑這個專案** |
| FVM | 3.2.1（`dart pub global`） | `fvm install <版本>` 可以裝其他 Flutter 版本 |
| JDK | Microsoft OpenJDK 17.0.21 | 已設定 `JAVA_HOME`（使用者層級） |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` | 授權都已接受，NDK 29、CMake 3.22 都已安裝；沒有 Android Studio，也不需要（模擬器已刪除，只用真機） |
| Gradle | 9.3.1（wrapper），AGP 9.1 | `~/.gradle/gradle.properties` 已開啟快取和平行編譯 |
| Node / pnpm | Node 20.17、pnpm 9.9 | `TownPass-Services` 已經 `pnpm install` 完成 |
| Windows Defender | 已排除 `taipei_codefest`、`~/.gradle`、Pub Cache | 讓 build 快很多 |

> 所有腳本都會 dot-source `tools\env.ps1`，自己設定好 Flutter、JDK 和 adb，**不依賴終端機原本的 PATH**。
> 想手動下指令的話，在終端機先執行 `. .\tools\env.ps1`，之後就能用 `& $FlutterBat ...` 和 `& $Adb ...`。

---

## 5. 第一次接上手機（只要做一次）

### 手機端（Samsung 範例）
1. **設定 → 關於手機 → 軟體資訊**，連點「**版本號碼**」7 下，開啟開發人員選項。
2. **設定 → 開發人員選項**，打開「**USB 偵錯**」。
3. 如果有「**自動封鎖程式（Auto Blocker）**」（設定 → 安全性與隱私權），請**關閉**，否則會擋住 USB 指令和安裝 App。
4. 接上傳輸線，手機會跳出「允許 USB 偵錯嗎？」，勾選「一律允許這部電腦」→ **允許**。
5. USB 模式選「**傳輸檔案**」。

### 電腦端確認
```powershell
. .\tools\env.ps1; & $Adb devices -l
```
- 看到 `R5GL74AN6QJ  device ... model:SM_S9480` 這類資訊就是成功（這是我們目前用的 Galaxy）。
- 顯示 `unauthorized`：手機上還沒按「允許」，拔掉重插再看手機畫面。
- 什麼都沒有：換一條**能傳資料**的線、換 USB 孔；檢查 USB 偵錯和 Auto Blocker 的設定。

---

## 6. 編譯方式

> 下面的指令都在 `taipei_codefest` 資料夾執行。如果 PowerShell 擋住腳本執行，就在前面加上 `powershell -ExecutionPolicy Bypass -File`（下面的範例都已經加了）。

### A. 開發用：`dev-phone.ps1`（flutter run，可以 hot reload）
```powershell
powershell -ExecutionPolicy Bypass -File .\dev-phone.ps1 -Worktree dev
```
會自動：偵測手機 → `adb reverse tcp:5173` → 用 debug 模式編譯 → 安裝 → 啟動 → 保持連線讓你 hot reload。

| 參數 | 說明 |
|---|---|
| `-Worktree dev` | 要跑哪一個 worktree。不加就跑主 checkout `TownPass\` |
| `-Port 3000` | 微服務不是跑在 5173 時使用 |
| `-Url https://...` | 改用外網網址（不會做 adb reverse） |

### B. 打包 APK：`build-apk.ps1`
```powershell
# debug 版，編好直接裝到手機並啟動（裝完就可以拔掉電腦，只是連不到 localhost 的微服務）
powershell -ExecutionPolicy Bypass -File .\build-apk.ps1 -Worktree dev -Install

# release 版（demo 用）：微服務網址一定要是 https
powershell -ExecutionPolicy Bypass -File .\build-apk.ps1 -Worktree dev -Release -Url https://你的網址/ -Install

# 只產生 APK 檔，不安裝（例如要傳給隊友）
powershell -ExecutionPolicy Bypass -File .\build-apk.ps1 -Worktree dev -Release -Url https://你的網址/
```
APK 輸出位置：`worktrees\dev\build\app\outputs\flutter-apk\app-debug.apk`（release 版是 `app-release.apk`）。

> 如果安裝時出現「簽章不同」（`INSTALL_FAILED_UPDATE_INCOMPATIBLE`），代表手機上的 TownPass 是用別的簽章裝的。先在手機上解除安裝 TownPass 再試。

### C. 手動指令（了解腳本在做什麼）
```powershell
. .\tools\env.ps1                     # 設定 Flutter 3.47.6 / JDK / adb
cd worktrees\dev
& $FlutterBat pub get                 # 改了 pubspec.yaml 之後
& $DartBat run build_runner build --delete-conflicting-outputs   # 改了 @JsonSerializable model 或 assets 之後
& $FlutterBat build apk --debug --dart-define=DEV_SERVICE_URL=http://localhost:5173/
& $Adb install -r build\app\outputs\flutter-apk\app-debug.apk
& $Adb reverse tcp:5173 tcp:5173
```

### 編譯時間參考
| 情況 | 大約時間 |
|---|---|
| 第一次（要下載 Gradle、NDK、CMake） | 約 60 分鐘，**已經做完了** |
| 新的 worktree 第一次 build（下載快取已經有了） | 數分鐘 |
| 再次 build（只改一點程式） | 1 分鐘左右 |
| hot reload（`r`） | 約 1 秒 |

---

## 7. 執行方式：每天的開發流程

需要開**兩個終端機**，都在 `taipei_codefest` 資料夾裡。

### 終端機 1：啟動微服務
擇一：
```powershell
npx --yes vite bridge-tester --host --port 5173          # bridge 測試頁
cd TownPass-Services; pnpm dev --host --port 5173        # 官方範例
```
做我們自己的微服務時，換成自己的專案，只要跑在 5173 port（或配合 `-Port` 參數）即可。

### 終端機 2：啟動 App
```powershell
powershell -ExecutionPolicy Bypass -File .\dev-phone.ps1 -Worktree dev
```

### 手機上
TownPass → 下方「**服務**」分頁 → 常用服務的第一個「**開發中服務**」→ 打開你的 dev server。
（如果被移出常用，可以從「編輯」頁的「**其他服務**」分類找回來。）

用 `bridge-tester` 時，頁面上方會顯示「**● flutterObject 已連線**」，按任一個按鈕，Log 就會出現 `→ 送出` 和 `← App 回覆`。

### 改程式之後怎麼看結果

| 你改了什麼 | 要做什麼 | 時間 |
|---|---|---|
| 微服務（網頁 HTML/JS/Vue/CSS） | 什麼都不用做。Vite 會自動更新；沒更新的話，關掉服務頁再點開一次 | 立即 |
| TownPass 的 Dart 程式 | 在終端機 2 按 **`r`**（hot reload） | 約 1 秒 |
| Dart 狀態亂掉、改了 `main()` 或初始化流程 | 在終端機 2 按 **`R`**（hot restart） | 數秒 |
| `pubspec.yaml`（新增套件）、`android/`、manifest | 按 `q` 離開，再執行一次 `dev-phone.ps1` | 數分鐘 |
| `@JsonSerializable` model、assets | 先跑 build_runner（見 6-C），再按 `R` | 數十秒 |

### 除錯
- **看微服務的 console / DOM**：手機接著電腦時，在電腦的 Chrome 開 `chrome://inspect/#devices`，找到 TownPass 的 WebView → **inspect**，就跟一般網頁 DevTools 一樣。
- **看 App 的 log**：直接看終端機 2 的輸出；或執行 `. .\tools\env.ps1; & $Adb logcat -s flutter`。
- **排版和樣式**：先在電腦瀏覽器開 `http://localhost:5173`，按 F12 切換手機尺寸就能調。只有原生功能才需要用真機測。
- **截手機畫面**：`& $Adb exec-out screencap -p > screen.png`（手機要先解鎖、亮著螢幕）。

---

## 8. Demo 當天

1. 把微服務**部署到外網**（Vercel / Netlify / GitHub Pages 等 https 網址）。
2. 用 release 版打包並安裝：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\build-apk.ps1 -Worktree dev -Release -Url https://你的網址/ -Install
   ```
3. 裝好之後就可以**拔掉傳輸線**，App 自己能用。
4. 要讓服務直接出現在正式的入口，就在 `my_service_model.dart` 裡改掉「開發中服務」的 title、icon、分類。

> 建議 demo 前一天就用 release 版完整走一次，並保留一份能用的 APK 當備份。

---

## 9. iPhone 可以用傳輸線測嗎？

**這台 Windows 電腦不行。** 要把 Flutter App 編譯並安裝到 iPhone，一定需要 macOS + Xcode（包含程式簽章），Windows 沒有替代方案。

可行的替代方式：
1. **借或租一台 Mac**（MacinCloud 這類雲端 Mac 也可以）：在 Mac 上 clone、執行 `flutter run`，iPhone 接 Mac 就能測。用免費 Apple ID 簽章的 App 7 天後會失效。
2. **只測網頁部分**：iPhone Safari 直接開微服務的外網網址，可以看排版和流程，但**沒有** `flutterObject`，也就沒有原生功能。
3. **Demo 一律用 Android 手機**，這是這台電腦目前完整支援的環境。

---

## 10. 常見問題

| 狀況 | 解法 |
|---|---|
| 腳本出現一堆亂碼的 ParserError | 腳本必須存成 **UTF-8 with BOM**（Windows PowerShell 5.1 的限制）。用 VS Code 存檔時，右下角編碼選「UTF-8 with BOM」 |
| 「無法載入，因為這個系統上已停用指令碼執行」 | 改用 `powershell -ExecutionPolicy Bypass -File .\xxx.ps1` |
| build 卡在 `Running Gradle task 'assembleDebug'` 很久沒動 | 是不是有別的 session 在**同一個資料夾**跑 `pub get` 或 build？請改用各自的 worktree（見第 3 節） |
| 「開發中服務」打開是白畫面，或出現 `ERR_CONNECTION_REFUSED` | 終端機 1 的 dev server 有沒有在跑？用 `& $Adb reverse --list` 看有沒有 `tcp:5173` |
| 出現 `ERR_CLEARTEXT_NOT_PERMITTED` | 你跑的是 release 版。開發請用 debug 版；release 版要用 https 網址 |
| `flutter` 版本不對、Dart SDK 版本錯誤 | 用到全域的 3.24.1 了。請用腳本，或先執行 `. .\tools\env.ps1` |
| 新的 worktree 編譯時出現 `assets.gen.dart` 或 `*.g.dart` 找不到 | 還沒跑 build_runner，執行 `.\new-worktree.ps1 -Name <名稱>` 重新安裝依賴 |
| 拔掉手機重插之後連不上 dev server | `adb reverse` 會失效，重新執行 `dev-phone.ps1`，或手動執行 `& $Adb reverse tcp:5173 tcp:5173` |
| 定位沒有回傳 | 手機要開 GPS，並在 TownPass 的權限設定裡允許定位 |

---

參考：[TownPass 官方開發文件](https://tpe-guideline.web.app/en/docs/) · [flutter_inappwebview JS 溝通](https://inappwebview.dev/docs/webview/javascript/communication#web-message-listeners)

---

## 11. PopPal 泡泡夥伴：從零重建整個專案（2026-11-07）

repo：<https://github.com/hsuehntuee/poppal>（權重走 Git LFS，先 `git lfs install`）。沒進 git 的東西都能重建或重下：

| 需要 | 來源 |
|---|---|
| Node 20 + pnpm、Python 3.11、Flutter 3.47（fvm）、JDK 17、Android SDK platform-tools | 自行安裝 |
| `tools/llama/`（Windows CUDA llama-server，筆電開發用） | llama.cpp release b12180 Windows 版，解壓到此 |
| `tools/llama-android/snapdragon/llama-b12180/`（手機 NPU 用） | llama.cpp release `llama-b12180-bin-android-arm64-snapdragon.tar.gz` |
| `assistant/public/models/Xenova/`（零樣本向量備援，可不裝） | HuggingFace `Xenova/multilingual-e5-small` |
| 訓練 checkpoint / HF 合併權重 | 重新訓練：`tools/encoder/train_cls.py`、`tools/llm/finetune_gemma.py`（GPU） |

重建步驟（都在 repo 根目錄）：

```powershell
# 1. 網頁兩個專案
cd TownPass-Services; pnpm install; pnpm build-only; cd ..
cd assistant; pnpm install; pnpm build-only; cd ..
# 2.（改了服務或導覽才需要）資料表 → registry → 訓練句 → 示範頁 → 找地點資料
python -I tools/tinycls/mine_mock.py
python -I tools/registry/build_registry.py
python -I tools/gen_static_pages.py
python -I tools/gen_find_place.py
# 3. 把網頁與手機版 llama-server 打進 APK，編 release
node scripts/bundle-web.mjs
node scripts/prepare-llama-jni.mjs     # llama-server 執行檔 + .so → android/app/src/main/jniLibs（App 自己啟動，不靠 adb）
cd TownPass; .\.fvm\flutter_sdk\bin\flutter.bat build apk --release --dart-define=LLM_URL=http://localhost:8080 --dart-define=OFFLINE_WEB=true; cd ..
adb install -r TownPass\build\app\outputs\flutter-apk\app-release.apk
# 4. 模型放到 App 的外部檔案夾（一次就好；App 啟動時會自己起 llama-server，NPU 起不來退 CPU，每 20 秒看管）
.\scripts\phone-npu.ps1 -PushModel
# 5. 筆電開發：serve-local（靜態 + 注入引導層 + /llm 轉發）
node scripts/serve-local.mjs --port 5180 --llm http://127.0.0.1:8080
```

評測：`cd assistant; pnpm eval`（`eval/MATRIX.md`）；網站稽核：`eval/AUDIT.md`；實作紀錄：`SPEC.md` §14。
