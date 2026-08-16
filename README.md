```
   ____                     _____       ___   _____ ____     ___              
  / __ \_      _____  ____ |__  /      /   | / ___// __ \   /   |  ____  ____ 
 / / / / | /| / / _ \/ __ \ /_ <______/ /| | \__ \/ /_/ /  / /| | / __ \/ __ \
/ /_/ /| |/ |/ /  __/ / / /__/ /_____/ ___ |___/ / _, _/  / ___ |/ /_/ / /_/ /
\___\_\|__/|__/\___/_/ /_/____/     /_/  |_/____/_/ |_|  /_/  |_/ .___/ .___/ 
                                                               /_/   /_/      
```

基于阿里 Qwen3-ASR 系列大模型的离线语音处理工具，集**语音转文本、角色分离、精准时间轴对齐、热词注入**于一体。

## 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                      BFF Server (Express.js :3000)                     │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ 单音频识别    │  │  批量处理     │  │  精准对齐     │              │
│  │ file + params │  │ files[] + .. │  │ file + text  │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
└─────────┼─────────────────┼─────────────────┼───────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Model Server (FastAPI :8000)                        │
│                                                                     │
│  POST /api/transcribe         POST /api/transcribe/batch            │
│  ┌───────────────────┐        ┌────────────────────────┐           │
│  │ engine.run()      │        │ for each file:         │           │
│  │  → ASR 转写       │        │   engine.run()         │           │
│  │  → 可选说话人分离  │        │   → zip 打包下载       │           │
│  │  → SRT 字幕生成   │        └────────────────────────┘           │
│  └───────────────────┘                                              │
│                                                                     │
│  POST /api/align                                                   │
│  ┌──────────────────────────────────────────┐                      │
│  │ engine.align()                            │                      │
│  │  1. ASR 转写 → 参考文本 + 逐字时间戳       │                      │
│  │  2. difflib 对齐用户文本 ↔ ASR 文本        │                      │
│  │  3. 时间戳映射 → SRT 字幕                  │                      │
│  └──────────────────────────────────────────┘                      │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Model Pipeline                               │
│                                                                     │
│  ┌──────────────────────┐    ┌──────────────────────────────┐      │
│  │ Qwen3-ASR (0.6B)     │    │ Speaker Diarization           │      │
│  │  Transformers 后端   │    │  Pyannote Pipeline (离线)      │      │
│  │  dtype: bfloat16     │    │  内存模式 (torchaudio 加载)    │      │
│  │  device: CUDA        │    │  device: CUDA                 │      │
│  └──────────┬───────────┘    └──────────────────────────────┘      │
│             │                                                       │
│  ┌──────────▼───────────┐                                           │
│  │ Qwen3-ForcedAligner  │  ← 绑定在 ASR 模型内部                     │
│  │  字/词级时间戳生成    │     return_time_stamps=True               │
│  └──────────────────────┘                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 三种模式对比

| | 单音频识别 | 批量处理 | 精准对齐 |
|---|---|---|---|
| **API** | `POST /api/transcribe` | `POST /api/transcribe/batch` | `POST /api/align` |
| **输入** | 1 个音频 + 参数 | 多个音频 + 参数 | 1 个音频 + 参考文本 |
| **ASR 转写** | 是 | 是 | 是（获取参考时间戳） |
| **说话人分离** | 可选 | 可选 | 否 |
| **difflib 对齐** | 否 | 否 | 是 |
| **输出** | 文本 + SRT 字幕 | ZIP 打包下载 | SRT 字幕（用户文本打时间戳） |
| **使用场景** | 语音转文字 | 批量处理多个文件 | 已有文字稿，需要逐字时间轴 |

### 转写流程详解

```
输入音频
  │
  ├─ ffmpeg 标准化 → 16kHz / mono / 16-bit WAV
  │
  ├─ 超长音频? (>1000s)
  │   └─ 是 → ffmpeg 分割为 1000s chunk，逐个转写后时间戳偏移叠加
  │   └─ 否 → 直接转写
  │
  ├─ 说话人分离? (diarize=true)
  │   └─ 是 → Pyannote Pipeline 内存模式推理
  │           → 返回 [开始时间, 结束时间, 说话人ID]
  │
  ├─ ASR 转写 → Qwen3ASRModel.transcribe(return_time_stamps=True)
  │   └─ Aligner 内部生成时间戳
  │
  └─ SRT 字幕生成 → 文本分段 + 时间戳格式化
```

### 对齐流程详解

```
输入音频 + 参考文本
  │
  ├─ 1. 同上 ASR 转写 → 获取 ASR 文本 + 段落级时间戳
  │
  ├─ 2. 段落级时间戳 → 按字符数均分 → 逐字时间戳
  │    例如: 段落 "你好世界" 时长 2.0s → 每字 0.5s
  │
  ├─ 3. difflib.SequenceMatcher 对比 ASR 文本 vs 参考文本
  │    ├─ equal 块 → 直接复用 ASR 逐字时间戳
  │    └─ replace/insert 块 → 区间内按字符数均匀插值
  │
  └─ 4. 输出: 参考文本 + 逐字时间戳 → SRT 字幕
```

