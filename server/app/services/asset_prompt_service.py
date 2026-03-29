"""
Asset prompt agents for brand and product image generation.
These agents turn brand, product, and RAG context into a shared visual DNA
plus refined per-asset prompts that stay consistent while still looking unique.
"""

from __future__ import annotations

import json
from typing import Any, Dict

from app.agents.state import BrandState, ProductState
from app.services.asset_example_pool import format_examples_for_prompt, retrieve_brand_examples
from app.services.groq_client import groq_json_completion

BRAND_VISUAL_DNA_PROMPT = """You are a senior brand art director for premium Indian craft brands.
Build a visual design DNA that will be reused across multiple generated assets.

Return ONLY valid JSON with this schema:
{
  "visual_dna": "One dense paragraph describing the brand's visual world",
  "motif_focus": ["motif1", "motif2", "motif3"],
  "texture_cues": ["cue1", "cue2", "cue3"],
  "composition_cues": ["cue1", "cue2", "cue3"],
  "luxury_markers": ["marker1", "marker2", "marker3"],
  "negative_cues": ["thing to avoid", "thing to avoid"],
  "consistency_anchor": "Short phrase capturing what all assets should feel like"
}

Rules:
- The output must feel specific to the craft and artisan, never generic
- Use brand feel, region, motifs, heritage, buyer profile, and artisan story
- Aim for modern premium output, not costume-drama or cheap souvenir styling
- Avoid fake typography instructions or unreadable text gimmicks
"""

PRODUCT_VISUAL_DNA_PROMPT = """You are a senior packaging and campaign art director for premium handmade products.
Build a shared visual DNA for one product line so multiple generated assets feel related but not repetitive.

Return ONLY valid JSON with this schema:
{
  "visual_dna": "One dense paragraph describing the visual world for this product",
  "hero_elements": ["element1", "element2", "element3"],
  "layout_cues": ["cue1", "cue2", "cue3"],
  "material_cues": ["cue1", "cue2", "cue3"],
  "luxury_markers": ["marker1", "marker2", "marker3"],
  "negative_cues": ["thing to avoid", "thing to avoid"],
  "consistency_anchor": "Short phrase capturing what all assets should feel like"
}

Rules:
- Use both product context and brand/craft context
- Make the design language product-specific, not just category-generic
- The output should feel premium, commercial, and usable for ecommerce
- Keep all assets visually connected while letting each asset type serve its own job
"""


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _join_lines(items: list[str]) -> str:
    return ", ".join(item for item in items if item) or "none"


def _resolve_brand_examples(state: BrandState, asset_type: str) -> list[Dict[str, Any]]:
    examples = state.get("visual_examples", [])
    filtered = [example for example in examples if example.get("asset_type") == asset_type]
    if filtered:
        return filtered
    return retrieve_brand_examples(state, asset_type, limit=3)


async def build_brand_visual_dna(state: BrandState) -> Dict[str, Any]:
    context = state.get("context_bundle", {})
    craft_data = state.get("craft_data", {})
    logo_examples = retrieve_brand_examples(state, "logo", limit=2)
    banner_examples = retrieve_brand_examples(state, "banner", limit=2)
    user_prompt = f"""
Brand:
- Name: {state.get("brand_name", "")}
- Tagline: {state.get("tagline", "")}
- Artisan: {context.get("artisan_name", "")}
- Region: {context.get("region", "")}
- Craft: {context.get("craft_name", state.get("craft_id", "").replace("_", " ").title())}
- Brand feel: {context.get("brand_feel", "earthy")}
- Target customer: {context.get("target_customer", "local_bazaar")}
- Primary occasion: {context.get("primary_occasion", "general")}
- Script preference: {context.get("script_preference", "both")}
- Palette: {_json(state.get("palette", {}))}
- Visual context from user images: {state.get("visual_context", "")}
- Saved visual summary: {state.get("visual_summary", "")}
- Saved visual motifs: {_json(state.get("visual_motifs", []))}
- Saved signature patterns: {_json(state.get("signature_patterns", []))}
- Illustration language: {_json(state.get("illustration_language", {}))}
- Artisan story: {context.get("artisan_story", "")}
- Generated brand story EN: {state.get("story_en", "")}
- Generated brand story HI: {state.get("story_hi", "")}

Craft knowledge:
- Motifs: {_json(craft_data.get("motifs", {}))}
- Traditional colors: {_json(craft_data.get("traditional_colors", {}))}
- Materials: {_json(craft_data.get("materials", {}))}
- Tone keywords: {_json(craft_data.get("brand_tone_keywords", []))}
- Selling points: {_json(craft_data.get("selling_points", []))}
- GI tag: {craft_data.get("gi_tag", False)}
- GI tag name: {craft_data.get("gi_tag_name")}

RAG context:
{state.get("rag_context", "")}

Retrieved logo references:
{format_examples_for_prompt(logo_examples, include_text=False)}

Retrieved banner references:
{format_examples_for_prompt(banner_examples, include_text=False)}
"""
    return await groq_json_completion(
        system_prompt=BRAND_VISUAL_DNA_PROMPT,
        user_prompt=user_prompt,
        max_tokens=800,
        temperature=0.7,
    )


