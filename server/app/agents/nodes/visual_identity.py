"""
Visual Identity Node — Step 3a (parallel) of brand_graph.py

Generates:
1. SVG Logo — Groq writes pure SVG code for a motif-based logo
2. Pattern Banner — Pollinations API generates a Flux.1 image

Uploads both to Supabase Storage and updates job to 50%.
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

SVG_SYSTEM_PROMPT = """You are a world-class SVG logo designer specializing in Indian craft heritage.
Generate a minimal, elegant SVG logo using a single craft motif as the centerpiece.

Rules:
- Output ONLY valid SVG code, nothing else — no markdown, no explanation
- viewBox="0 0 200 200", width="200", height="200"
- Use 2-3 colors maximum from the provided palette
- The design must be simple enough to print at 1cm size
- Center the design within the viewBox
- No text — pure geometric/motif-based design
- Clean, minimal lines — suitable for luxury brand identity
"""


async def _generate_svg_logo(state: BrandState) -> str:
    """Use Groq to generate an SVG logo based on the craft motif."""
    motif = state.get("motifs", ["geometric pattern"])[0] if state.get("motifs") else "geometric pattern"
    palette = state.get("palette", {})

    user_prompt = (
        f"Design a minimal SVG logo for an Indian craft brand.\n"
        f"Craft: {state.get('craft_id', '').replace('_', ' ').title()}\n"
        f"Primary Motif: {motif}\n"
        f"Colors: Primary={palette.get('primary', '#8B2635')}, "
        f"Secondary={palette.get('secondary', '#4A7C59')}, "
        f"Accent={palette.get('accent', '#C4963B')}\n"
        f"Brand Name: {state.get('brand_name', 'Artisan')}\n"
        f"Generate the SVG code only."
    )

    svg = await groq_text_completion(
        system_prompt=SVG_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=2048,
        temperature=0.6,
    )

    # Sanitize: ensure it starts with <svg
    svg = svg.strip()
    if not svg.startswith("<svg"):
        start = svg.find("<svg")
        svg = svg[start:] if start != -1 else _fallback_svg(palette)

    return svg


def _fallback_svg(palette: dict) -> str:
    """CSS-only fallback SVG banner when Groq fails."""
    primary = palette.get("primary", "#8B2635")
    accent = palette.get("accent", "#C4963B")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">'
        f'<rect width="200" height="200" fill="{primary}"/>'
        f'<polygon points="100,30 170,170 30,170" fill="none" stroke="{accent}" stroke-width="4"/>'
        f'<circle cx="100" cy="100" r="25" fill="{accent}" opacity="0.8"/>'
        f'</svg>'
    )


async def _generate_banner(state: BrandState) -> bytes:
    """
    Call Pollinations.ai to generate a repeating craft pattern image.
    Falls back to a solid-color SVG banner if the API is unavailable.
    """
    craft = state.get("craft_id", "indian craft").replace("_", " ")
    palette = state.get("palette", {})
    primary = palette.get("primary", "#8B2635")

    prompt = (
        f"Seamless {craft} pattern, traditional Indian craft textile, "
        f"luxury brand background, color palette dominated by {primary}, "
        f"high detail, flat design, no text, no faces, repeating motif"
    )
    encoded = urllib.parse.quote(prompt)
    url = f"{settings.POLLINATIONS_BASE_URL}/{encoded}?width=1200&height=400&nologo=true&model=flux"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            if response.status_code == 200:
                return response.content
    except Exception as e:
        logger.warning(f"Pollinations API failed: {e}. Using SVG fallback.")

    # CSS/SVG banner fallback
    secondary = palette.get("secondary", "#4A7C59")
    accent = palette.get("accent", "#C4963B")
    fallback_svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="1200" height="400">'
        f'<defs><pattern id="p" patternUnits="userSpaceOnUse" width="60" height="60">'
        f'<rect width="60" height="60" fill="{primary}"/>'
        f'<path d="M30 5 L55 55 L5 55 Z" fill="none" stroke="{accent}" stroke-width="1.5" opacity="0.4"/>'
        f'<circle cx="30" cy="30" r="8" fill="{secondary}" opacity="0.3"/>'
        f'</pattern></defs>'
        f'<rect width="1200" height="400" fill="url(#p)"/>'
        f'</svg>'
    )
    return fallback_svg.encode("utf-8")


async def visual_identity_node(state: BrandState) -> BrandState:
    """Run logo and banner generation in parallel, upload to Supabase Storage."""
    job_id = state["job_id"]
    brand_id_placeholder = f"brand_{state['user_id']}"

    supabase.table("jobs").update({
        "current_step": "🖌️ Designing your logo and banner...",
        "percent": 50,
    }).eq("id", job_id).execute()

    # Run both in parallel
    svg_task = _generate_svg_logo(state)
    banner_task = _generate_banner(state)
    svg_string, banner_bytes = await asyncio.gather(svg_task, banner_task)

    # Upload SVG logo
    logo_url = await upload_bytes(
        data=svg_string.encode("utf-8"),
        path=f"brands/{brand_id_placeholder}/logo.svg",
        content_type="image/svg+xml",
    )

    # Detect banner format (PNG from Pollinations or SVG fallback)
    is_svg = banner_bytes[:4] == b"<svg" or banner_bytes[:5] == b"<?xml"
    banner_ext = "svg" if is_svg else "png"
    banner_ct = "image/svg+xml" if is_svg else "image/png"
    banner_url = await upload_bytes(
        data=banner_bytes,
        path=f"brands/{brand_id_placeholder}/banner.{banner_ext}",
        content_type=banner_ct,
    )

    logger.info(f"Visual identity complete for job={job_id}")

    return {
        "logo_svg": svg_string,
        "logo_url": logo_url,
        "banner_url": banner_url,
    }
