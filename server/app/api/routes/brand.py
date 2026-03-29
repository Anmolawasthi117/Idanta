"""
Brand routes.
POST /api/v1/brands/             - Trigger brand onboarding
GET  /api/v1/brands/{brand_id}  - Fetch brand details
GET  /api/v1/brands/crafts      - List all available craft types
"""

import json
import logging
import uuid
from pathlib import Path
import io
import zipfile

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from app.agents.nodes.context_builder import context_builder_node
from app.services.asset_prompt_service import build_brand_asset_prompt, build_brand_visual_dna
from app.services.asset_example_pool import build_example_context, format_examples_for_prompt
from app.services.gemini_image_service import generate_image
from app.services.groq_client import groq_json_completion, groq_vision_completion

from app.agents.graphs.brand_graph import run_brand_graph
from app.agents.state import BrandState
from app.api.deps import get_current_user_id
from app.core.database import supabase
from app.models.brand import BrandCreateRequest, BrandPublic, CraftInfo
from app.models.job import JobCreateResponse
from app.services.storage_service import upload_bytes

logger = logging.getLogger(__name__)
router = APIRouter()

LIBRARY_DIR = Path("data/craft_library")
FEEL_LOGO_STYLE = {
    "earthy": "organic, rooted, warm, textured, artisan-luxury",
    "royal": "ornate, regal, jewel-toned, heritage-inspired, premium",
    "vibrant": "bold, playful, celebratory, high-contrast, folk-art energy",
    "minimal": "restrained, refined, spacious, modern, editorial",
}

FEEL_BANNER_STYLE = {
    "earthy": "muted terracotta, ochre, soft handmade textures, grounded craft atmosphere",
    "royal": "deep jewel tones, elegant detailing, premium heritage mood, decorative richness",
    "vibrant": "colorful celebratory craft textures, bright contrast, dynamic pattern rhythm",
    "minimal": "airy composition, subtle material texture, modern luxury, one strong accent",
}


class RegenerateAssetRequest(BaseModel):
    asset_type: str
    name: str | None = None
    tagline: str | None = None


class BrandIdentityUpdateRequest(BaseModel):
    name: str
    tagline: str


class BrandIdentityPairPayload(BaseModel):
    pair_id: str
    name: str
    tagline: str
    why_it_fits: str | None = None


class RankedBrandIdentityPairPayload(BrandIdentityPairPayload):
    rank: int
    explanation: str


class BrandIdentityGenerateRequest(BrandCreateRequest):
    excluded_pairs: list[BrandIdentityPairPayload] = Field(default_factory=list)
    set_number: int = Field(default=1, ge=1, le=2)


class BrandIdentityGenerateResponse(BaseModel):
    set_number: int
    pairs: list[BrandIdentityPairPayload]
    has_more: bool


class BrandIdentityRankRequest(BrandCreateRequest):
    selected_pairs: list[BrandIdentityPairPayload] = Field(min_length=1, max_length=3)


class BrandIdentityRankResponse(BaseModel):
    ranked_pairs: list[RankedBrandIdentityPairPayload]
    recommended_pair_id: str | None = None
    next_prompt: str


class SaveBrandIdentityDraftRequest(BrandCreateRequest):
    name: str
    tagline: str


class SaveBrandIdentityDraftResponse(BaseModel):
    brand_id: str
    name: str
    tagline: str


class BrandVisualFoundationRequest(BrandCreateRequest):
    generate_visual_assets: bool = False


class BrandPatternPayload(BaseModel):
    name: str
    description: str
    image_url: str | None = None


class BrandMotifPreviewPayload(BaseModel):
    name: str
    description: str | None = None
    image_url: str


class BrandPalettePayload(BaseModel):
    primary: str
    secondary: str
    accent: str
    background: str | None = None


class BrandPaletteOptionPayload(BaseModel):
    option_id: str
    name: str
    rationale: str
    palette: BrandPalettePayload


class BrandPaletteSelectionRequest(BaseModel):
    option_id: str


class BrandPaletteSelectionResponse(BaseModel):
    selected_palette_id: str
    palette: dict


class BrandVisualFoundationResponse(BaseModel):
    brand_id: str
    reference_images: list[str]
    visual_summary: str
    visual_motifs: list[str]
    motif_previews: list[BrandMotifPreviewPayload]
    signature_patterns: list[BrandPatternPayload]
    palette: dict
    palette_options: list[BrandPaletteOptionPayload]
    recommended_palette_id: str | None = None
    selected_palette_id: str | None = None


def _create_targeted_job(user_id: str, brand_id: str, asset_type: str) -> tuple[str, str]:
    """
    Create a targeted-regeneration job.
    Falls back to `brand_onboarding` if DB constraint has not been migrated yet.
    Returns (job_id, created_job_type).
    """
    preferred_job_type = "brand_asset_regeneration"
    payload = {
        "user_id": user_id,
        "job_type": preferred_job_type,
        "ref_id": brand_id,
        "status": "queued",
        "current_step": f"Queued {asset_type} regeneration...",
        "percent": 0,
    }
    try:
        job_result = supabase.table("jobs").insert(payload).execute()
        return job_result.data[0]["id"], preferred_job_type
    except APIError as exc:
        err_text = str(exc)
        if "jobs_job_type_check" not in err_text:
            raise
        logger.warning(
            "jobs.job_type constraint does not include %s; falling back to brand_onboarding. Error: %s",
            preferred_job_type,
            exc,
        )
        fallback_payload = {
            **payload,
            "job_type": "brand_onboarding",
            "current_step": f"Regenerating {asset_type}...",
        }
        job_result = supabase.table("jobs").insert(fallback_payload).execute()
        return job_result.data[0]["id"], "brand_onboarding"


def _build_state_from_brand(job_id: str, user_id: str, brand: dict) -> BrandState:
    return {
        "job_id": job_id,
        "brand_id": brand["id"],
        "user_id": user_id,
        "craft_id": brand.get("craft_id", ""),
        "artisan_name": brand.get("artisan_name", "") or "",
        "region": brand.get("region", "") or "",
        "years_of_experience": brand.get("years_of_experience", 0) or 0,
        "generations_in_craft": brand.get("generations_in_craft", 1) or 1,
        "primary_occasion": brand.get("primary_occasion", "general") or "general",
        "target_customer": brand.get("target_customer", "local_bazaar") or "local_bazaar",
        "brand_feel": brand.get("brand_feel", "earthy") or "earthy",
        "script_preference": brand.get("script_preference", "both") or "both",
        "artisan_story": brand.get("artisan_story"),
        "preferred_language": brand.get("preferred_language", "hi") or "hi",
        "reference_images": brand.get("reference_images", []),
        "visual_summary": brand.get("visual_summary", "") or "",
        "visual_motifs": brand.get("visual_motifs", []) or [],
        "motif_previews": brand.get("motif_previews", []) or [],
        "signature_patterns": brand.get("signature_patterns", []) or [],
        "palette_options": brand.get("palette_options", []) or [],
        "recommended_palette_id": brand.get("recommended_palette_id", "") or "",
        "selected_palette_id": brand.get("selected_palette_id", "") or "",
        "brand_name": brand.get("name", "") or "",
        "tagline": brand.get("tagline", "") or "",
        "palette": brand.get("palette", {}) or {},
        "story_en": brand.get("story_en", "") or "",
        "story_hi": brand.get("story_hi", "") or "",
        "logo_url": brand.get("logo_url", "") or "",
        "banner_url": brand.get("banner_url", "") or "",
        "kit_zip_url": brand.get("kit_zip_url", "") or "",
    }


