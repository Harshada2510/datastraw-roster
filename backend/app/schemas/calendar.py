"""Pydantic v2 schemas for the Calendar API.

The response is intentionally flat and keyed by calendar date so a React
calendar component can render holidays, leaves and weekly-offs without extra
client-side join logic.
"""

from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CalendarHolidayItem(BaseModel):
    """Organisation holiday that falls inside the requested month."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    holiday_name: str
    holiday_date: date
    description: Optional[str] = None


class CalendarLeaveItem(BaseModel):
    """Leave request overlapping the requested month, with employee details."""

    id: int
    employee_id: int
    employee_code: str
    employee_name: str
    start_date: date
    end_date: date
    leave_type: str
    status: str
    reason: Optional[str] = None


class CalendarWeeklyOffItem(BaseModel):
    """Recurring weekly off for an employee."""

    id: int
    employee_id: int
    employee_code: str
    employee_name: str
    day_of_week: str


class CalendarDayItem(BaseModel):
    """Per-day summary used to mark cells in a calendar grid."""

    date: date
    day_of_week: str
    holiday_ids: list[int] = Field(default_factory=list)
    holiday_names: list[str] = Field(default_factory=list)
    leave_employee_ids: list[int] = Field(default_factory=list)
    weekly_off_employee_ids: list[int] = Field(default_factory=list)


class CalendarResponse(BaseModel):
    """Structured month response for a future React calendar UI."""

    year: int
    month: int
    month_name: str
    start_date: date
    end_date: date
    days_in_month: int
    holidays: list[CalendarHolidayItem] = Field(default_factory=list)
    leaves: list[CalendarLeaveItem] = Field(default_factory=list)
    weekly_offs: list[CalendarWeeklyOffItem] = Field(default_factory=list)
    days: list[CalendarDayItem] = Field(default_factory=list)
