@echo off
title Qwen3-ASR BFF Server
echo    ____                     _____       ___   _____ ____     ___
echo   / __ \_      _____  ____ ^|__  /      /   ^| / ___// __ \   /   ^|  ____  ____
echo  / / / / ^| /^| / / _ \/ __ \ /_ ^<______/ /^| ^| \__ \/ /_/ /  / /^| ^| / __ \/ __ \
echo / /_/ /^| ^|/ ^|/ /  __/ / / /__/ /_____/ ___ ^|___/ / _, _/  / ___ ^|/ /_/ / /_/ /
echo \___\_\^|__/^|__/\___/_/ /_/____/     /_/  ^|_/____/_/ ^|_^|  /_/  ^|_/ .___/ .___/
echo                                                                /_/   /_/
echo.
echo       Port: 3000
echo.
echo.
echo Installing dependencies...
cd /d "%~dp0..\server"
call npm install
echo.
echo Starting BFF server...
set BACKEND_URL=http://127.0.0.1:8000
set PORT=3000
call npm start
pause