async def _download_public_file(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


async def _rebuild_brand_kit(brand_id: str, state: BrandState) -> str:
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        if state.get("logo_url"):
            archive.writestr("logo.png", await _download_public_file(state["logo_url"]))
        if state.get("banner_url"):
            archive.writestr("banner.png", await _download_public_file(state["banner_url"]))
        archive.writestr("brand_story_en.txt", state.get("story_en", ""))
        archive.writestr("brand_story_hi.txt", state.get("story_hi", ""))
        archive.writestr("palette.json", json.dumps(state.get("palette", {}), indent=2))
        archive.writestr(
            "README.md",
            (
                f"# {state.get('brand_name')} - Brand Kit\n\n"
                f"Tagline: {state.get('tagline')}\n"
                f"Craft: {state.get('craft_id', '').replace('_', ' ').title()}\n"
                "Generated by Idanta\n"
            ),
        )

    return await upload_bytes(
        data=zip_buffer.getvalue(),
        path=f"brands/{brand_id}/brand_kit.zip",
        content_type="application/zip",
    )


async def _regenerate_logo_or_banner(state: BrandState, asset_type: str) -> str:
    visual_dna = await build_brand_visual_dna(state)
    if asset_type == "logo":
        prompt = (
            build_brand_asset_prompt(state, visual_dna, "logo")
            + f"\nStyle modifier: {FEEL_LOGO_STYLE.get(state.get('brand_feel', 'earthy'), FEEL_LOGO_STYLE['earthy'])}."
        )
        image_bytes, mime = await generate_image(prompt, width_hint=1024, height_hint=1024)
        return await upload_bytes(
            data=image_bytes,
            path=f"brands/{state['brand_id']}/logo.png",
            content_type=mime,
        )
    prompt = (
        build_brand_asset_prompt(state, visual_dna, "banner")
        + f"\nStyle modifier: {FEEL_BANNER_STYLE.get(state.get('brand_feel', 'earthy'), FEEL_BANNER_STYLE['earthy'])}."
    )
    image_bytes, mime = await generate_image(prompt, width_hint=1536, height_hint=768)
    return await upload_bytes(
        data=image_bytes,
        path=f"brands/{state['brand_id']}/banner.png",
        content_type=mime,
    )


async def _extract_visual_context_for_regeneration(state: BrandState) -> str:
    reference_images = state.get("reference_images", [])
    if not reference_images:
        return state.get("visual_context", "") or "No visual reference images provided."

    try:
        return await groq_vision_completion(
            system_prompt=(
                "You are an expert design analyst. Look at the attached artisan product/workplace images "
                "and extract a dense visual summary focusing on: dominant colors, textures, organic vs geometric "
                "shapes, traditional vs modern feel, and overall mood. Format as a 3-4 sentence paragraph."
            ),
            user_prompt="Analyze these images to establish the visual aesthetic for the artisan's brand.",
            image_urls=reference_images[:3],
        )
    except Exception as exc:
        logger.warning("Vision API failed during targeted regeneration: %s", exc)
        return state.get("visual_context", "") or f"Vision analysis failed: {exc}"


async def _prepare_state_for_text_regeneration(state: BrandState) -> BrandState:
    visual_context = await _extract_visual_context_for_regeneration(state)
    enriched_state: BrandState = {
        **state,
        "visual_context": visual_context,
    }
    example_context = build_example_context(enriched_state)
    return {
        **enriched_state,
        "verbal_examples": example_context["brand_name"] + example_context["tagline"],
        "visual_examples": example_context["logo"] + example_context["banner"],
    }


async def _build_identity_preview_state(payload: BrandCreateRequest, selected_palette: dict | None = None) -> BrandState:
    state: BrandState = {
        "job_id": str(uuid.uuid4()),
        "user_id": "",
        "craft_id": payload.craft_id,
        "artisan_name": payload.artisan_name,
        "region": payload.region,
        "years_of_experience": payload.years_of_experience,
        "generations_in_craft": payload.generations_in_craft,
        "primary_occasion": payload.primary_occasion.value,
        "target_customer": payload.target_customer.value,
        "brand_feel": payload.brand_feel.value,
        "script_preference": payload.script_preference.value,
        "artisan_story": payload.artisan_story,
        "preferred_language": payload.preferred_language,
        "reference_images": payload.reference_images,
        "palette": selected_palette or {},
    }
    return await context_builder_node(state)


def _load_design_pool() -> dict:
    design_pool_path = Path("data/design_pool.json")
    if not design_pool_path.exists():
        return {}
    with open(design_pool_path, encoding="utf-8") as file:
        return json.load(file)


def _normalize_hex(value: object, fallback: str) -> str:
    candidate = str(value or "").strip()
    if len(candidate) == 7 and candidate.startswith("#"):
        return candidate
    return fallback


def _coerce_palette(raw_palette: dict | None, fallback: dict | None = None) -> BrandPalettePayload:
    base = fallback or {
        "primary": "#8B2635",
        "secondary": "#4A7C59",
        "accent": "#C4963B",
        "background": "#F5E6C8",
    }
    raw_palette = raw_palette or {}
    return BrandPalettePayload(
        primary=_normalize_hex(raw_palette.get("primary"), base["primary"]),
        secondary=_normalize_hex(raw_palette.get("secondary"), base["secondary"]),
        accent=_normalize_hex(raw_palette.get("accent"), base["accent"]),
        background=_normalize_hex(raw_palette.get("background"), base.get("background", "#F5E6C8")),
    )


def _fallback_palette_options(state: BrandState, visual_summary: str) -> tuple[list[BrandPaletteOptionPayload], str]:
    del visual_summary
    craft_data = state.get("craft_data", {})
    traditional_colors = [str(item).strip() for item in craft_data.get("traditional_colors", {}).get("hex", []) if str(item).strip()]
    design_pool = _load_design_pool()
    pool_palettes = design_pool.get("palettes", [])

    fallback_sets = [
        {
            "option_id": "palette_option_1",
            "name": "Heritage Core",
            "rationale": "Best match for preserving a premium artisan feel while staying close to the uploaded references.",
            "palette": {
                "primary": traditional_colors[0] if len(traditional_colors) > 0 else "#8B2635",
                "secondary": traditional_colors[1] if len(traditional_colors) > 1 else "#4A7C59",
                "accent": traditional_colors[2] if len(traditional_colors) > 2 else "#C4963B",
                "background": "#F5E6C8",
            },
        },
        {
            "option_id": "palette_option_2",
            "name": pool_palettes[1]["name"] if len(pool_palettes) > 1 else "Royal Contrast",
            "rationale": "Adds richer contrast for a more elevated and boutique presentation.",
            "palette": {
                "primary": pool_palettes[1]["primary"] if len(pool_palettes) > 1 else "#1A2E5A",
                "secondary": pool_palettes[1]["secondary"] if len(pool_palettes) > 1 else "#4E3629",
                "accent": pool_palettes[1]["accent"] if len(pool_palettes) > 1 else "#D4AF37",
                "background": "#F6EFE3",
            },
        },
        {
            "option_id": "palette_option_3",
            "name": pool_palettes[3]["name"] if len(pool_palettes) > 3 else "Soft Modern",
            "rationale": "Keeps the craft visible but gives the brand a lighter, more contemporary shelf presence.",
            "palette": {
                "primary": pool_palettes[3]["primary"] if len(pool_palettes) > 3 else "#2F4F4F",
                "secondary": pool_palettes[3]["secondary"] if len(pool_palettes) > 3 else "#F5F5DC",
                "accent": pool_palettes[3]["accent"] if len(pool_palettes) > 3 else "#A9A9A9",
                "background": "#FBF7EF",
            },
        },
    ]

    options = [
        BrandPaletteOptionPayload(
            option_id=item["option_id"],
            name=item["name"],
            rationale=item["rationale"],
            palette=_coerce_palette(item["palette"]).model_dump(),
        )
        for item in fallback_sets
    ]
    return options, options[0].option_id


async def _build_palette_options(state: BrandState, visual_summary: str) -> tuple[list[BrandPaletteOptionPayload], str]:
    context = state.get("context_bundle", {})
    craft_data = state.get("craft_data", {})
    fallback_options, fallback_recommended = _fallback_palette_options(state, visual_summary)
    try:
        result = await groq_json_completion(
            system_prompt=(
                "You are a senior artisan brand color strategist.\n"
                "Return only JSON with this shape: "
                "{\"palette_options\": [{\"option_id\": \"palette_option_1\", \"name\": \"...\", \"rationale\": \"...\", "
                "\"palette\": {\"primary\": \"#000000\", \"secondary\": \"#111111\", \"accent\": \"#222222\", \"background\": \"#f5f1e8\"}}], "
                "\"recommended_palette_id\": \"palette_option_1\"}\n"
                "Rules:\n"
                "- Generate exactly 3 palette options.\n"
                "- Each option must feel distinct but still rooted in the craft and uploaded images.\n"
                "- All palette values must be valid 6-digit hex colors.\n"
                "- Rationale should explain the shelf or brand effect in 1 sentence.\n"
                "- recommended_palette_id must match one of the 3 option_ids.\n"
            ),
            user_prompt=(
                f"Craft: {context.get('craft_name', state.get('craft_id', '').replace('_', ' ').title())}\n"
                f"Region: {context.get('region', 'India')}\n"
                f"Brand feel: {state.get('brand_feel', 'earthy')}\n"
                f"Artisan story: {context.get('artisan_story', '')}\n"
                f"Traditional colors from library: {json.dumps(craft_data.get('traditional_colors', {}), ensure_ascii=False)}\n"
                f"Craft motifs from library: {json.dumps(craft_data.get('motifs', {}), ensure_ascii=False)}\n"
                f"Visual summary from uploaded images:\n{visual_summary}\n"
            ),
            max_tokens=1200,
            temperature=0.55,
        )
        raw_options = result.get("palette_options", [])
        options: list[BrandPaletteOptionPayload] = []
        for index, item in enumerate(raw_options[:3], start=1):
            palette = _coerce_palette(item.get("palette", {}), fallback_options[min(index - 1, len(fallback_options) - 1)].palette)
            option_id = str(item.get("option_id") or f"palette_option_{index}").strip() or f"palette_option_{index}"
            name = str(item.get("name") or f"Palette {index}").strip() or f"Palette {index}"
            rationale = str(item.get("rationale") or fallback_options[min(index - 1, len(fallback_options) - 1)].rationale).strip()
            options.append(
                BrandPaletteOptionPayload(
                    option_id=option_id,
                    name=name,
                    rationale=rationale,
                    palette=palette,
                )
            )
        if len(options) != 3:
            return fallback_options, fallback_recommended
        recommended_palette_id = str(result.get("recommended_palette_id") or "").strip()
        if recommended_palette_id not in {option.option_id for option in options}:
            recommended_palette_id = options[0].option_id
        return options, recommended_palette_id
    except Exception as exc:
        logger.warning("Palette option generation failed; using fallback options. Error: %s", exc)
        return fallback_options, fallback_recommended


async def _generate_preview_image(
    *,
    brand_id: str,
    category: str,
    index: int,
    title: str,
    description: str,
    craft_name: str,
    palette: BrandPalettePayload,
    visual_summary: str,
) -> str:
    prompt = (
        f"Create a premium artisan design board preview for {craft_name}. "
        f"Focus on {category}: {title}. "
        f"Description: {description}. "
        f"Use a clean presentation on a soft studio board, showing the motif or pattern clearly as a visual concept, not product photography. "
        f"Use this palette: primary {palette.primary}, secondary {palette.secondary}, accent {palette.accent}, background {palette.background or '#F5E6C8'}. "
        f"Visual cues: {visual_summary}. "
        "Keep it elegant, minimal, high contrast, and easy for a client to compare."
    )
    image_bytes, mime = await generate_image(prompt, width_hint=1024, height_hint=1024)
    return await upload_bytes(
        data=image_bytes,
        path=f"brands/{brand_id}/phase3/{category}_{index}.png",
        content_type=mime,
    )

async def _extract_visual_summary_from_images(image_urls: list[str]) -> str:
    if not image_urls:
        return "No visual reference images provided."
    try:
        return await groq_vision_completion(
            system_prompt=(
                "You are a senior craft visual researcher. Analyze the uploaded artisan product and workstation images and extract a dense visual summary. "
                "Focus on dominant colors, recurring motifs, line quality, textures, materials, shapes, pattern rhythm, handcrafted irregularities, and overall mood. "
                "Keep it factual, specific, and useful for brand design."
            ),
            user_prompt="Study these images and describe the visual design language that should inform the brand identity.",
            image_urls=image_urls[:6],
            max_tokens=700,
            temperature=0.4,
        )
    except Exception as exc:
        logger.warning("Visual summary extraction failed; using fallback summary. Error: %s", exc)
        return "Uploaded images suggest an artisan-made visual world with handcrafted texture, repeatable motifs, and a palette that should stay rooted, premium, and usable for brand design."


def _fallback_visual_foundation(state: BrandState, visual_summary: str) -> BrandVisualFoundationResponse:
    craft_data = state.get("craft_data", {})
    traditional_colors = craft_data.get("traditional_colors", {})
    motif_data = craft_data.get("motifs", {})
    primary_motifs = [str(item).strip() for item in motif_data.get("primary", []) if str(item).strip()]
    secondary_motifs = [str(item).strip() for item in motif_data.get("secondary", []) if str(item).strip()]
    motifs = (primary_motifs + secondary_motifs)[:5] or ["artisan linework", "handcrafted geometry", "material texture"]
    hex_values = [str(item).strip() for item in traditional_colors.get("hex", []) if str(item).strip()]
    palette = {
        "primary": hex_values[0] if len(hex_values) > 0 else "#8B2635",
        "secondary": hex_values[1] if len(hex_values) > 1 else "#4A7C59",
        "accent": hex_values[2] if len(hex_values) > 2 else "#C4963B",
        "background": "#F5E6C8",
    }
    patterns = [
        BrandPatternPayload(
            name="Signature Border Repeat",
            description=f"A repeat system built from {motifs[0]} accents and restrained spacing, using the brand palette for packaging edges and banner framing.",
        ),
        BrandPatternPayload(
            name="Motif Scatter Rhythm",
            description=f"A light premium pattern combining {motifs[min(1, len(motifs)-1)]} with subtle color contrast for backgrounds, story cards, and brand textures.",
        ),
    ]
    palette_options, recommended_palette_id = _fallback_palette_options(state, visual_summary)
    return BrandVisualFoundationResponse(
        brand_id="",
        reference_images=[],
        visual_summary=visual_summary,
        visual_motifs=motifs,
        motif_previews=[],
        signature_patterns=patterns,
        palette=palette,
        palette_options=palette_options,
        recommended_palette_id=recommended_palette_id,
        selected_palette_id=recommended_palette_id,
    )


async def _build_visual_foundation(state: BrandState, visual_summary: str) -> BrandVisualFoundationResponse:
    context = state.get("context_bundle", {})
    craft_data = state.get("craft_data", {})
    fallback_foundation = _fallback_visual_foundation(state, visual_summary)
    try:
        result = await groq_json_completion(
            system_prompt=(
                "You are a senior brand art director building the visual foundation for an artisan brand.\n"
                "Return only JSON with this shape: "
                "{\"visual_motifs\": [\"motif1\", \"motif2\", \"motif3\"], "
                "\"signature_patterns\": [{\"name\": \"...\", \"description\": \"...\"}], "
                "\"palette\": {\"primary\": \"#000000\", \"secondary\": \"#111111\", \"accent\": \"#222222\", \"background\": \"#f5f1e8\"}}\n"
                "Rules:\n"
                "- visual_motifs must be concise and design-usable.\n"
                "- signature_patterns must be created by combining motifs with color logic from the images.\n"
                "- palette colors must be valid hex codes.\n"
                "- Keep the output premium, craft-specific, and visually coherent.\n"
                "- Avoid generic motifs like flower if you can be more specific.\n"
            ),
            user_prompt=(
                f"Craft: {context.get('craft_name', state.get('craft_id', '').replace('_', ' ').title())}\n"
                f"Region: {context.get('region', 'India')}\n"
                f"Artisan story: {context.get('artisan_story', '')}\n"
                f"Craft motifs from library: {json.dumps(craft_data.get('motifs', {}), ensure_ascii=False)}\n"
                f"Traditional colors from library: {json.dumps(craft_data.get('traditional_colors', {}), ensure_ascii=False)}\n"
                f"Materials: {json.dumps(craft_data.get('materials', {}), ensure_ascii=False)}\n"
                f"Visual summary from uploaded images:\n{visual_summary}\n"
            ),
            max_tokens=1200,
            temperature=0.6,
        )
        patterns = [
            BrandPatternPayload(
                name=str(item.get("name", "")).strip(),
                description=str(item.get("description", "")).strip(),
            )
            for item in result.get("signature_patterns", [])
            if str(item.get("name", "")).strip() and str(item.get("description", "")).strip()
        ]
        motifs = [str(item).strip() for item in result.get("visual_motifs", []) if str(item).strip()]
        palette = result.get("palette", {}) or {}
        palette_options, recommended_palette_id = await _build_palette_options(state, visual_summary)
        selected_palette = next(
            (option.palette for option in palette_options if option.option_id == recommended_palette_id),
            _coerce_palette(palette, fallback_foundation.palette),
        )
        return BrandVisualFoundationResponse(
            brand_id="",
            reference_images=[],
            visual_summary=visual_summary,
            visual_motifs=motifs[:5] or fallback_foundation.visual_motifs,
            motif_previews=[],
            signature_patterns=patterns[:4] or fallback_foundation.signature_patterns,
            palette=selected_palette.model_dump(),
            palette_options=palette_options,
            recommended_palette_id=recommended_palette_id,
            selected_palette_id=recommended_palette_id,
        )
    except Exception as exc:
        logger.warning("Visual foundation LLM generation failed; using fallback foundation. Error: %s", exc)
        return fallback_foundation


async def _build_palette_only_foundation(state: BrandState, visual_summary: str, selected_palette_id: str | None = None) -> BrandVisualFoundationResponse:
    fallback_foundation = _fallback_visual_foundation(state, visual_summary)
    palette_options, recommended_palette_id = await _build_palette_options(state, visual_summary)
    effective_selected_palette_id = selected_palette_id if selected_palette_id in {option.option_id for option in palette_options} else None
    effective_palette = next(
        (option.palette for option in palette_options if option.option_id == effective_selected_palette_id),
        next((option.palette for option in palette_options if option.option_id == recommended_palette_id), fallback_foundation.palette),
    )
    return BrandVisualFoundationResponse(
        brand_id="",
        reference_images=[],
        visual_summary=visual_summary,
        visual_motifs=[],
        motif_previews=[],
        signature_patterns=[],
        palette=effective_palette.model_dump() if hasattr(effective_palette, "model_dump") else effective_palette,
        palette_options=palette_options,
        recommended_palette_id=recommended_palette_id,
        selected_palette_id=effective_selected_palette_id,
    )


async def _attach_visual_previews(
    *,
    foundation: BrandVisualFoundationResponse,
    state: BrandState,
    brand_id: str,
) -> BrandVisualFoundationResponse:
    craft_name = state.get("context_bundle", {}).get("craft_name", state.get("craft_id", "").replace("_", " ").title())
    selected_palette = _coerce_palette(foundation.palette)

    motif_previews: list[BrandMotifPreviewPayload] = []
    for index, motif in enumerate(foundation.visual_motifs[:3], start=1):
        try:
            image_url = await _generate_preview_image(
                brand_id=brand_id,
                category="motif",
                index=index,
                title=motif,
                description=f"An isolated motif exploration for {motif}.",
                craft_name=craft_name,
                palette=selected_palette,
                visual_summary=foundation.visual_summary,
            )
            motif_previews.append(
                BrandMotifPreviewPayload(
                    name=motif,
                    description=f"Motif direction based on uploaded references and craft heritage.",
                    image_url=image_url,
                )
            )
        except Exception as exc:
            logger.warning("Could not generate motif preview for brand=%s motif=%s: %s", brand_id, motif, exc)

    signature_patterns: list[BrandPatternPayload] = []
    for index, pattern in enumerate(foundation.signature_patterns[:3], start=1):
        try:
            image_url = await _generate_preview_image(
                brand_id=brand_id,
                category="pattern",
                index=index,
                title=pattern.name,
                description=pattern.description,
                craft_name=craft_name,
                palette=selected_palette,
                visual_summary=foundation.visual_summary,
            )
            signature_patterns.append(
                BrandPatternPayload(
                    name=pattern.name,
                    description=pattern.description,
                    image_url=image_url,
                )
            )
        except Exception as exc:
            logger.warning("Could not generate pattern preview for brand=%s pattern=%s: %s", brand_id, pattern.name, exc)
            signature_patterns.append(pattern)

    return BrandVisualFoundationResponse(
        brand_id=foundation.brand_id,
        reference_images=foundation.reference_images,
        visual_summary=foundation.visual_summary,
        visual_motifs=foundation.visual_motifs,
        motif_previews=motif_previews,
        signature_patterns=signature_patterns,
        palette=foundation.palette,
        palette_options=foundation.palette_options,
        recommended_palette_id=foundation.recommended_palette_id,
        selected_palette_id=foundation.selected_palette_id,
    )


def _build_identity_generation_prompt(
    state: BrandState,
    *,
    set_number: int,
    excluded_pairs: list[BrandIdentityPairPayload],
) -> str:
    context = state.get("context_bundle", {})
    craft_data = state.get("craft_data", {})
    example_context = build_example_context(state)
    excluded_text = "\n".join(
        f"- {pair.name} :: {pair.tagline}" for pair in excluded_pairs
    ) or "- none"
    variation_note = (
        "This is the first set. Focus on the strongest, most ownable, premium directions with emotional depth."
        if set_number == 1
        else "This is the second and final set. Explore clearly different directions from the first set while staying premium, rooted, and memorable."
    )

    return (
        f"Artisan name: {context.get('artisan_name', '')}\n"
        f"Craft: {context.get('craft_name', state.get('craft_id', '').replace('_', ' ').title())}\n"
        f"Region: {context.get('region', 'India')}\n"
        f"Years of experience: {context.get('years_of_experience', 0)}\n"
        f"Generations in craft: {context.get('generations_in_craft', 1)}\n"
        f"Primary occasion: {context.get('primary_occasion', 'general')}\n"
        f"Target customer: {context.get('target_customer', 'local_bazaar')}\n"
        f"Preferred language: {state.get('preferred_language', 'en')}\n"
        f"Script preference: {context.get('script_preference', 'english')}\n"
        f"Artisan story core: {context.get('artisan_story', '')}\n"
        f"Craft tone keywords: {', '.join(craft_data.get('brand_tone_keywords', []))}\n"
        f"Craft selling points: {json.dumps(craft_data.get('selling_points', []), ensure_ascii=False)}\n"
        f"Craft materials: {json.dumps(craft_data.get('materials', {}), ensure_ascii=False)}\n"
        f"Craft motifs: {json.dumps(craft_data.get('motifs', {}), ensure_ascii=False)}\n"
        f"RAG context:\n{state.get('rag_context', '')}\n\n"
        f"Retrieved brand name references:\n{format_examples_for_prompt(example_context['brand_name'])}\n\n"
        f"Retrieved tagline references:\n{format_examples_for_prompt(example_context['tagline'])}\n\n"
        f"Already shown pairs that must not be repeated:\n{excluded_text}\n\n"
        f"{variation_note}\n\n"
        "Creative direction:\n"
        "- Prefer names that feel ownable, sharp, and emotionally resonant.\n"
        "- Draw from regional/craft meaning, materiality, motif, memory, rhythm, lineage, or maker philosophy.\n"
        "- Avoid names that sound generic, corporate, templated, or like placeholder Sanskrit words.\n"
        "- Avoid weak fillers like Craft, Handmade, Studio, India Art, Heritage Crafts unless absolutely necessary.\n"
        "- Each pair should feel like a distinct brand world, not six variations of the same naming formula.\n"
        "- Taglines should complement the name, not repeat it.\n"
        "- Prioritize names a premium customer would remember after hearing once."
    )


async def _generate_identity_pairs(
    state: BrandState,
    *,
    set_number: int,
    excluded_pairs: list[BrandIdentityPairPayload],
) -> list[BrandIdentityPairPayload]:
    result = await groq_json_completion(
        system_prompt=(
            "You are an expert Indian artisan brand strategist.\n"
            "Return only JSON with this shape: {\"pairs\": [{\"pair_id\": \"pair_1\", \"name\": \"...\", \"tagline\": \"...\", \"why_it_fits\": \"...\"}]}\n"
            "Rules:\n"
            "- Generate exactly 6 unique name and tagline pairs.\n"
            "- Each brand name must be 1-2 words and feel premium, rooted, memorable, and ownable.\n"
            "- Prefer names with emotional pull, sonic elegance, and clear distinctiveness.\n"
            "- Avoid generic filler like Craft, Handmade, India Art, Studio, Heritage, Creations unless truly essential.\n"
            "- Avoid bland names that could fit any artisan from any craft.\n"
            "- At least 4 of the 6 names should come from clearly different naming angles, for example material-led, motif-led, lineage-led, region-led, or feeling-led.\n"
            "- Each tagline must stay under 8 words.\n"
            "- Use the craft context, artisan context, RAG context, and retrieved examples as guidance only.\n"
            "- Never copy the retrieved examples verbatim.\n"
            "- The second set must feel meaningfully different from the first set if exclusions are provided.\n"
            "- Keep taglines aligned with the requested script preference.\n"
            "- why_it_fits should be specific and useful, not generic praise.\n"
        ),
        user_prompt=_build_identity_generation_prompt(state, set_number=set_number, excluded_pairs=excluded_pairs),
        max_tokens=1800,
        temperature=0.9 if set_number == 2 else 0.75,
    )

    raw_pairs = result.get("pairs", [])
    pairs: list[BrandIdentityPairPayload] = []
    seen: set[tuple[str, str]] = set()
    for index, raw_pair in enumerate(raw_pairs, start=1):
        name = str(raw_pair.get("name", "")).strip()
        tagline = str(raw_pair.get("tagline", "")).strip()
        if not name or not tagline:
            continue
        key = (name.lower(), tagline.lower())
        if key in seen:
            continue
        seen.add(key)
        pairs.append(
            BrandIdentityPairPayload(
                pair_id=f"set_{set_number}_{str(raw_pair.get('pair_id') or f'pair_{index}').strip().replace(' ', '_').lower()}",
                name=name,
                tagline=tagline,
                why_it_fits=str(raw_pair.get("why_it_fits", "")).strip() or None,
            )
        )
        if len(pairs) == 6:
            break

    if len(pairs) != 6:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not generate a full identity set right now. Please try again.",
        )

    return pairs


