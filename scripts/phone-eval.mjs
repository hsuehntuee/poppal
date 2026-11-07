// 在手機的 WebView 裡跑一段 JS（透過 chrome devtools protocol）：
//   adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
//   node scripts/phone-eval.mjs '<url 子字串>' '<js 運算式>'
// 回傳值以 JSON 印出。開發用，需要 APK 有開 setWebContentsDebuggingEnabled。
import http from 'node:http';

import fs from 'node:fs';
const [, , urlPart = '', exprArg = 'location.href'] = process.argv;
// 運算式太長或含引號時可以用 @檔名
const expr = exprArg.startsWith('@') ? fs.readFileSync(exprArg.slice(1), 'utf8') : exprArg;

function getJson(u) {
  return new Promise((resolve, reject) => {
    http.get(u, (r) => {
      let s = '';
      r.on('data', (c) => (s += c));
      r.on('end', () => resolve(JSON.parse(s)));
    }).on('error', reject);
  });
}

const pages = await getJson('http://127.0.0.1:9222/json');
// 優惠分頁（/coupon/）常駐在背景，不是正在操作的頁 → 有別的符合就不要選它
const cands = pages.filter((p) => p.type === 'page' && p.url.includes(urlPart));
const page = cands.find((p) => !p.url.includes('/coupon/')) ?? cands[0] ?? pages.find((p) => p.type === 'page');
if (!page) {
  console.error('no page; targets =', pages.map((p) => p.url));
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
});
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id !== 1) return;
  if (m.result?.exceptionDetails) console.log('EXC', JSON.stringify(m.result.exceptionDetails.exception?.description ?? m.result.exceptionDetails, null, 0));
  else console.log(JSON.stringify(m.result?.result?.value ?? m.result, null, 1));
  ws.close();
  process.exit(0);
});
ws.addEventListener('error', (e) => {
  console.error('ws error', e.message);
  process.exit(1);
});
setTimeout(() => {
  console.error('timeout');
  process.exit(1);
}, 20000);
