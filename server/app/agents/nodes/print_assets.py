"""
Product asset generation node powered entirely by Gemini image generation.
"""

import logging

from app.agents.state import ProductState
from app.core.database import supabase
from app.services.asset_prompt_service import build_product_asset_prompt, build_product_visual_dna
from app.services.gemini_image_service import generate_image
from app.services.storage_service import upload_bytes

logger = logging.getLogger(__name__)


async def _upload_image(image_bytes: bytes, product_id: str, filename: str, content_type: str) -> str:
    return await upload_bytes(
        data=image_bytes,
        path=f"products/{product_id}/{filename}",
        content_type=content_type,
    )


async def print_assets_node(state: ProductState) -> ProductState:
    """Generate product asset images and a branded product photo with Gemini."""
    job_id = state["job_id"]
    product_id = state["product_id"]
    category = state.get("product_category", "other")

    supabase.table("jobs").update(
        {
            "current_step": "Building your product visual direction...",
            "percent": 60,
        }
    ).eq("id", job_id).execute()

    visual_dna = await build_product_visual_dna(state)

    supabase.table("jobs").update(
        {
            "current_step": "Designing your product assets...",
            "percent": 70,
        }
    ).eq("id", job_id).execute()

    print_asset_paths: dict[str, str] = {}
    for asset_type, filename in {
        "hang_tag": "hang_tag.png",
        "label": "label.png",
        "story_card": "story_card.png",
    }.items():
        image_bytes, mime_type = await generate_image(
            build_product_asset_prompt(state, visual_dna, asset_type),
            width_hint=1024,
            height_hint=1536,
        )
        print_asset_paths[asset_type] = await _upload_image(image_bytes, product_id, filename, mime_type)

    if category == "painting" and (state.get("category_data", {}) or {}).get("is_original", True):
        certificate_bytes, certificate_mime = await generate_image(
            build_product_asset_prompt(state, visual_dna, "certificate"),
            width_hint=1400,
            height_hint=1800,
        )
        print_asset_paths["certificate"] = await _upload_image(
            certificate_bytes,
            product_id,
            "certificate.png",
            certificate_mime,
        )

    required_assets = ("hang_tag", "label", "story_card")
    missing_assets = [asset for asset in required_assets if asset not in print_asset_paths]
    if missing_assets:
        raise RuntimeError("Core image assets could not be generated: " + ", ".join(missing_assets))

    supabase.table("jobs").update(
        {
            "current_step": "Generating your branded product visual...",
            "percent": 85,
        }
    ).eq("id", job_id).execute()

    branded_photo_url = ""
    photos = state.get("photos", [])
    if photos:
        branded_photo_bytes, branded_photo_mime = await generate_image(
            build_product_asset_prompt(state, visual_dna, "branded_photo"),
            width_hint=1400,
            height_hint=1400,
            reference_urls=[photos[0]],
        )
        branded_photo_url = await upload_bytes(
            data=branded_photo_bytes,
            path=f"products/{product_id}/branded_photo.png",
            content_type=branded_photo_mime,
        )

    logger.info("Gemini product assets complete for job=%s, product=%s", job_id, product_id)
    return {
        **state,
        "print_asset_paths": print_asset_paths,
        "hang_tag_url": print_asset_paths.get("hang_tag", ""),
        "label_url": print_asset_paths.get("label", ""),
        "branded_photo_url": branded_photo_url,
    }
