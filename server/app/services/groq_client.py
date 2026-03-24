"""
Groq LLM client wrapper.
Uses Llama 3.3 70B in JSON mode with automatic exponential-backoff retries.
"""

import asyncio
import json
import logging
from typing import Any, Dict, Optional

from groq import AsyncGroq, RateLimitError

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: Optional[AsyncGroq] = None


def get_groq_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    return _client


async def groq_json_completion(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 2048,
    temperature: float = 0.7,
    max_retries: int = 4,
) -> Dict[str, Any]:
    """
    Call Groq in JSON mode and return parsed dict.
    Automatically retries on RateLimitError with exponential backoff.

    :raises ValueError: If the response cannot be parsed as JSON.
    :raises RuntimeError: If all retries are exhausted.
    """
    client = get_groq_client()
    delay = 2.0  # seconds

    for attempt in range(max_retries):
        try:
            response = await client.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=max_tokens,
                temperature=temperature,
            )
            raw = response.choices[0].message.content
            return json.loads(raw)

        except RateLimitError:
            if attempt == max_retries - 1:
                raise RuntimeError("Groq rate limit exceeded after all retries.")
            wait = delay * (2 ** attempt)
            logger.warning(f"Groq rate limit hit. Retrying in {wait}s (attempt {attempt + 1})...")
            await asyncio.sleep(wait)

        except json.JSONDecodeError as e:
            raise ValueError(f"Groq returned non-JSON response: {e}")

    raise RuntimeError("Groq completion failed after maximum retries.")


async def groq_text_completion(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 1024,
    temperature: float = 0.7,
    max_retries: int = 4,
) -> str:
    """
    Call Groq for plain text response (no JSON mode).
    Useful for language translation and free-form text.
    """
    client = get_groq_client()
    delay = 2.0

    for attempt in range(max_retries):
        try:
            response = await client.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=max_tokens,
                temperature=temperature,
            )
            return response.choices[0].message.content.strip()

        except RateLimitError:
            if attempt == max_retries - 1:
                raise RuntimeError("Groq rate limit exceeded after all retries.")
            wait = delay * (2 ** attempt)
            logger.warning(f"Groq rate limit hit. Retrying in {wait}s (attempt {attempt + 1})...")
            await asyncio.sleep(wait)

    raise RuntimeError("Groq text completion failed after maximum retries.")
