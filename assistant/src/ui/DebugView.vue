<script setup lang="ts">
/**
 * 隱藏儀表板（標題連點三下 / 長按 1.2 秒）：暗色玻璃風、即時曲線、儀表、決策軌跡、log 串流。
 * 只有開發者看得到；資料來自 localStorage 的 tp_debug_log、llama-server /health /props、頁面 FPS、registry。
 */
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { readLog, clearLog, tplog, type LogEntry } from '../core/log';
import { settings } from '../core/settings';
import { hasBridge, callBridge } from '../core/bridge';

const APP_BUILD = __APP_BUILD__;
const log = ref<LogEntry[]>([]);
const filter = ref<'all' | 'warn' | 'error'>('all');
const device = ref<Record<string, unknown>>({});
const state = ref<Record<string, string | null>>({});
const llm = ref({ url: '', status: '…', rttMs: 0, model: '', ctx: 0, slots: 0, ok: false, err: '' });
/** 決策引擎實際在用什麼：最近一筆 engine ready 的 info（跟探測分開，探測失敗不代表引擎沒在用） */
const engineNow = computed(() => {
  const e = log.value.find((x) => x.src === 'home' && x.msg === 'engine ready');
  const d: any = e?.data ?? {};
  return { engine: String(d.engine ?? '—'), url: String(d.url ?? ''), model: String(d.model ?? ''), t: e?.t ?? 0 };
});
const rtt = ref<number[]>([]);
const fps = ref(0);
const fpsHist = ref<number[]>([]);
const decideHist = ref<Array<{ ms: number; engine: string; kind: string; text: string; t: number }>>([]);
const tokHist = ref<number[]>([]);
const registry = ref({ tools: 0, terms: 0, guides: 0, pages: 0 });
const engineKind = ref(settings.engine);
const llmUrlIn = ref(settings.llmUrl);
const now = ref(Date.now());
let timers: number[] = [];
let raf = 0;

const engineCount = computed(() => {
  const c: Record<string, number> = {};
  for (const d of decideHist.value) c[d.engine] = (c[d.engine] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
});
const kindCount = computed(() => {
  const c: Record<string, number> = { GO: 0, ASK: 0, NONE: 0 };
  for (const d of decideHist.value) c[d.kind] = (c[d.kind] ?? 0) + 1;
  return c;
});
const p50 = computed(() => pct(decideHist.value.map((d) => d.ms), 0.5));
const p95 = computed(() => pct(decideHist.value.map((d) => d.ms), 0.95));
const lastDecision = computed(() => decideHist.value[decideHist.value.length - 1]);
const errors = computed(() => log.value.filter((e) => e.lv === 'error').length);
const warns = computed(() => log.value.filter((e) => e.lv === 'warn').length);
const guideTrace = computed(() => log.value.filter((e) => e.src === 'overlay' && /^step |hero|collapsed|not this|fab/.test(e.msg)).slice(0, 12));
const uptime = computed(() => {
  const first = log.value.length ? log.value[log.value.length - 1].t : now.value;
  const s = Math.max(0, Math.round((now.value - first) / 1000));
  return `${Math.floor(s / 60)}m ${s % 60}s`;
});

function pct(arr: number[], q: number) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * q))]);
}

