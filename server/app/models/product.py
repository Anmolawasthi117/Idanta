"""Pydantic schemas for Product entity."""

from typing import Optional, List
from pydantic import BaseModel, Field


class ProductCreateRequest(BaseModel):
    brand_id: str = Field(..., description="UUID of the parent brand")
    name: str = Field(..., min_length=2, max_length=200, examples=["Hand-block printed cotton kurta"])
    price_mrp: float = Field(..., gt=0, examples=[1299.00])
    motif_used: Optional[str] = Field(None, examples=["Buta flower"])
    material: Optional[str] = Field(None, examples=["Pure cotton, natural dyes"])


class ProductGenerateAssetsRequest(BaseModel):
    """Trigger asset generation for an existing product."""
    pass  # The product ID comes from the URL path


class ProductPublic(BaseModel):
    id: str
    brand_id: str
    name: str
    price_mrp: Optional[float]
    motif_used: Optional[str]
    material: Optional[str]
    listing_copy: Optional[str]
    photos: Optional[List[str]]
    branded_photo_url: Optional[str]
    hang_tag_url: Optional[str]
    label_url: Optional[str]
    status: str

    class Config:
        from_attributes = True
