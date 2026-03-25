"""
Context Builder Node - Step 1 of brand_graph.py.

Loads craft JSON, runs pgvector RAG retrieval, and merges everything
into the BrandState so downstream nodes have full context.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict

from app.agents.state import BrandState
from app.core.database import supabase
from app.rag.retriever import format_context_for_prompt, retrieve_context

logger = logging.getLogger(__name__)

LIBRARY_DIR = Path("data/craft_library")


def _empty_craft_payload(craft_id: str) -> Dict[str, Any]:
    return {
        "craft_id": craft_id,
        "display_name": craft_id.replace("_", " ").title(),
        "category": "textiles",
        "region": "India",
        "description": "",
        "gi_tag": False,
        "gi_tag_name": None,
        "motifs": {"primary": [], "secondary": [], "occasion_specific": {}},
        "traditional_colors": {"names": [], "hex": [], "natural_sources": []},
        "materials": {"primary": [], "tools": [], "dyes": []},
        "brand_tone_keywords": [],
        "selling_points": [],
        "occasions": [],
        "product_copy_hints": {},
        "rag_chunks": [],
    }


def _load_craft_json(craft_id: str) -> Dict[str, Any]:
    """Load craft metadata from local JSON file."""
    filepath = LIBRARY_DIR / f"{craft_id}.json"
    if not filepath.exists():
        logger.warning("Craft JSON not found: %s. Using empty fallback.", filepath)
        return _empty_craft_payload(craft_id)

    with open(filepath, encoding="utf-8") as file:
        payload = json.load(file)

    fallback = _empty_craft_payload(craft_id)
    fallback.update(payload)
    return fallback


async def context_builder_node(state: BrandState) -> BrandState:
    """Merge artisan form inputs with craft knowledge base data."""
    job_id = state["job_id"]
    craft_id = state["craft_id"]

    supabase.table("jobs").update(
        {
            "current_step": "Gathering craft heritage knowledge...",
            "percent": 10,
            "status": "running",
        }
    ).eq("id", job_id).execute()

    craft_json = _load_craft_json(craft_id)

    rag_query = (
        f"{craft_json.get('display_name', craft_id)} heritage, "
        f"artisan from {state.get('region', craft_json.get('region', 'India'))}, "
        f"{state.get('years_of_experience', 0)} years experience, "
        f"{state.get('generations_in_craft', 1)} generations in craft, "
        f"occasion {state.get('primary_occasion', 'general')}, "
        f"target customer {state.get('target_customer', 'local_bazaar')}, "
        f"artisan story {state.get('artisan_story', '')}"
    )

    rag_chunks = retrieve_context(craft_id=craft_id, query=rag_query)
    rag_context = format_context_for_prompt(rag_chunks)

    motifs = craft_json.get("motifs", {})
    motif_list = (
        motifs.get("primary", [])
        + motifs.get("secondary", [])
        + motifs.get("occasion_specific", {}).get(state.get("primary_occasion", "general"), [])
    )

    context_bundle = {
        "craft_id": craft_id,
        "craft_name": craft_json.get("display_name", craft_id),
        "region": state.get("region", craft_json.get("region", "India")),
        "artisan_name": state.get("artisan_name", ""),
        "generations_in_craft": state.get("generations_in_craft", 1),
        "years_of_experience": state.get("years_of_experience", 0),
        "primary_occasion": state.get("primary_occasion", "general"),
        "target_customer": state.get("target_customer", "local_bazaar"),
        "brand_feel": state.get("brand_feel", "earthy"),
        "script_preference": state.get("script_preference", "both"),
        "artisan_story": state.get("artisan_story", "") or "",
        "motifs": craft_json.get("motifs", {}),
        "traditional_colors": craft_json.get("traditional_colors", {}),
        "materials": craft_json.get("materials", {}),
        "brand_tone_keywords": craft_json.get("brand_tone_keywords", []),
        "selling_points": craft_json.get("selling_points", []),
        "occasions": craft_json.get("occasions", []),
        "gi_tag": craft_json.get("gi_tag", False),
        "gi_tag_name": craft_json.get("gi_tag_name"),
        "product_copy_hints": craft_json.get("product_copy_hints", {}),
        "rag_context": "\n\n".join(chunk.get("chunk_text", "") for chunk in rag_chunks) if rag_chunks else rag_context,
    }

    logger.info("Context builder complete for job=%s, craft=%s", job_id, craft_id)

    return {
        **state,
        "craft_data": craft_json,
        "context_bundle": context_bundle,
        "rag_context": rag_context,
        "motifs": motif_list,
        "palette_suggestions": craft_json.get("traditional_colors", {}),
    }
