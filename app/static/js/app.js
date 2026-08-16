// app.js - Qwen3-ASR Frontend Logic
const API_BASE = '';

// 页面刷新时清空浏览器可能恢复的表单内容
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('textarea').forEach(t => t.value = '');
  document.getElementById('singleSrt').textContent = '';
  document.getElementById('batchSrt').textContent = '';
  document.getElementById('alignSrt').textContent = '';
  document.getElementById('wsSrt').textContent = '';
});

// ── Tab Switching ──
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Backend Status Check ──
async function checkBackend() {
  try {
    const resp = await fetch(API_BASE + '/api/status');
    const data = await resp.json();
    const dot = document.getElementById('backendStatus');
    const text = document.getElementById('backendStatusText');
    if (data.status === 'ok') {
      dot.className = 'status-dot online';
      text.textContent = '后端已连接';
    } else {
      dot.className = 'status-dot offline';
      text.textContent = '后端未就绪';
    }
  } catch {
    document.getElementById('backendStatus').className = 'status-dot offline';
    document.getElementById('backendStatusText').textContent = '后端未连接';
  }
}
checkBackend();
setInterval(checkBackend, 10000);

// ── Upload Helpers ──
function setupUpload(areaId, inputId, previewId, nameId, removeId) {
  const area = document.getElementById(areaId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  const nameEl = document.getElementById(nameId);
  const removeBtn = document.getElementById(removeId);

  // Clear stale browser state after page refresh
  input.value = '';

  area.addEventListener('click', (e) => {
    if (e.target !== removeBtn) input.click();
  });
  area.addEventListener('dragover', (e) => { e.preventDefault(); area.style.borderColor = '#6366f1'; });
  area.addEventListener('dragleave', () => { area.style.borderColor = ''; });
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.style.borderColor = '';
    if (input.multiple) {
      const dt = new DataTransfer();
      for (const file of input.files) dt.items.add(file);
      for (const file of e.dataTransfer.files) dt.items.add(file);
      input.files = dt.files;
    } else {
      input.files = e.dataTransfer.files;
    }
    updatePreview();
  });
  input.addEventListener('change', updatePreview);

  function updatePreview() {
    if (input.files.length > 0) {
      const names = Array.from(input.files).map(f => f.name).join(', ');
      nameEl.textContent = names;
      area.querySelector('.upload-placeholder').style.display = 'none';
      preview.style.display = 'flex';
    } else {
      area.querySelector('.upload-placeholder').style.display = '';
      preview.style.display = 'none';
    }
  }

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    input.value = '';
    updatePreview();
  });
}

// ── Batch Upload (individual file removal) ──
function setupBatchUpload() {
  const area = document.getElementById('batchUploadArea');
  const input = document.getElementById('batchFiles');
  const placeholder = document.getElementById('batchPlaceholder');
  const fileList = document.getElementById('batchFileList');

  input.value = '';

  area.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-remove')) input.click();
  });

  area.addEventListener('dragover', (e) => { e.preventDefault(); area.style.borderColor = '#6366f1'; });
  area.addEventListener('dragleave', () => { area.style.borderColor = ''; });

  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.style.borderColor = '';
    const dt = new DataTransfer();
    for (const file of input.files) dt.items.add(file);
    for (const file of e.dataTransfer.files) dt.items.add(file);
    input.files = dt.files;
    renderFileList();
  });

  input.addEventListener('change', renderFileList);

  fileList.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-remove')) {
      const index = parseInt(e.target.dataset.index);
      const dt = new DataTransfer();
      Array.from(input.files).forEach((file, i) => {
        if (i !== index) dt.items.add(file);
      });
      input.files = dt.files;
      renderFileList();
    }
  });

  function renderFileList() {
    if (input.files.length > 0) {
      placeholder.style.display = 'none';
      fileList.style.display = '';
      fileList.innerHTML = '';

      Array.from(input.files).forEach((file, i) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `<span class="file-name">${file.name}</span><button class="btn-remove" data-index="${i}">x</button>`;
        fileList.appendChild(item);
      });
    } else {
      placeholder.style.display = '';
      fileList.style.display = 'none';
    }
  }
}

