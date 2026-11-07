# 共用環境設定：被 new-worktree.ps1 / dev-phone.ps1 / build-apk.ps1 dot-source 進來。
# 直接使用 FVM 快取裡的 Flutter 3.47.6（與 TownPass/.fvmrc 一致），
# 不依賴全域 flutter（C:\flutter\flutter 是舊的 3.24.1），也不需要每個 worktree 各自 `fvm use`。
$FlutterVersion = '3.47.6'
$FlutterHome = Join-Path $env:USERPROFILE "fvm\versions\$FlutterVersion"
$FlutterBat = Join-Path $FlutterHome 'bin\flutter.bat'
$DartBat = Join-Path $FlutterHome 'bin\dart.bat'
if (-not (Test-Path $FlutterBat)) {
  throw "找不到 Flutter $FlutterVersion：$FlutterBat。請先執行：fvm install $FlutterVersion"
}

$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot'
$AndroidSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$Adb = Join-Path $AndroidSdk 'platform-tools\adb.exe'
$env:ANDROID_HOME = $AndroidSdk
$env:Path = "$env:JAVA_HOME\bin;$AndroidSdk\platform-tools;$FlutterHome\bin;$env:Path"

# 解析要用哪個 TownPass 資料夾：-Worktree <名稱> → worktrees\<名稱>，否則用主 checkout TownPass\
function Resolve-TownPassDir([string]$Root, [string]$Worktree) {
  if ($Worktree) {
    $d = Join-Path $Root "worktrees\$Worktree"
    if (-not (Test-Path $d)) { throw "找不到 worktree：$d（用 .\new-worktree.ps1 -Name $Worktree 建立）" }
    return $d
  }
  return (Join-Path $Root 'TownPass')
}

# 取得第一支已授權的 Android 手機序號
function Get-PhoneSerial {
  $lines = (& $Adb devices) -match "`tdevice$"
  if (-not $lines) {
    Write-Host '找不到 Android 手機。請確認：USB 偵錯已開、手機上按了「允許 USB 偵錯」、傳輸線支援資料傳輸。' -ForegroundColor Red
    & $Adb devices -l
    exit 1
  }
  return (@($lines)[0] -split "`t")[0]
}
