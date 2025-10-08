from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from pathlib import Path
import json, uuid, time, os, tempfile, shutil

router = APIRouter()

APP_DIR = Path(__file__).resolve().parent
# Кандидаты: backend/data (предпочтительно) и backend/app/data (fallback)
CANDIDATE_DIRS = [APP_DIR.parent / "data", APP_DIR / "data"]

def _ensure_store_dir() -> Path:
    for d in CANDIDATE_DIRS:
        try:
            d.mkdir(parents=True, exist_ok=True)
            return d
        except Exception:
            continue
    # последний шанс — папка рядом с файлом
    APP_DIR.mkdir(parents=True, exist_ok=True)
    return APP_DIR

STORE_DIR = _ensure_store_dir()
DATASETS_JSON = STORE_DIR / "datasets.json"

def _atomic_write_json(path: Path, data: Any):
    tmp = Path(tempfile.mkstemp(prefix="datasets_", suffix=".json", dir=str(path.parent))[1])
    try:
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        shutil.move(str(tmp), str(path))
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)

def _load_all() -> List[Dict[str, Any]]:
    # читаем из первого существующего locations
    for d in CANDIDATE_DIRS:
        p = d / "datasets.json"
        if p.exists():
            try:
                with p.open("r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return []
    return []

def _save_all(items: List[Dict[str, Any]]):
    _atomic_write_json(DATASETS_JSON, items)

class ColumnInfo(BaseModel):
    name: str
    type: str = "string"
    selected: Optional[bool] = True

class DatasetCreate(BaseModel):
    name: str = Field(..., description="Название набора")
    description: Optional[str] = ""
    tags: List[str] = []
    columns: List[ColumnInfo] = []
    file_url: Optional[str] = None
    row_count: Optional[int] = None
    sample_data: Optional[List[Dict[str, Any]]] = None

@router.get("/list")
def list_datasets():
    items = _load_all()
    items.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    return items

@router.post("/create")
def create_dataset(payload: DatasetCreate):
    items = _load_all()
    ds = payload.dict()
    ds["id"] = str(uuid.uuid4())
    ds["created_at"] = int(time.time())
    items.append(ds)
    _save_all(items)
    return {"status": "created", "id": ds["id"], "dataset": ds}

@router.get("/debug/paths")
def debug_paths():
    return {
        "APP_DIR": str(APP_DIR),
        "STORE_DIR": str(STORE_DIR),
        "DATASETS_JSON": str(DATASETS_JSON),
        "exists": DATASETS_JSON.exists(),
        "size": DATASETS_JSON.stat().st_size if DATASETS_JSON.exists() else 0,
    }
