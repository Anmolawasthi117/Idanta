"""
Print Assets Node - Part of product_graph.py.
"""

import io
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from PIL import Image, ImageDraw

from app.agents.state import ProductState
from app.core.database import supabase
from app.services.pdf_service import render_pdf
from app.services.storage_service import upload_bytes

logger = logging.getLogger(__name__)

HANG_TAG_TEMPLATES = {
    "apparel": "hang_tag_apparel.html",
    "jewelry": "hang_tag_jewelry.html",
    "pottery": "hang_tag_pottery.html",
    "painting": "hang_tag_painting.html",
    "home_decor": "hang_tag_home_decor.html",
    "other": "hang_tag_apparel.html",
}

LABEL_TEMPLATES = {
    "apparel": "label_apparel.html",
    "jewelry": "label_jewelry.html",
    "pottery": "label_pottery.html",
    "painting": "label_painting.html",
    "home_decor": "label_home_decor.html",
    "other": "label_apparel.html",
}

try:
    import cairosvg

    CAIROSVG_AVAILABLE = True
except Exception as exc:
    CAIROSVG_AVAILABLE = False
    logger.warning("cairosvg could not be loaded: %s. Image overlay will use a fallback seal.", exc)


async def _fetch_url(url: str) -> Optional[bytes]:
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(url)
            if response.status_code == 200:
                return response.content
    except Exception as exc:
        logger.warning("Failed to fetch %s: %s", url, exc)
    return None


async def _resolve_logo_svg(logo_value: str) -> str:
    if logo_value and "<svg" in logo_value:
        return logo_value

    if logo_value:
        logo_bytes = await _fetch_url(logo_value)
        if logo_bytes:
            text = logo_bytes.decode("utf-8", errors="ignore")
            if "<svg" in text:
                return text[text.find("<svg") :]

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">'
        '<rect width="200" height="200" fill="#8B2635"/>'
        '<circle cx="100" cy="100" r="46" fill="#C4963B"/>'
        "</svg>"
    )


def _svg_to_png(svg_string: str, size: int = 80) -> Optional[bytes]:
    if not CAIROSVG_AVAILABLE:
        return None
    try:
        return cairosvg.svg2png(
            bytestring=svg_string.encode("utf-8"),
            output_width=size,
            output_height=size,
        )
    except Exception as exc:
        logger.warning("SVG to PNG conversion failed: %s", exc)
        return None


