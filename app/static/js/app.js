// app.js - Qwen3-ASR Frontend Logic
const API_BASE = '';

// 页面刷新时清空浏览器可能恢复的表单内容
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('textarea').forEach(t => t.value = '');
  document.querySelectorAll('.srt-inner').forEach(el => el.innerHTML = '');
  document.querySelectorAll('.speaker-list-panel').forEach(p => p.style.display = 'none');
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

// ── Custom Dialog (replaces browser prompt/confirm) ──
function showDialog(title, body, options = {}) {
  const { input = false, defaultValue = '', confirmText = '确定', cancelText = '取消', danger = false } = options;
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box">
        <div class="dialog-title">${title}</div>
        <div class="dialog-body">${body}</div>
        ${input ? `<input class="dialog-input" type="text" value="${defaultValue}" autofocus>` : ''}
        <div class="dialog-actions">
          <button class="dialog-btn" data-action="cancel">${cancelText}</button>
          <button class="dialog-btn ${danger ? 'danger' : 'primary'}" data-action="confirm">${confirmText}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const inputEl = overlay.querySelector('.dialog-input');
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
      inputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') resolve(input ? inputEl.value.trim() : true);
        if (e.key === 'Escape') resolve(input ? null : false);
      });
    }

    overlay.addEventListener('click', e => {
      const action = e.target.dataset.action;
      if (action === 'confirm') resolve(input ? inputEl.value.trim() : true);
      if (action === 'cancel') resolve(input ? null : false);
      if (e.target === overlay) resolve(input ? null : false);
    });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') resolve(input ? null : false);
    });
  }).finally(() => {
    const overlay = document.querySelector('.dialog-overlay');
    if (overlay) overlay.remove();
  });
}

function showConfirm(title, body, danger = false) {
  return showDialog(title, body, { confirmText: '确定', cancelText: '取消', danger });
}

function showPrompt(title, body, defaultValue = '') {
  return showDialog(title, body, { input: true, defaultValue, confirmText: '确定', cancelText: '取消' });
}
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
async function fetchSrtContent(folder, filename) {
  const resp = await fetch(`${API_BASE}/api/download/srt/${folder}/${filename}`);
  if (!resp.ok) return '';
  return await resp.text();
}

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

// ── SRT Time Parser ──
function parseSrtTime(ts) {
  const m = ts.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 1000;
}

// ── Speaker Manager ──
const SpeakerManager = {
  segments: [],
  speakers: new Map(), // displayName -> { originalName, count, colorIndex }
  _colorIdx: 0,
  _colorMap: new Map(), // originalName -> colorIndex

  reset() {
    this.segments = [];
    this.speakers = new Map();
    this._colorIdx = 0;
    this._colorMap = new Map();
  },

  parse(srt) {
    this.reset();
    const blocks = srt.split(/\n\s*\n/);
    blocks.forEach(block => {
      const lines = block.trim().split('\n');
      if (lines.length < 2) return;
      const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
      if (!timeMatch) return;

      const rawText = lines.slice(2).join('\n').trim();
      const speakerMatch = rawText.match(/\[角色\s+([^\]]+)\]\s*/);
      let speaker = null, text = rawText;
      if (speakerMatch) {
        speaker = speakerMatch[1];
        text = rawText.slice(speakerMatch[0].length);
      }

      const seg = {
        index: this.segments.length,
        startTime: timeMatch[1], endTime: timeMatch[2],
        startSec: parseSrtTime(timeMatch[1]), endSec: parseSrtTime(timeMatch[2]),
        speaker, speakerDisplay: speaker,
        text, rawText
      };
      this.segments.push(seg);

      if (speaker) {
        if (!this.speakers.has(speaker)) {
          if (!this._colorMap.has(speaker)) this._colorMap.set(speaker, this._colorIdx++);
          this.speakers.set(speaker, { originalName: speaker, displayName: speaker, count: 0, colorIndex: this._colorMap.get(speaker) });
        }
        this.speakers.get(speaker).count++;
      }
    });
    return this.segments;
  },

  renameGlobal(oldName, newName) {
    if (!this.speakers.has(oldName) || oldName === newName) return;
    const info = this.speakers.get(oldName);
    if (this.speakers.has(newName)) {
      this.speakers.get(newName).count += info.count;
      this.speakers.delete(oldName);
    } else {
      info.displayName = newName;
      this.speakers.set(newName, info);
      this.speakers.delete(oldName);
    }
    this.segments.forEach(seg => {
      if (seg.speakerDisplay === oldName) seg.speakerDisplay = newName;
    });
  },

  renameSegment(segIdx, newName) {
    const seg = this.segments[segIdx];
    if (!seg) return;
    const oldName = seg.speakerDisplay;
    if (oldName) {
      const info = this.speakers.get(oldName);
      if (info) info.count--;
    }
    if (newName) {
      seg.speaker = newName; seg.speakerDisplay = newName;
      if (!this.speakers.has(newName)) {
        this.speakers.set(newName, { originalName: newName, displayName: newName, count: 0, colorIndex: this._colorIdx++ });
      }
      this.speakers.get(newName).count++;
    } else {
      seg.speaker = null; seg.speakerDisplay = null;
    }
  },

  deleteSpeaker(name) {
    const info = this.speakers.get(name);
    if (!info || info.count > 0) return false;
    this.speakers.delete(name);
    return true;
  },

  getNames() { return Array.from(this.speakers.keys()); }
};

