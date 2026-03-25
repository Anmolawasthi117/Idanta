"""
Product asset generation node powered entirely by Gemini image generation.
"""

import logging
from datetime import datetime, timezone

from app.agents.state import ProductState
from app.core.database import supabase
from app.services.gemini_image_service import generate_image
from app.services.storage_service import upload_bytes

logger = logging.getLogger(__name__)


def _format_category_data(category_data: dict) -> str:
    return "; ".join(f"{key}: {value}" for key, value in category_data.items() if value not in (None, "", [], {})) or "No additional structured data"


def _brand_summary(state: ProductState) -> str:
    brand_context = state.get("brand_context", {})
    return (
        f"Brand {state.get('brand_name', 'Brand')} from {state.get('region', brand_context.get('region', 'India'))}; "
        f"tagline: {state.get('tagline', '')}; "
        f"craft: {brand_context.get('craft_name', state.get('craft_id', '').replace('_', ' '))}; "
        f"brand feel: {brand_context.get('brand_feel', 'earthy')}; "
        f"buyer: {brand_context.get('target_customer', 'local_bazaar')}."
    )


def _build_asset_prompt(state: ProductState, asset_type: str) -> str:
    brand_context = state.get("brand_context", {})
    category_data = state.get("category_data", {})
    palette = state.get("palette", {"primary": "#8B2635", "secondary": "#4A7C59", "accent": "#C4963B"})
    product_name = state.get("product_name", "Product")
    category = state.get("product_category", "other")
    listing_copy = state.get("listing_copy", "")
    care_instructions = state.get("care_instructions", "")
    product_facts = (
        f"Product name: {product_name}. "
        f"Category: {category}. Occasion: {state.get('occasion', 'general')}. "
        f"Price: Rs. {int(float(state.get('price_mrp', 0) or 0))}. "
        f"Material: {state.get('material') or 'not specified'}. "
        f"Motif: {state.get('motif_used') or 'traditional craft-inspired'}. "
        f"Time to make: {state.get('time_to_make_hrs', 0)} hours. "
        f"Category details: {_format_category_data(category_data)}. "
        f"Listing copy: {listing_copy}. Care: {care_instructions}."
    )

    shared = (
        "Create a realistic, visually premium commercial design asset that looks like a professional Canva designer made it. "
        "The design must feel unique, polished, elegant, balanced, and ecommerce-ready. "
        "No watermark, no gibberish text, no spelling mistakes, no extra brand names, no fake UI chrome. "
        f"Brand context: {_brand_summary(state)} "
        f"Palette direction: primary {palette.get('primary')}, secondary {palette.get('secondary')}, accent {palette.get('accent')}. "
        f"Product facts: {product_facts} "
    )

    prompts = {
        "hang_tag": (
            shared
            + "Generate a premium luxury hang tag front design for this specific product. "
            + "Use a vertical composition, rich craft-inspired ornamentation, realistic material cues, elegant typography treatment, pricing hierarchy, and premium boutique-brand styling."
        ),
        "label": (
            shared
            + "Generate a beautiful product label design for packaging. "
            + "Use a clean but premium retail label aesthetic with strong hierarchy, craft-inspired motifs, and realistic packaging design composition."
        ),
        "story_card": (
            shared
            + "Generate a premium brand story card or product story card design. "
            + "It should feel editorial, heritage-rich, and emotionally resonant, like a museum boutique card or luxury handcrafted insert."
        ),
        "certificate": (
            shared
            + f"Include artisan name {brand_context.get('artisan_name', 'Artisan')} and generated date {datetime.now(timezone.utc).date().isoformat()}. "
            + "Generate a premium certificate of authenticity design for an original handmade artwork. "
            + "It should feel official, elegant, collectible, and gallery-worthy."
        ),
        "branded_photo": (
            shared
            + "Use the provided product photo as the base image. "
            + "Transform it into a premium ecommerce hero shot with realistic lighting, refined styling, subtle branding, artisan-luxury mood, and clean marketplace-ready composition while preserving the core product identity."
        ),
    }
    return prompts[asset_type]


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
            "current_step": "Designing your product assets...",
            "percent": 60,
        }
    ).eq("id", job_id).execute()

    print_asset_paths: dict[str, str] = {}
    for asset_type, filename in {
        "hang_tag": "hang_tag.png",
        "label": "label.png",
        "story_card": "story_card.png",
    }.items():
        image_bytes, mime_type = await generate_image(
            _build_asset_prompt(state, asset_type),
            width_hint=1024,
            height_hint=1536,
        )
        print_asset_paths[asset_type] = await _upload_image(image_bytes, product_id, filename, mime_type)

    if category == "painting" and (state.get("category_data", {}) or {}).get("is_original", True):
        certificate_bytes, certificate_mime = await generate_image(
            _build_asset_prompt(state, "certificate"),
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
            "percent": 70,
        }
    ).eq("id", job_id).execute()

    branded_photo_url = ""
    photos = state.get("photos", [])
    if photos:
        branded_photo_bytes, branded_photo_mime = await generate_image(
            _build_asset_prompt(state, "branded_photo"),
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
