/**
 * 手機原生能力：透過 TownPass 的 flutterObject bridge。
 * 不在 App 內（一般瀏覽器）時，退回 Web Speech API / 簡單的啟發式判斷，方便在電腦上開發。
 *
 * bridge 協定（README 第 1 節）：
 *   送出 flutterObject.postMessage(JSON.stringify({ name, data }))
 *   回覆 'message' 事件，e.data 是 JSON 字串 { name, data }
 */

export function hasBridge(): boolean {
  return typeof flutterObject !== 'undefined' && !!flutterObject;
}

export function callBridge<T = unknown>(name: string, data: unknown, timeoutMs = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!hasBridge()) return reject(new Error('no_bridge'));
    const timer = setTimeout(() => {
      flutterObject!.removeEventListener('message', onMsg);
      reject(new Error('bridge_timeout:' + name));
    }, timeoutMs);
    const onMsg = (e: { data: string }) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg?.name !== name) return; // 其他回覆不是給我們的
        clearTimeout(timer);
        flutterObject!.removeEventListener('message', onMsg);
        resolve(msg.data as T);
      } catch {
        /* 不是 JSON，略過 */
      }
    };
    flutterObject!.addEventListener('message', onMsg);
    flutterObject!.postMessage(JSON.stringify({ name, data }));
  });
}

/* ---------- 語音轉文字 ---------- */

export interface SttResult {
  text: string;
  lang?: string;
  error?: string;
}

export async function stt(lang: string = 'zh-TW'): Promise<SttResult> {
  if (hasBridge()) {
    // 離線時用手機內建的離線辨識（要先在「設定 → Google 語音 → 離線語音辨識」下載語言包）
    const r = await callBridge<SttResult | string>('stt', { lang, offline: !navigator.onLine }, 60000);
    return typeof r === 'string' ? { text: r } : r;
  }
  return webSpeech(lang);
}

function webSpeech(lang: string): Promise<SttResult> {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) {
    const text = window.prompt('這個瀏覽器不支援語音，請直接輸入：') ?? '';
    return Promise.resolve({ text });
  }
  return new Promise((resolve) => {
    const rec = new SR();
    rec.lang = lang === 'auto' ? 'zh-TW' : lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let done = false;
    rec.onresult = (ev: any) => {
      done = true;
      resolve({ text: ev.results[0][0].transcript as string });
    };
    rec.onerror = (ev: any) => {
      if (!done) resolve({ text: '', error: ev.error });
    };
    rec.onend = () => {
      if (!done) resolve({ text: '', error: 'no_speech' });
    };
    rec.start();
  });
}

/** 語音辨識中的即時字幕（App 內才有）。回傳取消監聽的函式 */
export function onSttPartial(cb: (text: string) => void): () => void {
  if (!hasBridge()) return () => {};
  const h = (e: { data: string }) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg?.name === 'stt_partial' && msg.data?.text) cb(String(msg.data.text));
    } catch {
      /* ignore */
    }
  };
  flutterObject!.addEventListener('message', h);
  return () => flutterObject!.removeEventListener('message', h);
}

/* ---------- 語言辨識 ---------- */

export async function langId(text: string): Promise<{ lang: string; conf: number }> {
  if (hasBridge()) {
    try {
      const r = await callBridge<{ lang: string; conf: number }>('lang_id', { text }, 5000);
      if (r && r.lang) return r;
    } catch {
      /* fall through */
    }
  }
  return heuristicLangId(text);
}

/** 沒有 ML Kit 時的簡單判斷：看字元所屬的文字系統 */
export function heuristicLangId(text: string): { lang: string; conf: number } {
  if (/[一-鿿]/.test(text)) return { lang: 'zh', conf: 0.9 };
  if (/[฀-๿]/.test(text)) return { lang: 'th', conf: 0.9 };
  if (/[ăâđêôơưĂÂĐÊÔƠƯạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(text)) return { lang: 'vi', conf: 0.8 };
  if (/\b(saya|mau|bayar|tolong|tidak|ingin|bagaimana)\b/i.test(text)) return { lang: 'id', conf: 0.6 };
  if (/[a-z]/i.test(text)) return { lang: 'en', conf: 0.6 };
  return { lang: 'und', conf: 0 };
}

/* ---------- 翻譯（輸入走手機翻譯；輸出用預翻好的模板，不在這裡） ---------- */

export async function translate(text: string, from: string, to: string): Promise<string> {
  if (from === to || from === 'und') return text;
  if (hasBridge()) {
    try {
      const r = await callBridge<{ text: string } | string>('translate', { text, from, to }, 20000);
      const out = typeof r === 'string' ? r : r?.text;
      if (out) return out;
    } catch {
      /* fall through */
    }
  }
  return text; // 電腦上沒有翻譯：原文直接丟給決策器（英文也看得懂）
}

/* ---------- 朗讀 ---------- */

export function tts(text: string, lang = 'zh-TW'): void {
  if ('speechSynthesis' in window) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.9;
      speechSynthesis.speak(u);
      return;
    } catch {
      /* fall through */
    }
  }
  if (hasBridge()) callBridge('tts', { text, lang }, 1000).catch(() => {});
}

/* ---------- 導向 ---------- */

export function openExternal(url: string) {
  if (hasBridge()) callBridge('open_link', url, 1000).catch(() => {});
  else window.open(url, '_blank');
}

export function phoneCall(number: string) {
  if (hasBridge()) callBridge('phone_call', number, 1000).catch(() => {});
  else location.href = 'tel:' + number;
}
