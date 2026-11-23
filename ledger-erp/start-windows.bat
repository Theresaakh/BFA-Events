@echo off
cd /d "%~dp0"
where py >nul 2>nul && (set PY=py) || (set PY=python)
%PY% --version >nul 2>nul || (
  echo Python is not installed. Download it from https://www.python.org/downloads/
  echo During setup, tick "Add python.exe to PATH".
  pause
  exit /b 1
)
start "" http://localhost:8069
%PY% server.py --demo
pause
