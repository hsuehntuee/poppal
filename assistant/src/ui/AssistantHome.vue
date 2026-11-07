<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Catalog, Code, Decider, Decision, Probs, ServiceEntry } from '../core/types';
import { loadCatalog, serviceRequest, serviceByCode, serviceOptions, commandOptions } from '../core/catalog';
import { decide, reject } from '../core/decide';
import { loadCopy, fmt, type Copy } from '../core/copy';
import { settings, applyMode, type Mode, type EngineKind } from '../core/settings';
import { stt, langId, translate, tts, openExternal, phoneCall, hasBridge, onSttPartial } from '../core/bridge';
import { createDecider } from '../engines';
import { loadRegistry, toolByCode, extractParams, invoke, type Registry, type Hit } from '../core/registry';
import { fuseWithRegistry } from '../core/fuse';
import { tplog, onTripleTap } from '../core/log';
import { callBridge } from '../core/bridge';

const SERVICES_BASE = (import.meta.env.VITE_SERVICES_BASE ?? '').replace(/\/$/, '');
const APP_BUILD = __APP_BUILD__;
const MAX_ROUNDS = 2;

type Phase = 'boot' | 'idle' | 'listening' | 'thinking' | 'result';

const phase = ref<Phase>('boot');
const status = ref('');
const copy = ref<Copy>({});
const uiLang = ref(settings.lang);
const catalog = ref<Catalog | null>(null);
const registry = ref<Registry | null>(null);
const hits = ref<Hit[]>([]);
const lastText = ref('');
const decider = ref<Decider | null>(null);
const engineKind = ref<EngineKind>(settings.engine);
const llmUrl = ref(settings.llmUrl);
const showSettings = ref(false);
const askMode = ref(settings.mode === null);
/** 偵測到英文輸入時提議切換介面語言 */
const langOffer = ref<string | null>(null);
/** 啟動泡泡動畫：按「小幫手」進來的那 1.2 秒。?nosplash 可關 */
const splash = ref(!new URLSearchParams(location.search).has('nosplash') && !location.hash.includes('debug'));
const splashHold = new URLSearchParams(location.search).has('splashhold');
const bubbles = Array.from({ length: 10 }, (_, i) => ({ left: (i * 37) % 100, size: 14 + ((i * 53) % 40), delay: (i % 7) * 0.06, dur: 0.9 + ((i * 29) % 50) / 100 }));
/** 圖騰：抽象線條（Lissajous 曲線 + 輻條 + 環），用 stroke-dashoffset 一筆一筆畫出來 */
function lissajous(a: number, b: number, phase: number, r: number, n = 240) {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = 120 + r * Math.sin(a * t + phase);
    const y = 120 + r * Math.sin(b * t);
    pts.push((i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1));
  }
  return pts.join(' ');
}
const totemCurves = [
  { d: lissajous(3, 2, Math.PI / 2, 92), delay: 0, color: 'url(#tg1)' },
  { d: lissajous(5, 4, Math.PI / 4, 78), delay: 0.15, color: 'url(#tg2)' },
  { d: lissajous(2, 3, 0, 64), delay: 0.3, color: '#ffffff' },
  { d: lissajous(4, 5, Math.PI / 3, 50), delay: 0.45, color: 'url(#tg1)' }
];
const spokes = Array.from({ length: 12 }, (_, i) => (i * 360) / 12);
if (!new URLSearchParams(location.search).has('splashhold')) setTimeout(() => (splash.value = false), 1700); // ?splashhold=1 停在登場畫面（截圖用）

const heard = ref('');
const translated = ref('');
const typed = ref('');
const showTyping = ref(false);
const probs = ref<Probs>({});
const rejected = ref<Code[]>([]);
const rounds = ref(0);
const decision = ref<Decision | null>(null);
const lastMs = ref(0);
const notice = ref('');

const mode = ref<Mode>(settings.mode ?? 'normal');
/** 文案依模式覆蓋：先找 key_kid / key_elder，沒有再用 key */
const t = (key: string, params?: Record<string, string | number>) => fmt(copy.value[key + '_' + mode.value] ?? copy.value[key] ?? key, params);
const titleOf = (s: ServiceEntry) => s.title[uiLang.value] ?? s.title.zh;
const svc = (code: Code) => (catalog.value ? serviceByCode(catalog.value, code) : undefined);
const isElder = computed(() => mode.value === 'elder');
/** 長輩與小朋友都把結果唸出來 */
const readAloud = computed(() => mode.value !== 'normal');

