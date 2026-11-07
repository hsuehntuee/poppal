#!/bin/sh
# 不重編 APK 直接換網頁：把打包好的 assets/web 與 guide-overlay.js 推到手機的覆蓋資料夾，App 重啟後優先讀這裡。
#   sh scripts/phone-push-web.sh          # 推（先 node scripts/bundle-web.mjs）
#   sh scripts/phone-push-web.sh --clear  # 清掉覆蓋資料夾，回到 APK 內建版本（正式 demo 前務必清）
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.." || exit 1  # adb 在 Windows 看不懂 MSYS 的 /c/... 路徑，用相對路徑
DEV=/sdcard/Android/data/com.example.townpass/files/override/assets
if [ "$1" = "--clear" ]; then
  adb shell rm -rf /sdcard/Android/data/com.example.townpass/files/override
  echo "override cleared"
else
  adb shell mkdir -p "$DEV/js"
  adb push TownPass/assets/web "$DEV/" | tail -1
  adb push TownPass/assets/js/guide-overlay.js "$DEV/js/guide-overlay.js" | tail -1
  # adb 推進去的檔案是 shell 擁有的，App 讀不到 → 開放權限
  adb shell chmod -R 777 /sdcard/Android/data/com.example.townpass/files/override
  echo "pushed web + overlay to $DEV"
fi
adb shell am force-stop com.example.townpass
adb shell am start -n com.example.townpass/.MainActivity >/dev/null
echo "app restarted"
