"""
Visual identity generation node for brand assets.
Uses the SVG renderer for both logo and banner outputs.
"""

import asyncio
import logging

from app.agents.state import BrandState
from app.core.database import supabase
from app.services.logo_reference_service import get_logo_reference_library_summary
from app.services.storage_service import upload_bytes
from app.services.vector_brand_service import render_banner_svg, render_logo_svg

logger = logging.getLogger(__name__)


async def _generate_logo(state: BrandState, logo_reference_library_summary: dict) -> tuple[bytes, str]:
    motifs = [str(item).strip() for item in state.get("visual_motifs", []) if str(item).strip()]
    patterns = state.get("signature_patterns", []) or []
    motif_name = motifs[0] if motifs else "Image-derived motif"
    motif_description = ""
    if patterns:
        pattern = patterns[0]
        motif_description = str(pattern.get("description", "") if isinstance(pattern, dict) else getattr(pattern, "description", "")).strip()
    svg = render_logo_svg(
        brand_name=state.get("brand_name", ""),
        tagline=state.get("tagline", ""),
        palette=state.get("palette", {}) or {},
        motif_name=motif_name,
        motif_description=motif_description,
        candidate_id="logo_candidate_1",
        sample_summary=str(logo_reference_library_summary.get("summary", "")),
    )
    return svg.encode("utf-8"), "image/svg+xml"


async def _generate_banner(state: BrandState) -> tuple[bytes, str]:
    motifs = [str(item).strip() for item in state.get("visual_motifs", []) if str(item).strip()]
    patterns = state.get("signature_patterns", []) or []
    motif_name = motifs[0] if motifs else "Image-derived motif"
    motif_description = ""
    if patterns:
        pattern = patterns[0]
        motif_description = str(pattern.get("description", "") if isinstance(pattern, dict) else getattr(pattern, "description", "")).strip()
    svg = render_banner_svg(
        brand_name=state.get("brand_name", ""),
        tagline=state.get("tagline", ""),
        palette=state.get("palette", {}) or {},
        motif_name=motif_name,
        motif_description=motif_description,
        candidate_id="banner_candidate_1",
    )
    return svg.encode("utf-8"), "image/svg+xml"


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
        _generate_logo(enriched_state, logo_reference_library_summary),
        _generate_banner(enriched_state),
    )

    logo_url = await upload_bytes(
        data=logo_bytes,
        path=f"brands/{brand_id_placeholder}/logo.svg",
        content_type=logo_mime,
    )
    banner_url = await upload_bytes(
        data=banner_bytes,
        path=f"brands/{brand_id_placeholder}/banner.svg",
        content_type=banner_mime,
    )

    logger.info("Visual identity complete for job=%s", job_id)
    return {
        "logo_url": logo_url,
        "banner_url": banner_url,
    }

