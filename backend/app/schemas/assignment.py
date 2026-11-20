"""Pydantic v2 schemas for the EmployeeAssignment API."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class EmployeeAssignmentFieldRules(BaseModel):
    """Shared validation for assignment foreign key fields."""

    @field_validator(
        "employee_id", "brand_id", "process_id", mode="before", check_fields=False
    )
    @classmethod
    def require_positive_id(cls, value):
        # Explicit nulls are never valid for an assignment foreign key.
        if value is None:
            raise ValueError("must be a positive integer")
        return value


class EmployeeAssignmentCreate(EmployeeAssignmentFieldRules):
    """Payload for POST /api/assignments."""

    employee_id: int = Field(gt=0)
    brand_id: int = Field(gt=0)
    process_id: int = Field(gt=0)


class EmployeeAssignmentUpdate(EmployeeAssignmentFieldRules):
    """Payload for PUT /api/assignments/{assignment_id}; partial updates allowed."""

    employee_id: Optional[int] = Field(default=None, gt=0)
    brand_id: Optional[int] = Field(default=None, gt=0)
    process_id: Optional[int] = Field(default=None, gt=0)

    @model_validator(mode="after")
    def require_at_least_one_field(self):
        allowed = {"employee_id", "brand_id", "process_id"}
        if not allowed.intersection(self.model_fields_set):
            raise ValueError("at least one field must be provided for an update")
        return self


class EmployeeAssignmentResponse(BaseModel):
    """Assignment data returned by all assignment endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    brand_id: int
    process_id: int
    created_at: datetime
