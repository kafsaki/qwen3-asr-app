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

## 硬件需求

- **NVIDIA 显卡**，建议显存 6GB+
- 0.6B 极速版：6GB 显存
- 1.7B 高精版：8GB+ 显存（推荐 16GB）

---

## 下载模型文件

> 以下大文件未包含在 Git 仓库中，请从网盘下载后解压到项目根目录：

| 目录 | 说明 | 大小 |
|------|------|------|
| `models/` | ASR 模型 + 说话人分离模型 | ~2GB |
| `windows_runtime/bin/` | ffmpeg / ffprobe / ffplay（仅 Windows 需要） | ~630MB |
| `windows_runtime/VC运行库/` | VC++ Redistributable（仅 Windows 需要） | ~25MB |

> 网盘链接：[待补充]

---

## Windows 部署

### 1. 安装 Conda

下载 [Miniconda](https://docs.conda.io/en/latest/miniconda.html) 或 [Anaconda](https://www.anaconda.com/download) 并安装。

### 2. 创建环境并安装依赖

```powershell
conda create -n qwen3-asr python=3.12 -y
conda activate qwen3-asr

# PyTorch (CUDA 12.1)
pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu121

# 项目依赖
pip install qwen-asr pyannote.audio fastapi uvicorn python-multipart pyyaml

# 卸载不兼容的 torchcodec（pyannote 会回退到内存模式）
pip uninstall torchcodec -y
```

### 3. 安装前端依赖

```powershell
cd frontend
npm install
cd ..
```

### 4. 启动

分别运行前后端：

```powershell
# 终端1 - 后端（启动后会提示选择 [1] 便携版 或 [2] Conda）
windows_runtime\backend_start.bat

# 终端2 - 前端
windows_runtime\frontend_start.bat
```

浏览器访问 `http://127.0.0.1:3000`

---

## Ubuntu 部署

### 1. 安装系统依赖

```bash
sudo apt update
sudo apt install ffmpeg nvidia-driver-535 nvidia-cuda-toolkit -y
```

### 2. 安装 Conda

```bash
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh
# 重启终端后继续
```

### 3. 创建环境并安装依赖

```bash
git clone git@github.com:kafsaki/qwen3-asr-app.git
cd qwen3-asr-app

conda create -n qwen3-asr python=3.12 -y
conda activate qwen3-asr

# PyTorch (CUDA 12.1)
pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu121

# 项目依赖
pip install qwen-asr pyannote.audio fastapi uvicorn python-multipart pyyaml

# 卸载不兼容的 torchcodec
pip uninstall torchcodec -y
```

### 4. 安装前端依赖

```bash
cd frontend
npm install
cd ..
```

### 5. 启动

```bash
# 终端1 - 后端
conda activate qwen3-asr
export HF_HUB_OFFLINE=1
export ASR_CHECKPOINT="$PWD/models/Qwen/Qwen3-ASR-0.6B"
export ALIGNER_CHECKPOINT="$PWD/models/Qwen/Qwen3-ForcedAligner-0.6B"
cd backend
python server.py --ip 127.0.0.1 --port 8000

# 终端2 - 前端
cd frontend
npm start
```

浏览器访问 `http://127.0.0.1:3000`

---

## 目录结构

```
├── backend/                 # FastAPI 后端
│   ├── server.py            # API 入口
│   ├── transcribe_engine.py # 转写引擎
│   ├── model_hub.py         # 模型加载
│   ├── audio_utils.py       # 音频处理 (ffmpeg)
│   └── export_utils.py      # SRT 字幕导出
├── frontend/                # Express.js 前端
│   ├── server.js            # Web 服务器
│   ├── public/              # 静态资源
│   └── package.json
├── models/                  # 模型文件 (需从网盘下载)
│   ├── Qwen/                # Qwen3-ASR 模型
│   └── speaker-diarization-community-1/  # 说话人分离模型
├── windows_runtime/         # Windows 运行环境 (需从网盘下载)
│   ├── bin/                 # ffmpeg 二进制
│   ├── VC运行库/            # VC++ 运行库
│   ├── backend_start.bat    # 后端启动脚本
│   └── frontend_start.bat   # 前端启动脚本
├── outputs/                 # 转写结果输出
├── uploads/                 # 临时上传文件
└── README.md
```

## API 接口

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/status` | 健康检查 |
| POST | `/api/transcribe` | 单音频转写 |
| POST | `/api/transcribe/batch` | 批量转写 |
| POST | `/api/align` | 文稿对齐 |
| GET | `/api/download/{folder}` | 下载结果 |

## 原作者

本项目基于 [生活作弊码](https://www.bilibili.com/video/BV11Sge6AETP/) 的 Qwen3-ASR Pro 懒人包重构，感谢原作者的卓越贡献。

## 致敬开源

- [Alibaba Qwen Team](https://github.com/QwenLM/Qwen3-ASR) - Qwen3-ASR 基础模型
- [Pyannote.audio](https://github.com/pyannote/pyannote-audio) - 说话人分离
- [FunASR](https://github.com/modelscope/FunASR) - 语音识别框架
- [FFmpeg](https://ffmpeg.org/) - 音视频处理

## License

本项目仅供学习交流使用。