"""
RAG retriever: pgvector cosine similarity search via Supabase RPC.
Calls the `match_craft_chunks` SQL function defined in database_schema.sql.
"""

import logging
from typing import List, Dict, Any

from app.core.config import settings
from app.core.database import supabase
from app.rag.embedder import embed_text

logger = logging.getLogger(__name__)


def retrieve_context(craft_id: str, query: str) -> List[Dict[str, Any]]:
    """
    Retrieve the top-K most relevant craft knowledge chunks for a given query.

    Uses pgvector cosine similarity via the `match_craft_chunks` Supabase RPC.

    :param craft_id: The craft type identifier, e.g. 'block_print_jaipur'.
    :param query: The semantic search query (artisan's input or brand brief).
    :returns: List of dicts with 'chunk_text' and 'similarity' keys.
    """
    query_vector = embed_text(query)

    try:
        response = supabase.rpc(
            "match_craft_chunks",
            {
                "query_embedding": query_vector,
                "match_craft_id": craft_id,
                "match_count": settings.RAG_TOP_K,
            },
        ).execute()

        chunks = response.data or []
        logger.info(f"Retrieved {len(chunks)} RAG chunks for craft='{craft_id}'")
        return chunks

    except Exception as e:
        logger.error(f"RAG retrieval failed: {e}")
        return []


def format_context_for_prompt(chunks: List[Dict[str, Any]]) -> str:
    """
    Format retrieved chunks into a single prompt-ready string.
    :param chunks: Output of retrieve_context().
    :returns: Newline-separated chunk texts.
    """
    if not chunks:
        return "No historical context available."
    return "\n\n".join(c["chunk_text"] for c in chunks)
