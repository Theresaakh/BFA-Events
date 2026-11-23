@echo off
title AcademyOS - keep this window open
cd /d "%~dp0"
where node >nul 2>nul || (
  echo.
  echo Node.js is not installed. It is needed to run AcademyOS.
  echo The download page will open now. Install the "LTS" version, then double-click this file again.
  echo.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing the app for the first time. This takes 1-3 minutes...
  call npm install || ( echo Installation failed. Send a screenshot of this window. & pause & exit /b 1 )
)
echo.
echo Starting AcademyOS... your browser will open in a few seconds.
echo Keep this window open while you use the app.
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000/en/dashboard"
call npm run dev
pause