// ── Speaker UI Rendering ──
function renderSpeakerList(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.querySelectorAll('.speaker-item').forEach(el => el.remove());
  if (SpeakerManager.speakers.size === 0) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = '';
  SpeakerManager.speakers.forEach((info, name) => {
    const el = document.createElement('span');
    el.className = `speaker-item speaker-${info.colorIndex % 8}`;
    if (info.count === 0) el.classList.add('can-delete');
    el.innerHTML = `${info.displayName}<span class="speaker-count">${info.count}</span>${info.count === 0 ? '<span class="speaker-del">×</span>' : ''}`;
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (e.target.classList.contains('speaker-del')) {
        const ok = await showConfirm('删除说话人', `确定删除说话人 "${name}"？`, true);
        if (!ok) return;
        SpeakerManager.deleteSpeaker(name);
        renderSpeakerList(panelId);
        const srtMap = { singleSpeakerList: 'singleSrt', batchSpeakerList: 'batchSrt', alignSpeakerList: 'alignSrt', wsSpeakerList: 'wsSrt' };
        renderSrts(srtMap[panelId] || panelId.replace('SpeakerList', 'Srt'));
        return;
      }
      // Toggle: close if already open for this item
      if (_dropdownAnchor === el) { closeDropdown(); return; }
      const srtMap = { singleSpeakerList: 'singleSrt', batchSpeakerList: 'batchSrt', alignSpeakerList: 'alignSrt', wsSpeakerList: 'wsSrt' };
      const srtId = srtMap[panelId] || panelId.replace('SpeakerList', 'Srt');
      showSpeakerDropdown(el, [
        { label: '重命名', action: async () => {
          const newName = await showPrompt('重命名说话人', '请输入新名称', name);
          if (newName && newName !== name) {
            SpeakerManager.renameGlobal(name, newName);
            renderSpeakerList(panelId);
            renderSrts(srtId);
          }
        }},
        ...(info.count === 0 ? [{ label: '删除', action: async () => {
          const ok = await showConfirm('删除说话人', `确定删除说话人 "${name}"？`, true);
          if (!ok) return;
          SpeakerManager.deleteSpeaker(name);
          renderSpeakerList(panelId);
          renderSrts(srtId);
        }}] : [])
      ]);
    });
    panel.appendChild(el);
  });
}

