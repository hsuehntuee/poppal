/**
 * 步驟內指令：先跑規則，比對到就不呼叫模型。
 * 指令集固定：NEXT / BACK / HELP / REPEAT / FILL / EXIT / OTHER
 */
export type CommandId = 'NEXT' | 'BACK' | 'HELP' | 'REPEAT' | 'FILL' | 'EXIT' | 'OTHER';

const RULES: Array<[CommandId, RegExp]> = [
  ['REPEAT', /^(再(念|說|講|唸)(一次|一遍)?|沒聽(到|清楚)|重複|再一次|repeat|again|say that again)$/i],
  ['NEXT', /^(下一步|下一個|好了|好|完成|做好了|繼續|可以了|next|done|ok|okay|continue)$/i],
  ['BACK', /^(回(上一步|去|到上一步|上一個)|上一步|退回|back|go back|previous)$/i],
  ['HELP', /^(我不會|不會|看不懂|不懂|怎麼(做|弄|用)|這是什麼|幫我|help|how|i don.?t know|what is this)$/i],
  ['EXIT', /^(不要了|不用了|取消|算了|離開|結束|關掉|關閉|退出|exit|cancel|quit|stop|close)$/i]
];

export function matchCommandRule(text: string): CommandId | null {
  const t = normalize(text);
  if (!t) return null;
  for (const [id, re] of RULES) if (re.test(t)) return id;
  return null;
}

export function normalize(text: string): string {
  return text
    .trim()
    .replace(/[。．.!！?？,，、~～\s]+$/g, '')
    .replace(/^(請|麻煩|幫我|那個|嗯|呃)+/g, '')
    .trim()
    .toLowerCase();
}
