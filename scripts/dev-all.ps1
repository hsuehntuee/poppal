# 一鍵啟動筆電端：建置服務頁與小幫手 → 啟動 llama-server（選配）→ 啟動單一 port 伺服器。
#   .\scripts\dev-all.ps1                       # 預設 port 5180，模型 tools/llm/out/gemma-3-270m-decider-Q8_0.gguf（有才啟動）
#   .\scripts\dev-all.ps1 -Port 5180 -Model tools/models/xxx.gguf
#   .\scripts\dev-all.ps1 -SkipBuild            # 已經 build 過
param(
  [int]$Port = 5180,
  [string]$Model = 'tools/llm/out/gemma-3-270m-decider-Q8_0.gguf',
  [switch]$SkipBuild,
  [switch]$NoLlm
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $SkipBuild) {
  Write-Host '== build TownPass-Services' -ForegroundColor Cyan
  Push-Location TownPass-Services; pnpm build-only; Pop-Location
  Write-Host '== build assistant (+ guide-overlay → TownPass/assets/js)' -ForegroundColor Cyan
  Push-Location assistant; pnpm build; Pop-Location
}

$llmUrl = 'http://127.0.0.1:8080'
if (-not $NoLlm -and (Test-Path $Model)) {
  Write-Host "== llama-server $Model" -ForegroundColor Cyan
  Start-Process -FilePath (Join-Path $root 'tools\llama\llama-server.exe') `
    -ArgumentList @('-m', $Model, '--host', '127.0.0.1', '--port', '8080', '-c', '4096', '-np', '2', '-ngl', '99', '--cache-reuse', '256') `
    -WindowStyle Minimized
} else {
  Write-Host "== llama-server 略過（$Model 不存在或 -NoLlm）；小幫手會自動退到 cls / tiny / embed" -ForegroundColor Yellow
}

Write-Host "== serve-local :$Port" -ForegroundColor Cyan
node scripts/serve-local.mjs --port $Port --llm $llmUrl
