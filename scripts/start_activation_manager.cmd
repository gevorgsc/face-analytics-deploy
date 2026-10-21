@echo off
setlocal

set "ROOT=%~dp0.."
set "PYTHON=%ROOT%\backend\venv\Scripts\python.exe"

if not exist "%PYTHON%" (
  echo Backend virtual environment is missing.
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT%\license_server\.env") do (
  if not "%%A"=="" set "%%A=%%B"
)

"%PYTHON%" "%ROOT%\backend\tools\activation_manager_gui.py"
