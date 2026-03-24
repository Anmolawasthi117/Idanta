"""Pydantic schemas for Job entity (background task polling)."""

from typing import Optional
from pydantic import BaseModel


class JobStatus(BaseModel):
    id: str
    job_type: str
    ref_id: Optional[str]
    status: str          # queued | running | done | failed
    current_step: Optional[str]  # Human-readable status like "Designing Logo..."
    percent: int
    error: Optional[str]
    updated_at: str

    class Config:
        from_attributes = True


class JobCreateResponse(BaseModel):
    job_id: str
    message: str
