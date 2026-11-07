# 把程式碼打包送到 CPU server 的 ~/tmp/tmp/townpass-assistant，然後 docker compose up --build。
# 只會傳需要的資料夾（不含 node_modules / dist / .git / tools/models）。
#
#   .\deploy\deploy.ps1                    # 部署
#   .\deploy\deploy.ps1 -Down              # 停掉
#   .\deploy\deploy.ps1 -Logs              # 看 log
param(
  [string]$Target = 'carta@140.112.175.18',
  [string]$RemoteDir = 'tmp/tmp/townpass-assistant',
  [switch]$Down,
  [switch]$Logs
)
$ErrorActionPreference = 'Stop'
$ssh = 'C:\Windows\System32\OpenSSH\ssh.exe'
$scp = 'C:\Windows\System32\OpenSSH\scp.exe'
$root = Split-Path -Parent $PSScriptRoot

if ($Down) { & $ssh $Target "cd ~/$RemoteDir && docker compose -f deploy/docker-compose.yml down"; exit $LASTEXITCODE }
if ($Logs) { & $ssh $Target "cd ~/$RemoteDir && docker compose -f deploy/docker-compose.yml logs --tail 100"; exit $LASTEXITCODE }

$tar = Join-Path $env:TEMP 'townpass-assistant.tgz'
Push-Location $root
try {
  # Windows 內建 bsdtar
  & tar -czf $tar `
    --exclude=node_modules --exclude=dist --exclude=.git --exclude=.vite `
    TownPass-Services assistant deploy scripts eval
} finally { Pop-Location }
Write-Host "打包完成: $tar ($([math]::Round((Get-Item $tar).Length/1MB,1)) MB)"

& $ssh $Target "mkdir -p ~/$RemoteDir"
& $scp $tar "${Target}:~/$RemoteDir/src.tgz"
& $ssh $Target "cd ~/$RemoteDir && tar -xzf src.tgz && rm src.tgz && docker compose -f deploy/docker-compose.yml up -d --build && docker compose -f deploy/docker-compose.yml ps"
Write-Host "完成。小幫手: http://$($Target.Split('@')[1]):18080/assistant/" -ForegroundColor Green