function refresh() {
  now.value = Date.now();
  const all = readLog();
  log.value = all.slice().reverse();
  const dec: typeof decideHist.value = [];
  const tok: number[] = [];
  for (const e of all) {
    const d: any = e.data;
    if (e.src === 'home' && e.msg.startsWith('decide') && d?.ms !== undefined) {
      const m = e.msg.match(/decide "(.*)" → (\w+)/);
      dec.push({ ms: Number(d.ms), engine: String(d.engine), kind: m?.[2] ?? '', text: m?.[1] ?? '', t: e.t });
    }
    if (d?.info?.tok_per_s) tok.push(Number(d.info.tok_per_s));
  }
  decideHist.value = dec.slice(-80);
  tokHist.value = tok.slice(-80);
  const keys = ['tp_assistant_mode', 'tp_assistant_lang', 'tp_assistant_engine', 'tp_assistant_llm_url', 'tp_assistant_recent'];
  const st: Record<string, string | null> = {};
  for (const k of keys) st[k] = localStorage.getItem(k);
  st['tp_guide'] = sessionStorage.getItem('tp_guide');
  st['tp_lost'] = sessionStorage.getItem('tp_lost');
  state.value = st;
  draw('c-decide', decideHist.value.map((d) => d.ms), '#5ef2ff', 'ms');
  draw('c-tok', tokHist.value, '#ffd166', 'tok/s');
  draw('c-rtt', rtt.value, '#c77dff', 'ms');
  draw('c-fps', fpsHist.value, '#7cff9b', 'fps');
}

async function probeLlm() {
  // 先探引擎自己回報的網址，再探 App 注入的、手機本地、設定值；相對路徑 /llm 在手機上會被 SPA fallback 回 index.html，放最後
  const cands = [engineNow.value.url, (window as any).__TP_LLM_URL__ as string, 'http://localhost:8080', settings.llmUrl].filter((u) => !!u);
  const urls = Array.from(new Set(cands));
  const errs: string[] = [];
  for (const u of urls) {
    const base = u.replace(/\/$/, '');
    const t0 = performance.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(base + '/health', { signal: ctrl.signal }).finally(() => clearTimeout(timer));
      const ms = Math.round(performance.now() - t0);
      if (!r.ok) {
        errs.push(`${base} → HTTP ${r.status}`);
        continue;
      }
      const j = await r.json().catch(() => null);
      if (!j || j.status === undefined) {
        errs.push(`${base} → 不是 llama-server 的回應`);
        continue;
      }
      llm.value.url = base;
      llm.value.status = 'ONLINE';
      llm.value.ok = true;
      llm.value.rttMs = ms;
      llm.value.err = '';
      rtt.value = [...rtt.value, ms].slice(-80);
      if (!llm.value.model) {
        try {
          const p = await fetch(base + '/props').then((x) => x.json());
          llm.value.model = String(p?.model_path || p?.model || '').split(/[\\/]/).pop() || '';
          llm.value.ctx = p?.default_generation_settings?.n_ctx ?? 0;
          llm.value.slots = p?.total_slots ?? 0;
        } catch {
          /* 舊版沒有 /props */
        }
      }
      return;
    } catch (e) {
      errs.push(`${base} → ${(e as Error).name}: ${(e as Error).message}`.slice(0, 120));
    }
  }
  llm.value.status = 'OFFLINE';
  llm.value.ok = false;
  llm.value.err = errs.join(' | ');
  tplog('debug', 'llm probe failed', errs, 'warn');
}

async function probeDevice() {
  const nav = navigator as any;
  device.value = { ua: navigator.userAgent.slice(0, 90), cores: navigator.hardwareConcurrency, memoryGB: nav.deviceMemory, online: navigator.onLine, bridge: hasBridge(), viewport: `${innerWidth}×${innerHeight}`, dpr: devicePixelRatio, lang: navigator.language };
  if (hasBridge()) {
    try {
      const d: any = await callBridge('deviceinfo', null, 3000);
      device.value.phone = d?.model || d?.product || '';
    } catch {
      /* ignore */
    }
  }
}

async function probeRegistry() {
  const base = import.meta.env.BASE_URL;
  try {
    const [cat, reg, gi, sm] = await Promise.all([
      fetch(base + 'data/catalog.json').then((r) => r.json()),
      fetch(base + 'data/registry.json').then((r) => r.json()),
      fetch(base + 'guides/index.json').then((r) => r.json()),
      fetch(base + 'data/sitemap.json').then((r) => r.json()).catch(() => ({ pages: {} }))
    ]);
    registry.value = { tools: cat?.services?.length ?? 0, terms: reg?.index?.length ?? 0, guides: gi?.guides?.length ?? 0, pages: Object.keys(sm?.pages ?? {}).length };
  } catch {
    /* ignore */
  }
}

