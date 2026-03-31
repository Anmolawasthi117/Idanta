"""
Brand Intelligence Node - Step 2 of brand_graph.py.

Uses Groq in JSON mode to generate brand names, tagline, and a direct
image/context-derived visual direction without relying on the old design pool.
"""

import json
import logging
import re

from app.agents.state import BrandState
from app.core.database import supabase
from app.services.asset_example_pool import build_example_context, format_examples_for_prompt
from app.services.groq_client import groq_json_completion, groq_vision_completion

logger = logging.getLogger(__name__)

HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

SYSTEM_PROMPT = """You are an expert brand strategist specializing in Indian artisan crafts.
Your task is to create an authentic, premium brand identity that honors the craft's heritage while feeling commercially sharp.

Output ONLY a valid JSON object with this exact schema:
{
  "brand_names": ["Name1", "Name2", "Name3"],
  "selected_name": "Name1",
  "tagline": "Tagline under 8 words",
  "palette": {
    "primary": "#000000",
    "secondary": "#111111",
    "accent": "#222222",
    "background": "#F5F1E8"
  },
  "illustration_language": {
    "name": "Short direction name",
    "description": "1 sentence summary",
    "motif_rendering": "How motifs should be drawn or abstracted",
    "composition": "How visual layouts should be structured"
  },
  "design_rationale": "1-2 sentence explanation of why this identity direction fits."
}

Rules:
- Brand names must feel premium, 1-2 words, and avoid generic filler like "Craft" or "Handmade"
- Names should feel rooted in the craft's region, motifs, materials, and buyer context
- Across the generated naming options, include a healthy mix of English-led, Hindi-led, and Hinglish-led directions when possible
- If multiple brand names are returned, avoid making all of them the same language mode
- Hindi-led options should feel natural and premium, not archaic or overly literary
- Hinglish-led options should use natural roman-script mixing and still feel premium and ownable
- The tagline language should match the selected name's identity mode and can be Hindi, English, or Hinglish
- Use the retrieved naming and tagline examples as quality references, not as strings to copy
- Distinctiveness matters more than safety; avoid bland names that could fit any artisan
- Derive the palette directly from uploaded-image visual context plus relevant craft color signals; do not use preset palette libraries
- All palette values must be valid 6-digit hex colors
- The palette should feel premium, usable, and consistent across motifs, logos, and banners
- The illustration language must explain how motifs and layouts should behave visually
- Tagline must be authentic, specific, and never cliche marketing copy
"""

LOCKED_IDENTITY_SYSTEM_PROMPT = """You are an expert brand strategist specializing in Indian artisan crafts.
The artisan has already finalized the brand name and tagline. Do not rename or rewrite them.

Output ONLY a valid JSON object with this exact schema:
{
  "palette": {
    "primary": "#000000",
    "secondary": "#111111",
    "accent": "#222222",
    "background": "#F5F1E8"
  },
  "illustration_language": {
    "name": "Short direction name",
    "description": "1 sentence summary",
    "motif_rendering": "How motifs should be drawn or abstracted",
    "composition": "How visual layouts should be structured"
  },
  "design_rationale": "1-2 sentence explanation of why this visual direction fits the locked identity."
}

Rules:
- Keep the provided brand name and tagline exactly as they are
- If a locked palette is provided, return the exact same palette values with no edits
- Otherwise derive the palette directly from uploaded-image visual context plus relevant craft color signals
- Do not use preset palette libraries
- All palette values must be valid 6-digit hex colors
- The illustration language must reinforce premium, ownable motif and logo generation
"""


def _normalize_hex(value: object, fallback: str) -> str:
    candidate = str(value or "").strip()
    return candidate if HEX_RE.fullmatch(candidate) else fallback


def _extract_traditional_hexes(craft_data: dict) -> list[str]:
    values = craft_data.get("traditional_colors", {}).get("hex", []) or []
    cleaned: list[str] = []
    for value in values:
        candidate = str(value or "").strip()
        if HEX_RE.fullmatch(candidate) and candidate.upper() not in cleaned:
            cleaned.append(candidate.upper())
    return cleaned


def _fallback_palette(craft_data: dict, locked_palette: dict | None = None) -> dict[str, str]:
    if locked_palette:
        return {
            "primary": _normalize_hex(locked_palette.get("primary"), "#8B2635"),
            "secondary": _normalize_hex(locked_palette.get("secondary"), "#4A7C59"),
            "accent": _normalize_hex(locked_palette.get("accent"), "#C4963B"),
            "background": _normalize_hex(locked_palette.get("background"), "#F5E6C8"),
            **({"id": str(locked_palette.get("id")).strip()} if locked_palette.get("id") else {}),
        }

    traditional = _extract_traditional_hexes(craft_data)
    defaults = traditional[:4]
    while len(defaults) < 4:
        defaults.append(["#8B2635", "#4A7C59", "#C4963B", "#F5E6C8"][len(defaults)])

    return {
        "primary": defaults[0],
        "secondary": defaults[1],
        "accent": defaults[2],
        "background": defaults[3],
    }


