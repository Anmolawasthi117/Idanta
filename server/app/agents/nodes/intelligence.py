"""
Brand Intelligence Node - Step 2 of brand_graph.py.

Uses Groq in JSON mode to generate brand names, tagline, and palette.
"""

import json
import logging

from app.agents.state import BrandState
from app.core.database import supabase
from app.services.groq_client import groq_json_completion

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert brand strategist specializing in Indian artisan crafts.
Your task is to create authentic, premium brand identities that honor the craft's heritage.

Output ONLY a valid JSON object with this exact schema:
{
  "brand_names": ["Name1", "Name2", "Name3"],
  "selected_name": "Name1",
  "tagline": "Tagline under 8 words",
  "palette": {
    "primary": "#RRGGBB",
    "secondary": "#RRGGBB",
    "accent": "#RRGGBB"
  },
  "palette_rationale": "1-2 sentence explanation"
}

Rules:
- Brand names must feel premium, 1-2 words, and avoid generic filler like "Craft" or "Handmade"
- Names should feel rooted in the craft's region, motifs, and buyer context
- The tagline language must follow the requested script preference exactly: Hindi, English, or bilingual
- Desired brand feel must deterministically shape the palette:
  - earthy -> muted, warm, desaturated tones such as terracotta, ochre, olive
  - royal -> deep jewel tones such as indigo, crimson, gold, burgundy
  - vibrant -> saturated high-contrast tones such as saffron, turquoise, magenta, emerald
  - minimal -> near-neutral base with one strong accent, lots of restraint
- Palette must complement the craft's traditional colors while still reflecting the requested feel
- Tagline must be authentic, specific, and never cliche marketing copy
"""


async def intelligence_node(state: BrandState) -> BrandState:
    """Generate brand identity: names, tagline, and color palette using Groq."""
    job_id = state["job_id"]
    context = state.get("context_bundle", {})
    craft_data = state.get("craft_data", {})

    supabase.table("jobs").update(
        {
            "current_step": "Crafting your brand identity...",
            "percent": 25,
        }
    ).eq("id", job_id).execute()

    user_prompt = f"""
Artisan Profile:
- Name: {context.get("artisan_name", "Unknown")}
- Craft: {context.get("craft_name", state.get("craft_id", "").replace("_", " ").title())}
- Region: {context.get("region", "India")}
- This craft has been in the family for {context.get("generations_in_craft", 1)} generations
- {context.get("years_of_experience", 0)} years of personal experience
- Primary market occasion: {context.get("primary_occasion", "general")}
- Target buyer profile: {context.get("target_customer", "local_bazaar")}
- Desired brand aesthetic: {context.get("brand_feel", "earthy")} - this must be reflected in name tone and palette weight
- Script preference for tagline: {context.get("script_preference", "both")}
- Preferred interface language: {state.get("preferred_language", "hi")}
- Artisan's own words (use this voice authentically): "{context.get("artisan_story", "").strip() or "No direct quote provided."}"

Craft Signals:
- Motifs: {json.dumps(craft_data.get("motifs", {}), ensure_ascii=False)}
- Traditional colors: {json.dumps(craft_data.get("traditional_colors", {}), ensure_ascii=False)}
- Materials: {json.dumps(craft_data.get("materials", {}), ensure_ascii=False)}
- Tone keywords: {", ".join(craft_data.get("brand_tone_keywords", []))}
- Selling points: {json.dumps(craft_data.get("selling_points", []), ensure_ascii=False)}
- GI Tag: {craft_data.get("gi_tag", False)}
- GI Tag Name: {craft_data.get("gi_tag_name")}

Craft Heritage Context:
{state.get("rag_context", "Traditional Indian craft")}

Generate a premium brand identity for this artisan.
"""

    result = await groq_json_completion(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=1024,
        temperature=0.7,
    )

    logger.info(
        "Brand intelligence complete for job=%s: name='%s'",
        job_id,
        result.get("selected_name"),
    )

    return {
        **state,
        "brand_names": result.get("brand_names", []),
        "brand_name": result.get("selected_name", state.get("artisan_name", "Artisan Brand")),
        "tagline": result.get("tagline", "Crafted with quiet pride"),
        "palette": result.get(
            "palette",
            {"primary": "#8B2635", "secondary": "#4A7C59", "accent": "#C4963B"},
        ),
    }
