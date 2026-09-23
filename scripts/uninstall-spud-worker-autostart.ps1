param(
  [string]$TaskName = "AI Orchestra Spud Code Worker"
)

$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  [pscustomobject]@{ ok = $true; removed = $true; taskName = $TaskName }
} else {
  [pscustomobject]@{ ok = $true; removed = $false; taskName = $TaskName }
}