async def _regenerate_tagline(state: BrandState) -> str:
    context = state.get("context_bundle", {})
    example_context = build_example_context(state)
    result = await groq_json_completion(
        system_prompt=(
            "You are an expert Indian artisan brand copywriter.\n"
            "Output only JSON: {\"tagline\": \"...\"}\n"
            "Rules: keep it under 8 words, premium tone, specific to craft, non-generic.\n"
            "Use the retrieved tagline examples as quality references only. Do not copy them."
        ),
        user_prompt=(
            f"Brand name: {state.get('brand_name')}\n"
            f"Craft: {context.get('craft_name', state.get('craft_id', '').replace('_', ' ').title())}\n"
            f"Region: {context.get('region')}\n"
            f"Brand feel: {context.get('brand_feel', 'earthy')}\n"
            f"Target customer: {context.get('target_customer', 'local_bazaar')}\n"
            f"Script preference: {context.get('script_preference', 'both')}\n"
            f"Artisan story: {context.get('artisan_story', '')}\n"
            f"Current tagline: {state.get('tagline', '')}\n"
            f"Visual context: {state.get('visual_context', '')}\n"
            f"RAG context: {state.get('rag_context', '')}\n\n"
            f"Retrieved tagline examples:\n{format_examples_for_prompt(example_context['tagline'])}"
        ),
        max_tokens=120,
        temperature=0.7,
    )
    return str(result.get("tagline") or state.get("tagline") or "").strip()


