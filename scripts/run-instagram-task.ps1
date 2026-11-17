param([switch]$ForceRun)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$taskState = Join-Path $projectRoot '.local-automation'
$logDir = Join-Path $taskState 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ((Get-Date -Format 'yyyy-MM-dd') + '.log')
$config = Get-Content -Raw -LiteralPath (Join-Path $taskState 'task-config.json') | ConvertFrom-Json
$env:FIESTA_GIT = $config.git
$arguments = @((Join-Path $PSScriptRoot 'local-instagram-task.mjs'))
if ($ForceRun) { $arguments += '--force' }
Add-Content -LiteralPath $logFile -Value ("`n--- " + (Get-Date -Format o) + ' ---')
# PowerShell 5 treats native stderr as an error record, even for harmless Node warnings.
$ErrorActionPreference = 'Continue'
& $config.node @arguments >> $logFile 2>&1
$result = $LASTEXITCODE
Add-Content -LiteralPath $logFile -Value ("Exit code: " + $result)
exit $result
