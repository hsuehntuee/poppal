#!/usr/bin/env node
/**
 * 本機單一 port 伺服器（零相依），給手機（adb reverse 或同一個內網）和電腦用：
 *   /            → TownPass-Services/dist（SPA fallback），並在 </head> 前注入 guide-overlay.js
 *   /assistant/  → assistant/dist（SPA fallback）
 *   /llm/*       → 轉發到 llama-server（預設 http://127.0.0.1:8080）
 *
 * 用法：node scripts/serve-local.mjs [--port 5173] [--llm http://127.0.0.1:8080] [--host 0.0.0.0]
 * 這和 deploy/nginx.conf 做的事一模一樣。
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
const PORT = Number(args.port ?? process.env.PORT ?? 5173);
const HOST = args.host ?? '0.0.0.0';
const LLM = String(args.llm ?? process.env.LLM_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const SERVICES_DIST = path.join(root, 'TownPass-Services', 'dist');
const ASSISTANT_DIST = path.join(root, 'assistant', 'dist');
const INJECT = '<script src="/assistant/guide-overlay.js" defer></script>';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream', '.bin': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json'
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*', ...extra });
  res.end(body);
}

function serveStatic(res, dist, rel, { injectOverlay = false } = {}) {
  let file = path.join(dist, rel);
  if (!file.startsWith(dist)) return send(res, 403, 'forbidden');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory() && fs.existsSync(path.join(file, 'index.html'))) file = path.join(file, 'index.html'); // 靜態示範頁（news/ 等）
  else if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html'); // SPA fallback
  if (!fs.existsSync(file)) return send(res, 404, `not built: ${dist}\n先執行 pnpm build`);
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] ?? 'application/octet-stream';
  if (ext === '.html') {
    let html = fs.readFileSync(file, 'utf8');
    if (injectOverlay && !html.includes('guide-overlay.js')) html = html.replace('</head>', INJECT + '\n</head>');
    return send(res, 200, html, type);
  }
  const cache = /[\\/](assets|models)[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache, 'Access-Control-Allow-Origin': '*' });
  fs.createReadStream(file).pipe(res);
}

function proxy(req, res, target, rel) {
  const url = new URL(target + (rel || '/'));
  const opts = { method: req.method, headers: { ...req.headers, host: url.host } };
  const p = http.request(url, opts, (up) => {
    res.writeHead(up.statusCode ?? 502, { ...up.headers, 'Access-Control-Allow-Origin': '*' });
    up.pipe(res);
  });
  p.on('error', (e) => send(res, 502, `llm proxy error: ${e.message}\nllama-server 有在 ${LLM} 跑嗎？`));
  req.pipe(p);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = decodeURIComponent(u.pathname);
  // 開發用：瀏覽器把爬到的 sitemap 存回 assistant/public/data 與 dist/data（POST /__save?name=sitemap.json）
  if (p === '/__save' && req.method === 'POST') {
    const name = String(u.searchParams.get('name') || '').replace(/[^\w.-]/g, '');
    if (!name.endsWith('.json')) return send(res, 400, 'name must be *.json');
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        JSON.parse(body);
        for (const dir of [path.join(root, 'assistant', 'public', 'data'), path.join(root, 'assistant', 'dist', 'data')]) {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, name), body);
        }
        send(res, 200, 'saved ' + name + ' (' + body.length + ' bytes)');
      } catch (e) {
        send(res, 400, 'bad json: ' + e.message);
      }
    });
    return;
  }
  if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain', { 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
  if (p === '/llm' || p.startsWith('/llm/')) return proxy(req, res, LLM, p.replace(/^\/llm/, '') + u.search);
  if (p === '/assistant' || p.startsWith('/assistant/')) return serveStatic(res, ASSISTANT_DIST, p.replace(/^\/assistant\/?/, ''));
  return serveStatic(res, SERVICES_DIST, p.replace(/^\//, ''), { injectOverlay: true });
});

server.listen(PORT, HOST, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`serve-local: http://localhost:${PORT}/  assistant: http://localhost:${PORT}/assistant/  llm → ${LLM}`);
  for (const ip of ips) console.log(`  手機同內網可用: http://${ip}:${PORT}/assistant/`);
});
