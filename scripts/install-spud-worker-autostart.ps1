param(
  [string]$TaskName = "AI Orchestra Spud Code Worker",
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$NodePath = $env:SPUD_NODE_PATH
)

$ErrorActionPreference = "Stop"

function Find-Node {
  param([string]$Preferred)
  if ($Preferred -and (Test-Path -LiteralPath $Preferred)) {
    return (Resolve-Path -LiteralPath $Preferred).Path
  }

  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command -and $command.Source -and (Test-Path -LiteralPath $command.Source)) {
    return $command.Source
  }

  $candidate = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path -LiteralPath $candidate) {
    return (Resolve-Path -LiteralPath $candidate).Path
  }

  throw "Node.js was not found. Install Node.js or pass -NodePath."
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$NodePath = Find-Node -Preferred $NodePath
$StartScript = Join-Path $RepoRoot "scripts\start-spud-code-worker.ps1"
if (-not (Test-Path -LiteralPath $StartScript)) {
  throw "Start script not found: $StartScript"
}

$ActionArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-WindowStyle", "Hidden",
  "-File", "`"$StartScript`"",
  "-RepoRoot", "`"$RepoRoot`"",
  "-NodePath", "`"$NodePath`""
) -join " "

$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument $ActionArgs `
  -WorkingDirectory $RepoRoot
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 30) `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable
$Principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Principal $Principal `
  -Description "Runs AI Orchestra Spud code worker at Windows logon." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

[pscustomobject]@{
  ok = $true
  taskName = $TaskName
  repoRoot = $RepoRoot
  nodePath = $NodePath
  started = $true
}
