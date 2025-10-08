// Локальные интеграции: ходим на FastAPI backend (через Vite proxy /api)
const API_BASE = import.meta.env.VITE_API_BASE || '';

// -------- core implementations --------
async function _UploadFile_impl({ file }) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { status, file_url, filename, quick_extraction }
}

async function _ExtractDataFromUploadedFile_impl({ file_url, json_schema }) {
  const res = await fetch(`${API_BASE}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_url, json_schema })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { status:"success", output:{columns,row_count,sample_data} }
}

async function _InvokeLLM_impl({ prompt, response_json_schema, summary, userQuestion }) {
  const res = await fetch(`${API_BASE}/api/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, response_json_schema, summary, userQuestion })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // {response: "..."} или JSON по schema
}

async function _SendEmail_impl({ to, subject, body, from_name }) {
  const res = await fetch(`${API_BASE}/api/utils/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, body, from_name }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// -------- named exports (все варианты, чтобы не падало нигде) --------
export async function UploadFile(args) { return _UploadFile_impl(args); }
export async function uploadFile(args) { return _UploadFile_impl(args); }

export async function ExtractDataFromUploadedFile(args) { return _ExtractDataFromUploadedFile_impl(args); }
export async function extractDataFromUploadedFile(args) { return _ExtractDataFromUploadedFile_impl(args); }

export async function InvokeLLM(args) { return _InvokeLLM_impl(args); }
export async function invokeLLM(args) { return _InvokeLLM_impl(args); }

export async function SendEmail(args) { return _SendEmail_impl(args); }
export async function sendEmail(args) { return _SendEmail_impl(args); }

// заглушки для совместимости со старыми импортами
export const GenerateImage = async () => { throw new Error('GenerateImage: not implemented locally'); }
