@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dat-lai-mat-khau-admin.ps1"
echo.
pause
