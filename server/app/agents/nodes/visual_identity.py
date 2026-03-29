"""
Visual identity generation node for brand assets.
Uses Gemini image generation for both logo and banner outputs.
"""

import asyncio
import logging

from app.agents.state import BrandState
from app.core.database import supabase
from app.services.asset_prompt_service import build_brand_asset_prompt, build_brand_visual_dna
from app.services.gemini_image_service import generate_image
from app.services.logo_reference_service import get_logo_reference_library_summary
from app.services.storage_service import upload_bytes

logger = logging.getLogger(__name__)

FEEL_LOGO_STYLE = {
    "earthy": "organic, rooted, warm, textured, artisan-luxury",
    "royal": "ornate, regal, jewel-toned, heritage-inspired, premium",
    "vibrant": "bold, playful, celebratory, high-contrast, folk-art energy",
    "minimal": "restrained, refined, spacious, modern, editorial",
}

FEEL_BANNER_STYLE = {
    "earthy": "muted terracotta, ochre, soft handmade textures, grounded craft atmosphere",
    "royal": "deep jewel tones, elegant detailing, premium heritage mood, decorative richness",
    "vibrant": "colorful celebratory craft textures, bright contrast, dynamic pattern rhythm",
    "minimal": "airy composition, subtle material texture, modern luxury, one strong accent",
}


async def _generate_logo(state: BrandState, visual_dna: dict) -> tuple[bytes, str]:
    prompt = (
        build_brand_asset_prompt(state, visual_dna, "logo")
        + f"\nStyle modifier: {FEEL_LOGO_STYLE.get(state.get('context_bundle', {}).get('brand_feel', 'earthy'), FEEL_LOGO_STYLE['earthy'])}."
    )
    return await generate_image(prompt, width_hint=1024, height_hint=1024)


async def _generate_banner(state: BrandState, visual_dna: dict) -> tuple[bytes, str]:
    prompt = (
        build_brand_asset_prompt(state, visual_dna, "banner")
        + f"\nStyle modifier: {FEEL_BANNER_STYLE.get(state.get('context_bundle', {}).get('brand_feel', 'earthy'), FEEL_BANNER_STYLE['earthy'])}."
    )
    return await generate_image(prompt, width_hint=1536, height_hint=768)


async def visual_identity_node(state: BrandState) -> BrandState:
    """Generate and upload logo and banner brand assets."""
    job_id = state["job_id"]
    brand_id_placeholder = f"brand_{state['user_id']}"

    supabase.table("jobs").update(
        {
            "current_step": "Building your brand visual direction...",
            "percent": 50,
        }
    ).eq("id", job_id).execute()

    visual_dna = await build_brand_visual_dna(state)
    logo_reference_library_summary = await get_logo_reference_library_summary()
    enriched_state: BrandState = {
        **state,
        "logo_reference_library_summary": logo_reference_library_summary,
    }

    supabase.table("jobs").update(
        {
            "current_step": "Designing your logo and banner...",
            "percent": 60,
        }
    ).eq("id", job_id).execute()

    (logo_bytes, logo_mime), (banner_bytes, banner_mime) = await asyncio.gather(
        _generate_logo(enriched_state, visual_dna),
        _generate_banner(enriched_state, visual_dna),
    )

    logo_url = await upload_bytes(
        data=logo_bytes,
        path=f"brands/{brand_id_placeholder}/logo.png",
        content_type=logo_mime,
    )
    banner_url = await upload_bytes(
        data=banner_bytes,
        path=f"brands/{brand_id_placeholder}/banner.png",
        content_type=banner_mime,
    )

    logger.info("Visual identity complete for job=%s", job_id)
    return {
        "logo_url": logo_url,
        "banner_url": banner_url,
    }
