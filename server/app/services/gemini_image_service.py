"""
Image generation service using the Pollinations.ai API.
"""

from __future__ import annotations

import io
import logging
import urllib.parse
from typing import Iterable, Optional

import httpx
from PIL import Image, ImageDraw, ImageFont

from app.core.config import settings

logger = logging.getLogger(__name__)

# Max prompt length for the URL path (Pollinations uses GET with prompt in URL)
MAX_PROMPT_LENGTH = 1500


def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def _fallback_image(prompt: str, width: int = 1024, height: int = 1024) -> bytes:
    image = Image.new("RGB", (width, height), "#efe4d0")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((24, 24, width - 24, height - 24), radius=42, fill="#f8f1e4", outline="#8b5e34", width=4)
    draw.rounded_rectangle((56, 56, width - 56, 240), radius=32, fill="#8b5e34")
    draw.text((88, 100), "Idanta AI Asset", font=_load_font(54, bold=True), fill="#fff8eb")

    wrapped_prompt = []
    line = ""
    for word in prompt.split()[:60]:
        candidate = f"{line} {word}".strip()
        if len(candidate) > 42:
            if line:
                wrapped_prompt.append(line)
            line = word
        else:
            line = candidate
    if line:
        wrapped_prompt.append(line)

    y = 300
    for item in wrapped_prompt[:10]:
        draw.text((88, y), item, font=_load_font(34), fill="#3c2b1f")
        y += 46

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _truncate_prompt(prompt: str, max_length: int = MAX_PROMPT_LENGTH) -> str:
    """Truncate prompt to fit in URL path while keeping it coherent."""
    if len(prompt) <= max_length:
        return prompt
    # Cut at the last full sentence or newline before the limit
    truncated = prompt[:max_length]
    for sep in ["\n", ". ", ", "]:
        idx = truncated.rfind(sep)
        if idx > max_length // 2:
            truncated = truncated[:idx]
            break
    return truncated.strip()


async def _download_reference(url: str) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=40.0, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        mime_type = response.headers.get("content-type", "image/jpeg").split(";")[0]
        return response.content, mime_type


async def generate_image(
    prompt: str,
    *,
    width_hint: int = 1024,
    height_hint: int = 1024,
    reference_urls: Optional[Iterable[str]] = None,
) -> tuple[bytes, str]:
    """Generate an image using the Pollinations.ai API.
    
    Uses the GET /image/{prompt} endpoint at gen.pollinations.ai.
    The API key is passed as a query parameter to survive redirects.
    """
    # Truncate prompt to avoid URL length issues
    safe_prompt = _truncate_prompt(prompt)
    encoded_prompt = urllib.parse.quote(safe_prompt, safe="")

    # Use gen.pollinations.ai directly (avoids redirect from image.pollinations.ai)
    base_url = "https://gen.pollinations.ai/image"
    url = f"{base_url}/{encoded_prompt}"

    params: dict[str, str | int] = {
        "width": width_hint,
        "height": height_hint,
        "nologo": "true",
        "model": "flux",
    }

    # Pass API key as query param (survives redirects, unlike Authorization header)
    if hasattr(settings, "POLLINATIONS_API_KEY") and settings.POLLINATIONS_API_KEY:
        params["key"] = settings.POLLINATIONS_API_KEY

    try:
        async with httpx.AsyncClient(timeout=180.0, follow_redirects=True) as client:
            logger.info("Pollinations request: model=flux, prompt_len=%d, url_len=%d", len(safe_prompt), len(url))
            response = await client.get(url, params=params)
            response.raise_for_status()

            # Pollinations returns the image directly as binary
            content_type = response.headers.get("content-type", "image/jpeg").split(";")[0]
            if content_type not in ("image/jpeg", "image/png", "image/webp"):
                content_type = "image/jpeg"

            image_bytes = response.content

            # Verify we got a real image (not an HTML error page)
            if len(image_bytes) < 1000 or image_bytes[:5] in (b"<html", b"<!DOC", b"<!doc"):
                logger.warning(
                    "Pollinations returned non-image content (%d bytes, type=%s). Using fallback.",
                    len(image_bytes), content_type,
                )
                return _fallback_image(safe_prompt, width_hint, height_hint), "image/png"

            logger.info("Pollinations image generated successfully: %d bytes, type=%s", len(image_bytes), content_type)
            return image_bytes, content_type

    except httpx.HTTPStatusError as e:
        logger.error(
            "Pollinations API HTTP error %d: %s",
            e.response.status_code,
            e.response.text[:200] if e.response.text else "no body",
        )
        return _fallback_image(safe_prompt, width_hint, height_hint), "image/png"
    except Exception as exc:
        logger.error("Pollinations image generation failed: %s", exc)
        return _fallback_image(safe_prompt, width_hint, height_hint), "image/png"

