# main.py - Unified Server for Qwen3-ASR
import os
import sys
import json
import uuid
import socket
import asyncio
import subprocess
import torch
import shutil
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from hub import ModelHub
from engine import TranscribeEngine
from export import ExportUtils

# ── Config ──────────────────────────────────────────────
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")
OUTPUTS_DIR = os.path.join(PROJECT_ROOT, "outputs")
UPLOADS_DIR = os.path.join(PROJECT_ROOT, "uploads")
STATIC_DIR = os.path.join(PROJECT_ROOT, "static")
os.makedirs(OUTPUTS_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)

SD_MODEL_PATH = os.path.join(MODELS_DIR, "speaker-diarization-community-1")

# ── Global state ────────────────────────────────────────
hub: ModelHub = None
engine: TranscribeEngine = None
gpu_executor = ThreadPoolExecutor(max_workers=1)


def _parse_json_dict(s):
    try:
        return json.loads(s) if s else {}
    except Exception:
        return {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global hub, engine
    print("[Phase 1/3] Initializing model hub...")
    hub = ModelHub()

    asr_ckpt = os.environ.get("ASR_CHECKPOINT", os.path.join(MODELS_DIR, "Qwen", "Qwen3-ASR-0.6B"))
    aligner_ckpt = os.environ.get("ALIGNER_CHECKPOINT", os.path.join(MODELS_DIR, "Qwen", "Qwen3-ForcedAligner-0.6B"))

    print(f"[Phase 2/3] Loading ASR model from: {asr_ckpt}")
    b_kwargs = {"dtype": torch.bfloat16, "device_map": "cuda:0", "max_inference_batch_size": 1, "max_new_tokens": 1024}
    a_kwargs = {"dtype": torch.bfloat16, "device_map": "cuda:0"}

    hub.load_asr(asr_ckpt, "transformers", b_kwargs, aligner_ckpt, a_kwargs)
    print("[Phase 3/3] Initializing transcribe engine...")
    engine = TranscribeEngine(hub)
    print("Models loaded successfully.")
    yield


app = FastAPI(title="Qwen3-ASR Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ──────────────────────────────────────────────
@app.get("/api/status")
def status():
    return {"status": "ok", "asr_loaded": hub is not None and hub.asr_model is not None}


# ── Single Transcribe ───────────────────────────────────
def _run_transcribe(file_path, language, diarize, hotwords):
    return engine.run(file_path, language, diarize, SD_MODEL_PATH, PROJECT_ROOT, hotwords)


@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form(default="自动识别"),
    diarize: bool = Form(default=True),
    max_chars: int = Form(default=20),
    punc_pattern: str = Form(default=""),
    hotwords: str = Form(default=""),
):
    if not file:
        raise HTTPException(400, "No file uploaded")

    file_id = uuid.uuid4().hex[:8]
    ext = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
    local_path = os.path.join(UPLOADS_DIR, f"single_{file_id}{ext}")
    with open(local_path, "wb") as f:
        f.write(await file.read())

    try:
        loop = asyncio.get_event_loop()
        text, ts, sd = await loop.run_in_executor(
            gpu_executor, _run_transcribe, local_path, language, diarize, hotwords
        )

        out_folder = os.path.join(OUTPUTS_DIR, f"{file_id}_single")
        os.makedirs(out_folder, exist_ok=True)

        _punc = punc_pattern if punc_pattern else None
        all_srt = ExportUtils.generate_srt_content(text, ts, sd, max_chars, _punc)
        all_path = os.path.join(out_folder, "全角色.srt")
        with open(all_path, "w", encoding="utf-8") as f:
            f.write(all_srt)

        speakers = []
        if diarize and sd and "text" in sd:
            speakers = sorted(list(set(str(seg[2]) for seg in sd["text"])))
            for spk in speakers:
                spk_srt = ExportUtils.generate_srt_content(text, ts, sd, max_chars, _punc, target_spk=spk)
                if spk_srt.strip():
                    with open(os.path.join(out_folder, f"角色_{spk}.srt"), "w", encoding="utf-8") as f:
                        f.write(spk_srt)

        shutil.make_archive(out_folder, "zip", out_folder)
        shutil.rmtree(out_folder)

        return {
            "status": "success",
            "full_text": text,
            "srt_content": all_srt,
            "speakers": speakers,
            "output_folder": f"{file_id}_single",
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))
    finally:
        if os.path.exists(local_path):
            os.remove(local_path)


