"""Chat assist routes for frontend-guided onboarding/product intake."""

import logging
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.deps import get_current_user_id
from app.services.groq_client import groq_json_completion, groq_stream_completion, groq_transcribe_audio

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatAssistRequest(BaseModel):
    system_prompt: str
    messages: list[dict[str, str]] = Field(default_factory=list)
    context: dict[str, Any] = Field(default_factory=dict)


class ChatAssistResponse(BaseModel):
    content: str


def _build_transcript(messages: list[dict[str, str]]) -> str:
    return "\n".join(f"{message.get('role', 'user')}: {message.get('content', '')}" for message in messages)


async def _chat_completion(payload: ChatAssistRequest) -> ChatAssistResponse:
    transcript = _build_transcript(payload.messages)
    result = await groq_json_completion(
        system_prompt=payload.system_prompt,
        user_prompt=(
            "Conversation so far:\n"
            f"{transcript}\n\n"
            "Context:\n"
            f"{payload.context}\n\n"
            "Respond with JSON containing keys: message, extracted, is_complete."
        ),
        max_tokens=1024,
        temperature=0.4,
    )
    return ChatAssistResponse(content=json.dumps(result, ensure_ascii=False))


@router.post("/brand-assist", response_model=ChatAssistResponse, status_code=status.HTTP_200_OK)
async def brand_assist(payload: ChatAssistRequest, _user_id: str = Depends(get_current_user_id)):
    try:
        return await _chat_completion(payload)
    except Exception as exc:
        logger.error("Brand assist failed: %s", exc)
        raise HTTPException(status_code=500, detail="Brand chat assist failed.") from exc


@router.post("/product-assist", response_model=ChatAssistResponse, status_code=status.HTTP_200_OK)
async def product_assist(payload: ChatAssistRequest, _user_id: str = Depends(get_current_user_id)):
    try:
        return await _chat_completion(payload)
    except Exception as exc:
        logger.error("Product assist failed: %s", exc)
        raise HTTPException(status_code=500, detail="Product chat assist failed.") from exc


async def _chat_stream(payload: ChatAssistRequest):
    transcript = _build_transcript(payload.messages)
    
    # 1. Stream the conversational message
    user_prompt_msg = (
        "Conversation so far:\n"
        f"{transcript}\n\n"
        "Context:\n"
        f"{payload.context}\n\n"
        "Respond ONLY with your friendly conversational reply. Do not output JSON. Keep it short."
    )
    
    message_content = ""
    try:
        stream_gen = groq_stream_completion(
            system_prompt=payload.system_prompt,
            user_prompt=user_prompt_msg,
        )
        async for chunk in stream_gen:
            message_content += chunk
            yield f"data: {json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"
            
    except Exception as e:
        logger.error(f"Stream failed: {e}")
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"
        return

    # 2. Extract structured data
    extraction_prompt = (
        "Based on the conversation so far, and your latest reply:\n"
        f"{message_content}\n\n"
        "Context constraints:\n"
        f"{payload.context}\n\n"
        "Extract the current state into JSON with keys: extracted, is_complete."
    )
    try:
        extraction_result = await groq_json_completion(
            system_prompt=payload.system_prompt,
            user_prompt=extraction_prompt,
            max_tokens=512,
            temperature=0.1
        )
        yield f"data: {json.dumps({'type': 'final', 'extracted': extraction_result.get('extracted', {}), 'is_complete': extraction_result.get('is_complete', False)}, ensure_ascii=False)}\n\n"
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        yield f"data: {json.dumps({'type': 'final', 'extracted': {}, 'is_complete': False}, ensure_ascii=False)}\n\n"


@router.post("/brand-assist-stream")
async def brand_assist_stream(payload: ChatAssistRequest, _user_id: str = Depends(get_current_user_id)):
    return StreamingResponse(_chat_stream(payload), media_type="text/event-stream")


@router.post("/product-assist-stream")
async def product_assist_stream(payload: ChatAssistRequest, _user_id: str = Depends(get_current_user_id)):
    return StreamingResponse(_chat_stream(payload), media_type="text/event-stream")

@router.post("/transcribe-audio")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str = Form(None),
    _user_id: str = Depends(get_current_user_id)
):
    try:
        content = await audio.read()
        text = await groq_transcribe_audio(audio.filename or "audio.webm", content, language)
        return {"text": text}
    except Exception as exc:
        logger.error("Audio transcription failed: %s", exc)
        raise HTTPException(status_code=500, detail="Transcription failed.") from exc
