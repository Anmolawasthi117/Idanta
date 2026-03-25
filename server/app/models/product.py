"""Pydantic schemas for Product entity."""

from enum import Enum
from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, Field, TypeAdapter


class ProductCategory(str, Enum):
    apparel = "apparel"
    jewelry = "jewelry"
    pottery = "pottery"
    painting = "painting"
    home_decor = "home_decor"
    other = "other"


class ProductOccasion(str, Enum):
    wedding = "wedding"
    festival = "festival"
    daily = "daily"
    gifting = "gifting"
    home_decor = "home_decor"
    export = "export"
    general = "general"


class ApparelData(BaseModel):
    category_type: Literal["apparel"] = "apparel"
    fabric_type: str
    sizes_available: list[str] = Field(default_factory=list)
    wash_care: str
    print_technique: str
    dye_type: Optional[str] = None


class JewelryData(BaseModel):
    category_type: Literal["jewelry"] = "jewelry"
    jewelry_type: str
    sizes_available: list[str] = Field(default_factory=list)
    metal_or_base: str
    stone_or_inlay: Optional[str] = None
    pair_or_set: str = "single"


class PotteryData(BaseModel):
    category_type: Literal["pottery"] = "pottery"
    pottery_type: str
    capacity_ml: Optional[int] = None
    finish_type: str
    is_food_safe: bool = False
    fragility_note: bool = True


class PaintingData(BaseModel):
    category_type: Literal["painting"] = "painting"
    art_style: str
    medium: str
    surface: str
    width_cm: float
    height_cm: float
    is_original: bool = True


class HomeDecorData(BaseModel):
    category_type: Literal["home_decor"] = "home_decor"
    decor_type: str
    material_primary: str
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    depth_cm: Optional[float] = None
    assembly_required: bool = False
    indoor_outdoor: str = "indoor"


class OtherData(BaseModel):
    category_type: Literal["other"] = "other"
    custom_description: Optional[str] = None


CategoryData = Annotated[
    Union[ApparelData, JewelryData, PotteryData, PaintingData, HomeDecorData, OtherData],
    Field(discriminator="category_type"),
]

_CATEGORY_DATA_ADAPTER = TypeAdapter(CategoryData)


class ProductCreate(BaseModel):
    brand_id: str
    name: str
    price_mrp: float = Field(gt=0)
    category: ProductCategory
    occasion: ProductOccasion = ProductOccasion.general
    motif_used: Optional[str] = None
    material: Optional[str] = None
    description_voice: Optional[str] = None
    time_to_make_hrs: int = Field(default=0, ge=0)
    category_data: CategoryData


class ProductGenerateAssetsRequest(BaseModel):
    """Trigger asset generation for an existing product."""

    pass


class ProductResponse(BaseModel):
    id: str
    brand_id: str
    name: str
    price_mrp: Optional[float]
    category: ProductCategory
    occasion: ProductOccasion = ProductOccasion.general
    motif_used: Optional[str]
    material: Optional[str]
    description_voice: Optional[str]
    time_to_make_hrs: int = 0
    category_data: dict[str, Any] = Field(default_factory=dict)
    listing_copy: Optional[str]
    photos: Optional[list[str]]
    branded_photo_url: Optional[str]
    hang_tag_url: Optional[str]
    label_url: Optional[str]
    kit_zip_url: Optional[str]
    story_card_url: Optional[str]
    certificate_url: Optional[str]
    status: str

    class Config:
        from_attributes = True


def validate_category_data(category: ProductCategory | str, raw_data: dict[str, Any]) -> BaseModel:
    """Validate category-specific payloads and keep category and payload aligned."""
    category_value = category.value if isinstance(category, ProductCategory) else str(category)
    payload = dict(raw_data)
    category_type = payload.get("category_type")

    if category_type and category_type != category_value:
        raise ValueError("category_data.category_type must match category")

    payload["category_type"] = category_value
    return _CATEGORY_DATA_ADAPTER.validate_python(payload)


ProductCreateRequest = ProductCreate
ProductPublic = ProductResponse
