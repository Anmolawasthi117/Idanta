"""TypedDict state schemas for LangGraph graphs."""

from typing import Any, Dict, List, Optional, TypedDict


class BrandState(TypedDict, total=False):
    # Inputs
    job_id: str
    user_id: str
    craft_id: str
    artisan_name: str
    region: str
    years_of_experience: int
    generations_in_craft: int
    primary_occasion: str
    target_customer: str
    brand_feel: str
    artisan_story: Optional[str]
    script_preference: str
    preferred_language: str
    reference_images: List[str]

    # Context builder output
    craft_data: Dict[str, Any]
    context_bundle: Dict[str, Any]
    rag_context: str
    motifs: List[str]
    palette_suggestions: Dict[str, Any]
    visual_context: str

    # Intelligence output
    brand_names: List[str]
    brand_name: str
    tagline: str
    palette: Dict[str, str]
    illustration_language: Dict[str, Any]
    design_rationale: str
    verbal_examples: List[Dict[str, Any]]
    visual_examples: List[Dict[str, Any]]

    # Visual identity output
    logo_url: str
    banner_url: str

    # Copy output
    story_en: str
    story_hi: str

    # Packager output
    brand_id: str
    kit_zip_url: str

    # Control
    error: Optional[str]


class ProductGraphState(TypedDict, total=False):
    # Inputs
    job_id: str
    product_id: str
    brand_id: str
    user_id: str
    form_data: Dict[str, Any]
    photo_paths: List[str]
    brand_context: Dict[str, Any]

    # Product data
    product_name: str
    price_mrp: float
    motif_used: Optional[str]
    material: Optional[str]
    photos: List[str]
    product_category: str
    occasion: str
    time_to_make_hrs: int
    description_voice: Optional[str]
    category_data: Dict[str, Any]

    # Brand data
    brand_name: str
    tagline: str
    palette: Dict[str, str]
    region: str
    craft_id: str
    product_theme: Dict[str, Any]

    # Copy output
    listing_copy: str
    social_caption: str
    care_instructions: str
    copy_assets: Dict[str, Any]

    # Print assets output
    print_asset_paths: Dict[str, str]
    hang_tag_url: str
    label_url: str
    kit_zip_url: str

    # Image output
    branded_photo_url: str

    # Packager output
    assets_zip_url: str

    # Control
    error: Optional[str]


ProductState = ProductGraphState
