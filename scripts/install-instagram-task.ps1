$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$taskState = Join-Path $projectRoot '.local-automation'
New-Item -ItemType Directory -Force -Path $taskState | Out-Null
@{ node = (Get-Command node.exe).Source; git = (Get-Command git.exe).Source } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskState 'task-config.json') -Encoding UTF8
$taskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$runner = Join-Path $PSScriptRoot 'run-instagram-task.ps1'
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $runner + '"') -WorkingDirectory $projectRoot
$daily = New-ScheduledTaskTrigger -Daily -At '06:17'
$evening = New-ScheduledTaskTrigger -Daily -At '21:00'
# Floating local times follow Windows daylight saving instead of a fixed UTC offset.
$daily.StartBoundary = $daily.StartBoundary.Substring(0, 19)
$evening.StartBoundary = $evening.StartBoundary.Substring(0, 19)
$logon = New-ScheduledTaskTrigger -AtLogOn -User $taskUser
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 30)
$principal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Fiesta Gozleme - Instagram refresh' -Action $action -Trigger @($daily, $evening, $logon) -Settings $settings -Principal $principal -Description 'Refresh public Fiesta Instagram posts at 06:17 and 21:00 local time, with sign-in catch-up; commit only validated feed assets and push to GitHub Pages. Uses a separate checkout and existing Git credentials.' -Force | Select-Object TaskName,State
