"""
Gemini image generation service using the Gemini REST API.
"""

from __future__ import annotations

import base64
import io
import logging
from typing import Iterable, Optional

import httpx
from PIL import Image, ImageDraw, ImageFont

from app.core.config import settings

logger = logging.getLogger(__name__)

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


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
    for word in prompt.split():
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


async def _download_reference(url: str) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=40.0) as client:
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
    parts: list[dict] = [{"text": prompt}]

    for reference_url in reference_urls or []:
        reference_bytes, mime_type = await _download_reference(reference_url)
        parts.append(
            {
                "inlineData": {
                    "mimeType": mime_type,
                    "data": base64.b64encode(reference_bytes).decode("utf-8"),
                }
            }
        )

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {"temperature": 0.9, "responseModalities": ["TEXT", "IMAGE"]},
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                GEMINI_API_URL.format(model=settings.GEMINI_IMAGE_MODEL),
                params={"key": settings.GEMINI_API_KEY},
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        logger.warning("Gemini image generation request failed: %s", exc)
        return _fallback_image(prompt, width_hint, height_hint), "image/png"

    for candidate in data.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            inline = part.get("inlineData")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"]), inline.get("mimeType", "image/png")

    logger.warning("Gemini response did not include an image. Falling back to a local placeholder.")
    return _fallback_image(prompt, width_hint, height_hint), "image/png"
