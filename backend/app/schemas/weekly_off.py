"""Pydantic v2 schemas for the Weekly Off API."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

DayOfWeek = Literal[
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
]
DAYS_OF_WEEK = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)


class WeeklyOffFieldRules(BaseModel):
    """Shared validation rules for weekly-off create/update payloads."""

    @field_validator("employee_id", "day_of_week", mode="before", check_fields=False)
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("must not be null")
        return value

    @field_validator("day_of_week", mode="before", check_fields=False)
    @classmethod
    def normalize_day(cls, value):
        if isinstance(value, str):
            normalized = value.strip()
            for candidate in DAYS_OF_WEEK:
                if normalized.lower() == candidate.lower():
                    return candidate
        return value


class WeeklyOffCreate(WeeklyOffFieldRules):
    """Payload for POST /api/weekly-offs."""

    employee_id: int = Field(gt=0)
    day_of_week: DayOfWeek


class WeeklyOffUpdate(WeeklyOffFieldRules):
    """Payload for PUT /api/weekly-offs/{weekly_off_id}."""

    employee_id: Optional[int] = Field(default=None, gt=0)
    day_of_week: Optional[DayOfWeek] = None

    @model_validator(mode="after")
    def require_at_least_one_field(self):
        allowed = {"employee_id", "day_of_week"}
        if not allowed.intersection(self.model_fields_set):
            raise ValueError("at least one field must be provided for an update")
        return self


class WeeklyOffResponse(BaseModel):
    """Weekly-off data returned by all weekly-off endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    day_of_week: DayOfWeek
    created_at: datetime
