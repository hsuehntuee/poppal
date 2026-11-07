import type { Code, Decider, Probs, ScoreRequest } from '../core/types';
import { softmax } from '../core/decide';

/**
 * tiny 引擎：fastText 式的字元 n-gram 分類器，自己實作、兩邊 hash 一致。
 *   特徵：字元 unigram（查表，查不到就 hash）+ 字元 bigram（一律 hash 到 bucket）
 *   模型：embedding bag（平均）→ 線性層 → softmax
 * 模型由 tools/tinycls/train.py 訓練並匯出 JSON；一個選項集一個模型檔。
 * 大小幾 MB，推論不到 1 ms，手機 WebView 直接跑。
 */
export interface TinyModel {
  type: 'tinycls';
  version: number;
  set: string;
  labels: Code[];
  dim: number;
  buckets: number;
  ngram: number;
  vocab: Record<string, number>;
  /** int8 量化的 embedding，base64；shape [(vocab + buckets) * dim] */
  emb_q: string;
  emb_scale: number;
  /** 輸出層 W: [labels * dim]（float，base64 的 float32）、b: [labels] */
  out_w: string;
  out_b: number[];
  temperature?: number;
}

export interface TinyOptions {
  /** 模型檔位置：'/assistant/models/' + `tinycls.<setId>.json` */
  modelBase?: string;
  /** 直接給模型（Node 評測用） */
  models?: Record<string, TinyModel>;
  temperature?: number;
}

export class TinyDecider implements Decider {
  readonly name = 'tiny';
  private modelBase: string;
  private models = new Map<string, Loaded>();
  private given: Record<string, TinyModel>;
  temperature?: number;

  constructor(opts: TinyOptions = {}) {
    this.modelBase = (opts.modelBase ?? '/assistant/models/').replace(/\/?$/, '/');
    this.given = opts.models ?? {};
    this.temperature = opts.temperature;
  }

  async ready(setup?: { sets: Array<Pick<ScoreRequest, 'setId'>> }): Promise<void> {
    for (const s of setup?.sets ?? []) await this.load(s.setId ?? 'default');
  }

  private async load(setId: string): Promise<Loaded> {
    const hit = this.models.get(setId);
    if (hit) return hit;
    let m = this.given[setId];
    if (!m) {
      const res = await fetch(`${this.modelBase}tinycls.${setId}.json`, { cache: 'force-cache' });
      if (!res.ok) throw new Error('tiny_model_missing:' + setId);
      m = (await res.json()) as TinyModel;
    }
    const loaded = decodeModel(m);
    this.models.set(setId, loaded);
    return loaded;
  }

  async score(req: ScoreRequest): Promise<Probs> {
    const m = await this.load(req.setId ?? 'default');
    const logits = tinyLogits(m, req.text);
    const T = this.temperature ?? m.temperature;
    const out: Record<Code, number> = {};
    m.labels.forEach((l, i) => (out[l] = logits[i]));
    const probs = softmax(out, T);
    for (const o of req.options) if (!(o.code in probs)) probs[o.code] = 0;
    return probs;
  }

  info() {
    return { engine: 'tiny', sets: [...this.models.keys()].join(','), base: this.modelBase };
  }
}

interface Loaded {
  labels: Code[];
  dim: number;
  buckets: number;
  ngram: number;
  vocab: Record<string, number>;
  emb: Float32Array;
  w: Float32Array;
  b: number[];
  temperature: number;
}

export function decodeModel(m: TinyModel): Loaded {
  const q = base64ToBytes(m.emb_q);
  const emb = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) emb[i] = ((q[i] << 24) >> 24) * m.emb_scale; // int8 → float
  const wb = base64ToBytes(m.out_w);
  const w = new Float32Array(wb.buffer, wb.byteOffset, wb.byteLength / 4);
  return { labels: m.labels, dim: m.dim, buckets: m.buckets, ngram: m.ngram, vocab: m.vocab, emb, w, b: m.out_b, temperature: m.temperature ?? 1 };
}

/** 和 tools/tinycls/train.py 完全相同的前處理 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)) // 全形 → 半形
    .replace(/[\s　]+/g, '')
    .replace(/[。，、！？；：「」『』（）()\[\]【】《》,.!?;:'"\-_~～…·]/g, '');
}

/** FNV-1a 32-bit，對 UTF-8 bytes 計算 */
export function fnv1a(str: string): number {
  const bytes = utf8(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function featureIds(m: Pick<Loaded, 'vocab' | 'buckets' | 'ngram'>, text: string): number[] {
  const chars = Array.from(normalizeText(text));
  const V = Object.keys(m.vocab).length;
  const ids: number[] = [];
  for (const ch of chars) {
    const idx = m.vocab[ch];
    ids.push(idx !== undefined ? idx : V + (fnv1a('u:' + ch) % m.buckets));
  }
  for (let n = 2; n <= m.ngram; n++) {
    for (let i = 0; i + n <= chars.length; i++) {
      ids.push(V + (fnv1a('n:' + chars.slice(i, i + n).join('')) % m.buckets));
    }
  }
  if (ids.length === 0) ids.push(V); // 空字串
  return ids;
}

export function tinyLogits(m: Loaded, text: string): number[] {
  const ids = featureIds(m, text);
  const d = m.dim;
  const x = new Float32Array(d);
  for (const id of ids) {
    const off = id * d;
    for (let j = 0; j < d; j++) x[j] += m.emb[off + j];
  }
  for (let j = 0; j < d; j++) x[j] /= ids.length;
  const out: number[] = [];
  for (let c = 0; c < m.labels.length; c++) {
    let s = m.b[c];
    const off = c * d;
    for (let j = 0; j < d; j++) s += m.w[off + j] * x[j];
    out.push(s);
  }
  return out;
}

function utf8(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  return Uint8Array.from(Buffer.from(str, 'utf8'));
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}
