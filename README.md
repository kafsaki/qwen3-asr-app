# Qwen3-ASR Pro 离线增强版

基于阿里 Qwen3-ASR 系列大模型的离线语音处理工具，集**语音转文本、角色分离、精准时间轴对齐、热词注入**于一体。

## 架构

```
前端 (Express.js :3000)  ──→  后端 API (FastAPI :8000)  ──→  ASR 引擎
   HTML/CSS/JS 界面              REST 接口                      Qwen3-ASR + Pyannote
```

| 组件 | 端口 | 技术栈 |
|------|------|--------|
| 前端 UI | 3000 | Express.js + 原生 JS |
| 后端 API | 8000 | FastAPI + Pyannote + Qwen3-ASR |
| 备选 WebUI | 7867 | 原始 Gradio 版本 (`app/`) |

## 硬件需求

- **NVIDIA 显卡**，建议显存 6GB+
- 0.6B 极速版：6GB 显存
- 1.7B 高精版：8GB+ 显存（推荐 16GB）

## 快速开始

### 1. 下载环境文件

> 以下大文件未包含在 Git 仓库中，请从网盘下载后放到项目根目录：

| 文件/目录 | 说明 | 大小 |
|-----------|------|------|
| `WPy64-312101/` | WinPython 便携 Python 环境 (含所有依赖) | ~8GB |
| `models/` | ASR 模型 + 说话人分离模型 | ~2GB |
| `bin/` | ffmpeg / ffprobe / ffplay | ~630MB |
| `VC运行库/` | VC++ Redistributable | ~25MB |

> 网盘链接：[待补充]

### 2. 安装前端依赖

```bash
cd frontend
npm install
```

### 3. 启动

**一键启动（推荐）：**

双击 `一键启动.bat`，自动启动后端 + 前端，浏览器自动打开 `http://127.0.0.1:3000`

**分别启动：**

1. 双击 `backend\start.bat` 启动后端 API（端口 8000）
2. 双击 `frontend\start.bat` 启动前端界面（端口 3000）

**备选：原始 Gradio 版本**

双击 `一键启动WebUI.bat`，浏览器打开 `http://127.0.0.1:7867`

## 目录结构

```
├── backend/                 # FastAPI 后端
│   ├── server.py            # API 入口
│   ├── transcribe_engine.py # 转写引擎
│   ├── model_hub.py         # 模型加载
│   ├── audio_utils.py       # 音频处理 (ffmpeg)
│   ├── export_utils.py      # SRT 字幕导出
│   └── start.bat            # 后端启动脚本
├── frontend/                # Express.js 前端
│   ├── server.js            # Web 服务器
│   ├── public/              # 静态资源
│   └── start.bat            # 前端启动脚本
├── app/                     # 原始 Gradio 版本 (备选)
├── bin/                     # ffmpeg 二进制 (需下载)
├── models/                  # 模型文件 (需下载)
├── WPy64-312101/            # WinPython 环境 (需下载)
├── VC运行库/                # VC++ 运行库 (需下载)
├── 一键启动.bat              # 一键启动前后端
└── 一键启动WebUI.bat         # 原始 Gradio 启动
```

## API 接口

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/status` | 健康检查 |
| POST | `/api/transcribe` | 单音频转写 |
| POST | `/api/transcribe/batch` | 批量转写 |
| POST | `/api/align` | 文稿对齐 |
| GET | `/api/download/{folder}` | 下载结果 |

## 致敬开源

- [Alibaba Qwen Team](https://github.com/QwenLM/Qwen3-ASR) - Qwen3-ASR 基础模型
- [Pyannote.audio](https://github.com/pyannote/pyannote-audio) - 说话人分离
- [FunASR](https://github.com/modelscope/FunASR) - 语音识别框架
- [FFmpeg](https://ffmpeg.org/) - 音视频处理

## License

本项目仅供学习交流使用。