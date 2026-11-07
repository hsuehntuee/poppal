/** 模型分布 + 查表先驗 → 最終分布。P1 入口頁與評測共用，保證量到的就是上線的行為。 */
import type { Probs } from './types';
import { type Registry, lookup, fuse, type Hit } from './registry';
import type { Code, Decision } from './types';

export interface FusedResult {
  probs: Probs;
  hits: Hit[];
  boosted: Record<string, number>;
}

export function fuseWithRegistry(registry: Registry | null, text: string, probs: Probs, alpha = 4): FusedResult {
  if (!registry) return { probs, hits: [], boosted: {} };
  const hits = lookup(registry, text);
  const { probs: p, boosted } = fuse(registry, probs, hits, alpha);
  return { probs: p, hits, boosted };
}

/**
 * 模型說「不在範圍內」但句子裡有查表命中的具體詞（「漫畫」→ 圖書借閱）：
 * 詞典不做決定，只決定「要不要再問第二個模型」。回傳候選服務（不歧義、至少兩個字的命中）。
 */
export function rescueCandidates(d: Decision, registry: Registry | null, hits: Hit[], maxNoneP = 0.995): Code[] {
  if (d.kind !== 'NONE' || !registry || !hits.length) return [];
  if (d.p >= maxNoneP) return []; // 模型幾乎確定不在範圍內就相信它
  const byId = new Map(registry.tools.map((t) => [t.id, t.code]));
  const codes: Code[] = [];
  for (const h of hits) {
    if (h.ambiguous || h.term.replace(/\s/g, '').length < 2) continue;
    for (const id of h.tools) {
      const c = byId.get(id);
      if (c && c !== registry.none_code && !codes.includes(c)) codes.push(c);
    }
  }
  return codes;
}

/**
 * 第二意見：另一個模型（e5 分類器，錯法跟 Gemma 不一樣）對同一句的分布。
 * 它的第一名要在候選裡、而且 ≥ minP 才採用 → GO 那個服務（畫面上仍是「要去【X】嗎？」可以按不是）。
 */
export function secondOpinion(d: Decision, candidates: Code[], second: Probs, minP = 0.8): Decision {
  if (!candidates.length) return d;
  const top = Object.entries(second).sort((a, b) => b[1] - a[1])[0];
  if (top && candidates.includes(top[0]) && top[1] >= minP) return { kind: 'GO', code: top[0], p: top[1] };
  return d;
}
