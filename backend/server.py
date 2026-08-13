# server.py - FastAPI Backend for Qwen3-ASR
import os
import sys
import json
import torch
import shutil
import datetime
import argparse
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from model_hub import ModelHub
from transcribe_engine import TranscribeEngine
from export_utils import ExportUtils

# ── Config ──────────────────────────────────────────────
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")
OUTPUTS_DIR = os.path.join(PROJECT_ROOT, "outputs")
UPLOADS_DIR = os.path.join(PROJECT_ROOT, "uploads")
os.makedirs(OUTPUTS_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)

SD_MODEL_PATH = os.path.join(MODELS_DIR, "speaker-diarization-community-1")

# ── Global state ────────────────────────────────────────
hub: ModelHub = None
engine: TranscribeEngine = None


def _parse_json_dict(s):
    try:
        return json.loads(s) if s else {}
    except Exception:
        return {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global hub, engine
    print("Loading models...")
    hub = ModelHub()

    asr_ckpt = os.environ.get("ASR_CHECKPOINT", os.path.join(MODELS_DIR, "Qwen", "Qwen3-ASR-0.6B"))
    aligner_ckpt = os.environ.get("ALIGNER_CHECKPOINT", os.path.join(MODELS_DIR, "Qwen", "Qwen3-ForcedAligner-0.6B"))

    b_kwargs = {"dtype": torch.bfloat16, "device_map": "cuda:0", "max_inference_batch_size": 1, "max_new_tokens": 1024}
    a_kwargs = {"dtype": torch.bfloat16, "device_map": "cuda:0"}

    hub.load_asr(asr_ckpt, "transformers", b_kwargs, aligner_ckpt, a_kwargs)
    engine = TranscribeEngine(hub)
    print("Models loaded successfully.")
    yield


app = FastAPI(title="Qwen3-ASR API", lifespan=lifespan)

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
@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form(default="自动识别"),
    diarize: bool = Form(default=True),
    max_chars: int = Form(default=20),
    split_by_punc: bool = Form(default=True),
    hotwords: str = Form(default=""),
):
    if not file:
        raise HTTPException(400, "No file uploaded")

    # Save uploaded file
    ext = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
    local_path = os.path.join(UPLOADS_DIR, f"upload_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}{ext}")
    with open(local_path, "wb") as f:
        f.write(await file.read())

    try:
        text, ts, sd = engine.run(local_path, language, diarize, SD_MODEL_PATH, PROJECT_ROOT, hotwords)

        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_single")
        out_folder = os.path.join(OUTPUTS_DIR, timestamp)
        os.makedirs(out_folder, exist_ok=True)

        all_srt = ExportUtils.generate_srt_content(text, ts, sd, max_chars, split_by_punc)
        all_path = os.path.join(out_folder, "single_全员.srt")
        with open(all_path, "w", encoding="utf-8") as f:
            f.write(all_srt)

        speakers = []
        if diarize and sd and "text" in sd:
            speakers = sorted(list(set(str(seg[2]) for seg in sd["text"])))
            for spk in speakers:
                spk_srt = ExportUtils.generate_srt_content(text, ts, sd, max_chars, split_by_punc, target_spk=spk)
                if spk_srt.strip():
                    with open(os.path.join(out_folder, f"single_角色_{spk}.srt"), "w", encoding="utf-8") as f:
                        f.write(spk_srt)

        return {
            "status": "success",
            "full_text": text,
            "srt_content": all_srt,
            "speakers": speakers,
            "output_folder": timestamp,
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
    split_by_punc: bool = Form(default=True),
    hotwords: str = Form(default=""),
):
    if not files:
        raise HTTPException(400, "No files uploaded")

    batch_id = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_folder = os.path.join(OUTPUTS_DIR, batch_id)
    os.makedirs(out_folder, exist_ok=True)

    results = []
    for f in files:
        ext = os.path.splitext(f.filename or "audio.wav")[1] or ".wav"
        local_path = os.path.join(UPLOADS_DIR, f"batch_{batch_id}_{f.filename}")
        with open(local_path, "wb") as fh:
            fh.write(await f.read())

        try:
            name = os.path.splitext(f.filename)[0]
            text, ts, sd = engine.run(local_path, language, diarize, SD_MODEL_PATH, PROJECT_ROOT, hotwords)

            all_srt = ExportUtils.generate_srt_content(text, ts, sd, max_chars, split_by_punc)
            with open(os.path.join(out_folder, f"{name}_全员.srt"), "w", encoding="utf-8") as out_f:
                out_f.write(all_srt)

            if diarize and sd and "text" in sd:
                spks = sorted(list(set(str(seg[2]) for seg in sd["text"])))
                for s in spks:
                    s_srt = ExportUtils.generate_srt_content(text, ts, sd, max_chars, split_by_punc, target_spk=s)
                    if s_srt.strip():
                        with open(os.path.join(out_folder, f"{name}_角色_{s}.srt"), "w", encoding="utf-8") as out_f:
                            out_f.write(s_srt)

            results.append({"filename": f.filename, "status": "success", "full_text": text})
        except Exception as e:
            results.append({"filename": f.filename, "status": "error", "error": str(e)})
        finally:
            if os.path.exists(local_path):
                os.remove(local_path)

    zip_path = shutil.make_archive(out_folder, "zip", out_folder)
    return {"status": "completed", "results": results, "output_folder": batch_id}


# ── Align ───────────────────────────────────────────────
@app.post("/api/align")
async def align(
    file: UploadFile = File(...),
    reference_text: str = Form(...),
    language: str = Form(default="Chinese"),
):
    if not file or not reference_text:
        raise HTTPException(400, "Missing file or reference text")

    ext = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
    local_path = os.path.join(UPLOADS_DIR, f"align_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}{ext}")
    with open(local_path, "wb") as f:
        f.write(await file.read())

    try:
        text, ts = engine.align(local_path, reference_text, language)
        srt_content = ExportUtils.generate_srt_content(text, ts, sd_result=None, max_chars=40, split_by_punc=True)

        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_align")
        out_folder = os.path.join(OUTPUTS_DIR, timestamp)
        os.makedirs(out_folder, exist_ok=True)
        srt_path = os.path.join(out_folder, "align_result.srt")
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)

        return {
            "status": "success",
            "srt_content": srt_content,
            "output_folder": timestamp,
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


# ── Main ────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ip", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    os.environ.setdefault("ASR_CHECKPOINT", os.path.join(MODELS_DIR, "Qwen", "Qwen3-ASR-0.6B"))
    os.environ.setdefault("ALIGNER_CHECKPOINT", os.path.join(MODELS_DIR, "Qwen", "Qwen3-ForcedAligner-0.6B"))

    uvicorn.run(app, host=args.ip, port=args.port)