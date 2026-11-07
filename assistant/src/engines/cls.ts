import type { Code, Decider, Probs, ScoreRequest } from '../core/types';
import { softmax } from '../core/decide';

export interface ClsOptions {
  /** 模型目錄的根（瀏覽器：/assistant/models/；Node：檔案路徑）。模型在 `cls-<setId>/` */
  modelBase?: string;
  allowRemote?: boolean;
  /** logits 的溫度；1 = 模型原本的分布 */
  temperature?: number;
}

type Pipe = (texts: string[], opts: Record<string, unknown>) => Promise<Array<Array<{ label: string; score: number }>>>;

/**
 * cls 引擎：微調過的小型編碼器分類器（tools/encoder/train_cls.py 產生），
 * 用 transformers.js 的 text-classification pipeline 跑 ONNX int8。
 * 一次 forward 直接得到所有服務的機率分布（最接近 Jev 的本地做法）。
 */
export class ClsDecider implements Decider {
  readonly name = 'cls';
  private modelBase: string;
  private allowRemote: boolean;
  private pipes = new Map<string, { pipe: Pipe; prefix: string; labels: string[] }>();
  temperature: number;
  private loadMs = 0;

  constructor(opts: ClsOptions = {}) {
    this.modelBase = (opts.modelBase ?? '/assistant/models/').replace(/\/?$/, '/');
    this.allowRemote = opts.allowRemote ?? false;
    this.temperature = opts.temperature ?? 0.7; // eval 調出來的：首輪 93.8%、兩輪 97.9%
  }

  private missing = new Set<string>();

  /** 只有 services 的模型是必要的；其他選項集（例如 commands）沒有模型就略過，交給引導層自己退到 tiny */
  async ready(setup?: { sets: Array<Pick<ScoreRequest, 'setId'>> }): Promise<void> {
    for (const s of setup?.sets ?? []) {
      const id = s.setId ?? 'services';
      try {
        await this.load(id);
      } catch (e) {
        if (id === 'services') throw e;
        this.missing.add(id);
      }
    }
  }

  private async load(setId: string) {
    const hit = this.pipes.get(setId);
    if (hit) return hit;
    if (this.missing.has(setId)) throw new Error('cls_model_missing:' + setId);
    // 先確認模型存在（SPA fallback 會把不存在的路徑回成 index.html）
    const cfg = await fetchConfig(this.modelBase + `cls-${setId}` + '/config.json').catch(() => null);
    if (!cfg || cfg.model_type === undefined) throw new Error('cls_model_missing:' + setId);
    const t0 = Date.now();
    const tf: any = await import('@huggingface/transformers');
    tf.env.allowLocalModels = true;
    tf.env.localModelPath = this.modelBase;
    tf.env.allowRemoteModels = this.allowRemote;
    const id = `cls-${setId}`;
    // transformers.js 會去 <localModelPath>/<id>/config.json、tokenizer.json、onnx/model_quantized.onnx
    const pipe = (await tf.pipeline('text-classification', id, { dtype: 'q8' })) as Pipe;
    const labels = Object.values(cfg.id2label ?? {}) as string[];
    const rec = { pipe, prefix: (cfg.tp_prefix as string) ?? '', labels };
    this.pipes.set(setId, rec);
    this.loadMs = Date.now() - t0;
    return rec;
  }

  async score(req: ScoreRequest): Promise<Probs> {
    const { pipe, prefix } = await this.load(req.setId ?? 'services');
    const [res] = await pipe([prefix + req.text], { top_k: null });
    // pipeline 回 softmax 後的分數；換回 log 域再套溫度
    const logits: Record<Code, number> = {};
    for (const r of res) logits[r.label] = Math.log(Math.max(r.score, 1e-12));
    const probs = softmax(logits, this.temperature);
    for (const o of req.options) if (!(o.code in probs)) probs[o.code] = 0;
    // 模型訓練時有、目錄已經拔掉的類別：丟掉並重新正規化（不然會選到不存在的服務）
    const keep = new Set([...req.options.map((o) => o.code), req.noneCode]);
    let sum = 0;
    for (const c of Object.keys(probs)) {
      if (!keep.has(c)) delete probs[c];
      else sum += probs[c];
    }
    if (sum > 0) for (const c of Object.keys(probs)) probs[c] /= sum;
    return probs;
  }

  info() {
    return { engine: 'cls', base: this.modelBase, temperature: this.temperature, loadMs: this.loadMs };
  }
}

async function fetchConfig(url: string): Promise<any> {
  if (typeof window === 'undefined' && !/^https?:/.test(url)) {
    const fs = await import('node:fs');
    if (!fs.existsSync(url)) throw new Error('missing ' + url);
    return JSON.parse(fs.readFileSync(url, 'utf8'));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('missing ' + url);
  const text = await res.text();
  if (text.trim().startsWith('<')) throw new Error('missing ' + url);
  return JSON.parse(text);
}
