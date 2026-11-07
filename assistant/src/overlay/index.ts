/**
 * guide-overlay：注入到每一個服務頁的引導層（P2「陪我做」）。
 *
 * - 服務頁一行都不改：變暗 + 發亮 + 一句話說明 疊在原本的頁面上
 * - 定位用畫面上看得到的東西（text / label / role / css），找不到就退回純文字說明
 * - 三種完成方式：自己點或打字、說出要填的內容（規則抽取）、說出指令（規則 → 決策器）
 * - 狀態存在 sessionStorage，SPA 換頁或重新整理都接得回來
 *
 * 啟動來源（擇一）：
 *   1. 網址 hash：#tpguide=guide_water_fee&mode=elder&lang=zh（小幫手跳轉時帶的）
 *   2. sessionStorage tp_guide（同源時小幫手也會寫）
 *   3. 自動提示：網址符合 guides/index.json 的 match.url → 問「要我陪你做嗎？」
 */
import { matchCommandRule, type CommandId } from '../core/rules';
import { extract, type AcceptKind } from '../core/extract';
import { decide } from '../core/decide';
import { fmt, type Copy } from '../core/copy';
import type { Catalog, Decider, Option } from '../core/types';
import { commandRequest, commandOptions, setCatalog } from '../core/catalog';
import { LlmDecider } from '../engines/llm';
import { TinyDecider } from '../engines/tiny';
import { stt, tts, phoneCall, onSttPartial } from '../core/bridge';
import { normalizeText } from '../engines/tiny';
import { loadSitemap, findPath, elementsOf, type Sitemap, type SiteElement } from '../core/sitemap';
import { tplog, hookConsole, onTripleTap } from '../core/log';

/* ---------- 設定 ---------- */

const W = window as any;
const BASE: string = (W.__TP_ASSISTANT_BASE__ as string) || location.origin + '/assistant/';
const LLM_URL: string = W.__TP_LLM_URL__ || lsGet('tp_assistant_llm_url') || '/llm';
const STUCK_MS = 45000;
/** 迷路偵測門檻（放在最前面：boot() 在模組載入時就會呼叫 startLostWatcher，const 不能放後面，否則 TDZ） */
interface LostCfg {
  routes: number; routesWindowMs: number;
  taps: number; tapsWindowMs: number;
  flips: number; flipsWindowMs: number;
  cooldownMs: number;
}
const LOST: LostCfg = Object.assign(
  { routes: 99, routesWindowMs: 60000, taps: 5, tapsWindowMs: 6000, flips: 99, flipsWindowMs: 12000, cooldownMs: 120000 },
  (window as any).__TP_LOST_THRESHOLDS__ || {}
);

type Lang = string;
interface Locator {
  text?: string;
  exact?: boolean;
  label?: string;
  role?: 'button' | 'input' | 'link';
  css?: string;
  /** 下拉選單裡的選項文字：目標是 <select>，「幫我按」會直接選好 */
  option?: string;
  /** 只在「含有這段文字的那張卡片」裡面找（例如某個訂閱項目裡的「訂閱」鈕） */
  within?: string;
}
interface Step {
  id: string;
  url?: string;
  find: Locator[];
  say: Record<Lang, string>;
  /** {{entity}} 沒有值時改用這句 */
  say_default?: Record<Lang, string>;
  more?: Record<Lang, string>;
  done_when: 'click' | 'input' | 'route' | 'manual' | 'change';
  accept?: AcceptKind;
  min_len?: number;
  max_len?: number;
  confirm?: boolean;
  final?: boolean;
  skip_if_visible?: Locator[];
  skip_if_missing?: boolean;
  /** 預填用哪個參數（預設用 step.id） */
  prefill?: string;
}
interface Guide {
  id: string;
  /** false：這份導覽不會「使用者會了就躲起來」（多層清單每一下都要亮框帶路） */
  collapse?: boolean;
  /** 'quiet'：最後一步做完就安靜退場（不顯示「完成了」）*/
  finish?: 'quiet';
  title: Record<Lang, string>;
  entry?: string;
  match?: { url: string };
  steps: Step[];
}
type Mode = 'kid' | 'normal' | 'elder';
/** 目前模式（文案覆蓋用）：Ui 建立時設定 */
let curMode: Mode = 'normal';
const SCALE: Record<Mode, number> = { kid: 1.1, normal: 1, elder: 1.25 };

interface State {
  id: string;
  step: number;
  mode: Mode;
  lang: Lang;
  /** 小幫手從使用者的話抽出的參數（例如 fill_water_number → 1234567890），到對應步驟時預填並請使用者確認 */
  params?: Record<string, string>;
}

/* ---------- 入口 ---------- */

if (!W.__tpGuideLoaded) {
  W.__tpGuideLoaded = true;
  hookConsole('overlay');
  patchHistory();
  patchViewport();
  boot().catch((e) => console.warn('[tp-guide]', e));
}

async function boot() {
  if (location.pathname.startsWith('/assistant')) return; // 小幫手主頁自己有 UI
  startLostWatcher(); // 每一頁都看：亂點亂滑、一直換頁 → 小幫手登場
  const fromHash = readHash();
  let state: State | null = fromHash ?? readState();
  if (fromHash) saveState(fromHash);
  // 沒有進行中的陪伴就安靜：小幫手是獨立的微服務，不主動跳出來問；使用者亂點 5 下才登場
  if (!state) {
    mountFab();
    return;
  }
  await start(state);
}

/** 服務頁右下角的小幫手泡泡鈕：隨時叫得出小幫手（登場畫面與導覽進行中會收起來） */
function mountFab() {
  if (document.getElementById('tp-fab-host')) return;
  const host = document.createElement('div');
  host.id = 'tp-fab-host';
  const root = host.attachShadow({ mode: 'open' });
  const lang = lsGet('tp_assistant_lang') || 'zh';
  const label = { zh: '小幫手', en: 'Helper', vi: 'Trợ lý', id: 'Asisten', th: 'ผู้ช่วย' }[lang] || '小幫手';
  root.innerHTML = `
    <style>
      :host { all: initial; }
      button { position: fixed; right: 12px; bottom: calc(84px + env(safe-area-inset-bottom)); z-index: 2147482998; display: flex; align-items: center; gap: 6px;
               border: 0; border-radius: 999px; padding: 10px 14px 10px 12px; background: #2eb6c7; color: #fff; font: 700 15px 'PingFang TC', Roboto, system-ui, sans-serif;
               box-shadow: 0 6px 18px rgba(46,182,199,.45); -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; animation: in .4s cubic-bezier(.2,1.4,.4,1); }
      button:active { transform: scale(.95); }
      .ic { display: inline-flex; line-height: 1; }
      @keyframes in { from { transform: scale(.5); opacity: 0; } }
    </style>
    <button type="button" aria-label="${label}"><span class="ic"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg></span><span>${label}</span></button>`;
  root.querySelector('button')!.addEventListener('click', (ev) => {
    ev.stopPropagation();
    tplog('overlay', 'fab → assistant', { url: location.pathname });
    location.href = `${BASE}?lang=${lang}&from=fab`;
  });
  document.body.appendChild(host);
}
function unmountFab() {
  document.getElementById('tp-fab-host')?.remove();
}

async function start(state: State) {
  unmountFab();
  const guide = await fetchJson<Guide>(`${BASE}guides/${state.id}.json`);
  // 使用者按返回離開了這個流程（網址既不是導覽範圍、也不是任何一步的頁面）→ 清掉狀態、不顯示
  const inScope = (guide.match && new RegExp(guide.match.url).test(location.pathname)) || guide.steps.some((st) => st.url && new RegExp(st.url).test(location.pathname));
  if (!inScope) {
    clearState();
    mountFab(); // 不在範圍就當作沒有陪伴：泡泡鈕還是要有
    return;
  }
  const copy = await loadCopy(state.lang);
  const runner = new Runner(guide, state, copy);
  W.__tpGuide = runner;
  await runner.run();
}

/* ---------- 執行器 ---------- */

class Runner {
  ui: Ui;
  target: HTMLElement | null = null;
  cleanup: Array<() => void> = [];
  stuckTimer = 0;
  decider: Decider | null = null;
  catalog: Catalog | null = null;
  lastPath = location.pathname;
  busy = false;

  constructor(
    public guide: Guide,
    public state: State,
    public copy: Copy
  ) {
    this.ui = new Ui(state.mode);
    window.addEventListener('tp:locationchange', () => this.onRoute());
    const vv = window.visualViewport;
    if (vv) {
      const onVv = () => this.onViewport();
      window.addEventListener('resize', onVv);
      vv.addEventListener('resize', onVv);
      vv.addEventListener('scroll', onVv);
      this.cleanupAll.push(() => {
        vv.removeEventListener('resize', onVv);
        vv.removeEventListener('scroll', onVv);
      });
    }
    const mo = new MutationObserver(throttle(() => this.onMutate(), 200));
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    this.cleanup.push(() => mo.disconnect());

  }

  cleanupAll: Array<() => void> = [];
  keyboardOpen = false;

