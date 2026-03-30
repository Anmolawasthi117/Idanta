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
import asyncio
import re
from collections import Counter

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field
from PIL import Image

from app.agents.nodes.context_builder import context_builder_node
from app.services.asset_prompt_service import build_brand_asset_prompt, build_brand_visual_dna
from app.services.asset_example_pool import build_example_context, format_examples_for_prompt
from app.services.gemini_image_service import generate_image
from app.services.logo_reference_service import get_logo_reference_library_summary
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


class BrandAssetCandidatePayload(BaseModel):
    candidate_id: str
    image_url: str
    title: str
    rationale: str


class BrandPhaseFourCandidatesResponse(BaseModel):
    brand_id: str
    logos: list[BrandAssetCandidatePayload]
    banners: list[BrandAssetCandidatePayload]


class BrandPhaseFourSelectionRequest(BaseModel):
    logo_url: str
    banner_url: str


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
    enriched_state: BrandState = {
        **state,
        "logo_reference_library_summary": await get_logo_reference_library_summary(),
    }
    if asset_type == "logo":
        prompt = (
            build_brand_asset_prompt(enriched_state, visual_dna, "logo")
            + f"\nStyle modifier: {FEEL_LOGO_STYLE.get(state.get('brand_feel', 'earthy'), FEEL_LOGO_STYLE['earthy'])}."
        )
        image_bytes, mime = await generate_image(prompt, width_hint=1024, height_hint=1024)
        return await upload_bytes(
            data=image_bytes,
            path=f"brands/{state['brand_id']}/logo.png",
            content_type=mime,
        )
    prompt = (
        build_brand_asset_prompt(enriched_state, visual_dna, "banner")
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


def _normalize_hex(value: object, fallback: str) -> str:
    candidate = str(value or "").strip()
    if len(candidate) == 7 and candidate.startswith("#") and re.fullmatch(r"#[0-9A-Fa-f]{6}", candidate):
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


def _rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def _mix_hex(hex_a: str, hex_b: str, ratio_b: float) -> str:
    ratio = max(0.0, min(1.0, ratio_b))
    a = _hex_to_rgb(hex_a)
    b = _hex_to_rgb(hex_b)
    mixed = (
        int(round(a[0] * (1 - ratio) + b[0] * ratio)),
        int(round(a[1] * (1 - ratio) + b[1] * ratio)),
        int(round(a[2] * (1 - ratio) + b[2] * ratio)),
    )
    return _rgb_to_hex(mixed)


def _color_distance(hex_a: str, hex_b: str) -> float:
    ar, ag, ab = _hex_to_rgb(hex_a)
    br, bg, bb = _hex_to_rgb(hex_b)
    return ((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2) ** 0.5


def _dedupe_swatches(swatches: list[tuple[str, int]], *, min_distance: float = 44.0, max_colors: int = 8) -> list[tuple[str, int]]:
    deduped: list[tuple[str, int]] = []
    for color, count in swatches:
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
            continue
        if any(_color_distance(color, existing) < min_distance for existing, _ in deduped):
            continue
        deduped.append((color.upper(), int(count)))
        if len(deduped) >= max_colors:
            break
    return deduped


def _select_distinct_color(candidates: list[str], anchors: list[str], fallback: str) -> str:
    for candidate in candidates:
        if all(_color_distance(candidate, anchor) >= 36 for anchor in anchors):
            return candidate
    return fallback


async def _extract_image_color_swatches(image_urls: list[str], *, max_images: int = 6, colors_per_image: int = 12) -> list[tuple[str, int]]:
    if not image_urls:
        return []
    counter: Counter[str] = Counter()
    async with httpx.AsyncClient(timeout=30.0) as client:
        for url in image_urls[:max_images]:
            try:
                response = await client.get(url)
                response.raise_for_status()
                with Image.open(io.BytesIO(response.content)) as image:
                    rgb_image = image.convert("RGB")
                    rgb_image.thumbnail((240, 240))
                    quantized = rgb_image.convert("P", palette=Image.ADAPTIVE, colors=colors_per_image)
                    palette = quantized.getpalette() or []
                    color_counts = quantized.getcolors(maxcolors=240 * 240) or []
                    for count, color_index in color_counts:
                        base = int(color_index) * 3
                        if base + 2 >= len(palette):
                            continue
                        rgb = (int(palette[base]), int(palette[base + 1]), int(palette[base + 2]))
                        counter[_rgb_to_hex(rgb)] += int(count)
            except Exception as exc:
                logger.warning("Could not sample colors from image %s: %s", url, exc)
    sorted_swatches = sorted(counter.items(), key=lambda item: item[1], reverse=True)
    return _dedupe_swatches(sorted_swatches)


def _fallback_palette_options(swatches: list[tuple[str, int]]) -> tuple[list[BrandPaletteOptionPayload], str]:
    dominant = [color for color, _ in swatches]
    defaults = [
        dominant[0] if len(dominant) > 0 else "#8B2635",
        dominant[1] if len(dominant) > 1 else "#4A7C59",
        dominant[2] if len(dominant) > 2 else "#C4963B",
        dominant[3] if len(dominant) > 3 else "#2E4057",
    ]
    primary = defaults[0]
    secondary = _select_distinct_color(defaults[1:] + [primary], [primary], defaults[1])
    accent = _select_distinct_color(defaults[2:] + [secondary], [primary, secondary], defaults[2])
    tertiary = _select_distinct_color(defaults[3:] + [accent], [primary, secondary, accent], defaults[3])

    fallback_sets = [
        {
            "option_id": "palette_option_1",
            "name": "Image Core",
            "rationale": "Closest translation of dominant colors from the uploaded images.",
            "palette": {
                "primary": primary,
                "secondary": secondary,
                "accent": accent,
                "background": _mix_hex(primary, "#FFFFFF", 0.86),
            },
        },
        {
            "option_id": "palette_option_2",
            "name": "Image Contrast",
            "rationale": "Builds stronger contrast using secondary tones found in the uploaded images.",
            "palette": {
                "primary": secondary,
                "secondary": tertiary,
                "accent": accent,
                "background": _mix_hex(secondary, "#FFFFFF", 0.9),
            },
        },
        {
            "option_id": "palette_option_3",
            "name": "Image Accent",
            "rationale": "Pushes image-derived accent tones for a bolder expression while keeping source fidelity.",
            "palette": {
                "primary": accent,
                "secondary": primary,
                "accent": tertiary,
                "background": _mix_hex(accent, "#FFFFFF", 0.9),
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


async def _build_palette_options(image_urls: list[str], visual_summary: str) -> tuple[list[BrandPaletteOptionPayload], str]:
    swatches = await _extract_image_color_swatches(image_urls)
    fallback_options, fallback_recommended = _fallback_palette_options(swatches)
    swatch_preview = [item[0] for item in swatches[:8]]
    try:
        result = await groq_json_completion(
            system_prompt=(
                "You are a senior color strategist.\n"
                "Return only JSON with this shape: "
                "{\"palette_options\": [{\"option_id\": \"palette_option_1\", \"name\": \"...\", \"rationale\": \"...\", "
                "\"palette\": {\"primary\": \"#000000\", \"secondary\": \"#111111\", \"accent\": \"#222222\", \"background\": \"#f5f1e8\"}}], "
                "\"recommended_palette_id\": \"palette_option_1\"}\n"
                "Rules:\n"
                "- Generate exactly 3 palette options.\n"
                "- Use only uploaded-image evidence (swatches + visual summary). Do not use craft, user, story, or region context.\n"
                "- Keep each option visually distinct while preserving source fidelity to the image swatches.\n"
                "- All palette values must be valid 6-digit hex colors.\n"
                "- Rationale should explain visual effect in 1 sentence.\n"
                "- recommended_palette_id must match one of the 3 option_ids.\n"
            ),
            user_prompt=(
                f"Extracted image swatches (hex): {json.dumps(swatch_preview, ensure_ascii=False)}\n"
                f"Visual summary from uploaded images:\n{visual_summary}\n"
            ),
            max_tokens=1200,
            temperature=0.45,
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
    palette: BrandPalettePayload,
    visual_summary: str,
) -> str:
    prompt = (
        "Create a premium design board preview. "
        f"Focus on {category}: {title}. "
        f"Description: {description}. "
        f"Use a clean presentation on a soft studio board, showing the motif or pattern clearly as a visual concept, not product photography. "
        f"Use this palette: primary {palette.primary}, secondary {palette.secondary}, accent {palette.accent}, background {palette.background or '#F5E6C8'}. "
        "Strict palette lock: use only the provided palette colors in the output. Do not add random hues or off-palette gradients. "
        f"Visual cues from uploaded images only: {visual_summary}. "
        "Do not include craft labels, region names, or textual story context in the image. "
        "Keep it elegant, minimal, high contrast, and easy for a client to compare."
    )
    image_bytes, mime = await generate_image(prompt, width_hint=1024, height_hint=1024)
    return await upload_bytes(
        data=image_bytes,
        path=f"brands/{brand_id}/phase3/{category}_{index}.png",
        content_type=mime,
    )


LOGO_CANDIDATE_VARIANTS = [
    {
        "candidate_id": "logo_candidate_1",
        "title": "Wordmark Serif",
        "rationale": "A premium serif wordmark emphasizing trust, elegance, and strong readability.",
        "direction": "Create a typography-first wordmark logo led by refined serif letterforms and subtle motif-derived detailing.",
    },
    {
        "candidate_id": "logo_candidate_2",
        "title": "Wordmark Modern",
        "rationale": "A clean modern wordmark for a boutique and contemporary brand expression.",
        "direction": "Create a modern wordmark logo with controlled geometry, tight spacing, and motif cues integrated into letterform terminals.",
    },
    {
        "candidate_id": "logo_candidate_3",
        "title": "Wordmark Script",
        "rationale": "A handcrafted script-led wordmark with premium flow and memorability.",
        "direction": "Create a script-influenced wordmark logo with elegant stroke rhythm and restrained motif echoes.",
    },
    {
        "candidate_id": "logo_candidate_4",
        "title": "Graphic Emblem",
        "rationale": "An icon-led emblem with strong silhouette and high recall.",
        "direction": "Create a graphical emblem logo with one bold symbol derived directly from selected motifs.",
    },
    {
        "candidate_id": "logo_candidate_5",
        "title": "Graphic Monogram",
        "rationale": "A monogram-focused symbol that feels premium and ownable.",
        "direction": "Create a graphical monogram-style logo using initials and motif abstraction in a clean mark system.",
    },
    {
        "candidate_id": "logo_candidate_6",
        "title": "Graphic Seal",
        "rationale": "A seal-like graphic logo balancing heritage tone with sharp modern finishing.",
        "direction": "Create a graphical seal or badge logo with controlled ornament and motif-based structure.",
    },
]


BANNER_CANDIDATE_VARIANTS = [
    {
        "candidate_id": "banner_candidate_1",
        "title": "Editorial Hero",
        "rationale": "A spacious luxury banner that highlights the brand with premium hierarchy.",
        "direction": "Create an editorial homepage hero banner with generous breathing room, elegant hierarchy, and subtle integration of the saved pattern system as background structure.",
    },
    {
        "candidate_id": "banner_candidate_2",
        "title": "Pattern-Led Heritage",
        "rationale": "A richer banner direction that lets the saved pattern language become part of the brand world.",
        "direction": "Create a heritage-rich banner where the saved pattern system plays a visible but controlled role in the layout, framing the brand without overpowering it.",
    },
    {
        "candidate_id": "banner_candidate_3",
        "title": "Boutique Craft Story",
        "rationale": "A commerce-ready banner that balances premium storytelling with strong motif recall.",
        "direction": "Create a boutique craft banner with clear logo placement, sophisticated tagline hierarchy, and selected motif-pattern continuity that feels premium and ecommerce-ready.",
    },
]


async def _generate_phase_four_briefs(
    *,
    state: BrandState,
    visual_dna: dict,
    logo_library_summary: dict,
) -> tuple[list[dict], list[dict]]:
    motifs = [str(item).strip() for item in state.get("visual_motifs", []) if str(item).strip()]
    patterns = state.get("signature_patterns", []) or []
    pattern_names = [str(item.get("name", "")).strip() for item in patterns if isinstance(item, dict) and str(item.get("name", "")).strip()]
    pattern_descriptions = [str(item.get("description", "")).strip() for item in patterns if isinstance(item, dict) and str(item.get("description", "")).strip()]
    try:
        result = await groq_json_completion(
            system_prompt=(
                "You are a premium identity art director creating Phase 4 candidate briefs.\n"
                "Return only JSON with this shape: "
                "{\"logo_candidates\": [{\"candidate_id\": \"logo_candidate_1\", \"title\": \"...\", \"rationale\": \"...\", \"direction\": \"...\", \"difference_focus\": \"...\"}], "
                "\"banner_candidates\": [{\"candidate_id\": \"banner_candidate_1\", \"title\": \"...\", \"rationale\": \"...\", \"direction\": \"...\", \"difference_focus\": \"...\"}]}\n"
                "Rules:\n"
                "- Generate exactly 6 logo candidates and 3 banner candidates.\n"
                "- logo_candidate_1, logo_candidate_2, logo_candidate_3 must be wordmark-led.\n"
                "- logo_candidate_4, logo_candidate_5, logo_candidate_6 must be graphical/icon-led.\n"
                "- All 6 logo candidates must be structurally different, not minor variations.\n"
                "- All 3 banner candidates must feel clearly different in layout and pattern usage.\n"
                "- banner_candidate_1 must be editorial and spacious.\n"
                "- banner_candidate_2 must be pattern-led with framing or border logic.\n"
                "- banner_candidate_3 must be boutique storytelling with a stronger craft atmosphere.\n"
                "- Use the internal logo sample library as a quality bar.\n"
                "- For logo candidates, use only: brand name, tagline, selected palette, saved motifs, and logo sample library.\n"
                "- For logo candidates, strictly use selected palette colors only.\n"
                "- Do not use craft, region, artisan story, RAG context, or brand feel for logo candidates.\n"
                "- For banner candidates, you may use saved patterns and visual DNA.\n"
                "- Keep directions concrete enough for image generation.\n"
                "- difference_focus must explain what makes this candidate visibly distinct from the others.\n"
                "- Never make options just minor ornament or color changes.\n"
            ),
            user_prompt=(
                f"Brand name: {state.get('brand_name', '')}\n"
                f"Tagline: {state.get('tagline', '')}\n"
                f"Selected palette (strict): {json.dumps(state.get('palette', {}), ensure_ascii=False)}\n"
                f"Saved motifs: {json.dumps(motifs, ensure_ascii=False)}\n"
                f"Saved pattern names: {json.dumps(pattern_names, ensure_ascii=False)}\n"
                f"Saved pattern descriptions: {json.dumps(pattern_descriptions, ensure_ascii=False)}\n"
                f"Visual DNA: {json.dumps(visual_dna, ensure_ascii=False)}\n"
                f"Internal logo sample summary: {json.dumps(logo_library_summary, ensure_ascii=False)}\n"
            ),
            max_tokens=2200,
            temperature=0.75,
        )
        logo_candidates = result.get("logo_candidates", [])
        banner_candidates = result.get("banner_candidates", [])
        if len(logo_candidates) == 6 and len(banner_candidates) == 3:
            return logo_candidates, banner_candidates
    except Exception as exc:
        logger.warning("Could not generate dynamic Phase 4 briefs; using fallback briefs. Error: %s", exc)
    return LOGO_CANDIDATE_VARIANTS, BANNER_CANDIDATE_VARIANTS


def _join_non_empty(values: list[str]) -> str:
    return ", ".join(value for value in values if value).strip() or "none"


def _compact_text(value: str, limit: int = 180) -> str:
    text = " ".join(str(value or "").split()).strip()
    if len(text) <= limit:
        return text
    return text[: max(limit - 3, 0)].rstrip(" ,.;:") + "..."


def _compact_list(values: list[str], *, limit: int = 3, item_limit: int = 40) -> str:
    cleaned = [_compact_text(value, item_limit) for value in values if str(value).strip()]
    return ", ".join(cleaned[:limit]) if cleaned else "none"


def _fit_prompt_lines(lines: list[str], max_length: int = 1200) -> str:
    selected = [line for line in lines if line.strip()]
    prompt = "\n".join(selected)
    if len(prompt) <= max_length:
        return prompt
    optional_prefixes = (
        "Sample quality bar:",
        "Sample cues:",
        "Premium cues:",
        "Pattern behavior:",
        "Craft and region:",
        "Tagline:",
    )
    for prefix in optional_prefixes:
        if len(prompt) <= max_length:
            break
        selected = [line for line in selected if not line.startswith(prefix)]
        prompt = "\n".join(selected)
    if len(prompt) <= max_length:
        return prompt
    trimmed: list[str] = []
    current_length = 0
    for line in selected:
        available = max_length - current_length - (1 if trimmed else 0)
        if available <= 0:
            break
        clipped = _compact_text(line, available)
        line_length = len(clipped) + (1 if trimmed else 0)
        if line_length > available and not clipped:
            break
        trimmed.append(clipped)
        current_length += line_length
    return "\n".join(trimmed)


def _build_phase_four_prompt(
    *,
    state: BrandState,
    visual_dna: dict,
    asset_type: str,
    direction: str,
    logo_library_summary: dict,
) -> str:
    motifs = [str(item).strip() for item in state.get("visual_motifs", []) if str(item).strip()]
    patterns = state.get("signature_patterns", []) or []
    pattern_names = [str(item.get("name", "")).strip() for item in patterns if isinstance(item, dict) and str(item.get("name", "")).strip()]
    pattern_descriptions = [str(item.get("description", "")).strip() for item in patterns if isinstance(item, dict) and str(item.get("description", "")).strip()]
    palette = state.get("palette", {}) or {}
    palette_text = ", ".join(f"{key}:{value}" for key, value in palette.items() if value) or "use selected palette only"
    visual_world = _compact_text(str(visual_dna.get("visual_dna", "")).strip(), 180)
    composition_cues = _compact_list([str(item).strip() for item in visual_dna.get("composition_cues", []) if str(item).strip()], limit=2, item_limit=36)
    luxury_markers = _compact_list([str(item).strip() for item in visual_dna.get("luxury_markers", []) if str(item).strip()], limit=2, item_limit=36)
    library_summary = _compact_text(str(logo_library_summary.get("summary", "")).strip(), 150)
    library_typography = _compact_list([str(item).strip() for item in logo_library_summary.get("typography_cues", []) if str(item).strip()], limit=2, item_limit=32)
    library_composition = _compact_list([str(item).strip() for item in logo_library_summary.get("composition_cues", []) if str(item).strip()], limit=2, item_limit=32)
    library_ornament = _compact_list([str(item).strip() for item in logo_library_summary.get("ornament_cues", []) if str(item).strip()], limit=2, item_limit=32)
    negative_cues = _compact_list([str(item).strip() for item in logo_library_summary.get("negative_cues", []) if str(item).strip()], limit=3, item_limit=28)
    prompt_lines = [
        "Premium brand identity generation.",
        "Create one final polished option only. Do not show alternatives, moodboards, mockups, or extra objects.",
        f"Candidate direction: {_compact_text(direction, 220)}",
        f"Brand name: {state.get('brand_name', '')}",
        f"Tagline: {state.get('tagline', '')}",
        f"Selected palette only: {palette_text}",
        f"Motif anchors: {_compact_list(motifs, limit=3, item_limit=28)}",
        f"Sample quality bar: {library_summary}",
        f"Sample cues: typography {library_typography}; composition {library_composition}; ornament {library_ornament}",
    ]
    if asset_type == "logo":
        prompt_lines.extend(
            [
                "Output: a high-end logo presentation on a clean solid or subtle paper background.",
                "The mark must feel ownable, sharp, balanced, and immediately brandable.",
                "Prioritize silhouette, typography quality, spacing, and premium restraint.",
                "Palette lock: use only selected palette hex colors. Do not introduce any extra hue, tint family, or random gradient.",
                "Use only brand name, tagline, selected palette, motifs, and sample logo cues.",
                "Do not use craft context, region context, artisan story, or RAG context.",
            ]
        )
    else:
        prompt_lines.extend(
            [
                f"Pattern anchors: {_compact_list(pattern_names, limit=2, item_limit=28)}",
                f"Pattern behavior: {_compact_list(pattern_descriptions, limit=2, item_limit=44)}",
                f"Visual world: {visual_world}",
                f"Premium cues: {composition_cues}; {luxury_markers}",
            ]
        )
        prompt_lines.extend(
            [
                "Output: a premium wide ecommerce hero banner.",
                "Use the saved pattern language as an intentional layout device, not generic wallpaper.",
                "Keep a strong focal area for logo and tagline, elegant spacing, and premium hierarchy.",
            ]
        )
    prompt_lines.append(f"Avoid: {negative_cues}, generic AI look, stock clipart, crowded folk-art clutter, weak typography, muddy composition.")
    prompt_lines.append("Original work only. Make this candidate visibly distinct in structure, not a small variation.")
    return _fit_prompt_lines(prompt_lines)


async def _generate_phase_four_asset_candidates(
    *,
    brand_id: str,
    state: BrandState,
) -> BrandPhaseFourCandidatesResponse:
    visual_dna = await build_brand_visual_dna(state)
    logo_library_summary = await get_logo_reference_library_summary()
    logo_briefs, banner_briefs = await _generate_phase_four_briefs(
        state=state,
        visual_dna=visual_dna,
        logo_library_summary=logo_library_summary,
    )

    async def _generate_candidate(asset_type: str, variant: dict, index: int) -> BrandAssetCandidatePayload:
        direction = str(variant.get("direction", "")).strip()
        difference_focus = str(variant.get("difference_focus", "")).strip()
        prompt = _build_phase_four_prompt(
            state=state,
            visual_dna=visual_dna,
            asset_type=asset_type,
            direction=f"{direction}\nWhat must make this option distinct: {difference_focus}".strip(),
            logo_library_summary=logo_library_summary,
        )
        style_modifier = (
            "strict selected-palette lock, premium vector clarity, no extra colors"
            if asset_type == "logo"
            else FEEL_BANNER_STYLE.get(state.get("brand_feel", "earthy"), FEEL_BANNER_STYLE["earthy"])
        )
        image_bytes, mime = await generate_image(
            prompt + f"\nStyle modifier: {style_modifier}.",
            width_hint=1024 if asset_type == "logo" else 1536,
            height_hint=1024 if asset_type == "logo" else 768,
        )
        image_url = await upload_bytes(
            data=image_bytes,
            path=f"brands/{brand_id}/phase4/{asset_type}_{index}.png",
            content_type=mime,
        )
        return BrandAssetCandidatePayload(
            candidate_id=str(variant.get("candidate_id") or f"{asset_type}_candidate_{index}"),
            image_url=image_url,
            title=str(variant.get("title") or f"{asset_type.title()} Candidate {index}"),
            rationale=str(variant.get("rationale") or difference_focus or "A distinct premium direction for this brand."),
        )

    logo_tasks = [_generate_candidate("logo", variant, index + 1) for index, variant in enumerate(logo_briefs)]
    banner_tasks = [_generate_candidate("banner", variant, index + 1) for index, variant in enumerate(banner_briefs)]
    logos, banners = await asyncio.gather(asyncio.gather(*logo_tasks), asyncio.gather(*banner_tasks))
    return BrandPhaseFourCandidatesResponse(
        brand_id=brand_id,
        logos=list(logos),
        banners=list(banners),
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


def _fallback_visual_foundation(image_urls: list[str], visual_summary: str, selected_palette: dict | None = None) -> BrandVisualFoundationResponse:
    motifs = [
        "Dominant contour motif",
        "Surface texture motif",
        "Rhythmic repeat motif",
    ]
    palette = _coerce_palette(selected_palette).model_dump() if selected_palette else _coerce_palette(None).model_dump()
    patterns = [
        BrandPatternPayload(
            name="Contour Repeat Grid",
            description=f"A structured repeat pattern derived from {motifs[0]}, balanced with breathing space and strict palette control.",
        ),
        BrandPatternPayload(
            name="Texture Overlay Rhythm",
            description=f"A secondary pattern layering {motifs[1]} in low-density rhythm for backgrounds and support surfaces.",
        ),
        BrandPatternPayload(
            name="Hero Motif Stripe",
            description=f"A directional stripe system built from {motifs[2]} for high-visibility hero sections.",
        ),
    ]
    palette_options, recommended_palette_id = _fallback_palette_options([])
    return BrandVisualFoundationResponse(
        brand_id="",
        reference_images=image_urls,
        visual_summary=visual_summary,
        visual_motifs=motifs[:3],
        motif_previews=[],
        signature_patterns=patterns[:3],
        palette=palette,
        palette_options=palette_options,
        recommended_palette_id=recommended_palette_id,
        selected_palette_id=None,
    )


async def _build_visual_foundation(
    state: BrandState,
    image_urls: list[str],
    visual_summary: str,
    selected_palette_id: str | None = None,
    selected_palette: dict | None = None,
) -> BrandVisualFoundationResponse:
    del state
    palette_options, recommended_palette_id = await _build_palette_options(image_urls, visual_summary)
    selected_palette_payload = (
        _coerce_palette(selected_palette)
        if selected_palette
        else next(
            (option.palette for option in palette_options if option.option_id == selected_palette_id),
            next((option.palette for option in palette_options if option.option_id == recommended_palette_id), _coerce_palette(None)),
        )
    )
    effective_selected_palette_id = (
        selected_palette_id
        if selected_palette_id in {option.option_id for option in palette_options}
        else recommended_palette_id
    )
    fallback_foundation = _fallback_visual_foundation(image_urls, visual_summary, selected_palette_payload.model_dump())
    try:
        result = await groq_json_completion(
            system_prompt=(
                "You are a senior visual analyst building image-only motif and pattern directions.\n"
                "Return only JSON with this shape: "
                "{\"visual_motifs\": [\"motif1\", \"motif2\", \"motif3\"], "
                "\"signature_patterns\": [{\"name\": \"...\", \"description\": \"...\"}]}\n"
                "Rules:\n"
                "- Extract 1 to 3 motifs only from uploaded-image evidence.\n"
                "- Never use craft/user/story/region context.\n"
                "- Motifs must be concrete and visually distinct from each other.\n"
                "- Generate 1 to 3 signature patterns using only the extracted motifs and provided selected palette.\n"
                "- Pattern descriptions must state motif usage + palette usage clearly.\n"
                "- Palette lock is strict: do not use colors outside selected palette.\n"
                "- Keep outputs concise and directly usable by designers.\n"
            ),
            user_prompt=(
                f"Selected palette (must be used): {json.dumps(selected_palette_payload.model_dump(), ensure_ascii=False)}\n"
                f"Visual summary from uploaded images:\n{visual_summary}\n"
            ),
            max_tokens=1200,
            temperature=0.5,
        )
        patterns = [
            BrandPatternPayload(
                name=str(item.get("name", "")).strip(),
                description=str(item.get("description", "")).strip(),
            )
            for item in result.get("signature_patterns", [])
            if str(item.get("name", "")).strip() and str(item.get("description", "")).strip()
        ]
        motifs = [str(item).strip() for item in result.get("visual_motifs", []) if str(item).strip()][:3]
        return BrandVisualFoundationResponse(
            brand_id="",
            reference_images=image_urls,
            visual_summary=visual_summary,
            visual_motifs=motifs or fallback_foundation.visual_motifs,
            motif_previews=[],
            signature_patterns=patterns[:3] or fallback_foundation.signature_patterns,
            palette=selected_palette_payload.model_dump(),
            palette_options=palette_options,
            recommended_palette_id=recommended_palette_id,
            selected_palette_id=effective_selected_palette_id,
        )
    except Exception as exc:
        logger.warning("Visual foundation LLM generation failed; using fallback foundation. Error: %s", exc)
        return fallback_foundation


async def _build_palette_only_foundation(
    state: BrandState,
    image_urls: list[str],
    visual_summary: str,
    selected_palette_id: str | None = None,
) -> BrandVisualFoundationResponse:
    del state
    fallback_foundation = _fallback_visual_foundation(image_urls, visual_summary)
    palette_options, recommended_palette_id = await _build_palette_options(image_urls, visual_summary)
    effective_selected_palette_id = selected_palette_id if selected_palette_id in {option.option_id for option in palette_options} else None
    effective_palette = next(
        (option.palette for option in palette_options if option.option_id == effective_selected_palette_id),
        next((option.palette for option in palette_options if option.option_id == recommended_palette_id), fallback_foundation.palette),
    )
    return BrandVisualFoundationResponse(
        brand_id="",
        reference_images=image_urls,
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
    del state
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
                palette=selected_palette,
                visual_summary=foundation.visual_summary,
            )
            motif_previews.append(
                BrandMotifPreviewPayload(
                    name=motif,
                    description="Motif direction extracted only from uploaded references.",
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
        f"Sample brand names from pool:\n{format_examples_for_prompt(example_context['brand_name'])}\n\n"
        f"Sample taglines from pool:\n{format_examples_for_prompt(example_context['tagline'])}\n\n"
        f"Already shown pairs that must not be repeated:\n{excluded_text}\n\n"
        f"{variation_note}\n\n"
        "Creative direction:\n"
        "- Prefer names that feel ownable, sharp, and emotionally resonant.\n"
        "- Draw from context signals: craft, region, memory, materiality, lineage, and maker philosophy.\n"
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
            "- Use only provided context and sample pool references as guidance.\n"
            "- Never copy the retrieved examples verbatim.\n"
            "- The second set must feel meaningfully different from the first set if exclusions are provided.\n"
            "- Keep taglines aligned with the requested script preference.\n"
            "- why_it_fits should be specific and useful, not generic praise.\n"
            "- Prioritize uniqueness and avoid repeating common naming templates.\n"
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
            "Use only provided context and sample pool examples as quality references. Do not copy them."
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
            f"Sample tagline pool:\n{format_examples_for_prompt(example_context['tagline'])}"
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
            "Use only provided context and sample pool references as quality guidance. Do not copy them."
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
            f"Sample brand name pool:\n{format_examples_for_prompt(example_context['brand_name'])}\n\n"
            f"Sample tagline pool:\n{format_examples_for_prompt(example_context['tagline'])}"
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
            foundation = await _build_visual_foundation(
                state,
                payload.reference_images,
                visual_summary,
                selected_palette_id=existing_brand.get("selected_palette_id"),
                selected_palette=selected_palette,
            )
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
                payload.reference_images,
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


@router.post(
    "/{brand_id}/phase4-candidates",
    response_model=BrandPhaseFourCandidatesResponse,
    summary="Generate three logo and three banner candidates for Phase 4",
    tags=["Brands"],
)
async def generate_brand_phase_four_candidates(
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

    brand = result.data
    if not brand.get("name") or not brand.get("tagline"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Finalize brand name and tagline before Phase 4.")
    if not brand.get("selected_palette_id") or not brand.get("palette"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select a palette before generating Phase 4 assets.")
    if not brand.get("signature_patterns"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Generate Phase 3 motif and pattern visuals before Phase 4.")

    state = await context_builder_node(_build_state_from_brand(str(uuid.uuid4()), user_id, brand))
    phase_four_candidates = await _generate_phase_four_asset_candidates(
        brand_id=brand_id,
        state=state,
    )
    return phase_four_candidates


@router.patch(
    "/{brand_id}/phase4-selection",
    response_model=BrandPublic,
    summary="Save the chosen Phase 4 logo and banner",
    tags=["Brands"],
)
async def select_brand_phase_four_assets(
    brand_id: str,
    payload: BrandPhaseFourSelectionRequest,
    user_id: str = Depends(get_current_user_id),
):
    updated = (
        supabase.table("brands")
        .update(
            {
                "logo_url": payload.logo_url.strip(),
                "banner_url": payload.banner_url.strip(),
                "status": "ready",
            }
        )
        .eq("id", brand_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not updated.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")
    try:
        supabase.table("users").update({"has_brand": True}).eq("id", user_id).execute()
    except Exception as exc:
        logger.warning("Could not update has_brand for user=%s after Phase 4 selection: %s", user_id, exc)
    return updated.data[0]


@router.get(
    "/latest",
    response_model=BrandPublic,
    summary="Get the latest saved brand for the current user",
    tags=["Brands"],
)
async def get_latest_brand(user_id: str = Depends(get_current_user_id)):
    result = (
        supabase.table("brands")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")
    return result.data[0]


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
