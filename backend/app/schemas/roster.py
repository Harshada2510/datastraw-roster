"""Pydantic v2 schemas for the monthly roster generation and validation APIs."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.services.roster_generator import MAX_YEAR, MIN_YEAR


class RosterGenerateRequest(BaseModel):
    """Month/year selector shared by generation and regeneration."""

    month: int = Field(ge=1, le=12)
    year: int = Field(ge=MIN_YEAR, le=MAX_YEAR)


class RosterEntryResponse(BaseModel):
    """One scheduled employee/date/brand/process entry."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    roster_id: int
    employee_id: int
    employee_code: str
    employee_name: str
    brand_id: int
    brand_name: str
    process_id: int
    process_name: str
    roster_date: date
    shift_details: Optional[str] = None
    created_at: datetime


class RosterUncoveredItem(BaseModel):
    """A staffing slot that could not be filled with an eligible employee."""

    roster_date: date
    brand_id: int
    brand_name: str
    process_id: int
    process_name: str
    required_count: int
    assigned_count: int
    shortage: int
    reason: str = "Insufficient eligible employees"


class RosterHolidayItem(BaseModel):
    """Organisation holiday that applied to this generated month."""

    holiday_date: date
    holiday_name: str


class RosterWeeklyOffItem(BaseModel):
    """Employee weekly-off configuration used during generation."""

    employee_id: int
    employee_code: str
    employee_name: str
    day_of_week: str


class RosterApprovedLeaveItem(BaseModel):
    """Approved leave that applied to this generated month."""

    employee_id: int
    employee_code: str
    employee_name: str
    start_date: date
    end_date: date
    leave_type: str


class RosterCoverageItem(BaseModel):
    """Required vs scheduled vs uncovered staffing for one date/requirement."""

    roster_date: date
    brand_id: int
    brand_name: str
    process_id: int
    process_name: str
    required_count: int
    scheduled_count: int
    uncovered_count: int
    status: str
    reason: Optional[str] = None
    holiday_name: Optional[str] = None
    weekly_off_employee_ids: list[int] = []
    weekly_off_employee_names: list[str] = []
    leave_employee_ids: list[int] = []
    leave_employee_names: list[str] = []


class RosterGenerationResponse(BaseModel):
    """Generation statistics plus the full generated roster."""

    roster_id: int
    month: int
    year: int
    month_name: str
    generated_at: datetime
    days_in_month: int
    eligible_employees: int
    total_requirements: int
    total_required_staff: int
    total_entries: int
    total_employees_scheduled: int
    uncovered_count: int
    uncovered: list[RosterUncoveredItem]
    entries: list[RosterEntryResponse]
    holidays: list[RosterHolidayItem] = []
    weekly_offs: list[RosterWeeklyOffItem] = []
    approved_leaves: list[RosterApprovedLeaveItem] = []
    coverage: list[RosterCoverageItem] = []
    message: Optional[str] = None


class RosterValidationConflict(BaseModel):
    """One scheduling conflict found by read-only roster validation."""

    roster_entry_id: int
    conflict_type: str
    employee_id: int
    employee_name: str
    brand_id: int
    brand_name: str
    process_id: int
    process_name: str
    roster_date: date
    message: str
    leave_type: Optional[str] = None
    holiday_name: Optional[str] = None
    weekly_off_day: Optional[str] = None
    conflicting_entry_ids: list[int] = []


class RosterStaffingCoverageItem(BaseModel):
    """Required versus actual staffing for one date/requirement."""

    requirement_id: int
    roster_date: date
    brand_id: int
    brand_name: str
    process_id: int
    process_name: str
    required_count: int
    scheduled_count: int
    uncovered_count: int
    status: str
    reason: Optional[str] = None
    scheduled_employee_ids: list[int] = []


class RosterValidationResponse(BaseModel):
    """Structured Step 23 validation report.

    ``conflicts`` contains scheduling problems attached to roster entries;
    ``staffing_shortages`` contains requirement-level coverage gaps and is kept
    separate so the two categories are never conflated.
    """

    year: int
    month: int
    total_entries: int
    total_conflicts: int
    conflict_counts: dict[str, int]
    conflicts: list[RosterValidationConflict]
    total_shortages: int
    staffing_shortages: list[RosterStaffingCoverageItem]
    staffing_coverage: list[RosterStaffingCoverageItem] = []
    overall_status: str
    validated_at: datetime


# ---------------------------------------------------------------------------
# Step 24: roster editing and multiple roster views
# ---------------------------------------------------------------------------


class RosterEntryUpdateRequest(BaseModel):
    """Partial edit of one stored roster entry.

    Only fields explicitly supplied by the caller are changed; omitted fields
    keep their stored value. ``roster_id`` is an optional guard so a client that
    is editing from a particular monthly roster cannot accidentally change an
    entry that belongs to a different roster.
    """

    employee_id: Optional[int] = Field(default=None, gt=0)
    brand_id: Optional[int] = Field(default=None, gt=0)
    process_id: Optional[int] = Field(default=None, gt=0)
    roster_date: Optional[date] = None
    shift_details: Optional[str] = Field(default=None, max_length=100)
    roster_id: Optional[int] = Field(default=None, gt=0)


class RosterEntryFilters(BaseModel):
    """Filters shared by the monthly, weekly and employee-wise views."""

    employee_id: Optional[int] = None
    brand_id: Optional[int] = None
    process_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class RosterEntriesViewResponse(BaseModel):
    """Filtered entries belonging to one stored monthly roster."""

    year: int
    month: int
    month_name: str
    roster_id: int
    total_entries: int
    filtered_count: int
    filters: RosterEntryFilters
    entries: list[RosterEntryResponse]


class RosterWeekDay(BaseModel):
    """One Monday-Sunday day of a weekly roster, including adjacent months."""

    date: date
    day_name: str
    in_selected_month: bool
    entries: list[RosterEntryResponse]


class RosterWeeklyViewResponse(BaseModel):
    """A seven-day roster window; weeks crossing month boundaries are expected."""

    year: int
    month: int
    month_name: str
    week_start: date
    week_end: date
    previous_week_start: date
    next_week_start: date
    days: list[RosterWeekDay]
    entry_count: int
    filters: RosterEntryFilters


class RosterEmployeeWeeklyOff(BaseModel):
    """A weekly-off record plus the concrete dates it covers in this month."""

    employee_id: int
    employee_code: str
    employee_name: str
    day_of_week: str
    dates: list[date] = []


class RosterEmployeeLeave(BaseModel):
    """An approved leave overlapping the selected month."""

    leave_id: int
    start_date: date
    end_date: date
    leave_type: str
    status: str
    dates: list[date] = []


class RosterEmployeeViewResponse(BaseModel):
    """One employee's assignments and availability for the selected roster."""

    year: int
    month: int
    month_name: str
    roster_id: int
    employee_id: int
    employee_code: str
    employee_name: str
    assignments: list[RosterEntryResponse]
    weekly_offs: list[RosterEmployeeWeeklyOff] = []
    approved_leaves: list[RosterEmployeeLeave] = []
    filters: RosterEntryFilters
