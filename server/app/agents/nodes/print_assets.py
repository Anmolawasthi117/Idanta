"""
Print Assets Node — Part of product_graph.py

Generates:
1. Hang Tag PDF (7cm × 12cm) via WeasyPrint
2. Product Label PDF (10cm × 5cm) via WeasyPrint
3. Branded Photo — overlays the SVG brand seal on the product photo using Pillow

Uploads all assets to Supabase Storage.
Updates job progress to 70%.
"""

import io
import logging
import re
from typing import Optional

import httpx
from PIL import Image, ImageDraw

from app.agents.state import ProductState
from app.core.database import supabase
from app.services.pdf_service import render_pdf
from app.services.storage_service import upload_bytes

logger = logging.getLogger(__name__)

# Try to import cairosvg for SVG→PNG; fall back to a placeholder
try:
    import cairosvg
    CAIROSVG_AVAILABLE = True
except Exception as e:
    CAIROSVG_AVAILABLE = False
    logger.warning(f"cairosvg could not be loaded (Cairo/GTK missing?): {e}. Image overlay will use a placeholder seal.")


async def _fetch_image(url: str) -> Optional[bytes]:
    """Download image bytes from URL."""
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.content
    except Exception as e:
        logger.warning(f"Failed to fetch image from {url}: {e}")
    return None


def _svg_to_png(svg_string: str, size: int = 80) -> Optional[bytes]:
    """Convert SVG to PNG bytes via cairosvg."""
    if not CAIROSVG_AVAILABLE:
        return None
    try:
        return cairosvg.svg2png(
            bytestring=svg_string.encode("utf-8"),
            output_width=size,
            output_height=size,
        )
    except Exception as e:
        logger.warning(f"SVG to PNG conversion failed: {e}")
        return None


def _overlay_seal_on_photo(photo_bytes: bytes, logo_svg: str) -> bytes:
    """
    Overlay the brand seal (logo) on the bottom-right of the product photo.
    Uses alpha_composite for transparency support.
    """
    # Load product photo
    photo = Image.open(io.BytesIO(photo_bytes)).convert("RGBA")
    w, h = photo.size

    # Determine seal size (~15% of shortest dimension)
    seal_size = max(60, int(min(w, h) * 0.15))
    padding = int(seal_size * 0.1)

    # Convert SVG logo to PNG
    seal_png_bytes = _svg_to_png(logo_svg, size=seal_size)

    if seal_png_bytes:
        seal = Image.open(io.BytesIO(seal_png_bytes)).convert("RGBA")
    else:
        # Placeholder circular seal
        seal = Image.new("RGBA", (seal_size, seal_size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(seal)
        draw.ellipse([4, 4, seal_size - 4, seal_size - 4], fill=(139, 38, 53, 180))

    # Add white circular background for seal contrast
    bg = Image.new("RGBA", seal.size, (255, 255, 255, 200))
    seal = Image.alpha_composite(bg, seal)

    # Paste seal on bottom-right corner
    pos = (w - seal_size - padding, h - seal_size - padding)
    photo.paste(seal, pos, seal)

    # Convert back to RGB JPEG
    output = io.BytesIO()
    photo.convert("RGB").save(output, format="JPEG", quality=92)
    return output.getvalue()


async def print_assets_node(state: ProductState) -> ProductState:
    """Generate hang tag PDF, label PDF, and branded product photo."""
    job_id = state["job_id"]
    product_id = state["product_id"]

    supabase.table("jobs").update({
        "current_step": "🖨️ Printing hang tags and labels...",
        "percent": 60,
    }).eq("id", job_id).execute()

    pdf_context = {
        "brand_name": state.get("brand_name", "Brand"),
        "tagline": state.get("tagline", ""),
        "palette": state.get("palette", {"primary": "#8B2635", "secondary": "#4A7C59", "accent": "#C4963B"}),
        "logo_svg": state.get("logo_svg", ""),
        "product_name": state.get("product_name", "Product"),
        "price_mrp": state.get("price_mrp", 0.0),
        "material": state.get("material"),
        "motif_used": state.get("motif_used"),
        "region": state.get("region"),
        "care_instructions": state.get("care_instructions"),
    }

    # Generate PDFs
    hang_tag_pdf = render_pdf("hang_tag.html", pdf_context)
    label_pdf = render_pdf("label.html", pdf_context)

    # Upload PDFs (only if generation succeeded)
    hang_tag_url = ""
    if hang_tag_pdf:
        hang_tag_url = await upload_bytes(
            data=hang_tag_pdf,
            path=f"products/{product_id}/hang_tag.pdf",
            content_type="application/pdf",
        )
    
    label_url = ""
    if label_pdf:
        label_url = await upload_bytes(
            data=label_pdf,
            path=f"products/{product_id}/label.pdf",
            content_type="application/pdf",
        )

    # Generate branded photo
    supabase.table("jobs").update({
        "current_step": "📸 Branding your product photo...",
        "percent": 70,
    }).eq("id", job_id).execute()

    branded_photo_url = ""
    photos = state.get("photos", [])
    if photos:
        photo_bytes = await _fetch_image(photos[0])
        if photo_bytes:
            logo_svg = state.get("logo_svg", "")
            branded_bytes = _overlay_seal_on_photo(photo_bytes, logo_svg)
            if branded_bytes:
                branded_photo_url = await upload_bytes(
                    data=branded_bytes,
                    path=f"products/{product_id}/branded_photo.jpg",
                    content_type="image/jpeg",
                )

    logger.info(f"Print assets complete for job={job_id}, product={product_id}")

    return {
        **state,
        "hang_tag_url": hang_tag_url,
        "label_url": label_url,
        "branded_photo_url": branded_photo_url,
    }