async def _regenerate_name_and_tagline(state: BrandState) -> tuple[str, str]:
    context = state.get("context_bundle", {})
    example_context = build_example_context(state)
    result = await groq_json_completion(
        system_prompt=(
            "You are an expert Indian artisan brand strategist.\n"
            "Output only JSON: {\"brand_name\": \"...\", \"tagline\": \"...\"}\n"
            "Rules: brand_name should be premium 1-2 words, culturally rooted and distinct.\n"
            "Tagline must be under 8 words and aligned with the same identity.\n"
            "Use the retrieved naming and tagline examples as quality references only. Do not copy them."
        ),
        user_prompt=(
            f"Current brand name: {state.get('brand_name')}\n"
            f"Current tagline: {state.get('tagline')}\n"
            f"Craft: {context.get('craft_name', state.get('craft_id', '').replace('_', ' ').title())}\n"
            f"Region: {context.get('region')}\n"
            f"Brand feel: {context.get('brand_feel', 'earthy')}\n"
            f"Target customer: {context.get('target_customer', 'local_bazaar')}\n"
            f"Script preference: {context.get('script_preference', 'both')}\n"
            f"Artisan story: {context.get('artisan_story', '')}\n"
            f"Visual context: {state.get('visual_context', '')}\n"
            f"RAG context: {state.get('rag_context', '')}\n\n"
            f"Retrieved brand name examples:\n{format_examples_for_prompt(example_context['brand_name'])}\n\n"
            f"Retrieved tagline examples:\n{format_examples_for_prompt(example_context['tagline'])}"
        ),
        max_tokens=220,
        temperature=0.8,
    )
    next_name = str(result.get("brand_name") or state.get("brand_name") or "").strip()
    next_tagline = str(result.get("tagline") or state.get("tagline") or "").strip()
    return next_name, next_tagline


