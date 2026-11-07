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
const libs = ['libggml-base.so', 'libggml-cpu.so', 'libggml-hexagon.so', 'libggml-htp-v73.so', 'libggml-htp-v75.so', 'libggml-htp-v79.so', 'libggml-htp-v81.so', 'libggml-htp-v85.so', 'libggml.so', 'libllama-common.so', 'libllama-server-impl.so', 'libllama.so', 'libmtmd.so'];
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
const exe = path.join(src, 'bin', 'llama-server');
fs.copyFileSync(exe, path.join(dst, 'libllama-server-bin.so'));
total += fs.statSync(exe).size;
console.log(`jniLibs ready: ${dst} (${(total / 1e6).toFixed(0)} MB)`);
