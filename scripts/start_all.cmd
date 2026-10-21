@echo off
setlocal

set "ROOT=%~dp0.."

echo Starting Face Analytics Pro...
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo LAN URL:  use the Network URL printed by Vite in the frontend window.
echo.

start "Face Analytics Backend" cmd /k ""%ROOT%\scripts\start_backend.cmd""
timeout /t 3 /nobreak >nul
start "Face Analytics Frontend" cmd /k ""%ROOT%\scripts\start_frontend.cmd""

echo Open http://localhost:5173 after both windows finish startup.
