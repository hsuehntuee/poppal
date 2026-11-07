// 真機自動走一個導覽：每一步讀面板／目標（CDP），依目標種類做對應動作（打字、選第一個選項、勾、點），每一步截圖。
//   node --experimental-websocket scripts/phone-autowalk.mjs <case名> <guide id> <起始網址> [params json] [startStep]
// 需要：adb 連著、APK 有開 WebView 除錯、App 正在某個服務頁（有 WebView）。截圖到 submission/服務畫面/流程/<case名>/。
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const [, , name, guideId, startUrl, paramsJson = '{}', startStep = '0', mode = 'normal'] = process.argv; // mode: normal | elder | kid
const OUT = `submission/服務畫面/流程/${name}`;
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(`${OUT}/${f}`);
process.env.MSYS_NO_PATHCONV = '1';
const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WEBVIEW_TOP = 226;
let shot = 0;
const snap = (tag) => {
  shot++;
  const f = `${OUT}/${String(shot).padStart(2, '0')}_${tag.replace(/[^\w一-鿿]+/g, '_').slice(0, 14)}.png`;
  execSync(`adb exec-out screencap -p > "${f}"`, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
};
const tap = (x, y) => sh(`adb shell input tap ${Math.round(x)} ${Math.round(y)}`);
const type = (t) => sh(`adb shell input text "${t.replace(/ /g, '%s')}"`);
const enter = () => sh('adb shell input keyevent 66');

function getJson(u) {
  return new Promise((resolve, reject) => {
    http.get(u, (r) => { let s = ''; r.on('data', (c) => (s += c)); r.on('end', () => resolve(JSON.parse(s))); }).on('error', reject);
  });
}
async function cdp() {
  const pid = sh('adb shell pidof com.example.townpass').trim();
  sh(`adb forward tcp:9222 localabstract:webview_devtools_remote_${pid}`);
  const pages = await getJson('http://127.0.0.1:9222/json');
  const cands = pages.filter((p) => p.type === 'page' && p.url.includes('townpass.local/'));
  const page = cands.find((p) => !p.url.includes('/coupon/')) ?? cands[0];
  if (!page) throw new Error('no webview page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(String(ev.data)); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  return {
    eval: (expr) => new Promise((resolve) => { const i = ++id; pending.set(i, (m) => resolve(m.result?.result?.value)); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })); }),
    close: () => ws.close()
  };
}

const PROBE = `(() => {
  const host = [...document.querySelectorAll('*')].find(e => e.shadowRoot && e.shadowRoot.querySelector('.panel'));
  const panel = host && host.shadowRoot.querySelector('.panel');
  const g = window.__tpGuide;
  const step = g && g.guide.steps[g.state.step];
  const t = g && g.target;
  const dpr = devicePixelRatio;
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left + r.width / 2) * dpr, y: (r.top + r.height / 2) * dpr + ${WEBVIEW_TOP}, w: r.width, h: r.height }; };
  const pbtns = panel ? [...host.shadowRoot.querySelectorAll('button')].filter(b => b.offsetWidth).map(b => ({ label: b.textContent.trim().replace(/ ›$/, ''), ...rect(b) })) : [];
  let target = null;
  if (t && document.contains(t)) target = { tag: t.tagName, type: t.type || '', ro: !!t.readOnly, value: t.value ?? '', ...rect(t), options: t.tagName === 'SELECT' ? [...t.options].filter(o => o.value !== '').map(o => o.text.trim()) : null, checked: t.querySelector ? !!t.querySelector('input:checked') : false };
  const group = g && g.targets && g.targets.length > 1 ? g.targets.filter(e => document.contains(e)).map(rect) : [];
  return { path: location.pathname, step: g ? g.state.step + 1 : null, total: g ? g.guide.steps.length : null, id: step && step.id, done: step && step.done_when, accept: step && step.accept, optional: !!(step && step.optional), final: !!(step && step.final), panel: panel ? (panel.style.display === 'none' ? '[hidden] ' : '') + panel.textContent.replace(/\\s+/g, ' ').trim().slice(0, 70) : null, pbtns, target, group, aside: !!(g && g.ui && g.ui.aside) };
})()`;

