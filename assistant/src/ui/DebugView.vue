<script setup lang="ts">
/**
 * 隱藏儀表板（標題連點三下 / 長按 1.2 秒）：即時曲線 + 指標 + log。
 * 資料來源：localStorage 的 tp_debug_log（小幫手與引導層共用）、llama-server /health /props 的 RTT、頁面 FPS。
 */
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { readLog, clearLog, type LogEntry } from '../core/log';
import { settings } from '../core/settings';
import { hasBridge, callBridge } from '../core/bridge';

const APP_BUILD = __APP_BUILD__;
const log = ref<LogEntry[]>([]);
const filter = ref<'all' | 'warn' | 'error'>('all');
const engineKind = ref(settings.engine);
const llmUrlIn = ref(settings.llmUrl);
function applyEngine() {
  settings.engine = engineKind.value as any;
  settings.llmUrl = llmUrlIn.value;
  location.hash = '#/';
  location.reload();
}
const device = ref<Record<string, unknown>>({});
const state = ref<Record<string, string | null>>({});
const llm = ref({ url: '', status: '…', rttMs: 0, model: '', ctx: 0, slots: 0 });
const rtt = ref<number[]>([]);
const fps = ref(0);
const fpsHist = ref<number[]>([]);
const decideHist = ref<Array<{ ms: number; engine: string; kind: string }>>([]);
const tokHist = ref<number[]>([]);
const engineCount = computed(() => {
  const c: Record<string, number> = {};
  for (const d of decideHist.value) c[d.engine] = (c[d.engine] ?? 0) + 1;
  return c;
});
const p50 = computed(() => pct(decideHist.value.map((d) => d.ms), 0.5));
const p95 = computed(() => pct(decideHist.value.map((d) => d.ms), 0.95));
let timers: number[] = [];
let raf = 0;

function pct(arr: number[], q: number) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * q))]);
}

function refresh() {
  const all = readLog();
  log.value = all.slice().reverse();
  // 從 log 抽決策耗時與 LLM 吞吐
  const dec: typeof decideHist.value = [];
  const tok: number[] = [];
  for (const e of all) {
    const d: any = e.data;
    if (e.src === 'home' && e.msg.startsWith('decide') && d?.ms !== undefined) dec.push({ ms: Number(d.ms), engine: String(d.engine), kind: e.msg.split('→')[1]?.trim().split(' ')[0] ?? '' });
    if (d?.info?.tok_per_s) tok.push(Number(d.info.tok_per_s));
  }
  decideHist.value = dec.slice(-60);
  tokHist.value = tok.slice(-60);
  const keys = ['tp_assistant_mode', 'tp_assistant_lang', 'tp_assistant_engine', 'tp_assistant_llm_url', 'tp_assistant_recent'];
  const st: Record<string, string | null> = {};
  for (const k of keys) st[k] = localStorage.getItem(k);
  st['tp_guide'] = sessionStorage.getItem('tp_guide');
  st['tp_lost'] = sessionStorage.getItem('tp_lost');
  state.value = st;
  draw('c-decide', decideHist.value.map((d) => d.ms), '#2eb6c7', 'ms');
  draw('c-tok', tokHist.value, '#f5ba4b', 'tok/s');
  draw('c-rtt', rtt.value, '#5e73b4', 'ms');
  draw('c-fps', fpsHist.value, '#6a0', 'fps');
}

async function probeLlm() {
  const urls = Array.from(new Set([settings.llmUrl, 'http://localhost:8080']));
  for (const u of urls) {
    const base = u.replace(/\/$/, '');
    const t0 = performance.now();
    try {
      const r = await fetch(base + '/health', { signal: AbortSignal.timeout(2500) });
      const ms = Math.round(performance.now() - t0);
      llm.value.url = base;
      llm.value.status = r.ok ? 'ok' : String(r.status);
      llm.value.rttMs = ms;
      rtt.value = [...rtt.value, ms].slice(-60);
      if (!llm.value.model) {
        const p = await fetch(base + '/props', { signal: AbortSignal.timeout(2500) }).then((x) => x.json());
        llm.value.model = String(p?.model_path || p?.model || '').split(/[\\/]/).pop() || '';
        llm.value.ctx = p?.default_generation_settings?.n_ctx ?? 0;
        llm.value.slots = p?.total_slots ?? 0;
      }
      return;
    } catch (e) {
      llm.value.url = base;
      llm.value.status = 'unreachable';
    }
  }
}

