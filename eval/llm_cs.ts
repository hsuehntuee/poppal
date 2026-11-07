/**
 * LlmDecider variant that accepts lower-case answer letters (codes a-m).
 * assistant/src/engines/llm.ts tokenToCode() only accepts [A-Z], so the 13 lower-case tools
 * (a..m) can never be returned by the shipped LLM engine. This subclass is used by eval.ts with
 * --llm-lowercase to measure what the model itself knows; it does not change the app.
 */
import { LlmDecider, parseNative, parseOpenAI } from '../assistant/src/engines/llm';
import { buildPrompt } from '../assistant/src/core/prompt';
import { softmax } from '../assistant/src/core/decide';
import type { Probs, ScoreRequest } from '../assistant/src/core/types';

export class LlmDeciderCS extends LlmDecider {
  async score(req: ScoreRequest): Promise<Probs> {
    const self = this as any;
    const raw = await self.complete(buildPrompt(req));
    self.lastRaw = raw;
    const tm = raw?.timings;
    if (tm) self.lastTimings = { prompt_n: tm.prompt_n, prompt_ms: Math.round(tm.prompt_ms), predicted_ms: Math.round((tm.predicted_ms ?? 0) * 10) / 10 };
    const lps = self.api === 'native' ? parseNative(raw) : parseOpenAI(raw);
    const codes = new Set(req.options.map((o) => o.code));
    const by: Record<string, number[]> = {};
    for (const { token, logprob } of lps) {
      const t = token.trim();
      if (/^[A-Za-z]$/.test(t) && codes.has(t)) (by[t] ??= []).push(logprob);
    }
    const logits: Record<string, number> = {};
    for (const [c, a] of Object.entries(by)) {
      const m = Math.max(...a);
      logits[c] = m + Math.log(a.reduce((s, v) => s + Math.exp(v - m), 0));
    }
    if (!Object.keys(logits).length) return { [req.noneCode]: 1 };
    const probs = softmax(logits);
    for (const c of codes) if (!(c in probs)) probs[c] = 0;
    return probs;
  }
}
