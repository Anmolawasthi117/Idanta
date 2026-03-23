from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.router import api_router

def get_application() -> FastAPI:
    application = FastAPI(
        title=settings.PROJECT_NAME,
        openapi_url=f"{settings.API_V1_STR}/openapi.json"
    )

    # Set up CORS
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    application.include_router(api_router, prefix=settings.API_V1_STR)

    @application.get("/", tags=["root"])
    async def root():
        return {
            "message": "Welcome to Idanta API",
            "docs": "/docs",
            "health": f"{settings.API_V1_STR}/health"
        }

    return application

app = get_application()