# ── Batch Transcribe ────────────────────────────────────
@app.post("/api/transcribe/batch")
async def transcribe_batch(
    files: list[UploadFile] = File(...),
    language: str = Form(default="自动识别"),
    diarize: bool = Form(default=True),
    max_chars: int = Form(default=20),
    punc_pattern: str = Form(default=""),
    hotwords: str = Form(default=""),
):
    if not files:
        raise HTTPException(400, "No files uploaded")

    batch_id = uuid.uuid4().hex
    out_folder = os.path.join(OUTPUTS_DIR, f"{batch_id}_batch")
    os.makedirs(out_folder, exist_ok=True)

    loop = asyncio.get_event_loop()
    _punc = punc_pattern if punc_pattern else None
    results = []
    for f in files:
        ext = os.path.splitext(f.filename or "audio.wav")[1] or ".wav"
        file_id = uuid.uuid4().hex[:8]
        local_path = os.path.join(UPLOADS_DIR, f"batch_{batch_id}_{file_id}{ext}")
        with open(local_path, "wb") as fh:
            fh.write(await f.read())

        try:
            text, ts, sd = await loop.run_in_executor(
                gpu_executor, _run_transcribe, local_path, language, diarize, hotwords
            )

            single_folder = os.path.join(out_folder, f"{file_id}_single")
            os.makedirs(single_folder, exist_ok=True)

            all_srt = ExportUtils.generate_srt_content(text, ts, sd, max_chars, _punc)
            with open(os.path.join(single_folder, "全角色.srt"), "w", encoding="utf-8") as out_f:
                out_f.write(all_srt)

            if diarize and sd and "text" in sd:
                spks = sorted(list(set(str(seg[2]) for seg in sd["text"])))
                for s in spks:
                    s_srt = ExportUtils.generate_srt_content(text, ts, sd, max_chars, _punc, target_spk=s)
                    if s_srt.strip():
                        with open(os.path.join(single_folder, f"角色_{s}.srt"), "w", encoding="utf-8") as out_f:
                            out_f.write(s_srt)

            shutil.make_archive(single_folder, "zip", single_folder)
            shutil.rmtree(single_folder)

            results.append({"filename": f.filename, "file_id": file_id, "status": "success", "full_text": text, "srt_content": all_srt})
        except Exception as e:
            results.append({"filename": f.filename, "file_id": file_id, "status": "error", "error": str(e)})
        finally:
            if os.path.exists(local_path):
                os.remove(local_path)

    shutil.make_archive(out_folder, "zip", out_folder)
    return {"status": "completed", "results": results, "output_folder": f"{batch_id}_batch"}


# ── Align ───────────────────────────────────────────────
def _run_align(file_path, reference_text, language):
    return engine.align(file_path, reference_text, language)


@app.post("/api/align")
async def align(
    file: UploadFile = File(...),
    reference_text: str = Form(...),
    language: str = Form(default="Chinese"),
):
    if not file or not reference_text:
        raise HTTPException(400, "Missing file or reference text")

    file_id = uuid.uuid4().hex[:8]
    ext = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
    local_path = os.path.join(UPLOADS_DIR, f"align_{file_id}{ext}")
    with open(local_path, "wb") as f:
        f.write(await file.read())

    try:
        loop = asyncio.get_event_loop()
        text, ts = await loop.run_in_executor(
            gpu_executor, _run_align, local_path, reference_text, language
        )
        srt_content = ExportUtils.generate_srt_content(text, ts, sd_result=None, max_chars=40)

        out_folder = os.path.join(OUTPUTS_DIR, f"{file_id}_align")
        os.makedirs(out_folder, exist_ok=True)
        srt_path = os.path.join(out_folder, "align_result.srt")
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)

        shutil.make_archive(out_folder, "zip", out_folder)
        shutil.rmtree(out_folder)

        return {
            "status": "success",
            "srt_content": srt_content,
            "output_folder": f"{file_id}_align",
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))
    finally:
        if os.path.exists(local_path):
            os.remove(local_path)