setupUpload('singleUploadArea', 'singleFile', 'singlePreview', 'singleFileName', 'singleRemoveBtn');
setupBatchUpload();
setupUpload('alignUploadArea', 'alignFile', 'alignPreview', 'alignFileName', 'alignRemoveBtn');

// ── Range Display ──
document.getElementById('singleChars').addEventListener('input', function() {
  document.getElementById('singleCharsVal').textContent = this.value;
});
document.getElementById('batchChars').addEventListener('input', function() {
  document.getElementById('batchCharsVal').textContent = this.value;
});

// ── Punc Pattern Dropdown ──
function setupPuncSelect(selectId, customId) {
  const select = document.getElementById(selectId);
  const custom = document.getElementById(customId);
  select.addEventListener('change', () => {
    custom.style.display = select.value === '__custom__' ? '' : 'none';
  });
}

function getPuncPattern(selectId, customId) {
  const select = document.getElementById(selectId);
  if (select.value === '__custom__') {
    return document.getElementById(customId).value;
  }
  return select.value;
}

setupPuncSelect('singlePunc', 'singlePuncCustom');
setupPuncSelect('batchPunc', 'batchPuncCustom');

// ── Single Transcribe ──
document.getElementById('singleBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('singleFile');
  if (!fileInput.files.length) {
    document.getElementById('singleStatus').textContent = '请先上传音频文件';
    return;
  }

  const btn = document.getElementById('singleBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>处理中...';
  document.getElementById('singleStatus').innerHTML = '<span class="spinner"></span>正在转写...';
  document.getElementById('singleText').value = '';
  document.getElementById('singleSrt').textContent = '';
  document.getElementById('singleDownloadArea').style.display = 'none';

  try {
    const form = new FormData();
    form.append('file', fileInput.files[0]);
    form.append('language', document.getElementById('singleLang').value);
    form.append('diarize', document.getElementById('singleDiarize').checked);
    form.append('max_chars', document.getElementById('singleChars').value);
    form.append('punc_pattern', getPuncPattern('singlePunc', 'singlePuncCustom'));
    form.append('hotwords', document.getElementById('singleHotwords').value);

    const resp = await fetch(API_BASE + '/api/transcribe', { method: 'POST', body: form });
    const data = await resp.json();

    if (data.status === 'success') {
      document.getElementById('singleStatus').textContent = '转写完成';
      document.getElementById('singleText').value = data.full_text || '';
      document.getElementById('singleSrt').textContent = data.srt_content || '';
      if (data.output_folder) {
        // 从 output_folder 提取 UUID（如 a1b2c3d4_single → a1b2c3d4）
        const fileId = data.output_folder.split('_')[0];
        const origName = fileInput.files[0].name;
        document.getElementById('singleFileName').innerHTML =
          `${origName} <span class="file-id">(${fileId})</span>`;
        document.getElementById('singleDownloadArea').style.display = '';
        document.getElementById('singleDownloadBtn').onclick = () => {
          window.open(API_BASE + '/api/download/' + data.output_folder, '_blank');
        };
      }
    } else {
      document.getElementById('singleStatus').textContent = '错误: ' + (data.error || data.detail || '未知错误');
    }
  } catch (err) {
    document.getElementById('singleStatus').textContent = '请求失败: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '开始转写';
  }
});

