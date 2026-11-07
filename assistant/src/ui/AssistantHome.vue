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
/** 啟動泡泡動畫：按「小幫手」進來的那 1.2 秒。?nosplash 可關 */
const splash = ref(!new URLSearchParams(location.search).has('nosplash') && !location.hash.includes('debug'));
const bubbles = Array.from({ length: 14 }, (_, i) => ({ left: (i * 37) % 100, size: 18 + ((i * 53) % 60), delay: (i % 7) * 0.06, dur: 0.9 + ((i * 29) % 50) / 100 }));
setTimeout(() => (splash.value = false), 1400);

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
    <div v-if="splash" class="splash" @click="splash = false">
      <span v-for="(b, i) in bubbles" :key="i" class="b" :style="{ left: b.left + '%', width: b.size + 'px', height: b.size + 'px', animationDelay: b.delay + 's', animationDuration: b.dur + 's' }"></span>
      <div class="brand">
        <div class="orb">🫧</div>
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
  background: radial-gradient(circle at 50% 30%, #6fe0cc 0%, #2eb6c7 45%, #176b78 100%); animation: splashOut 1.4s ease-in forwards; }
.splash .b { position: absolute; bottom: -14vh; border-radius: 50%; background: radial-gradient(circle at 35% 35%, rgba(255,255,255,.75), rgba(255,255,255,.08) 60%, rgba(255,255,255,.25));
  border: 1.5px solid rgba(255,255,255,.6); animation: rise 1.2s cubic-bezier(.2,.6,.3,1) forwards; }
.splash .brand { position: relative; text-align: center; color: #fff; animation: pop .7s cubic-bezier(.2,1.5,.4,1); }
.splash .orb { font-size: 4.5em; line-height: 1; filter: drop-shadow(0 10px 30px rgba(255,255,255,.6)); animation: bob 1.2s ease-in-out infinite; }
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