  vvTimer = 0;
  /** 鍵盤彈出 / 收起：遲滯判定（<70% 開、>85% 關）+ 去抖，避免動畫期間來回切換 */
  maxViewportH = 0;
  onViewport() {
    clearTimeout(this.vvTimer);
    this.vvTimer = window.setTimeout(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      // interactive-widget=resizes-content 時 innerHeight 會跟著鍵盤縮，所以要跟「看過的最大高度」比，不然永遠算不出鍵盤開著
      this.maxViewportH = Math.max(this.maxViewportH, vv.height, window.innerHeight);
      const ratio = vv.height / this.maxViewportH;
      const open = this.keyboardOpen ? ratio < 0.85 : ratio < 0.7;
      if (open !== this.keyboardOpen) {
        this.keyboardOpen = open;
        this.ui.setKeyboard(open);
      }
    }, 120);
  }

  get step(): Step | undefined {
    return this.guide.steps[this.state.step];
  }
  tx(obj: Record<Lang, string> | undefined): string {
    if (!obj) return '';
    return this.tpl(obj[this.state.lang] ?? obj.zh ?? Object.values(obj)[0] ?? '');
  }
  /** {{entity}}、{{param}} → state.params；沒有值的保留空字串 */
  tpl(text: string): string {
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => this.state.params?.[k] ?? '').replace(/\{\s*\w+\s*\}/g, '');
  }
  /** 定位器裡的模板；沒有值的定位器整個略過 */
  finders(step: Step): Locator[] {
    return this.fillLocators(step.find);
  }
  /** 把 {{entity}} 之類的模板填進定位器；沒有值的定位器直接丟掉（skip_if_visible 也用這個） */
  fillLocators(list: Locator[]): Locator[] {
    return list
      .map((f) => {
        const out: Locator = { ...f };
        for (const k of ['text', 'label', 'css', 'option'] as const) {
          const v = f[k];
          if (!v) continue;
          if (/\{\{\w+\}\}/.test(v)) {
            const filled = this.tpl(v);
            if (!filled || /^\s*$/.test(filled)) return null;
            out[k] = filled;
          }
        }
        return out;
      })
      .filter((f): f is Locator => !!f);
  }
  t(key: string, params?: Record<string, string | number>) {
    return t(this.copy, key, params);
  }
  /** 長輩與小朋友：每一步唸出來、顯示補充說明、付款前多確認 */
  get loud() {
    return this.state.mode !== 'normal';
  }

  async run() {
    this.clearStep();
    // 換步驟：面板不再鎖邊；上一步的欄位若還有焦點就放掉（否則鍵盤收了面板還卡在底下蓋住下一個按鈕）
    this.ui.sideLocked = false;
    const act = document.activeElement as HTMLElement | null;
    if (act && /^(INPUT|TEXTAREA|SELECT)$/.test(act.tagName) && !this.step?.accept) act.blur();
    if (!this.collapsed) this.ui.setDim(true); // 一進來就先變暗，找到目標再亮框（躲起來時不暗）
    this.ui.place(null); // 先把上一步的亮框收掉，找到新目標再亮
    let step = this.step;
    if (!step) return this.finish();

    // 目前這一步不在這個頁面，但後面有某一步的網址符合 → 直接跳過去（使用者自己走到了，或目錄直接送到內頁）
    if (step.url && !new RegExp(step.url).test(location.pathname)) {
      const later = this.guide.steps.findIndex((s, i) => i > this.state.step && s.url && new RegExp(s.url).test(location.pathname));
      if (later > 0) {
        this.state.step = later;
        step = this.step!;
      }
    }
    // 已經做完的步驟（欄位有值、要點的東西已經展開…）直接跳過：使用者領先就追上去
    while (step && !step.final && this.state.step + 1 < this.guide.steps.length && this.isStepDone(step)) {
      this.state.step++;
      step = this.step!;
    }
    saveState(this.state);
    // 連續兩步都自己完成 → 使用者會了，收成小圓鈕躲起來（卡住或點圓鈕再出來）
    if (!this.collapsed && this.selfStreak >= 2 && this.guide.collapse !== false) this.collapse();
    const quiet = this.collapsed;

    const onRightPage = !step.url || new RegExp(step.url).test(location.pathname);
    let say = this.tx(step.say);
    if (/「」/.test(say) && step.say_default) say = this.tx(step.say_default);
    const more = this.tx(step.more);
    if (!quiet) this.renderPanel(say, more);

    if (!onRightPage) {
      // 不在這一步的頁面：用 sitemap 規劃從現在這一頁要點什麼才會到那裡
      const planned = quiet ? false : await this.planTo(new RegExp(step.url!));
      if (planned) return;
      this.ui.place(null);
      return;
    }

    // 等目標出現的同時也一直看「已經完成的跡象」（例如地圖標記已經載入）：資料慢半拍時不用傻等 6 秒
    const skipNow = () => !!step.skip_if_visible && this.fillLocators(step.skip_if_visible).some((l) => isVisible(locate([l])));
    if (skipNow()) return this.advance();
    const SKIP = {} as unknown as HTMLElement;
    // 可有可無的步驟（skip_if_missing）只等 1.5 秒，不然每一步都要等滿才跳過
    let el = await waitFor<HTMLElement>(() => (skipNow() ? SKIP : locate(this.finders(step))), step.skip_if_missing ? 1500 : 6000);
    if (el === SKIP) return this.advance();
    let picked: { label: string; score: number } | null = null;
    if (!el) {
      if (step.skip_if_missing) return this.advance();
      // 版面感知後備：抓這一頁所有可互動元素，用這一步的意圖挑最像的
      const goal = this.state.params?.entity || this.tpl(step.find[0]?.text || step.find[0]?.label || step.find[0]?.option || '') || say.replace(/[「」]/g, '');
      const best = await this.autoPick(goal, step);
      if (best) {
        el = best.el;
        picked = { label: best.label, score: best.score };
      }
    }
    if (!el) {
      tplog('overlay', `step ${this.state.step + 1} ${step.id}: target not found`, { url: location.pathname, find: step.find }, 'warn');
      this.ui.setDim(false); // 找不到就不要把整頁變黑
      this.ui.place(null);
      if (quiet) {
        // 躲起來時找不到下一步的東西（例如查無帳單的終點頁）：要出來說一聲，不能默默卡住
        this.collapsed = false;
        this.ui.expand();
      }
      const hint = this.tpl(step.find[0]?.text || step.find[0]?.label || step.find[0]?.option || '');
      this.renderPanel(hint ? this.t('guide_not_found', { text: hint }) : say, more, true);
      return;
    }
    if (picked) {
      say = this.t('guide_maybe', { text: picked.label });
    } else {
      // 說明寫「點「{{entity}}」」但這一頁找到的是後備目標（例如「更多項目」）→ 改用 say_default，不要叫人點一個不在畫面上的東西
      const ent = this.state.params?.entity;
      if (ent && step.say_default && !(el.textContent || '').includes(ent)) {
        say = this.tx(step.say_default);
      }
    }
    // 目標被提示視窗（modal）蓋住 → 先把視窗的「確認 / 關閉」當臨時目標，關掉後再回到這一步
    const cover = coveringButton(el);
    if (cover && this.coverAttempts >= 2) {
      // 按了兩次還關不掉（例如定位被拒、提示一直跳）：不再代按，請使用者處理或離開
      this.ui.setDim(false);
      this.ui.place(null);
      this.ui.show({ say: this.t('guide_popup_stuck'), stepText: this.t('guide_step', { n: this.state.step + 1, total: this.guide.steps.length }), buttons: [{ label: this.t('guide_next') + ' ›', onClick: () => { this.coverAttempts = 0; this.run(); } }], icons: [{ label: ICON.close, title: this.t('guide_exit'), onClick: () => this.exit() }] });
      return;
    }
    if (cover) {
      if (quiet) {
        // 躲起來的時候：亮框指向提示視窗裡的那顆鈕（不然亮框會框在視窗底下的東西上，變成一條怪橫條），按了就重跑這一步
        this.target = cover;
        this.startTracking();
        const h = () => setTimeout(() => this.run(), 700);
        cover.addEventListener('click', h, { once: true });
        this.cleanup.push(() => cover.removeEventListener('click', h));
        return;
      }
      this.coverAttempts++;
      this.target = cover;
      this.startTracking();
      this.selectValue = null;
      this.ui.show({
        say: this.t('guide_close_popup', { text: cover.textContent?.trim().slice(0, 10) || this.t('guide_close') }),
        stepText: this.t('guide_step', { n: this.state.step + 1, total: this.guide.steps.length }),
        buttons: [{ label: `${this.t('guide_press_for_me', { text: cover.textContent?.trim().slice(0, 10) || this.t('guide_close') })}`, onClick: () => cover.click() }], // 下面的 click 監聽器會重跑（之前這裡又排一次 run → 次數算兩次，馬上變成「關不掉」）
        icons: [{ label: ICON.close, title: this.t('guide_exit'), onClick: () => this.exit() }]
      });
      this.ui.hideInput();
      const h = () => setTimeout(() => this.run(), 700);
      cover.addEventListener('click', h, { once: true });
      this.cleanup.push(() => cover.removeEventListener('click', h));
      return;
    }
    this.selectValue = pendingOption && pendingOption.select === el ? pendingOption : null;
    if (!coveringButton(el)) this.coverAttempts = 0;

    if (step.confirm && this.loud && !quiet) {
      const label = this.tpl(step.find[0]?.text || '');
      const ok = await this.ui.ask(this.t('guide_confirm_q', { text: label }), this.t('guide_confirm_yes'), this.t('guide_confirm_no'));
      if (!ok) return; // 留在這一步，使用者自己決定
      this.renderPanel(say, more);
    }

    this.target = el;
    tplog('overlay', `step ${this.state.step + 1} ${step.id} → ${el.tagName}|${(el.textContent || (el as HTMLInputElement).placeholder || '').trim().slice(0, 20)}${picked ? ' (autoPick ' + picked.score.toFixed(2) + ')' : ''}${quiet ? ' (quiet)' : ''}`, { url: location.pathname });
    this.watchDone(step, el);
    this.armStuck();
    if (quiet) {
      // 躲起來：面板收成小圓鈕、畫面不變暗，但亮框還是要帶路（跟著亮框走永遠走得通）
      this.ui.setDim(false);
      this.startTracking();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      this.ui.place(el);
      return;
    }
    if (this.freeStep === this.state.step) {
      // 使用者說「不是這個」：不框、不暗，讓他自己從清單選；選好監聽器會前進
      this.ui.setDim(false);
      this.ui.place(null);
      this.ui.hideInput();
      this.ui.show({ say: this.t('guide_free_pick'), stepText: this.t('guide_step', { n: this.state.step + 1, total: this.guide.steps.length }), buttons: [], icons: [{ label: ICON.close, title: this.t('guide_exit'), onClick: () => this.exit() }] });
      return;
    }
    // 陪伴：框住頁面上真正的欄位 / 按鈕，使用者自己操作 App；面板只說明該做什麼
    this.startTracking();
    this.renderPanel(say, more);
    this.ui.hideInput();
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => this.ui.place(this.target), 350);
    this.ui.place(el);
    // 要填的欄位：直接把游標放進去（數字欄位開數字鍵盤），只有這一個地方能填；每一步只自動聚焦一次
    // （頁面剛載入時 Vue 可能把欄位換掉：上次聚焦的那個元素已經不在頁面上就再聚焦一次）
    if (step.accept && /^(INPUT|TEXTAREA)$/.test(el.tagName) && (this.focusedStep !== this.state.step || !this.focusedEl || !document.contains(this.focusedEl)) && !(el as HTMLInputElement).value) {
      this.focusedStep = this.state.step;
      this.focusedEl = el;
      if (step.accept === 'digits' || step.accept === 'phone') el.setAttribute('inputmode', step.accept === 'phone' ? 'tel' : 'numeric');
      const token = this.stepToken;
      setTimeout(() => {
        if (token === this.stepToken && document.contains(el)) (el as HTMLElement).focus();
      }, 450);
    }
    if (this.loud) this.speak(say + (more ? '。' + more : ''));

    // 工具層帶進來的參數：預填 + 請使用者確認（只填使用者自己說過的內容）
    const preKey = step.prefill ?? step.id;
    const pre = this.state.params?.[preKey];
    if (pre && step.accept && (el as HTMLInputElement).value === '') {
      delete this.state.params![preKey];
      saveState(this.state);
      this.fill(pre);
    }

    // 下拉選單：使用者已經說了要哪一個（例如「找廁所」→ 公廁）→ 直接幫他選好並確認，
    // 不用在系統選單裡找（手機的原生選單打開時網頁什麼都框不到）
    if (el.tagName === 'SELECT' && this.selectValue && (el as HTMLSelectElement).value !== this.selectValue.value && !this.askedSelect.has(step.id)) {
      this.askedSelect.add(step.id);
      const v = this.selectValue;
      const token = this.stepToken;
      const ok = await this.ui.ask(this.t('guide_select_confirm', { text: v.text }), this.t('guide_confirm_yes'), this.t('guide_self_pick'));
      if (token !== this.stepToken) return;
      if (ok) {
        const sel = el as HTMLSelectElement;
        sel.value = v.value;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true })); // change 監聽器會前進
        this.selfStreak = 0;
      } else {
        this.renderPanel(say, more);
        if (this.loud) this.speak(say);
      }
    }
  }

  renderPanel(say: string, more: string, manualNext = false) {
    const step = this.step!;
    const showMore = this.loud || manualNext;
    const isSelect = !!this.target && this.target.tagName === 'SELECT';
    const clickable = !!this.target && (/^(BUTTON|A|LABEL)$/.test(this.target.tagName) || isSelect);
    const selOpt = isSelect ? (this.selectValue ?? (pendingOption && pendingOption.select === this.target ? pendingOption : null)) : null;
    // 按鈕名稱：定位器的文字 → 元素文字 → 無障礙名稱 → 這一步的說明（「按放大鏡」→「放大鏡」）；圖示鈕才不會變成「幫我按「」」
    const anyText = step.find.map((l) => this.tpl(l.text || l.label || l.option || '')).find((t) => t) || '';
    const aria = this.target?.getAttribute('aria-label') || this.target?.getAttribute('title') || '';
    const label = isSelect ? (selOpt ? selOpt.text : '') : (anyText || this.target?.textContent?.trim().slice(0, 12) || aria.slice(0, 12) || say.replace(/^[按點點選]+/, '').replace(/[「」。！]/g, '').slice(0, 12));
    // 主要動作鍵：有按鈕目標 → 幫我按「查詢」；其他 → 下一步（輸入欄位會先檢查）
    const mains: PanelButton[] = [];
    if (clickable) {
      // 使用者自己點畫面上框起來的東西；長輩 / 小朋友多一顆「幫我按」當備援
      if (this.loud) mains.push({ label: `${isSelect && !label ? this.t('guide_pick_one') : this.t(isSelect ? 'guide_select_for_me' : 'guide_press_for_me', { text: label })}`, secondary: true, onClick: () => this.doAction() });
    } else if (step.done_when === 'manual' || manualNext || step.accept) {
      mains.push({ label: (step.accept ? this.t('guide_filled_next') : this.t('guide_next')) + ' ›', onClick: () => this.doAction() });
    }
    this.ui.show({
      say,
      more: showMore ? more : '',
      stepText: this.t('guide_step', { n: this.state.step + 1, total: this.guide.steps.length }),
      buttons: [
        // 數字欄位不用「用說的」（辨識數字不可靠）：直接用數字鍵盤
        ...(step.accept && step.accept !== 'digits' && step.accept !== 'phone' ? [{ label: ICON.mic, icon: true, title: this.t('guide_voice'), onClick: () => this.onVoice() }] : []),
        ...(step.accept ? [{ label: ICON.keyboard, icon: true, secondary: true, title: this.t('guide_keyboard'), onClick: () => this.keyboard() }] : []),
        ...mains
      ],
      icons: [
        { label: ICON.help, title: this.t('guide_help'), onClick: () => this.help() },
        { label: ICON.speaker, title: this.t('guide_repeat'), onClick: () => this.speak(say + (more ? '。' + more : '')) },
        { label: ICON.back, title: this.t('guide_back'), onClick: () => this.goBack() },
        { label: ICON.close, title: this.t('guide_exit'), onClick: () => this.exit() }
      ],
      // 框的東西不是使用者要的（例如小幫手猜錯分類）→ 這一步自己選，選好再接手
      extra: this.target && step.done_when !== 'manual' ? { label: this.t('guide_not_this'), onClick: () => this.notThis() } : undefined
    });
  }

  /** 這一步交給使用者自己選：收掉亮框與變暗，監聽器留著，做完就繼續 */
  freeStep = -1;
  notThis() {
    this.freeStep = this.state.step;
    tplog('overlay', 'not this → free pick', { step: this.state.step });
    this.run();
  }

  selectValue: { select: HTMLSelectElement; value: string; text: string } | null = null;
  coverAttempts = 0;
  /** 這一步已經問過「幫你選 X 好嗎」（不要每次重新定位都再問） */
  askedSelect = new Set<string>();

  sitemap: Sitemap | null | undefined = undefined;

  /** 用 sitemap 找路：從現在的頁面到符合 target 的頁面，把路徑上的第一個元素當成臨時目標 */
  async planTo(target: RegExp): Promise<boolean> {
    if (this.sitemap === undefined) this.sitemap = await loadSitemap(BASE);
    if (!this.sitemap) return false;
    const path = findPath(this.sitemap, location.pathname, target);
    if (!path || !path.length) return false;
    const first = path[0];
    let el = document.querySelector<HTMLElement>(first.css);
    if (!el || !isVisible(el)) el = byText(first.label, false) ?? null;
    if (!el || !isVisible(el)) {
      // 要先展開 / 切分頁才看得到
      if (first.requires_click) {
        const pre = document.querySelector<HTMLElement>(first.requires_click);
        if (pre && isVisible(pre)) el = pre;
      }
      if (!el || !isVisible(el)) return false;
    }
    this.target = el;
    this.startTracking();
    const label = (el.textContent || first.label).trim().slice(0, 12);
    this.ui.show({
      say: this.t('guide_go_via', { text: label }),
      more: path.length > 1 ? path.map((e) => '「' + e.label.slice(0, 8) + '」').join(' → ') : '',
      stepText: this.t('guide_step', { n: this.state.step + 1, total: this.guide.steps.length }),
      buttons: [{ label: `${this.t('guide_press_for_me', { text: label })}`, onClick: () => el!.click() }],
      icons: [
        { label: ICON.speaker, title: this.t('guide_repeat'), onClick: () => this.speak(this.t('guide_go_via', { text: label })) },
        { label: ICON.close, title: this.t('guide_exit'), onClick: () => this.exit() }
      ]
    });
    this.ui.hideInput();
    if (this.loud) this.speak(this.t('guide_go_via', { text: label }));
    return true;
  }

  /** 版面感知：列出這一頁可互動的元素，依「目標文字」打分挑最像的（先字元相似度 + 別名，再問 LLM） */
  async autoPick(goal: string, step: Step): Promise<{ el: HTMLElement; label: string; score: number } | null> {
    const g = goal.trim();
    if (!g) return null;
    const cands = collectInteractive();
    if (this.sitemap === undefined) this.sitemap = await loadSitemap(BASE);
    if (this.sitemap) {
      for (const se of elementsOf(this.sitemap, location.pathname)) {
        const el = document.querySelector<HTMLElement>(se.css);
        if (el && isVisible(el) && !cands.some((c) => c.el === el)) cands.push({ el, label: se.label, kind: se.kind });
      }
    }
    if (!cands.length) return null;
    let best = cands.map((c) => ({ ...c, score: textSimilarity(g, c.label) })).sort((a, b) => b.score - a.score)[0];
    if (best.score >= 0.45) return best;
    // LLM（筆電 / 4090 的大模型才有用；手機上的 270M 只會挑服務，所以信心不夠就不採用）
    try {
      if (!this.catalog) this.catalog = await fetchJson<Catalog>(`${BASE}data/catalog.json`);
      const llm = new LlmDecider(LLM_URL);
      await llm.ready();
      const codes = 'ABCDEFGHIJKLMNOPQRSTUVWXYabcdefghijklmnopqrstuvwxy';
      const top = cands.slice(0, codes.length);
      const options = top.map((c, i) => ({ code: codes[i], label: c.label, desc: c.kind }));
      options.push({ code: 'Z', label: '都不是', desc: '沒有適合的' });
      const probs = await llm.score({ text: `目標：${g}。這一步：${this.tx(step.say)}`, options, instruction: '你是畫面導覽員。下面是畫面上可以點的東西，選出為了達成目標應該點的那一個，只輸出一個字母。', noneCode: 'Z', setId: 'ui_' + location.pathname });
      const d = decide(probs, 'Z', { go: 0.6, ask2: 2, ask3: 2 });
      if (d.kind === 'GO') {
        const i = codes.indexOf(d.code);
        if (i >= 0 && top[i]) return { ...top[i], score: probs[d.code] };
      }
    } catch {
      /* 沒有 LLM 就算了 */
    }
    return best.score >= 0.3 ? best : null;
  }

  /** 這一步是不是已經做完了（狀態感知） */
  isStepDone(step: Step): boolean {
    if (step.url && !new RegExp(step.url).test(location.pathname)) return false;
    if (step.skip_if_visible && this.fillLocators(step.skip_if_visible).some((l) => isVisible(locate([l])))) return true;
    if (step.done_when === 'change') {
      const el = locate(this.finders(step)) as HTMLSelectElement | null;
      if (!el || el.tagName !== 'SELECT') return false;
      if (pendingOption && pendingOption.select === el) return el.value === pendingOption.value && el.value !== '';
      return el.value !== ''; // 沒指定選項：有選就算完成
    }
    if (step.done_when === 'input') {
      const el = locate(this.finders(step)) as HTMLInputElement | null;
      if (!el) return false;
      const v = el.value ?? '';
      if (!v.trim()) return false;
      if (document.activeElement === el && !this.isComplete(step, v)) return false; // 還在打，不算完成
      if (!step.accept || step.accept === 'text') return true;
      const r = extract(v, step.accept, { minLen: step.min_len, maxLen: step.max_len });
      return r.ok && r.value === v.trim();
    }
    return false;
  }

  /** 「打滿就一定完成」：只有定長數字（min_len == max_len）而且碼數剛好才算 */
  isComplete(step: Step, v: string): boolean {
    if (step.accept !== 'digits' && step.accept !== 'phone') return false;
    if (!step.max_len || step.min_len !== step.max_len) return false;
    const n = (v.match(/\d/g) || []).length;
    if (n !== step.max_len) return false;
    const r = extract(v, step.accept, { minLen: step.min_len, maxLen: step.max_len });
    return r.ok && r.value === v.trim();
  }

  /** 下一步要操作的元素（在同一頁才找得到） */
  nextStepTarget(): HTMLElement | null {
    const next = this.guide.steps[this.state.step + 1];
    if (!next || this.step?.final) return null;
    if (next.url && !new RegExp(next.url).test(location.pathname)) return null;
    const el = locate(this.finders(next));
    return el && isVisible(el) ? el : null;
  }

  /** 下一步的一句話（「按放大鏡」），拿來提示「打完再…」 */
  nextStepHint(): string {
    const next = this.guide.steps[this.state.step + 1];
    if (!next || this.step?.final) return '';
    if (next.url && !new RegExp(next.url).test(location.pathname)) return '';
    return this.tx(next.say).replace(/[。！!]+$/, '');
  }

  /** 使用者領先：一次跳過 n 步（自己按了下一個鈕） */
  skipAhead(n: number) {
    if (this.busy) return;
    this.selfStreak++;
    this.busy = true;
    this.clearStep();
    const target = this.state.step + n;
    if (this.step?.final || target >= this.guide.steps.length) {
      this.busy = false;
      return this.finish();
    }
    this.state.step = target;
    this.freeStep = -1;
    saveState(this.state);
    this.busy = false;
    this.run();
  }

  /** 輸入不合格時說清楚為什麼：數字欄位講「要幾碼、現在幾碼」，不要只說聽不懂 */
  inputProblem(step: Step, v: string): string {
    if (step.accept === 'digits' || step.accept === 'phone') {
      const n = (v.match(/\d/g) || []).length;
      const need = step.min_len ?? step.max_len;
      if (!n) return this.t('guide_no_digits');
      if (need && n < need) return this.t('guide_digits_short', { need, have: n, missing: need - n });
      if (step.max_len && n > step.max_len) return this.t('guide_digits_long', { need: step.max_len, have: n });
      if (/[^\d\s-]/.test(v)) return this.t('guide_digits_only');
    }
    return this.t('guide_unknown');
  }

  /** 幫我做這一步：按鈕就代按（付款/送出類先問一次）、輸入欄位就檢查後前進 */
  async doAction() {
    const step = this.step;
    const el = this.target;
    if (!step) return;
    this.selfStreak = 0;
    if (el && el.tagName === 'SELECT') {
      const sel = el as HTMLSelectElement;
      const v = this.selectValue ?? pendingOption;
      const pickValue = (value: string) => {
        sel.value = value;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        const token = this.stepToken;
        if (step.done_when !== 'change') setTimeout(() => token === this.stepToken && this.advance(), 400); // change 類步驟由監聽器前進
      };
      if (v && v.select === sel) pickValue(v.value);
      else {
        // 沒有指定選項：把選項列在面板上讓使用者點，點了就幫他選好
        const opts = [...sel.options].filter((o) => o.value !== '').slice(0, 10);
        this.ui.choices(this.t('guide_pick_one'), opts.map((o) => ({ label: o.text.trim().slice(0, 16), onClick: () => pickValue(o.value) })));
      }
      return;
    }
    if (el && /^(BUTTON|A|LABEL)$/.test(el.tagName)) {
      if (step.confirm) {
        const ok = await this.ui.ask(this.t('guide_confirm_q', { text: this.tpl(step.find[0]?.text || '') }), this.t('guide_confirm_yes'), this.t('guide_confirm_no'));
        if (!ok) return;
      }
      el.click();
      const token = this.stepToken;
      if (step.done_when === 'manual' || step.done_when === 'input') setTimeout(() => token === this.stepToken && this.advance(), 300);
      return;
    }
    if (el && step.accept) {
      const v = (el as HTMLInputElement).value ?? '';
      const r = extract(v, step.accept, { minLen: step.min_len, maxLen: step.max_len });
      if (!r.ok || (step.accept !== 'text' && r.value !== v.trim())) {
        this.ui.flash(this.inputProblem(step, v));
        this.keyboard();
        return;
      }
    }
    this.advance();
  }

  watchDone(step: Step, el: HTMLElement) {
    switch (step.done_when) {
      case 'click': {
        const token = this.stepToken;
        const h = (ev: Event) => {
          const n = ev.target as Node | null;
          if (n && (el === n || el.contains(n) || (n as Element).contains?.(el))) setTimeout(() => token === this.stepToken && this.advanceBy('self'), 150);
        };
        document.addEventListener('click', h, true);
        this.cleanup.push(() => document.removeEventListener('click', h, true));
        break;
      }
      case 'input': {
        const token = this.stepToken;
        const input = el as HTMLInputElement;
        const valid = () => {
          const v = input.value ?? '';
          const r = step.accept ? extract(v, step.accept, { minLen: step.min_len, maxLen: step.max_len }) : { ok: v.trim().length > 0, value: v };
          return r.ok && r.value === v.trim();
        };
        let hinted = false;
        const check = () => {
          if (token !== this.stepToken) return; // 這一步已經結束
          if (this.confirming) return; // 預填中，等使用者按「對」
          const v = input.value ?? '';
          // 只有「定長數字打滿」（水號 10 碼）才自動下一步；自由文字 / 不定長度絕不提早截斷，
          // 等使用者按 Enter、面板的「填好了」、或自己去按畫面上的下一個鈕
          if (this.isComplete(step, v)) return this.advanceBy('self');
          if (!hinted && valid()) {
            hinted = true;
            const nx = this.nextStepHint();
            if (nx) this.ui.flash(this.t('guide_after_typing', { text: nx }));
          }
        };
        const h = debounce(check, 600);
        input.addEventListener('input', h);
        this.cleanup.push(() => input.removeEventListener('input', h));
        // Enter（單行欄位）= 我打完了。下一步還是欄位時，Enter 只代表「打完了」，不讓網頁拿去做別的事
        // （有話要說的表單按 Enter 會跳出地圖視窗）；下一步是按鈕（放大鏡）就放行，讓網頁照常送出
        const onKey = (e: KeyboardEvent) => {
          if (e.key !== 'Enter' || e.target !== input || input.tagName === 'TEXTAREA' || token !== this.stepToken) return;
          const next = this.guide.steps[this.state.step + 1];
          const nextIsField = !!next && (next.done_when === 'input' || next.done_when === 'change');
          if (nextIsField) {
            e.preventDefault();
            e.stopImmediatePropagation();
          }
          if (valid()) this.advanceBy('self');
        };
        document.addEventListener('keydown', onKey, true);
        this.cleanup.push(() => document.removeEventListener('keydown', onKey, true));
        // 使用者自己去按／點下一步的目標（放大鏡、查詢、下一個欄位）= 這一步做完了
        const onNext = (ev: Event) => {
          if (token !== this.stepToken || !valid()) return;
          const nextEl = this.nextStepTarget();
          const n = ev.target as Node | null;
          if (!nextEl || !n || !(nextEl === n || nextEl.contains(n))) return;
          const next = this.guide.steps[this.state.step + 1];
          const nextIsField = !!next && (next.done_when === 'input' || next.done_when === 'change');
          // 手機上按鈕被碰到會先 focusin 再 click：按鈕類的下一步只認 click（不然 focusin 先跳一步，click 就對不上了）
          if (ev.type === 'focusin' && !nextIsField) return;
          // 按鈕類的下一步也一起算做完（他已經按了）；欄位類的下一步就正常進到那一步
          const skipNextToo = ev.type === 'click' && !nextIsField;
          tplog('overlay', `step ${this.state.step + 1} ${step.id}: user went to next target (${ev.type}), skip ${skipNextToo ? 2 : 1}`);
          // 先停掉追蹤：網頁可能馬上跳出確認視窗，追蹤的「被蓋住就重跑」會搶在跳步之前把這一步重畫
          cancelAnimationFrame(this.raf);
          clearInterval(this.trackTimer);
          const go = (left: number) => {
            if (token !== this.stepToken) return;
            if (this.busy && left > 0) return void setTimeout(() => go(left - 1), 200);
            this.skipAhead(skipNextToo ? 2 : 1);
          };
          setTimeout(() => go(10), ev.type === 'click' ? 150 : 0);
        };
        document.addEventListener('click', onNext, true);
        document.addEventListener('focusin', onNext, true);
        this.cleanup.push(() => document.removeEventListener('click', onNext, true));
        this.cleanup.push(() => document.removeEventListener('focusin', onNext, true));
        check();
        break;
      }
      case 'change': {
        const token = this.stepToken;
        const h = () => {
          if (token === this.stepToken && this.isStepDone(step)) this.advanceBy('self');
        };
        el.addEventListener('change', h);
        this.cleanup.push(() => el.removeEventListener('change', h));
        break;
      }
      case 'manual': {
        // 目標是按鈕 / 連結：使用者自己點了就算完成（一般模式面板上沒有「下一步」鈕）
        if (!/^(BUTTON|A|LABEL)$/.test(el.tagName) && el.getAttribute('role') !== 'button') break;
        const token = this.stepToken;
        const h = (ev: Event) => {
          const n = ev.target as Node | null;
          if (n && (el === n || el.contains(n))) setTimeout(() => token === this.stepToken && this.advanceBy('self'), 150);
        };
        document.addEventListener('click', h, true);
        this.cleanup.push(() => document.removeEventListener('click', h, true));
        break;
      }
      case 'route':
        // onRoute() 會處理
        break;
    }
  }

  onRoute() {
    if (location.pathname === this.lastPath) return;
    this.lastPath = location.pathname;
    const step = this.step;
    if (!step) return;
    const inScope = (this.guide.match && new RegExp(this.guide.match.url).test(location.pathname)) || this.guide.steps.some((st) => st.url && new RegExp(st.url).test(location.pathname));
    if (!inScope) return this.exit();
    if (step.done_when === 'route' && this.target) return void this.advanceBy('self'); // 使用者自己走到下一頁
    // 其他情況：頁面變了就重新定位
    this.run();
  }

  onMutate() {
    if (!this.target) {
      // 還沒找到目標（可能是頁面還在載入），再試一次
      if (this.step && !this.busy) this.retryLocate();
      return;
    }
    if (!document.contains(this.target)) {
      this.target = null;
      this.run();
      return;
    }
    if (this.step && this.step.done_when !== 'manual' && this.isStepDone(this.step)) return void this.advanceBy('self');
    this.ui.place(this.target);
  }

  retryLocate = throttle(() => {
    const step = this.step;
    if (!step || this.target) return;
    if (step.url && !new RegExp(step.url).test(location.pathname)) return;
    if (locate(this.finders(step))) this.run();
  }, 800);

  /** 這一步已經自動聚焦過（不要每次重新定位都彈鍵盤） */
  focusedStep = -1;
  focusedEl: HTMLElement | null = null;
  /** 使用者自己做完的步驟：連勝 +1（兩步就躲起來） */
  selfStreak = 0;
  collapsed = false;
  advanceBy(who: 'self' | 'panel') {
    // 可有可無的結構步驟（點開分類、點項目…skip_if_missing）不算「使用者會了」：多層清單每一下都還要亮框帶路
    const structural = !!this.step?.skip_if_missing;
    if (who === 'self') {
      if (!structural) this.selfStreak++;
    } else this.selfStreak = 0;
    this.advance();
  }
  collapse() {
    this.collapsed = true;
    this.ui.collapse(this.t('guide_mini'), () => this.expand());
    tplog('overlay', 'collapsed (user is doing fine)');
  }
  expand() {
    if (!this.collapsed) return;
    this.collapsed = false;
    this.selfStreak = 0;
    this.ui.expand();
    this.run();
  }

  advance() {
    if (this.busy) return;
    this.busy = true;
    const step = this.step;
    this.clearStep();
    if (!step || step.final || this.state.step + 1 >= this.guide.steps.length) {
      this.busy = false;
      return this.finish();
    }
    this.state.step++;
    this.freeStep = -1;
    saveState(this.state);
    this.busy = false;
    this.run();
  }

  back() {
    if (this.state.step === 0) return;
    this.clearStep();
    this.state.step--;
    this.run();
  }

  /** 叫出鍵盤：把游標放回發亮的那個欄位（Android 收鍵盤不會 blur，所以先 blur 再 focus 才會再彈出來） */
  keyboard() {
    if (this.ui.focusInput()) return;
    const el = this.target as HTMLInputElement | null;
    if (!el) return;
    if (this.step?.accept === 'digits' || this.step?.accept === 'phone') el.setAttribute('inputmode', this.step?.accept === 'phone' ? 'tel' : 'numeric');
    el.scrollIntoView({ block: 'center' });
    if (document.activeElement === el) el.blur();
    el.focus();
    try {
      const n = el.value.length;
      el.setSelectionRange(n, n);
    } catch (_) { /* number / select 不支援 */ }
    this.ui.place(el);
  }

  /** 真的回上一頁：有瀏覽紀錄就 history.back()，導覽步驟也退一步 */
  goBack() {
    this.clearStep();
    if (this.state.step > 0) this.state.step--;
    saveState(this.state);
    if (history.length > 1) history.back();
    else this.run();
  }

  help() {
    this.selfStreak = 0;
    const more = this.tx(this.step?.more) || this.tx(this.step?.say);
    this.ui.forceMore(more);
    this.speak(more);
  }

  speak(text: string) {
    tts(text, this.copy.stt_lang || 'zh-TW');
  }

  /* ---- 語音：填內容 or 指令 ---- */
  async onVoice() {
    const step = this.step;
    if (!step) return;
    this.selfStreak = 0;
    this.ui.setListening(true);
    this.ui.live(this.t('guide_listening'));
    const off = onSttPartial((t) => this.ui.live('「' + t + '」'));
    const r = await stt(this.copy.stt_lang || 'zh-TW').catch(() => ({ text: '' }));
    off();
    this.ui.live('');
    this.ui.setListening(false);
    if (r.text) this.ui.flash(this.t('guide_heard') + r.text);
    const text = (r.text || '').trim();
    if (!text) return this.ui.flash(this.t('guide_unknown'));
    await this.handleUtterance(text);
  }

  async handleUtterance(text: string) {
    const step = this.step!;
    tplog('overlay', 'utterance: ' + text, { step: step.id });
    // 1. 規則
    let cmd: CommandId | null = matchCommandRule(text);
    // 2. 這一步要填東西：只抓要填的內容（數字欄位就只看數字）；抓不到就提示，不會誤判成「想做別的事」
    if (!cmd && step.accept && this.target) {
      const r = extract(text, step.accept, { minLen: step.min_len, maxLen: step.max_len });
      if (r.ok) return this.fill(r.value);
      if (step.accept === 'digits' || step.accept === 'phone') {
        this.ui.flash(this.t('guide_no_digits') + (r.value ? `（${r.value}）` : ''));
        this.keyboard();
        return;
      }
    }
    // 3. 交給決策器（1 個 token）；不確定就用按鈕追問，不猜
    if (!cmd) {
      const res = await this.classifyCommand(text, step);
      if (res && typeof res !== 'string') {
        cmd = await this.askCommand(res);
        if (!cmd) return;
      } else cmd = res;
    }
    switch (cmd) {
      case 'NEXT': return this.advance();
      case 'BACK': return this.goBack();
      case 'HELP': return this.help();
      case 'REPEAT': return this.speak(this.tx(step.say));
      case 'EXIT': return this.exit();
      case 'FILL': {
        if (step.accept && this.target) {
          const r = extract(text, step.accept, { minLen: step.min_len, maxLen: step.max_len });
          if (r.ok) return this.fill(r.value);
        }
        return this.ui.flash(this.t('guide_unknown'));
      }
      case 'OTHER': {
        // 太短的話不當作要換服務（常是語音沒聽清楚）
        if (text.length < 4) return this.ui.flash(this.t('guide_unknown'));
        const ok = await this.ui.ask(this.t('guide_other_q') + `「${text}」`, this.t('guide_confirm_yes'), this.t('guide_confirm_no'));
        if (ok) {
          clearState();
          location.href = `${BASE}?q=${encodeURIComponent(text)}&lang=${this.state.lang}`;
        } else this.renderPanel(this.tx(step.say), this.tx(step.more));
        return;
      }
      default:
        return this.ui.flash(this.t('guide_unknown'));
    }
  }

  /** 不確定時讓使用者點：你是要…？ */
  askCommand(candidates: CommandId[]): Promise<CommandId | null> {
    const label = (id: CommandId) => this.catalog?.commands.options.find((o) => o.id === id)?.label ?? id;
    return new Promise((resolve) => {
      this.ui.choices(this.t('guide_which_cmd'), [
        ...candidates.map((c) => ({ label: label(c), onClick: () => resolve(c) })),
        { label: this.t('guide_confirm_no'), secondary: true, onClick: () => resolve(null) }
      ]);
    });
  }

  async classifyCommand(text: string, step: Step): Promise<CommandId | CommandId[] | null> {
    try {
      if (!this.catalog) {
        this.catalog = await fetchJson<Catalog>(`${BASE}data/catalog.json`);
        setCatalog(this.catalog);
      }
      if (!this.decider) this.decider = await pickDecider(commandOptions(this.catalog), this.catalog);
      const req = commandRequest(this.catalog, text, this.tx(step.say));
      const probs = await this.decider.score(req);
      const idOf = (code: string) => this.catalog!.commands.options.find((o) => o.code === code)?.id as CommandId | undefined;
      const d = decide(probs, this.catalog.commands.none_code, { go: 0.6, ask2: 0.6, ask3: 0.6 });
      if (d.kind === 'GO') return idOf(d.code) ?? null;
      if (d.kind === 'ASK') return d.codes.map(idOf).filter((x): x is CommandId => !!x);
      if (d.kind === 'NONE' && probs[this.catalog.commands.none_code] >= 0.5) return 'OTHER';
      // 都不確定：拿前兩名來問
      const top = Object.entries(probs).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => idOf(c)).filter((x): x is CommandId => !!x);
      if (top.length) return top;
    } catch (e) {
      console.warn('[tp-guide] classify failed', e);
    }
    return null;
  }

  confirming = false;

  async fill(value: string) {
    const el = this.target as HTMLInputElement | null;
    if (!el) return;
    this.confirming = true;
    setNativeValue(el, value);
    this.ui.setInputValue(value);
    const ok = await this.ui.ask(this.t('guide_fill_confirm', { value }), this.t('guide_fill_yes'), this.t('guide_fill_no'));
    this.confirming = false;
    if (ok) {
      if (this.step?.done_when === 'input') this.advance();
      else this.renderPanel(this.tx(this.step?.say), this.tx(this.step?.more));
    } else {
      setNativeValue(el, '');
      this.renderPanel(this.tx(this.step?.say), this.tx(this.step?.more));
      this.onVoice();
    }
  }

  armStuck() {
    clearTimeout(this.stuckTimer);
    this.stuckTimer = window.setTimeout(async () => {
      if (!this.step) return;
      if (this.collapsed) return this.expand(); // 躲著但使用者卡住了 → 出來
      const ok = await this.ui.ask(this.t('guide_stuck'), this.t('guide_help'), '1999');
      if (ok) this.help();
      else phoneCall('1999');
    }, STUCK_MS);
  }

  raf = 0;
  lostSince = 0;

  /** 每一幀都重新量目標位置：分頁滑動、動畫、捲動、鍵盤都跟得上；目標不見就先收掉亮框，1.5 秒內找不回來就重新定位 */
  trackTimer = 0;
  startTracking() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.trackTimer);
    this.lostSince = 0;
    // 背景分頁 / WebView 暫停時 rAF 不跑，用 interval 補
    let tick = 0;
    this.trackTimer = window.setInterval(() => {
      const el = this.target;
      if (el && document.contains(el) && isVisible(el)) this.ui.place(el);
      // 每 600 ms 看一次「這一步已完成的跡象」（skip_if_visible）：使用者自己做了就跟上去，不要鎖在原地
      if (++tick % 4 === 0 && !this.busy && !this.confirming) {
        // 目標被後來跳出的視窗蓋住（例如按 Enter 跳出地圖）→ 重新定位，走「先關掉這個提示」
        if (el && this.target === el && !this.collapsed && this.coverAttempts < 2 && coveringButton(el)) {
          tplog('overlay', `step ${this.state.step + 1}: target got covered, re-run`);
          this.run();
          return;
        }
        const st = this.step;
        // 輸入步驟：欄位有值而且游標已經離開（例如用日曆選好日期、或點到別處）→ 這一步做完了
        if (st && st.done_when === 'input' && el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && document.activeElement !== el && !this.confirming) {
          const v = (el as HTMLInputElement).value ?? '';
          const r = st.accept ? extract(v, st.accept, { minLen: st.min_len, maxLen: st.max_len }) : { ok: v.trim().length > 0, value: v };
          if (v.trim() && r.ok && r.value === v.trim()) {
            tplog('overlay', `step ${this.state.step + 1} ${st.id}: filled and left the field, moving on`);
            this.advanceBy('self');
            return;
          }
        }
        if (st && st.skip_if_visible && this.fillLocators(st.skip_if_visible).some((l) => isVisible(locate([l])))) {
          tplog('overlay', `step ${this.state.step + 1} ${st.id}: done by user, moving on`);
          this.advanceBy('self');
        }
      }
    }, 150);
    const loop = () => {
      const el = this.target;
      if (!el) return;
      const gone = !document.contains(el) || !isVisible(el);
      if (gone) {
        this.ui.place(null);
        if (!this.lostSince) this.lostSince = Date.now();
        else if (Date.now() - this.lostSince > 1500) {
          this.target = null;
          this.run();
          return;
        }
      } else {
        this.lostSince = 0;
        this.ui.place(el);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** 每換一步就 +1；延遲觸發的監聽器（debounce / timer）拿到舊 token 就作廢，避免前進兩次 */
  stepToken = 0;

  clearStep() {
    this.stepToken++;
    cancelAnimationFrame(this.raf);
    clearInterval(this.trackTimer);
    clearTimeout(this.stuckTimer);
    for (const c of this.cleanup.splice(0)) c();
    this.target = null;
  }

  finish() {
    this.clearStep();
    clearState();
    this.collapsed = false;
    this.ui.expand();
    this.ui.setShield(false);
    this.ui.setDim(false);
    this.ui.place(null);
    if (this.guide.finish === 'quiet') {
      // 地圖類：最後一步點了標記，頁面會跳出地址卡，面板別蓋住它，直接退場
      for (const c of this.cleanupAll.splice(0)) c();
      this.ui.destroy();
      mountFab();
      return;
    }
    this.ui.show({ say: this.t('guide_done'), buttons: [{ label: this.t('guide_close'), onClick: () => this.ui.destroy() }] });
    if (this.loud) this.speak(this.t('guide_done'));
  }

  exit() {
    this.clearStep();
    for (const c of this.cleanupAll.splice(0)) c();
    clearState();
    sessionStorage.setItem('tp_guide_declined_' + this.guide.id, '1');
    this.ui.destroy();
  }
}

async function pickDecider(options: Option[], catalog: Catalog): Promise<Decider> {
  const sets = [{ options, instruction: catalog.commands.instruction, noneCode: catalog.commands.none_code, setId: 'commands' }];
  const llm = new LlmDecider(LLM_URL);
  try {
    await llm.ready({ sets });
    return llm;
  } catch {
    const tiny = new TinyDecider({ modelBase: `${BASE}models/` });
    await tiny.ready({ sets });
    return tiny;
  }
}

/* ---------- 定位：依照現有 DOM，多個方式依序嘗試 ---------- */

/** 定位結果附帶「要選的選項值」（下拉選單） */
export let pendingOption: { select: HTMLSelectElement; value: string; text: string } | null = null;

export function locate(finders: Locator[]): HTMLElement | null {
  pendingOption = null;
  // 有彈出視窗時先在裡面找
  const dialog = document.querySelector<HTMLElement>('[role=dialog], dialog[open]');
  const scopes: ParentNode[] = dialog ? [dialog, document] : [document];
  for (const scope0 of scopes) {
    for (const f of finders) {
      let el: HTMLElement | null = null;
      let scope: ParentNode = scope0;
      if (f.within) {
        // 先找到含那段文字的元素，往上找第一個「裡面有符合目標」的祖先，當作搜尋範圍
        const anchor = byText(f.within, false, undefined, scope0);
        if (!anchor) continue;
        let c: HTMLElement | null = anchor;
        let found: HTMLElement | null = null;
        while (c && c !== document.body) {
          const probe = f.css ? c.querySelector<HTMLElement>(f.css) : f.text ? byTextOnce(f.text, true, f.role, c) ?? byTextOnce(f.text, false, f.role, c) : null;
          if (probe && probe !== anchor && !anchor.contains(probe)) {
            found = c;
            break;
          }
          c = c.parentElement;
        }
        if (!found) continue;
        scope = found;
      }
      if (f.css) el = scope.querySelector<HTMLElement>(f.css);
      else if (f.option) el = byOption(f.option, scope);
      else if (f.label) el = byLabel(f.label, scope);
      else if (f.text) el = byText(f.text, f.exact, f.role, scope) ?? (f.exact || f.role ? null : byOption(f.text, scope)); // 指定了 exact / role 就不要退回去抓 <select>（否則「公廁」會抓到下拉選單本體）
      else if (f.role) el = byRole(f.role, scope);
      if (el && isReachable(el)) return el;
    }
  }
  return null;
}

/** 下拉選單：找選項文字 → 回傳 <select>，並記下要選的值 */
function byOption(text: string, scope: ParentNode = document): HTMLElement | null {
  const want = text.trim();
  for (const sel of scope.querySelectorAll<HTMLSelectElement>('select')) {
    const opt = [...sel.options].find((o) => o.text.trim() === want) ?? [...sel.options].find((o) => o.text.includes(want));
    if (opt) {
      pendingOption = { select: sel, value: opt.value, text: opt.text.trim() };
      return sel;
    }
  }
  return null;
}

function byText(text: string, exact = false, role?: Locator['role'], scope: ParentNode = document): HTMLElement | null {
  // 先找「整個文字就是這幾個字」的元素（按鈕「同意」），找不到才接受「包含」（避免抓到一段含有這幾個字的說明文）
  if (!exact) return byTextOnce(text, true, role, scope) ?? byTextOnce(text, false, role, scope);
  return byTextOnce(text, true, role, scope);
}
function byTextOnce(text: string, exact: boolean, role?: Locator['role'], scope: ParentNode = document): HTMLElement | null {
  const want = text.trim();
  const all = scope.querySelectorAll<HTMLElement>('*');
  let best: HTMLElement | null = null;
  for (const el of all) {
    if (el.closest('#tp-guide-host')) continue;
    if (/^(SCRIPT|STYLE|OPTION|SELECT|HTML|HEAD|BODY)$/.test(el.tagName)) continue;
    if (el.children.length > 0 && !/^(BUTTON|A|LABEL)$/.test(el.tagName)) {
      // 只看「自己的」文字節點，避免抓到整頁的容器
      const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').trim();
      if (!(exact ? own === want : own.includes(want))) continue;
    } else {
      const s = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!(exact ? s === want : s.includes(want))) continue;
    }
    if (!isReachable(el)) continue;
    const clickable = el.closest<HTMLElement>('button, a, [role=button], label, [onclick], .cursor-pointer') ?? el;
    if (role === 'button' && !/^(BUTTON|A)$/.test(clickable.tagName) && clickable.getAttribute('role') !== 'button') continue;
    best = clickable;
    break;
  }
  return best;
}

