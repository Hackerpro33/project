"""Expose feature flags to the frontend."""
from __future__ import annotations

from typing import Dict

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.feature_flags import fetch_flags

router = APIRouter()


class FeatureFlagsResponse(BaseModel):
    flags: Dict[str, bool]


@router.get("", response_model=FeatureFlagsResponse)
async def list_feature_flags() -> FeatureFlagsResponse:
    flags = await fetch_flags()
    return FeatureFlagsResponse(flags=flags)
