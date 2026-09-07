@echo off
rem ============================================================
rem  QQ Robot Panel - Launcher (double-click to start)
rem  1. Checks Node.js and port 4357
rem  2. Opens browser automatically
rem  3. Stays open showing server logs
rem ============================================================
title QQ Robot Panel
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install it from https://nodejs.org
  pause
  exit /b 1
)

rem Already running? -> just open the browser and leave
netstat -ano | findstr /r ":4357[^0-9].*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo Panel is already running at http://127.0.0.1:4357
  start "" http://127.0.0.1:4357
  exit /b 0
)

echo Starting QQ Robot Panel ...
echo Panel address: http://127.0.0.1:4357
echo Close this window or press Ctrl+C to stop the server.
echo.

rem Open browser shortly after the server is up
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:4357"

node server.js

echo.
echo Server exited.
pause
