@echo off
setlocal enabledelayedexpansion
title Qwen3-ASR BFF Server

set DEFAULT_PORT=3040
if not defined PORT set PORT=%DEFAULT_PORT%

:port_loop
echo    ____                     _____       ___   _____ ____     ___
echo   / __ \_      _____  ____ ^|__  /      /   ^| / ___// __ \   /   ^|  ____  ____
echo  / / / / ^| /^| / / _ \/ __ \ /_ ^<______/ /^| ^| \__ \/ /_/ /  / /^| ^| / __ \/ __ \
echo / /_/ /^| ^|/ ^|/ /  __/ / / /__/ /_____/ ___ ^|___/ / _, _/  / ___ ^|/ /_/ / /_/ /
echo \___\_\^|__/^|__/\___/_/ /_/____/     /_/  ^|_/____/_/ ^|_^|  /_/  ^|_/ .___/ .___/
echo                                                                /_/   /_/
echo.
echo       Port: !PORT!
echo.

:: Check port availability
netstat -ano | findstr /R /C:":!PORT! " >nul 2>&1
if !errorlevel! equ 0 (
    echo [ERROR] Port !PORT! is already in use.
    echo.
    set "NEW_PORT="
    set /p NEW_PORT="Enter a custom port (or press Enter to exit): "
    if "!NEW_PORT!"=="" (
        echo Exiting.
        pause
        exit /b 1
    )
    set "INVALID="
    for /f "delims=0123456789" %%a in ("!NEW_PORT!") do set "INVALID=1"
    if defined INVALID (
        echo [ERROR] Invalid port number. Please enter a number between 1024-65535.
        echo.
        set PORT=!NEW_PORT!
        goto :port_loop
    )
    if !NEW_PORT! lss 1024 (
        echo [ERROR] Port must be 1024 or higher.
        echo.
        set PORT=!NEW_PORT!
        goto :port_loop
    )
    if !NEW_PORT! gtr 65535 (
        echo [ERROR] Port must be 65535 or lower.
        echo.
        set PORT=!NEW_PORT!
        goto :port_loop
    )
    set PORT=!NEW_PORT!
    goto :port_loop
)

echo.
echo Installing dependencies...
cd /d "%~dp0..\server"
call npm install
echo.
echo Starting BFF server...
set PORT=!PORT!
call npm start
pause