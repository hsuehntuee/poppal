/**
 * 隱藏除錯用的 log：環形緩衝存在 localStorage（同源的小幫手頁與引導層共用），
 * 另外攔截 console.error / warn。看法：小幫手標題連點三下 → #/debug。
 */
export interface LogEntry {
  t: number;
  lv: 'info' | 'warn' | 'error';
  src: string;
  msg: string;
  data?: unknown;
}

const KEY = 'tp_debug_log';
const MAX = 400;
let buf: LogEntry[] | null = null;

function load(): LogEntry[] {
  if (buf) return buf;
  try {
    buf = JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    buf = [];
  }
  return buf!;
}
let flushTimer = 0;
function flush() {
  clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(load().slice(-MAX)));
    } catch {
      /* ignore */
    }
  }, 200);
}

export function tplog(src: string, msg: string, data?: unknown, lv: LogEntry['lv'] = 'info') {
  const list = load();
  let safe: unknown = data;
  try {
    if (data !== undefined) safe = JSON.parse(JSON.stringify(data));
  } catch {
    safe = String(data);
  }
  list.push({ t: Date.now(), lv, src, msg, data: safe });
  if (list.length > MAX) list.splice(0, list.length - MAX);
  flush();
}

export function readLog(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}
export function clearLog() {
  buf = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** 攔截 console.error / warn 與未捕捉的錯誤 */
export function hookConsole(src: string) {
  const w = window as any;
  if (w.__tpLogHooked) return;
  w.__tpLogHooked = true;
  const err = console.error.bind(console);
  const warn = console.warn.bind(console);
  console.error = (...a: unknown[]) => {
    tplog(src, a.map(String).join(' '), undefined, 'error');
    err(...a);
  };
  console.warn = (...a: unknown[]) => {
    tplog(src, a.map(String).join(' '), undefined, 'warn');
    warn(...a);
  };
  window.addEventListener('error', (e) => tplog(src, 'uncaught: ' + e.message, { file: e.filename, line: e.lineno }, 'error'));
  window.addEventListener('unhandledrejection', (e) => tplog(src, 'unhandled: ' + String((e as PromiseRejectionEvent).reason), undefined, 'error'));
}

/** 連點三下（1.2 秒內）或長按 1.2 秒觸發 */
export function onTripleTap(el: HTMLElement, cb: () => void) {
  let n = 0;
  let timer = 0;
  let press = 0;
  el.addEventListener('click', () => {
    n++;
    clearTimeout(timer);
    timer = window.setTimeout(() => (n = 0), 1200);
    if (n >= 3) {
      n = 0;
      cb();
    }
  });
  const down = () => {
    clearTimeout(press);
    press = window.setTimeout(cb, 1200);
  };
  const up = () => clearTimeout(press);
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
