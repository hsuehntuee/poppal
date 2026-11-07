/**
 * FILL：用規則從使用者說的話抽出要填的內容，不用模型產生。
 * accept 規則：digits | phone | date | text
 */
export type AcceptKind = 'digits' | 'phone' | 'date' | 'text';

const ZH_DIGITS: Record<string, string> = {
  零: '0', 〇: '0', 一: '1', 壹: '1', 二: '2', 兩: '2', 貳: '2', 三: '3', 參: '3', 四: '4', 肆: '4',
  五: '5', 伍: '5', 六: '6', 陸: '6', 七: '7', 柒: '7', 八: '8', 捌: '8', 九: '9', 玖: '9', 么: '1', 幺: '1'
};

/** 把句子裡的中文數字、全形數字轉成半形阿拉伯數字（逐字對應，不處理「十、百」位值） */
export function normalizeDigits(text: string): string {
  return text
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[零〇一壹二兩貳三參四肆五伍六陸七柒八捌九玖么幺]/g, (ch) => ZH_DIGITS[ch] ?? ch);
}

export interface ExtractResult {
  ok: boolean;
  value: string;
  reason?: string;
}

export function extract(text: string, kind: AcceptKind, opts: { minLen?: number; maxLen?: number } = {}): ExtractResult {
  const t = normalizeDigits(text);
  switch (kind) {
    case 'digits': {
      // 取最長的一串數字（允許中間有空白、連字號、頓號）
      const runs = t.match(/[0-9][0-9\s\-－、]*[0-9]|[0-9]/g) ?? [];
      const cleaned = runs.map((r) => r.replace(/[^0-9]/g, '')).sort((a, b) => b.length - a.length);
      const best = cleaned[0] ?? '';
      if (!best) return { ok: false, value: '', reason: 'no_digits' };
      if (opts.minLen && best.length < opts.minLen) return { ok: false, value: best, reason: 'too_short' };
      if (opts.maxLen && best.length > opts.maxLen) return { ok: false, value: best, reason: 'too_long' };
      return { ok: true, value: best };
    }
    case 'phone': {
      const m = t.replace(/[\s\-－]/g, '').match(/09[0-9]{8}/);
      return m ? { ok: true, value: m[0] } : { ok: false, value: '', reason: 'no_phone' };
    }
    case 'date': {
      // 2024/5/1、2024-05-01、5月1日、113年5月1日
      let m = t.match(/(\d{2,4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})日?/);
      if (m) {
        let y = parseInt(m[1], 10);
        if (y < 1911) y += 1911; // 民國
        return { ok: true, value: `${y}-${pad(m[2])}-${pad(m[3])}` };
      }
      m = t.match(/(\d{1,2})月(\d{1,2})日?/);
      if (m) {
        const y = new Date().getFullYear();
        return { ok: true, value: `${y}-${pad(m[1])}-${pad(m[2])}` };
      }
      return { ok: false, value: '', reason: 'no_date' };
    }
    default: {
      const v = text.trim();
      return v ? { ok: true, value: v } : { ok: false, value: '', reason: 'empty' };
    }
  }
}

function pad(s: string) {
  return s.padStart(2, '0');
}
