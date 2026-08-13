# export_utils.py
import re
import datetime

class ExportUtils:
    @staticmethod
    def get_pure_len(text):
        if not text: return 0
        return len(re.sub(r'[^a-zA-Z0-9\u4e00-\u9fff]', '', text))

    @staticmethod
    def calculate_iou(s1, e1, s2, e2):
        overlap = max(0, min(e1, e2) - max(s1, s2))
        union = (e1 - s1) + (e2 - s2) - overlap
        return overlap / union if union > 0 else 0

    @staticmethod
    def _format_srt_time(s: float) -> str:
        td = datetime.timedelta(seconds=max(0, float(s)))
        total_seconds = int(td.total_seconds())
        hours, minutes, seconds = total_seconds // 3600, (total_seconds % 3600) // 60, total_seconds % 60
        millis = int(td.microseconds / 1000)
        return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"

    @staticmethod
    def generate_srt_content(full_text, timestamps, sd_result=None, max_chars=20, split_by_punc=True, target_spk=None):
        if not timestamps or not full_text: return ""
        pattern = r'([^，。！？；：,.!?:; \n]+[，。！？；：,.!?:; \n]*)'
        segments = re.findall(pattern, full_text)
        
        srt_lines, ts_idx, line_idx = [], 0, 1
        last_end_time = 0.0

        for seg_text in segments:
            seg_pure_len = ExportUtils.get_pure_len(seg_text)
            if seg_pure_len == 0: continue
            
            matched_pure_len = 0
            seg_start_ts_idx = ts_idx
            while ts_idx < len(timestamps) and matched_pure_len < seg_pure_len:
                tk_text = timestamps[ts_idx].get('text', '')
                matched_pure_len += ExportUtils.get_pure_len(tk_text)
                ts_idx += 1
            
            if ts_idx > seg_start_ts_idx:
                s_time = timestamps[seg_start_ts_idx]["start_time"]
                e_time = timestamps[ts_idx-1]["end_time"]
            else:
                s_time = last_end_time
                e_time = last_end_time + 0.5
            
            last_end_time = e_time

            best_sid = None
            if sd_result and "text" in sd_result:
                max_iou = -1
                for spk_seg in sd_result["text"]:
                    factor = 1000.0 if spk_seg[1] > e_time * 10 else 1.0
                    ss, se, sid = spk_seg[0]/factor, spk_seg[1]/factor, str(spk_seg[2])
                    iou = ExportUtils.calculate_iou(s_time, e_time, ss, se)
                    if iou > max_iou: max_iou, best_sid = iou, sid

            if target_spk is None or best_sid == target_spk:
                spk_label = f"[角色 {best_sid}] " if (target_spk is None and best_sid) else ""
                srt_lines.append(f"{line_idx}\n{ExportUtils._format_srt_time(s_time)} --> {ExportUtils._format_srt_time(e_time)}\n{spk_label}{seg_text.strip()}\n")
                line_idx += 1

        return "\n".join(srt_lines)