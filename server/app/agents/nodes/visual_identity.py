"""
Visual Identity Node - Step 3a of brand_graph.py.

Generates:
1. SVG Logo via Groq
2. Pattern Banner via Pollinations
"""

import asyncio
import logging
import urllib.parse

import httpx

from app.agents.state import BrandState
from app.core.config import settings
from app.core.database import supabase
from app.services.groq_client import groq_text_completion
from app.services.storage_service import upload_bytes

logger = logging.getLogger(__name__)

FEEL_LOGO_STYLE = {
    "earthy": "geometric and organic, inspired by natural forms, thick strokes, warm and grounded",
    "royal": "ornate and detailed, inspired by Mughal architectural motifs, fine lines, regal proportions",
    "vibrant": "bold and playful, high contrast, inspired by folk art forms like Warli or Madhubani line work",
    "minimal": "extremely simple, single-element mark, maximum negative space, one or two colors only",
}

FEEL_BANNER_STYLE = {
    "earthy": "muted warm tones, natural textures, terracotta and ochre palette, grounded rustic aesthetic",
    "royal": "deep jewel tones, ornate borders, gold accents, Mughal-inspired decorative frame",
    "vibrant": "bright saturated colors, bold geometric patterns, folk art energy, high contrast",
    "minimal": "clean white space, single accent color, simple motif, modern editorial layout",
}

SVG_SYSTEM_PROMPT = """You are a world-class SVG logo designer specializing in Indian craft heritage.
Generate a valid SVG logo using a single craft motif as the centerpiece.

Rules:
- Output ONLY valid SVG code, nothing else
- viewBox="0 0 200 200", width="200", height="200"
- Use 2-3 colors maximum from the provided palette
- The mark must stay readable at 1cm print size
- No text, no raster effects, no external assets
- Keep the geometry elegant, printer-friendly, and brandable
"""


def _fallback_svg(palette: dict) -> str:
    primary = palette.get("primary", "#8B2635")
    accent = palette.get("accent", "#C4963B")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">'
        f'<rect width="200" height="200" fill="{primary}"/>'
        f'<polygon points="100,28 172,172 28,172" fill="none" stroke="{accent}" stroke-width="6"/>'
        f'<circle cx="100" cy="100" r="24" fill="{accent}" opacity="0.85"/>'
        f"</svg>"
    )


async def _generate_svg_logo(state: BrandState) -> str:
    motif = state.get("motifs", ["geometric pattern"])[0] if state.get("motifs") else "geometric pattern"
    palette = state.get("palette", {})
    context = state.get("context_bundle", {})
    feel = context.get("brand_feel", "earthy")
    style_hint = FEEL_LOGO_STYLE.get(feel, FEEL_LOGO_STYLE["earthy"])

    user_prompt = (
        f"Design a premium SVG logo for an Indian artisan brand.\n"
        f"Brand Name: {state.get('brand_name', 'Artisan')}\n"
        f"Craft: {context.get('craft_name', state.get('craft_id', '').replace('_', ' ').title())}\n"
        f"Primary Motif: {motif}\n"
        f"Brand Feel: {feel}\n"
        f"Style Direction: {style_hint}\n"
        f"Colors: Primary={palette.get('primary', '#8B2635')}, "
        f"Secondary={palette.get('secondary', '#4A7C59')}, "
        f"Accent={palette.get('accent', '#C4963B')}\n"
        f"Target Customer: {context.get('target_customer', 'local_bazaar')}\n"
        f"Generate the SVG code only."
    )

    svg = await groq_text_completion(
        system_prompt=SVG_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=2048,
        temperature=0.55,
    )

    svg = svg.strip()
    if not svg.startswith("<svg"):
        start = svg.find("<svg")
        svg = svg[start:] if start != -1 else _fallback_svg(palette)

    return svg


async def _generate_banner(state: BrandState) -> bytes:
    craft = state.get("craft_id", "indian craft").replace("_", " ")
    palette = state.get("palette", {})
    context = state.get("context_bundle", {})
    feel = context.get("brand_feel", "earthy")
    style_hint = FEEL_BANNER_STYLE.get(feel, FEEL_BANNER_STYLE["earthy"])

    prompt = (
        f"Luxury artisan banner for {craft}, {style_hint}, "
        f"traditional Indian craft motifs, no text, no faces, layered pattern background, "
        f"primary color {palette.get('primary', '#8B2635')}, accent {palette.get('accent', '#C4963B')}"
    )
    encoded = urllib.parse.quote(prompt)
    url = f"{settings.POLLINATIONS_BASE_URL}/{encoded}?width=1200&height=400&nologo=true&model=flux"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            if response.status_code == 200:
                return response.content
    except Exception as exc:
        logger.warning("Pollinations API failed: %s. Using SVG fallback.", exc)

    primary = palette.get("primary", "#8B2635")
    secondary = palette.get("secondary", "#4A7C59")
    accent = palette.get("accent", "#C4963B")
    fallback_svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="1200" height="400">'
        f'<defs><pattern id="p" patternUnits="userSpaceOnUse" width="72" height="72">'
        f'<rect width="72" height="72" fill="{primary}"/>'
        f'<path d="M36 8 L64 64 L8 64 Z" fill="none" stroke="{accent}" stroke-width="2" opacity="0.35"/>'
        f'<circle cx="36" cy="36" r="10" fill="{secondary}" opacity="0.28"/>'
        f"</pattern></defs>"
        f'<rect width="1200" height="400" fill="url(#p)"/>'
        f"</svg>"
    )
    return fallback_svg.encode("utf-8")


async def visual_identity_node(state: BrandState) -> BrandState:
    """Run logo and banner generation in parallel, then upload both assets."""
    job_id = state["job_id"]
    brand_id_placeholder = f"brand_{state['user_id']}"

    supabase.table("jobs").update(
        {
            "current_step": "Designing your logo and banner...",
            "percent": 50,
        }
    ).eq("id", job_id).execute()

    svg_string, banner_bytes = await asyncio.gather(
        _generate_svg_logo(state),
        _generate_banner(state),
    )

    logo_url = await upload_bytes(
        data=svg_string.encode("utf-8"),
        path=f"brands/{brand_id_placeholder}/logo.svg",
        content_type="image/svg+xml",
    )

    is_svg = banner_bytes[:4] == b"<svg" or banner_bytes[:5] == b"<?xml"
    banner_ext = "svg" if is_svg else "png"
    banner_content_type = "image/svg+xml" if is_svg else "image/png"
    banner_url = await upload_bytes(
        data=banner_bytes,
        path=f"brands/{brand_id_placeholder}/banner.{banner_ext}",
        content_type=banner_content_type,
    )

    logger.info("Visual identity complete for job=%s", job_id)

    return {
        "logo_svg": svg_string,
        "logo_url": logo_url,
        "banner_url": banner_url,
    }