const titleEl = ref<HTMLElement | null>(null);
onMounted(async () => {
  if (titleEl.value) onTripleTap(titleEl.value, () => (location.hash = '#/debug'));
  applyMode(settings.mode ?? 'normal');
  copy.value = await loadCopy(uiLang.value);
  catalog.value = await loadCatalog();
  registry.value = await loadRegistry().catch(() => null);
  await bootEngine();
  // 從引導層「想做別的事」跳回來：?q=使用者說的話
  const q = new URLSearchParams(location.search).get('q');
  if (q && decider.value) {
    history.replaceState(null, '', location.pathname + location.hash);
    await handleText(q);
  }
});

async function bootEngine() {
  if (!catalog.value) return;
  phase.value = 'boot';
  decider.value = null;
  try {
    decider.value = await createDecider({
      kind: engineKind.value,
      llmUrl: llmUrl.value,
      sets: [
        { options: serviceOptions(catalog.value), instruction: catalog.value.instruction, noneCode: catalog.value.none_code, setId: 'services' },
        { options: commandOptions(catalog.value), instruction: catalog.value.commands.instruction, noneCode: catalog.value.commands.none_code, setId: 'commands' }
      ],
      onStatus: (m) => (status.value = m)
    });
    status.value = '';
    tplog('home', 'engine ready', decider.value.info());
  } catch (e) {
    tplog('home', 'engine failed: ' + (e as Error).message, undefined, 'error');
    status.value = t('error_engine') + ' (' + (e as Error).message + ')';
  }
  phase.value = 'idle';
}

function chooseMode(m: Mode) {
  settings.mode = m;
  mode.value = m;
  askMode.value = false;
}

async function setLang(l: string) {
  uiLang.value = l;
  settings.lang = l;
  copy.value = await loadCopy(l);
}

async function onVoice() {
  if (phase.value === 'listening' || phase.value === 'thinking') return;
  phase.value = 'listening';
  notice.value = '';
  const sttLang = uiLang.value === 'auto' ? 'auto' : copy.value.stt_lang || 'zh-TW';
  heard.value = '';
  const off = onSttPartial((t) => (heard.value = t)); // 辨識中即時顯示聽到的字
  const r = await stt(sttLang).catch((e) => ({ text: '', error: String(e) }));
  off();
  if (!r.text) {
    phase.value = 'idle';
    notice.value = !navigator.onLine ? t('stt_offline_hint') : t('retry');
    if (r.error) tplog('home', 'stt error', { error: r.error, online: navigator.onLine }, 'warn');
    return;
  }
  await handleText(r.text);
}

async function onTyped() {
  const v = typed.value.trim();
  if (!v) return;
  typed.value = '';
  await handleText(v);
}

/** 外語流程：lang_id → 翻成中文 → 決策器；畫面文字切成該語言的模板 */
async function handleText(text: string) {
  heard.value = text;
  translated.value = '';
  phase.value = 'thinking';
  let forDecider = text;
  const det = await langId(text);
  if (det.lang && !['zh', 'en', 'und'].includes(det.lang) && det.conf >= 0.5) {
    forDecider = await translate(text, det.lang, 'zh');
    if (forDecider !== text) translated.value = forDecider;
    if (['vi', 'id', 'th'].includes(det.lang) && uiLang.value !== det.lang) await setLang(det.lang);
  } else if (det.lang === 'zh' && uiLang.value !== 'zh' && uiLang.value !== 'auto') {
    // 使用者用中文講話就切回中文介面
    await setLang('zh');
  }
  // 用英文講／打字但介面是中文：問要不要切成英文（不自動切，怕只是夾雜一兩個英文字）
  const looksEnglish = /^[A-Za-z0-9 ,.?!'"-]{4,}$/.test(text.trim());
  if (uiLang.value === 'zh' && (det.lang === 'en' || looksEnglish)) langOffer.value = 'en';
  await runDecision(forDecider);
}

async function runDecision(text: string) {
  if (!decider.value || !catalog.value) {
    status.value = t('error_engine');
    phase.value = 'idle';
    return;
  }
  rejected.value = [];
  rounds.value = 0;
  const t0 = performance.now();
  try {
    probs.value = await decider.value.score(serviceRequest(catalog.value, text));
  } catch (e) {
    tplog('home', 'score failed: ' + (e as Error).message, undefined, 'error');
    status.value = t('error_engine') + ' (' + (e as Error).message + ')';
    phase.value = 'idle';
    return;
  }
  lastMs.value = Math.round(performance.now() - t0);
  lastText.value = text;
  // 工具層：查表先驗融進分布（使用者講到具體項目名稱 → 直接拉高該工具）
  const fused = fuseWithRegistry(registry.value, text, probs.value);
  probs.value = fused.probs;
  hits.value = fused.hits;
  const d0 = decide(probs.value, catalog.value.none_code);
  tplog('home', `decide "${text}" → ${d0.kind}${d0.kind === 'GO' ? ' ' + d0.code : d0.kind === 'ASK' ? ' ' + d0.codes.join('/') : ''}`, {
    engine: decider.value.name, ms: lastMs.value, info: decider.value.info(),
    top: Object.entries(probs.value).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, p]) => `${c}:${p.toFixed(2)}`).join(' '),
    hits: fused.hits.map((h) => h.term)
  });
  applyDecision(d0);
}