function draw(id: string, data: number[], color: string, unit: string) {
  const c = document.getElementById(id) as HTMLCanvasElement | null;
  if (!c) return;
  const dpr = devicePixelRatio;
  const W = (c.width = c.clientWidth * dpr);
  const H = (c.height = 84 * dpr);
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (H / 4) * i);
    ctx.lineTo(W, (H / 4) * i);
    ctx.stroke();
  }
  if (!data.length) {
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.font = `${11 * dpr}px ui-monospace, monospace`;
    ctx.fillText('no data', 8 * dpr, 16 * dpr);
    return;
  }
  const max = Math.max(...data, 1);
  const pad = 6 * dpr;
  const pts = data.map((v, i) => [pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2), H - pad - (v / max) * (H - pad * 2)]);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, color + '66');
  g.addColorStop(1, color + '00');
  ctx.beginPath();
  ctx.moveTo(pts[0][0], H);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[pts.length - 1][0], H);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * dpr;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8 * dpr;
  ctx.stroke();
  ctx.shadowBlur = 0;
  const [lx, ly] = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(lx, ly, 3 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = `700 ${11 * dpr}px ui-monospace, monospace`;
  ctx.fillText(`${data[data.length - 1]} ${unit}`, pad, 13 * dpr);
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.font = `${10 * dpr}px ui-monospace, monospace`;
  ctx.fillText(`max ${Math.round(max)}`, W - 60 * dpr, 13 * dpr);
}

function gauge(v: number, max: number) {
  return Math.max(0, Math.min(1, v / max));
}
function applyEngine() {
  settings.engine = engineKind.value as any;
  settings.llmUrl = llmUrlIn.value;
  location.hash = '#/';
  location.reload();
}
function clearAll() {
  clearLog();
  refresh();
}
function clearState() {
  sessionStorage.removeItem('tp_guide');
  sessionStorage.removeItem('tp_lost');
  sessionStorage.removeItem('tp_from_assistant');
  for (const k of ['tp_assistant_mode', 'tp_assistant_lang', 'tp_assistant_engine', 'tp_assistant_llm_url', 'tp_assistant_recent']) localStorage.removeItem(k);
  refresh();
}
function fmt(t: number) {
  return new Date(t).toTimeString().slice(0, 8);
}

