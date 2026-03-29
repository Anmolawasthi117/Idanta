"""Pydantic schemas for Brand entity."""

from enum import Enum
from typing import Dict, Optional

from pydantic import BaseModel, Field, field_validator


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
    brand_id: Optional[str] = None
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
    reference_images: list[str] = Field(default_factory=list, description="Array of Supabase storage image URLs")
    name: Optional[str] = Field(default=None, min_length=2)
    tagline: Optional[str] = Field(default=None, min_length=2)

    @field_validator("brand_id", "artisan_story", "name", "tagline", mode="before")
    @classmethod
    def blank_strings_to_none(cls, value: object):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("primary_occasion", mode="before")
    @classmethod
    def normalize_primary_occasion(cls, value: object):
        if isinstance(value, PrimaryOccasion):
            return value
        normalized = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
        aliases = {
            "wedding": PrimaryOccasion.wedding,
            "shaadi": PrimaryOccasion.wedding,
            "शादी": PrimaryOccasion.wedding,
            "festival": PrimaryOccasion.festival,
            "tyohaar": PrimaryOccasion.festival,
            "त्योहार": PrimaryOccasion.festival,
            "daily": PrimaryOccasion.daily,
            "roz": PrimaryOccasion.daily,
            "दैनिक": PrimaryOccasion.daily,
            "दैनिक_उपयोग": PrimaryOccasion.daily,
            "gifting": PrimaryOccasion.gifting,
            "gift": PrimaryOccasion.gifting,
            "उपहार": PrimaryOccasion.gifting,
            "home_decor": PrimaryOccasion.home_decor,
            "home": PrimaryOccasion.home_decor,
            "decor": PrimaryOccasion.home_decor,
            "export": PrimaryOccasion.export,
            "general": PrimaryOccasion.general,
        }
        if normalized in aliases:
            return aliases[normalized]
        if any(token in normalized for token in ["daily", "दैनिक", "उपयोग", "roz"]):
            return PrimaryOccasion.daily
        if any(token in normalized for token in ["festival", "त्योहार", "tyohaar"]):
            return PrimaryOccasion.festival
        if any(token in normalized for token in ["wedding", "shaadi", "शादी"]):
            return PrimaryOccasion.wedding
        if any(token in normalized for token in ["gift", "उपहार"]):
            return PrimaryOccasion.gifting
        if any(token in normalized for token in ["home", "decor", "सजावट"]):
            return PrimaryOccasion.home_decor
        if "export" in normalized:
            return PrimaryOccasion.export
        if "general" in normalized:
            return PrimaryOccasion.general
        return value

    @field_validator("target_customer", mode="before")
    @classmethod
    def normalize_target_customer(cls, value: object):
        if isinstance(value, TargetCustomer):
            return value
        normalized = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
        aliases = {
            "local": TargetCustomer.local_bazaar,
            "local_bazaar": TargetCustomer.local_bazaar,
            "bazaar": TargetCustomer.local_bazaar,
            "स्थानीय": TargetCustomer.local_bazaar,
            "स्थानीय_बाजार": TargetCustomer.local_bazaar,
            "tourist": TargetCustomer.tourist,
            "tourists": TargetCustomer.tourist,
            "पर्यटक": TargetCustomer.tourist,
            "online": TargetCustomer.online_india,
            "online_india": TargetCustomer.online_india,
            "india_online": TargetCustomer.online_india,
            "export": TargetCustomer.export,
        }
        if normalized in aliases:
            return aliases[normalized]
        if "online" in normalized:
            return TargetCustomer.online_india
        if "export" in normalized:
            return TargetCustomer.export
        if any(token in normalized for token in ["tourist", "पर्यटक"]):
            return TargetCustomer.tourist
        if any(token in normalized for token in ["local", "bazaar", "स्थानीय", "बाजार"]):
            return TargetCustomer.local_bazaar
        return value


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
    reference_images: Optional[list[str]] = None
    visual_summary: Optional[str] = None
    visual_motifs: Optional[list[str]] = None
    signature_patterns: Optional[list[Dict]] = None
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