// ── Batch Transcribe ──
document.getElementById('batchBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('batchFiles');
  if (!fileInput.files.length) {
    document.getElementById('batchStatus').textContent = '请先上传音频文件';
    return;
  }

  const btn = document.getElementById('batchBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>处理中...';
  document.getElementById('batchStatus').innerHTML = '<span class="spinner"></span>正在批量处理...';
  document.getElementById('batchLog').textContent = '';
  document.getElementById('batchText').value = '';
  document.getElementById('batchSrt').textContent = '';
  document.getElementById('batchFileSelect').innerHTML = '<option value="">-</option>';
  document.getElementById('batchDownloadArea').style.display = 'none';

  try {
    const form = new FormData();
    for (const file of fileInput.files) {
      form.append('files', file);
    }
    form.append('language', document.getElementById('batchLang').value);
    form.append('diarize', document.getElementById('batchDiarize').checked);
    form.append('max_chars', document.getElementById('batchChars').value);
    form.append('punc_pattern', getPuncPattern('batchPunc', 'batchPuncCustom'));
    form.append('hotwords', document.getElementById('batchHotwords').value);

    const resp = await fetch(API_BASE + '/api/transcribe/batch', { method: 'POST', body: form });
    const data = await resp.json();

    document.getElementById('batchStatus').textContent = data.status === 'completed' ? '全部完成' : '处理完成';

    const logLines = data.results.map((r, i) => {
      const fname = fileInput.files[i] ? fileInput.files[i].name : r.filename;
      if (r.status === 'success') {
        return `[OK] ${fname} (${r.file_id})`;
      }
      return `[FAIL] ${fname}: ${r.error}`;
    });
    document.getElementById('batchLog').textContent = logLines.join('\n');

    if (data.output_folder) {
      document.getElementById('batchDownloadArea').style.display = '';

      // 填充下拉列表并存储结果
      const select = document.getElementById('batchFileSelect');
      select.innerHTML = '<option value="">-</option>';
      const resultMap = {};

      data.results.forEach((r, i) => {
        if (r.status === 'success' && r.file_id) {
          const fname = fileInput.files[i] ? fileInput.files[i].name : r.filename;
          const label = `${fname} (${r.file_id})`;
          const opt = document.createElement('option');
          opt.value = r.file_id;
          opt.textContent = label;
          select.appendChild(opt);
          resultMap[r.file_id] = r;
        }
      });

      // 下拉切换预览
      select.onchange = () => {
        const r = resultMap[select.value];
        if (r) {
          document.getElementById('batchText').value = r.full_text || '';
          document.getElementById('batchSrt').textContent = r.srt_content || '';
        } else {
          document.getElementById('batchText').value = '';
          document.getElementById('batchSrt').textContent = '';
        }
      };

      // 默认选中第一个
      if (select.options.length > 1) {
        select.selectedIndex = 1;
        select.dispatchEvent(new Event('change'));
      }

      // 单独下载按钮（仅下载，不切换预览）
      const singleDiv = document.getElementById('batchSingleDownloads');
      singleDiv.innerHTML = '';
      data.results.forEach((r, i) => {
        if (r.status === 'success' && r.file_id) {
          const fname = fileInput.files[i] ? fileInput.files[i].name : r.filename;
          const btn = document.createElement('button');
          btn.className = 'btn-download';
          btn.textContent = `⬇ ${fname} (${r.file_id})`;
          btn.onclick = () => {
            window.open(API_BASE + '/api/download/' + data.output_folder + '/' + r.file_id + '_single.zip', '_blank');
          };
          singleDiv.appendChild(btn);
        }
      });

      document.getElementById('batchDownloadBtn').onclick = () => {
        window.open(API_BASE + '/api/download/' + data.output_folder, '_blank');
      };

      // 用后端UUID更新上传列表
      {
        const items = document.getElementById('batchFileList').querySelectorAll('.file-item');
        data.results.forEach((r, i) => {
          if (r.status === 'success' && r.file_id && items[i]) {
            const fname = fileInput.files[i] ? fileInput.files[i].name : r.filename;
            const nameSpan = items[i].querySelector('.file-name');
            nameSpan.innerHTML = `${fname} <span class="file-id">(${r.file_id})</span>`;
          }
        });
      }
    }
  } catch (err) {
    document.getElementById('batchStatus').textContent = '请求失败: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '批量处理';
  }
});

