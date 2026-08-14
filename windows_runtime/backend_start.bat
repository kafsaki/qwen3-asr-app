@echo off
setlocal enabledelayedexpansion
title Qwen3-ASR Backend API Server

set "ROOT_DIR=%~dp0..\"
set "WINDOWS_RUNTIME=%ROOT_DIR%windows_runtime"
set "MODELS=%ROOT_DIR%models"
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
    goto :start
)

if "!CHOICE!"=="2" (
    set "CONFIG_FILE=%WINDOWS_RUNTIME%\python_path.txt"
    if exist "%CONFIG_FILE%" (
        set /p SAVED_PATH=<"%CONFIG_FILE%"
        if exist "!SAVED_PATH!" (
            set "PYTHON_EXE=!SAVED_PATH!"
            echo [INFO] Using saved Python: !PYTHON_EXE!
            goto :start
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
    goto :start
)

echo.
echo [ERROR] Invalid choice: !CHOICE!
echo.
pause
exit /b 1

:start
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
echo       Port: 8000
echo.
echo.
echo Starting server, loading models...
echo This may take a few minutes on first launch.
echo.

cd /d "%ROOT_DIR%backend"
"!PYTHON_EXE!" server.py --ip 127.0.0.1 --port 8000

pause