async def _run_targeted_regeneration(
    job_id: str,
    user_id: str,
    brand: dict,
    asset_type: str,
    provided_name: str | None = None,
    provided_tagline: str | None = None,
) -> None:
    try:
        state = _build_state_from_brand(job_id, user_id, brand)
        supabase.table("jobs").update(
            {
                "status": "running",
                "current_step": f"Preparing {asset_type} regeneration...",
                "percent": 15,
            }
        ).eq("id", job_id).execute()

        state = await context_builder_node(state)
        updates: dict = {}

        if asset_type in ("logo", "banner"):
            supabase.table("jobs").update(
                {
                    "current_step": f"Regenerating brand {asset_type}...",
                    "percent": 55,
                }
            ).eq("id", job_id).execute()
            generated_url = await _regenerate_logo_or_banner(state, asset_type)
            updates[f"{asset_type}_url"] = generated_url
            state[f"{asset_type}_url"] = generated_url
        elif asset_type == "tagline":
            state = await _prepare_state_for_text_regeneration(state)
            supabase.table("jobs").update(
                {
                    "current_step": "Regenerating tagline...",
                    "percent": 55,
                }
            ).eq("id", job_id).execute()
            tagline = await _regenerate_tagline(state)
            updates["tagline"] = tagline
            state["tagline"] = tagline
        elif asset_type == "name":
            state = await _prepare_state_for_text_regeneration(state)
            supabase.table("jobs").update(
                {
                    "current_step": "Regenerating brand name...",
                    "percent": 45,
                }
            ).eq("id", job_id).execute()
            next_name, next_tagline = await _regenerate_name_and_tagline(state)
            updates["name"] = next_name
            updates["tagline"] = next_tagline
            state["brand_name"] = next_name
            state["tagline"] = next_tagline

            supabase.table("jobs").update(
                {
                    "current_step": "Refreshing logo for brand consistency...",
                    "percent": 70,
                }
            ).eq("id", job_id).execute()
            logo_url = await _regenerate_logo_or_banner(state, "logo")
            updates["logo_url"] = logo_url
            state["logo_url"] = logo_url
        elif asset_type == "identity":
            if provided_name:
                updates["name"] = provided_name.strip()
                state["brand_name"] = provided_name.strip()
            if provided_tagline:
                updates["tagline"] = provided_tagline.strip()
                state["tagline"] = provided_tagline.strip()

            supabase.table("jobs").update(
                {
                    "current_step": "Refreshing logo after identity edit...",
                    "percent": 70,
                }
            ).eq("id", job_id).execute()
            logo_url = await _regenerate_logo_or_banner(state, "logo")
            updates["logo_url"] = logo_url
            state["logo_url"] = logo_url
        else:
            raise ValueError("Unsupported asset type.")

        supabase.table("jobs").update(
            {
                "current_step": "Refreshing brand kit...",
                "percent": 85,
            }
        ).eq("id", job_id).execute()
        kit_zip_url = await _rebuild_brand_kit(brand["id"], state)
        updates["kit_zip_url"] = kit_zip_url

        supabase.table("brands").update(updates).eq("id", brand["id"]).eq("user_id", user_id).execute()
        supabase.table("jobs").update(
            {
                "status": "done",
                "current_step": f"{asset_type.title()} regenerated.",
                "percent": 100,
                "ref_id": brand["id"],
            }
        ).eq("id", job_id).execute()
    except Exception as exc:
        logger.error("Targeted brand regeneration failed (asset=%s): %s", asset_type, exc)
        supabase.table("jobs").update(
            {
                "status": "failed",
                "current_step": "Something went wrong",
                "error": f"Could not regenerate {asset_type}. Please try again.",
            }
        ).eq("id", job_id).execute()


