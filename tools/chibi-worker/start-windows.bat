@echo off
rem oc-guild-quest chibi worker: double-click to start (needs Node.js 18+ from https://nodejs.org)
rem Setup guide: docs folder of the repo (chibi setup)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)
node worker.mjs %*
pause
