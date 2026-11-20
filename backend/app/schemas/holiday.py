"""Pydantic v2 schemas for the Holiday API."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class HolidayFieldRules(BaseModel):
    """Shared validation rules for holiday create/update payloads."""

    @field_validator("holiday_name", "holiday_date", mode="before", check_fields=False)
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("must not be null")
        return value

    @field_validator("holiday_name", mode="before", check_fields=False)
    @classmethod
    def clean_holiday_name(cls, value):
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


class HolidayCreate(HolidayFieldRules):
    """Payload for POST /api/holidays."""

    holiday_name: str = Field(min_length=1, max_length=150)
    holiday_date: date
    description: Optional[str] = None


class HolidayUpdate(HolidayFieldRules):
    """Payload for PUT /api/holidays/{holiday_id}."""

    holiday_name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    holiday_date: Optional[date] = None
    description: Optional[str] = None

    @model_validator(mode="after")
    def require_at_least_one_field(self):
        allowed = {"holiday_name", "holiday_date", "description"}
        if not allowed.intersection(self.model_fields_set):
            raise ValueError("at least one field must be provided for an update")
        return self


class HolidayResponse(BaseModel):
    """Holiday data returned by all holiday endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    holiday_name: str
    holiday_date: date
    description: Optional[str] = None
    created_at: datetime