function byLabel(label: string, scope: ParentNode = document): HTMLElement | null {
  for (const l of scope.querySelectorAll<HTMLLabelElement>('label')) {
    if (!(l.textContent ?? '').trim().startsWith(label)) continue;
    const forId = l.getAttribute('for');
    // for 指到的欄位若有自己的（名字不同的）label，就是網頁寫錯了 → 改用標籤旁邊的欄位
    const forOk = !!forId && [...scope.querySelectorAll<HTMLLabelElement>(`label[for="${forId}"]`)].every((o) => o === l || (o.textContent ?? '').trim().startsWith(label));
    const el = (forOk ? document.getElementById(forId!) : l.querySelector('input,textarea,select')) as HTMLElement | null;
    // radio / checkbox 本身常是隱藏的，目標改成 label（點 label 就等於點它）
    if (el && /^(radio|checkbox)$/.test((el as HTMLInputElement).type || '')) return l;
    if (el && isDisplayed(el)) return el;
    // 標籤的下一個欄位
    const next = l.parentElement?.querySelector<HTMLElement>('input,textarea,select');
    if (next && isDisplayed(next)) return next;
  }
  return null;
}

function byRole(role: Locator['role'], scope: ParentNode = document): HTMLElement | null {
  const sel = role === 'input' ? 'input,textarea,select' : role === 'link' ? 'a[href]' : 'button,[role=button]';
  for (const el of scope.querySelectorAll<HTMLElement>(sel)) if (isDisplayed(el)) return el;
  return null;
}

