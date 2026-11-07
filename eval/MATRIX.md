# 測試矩陣

產生時間：2026-11-07T08:15:10.058Z

| 模型 / 引擎 | 跑在哪裡 | 首輪命中率 | 2 輪內命中率 | 不在範圍內的辨識率 | 平均追問次數 | 延遲 p50 | 記憶體 |
|---|---|---|---|---|---|---|---|
| cls-e5-ft-nofuse | phone-webview | 93.8% | 96.9% | 80.0% | 0.07 | 7 ms |  |
| cls-e5-ft | phone-webview | 93.8% | 97.9% | 80.0% | 0.07 | 5 ms |  |
| cls-e5-ft-v2 | phone-webview | 97.9% | 99.0% | 100.0% | 0.02 | 6 ms |  |
| e5-small-zeroshot | phone-webview | 88.7% | 99.0% | 80.0% | 0.10 | 5 ms |  |
| gemma-3-1b-it-Q4 | laptop-gpu | 6.2% | 13.4% | 0.0% | 0.79 | 99 ms |  |
| gemma-3-270m-decider-Q8 | S26-NPU-usb | 90.7% | 95.9% | 80.0% | 0.08 | 52 ms |  |
| gemma-3-270m-decider-Q8 | laptop-gpu | 90.7% | 96.9% | 80.0% | 0.09 | 33 ms |  |
| gemma-3-270m-decider-v2-Q8 | S26-NPU-usb | 96.9% | 100.0% | 100.0% | 0.03 | 55 ms |  |
| gemma-3-270m-decider-v2-Q8 | laptop-gpu | 96.9% | 100.0% | 100.0% | 0.03 | 38 ms |  |
| gemma-3-270m-it-Q8 | laptop-gpu | 0.0% | 3.1% | 80.0% | 0.07 | 59 ms |  |
| tiny-ngram | phone-webview | 87.6% | 89.7% | 90.0% | 0.05 | 0 ms |  |