function applyDecision(d: Decision) {
  decision.value = d;
  phase.value = 'result';
  if (readAloud.value) {
    const s = d.kind === 'GO' ? t('go_q', { title: titleOf(svc(d.code)!) }) : d.kind === 'ASK' ? t('ask_q') : t('none_title');
    tts(s, copy.value.stt_lang);
  }
}

/** 按「不是」：歸零該選項、重判，不呼叫模型。最多追問 2 輪 */
function onReject(codes: Code[]) {
  if (!catalog.value) return;
  rejected.value.push(...codes);
  rounds.value++;
  if (rounds.value >= MAX_ROUNDS) return applyDecision({ kind: 'NONE', p: 0 });
  probs.value = reject(probs.value, codes);
  applyDecision(decide(probs.value, catalog.value.none_code));
}

async function go(code: Code) {
  const s = svc(code);
  if (!s) return;
  const tool = registry.value ? toolByCode(registry.value, code) : undefined;
  if (!tool) {
    // 沒有 registry 時退回目錄的 route
    if (s.route.type === 'internal') location.href = SERVICES_BASE + (s.route.target ?? '/');
    else if (s.route.type === 'external') openExternal(s.route.target!);
    else if (s.route.type === 'phone') phoneCall(s.route.target!);
    else notice.value = t('unavailable', { title: titleOf(s) });
    return;
  }
  // 參數只抽不猜，抽到的會在導覽裡顯示給使用者確認
  const params = extractParams(tool, lastText.value, hits.value);
  // 關鍵字：使用者那句話去掉「我要/繳/幫我…」之後剩下的名詞（例如「我要繳電費」→「電費」），給搜尋型的導覽預填
  const kw = keywordOf(lastText.value);
  if (kw && !params.entity) params.keyword = kw;
  else if (params.entity) params.keyword = params.entity;
  rememberRecent(tool.id);
  const left = invoke(tool, params, {
    servicesBase: SERVICES_BASE,
    mode: settings.mode ?? 'normal',
    lang: uiLang.value,
    setMode: (m) => {
      chooseMode(m);
      reset();
    },
    speak: (text) => tts(text, copy.value.stt_lang),
    speakText: decision.value?.kind === 'GO' ? t('go_q', { title: titleOf(s) }) : heard.value,
    openExternal,
    callBridge: (name, data) => callBridge(name, data, 1000).catch(() => {}),
    notify: () => {
      notice.value = t('unavailable', { title: titleOf(s) });
      phase.value = 'idle';
    }
  });
  if (!left && tool.invoke.kind === 'ui' && tool.invoke.action === 'tts') reset();
}

function goAll() {
  location.href = SERVICES_BASE + '/fee-payment/others';
}

function reset() {
  phase.value = 'idle';
  decision.value = null;
  heard.value = '';
  translated.value = '';
  notice.value = '';
}


function keywordOf(text: string): string {
  let t = text.trim();
  t = t.replace(/^(請|麻煩|幫我|我要|我想|我想要|想要|想|要|可以|能不能|怎麼|如何|去|到)+/g, '');
  t = t.replace(/^(繳|付|交|查|找|看|辦|申請|報|預約|打)+/g, '');
  t = t.replace(/(的)?(費用|帳單|單子|錢|怎麼辦|怎麼付|怎麼繳|要去哪|在哪|在哪裡|嗎|呢|啊|吧|一下)+$/g, '');
  t = t.replace(/[，,。？?！!\s]+/g, '');
  return t.length >= 2 && t.length <= 10 ? t : '';
}

