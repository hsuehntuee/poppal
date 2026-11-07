# 建立一個獨立的 TownPass git worktree，並把依賴裝好。
# 每個 session / 每個功能各用一個 worktree，彼此的 build 和 pub get 就不會打架。
#
# 用法（在 taipei_codefest 資料夾）：
#   .\new-worktree.ps1 -Name voice                    # 從 main 開新分支 wt/voice
#   .\new-worktree.ps1 -Name demo -Base dev/local-env # 從指定分支開
#   .\new-worktree.ps1 -Name dev -Branch dev/local-env -Existing  # 掛上已存在的分支
#
# 產出：worktrees\<Name>\  （已完成 pub get + build_runner，可以直接 build / run）
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Base = 'main',
  [string]$Branch = '',
  [switch]$Existing
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'tools\env.ps1')

$main = Join-Path $root 'TownPass'
$wt = Join-Path $root "worktrees\$Name"
if (-not $Branch) { $Branch = "wt/$Name" }

if (Test-Path $wt) {
  Write-Host "已存在：$wt（只重新安裝依賴）" -ForegroundColor Yellow
} else {
  if ($Existing) {
    git -C $main worktree add $wt $Branch
  } else {
    git -C $main worktree add -b $Branch $wt $Base
  }
  if ($LASTEXITCODE -ne 0) { throw 'git worktree add 失敗' }
}

Set-Location $wt
Write-Host '== flutter pub get ==' -ForegroundColor Cyan
& $FlutterBat pub get
if ($LASTEXITCODE -ne 0) { throw 'pub get 失敗' }

Write-Host '== build_runner（產生 *.g.dart / assets.gen.dart）==' -ForegroundColor Cyan
& $DartBat run build_runner build --delete-conflicting-outputs
if ($LASTEXITCODE -ne 0) { throw 'build_runner 失敗' }

Write-Host ''
$actual = git -C $wt branch --show-current
Write-Host "完成：$wt  （分支 $actual）" -ForegroundColor Green
Write-Host "接手機執行：.\dev-phone.ps1 -Worktree $Name" -ForegroundColor Green
