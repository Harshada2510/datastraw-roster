"""Pydantic v2 schemas for the Staffing Requirement API."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _validate_date_range(start_date: date | None, end_date: date | None) -> None:
    if start_date is not None and end_date is not None and end_date < start_date:
        raise ValueError("end_date cannot be earlier than start_date")


class StaffingRequirementFieldRules(BaseModel):
    """Shared validation rules for staffing requirement create/update payloads."""

    @field_validator(
        "brand_id",
        "process_id",
        "required_count",
        "start_date",
        "end_date",
        mode="before",
        check_fields=False,
    )
    @classmethod
    def reject_null(cls, value):
        # notes is the only field that may be explicitly cleared with null.
        if value is None:
            raise ValueError("must not be null")
        return value

    @field_validator("notes", mode="before", check_fields=False)
    @classmethod
    def clean_notes(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
        return value


class StaffingRequirementCreate(StaffingRequirementFieldRules):
    """Payload for POST /api/staffing-requirements.

    Supplying only ``start_date`` creates a single-day requirement; the route
    stores the same value in ``end_date``.
    """

    brand_id: int = Field(gt=0)
    process_id: int = Field(gt=0)
    start_date: date
    end_date: Optional[date] = None
    required_count: int = Field(gt=0)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def normalize_range(self):
        if self.end_date is None:
            self.end_date = self.start_date
        _validate_date_range(self.start_date, self.end_date)
        return self


class StaffingRequirementUpdate(StaffingRequirementFieldRules):
    """Payload for PUT /api/staffing-requirements/{requirement_id}; partial updates."""

    brand_id: Optional[int] = Field(default=None, gt=0)
    process_id: Optional[int] = Field(default=None, gt=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    required_count: Optional[int] = Field(default=None, gt=0)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def validate_update(self):
        allowed = {
            "brand_id",
            "process_id",
            "start_date",
            "end_date",
            "required_count",
            "notes",
        }
        if not allowed.intersection(self.model_fields_set):
            raise ValueError("at least one field must be provided for an update")
        _validate_date_range(self.start_date, self.end_date)
        return self


class StaffingRequirementResponse(BaseModel):
    """Staffing requirement data returned by all staffing endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    brand_id: int
    process_id: int
    start_date: date
    end_date: date
    required_count: int
    notes: Optional[str] = None
    created_at: datetime
