"""
Supabase Storage service helper.
Handles file uploads from bytes and public URL generation.
"""

import logging
import mimetypes
from time import time_ns
from typing import Optional

from app.core.config import settings
from app.core.database import supabase

logger = logging.getLogger(__name__)

BUCKET = settings.SUPABASE_STORAGE_BUCKET


def _with_cache_bust(url: str) -> str:
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}v={time_ns()}"


async def upload_bytes(
    data: bytes,
    path: str,
    content_type: Optional[str] = None,
) -> str:
    """
    Upload raw bytes to Supabase Storage and return the public URL.

    :param data: File bytes to upload.
    :param path: Storage path relative to the bucket root,
                 e.g. 'brands/<brand_id>/logo.svg'
    :param content_type: MIME type. Auto-detected from path if not provided.
    :returns: Public URL of the uploaded file.
    :raises RuntimeError: On upload failure.
    """
    if content_type is None:
        content_type, _ = mimetypes.guess_type(path)
        content_type = content_type or "application/octet-stream"

    try:
        supabase.storage.from_(BUCKET).upload(
            path=path,
            file=data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        public_url = supabase.storage.from_(BUCKET).get_public_url(path)
        logger.info(f"Uploaded to storage: {path}")
        return _with_cache_bust(public_url)

    except Exception as e:
        logger.error(f"Storage upload failed for '{path}': {e}")
        raise RuntimeError(f"Storage upload failed: {e}") from e


async def upload_zip(zip_bytes: bytes, path: str) -> str:
    """Upload a ZIP file and return the signed URL (valid for 7 days)."""
    return await upload_bytes(zip_bytes, path, content_type="application/zip")


def get_public_url(path: str) -> str:
    """Get the public URL for an already-uploaded file."""
    return supabase.storage.from_(BUCKET).get_public_url(path)
