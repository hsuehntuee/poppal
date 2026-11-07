import type { Catalog, Code, Decider, Decision, Probs, Thresholds } from '../core/types';
import { DEFAULT_THRESHOLDS } from '../core/types';
import { decide, reject } from '../core/decide';
import { serviceRequest } from '../core/catalog';
import { fuseWithRegistry } from '../core/fuse';
import type { Registry } from '../core/registry';

export type Tag = 'normal' | 'ambiguous' | 'oos' | 'foreign';

export interface TestItem {
  text: string;
  /** 正確服務代號；不在範圍內用 Z */
  expect: Code;
  /** 模糊句：這些代號也算對 */
  alt?: Code[];
  tag?: Tag;
  lang?: string;
}

export interface ItemResult {
  text: string;
  expect: Code;
  tag: Tag;
  first: Decision;
  firstHit: boolean;
  twoRoundHit: boolean;
  asks: number;
  ms: number;
  top3: Array<[Code, number]>;
}

export interface EvalSummary {
  engine: string;
  info: Record<string, unknown>;
  n: number;
  first_hit: number;
  two_round_hit: number;
  oos_detect: number;
  avg_asks: number;
  p50_ms: number;
  p95_ms: number;
  by_tag: Record<string, { n: number; first_hit: number; two_round_hit: number }>;
  thresholds: Thresholds;
  items: ItemResult[];
  ranAt: string;
}

/**
 * 模擬使用流程來算「2 輪內命中率」：
 *   GO 對 → 第一輪命中
 *   ASK 含正解 → 自動按正解（1 次追問）→ 命中
 *   GO 錯 → 按「不是」→ 歸零重判 → 再看一次（1 次追問）
 *   NONE → 對 Z 的題目算命中；其他題算失敗
 */
export async function runEval(
  decider: Decider,
  catalog: Catalog,
  items: TestItem[],
  opts: { thresholds?: Thresholds; onProgress?: (i: number, r: ItemResult) => void; delayMs?: number; registry?: Registry | null; alpha?: number } = {}
): Promise<EvalSummary> {
  const th = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const none = catalog.none_code;
  const results: ItemResult[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const tag: Tag = it.tag ?? (it.expect === none ? 'oos' : 'normal');
    const ok = new Set([it.expect, ...(it.alt ?? [])]);
    const t0 = now();
    let probs: Probs;
    try {
      probs = await decider.score(serviceRequest(catalog, it.text));
    } catch (e) {
      probs = { [none]: 1 };
    }
    if (opts.registry) probs = fuseWithRegistry(opts.registry, it.text, probs, opts.alpha).probs;
    const ms = now() - t0;
    const first = decide(probs, none, th);
    let firstHit = false;
    let twoRoundHit = false;
    let asks = 0;

    if (it.expect === none) {
      firstHit = first.kind === 'NONE';
      twoRoundHit = firstHit;
      if (first.kind === 'ASK') asks = 1;
    } else if (first.kind === 'GO') {
      firstHit = ok.has(first.code);
      twoRoundHit = firstHit;
      if (!firstHit) {
        asks = 1;
        const second = decide(reject(probs, [first.code]), none, th);
        twoRoundHit = (second.kind === 'GO' && ok.has(second.code)) || (second.kind === 'ASK' && second.codes.some((c) => ok.has(c)));
      }
    } else if (first.kind === 'ASK') {
      asks = 1;
      twoRoundHit = first.codes.some((c) => ok.has(c));
    }

    const top3 = Object.entries(probs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c, p]) => [c, Math.round(p * 1000) / 1000] as [Code, number]);
    const r: ItemResult = { text: it.text, expect: it.expect, tag, first, firstHit, twoRoundHit, asks, ms, top3 };
    results.push(r);
    opts.onProgress?.(i, r);
    if (opts.delayMs) await new Promise((res) => setTimeout(res, opts.delayMs));
  }
  return summarize(decider, results, th, !!opts.registry);
}

export function summarize(decider: Decider, results: ItemResult[], th: Thresholds, fused = false): EvalSummary {
  const n = results.length;
  const inScope = results.filter((r) => r.tag !== 'oos');
  const oos = results.filter((r) => r.tag === 'oos');
  const lat = results.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (arr: ItemResult[], f: (r: ItemResult) => boolean) => (arr.length ? arr.filter(f).length / arr.length : 0);
  const by_tag: EvalSummary['by_tag'] = {};
  for (const tag of ['normal', 'ambiguous', 'oos', 'foreign']) {
    const arr = results.filter((r) => r.tag === tag);
    if (arr.length) by_tag[tag] = { n: arr.length, first_hit: pct(arr, (r) => r.firstHit), two_round_hit: pct(arr, (r) => r.twoRoundHit) };
  }
  return {
    engine: decider.name,
    info: { ...decider.info(), fused: fused },
    n,
    first_hit: pct(inScope, (r) => r.firstHit),
    two_round_hit: pct(inScope, (r) => r.twoRoundHit),
    oos_detect: pct(oos, (r) => r.firstHit),
    avg_asks: n ? results.reduce((s, r) => s + r.asks, 0) / n : 0,
    p50_ms: lat[Math.floor(lat.length * 0.5)] ?? 0,
    p95_ms: lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] ?? 0,
    by_tag,
    thresholds: th,
    items: results,
    ranAt: new Date().toISOString()
  };
}

export function markdownRow(name: string, where: string, s: EvalSummary, mem = ''): string {
  const p = (v: number) => (v * 100).toFixed(1) + '%';
  return `| ${name} | ${where} | ${p(s.first_hit)} | ${p(s.two_round_hit)} | ${p(s.oos_detect)} | ${s.avg_asks.toFixed(2)} | ${Math.round(s.p50_ms)} ms | ${mem} |`;
}

export const MARKDOWN_HEADER =
  '| 模型 / 引擎 | 跑在哪裡 | 首輪命中率 | 2 輪內命中率 | 不在範圍內的辨識率 | 平均追問次數 | 延遲 p50 | 記憶體 |\n|---|---|---|---|---|---|---|---|';

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