function isDisplayed(el: HTMLElement | null): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** 真的看得到：沒被任何 overflow:hidden / clip 的祖先裁掉（例如收合的清單） */
/** 找得到（可以捲過去）：只排除被「收合」的祖先（overflow hidden/clip 且高度接近 0）裁掉的元素；
 *  可捲動容器裡暫時在畫面外的項目算找得到，定位後會 scrollIntoView。 */
/** 最近的可捲動祖先（沒有就是整頁） */
function scrollParent(el: HTMLElement): HTMLElement {
  let p = el.parentElement;
  while (p && p !== document.body) {
    const cs = getComputedStyle(p);
    if (/auto|scroll/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 2) return p;
    p = p.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.body;
}

function isReachable(el: HTMLElement | null): boolean {
  if (!el || !isDisplayed(el)) return false;
  let p = el.parentElement;
  while (p && p !== document.body) {
    const cs = getComputedStyle(p);
    const ov = cs.overflow + cs.overflowY;
    if (/hidden|clip/.test(ov) && !/auto|scroll/.test(ov) && p.getBoundingClientRect().height < 2) return false;
    p = p.parentElement;
  }
  return true;
}

function isVisible(el: HTMLElement | null): boolean {
  if (!el || !isDisplayed(el)) return false;
  const r = el.getBoundingClientRect();
  let p = el.parentElement;
  while (p && p !== document.body) {
    const ov = getComputedStyle(p).overflow + getComputedStyle(p).overflowY;
    if (/hidden|clip|auto|scroll/.test(ov)) {
      const pr = p.getBoundingClientRect();
      const overlap = Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top);
      if (pr.height < 2 || overlap < Math.min(8, r.height / 2)) return false;
    }
    p = p.parentElement;
  }
  return true;
}

