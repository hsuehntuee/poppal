import type { Code, Decider, Option, Probs, ScoreRequest } from '../core/types';
import { softmax } from '../core/decide';

export interface EmbedOptions {
  modelId?: string;
  dtype?: 'q8' | 'fp32' | 'fp16';
  /** 本機模型目錄（瀏覽器：/assistant/models/；Node：檔案路徑）。找不到才去 HF Hub 抓 */
  localModelPath?: string;
  allowRemote?: boolean;
  /** 預先算好的例句向量 {setId: {code: number[][]}}，沒有就啟動時現算 */
  precomputed?: Record<string, PrecomputedSet>;
  /** 相似度 → logit 的溫度；越小分布越尖 */
  temperature?: number;
  /** 「都不是」的固定相似度：最高相似度低於它時 Z 就會勝出 */
  zSim?: number;
}

export interface PrecomputedSet {
  model: string;
  dim: number;
  items: Record<Code, number[][]>;
}

type Extractor = (texts: string[], opts: Record<string, unknown>) => Promise<{ tolist(): number[][] }>;

/**
 * 向量保底引擎：transformers.js + multilingual-e5-small，在 WebView 內跑。
 * 使用者的話和每個服務的 examples 算 cosine；每個服務取最高分，除以溫度後 softmax。
 */
export class EmbedDecider implements Decider {
  readonly name = 'embed';
  private modelId: string;
  private dtype: 'q8' | 'fp32' | 'fp16';
  private localModelPath?: string;
  private allowRemote: boolean;
  private extractor: Extractor | null = null;
  private sets = new Map<string, Record<Code, number[][]>>();
  private precomputed: Record<string, PrecomputedSet>;
  temperature: number;
  zSim: number;
  private loadMs = 0;

  constructor(opts: EmbedOptions = {}) {
    this.modelId = opts.modelId ?? 'Xenova/multilingual-e5-small';
    this.dtype = opts.dtype ?? 'q8';
    this.localModelPath = opts.localModelPath;
    this.allowRemote = opts.allowRemote ?? true;
    this.precomputed = opts.precomputed ?? {};
    this.temperature = opts.temperature ?? 0.005; // 用 eval 調出來的
    this.zSim = opts.zSim ?? 0.8;
  }

  async ready(setup?: { sets: Array<Pick<ScoreRequest, 'options' | 'instruction' | 'noneCode' | 'setId'>> }): Promise<void> {
    if (!this.extractor) {
      const t0 = Date.now();
      const tf: any = await import('@huggingface/transformers');
      if (this.localModelPath) {
        tf.env.allowLocalModels = true;
        tf.env.localModelPath = this.localModelPath;
      }
      tf.env.allowRemoteModels = this.allowRemote;
      this.extractor = (await tf.pipeline('feature-extraction', this.modelId, { dtype: this.dtype })) as Extractor;
      this.loadMs = Date.now() - t0;
    }
    for (const s of setup?.sets ?? []) await this.prepareSet(s.setId ?? 'default', s.options);
  }

  private async prepareSet(setId: string, options: Option[]) {
    if (this.sets.has(setId)) return;
    const pre = this.precomputed[setId];
    if (pre && pre.model === this.modelId) {
      this.sets.set(setId, pre.items);
      return;
    }
    const items: Record<Code, number[][]> = {};
    for (const o of options) {
      const texts = [o.label, ...(o.examples ?? []), ...(o.keywords ?? [])];
      items[o.code] = await this.embed(texts.map((t) => 'query: ' + t));
    }
    this.sets.set(setId, items);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.extractor) await this.ready();
    const out = await this.extractor!(texts, { pooling: 'mean', normalize: true });
    return out.tolist();
  }

  async score(req: ScoreRequest): Promise<Probs> {
    const setId = req.setId ?? 'default';
    if (!this.sets.has(setId)) await this.prepareSet(setId, req.options);
    const items = this.sets.get(setId)!;
    const [q] = await this.embed(['query: ' + req.text]);
    const logits: Record<Code, number> = {};
    for (const o of req.options) {
      const vecs = items[o.code] ?? [];
      let best = -1;
      for (const v of vecs) best = Math.max(best, dot(q, v));
      if (o.code === req.noneCode) best = Math.max(best, this.zSim);
      logits[o.code] = best / this.temperature;
    }
    return softmax(logits);
  }

  info() {
    return { engine: 'embed', model: this.modelId, dtype: this.dtype, temperature: this.temperature, zSim: this.zSim, loadMs: this.loadMs };
  }

  /** 給 precompute 腳本用：把某個選項集的向量倒出來 */
  async dumpSet(setId: string, options: Option[]): Promise<PrecomputedSet> {
    await this.prepareSet(setId, options);
    const items = this.sets.get(setId)!;
    const dim = Object.values(items)[0]?.[0]?.length ?? 0;
    return { model: this.modelId, dim, items };
  }
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
