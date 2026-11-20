"""Pydantic v2 schemas for the Brand CRUD API."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class BrandFieldRules(BaseModel):
    """Shared validation rules for brand create/update payloads."""

    @field_validator("brand_name", mode="before", check_fields=False)
    @classmethod
    def clean_brand_name(cls, value):
        if isinstance(value, str):
            value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value

    @field_validator("description", mode="before", check_fields=False)
    @classmethod
    def clean_description(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
        return value


class BrandCreate(BrandFieldRules):
    """Payload for POST /api/brands."""

    brand_name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = None
    is_active: bool = True


class BrandUpdate(BrandFieldRules):
    """Payload for PUT /api/brands/{brand_id}; only supplied fields change."""

    brand_name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = None
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def require_at_least_one_field(self):
        if (
            self.brand_name is None
            and self.description is None
            and self.is_active is None
        ):
            raise ValueError("at least one field must be provided for an update")
        return self


class BrandResponse(BaseModel):
    """Brand data returned by all brand endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    brand_name: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime
