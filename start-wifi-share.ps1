$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Node = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $Node) {
  $BundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path $BundledNode) {
    $Node = $BundledNode
  }
}

if (-not $Node) {
  Write-Host '未找到 Node.js。请先安装 Node.js，或在已安装 Node.js 的电脑上运行。'
  exit 1
}

Set-Location $ProjectRoot
& $Node (Join-Path $ProjectRoot 'server.js')
