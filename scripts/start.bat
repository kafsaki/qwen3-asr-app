@echo off
setlocal enabledelayedexpansion
title Qwen3-ASR Server

set "ROOT_DIR=%~dp0..\"
set "WINDOWS_RUNTIME=%ROOT_DIR%app\runtime"
set "MODELS=%ROOT_DIR%app\models"
set "PATH=%WINDOWS_RUNTIME%\bin;%PATH%"

:: --- Python Environment Selection ---
echo ======================================================
echo       Python Environment Selection
echo ======================================================
echo.
echo [1] Portable Python (WPy64-312101)
echo [2] Conda environment
echo.
set /p CHOICE="Select [1 or 2]: "

if "!CHOICE!"=="1" (
    set "PYTHON_EXE=%WINDOWS_RUNTIME%\WPy64-312101\python\python.exe"
    if not exist "!PYTHON_EXE!" (
        echo.
        echo [ERROR] Portable Python not found at:
        echo         !PYTHON_EXE!
        echo.
        pause
        exit /b 1
    )
    echo [INFO] Using portable Python: !PYTHON_EXE!
    goto :port_select
)

if "!CHOICE!"=="2" (
    set "CONFIG_FILE=%WINDOWS_RUNTIME%\python_path.txt"
    if exist "%CONFIG_FILE%" (
        set /p SAVED_PATH=<"%CONFIG_FILE%"
        if exist "!SAVED_PATH!" (
            set "PYTHON_EXE=!SAVED_PATH!"
            echo [INFO] Using saved Python: !PYTHON_EXE!
            goto :port_select
        )
    )
    echo.
    echo Please enter the path to your conda environment's python.exe
    echo.
    echo Example: F:\ProgramFiles\anaconda3\envs\qwen3-asr\python.exe
    echo          D:\miniconda3\envs\qwen3-asr\python.exe
    echo.
    set /p USER_PATH="Python path: "
    if exist "!USER_PATH!" (
        set "PYTHON_EXE=!USER_PATH!"
        echo !USER_PATH!>"%CONFIG_FILE%"
        echo [OK] Path saved to python_path.txt
    ) else (
        echo.
        echo [ERROR] Invalid path! File not found: !USER_PATH!
        echo.
        pause
        exit /b 1
    )
    goto :port_select
)

echo.
echo [ERROR] Invalid choice: !CHOICE!
echo.
pause
exit /b 1

:: --- Port Selection ---
:port_select
set DEFAULT_PORT=8000
if not defined PORT set PORT=%DEFAULT_PORT%

:port_loop
set "ASR_PATH=%MODELS%\Qwen\Qwen3-ASR-0.6B"
set "ALIGN_PATH=%MODELS%\Qwen\Qwen3-ForcedAligner-0.6B"

set HF_HUB_OFFLINE=1
set ASR_CHECKPOINT=%ASR_PATH%
set ALIGNER_CHECKPOINT=%ALIGN_PATH%

echo    ____                     _____       ___   _____ ____     ___
echo   / __ \_      _____  ____ ^|__  /      /   ^| / ___// __ \   /   ^|  ____  ____
echo  / / / / ^| /^| / / _ \/ __ \ /_ ^<______/ /^| ^| \__ \/ /_/ /  / /^| ^| / __ \/ __ \
echo / /_/ /^| ^|/ ^|/ /  __/ / / /__/ /_____/ ___ ^|___/ / _, _/  / ___ ^|/ /_/ / /_/ /
echo \___\_\^|__/^|__/\___/_/ /_/____/     /_/  ^|_/____/_/ ^|_^|  /_/  ^|_/ .___/ .___/
echo                                                                /_/   /_/
echo.
echo       Python: !PYTHON_EXE!
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
echo Starting server, loading models...
echo This may take a few minutes on first launch.
echo.

cd /d "%ROOT_DIR%app"
"!PYTHON_EXE!" main.py --ip 127.0.0.1 --port !PORT!

pause