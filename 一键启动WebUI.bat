@echo off
title Qwen3-ASR Pro离线增强版 - By [生活作弊码]

set "ROOT_DIR=%~dp0"
set "PYTHON_PATH=%ROOT_DIR%WPy64-312101\python"
set "PATH=%PYTHON_PATH%;%PYTHON_PATH%\Scripts;%ROOT_DIR%bin;%PATH%"
set "ASR_PATH=%ROOT_DIR%models\Qwen\Qwen3-ASR-0.6B"
set "ALIGN_PATH=%ROOT_DIR%models\Qwen\Qwen3-ForcedAligner-0.6B"

set HF_HUB_OFFLINE=1

echo ======================================================
echo           Qwen3-ASR Pro离线增强版 正在启动
echo ======================================================

cd /d "%ROOT_DIR%app"

python main.py ^
  --asr-checkpoint "%ASR_PATH%" ^
  --aligner-checkpoint "%ALIGN_PATH%" ^
  --backend transformers ^
  --backend-kwargs "{\"max_inference_batch_size\": 1,\"max_new_tokens\": 1024}" ^
  --ip 127.0.0.1 --port 7867

pause