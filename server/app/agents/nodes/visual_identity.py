"""
Visual identity generation node for brand assets.
Uses Gemini image generation for both logo and banner outputs.
"""

import asyncio
import logging

from app.agents.state import BrandState
from app.core.database import supabase
from app.services.gemini_image_service import generate_image
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


async def _generate_logo(state: BrandState) -> tuple[bytes, str]:
    motif = state.get("motifs", ["craft motif"])[0] if state.get("motifs") else "craft motif"
    palette = state.get("palette", {})
    context = state.get("context_bundle", {})
    feel = context.get("brand_feel", "earthy")

    prompt = (
        "Create a premium artisan brand logo image for an Indian craft business. "
        "Make it look like a polished designer-made brand mark presented on a clean studio background. "
        "No mockup, no package, no watermark, no paragraph text, no gibberish text. "
        "Use a strong emblem, monogram, or symbolic mark that feels memorable and premium. "
        f"Brand name inspiration: {state.get('brand_name', 'Artisan')}. "
        f"Craft tradition: {context.get('craft_name', state.get('craft_id', '').replace('_', ' ').title())}. "
        f"Hero motif: {motif}. "
        f"Brand feel: {feel}. Style: {FEEL_LOGO_STYLE.get(feel, FEEL_LOGO_STYLE['earthy'])}. "
        f"Palette should emphasize {palette.get('primary', '#8B2635')}, {palette.get('secondary', '#4A7C59')}, {palette.get('accent', '#C4963B')}. "
        f"Target buyer: {context.get('target_customer', 'local_bazaar')}. "
        "The result should feel elegant, realistic, and high-end."
    )
    return await generate_image(prompt, width_hint=1024, height_hint=1024)


async def _generate_banner(state: BrandState) -> tuple[bytes, str]:
    palette = state.get("palette", {})
    context = state.get("context_bundle", {})
    feel = context.get("brand_feel", "earthy")
    craft = context.get("craft_name", state.get("craft_id", "").replace("_", " ").title())

    prompt = (
        "Create a luxury ecommerce hero banner for an Indian artisan brand. "
        "It should feel like a premium designer-made visual with layered textures, craft-inspired ornamentation, strong composition, and refined lighting. "
        "No watermark, no random text, no UI mockup, no cheap collage look. "
        f"Craft: {craft}. "
        f"Brand feel: {feel}. Style: {FEEL_BANNER_STYLE.get(feel, FEEL_BANNER_STYLE['earthy'])}. "
        f"Palette direction: {palette.get('primary', '#8B2635')}, {palette.get('secondary', '#4A7C59')}, {palette.get('accent', '#C4963B')}. "
        "The banner should feel realistic, polished, and premium enough for a storefront."
    )
    return await generate_image(prompt, width_hint=1536, height_hint=768)


async def visual_identity_node(state: BrandState) -> BrandState:
    """Generate and upload logo and banner brand assets."""
    job_id = state["job_id"]
    brand_id_placeholder = f"brand_{state['user_id']}"

    supabase.table("jobs").update(
        {
            "current_step": "Designing your logo and banner...",
            "percent": 50,
        }
    ).eq("id", job_id).execute()

    (logo_bytes, logo_mime), (banner_bytes, banner_mime) = await asyncio.gather(
        _generate_logo(state),
        _generate_banner(state),
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
