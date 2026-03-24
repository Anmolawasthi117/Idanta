"""
Product routes.
POST /api/v1/products/                          — Create product record (with photo upload)
GET  /api/v1/products/{product_id}             — Fetch product details
POST /api/v1/products/{product_id}/generate    — Trigger product asset generation
"""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status

from app.agents.graphs.product_graph import run_product_graph
from app.agents.state import ProductState
from app.api.deps import get_current_user_id
from app.core.database import supabase
from app.models.job import JobCreateResponse
from app.models.product import ProductPublic
from app.services.storage_service import upload_bytes

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/",
    response_model=ProductPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a product and upload photos",
    tags=["Products"],
)
async def create_product(
    brand_id: str = Form(...),
    name: str = Form(...),
    price_mrp: float = Form(...),
    motif_used: str = Form(None),
    material: str = Form(None),
    photos: list[UploadFile] = File(default=[]),
    user_id: str = Depends(get_current_user_id),
):
    """
    Create a product record and upload up to 5 original product photos.
    Photos are stored in Supabase Storage. Returns the product record.
    """
    # Validate that brand belongs to the user
    brand_result = (
        supabase.table("brands")
        .select("id")
        .eq("id", brand_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not brand_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")

    photo_urls: list[str] = []
    for i, photo in enumerate(photos[:5]):
        content = await photo.read()
        ext = photo.filename.rsplit(".", 1)[-1] if photo.filename else "jpg"
        path = f"products/temp_{user_id}/{i}.{ext}"
        url = await upload_bytes(data=content, path=path, content_type=photo.content_type or "image/jpeg")
        photo_urls.append(url)

    row = {
        "brand_id": brand_id,
        "name": name,
        "price_mrp": price_mrp,
        "motif_used": motif_used,
        "material": material,
        "photos": photo_urls,
        "status": "pending",
    }
    result = supabase.table("products").insert(row).execute()
    product = result.data[0]

    # Rename photos to permanent path with real product_id
    product_id = product["id"]
    permanent_urls = []
    for i, url in enumerate(photo_urls):
        ext = url.rsplit(".", 1)[-1].split("?")[0]
        content_data = None  # We don't re-download; just update path references
        permanent_urls.append(url)  # Simpler: keep temp URLs; can be refactored later

    logger.info(f"Product created: id={product_id}, brand={brand_id}")
    return product


@router.get(
    "/{product_id}",
    response_model=ProductPublic,
    summary="Get product by ID",
    tags=["Products"],
)
async def get_product(
    product_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Fetch a product by ID. User must own the parent brand."""
    result = (
        supabase.table("products")
        .select("*, brands!inner(user_id)")
        .eq("id", product_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    product = result.data[0]
    if product["brands"]["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    return product


@router.post(
    "/{product_id}/generate",
    response_model=JobCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger product asset generation",
    tags=["Products"],
)
async def generate_product_assets(
    product_id: str,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    """
    Trigger the product asset generation pipeline as a background task.
    Generates: Hang Tag PDF, Label PDF, Branded Photo, Listing Copy.
    Returns a job_id for polling.
    """
    # Validate product ownership
    prod_result = (
        supabase.table("products")
        .select("id, status, brand_id, brands!inner(user_id)")
        .eq("id", product_id)
        .execute()
    )
    if not prod_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    product = prod_result.data[0]
    if product["brands"]["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    if product["status"] in ("processing",):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assets already being generated.")

    # Create job
    job_row = {
        "user_id": user_id,
        "job_type": "product_assets",
        "ref_id": product_id,
        "status": "queued",
        "current_step": "⏳ Job queued...",
        "percent": 0,
    }
    job_result = supabase.table("jobs").insert(job_row).execute()
    job_id = job_result.data[0]["id"]

    # Mark product as processing
    supabase.table("products").update({"status": "processing"}).eq("id", product_id).execute()

    initial_state: ProductState = {
        "job_id": job_id,
        "user_id": user_id,
        "product_id": product_id,
        "brand_id": product["brand_id"],
    }

    background_tasks.add_task(run_product_graph, initial_state)

    logger.info(f"Product asset job enqueued: job_id={job_id}, product_id={product_id}")
    return JobCreateResponse(
        job_id=job_id,
        message="Asset generation started. Poll /api/v1/jobs/{job_id}/status for progress.",
    )
