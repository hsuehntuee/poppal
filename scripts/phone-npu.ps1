# 手機 NPU 推理（路線 B）：llama.cpp 官方 Snapdragon（Hexagon HTP）版 + 微調好的 Gemma 3 270M。
# 全部放在 /data/local/tmp/llama/，不 root、不安裝任何東西；-Remove 就清得一乾二淨。
#
#   .\scripts\phone-npu.ps1 -Push      # 推二進位、函式庫、模型到手機（第一次）
#   .\scripts\phone-npu.ps1 -Start     # 在手機上啟動 llama-server（NPU，port 8080）
#   .\scripts\phone-npu.ps1 -Status    # 看有沒有在跑、log 最後幾行
#   .\scripts\phone-npu.ps1 -Stop      # 停掉
#   .\scripts\phone-npu.ps1 -Forward   # adb forward 18080 → 手機 8080，筆電可用 pnpm eval --url http://127.0.0.1:18080
#   .\scripts\phone-npu.ps1 -Remove    # 刪掉 /data/local/tmp/llama 與 adb forward（App 另外用 -Uninstall）
#   .\scripts\phone-npu.ps1 -Uninstall # 解除安裝 TownPass（com.example.townpass）
param(
  [switch]$Push, [switch]$Start, [switch]$Stop, [switch]$Status, [switch]$Forward, [switch]$Remove, [switch]$Uninstall,
  [string]$Model = 'tools/llm/out/gemma-3-270m-decider-Q8_0.gguf',
  [string]$Device = 'HTP0'   # NPU；改成 none 就純 CPU
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:Path = "$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:Path"
$pkg = Join-Path $root 'tools\llama-android\snapdragon\llama-b12180'
$dev = '/data/local/tmp/llama'
$envStr = "export LD_LIBRARY_PATH=$dev/lib ADSP_LIBRARY_PATH=$dev/lib CDSP_LIBRARY_PATH=$dev/lib"

if ($Push) {
  adb shell "mkdir -p $dev/bin $dev/lib $dev/gguf"
  adb push (Join-Path $pkg 'bin\llama-server') (Join-Path $pkg 'bin\llama-bench') "$dev/bin/"
  Get-ChildItem (Join-Path $pkg 'lib') -Filter *.so | ForEach-Object { adb push $_.FullName "$dev/lib/" | Out-Null }
  adb push (Join-Path $root $Model) "$dev/gguf/"
  adb shell "chmod 755 $dev/bin/*; du -sh $dev"
}
if ($Start) {
  $m = Split-Path -Leaf $Model
  adb shell "cd $dev && $envStr && (setsid nohup ./bin/llama-server -m gguf/$m --device $Device -ngl 99 --host 127.0.0.1 --port 8080 -c 2048 -np 2 --cache-reuse 256 -t 6 > server.log 2>&1 < /dev/null &); sleep 1; echo started"
  Start-Sleep -Seconds 6
  adb shell "tail -n 3 $dev/server.log"
}
if ($Status) {
  adb shell "ps -A | grep llama-server || echo 'not running'"
  adb shell "tail -n 8 $dev/server.log 2>/dev/null"
}
if ($Forward) {
  adb forward tcp:18080 tcp:8080
  Write-Host '筆電 → http://127.0.0.1:18080 就是手機上的 llama-server'
}
if ($Stop) {
  adb shell "pkill -f llama-server || true"
  Write-Host 'stopped'
}
if ($Remove) {
  adb shell "pkill -f llama-server || true; rm -rf $dev; ls /data/local/tmp"
  adb forward --remove-all
  Write-Host "已刪除 $dev 與所有 adb forward"
}
if ($Uninstall) {
  adb uninstall com.example.townpass
}
