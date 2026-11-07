import type { Decider, ScoreRequest } from '../core/types';
import { LlmDecider } from './llm';
import { EmbedDecider } from './embed';
import { TinyDecider } from './tiny';
import { ClsDecider } from './cls';
import { ASSISTANT_BASE } from '../core/catalog';
import type { EngineKind } from '../core/settings';
import { hasBridge } from '../core/bridge';

export { LlmDecider, EmbedDecider, TinyDecider, ClsDecider };

export interface EngineConfig {
  kind: EngineKind;
  llmUrl: string;
  sets: Array<Pick<ScoreRequest, 'options' | 'instruction' | 'noneCode' | 'setId'>>;
  onStatus?: (msg: string) => void;
}

/**
 * 引擎工廠。auto 的順序：llm（有 llama-server 才用）→ cls（微調分類器，有模型檔才用）→ tiny → embed。
 * 回傳已經 ready 的 decider。
 */
export async function createDecider(cfg: EngineConfig): Promise<Decider> {
  // auto：手機本地 llama-server（App 內才試）→ 設定的 LLM 網址 → cls → tiny → embed
  const order: EngineKind[] = cfg.kind === 'auto' ? [...(hasBridge() ? (['llm-phone'] as EngineKind[]) : []), 'llm', 'cls', 'tiny', 'embed'] : [cfg.kind];
  let lastErr: unknown = null;
  for (const k of order) {
    try {
      cfg.onStatus?.(`載入引擎 ${k}…`);
      const d = k === 'embed' ? new EmbedDecider({ localModelPath: `${ASSISTANT_BASE}models/`, precomputed: await loadPrecomputed() }) : build(k, cfg);
      await d.ready({ sets: cfg.sets });
      cfg.onStatus?.('');
      return d;
    } catch (e) {
      lastErr = e;
      cfg.onStatus?.(`引擎 ${k} 不可用：${(e as Error).message}`);
    }
  }
  throw lastErr ?? new Error('no_engine');
}

function build(kind: EngineKind, cfg: EngineConfig): Decider {
  switch (kind) {
    case 'llm':
      return new LlmDecider(cfg.llmUrl);
    case 'llm-phone':
      // 在 App 內：手機本地的 llama-server（路線 B / NPU）
      return new LlmDecider('http://localhost:8080');
    case 'cls':
      return new ClsDecider({ modelBase: `${ASSISTANT_BASE}models/` });
    case 'tiny':
      return new TinyDecider({ modelBase: `${ASSISTANT_BASE}models/` });
    case 'embed':
      return new EmbedDecider({ localModelPath: `${ASSISTANT_BASE}models/`, precomputed: {} });
    default:
      throw new Error('unknown_engine');
  }
}

/** 讀預先算好的向量（可有可無） */
export async function loadPrecomputed(): Promise<Record<string, any>> {
  try {
    const res = await fetch(`${ASSISTANT_BASE}models/embeddings.json`, { cache: 'force-cache' });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}
