"""
Context Builder Node — Step 1 of brand_graph.py

Loads craft JSON, runs pgvector RAG retrieval, and merges everything
into the BrandState so downstream nodes have full context.
Updates job progress to 10%.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict

from app.agents.state import BrandState
from app.core.database import supabase
from app.rag.retriever import retrieve_context, format_context_for_prompt

logger = logging.getLogger(__name__)

LIBRARY_DIR = Path("data/craft_library")


def _load_craft_json(craft_id: str) -> Dict[str, Any]:
    """Load craft metadata from local JSON file."""
    filepath = LIBRARY_DIR / f"{craft_id}.json"
    if not filepath.exists():
        logger.warning(f"Craft JSON not found: {filepath}. Using empty fallback.")
        return {"craft_id": craft_id, "motifs": [], "palette_suggestions": {}, "rag_chunks": []}
    with open(filepath, encoding="utf-8") as f:
        return json.load(f)


async def context_builder_node(state: BrandState) -> BrandState:
    """
    Merge artisan form inputs with craft knowledge base data.
    Runs pgvector RAG to fetch the most relevant cultural context.
    """
    job_id = state["job_id"]
    craft_id = state["craft_id"]

    # Update job progress
    supabase.table("jobs").update({
        "current_step": "📚 Gathering craft heritage knowledge...",
        "percent": 10,
        "status": "running",
    }).eq("id", job_id).execute()

    # Load craft library JSON
    craft_data = _load_craft_json(craft_id)

    # Build RAG query from artisan's inputs
    rag_query = (
        f"{craft_id.replace('_', ' ')} craft tradition history, "
        f"artisan from {state.get('region', 'India')}, "
        f"{state.get('years_of_experience', 5)} years experience. "
        f"Inspiration: {state.get('inspiration', 'traditional technique')}"
    )

    # Retrieve top-K relevant knowledge chunks
    chunks = retrieve_context(craft_id=craft_id, query=rag_query)
    rag_context = format_context_for_prompt(chunks)

    logger.info(f"Context builder complete for job={job_id}, craft={craft_id}")

    return {
        **state,
        "craft_data": craft_data,
        "rag_context": rag_context,
        "motifs": craft_data.get("motifs", []),
        "palette_suggestions": craft_data.get("palette_suggestions", {}),
    }
