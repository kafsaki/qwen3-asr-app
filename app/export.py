# export.py
import re
import datetime

class ExportUtils:
    @staticmethod
    def get_pure_len(text):
        if not text: return 0
        # 统计核心字符：中文、字母、数字
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
        
        # 1. 语义切分：匹配非标点内容 + 后随的标点/空格
        pattern = r'([^，。！？；：,.!?:; \n]+[，。！？；：,.!?:; \n]*)'
        segments = re.findall(pattern, full_text)
        
        srt_lines, ts_idx, line_idx = [], 0, 1
        current_line_ts, current_line_text = [], ""
        last_end_time = 0.0

        for seg_text in segments:
            seg_pure_len = ExportUtils.get_pure_len(seg_text)
            # 如果是纯标点或空格，直接累加到当前行，不单独处理时间戳
            if seg_pure_len == 0:
                current_line_text += seg_text
                continue
            
            # 核销时间戳
            matched_pure_len = 0
            seg_start_ts_idx = ts_idx
            while ts_idx < len(timestamps) and matched_pure_len < seg_pure_len:
                tk_text = timestamps[ts_idx].get('text', '')
                matched_pure_len += ExportUtils.get_pure_len(tk_text)
                ts_idx += 1
            
            current_line_text += seg_text
            if ts_idx > seg_start_ts_idx:
                current_line_ts.extend(timestamps[seg_start_ts_idx:ts_idx])

            # --- 核心修复点：断句逻辑判定 ---
            # 1. 真正的标点断句（排除空格和换行）
            is_punc_end = split_by_punc and re.search(r'[，。！？；：,.!?:;]\s*$', seg_text)
            # 2. 强制换行符断句
            is_newline_end = '\n' in seg_text
            # 3. 字符数量溢出断句
            is_length_overflow = ExportUtils.get_pure_len(current_line_text) >= max_chars

            if is_punc_end or is_newline_end or is_length_overflow:
                if current_line_ts:
                    s_time = current_line_ts[0]["start_time"]
                    e_time = current_line_ts[-1]["end_time"]
                    
                    # 说话人识别逻辑 (IoU 焊接)
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
                        srt_lines.append(f"{line_idx}\n{ExportUtils._format_srt_time(s_time)} --> {ExportUtils._format_srt_time(e_time)}\n{spk_label}{current_line_text.strip()}\n")
                        line_idx += 1
                    
                    last_end_time = e_time
                    current_line_ts, current_line_text = [], ""

        # 处理最后残余
        if current_line_text.strip() and current_line_ts:
            s_time, e_time = current_line_ts[0]["start_time"], current_line_ts[-1]["end_time"]
            srt_lines.append(f"{line_idx}\n{ExportUtils._format_srt_time(s_time)} --> {ExportUtils._format_srt_time(e_time)}\n{current_line_text.strip()}\n")
        
        return "\n".join(srt_lines)