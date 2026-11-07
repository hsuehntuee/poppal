import type { Code, Decider, Probs, ScoreRequest } from '../core/types';
import { buildPrefix, buildPrompt } from '../core/prompt';
import { softmax } from '../core/decide';

export interface LlmOptions {
  /** 'native' 用 llama-server 的 /completion；'openai' 用 /v1/completions */
  api?: 'native' | 'openai';
  /** 取前幾個 token 的 logprob，要大到涵蓋所有代號 */
  topN?: number;
  timeoutMs?: number;
}

/**
 * LLM 引擎：只算 1 個 token，取 A～Z 的 logprob 做 softmax。
 * 電腦（4090 / 筆電）和手機（localhost:8080）共用同一份程式碼，只換網址。
 */
export class LlmDecider implements Decider {
  readonly name = 'llm';
  private api: 'native' | 'openai';
  private topN: number;
  private timeoutMs: number;
  private model = '';
  private lastRaw: unknown = null;
  private warned = 0;
  private lastTimings: Record<string, number> = {};

  constructor(
    public baseUrl: string,
    opts: LlmOptions = {}
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.api = opts.api ?? 'native';
    this.topN = opts.topN ?? 40;
    this.timeoutMs = opts.timeoutMs ?? 20000;
  }

  /** 連線檢查 + 把固定前綴先算一次（cache_prompt 之後只處理查詢的十幾個 token） */
  async ready(setup?: { sets: Array<Pick<ScoreRequest, 'options' | 'instruction' | 'noneCode' | 'setId'>> }): Promise<void> {
    const h = await this.fetchJson('/health', undefined, 3000).catch(() => null);
    if (!h) throw new Error('llm_unreachable');
    try {
      const props = await this.fetchJson('/props', undefined, 3000);
      this.model = props?.default_generation_settings?.model || props?.model_path || props?.model || '';
      if (typeof this.model === 'string') this.model = this.model.split(/[\\/]/).pop() ?? this.model;
    } catch {
      /* 舊版沒有 /props */
    }
    for (const s of setup?.sets ?? []) {
      const prefix = buildPrefix(s.options, s.instruction, s.noneCode);
      await this.complete(prefix + '使用者：暖機\n答案：').catch(() => null);
    }
  }

  async score(req: ScoreRequest): Promise<Probs> {
    const prompt = buildPrompt(req);
    const raw = await this.complete(prompt);
    this.lastRaw = raw;
    const tm = (raw as any)?.timings;
    if (tm) this.lastTimings = { prompt_n: tm.prompt_n, prompt_ms: Math.round(tm.prompt_ms), predicted_ms: Math.round((tm.predicted_ms ?? 0) * 10) / 10, tok_per_s: tm.prompt_ms ? Math.round((tm.prompt_n / tm.prompt_ms) * 1000) : 0 };
    const logprobs = this.api === 'native' ? parseNative(raw) : parseOpenAI(raw);
    const codes = new Set(req.options.map((o) => o.code));
    const byCode: Record<Code, number[]> = {};
    for (const { token, logprob } of logprobs) {
      const c = tokenToCode(token);
      if (c && codes.has(c)) (byCode[c] ??= []).push(logprob);
    }
    const logits: Record<Code, number> = {};
    for (const [c, arr] of Object.entries(byCode)) logits[c] = logsumexp(arr);
    if (Object.keys(logits).length === 0) {
      this.warned++;
      return { [req.noneCode]: 1 };
    }
    const probs = softmax(logits);
    // 沒出現在 top-N 的代號機率視為 0
    for (const c of codes) if (!(c in probs)) probs[c] = 0;
    return probs;
  }

  info() {
    return { engine: 'llm', url: this.baseUrl, api: this.api, model: this.model, topN: this.topN, noCodeInTopN: this.warned, ...this.lastTimings };
  }

  lastResponse() {
    return this.lastRaw;
  }

  private async complete(prompt: string): Promise<any> {
    if (this.api === 'native') {
      return this.fetchJson('/completion', {
        prompt,
        n_predict: 1,
        temperature: 0,
        n_probs: this.topN,
        cache_prompt: true,
        stream: false,
        // 關掉會把候選砍掉的取樣器，確保看到的是原始分布
        top_k: 0,
        top_p: 1,
        min_p: 0,
        samplers: []
      });
    }
    return this.fetchJson('/v1/completions', {
      prompt,
      max_tokens: 1,
      temperature: 0,
      logprobs: this.topN,
      cache_prompt: true,
      stream: false
    });
  }

  private async fetchJson(path: string, body?: unknown, timeoutMs = this.timeoutMs): Promise<any> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(this.baseUrl + path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error(`llm_http_${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

interface TokLp {
  token: string;
  logprob: number;
}

/** llama-server /completion 的 completion_probabilities，新舊格式都處理 */
export function parseNative(raw: any): TokLp[] {
  const first = raw?.completion_probabilities?.[0];
  if (!first) return [];
  const out: TokLp[] = [];
  const list = first.top_logprobs ?? first.top_probs ?? first.probs ?? [];
  for (const it of list) {
    const token = it.token ?? it.tok_str ?? '';
    const logprob = typeof it.logprob === 'number' ? it.logprob : typeof it.prob === 'number' ? Math.log(Math.max(it.prob, 1e-12)) : NaN;
    if (token && !Number.isNaN(logprob)) out.push({ token, logprob });
  }
  // 被取樣到的 token 本身也放進去（有些版本不在 top 清單裡）
  if (typeof first.token === 'string' && typeof first.logprob === 'number' && !out.some((o) => o.token === first.token)) {
    out.push({ token: first.token, logprob: first.logprob });
  }
  return out;
}

/** OpenAI 相容 /v1/completions 的 logprobs（llama.cpp 與 vLLM 兩種形狀） */
export function parseOpenAI(raw: any): TokLp[] {
  const lp = raw?.choices?.[0]?.logprobs;
  if (!lp) return [];
  const out: TokLp[] = [];
  if (Array.isArray(lp.content) && lp.content[0]?.top_logprobs) {
    for (const it of lp.content[0].top_logprobs) out.push({ token: it.token, logprob: it.logprob });
  } else if (Array.isArray(lp.top_logprobs) && lp.top_logprobs[0]) {
    for (const [token, logprob] of Object.entries(lp.top_logprobs[0] as Record<string, number>)) out.push({ token, logprob });
  }
  return out;
}

/** " A" / "A" / "A\n" → "A"；其他 token 不算 */
export function tokenToCode(token: string): Code | null {
  const t = token.trim();
  return /^[A-Z]$/.test(t) ? t : null;
}

function logsumexp(arr: number[]): number {
  const m = Math.max(...arr);
  return m + Math.log(arr.reduce((s, v) => s + Math.exp(v - m), 0));
}