/* ---------- UI（Shadow DOM，不吃服務頁的 CSS） ---------- */

/** 線條圖示（不用表情符號）：label 以 <svg 開頭就當 HTML 塞進去 */
const ICON = {"mic": "<svg viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8\"/></svg>", "keyboard": "<svg viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"6\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M7 10h.01M11 10h.01M15 10h.01M7 14h10\"/></svg>", "help": "<svg viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5M12 17h.01\"/></svg>", "speaker": "<svg viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 10v4h3l5 4V6L7 10H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11\"/></svg>", "back": "<svg viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M15 5l-7 7 7 7\"/></svg>", "close": "<svg viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" aria-hidden=\"true\"><path d=\"M6 6l12 12M18 6L6 18\"/></svg>", "gear": "<svg viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z\"/></svg>"};

interface PanelButton {
  label: string;
  secondary?: boolean;
  icon?: boolean;
  title?: string;
  onClick: () => void;
}

class Ui {
  host: HTMLElement;
  root: ShadowRoot;
  spot: HTMLElement;
  panel: HTMLElement;
  say: HTMLElement;
  more: HTMLElement;
  stepEl: HTMLElement;
  btns: HTMLElement;
  askEl: HTMLElement;

  dim: HTMLElement;
  shield!: HTMLElement;
  shieldHint = '請用下面的面板操作';
  /** 頁面可不可點 */
  setShield(on: boolean) {
    this.shield.classList.toggle('on', on);
  }
  dimWanted = false;
  prevPadding = '';
  lastScrollNudge = 0;

