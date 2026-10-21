Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Python = Join-Path $Root "backend\venv\Scripts\python.exe"
$Entry = Join-Path $Root "backend\tools\activation_manager_gui.py"
$Dist = Join-Path $Root "activation-manager-dist"
$Work = Join-Path $Root "backend\build\activation-manager"

& $Python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --windowed `
  --name "GSC-Activation-Manager" `
  --distpath $Dist `
  --workpath $Work `
  --specpath $Work `
  $Entry
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Built: $(Join-Path $Dist 'GSC-Activation-Manager.exe')"