async function probeDevice() {
  const nav = navigator as any;
  device.value = { ua: navigator.userAgent.slice(0, 80), cores: navigator.hardwareConcurrency, memoryGB: nav.deviceMemory, online: navigator.onLine, bridge: hasBridge(), viewport: `${innerWidth}×${innerHeight}`, dpr: devicePixelRatio };
  if (hasBridge()) {
    try {
      const d: any = await callBridge('deviceinfo', null, 3000);
      device.value.phone = d?.model || d?.product || JSON.stringify(d).slice(0, 60);
    } catch {
      /* ignore */
    }
  }
}

function draw(id: string, data: number[], color: string, unit: string) {
  const c = document.getElementById(id) as HTMLCanvasElement | null;
  if (!c) return;
  const W = (c.width = c.clientWidth * devicePixelRatio);
  const H = (c.height = 70 * devicePixelRatio);
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(46,182,199,.06)';
  ctx.fillRect(0, 0, W, H);
  if (!data.length) return;
  const max = Math.max(...data, 1);
  const pad = 6 * devicePixelRatio;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2);
    const y = H - pad - (v / max) * (H - pad * 2);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.stroke();
  ctx.fillStyle = color;
  const last = data[data.length - 1];
  ctx.font = `${11 * devicePixelRatio}px ui-monospace, monospace`;
  ctx.fillText(`${last} ${unit}  max ${Math.round(max)}`, pad, 12 * devicePixelRatio);
}

function clearAll() {
  clearLog();
  refresh();
}
function clearState() {
  sessionStorage.removeItem('tp_guide');
  sessionStorage.removeItem('tp_lost');
  for (const k of ['tp_assistant_mode', 'tp_assistant_lang', 'tp_assistant_engine', 'tp_assistant_llm_url', 'tp_assistant_recent']) localStorage.removeItem(k);
  refresh();
}
function fmt(t: number) {
  const d = new Date(t);
  return d.toTimeString().slice(0, 8);
}

