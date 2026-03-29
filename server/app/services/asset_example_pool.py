"""
Structured example-pool retrieval for brand generation.

This keeps examples in JSON for easy authoring while making them queryable
by asset type, craft, audience, feel, and other brand signals.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List

from app.agents.state import BrandState

VERBAL_POOL_PATH = Path("data/brand_verbal_pool.json")
VISUAL_POOL_PATH = Path("data/brand_visual_pool.json")


def _normalize(value: Any) -> str:
    return str(value or "").strip().lower().replace("&", "and")


def _tokenize(values: Iterable[Any]) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        normalized = _normalize(value)
        if not normalized:
            continue
        tokens.add(normalized)
        tokens.update(part for part in normalized.replace("/", " ").replace("_", " ").replace("-", " ").split() if part)
    return tokens


@lru_cache(maxsize=1)
def load_verbal_pool() -> List[Dict[str, Any]]:
    with open(VERBAL_POOL_PATH, encoding="utf-8") as file:
        return json.load(file)


@lru_cache(maxsize=1)
def load_visual_pool() -> List[Dict[str, Any]]:
    with open(VISUAL_POOL_PATH, encoding="utf-8") as file:
        return json.load(file)


def _build_query_tokens(state: BrandState) -> set[str]:
    context = state.get("context_bundle", {})
    craft_data = state.get("craft_data", {})
    traditional_colors = craft_data.get("traditional_colors", {})
    values: list[Any] = [
        state.get("craft_id"),
        context.get("craft_name"),
        context.get("region"),
        context.get("brand_feel"),
        context.get("target_customer"),
        context.get("primary_occasion"),
        context.get("script_preference"),
        context.get("artisan_story"),
        state.get("rag_context"),
        state.get("visual_context"),
    ]
    values.extend(craft_data.get("brand_tone_keywords", []))
    values.extend(craft_data.get("selling_points", []))
    values.extend(craft_data.get("materials", {}).get("primary", []))
    values.extend(craft_data.get("materials", {}).get("dyes", []))
    values.extend(craft_data.get("motifs", {}).get("primary", []))
    values.extend(craft_data.get("motifs", {}).get("secondary", []))
    values.extend(traditional_colors.get("names", []))
    return _tokenize(values)


def _score_example(example: Dict[str, Any], query_tokens: set[str], *, asset_type: str, script_preference: str | None) -> int:
    score = 0
    if example.get("asset_type") == asset_type:
        score += 12

    if script_preference and example.get("asset_type") == "tagline":
        example_script = _normalize(example.get("script"))
        preferred = _normalize(script_preference)
        if example_script == preferred:
            score += 8
        elif example_script == "both" and preferred in {"english", "hindi", "both"}:
            score += 4

    weighted_fields = (
        ("craft_tags", 6),
        ("feel_tags", 5),
        ("audience_tags", 4),
        ("region_tags", 4),
        ("motif_tags", 4),
        ("palette_tags", 3),
    )
    for field, weight in weighted_fields:
        matches = query_tokens.intersection(_tokenize(example.get(field, [])))
        score += len(matches) * weight

    descriptive_matches = query_tokens.intersection(
        _tokenize(
            [
                example.get("example_text"),
                example.get("caption"),
                example.get("style_notes"),
                example.get("why_it_works"),
            ]
        )
    )
    score += len(descriptive_matches)
    return score


def retrieve_brand_examples(state: BrandState, asset_type: str, limit: int = 3) -> List[Dict[str, Any]]:
    pool = load_verbal_pool() if asset_type in {"brand_name", "tagline"} else load_visual_pool()
    script_preference = state.get("context_bundle", {}).get("script_preference", "both")
    query_tokens = _build_query_tokens(state)
    ranked = sorted(
        pool,
        key=lambda example: _score_example(
            example,
            query_tokens,
            asset_type=asset_type,
            script_preference=script_preference,
        ),
        reverse=True,
    )
    return ranked[:limit]


def build_example_context(state: BrandState) -> Dict[str, List[Dict[str, Any]]]:
    return {
        "brand_name": retrieve_brand_examples(state, "brand_name", limit=4),
        "tagline": retrieve_brand_examples(state, "tagline", limit=4),
        "logo": retrieve_brand_examples(state, "logo", limit=3),
        "banner": retrieve_brand_examples(state, "banner", limit=3),
    }


def format_examples_for_prompt(examples: List[Dict[str, Any]], *, include_text: bool = True) -> str:
    lines: list[str] = []
    for example in examples:
        parts = [f"id={example.get('id', '')}"]
        if include_text and example.get("example_text"):
            parts.append(f"text={example['example_text']}")
        if example.get("caption"):
            parts.append(f"caption={example['caption']}")
        if example.get("style_notes"):
            parts.append(f"style_notes={example['style_notes']}")
        if example.get("why_it_works"):
            parts.append(f"why_it_works={example['why_it_works']}")
        lines.append("- " + " | ".join(parts))
    return "\n".join(lines) or "- none"
