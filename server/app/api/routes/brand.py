"""
Brand routes.
POST /api/v1/brands/             — Trigger brand onboarding (creates job + runs graph)
GET  /api/v1/brands/{brand_id}  — Fetch brand details
GET  /api/v1/crafts/            — List all available craft types
"""

import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.agents.graphs.brand_graph import run_brand_graph
from app.agents.state import BrandState
from app.api.deps import get_current_user_id
from app.core.database import supabase
from app.models.brand import BrandCreateRequest, BrandPublic, CraftInfo
from app.models.job import JobCreateResponse

logger = logging.getLogger(__name__)
router = APIRouter()

LIBRARY_DIR = Path("data/craft_library")


def _list_crafts() -> list[CraftInfo]:
    """Read all craft JSON files and return summary info."""
    crafts = []
    for fp in LIBRARY_DIR.glob("*.json"):
        try:
            with open(fp, encoding="utf-8") as f:
                data = json.load(f)
            crafts.append(CraftInfo(
                craft_id=data["craft_id"],
                display_name=data.get("display_name", data["craft_id"]),
                region=data.get("region", "India"),
                description=data.get("description", ""),
            ))
        except Exception as e:
            logger.warning(f"Failed to parse craft file {fp.name}: {e}")
    return crafts


@router.get(
    "/crafts",
    response_model=list[CraftInfo],
    summary="List all supported craft types",
    tags=["Crafts"],
)
async def get_crafts():
    """Return all craft types available in the Idanta library."""
    return _list_crafts()


@router.post(
    "/",
    response_model=JobCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start brand onboarding",
    tags=["Brands"],
)
async def create_brand(
    payload: BrandCreateRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    """
    Trigger the brand onboarding LangGraph pipeline as a background task.
    Returns a job_id for polling the /jobs/{id}/status endpoint.
    """
    # Check user doesn't already have a pending job
    pending = (
        supabase.table("jobs")
        .select("id")
        .eq("user_id", user_id)
        .eq("job_type", "brand_onboarding")
        .in_("status", ["queued", "running"])
        .execute()
    )
    if pending.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A brand creation job is already in progress for this account.",
        )

    # Create job record
    job_row = {
        "user_id": user_id,
        "job_type": "brand_onboarding",
        "status": "queued",
        "current_step": "⏳ Job queued...",
        "percent": 0,
    }
    job_result = supabase.table("jobs").insert(job_row).execute()
    job_id = job_result.data[0]["id"]

    # Build initial graph state
    initial_state: BrandState = {
        "job_id": job_id,
        "user_id": user_id,
        "craft_id": payload.craft_id,
        "artisan_name": payload.artisan_name,
        "years_of_experience": payload.years_of_experience,
        "region": payload.region,
        "inspiration": payload.inspiration,
        "preferred_language": payload.preferred_language,
    }

    # Kick off graph in background
    background_tasks.add_task(run_brand_graph, initial_state)

    logger.info(f"Brand onboarding job enqueued: job_id={job_id}, user_id={user_id}")
    return JobCreateResponse(
        job_id=job_id,
        message="Brand creation started. Poll /api/v1/jobs/{job_id}/status for progress.",
    )


@router.get(
    "/{brand_id}",
    response_model=BrandPublic,
    summary="Get brand by ID",
    tags=["Brands"],
)
async def get_brand(
    brand_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Fetch a brand by its ID. Must belong to the authenticated user."""
    result = (
        supabase.table("brands")
        .select("*")
        .eq("id", brand_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")
    return result.data
