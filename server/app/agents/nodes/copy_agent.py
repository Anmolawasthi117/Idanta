"""
Copy Agent Node — Step 3b (parallel) of brand_graph.py
Also used in product_graph.py.

Uses Groq to generate:
- Brand Story (English & Hindi)
- Product Listing Copy
- Social Media Caption
- Care Instructions
Updates job progress to 50%.
"""

import logging
from app.agents.state import BrandState, ProductState
from app.core.database import supabase
from app.services.groq_client import groq_json_completion

logger = logging.getLogger(__name__)

BRAND_STORY_PROMPT = """You are a master storyteller specializing in Indian artisan heritage.
Write authentic, emotionally resonant brand stories that honor the craft's cultural legacy.

Output ONLY valid JSON:
{
  "story_en": "2-3 paragraph brand story in English (150-200 words)",
  "story_hi": "Same story in Hindi (150-200 words, Devanagari script)"
}

Rules:
- No generic buzzwords: avoid "handmade", "authentic", "passion"
- Reference specific craft techniques, materials, and regional heritage
- Write from the artisan's perspective — first person
- The Hindi must be natural, conversational Hindustani (not formal literary Hindi)
"""

PRODUCT_COPY_PROMPT = """You are an expert e-commerce copywriter for Indian handcraft marketplaces.
Generate compelling, conversion-optimized product content.

Output ONLY valid JSON:
{
  "listing_copy": "Product description for Meesho/Amazon (80-100 words)",
  "social_caption": "Instagram caption with 5 relevant hashtags (40-50 words)",
  "care_instructions": "3-4 bullet care instructions for the material"
}

Rules:
- listing_copy must highlight craft heritage, material, and artisan story
- social_caption must feel organic, not promotional
- care_instructions must be practical and material-specific
- All output in English
"""


async def copy_agent_brand_node(state: BrandState) -> BrandState:
    """Generate bilingual brand stories for the brand creation graph."""
    job_id = state["job_id"]

    supabase.table("jobs").update({
        "current_step": "✍️ Writing your brand story...",
        "percent": 50,
    }).eq("id", job_id).execute()

    user_prompt = f"""
Brand: {state.get("brand_name")}
Tagline: {state.get("tagline")}
Craft: {state.get("craft_id", "").replace("_", " ").title()}
Region: {state.get("region")}
Artisan: {state.get("artisan_name")} with {state.get("years_of_experience")} years experience
Inspiration: {state.get("inspiration", "Traditional technique")}

Craft Heritage Context:
{state.get("rag_context", "Traditional Indian craft")}

Write the brand story in both English and Hindi.
"""

    result = await groq_json_completion(
        system_prompt=BRAND_STORY_PROMPT,
        user_prompt=user_prompt,
        max_tokens=2048,
        temperature=0.75,
    )

    logger.info(f"Brand copy agent complete for job={job_id}")

    return {
        "story_en": result.get("story_en", "A story of heritage and craft."),
        "story_hi": result.get("story_hi", "विरासत और शिल्प की कहानी।"),
    }


async def copy_agent_product_node(state: ProductState) -> ProductState:
    """Generate product listing copy, social caption, and care instructions."""
    job_id = state["job_id"]

    supabase.table("jobs").update({
        "current_step": "✍️ Writing product description...",
        "percent": 40,
    }).eq("id", job_id).execute()

    user_prompt = f"""
Product: {state.get("product_name")}
Brand: {state.get("brand_name")}
Price: ₹{state.get("price_mrp", 0):.0f}
Material: {state.get("material", "Not specified")}
Motif: {state.get("motif_used", "Traditional motif")}
Craft: {state.get("craft_id", "").replace("_", " ").title()}
Region: {state.get("region", "India")}

Generate product listing copy, social caption, and care instructions.
"""

    result = await groq_json_completion(
        system_prompt=PRODUCT_COPY_PROMPT,
        user_prompt=user_prompt,
        max_tokens=1024,
        temperature=0.7,
    )

    logger.info(f"Product copy agent complete for job={job_id}")

    return {
        **state,
        "listing_copy": result.get("listing_copy", "A beautifully handcrafted product."),
        "social_caption": result.get("social_caption", "Handcrafted with love. 🇮🇳 #HandmadeInIndia"),
        "care_instructions": result.get("care_instructions", "Hand wash gently with cold water."),
    }