  constructor(mode: Mode) {
    curMode = mode;
    this.host = document.createElement('div');
    this.host.id = 'tp-guide-host';
    this.root = this.host.attachShadow({ mode: 'open' });
    const scale = SCALE[mode] ?? 1;
    this.root.innerHTML = `
      <style>
        :host { all: initial; }
        .dim { position: fixed; inset: 0; z-index: 2147482999; background: rgba(0,0,0,.35); pointer-events: none; display: none; }
        .dim.on { display: block; }
        /* 獨占模式：導覽中頁面不可點，所有操作都在面板上（簡單易懂、不會點錯） */
        .shield { position: fixed; inset: 0; z-index: 2147483000; display: none; background: transparent; touch-action: none; }
        .shield.on { display: block; }
        .spot { position: fixed; z-index: 2147483000; border-radius: 10px; pointer-events: none; display: none;
                box-shadow: 0 0 0 4px #2eb6c7, 0 0 0 9999px rgba(0,0,0,.55); transition: top .25s, left .25s, width .25s, height .25s; }
        /* 躲起來時只留亮框、不壓暗畫面 */
        .spot.soft { box-shadow: 0 0 0 4px #2eb6c7, 0 0 14px 2px rgba(46,182,199,.6); }
        .panel { position: fixed; z-index: 2147483001; left: 0; right: 0; bottom: 0; background: #fff; color: #171b1d;
                 font-family: 'PingFang TC', Roboto, system-ui, sans-serif; font-size: ${16 * scale}px; padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
                 border-radius: 18px 18px 0 0; box-shadow: 0 -6px 20px rgba(0,0,0,.18); max-height: 42vh; overflow: auto; }
        .panel.top { top: 0; bottom: auto; border-radius: 0 0 18px 18px; padding-top: calc(10px + env(safe-area-inset-top)); box-shadow: 0 6px 20px rgba(0,0,0,.18); }
        .panel.kb { max-height: 30vh; padding-top: 6px; padding-bottom: 6px; }
        .panel.kb .more, .panel.kb .icons, .panel.kb .step { display: none; }
        .panel.kb .say { font-size: 1em; }
        .panel.kb .btns { margin-top: 6px; }
        button, .icons button { -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
        .head { display: flex; align-items: center; gap: 8px; }
        .step { color: #738995; font-size: .7em; flex: 1; }
        .icons { display: flex; gap: 6px; }
        .icons button { width: 2.4em; height: 2.4em; min-height: 0; padding: 0; border-radius: 50%; background: #edf8fa; color: #2eb6c7; font-size: 1em; }
        .say { font-weight: 700; font-size: 1.15em; line-height: 1.3; margin-top: 4px; }
        .more { color: #475259; margin-top: 4px; line-height: 1.35; font-size: .9em; display: none; }
        .more.on { display: block; }
        .btns { display: flex; gap: 8px; margin-top: 10px; align-items: stretch; }
        button { font: inherit; font-weight: 600; border: 0; border-radius: 12px; padding: .5em .8em; background: #2eb6c7; color: #fff; min-height: 2.6em; }
        button.secondary { background: #fff; color: #2eb6c7; border: 2px solid #2eb6c7; }
        button.icon { flex: 0 0 auto; width: 3em; padding: 0; font-size: 1.2em; }
        button.main { flex: 1; }
        button.listening { background: #e5464b; animation: p 1s infinite; }
        @keyframes p { 50% { opacity: .6; } }
        .ask { display: none; margin-top: 8px; padding: 8px 10px; background: #edf8fa; border-radius: 12px; }
        .ask.on { display: block; }
        .flash { color: #e5464b; margin-top: 4px; font-size: .9em; }
        .mini { position: fixed; right: 12px; bottom: calc(14px + env(safe-area-inset-bottom)); z-index: 2147483001; display: none; border: 0; border-radius: 999px; padding: .6em 1em;
                background: #2eb6c7; color: #fff; font: 600 ${15 * scale}px 'PingFang TC', Roboto, system-ui, sans-serif; box-shadow: 0 6px 18px rgba(46,182,199,.45); }
        .mini.on { display: block; }
        .extra { display: block; width: 100%; margin-top: 6px; background: transparent; color: #738995; border: 0; min-height: 2.2em; font-weight: 600; text-decoration: underline; }
        * { -webkit-tap-highlight-color: transparent; }
        button:focus { outline: none; }
        .panel.kid { border-top: 4px solid #5fd0bf; }
        .panel.kid button { border-radius: 16px; }
      </style>
      <div class="dim"></div>
      <div class="shield"></div>
      <div class="spot"></div>
      <button class="mini"></button>
      <div class="panel">
        <div class="head"><div class="step"></div><div class="icons"></div></div>
        <div class="say"></div>
        <div class="more"></div>
        <div class="ask"></div>
        <div class="btns"></div>
      </div>`;
    this.dim = this.root.querySelector('.dim')!;
    this.shield = this.root.querySelector('.shield')!;
    this.shield.addEventListener('click', () => this.flash(this.shieldHint));
    this.spot = this.root.querySelector('.spot')!;
    this.panel = this.root.querySelector('.panel')!;
    if (mode === 'kid') this.panel.classList.add('kid');
    this.say = this.root.querySelector('.say')!;
    this.more = this.root.querySelector('.more')!;
    this.stepEl = this.root.querySelector('.step')!;
    onTripleTap(this.stepEl, () => this.toggleDebug());
    this.btns = this.root.querySelector('.btns')!;
    this.askEl = this.root.querySelector('.ask')!;
    document.body.appendChild(this.host);
    this.prevPadding = document.body.style.paddingBottom;
    this.syncPadding();
    // 使用者點進欄位的那一刻：決定一次面板要在哪一邊（避開這個欄位），之後直到離開欄位都不再動
    document.addEventListener('focusin', (e) => {
      const el = e.target as HTMLElement | null;
      if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest('#tp-guide-host')) return;
      const r = el.getBoundingClientRect();
      const vhNow = window.visualViewport ? window.visualViewport.height + window.visualViewport.offsetTop : innerHeight;
      // 鍵盤還沒彈出來：預估它會吃掉下半部，用「鍵盤開著後的可視高度」判斷
      const vh = Math.min(vhNow, screen.height * 0.5);
      const panelH = (this.panel.getBoundingClientRect().height || 160) * 0.7; // 鍵盤開著時面板會縮成 kb 版
      // 欄位放面板下面會被蓋到 → 面板放上面（前提是上面放得下）
      const bottomCovered = r.bottom > vh - panelH - 8;
      this.panel.classList.toggle('top', bottomCovered && r.top >= panelH + 8);
      this.sideLocked = true;
      this.lastSwitch = Date.now();
      this.syncPadding();
    }, true);
    document.addEventListener('focusout', () => {
      setTimeout(() => {
        const a = document.activeElement;
        if (!a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) this.sideLocked = false;
      }, 300);
    }, true);
  }
  sideLocked = false;
  lastSwitch = 0;

  /** 讓頁面可以捲到底（面板下面的內容不會被蓋住）；destroy 時還原 */
  syncPadding() {
    if (this.keyboard) return;
    const h = this.panel.getBoundingClientRect().height;
    document.body.style.paddingBottom = this.panel.classList.contains('top') ? '' : `${Math.ceil(h) + 8}px`;
  }

  keyboard = false;
  /** 鍵盤開著：面板縮成一行說明 + 主要鍵；位置凍結在鍵盤打開那一刻的位置 */
  setKeyboard(open: boolean) {
    this.keyboard = open;
    this.panel.classList.toggle('kb', open);
    if (!open) this.syncPadding();
  }
  /** 正在打字（頁面欄位或面板輸入框有焦點） */
  isTyping(): boolean {
    const a = document.activeElement as HTMLElement | null;
    const inPanel = this.root.activeElement === this.inputEl && !!this.inputEl;
    // 鍵盤真的開著才算打字：按返回鍵收鍵盤後欄位仍有焦點，不能因此永遠凍結面板（之前面板會一直蓋住「查詢」）
    return this.keyboard && (inPanel || (!!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
  }

  /** 使用者會了：面板收成右下角的小圓鈕，亮框與變暗都收掉 */
  collapse(label: string, onTap: () => void) {
    const mini = this.root.querySelector<HTMLButtonElement>('.mini')!;
    mini.textContent = label;
    mini.onclick = (ev) => {
      ev.stopPropagation();
      onTap();
    };
    mini.classList.add('on');
    this.panel.style.display = 'none';
    this.place(null);
    this.setDim(false);
    this.setShield(false);
    this.syncPadding();
  }
  expand() {
    this.root.querySelector('.mini')!.classList.remove('on');
    this.panel.style.display = '';
    this.syncPadding();
  }

  /** 一開始就先變暗（還沒找到目標也看得出來小幫手在）；亮框出現時就不用整頁暗 */
  setDim(on: boolean) {
    this.dimWanted = on;
    this.dim.classList.toggle('on', on && this.spot.style.display !== 'block');
    this.spot.classList.toggle('soft', !on); // 不要暗 → 亮框也不要帶 9999px 的黑影
  }

  show(o: { say: string; more?: string; stepText?: string; buttons: PanelButton[]; icons?: PanelButton[]; extra?: PanelButton }) {
    this.say.textContent = o.say;
    let ex = this.root.querySelector<HTMLButtonElement>('.extra');
    if (!ex) {
      ex = document.createElement('button');
      ex.className = 'extra';
      this.panel.appendChild(ex);
    }
    if (o.extra) {
      ex.textContent = o.extra.label;
      ex.style.display = '';
      const cb = o.extra.onClick;
      ex.onclick = (ev) => {
        ev.stopPropagation();
        cb();
      };
    } else ex.style.display = 'none';
    this.more.textContent = o.more ?? '';
    this.more.classList.toggle('on', !!o.more);
    this.stepEl.textContent = o.stepText ?? '';
    this.askEl.classList.remove('on');
    this.btns.innerHTML = '';
    for (const b of o.buttons) {
      const el = document.createElement('button');
      if (b.label.startsWith('<svg')) el.innerHTML = b.label;
      else el.textContent = b.label;
      el.className = (b.secondary ? 'secondary ' : '') + (b.icon ? 'icon' : 'main');
      if (b.title) el.title = b.title;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        b.onClick();
      });
      this.btns.appendChild(el);
    }
    const icons = this.root.querySelector('.icons')!;
    icons.innerHTML = '';
    for (const b of o.icons ?? []) {
      const el = document.createElement('button');
      if (b.label.startsWith('<svg')) el.innerHTML = b.label;
      else el.textContent = b.label;
      if (b.title) el.title = b.title;
      el.setAttribute('aria-label', b.title ?? b.label);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        b.onClick();
      });
      icons.appendChild(el);
    }
    this.syncPadding();
  }

  forceMore(text: string) {
    if (!text) return;
    this.more.textContent = text;
    this.more.classList.add('on');
  }

  /** 在面板裡問一個是/否的問題 */
  ask(q: string, yes: string, no: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.askEl.innerHTML = '';
      const p = document.createElement('div');
      p.textContent = q;
      p.style.fontWeight = '700';
      p.style.marginBottom = '8px';
      const row = document.createElement('div');
      row.className = 'btns';
      row.style.marginTop = '0';
      const mk = (label: string, v: boolean, secondary = false) => {
        const b = document.createElement('button');
        b.textContent = label;
        if (secondary) b.className = 'secondary';
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.askEl.classList.remove('on');
          resolve(v);
        });
        row.appendChild(b);
      };
      mk(yes, true);
      mk(no, false, true);
      this.askEl.append(p, row);
      this.askEl.classList.add('on');
    });
  }

  inputEl: HTMLInputElement | null = null;
  inputWrap: HTMLElement | null = null;

  /** 面板裡的輸入框：在這裡打字會同步填進頁面的欄位 */
  showInput(value: string, numeric: boolean, onInput: (v: string) => void, onEnter: () => void) {
    if (!this.inputWrap) {
      this.inputWrap = document.createElement('div');
      this.inputWrap.style.cssText = 'margin-top:8px';
      this.inputEl = document.createElement('input');
      this.inputEl.style.cssText = 'width:100%;box-sizing:border-box;font:inherit;font-size:1.1em;padding:.5em .7em;border:2px solid #2eb6c7;border-radius:12px;outline:none;background:#f7fcfd';
      this.inputWrap.appendChild(this.inputEl);
      this.panel.insertBefore(this.inputWrap, this.askEl);
    }
    const el = this.inputEl!;
    el.value = value;
    el.setAttribute('inputmode', numeric ? 'numeric' : 'text');
    el.placeholder = numeric ? '0123456789' : '';
    el.oninput = () => onInput(el.value);
    el.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onEnter();
      }
    };
    this.inputWrap.style.display = '';
    this.syncPadding();
  }
  hideInput() {
    if (this.inputWrap) this.inputWrap.style.display = 'none';
    this.syncPadding();
  }
  focusInput(): boolean {
    if (!this.inputWrap || this.inputWrap.style.display === 'none' || !this.inputEl) return false;
    this.inputEl.focus();
    return true;
  }
  setInputValue(v: string) {
    if (this.inputEl) this.inputEl.value = v;
  }

  debugEl: HTMLElement | null = null;
  /** 「第 n 步」連點三下：顯示目前狀態（目標、步驟、state、最近 log） */
  toggleDebug() {
    if (this.debugEl) {
      this.debugEl.remove();
      this.debugEl = null;
      return;
    }
    const g = (window as any).__tpGuide;
    const el = document.createElement('pre');
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;max-height:45vh;overflow:auto;z-index:2147483002;background:rgba(0,0,0,.85);color:#9fe;font:11px ui-monospace,monospace;padding:8px;margin:0;white-space:pre-wrap';
    const t = g?.target as HTMLElement | null;
    const info = {
      url: location.pathname,
      step: g?.state?.step,
      stepId: g?.step?.id,
      state: g?.state,
      target: t ? t.tagName + '|' + (t.textContent || (t as HTMLInputElement).placeholder || '').trim().slice(0, 30) : null,
      rect: t ? t.getBoundingClientRect().toJSON() : null,
      decider: g?.decider?.name,
      keyboard: this.keyboard,
      viewport: `${innerWidth}x${innerHeight} vv=${window.visualViewport?.height}`,
      build: __OVERLAY_BUILD__
    };
    let logs: any[] = [];
    try {
      logs = JSON.parse(localStorage.getItem('tp_debug_log') || '[]').slice(-12);
    } catch {
      /* ignore */
    }
    el.textContent = JSON.stringify(info, null, 1) + '\n--- log ---\n' + logs.map((l) => `${new Date(l.t).toTimeString().slice(0, 8)} ${l.src} ${l.msg}`).join('\n');
    el.addEventListener('click', () => this.toggleDebug());
    this.root.appendChild(el);
    this.debugEl = el;
  }

  /** 即時字幕（辨識中） */
  live(text: string) {
    let el = this.panel.querySelector<HTMLElement>('.live');
    if (!el) {
      el = document.createElement('div');
      el.className = 'live';
      el.style.cssText = 'color:#2eb6c7;margin-top:4px;min-height:1.2em;font-size:.95em';
      this.panel.insertBefore(el, this.askEl);
    }
    el.textContent = text;
  }

  /** 多選一的追問 */
  choices(q: string, opts: PanelButton[]) {
    this.askEl.innerHTML = '';
    const p = document.createElement('div');
    p.textContent = q;
    p.style.fontWeight = '700';
    p.style.marginBottom = '8px';
    const row = document.createElement('div');
    row.className = 'btns';
    row.style.marginTop = '0';
    row.style.flexWrap = 'wrap';
    for (const o of opts) {
      const b = document.createElement('button');
      b.textContent = o.label;
      if (o.secondary) b.className = 'secondary';
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.askEl.classList.remove('on');
        o.onClick();
      });
      row.appendChild(b);
    }
    this.askEl.append(p, row);
    this.askEl.classList.add('on');
  }

  flash(text: string) {
    const f = document.createElement('div');
    f.className = 'flash';
    f.textContent = text;
    this.panel.appendChild(f);
    setTimeout(() => f.remove(), 2500);
  }

  setListening(on: boolean) {
    const b = this.btns.querySelector('button');
    if (b) b.classList.toggle('listening', on);
  }

  /** 把發亮框放到目標上；null 就取消變暗 */
  place(el: HTMLElement | null) {
    if (!el || !document.contains(el)) {
      this.spot.style.display = 'none';
      this.dim.classList.toggle('on', this.dimWanted);
      this.panel.classList.remove('top'); // 沒有目標就回到底部，不要遮住內容
      this.syncPadding();
      return;
    }
    this.dim.classList.remove('on');
    const r = el.getBoundingClientRect();
    const pad = 6;
    const vh = window.visualViewport ? window.visualViewport.height + window.visualViewport.offsetTop : innerHeight;
    const typing = this.keyboard || this.isTyping();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > innerWidth) {
      this.spot.style.display = 'none';
      const af = document.activeElement;
      const typingNow = typing || (!!af && /^(INPUT|TEXTAREA|SELECT)$/.test(af.tagName));
      if (!typingNow && Date.now() - this.lastScrollNudge > 1500) {
        this.lastScrollNudge = Date.now();
        el.scrollIntoView({ block: 'center' });
      }
      return;
    }
    // 面板放上面還是下面：只在「換到另一邊真的放得下」時才換，放不下就留在原地（不再上下互跳）；
    // 欄位有焦點（使用者正在打字）時鎖住不動，鍵盤開著也鎖住；兩次切換至少隔 600ms
    const panelH = this.panel.getBoundingClientRect().height || 160;
    const isTop = this.panel.classList.contains('top');
    const a = document.activeElement;
    const focused = !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    const nowTs = Date.now();
    if (!typing && !focused && !this.sideLocked && nowTs - this.lastSwitch > 600) {
      const fitsBottom = r.bottom <= vh - panelH - 12;
      const fitsTop = r.top >= panelH + 12;
      if (!isTop && !fitsBottom && fitsTop) {
        this.panel.classList.add('top');
        this.lastSwitch = nowTs;
        this.syncPadding();
      } else if (isTop && !fitsTop && fitsBottom) {
        this.panel.classList.remove('top');
        this.lastSwitch = nowTs;
        this.syncPadding();
      }
    }
    // 面板跟目標重疊（鍵盤開著、畫面很矮時常發生）→ 把頁面捲一下，讓目標露在面板外面；面板不要壓在要填的欄位上
    const pr = this.panel.getBoundingClientRect();
    const overlap = this.panel.style.display !== 'none' && r.bottom > pr.top && r.top < pr.bottom;
    if (overlap && Date.now() - this.lastScrollNudge > 700) {
      this.lastScrollNudge = Date.now();
      const sc = scrollParent(el);
      const top0 = sc === document.scrollingElement || sc === document.body ? window.scrollY : sc.scrollTop;
      let isTopNow = this.panel.classList.contains('top');
      let dy = isTopNow ? r.top - (pr.bottom + 10) : r.bottom - (pr.top - 10);
      // 往上捲不動了（已經在最上面）→ 面板改放下面、把頁面往下捲，讓欄位露在面板上方
      if (dy < 0 && top0 + dy < 0) {
        this.panel.classList.toggle('top', !isTopNow);
        this.lastSwitch = Date.now();
        this.syncPadding();
        isTopNow = !isTopNow;
        const pr2 = this.panel.getBoundingClientRect();
        dy = isTopNow ? r.top - (pr2.bottom + 10) : r.bottom - (pr2.top - 10);
      }
      if (sc === document.scrollingElement || sc === document.body) window.scrollBy({ top: dy, behavior: 'smooth' });
      else sc.scrollBy({ top: dy, behavior: 'smooth' });
    }
    Object.assign(this.spot.style, {
      display: 'block',
      top: r.top - pad + 'px',
      left: r.left - pad + 'px',
      width: r.width + pad * 2 + 'px',
      height: r.height + pad * 2 + 'px'
    });
  }

  destroy() {
    document.body.style.paddingBottom = this.prevPadding;
    this.host.remove();
  }
}

