@echo off
setlocal

set "ROOT=%~dp0.."
set "FRONTEND=%ROOT%\frontend"

cd /d "%FRONTEND%" || exit /b 1

if not exist "node_modules" (
  echo Frontend dependencies are missing. Running npm install...
  npm.cmd install || exit /b 1
)

echo Starting frontend on http://0.0.0.0:5173
npm.cmd run dev -- --host 0.0.0.0 --port 5173
