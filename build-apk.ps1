# 編譯 TownPass APK，可選擇直接裝到 USB 連著的手機。
# 和 dev-phone.ps1 不同：裝好之後不需要電腦掛著，適合 demo / 給別人裝。
#
# 用法（在 taipei_codefest 資料夾）：
#   .\build-apk.ps1 -Worktree dev -Install                       # debug 版，裝到手機
#   .\build-apk.ps1 -Worktree dev -Release -Url https://xxx/ -Install   # release 版（網址必須 https）
#   .\build-apk.ps1 -Worktree dev -Release -Url https://xxx/            # 只產生 APK 檔
param(
  [string]$Worktree = '',
  [switch]$Release,
  [string]$Url = 'http://localhost:5173/',
  [switch]$Install
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'tools\env.ps1')

if ($Release -and $Url -notlike 'https://*') {
  throw "release 版不允許 http，請用 -Url https://... （目前：$Url）"
}
$mode = if ($Release) { 'release' } else { 'debug' }
$project = Resolve-TownPassDir $root $Worktree
Set-Location $project
Write-Host "專案: $project  模式: $mode  微服務網址: $Url" -ForegroundColor Green

& $FlutterBat build apk "--$mode" --dart-define=DEV_SERVICE_URL=$Url
if ($LASTEXITCODE -ne 0) { throw 'flutter build apk 失敗' }

$apk = Join-Path $project "build\app\outputs\flutter-apk\app-$mode.apk"
Write-Host "APK: $apk" -ForegroundColor Green

if ($Install) {
  $serial = Get-PhoneSerial
  & $Adb -s $serial install -r $apk
  if ($LASTEXITCODE -ne 0) { throw 'adb install 失敗（若提示簽章不同，先在手機上解除安裝 TownPass 再試）' }
  if ($Url -like 'http://localhost:*') {
    $p = ([uri]$Url).Port
    & $Adb -s $serial reverse "tcp:$p" "tcp:$p" | Out-Null
    Write-Host "adb reverse tcp:$p 已設定" -ForegroundColor Green
  }
  & $Adb -s $serial shell monkey -p com.example.townpass -c android.intent.category.LAUNCHER 1 | Out-Null
  Write-Host '已安裝並啟動 TownPass' -ForegroundColor Green
}
