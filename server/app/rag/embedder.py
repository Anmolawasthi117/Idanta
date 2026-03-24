"""
Sentence embedding using all-MiniLM-L6-v2.
Model (~80MB) is downloaded from HuggingFace on first call and cached locally.
"""

import logging
from typing import List
from functools import lru_cache

from sentence_transformers import SentenceTransformer

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _load_model() -> SentenceTransformer:
    """Lazily load and cache the embedding model."""
    logger.info(f"Loading embedding model: {settings.EMBEDDING_MODEL}")
    model = SentenceTransformer(settings.EMBEDDING_MODEL)
    logger.info("Embedding model loaded successfully.")
    return model


def embed_text(text: str) -> List[float]:
    """
    Embed a single string into a 384-dimensional vector.
    :param text: Input text to embed.
    :returns: List of 384 floats.
    """
    model = _load_model()
    vector = model.encode(text, normalize_embeddings=True)
    return vector.tolist()


def embed_batch(texts: List[str]) -> List[List[float]]:
    """
    Embed multiple strings in a single batch (more efficient than looping).
    :param texts: List of input strings.
    :returns: List of 384-dimensional float vectors.
    """
    model = _load_model()
    vectors = model.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=True)
    return [v.tolist() for v in vectors]