# ── Download ────────────────────────────────────────────
@app.get("/api/download/{folder}")
def download_folder(folder: str):
    zip_path = os.path.join(OUTPUTS_DIR, f"{folder}.zip")
    if os.path.exists(zip_path):
        return FileResponse(zip_path, filename=f"{folder}.zip", media_type="application/zip")
    folder_path = os.path.join(OUTPUTS_DIR, folder)
    if os.path.isdir(folder_path):
        zip_path = shutil.make_archive(folder_path, "zip", folder_path)
        return FileResponse(zip_path, filename=f"{folder}.zip", media_type="application/zip")
    raise HTTPException(404, "Folder not found")


@app.get("/api/download/srt/{folder}/{filename}")
def download_srt(folder: str, filename: str):
    file_path = os.path.join(OUTPUTS_DIR, folder, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, filename=filename, media_type="text/plain")
    raise HTTPException(404, "File not found")


@app.get("/api/download/{batch_folder}/{single_zip}")
def download_single(batch_folder: str, single_zip: str):
    file_path = os.path.join(OUTPUTS_DIR, batch_folder, single_zip)
    if os.path.exists(file_path):
        return FileResponse(file_path, filename=single_zip, media_type="application/zip")
    raise HTTPException(404, "File not found")


# ── Workspace ────────────────────────────────────────────
@app.post("/api/workspace/upload")
async def workspace_upload(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(400, "No file uploaded")

    file_id = uuid.uuid4().hex[:8]
    ext = os.path.splitext(file.filename or "video.mp4")[1] or ".mp4"
    video_path = os.path.join(UPLOADS_DIR, f"ws_video_{file_id}{ext}")
    audio_path = os.path.join(UPLOADS_DIR, f"ws_audio_{file_id}.wav")

    with open(video_path, "wb") as f:
        f.write(await file.read())

    # Extract audio from video using ffmpeg
    cmd = ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audio_path]
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await proc.wait()

    return {
        "status": "success",
        "file_id": file_id,
        "video_url": f"/api/workspace/video/{file_id}{ext}",
        "audio_url": f"/api/workspace/audio/{file_id}.wav",
    }


@app.get("/api/workspace/video/{filename:path}")
def serve_workspace_video(filename: str):
    video_path = os.path.join(UPLOADS_DIR, f"ws_video_{filename}")
    if os.path.exists(video_path):
        return FileResponse(video_path, media_type="video/mp4")
    raise HTTPException(404, "Video not found")


@app.get("/api/workspace/audio/{filename:path}")
def serve_workspace_audio(filename: str):
    audio_path = os.path.join(UPLOADS_DIR, f"ws_audio_{filename}")
    if os.path.exists(audio_path):
        return FileResponse(audio_path, media_type="audio/wav")
    raise HTTPException(404, "Audio not found")


# ── Static Files & SPA fallback ─────────────────────────
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve static files with SPA fallback to index.html"""
    file_path = os.path.join(STATIC_DIR, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# ── Main ────────────────────────────────────────────────
def _check_port(host, port):
    """Check if port is available. Returns True if available, False otherwise."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ip", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    if not _check_port(args.ip, args.port):
        print(f"[ERROR] Port {args.port} is already in use or unavailable.")
        sys.exit(1)

    os.environ.setdefault("ASR_CHECKPOINT", os.path.join(MODELS_DIR, "Qwen", "Qwen3-ASR-0.6B"))
    os.environ.setdefault("ALIGNER_CHECKPOINT", os.path.join(MODELS_DIR, "Qwen", "Qwen3-ForcedAligner-0.6B"))

    print(f"  Frontend: http://{args.ip}:{args.port}")
    print(f"  API:      http://{args.ip}:{args.port}/api/")
    print()

    uvicorn.run(app, host=args.ip, port=args.port)