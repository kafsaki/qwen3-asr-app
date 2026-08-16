# engine.py
import os
import time
import torch
import torchaudio
import re
import difflib
from audio import AudioUtils

class TranscribeEngine:
    def __init__(self, hub):
        self.hub = hub

    def _build_system_prompt(self, hotwords_str):
        if not hotwords_str: return None
        words = hotwords_str.replace("，", ",").replace(" ", ",")
        return f"Vocabulary: {words}."

    def run(self, file_path, lang, diarize, sd_model_path, project_root, hotwords=""):
        t_start = time.time()
        audio_filename = os.path.basename(file_path)
        audio_duration = AudioUtils.get_duration(file_path)
        
        print(f"--- 音频信息 ---")
        print(f"  文件: {audio_filename}")
        print(f"  时长: {audio_duration:.1f} 秒")
        print(f"  语言: {lang}")
        if hotwords:
            print(f"  热词: {hotwords}")
        print(f"  说话人分离: {'是' if diarize else '否'}")
        
        std_wav = AudioUtils.convert_to_std_wav(file_path)
        print(f"  音频标准化: 16kHz, mono, s16le")
        
        sd_res = None
        if diarize:
            if torch.cuda.is_available(): torch.cuda.empty_cache()
            print("正在运行 Pyannote 角色分离 (内存加载模式)...")
            
            pipeline = self.hub.load_diarization(sd_model_path)
            
            try:
                waveform, sample_rate = torchaudio.load(std_wav)
                audio_in_memory = {"waveform": waveform, "sample_rate": sample_rate}
                
                output = pipeline(audio_in_memory)
                
                if hasattr(output, "exclusive_speaker_diarization"):
                    diarization = output.exclusive_speaker_diarization
                else:
                    diarization = output.speaker_diarization
                
                sd_list = []
                for segment, _, speaker in diarization.itertracks(yield_label=True):
                    sd_list.append([segment.start, segment.end, str(speaker)])
                
                sd_res = {"text": sd_list}
                print(f"角色分离完成，识别到 {len(set(str(s[2]) for s in sd_list))} 个说话人")
                
            except Exception as e:
                print(f"Pyannote 运行失败: {e}")
                import traceback
                traceback.print_exc()
                sd_res = None
            
            if torch.cuda.is_available(): torch.cuda.empty_cache()

        chunks = AudioUtils.split_audio(std_wav)
        system_prompt = self._build_system_prompt(hotwords)
        
        print(f"--- Qwen3-ASR 转写 ---")
        model_device = getattr(self.hub.asr_model, 'device', 'unknown')
        model_dtype = getattr(self.hub.asr_model, 'dtype', 'unknown')
        print(f"  设备: {model_device}")
        print(f"  精度: {model_dtype}")
        print(f"  音频分片: {len(chunks)} 段")
        if system_prompt:
            print(f"  热词提示: {system_prompt}")
        
        all_full_text, all_timestamps = "", []
        for i, chunk in enumerate(chunks):
            if len(chunks) > 1:
                print(f"  [{i+1}/{len(chunks)}] 处理片段 offset={chunk['offset']:.1f}s...")
            else:
                print(f"  正在转写...")
            
            t_chunk = time.time()
            if torch.cuda.is_available(): torch.cuda.empty_cache()
            res = self.hub.asr_model.transcribe(
                audio=chunk['path'], 
                language=None if lang == "自动识别" else lang, 
                context=system_prompt, 
                return_time_stamps=True
            )[0]
            elapsed = time.time() - t_chunk
            
            chunk_text = getattr(res, 'text', '')
            chunk_ts = getattr(res, 'time_stamps', [])
            print(f"    耗时: {elapsed:.1f}s | 文本: {len(chunk_text)} 字符 | 时间戳: {len(chunk_ts)} 个")
            if chunk_text:
                preview = chunk_text[:80] + ("..." if len(chunk_text) > 80 else "")
                print(f"    内容: {preview}")
            
            all_full_text += chunk_text + " "
            for ts in chunk_ts:
                all_timestamps.append({
                    'start_time': ts.start_time + chunk['offset'],
                    'end_time': ts.end_time + chunk['offset'],
                    'text': ts.text
                })
            if chunk['path'] != std_wav:
                if os.path.exists(chunk['path']): os.remove(chunk['path'])
            
        print(f"--- 转写完成 ---")
        print(f"  总耗时: {time.time() - t_start:.1f}s")
        print(f"  总字符: {len(all_full_text.strip())}")
        print(f"  时间戳: {len(all_timestamps)} 个")
        
        if os.path.exists(std_wav): os.remove(std_wav)
        return all_full_text.strip(), all_timestamps, sd_res

    def align(self, file_path, text, lang):
        asr_text, asr_ts, _ = self.run(file_path, lang, False, "", "", "")
        
        def get_pure_chars(t):
            chars = []
            for i, char in enumerate(t):
                if re.match(r'[a-zA-Z0-9\u4e00-\u9fff]', char):
                    chars.append(char)
            return "".join(chars)

        asr_char_ts = []
        for ts in asr_ts:
            p_text = get_pure_chars(ts['text'])
            if not p_text: continue
            duration = (ts['end_time'] - ts['start_time']) / len(p_text)
            for i, c in enumerate(p_text):
                asr_char_ts.append({
                    'char': c,
                    'start': ts['start_time'] + i * duration,
                    'end': ts['start_time'] + (i + 1) * duration
                })

        asr_pure = get_pure_chars(asr_text)
        user_pure = get_pure_chars(text)
        
        matcher = difflib.SequenceMatcher(None, asr_pure, user_pure)
        opcodes = matcher.get_opcodes()

        final_mapped_ts = []
        last_time = 0.0

        for tag, i1, i2, j1, j2 in opcodes:
            if tag == 'equal':
                for idx in range(i1, i2):
                    if idx < len(asr_char_ts):
                        item = asr_char_ts[idx]
                        final_mapped_ts.append({'start_time': item['start'], 'end_time': item['end'], 'text': item['char']})
                        last_time = item['end']
            elif tag in ('replace', 'insert'):
                start_ref = asr_char_ts[i1]['start'] if i1 < len(asr_char_ts) else last_time
                end_ref = asr_char_ts[min(i2, len(asr_char_ts)-1)]['end'] if i2 <= len(asr_char_ts) and i2 > 0 else last_time + 0.5
                
                num_new_chars = j2 - j1
                if num_new_chars > 0:
                    char_dur = (end_ref - start_ref) / num_new_chars
                    for k in range(num_new_chars):
                        s = start_ref + k * char_dur
                        e = start_ref + (k + 1) * char_dur
                        final_mapped_ts.append({'start_time': s, 'end_time': e, 'text': user_pure[j1+k]})
                        last_time = e

        print(f"对齐映射完成：ASR字符({len(asr_char_ts)}) -> 用户字符({len(final_mapped_ts)})")
        return text, final_mapped_ts