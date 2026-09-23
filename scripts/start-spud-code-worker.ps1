param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$NodePath = $env:SPUD_NODE_PATH,
  [int]$IntervalMs = 15000,
  [string]$WorkerId = $env:SPUD_WORKER_ID
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

  $candidates = @(
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"),
    (Join-Path $env:ProgramFiles "nodejs\node.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  throw "Node.js was not found. Set SPUD_NODE_PATH to node.exe."
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$NodePath = Find-Node -Preferred $NodePath
if (-not $WorkerId) {
  $WorkerId = "spud-autostart-$env:COMPUTERNAME"
}

$LogDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir "spud-code-worker.log"
$ErrFile = Join-Path $LogDir "spud-code-worker.err.log"

Set-Location -LiteralPath $RepoRoot
"[$(Get-Date -Format o)] starting Spud code worker with $NodePath" | Add-Content -LiteralPath $LogFile

& $NodePath "scripts\spud-code-worker.mjs" `
  "--interval-ms" "$IntervalMs" `
  "--worker-id" "$WorkerId" `
  1>> $LogFile `
  2>> $ErrFile

$exitCode = $LASTEXITCODE
"[$(Get-Date -Format o)] Spud code worker exited with code $exitCode" | Add-Content -LiteralPath $LogFile
exit $exitCode