// ── Align ──
document.getElementById('alignBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('alignFile');
  const refText = document.getElementById('alignText').value.trim();
  if (!fileInput.files.length) {
    document.getElementById('alignStatus').textContent = '请先上传音频文件';
    return;
  }
  if (!refText) {
    document.getElementById('alignStatus').textContent = '请输入参考文本';
    return;
  }

  const btn = document.getElementById('alignBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>对齐中...';
  document.getElementById('alignStatus').innerHTML = '<span class="spinner"></span>正在对齐...';
  document.getElementById('alignSrt').textContent = '';
  document.getElementById('alignDownloadArea').style.display = 'none';

  try {
    const form = new FormData();
    form.append('file', fileInput.files[0]);
    form.append('reference_text', refText);
    form.append('language', document.getElementById('alignLang').value);

    const resp = await fetch(API_BASE + '/api/align', { method: 'POST', body: form });
    const data = await resp.json();

    if (data.status === 'success') {
      document.getElementById('alignStatus').textContent = '对齐完成';
      document.getElementById('alignSrt').textContent = data.srt_content || '';
      if (data.output_folder) {
        const fileId = data.output_folder.split('_')[0];
        const origName = fileInput.files[0].name;
        document.getElementById('alignFileName').innerHTML =
          `${origName} <span class="file-id">(${fileId})</span>`;
        document.getElementById('alignDownloadArea').style.display = '';
        document.getElementById('alignDownloadBtn').onclick = () => {
          window.open(API_BASE + '/api/download/' + data.output_folder, '_blank');
        };
      }
    } else {
      document.getElementById('alignStatus').textContent = '错误: ' + (data.error || data.detail || '未知错误');
    }
  } catch (err) {
    document.getElementById('alignStatus').textContent = '请求失败: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '开始对齐';
  }
});

