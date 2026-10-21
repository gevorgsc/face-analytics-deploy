@echo off
setlocal

set "ROOT=%~dp0.."
set "PYTHON=%ROOT%\backend\venv\Scripts\python.exe"

if not exist "%PYTHON%" (
  echo Backend virtual environment is missing.
  exit /b 1
)

"%PYTHON%" "%ROOT%\backend\tools\license_manager_gui.py"
