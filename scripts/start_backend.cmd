@echo off
setlocal

set "ROOT=%~dp0.."
set "BACKEND=%ROOT%\backend"

cd /d "%BACKEND%" || exit /b 1

if not exist "venv\Scripts\python.exe" (
  echo Backend venv is missing. Creating Python 3.11 venv...
  py -3.11 -m venv venv || exit /b 1
)

echo Installing/updating backend dependencies...
"venv\Scripts\python.exe" -m pip install -r requirements.txt || exit /b 1

echo Preparing database...
"venv\Scripts\python.exe" bootstrap_database.py || exit /b 1

echo Starting backend on http://0.0.0.0:8000
"venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
