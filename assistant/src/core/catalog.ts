import type { Catalog, Option, ServiceEntry, ScoreRequest } from './types';

let cached: Catalog | null = null;

/** 小幫手靜態檔的根路徑（/assistant/）。Node 端請用 loadCatalogFromFile */
export const ASSISTANT_BASE: string =
  typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL ? (import.meta as any).env.BASE_URL : '/assistant/';

export async function loadCatalog(): Promise<Catalog> {
  if (cached) return cached;
  const res = await fetch(`${ASSISTANT_BASE}data/catalog.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error('catalog.json load failed: ' + res.status);
  cached = (await res.json()) as Catalog;
  return cached;
}

export function setCatalog(c: Catalog) {
  cached = c;
}

export function serviceOptions(c: Catalog): Option[] {
  const opts: Option[] = c.services.map((s) => ({
    code: s.code,
    id: s.id,
    label: s.title.zh,
    desc: s.desc,
    examples: s.examples,
    keywords: s.keywords
  }));
  opts.push({ code: c.none_code, id: 'none', label: '都不是', desc: '以上都不是，或是跟市政服務無關', examples: ['今天天氣真好', '你是誰', '唱首歌給我聽', 'hello'] });
  return opts;
}

export function serviceRequest(c: Catalog, text: string): ScoreRequest {
  return { text, options: serviceOptions(c), instruction: c.instruction, noneCode: c.none_code, setId: 'services' };
}

export function commandOptions(c: Catalog): Option[] {
  return c.commands.options.map((o) => ({ ...o }));
}

export function commandRequest(c: Catalog, text: string, context: string): ScoreRequest {
  return {
    text,
    options: commandOptions(c),
    instruction: c.commands.instruction,
    noneCode: c.commands.none_code,
    context,
    setId: 'commands'
  };
}

export function serviceByCode(c: Catalog, code: string): ServiceEntry | undefined {
  return c.services.find((s) => s.code === code);
}

export function serviceById(c: Catalog, id: string): ServiceEntry | undefined {
  return c.services.find((s) => s.id === id);
}
