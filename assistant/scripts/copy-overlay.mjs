// 把打包好的 guide-overlay.js 複製到 TownPass 的 assets，讓 App 用 initialUserScripts 注入
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'dist', 'guide-overlay.js');
const dest = path.join(root, '..', 'TownPass', 'assets', 'js', 'guide-overlay.js');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('copied guide-overlay.js →', dest, (fs.statSync(dest).size / 1024).toFixed(0), 'KB');
