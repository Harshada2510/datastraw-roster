"""Pydantic v2 schemas for the Employee CRUD API."""

import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Lightweight format check; avoids requiring the optional `email-validator` package.
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class EmployeeFieldRules(BaseModel):
    """Shared validation rules for employee create/update payloads."""

    @field_validator("employee_code", "full_name", mode="before", check_fields=False)
    @classmethod
    def clean_required_text(cls, value):
        if isinstance(value, str):
            value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value

    @field_validator(
        "email", "phone", "designation", mode="before", check_fields=False
    )
    @classmethod
    def clean_optional_text(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
        return value

    @field_validator("email", check_fields=False)
    @classmethod
    def validate_email(cls, value):
        if value is not None:
            if not EMAIL_PATTERN.fullmatch(value):
                raise ValueError("must be a valid email address")
            # Store normalised so uniqueness checks are consistent.
            value = value.lower()
        return value


class EmployeeCreate(EmployeeFieldRules):
    """Payload for POST /api/employees."""

    employee_code: str = Field(min_length=1, max_length=50)
    full_name: str = Field(min_length=1, max_length=150)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=30)
    designation: Optional[str] = Field(default=None, max_length=100)
    is_active: bool = True


class EmployeeUpdate(EmployeeFieldRules):
    """Payload for PUT /api/employees/{employee_id}; only supplied fields change."""

    employee_code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=30)
    designation: Optional[str] = Field(default=None, max_length=100)
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def require_at_least_one_field(self):
        provided = (
            self.employee_code,
            self.full_name,
            self.email,
            self.phone,
            self.designation,
            self.is_active,
        )
        if all(value is None for value in provided):
            raise ValueError("at least one field must be provided for an update")
        return self


class EmployeeResponse(BaseModel):
    """Employee data returned by all employee endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_code: str
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