function uiaTap(text) {
  sh('adb shell uiautomator dump /sdcard/ui.xml');
  const xml = sh('adb shell cat /sdcard/ui.xml');
  const m = xml.split('>').find((n) => n.includes(`text="${text}"`));
  const b = m && m.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!b) return false;
  tap((+b[1] + +b[3]) / 2, (+b[2] + +b[4]) / 2);
  return true;
}
function pickerOpen() {
  sh('adb shell uiautomator dump /sdcard/ui.xml');
  return /CheckedTextView|android:id\/button1|text="Set"/.test(sh('adb shell cat /sdcard/ui.xml'));
}

const c = await cdp();
await c.eval(`sessionStorage.setItem('tp_guide', JSON.stringify({id:'${guideId}', step:${startStep}, mode:'${mode}', lang:'zh', params:${paramsJson}})); localStorage.removeItem('tp_debug_log'); location.href = '${startUrl}'; 1`);
await sleep(4000);
const c2 = await cdp();
const log = [];
let lastKey = '';
let same = 0;
let noTarget = 0;
for (let i = 0; i < 40; i++) {
  const p = await c2.eval(PROBE);
  const key = `${p.step}|${p.id}|${p.panel}`;
  same = key === lastKey ? same + 1 : 0;
  lastKey = key;
  log.push(`${p.step}/${p.total} ${p.id} ${p.done} | ${p.panel} | ${p.target ? p.target.tag + ' ' + p.target.type : '-'}`);
  if (!p.panel || /完成了|no-panel/.test(p.panel) || p.step === null) { snap('end'); break; }
  if (p.aside) { await sleep(1500); continue; } // 面板讓開中（跳出的視窗還在）：等；「躲起來」(使用者會了) 則照樣點目標
  if (same >= 2) { log.push('stuck'); snap('stuck'); break; }
  const t = p.target;
  const pb = (label) => p.pbtns.find((b) => b.label === label);
  if (p.id === 'pick' || p.done === 'route' || (p.done === 'click' && t && !/^(INPUT|SELECT|TEXTAREA|LABEL|DIV)$/.test(t.tag) && !p.group.length)) {
    if (t) tap(t.x, t.y); await sleep(2500); snap('tap'); if (pb('好')) { const b = pb('好'); tap(b.x, b.y); await sleep(2500); snap('confirm'); } continue;
  }
  if (p.group.length) { const g = p.group[0]; tap(g.x, g.y); await sleep(1800); snap('pick-any'); continue; }
  if (t && t.tag === 'DIV') {
    const lab = await c2.eval(`(() => { const g = window.__tpGuide; const box = g.target; const l = box && [...box.querySelectorAll('label')].find(x => x.offsetWidth); if (!l) return null; const r = l.getBoundingClientRect(); return [(r.left + r.width/2) * devicePixelRatio, (r.top + r.height/2) * devicePixelRatio + ${WEBVIEW_TOP}]; })()`);
    if (lab) { tap(lab[0], lab[1]); await sleep(1800); snap('pick-one'); continue; }
  }
  if (!t && (pb('好') || pb('大人說可以'))) { const b = pb('好') || pb('大人說可以'); tap(b.x, b.y); await sleep(2500); snap('confirm'); continue; } // 長輩／小朋友的「要按了嗎？」
  if (!t) { if (pb('略過')) { const b = pb('略過'); tap(b.x, b.y); await sleep(1500); snap('skip'); continue; } if (noTarget++ < 3) { await sleep(2000); continue; } log.push('no target'); snap('notarget'); break; } // 目標可能還在載入：多等幾次
  noTarget = 0;
  if (p.done === 'input' && /^(A|SPAN|BUTTON)$/.test(t.tag)) { tap(t.x, t.y); await sleep(1800); snap('tap'); continue; } // 輸入步驟但先要點開（例如「關鍵字搜尋」分頁）
  if (t.tag === 'SELECT') {
    tap(t.x, t.y); await sleep(1800); snap('open-select');
    const opt = t.options && t.options[0];
    if (!(opt && uiaTap(opt))) tap(540, 885);
    await sleep(2000); snap('picked'); continue;
  }
  if (/^form_upload_/.test(p.id || '') && pb('略過')) { const b = pb('略過'); tap(b.x, b.y); await sleep(1500); snap('skip'); continue; } // 附件：不開相簿，略過
  if (t.tag === 'LABEL') { tap(t.x, t.y); await sleep(1800); snap('check'); if (pb('略過') && p.optional && !p.done) {} continue; }
  if (t.tag === 'INPUT' && (t.ro || /^(date|time|month|datetime-local)$/.test(t.type))) {
    tap(t.x, t.y); await sleep(1800); snap('open-picker');
    if (pickerOpen()) { uiaTap('Set') || uiaTap('OK') || uiaTap('確定'); }
    else if (await c2.eval(`!!document.querySelector('[role=dialog]')`)) {
      const lab = await c2.eval(`(() => { const d = document.querySelector('[role=dialog]'); const l = d && [...d.querySelectorAll('label')].find(x => x.offsetWidth); if (!l) return null; const r = l.getBoundingClientRect(); return [(r.left + r.width/2) * devicePixelRatio, (r.top + r.height/2) * devicePixelRatio + ${WEBVIEW_TOP}]; })()`);
      if (lab) { tap(lab[0], lab[1]); await sleep(900); snap('dialog-pick'); }
      const ok = await c2.eval(`(() => { const d = document.querySelector('[role=dialog]'); const b = d && [...d.querySelectorAll('button')].find(x => /確認|確定|完成|OK|儲存/.test(x.textContent) && x.offsetWidth); if (!b) return null; const r = b.getBoundingClientRect(); return [(r.left + r.width/2) * devicePixelRatio, (r.top + r.height/2) * devicePixelRatio + ${WEBVIEW_TOP}]; })()`);
      if (ok) tap(ok[0], ok[1]);
    }
    else { const ok = await c2.eval(`(() => { const el = [...document.querySelectorAll('span, div, td, button')].find(e => e.children.length === 0 && e.textContent.trim() === '15' && e.offsetWidth); if (!el) return null; const r = el.getBoundingClientRect(); return [(r.left + r.width/2) * devicePixelRatio, (r.top + r.height/2) * devicePixelRatio + ${WEBVIEW_TOP}]; })()`); if (ok) tap(ok[0], ok[1]); }
    await sleep(2000); snap('picked-date'); continue;
  }
  if (t.tag === 'INPUT' || t.tag === 'TEXTAREA') {
    if (p.optional && pb('略過') && /電話|手機|Contact|附件/.test(p.panel)) { const b = pb('略過'); tap(b.x, b.y); await sleep(1500); snap('skip'); continue; }
    tap(t.x, t.y); await sleep(1200);
    const txt = p.accept === 'digits' ? '1234567890' : p.accept === 'phone' ? '0912345678' : /mail|信箱/i.test(p.panel) ? 'test@example.com' : /地址|地點|Address|Location/.test(p.panel) ? 'Taipei 101' : /姓名|name/i.test(p.panel) ? 'Wang Xiaoming' : /日期|date/i.test(p.panel) ? '2026-11-15' : 'test content';
    type(txt); await sleep(1000); snap('typed');
    if (t.tag === 'TEXTAREA') { const b = pb('填好了，下一步'); if (b) tap(b.x, b.y); } else enter();
    await sleep(2200); snap('next'); continue;
  }
  if (pb('略過')) { const b = pb('略過'); tap(b.x, b.y); await sleep(1500); snap('skip'); continue; }
  log.push('unhandled'); snap('unhandled'); break;
}
c.close(); c2.close();
console.log(log.join('\n'));
console.log(`saved ${shot} shots in ${OUT}`);
