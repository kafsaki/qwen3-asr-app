# main.py
import os
import json
import torch
import warnings
import argparse
import shutil
import datetime
import gradio as gr
from model_hub import ModelHub
from transcribe_engine import TranscribeEngine
from export_utils import ExportUtils

CUSTOM_CSS = """
#srt_preview { max-height: 450px; overflow-y: auto !important; }
.gradio-container { max-width: none !important; }
"""

def _parse_json_dict(s):
    try: return json.loads(s) if s else {}
    except: return {}

def build_parser():
    parser = argparse.ArgumentParser()
    parser.add_argument("--asr-checkpoint", required=True)
    parser.add_argument("--aligner-checkpoint", default=None)
    parser.add_argument("--backend", default="transformers")
    parser.add_argument("--cuda-visible-devices", default="0")
    parser.add_argument("--backend-kwargs", default=None)
    parser.add_argument("--aligner-kwargs", default=None)
    parser.add_argument("--ip", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7867)
    return parser

def main():
    args = build_parser().parse_args()
    os.environ["CUDA_VISIBLE_DEVICES"] = args.cuda_visible_devices
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sd_model_path = os.path.join(project_root, "models", "speaker-diarization-community-1")

    hub = ModelHub()
    
    b_kwargs = _parse_json_dict(args.backend_kwargs)
    if "dtype" not in b_kwargs: b_kwargs["dtype"] = torch.bfloat16
    if "device_map" not in b_kwargs: b_kwargs["device_map"] = "cuda:0"
    
    a_kwargs = _parse_json_dict(args.aligner_kwargs)
    if "dtype" not in a_kwargs: a_kwargs["dtype"] = torch.bfloat16
    if "device_map" not in a_kwargs: a_kwargs["device_map"] = "cuda:0"
    
    hub.load_asr(args.asr_checkpoint, args.backend, b_kwargs, args.aligner_checkpoint, a_kwargs)
    engine = TranscribeEngine(hub)

    def single_handler(file, lang, diarize, max_c, punc, hotwords):
        if not file: return "请上传音频", "", "", None
        text, ts, sd = engine.run(file, lang, diarize, sd_model_path, project_root, hotwords)
        
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_single")
        out_folder = os.path.join(project_root, "outputs", timestamp)
        os.makedirs(out_folder, exist_ok=True)
        
        all_srt = ExportUtils.generate_srt_content(text, ts, sd, max_c, punc)
        all_path = os.path.join(out_folder, "single_全员.srt")
        with open(all_path, "w", encoding="utf-8") as f: f.write(all_srt)
        
        if diarize and sd and "text" in sd:
            speakers = sorted(list(set(str(seg[2]) for seg in sd["text"])))
            for spk in speakers:
                spk_srt = ExportUtils.generate_srt_content(text, ts, sd, max_c, punc, target_spk=spk)
                if spk_srt.strip():
                    with open(os.path.join(out_folder, f"single_角色_{spk}.srt"), "w", encoding="utf-8") as f: f.write(spk_srt)
            zip_p = shutil.make_archive(out_folder, 'zip', out_folder)
            return "完成", text, all_srt, zip_p
            
        return "完成", text, all_srt, all_path

    def batch_handler(files, lang, diarize, max_c, punc, hotwords):
        if not files: return "未上传", "", None, ""
        out = os.path.join(project_root, "outputs", datetime.datetime.now().strftime("%Y%m%d_%H%M%S"))
        os.makedirs(out, exist_ok=True)
        log, last_srt = "", ""
        for f in files:
            name = os.path.splitext(os.path.basename(f.name))[0]
            log += f"### 处理中: {name}\n"
            yield "处理中...", "", None, log
            text, ts, sd = engine.run(f.name, lang, diarize, sd_model_path, project_root, hotwords)
            all_srt = ExportUtils.generate_srt_content(text, ts, sd, max_c, punc)
            with open(os.path.join(out, f"{name}_全员.srt"), "w", encoding="utf-8") as out_f: out_f.write(all_srt)
            if diarize and sd and "text" in sd:
                spks = sorted(list(set(str(seg[2]) for seg in sd["text"])))
                for s in spks:
                    s_srt = ExportUtils.generate_srt_content(text, ts, sd, max_c, punc, target_spk=s)
                    if s_srt.strip():
                        with open(os.path.join(out, f"{name}_角色_{s}.srt"), "w", encoding="utf-8") as out_f: out_f.write(s_srt)
            last_srt, log = all_srt, log + f"- 完成: {name}\n"
            yield f"进度 {files.index(f)+1}/{len(files)}", last_srt, None, log
        zip_p = shutil.make_archive(out, 'zip', out)
        yield "全部完成", last_srt, zip_p, log

    def align_handler(file, ref_text, lang):
        if not file or not ref_text: return "缺少输入", "", None
        
        text, ts = engine.align(file, ref_text, lang)
        
        srt_content = ExportUtils.generate_srt_content(text, ts, sd_result=None, max_chars=40, split_by_punc=True)
        
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_align")
        out_folder = os.path.join(project_root, "outputs", timestamp)
        os.makedirs(out_folder, exist_ok=True)
        
        path = os.path.join(out_folder, "align_result.srt")
        # ------------------------------------------
        
        with open(path, "w", encoding="utf-8") as f: 
            f.write(srt_content)
            
        return "对齐完成", srt_content, path

    with gr.Blocks() as demo:
        gr.Markdown("# 🎙️ Qwen3-ASR Pro 离线增强版")
        with gr.Tabs():
            with gr.Tab("🎯 单音频识别"):
                with gr.Row():
                    with gr.Column(scale=2):
                        in_s = gr.Audio(label="上传音频", type="filepath")
                        la_s = gr.Dropdown(["自动识别", "Chinese", "English", "Cantonese"], value="自动识别", label="语种")
                        in_hot_s = gr.Textbox(label="热词提示 (Prompt)", placeholder="输入术语")
                        with gr.Group():
                            sd_s = gr.Checkbox(label="开启角色识别", value=True)
                            pu_s = gr.Checkbox(label="标点断句", value=True)
                            ma_s = gr.Slider(label="单行字数", minimum=5, maximum=100, value=20)
                        btn_s = gr.Button("🚀 开始转写", variant="primary")
                    with gr.Column(scale=4):
                        st_s = gr.Textbox(label="状态")
                        tx_s = gr.Textbox(label="完整文本", lines=8)
                        sr_s = gr.Code(label="SRT 预览", lines=10, elem_id="srt_preview")
                        fi_s = gr.File(label="下载结果")
                btn_s.click(single_handler, [in_s, la_s, sd_s, ma_s, pu_s, in_hot_s], [st_s, tx_s, sr_s, fi_s])

            with gr.Tab("📦 批量识别"):
                with gr.Row():
                    with gr.Column(scale=2):
                        in_b = gr.File(label="批量文件", file_count="multiple")
                        la_b = gr.Dropdown(["自动识别", "Chinese", "English", "Cantonese"], value="自动识别", label="语种")
                        in_hot_b = gr.Textbox(label="热词提示 (Prompt)", placeholder="输入术语")
                        with gr.Group():
                            sd_b = gr.Checkbox(label="角色识别", value=True)
                            pu_b = gr.Checkbox(label="标点断句", value=True)
                            ma_b = gr.Slider(label="单行字数", minimum=5, maximum=100, value=20)
                        btn_b = gr.Button("🚀 批量处理", variant="primary")
                    with gr.Column(scale=4):
                        st_b = gr.Textbox(label="状态")
                        sr_b = gr.Code(label="最后一个预览", lines=10, elem_id="srt_preview")
                        zi_b = gr.File(label="下载 ZIP")
                        lo_b = gr.Markdown(label="日志")
                btn_b.click(batch_handler, [in_b, la_b, sd_b, ma_b, pu_b, in_hot_b], [st_b, sr_b, zi_b, lo_b])

            with gr.Tab("📏 精准对齐"):
                with gr.Row():
                    with gr.Column(scale=2):
                        in_a = gr.Audio(label="上传音频", type="filepath")
                        tx_a = gr.Textbox(label="参考文本", lines=10)
                        la_a = gr.Dropdown(["Chinese", "English", "Cantonese", "Japanese"], value="Chinese", label="语种")
                        btn_a = gr.Button("📏 开始对齐", variant="primary")
                    with gr.Column(scale=4):
                        st_a = gr.Textbox(label="状态")
                        sr_a = gr.Code(label="对齐 SRT 预览", lines=20, elem_id="srt_preview")
                        fi_a = gr.File(label="下载结果")
                btn_a.click(align_handler, [in_a, tx_a, la_a], [st_a, sr_a, fi_a])

    demo.queue().launch(server_name=args.ip, server_port=args.port, theme=gr.themes.Soft(), css=CUSTOM_CSS, allowed_paths=[project_root], inbrowser=True)

if __name__ == "__main__":
    main()