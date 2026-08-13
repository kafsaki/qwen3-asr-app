@echo off
title Qwen3-ASR Pro 增强版 - 一键启动

echo ======================================================
echo       Qwen3-ASR Pro 前后端分离版
echo       启动后端 API (Port 8000) + 前端 Web (Port 3000)
echo ======================================================
echo.

echo [1/2] 启动后端 API 服务器...
start "Qwen3-ASR-Backend" cmd /c "%~dp0backend\start.bat"

echo 等待后端初始化 (10秒)...
timeout /t 10 /nobreak >nul

echo [2/2] 启动前端 Web 服务器...
start "Qwen3-ASR-Frontend" cmd /c "%~dp0frontend\start.bat"

echo.
echo ======================================================
echo 后端 API: http://127.0.0.1:8000
echo 前端界面: http://127.0.0.1:3000
echo ======================================================
echo.
echo 浏览器将自动打开前端界面...
timeout /t 3 /nobreak >nul
start http://127.0.0.1:3000

echo.
echo 按任意键关闭此窗口 (不会关闭后端和前端服务)...
pause >nul