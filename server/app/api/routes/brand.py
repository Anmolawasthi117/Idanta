"""
Brand routes.
POST /api/v1/brands/             - Trigger brand onboarding
GET  /api/v1/brands/{brand_id}  - Fetch brand details
GET  /api/v1/brands/crafts      - List all available craft types
"""

import json
import logging
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
    crafts: list[CraftInfo] = []
    for file_path in LIBRARY_DIR.glob("*.json"):
        try:
            with open(file_path, encoding="utf-8") as file:
                data = json.load(file)
            crafts.append(
                CraftInfo(
                    craft_id=data["craft_id"],
                    display_name=data.get("display_name", data["craft_id"]),
                    region=data.get("region", "India"),
                    description=data.get("description", ""),
                )
            )
        except Exception as exc:
            logger.warning("Failed to parse craft file %s: %s", file_path.name, exc)
    return crafts


@router.get(
    "/crafts",
    response_model=list[CraftInfo],
    summary="List all supported craft types",
    tags=["Crafts"],
)
async def get_crafts():
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

    job_result = (
        supabase.table("jobs")
        .insert(
            {
                "user_id": user_id,
                "job_type": "brand_onboarding",
                "status": "queued",
                "current_step": "Job queued...",
                "percent": 0,
            }
        )
        .execute()
    )
    job_id = job_result.data[0]["id"]

    initial_state: BrandState = {
        "job_id": job_id,
        "user_id": user_id,
        "craft_id": payload.craft_id,
        "artisan_name": payload.artisan_name,
        "region": payload.region,
        "years_of_experience": payload.years_of_experience,
        "generations_in_craft": payload.generations_in_craft,
        "primary_occasion": payload.primary_occasion.value,
        "target_customer": payload.target_customer.value,
        "brand_feel": payload.brand_feel.value,
        "script_preference": payload.script_preference.value,
        "artisan_story": payload.artisan_story,
        "preferred_language": payload.preferred_language,
    }

    background_tasks.add_task(run_brand_graph, initial_state)

    logger.info("Brand onboarding job enqueued: job_id=%s, user_id=%s", job_id, user_id)
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


@router.post(
    "/{brand_id}/generate",
    response_model=JobCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Regenerate brand assets for an existing brand",
    tags=["Brands"],
)
async def regenerate_brand(
    brand_id: str,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
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

    pending = (
        supabase.table("jobs")
        .select("id")
        .eq("user_id", user_id)
        .eq("job_type", "brand_onboarding")
        .eq("ref_id", brand_id)
        .in_("status", ["queued", "running"])
        .execute()
    )
    if pending.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Brand assets are already being generated.",
        )

    brand = result.data
    job_result = (
        supabase.table("jobs")
        .insert(
            {
                "user_id": user_id,
                "job_type": "brand_onboarding",
                "ref_id": brand_id,
                "status": "queued",
                "current_step": "Job queued...",
                "percent": 0,
            }
        )
        .execute()
    )
    job_id = job_result.data[0]["id"]

    initial_state: BrandState = {
        "job_id": job_id,
        "brand_id": brand_id,
        "user_id": user_id,
        "craft_id": brand["craft_id"],
        "artisan_name": brand.get("artisan_name") or "",
        "region": brand.get("region") or "",
        "years_of_experience": brand.get("years_of_experience", 0),
        "generations_in_craft": brand.get("generations_in_craft", 1),
        "primary_occasion": brand.get("primary_occasion", "general"),
        "target_customer": brand.get("target_customer", "local_bazaar"),
        "brand_feel": brand.get("brand_feel", "earthy"),
        "script_preference": brand.get("script_preference", "both"),
        "artisan_story": brand.get("artisan_story"),
        "preferred_language": brand.get("preferred_language", "hi"),
    }

    background_tasks.add_task(run_brand_graph, initial_state)

    logger.info("Brand regeneration job enqueued: job_id=%s, brand_id=%s", job_id, brand_id)
    return JobCreateResponse(
        job_id=job_id,
        message="Brand regeneration started. Poll /api/v1/jobs/{job_id}/status for progress.",
    )