async def build_product_visual_dna(state: ProductState) -> Dict[str, Any]:
    brand_context = state.get("brand_context", {})
    category_data = state.get("category_data", {})
    user_prompt = f"""
Product:
- Name: {state.get("product_name", "")}
- Category: {state.get("product_category", "other")}
- Occasion: {state.get("occasion", "general")}
- Price: Rs. {state.get("price_mrp", 0):.0f}
- Material: {state.get("material", "")}
- Motif used: {state.get("motif_used", "")}
- Time to make: {state.get("time_to_make_hrs", 0)} hours
- Description voice: {state.get("description_voice", "")}
- Category data: {_json(category_data)}
- Listing copy: {state.get("listing_copy", "")}
- Care instructions: {state.get("care_instructions", "")}

Brand:
- Brand name: {state.get("brand_name", "")}
- Tagline: {state.get("tagline", "")}
- Palette: {_json(state.get("palette", {}))}
- Brand feel: {brand_context.get("brand_feel", "earthy")}
- Buyer profile: {brand_context.get("target_customer", "local_bazaar")}
- Craft: {brand_context.get("craft_name", state.get("craft_id", "").replace("_", " ").title())}
- Region: {state.get("region", "India")}
- Artisan story: {brand_context.get("artisan_story", "")}
- Story EN: {brand_context.get("story_en", "")}
- Story HI: {brand_context.get("story_hi", "")}
- GI tag: {brand_context.get("gi_tag", False)}
- GI tag name: {brand_context.get("gi_tag_name")}

RAG context:
{brand_context.get("rag_context", "")}
"""
    return await groq_json_completion(
        system_prompt=PRODUCT_VISUAL_DNA_PROMPT,
        user_prompt=user_prompt,
        max_tokens=900,
        temperature=0.7,
    )


def build_brand_asset_prompt(state: BrandState, visual_dna: Dict[str, Any], asset_type: str) -> str:
    context = state.get("context_bundle", {})
    palette = state.get("palette", {})
    example_context = _resolve_brand_examples(state, asset_type)
    asset_specs = {
        "logo": (
            "Create a premium artisan brand logo image. "
            "Focus on emblem quality, symbolic clarity, and memorable brand authorship. "
            "No mockup, no packaging, no long text, no watermark. "
            "The mark should feel like a true identity asset, not clipart."
        ),
        "banner": (
            "Create a premium ecommerce hero banner for the brand. "
            "Use cinematic layering, decorative restraint, and luxury craft atmosphere. "
            "It should feel like a homepage hero visual designed by an expert creative director. "
            "No watermark, no random text blocks, no generic collage chaos."
        ),
    }

    return f"""
You are generating the {asset_type} asset for one artisan brand.

Brand identity:
- Brand name: {state.get("brand_name", "")}
- Tagline: {state.get("tagline", "")}
- Craft: {context.get("craft_name", state.get("craft_id", "").replace("_", " ").title())}
- Region: {context.get("region", "")}
- Brand feel: {context.get("brand_feel", "earthy")}
- Target customer: {context.get("target_customer", "local_bazaar")}
- Artisan story: {context.get("artisan_story", "")}
- Palette: {_json(palette)}
- Visual context from uploaded images: {state.get("visual_context", "")}
- Saved visual summary: {state.get("visual_summary", "")}
- Saved visual motifs: {_json(state.get("visual_motifs", []))}
- Saved signature patterns: {_json(state.get("signature_patterns", []))}
- Illustration language: {_json(state.get("illustration_language", {}))}
- Design rationale: {state.get("design_rationale", "")}
- RAG heritage context: {state.get("rag_context", "")}

Shared visual DNA:
- Visual world: {visual_dna.get("visual_dna", "")}
- Motif focus: {_join_lines(visual_dna.get("motif_focus", []))}
- Texture cues: {_join_lines(visual_dna.get("texture_cues", []))}
- Composition cues: {_join_lines(visual_dna.get("composition_cues", []))}
- Luxury markers: {_join_lines(visual_dna.get("luxury_markers", []))}
- Consistency anchor: {visual_dna.get("consistency_anchor", "")}
- Avoid: {_join_lines(visual_dna.get("negative_cues", []))}

Retrieved example references for this asset:
{format_examples_for_prompt(example_context, include_text=False)}

Asset-specific art direction:
{asset_specs[asset_type]}

Output goal:
- This single asset must feel unique to this brand
- It must clearly belong to the same family as the brand's other assets
- It must feel premium, realistic, polished, and commercially usable
- Learn from the reference qualities but do not produce a derivative copy of any one example
"""


