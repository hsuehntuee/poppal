import type { Option, ScoreRequest } from './types';

/**
 * LLM 引擎的 prompt。
 * 固定前綴（說明 + 選項 + 少量示範）每次完全相同，llama-server 用 cache_prompt 快取 KV；
 * 每次查詢只變動最後兩行（十幾個 token），再算 1 個輸出 token。
 *
 * 注意：這裡刻意不用 chat template，直接做純文字續寫，Qwen3 就不會進入 thinking。
 */
const FEWSHOT = (globalThis as any).process?.env?.PROMPT_FEWSHOT !== '0';

export function buildPrefix(options: Option[], instruction: string, noneCode: string): string {
  const lines: string[] = [];
  lines.push(instruction);
  lines.push('');
  for (const o of options) {
    lines.push(`${o.code} ${o.label}：${o.desc}`);
  }
  lines.push('');
  lines.push('規則：只回答一個代號字母。如果都不符合就回答 ' + noneCode + '。');
  lines.push('');
  // 示範：用倒數第二個選項和「都不是」各一句，避免小模型偏向 A。PROMPT_FEWSHOT=0 可關掉（評測用）。
  if (FEWSHOT) {
    const cands = options.filter((o) => o.code !== noneCode);
    const pick = cands[Math.max(0, cands.length - 2)];
    if (pick) {
      const ex = (pick.examples && pick.examples[0]) || pick.label;
      lines.push(`使用者：${ex}`);
      lines.push(`答案：${pick.code}`);
      lines.push('');
    }
    lines.push('使用者：今天天氣真好');
    lines.push(`答案：${noneCode}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function buildQuery(req: ScoreRequest): string {
  const ctx = req.context ? `（目前步驟：${req.context}）` : '';
  return `使用者：${sanitize(req.text)}${ctx}\n答案：`;
}

export function buildPrompt(req: ScoreRequest): string {
  return buildPrefix(req.options, req.instruction, req.noneCode) + buildQuery(req);
}

function sanitize(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/答案：/g, '').trim().slice(0, 200);
}