const RECENT_KEY = 'tp_assistant_recent';
const recent = ref<string[]>(readRecent());
function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}
/** 最近用過的 4 個服務：首頁直接開，不經過決策器 */
function rememberRecent(id: string) {
  const list = [id, ...recent.value.filter((x) => x !== id)].slice(0, 4);
  recent.value = list;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
const recentServices = computed(() => {
  if (!catalog.value) return [];
  const ids = recent.value.length ? recent.value : ['water_fee_pay', 'counter_calling', 'citizen_report', 'library'];
  return ids.map((id) => catalog.value!.services.find((s) => s.id === id)).filter((s): s is ServiceEntry => !!s);
});
function openRecent(s: ServiceEntry) {
  lastText.value = '';
  hits.value = [];
  go(s.code);
}

</script>

<template>
  <div class="page">
    <!-- 啟動泡泡：純炫技 -->
    <div v-if="splash" class="splash" :class="{ hold: splashHold }" @click="splash = false">
      <span v-for="(b, i) in bubbles" :key="i" class="b" :style="{ left: b.left + '%', width: b.size + 'px', height: b.size + 'px', animationDelay: b.delay + 's', animationDuration: b.dur + 's' }"></span>
      <div class="brand">
        <svg class="totem" viewBox="0 0 240 240" aria-hidden="true">
          <defs>
            <linearGradient id="tg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" /><stop offset=".5" stop-color="#a7f3ff" /><stop offset="1" stop-color="#c77dff" /></linearGradient>
            <linearGradient id="tg2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dffbf6" /><stop offset="1" stop-color="#5ef2ff" /></linearGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <g class="ring ring-a"><circle cx="120" cy="120" r="108" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.2" stroke-dasharray="6 10" /></g>
          <g class="ring ring-b"><circle cx="120" cy="120" r="100" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-dasharray="2 14" /></g>
          <g class="spokes" opacity=".9">
            <line v-for="(a, i) in spokes" :key="i" x1="120" y1="16" x2="120" y2="34" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" :transform="'rotate(' + a + ' 120 120)'" />
          </g>
          <g>
            <path v-for="(c, i) in totemCurves" :key="i" class="curve" :d="c.d" fill="none" :stroke="c.color" stroke-width="2" stroke-linecap="round" pathLength="1" :style="{ animationDelay: c.delay + 's' }" />
          </g>
          <g class="orbit"><circle cx="120" cy="28" r="4" fill="#fff" /><circle cx="120" cy="212" r="2.5" fill="#5ef2ff" /></g>
          <g class="orbit orbit-r"><circle cx="212" cy="120" r="3" fill="#c77dff" /></g>
          <circle class="core" cx="120" cy="120" r="9" fill="#fff" />
        </svg>
        <h1>PopPal</h1>
        <p>泡泡夥伴 · 城市通小幫手</p>
      </div>
    </div>
    <!-- 第一次使用：字要大一點嗎 -->
    <div v-if="askMode" class="modal">
      <div class="card col" style="text-align: center">
        <p style="font-size: 1.2em; font-weight: 700; margin: 0.2em 0">{{ t('mode_pick') }}</p>
        <button class="tile" @click="chooseMode('kid')"><span class="ic">🧒</span><span><b>{{ t('mode_kid') }}</b><small>{{ t('mode_kid_sub') }}</small></span></button>
        <button class="tile" @click="chooseMode('normal')"><span class="ic">🙂</span><span><b>{{ t('mode_normal') }}</b><small>{{ t('mode_normal_sub') }}</small></span></button>
        <button class="tile" @click="chooseMode('elder')"><span class="ic">👓</span><span><b>{{ t('mode_elder') }}</b><small>{{ t('mode_elder_sub') }}</small></span></button>
      </div>
    </div>

    <header class="top">
      <strong ref="titleEl" style="user-select: none">{{ t('app_title') }}</strong>
      <span class="muted" style="font-size: 0.8em">{{ status }}</span>
      <button class="btn ghost" style="margin-left: auto; min-height: 2em" @click="showSettings = !showSettings">⚙</button>
    </header>

    <!-- 設定：引擎、語言、模式 -->
    <div v-if="showSettings" class="card col" style="margin: 0 1em">
      <div class="row">
        <button v-for="l in ['zh', 'en', 'vi', 'id', 'th']" :key="l" class="btn" :class="{ secondary: uiLang !== l }" style="min-height: 2.4em" @click="setLang(l)">{{ l }}</button>
      </div>
      <div class="row">
        <button v-for="m in (['kid', 'normal', 'elder'] as Mode[])" :key="m" class="btn" :class="{ secondary: mode !== m }" style="min-height: 2.4em" @click="chooseMode(m)">{{ t('mode_' + m) }}</button>
      </div>
      <button class="btn" @click="showSettings = false">OK</button>
    </div>

    <main class="col" style="padding: 1em">
      <!-- 問句 + 麥克風 -->
      <section v-if="phase !== 'result'" class="col" style="text-align: center">
        <h1 style="margin: 0.3em 0">{{ t('ask_what') }}</h1>
        <button class="mic" :class="{ on: phase === 'listening' }" :disabled="phase === 'boot' || phase === 'thinking'" @click="onVoice">
          <span class="icon">🎤</span>
          <span>{{ phase === 'listening' ? t('listening') : phase === 'thinking' ? t('thinking') : t('hold_to_talk') }}</span>
        </button>
        <p v-if="heard && (phase === 'thinking' || phase === 'listening')" class="muted">{{ t('heard') }}{{ heard }}</p>
        <p v-if="notice" class="muted">{{ notice }}</p>
        <div v-if="langOffer" class="card col" style="text-align: center">
          <div style="font-weight: 700">{{ t('lang_offer_en') }}</div>
          <div class="row" style="justify-content: center">
            <button class="btn" style="min-height: 2.4em" @click="setLang(langOffer!); langOffer = null">{{ t('lang_offer_yes') }}</button>
            <button class="btn secondary" style="min-height: 2.4em" @click="langOffer = null">{{ t('lang_offer_no') }}</button>
          </div>
        </div>

        <div class="row lang-row" style="justify-content: center; gap: 0.4em">
          <button class="btn secondary" style="min-height: 2.2em; padding: 0.3em 0.9em" :class="{ on: uiLang === 'zh' }" @click="setLang('zh')">中文</button>
          <button class="btn secondary" style="min-height: 2.2em; padding: 0.3em 0.9em" :class="{ on: uiLang === 'en' }" @click="setLang('en')">English</button>
        </div>
        <button class="btn secondary" @click="showTyping = !showTyping">⌨️ {{ t('type_instead') }}</button>
        <form v-if="showTyping" class="row" @submit.prevent="onTyped">
          <input v-model="typed" :placeholder="t('type_placeholder')" style="flex: 1; padding: 0.8em; border-radius: 12px; border: 1px solid #ccc; font: inherit" />
          <button class="btn" type="submit">{{ t('send') }}</button>
        </form>

        <div class="muted" style="margin-top: 0.6em">{{ t('shortcuts') }}</div>
        <div class="row shortcuts" style="justify-content: center">
          <button v-for="s in recentServices" :key="s.id" class="btn secondary" @click="openRecent(s)">{{ titleOf(s) }}</button>
        </div>
      </section>

      <!-- 結果：GO / ASK / NONE -->
      <section v-else class="col">
        <div class="card">
          <div class="muted" style="font-size: 0.85em">{{ t('heard') }}{{ heard }}</div>
          <div v-if="translated" class="muted" style="font-size: 0.85em">{{ t('translated') }}{{ translated }}</div>
        </div>
        <div v-if="langOffer" class="card col" style="text-align: center">
          <div style="font-weight: 700">{{ t('lang_offer_en') }}</div>
          <div class="row" style="justify-content: center">
            <button class="btn" style="min-height: 2.4em" @click="setLang(langOffer!); langOffer = null">{{ t('lang_offer_yes') }}</button>
            <button class="btn secondary" style="min-height: 2.4em" @click="langOffer = null">{{ t('lang_offer_no') }}</button>
          </div>
        </div>

        <template v-if="decision?.kind === 'GO'">
          <h2>{{ t('go_q', { title: titleOf(svc(decision.code)!) }) }}</h2>
          <button class="btn big" @click="go(decision.code)">{{ t('go_yes') }} ➜</button>
          <button class="btn big secondary" @click="onReject([decision.code])">{{ t('go_no') }}</button>
        </template>

        <template v-else-if="decision?.kind === 'ASK'">
          <h2>{{ t('ask_q') }}</h2>
          <button v-for="c in decision.codes" :key="c" class="btn big" @click="go(c)">{{ titleOf(svc(c)!) }}</button>
          <button class="btn big secondary" @click="onReject(decision.codes)">{{ t('ask_none') }}</button>
        </template>

        <template v-else>
          <h2>{{ t('none_title') }}</h2>
          <button class="btn big secondary" @click="goAll">{{ t('none_all') }}</button>
          <button class="btn big secondary" @click="phoneCall('1999')">📞 {{ t('none_call') }}</button>
        </template>

        <button class="btn ghost" @click="reset">↺ {{ t('retry') }}</button>

      </section>
    </main>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; display: flex; flex-direction: column; }
