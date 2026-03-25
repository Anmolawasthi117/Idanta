"""Pydantic schemas for Brand entity."""

from enum import Enum
from typing import Dict, Optional

from pydantic import BaseModel, Field


class PrimaryOccasion(str, Enum):
    wedding = "wedding"
    festival = "festival"
    daily = "daily"
    gifting = "gifting"
    home_decor = "home_decor"
    export = "export"
    general = "general"


class TargetCustomer(str, Enum):
    local_bazaar = "local_bazaar"
    tourist = "tourist"
    online_india = "online_india"
    export = "export"


class BrandFeel(str, Enum):
    earthy = "earthy"
    royal = "royal"
    vibrant = "vibrant"
    minimal = "minimal"


class ScriptPreference(str, Enum):
    hindi = "hindi"
    english = "english"
    both = "both"


class PaletteSchema(BaseModel):
    primary: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
    accent: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")


class BrandCreate(BaseModel):
    craft_id: str = Field(..., examples=["block_print_jaipur"])
    artisan_name: str = Field(..., min_length=2, examples=["Ramesh Kumar"])
    region: str = Field(..., examples=["Sanganer, Jaipur"])
    years_of_experience: int = Field(default=0, ge=0, le=100)
    generations_in_craft: int = Field(default=1, ge=1, le=10)
    primary_occasion: PrimaryOccasion = PrimaryOccasion.general
    target_customer: TargetCustomer = TargetCustomer.local_bazaar
    brand_feel: BrandFeel = BrandFeel.earthy
    script_preference: ScriptPreference = ScriptPreference.both
    artisan_story: Optional[str] = Field(default=None, max_length=4000)
    preferred_language: str = Field(default="hi", pattern="^(hi|en)$")


class BrandResponse(BaseModel):
    id: str
    craft_id: str
    artisan_name: Optional[str] = None
    region: Optional[str] = None
    generations_in_craft: int = 1
    years_of_experience: int = 0
    primary_occasion: PrimaryOccasion = PrimaryOccasion.general
    target_customer: TargetCustomer = TargetCustomer.local_bazaar
    brand_feel: BrandFeel = BrandFeel.earthy
    artisan_story: Optional[str] = None
    script_preference: ScriptPreference = ScriptPreference.both
    preferred_language: Optional[str] = None
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


BrandCreateRequest = BrandCreate
BrandPublic = BrandResponse
