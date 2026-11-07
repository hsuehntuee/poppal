#!/usr/bin/env node
/**
 * 離線打包：把 TownPass-Services/dist 與 assistant/dist 複製進 TownPass/assets/web/，
 * 並重寫 pubspec.yaml 的 assets 清單（Flutter 不會遞迴目錄，每個子目錄都要列）。
 * 排除太大的零樣本向量模型（Xenova/、embeddings.json）與訓練 checkpoint；cls（27MB）、tiny、wasm 保留。
 * App 端用 shouldInterceptRequest 把 http://townpass.local/* 對到這些檔案（SPA 一律回 index.html），
 * 所以飛航模式也能跑完整流程；LLM 走手機本地 llama-server。
 *
 *   node scripts/bundle-web.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'TownPass', 'assets', 'web');
const EXCLUDE = [/[\\/]Xenova[\\/]/, /embeddings\.json$/, /\.ckpt\.pt$/, /crawler\.js$/, /\.map$/];

fs.rmSync(dest, { recursive: true, force: true });
copyDir(path.join(root, 'TownPass-Services', 'dist'), dest);
copyDir(path.join(root, 'assistant', 'dist'), path.join(dest, 'assistant'));

// pubspec：列出 assets/web 底下所有目錄
const dirs = new Set();
walk(dest, (f) => dirs.add(path.relative(path.join(root, 'TownPass'), path.dirname(f)).replace(/\\/g, '/') + '/'));
const pubspec = path.join(root, 'TownPass', 'pubspec.yaml');
let y = fs.readFileSync(pubspec, 'utf8');
y = y.replace(/\n(\s+- assets\/web\/[^\n]*)+/g, '');
const lines = [...dirs].sort().map((d) => `    - ${d}`).join('\n');
y = y.replace(/(\n\s+- assets\/js\/\n)/, `$1${lines}\n`);
fs.writeFileSync(pubspec, y);

let total = 0;
walk(dest, (f) => (total += fs.statSync(f).size));
console.log(`bundled → ${dest}: ${dirs.size} dirs, ${(total / 1e6).toFixed(1)} MB`);

function copyDir(src, dst) {
  if (!fs.existsSync(src)) throw new Error('missing ' + src + ' (先 build)');
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (EXCLUDE.some((re) => re.test(s))) continue;
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else {
      fs.mkdirSync(dst, { recursive: true });
      fs.copyFileSync(s, d);
    }
  }
}
function walk(dir, cb) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, cb);
    else cb(p);
  }
}
