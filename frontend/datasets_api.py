from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import os, json, uuid, time

router = APIRouter()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)
DATASETS_JSON = os.path.join(DATA_DIR, "datasets.json")

def _load_all() -> List[Dict[str, Any]]:
    if not os.path.exists(DATASETS_JSON):
        return []
    with open(DATASETS_JSON, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception:
            return []

def _save_all(items: List[Dict[str, Any]]):
    with open(DATASETS_JSON, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

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
    # сортируем по created_at убыв.
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