// ── Workspace ──
(function() {
  const wsInput = document.getElementById('wsFile');
  const wsOverlay = document.getElementById('wsUploadOverlay');
  const wsPlaceholder = document.getElementById('wsPlaceholder');
  const wsPlayerWrapper = document.getElementById('wsPlayerWrapper');
  const wsVideo = document.getElementById('wsVideo');
  const wsWaveformWrap = document.getElementById('wsWaveformWrap');
  const wsCanvas = document.getElementById('wsWaveform');
  const wsProgress = document.getElementById('wsWaveformProgress');
  const wsCtx = wsCanvas.getContext('2d');

  let wsAudioUrl = null;
  let wsFileId = null;
  let wsAudioBuffer = null;
  let wsPeaks = [];
  let wsDragging = false;

  wsInput.value = '';

  // Init canvas size & empty waveform
  function initCanvas() {
    wsCanvas.width = wsCanvas.parentElement.clientWidth;
    wsCanvas.height = 80;
    wsPeaks = [];
    if (wsCanvas.width > 0) drawEmptyWaveform();
  }
  initCanvas();

  // Sync SRT sidebar height to match video + waveform
  function syncSrtHeight() {
    const left = document.querySelector('.ws-player-left');
    const srtSegments = document.getElementById('wsSrt');
    if (!left || !srtSegments) return;
    const leftHeight = left.clientHeight;
    if (leftHeight > 0) {
      srtSegments.style.maxHeight = leftHeight + 'px';
    }
  }
  syncSrtHeight();
  window.addEventListener('resize', syncSrtHeight);
  // Re-sync when workspace tab becomes visible
  const wsTabBtn = document.querySelector('[data-tab="workspace"]');
  if (wsTabBtn) {
    wsTabBtn.addEventListener('click', () => setTimeout(syncSrtHeight, 50));
  }

  function drawEmptyWaveform() {
    const w = wsCanvas.width, h = wsCanvas.height, mid = h / 2;
    wsCtx.clearRect(0, 0, w, h);
    wsCtx.strokeStyle = '#3a3a55';
    wsCtx.lineWidth = 1;
    wsCtx.beginPath();
    wsCtx.moveTo(0, mid);
    wsCtx.lineTo(w, mid);
    wsCtx.stroke();
  }

  // Drag & drop
  wsOverlay.addEventListener('click', () => wsInput.click());
  wsOverlay.addEventListener('dragover', (e) => { e.preventDefault(); wsOverlay.classList.add('drag-over'); });
  wsOverlay.addEventListener('dragleave', () => { wsOverlay.classList.remove('drag-over'); });
  wsOverlay.addEventListener('drop', (e) => {
    e.preventDefault();
    wsOverlay.classList.remove('drag-over');
    wsInput.files = e.dataTransfer.files;
    handleWsFile();
  });
  wsInput.addEventListener('change', handleWsFile);

  async function handleWsFile() {
    if (!wsInput.files.length) return;
    const file = wsInput.files[0];
    document.getElementById('wsStatus').textContent = '正在提取音频...';

    const form = new FormData();
    form.append('file', file);
    const resp = await fetch('/api/workspace/upload', { method: 'POST', body: form });
    const data = await resp.json();
    if (data.status !== 'success') {
      document.getElementById('wsStatus').textContent = '上传失败';
      return;
    }

    wsFileId = data.file_id;
    wsAudioUrl = data.audio_url;

    // Load video
    wsVideo.src = data.video_url;
    wsOverlay.style.display = 'none';
    wsPlayerWrapper.style.display = '';

    // Load audio & draw waveform
    await loadWaveform(data.audio_url);
    document.getElementById('wsStatus').textContent = '视频已就绪，可开始转写';
  }

  async function loadWaveform(url) {
    const resp = await fetch(url);
    const arrayBuffer = await resp.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    wsAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const raw = wsAudioBuffer.getChannelData(0);
    audioCtx.close();

    // Downsample to ~1 peak per pixel
    const width = wsCanvas.parentElement.clientWidth;
    wsCanvas.width = width;
    wsCanvas.height = 80;
    const step = Math.floor(raw.length / width) || 1;
    wsPeaks = [];
    for (let i = 0; i < width; i++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const v = Math.abs(raw[i * step + j] || 0);
        if (v > max) max = v;
      }
      wsPeaks.push(max);
    }
    drawWaveform();
  }

  function drawWaveform(progress) {
    const w = wsCanvas.width, h = wsCanvas.height, mid = h / 2;
    wsCtx.clearRect(0, 0, w, h);
    for (let i = 0; i < wsPeaks.length; i++) {
      const barH = wsPeaks[i] * mid * 0.9;
      if (progress != null && i / wsPeaks.length > progress) {
        wsCtx.fillStyle = '#3a3a55';
      } else {
        wsCtx.fillStyle = '#6366f1';
      }
      wsCtx.fillRect(i, mid - barH, 1, barH * 2);
    }
  }

  // Video timeupdate → waveform progress & active segment
  wsVideo.addEventListener('timeupdate', () => {
    if (!wsVideo.duration) return;
    const pct = wsVideo.currentTime / wsVideo.duration;
    wsProgress.style.width = (pct * 100) + '%';
    drawWaveform(pct);

    // Highlight active segment
    const segs = document.querySelectorAll('#wsSrt .srt-segment');
    let current = null;
    segs.forEach(seg => {
      const start = parseFloat(seg.dataset.start || '0');
      const end = parseFloat(seg.dataset.end || '0');
      if (wsVideo.currentTime >= start && wsVideo.currentTime < end) {
        current = seg;
      }
    });
    segs.forEach(s => s.classList.remove('active'));
    if (current) {
      current.classList.add('active');
      current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });

  // Waveform click → seek video
  wsWaveformWrap.addEventListener('mousedown', (e) => {
    wsDragging = true;
    seekWaveform(e);
  });
  document.addEventListener('mousemove', (e) => {
    if (wsDragging) seekWaveform(e);
  });
  document.addEventListener('mouseup', () => { wsDragging = false; });

  function seekWaveform(e) {
    if (!wsVideo.duration) return;
    const rect = wsCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    wsVideo.currentTime = x * wsVideo.duration;
  }

  // Punc
  setupPuncSelect('wsPunc', 'wsPuncCustom');
  document.getElementById('wsChars').addEventListener('input', function() {
    document.getElementById('wsCharsVal').textContent = this.value;
  });

  // Transcribe
  document.getElementById('wsBtn').addEventListener('click', async () => {
    if (!wsAudioUrl) {
      document.getElementById('wsStatus').textContent = '请先上传视频文件';
      return;
    }

    const btn = document.getElementById('wsBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>处理中...';
    document.getElementById('wsStatus').innerHTML = '<span class="spinner"></span>正在转写...';
    document.getElementById('wsText').value = '';
    document.getElementById('wsSrt').textContent = '';
    document.getElementById('wsDownloadArea').style.display = 'none';

    try {
      // Fetch extracted audio blob
      const audioResp = await fetch(wsAudioUrl);
      const audioBlob = await audioResp.blob();

      const form = new FormData();
      form.append('file', audioBlob, 'audio.wav');
      form.append('language', document.getElementById('wsLang').value);
      form.append('diarize', document.getElementById('wsDiarize').checked);
      form.append('max_chars', document.getElementById('wsChars').value);
      form.append('punc_pattern', getPuncPattern('wsPunc', 'wsPuncCustom'));
      form.append('hotwords', document.getElementById('wsHotwords').value);

      const resp = await fetch('/api/transcribe', { method: 'POST', body: form });
      const data = await resp.json();

      if (data.status === 'success') {
        document.getElementById('wsStatus').textContent = '转写完成';
        document.getElementById('wsText').value = data.full_text || '';
        renderWsSegments(data.srt_content || '');
        if (data.output_folder && wsFileId) {
          document.getElementById('wsDownloadArea').style.display = '';
          document.getElementById('wsDownloadBtn').onclick = () => {
            window.open('/api/download/' + data.output_folder, '_blank');
          };
        }
      } else {
        document.getElementById('wsStatus').textContent = '错误: ' + (data.error || data.detail || '未知错误');
      }
    } catch (err) {
      document.getElementById('wsStatus').textContent = '请求失败: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '开始转写';
    }
  });

  // ── SRT Segments ──
  function parseSrtTime(ts) {
    // "00:00:01,500" → seconds
    const m = ts.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) return 0;
    return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 1000;
  }

  function renderWsSegments(srt) {
    const container = document.getElementById('wsSrt');
    container.innerHTML = '';
    const blocks = srt.split(/\n\s*\n/);
    let activeEl = null;

    blocks.forEach(block => {
      const lines = block.trim().split('\n');
      if (lines.length < 2) return;
      // Line 1: index, Line 2: "00:00:01,000 --> 00:00:03,500", rest: text
      const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
      if (!timeMatch) return;
      const startSec = parseSrtTime(timeMatch[1]);
      const endSec = parseSrtTime(timeMatch[2]);
      const text = lines.slice(2).join('\n').trim();

      const div = document.createElement('div');
      div.className = 'srt-segment';
      div.dataset.start = startSec;
      div.dataset.end = endSec;
      div.innerHTML = `<div class="seg-time">${timeMatch[1]} → ${timeMatch[2]}</div><div class="seg-text">${text}</div>`;

      div.addEventListener('click', () => {
        if (wsVideo.duration) {
          wsVideo.currentTime = startSec;
          // Highlight active
          if (activeEl) activeEl.classList.remove('active');
          div.classList.add('active');
          activeEl = div;
        }
      });

      container.appendChild(div);
    });
  }
})();