"""
Main API router — mounts all route modules under /api/v1.
"""

from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from app.api.routes import auth, brand, product, jobs

api_router = APIRouter()

# ── Health ──────────────────────────────────────────────────────────────────────
@api_router.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "message": "Idanta API is healthy 🙏"}


# ── Redirects (Userfriendly) ───────────────────────────────────────────────────
@api_router.post("/auth/regester", include_in_schema=False)
async def redirect_regester():
    return RedirectResponse(url="/api/v1/auth/register")


# ── Route Modules ───────────────────────────────────────────────────────────────
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(brand.router, prefix="/brands", tags=["Brands"])
api_router.include_router(product.router, prefix="/products", tags=["Products"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
