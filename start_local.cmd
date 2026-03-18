@echo off
setlocal
cd /d "%~dp0"
python scripts\dev.py --open --detach %*
endlocal
