"""Pydantic schemas for Brand entity."""

from typing import Optional, Dict
from pydantic import BaseModel, Field


class PaletteSchema(BaseModel):
    primary: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
    accent: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")


class BrandCreateRequest(BaseModel):
    craft_id: str = Field(..., examples=["block_print_jaipur"])
    artisan_name: str = Field(..., min_length=2, examples=["Ramesh Kumar"])
    years_of_experience: int = Field(..., ge=0, le=80)
    region: str = Field(..., examples=["Jaipur, Rajasthan"])
    inspiration: Optional[str] = Field(None, max_length=500)
    preferred_language: str = Field(default="hi", pattern="^(hi|en)$")


class BrandPublic(BaseModel):
    id: str
    craft_id: str
    name: Optional[str]
    tagline: Optional[str]
    palette: Optional[Dict]
    story_en: Optional[str]
    story_hi: Optional[str]
    logo_url: Optional[str]
    banner_url: Optional[str]
    kit_zip_url: Optional[str]
    status: str

    class Config:
        from_attributes = True


class CraftInfo(BaseModel):
    craft_id: str
    display_name: str
    region: str
    description: str
