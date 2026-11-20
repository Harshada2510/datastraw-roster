"""Pydantic v2 schemas for the Pod CRUD API."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PodFieldRules(BaseModel):
    """Shared validation rules for pod create/update payloads."""

    @field_validator("pod_name", mode="before", check_fields=False)
    @classmethod
    def clean_pod_name(cls, value):
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


class PodCreate(PodFieldRules):
    """Payload for POST /api/pods.

    ``pod_lead_id`` is optional to match the nullable model column, but when
    supplied it must reference an existing employee.
    """

    pod_name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = None
    pod_lead_id: Optional[int] = Field(default=None, gt=0)
    is_active: bool = True


class PodUpdate(PodFieldRules):
    """Payload for PUT /api/pods/{pod_id}; only supplied fields change."""

    pod_name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = None
    pod_lead_id: Optional[int] = Field(default=None, gt=0)
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def require_at_least_one_field(self):
        # Use fields actually supplied so an explicit null (e.g. clearing the
        # pod lead) counts as an update.
        allowed = {"pod_name", "description", "pod_lead_id", "is_active"}
        if not allowed.intersection(self.model_fields_set):
            raise ValueError("at least one field must be provided for an update")
        return self


class PodResponse(BaseModel):
    """Pod data returned by all pod endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    pod_name: str
    description: Optional[str] = None
    pod_lead_id: Optional[int] = None
    is_active: bool
    created_at: datetime
