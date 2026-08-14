@echo off
title Qwen3-ASR Backend API Server
set "ROOT_DIR=%~dp0..\"
set "RUNTIME=%ROOT_DIR%runtime"
set "PYTHON_EXE=%ROOT_DIR%venv\Scripts\python.exe"
set "PATH=%RUNTIME%\bin;%PATH%"
set "ASR_PATH=%RUNTIME%\models\Qwen\Qwen3-ASR-0.6B"
set "ALIGN_PATH=%RUNTIME%\models\Qwen\Qwen3-ForcedAligner-0.6B"

set HF_HUB_OFFLINE=1
set ASR_CHECKPOINT=%ASR_PATH%
set ALIGNER_CHECKPOINT=%ALIGN_PATH%

echo ======================================================
echo       Qwen3-ASR Backend API Server
echo       Python: %PYTHON_EXE%
echo       Port: 8000
echo ======================================================

cd /d "%ROOT_DIR%backend"
"%PYTHON_EXE%" server.py --ip 127.0.0.1 --port 8000

pause