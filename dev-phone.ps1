# 用 USB 連 Android 手機跑 TownPass（flutter run，可 hot reload），
# 並讓手機的 localhost:<Port> 透過傳輸線連到電腦上的微服務 dev server。
#
# 用法（在 taipei_codefest 資料夾）：
#   .\dev-phone.ps1 -Worktree dev                 # 跑 worktrees\dev（建議）
#   .\dev-phone.ps1                               # 跑主 checkout TownPass\
#   .\dev-phone.ps1 -Worktree dev -Port 3000      # 微服務跑在別的 port
#   .\dev-phone.ps1 -Worktree dev -Url https://xxx.vercel.app/   # 外網網址（不需要 adb reverse）
#
# 先另開一個終端機啟動微服務，例如：
#   npx --yes vite bridge-tester --host --port 5173
param(
  [string]$Worktree = '',
  [int]$Port = 5173,
  [string]$Url = ''
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'tools\env.ps1')

$project = Resolve-TownPassDir $root $Worktree
$serial = Get-PhoneSerial
Write-Host "專案: $project" -ForegroundColor Green
Write-Host "手機: $serial" -ForegroundColor Green

if (-not $Url) {
  & $Adb -s $serial reverse "tcp:$Port" "tcp:$Port" | Out-Null
  Write-Host "adb reverse: 手機 localhost:$Port -> 電腦 localhost:$Port" -ForegroundColor Green
  $Url = "http://localhost:$Port/"
}

Set-Location $project
& $FlutterBat run -d $serial --dart-define=DEV_SERVICE_URL=$Url
