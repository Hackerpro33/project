from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import pandas as pd
import numpy as np
import httpx, os, io, json, uuid, re
from typing import Optional, Dict, Any, List

app = FastAPI(title="Insight Sphere Backend", version="0.1.0")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach a strict set of security-oriented HTTP headers."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "same-origin",
            "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        }
        for header, value in headers.items():
            response.headers.setdefault(header, value)
        return response

# --- CORS ---
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
ADDITIONAL_ORIGINS: List[str] = [
    origin.strip()
    for origin in os.getenv("ADDITIONAL_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
allow_origins = {FRONTEND_ORIGIN, "http://127.0.0.1:5173", "http://127.0.0.1:5174"}
allow_origins.update(ADDITIONAL_ORIGINS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allow_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

allowed_hosts_env = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1")
allowed_hosts = [host.strip() for host in allowed_hosts_env.split(",") if host.strip()]
allowed_hosts.append("127.0.0.1")
allowed_hosts.append("localhost")
app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(dict.fromkeys(allowed_hosts)))
app.add_middleware(SecurityHeadersMiddleware)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "uploads"))
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
EMAIL_LOG_PATH = os.path.join(DATA_DIR, "email_log.jsonl")

MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))
MAX_UPLOAD_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024

def _safe_name(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", name)

@app.get("/health")
def health():
    return {"status": "ok"}

def read_table_bytes(file_bytes: bytes, filename: str) -> pd.DataFrame:
    ext = os.path.splitext(filename)[1].lower()
    if ext in [".xlsx", ".xls"]:
        return pd.read_excel(io.BytesIO(file_bytes))
    elif ext in [".csv", ".tsv"]:
        sep = "\t" if ext == ".tsv" else None
        read_kwargs = {"sep": sep}
        if sep is None:
            # Let pandas automatically detect delimiters without emitting
            # a fallback warning by explicitly selecting the python engine.
            read_kwargs["engine"] = "python"
        return pd.read_csv(io.BytesIO(file_bytes), **read_kwargs)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

def detect_general_type(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_numeric_dtype(series):
        return "number"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    return "string"

def build_extraction(df: pd.DataFrame, sample_rows: int = 100) -> Dict[str, Any]:
    cols = [{"name": str(c), "type": detect_general_type(df[c])} for c in df.columns]
    sample = df.head(sample_rows).replace({np.nan: ""}).astype(object)
    sample = sample.to_dict(orient="records")
    return {
        "columns": cols,
        "row_count": int(len(df)),
        "sample_data": sample
    }


def _extract_json_snippet(text: str) -> Optional[str]:
    """Attempt to pull a JSON object or array out of an arbitrary string."""

    stripped = text.strip()
    if not stripped:
        return None

    # Try direct load first – maybe the model returned pristine JSON.
    try:
        json.loads(stripped)
        return stripped
    except json.JSONDecodeError:
        pass

    candidates: List[tuple[int, str]] = []
    for token in ("{", "["):
        pos = stripped.find(token)
        if pos != -1:
            candidates.append((pos, token))
    if not candidates:
        return None

    start, opening = min(candidates, key=lambda x: x[0])
    closing = "}" if opening == "{" else "]"

    depth = 0
    in_string = False
    escape = False
    for index, char in enumerate(stripped[start:], start=start):
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == opening:
            depth += 1
        elif char == closing:
            depth -= 1
            if depth == 0:
                snippet = stripped[start:index + 1]
                try:
                    json.loads(snippet)
                    return snippet
                except json.JSONDecodeError:
                    return None
    return None

# simple in-memory registry file_id -> path
FILE_REGISTRY: Dict[str, str] = {}

@app.post("/api/upload")
async def api_upload(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max allowed size is {MAX_UPLOAD_SIZE_MB} MB",
        )
    # save
    fid = str(uuid.uuid4())
    safe = _safe_name(file.filename or "file")
    path = os.path.join(UPLOAD_DIR, f"{fid}_{safe}")
    with open(path, "wb") as f:
        f.write(data)
    FILE_REGISTRY[fid] = path
    # quick extraction for preview (optional)
    try:
        df = read_table_bytes(data, file.filename)
        extraction = build_extraction(df)
    except Exception:
        extraction = None
    return {"status": "success", "file_url": fid, "filename": file.filename, "quick_extraction": extraction}

class ExtractRequest(BaseModel):
    file_url: str
    json_schema: Optional[dict] = None

@app.post("/api/extract")
def api_extract(req: ExtractRequest):
    fid = req.file_url
    path = FILE_REGISTRY.get(fid)
    if not path or not os.path.exists(path):
        # try direct path if file_url was actually a path
        path = os.path.join(UPLOAD_DIR, _safe_name(fid))
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="File not found")

    with open(path, "rb") as f:
        file_bytes = f.read()
    try:
        df = read_table_bytes(file_bytes, os.path.basename(path))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    output = build_extraction(df)
    return {"status": "success", "output": output}

# --- Local LLM via Ollama ---
class LLMReq(BaseModel):
    prompt: Optional[str] = None
    summary: Optional[dict] = None
    userQuestion: Optional[str] = None
    response_json_schema: Optional[dict] = None

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")

@app.post("/api/llm")
async def api_llm(req: LLMReq):
    if not (req.prompt or req.summary or req.userQuestion):
        raise HTTPException(status_code=400, detail="No prompt/summary provided")

    system = "Ты локальный аналитик таблиц. Отвечай кратко и по делу. Если просят JSON — верни ТОЛЬКО валидный JSON без пояснений."
    prompt_parts = [f"SYSTEM:\n{system}\n"]
    if req.summary:
        prompt_parts.append("ДАННЫЕ:\n" + json.dumps(req.summary, ensure_ascii=False, indent=2))
    if req.prompt:
        prompt_parts.append("ПРОМПТ:\n" + req.prompt)
    if req.userQuestion:
        prompt_parts.append("ВОПРОС:\n" + req.userQuestion)

    # Если передана схема — просим вернуть строго JSON
    if req.response_json_schema:
        prompt_parts.append("\nТребование: Ответь строго в формате JSON, соответствующем этой схеме (без комментариев и лишнего текста):\n")
        prompt_parts.append(json.dumps(req.response_json_schema, ensure_ascii=False))

    full_prompt = "\n\n".join(prompt_parts)

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": full_prompt,
                    "stream": False,
                },
            )
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPError as exc:  # pragma: no cover - network dependent
        raise HTTPException(status_code=502, detail=f"LLM backend unavailable: {exc}") from exc

    text = data.get("response", "")
    if req.response_json_schema:
        snippet = _extract_json_snippet(text)
        if snippet is not None:
            try:
                return json.loads(snippet)
            except json.JSONDecodeError:
                pass
    return {"response": text}

class EmailRequest(BaseModel):
    to: str
    subject: str
    body: str
    from_name: Optional[str] = None


@app.post("/api/utils/send-email")
async def api_send_email(payload: EmailRequest):
    record = {
        "to": payload.to,
        "subject": payload.subject,
        "body": payload.body,
        "from_name": payload.from_name,
    }
    try:
        with open(EMAIL_LOG_PATH, "a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to log email: {exc}")
    return {"status": "queued", "logged": True}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)



from .datasets_api import router as datasets_router
from .visualizations_api import router as visualizations_router

app.include_router(datasets_router, prefix="/api/dataset")
app.include_router(visualizations_router, prefix="/api/visualization")
