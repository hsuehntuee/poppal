/** 使用者設定：長輩/一般模式、語言、引擎。存在 localStorage，服務頁的 overlay 也會讀（同源） */
export type Mode = 'kid' | 'normal' | 'elder';
export type EngineKind = 'auto' | 'llm' | 'llm-phone' | 'cls' | 'embed' | 'tiny';

const K = {
  mode: 'tp_assistant_mode',
  lang: 'tp_assistant_lang',
  engine: 'tp_assistant_engine',
  llmUrl: 'tp_assistant_llm_url'
};

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

export const settings = {
  get mode(): Mode | null {
    const v = get(K.mode);
    return v === 'elder' || v === 'normal' || v === 'kid' ? v : null;
  },
  set mode(v: Mode | null) {
    set(K.mode, v);
    applyMode(v ?? 'normal');
  },
  get lang(): string {
    return new URLSearchParams(location.search).get('lang') || get(K.lang) || 'zh';
  },
  set lang(v: string) {
    set(K.lang, v);
  },
  get engine(): EngineKind {
    const q = new URLSearchParams(location.search).get('engine');
    const v = q || get(K.engine) || 'auto';
    return (['auto', 'llm', 'llm-phone', 'cls', 'embed', 'tiny'].includes(v) ? v : 'auto') as EngineKind;
  },
  set engine(v: EngineKind) {
    set(K.engine, v);
  },
  /** LLM 網址：?llm=... > localStorage > VITE_LLM_URL > /llm */
  get llmUrl(): string {
    const q = new URLSearchParams(location.search).get('llm');
    if (q) set(K.llmUrl, q);
    return q || get(K.llmUrl) || (window as any).__TP_LLM_URL__ || (import.meta as any).env?.VITE_LLM_URL || '/llm';
  },
  set llmUrl(v: string) {
    set(K.llmUrl, v);
  }
};

export function applyMode(mode: Mode) {
  document.documentElement.dataset.mode = mode;
}