/** 目標中心點被別的東西蓋住（提示視窗）時，回傳那個視窗裡適合用來關掉它的按鈕 */
function coveringButton(el: HTMLElement): HTMLElement | null {
  const r = el.getBoundingClientRect();
  const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
  const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
  if (y < 0 || y > innerHeight) return null;
  const hit = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!hit || hit === el || el.contains(hit) || hit.contains(el) || hit.closest('#tp-guide-host')) return null;
  // 往上找到 fixed / 高 z-index 的容器（通常就是 modal）
  let c: HTMLElement | null = hit;
  while (c && c !== document.body) {
    const cs = getComputedStyle(c);
    if (cs.position === 'fixed' || (cs.position === 'absolute' && parseInt(cs.zIndex || '0', 10) >= 10)) break;
    c = c.parentElement;
  }
  if (!c || c === document.body) return null;
  const btns = [...c.querySelectorAll<HTMLElement>('button, a[href], [role=button]')].filter((b) => isVisible(b));
  if (!btns.length) return null;
  const label = (b: HTMLElement) => (b.textContent || '').trim();
  // 先挑「往前走」的鈕（確認、是、好、同意、繼續），再挑關閉類，最後才是取消 / 否
  const byText =
    btns.find((b) => /^(確認|確定|是|好|OK|同意|繼續|知道了|我知道了)$/i.test(label(b))) ??
    btns.find((b) => /確認|關閉|知道|繼續|同意/.test(label(b)) || /close|關閉/i.test((b.getAttribute('aria-label') || '') + (b.querySelector('img')?.getAttribute('alt') || ''))) ??
    btns.find((b) => /取消|否|稍後|略過/.test(label(b)));
  if (byText) return byText;
  // 沒有文字的圖示鈕：挑最靠視窗頂端、最右邊的那顆（通常就是右上角的 X），不要挑輸入框裡的清除鈕
  const cr = c.getBoundingClientRect();
  const icon = btns
    .filter((b) => !(b.textContent || '').trim())
    .map((b) => ({ b, r: b.getBoundingClientRect() }))
    .filter(({ r }) => r.top - cr.top < 80)
    .sort((a, z) => a.r.top - z.r.top || z.r.right - a.r.right)[0];
  return icon?.b ?? btns[btns.length - 1];
}

/* ---------- 迷路偵測：亂點、亂滑、一直換頁 → 帥氣登場 ---------- */


