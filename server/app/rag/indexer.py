"""
RAG Indexer — run this script once to populate craft_chunks in Supabase.

Usage:
    python -m app.rag.indexer

This script reads all JSON files from data/craft_library/,
embeds rag_chunks via all-MiniLM-L6-v2, and upserts them into Supabase.
"""

import json
import logging
import os
import sys
from pathlib import Path

# Allow running as a script from the server/ root
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.core.database import supabase
from app.rag.embedder import embed_batch

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

LIBRARY_DIR = Path("data/craft_library")


def index_craft_file(filepath: Path) -> int:
    """
    Embed and upsert all rag_chunks for one craft JSON file.
    :returns: Number of chunks indexed.
    """
    with open(filepath, encoding="utf-8") as f:
        craft = json.load(f)

    craft_id = craft["craft_id"]
    chunks: list[str] = craft.get("rag_chunks", [])

    if not chunks:
        logger.warning(f"No rag_chunks found in {filepath.name}. Skipping.")
        return 0

    logger.info(f"Embedding {len(chunks)} chunks for craft_id='{craft_id}'...")
    vectors = embed_batch(chunks)

    rows = [
        {"craft_id": craft_id, "chunk_text": text, "embedding": vector}
        for text, vector in zip(chunks, vectors)
    ]

    # Batch upsert (delete then insert to avoid duplicates on re-runs)
    supabase.table("craft_chunks").delete().eq("craft_id", craft_id).execute()
    supabase.table("craft_chunks").insert(rows).execute()

    logger.info(f"✓ Indexed {len(rows)} chunks for '{craft_id}'")
    return len(rows)


def run():
    if not LIBRARY_DIR.exists():
        logger.error(f"Craft library directory not found: {LIBRARY_DIR}")
        sys.exit(1)

    json_files = list(LIBRARY_DIR.glob("*.json"))
    if not json_files:
        logger.error(f"No JSON files found in {LIBRARY_DIR}")
        sys.exit(1)

    total = 0
    for filepath in json_files:
        try:
            total += index_craft_file(filepath)
        except Exception as e:
            logger.error(f"Failed to index {filepath.name}: {e}")

    logger.info(f"\n✅ Indexing complete. Total chunks indexed: {total}")


if __name__ == "__main__":
    run()
