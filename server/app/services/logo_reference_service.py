"""
Internal curated logo reference library support.

This service discovers local sample images from ``data/logo_sample``, uploads them
to storage for vision-model access, and summarizes the shared design language so
logo/banner generation can inherit that style direction automatically.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from app.services.groq_client import groq_json_completion, groq_vision_completion
from app.services.storage_service import upload_bytes

logger = logging.getLogger(__name__)

LOGO_SAMPLE_DIR = Path("data/logo_sample")
LOGO_SAMPLE_STORAGE_PREFIX = "reference_assets/logo_sample"
_summary_cache: dict[str, Any] | None = None
_summary_lock = asyncio.Lock()


def _logo_sample_paths() -> list[Path]:
    if not LOGO_SAMPLE_DIR.exists():
        return []
    allowed_suffixes = {".png", ".jpg", ".jpeg", ".webp"}
    return sorted(
        [path for path in LOGO_SAMPLE_DIR.iterdir() if path.is_file() and path.suffix.lower() in allowed_suffixes],
        key=lambda path: path.name.lower(),
    )


async def _upload_logo_sample_urls(limit: int = 6) -> list[dict[str, str]]:
    urls: list[dict[str, str]] = []
    for path in _logo_sample_paths()[:limit]:
        try:
            url = await upload_bytes(
                data=path.read_bytes(),
                path=f"{LOGO_SAMPLE_STORAGE_PREFIX}/{path.name}",
            )
            urls.append(
                {
                    "id": path.stem,
                    "file_name": path.name,
                    "url": url,
                }
            )
        except Exception as exc:
            logger.warning("Could not upload internal logo sample %s: %s", path.name, exc)
    return urls


async def get_logo_reference_library_summary() -> dict[str, Any]:
    global _summary_cache
    if _summary_cache is not None:
        return _summary_cache

    async with _summary_lock:
        if _summary_cache is not None:
            return _summary_cache

        sample_urls = await _upload_logo_sample_urls(limit=6)
        if not sample_urls:
            _summary_cache = {
                "sample_count": 0,
                "summary": "",
                "style_principles": [],
                "composition_cues": [],
                "typography_cues": [],
                "ornament_cues": [],
                "banner_translation_cues": [],
                "negative_cues": [],
                "sample_ids": [],
            }
            return _summary_cache

        try:
            raw_summary = await groq_vision_completion(
                system_prompt=(
                    "You are a senior identity design curator. Analyze the attached internal logo inspiration library and describe "
                    "the shared design language. Focus on composition, typography feel, ornament level, motif integration, premium cues, "
                    "and how these styles could translate into brand banners."
                ),
                user_prompt=(
                    "Study this internal logo sample library. Describe the recurring creative direction that should guide new original "
                    "artisan brand logos and related hero banners."
                ),
                image_urls=[item["url"] for item in sample_urls],
                max_tokens=900,
                temperature=0.3,
            )
            structured_summary = await groq_json_completion(
                system_prompt=(
                    "Convert the provided logo-library analysis into JSON.\n"
                    "Return only JSON with this shape: "
                    "{\"summary\": \"...\", "
                    "\"style_principles\": [\"...\"], "
                    "\"composition_cues\": [\"...\"], "
                    "\"typography_cues\": [\"...\"], "
                    "\"ornament_cues\": [\"...\"], "
                    "\"banner_translation_cues\": [\"...\"], "
                    "\"negative_cues\": [\"...\"]}\n"
                    "Keep each list concise, design-usable, and non-generic."
                ),
                user_prompt=raw_summary,
                max_tokens=700,
                temperature=0.2,
            )
            _summary_cache = {
                "sample_count": len(sample_urls),
                "summary": str(structured_summary.get("summary", "")).strip(),
                "style_principles": [str(item).strip() for item in structured_summary.get("style_principles", []) if str(item).strip()],
                "composition_cues": [str(item).strip() for item in structured_summary.get("composition_cues", []) if str(item).strip()],
                "typography_cues": [str(item).strip() for item in structured_summary.get("typography_cues", []) if str(item).strip()],
                "ornament_cues": [str(item).strip() for item in structured_summary.get("ornament_cues", []) if str(item).strip()],
                "banner_translation_cues": [str(item).strip() for item in structured_summary.get("banner_translation_cues", []) if str(item).strip()],
                "negative_cues": [str(item).strip() for item in structured_summary.get("negative_cues", []) if str(item).strip()],
                "sample_ids": [item["id"] for item in sample_urls],
            }
        except Exception as exc:
            logger.warning("Could not summarize internal logo sample library: %s", exc)
            _summary_cache = {
                "sample_count": len(sample_urls),
                "summary": "Use the internal logo sample library as a premium identity reference with restrained ornament, strong typography, and memorable artisan symbolism.",
                "style_principles": ["premium identity clarity", "restrained heritage detailing", "memorable symbol-wordmark balance"],
                "composition_cues": ["centered emblem balance", "clean stacked lockups", "controlled negative space"],
                "typography_cues": ["elegant high-contrast lettering", "crafted premium wordmarks"],
                "ornament_cues": ["selective motif integration", "ornament used with restraint"],
                "banner_translation_cues": ["hero layouts should stay premium and spacious", "carry motif rhythm without overwhelming the logo"],
                "negative_cues": ["generic corporate icons", "crowded folk-art clutter", "cheap decorative excess"],
                "sample_ids": [item["id"] for item in sample_urls],
            }

        return _summary_cache
