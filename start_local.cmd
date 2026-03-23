@echo off
setlocal
cd /d "%~dp0"
if /I "%~1"=="--no-open" (
  powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0start_local.ps1" -NoOpen
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0start_local.ps1"
)
endlocal
