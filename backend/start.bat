@echo off
title Qwen3-ASR Backend API Server
set "ROOT_DIR=%~dp0..\"
set "PYTHON_PATH=%ROOT_DIR%WPy64-312101\python"
set "PATH=%PYTHON_PATH%;%PYTHON_PATH%\Scripts;%ROOT_DIR%bin;%PATH%"
set "ASR_PATH=%ROOT_DIR%models\Qwen\Qwen3-ASR-0.6B"
set "ALIGN_PATH=%ROOT_DIR%models\Qwen\Qwen3-ForcedAligner-0.6B"

set HF_HUB_OFFLINE=1
set ASR_CHECKPOINT=%ASR_PATH%
set ALIGNER_CHECKPOINT=%ALIGN_PATH%

echo ======================================================
echo       Qwen3-ASR Backend API Server
echo       Port: 8000
echo ======================================================

cd /d "%ROOT_DIR%backend"
python server.py --ip 127.0.0.1 --port 8000

pause