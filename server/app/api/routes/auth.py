"""
Authentication routes — phone-based register and login.
POST /api/v1/auth/register
POST /api/v1/auth/login
"""

import logging
from fastapi import APIRouter, HTTPException, status, Depends

from app.core.database import supabase
from app.core.security import hash_password, verify_password, create_access_token
from app.models.user import UserRegisterRequest, UserLoginRequest, TokenResponse, UserPublic

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new artisan account",
)
async def register(payload: UserRegisterRequest):
    """
    Register a new user with phone number and password.
    Returns a JWT access token on success.
    """
    try:
        # Check for existing phone
        existing = supabase.table("users").select("id").eq("phone", payload.phone).execute()
        if existing.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this phone number already exists.",
            )

        hashed = hash_password(payload.password)
        row = {
            "name": payload.name,
            "phone": payload.phone,
            "password_hash": hashed,
            "language": payload.language,
        }
        result = supabase.table("users").insert(row).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user account. Please try again.",
            )
            
        user_data = result.data[0]

        token = create_access_token(subject=user_data["id"])
        user_public = UserPublic(
            id=user_data["id"],
            name=user_data["name"],
            phone=user_data["phone"],
            language=user_data["language"],
            has_brand=user_data.get("has_brand", False),
        )

        logger.info(f"New user registered: phone={payload.phone}, id={user_data['id']}")
        return TokenResponse(access_token=token, user=user_public)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Something went wrong on our side. Please check your connection or wait a few minutes.",
        )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with phone and password",
)
async def login(payload: UserLoginRequest):
    """
    Authenticate a user by phone number and password.
    Returns a JWT access token on success.
    """
    try:
        result = supabase.table("users").select("*").eq("phone", payload.phone).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid phone number or password.",
            )

        user_data = result.data[0]

        if not verify_password(payload.password, user_data["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid phone number or password.",
            )

        token = create_access_token(subject=user_data["id"])
        user_public = UserPublic(
            id=user_data["id"],
            name=user_data["name"],
            phone=user_data["phone"],
            language=user_data["language"],
            has_brand=user_data.get("has_brand", False),
        )

        logger.info(f"User login: id={user_data['id']}")
        return TokenResponse(access_token=token, user=user_public)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Something went wrong on our side. Please try again later.",
        )