function renderSrts(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const { clickable = false, videoEl = null, onActiveChange = null } = options;
  // Render into .srt-inner if it exists, otherwise use container directly
  const inner = container.querySelector('.srt-inner') || container;
  inner.innerHTML = '';

  let activeEl = null;
  SpeakerManager.segments.forEach(seg => {
    const div = document.createElement('div');
    div.className = 'srt-segment';
    div.dataset.start = seg.startSec;
    div.dataset.end = seg.endSec;

    let html = `<div class="seg-header">`;
    if (seg.speakerDisplay) {
      const info = SpeakerManager.speakers.get(seg.speakerDisplay);
      const ci = info ? info.colorIndex % 8 : 0;
      html += `<span class="speaker-badge speaker-${ci}" data-seg="${seg.index}">${seg.speakerDisplay}<span class="badge-edit">▼</span></span>`;
    }
    html += `<span class="seg-time">${seg.startTime} → ${seg.endTime}</span></div>`;
    html += `<div class="seg-text">${seg.text}</div>`;
    div.innerHTML = html;

    if (clickable && videoEl) {
      div.addEventListener('click', (e) => {
        if (e.target.closest('.speaker-badge')) return;
        if (videoEl.duration) {
          videoEl.currentTime = seg.startSec;
          if (onActiveChange) onActiveChange(div);
          if (activeEl) activeEl.classList.remove('active');
          div.classList.add('active');
          activeEl = div;
        }
      });
    }

    // Speaker badge click -> dropdown
    const badge = div.querySelector('.speaker-badge');
    if (badge) {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        // Toggle: close if already open for this badge
        if (_dropdownAnchor === badge) { closeDropdown(); return; }
        const listMap = { singleSrt: 'singleSpeakerList', batchSrt: 'batchSpeakerList', alignSrt: 'alignSpeakerList', wsSrt: 'wsSpeakerList' };
        const listId = listMap[containerId] || containerId.replace('Srt', 'SpeakerList');
        const names = SpeakerManager.getNames();
        const items = names.map(name => {
          const info = SpeakerManager.speakers.get(name);
          const ci = info ? info.colorIndex % 8 : 0;
          return {
            html: `<span class="speaker-badge speaker-${ci}" style="cursor:pointer;font-size:11px">${name}</span>`,
            action: () => {
              SpeakerManager.renameSegment(seg.index, name);
              renderSpeakerList(listId);
              renderSrts(containerId, options);
            }
          };
        });
        items.push({ divider: true });
        items.push({ label: '+ 新建说话人', action: async () => {
          const newName = await showPrompt('新建说话人', '请输入新说话人名称');
          if (newName) {
            SpeakerManager.renameSegment(seg.index, newName);
            renderSpeakerList(listId);
            renderSrts(containerId, options);
          }
        }});
        showSpeakerDropdown(badge, items);
      });
    }

    inner.appendChild(div);
  });
}

// ── Dropdown Menu ──
let _dropdownEl = null;
let _dropdownAnchor = null;
let _scrollParents = [];
let _rafId = null;

function repositionDropdown() {
  if (!_dropdownEl || !_dropdownAnchor) return;
  if (_rafId) return;
  _rafId = requestAnimationFrame(() => {
    _rafId = null;
    if (!_dropdownEl || !_dropdownAnchor) return;
    const rect = _dropdownAnchor.getBoundingClientRect();
    const ddHeight = _dropdownEl.offsetHeight;
    let top = rect.bottom + 4, left = rect.left;
    if (top + ddHeight > window.innerHeight) top = rect.top - ddHeight - 4;
    if (left + _dropdownEl.offsetWidth > window.innerWidth) left = window.innerWidth - _dropdownEl.offsetWidth - 8;
    _dropdownEl.style.top = top + 'px';
    _dropdownEl.style.left = left + 'px';
  });
}

function closeDropdown() {
  if (_dropdownEl) { _dropdownEl.remove(); _dropdownEl = null; }
  _dropdownAnchor = null;
  _scrollParents.forEach(el => el.removeEventListener('scroll', repositionDropdown));
  _scrollParents = [];
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
}
document.addEventListener('click', closeDropdown);

