@echo off
title Qwen3-ASR Frontend Server
echo ======================================================
echo       Qwen3-ASR Frontend Web Server
echo       Port: 3000
echo ======================================================
echo.
echo Installing dependencies...
cd /d "%~dp0..\frontend"
call npm install
echo.
echo Starting frontend server...
set BACKEND_URL=http://127.0.0.1:8000
set PORT=3000
call npm start
pause