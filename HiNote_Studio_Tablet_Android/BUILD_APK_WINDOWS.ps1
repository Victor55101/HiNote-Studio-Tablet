$ErrorActionPreference = "Stop"
Write-Host "HiNote Studio Tablet - compilación APK" -ForegroundColor Cyan
if (-not (Get-Command gradle -ErrorAction SilentlyContinue)) {
    Write-Host "No encontré Gradle en PATH." -ForegroundColor Yellow
    Write-Host "La forma más sencilla es abrir esta carpeta en Android Studio y usar Build > Build APK(s)."
    exit 1
}
Set-Location $PSScriptRoot
python ..\.github\scripts\prepare_assets.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
gradle assembleDebug
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "APK creado en app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Green