def _list_crafts() -> list[CraftInfo]:
    crafts: list[CraftInfo] = []
    for file_path in LIBRARY_DIR.glob("*.json"):
        try:
            with open(file_path, encoding="utf-8") as file:
                data = json.load(file)
            crafts.append(
                CraftInfo(
                    craft_id=data["craft_id"],
                    display_name=data.get("display_name", data["craft_id"]),
                    region=data.get("region", "India"),
                    description=data.get("description", ""),
                )
            )
        except Exception as exc:
            logger.warning("Failed to parse craft file %s: %s", file_path.name, exc)
    return crafts


@router.get(
    "/crafts",
    response_model=list[CraftInfo],
    summary="List all supported craft types",
    tags=["Crafts"],
)
async def get_crafts():
    return _list_crafts()


@router.post(
    "/identity-candidates",
    response_model=BrandIdentityGenerateResponse,
    summary="Generate brand name and tagline candidate pairs",
    tags=["Brands"],
)
async def generate_brand_identity_candidates(
    payload: BrandIdentityGenerateRequest,
    user_id: str = Depends(get_current_user_id),
):
    del user_id
    state = await _build_identity_preview_state(payload)
    pairs = await _generate_identity_pairs(
        state,
        set_number=payload.set_number,
        excluded_pairs=payload.excluded_pairs,
    )
    return BrandIdentityGenerateResponse(
        set_number=payload.set_number,
        pairs=pairs,
        has_more=payload.set_number < 2,
    )


@router.post(
    "/identity-rank",
    response_model=BrandIdentityRankResponse,
    summary="Rank shortlisted brand identity pairs",
    tags=["Brands"],
)
async def rank_brand_identity_candidates(
    payload: BrandIdentityRankRequest,
    user_id: str = Depends(get_current_user_id),
):
    del user_id
    state = await _build_identity_preview_state(payload)
    selected_json = json.dumps([pair.model_dump() for pair in payload.selected_pairs], ensure_ascii=False, indent=2)
    result = await groq_json_completion(
        system_prompt=(
            "You are an expert Indian artisan brand strategist.\n"
            "Return only JSON with this shape: "
            "{\"ranked_pairs\": [{\"pair_id\": \"...\", \"rank\": 1, \"name\": \"...\", \"tagline\": \"...\", \"explanation\": \"...\"}], "
            "\"recommended_pair_id\": \"...\", \"next_prompt\": \"...\"}\n"
            "Rules:\n"
            "- Rank all shortlisted pairs from strongest to weakest.\n"
            "- Keep explanations specific to the artisan context, craft context, and market context.\n"
            "- next_prompt should ask the user to choose the final identity in a warm conversational tone.\n"
        ),
        user_prompt=(
            f"Craft context:\n{state.get('rag_context', '')}\n\n"
            f"Context bundle:\n{json.dumps(state.get('context_bundle', {}), ensure_ascii=False, indent=2)}\n\n"
            f"Shortlisted pairs:\n{selected_json}"
        ),
        max_tokens=1400,
        temperature=0.5,
    )

    ranked_pairs = [
        RankedBrandIdentityPairPayload(
            pair_id=str(item.get("pair_id", "")),
            rank=int(item.get("rank", index + 1)),
            name=str(item.get("name", "")).strip(),
            tagline=str(item.get("tagline", "")).strip(),
            explanation=str(item.get("explanation", "")).strip(),
        )
        for index, item in enumerate(result.get("ranked_pairs", []))
        if str(item.get("pair_id", "")).strip()
    ]
    if not ranked_pairs:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not rank the shortlisted identity pairs right now. Please try again.",
        )

    return BrandIdentityRankResponse(
        ranked_pairs=ranked_pairs,
        recommended_pair_id=result.get("recommended_pair_id"),
        next_prompt=str(result.get("next_prompt") or "Inme se kaunsa pair aap final karna chahoge?"),
    )


