#!/bin/sh
# 手機 WebView 探針：印出目前路徑、陪伴面板文字、亮框對到的元素與螢幕座標（1080x2340，WebView 從 y=226 開始）
#   sh scripts/phone-probe.sh            # 看狀態
#   sh scripts/phone-probe.sh tap        # 看狀態並且實際點一下亮框中心
#   sh scripts/phone-probe.sh "<js>"     # 先在頁面跑一段 js（可用 await sleep(ms)），再看狀態
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.." || exit 1
PID=$(adb shell pidof com.example.townpass | tr -d '\r\n')
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID >/dev/null 2>&1
TMP=scripts/.probe.js
PRE=""
case "$1" in
  ""|tap) ;;
  *) PRE="$1" ;;
esac
{
  echo "(async () => { const sleep = (ms) => new Promise(r => setTimeout(r, ms));"
  if [ -n "$PRE" ]; then echo "await (async () => { $PRE })(); await sleep(600);"; fi
  cat <<'EOF'
const host = [...document.querySelectorAll('*')].find(e => e.shadowRoot && e.shadowRoot.querySelector('.panel'));
const p = host && host.shadowRoot.querySelector('.panel');
const s = host && host.shadowRoot.querySelector('.spot');
let ring = null, on = null;
if (s && s.style.display !== 'none') {
  const r = s.getBoundingClientRect();
  ring = [Math.round((r.left + r.width / 2) * devicePixelRatio), Math.round((r.top + r.height / 2) * devicePixelRatio + 226)];
  const t = document.elementFromPoint(r.left + 8, r.top + r.height / 2);
  on = t && (t.tagName + '|' + (t.textContent || t.placeholder || '').trim().slice(0, 24));
}
const g = window.__tpGuide;
return { path: location.pathname, step: g && (g.state.step + 1), panel: p ? (p.style.display === 'none' ? '[hidden] ' : '') + p.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : 'no-panel', ring, on, fab: !!document.getElementById('tp-fab-host'), logs: JSON.parse(localStorage.getItem('tp_debug_log') || '[]').slice(-6).map(l => l.msg).join(' | ').slice(0, 300) };
})()
EOF
} > "$TMP"
OUT=$(node --experimental-websocket scripts/phone-eval.mjs "townpass.local/" "@$TMP" 2>&1 | tail -40)
echo "$OUT"
if [ "$1" = "tap" ]; then
  XY=$(echo "$OUT" | tr -d '\n ' | sed -n 's/.*"ring":\[\([0-9]*\),\([0-9]*\)\].*/\1 \2/p')
  if [ -n "$XY" ]; then adb shell input tap $XY; echo "tapped $XY"; else echo "no ring to tap"; fi
fi
