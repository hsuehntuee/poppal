#!/usr/bin/env node
/**
 * 把手機 NPU 版 llama-server 與它需要的 .so 複製進 APK 的 jniLibs（arm64-v8a），
 * 讓 App 自己啟動 llama-server（不再靠 adb；拔線、鎖屏都不會死）。
 * 執行檔改名成 libllama-server-bin.so 才會被打包並解壓到 nativeLibraryDir（可執行）。
 *
 *   node scripts/prepare-llama-jni.mjs
 * 來源：tools/llama-android/snapdragon/llama-b12180/（llama.cpp release 的 android-arm64-snapdragon 包）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'tools', 'llama-android', 'snapdragon', 'llama-b12180');
const dst = path.join(root, 'TownPass', 'android', 'app', 'src', 'main', 'jniLibs', 'arm64-v8a');
if (!fs.existsSync(src)) throw new Error('missing ' + src);
fs.mkdirSync(dst, { recursive: true });

// server 需要的（不要 opencl / rpc / bench / cli / quantize 等）
// llama-server 的 NEEDED（llvm-readelf -d）：rpc / opencl 也被連結進去，少一個就 CANNOT LINK EXECUTABLE
const libs = ['libggml-rpc.so', 'libggml-opencl.so', 'libggml-base.so', 'libggml-cpu.so', 'libggml-hexagon.so', 'libggml-htp-v73.so', 'libggml-htp-v75.so', 'libggml-htp-v79.so', 'libggml-htp-v81.so', 'libggml-htp-v85.so', 'libggml.so', 'libllama-common.so', 'libllama-server-impl.so', 'libllama.so', 'libmtmd.so'];
let total = 0;
for (const name of libs) {
  const f = path.join(src, 'lib', name);
  if (!fs.existsSync(f)) {
    console.warn('skip (not found):', name);
    continue;
  }
  fs.copyFileSync(f, path.join(dst, name));
  total += fs.statSync(f).size;
}
// libOpenCL.so 替身（tools/llama-android/stub）：App 程序看不到 vendor 的 libOpenCL.so，沒有它整個執行檔連結不起來
fs.copyFileSync(path.join(root, 'tools', 'llama-android', 'stub', 'libOpenCL.so'), path.join(dst, 'libOpenCL.so'));
// JNI 殼：在 App 程序裡呼叫 llama_server()（NPU 要在 App 程序裡才看得到 vendor 的 FastRPC）
fs.copyFileSync(path.join(root, 'tools', 'llama-android', 'stub', 'libpolaris_server.so'), path.join(dst, 'libpolaris_server.so'));
const exe = path.join(src, 'bin', 'llama-server');
fs.copyFileSync(exe, path.join(dst, 'libllama-server-bin.so'));
total += fs.statSync(exe).size;
console.log(`jniLibs ready: ${dst} (${(total / 1e6).toFixed(0)} MB)`);

// 模型也進 APK（assets/models），App 第一次啟動會串流複製到私有目錄再啟動 llama-server
const modelSrc = path.join(root, 'tools', 'llm', 'out', 'gemma-3-270m-decider-Q8_0.gguf');
const modelDir = path.join(root, 'TownPass', 'assets', 'models');
fs.mkdirSync(modelDir, { recursive: true });
const modelDst = path.join(modelDir, path.basename(modelSrc));
// 一律重新複製：LoRA 重訓後檔案大小不變，只比大小曾經讓舊模型出貨
fs.copyFileSync(modelSrc, modelDst);
console.log(`model ready: ${modelDst} (${(fs.statSync(modelDst).size / 1e6).toFixed(0)} MB)`);
