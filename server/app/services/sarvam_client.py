import base64
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SARVAM_API_URL = "https://api.sarvam.ai"


def _decode_audio_payload(value) -> bytes | None:
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    if isinstance(value, str):
        try:
            return base64.b64decode(value)
        except Exception:
            return None
    return None


def _extract_audio_chunks(message) -> list[bytes]:
    """
    Extract audio chunks from multiple possible SDK event shapes.
    This is intentionally defensive because SDK event classes can vary by version.
    """
    chunks: list[bytes] = []
    data = getattr(message, "data", None)

    # Common direct fields
    direct_candidates = [
        getattr(message, "audio", None),
        getattr(data, "audio", None) if data is not None else None,
        getattr(message, "chunk", None),
        getattr(data, "chunk", None) if data is not None else None,
        getattr(message, "data", None),
    ]
    for candidate in direct_candidates:
        decoded = _decode_audio_payload(candidate)
        if decoded:
            chunks.append(decoded)

    # Array style payloads (e.g. audios: [base64...])
    audios = getattr(data, "audios", None) if data is not None else None
    if isinstance(audios, list):
        for item in audios:
            decoded = _decode_audio_payload(item)
            if decoded:
                chunks.append(decoded)

    # Dict style payloads
    dict_payload = None
    if isinstance(message, dict):
        dict_payload = message
    elif data is not None and hasattr(data, "model_dump"):
        try:
            dict_payload = data.model_dump()
        except Exception:
            dict_payload = None
    elif data is not None and hasattr(data, "__dict__"):
        dict_payload = data.__dict__

    if isinstance(dict_payload, dict):
        for key in ("audio", "chunk"):
            decoded = _decode_audio_payload(dict_payload.get(key))
            if decoded:
                chunks.append(decoded)
        audios_list = dict_payload.get("audios")
        if isinstance(audios_list, list):
            for item in audios_list:
                decoded = _decode_audio_payload(item)
                if decoded:
                    chunks.append(decoded)

    return chunks


def _extract_event_type(message) -> str:
    data = getattr(message, "data", None)
    event_type = getattr(data, "event_type", None)
    if isinstance(event_type, str):
        return event_type
    if isinstance(message, dict):
        data_dict = message.get("data")
        if isinstance(data_dict, dict) and isinstance(data_dict.get("event_type"), str):
            return data_dict["event_type"]
    if data is not None and hasattr(data, "model_dump"):
        try:
            payload = data.model_dump()
            if isinstance(payload, dict) and isinstance(payload.get("event_type"), str):
                return payload["event_type"]
        except Exception:
            pass
    return ""

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


async def sarvam_stream_speech(text: str, target_language_code: str = "hi-IN", speaker: str = "shubh"):
    """
    Stream synthesized speech bytes from Sarvam WebSocket TTS.
    Yields audio chunks (mp3 bytes) progressively for low-latency playback.
    """
    if not settings.SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not set.")
    if not text.strip():
        return

    try:
        from sarvamai import AsyncSarvamAI
    except Exception as exc:
        raise RuntimeError("sarvamai package is required for streaming TTS. Install/update server dependencies.") from exc

    client = AsyncSarvamAI(api_subscription_key=settings.SARVAM_API_KEY)
    chunk_count = 0
    total_bytes = 0
    logger.info(
        "Sarvam streaming TTS start: chars=%s, lang=%s, speaker=%s",
        len(text),
        target_language_code,
        speaker,
    )
    try:
        async with client.text_to_speech_streaming.connect(
            model="bulbul:v3",
            send_completion_event=True,
        ) as ws:
            await ws.configure(target_language_code=target_language_code, speaker=speaker, pace=1.0, output_audio_codec="mp3")
            await ws.convert(text)
            await ws.flush()

            async for message in ws:
                message_type = getattr(message, "type", type(message).__name__)
                if message_type == "audio":
                    # SDK typed response: AudioOutput(type="audio", data=AudioOutputData(audio="<base64>"))
                    msg_data = getattr(message, "data", None)
                    audio_b64 = getattr(msg_data, "audio", None)
                    content_type = getattr(msg_data, "content_type", None)
                    chunk = _decode_audio_payload(audio_b64)
                    if chunk:
                        chunk_count += 1
                        total_bytes += len(chunk)
                        logger.info(
                            "Sarvam streaming TTS chunk: idx=%s bytes=%s type=%s content_type=%s",
                            chunk_count,
                            len(chunk),
                            message_type,
                            content_type,
                        )
                        yield chunk
                    else:
                        logger.info("Sarvam streaming TTS empty audio payload type=%s", message_type)
                else:
                    logger.info("Sarvam streaming TTS non-audio message type=%s", message_type)

                event_type = _extract_event_type(message)
                if event_type:
                    logger.info("Sarvam streaming TTS event: %s", event_type)
                    if event_type == "final":
                        break
        logger.info(
            "Sarvam streaming TTS complete: chunks=%s total_bytes=%s",
            chunk_count,
            total_bytes,
        )
    except Exception as exc:
        logger.error("Sarvam streaming TTS failed: %s", exc)
        raise RuntimeError(f"Failed to stream speech with Sarvam: {exc}") from exc