## 硬件需求

- **NVIDIA 显卡**，建议显存 6GB+
- 0.6B 极速版：6GB 显存
- 1.7B 高精版：8GB+ 显存（推荐 16GB）

---

## 下载模型文件

> 以下大文件未包含在 Git 仓库中，请从网盘下载后解压到项目根目录的 `model_server/` 下：

| 目录 | 说明 | 大小 |
|------|------|------|
| `model_server/models/` | ASR 模型 + 说话人分离模型 | ~2GB |
| `model_server/windows_runtime/bin/` | ffmpeg / ffprobe / ffplay（仅 Windows 需要） | ~630MB |
| `model_server/windows_runtime/VC运行库/` | VC++ Redistributable（仅 Windows 需要） | ~25MB |
| `model_server/windows_runtime/WPy64-312101/` | 便携版 Python 3.12 + 依赖（仅 Windows 需要） | ~3GB |

> 网盘链接：[待补充]

---

## Windows 部署

### 方式一：便携版 Python（推荐，无需手动配置环境）

1. 从网盘下载 `WPy64-312101/` 并解压到 `model_server/windows_runtime/` 目录
2. 安装 BFF 依赖：

```powershell
cd server
npm install
cd ..
```

3. 运行 `model_server/windows_runtime/VC运行库/VC_redist.x64.exe` 安装 VC++ 运行库（如已安装可跳过）

4. 启动：

```powershell
# 终端1 - 模型推理服务（启动后选择 [1] Portable Python）
scripts\backend_start.bat

# 终端2 - BFF 服务
scripts\frontend_start.bat
```

浏览器访问 `http://127.0.0.1:3000`

### 方式二：Conda 环境（自行构建）

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

# 卸载不兼容的 torchcodec
# torchcodec 是 pyannote 的可选 GPU 音频解码器，安装 pyannote.audio 时自动拉入
# 它与 torch 2.5.1 不兼容会报错，卸载后 pyannote 自动回退到 torchaudio 内存模式
# 模型推理仍在 GPU 上执行，不影响性能
pip uninstall torchcodec -y
```

### 3. 安装 BFF 依赖

```powershell
cd server
npm install
cd ..
```

### 4. 启动

```powershell
# 终端1 - 模型推理服务（启动后选择 [2] Conda，输入 python.exe 路径）
scripts\backend_start.bat

# 终端2 - BFF 服务
scripts\frontend_start.bat
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
# torchcodec 是 pyannote 的可选 GPU 音频解码器，安装 pyannote.audio 时自动拉入
# 它与 torch 2.5.1 不兼容会报错，卸载后 pyannote 自动回退到 torchaudio 内存模式
# 模型推理仍在 GPU 上执行，不影响性能
pip uninstall torchcodec -y
```

### 4. 安装 BFF 依赖

```bash
cd server
npm install
cd ..
```

### 5. 启动

```bash
# 终端1 - 模型推理服务
conda activate qwen3-asr
export HF_HUB_OFFLINE=1
export ASR_CHECKPOINT="$PWD/model_server/models/Qwen/Qwen3-ASR-0.6B"
export ALIGNER_CHECKPOINT="$PWD/model_server/models/Qwen/Qwen3-ForcedAligner-0.6B"
cd model_server
python server.py --ip 127.0.0.1 --port 8000

# 终端2 - BFF 服务
cd server
npm start
```

浏览器访问 `http://127.0.0.1:3000`

---

## 目录结构

```
├── model_server/            # 模型推理服务 (FastAPI)
│   ├── server.py            # API 入口
│   ├── transcribe_engine.py # 转写引擎
│   ├── model_hub.py         # 模型加载
│   ├── audio_utils.py       # 音频处理 (ffmpeg)
│   ├── export_utils.py      # SRT 字幕导出
│   ├── models/              # 模型文件 (需从网盘下载)
│   │   ├── Qwen/            # Qwen3-ASR 模型
│   │   └── speaker-diarization-community-1/  # 说话人分离模型
│   ├── windows_runtime/     # Windows 运行环境 (需从网盘下载)
│   │   ├── bin/             # ffmpeg 二进制
│   │   ├── VC运行库/        # VC++ 运行库
│   │   └── WPy64-312101/    # 便携版 Python 3.12 + 依赖
│   ├── outputs/             # 转写结果输出
│   └── uploads/             # 临时上传文件
├── server/                  # BFF 服务 (Express.js)
│   ├── server.js            # Web 服务器 + API 代理
│   ├── public/              # 静态资源 (HTML/CSS/JS)
│   └── package.json
├── scripts/                 # 启动脚本
│   ├── backend_start.bat    # 模型推理服务启动脚本
│   └── frontend_start.bat   # BFF 服务启动脚本
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