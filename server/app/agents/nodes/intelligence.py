"""
Brand Intelligence Node - Step 2 of brand_graph.py.

Uses Groq in JSON mode to generate brand names, tagline, and palette.
"""

import json
import logging
from pathlib import Path

from app.agents.state import BrandState
from app.core.database import supabase
from app.services.groq_client import groq_json_completion, groq_vision_completion

logger = logging.getLogger(__name__)

DESIGN_POOL_PATH = Path("data/design_pool.json")

SYSTEM_PROMPT = """You are an expert brand strategist specializing in Indian artisan crafts.
Your task is to create authentic, premium brand identities that honor the craft's heritage.

You have been provided a "Design Pool" with predefined color palettes and illustration languages.
Output ONLY a valid JSON object with this exact schema:
{
  "brand_names": ["Name1", "Name2", "Name3"],
  "selected_name": "Name1",
  "tagline": "Tagline under 8 words",
  "palette_id": "the exact ID string from the provided design pool",
  "illustration_language_id": "the exact ID string from the provided design pool",
  "design_rationale": "1-2 sentence explanation of why you chose this palette and style."
}

Rules:
- Brand names must feel premium, 1-2 words, and avoid generic filler like "Craft" or "Handmade"
- Names should feel rooted in the craft's region, motifs, and buyer context
- The tagline language must follow the requested script preference exactly: Hindi, English, or bilingual
- The palette_id must exactly match one of the available palettes provided below.
- The illustration_language_id must exactly match one of the provided languages.
- You must consider both the text context and the Visual Context (if available) to pick the perfect design template.
- Tagline must be authentic, specific, and never cliche marketing copy.
"""


async def intelligence_node(state: BrandState) -> BrandState:
    """Generate brand identity: names, tagline, and select design aesthetics using Groq."""
    job_id = state["job_id"]
    context = state.get("context_bundle", {})
    craft_data = state.get("craft_data", {})

    supabase.table("jobs").update(
        {
            "current_step": "Extracting visual context from images...",
            "percent": 25,
        }
    ).eq("id", job_id).execute()

    reference_images = state.get("reference_images", [])
    visual_context = "No visual reference images provided."
    if reference_images:
        logger.info(f"Extracting visual context from {len(reference_images)} images via Vision LLM.")
        try:
            visual_context = await groq_vision_completion(
                system_prompt="You are an expert design analyst. Look at the attached artisan product/workplace images and extract a dense visual summary focusing on: dominant colors, textures, organic vs geometric shapes, traditional vs modern feel, and overall mood. Format as a 3-4 sentence paragraph.",
                user_prompt="Analyze these images to establish the visual aesthetic for the artisan's brand.",
                image_urls=reference_images[:3] # strict cap to 3
            )
        except Exception as e:
            logger.warning(f"Vision API failed: {e}")
            visual_context = f"Vision analysis failed: {e}"

    supabase.table("jobs").update(
        {
            "current_step": "Synthesizing your premium brand identity...",
            "percent": 30,
        }
    ).eq("id", job_id).execute()

    # Load design pool
    design_pool = {}
    if DESIGN_POOL_PATH.exists():
        with open(DESIGN_POOL_PATH, encoding="utf-8") as f:
            design_pool = json.load(f)

    user_prompt = f"""
Artisan Profile:
- Name: {context.get("artisan_name", "Unknown")}
- Craft: {context.get("craft_name", state.get("craft_id", "").replace("_", " ").title())}
- Region: {context.get("region", "India")}
- This craft has been in the family for {context.get("generations_in_craft", 1)} generations
- {context.get("years_of_experience", 0)} years of personal experience
- Primary market occasion: {context.get("primary_occasion", "general")}
- Target buyer profile: {context.get("target_customer", "local_bazaar")}
- Desired brand aesthetic (fallback): {context.get("brand_feel", "earthy")}
- Script preference for tagline: {context.get("script_preference", "both")}
- Preferred interface language: {state.get("preferred_language", "hi")}
- Artisan's own words: "{context.get("artisan_story", "").strip() or "No direct quote provided."}"

Craft Signals:
- Motifs: {json.dumps(craft_data.get("motifs", {}), ensure_ascii=False)}
- Traditional colors: {json.dumps(craft_data.get("traditional_colors", {}), ensure_ascii=False)}
- Materials: {json.dumps(craft_data.get("materials", {}), ensure_ascii=False)}
- Tone keywords: {", ".join(craft_data.get("brand_tone_keywords", []))}
- Selling points: {json.dumps(craft_data.get("selling_points", []), ensure_ascii=False)}

Craft Heritage Context:
{state.get("rag_context", "Traditional Indian craft")}

Visual Context (from uploaded artisan photos):
{visual_context}

Available Design Pool:
{json.dumps(design_pool, indent=2)}

Generate a premium brand identity for this artisan by formulating names and a tagline, and selecting the optimal aesthetic from the Design Pool.
"""

    result = await groq_json_completion(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=2048,
        temperature=0.7,
    )

    logger.info(
        "Brand intelligence complete for job=%s: name='%s', visual context extracted: %s",
        job_id,
        result.get("selected_name"),
        bool(reference_images)
    )

    # Reconstruct the requested palette structure for downstream nodes by matching the ID
    chosen_palette_id = result.get("palette_id")
    chosen_palette_data = next(
        (p for p in design_pool.get("palettes", []) if p.get("id") == chosen_palette_id),
        None
    )
    
    if chosen_palette_data:
        final_palette = {
            "primary": chosen_palette_data["primary"],
            "secondary": chosen_palette_data["secondary"],
            "accent": chosen_palette_data["accent"],
            "id": chosen_palette_data["id"]
        }
    else:
        # Fallback if LLM halluciantes an ID
        final_palette = {"primary": "#8B2635", "secondary": "#4A7C59", "accent": "#C4963B"}

    return {
        **state,
        "brand_names": result.get("brand_names", []),
        "brand_name": result.get("selected_name", state.get("artisan_name", "Artisan Brand")),
        "tagline": result.get("tagline", "Crafted with quiet pride"),
        "palette": final_palette,
    }
