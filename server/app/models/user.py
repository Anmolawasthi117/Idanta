"""Pydantic schemas for User entity."""

from typing import Optional
from pydantic import BaseModel, Field


class UserRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, examples=["Ramesh Kumar"])
    phone: str = Field(..., pattern=r"^\+?[1-9]\d{9,14}$", examples=["+919876543210"])
    password: str = Field(..., min_length=6)
    language: str = Field(default="hi", pattern="^(hi|en)$")


class UserLoginRequest(BaseModel):
    phone: str = Field(..., examples=["+919876543210"])
    password: str


class UserPublic(BaseModel):
    id: str
    name: str
    phone: str
    language: str
    has_brand: bool

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
