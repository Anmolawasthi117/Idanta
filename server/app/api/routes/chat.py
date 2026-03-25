"""Chat assist routes for frontend-guided onboarding/product intake."""

import logging
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_user_id
from app.services.groq_client import groq_json_completion

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
