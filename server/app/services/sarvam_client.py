import logging
import httpx
from fastapi import HTTPException
from app.core.config import settings

logger = logging.getLogger(__name__)

SARVAM_API_URL = "https://api.sarvam.ai"

async def sarvam_transcribe_audio(file_bytes: bytes, filename: str = "audio.webm") -> str:
    if not settings.SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not set.")
    
    url = f"{SARVAM_API_URL}/speech-to-text"
    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY
    }
    
    files = {
        'file': (filename, file_bytes, 'audio/webm')
    }
    data = {
        'model': 'saaras:v3'
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, files=files, data=data, timeout=60.0)
            response.raise_for_status()
            result = response.json()
            return result.get("transcript", "")
        except httpx.HTTPError as exc:
            logger.error(f"Sarvam STT failed: {exc}")
            raise RuntimeError(f"Failed to transcribe audio with Sarvam: {exc}") from exc

async def sarvam_synthesize_speech(text: str, target_language_code: str = "hi-IN", speaker: str = "shubh") -> str:
    if not settings.SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not set.")
    
    url = f"{SARVAM_API_URL}/text-to-speech"
    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json"
    }
    
    payload = {
        "inputs": [text],
        "target_language_code": target_language_code,
        "speaker": speaker,
        "pace": 1.0,
        "speech_sample_rate": 8000,
        "enable_preprocessing": True,
        "model": "bulbul:v3"
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=payload, timeout=60.0)
            response.raise_for_status()
            result = response.json()
            if "audios" in result and len(result["audios"]) > 0:
                return result["audios"][0]
            else:
                raise RuntimeError("No audio returned from Sarvam API.")
        except httpx.HTTPError as exc:
            err_text = response.text if hasattr(response, 'text') else str(exc)
            logger.error(f"Sarvam TTS failed: {exc}. Response: {err_text}")
            raise RuntimeError(f"Failed to synthesize speech with Sarvam. Details: {err_text}") from exc
