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

function Find-OptionalExe {
  param(
    [string]$CommandName,
    [string[]]$Candidates = @()
  )

  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($command -and $command.Source -and (Test-Path -LiteralPath $command.Source)) {
    return $command.Source
  }

  foreach ($candidate in $Candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$NodePath = Find-Node -Preferred $NodePath
if (-not $WorkerId) {
  $WorkerId = "spud-autostart-$env:COMPUTERNAME"
}

$CodexBinRoot = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin"
$CodexRg = $null
if (Test-Path -LiteralPath $CodexBinRoot) {
  $CodexRg = Get-ChildItem -Path $CodexBinRoot -Filter "rg.exe" -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}
$RgPath = Find-OptionalExe -CommandName "rg" -Candidates @($CodexRg)
$GitPath = Find-OptionalExe -CommandName "git" -Candidates @(
  (Join-Path $env:ProgramFiles "Git\cmd\git.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Git\cmd\git.exe")
)

$LogDir = Join-Path $RepoRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir "spud-code-worker.log"
$ErrFile = Join-Path $LogDir "spud-code-worker.err.log"

Set-Location -LiteralPath $RepoRoot
$env:SPUD_NODE_PATH = $NodePath
if ($RgPath) { $env:SPUD_RG_PATH = $RgPath }
if ($GitPath) { $env:SPUD_GIT_PATH = $GitPath }
$PathParts = @(
  (Split-Path -Parent $NodePath),
  $(if ($RgPath) { Split-Path -Parent $RgPath }),
  $(if ($GitPath) { Split-Path -Parent $GitPath }),
  $env:Path
) | Where-Object { $_ }
$env:Path = ($PathParts -join [IO.Path]::PathSeparator)
"[$(Get-Date -Format o)] starting Spud code worker with $NodePath" | Add-Content -LiteralPath $LogFile

& $NodePath "scripts\spud-code-worker.mjs" `
  "--interval-ms" "$IntervalMs" `
  "--worker-id" "$WorkerId" `
  1>> $LogFile `
  2>> $ErrFile

$exitCode = $LASTEXITCODE
"[$(Get-Date -Format o)] Spud code worker exited with code $exitCode" | Add-Content -LiteralPath $LogFile
exit $exitCode