@router.post(
    "/identity-draft",
    response_model=SaveBrandIdentityDraftResponse,
    summary="Save the selected brand identity as a pending draft",
    tags=["Brands"],
)
async def save_brand_identity_draft(
    payload: SaveBrandIdentityDraftRequest,
    user_id: str = Depends(get_current_user_id),
):
    brand_record = {
        "user_id": user_id,
        "craft_id": payload.craft_id,
        "artisan_name": payload.artisan_name,
        "region": payload.region,
        "preferred_language": payload.preferred_language,
        "generations_in_craft": payload.generations_in_craft,
        "years_of_experience": payload.years_of_experience,
        "primary_occasion": payload.primary_occasion.value,
        "target_customer": payload.target_customer.value,
        "brand_feel": payload.brand_feel.value,
        "artisan_story": payload.artisan_story,
        "script_preference": payload.script_preference.value,
        "name": payload.name.strip(),
        "tagline": payload.tagline.strip(),
        "status": "pending",
    }

    if payload.brand_id:
        existing = (
            supabase.table("brands")
            .select("id")
            .eq("id", payload.brand_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand draft not found.")
        updated = (
            supabase.table("brands")
            .update(brand_record)
            .eq("id", payload.brand_id)
            .eq("user_id", user_id)
            .execute()
        )
        brand_id = updated.data[0]["id"]
    else:
        inserted = supabase.table("brands").insert(brand_record).execute()
        brand_id = inserted.data[0]["id"]

    return SaveBrandIdentityDraftResponse(
        brand_id=brand_id,
        name=brand_record["name"],
        tagline=brand_record["tagline"],
    )


@router.post(
    "/visual-foundation",
    response_model=BrandVisualFoundationResponse,
    summary="Analyze uploaded brand images into motifs, palette, and signature patterns",
    tags=["Brands"],
)
async def build_brand_visual_foundation(
    payload: BrandVisualFoundationRequest,
    user_id: str = Depends(get_current_user_id),
):
    if not payload.brand_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="brand_id is required for visual foundation.")
    existing = (
        supabase.table("brands")
        .select("id, palette, selected_palette_id")
        .eq("id", payload.brand_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand draft not found.")

    try:
        existing_brand = existing.data or {}
        selected_palette = existing_brand.get("palette") if existing_brand.get("selected_palette_id") else None
        state = await _build_identity_preview_state(payload, selected_palette=selected_palette)
        visual_summary = await _extract_visual_summary_from_images(payload.reference_images)
        if payload.generate_visual_assets:
            if not existing_brand.get("selected_palette_id") or not selected_palette:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Please select a color palette before generating motif and pattern visuals.",
                )
            foundation = await _build_visual_foundation(state, visual_summary)
            foundation = await _attach_visual_previews(
                foundation=BrandVisualFoundationResponse(
                    brand_id=payload.brand_id,
                    reference_images=payload.reference_images,
                    visual_summary=foundation.visual_summary,
                    visual_motifs=foundation.visual_motifs,
                    motif_previews=foundation.motif_previews,
                    signature_patterns=foundation.signature_patterns,
                    palette=selected_palette,
                    palette_options=foundation.palette_options,
                    recommended_palette_id=foundation.recommended_palette_id,
                    selected_palette_id=existing_brand.get("selected_palette_id"),
                ),
                state={**state, "palette": selected_palette},
                brand_id=payload.brand_id,
            )
        else:
            foundation = await _build_palette_only_foundation(
                state,
                visual_summary,
                selected_palette_id=existing_brand.get("selected_palette_id"),
            )
            foundation = BrandVisualFoundationResponse(
                brand_id=payload.brand_id,
                reference_images=payload.reference_images,
                visual_summary=foundation.visual_summary,
                visual_motifs=[],
                motif_previews=[],
                signature_patterns=[],
                palette=foundation.palette,
                palette_options=foundation.palette_options,
                recommended_palette_id=foundation.recommended_palette_id,
                selected_palette_id=foundation.selected_palette_id,
            )

        updates = {
            "reference_images": payload.reference_images,
            "visual_summary": foundation.visual_summary,
            "visual_motifs": foundation.visual_motifs,
            "motif_previews": [preview.model_dump() for preview in foundation.motif_previews],
            "signature_patterns": [pattern.model_dump() for pattern in foundation.signature_patterns],
            "palette": foundation.palette,
            "palette_options": [option.model_dump() for option in foundation.palette_options],
            "recommended_palette_id": foundation.recommended_palette_id,
            "selected_palette_id": foundation.selected_palette_id,
        }
        try:
            supabase.table("brands").update(updates).eq("id", payload.brand_id).eq("user_id", user_id).execute()
        except APIError as exc:
            logger.warning("Could not persist full visual foundation for brand=%s: %s", payload.brand_id, exc)
            try:
                supabase.table("brands").update(
                    {
                        "palette": foundation.palette,
                        "selected_palette_id": foundation.selected_palette_id,
                    }
                ).eq("id", payload.brand_id).eq("user_id", user_id).execute()
            except APIError as palette_exc:
                logger.warning("Could not persist fallback palette for brand=%s: %s", payload.brand_id, palette_exc)

        return foundation
    except Exception as exc:
        logger.exception("Visual foundation generation failed for brand=%s", payload.brand_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not generate visual foundation right now. {exc}",
        ) from exc


@router.post(
    "/",
    response_model=JobCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start brand onboarding",
    tags=["Brands"],
)
async def create_brand(
    payload: BrandCreateRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    pending = (
        supabase.table("jobs")
        .select("id")
        .eq("user_id", user_id)
        .eq("job_type", "brand_onboarding")
        .in_("status", ["queued", "running"])
        .execute()
    )
    if pending.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A brand creation job is already in progress for this account.",
        )

    job_result = (
        supabase.table("jobs")
        .insert(
            {
                "user_id": user_id,
                "job_type": "brand_onboarding",
                "status": "queued",
                "current_step": "Job queued...",
                "percent": 0,
            }
        )
        .execute()
    )
    job_id = job_result.data[0]["id"]

    existing_brand_id = None
    existing_brand = None
    if payload.brand_id:
        existing = (
            supabase.table("brands")
            .select("*")
            .eq("id", payload.brand_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand draft not found.")
        existing_brand_id = payload.brand_id
        existing_brand = existing.data

    initial_state: BrandState = {
        "job_id": job_id,
        "brand_id": existing_brand_id,
        "user_id": user_id,
        "craft_id": payload.craft_id,
        "artisan_name": payload.artisan_name,
        "region": payload.region,
        "years_of_experience": payload.years_of_experience,
        "generations_in_craft": payload.generations_in_craft,
        "primary_occasion": payload.primary_occasion.value,
        "target_customer": payload.target_customer.value,
        "brand_feel": payload.brand_feel.value,
        "script_preference": payload.script_preference.value,
        "artisan_story": payload.artisan_story,
        "preferred_language": payload.preferred_language,
        "reference_images": payload.reference_images or (existing_brand.get("reference_images", []) if existing_brand else []),
        "brand_name": payload.name or "",
        "tagline": payload.tagline or "",
        "identity_locked": bool(payload.name and payload.tagline),
        "palette": existing_brand.get("palette", {}) if existing_brand else {},
        "visual_summary": existing_brand.get("visual_summary", "") if existing_brand else "",
        "visual_motifs": existing_brand.get("visual_motifs", []) if existing_brand else [],
        "motif_previews": existing_brand.get("motif_previews", []) if existing_brand else [],
        "signature_patterns": existing_brand.get("signature_patterns", []) if existing_brand else [],
        "palette_options": existing_brand.get("palette_options", []) if existing_brand else [],
        "recommended_palette_id": existing_brand.get("recommended_palette_id", "") if existing_brand else "",
        "selected_palette_id": existing_brand.get("selected_palette_id", "") if existing_brand else "",
    }

    background_tasks.add_task(run_brand_graph, initial_state)

    logger.info("Brand onboarding job enqueued: job_id=%s, user_id=%s", job_id, user_id)
    return JobCreateResponse(
        job_id=job_id,
        message="Brand creation started. Poll /api/v1/jobs/{job_id}/status for progress.",
    )


@router.post(
    "/upload-images",
    response_model=list[str],
    summary="Upload reference images for brand onboarding",
    tags=["Brands"],
)
async def upload_brand_images(
    photos: list[UploadFile] = File(...),
    user_id: str = Depends(get_current_user_id),
):
    photo_urls: list[str] = []
    session_id = str(uuid.uuid4())[:8]
    for index, photo in enumerate(photos[:3]):
        content = await photo.read()
        ext = photo.filename.rsplit(".", 1)[-1] if photo.filename and "." in photo.filename else "jpg"
        storage_path = f"brands/temp_{user_id}/{session_id}_{index}.{ext}"
        url = await upload_bytes(
            data=content,
            path=storage_path,
            content_type=photo.content_type or "image/jpeg",
        )
        photo_urls.append(url)
    return photo_urls


@router.patch(
    "/{brand_id}/palette-selection",
    response_model=BrandPaletteSelectionResponse,
    summary="Select one of the generated Phase 3 palette options",
    tags=["Brands"],
)
async def select_brand_palette_option(
    brand_id: str,
    payload: BrandPaletteSelectionRequest,
    user_id: str = Depends(get_current_user_id),
):
    result = (
        supabase.table("brands")
        .select("id, palette_options")
        .eq("id", brand_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")

    palette_options = result.data.get("palette_options") or []
    selected_option = next(
        (option for option in palette_options if str(option.get("option_id", "")).strip() == payload.option_id.strip()),
        None,
    )
    if not selected_option:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Palette option not found for this brand.")

    palette = selected_option.get("palette") or {}
    supabase.table("brands").update(
        {
            "palette": palette,
            "selected_palette_id": payload.option_id.strip(),
            "visual_motifs": [],
            "motif_previews": [],
            "signature_patterns": [],
        }
    ).eq("id", brand_id).eq("user_id", user_id).execute()

    return BrandPaletteSelectionResponse(
        selected_palette_id=payload.option_id.strip(),
        palette=palette,
    )


@router.get(
    "/{brand_id}",
    response_model=BrandPublic,
    summary="Get brand by ID",
    tags=["Brands"],
)
async def get_brand(
    brand_id: str,
    user_id: str = Depends(get_current_user_id),
):
    result = (
        supabase.table("brands")
        .select("*")
        .eq("id", brand_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")
    return result.data


@router.post(
    "/{brand_id}/generate",
    response_model=JobCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Regenerate brand assets for an existing brand",
    tags=["Brands"],
)
async def regenerate_brand(
    brand_id: str,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    result = (
        supabase.table("brands")
        .select("*")
        .eq("id", brand_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")

    pending = (
        supabase.table("jobs")
        .select("id")
        .eq("user_id", user_id)
        .in_("job_type", ["brand_onboarding", "brand_asset_regeneration"])
        .eq("ref_id", brand_id)
        .in_("status", ["queued", "running"])
        .execute()
    )
    if pending.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Brand assets are already being generated.",
        )

    brand = result.data
    job_result = (
        supabase.table("jobs")
        .insert(
            {
                "user_id": user_id,
                "job_type": "brand_onboarding",
                "ref_id": brand_id,
                "status": "queued",
                "current_step": "Job queued...",
                "percent": 0,
            }
        )
        .execute()
    )
    job_id = job_result.data[0]["id"]

    initial_state: BrandState = {
        "job_id": job_id,
        "brand_id": brand_id,
        "user_id": user_id,
        "craft_id": brand["craft_id"],
        "artisan_name": brand.get("artisan_name") or "",
        "region": brand.get("region") or "",
        "years_of_experience": brand.get("years_of_experience", 0),
        "generations_in_craft": brand.get("generations_in_craft", 1),
        "primary_occasion": brand.get("primary_occasion", "general"),
        "target_customer": brand.get("target_customer", "local_bazaar"),
        "brand_feel": brand.get("brand_feel", "earthy"),
        "script_preference": brand.get("script_preference", "both"),
        "artisan_story": brand.get("artisan_story"),
        "preferred_language": brand.get("preferred_language", "hi"),
        "reference_images": brand.get("reference_images", []),
        "palette": brand.get("palette", {}) or {},
        "palette_options": brand.get("palette_options", []) or [],
        "recommended_palette_id": brand.get("recommended_palette_id", "") or "",
        "selected_palette_id": brand.get("selected_palette_id", "") or "",
    }

    background_tasks.add_task(run_brand_graph, initial_state)

    logger.info("Brand regeneration job enqueued: job_id=%s, brand_id=%s", job_id, brand_id)
    return JobCreateResponse(
        job_id=job_id,
        message="Brand regeneration started. Poll /api/v1/jobs/{job_id}/status for progress.",
    )


@router.post(
    "/{brand_id}/regenerate-asset",
    response_model=JobCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Regenerate a specific brand asset",
    tags=["Brands"],
)
async def regenerate_brand_asset(
    brand_id: str,
    payload: RegenerateAssetRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    asset_type = payload.asset_type.strip().lower()
    if asset_type not in {"logo", "banner", "tagline", "name", "identity"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="asset_type must be logo, banner, tagline, name, or identity.")

    result = (
        supabase.table("brands")
        .select("*")
        .eq("id", brand_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")
    brand = result.data

    pending = (
        supabase.table("jobs")
        .select("id")
        .eq("user_id", user_id)
        .in_("job_type", ["brand_onboarding", "brand_asset_regeneration"])
        .eq("ref_id", brand_id)
        .in_("status", ["queued", "running"])
        .execute()
    )
    if pending.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A brand generation job is already in progress.",
        )

    job_id, created_job_type = _create_targeted_job(user_id, brand_id, asset_type)
    background_tasks.add_task(_run_targeted_regeneration, job_id, user_id, brand, asset_type, payload.name, payload.tagline)
    return JobCreateResponse(
        job_id=job_id,
        message=f"{asset_type.title()} regeneration started ({created_job_type}). Poll /api/v1/jobs/{job_id}/status for progress.",
    )


@router.patch(
    "/{brand_id}/identity",
    response_model=BrandPublic,
    summary="Update brand name and tagline",
    tags=["Brands"],
)
async def update_brand_identity(
    brand_id: str,
    payload: BrandIdentityUpdateRequest,
    user_id: str = Depends(get_current_user_id),
):
    name = payload.name.strip()
    tagline = payload.tagline.strip()
    if len(name) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Brand name is too short.")
    if len(tagline) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tagline is too short.")

    updated = (
        supabase.table("brands")
        .update({"name": name, "tagline": tagline})
        .eq("id", brand_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not updated.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")
    return updated.data[0]
