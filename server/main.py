"""
Idanta API — Application Entry Point

Initializes FastAPI with:
- Lifespan events (pre-load ML embedding model on startup)
- CORS middleware
- API router mounting
- Structured logging
"""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


# ── Lifespan ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: pre-load the sentence-transformer embedding model so the first
    API request doesn't pay the 5-10 second cold-start penalty.
    """
    logger.info("🚀 Idanta API starting up...")
    try:
        from app.rag.embedder import _load_model
        _load_model()
        logger.info("✅ Embedding model pre-loaded successfully.")
    except Exception as e:
        logger.warning(f"⚠️  Embedding model pre-load failed (non-fatal): {e}")

    yield  # Application runs here

    logger.info("🛑 Idanta API shutting down.")


# ── App Factory ────────────────────────────────────────────────────────────────
def get_application() -> FastAPI:
    application = FastAPI(
        title=settings.PROJECT_NAME,
        description=(
            "Brand-in-a-Box for Indian Artisans. "
            "Converts craft heritage into professional brand identities using "
            "LangGraph + RAG + Groq."
        ),
        version="1.0.0",
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        docs_url=f"{settings.API_V1_STR}/docs",
        redoc_url=f"{settings.API_V1_STR}/redoc",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routes ────────────────────────────────────────────────────────────────
    application.include_router(api_router, prefix=settings.API_V1_STR)

    # ── Root ──────────────────────────────────────────────────────────────────
    @application.get("/", tags=["Root"], include_in_schema=False)
    async def root():
        return {
            "app": settings.PROJECT_NAME,
            "version": "1.0.0",
            "docs": f"{settings.API_V1_STR}/docs",
            "health": f"{settings.API_V1_STR}/health",
        }

    return application


app = get_application()