function lostRead(): { routes: Array<[number, string]>; taps: number[]; flips: number[]; cooldown: number } {
  try {
    return JSON.parse(sessionStorage.getItem('tp_lost') || '') || { routes: [], taps: [], flips: [], cooldown: 0 };
  } catch {
    return { routes: [], taps: [], flips: [], cooldown: 0 };
  }
}
function lostWrite(v: ReturnType<typeof lostRead>) {
  try {
    sessionStorage.setItem('tp_lost', JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

function startLostWatcher() {
  if ((window as any).__tpLostWatcher) return;
  (window as any).__tpLostWatcher = true;
  const st = lostRead();
  const now = Date.now();
  // 換頁紀錄（跨頁用 sessionStorage）
  const last = st.routes[st.routes.length - 1];
  if (!last || last[1] !== location.pathname) st.routes.push([now, location.pathname]);
  lostWrite(st);
  if (/tp_hero=1/.test(location.hash)) {
    setTimeout(() => heroEntrance('force'), 300);
    return;
  }
  let lastY = scrollY;
  let lastDir = 0;
  // 用 pointer 事件數「點」而不是 click：地圖（Leaflet）等元件會吃掉 touch 的 click，手機上 click 根本不會到 document
  let downAt = 0;
  let downX = 0;
  let downY = 0;
  document.addEventListener('pointerdown', (e) => {
    downAt = Date.now();
    downX = e.clientX;
    downY = e.clientY;
  }, true);
  document.addEventListener('pointerup', (e) => {
    if ((e.target as HTMLElement | null)?.closest?.('#tp-guide-host, #tp-hero-host')) return;
    if (!downAt || Date.now() - downAt > 400 || Math.hypot(e.clientX - downX, e.clientY - downY) > 12) return; // 拖曳/長按不算
    const v = lostRead();
    v.taps.push(Date.now());
    lostWrite(v);
    check();
  }, true);
  window.addEventListener('scroll', () => {
    const dy = scrollY - lastY;
    lastY = scrollY;
    if (Math.abs(dy) < 40) return;
    const dir = dy > 0 ? 1 : -1;
    if (lastDir && dir !== lastDir) {
      const v = lostRead();
      v.flips.push(Date.now());
      lostWrite(v);
      check();
    }
    lastDir = dir;
  }, { passive: true, capture: true });
  window.addEventListener('tp:locationchange', () => {
    const v = lostRead();
    const l = v.routes[v.routes.length - 1];
    if (!l || l[1] !== location.pathname) v.routes.push([Date.now(), location.pathname]);
    lostWrite(v);
    check();
  });
  check();

  function check() {
    const v = lostRead();
    const t = Date.now();
    if (v.cooldown && t < v.cooldown) return;
    if (readState()) return; // 正在導覽就不打擾
    if (sessionStorage.getItem('tp_from_assistant') || document.getElementById('tp-guide-host')) return; // 已經在小幫手模式
    v.routes = v.routes.filter(([ts]) => t - ts < LOST.routesWindowMs);
    v.taps = v.taps.filter((ts) => t - ts < LOST.tapsWindowMs);
    v.flips = v.flips.filter((ts) => t - ts < LOST.flipsWindowMs);
    lostWrite(v);
    const distinct = new Set(v.routes.map(([, p]) => p)).size;
    let why = '';
    if (distinct >= LOST.routes) why = 'routes';
    else if (v.taps.length >= LOST.taps) why = 'taps';
    else if (v.flips.length >= LOST.flips) why = 'flips';
    if (!why) return;
    v.cooldown = t + LOST.cooldownMs;
    v.routes = [];
    v.taps = [];
    v.flips = [];
    lostWrite(v);
    heroEntrance(why);
  }
}

/** 帥氣登場 */
async function heroEntrance(why: string) {
  if (document.getElementById('tp-hero-host')) return;
  unmountFab();
  tplog('overlay', 'hero entrance: ' + why, { url: location.pathname });
  if (!readState()) document.getElementById('tp-guide-host')?.remove(); // 把「要我陪你做嗎」收掉，登場畫面優先
  const lang = lsGet('tp_assistant_lang') || 'zh';
  const mode = (lsGet('tp_assistant_mode') as Mode) || 'normal';
  curMode = mode;
  const copy = await loadCopy(lang).catch(() => ({} as Copy));
  const title = t(copy, 'lost_title') === 'lost_title' ? '不要再亂點亂滑了，因為我來了' : t(copy, 'lost_title');
  const sub = t(copy, 'lost_sub') === 'lost_sub' ? '說一句話，我帶你去' : t(copy, 'lost_sub');
  const host = document.createElement('div');
  host.id = 'tp-hero-host';
  const root = host.attachShadow({ mode: 'open' });
  const scale = SCALE[mode] ?? 1;
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .bg { position: fixed; inset: 0; z-index: 2147483100; background: radial-gradient(circle at 50% 30%, rgba(46,182,199,.55), rgba(8,19,21,.92)); animation: fade .35s ease-out; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .card { font-family: 'PingFang TC', Roboto, system-ui, sans-serif; color: #fff; text-align: center; max-width: 420px; width: 100%; animation: pop .55s cubic-bezier(.2,1.4,.4,1); }
      .icon { font-size: ${64 * scale}px; line-height: 1; filter: drop-shadow(0 8px 24px rgba(46,182,199,.8)); animation: bob 1.6s ease-in-out infinite; }
      .ring { width: ${120 * scale}px; height: ${120 * scale}px; border-radius: 50%; margin: 0 auto 16px; background: #2eb6c7; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 0 rgba(46,182,199,.7); animation: pulse 1.6s infinite; }
      h1 { font-size: ${26 * scale}px; margin: 8px 0 6px; font-weight: 800; letter-spacing: .5px; text-shadow: 0 2px 12px rgba(0,0,0,.4); }
      p { font-size: ${16 * scale}px; margin: 0 0 20px; opacity: .9; }
      .btns { display: flex; flex-direction: column; gap: 10px; }
      button { font: inherit; font-size: ${18 * scale}px; font-weight: 700; border: 0; border-radius: 16px; padding: .8em 1.2em; background: #fff; color: #2eb6c7; min-height: 3em; -webkit-tap-highlight-color: transparent; }
      button.ghost { background: transparent; color: #fff; border: 2px solid rgba(255,255,255,.7); }
      @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes pop { from { transform: translateY(40px) scale(.7); opacity: 0; } to { transform: none; opacity: 1; } }
      @keyframes bob { 50% { transform: translateY(-6px); } }
      @keyframes pulse { 70% { box-shadow: 0 0 0 28px rgba(46,182,199,0); } 100% { box-shadow: 0 0 0 0 rgba(46,182,199,0); } }
    </style>
    <div class="bg">
      <div class="card">
        <div class="ring"><div class="icon"><svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg></div></div>
        <h1>${title.replace(/</g, '&lt;').split(String.fromCharCode(10)).join('<br>')}</h1>
        <p>${sub}</p>
        <div class="btns">
          <button class="go">${copy.lost_help || '幫我'}</button>
          <button class="ghost no">${copy.lost_no || '我自己來'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(host);
  root.querySelector('.go')!.addEventListener('click', () => {
    host.remove();
    location.href = `${BASE}?lang=${lang}&from=lost`;
  });
  root.querySelector('.no')!.addEventListener('click', () => host.remove());
  if (mode !== 'normal') tts(title + '。' + sub, copy.stt_lang || 'zh-TW');
}

/* ---------- 版面感知 ---------- */

interface Cand {
  el: HTMLElement;
  label: string;
  kind: string;
}

/** 這一頁所有看得到、可互動的元素與它們的文字 */
function collectInteractive(): Cand[] {
  const out: Cand[] = [];
  const seen = new Set<HTMLElement>();
  const push = (el: HTMLElement, label: string, kind: string) => {
    label = label.replace(/\s+/g, ' ').trim();
    if (!label || seen.has(el) || el.closest('#tp-guide-host') || !isVisible(el)) return;
    seen.add(el);
    out.push({ el, label: label.slice(0, 30), kind });
  };
  for (const sel of document.querySelectorAll<HTMLSelectElement>('select')) {
    for (const o of sel.options) {
      if (o.value === '') continue;
      const label = o.text.trim();
      if (!label || !isVisible(sel)) continue;
      out.push({ el: sel, label, kind: '下拉選項' });
    }
  }
  for (const el of document.querySelectorAll<HTMLElement>('button, a[href], [role=button], [role=tab], .tab-label')) push(el, el.textContent || el.getAttribute('aria-label') || '', '按鈕');
  for (const l of document.querySelectorAll<HTMLLabelElement>('label')) push(l, l.textContent || '', '選項');
  for (const el of document.querySelectorAll<HTMLElement>('input:not([type=radio]):not([type=checkbox]):not([type=hidden]), textarea')) {
    const ph = el.getAttribute('placeholder') || el.getAttribute('aria-label') || '';
    const lab = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent || '' : '';
    push(el, lab || ph, '欄位');
  }
  return out;
}

/** 字元 bigram 相似度（0～1），加上包含關係加分；對中文的短標籤夠用 */
function textSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (nb.includes(na) || na.includes(nb)) return 0.8;
  const grams = (t: string) => {
    const g = new Set<string>();
    const cs = Array.from(t);
    for (let i = 0; i + 2 <= cs.length; i++) g.add(cs[i] + cs[i + 1]);
    if (cs.length === 1) g.add(cs[0]);
    return g;
  };
  const A = grams(na);
  const B = grams(nb);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const jac = inter / (A.size + B.size - inter || 1);
  const chars = Array.from(na).filter((c) => nb.includes(c)).length / Math.max(Array.from(na).length, 1);
  return Math.max(jac, chars * 0.6);
}

/* ---------- 工具 ---------- */

function readHash(): State | null {
  const m = location.hash.match(/tpguide=([\w-]+)/);
  if (!m) return null;
  const q = new URLSearchParams(location.hash.replace(/^#/, ''));
  const params: Record<string, string> = {};
  q.forEach((v, k) => {
    if (k.startsWith('p_')) params[k.slice(2)] = v;
  });
  const st: State = { id: m[1], step: 0, mode: (q.get('mode') as State['mode']) || 'normal', lang: q.get('lang') || 'zh', params };
  try {
    sessionStorage.setItem('tp_from_assistant', '1'); // 已經在小幫手的流程裡：不要再「因為我來了」
  } catch {
    /* ignore */
  }
  try {
    history.replaceState(history.state, '', location.pathname + location.search);
  } catch {
    /* ignore */
  }
  return st;
}
function readState(): State | null {
  try {
    const raw = sessionStorage.getItem('tp_guide');
    return raw ? (JSON.parse(raw) as State) : null;
  } catch {
    return null;
  }
}
function saveState(s: State) {
  try {
    sessionStorage.setItem('tp_guide', JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
function clearState() {
  try {
    sessionStorage.removeItem('tp_guide');
  } catch {
    /* ignore */
  }
}
function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return (await res.json()) as T;
}
async function loadCopy(lang: string): Promise<Copy> {
  const l = ['zh', 'en', 'vi', 'id', 'th'].includes(lang) ? lang : 'zh';
  const zh = await fetchJson<Copy>(`${BASE}data/copy.zh.json`);
  if (l === 'zh') return zh;
  const other = await fetchJson<Copy>(`${BASE}data/copy.${l}.json`).catch(() => ({}));
  return { ...zh, ...other };
}
function t(copy: Copy, key: string, params?: Record<string, string | number>) {
  return fmt(copy[key + '_' + curMode] ?? copy[key] ?? key, params);
}
function waitFor<T>(fn: () => T | null, timeoutMs: number, every = 300): Promise<T | null> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      const v = fn();
      if (v) return resolve(v);
      if (Date.now() - t0 > timeoutMs) return resolve(null);
      setTimeout(tick, every);
    };
    tick();
  });
}
function throttle<F extends (...a: any[]) => void>(fn: F, ms: number): F {
  let last = 0;
  let timer = 0;
  return ((...a: any[]) => {
    const now = Date.now();
    const run = () => {
      last = Date.now();
      fn(...a);
    };
    if (now - last >= ms) run();
    else {
      clearTimeout(timer);
      timer = window.setTimeout(run, ms - (now - last));
    }
  }) as F;
}
function debounce<F extends (...a: any[]) => void>(fn: F, ms: number): F {
  let timer = 0;
  return ((...a: any[]) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => fn(...a), ms);
  }) as F;
}
/** 讓 Vue 的 v-model 也看得到我們填的值 */
function setNativeValue(el: HTMLInputElement, value: string) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
/** 手機鍵盤：讓鍵盤彈出時「縮的是頁面」而不是只縮視覺視窗，固定在底部的面板才會跟著上移（Chrome/WebView 108+） */
function patchViewport() {
  try {
    let meta = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1';
      document.head.appendChild(meta);
    }
    if (!/interactive-widget/.test(meta.content)) meta.content += ', interactive-widget=resizes-content';
  } catch {
    /* ignore */
  }
}

/** SPA 換頁偵測：包住 pushState / replaceState，加上 popstate 與輪詢 */
function patchHistory() {
  const fire = () => window.dispatchEvent(new Event('tp:locationchange'));
  for (const k of ['pushState', 'replaceState'] as const) {
    const orig = history[k];
    history[k] = function (this: History, ...a: any[]) {
      const r = (orig as any).apply(this, a);
      fire();
      return r;
    } as any;
  }
  window.addEventListener('popstate', fire);
  window.addEventListener('hashchange', fire);
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) {
      last = location.href;
      fire();
    }
  }, 500);
}