.splash { position: fixed; inset: 0; z-index: 100; overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 30%, #4fd3c4 0%, #1f9fb3 45%, #0d3f52 100%); animation: splashOut 1.7s ease-in forwards; }
.splash .b { position: absolute; bottom: -14vh; border-radius: 50%; background: radial-gradient(circle at 35% 35%, rgba(255,255,255,.75), rgba(255,255,255,.08) 60%, rgba(255,255,255,.25));
  border: 1.5px solid rgba(255,255,255,.6); animation: rise 1.2s cubic-bezier(.2,.6,.3,1) forwards; }
.splash .brand { position: relative; text-align: center; color: #fff; animation: pop .7s cubic-bezier(.2,1.5,.4,1); }
.splash .totem { width: 210px; height: 210px; display: block; margin: 0 auto 4px; filter: drop-shadow(0 0 18px rgba(167,243,255,.55)); animation: totemIn .9s cubic-bezier(.2,1.3,.4,1); }
.splash .curve { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw .95s cubic-bezier(.4,0,.2,1) forwards; filter: drop-shadow(0 0 4px rgba(255,255,255,.8)); }
.splash.hold { animation: none; }
.splash .ring { transform-origin: 120px 120px; animation: spin 6s linear infinite; }
.splash .ring-b { animation-direction: reverse; animation-duration: 9s; }
.splash .orbit { transform-origin: 120px 120px; animation: spin 2.4s linear infinite; }
.splash .orbit-r { animation-direction: reverse; animation-duration: 3.6s; }
.splash .core { animation: corePulse 1.1s ease-in-out infinite; transform-origin: 120px 120px; }
@keyframes draw { to { stroke-dashoffset: 0; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes corePulse { 50% { transform: scale(1.5); opacity: .7; } }
@keyframes totemIn { from { transform: scale(.4) rotate(-40deg); opacity: 0; } }
.splash h1 { font-size: 3.2em; margin: .05em 0 0; letter-spacing: 3px; font-weight: 900; text-shadow: 0 8px 28px rgba(0,0,0,.3); background: linear-gradient(90deg,#fff,#dffbf6,#fff); -webkit-background-clip: text; background-clip: text; color: transparent; }
.splash p { margin: .25em 0 0; opacity: .92; font-weight: 600; letter-spacing: 1px; }
@keyframes rise { to { transform: translateY(-125vh) scale(1.4); opacity: 0; } }
@keyframes pop { from { transform: scale(.3) rotate(-8deg); opacity: 0; } }
@keyframes bob { 50% { transform: translateY(-8px) scale(1.06); } }
@keyframes splashOut { 0%, 72% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }
.top { display: flex; align-items: center; gap: 0.6em; padding: 0.8em 1em; background: var(--tp-primary); color: #fff; }
.top .muted { color: #e6f7fa; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; padding: 1em; z-index: 50; }
.modal .card { width: 100%; max-width: 420px; }
.mic {
  border: 0; border-radius: 50%; width: 11em; height: 11em; margin: 0.5em auto;
  background: var(--tp-primary); color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .3em;
  font-size: 1em; font-weight: 700; box-shadow: 0 8px 24px rgba(46,182,199,.45); cursor: pointer;
}
.mic .icon { font-size: 3em; }
.mic.on { background: var(--tp-warn); animation: pulse 1s infinite; }
@keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.06); } 100% { transform: scale(1); } }
h1 { font-size: 1.5em; } h2 { font-size: 1.3em; margin: 0.3em 0; }
.btn.secondary.on { background: var(--tp-primary); color: #fff; }
select, input { font: inherit; padding: 0.4em; }
</style>
