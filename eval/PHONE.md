# On-phone numbers (Galaxy S26 Ultra, 2026-11-08)

Same 1,052-utterance set as `MATRIX_1K.md`, decider served by the llama-server running **inside the TownPass APK** on the Hexagon NPU (`llm-fuse-phone` row), measured over `adb forward` from the laptop (adds ~30 ms per request).

| run | where | first-round | two-round | out-of-scope | p50 | p90 | max |
|---|---|---|---|---|---|---|---|
| llm-fuse-phone | S26 NPU, in-app | 93.9% | 97.6% | 99.2% | 65 ms | 72 ms | 174 ms |
| llm-fuse-after | laptop RTX GPU | 93.6% | 97.6% | 99.2% | 40 ms | | |
| cls-fuse-r3 | e5 classifier, WebView ONNX | 95.0% | 96.9% | 90.6% | 6 ms | | |

Phone and laptop agree on every item class (the 0.3 pt difference is 3 items at the ASK threshold).

## NPU vs CPU on the same phone, same model, same server build

`scratchpad/coldbench.py`: 1-token decision, prompt ≈ 610 tokens, 6 runs each, p50.

| | cold prompt (prefix not cached: new page / new option list) | cached prefix (service decision, 1 new token) |
|---|---|---|
| Hexagon NPU (in-app) | **94 ms** | 16 ms |
| CPU, 6 threads (`--device none`) | 318 ms | 11 ms |

- Service-picking prompts share one fixed prefix, so after the first call both paths are a few ms and the latency is dominated by HTTP + WebView. The NPU wins on the prompts that change per page (companion "which button" picks, step-context commands): 3.4x faster and the CPU cores stay free for speech recognition, TTS and the WebView.
- The earlier "CPU 7.4 s" figure came from the in-app CPU fallback with default threads under load; it is not reproducible with a 6-thread CPU server and is withdrawn.
- Memory: the Q8 GGUF is 292 MB on disk; the in-app server holds it plus a 2048-token context.
