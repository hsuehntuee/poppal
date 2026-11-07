#!/bin/sh
# 真機逐步走一個導覽並每一步截圖：
#   sh scripts/phone-case.sh <case名> <guide id> <起始網址> [params json] [步驟動作...]
# 每個步驟動作：tap（點亮框）、text:<字串>（打字，空白用 %s）、enter、tapxy:<x>,<y>、js:<運算式>、sleep:<秒>
# 每做一個動作後截圖到 submission/服務畫面/流程/<case名>/NN.png，並印出面板狀態。
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.." || exit 1
NAME="$1"; GUIDE="$2"; URL="$3"; PARAMS="${4:-{\}}"; shift 4
OUT="submission/服務畫面/流程/$NAME"; mkdir -p "$OUT"; rm -f "$OUT"/*.png
i=0
snap() { i=$((i+1)); adb exec-out screencap -p > "$OUT/$(printf %02d $i)_$1.png"; }
state() { sh scripts/phone-probe.sh | grep -E '"(path|step|panel|on)"' | tr -d '\n' | sed 's/  */ /g'; echo; }
sh scripts/phone-probe.sh "sessionStorage.setItem('tp_guide', JSON.stringify({id:'$GUIDE', step:0, mode:'normal', lang:'zh', params:$PARAMS})); localStorage.removeItem('tp_debug_log'); location.href = '$URL'; await sleep(3500);" >/dev/null
sleep 2; snap start; state
for act in "$@"; do
  case "$act" in
    tap) sh scripts/phone-probe.sh tap | grep tapped ;;
    text:*) adb shell input text "${act#text:}" ;;
    enter) adb shell input keyevent 66 ;;
    tapxy:*) adb shell input tap $(echo "${act#tapxy:}" | tr ',' ' ') ;;
    tapel:*) XY=$(node --experimental-websocket scripts/phone-eval.mjs "townpass.local/" "(() => { const t = '${act#tapel:}'; const e = [...document.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim() === t && (x.offsetWidth || x.offsetHeight)); if (!e) return 'none'; e.scrollIntoView({block: 'center'}); const r = e.getBoundingClientRect(); return Math.round((r.left + r.width / 2) * devicePixelRatio) + ' ' + Math.round((r.top + r.height / 2) * devicePixelRatio + 226); })()" 2>&1 | tail -1 | tr -d '"'); echo "tapel $XY"; sleep 0.8; [ "$XY" != "none" ] && adb shell input tap $XY ;;
    js:*) sh scripts/phone-probe.sh "${act#js:}" >/dev/null ;;
    sleep:*) sleep "${act#sleep:}" ;;
  esac
  sleep 2.5; snap "$(echo "$act" | cut -c1-12 | tr ':,%' '___')"; state
done
echo "saved $i shots in $OUT"
