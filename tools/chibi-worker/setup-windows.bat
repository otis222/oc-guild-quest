@echo off
rem oc-guild-quest chibi worker: change settings step by step, then start (needs Node.js 18+ from https://nodejs.org)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)
node worker.mjs --setup %*
pause
