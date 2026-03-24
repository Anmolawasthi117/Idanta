"""
Jobs polling route.
GET /api/v1/jobs/{job_id}/status — Poll background job status
GET /api/v1/jobs/                — List all jobs for current user
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user_id
from app.core.database import supabase
from app.models.job import JobStatus

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get(
    "/{job_id}/status",
    response_model=JobStatus,
    summary="Poll job status",
    tags=["Jobs"],
)
async def get_job_status(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Poll the status of a background job.
    
    Frontend should poll this endpoint every 2-3 seconds until `status` is `done` or `failed`.
    The `percent` field (0-100) and `current_step` (human-readable message) can be used
    to update a progress UI.
    """
    result = (
        supabase.table("jobs")
        .select("*")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    job = result.data
    return JobStatus(
        id=job["id"],
        job_type=job["job_type"],
        ref_id=job.get("ref_id"),
        status=job["status"],
        current_step=job.get("current_step"),
        percent=job.get("percent", 0),
        error=job.get("error"),
        updated_at=str(job.get("updated_at", "")),
    )


@router.get(
    "/",
    response_model=list[JobStatus],
    summary="List all jobs for current user",
    tags=["Jobs"],
)
async def list_jobs(
    user_id: str = Depends(get_current_user_id),
):
    """Return all jobs for the authenticated user, ordered by most recent first."""
    result = (
        supabase.table("jobs")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .limit(20)
        .execute()
    )
    return [
        JobStatus(
            id=j["id"],
            job_type=j["job_type"],
            ref_id=j.get("ref_id"),
            status=j["status"],
            current_step=j.get("current_step"),
            percent=j.get("percent", 0),
            error=j.get("error"),
            updated_at=str(j.get("updated_at", "")),
        )
        for j in result.data
    ]