onMounted(() => {
  refresh();
  probeLlm();
  probeDevice();
  timers.push(window.setInterval(refresh, 1500), window.setInterval(probeLlm, 3000));
  // FPS
  let frames = 0;
  let last = performance.now();
  const loop = () => {
    frames++;
    const now = performance.now();
    if (now - last >= 1000) {
      fps.value = frames;
      fpsHist.value = [...fpsHist.value, frames].slice(-60);
      frames = 0;
      last = now;
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
    <div class="row" style="align-items: center">
      <strong>小幫手儀表板 · v{{ APP_BUILD }}</strong>
      <span class="muted" style="font-size: 0.8em">{{ (device.phone as string) || '' }}</span>
      <a href="#/" style="margin-left: auto">← 回小幫手</a>
      <a href="#/eval">評測</a>
    </div>

    <div class="tiles">
      <div class="tile"><div class="k">決策 p50 / p95</div><div class="v">{{ p50 }} <small>/ {{ p95 }} ms</small></div><div class="s">最近 {{ decideHist.length }} 次</div></div>
      <div class="tile"><div class="k">引擎</div><div class="v" style="font-size: 1em">{{ Object.entries(engineCount).map(([k, v]) => k + '×' + v).join(' ') || '—' }}</div><div class="s">{{ settings.engine }} · {{ settings.llmUrl }}</div></div>
      <div class="tile"><div class="k">llama-server</div><div class="v" :style="{ color: llm.status === 'ok' ? '#2eb6c7' : '#e5464b' }">{{ llm.status }} <small>{{ llm.rttMs }} ms</small></div><div class="s">{{ llm.model || llm.url }} · ctx {{ llm.ctx }} · slots {{ llm.slots }}</div></div>
      <div class="tile"><div class="k">畫面 FPS</div><div class="v">{{ fps }}</div><div class="s">{{ device.viewport }} @{{ device.dpr }}x · {{ device.cores }} cores · {{ device.memoryGB }} GB</div></div>
      <div class="tile"><div class="k">連線</div><div class="v" style="font-size: 1em">{{ device.online ? '有網路' : '離線' }} · bridge {{ device.bridge ? 'on' : 'off' }}</div><div class="s">{{ (device.ua as string) }}</div></div>
    </div>

    <div class="charts">
      <div class="chart"><div class="k">決策耗時（ms）</div><canvas id="c-decide"></canvas></div>
      <div class="chart"><div class="k">LLM prompt 吞吐（tok/s）</div><canvas id="c-tok"></canvas></div>
      <div class="chart"><div class="k">llama-server RTT（ms）</div><canvas id="c-rtt"></canvas></div>
      <div class="chart"><div class="k">FPS</div><canvas id="c-fps"></canvas></div>
    </div>

    <div class="card col" style="font-size: 12px">
      <div class="row" style="align-items: center">
        <label>引擎
          <select v-model="engineKind" style="font: inherit">
            <option value="auto">auto（llm-phone → llm → cls → tiny → embed）</option>
            <option value="llm-phone">llm-phone（手機本地 NPU）</option>
            <option value="llm">llm（llama-server）</option>
            <option value="cls">cls（e5 微調分類器）</option>
            <option value="tiny">tiny（n-gram）</option>
            <option value="embed">embed（e5 向量）</option>
          </select>
        </label>
        <label style="flex: 1">LLM URL <input v-model="llmUrlIn" style="width: 100%; font: inherit" /></label>
        <button class="btn sm" @click="applyEngine">套用並重載</button>
      </div>
      <div><b>state</b> <span v-for="(v, k) in state" :key="k" style="display: block; word-break: break-all">{{ k }} = {{ v }}</span></div>
      <div class="row">
        <button class="btn secondary sm" @click="clearState">清除狀態</button>
        <button class="btn secondary sm" @click="clearAll">清除 log</button>
        <button class="btn secondary sm" @click="probeLlm">重測 LLM</button>
        <select v-model="filter" style="font: inherit"><option value="all">全部</option><option value="warn">warn+</option><option value="error">error</option></select>
      </div>
    </div>
    <div class="card logs">
      <div v-for="(e, i) in log.filter((x) => filter === 'all' || (filter === 'warn' ? x.lv !== 'info' : x.lv === 'error'))" :key="i" :class="e.lv">
        <span class="muted">{{ fmt(e.t) }}</span> <b>{{ e.src }}</b> {{ e.msg }} <span v-if="e.data !== undefined" class="muted">{{ JSON.stringify(e.data) }}</span>
      </div>
      <div v-if="!log.length" class="muted">（沒有 log）</div>
    </div>
  </div>
</template>

<style scoped>
.dash { padding: 0.8em; display: flex; flex-direction: column; gap: 0.8em; font-size: 14px; }
.tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6em; }
.tile { background: #fff; border-radius: 14px; padding: 0.7em 0.9em; box-shadow: 0 4px 12px rgba(0,0,0,.06); }
.tile .k { color: #738995; font-size: 0.75em; }
.tile .v { font-size: 1.6em; font-weight: 800; color: #171b1d; font-variant-numeric: tabular-nums; }
.tile .v small { font-size: 0.55em; color: #738995; font-weight: 600; }
.tile .s { color: #91a0a8; font-size: 0.7em; word-break: break-all; }
.charts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6em; }
.chart { background: #fff; border-radius: 14px; padding: 0.5em 0.7em; box-shadow: 0 4px 12px rgba(0,0,0,.06); }
.chart .k { color: #738995; font-size: 0.75em; margin-bottom: 2px; }
.chart canvas { width: 100%; height: 70px; display: block; }
.logs { max-height: 50vh; overflow: auto; font: 11px ui-monospace, Menlo, Consolas, monospace; }
.logs div { border-top: 1px solid #eee; padding: 2px 0; word-break: break-all; }
.logs .warn { color: #b07d2c; } .logs .error { color: #e5464b; }
.btn.sm { min-height: 2em; padding: 0.3em 0.8em; font-size: 0.9em; }
@media (max-width: 420px) { .tiles, .charts { grid-template-columns: 1fr 1fr; } }
</style>
