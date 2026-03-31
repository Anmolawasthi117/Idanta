import logging
import hashlib
import math
from typing import List, Optional
from functools import lru_cache

try:
    from sentence_transformers import SentenceTransformer
except ImportError:  # pragma: no cover - depends on deploy environment
    SentenceTransformer = None  # type: ignore[assignment]

from app.core.config import settings

logger = logging.getLogger(__name__)


EMBED_DIM = 384


def _hash_embedding(text: str, dim: int = EMBED_DIM) -> List[float]:
    """
    Deterministic lightweight embedding fallback.
    Keeps RAG functional in constrained runtimes where torch-based models
    cannot be bundled (e.g. Vercel Python serverless limits).
    """
    values = [0.0] * dim
    for token in text.lower().split():
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        idx = int.from_bytes(digest[:4], "big") % dim
        sign = -1.0 if digest[4] & 1 else 1.0
        magnitude = 1.0 + (digest[5] / 255.0)
        values[idx] += sign * magnitude

    norm = math.sqrt(sum(v * v for v in values))
    if norm > 0:
        values = [v / norm for v in values]
    return values


@lru_cache(maxsize=1)
def _load_model() -> Optional["SentenceTransformer"]:
    """Lazily load and cache the embedding model if available."""
    if SentenceTransformer is None:
        logger.warning(
            "sentence-transformers is not installed; using hash-based embeddings fallback."
        )
        return None

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
    if model is None:
        return _hash_embedding(text)

    vector = model.encode(text, normalize_embeddings=True)
    return vector.tolist()


def embed_batch(texts: List[str]) -> List[List[float]]:
    """
    Embed multiple strings in a single batch (more efficient than looping).
    :param texts: List of input strings.
    :returns: List of 384-dimensional float vectors.
    """
    model = _load_model()
    if model is None:
        return [_hash_embedding(t) for t in texts]

    vectors = model.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=True)
    return [v.tolist() for v in vectors]
