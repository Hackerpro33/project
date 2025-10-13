// Локальные интеграции: ходим на FastAPI backend (через Vite proxy /api)
import { buildApiUrl, jsonRequest } from './http';

// -------- core implementations --------
async function _UploadFile_impl({ file }) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(buildApiUrl('/api/upload'), { method: 'POST', body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { status, file_url, filename, quick_extraction }
}

async function _ExtractDataFromUploadedFile_impl({ file_url, json_schema }) {
  return jsonRequest('/api/extract', {
    method: 'POST',
    body: JSON.stringify({ file_url, json_schema })
  });
}

async function _SendEmail_impl({ to, subject, body, from_name }) {
  return jsonRequest('/api/utils/send-email', {
    method: 'POST',
    body: JSON.stringify({ to, subject, body, from_name }),
  });
}

// -------- named exports (все варианты, чтобы не падало нигде) --------
export async function UploadFile(args) { return _UploadFile_impl(args); }
export async function uploadFile(args) { return _UploadFile_impl(args); }

export async function ExtractDataFromUploadedFile(args) { return _ExtractDataFromUploadedFile_impl(args); }
export async function extractDataFromUploadedFile(args) { return _ExtractDataFromUploadedFile_impl(args); }

export async function SendEmail(args) { return _SendEmail_impl(args); }
export async function sendEmail(args) { return _SendEmail_impl(args); }

export async function startResumableUpload(payload) {
  return jsonRequest('/api/upload/resumable/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function uploadResumableChunk({ uploadId, chunkIndex, chunkChecksum, chunkSize, chunk }) {
  const form = new FormData()
  form.append('chunk_index', String(chunkIndex))
  if (chunkChecksum) {
    form.append('chunk_checksum', chunkChecksum)
  }
  if (chunkSize) {
    form.append('chunk_size', String(chunkSize))
  }
  form.append('chunk', chunk)

  const response = await fetch(buildApiUrl(`/api/upload/resumable/${uploadId}/chunk`), {
    method: 'PUT',
    body: form,
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json()
}

export async function finishResumableUpload(uploadId) {
  return jsonRequest(`/api/upload/resumable/${uploadId}/finish`, {
    method: 'POST',
  })
}

export async function importDatasetFromUrl(payload) {
  return jsonRequest('/api/upload/from-url', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// заглушки для совместимости со старыми импортами
export const GenerateImage = async () => { throw new Error('GenerateImage: not implemented locally'); }
