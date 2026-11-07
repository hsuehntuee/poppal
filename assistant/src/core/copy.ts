import { ASSISTANT_BASE } from './catalog';

export type Copy = Record<string, string>;

const cache = new Map<string, Copy>();

export async function loadCopy(lang: string): Promise<Copy> {
  const l = ['zh', 'en', 'vi', 'id', 'th'].includes(lang) ? lang : 'zh';
  if (cache.has(l)) return cache.get(l)!;
  const res = await fetch(`${ASSISTANT_BASE}data/copy.${l}.json`, { cache: 'no-cache' });
  const c = (await res.json()) as Copy;
  cache.set(l, c);
  return c;
}

/** 模板替換：{title} → params.title */
export function fmt(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}
