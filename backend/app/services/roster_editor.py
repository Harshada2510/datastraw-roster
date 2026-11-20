"""Validation rules for editing a stored roster entry (Step 24).

The edit rules mirror the generation rules: an entry may only reference active
master data and an existing employee/brand/process assignment, and the employee
must be genuinely available on the target date. All reads happen before the
route writes anything, so a rejected edit never leaves a partial change behind.

This service has no FastAPI dependency. It raises ``RosterEditError`` carrying
the HTTP status and a human-readable message; the API route translates it into
an ``HTTPException``. The existing roster, RosterEntry and availability tables
are the only records involved — no new models or tables are introduced.
"""

import calendar
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Brand,
    Employee,
    EmployeeAssignment,
    Holiday,
    Leave,
    Process,
    Roster,
    RosterEntry,
    WeeklyOff,
)
from app.schemas.roster import RosterEntryUpdateRequest
from app.services.roster_generator import month_bounds, normalize_day_name


class RosterEditError(Exception):
    """A rejected edit with an HTTP status code and an explanation."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _resolve_targets(
    entry: RosterEntry,
    payload: RosterEntryUpdateRequest,
    provided_fields: set[str],
) -> tuple[int, int, int, date, str | None]:
    """Combine stored values with explicitly supplied fields."""

    def value(field: str, attribute: str):
        return getattr(payload, field) if field in provided_fields else getattr(entry, attribute)

    return (
        value("employee_id", "employee_id"),
        value("brand_id", "brand_id"),
        value("process_id", "process_id"),
        value("roster_date", "roster_date"),
        value("shift_details", "shift_details"),
    )


def validate_roster_edit(
    db: Session,
    entry: RosterEntry,
    payload: RosterEntryUpdateRequest,
    *,
    provided_fields: set[str] | None = None,
) -> dict:
    """Validate the *resulting* entry and return its final field values.

    Every rule is checked against current records. ``provided_fields`` comes
    from Pydantic's ``model_fields_set`` so a partial update can leave other
    columns untouched while still validating the complete resulting entry.
    """
    fields = set(provided_fields) if provided_fields is not None else set(payload.model_fields_set)
    employee_id, brand_id, process_id, roster_date, shift_details = _resolve_targets(
        entry, payload, fields
    )

    roster = db.get(Roster, entry.roster_id)
    if roster is None:
        raise RosterEditError(409, "The roster that owns this entry no longer exists.")

    if "roster_id" in fields and payload.roster_id != entry.roster_id:
        raise RosterEditError(
            400,
            f"Roster entry #{entry.id} belongs to roster #{entry.roster_id}, "
            f"not roster #{payload.roster_id}.",
        )

    # The edited date must remain inside the month of its parent roster.
    start_date, end_date, _ = month_bounds(roster.year, roster.month)
    if not (start_date <= roster_date <= end_date):
        raise RosterEditError(
            400,
            f"{roster_date.isoformat()} is outside {calendar.month_name[roster.month]} "
            f"{roster.year}, the month of roster #{roster.id}.",
        )

    # 1. Employee exists and is active.
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise RosterEditError(404, f"Employee #{employee_id} does not exist.")
    if not bool(employee.is_active):
        raise RosterEditError(
            422,
            f"Employee {employee.full_name} (#{employee_id}) is inactive and cannot be scheduled.",
        )

    # 2. Brand exists and is active.
    brand = db.get(Brand, brand_id)
    if brand is None:
        raise RosterEditError(404, f"Brand #{brand_id} does not exist.")
    if not bool(brand.is_active):
        raise RosterEditError(
            422,
            f"Brand {brand.brand_name} (#{brand_id}) is inactive and cannot be scheduled.",
        )

    # 3. Process exists and is active.
    process = db.get(Process, process_id)
    if process is None:
        raise RosterEditError(404, f"Process #{process_id} does not exist.")
    if not bool(process.is_active):
        raise RosterEditError(
            422,
            f"Process {process.process_name} (#{process_id}) is inactive and cannot be scheduled.",
        )

    # 4. The resulting employee/brand/process combination must be assigned.
    assignment_id = db.execute(
        select(EmployeeAssignment.id).where(
            EmployeeAssignment.employee_id == employee_id,
            EmployeeAssignment.brand_id == brand_id,
            EmployeeAssignment.process_id == process_id,
        )
    ).scalar_one_or_none()
    if assignment_id is None:
        raise RosterEditError(
            422,
            f"No employee-brand-process assignment exists for "
            f"{employee.full_name} on {brand.brand_name} / {process.process_name}.",
        )

    # 5. No duplicate assignment for this employee on the target date. This
    # checks every roster, not just the current one, so moving a date can never
    # create a second booking on the same calendar day.
    duplicate_id = db.execute(
        select(RosterEntry.id).where(
            RosterEntry.employee_id == employee_id,
            RosterEntry.roster_date == roster_date,
            RosterEntry.id != entry.id,
        )
    ).scalar_one_or_none()
    if duplicate_id is not None:
        raise RosterEditError(
            409,
            f"{employee.full_name} (#{employee_id}) is already assigned on "
            f"{roster_date.isoformat()} (entry #{duplicate_id}).",
        )

    # 6. Approved leave (inclusive boundaries).
    leave = db.execute(
        select(Leave)
        .where(
            Leave.employee_id == employee_id,
            Leave.status == "Approved",
            Leave.start_date <= roster_date,
            Leave.end_date >= roster_date,
        )
        .order_by(Leave.start_date, Leave.id)
    ).scalars().first()
    if leave is not None:
        raise RosterEditError(
            409,
            f"{employee.full_name} is on approved {leave.leave_type} from "
            f"{leave.start_date.isoformat()} to {leave.end_date.isoformat()}, "
            f"which covers {roster_date.isoformat()}.",
        )

    # 7. Weekly off. Stored values are normalised because existing records can
    # use different casing (e.g. "sunday" vs "Sunday").
    weekday_name = calendar.day_name[roster_date.weekday()]
    weekly_off_rows = db.execute(
        select(WeeklyOff).where(WeeklyOff.employee_id == employee_id)
    ).scalars().all()
    if any(normalize_day_name(row.day_of_week) == weekday_name for row in weekly_off_rows):
        raise RosterEditError(
            409,
            f"{employee.full_name} has a configured weekly off on {weekday_name}, "
            f"but {roster_date.isoformat()} is a {weekday_name}.",
        )

    # 8. Organisation holiday (blocks everybody on that date).
    holiday = db.execute(
        select(Holiday).where(Holiday.holiday_date == roster_date)
    ).scalars().first()
    if holiday is not None:
        raise RosterEditError(
            409,
            f"{roster_date.isoformat()} is an organisation holiday "
            f"({holiday.holiday_name}); no employee can be scheduled.",
        )

    # 9. Entry-to-roster ownership was checked above before any other rule.
    return {
        "employee_id": employee_id,
        "brand_id": brand_id,
        "process_id": process_id,
        "roster_date": roster_date,
        "shift_details": shift_details,
    }
