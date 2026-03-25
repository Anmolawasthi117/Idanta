"""
Core application configuration using Pydantic Settings.
All values are read from the .env file or environment variables.
"""

from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ────────────────────────────────────────────────────────────────────
    PROJECT_NAME: str = "Idanta API"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v):
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v

    # ── Supabase ───────────────────────────────────────────────────────────────
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_STORAGE_BUCKET: str = "idanta-assets"

    # ── JWT ────────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    # ── Groq ───────────────────────────────────────────────────────────────────
    GROQ_API_KEY: str
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # ── Google Gemini ──────────────────────────────────────────────────────────
    GEMINI_API_KEY: str
    GEMINI_VISION_MODEL: str = "gemini-1.5-flash"
    GEMINI_IMAGE_MODEL: str = "gemini-2.0-flash-preview-image-generation"

    # ── Pollinations.ai ────────────────────────────────────────────────────────
    POLLINATIONS_API_KEY: str

    # ── RAG / Embeddings ───────────────────────────────────────────────────────
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    RAG_TOP_K: int = 4

    # ── PDF Engine ─────────────────────────────────────────────────────────────

@lru_cache()
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()


settings = get_settings()
