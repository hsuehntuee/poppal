# 網站版城市通（TownPass-Services dist）遞迴稽核 2026-11-07

方法：在瀏覽器用 iframe 從 `/` 開始 BFS，跟著所有同源 `<a href>`，每頁等 1.5 秒後記錄文字量、按鈕數、console 錯誤、壞圖；dev server 對缺檔回真 404 並記錄。

- 走訪 174 頁（含所有 `:id` 內頁），0 個缺檔（mock JSON / 圖片全部存在），0 個 JS 例外。
- 直接開啟時幾乎空白的頁（都是「子頁只讀 Pinia store、store 只有父頁會填」）：
  `/citizen-report/list`、`/coupon/list`、`/coupon/coupon-detail/{c-1,c-2,c-3,t-1,t-3}`、`/coupon/ticket-detail/{t-1,t-2}`、`/ticket-wallet/exchange/{t-1,t-3}`、`/disaster-report/form/D-4-2`；
  `/fee-payment/detail/tax-1` 會被導到 `/fee-payment/scan`；`/fee-payment` 本身沒有頁面（已加 redirect → others）。
  → 修法：store 加 `ensureLoaded()`，子頁自己載 mock。
- 本來就只有輸入框的頁：`/citizen-report/search`、`/fee-payment/search`、`/fee-payment/scan`（相機）。
- 其餘 150 多頁內容正常；手風琴（`grid-rows-[0fr]/[1fr]`）在 build 後可正常展開。
