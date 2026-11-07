import type { Code, Decision, Probs, Thresholds } from './types';
import { DEFAULT_THRESHOLDS } from './types';

/** 由高到低排序的 [code, p] */
export function ranked(probs: Probs): Array<[Code, number]> {
  return Object.entries(probs).sort((a, b) => b[1] - a[1]);
}

/**
 * 決策規則（三種引擎共用）：
 *   Z 最高               → NONE
 *   p1 ≥ go              → GO(第一名)
 *   p1 + p2 ≥ ask2       → ASK(前 2 名)
 *   p1 + p2 + p3 ≥ ask3  → ASK(前 3 名)
 *   否則                 → NONE
 * ASK 的候選不含 Z；若只剩一個候選就視為 GO。
 */
export function decide(probs: Probs, noneCode: Code, th: Thresholds = DEFAULT_THRESHOLDS): Decision {
  const all = ranked(probs);
  if (all.length === 0) return { kind: 'NONE', p: 0 };
  if (all[0][0] === noneCode) return { kind: 'NONE', p: all[0][1] };

  const cands = all.filter(([c]) => c !== noneCode);
  const [c1, p1] = cands[0];
  if (p1 >= th.go) return { kind: 'GO', code: c1, p: p1 };

  const p2 = cands[1]?.[1] ?? 0;
  if (p1 + p2 >= th.ask2) return askOrGo(cands.slice(0, 2), p1 + p2);

  const p3 = cands[2]?.[1] ?? 0;
  if (p1 + p2 + p3 >= th.ask3) return askOrGo(cands.slice(0, 3), p1 + p2 + p3);

  return { kind: 'NONE', p: p1 };
}

function askOrGo(cands: Array<[Code, number]>, p: number): Decision {
  const codes = cands.filter(([, v]) => v > 0).map(([c]) => c);
  if (codes.length <= 1) return codes.length === 1 ? { kind: 'GO', code: codes[0], p } : { kind: 'NONE', p };
  return { kind: 'ASK', codes, p };
}

/** 使用者按「不是」：把該選項歸零、重新正規化，不需要再呼叫模型 */
export function reject(probs: Probs, rejected: Code[]): Probs {
  const out: Probs = {};
  let sum = 0;
  for (const [c, p] of Object.entries(probs)) {
    if (rejected.includes(c)) continue;
    out[c] = p;
    sum += p;
  }
  if (sum <= 0) return out;
  for (const c of Object.keys(out)) out[c] /= sum;
  return out;
}

/** logits / logprobs → 機率 */
export function softmax(logits: Record<Code, number>, temperature = 1): Probs {
  const keys = Object.keys(logits);
  if (keys.length === 0) return {};
  const scaled = keys.map((k) => logits[k] / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const out: Probs = {};
  keys.forEach((k, i) => (out[k] = exps[i] / sum));
  return out;
}
