"""
Product routes.
POST /api/v1/products/                        - Create product record with photos
GET  /api/v1/products/{product_id}           - Fetch product details
POST /api/v1/products/{product_id}/generate  - Trigger product asset generation
"""

import json
import logging
from json import JSONDecodeError

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status

from app.agents.graphs.product_graph import run_product_graph
from app.agents.state import ProductState
from app.api.deps import get_current_user_id
from app.core.database import supabase
from app.models.job import JobCreateResponse
from app.models.product import ProductCategory, ProductOccasion, ProductPublic, validate_category_data
from app.services.storage_service import upload_bytes

logger = logging.getLogger(__name__)
router = APIRouter()


def _parse_category(category: str) -> ProductCategory:
    try:
        return ProductCategory(category)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid category.") from exc


def _parse_occasion(occasion: str) -> ProductOccasion:
    try:
        return ProductOccasion(occasion)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid occasion.") from exc


def _parse_category_data(category: ProductCategory, category_data: str) -> dict:
    try:
        raw_data = json.loads(category_data)
    except JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="category_data must be valid JSON.",
        ) from exc

    if not isinstance(raw_data, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="category_data must decode to a JSON object.",
        )

    try:
        validated = validate_category_data(category, raw_data)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid category_data: {exc}",
        ) from exc

    return validated.model_dump()


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
    category: str = Form(...),
    category_data: str = Form(...),
    occasion: str = Form(default=ProductOccasion.general.value),
    motif_used: str | None = Form(default=None),
    material: str | None = Form(default=None),
    description_voice: str | None = Form(default=None),
    time_to_make_hrs: int = Form(default=0),
    photos: list[UploadFile] = File(default=[]),
    user_id: str = Depends(get_current_user_id),
):
    if price_mrp <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="price_mrp must be greater than 0.")

    if time_to_make_hrs < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="time_to_make_hrs must be 0 or greater.",
        )

    brand_result = (
        supabase.table("brands")
        .select("id")
        .eq("id", brand_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not brand_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")

    parsed_category = _parse_category(category)
    parsed_occasion = _parse_occasion(occasion)
    validated_category_data = _parse_category_data(parsed_category, category_data)

    photo_urls: list[str] = []
    for index, photo in enumerate(photos[:5]):
        content = await photo.read()
        ext = photo.filename.rsplit(".", 1)[-1] if photo.filename and "." in photo.filename else "jpg"
        storage_path = f"products/temp_{user_id}/{index}.{ext}"
        url = await upload_bytes(
            data=content,
            path=storage_path,
            content_type=photo.content_type or "image/jpeg",
        )
        photo_urls.append(url)

    result = (
        supabase.table("products")
        .insert(
            {
                "brand_id": brand_id,
                "name": name,
                "price_mrp": price_mrp,
                "category": parsed_category.value,
                "occasion": parsed_occasion.value,
                "motif_used": motif_used,
                "material": material,
                "description_voice": description_voice,
                "time_to_make_hrs": time_to_make_hrs,
                "category_data": validated_category_data,
                "photos": photo_urls,
                "status": "pending",
            }
        )
        .execute()
    )
    product = result.data[0]

    logger.info("Product created: id=%s, brand=%s", product["id"], brand_id)
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
    prod_result = (
        supabase.table("products")
        .select("id, status, brand_id, category, category_data, brands!inner(user_id)")
        .eq("id", product_id)
        .execute()
    )
    if not prod_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    product = prod_result.data[0]
    if product["brands"]["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    if product["status"] == "processing":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assets already being generated.")

    job_result = (
        supabase.table("jobs")
        .insert(
            {
                "user_id": user_id,
                "job_type": "product_assets",
                "ref_id": product_id,
                "status": "queued",
                "current_step": "Job queued...",
                "percent": 0,
            }
        )
        .execute()
    )
    job_id = job_result.data[0]["id"]

    supabase.table("products").update({"status": "processing"}).eq("id", product_id).execute()

    initial_state: ProductState = {
        "job_id": job_id,
        "user_id": user_id,
        "product_id": product_id,
        "brand_id": product["brand_id"],
        "product_category": product.get("category", ProductCategory.apparel.value),
        "category_data": product.get("category_data") or {},
        "form_data": {},
        "photo_paths": [],
        "brand_context": {},
    }

    background_tasks.add_task(run_product_graph, initial_state)

    logger.info("Product asset job enqueued: job_id=%s, product_id=%s", job_id, product_id)
    return JobCreateResponse(
        job_id=job_id,
        message="Asset generation started. Poll /api/v1/jobs/{job_id}/status for progress.",
    )
