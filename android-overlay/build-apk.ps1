$ErrorActionPreference = "Stop"

$androidStudioJbr = "C:\Program Files\Android\Android Studio\jbr"
if (-not $env:JAVA_HOME -and (Test-Path $androidStudioJbr)) {
    $env:JAVA_HOME = $androidStudioJbr
}

if (-not $env:JAVA_HOME) {
    throw "JAVA_HOME is not set. Install Android Studio or set JAVA_HOME to a JDK path."
}

$env:Path = "$env:JAVA_HOME\bin;$env:Path"

Push-Location $PSScriptRoot
try {
    .\gradlew.bat assembleDebug
    Write-Host ""
    Write-Host "APK ready:"
    Write-Host (Join-Path $PSScriptRoot "app\build\outputs\apk\debug\app-debug.apk")
} finally {
    Pop-Location
}
