/** 模型分布 + 查表先驗 → 最終分布。P1 入口頁與評測共用，保證量到的就是上線的行為。 */
import type { Probs } from './types';
import { type Registry, lookup, fuse, type Hit } from './registry';

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
