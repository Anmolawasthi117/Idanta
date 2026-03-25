"""
Copy Agent Node.

Generates brand stories and category-aware product copy with Groq.
"""

import json
import logging

from app.agents.state import BrandState, ProductState
from app.core.database import supabase
from app.services.groq_client import groq_json_completion

logger = logging.getLogger(__name__)

CATEGORY_COPY_HINTS = {
    "apparel": (
        "Focus on: fabric feel and drape, occasion suitability, the hand-block printing process, "
        "natural dye benefits for skin, how long this piece took to make. "
        "Avoid generic fashion language. Use craft-specific vocabulary."
    ),
    "jewelry": (
        "Focus on: the occasion this jewelry is perfect for (weddings, festivals), the metal and "
        "inlay technique, how it is traditionally worn, gifting angle, emotional significance. "
        "Mention if it is a complete set or pairs."
    ),
    "pottery": (
        "Focus on: the clay source and firing technique if known, functional use, food safety "
        "status, how it fits into Indian home aesthetics, care instructions. "
        "If decorative, emphasize display and gifting value."
    ),
    "painting": (
        "Focus on: the art style's cultural lineage, what the imagery depicts and its symbolic "
        "meaning, the medium and surface, whether it is an original or print, how it transforms "
        "a living space. For originals: emphasize uniqueness and investment value."
    ),
    "home_decor": (
        "Focus on: interior styling angle, the material and craft tradition behind it, how it "
        "pairs with Indian home aesthetics, gifting suitability, dimensions and placement. "
        "Avoid generic decor language."
    ),
    "other": (
        "Focus on: what makes this handmade product unique, the artisan's technique, "
        "material quality, and appropriate use occasions."
    ),
}

BRAND_STORY_PROMPT = """You are a master storyteller specializing in Indian artisan heritage.
Write authentic, emotionally resonant brand stories that honor the craft's cultural legacy.

Output ONLY valid JSON:
{
  "story_en": "2-3 paragraph brand story in English (150-200 words)",
  "story_hi": "Same story in Hindi (150-200 words, Devanagari script)"
}

Rules:
- Avoid empty buzzwords and generic marketing copy
- Reference specific craft techniques, materials, motifs, and regional heritage
- Write from the artisan's perspective in first person
- If an artisan quote is provided, preserve its emotional texture
- Hindi should feel natural and conversational
"""

PRODUCT_COPY_PROMPT = """You are an expert e-commerce copywriter for Indian handcraft marketplaces.
Generate compelling product content that sounds specific, grounded, and culturally informed.

Output ONLY valid JSON:
{
  "listing_copy": "Product description for marketplaces (80-120 words)",
  "social_caption": "Instagram caption with 5 relevant hashtags (40-60 words)",
  "care_instructions": "3-4 practical care instructions in one compact paragraph"
}

Rules:
- listing_copy must highlight craft heritage, material, category details, and the artisan angle
- social_caption must feel organic, visual, and non-spammy
- care_instructions must be practical, material-specific, and packaging-friendly
- All output in English
"""


def _format_category_data(data: dict) -> str:
    return "\n".join(f"- {key}: {value}" for key, value in data.items())


async def copy_agent_brand_node(state: BrandState) -> BrandState:
    """Generate bilingual brand stories for the brand creation graph."""
    job_id = state["job_id"]
    context = state.get("context_bundle", {})

    supabase.table("jobs").update(
        {
            "current_step": "Writing your brand story...",
            "percent": 50,
        }
    ).eq("id", job_id).execute()

    user_prompt = f"""
Brand: {state.get("brand_name")}
Tagline: {state.get("tagline")}
Craft: {context.get("craft_name", state.get("craft_id", "").replace("_", " ").title())}
Region: {context.get("region")}
Artisan: {context.get("artisan_name")} with {context.get("years_of_experience", 0)} years of experience
Generations in craft: {context.get("generations_in_craft", 1)}
Desired feel: {context.get("brand_feel", "earthy")}
Primary market occasion: {context.get("primary_occasion", "general")}
Target buyer: {context.get("target_customer", "local_bazaar")}
Artisan's own words: "{context.get("artisan_story", "").strip() or "No direct quote provided."}"

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

    logger.info("Brand copy agent complete for job=%s", job_id)

    return {
        "story_en": result.get("story_en", "A story of heritage and skilled making."),
        "story_hi": result.get("story_hi", "यह कहानी विरासत, हुनर और अपनेपन की है।"),
    }


async def copy_agent_product_node(state: ProductState) -> ProductState:
    """Generate product listing copy, social caption, and care instructions."""
    job_id = state["job_id"]
    category = state.get("product_category", "other")
    brand_context = state.get("brand_context", {})
    category_data = state.get("category_data", {})
    category_hint = CATEGORY_COPY_HINTS.get(category, CATEGORY_COPY_HINTS["other"])
    craft_hint = brand_context.get("product_copy_hints", {}).get(
        category, brand_context.get("product_copy_hints", {}).get("other", "")
    )

    supabase.table("jobs").update(
        {
            "current_step": "Writing product description...",
            "percent": 40,
        }
    ).eq("id", job_id).execute()

    system_prompt = (
        f"{PRODUCT_COPY_PROMPT}\n\n"
        f"Category guidance:\n{category_hint}\n\n"
        f"Craft-specific guidance:\n{craft_hint or 'Use the available product details faithfully.'}"
    )

    user_prompt = f"""
Product: {state.get("product_name")}
Category: {category}
Brand: {state.get("brand_name")}
Brand tagline: {state.get("tagline")}
Price: Rs. {state.get("price_mrp", 0):.0f}
Occasion: {state.get("occasion", "general")}
Material: {state.get("material", "Not specified")}
Motif: {state.get("motif_used", "Traditional motif")}
Time to make: {state.get("time_to_make_hrs", 0)} hours
Voice note transcript: {state.get("description_voice") or "Not provided"}
Craft: {state.get("craft_id", "").replace("_", " ").title()}
Region: {state.get("region", "India")}
Category-specific data:
{_format_category_data(category_data)}

Brand context:
- Brand feel: {brand_context.get("brand_feel", "earthy")}
- Buyer profile: {brand_context.get("target_customer", "local_bazaar")}
- GI tag: {brand_context.get("gi_tag", False)}
- GI tag name: {brand_context.get("gi_tag_name")}
- Heritage context: {state.get("brand_context", {}).get("rag_context", "")}

Generate product listing copy, social caption, and care instructions.
"""

    result = await groq_json_completion(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=1024,
        temperature=0.7,
    )

    logger.info("Product copy agent complete for job=%s", job_id)

    copy_assets = {
        "listing_copy": result.get("listing_copy", "A carefully made artisan product with rooted craft value."),
        "social_caption": result.get("social_caption", "Crafted with care and culture. #IndianCraft #ArtisanMade"),
        "care_instructions": result.get("care_instructions", "Handle with care. Store clean and dry."),
    }

    return {
        **state,
        "listing_copy": copy_assets["listing_copy"],
        "social_caption": copy_assets["social_caption"],
        "care_instructions": copy_assets["care_instructions"],
        "copy_assets": copy_assets,
    }
