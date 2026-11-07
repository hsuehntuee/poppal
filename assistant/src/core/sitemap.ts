/**
 * sitemap.json：事先把 App 爬成一張圖（每一頁有哪些可點的東西、穩定選擇器、點下去到哪一頁）。
 * 執行時用來：
 *   - 規劃路徑：從現在的頁面走到目標頁面要點哪些東西（不用每個服務手寫導航步驟）
 *   - 鎖定：用爬到的穩定選擇器 + 標籤比對，避免鎖錯
 *   - 產生訓練資料：目標 + 畫面標籤 → 該點哪個（一次練進 270M）
 */
export interface SiteElement {
  label: string;
  kind: 'link' | 'button' | 'option' | 'label' | 'field';
  css: string;
  leads_to?: string;
  effect?: string;
  value?: string;
  placeholder?: string;
  /** 要先點某個東西（展開 / 切分頁）才會出現 */
  requires_click?: string;
  requires_label?: string;
}
export interface SitePage {
  title: string;
  elements: SiteElement[];
}
export interface Sitemap {
  version: number;
  crawled_at: string;
  pages: Record<string, SitePage>;
}

let cached: Sitemap | null = null;
export async function loadSitemap(base: string): Promise<Sitemap | null> {
  if (cached) return cached;
  try {
    const res = await fetch(`${base}data/sitemap.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    cached = (await res.json()) as Sitemap;
    return cached;
  } catch {
    return null;
  }
}

/** 把網址正規化成 sitemap 的 key（去掉 query / hash，保留 path） */
export function pageKey(url: string): string {
  try {
    const u = new URL(url, 'http://x');
    return u.pathname.replace(/\/$/, '') || '/';
  } catch {
    return url;
  }
}

/** 找出這一頁上會通到 `target`（regex 或 path）的元素；含「要先點 X 才會出現」的資訊 */
export function edgesTo(map: Sitemap, from: string, target: string | RegExp): SiteElement[] {
  const page = map.pages[pageKey(from)];
  if (!page) return [];
  const re = typeof target === 'string' ? new RegExp('^' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : target;
  return page.elements.filter((e) => e.leads_to && re.test(e.leads_to));
}

/**
 * BFS：從 from 走到符合 target 的頁面，回傳要依序點的元素（每個都帶 css + label）。
 * 找不到回傳 null；已經在目標頁回傳 []。
 */
export function findPath(map: Sitemap, from: string, target: RegExp, maxDepth = 4): SiteElement[] | null {
  const start = pageKey(from);
  if (target.test(start)) return [];
  const queue: Array<{ url: string; path: SiteElement[] }> = [{ url: start, path: [] }];
  const seen = new Set([start]);
  while (queue.length) {
    const { url, path } = queue.shift()!;
    if (path.length >= maxDepth) continue;
    const page = map.pages[url];
    if (!page) continue;
    for (const e of page.elements) {
      if (!e.leads_to) continue;
      const next = pageKey(e.leads_to);
      if (seen.has(next)) continue;
      const np = [...path, e];
      if (target.test(next)) return np;
      seen.add(next);
      queue.push({ url: next, path: np });
    }
  }
  return null;
}

/** 這一頁 sitemap 知道的候選元素（給鎖定 / 版面感知用） */
export function elementsOf(map: Sitemap, url: string): SiteElement[] {
  return map.pages[pageKey(url)]?.elements ?? [];
}
