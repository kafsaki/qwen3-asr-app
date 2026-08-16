# model_hub.py
import os
import torch
import yaml

import warnings
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    module="pyannote.audio.core.io"
)

warnings.filterwarnings(
    "ignore",
    category=UserWarning,
)

try:
    from pyannote.audio.utils.reproducibility import ReproducibilityWarning

    warnings.filterwarnings(
        "ignore",
        category=ReproducibilityWarning
    )
except Exception:
    pass

from pyannote.audio import Pipeline
from qwen_asr import Qwen3ASRModel

class ModelHub:
    def __init__(self):
        self.asr_model = None
        self.sd_pipeline = None

    def load_asr(self, ckpt, backend, kwargs, aligner_ckpt=None, aligner_kwargs=None):
        load_fn = Qwen3ASRModel.from_pretrained if backend == "transformers" else Qwen3ASRModel.LLM
        self.asr_model = load_fn(ckpt, forced_aligner=aligner_ckpt, forced_aligner_kwargs=aligner_kwargs, **kwargs)
        return self.asr_model

    def _fix_pyannote_config(self, model_path):
        config_path = os.path.join(model_path, "config.yaml")
        if not os.path.exists(config_path): return
        
        with open(config_path, 'r', encoding='utf-8') as f:
            cfg = yaml.safe_load(f)
        
        params = cfg.get("pipeline", {}).get("params", {})
        if "embedding" in params: params["embedding"] = os.path.join(model_path, "embedding")
        if "segmentation" in params: params["segmentation"] = os.path.join(model_path, "segmentation")
        
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(cfg, f)

    def load_diarization(self, model_path):
        """加载 Pyannote 离线流水线"""
        if self.sd_pipeline is not None:
            return self.sd_pipeline

        print(f"--- Pyannote 离线模型加载 ---")
        self._fix_pyannote_config(model_path)
        
        self.sd_pipeline = Pipeline.from_pretrained(os.path.join(model_path, "config.yaml"))
        
        if torch.cuda.is_available():
            self.sd_pipeline.to(torch.device("cuda"))
            print("Pyannote 已加载至 GPU")
            
        return self.sd_pipeline