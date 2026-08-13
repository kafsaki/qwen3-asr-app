// server.js - Express Frontend for Qwen3-ASR
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

const upload = multer({ dest: path.join(__dirname, 'uploads') });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Proxy API calls to backend
app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path), req.file.originalname);
    form.append('language', req.body.language || '自动识别');
    form.append('diarize', req.body.diarize || 'true');
    form.append('max_chars', req.body.max_chars || '20');
    form.append('split_by_punc', req.body.split_by_punc || 'true');
    form.append('hotwords', req.body.hotwords || '');

    const response = await fetch(`${BACKEND_URL}/api/transcribe`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });
    const data = await response.json();
    fs.unlinkSync(req.file.path);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transcribe/batch', upload.array('files'), async (req, res) => {
  try {
    const form = new FormData();
    for (const file of req.files) {
      form.append('files', fs.createReadStream(file.path), file.originalname);
    }
    form.append('language', req.body.language || '自动识别');
    form.append('diarize', req.body.diarize || 'true');
    form.append('max_chars', req.body.max_chars || '20');
    form.append('split_by_punc', req.body.split_by_punc || 'true');
    form.append('hotwords', req.body.hotwords || '');

    const response = await fetch(`${BACKEND_URL}/api/transcribe/batch`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });
    const data = await response.json();
    for (const file of req.files) {
      fs.unlinkSync(file.path);
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/align', upload.single('file'), async (req, res) => {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path), req.file.originalname);
    form.append('reference_text', req.body.reference_text || '');
    form.append('language', req.body.language || 'Chinese');

    const response = await fetch(`${BACKEND_URL}/api/align`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });
    const data = await response.json();
    fs.unlinkSync(req.file.path);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/download/:folder', async (req, res) => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/download/${req.params.folder}`);
    if (!response.ok) throw new Error('Download failed');
    const buffer = await response.buffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.folder}.zip"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Frontend server running at http://127.0.0.1:${PORT}`);
  console.log(`Backend API: ${BACKEND_URL}`);
});