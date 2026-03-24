"""
Brand Intelligence Node — Step 2 of brand_graph.py

Uses Groq (Llama 3.3 70B) in JSON mode to generate:
  - 3 brand name candidates + selected best name
  - Brand tagline
  - HEX color palette (primary, secondary, accent)
Updates job progress to 25%.
"""

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
- Brand names must feel premium, 1-2 words, no generic words like "Craft" or "Handmade"
- Names should evoke the craft's heritage — Sanskrit, regional language words are encouraged
- Palette must complement the craft's traditional colors
- Tagline must be authentic, not clichéd marketing speak
"""


async def intelligence_node(state: BrandState) -> BrandState:
    """
    Generate brand identity: names, tagline, and color palette using Groq.
    """
    job_id = state["job_id"]

    supabase.table("jobs").update({
        "current_step": "🎨 Crafting your brand identity...",
        "percent": 25,
    }).eq("id", job_id).execute()

    motifs = ", ".join(state.get("motifs", [])[:5])
    palette_hints = str(state.get("palette_suggestions", {}))

    user_prompt = f"""
Artisan Profile:
- Name: {state.get("artisan_name", "Unknown")}
- Craft: {state.get("craft_id", "").replace("_", " ").title()}
- Region: {state.get("region", "India")}
- Experience: {state.get("years_of_experience", 5)} years
- Inspiration: {state.get("inspiration", "Traditional technique")}
- Preferred language: {state.get("preferred_language", "hi")}

Craft Heritage Context:
{state.get("rag_context", "Traditional Indian craft")}

Craft Motifs: {motifs}
Traditional Palette Suggestions: {palette_hints}

Generate a premium brand identity for this artisan.
"""

    result = await groq_json_completion(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=1024,
        temperature=0.8,
    )

    logger.info(f"Brand intelligence complete for job={job_id}: name='{result.get('selected_name')}'")

    return {
        **state,
        "brand_names": result.get("brand_names", []),
        "brand_name": result.get("selected_name", state.get("artisan_name", "Artisan Brand")),
        "tagline": result.get("tagline", "Handcrafted Heritage"),
        "palette": result.get("palette", {"primary": "#8B2635", "secondary": "#4A7C59", "accent": "#C4963B"}),
    }
