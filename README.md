# Polaris — on-device voice assistant for TownPass (Taipei)

Say one sentence, Polaris picks the right city service and walks you through the real form on the phone. Everything runs on the device: intent decision (Gemma 3 270M fine-tuned into a one-token decider on the Snapdragon NPU, with a fine-tuned e5-small classifier as fallback), the companion overlay, the bundled service web app, speech/translation/TTS via the phone's own engines.

Repo: <https://github.com/hsuehntuee/poppal> (private). Weights are in Git LFS (`git lfs install` first).

## Layout

| Path | What |
|---|---|
| `TownPass/` | Flutter shell (TownPass open-source app). Bundles the web apps (`assets/web`), the llama.cpp server (`jniLibs`) and the model (`assets/models`), and starts the server in-process. |
| `TownPass-Services/` | Vue service web app (13 demo services added, OpenStreetMap, pseudo data). |
| `assistant/` | The assistant web app + the companion overlay injected into every service page. |
| `tools/` | Training (`tinycls`, `encoder`, `llm`), registry/sitemap builders, data generators. |
| `eval/` | Evaluation matrix (`MATRIX.md`) and site audit (`AUDIT.md`). |
| `scripts/` | Build helpers (see below). |
| `SPEC.md` | Spec and implementation log. |

## Rebuild from scratch

Prerequisites: Node 20 + pnpm, Python 3.11, Flutter 3.47 (fvm), JDK 17, Android platform-tools, Android NDK r29.

Not in git (download or regenerate):

- `tools/llama-android/snapdragon/llama-b12180/` — llama.cpp release `llama-b12180-bin-android-arm64-snapdragon.tar.gz`
- `tools/llama/` — llama.cpp Windows release b12180 (laptop dev server only)
- `assistant/public/models/Xenova/` — `Xenova/multilingual-e5-small` (optional zero-shot fallback)
- training checkpoints — rerun `tools/encoder/train_cls.py` / `tools/llm/finetune_gemma.py` (GPU)

```powershell
cd TownPass-Services; pnpm install; pnpm build-only; cd ..
cd assistant; pnpm install; pnpm build-only; cd ..
# only when services or guides changed
python -I tools/tinycls/mine_mock.py
python -I tools/registry/build_registry.py
python -I tools/gen_static_pages.py
python -I tools/gen_find_place.py
# package web + server + model into the APK and build
node scripts/bundle-web.mjs
node scripts/prepare-llama-jni.mjs
cd TownPass; .\.fvm\flutter_sdk\bin\flutter.bat build apk --release --dart-define=LLM_URL=http://localhost:8080 --dart-define=OFFLINE_WEB=true; cd ..
adb install -r TownPass\build\app\outputs\flutter-apk\app-release.apk
```

Iterating on the web apps without rebuilding the APK (the app prefers an override folder on the phone; clear it before a real demo):

```powershell
node scripts/bundle-web.mjs; sh scripts/phone-push-web.sh        # push web + overlay, restart app
sh scripts/phone-push-web.sh --clear                              # back to the bundled build
sh scripts/phone-probe.sh [tap]                                   # companion state on the phone (needs the debug build)
node --experimental-websocket scripts/phone-autowalk.mjs <case> <guide> <url> '{}' 0 [normal|elder|kid]   # auto-walk a guide on the phone, screenshot every action
```

Laptop dev server (static files + overlay injection + `/llm` proxy):

```powershell
node scripts/serve-local.mjs --port 5180 --llm http://127.0.0.1:8080
```

Evaluation: `cd assistant; pnpm eval` → `eval/MATRIX.md`; the 1,027-utterance set (`--testset assistant/public/data/testset_1k.json`) → `eval/MATRIX_1K.md`: first-round hit 94.9% (e5 classifier, 6 ms) / 93.2% (Gemma decider on the phone NPU in-app, 63 ms, `eval/PHONE.md`), out-of-scope detection 90.6% / 99.2%.
