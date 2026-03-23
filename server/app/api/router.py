from fastapi import APIRouter

api_router = APIRouter()

@api_router.get("/health", tags=["health"])
async def health_check():
    return {
        "status": "ok",
        "message": "Service is healthy"
    }