def build_product_asset_prompt(state: ProductState, visual_dna: Dict[str, Any], asset_type: str) -> str:
    brand_context = state.get("brand_context", {})
    palette = state.get("palette", {})
    category_data = state.get("category_data", {})
    asset_specs = {
        "hang_tag": (
            "Create a vertical premium hang tag front design. "
            "Use strong hierarchy, crafted ornamentation, boutique packaging aesthetics, and a product-specific story-led composition."
        ),
        "label": (
            "Create a premium retail packaging label. "
            "Make it clean, luxurious, and product-specific with strong visual hierarchy and refined detailing."
        ),
        "story_card": (
            "Create a premium story card or brand insert. "
            "It should feel editorial, heritage-rich, emotionally resonant, and beautifully designed like a museum boutique insert."
        ),
        "certificate": (
            "Create a certificate of authenticity for an original handmade artwork. "
            "It should feel official, collectible, gallery-worthy, and premium."
        ),
        "branded_photo": (
            "Use the provided product photo as reference. "
            "Transform it into a premium ecommerce hero image while preserving the real product identity. "
            "Improve styling, lighting, background, and brand mood without losing authenticity."
        ),
    }

    return f"""
You are generating the {asset_type} asset for one artisan product.

Product:
- Product name: {state.get("product_name", "")}
- Category: {state.get("product_category", "other")}
- Occasion: {state.get("occasion", "general")}
- Price: Rs. {state.get("price_mrp", 0):.0f}
- Material: {state.get("material", "")}
- Motif used: {state.get("motif_used", "")}
- Time to make: {state.get("time_to_make_hrs", 0)} hours
- Description voice: {state.get("description_voice", "")}
- Category data: {_json(category_data)}
- Listing copy: {state.get("listing_copy", "")}
- Care instructions: {state.get("care_instructions", "")}

Brand:
- Brand name: {state.get("brand_name", "")}
- Tagline: {state.get("tagline", "")}
- Palette: {_json(palette)}
- Brand feel: {brand_context.get("brand_feel", "earthy")}
- Buyer profile: {brand_context.get("target_customer", "local_bazaar")}
- Craft: {brand_context.get("craft_name", state.get("craft_id", "").replace("_", " ").title())}
- Region: {state.get("region", "India")}
- Artisan story: {brand_context.get("artisan_story", "")}
- Brand story EN: {brand_context.get("story_en", "")}
- Heritage RAG context: {brand_context.get("rag_context", "")}

Shared product visual DNA:
- Visual world: {visual_dna.get("visual_dna", "")}
- Hero elements: {_join_lines(visual_dna.get("hero_elements", []))}
- Layout cues: {_join_lines(visual_dna.get("layout_cues", []))}
- Material cues: {_join_lines(visual_dna.get("material_cues", []))}
- Luxury markers: {_join_lines(visual_dna.get("luxury_markers", []))}
- Consistency anchor: {visual_dna.get("consistency_anchor", "")}
- Avoid: {_join_lines(visual_dna.get("negative_cues", []))}

Asset-specific art direction:
{asset_specs[asset_type]}

Output goal:
- This asset must look unique to this exact product and brand
- It must visibly belong to the same family as the other generated assets
- It must feel premium, realistic, and commercially usable
- Avoid generic AI poster aesthetics
"""
