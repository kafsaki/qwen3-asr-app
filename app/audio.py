# audio.py
import subprocess
import tempfile
import os

class AudioUtils:
    @staticmethod
    def get_duration(file_path: str) -> float:
        cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file_path]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        return float(result.stdout)

    @staticmethod
    def convert_to_std_wav(input_path: str) -> str:
        """强制规范化：16k, mono, s16le。这是防漂移的物理基础。"""
        temp_wav = tempfile.mktemp(suffix="_std_16k.wav")
        cmd = ["ffmpeg", "-y", "-i", input_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", temp_wav]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return temp_wav

    @staticmethod
    def split_audio(input_path: str, max_sec: int = 1000) -> list:
        duration = AudioUtils.get_duration(input_path)
        if duration <= max_sec:
            return [{"path": input_path, "offset": 0.0}]
        chunks = []
        for start in range(0, int(duration), max_sec):
            end = min(start + max_sec, int(duration))
            chunk_path = tempfile.mktemp(suffix=f"_chunk_{start}.wav")
            cmd = ["ffmpeg", "-y", "-i", input_path, "-ss", str(start), "-t", str(end-start), 
                   "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", chunk_path]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            chunks.append({"path": chunk_path, "offset": float(start)})
        return chunks