// app.js - Qwen3-ASR Frontend Logic
const API_BASE = '';

// 页面刷新时清空浏览器可能恢复的表单内容
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('textarea').forEach(t => t.value = '');
  document.querySelectorAll('.srt-inner').forEach(el => el.innerHTML = '');
  document.querySelectorAll('.speaker-list-panel').forEach(p => p.style.display = 'none');
  ['singleExportBtn', 'batchExportBtn', 'alignExportBtn', 'wsExportBtn'].forEach(id => setExportEnabled(id, false));
  ['singleDownloadBtn', 'batchDownloadBtn', 'alignDownloadBtn', 'wsDownloadBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = true;
  });
  // Disable transcribe buttons initially
  const wsBtn = document.getElementById('wsBtn');
  if (wsBtn) wsBtn.disabled = true;
});

// ── Theme Color ──
let _themeColor = localStorage.getItem('themeColor') || '#0000FF';
const _onThemeChange = [];

function applyThemeColor(color) {
  _themeColor = color;
  localStorage.setItem('themeColor', color);
  const root = document.documentElement;
  root.style.setProperty('--primary', color);
  // Generate hover: lighten the color by 20%
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const hover = `rgb(${Math.min(255, r + 50)},${Math.min(255, g + 50)},${Math.min(255, b + 50)})`;
  root.style.setProperty('--primary-hover', hover);
  // Update speaker-0 style
  let styleEl = document.getElementById('theme-speaker-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'theme-speaker-style';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    .status-dot.online { background: ${color}; box-shadow: 0 0 6px ${color}; }
  `;
  // Update the theme color button
  const btn = document.getElementById('themeColorBtn');
  if (btn) btn.style.background = color;
  // Notify listeners
  _onThemeChange.forEach(fn => fn(color));
}

applyThemeColor(_themeColor);

// ── Tab Switching ──
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Nav shrink on scroll ──
const _tabs = document.querySelector('.tabs');
window.addEventListener('scroll', () => {
  if (_tabs) {
    _tabs.classList.toggle('compact', window.scrollY > 40);
  }
});

// ── Theme Color Picker ──
document.getElementById('themeColorBtn').addEventListener('click', async () => {
  const color = await showColorPickerDialog('主题颜色', _themeColor);
  if (color) {
    applyThemeColor(color);
  }
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

function showRenameDialog(title, defaultValue, existingNames) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box">
        <div class="dialog-title">${title}</div>
        <div class="dialog-body">请输入新名称</div>
        <input class="dialog-input" type="text" value="${defaultValue}" autofocus>
        <div class="dialog-error" id="renameError" style="display:none"></div>
        <div class="dialog-actions">
          <button class="dialog-btn" data-action="cancel">取消</button>
          <button class="dialog-btn primary" id="renameConfirm">确定</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const inputEl = overlay.querySelector('.dialog-input');
    const errorEl = overlay.querySelector('#renameError');
    const confirmBtn = overlay.querySelector('#renameConfirm');

    function tryConfirm() {
      const name = inputEl.value.trim();
      if (!name) {
        errorEl.textContent = '说话人名称不能为空';
        errorEl.style.display = 'block';
        inputEl.focus();
        return;
      }
      if (existingNames.has(name) && name !== defaultValue) {
        errorEl.textContent = `说话人 "${name}" 已存在`;
        errorEl.style.display = 'block';
        inputEl.focus();
        return;
      }
      resolve(name);
    }

    inputEl.focus();
    inputEl.select();
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') tryConfirm();
      if (e.key === 'Escape') resolve(null);
    });

    confirmBtn.addEventListener('click', tryConfirm);
    overlay.addEventListener('click', e => {
      if (e.target.dataset.action === 'cancel') resolve(null);
      if (e.target === overlay) resolve(null);
    });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') resolve(null);
    });
  }).finally(() => {
    const overlay = document.querySelector('.dialog-overlay');
    if (overlay) overlay.remove();
  });
}

function showNewSpeakerDialog() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box">
        <div class="dialog-title">新建说话人</div>
        <div class="dialog-body">请输入新说话人名称</div>
        <input class="dialog-input" type="text" placeholder="说话人名称" autofocus>
        <div class="dialog-error" id="newSpeakerError" style="display:none"></div>
        <div class="color-palette" id="newSpeakerPalette"></div>
        <div class="dialog-actions">
          <button class="dialog-btn" data-action="cancel">取消</button>
          <button class="dialog-btn primary" id="newSpeakerConfirm">确定</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const inputEl = overlay.querySelector('.dialog-input');
    const paletteEl = overlay.querySelector('#newSpeakerPalette');
    const errorEl = overlay.querySelector('#newSpeakerError');
    const confirmBtn = overlay.querySelector('#newSpeakerConfirm');
    let selectedColor = _themeColor;

    renderColorPalette(paletteEl, selectedColor, (color) => { selectedColor = color; });

    function tryConfirm() {
      const name = inputEl.value.trim();
      if (!name) {
        errorEl.textContent = '说话人名称不能为空';
        errorEl.style.display = 'block';
        inputEl.focus();
        return;
      }
      resolve({ name, color: selectedColor });
    }

    inputEl.focus();
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') tryConfirm();
      if (e.key === 'Escape') resolve(null);
    });

    confirmBtn.addEventListener('click', tryConfirm);
    overlay.addEventListener('click', e => {
      if (e.target.dataset.action === 'cancel') resolve(null);
      if (e.target === overlay) resolve(null);
    });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') resolve(null);
    });
  }).finally(() => {
    const overlay = document.querySelector('.dialog-overlay');
    if (overlay) overlay.remove();
  });
}

// ── Custom Color Palette ──
const PALETTE_COLORS = [
  '#0000FF', '#0055FF', '#2979FF', '#448AFF', '#82B1FF', '#B388FF',
  '#6366F1', '#7C4DFF', '#9C27B0', '#E040FB', '#CE93D8', '#BA68C8',
  '#FF4081', '#FF5252', '#EC4899', '#F06292', '#FF6E40', '#FF8A65',
  '#F59E0B', '#FF9800', '#FFC107', '#FFD54F', '#FF6D00', '#FFAB00',
  '#00C853', '#22C55E', '#4CAF50', '#8BC34A', '#69F0AE', '#B9F6CA',
  '#009688', '#14B8A6', '#26A69A', '#00BCD4', '#06B6D4', '#4DD0E1',
  '#607D8B', '#78909C', '#90A4AE', '#B0BEC5', '#546E7A', '#37474F',
];

function renderColorPalette(container, selectedColor, onSelect) {
  container.innerHTML = '';
  PALETTE_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = color;
    if (color === selectedColor) swatch.classList.add('selected');
    swatch.addEventListener('click', () => {
      container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      if (onSelect) onSelect(color);
    });
    container.appendChild(swatch);
  });
}

function showColorPickerDialog(title, currentColor) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-box dialog-palette-box">
        <div class="dialog-title">${title}</div>
        <div class="color-palette" id="colorPickerPalette"></div>
        <div class="dialog-actions">
          <button class="dialog-btn" data-action="cancel">取消</button>
          <button class="dialog-btn primary" data-action="confirm">确定</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const paletteEl = overlay.querySelector('#colorPickerPalette');
    let selectedColor = currentColor;

    renderColorPalette(paletteEl, selectedColor, (color) => { selectedColor = color; });

    overlay.addEventListener('click', e => {
      const action = e.target.dataset.action;
      if (action === 'confirm') resolve(selectedColor);
      if (action === 'cancel') resolve(null);
      if (e.target === overlay) resolve(null);
    });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') resolve(null);
    });
  }).finally(() => {
    const overlay = document.querySelector('.dialog-overlay');
    if (overlay) overlay.remove();
  });
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
  area.addEventListener('dragover', (e) => { e.preventDefault(); area.style.borderColor = _themeColor; });
  area.addEventListener('dragleave', () => { area.style.borderColor = ''; });
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.style.borderColor = '';
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
    if (!files.length) return;
    if (input.multiple) {
      const dt = new DataTransfer();
      for (const file of input.files) dt.items.add(file);
      for (const file of files) dt.items.add(file);
      input.files = dt.files;
    } else {
      const dt = new DataTransfer();
      dt.items.add(files[0]);
      input.files = dt.files;
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

  area.addEventListener('dragover', (e) => { e.preventDefault(); area.style.borderColor = _themeColor; });
  area.addEventListener('dragleave', () => { area.style.borderColor = ''; });

  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.style.borderColor = '';
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
    if (!files.length) return;
    const dt = new DataTransfer();
    for (const file of input.files) dt.items.add(file);
    for (const file of files) dt.items.add(file);
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

// ── Button enable/disable based on file selection ──
function setupFileButton(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!input || !btn) return;
  btn.disabled = !input.files.length;
  input.addEventListener('change', () => { btn.disabled = !input.files.length; });
}

setupFileButton('singleFile', 'singleBtn');
setupFileButton('batchFiles', 'batchBtn');
setupFileButton('alignFile', 'alignBtn');

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

// ── Custom Glass Select ──
class CustomSelect {
  constructor(nativeSelect, onChange) {
    this.native = nativeSelect;
    this.onChange = onChange;
    this.wrap = document.createElement('div');
    this.wrap.className = 'custom-select-wrap';
    nativeSelect.parentNode.insertBefore(this.wrap, nativeSelect);
    this.wrap.appendChild(nativeSelect);
    nativeSelect.style.display = 'none';

    this.trigger = document.createElement('button');
    this.trigger.className = 'custom-select-trigger';
    this.trigger.type = 'button';
    this.wrap.appendChild(this.trigger);

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'custom-select-dropdown';
    this.wrap.appendChild(this.dropdown);

    this._buildOptions();
    this._syncTrigger();
    // Handle initial value (e.g. browser-restored form state)
    if (this.onChange) this.onChange(this.native.value);

    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    this._onClickOutside = (e) => {
      if (!this.wrap.contains(e.target)) this.close();
    };
  }

  _buildOptions() {
    this.dropdown.innerHTML = '';
    Array.from(this.native.options).forEach(opt => {
      const div = document.createElement('div');
      div.className = 'custom-select-option';
      div.textContent = opt.text;
      div.addEventListener('click', () => {
        this.native.value = opt.value;
        this._syncTrigger();
        this.close();
        this.native.dispatchEvent(new Event('change', { bubbles: true }));
        if (this.onChange) this.onChange(opt.value);
      });
      this.dropdown.appendChild(div);
    });
  }

  _syncTrigger() {
    const sel = this.native.options[this.native.selectedIndex];
    this.trigger.textContent = sel ? sel.text : '';
    this.dropdown.querySelectorAll('.custom-select-option').forEach(d => d.classList.remove('selected'));
    const idx = this.native.selectedIndex;
    if (idx >= 0) this.dropdown.children[idx]?.classList.add('selected');
  }

  toggle() {
    if (this.dropdown.classList.contains('open')) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    closeAllCustomSelects();
    this.dropdown.classList.add('open');
    document.addEventListener('click', this._onClickOutside);
  }

  close() {
    this.dropdown.classList.remove('open');
    document.removeEventListener('click', this._onClickOutside);
  }

  rebuildOptions() {
    this._buildOptions();
    this._syncTrigger();
  }
}

const _customSelects = [];
function closeAllCustomSelects() {
  _customSelects.forEach(cs => cs.close());
}
document.addEventListener('click', closeAllCustomSelects);

function initCustomSelects() {
  // Language selects
  ['singleLang', 'batchLang', 'alignLang', 'wsLang'].forEach(id => {
    const el = document.getElementById(id);
    if (el) _customSelects.push(new CustomSelect(el));
  });
  // Punc selects
  ['singlePunc', 'batchPunc', 'wsPunc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      _customSelects.push(new CustomSelect(el, (val) => {
        const customId = id.replace('Punc', 'PuncCustom');
        const customEl = document.getElementById(customId);
        if (customEl) customEl.style.display = val === '__custom__' ? '' : 'none';
      }));
    }
  });
  // Batch file select
  const batchFileSelect = document.getElementById('batchFileSelect');
  if (batchFileSelect) {
    window._batchFileCustomSelect = new CustomSelect(batchFileSelect);
    _customSelects.push(window._batchFileCustomSelect);
  }
}

// Init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCustomSelects);
} else {
  initCustomSelects();
}

// ── Speaker Manager Factory ──
function createSpeakerManager() {
  const sm = {
    segments: [],
    speakers: new Map(), // displayName -> { originalName, count, colorIndex }
    _colorIdx: 0,
    _colorMap: new Map(), // originalName -> colorIndex
    _customColors: new Map(), // displayName -> hex color

    reset() {
      this.segments = [];
      this.speakers = new Map();
      this._colorIdx = 0;
      this._colorMap = new Map();
      this._customColors = new Map();
    },

    setColor(name, color) {
      this._customColors.set(name, color);
    },

    getColor(name) {
      return this._customColors.get(name) || null;
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

    getNames() { return Array.from(this.speakers.keys()); },

    buildSrt() {
      const lines = [];
      this.segments.forEach((seg, i) => {
        lines.push(String(i + 1));
        lines.push(`${seg.startTime} --> ${seg.endTime}`);
        let text = seg.text;
        if (seg.speakerDisplay) text = `[角色 ${seg.speakerDisplay}] ${text}`;
        lines.push(text);
        lines.push('');
      });
      return lines.join('\n').trim() + '\n';
    }
  };
  return sm;
}

// ── Per-tab SpeakerManager instances ──
const singleSpeakerMgr = createSpeakerManager();
const alignSpeakerMgr = createSpeakerManager();
const wsSpeakerMgr = createSpeakerManager();
let currentBatchSpeakerMgr = createSpeakerManager(); // batch: current file's instance

// ── Speaker UI Rendering ──
function renderSpeakerList(panelId, sm) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.querySelectorAll('.speaker-item').forEach(el => el.remove());
  if (sm.speakers.size === 0) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = '';
  sm.speakers.forEach((info, name) => {
    const customColor = sm.getColor(name);
    const el = document.createElement('span');
    el.className = `speaker-item${customColor ? '' : ' speaker-' + (info.colorIndex % 8)}`;
    if (customColor) el.style.background = customColor;
    if (info.count === 0) el.classList.add('can-delete');
    el.innerHTML = `${info.displayName}<span class="speaker-count">${info.count}</span>${info.count === 0 ? '<span class="speaker-del">×</span>' : ''}`;
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (e.target.classList.contains('speaker-del')) {
        const ok = await showConfirm('删除说话人', `确定删除说话人 "${name}"？`, true);
        if (!ok) return;
        sm.deleteSpeaker(name);
        renderSpeakerList(panelId, sm);
        const srtMap = { singleSpeakerList: 'singleSrt', batchSpeakerList: 'batchSrt', alignSpeakerList: 'alignSrt', wsSpeakerList: 'wsSrt' };
        const srtId = srtMap[panelId] || panelId.replace('SpeakerList', 'Srt');
        renderSrts(srtId, sm, _srtOptions.get(srtId) || {});
        return;
      }
      // Toggle: close if already open for this item
      if (_dropdownAnchor === el) { closeDropdown(); return; }
      const srtMap = { singleSpeakerList: 'singleSrt', batchSpeakerList: 'batchSrt', alignSpeakerList: 'alignSrt', wsSpeakerList: 'wsSrt' };
      const srtId = srtMap[panelId] || panelId.replace('SpeakerList', 'Srt');
      const currentColor = customColor || '#0000FF';
      showSpeakerDropdown(el, [
        { label: '重命名', action: async () => {
          const newName = await showRenameDialog('重命名说话人', name, sm.speakers);
          if (newName && newName !== name) {
            sm.renameGlobal(name, newName);
            renderSpeakerList(panelId, sm);
            renderSrts(srtId, sm, _srtOptions.get(srtId) || {});
          }
        }},
        { label: '颜色', action: async () => {
          const color = await showColorPickerDialog('选择颜色', currentColor);
          if (color) {
            sm.setColor(name, color);
            renderSpeakerList(panelId, sm);
            renderSrts(srtId, sm, _srtOptions.get(srtId) || {});
          }
        }},
        ...(info.count === 0 ? [{ label: '删除', action: async () => {
          const ok = await showConfirm('删除说话人', `确定删除说话人 "${name}"？`, true);
          if (!ok) return;
          sm.deleteSpeaker(name);
          renderSpeakerList(panelId, sm);
          renderSrts(srtId, sm, _srtOptions.get(srtId) || {});
        }}] : [])
      ]);
    });
    panel.appendChild(el);
  });
}

function renderSrts(containerId, sm, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const { clickable = false, videoEl = null, onActiveChange = null } = options;
  // Store options for re-renders triggered by speaker list modifications
  _srtOptions.set(containerId, options);
  // Render into .srt-inner if it exists, otherwise use container directly
  const inner = container.querySelector('.srt-inner') || container;
  inner.innerHTML = '';

  let activeEl = null;
  sm.segments.forEach(seg => {
    const div = document.createElement('div');
    div.className = 'srt-segment';
    div.dataset.start = seg.startSec;
    div.dataset.end = seg.endSec;

    let html = `<div class="seg-header">`;
    if (seg.speakerDisplay) {
      const info = sm.speakers.get(seg.speakerDisplay);
      const customColor = sm.getColor(seg.speakerDisplay);
      const ci = info ? info.colorIndex % 8 : 0;
      if (customColor) {
        html += `<span class="speaker-badge" style="background:${customColor}" data-seg="${seg.index}">${seg.speakerDisplay}<span class="badge-edit">▼</span></span>`;
      } else {
        html += `<span class="speaker-badge speaker-${ci}" data-seg="${seg.index}">${seg.speakerDisplay}<span class="badge-edit">▼</span></span>`;
      }
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
        const names = sm.getNames();
        const items = names.map(name => {
          const info = sm.speakers.get(name);
          const customColor = sm.getColor(name);
          const ci = info ? info.colorIndex % 8 : 0;
          if (customColor) {
            return {
              html: `<span class="speaker-badge" style="background:${customColor};cursor:pointer;font-size:11px">${name}</span>`,
              action: () => {
                sm.renameSegment(seg.index, name);
                renderSpeakerList(listId, sm);
                renderSrts(containerId, sm, options);
              }
            };
          }
          return {
            html: `<span class="speaker-badge speaker-${ci}" style="cursor:pointer;font-size:11px">${name}</span>`,
            action: () => {
              sm.renameSegment(seg.index, name);
              renderSpeakerList(listId, sm);
              renderSrts(containerId, sm, options);
            }
          };
        });
        items.push({ divider: true });
        items.push({ label: '+ 新建说话人', action: async () => {
          const result = await showNewSpeakerDialog();
          if (result) {
            sm.renameSegment(seg.index, result.name);
            if (result.color) sm.setColor(result.name, result.color);
            renderSpeakerList(listId, sm);
            renderSrts(containerId, sm, options);
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
const _srtOptions = new Map();
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
    if (item.colorPicker) {
      const row = document.createElement('div');
      row.className = 'dropdown-item dropdown-color-row';
      row.innerHTML = `<span>颜色</span><input type="color" value="${item.value}" class="dropdown-color-picker">`;
      const input = row.querySelector('input');
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('input', (e) => {
        e.stopPropagation();
        if (item.onChange) item.onChange(e.target.value);
      });
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        closeDropdown();
        if (item.onChange) item.onChange(e.target.value);
      });
      dd.appendChild(row);
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

// ── Export SRT ──
function exportSrt(sm) {
  if (!sm.segments.length) return;
  const srt = sm.buildSrt();
  const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'exported.srt';
  a.click();
  URL.revokeObjectURL(url);
}

function setExportEnabled(btnId, enabled) {
  const btn = document.getElementById(btnId);
  if (btn) btn.disabled = !enabled;
}

// Export button click handlers
document.getElementById('singleExportBtn')?.addEventListener('click', () => exportSrt(singleSpeakerMgr));
document.getElementById('batchExportBtn')?.addEventListener('click', () => exportSrt(currentBatchSpeakerMgr));
document.getElementById('alignExportBtn')?.addEventListener('click', () => exportSrt(alignSpeakerMgr));
document.getElementById('wsExportBtn')?.addEventListener('click', () => exportSrt(wsSpeakerMgr));

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
  document.getElementById('singleDownloadBtn').disabled = true;
  setExportEnabled('singleExportBtn', false);

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
        singleSpeakerMgr.parse(srt);
        renderSpeakerList('singleSpeakerList', singleSpeakerMgr);
        renderSrts('singleSrt', singleSpeakerMgr);
        setExportEnabled('singleExportBtn', true);
      });
      if (data.output_folder) {
        // 从 output_folder 提取 UUID（如 a1b2c3d4_single → a1b2c3d4）
        const fileId = data.output_folder.split('_')[0];
        const origName = fileInput.files[0].name;
        document.getElementById('singleFileName').innerHTML =
          `${origName} <span class="file-id">(${fileId})</span>`;
        const btn = document.getElementById('singleDownloadBtn');
        btn.disabled = false;
        btn.onclick = () => {
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
  document.getElementById('batchDownloadBtn').disabled = true;
  setExportEnabled('batchExportBtn', false);
  currentBatchSpeakerMgr = createSpeakerManager();
  if (window._batchFileCustomSelect) window._batchFileCustomSelect.rebuildOptions();

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
      document.getElementById('batchDownloadBtn').disabled = false;

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
      if (window._batchFileCustomSelect) window._batchFileCustomSelect.rebuildOptions();

      // 下拉切换预览
      const batchOutFolder = data.output_folder;
      select.onchange = () => {
        const r = resultMap[select.value];
        if (r) {
          document.getElementById('batchText').value = r.full_text || '';
          fetchSrtContent(batchOutFolder, `${r.file_id}_single/全角色.srt`).then(srt => {
            currentBatchSpeakerMgr = createSpeakerManager();
            currentBatchSpeakerMgr.parse(srt);
            renderSpeakerList('batchSpeakerList', currentBatchSpeakerMgr);
            renderSrts('batchSrt', currentBatchSpeakerMgr);
            setExportEnabled('batchExportBtn', true);
          });
        } else {
          document.getElementById('batchText').value = '';
          document.querySelector('#batchSrt .srt-inner').innerHTML = '';
          document.getElementById('batchSpeakerList').style.display = 'none';
          currentBatchSpeakerMgr = createSpeakerManager();
          setExportEnabled('batchExportBtn', false);
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
  document.getElementById('alignDownloadBtn').disabled = true;
  setExportEnabled('alignExportBtn', false);

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
        alignSpeakerMgr.parse(srt);
        renderSpeakerList('alignSpeakerList', alignSpeakerMgr);
        renderSrts('alignSrt', alignSpeakerMgr);
        setExportEnabled('alignExportBtn', true);
      });
      if (data.output_folder) {
        const fileId = data.output_folder.split('_')[0];
        const origName = fileInput.files[0].name;
        document.getElementById('alignFileName').innerHTML =
          `${origName} <span class="file-id">(${fileId})</span>`;
        const btn = document.getElementById('alignDownloadBtn');
        btn.disabled = false;
        btn.onclick = () => {
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
    wsCtx.strokeStyle = '#555';
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
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
    if (!files.length) return;
    const dt = new DataTransfer();
    dt.items.add(files[0]);
    wsInput.files = dt.files;
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
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.srt'));
    if (!files.length) return;
    const dt = new DataTransfer();
    dt.items.add(files[0]);
    wsSrtFile.files = dt.files;
    handleWsSrtFile();
  });
  wsSrtFile.addEventListener('change', handleWsSrtFile);

  function handleWsSrtFile() {
    if (!wsSrtFile.files.length) return;
    const file = wsSrtFile.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      wsSpeakerMgr.parse(reader.result);
      renderSpeakerList('wsSpeakerList', wsSpeakerMgr);
      renderSrts('wsSrt', wsSpeakerMgr, { clickable: true, videoEl: wsVideo, onActiveChange: (el) => { wsActiveSeg = el; } });
      showWsSrtSegments();
      setExportEnabled('wsExportBtn', true);
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
    const wsBtn = document.getElementById('wsBtn');
    if (wsBtn) wsBtn.disabled = false;
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
    drawWaveform(0);
  }

  let _wsProgress = null;

  function drawWaveform(progress) {
    const w = wsCanvas.width, h = wsCanvas.height, mid = h / 2;
    wsCtx.clearRect(0, 0, w, h);
    for (let i = 0; i < wsPeaks.length; i++) {
      const barH = wsPeaks[i] * mid * 0.9;
      if (progress != null && i / wsPeaks.length > progress) {
        wsCtx.fillStyle = '#555';
      } else {
        wsCtx.fillStyle = _themeColor;
      }
      wsCtx.fillRect(i, mid - barH, 1, barH * 2);
    }
  }

  _onThemeChange.push(() => drawWaveform(_wsProgress));

  // Video timeupdate → waveform progress & active segment
  wsVideo.addEventListener('timeupdate', () => {
    if (!wsVideo.duration) return;
    const pct = wsVideo.currentTime / wsVideo.duration;
    _wsProgress = pct;
    wsProgress.style.width = (pct * 100) + '%';
    drawWaveform(pct);

    // Highlight active segment
    const segs = document.querySelectorAll('#wsSrt .srt-segment');
    let current = null;
    wsSpeakerMgr.segments.forEach((seg, i) => {
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
    document.getElementById('wsDownloadBtn').disabled = true;
    setExportEnabled('wsExportBtn', false);
    wsSpeakerMgr.reset();

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
          wsSpeakerMgr.parse(srt);
          renderSpeakerList('wsSpeakerList', wsSpeakerMgr);
          renderSrts('wsSrt', wsSpeakerMgr, { clickable: true, videoEl: wsVideo, onActiveChange: (el) => { wsActiveSeg = el; } });
          showWsSrtSegments();
          setExportEnabled('wsExportBtn', true);
        });
        if (data.output_folder && wsFileId) {
          const wsDlBtn = document.getElementById('wsDownloadBtn');
          wsDlBtn.disabled = false;
          wsDlBtn.onclick = () => {
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