def _coerce_palette(raw_palette: object, fallback: dict[str, str]) -> dict[str, str]:
    palette = raw_palette if isinstance(raw_palette, dict) else {}
    coerced = {
        "primary": _normalize_hex(palette.get("primary"), fallback["primary"]),
        "secondary": _normalize_hex(palette.get("secondary"), fallback["secondary"]),
        "accent": _normalize_hex(palette.get("accent"), fallback["accent"]),
        "background": _normalize_hex(palette.get("background"), fallback.get("background", "#F5E6C8")),
    }
    if fallback.get("id"):
        coerced["id"] = fallback["id"]
    return coerced


def _fallback_illustration_language() -> dict[str, str]:
    return {
        "name": "Refined Motif System",
        "description": "Premium, high-clarity motif-led brand language rooted in the artisan's visual world.",
        "motif_rendering": "Abstract motifs with crisp edges, controlled ornament, and strong silhouette clarity.",
        "composition": "Use generous spacing, strong hierarchy, and one clear focal gesture per asset.",
    }


async def intelligence_node(state: BrandState) -> BrandState:
    """Generate brand identity: names, tagline, and image/context-derived visual direction using Groq."""
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
        logger.info("Extracting visual context from %s images via Vision LLM.", len(reference_images))
        try:
            visual_context = await groq_vision_completion(
                system_prompt=(
                    "You are an expert design analyst. Look at the attached artisan product/workplace images and extract "
                    "a dense visual summary focusing on: dominant colors, textures, organic vs geometric shapes, recurring "
                    "motifs, traditional vs modern feel, and overall mood. Format as a 3-4 sentence paragraph."
                ),
                user_prompt="Analyze these images to establish the visual aesthetic for the artisan's brand.",
                image_urls=reference_images[:3],
            )
        except Exception as exc:
            logger.warning("Vision API failed: %s", exc)
            visual_context = f"Vision analysis failed: {exc}"

    supabase.table("jobs").update(
        {
            "current_step": "Synthesizing your premium brand identity...",
            "percent": 30,
        }
    ).eq("id", job_id).execute()

    locked_palette = state.get("palette") if isinstance(state.get("palette"), dict) else None
    has_locked_palette = bool(
        locked_palette
        and locked_palette.get("primary")
        and locked_palette.get("secondary")
        and locked_palette.get("accent")
    )

    enriched_state: BrandState = {
        **state,
        "visual_context": visual_context,
    }
    example_context = build_example_context(enriched_state)

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

Locked palette to preserve exactly if present:
{json.dumps(locked_palette or {}, ensure_ascii=False)}

Saved visual motifs:
{json.dumps(state.get("visual_motifs", []), ensure_ascii=False)}

Retrieved Brand Name References:
{format_examples_for_prompt(example_context["brand_name"])}

Retrieved Tagline References:
{format_examples_for_prompt(example_context["tagline"])}

Retrieved Logo Direction References:
{format_examples_for_prompt(example_context["logo"], include_text=False)}

Retrieved Banner Direction References:
{format_examples_for_prompt(example_context["banner"], include_text=False)}

Create a premium brand identity direction that can drive consistent motif, logo, and banner generation.
"""

    if state.get("identity_locked") and state.get("brand_name") and state.get("tagline"):
        result = await groq_json_completion(
            system_prompt=LOCKED_IDENTITY_SYSTEM_PROMPT,
            user_prompt=(
                user_prompt
                + f"\nLocked brand name: {state.get('brand_name')}\n"
                + f"Locked tagline: {state.get('tagline')}\n"
                + "Keep the identity fixed and choose only the visual direction."
            ),
            max_tokens=1024,
            temperature=0.35,
        )
    else:
        result = await groq_json_completion(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
            max_tokens=1800,
            temperature=0.7,
        )

    logger.info(
        "Brand intelligence complete for job=%s: name='%s', visual context extracted: %s",
        job_id,
        result.get("selected_name"),
        bool(reference_images),
    )

    fallback_palette = _fallback_palette(craft_data, locked_palette if has_locked_palette else None)
    final_palette = fallback_palette if has_locked_palette else _coerce_palette(result.get("palette"), fallback_palette)

    raw_illustration = result.get("illustration_language")
    illustration_language = raw_illustration if isinstance(raw_illustration, dict) and raw_illustration else {}
    illustration_language = {
        "name": str(illustration_language.get("name") or _fallback_illustration_language()["name"]).strip(),
        "description": str(illustration_language.get("description") or _fallback_illustration_language()["description"]).strip(),
        "motif_rendering": str(
            illustration_language.get("motif_rendering") or _fallback_illustration_language()["motif_rendering"]
        ).strip(),
        "composition": str(illustration_language.get("composition") or _fallback_illustration_language()["composition"]).strip(),
    }

    return {
        **state,
        "visual_context": visual_context,
        "brand_names": result.get("brand_names", [state.get("brand_name")]) if state.get("identity_locked") else result.get("brand_names", []),
        "brand_name": state.get("brand_name") if state.get("identity_locked") else result.get("selected_name", state.get("artisan_name", "Artisan Brand")),
        "tagline": state.get("tagline") if state.get("identity_locked") else result.get("tagline", "Crafted with quiet pride"),
        "palette": final_palette,
        "illustration_language": illustration_language,
        "design_rationale": result.get("design_rationale", ""),
        "verbal_examples": example_context["brand_name"] + example_context["tagline"],
        "visual_examples": example_context["logo"] + example_context["banner"],
    }
