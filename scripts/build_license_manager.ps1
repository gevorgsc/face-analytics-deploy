Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Python = Join-Path $Root "backend\venv\Scripts\python.exe"
$Entry = Join-Path $Root "backend\tools\license_manager_gui.py"
$Dist = Join-Path $Root "license-manager-dist"
$Work = Join-Path $Root "backend\build\license-manager"

if (-not (Test-Path $Python)) {
  throw "Backend virtual environment is missing: $Python"
}

& $Python -m pip install "pyinstaller>=6.0,<7.0"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $Python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --windowed `
  --name "GSC-License-Manager" `
  --distpath $Dist `
  --workpath $Work `
  --specpath $Work `
  $Entry
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Built: $(Join-Path $Dist 'GSC-License-Manager.exe')"
