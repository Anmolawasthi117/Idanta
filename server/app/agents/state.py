"""
TypedDict state schemas for LangGraph graphs.
Each key maps to a stage of the pipeline.
"""

from typing import TypedDict, Optional, List, Dict, Any


class BrandState(TypedDict, total=False):
    # ── Inputs (set by API on graph entry) ──────────────────────────────────
    job_id: str
    user_id: str
    craft_id: str
    artisan_name: str
    years_of_experience: int
    region: str
    inspiration: Optional[str]
    preferred_language: str  # 'hi' or 'en'

    # ── Context Builder output ───────────────────────────────────────────────
    craft_data: Dict[str, Any]       # Full craft JSON
    rag_context: str                 # Formatted RAG chunks
    motifs: List[str]                # Selected motifs
    palette_suggestions: Dict        # Palette options from craft JSON

    # ── Brand Intelligence output ────────────────────────────────────────────
    brand_names: List[str]           # 3 candidate names
    brand_name: str                  # Selected name
    tagline: str
    palette: Dict[str, str]          # {primary, secondary, accent}

    # ── Visual Identity output ───────────────────────────────────────────────
    logo_svg: str                    # Raw SVG string
    logo_url: str                    # Supabase URL
    banner_url: str                  # Supabase URL

    # ── Copy Agent output ────────────────────────────────────────────────────
    story_en: str
    story_hi: str

    # ── Packager output ──────────────────────────────────────────────────────
    brand_id: str
    kit_zip_url: str

    # ── Control ─────────────────────────────────────────────────────────────
    error: Optional[str]


class ProductState(TypedDict, total=False):
    # ── Inputs ───────────────────────────────────────────────────────────────
    job_id: str
    user_id: str
    product_id: str
    brand_id: str

    # ── Product data (loaded from DB) ────────────────────────────────────────
    product_name: str
    price_mrp: float
    motif_used: Optional[str]
    material: Optional[str]
    photos: List[str]               # Original photo URLs

    # ── Brand data (loaded from DB) ──────────────────────────────────────────
    brand_name: str
    tagline: str
    palette: Dict[str, str]
    logo_svg: str
    region: str
    craft_id: str

    # ── Copy Agent output ────────────────────────────────────────────────────
    listing_copy: str
    social_caption: str
    care_instructions: str

    # ── Print Assets output ──────────────────────────────────────────────────
    hang_tag_url: str
    label_url: str

    # ── Image Overlay output ─────────────────────────────────────────────────
    branded_photo_url: str

    # ── Packager output ──────────────────────────────────────────────────────
    assets_zip_url: str

    # ── Control ─────────────────────────────────────────────────────────────
    error: Optional[str]
