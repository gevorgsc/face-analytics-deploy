Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Python = "python"
if (Test-Path "backend\venv\Scripts\python.exe") {
  $Python = "backend\venv\Scripts\python.exe"
}
$env:PYTHONPATH = (Resolve-Path "backend").Path

Write-Host "Backend syntax..."
Get-ChildItem backend\app,backend\alembic,backend\tests -Recurse -Filter *.py |
  ForEach-Object {
    & $Python -m py_compile $_.FullName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }

Write-Host "Backend tests..."
& $Python -m pytest backend\tests
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $Python -c "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('ruff') else 1)"
if ($LASTEXITCODE -eq 0) {
  Write-Host "Backend critical lint..."
  & $Python -m ruff check backend\app backend\tests --select=E9,F63,F7,F82
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Frontend build..."
Push-Location frontend
try {
  npm.cmd run test:unit
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npm.cmd test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Pop-Location
}

Write-Host "All checks passed."
