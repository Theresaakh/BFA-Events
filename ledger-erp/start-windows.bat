@echo off
title Ledger ERP - keep this window open
cd /d "%~dp0"
where py >nul 2>nul && (set PY=py) || (set PY=python)
%PY% --version >nul 2>nul || (
  echo Python is not installed. Download it from https://www.python.org/downloads/
  echo During setup, tick "Add python.exe to PATH".
  pause
  exit /b 1
)
rem Clicking inside this window can freeze it (Windows "select" mode). Press Esc if that happens.
start "" http://localhost:8069
:run
%PY% server.py --demo
echo.
echo The server stopped. Restarting in 3 seconds... (close this window to quit)
timeout /t 3 >nul
goto run
