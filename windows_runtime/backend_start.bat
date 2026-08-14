@echo off
title Qwen3-ASR Backend API Server
set "ROOT_DIR=%~dp0..\"
set "WINDOWS_RUNTIME=%ROOT_DIR%windows_runtime"
set "MODELS=%ROOT_DIR%models"
set "PYTHON_EXE=F:\ProgramFiles\anaconda3\envs\qwen3-asr\python.exe"
set "PATH=%WINDOWS_RUNTIME%\bin;%PATH%"
set "ASR_PATH=%MODELS%\Qwen\Qwen3-ASR-0.6B"
set "ALIGN_PATH=%MODELS%\Qwen\Qwen3-ForcedAligner-0.6B"

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