onMounted(() => {
  refresh();
  probeLlm();
  probeDevice();
  probeRegistry();
  timers.push(window.setInterval(refresh, 1200), window.setInterval(probeLlm, 3000));
  let frames = 0;
  let last = performance.now();
  const loop = () => {
    frames++;
    const t = performance.now();
    if (t - last >= 1000) {
      fps.value = frames;
      fpsHist.value = [...fpsHist.value, frames].slice(-80);
      frames = 0;
      last = t;
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
});
onUnmounted(() => {
  timers.forEach(clearInterval);
  cancelAnimationFrame(raf);
});
</script>

<template>
  <div class="dash">
    <div class="bgfx"></div>
    <header class="top">
      <div class="brand">
        <span class="dot" :class="{ on: llm.ok }"></span>
        <b>POLARIS</b><span class="sub">// dev console</span>
      </div>
      <div class="meta">v{{ APP_BUILD }} · up {{ uptime }} · {{ (device.phone as string) || (device.ua as string)?.slice(0, 24) }}</div>
      <nav><a href="#/">← 小幫手</a><a href="#/eval">評測</a></nav>
    </header>

    <section class="tiles">
      <div class="dtile glow-cyan">
        <div class="k">決策延遲 p50 / p95</div>
        <div class="v">{{ p50 }}<small>ms</small> <span class="dim">/ {{ p95 }}<small>ms</small></span></div>
        <div class="bar"><i :style="{ width: gauge(p95, 1500) * 100 + '%' }"></i></div>
        <div class="s">最近 {{ decideHist.length }} 次 · GO {{ kindCount.GO }} · ASK {{ kindCount.ASK }} · NONE {{ kindCount.NONE }}</div>
      </div>
      <div class="dtile glow-purple">
        <div class="k">決策引擎（實際在用）</div>
        <div class="v" style="font-size: 1.2em">{{ engineNow.engine }}<small v-if="engineNow.url">@ {{ engineNow.url }}</small></div>
        <div class="s mono">{{ engineNow.model || (engineNow.engine === 'cls' ? 'e5-small 微調分類器（WebView 內）' : '') }}</div>
        <div class="k" style="margin-top: 6px">llama-server 探測</div>
        <div class="v" style="font-size: 1.1em" :class="llm.ok ? 'ok' : 'bad'">{{ llm.status }} <small>{{ llm.rttMs }}ms</small></div>
        <div class="s mono">{{ llm.ok ? llm.url + ' · ctx ' + llm.ctx + ' · slots ' + llm.slots : llm.err }}</div>
      </div>
      <div class="dtile glow-yellow">
        <div class="k">LLM prompt 吞吐</div>
        <div class="v">{{ tokHist[tokHist.length - 1] ?? 0 }}<small>tok/s</small></div>
        <div class="bar"><i :style="{ width: gauge(tokHist[tokHist.length - 1] ?? 0, 2000) * 100 + '%', background: '#ffd166' }"></i></div>
        <div class="s">1-token 決策 · n_probs 40 · cache_prompt</div>
      </div>
      <div class="dtile glow-green">
        <div class="k">畫面 FPS</div>
        <div class="v">{{ fps }}</div>
        <div class="bar"><i :style="{ width: gauge(fps, 120) * 100 + '%', background: '#7cff9b' }"></i></div>
        <div class="s">{{ device.viewport }} @{{ device.dpr }}x · {{ device.cores }} cores · {{ device.memoryGB ?? '?' }} GB</div>
      </div>
      <div class="dtile">
        <div class="k">Registry</div>
        <div class="v">{{ registry.tools }}<small>tools</small></div>
        <div class="s">{{ registry.terms }} 索引詞 · {{ registry.guides }} 份導覽 · {{ registry.pages }} 頁 sitemap</div>
      </div>
      <div class="dtile">
        <div class="k">連線 / 錯誤</div>
        <div class="v" style="font-size: 1.1em">{{ device.online ? 'ONLINE' : 'OFFLINE' }} · bridge {{ device.bridge ? 'ON' : 'OFF' }}</div>
        <div class="s"><span class="bad">{{ errors }} errors</span> · <span class="warn">{{ warns }} warnings</span> · {{ log.length }} log</div>
      </div>
    </section>

    <section class="charts">
      <div class="chart"><div class="k">決策耗時（ms）</div><canvas id="c-decide"></canvas></div>
      <div class="chart"><div class="k">LLM 吞吐（tok/s）</div><canvas id="c-tok"></canvas></div>
      <div class="chart"><div class="k">llama-server RTT（ms）</div><canvas id="c-rtt"></canvas></div>
      <div class="chart"><div class="k">FPS</div><canvas id="c-fps"></canvas></div>
    </section>

    <section class="cols">
      <div class="panel">
        <div class="k">引擎使用</div>
        <div v-for="[name, n] in engineCount" :key="name" class="eng">
          <span class="mono">{{ name }}</span>
          <div class="bar"><i :style="{ width: (n / Math.max(decideHist.length, 1)) * 100 + '%' }"></i></div>
          <span class="mono">{{ n }}</span>
        </div>
        <div v-if="!engineCount.length" class="dim">尚無決策</div>
        <div v-if="lastDecision" class="last">
          <div class="k">最後一次</div>
          <div class="mono">「{{ lastDecision.text }}」</div>
          <div><span class="tag" :class="lastDecision.kind.toLowerCase()">{{ lastDecision.kind }}</span> {{ lastDecision.engine }} · {{ lastDecision.ms }} ms · {{ fmt(lastDecision.t) }}</div>
        </div>
      </div>
      <div class="panel">
        <div class="k">陪伴軌跡</div>
        <div v-for="(e, i) in guideTrace" :key="i" class="trace"><span class="dim mono">{{ fmt(e.t) }}</span> {{ e.msg }}</div>
        <div v-if="!guideTrace.length" class="dim">尚無導覽紀錄</div>
      </div>
      <div class="panel">
        <div class="k">控制</div>
        <label>引擎
          <select v-model="engineKind">
            <option value="auto">auto（llm-phone → llm → cls → tiny → embed）</option>
            <option value="llm-phone">llm-phone（手機 NPU）</option>
            <option value="llm">llm（llama-server）</option>
            <option value="cls">cls（e5 微調分類器）</option>
            <option value="tiny">tiny（n-gram）</option>
            <option value="embed">embed（e5 向量）</option>
          </select>
        </label>
        <label>LLM URL <input v-model="llmUrlIn" /></label>
        <div class="row">
          <button @click="applyEngine">套用並重載</button>
          <button class="ghost" @click="probeLlm">重測 LLM</button>
          <button class="ghost" @click="clearState">清除狀態</button>
          <button class="ghost" @click="clearAll">清除 log</button>
        </div>
        <div class="k" style="margin-top: 10px">state</div>
        <div v-for="(v, k) in state" :key="k" class="mono kv"><span class="dim">{{ k }}</span> = {{ v }}</div>
      </div>
    </section>

    <section class="panel logs">
      <div class="row" style="align-items: center; margin-bottom: 6px">
        <div class="k" style="margin: 0">log stream</div>
        <select v-model="filter" style="margin-left: auto; width: auto"><option value="all">全部</option><option value="warn">warn+</option><option value="error">error</option></select>
      </div>
      <div v-for="(e, i) in log.filter((x) => filter === 'all' || (filter === 'warn' ? x.lv !== 'info' : x.lv === 'error'))" :key="i" :class="e.lv" class="line">
        <span class="dim">{{ fmt(e.t) }}</span> <b>{{ e.src }}</b> {{ e.msg }} <span v-if="e.data !== undefined" class="dim">{{ JSON.stringify(e.data) }}</span>
      </div>
      <div v-if="!log.length" class="dim">（沒有 log）</div>
    </section>
  </div>
</template>

<style scoped>
.dash { position: relative; min-height: 100vh; padding: 12px 12px 40px; color: #e6f7ff; background: #070b14; font-size: 13px; font-family: 'PingFang TC', Roboto, system-ui, sans-serif; overflow: hidden; }
.bgfx { position: absolute; inset: 0; pointer-events: none; background:
  radial-gradient(600px 300px at 10% -10%, rgba(94,242,255,.18), transparent 60%),
  radial-gradient(500px 300px at 100% 20%, rgba(199,125,255,.16), transparent 60%),
  repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 28px),
  repeating-linear-gradient(90deg, rgba(255,255,255,.025) 0 1px, transparent 1px 28px); }
.top { position: relative; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.brand { display: flex; align-items: center; gap: 8px; font-size: 18px; letter-spacing: 3px; }
.brand .sub { color: #5ef2ff; letter-spacing: 1px; font-size: 12px; opacity: .8; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #ff5c7a; box-shadow: 0 0 10px #ff5c7a; }
.dot.on { background: #7cff9b; box-shadow: 0 0 12px #7cff9b; animation: pulse 1.6s infinite; }
.meta { color: rgba(230,247,255,.55); font-family: ui-monospace, monospace; font-size: 11px; }
nav { margin-left: auto; display: flex; gap: 12px; } nav a { color: #5ef2ff; text-decoration: none; }
.tiles { position: relative; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.dtile, .chart, .panel { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 10px 12px; backdrop-filter: blur(8px); }
.dtile.glow-cyan { box-shadow: inset 0 0 0 1px rgba(94,242,255,.25), 0 0 24px rgba(94,242,255,.08); }
.dtile.glow-purple { box-shadow: inset 0 0 0 1px rgba(199,125,255,.25), 0 0 24px rgba(199,125,255,.08); }
.dtile.glow-yellow { box-shadow: inset 0 0 0 1px rgba(255,209,102,.25), 0 0 24px rgba(255,209,102,.08); }
.dtile.glow-green { box-shadow: inset 0 0 0 1px rgba(124,255,155,.25), 0 0 24px rgba(124,255,155,.08); }
.k { color: rgba(230,247,255,.55); font-size: 11px; letter-spacing: .5px; text-transform: uppercase; margin-bottom: 4px; }
.v { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; text-shadow: 0 0 18px rgba(94,242,255,.35); }
.v small { font-size: 12px; font-weight: 600; margin-left: 3px; color: rgba(230,247,255,.6); }
.v.ok { color: #7cff9b; text-shadow: 0 0 18px rgba(124,255,155,.5); } .v.bad, .bad { color: #ff5c7a; } .warn { color: #ffd166; }
.dim { color: rgba(230,247,255,.45); } .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
.s { color: rgba(230,247,255,.5); font-size: 11px; margin-top: 4px; word-break: break-all; }
.bar { height: 5px; background: rgba(255,255,255,.08); border-radius: 3px; overflow: hidden; margin-top: 6px; }
.bar i { display: block; height: 100%; background: linear-gradient(90deg, #5ef2ff, #c77dff); box-shadow: 0 0 10px #5ef2ff; transition: width .5s; }
.charts { position: relative; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px; }
.chart canvas { width: 100%; height: 84px; display: block; }
.cols { position: relative; display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 10px; }
@media (min-width: 720px) { .tiles { grid-template-columns: repeat(3, 1fr); } .cols { grid-template-columns: repeat(3, 1fr); } .charts { grid-template-columns: repeat(4, 1fr); } }
.eng { display: grid; grid-template-columns: 70px 1fr 30px; align-items: center; gap: 8px; margin: 4px 0; }
.eng .bar { margin: 0; }
.last { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.08); }
.tag { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: rgba(255,255,255,.1); }
.tag.go { background: rgba(124,255,155,.2); color: #7cff9b; } .tag.ask { background: rgba(255,209,102,.2); color: #ffd166; } .tag.none { background: rgba(255,92,122,.2); color: #ff5c7a; }
.trace { padding: 3px 0; border-bottom: 1px dashed rgba(255,255,255,.06); font-size: 12px; }
label { display: block; margin: 6px 0; color: rgba(230,247,255,.7); }
select, input { width: 100%; margin-top: 3px; background: rgba(0,0,0,.35); color: #e6f7ff; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; padding: 6px 8px; font: inherit; }
.row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
button { border: 0; border-radius: 8px; padding: 7px 12px; background: linear-gradient(90deg, #5ef2ff, #c77dff); color: #061018; font: inherit; font-weight: 700; }
button.ghost { background: rgba(255,255,255,.08); color: #e6f7ff; }
.kv { font-size: 11px; word-break: break-all; padding: 2px 0; }
.logs { position: relative; margin-top: 10px; max-height: 50vh; overflow: auto; font: 11px ui-monospace, Menlo, Consolas, monospace; }
.line { border-top: 1px solid rgba(255,255,255,.05); padding: 2px 0; word-break: break-all; }
.line.warn { color: #ffd166; } .line.error { color: #ff5c7a; }
@keyframes pulse { 50% { box-shadow: 0 0 2px #7cff9b; } }
</style>
