// app.js - Qwen3-ASR Frontend Logic
const API_BASE = '';

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
    form.append('split_by_punc', document.getElementById('singlePunc').checked);
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
    form.append('split_by_punc', document.getElementById('batchPunc').checked);
    form.append('hotwords', document.getElementById('batchHotwords').value);

    const resp = await fetch(API_BASE + '/api/transcribe/batch', { method: 'POST', body: form });
    const data = await resp.json();

    document.getElementById('batchStatus').textContent = data.status === 'completed' ? '全部完成' : '处理完成';

    // 检测同名文件
    const nameCount = {};
    data.results.forEach(r => { nameCount[r.filename] = (nameCount[r.filename] || 0) + 1; });
    const hasDuplicates = Object.values(nameCount).some(c => c > 1);

    const logLines = data.results.map(r => {
      if (r.status === 'success') {
        return hasDuplicates ? `[OK] ${r.filename} (${r.file_id})` : `[OK] ${r.filename}`;
      }
      return `[FAIL] ${r.filename}: ${r.error}`;
    });
    document.getElementById('batchLog').textContent = logLines.join('\n');

    if (data.output_folder) {
      document.getElementById('batchDownloadArea').style.display = '';

      // 填充下拉列表并存储结果
      const select = document.getElementById('batchFileSelect');
      select.innerHTML = '<option value="">-</option>';
      const resultMap = {};

      data.results.forEach(r => {
        if (r.status === 'success' && r.file_id) {
          const label = hasDuplicates ? `${r.filename} (${r.file_id})` : r.filename;
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
      data.results.forEach(r => {
        if (r.status === 'success' && r.file_id) {
          const btn = document.createElement('button');
          btn.className = 'btn-download';
          btn.textContent = hasDuplicates
            ? `⬇ ${r.filename} (${r.file_id})`
            : `⬇ ${r.filename}`;
          btn.onclick = () => {
            window.open(API_BASE + '/api/download/' + data.output_folder + '/' + r.file_id + '_single.zip', '_blank');
          };
          singleDiv.appendChild(btn);
        }
      });

      document.getElementById('batchDownloadBtn').onclick = () => {
        window.open(API_BASE + '/api/download/' + data.output_folder, '_blank');
      };

      // 用后端UUID更新上传列表中的同名文件
      if (hasDuplicates) {
        const items = document.getElementById('batchFileList').querySelectorAll('.file-item');
        data.results.forEach((r, i) => {
          if (r.status === 'success' && r.file_id && items[i]) {
            const nameSpan = items[i].querySelector('.file-name');
            nameSpan.innerHTML = `${r.filename} <span class="file-id">(${r.file_id})</span>`;
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