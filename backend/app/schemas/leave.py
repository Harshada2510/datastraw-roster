"""Pydantic v2 schemas for the Leave API."""

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

LeaveStatus = Literal["Pending", "Approved", "Rejected"]
LEAVE_STATUSES = ("Pending", "Approved", "Rejected")


def _validate_date_range(start_date: date | None, end_date: date | None) -> None:
    if start_date is not None and end_date is not None and end_date < start_date:
        raise ValueError("end_date cannot be earlier than start_date")


class LeaveFieldRules(BaseModel):
    """Shared validation rules for leave create/update payloads."""

    @field_validator(
        "employee_id",
        "start_date",
        "end_date",
        "leave_type",
        "status",
        mode="before",
        check_fields=False,
    )
    @classmethod
    def reject_null(cls, value):
        # reason is the only field that may be explicitly cleared with null.
        if value is None:
            raise ValueError("must not be null")
        return value

    @field_validator("leave_type", mode="before", check_fields=False)
    @classmethod
    def clean_leave_type(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if not value:
                raise ValueError("must not be empty")
        return value

    @field_validator("reason", mode="before", check_fields=False)
    @classmethod
    def clean_reason(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
        return value

    @field_validator("status", mode="before", check_fields=False)
    @classmethod
    def normalize_status(cls, value):
        if isinstance(value, str):
            normalized = value.strip()
            for candidate in LEAVE_STATUSES:
                if normalized.lower() == candidate.lower():
                    return candidate
        return value


class LeaveCreate(LeaveFieldRules):
    """Payload for POST /api/leaves."""

    employee_id: int = Field(gt=0)
    start_date: date
    end_date: date
    leave_type: str = Field(min_length=1, max_length=50)
    reason: Optional[str] = None
    status: LeaveStatus = "Pending"

    @model_validator(mode="after")
    def validate_range(self):
        _validate_date_range(self.start_date, self.end_date)
        return self


class LeaveUpdate(LeaveFieldRules):
    """Payload for PUT /api/leaves/{leave_id}; only supplied fields change."""

    employee_id: Optional[int] = Field(default=None, gt=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    leave_type: Optional[str] = Field(default=None, min_length=1, max_length=50)
    reason: Optional[str] = None
    status: Optional[LeaveStatus] = None

    @model_validator(mode="after")
    def validate_update(self):
        allowed = {
            "employee_id",
            "start_date",
            "end_date",
            "leave_type",
            "reason",
            "status",
        }
        if not allowed.intersection(self.model_fields_set):
            raise ValueError("at least one field must be provided for an update")
        _validate_date_range(self.start_date, self.end_date)
        return self


class LeaveResponse(BaseModel):
    """Leave data returned by all leave endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    start_date: date
    end_date: date
    leave_type: str
    reason: Optional[str] = None
    status: LeaveStatus
    created_at: datetime
