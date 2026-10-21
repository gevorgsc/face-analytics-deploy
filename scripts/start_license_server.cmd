@echo off
setlocal

set "ROOT=%~dp0.."
set "PYTHON=%ROOT%\backend\venv\Scripts\python.exe"

if not exist "%PYTHON%" (
  echo Backend virtual environment is missing.
  exit /b 1
)

cd /d "%ROOT%\license_server" || exit /b 1
"%PYTHON%" -m uvicorn app:app --env-file .env --host 0.0.0.0 --port 8090
