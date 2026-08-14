@echo off
chcp 65001 >nul
title Qwen3-ASR Launcher

set "ROOT=%~dp0..\"

echo ======================================================
echo       Qwen3-ASR Pro
echo       Backend API (Port 8000) + Frontend Web (Port 3000)
echo ======================================================
echo.

echo [1/2] Starting Backend API...
start "" cmd /c ""%ROOT%windows_runtime\backend_start.bat""

echo Waiting for backend init (10s)...
timeout /t 10 /nobreak >nul

echo [2/2] Starting Frontend Web...
start "" cmd /c ""%ROOT%windows_runtime\frontend_start.bat""

echo.
echo ======================================================
echo Backend API : http://127.0.0.1:8000
echo Frontend UI : http://127.0.0.1:3000
echo ======================================================
echo.
echo Opening browser...
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:3000

echo.
echo Press any key to close this window...
pause >nul