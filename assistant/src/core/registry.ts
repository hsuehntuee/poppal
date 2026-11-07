/**
 * 工具層（MCP 式）：registry.json 是「有什麼工具、涵蓋什麼、要什麼參數、怎麼呼叫」的一張表。
 *  - lookup()：使用者的話命中具體項目名稱 → 哪些工具相關（最長匹配、不重疊）
 *  - fuse()：把查表結果當先驗，融進模型的機率分布（不凌駕模型；有歧義的詞只拉高幾個候選，讓系統走 ASK）
 *  - extractParams()：用規則從句子抽出工具需要的參數（例如 10 碼水號），預填到導覽
 *  - invoke()：真的去呼叫：開頁 / 啟動導覽並預填 / 切模式 / 朗讀 / 打電話 / 外部網址
 */
import type { Code, Probs } from './types';
import { ASSISTANT_BASE } from './catalog';
import { extract, type AcceptKind } from './extract';
import { normalizeText } from '../engines/tiny';

export interface ToolParam {
  name: string;
  type: AcceptKind;
  len?: number | null;
  min_len?: number;
  max_len?: number;
  label: string;
  step: string;
}
export type Invoke =
  | { kind: 'page'; path: string }
  | { kind: 'guide'; guide: string; entry: string }
  | { kind: 'external'; url: string }
  | { kind: 'bridge'; name: string; data: unknown }
  | { kind: 'ui'; action: 'mode' | 'tts' | string; value: string }
  | { kind: 'unavailable' };
export interface Tool {
  id: string;
  code: Code;
  name: Record<string, string>;
  description: string;
  invoke: Invoke;
  params: ToolParam[];
  keywords: string[];
  covers: string[];
  examples: string[];
}
export interface IndexEntry {
  term: string;
  tools: string[];
  ambiguous: boolean;
  /** 別名對應到的頁面項目名稱（covers 裡的） */
  entity?: string;
}
export interface Registry {
  version: number;
  none_code: Code;
  tools: Tool[];
  index: IndexEntry[];
}

let cached: Registry | null = null;
export async function loadRegistry(): Promise<Registry> {
  if (cached) return cached;
  const res = await fetch(`${ASSISTANT_BASE}data/registry.json`, { cache: 'no-cache' });
  cached = (await res.json()) as Registry;
  return cached;
}
export function setRegistry(r: Registry) {
  cached = r;
}
export function toolByCode(r: Registry, code: Code): Tool | undefined {
  return r.tools.find((t) => t.code === code);
}

export interface Hit {
  term: string;
  tools: string[];
  ambiguous: boolean;
  entity?: string;
}

/** 最長匹配、不重疊：「水費通知」命中後，裡面的「水費」就不再算 */
export function lookup(r: Registry, text: string): Hit[] {
  const t = normalizeText(text);
  if (!t) return [];
  const covered: boolean[] = new Array(t.length).fill(false);
  const hits: Hit[] = [];
  for (const e of r.index) {
    // index 已依長度由長到短排序
    const term = normalizeText(e.term);
    if (!term) continue;
    let from = 0;
    while (true) {
      const i = t.indexOf(term, from);
      if (i < 0) break;
      from = i + 1;
      if (covered.slice(i, i + term.length).some(Boolean)) continue;
      for (let k = i; k < i + term.length; k++) covered[k] = true;
      hits.push({ term: e.term, tools: e.tools, ambiguous: e.ambiguous, entity: e.entity });
    }
  }
  return hits;
}

/**
 * 查表融合：p'(c) ∝ p(c) × (1 + α·s(c))，s(c) = 命中該工具的詞的字數加總（歧義詞平分）。
 * α 預設 4：一個 2 字的確定命中大約把該選項放大 9 倍，足以把 0.3 推到 GO，
 * 但如果模型給它接近 0（完全不相干），乘法也救不回來，所以不會凌駕模型。
 */
export function fuse(r: Registry, probs: Probs, hits: Hit[], alpha = 4): { probs: Probs; boosted: Record<Code, number> } {
  if (!hits.length) return { probs, boosted: {} };
  const byId = new Map(r.tools.map((t) => [t.id, t.code]));
  const score: Record<Code, number> = {};
  for (const h of hits) {
    const w = normalizeText(h.term).length / h.tools.length;
    for (const id of h.tools) {
      const c = byId.get(id);
      if (c) score[c] = (score[c] ?? 0) + w;
    }
  }
  const out: Probs = {};
  let sum = 0;
  for (const [c, p] of Object.entries(probs)) {
    const v = p * (1 + alpha * (score[c] ?? 0));
    out[c] = v;
    sum += v;
  }
  if (sum > 0) for (const c of Object.keys(out)) out[c] /= sum;
  return { probs: out, boosted: score };
}

/** 從句子抽工具參數（只抽，不猜；抽到的值一定會顯示給使用者確認）。
 *  另外帶上查表命中的具體項目（entity），導覽腳本用 {{entity}} 直接帶到那個分類 / 項目。 */
export function extractParams(tool: Tool, text: string, hits: Hit[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of tool.params) {
    if (p.type === 'text') continue; // 自由文字欄位不從意圖句子抽（會把整句塞進去）
    const r = extract(text, p.type, { minLen: p.min_len, maxLen: p.max_len });
    if (r.ok) out[p.name] = r.value;
  }
  // 查表命中的具體項目：index 可能把口語別名（違停）對到頁面上的項目（停車管理及收費問題）
  const hit = hits.find((h) => h.tools.includes(tool.id) && (h.entity || tool.covers.includes(h.term)));
  if (hit) out.entity = hit.entity ?? hit.term;
  return out;
}

export interface InvokeContext {
  servicesBase: string;
  mode: 'kid' | 'normal' | 'elder';
  lang: string;
  setMode: (m: 'kid' | 'normal' | 'elder') => void;
  speak: (text: string) => void;
  speakText?: string;
  openExternal: (url: string) => void;
  callBridge: (name: string, data: unknown) => void;
  notify: (msg: string) => void;
}

/** 執行工具。回傳 true 表示已經離開這一頁（導向） */
export function invoke(tool: Tool, params: Record<string, string>, ctx: InvokeContext): boolean {
  const inv = tool.invoke;
  switch (inv.kind) {
    case 'page': {
      location.href = new URL(ctx.servicesBase + inv.path, location.origin).toString();
      return true;
    }
    case 'guide': {
      const state = { id: inv.guide, mode: ctx.mode, lang: ctx.lang, step: 0, params };
      try {
        sessionStorage.setItem('tp_guide', JSON.stringify(state));
      } catch {
        /* ignore */
      }
      const url = new URL(ctx.servicesBase + inv.entry, location.origin);
      const q = Object.entries(params).map(([k, v]) => `&p_${k}=${encodeURIComponent(v)}`).join('');
      url.hash = `tpguide=${inv.guide}&mode=${ctx.mode}&lang=${ctx.lang}${q}`;
      location.href = url.toString();
      return true;
    }
    case 'external':
      ctx.openExternal(inv.url);
      return false;
    case 'bridge':
      ctx.callBridge(inv.name, inv.data);
      return false;
    case 'ui':
      if (inv.action === 'mode') ctx.setMode(inv.value === 'elder' ? 'elder' : 'normal');
      else if (inv.action === 'tts') ctx.speak(ctx.speakText ?? document.body.innerText.slice(0, 400));
      return false;
    default:
      ctx.notify('unavailable');
      return false;
  }
}