def _overlay_seal_on_photo(photo_bytes: bytes, logo_svg: str) -> bytes:
    photo = Image.open(io.BytesIO(photo_bytes)).convert("RGBA")
    width, height = photo.size
    seal_size = max(60, int(min(width, height) * 0.15))
    padding = int(seal_size * 0.1)

    seal_png_bytes = _svg_to_png(logo_svg, size=seal_size)
    if seal_png_bytes:
        seal = Image.open(io.BytesIO(seal_png_bytes)).convert("RGBA")
    else:
        seal = Image.new("RGBA", (seal_size, seal_size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(seal)
        draw.ellipse([4, 4, seal_size - 4, seal_size - 4], fill=(139, 38, 53, 180))

    background = Image.new("RGBA", seal.size, (255, 255, 255, 200))
    seal = Image.alpha_composite(background, seal)
    position = (width - seal_size - padding, height - seal_size - padding)
    photo.paste(seal, position, seal)

    output = io.BytesIO()
    photo.convert("RGB").save(output, format="JPEG", quality=92)
    return output.getvalue()


def _build_template_vars(state: ProductState, logo_svg: str) -> dict:
    brand_context = state.get("brand_context", {})
    category_data = state.get("category_data", {})
    palette = state.get("palette", {"primary": "#8B2635", "secondary": "#4A7C59", "accent": "#C4963B"})
    copy_assets = state.get("copy_assets", {})
    story_en = brand_context.get("story_en") or state.get("listing_copy", "")
    story_hi = brand_context.get("story_hi") or ""

    template_vars = {
        "brand_name": state.get("brand_name", "Brand"),
        "brand_tagline": state.get("tagline", ""),
        "brand_story": brand_context.get("artisan_story", ""),
        "artisan_name": brand_context.get("artisan_name", ""),
        "region": state.get("region", brand_context.get("region", "India")),
        "logo_svg": logo_svg,
        "primary_color": palette.get("primary", "#8B2635"),
        "accent_color": palette.get("accent", "#C4963B"),
        "background_color": palette.get("secondary", "#F7F2EA"),
        "secondary_color": palette.get("secondary", "#4A7C59"),
        "price_mrp": state.get("price_mrp", 0),
        "product_name": state.get("product_name", "Product"),
        "material": state.get("material"),
        "motif_used": state.get("motif_used"),
        "occasion": state.get("occasion", "general"),
        "care_instructions": copy_assets.get("care_instructions", state.get("care_instructions", "")),
        "listing_copy": state.get("listing_copy", ""),
        "listing_excerpt": (state.get("listing_copy", "") or "")[:180],
        "story_excerpt_en": (story_en or "")[:200],
        "story_excerpt_hi": (story_hi or "")[:200],
        "product_material_sentence": state.get("material") or "Craft details are included with the product.",
        "whatsapp_number": brand_context.get("whatsapp_number"),
        "gi_tag": brand_context.get("gi_tag", False),
        "gi_tag_name": brand_context.get("gi_tag_name"),
        "date_generated": datetime.now(timezone.utc).date().isoformat(),
    }
    template_vars.update(category_data)
    return template_vars


async def _upload_pdf(pdf_bytes: bytes, product_id: str, filename: str) -> str:
    return await upload_bytes(
        data=pdf_bytes,
        path=f"products/{product_id}/{filename}",
        content_type="application/pdf",
    )


async def print_assets_node(state: ProductState) -> ProductState:
    """Generate category-aware PDFs and a branded product photo."""
    job_id = state["job_id"]
    product_id = state["product_id"]
    category = state.get("product_category", "other")

    supabase.table("jobs").update(
        {
            "current_step": "Printing hang tags and labels...",
            "percent": 60,
        }
    ).eq("id", job_id).execute()

    logo_svg = await _resolve_logo_svg(state.get("logo_svg", ""))
    template_vars = _build_template_vars(state, logo_svg)

    hang_tag_pdf = render_pdf(HANG_TAG_TEMPLATES.get(category, HANG_TAG_TEMPLATES["other"]), template_vars)
    label_pdf = render_pdf(LABEL_TEMPLATES.get(category, LABEL_TEMPLATES["other"]), template_vars)
    story_card_pdf = render_pdf("story_card_base.html", template_vars)

    print_asset_paths: dict[str, str] = {}
    if hang_tag_pdf:
        print_asset_paths["hang_tag"] = await _upload_pdf(hang_tag_pdf, product_id, "hang_tag.pdf")
    if label_pdf:
        print_asset_paths["label"] = await _upload_pdf(label_pdf, product_id, "label.pdf")
    if story_card_pdf:
        print_asset_paths["story_card"] = await _upload_pdf(story_card_pdf, product_id, "story_card.pdf")

    if category == "painting" and template_vars.get("is_original"):
        certificate_pdf = render_pdf("certificate_auth.html", template_vars)
        if certificate_pdf:
            print_asset_paths["certificate"] = await _upload_pdf(certificate_pdf, product_id, "certificate_auth.pdf")

    supabase.table("jobs").update(
        {
            "current_step": "Branding your product photo...",
            "percent": 70,
        }
    ).eq("id", job_id).execute()

    branded_photo_url = ""
    photos = state.get("photos", [])
    if photos:
        photo_bytes = await _fetch_url(photos[0])
        if photo_bytes:
            branded_photo_url = await upload_bytes(
                data=_overlay_seal_on_photo(photo_bytes, logo_svg),
                path=f"products/{product_id}/branded_photo.jpg",
                content_type="image/jpeg",
            )

    logger.info("Print assets complete for job=%s, product=%s", job_id, product_id)
    return {
        **state,
        "logo_svg": logo_svg,
        "print_asset_paths": print_asset_paths,
        "hang_tag_url": print_asset_paths.get("hang_tag", ""),
        "label_url": print_asset_paths.get("label", ""),
        "branded_photo_url": branded_photo_url,
    }