function showSpeakerDropdown(anchor, items) {
  closeDropdown();
  const dd = document.createElement('div');
  dd.className = 'speaker-dropdown';
  items.forEach(item => {
    if (item.divider) {
      const div = document.createElement('div');
      div.className = 'dropdown-divider';
      dd.appendChild(div);
      return;
    }
    const row = document.createElement('div');
    row.className = 'dropdown-item';
    if (item.html) {
      row.innerHTML = item.html;
    } else {
      row.textContent = item.label;
    }
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDropdown();
      if (item.action) item.action();
    });
    dd.appendChild(row);
  });
  document.body.appendChild(dd);

  // Find all scrollable ancestors and listen for scroll to reposition dropdown
  let el = anchor.parentElement;
  while (el) {
    const style = getComputedStyle(el);
    const overflow = style.overflow + style.overflowY + style.overflowX;
    if (/(auto|scroll)/.test(overflow)) {
      el.addEventListener('scroll', repositionDropdown);
      _scrollParents.push(el);
    }
    el = el.parentElement;
  }
  window.addEventListener('scroll', repositionDropdown);

  _dropdownEl = dd;
  _dropdownAnchor = anchor;
  repositionDropdown();
}

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
  document.querySelector('#singleSrt .srt-inner').innerHTML = '';
  document.getElementById('singleSpeakerList').style.display = 'none';
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
      fetchSrtContent(data.output_folder, '全角色.srt').then(srt => {
        SpeakerManager.parse(srt);
        renderSpeakerList('singleSpeakerList');
        renderSrts('singleSrt');
      });
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
  document.querySelector('#batchSrt .srt-inner').innerHTML = '';
  document.getElementById('batchSpeakerList').style.display = 'none';
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
      const batchOutFolder = data.output_folder;
      select.onchange = () => {
        const r = resultMap[select.value];
        if (r) {
          document.getElementById('batchText').value = r.full_text || '';
          fetchSrtContent(batchOutFolder, `${r.file_id}_single/全角色.srt`).then(srt => {
            SpeakerManager.parse(srt);
            renderSpeakerList('batchSpeakerList');
            renderSrts('batchSrt');
          });
        } else {
          document.getElementById('batchText').value = '';
          document.querySelector('#batchSrt .srt-inner').innerHTML = '';
          document.getElementById('batchSpeakerList').style.display = 'none';
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
  document.querySelector('#alignSrt .srt-inner').innerHTML = '';
  document.getElementById('alignSpeakerList').style.display = 'none';
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
      fetchSrtContent(data.output_folder, 'align_result.srt').then(srt => {
        SpeakerManager.parse(srt);
        renderSpeakerList('alignSpeakerList');
        renderSrts('alignSrt');
      });
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

  // SRT file upload in sidebar
  const wsSrtUpload = document.getElementById('wsSrtUpload');
  const wsSrtFile = document.getElementById('wsSrtFile');
  const wsSrtContainer = document.getElementById('wsSrt');

  wsSrtUpload.addEventListener('click', () => wsSrtFile.click());
  wsSrtUpload.addEventListener('dragover', (e) => { e.preventDefault(); wsSrtUpload.classList.add('drag-over'); });
  wsSrtUpload.addEventListener('dragleave', () => { wsSrtUpload.classList.remove('drag-over'); });
  wsSrtUpload.addEventListener('drop', (e) => {
    e.preventDefault();
    wsSrtUpload.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
      wsSrtFile.files = e.dataTransfer.files;
      handleWsSrtFile();
    }
  });
  wsSrtFile.addEventListener('change', handleWsSrtFile);

  function handleWsSrtFile() {
    if (!wsSrtFile.files.length) return;
    const file = wsSrtFile.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      SpeakerManager.parse(reader.result);
      renderSpeakerList('wsSpeakerList');
      renderSrts('wsSrt', { clickable: true, videoEl: wsVideo, onActiveChange: (el) => { wsActiveSeg = el; } });
      showWsSrtSegments();
    };
    reader.readAsText(file);
  }

  function showWsSrtSegments() {
    wsSrtUpload.style.display = 'none';
    wsSrtContainer.style.display = '';
  }
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
    SpeakerManager.segments.forEach((seg, i) => {
      if (wsVideo.currentTime >= seg.startSec && wsVideo.currentTime < seg.endSec) {
        current = segs[i];
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
    document.querySelector('#wsSrt .srt-inner').innerHTML = '';
    document.getElementById('wsSpeakerList').style.display = 'none';
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
        fetchSrtContent(data.output_folder, '全角色.srt').then(srt => {
          SpeakerManager.parse(srt);
          renderSpeakerList('wsSpeakerList');
          renderSrts('wsSrt', { clickable: true, videoEl: wsVideo, onActiveChange: (el) => { wsActiveSeg = el; } });
          showWsSrtSegments();
        });
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

  // ── SRT Segments (active tracking) ──
  let wsActiveSeg = null;
})();