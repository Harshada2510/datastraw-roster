"""Monthly roster generation, editing and view API routes.

Uses only existing master data: active employees, employee assignments,
staffing requirements, the active brand/process masters, weekly offs, holidays
and approved leaves. Generation is deterministic and transactional. The roster
tables are created additively by ``backend/create_roster_tables.py``; these
routes never drop or reset data.

Step 24 adds transactional entry editing and monthly/weekly/employee-wise
views. Regeneration policy (explicit and unchanged from Step 20's behaviour):
regenerating replaces **every** entry of the selected month, including manual
edits, with a freshly generated deterministic roster. The roster id is kept,
and all other months are left untouched.
"""

import calendar
import json
from collections import defaultdict
from dataclasses import asdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, distinct, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Brand,
    Employee,
    EmployeeAssignment,
    Holiday,
    Leave,
    Process,
    Roster,
    RosterEntry,
    StaffingRequirement,
    WeeklyOff,
)
from app.schemas.roster import (
    RosterApprovedLeaveItem,
    RosterCoverageItem,
    RosterEntriesViewResponse,
    RosterEmployeeLeave,
    RosterEmployeeViewResponse,
    RosterEmployeeWeeklyOff,
    RosterEntryFilters,
    RosterEntryResponse,
    RosterEntryUpdateRequest,
    RosterGenerateRequest,
    RosterGenerationResponse,
    RosterHolidayItem,
    RosterStaffingCoverageItem,
    RosterUncoveredItem,
    RosterValidationConflict,
    RosterValidationResponse,
    RosterWeekDay,
    RosterWeeklyOffItem,
    RosterWeeklyViewResponse,
)
from app.services.roster_editor import RosterEditError, validate_roster_edit
from app.services.roster_generator import (
    MAX_YEAR,
    MIN_YEAR,
    ApprovedLeaveRecord,
    AssignmentRecord,
    HolidayRecord,
    RequirementRecord,
    WeeklyOffRecord,
    generate_roster,
    month_bounds,
    normalize_day_name,
)
from app.services.roster_validator import (
    RosterEntryRecord,
    ValidationResult,
    validate_roster,
)

router = APIRouter(prefix="/api/rosters", tags=["Rosters"])


def _find_roster(db: Session, year: int, month: int) -> Roster | None:
    """Return the stored roster for a month, if any."""
    return db.execute(
        select(Roster).where(Roster.year == year, Roster.month == month)
    ).scalar_one_or_none()


def _load_availability_records(
    db: Session,
    start_date: date,
    end_date: date,
    employee_ids: list[int],
) -> tuple[
    list[HolidayRecord], list[WeeklyOffRecord], list[ApprovedLeaveRecord]
]:
    """Read existing holiday, weekly-off and leave rows (no new records).

    Only ``Approved`` leaves are returned. The inclusive date overlap condition
    keeps leaves from other months out of the selected roster while still
    allowing ranges that start before or end after the month. Callers pass the
    active employee ids during generation and the roster's employee ids during
    validation; this helper never changes that data.
    """
    holiday_rows = db.execute(
        select(Holiday)
        .where(Holiday.holiday_date >= start_date, Holiday.holiday_date <= end_date)
        .order_by(Holiday.holiday_date, Holiday.id)
    ).scalars().all()
    weekly_off_rows = (
        db.execute(
            select(WeeklyOff)
            .where(WeeklyOff.employee_id.in_(employee_ids))
            .order_by(WeeklyOff.day_of_week, WeeklyOff.employee_id)
        ).scalars().all()
        if employee_ids
        else []
    )
    approved_leave_rows = (
        db.execute(
            select(Leave)
            .where(
                Leave.status == "Approved",
                Leave.employee_id.in_(employee_ids),
                Leave.start_date <= end_date,
                Leave.end_date >= start_date,
            )
            .order_by(Leave.start_date, Leave.end_date, Leave.id)
        ).scalars().all()
        if employee_ids
        else []
    )
    return (
        [
            HolidayRecord(
                holiday_date=row.holiday_date,
                holiday_name=row.holiday_name,
            )
            for row in holiday_rows
        ],
        [
            WeeklyOffRecord(
                employee_id=row.employee_id,
                day_of_week=row.day_of_week,
            )
            for row in weekly_off_rows
        ],
        [
            ApprovedLeaveRecord(
                employee_id=row.employee_id,
                start_date=row.start_date,
                end_date=row.end_date,
                leave_type=row.leave_type,
            )
            for row in approved_leave_rows
        ],
    )


def _require_roster(db: Session, year: int, month: int) -> Roster:
    """Return a roster for a validated month/year selector or raise an API error."""
    if month < 1 or month > 12:
        raise HTTPException(status_code=422, detail="month must be between 1 and 12")
    if year < MIN_YEAR or year > MAX_YEAR:
        raise HTTPException(
            status_code=422,
            detail=f"year must be between {MIN_YEAR} and {MAX_YEAR}",
        )
    roster = _find_roster(db, year, month)
    if roster is None:
        raise HTTPException(
            status_code=404,
            detail="No roster has been generated for this month.",
        )
    return roster


def _entry_response(row) -> RosterEntryResponse:
    """Convert one joined (entry, names) row into an API entry."""
    entry, employee_code, employee_name, brand_name, process_name = row
    return RosterEntryResponse(
        id=entry.id,
        roster_id=entry.roster_id,
        employee_id=entry.employee_id,
        employee_code=employee_code,
        employee_name=employee_name,
        brand_id=entry.brand_id,
        brand_name=brand_name,
        process_id=entry.process_id,
        process_name=process_name,
        roster_date=entry.roster_date,
        shift_details=entry.shift_details,
        created_at=entry.created_at,
    )


def _entry_stmt(
    *,
    roster_id: int | None = None,
    filters: RosterEntryFilters | None = None,
):
    """Build the shared, ordered entry query used by every Step 24 view."""
    stmt = (
        select(
            RosterEntry,
            Employee.employee_code,
            Employee.full_name,
            Brand.brand_name,
            Process.process_name,
        )
        .join(Employee, RosterEntry.employee_id == Employee.id)
        .join(Brand, RosterEntry.brand_id == Brand.id)
        .join(Process, RosterEntry.process_id == Process.id)
    )
    if roster_id is not None:
        stmt = stmt.where(RosterEntry.roster_id == roster_id)
    if filters is not None:
        if filters.employee_id is not None:
            stmt = stmt.where(RosterEntry.employee_id == filters.employee_id)
        if filters.brand_id is not None:
            stmt = stmt.where(RosterEntry.brand_id == filters.brand_id)
        if filters.process_id is not None:
            stmt = stmt.where(RosterEntry.process_id == filters.process_id)
        if filters.start_date is not None:
            stmt = stmt.where(RosterEntry.roster_date >= filters.start_date)
        if filters.end_date is not None:
            stmt = stmt.where(RosterEntry.roster_date <= filters.end_date)
    return stmt.order_by(RosterEntry.roster_date, RosterEntry.id)


def _filters_from_params(
    employee_id: int | None,
    brand_id: int | None,
    process_id: int | None,
    start_date: date | None,
    end_date: date | None,
) -> RosterEntryFilters:
    """Collect filters and reject an inverted date range early."""
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="start_date must be on or before end_date.",
        )
    return RosterEntryFilters(
        employee_id=employee_id,
        brand_id=brand_id,
        process_id=process_id,
        start_date=start_date,
        end_date=end_date,
    )


def _refresh_roster_snapshot(db: Session, roster: Roster) -> None:
    """Recompute stored coverage/uncovered counts after a manual entry edit.

    The edit itself is already flushed. Validation is read-only, so this keeps
    the Monthly View's staffing coverage and uncovered requirements in sync
    with the edited entries without touching any other month's roster.
    """
    report = _build_validation_report(db, roster)
    planning = roster.get_planning()
    previous_coverage = {
        (item.get("requirement_id"), item.get("roster_date")): item
        for item in planning.get("coverage", [])
    }

    coverage = []
    for item in report.staffing_coverage:
        values = asdict(item)
        previous = previous_coverage.get(
            (values["requirement_id"], values["roster_date"]), {}
        )
        coverage.append(
            {
                **values,
                "holiday_name": previous.get("holiday_name"),
                "weekly_off_employee_ids": previous.get("weekly_off_employee_ids", []),
                "weekly_off_employee_names": previous.get("weekly_off_employee_names", []),
                "leave_employee_ids": previous.get("leave_employee_ids", []),
                "leave_employee_names": previous.get("leave_employee_names", []),
            }
        )
    planning["coverage"] = coverage
    roster.planning_json = json.dumps(planning, default=str)

    uncovered = [
        {
            "roster_date": item.roster_date,
            "brand_id": item.brand_id,
            "brand_name": item.brand_name,
            "process_id": item.process_id,
            "process_name": item.process_name,
            "required_count": item.required_count,
            "assigned_count": item.scheduled_count,
            "shortage": item.uncovered_count,
            "reason": item.reason,
        }
        for item in report.staffing_shortages
    ]
    roster.uncovered_json = json.dumps(uncovered, default=str)
    roster.uncovered_count = len(uncovered)
    roster.total_entries = report.total_entries
    roster.total_employees = db.execute(
        select(func.count(distinct(RosterEntry.employee_id))).where(
            RosterEntry.roster_id == roster.id
        )
    ).scalar_one()


def _build_response(db: Session, roster: Roster) -> RosterGenerationResponse:
    """Assemble API data by joining stored entries to current master names."""
    rows = db.execute(
        select(
            RosterEntry,
            Employee.employee_code,
            Employee.full_name,
            Brand.brand_name,
            Process.process_name,
        )
        .join(Employee, RosterEntry.employee_id == Employee.id)
        .join(Brand, RosterEntry.brand_id == Brand.id)
        .join(Process, RosterEntry.process_id == Process.id)
        .where(RosterEntry.roster_id == roster.id)
        .order_by(RosterEntry.roster_date, RosterEntry.id)
    ).all()

    entries = [
        RosterEntryResponse(
            id=entry.id,
            roster_id=entry.roster_id,
            employee_id=entry.employee_id,
            employee_code=employee_code,
            employee_name=employee_name,
            brand_id=entry.brand_id,
            brand_name=brand_name,
            process_id=entry.process_id,
            process_name=process_name,
            roster_date=entry.roster_date,
            shift_details=entry.shift_details,
            created_at=entry.created_at,
        )
        for entry, employee_code, employee_name, brand_name, process_name in rows
    ]

    employee_directory = {
        row.id: (row.employee_code, row.full_name)
        for row in db.execute(select(Employee)).scalars().all()
    }

    planning = roster.get_planning()
    holidays = [
        RosterHolidayItem(**item) for item in planning.get("holidays", [])
    ]
    weekly_offs = []
    for item in planning.get("weekly_offs", []):
        code, name = employee_directory.get(item["employee_id"], (None, None))
        weekly_offs.append(
            RosterWeeklyOffItem(
                employee_id=item["employee_id"],
                employee_code=code or f"#{item['employee_id']}",
                employee_name=name or f"Employee #{item['employee_id']}",
                day_of_week=item["day_of_week"],
            )
        )
    approved_leaves = []
    for item in planning.get("approved_leaves", []):
        code, name = employee_directory.get(item["employee_id"], (None, None))
        approved_leaves.append(
            RosterApprovedLeaveItem(
                employee_id=item["employee_id"],
                employee_code=code or f"#{item['employee_id']}",
                employee_name=name or f"Employee #{item['employee_id']}",
                start_date=item["start_date"],
                end_date=item["end_date"],
                leave_type=item["leave_type"],
            )
        )

    coverage = []
    for item in planning.get("coverage", []):
        weekly_off_ids = [int(value) for value in item.get("weekly_off_employee_ids", [])]
        leave_ids = [int(value) for value in item.get("leave_employee_ids", [])]
        coverage.append(
            RosterCoverageItem(
                roster_date=item["roster_date"],
                brand_id=item["brand_id"],
                brand_name=item["brand_name"],
                process_id=item["process_id"],
                process_name=item["process_name"],
                required_count=item["required_count"],
                scheduled_count=item["scheduled_count"],
                uncovered_count=item["uncovered_count"],
                status=item["status"],
                reason=item.get("reason"),
                holiday_name=item.get("holiday_name"),
                weekly_off_employee_ids=weekly_off_ids,
                weekly_off_employee_names=[
                    employee_directory.get(employee_id, (None, f"Employee #{employee_id}"))[1]
                    for employee_id in weekly_off_ids
                ],
                leave_employee_ids=leave_ids,
                leave_employee_names=[
                    employee_directory.get(employee_id, (None, f"Employee #{employee_id}"))[1]
                    for employee_id in leave_ids
                ],
            )
        )

    uncovered = [RosterUncoveredItem(**item) for item in roster.get_uncovered()]
    if roster.uncovered_count:
        message = (
            f"Roster generated with {roster.uncovered_count} uncovered "
            "staffing slot(s). Review the shortages below."
        )
    else:
        message = "Roster generated successfully. All staffing requirements were filled."

    return RosterGenerationResponse(
        roster_id=roster.id,
        month=roster.month,
        year=roster.year,
        month_name=calendar.month_name[roster.month],
        generated_at=roster.generated_at,
        days_in_month=roster.days_in_month,
        eligible_employees=roster.eligible_employees,
        total_requirements=roster.total_requirements,
        total_required_staff=roster.total_required_staff,
        total_entries=roster.total_entries,
        total_employees_scheduled=roster.total_employees,
        uncovered_count=roster.uncovered_count,
        uncovered=uncovered,
        entries=entries,
        holidays=holidays,
        weekly_offs=weekly_offs,
        approved_leaves=approved_leaves,
        coverage=coverage,
        message=message,
    )


def _build_validation_report(db: Session, roster: Roster) -> ValidationResult:
    """Load current data read-only and run the pure validation service."""
    start_date, end_date, _ = month_bounds(roster.year, roster.month)

    employee_rows = db.execute(
        select(Employee).order_by(Employee.id)
    ).scalars().all()
    brand_rows = db.execute(select(Brand).order_by(Brand.id)).scalars().all()
    process_rows = db.execute(
        select(Process).order_by(Process.id)
    ).scalars().all()

    active_employee_ids = [
        row.id for row in employee_rows if bool(row.is_active)
    ]
    active_brand_ids = [row.id for row in brand_rows if bool(row.is_active)]
    active_process_ids = [row.id for row in process_rows if bool(row.is_active)]
    brand_names = {row.id: row.brand_name for row in brand_rows}
    process_names = {row.id: row.process_name for row in process_rows}

    entry_rows = db.execute(
        select(
            RosterEntry,
            Employee.employee_code,
            Employee.full_name,
            Employee.is_active,
            Brand.brand_name,
            Brand.is_active,
            Process.process_name,
            Process.is_active,
        )
        .outerjoin(Employee, RosterEntry.employee_id == Employee.id)
        .outerjoin(Brand, RosterEntry.brand_id == Brand.id)
        .outerjoin(Process, RosterEntry.process_id == Process.id)
        .where(RosterEntry.roster_id == roster.id)
        .order_by(RosterEntry.roster_date, RosterEntry.id)
    ).all()

    entry_records: list[RosterEntryRecord] = []
    entry_employee_ids: set[int] = set()
    for (
        entry,
        employee_code,
        employee_name,
        employee_active,
        brand_name,
        brand_active,
        process_name,
        process_active,
    ) in entry_rows:
        entry_employee_ids.add(entry.employee_id)
        entry_records.append(
            RosterEntryRecord(
                entry_id=entry.id,
                roster_id=entry.roster_id,
                employee_id=entry.employee_id,
                employee_code=employee_code or f"#{entry.employee_id}",
                employee_name=employee_name or f"Employee #{entry.employee_id}",
                brand_id=entry.brand_id,
                brand_name=brand_name or f"Brand #{entry.brand_id}",
                process_id=entry.process_id,
                process_name=process_name or f"Process #{entry.process_id}",
                roster_date=entry.roster_date,
                employee_active=bool(employee_active),
                brand_active=bool(brand_active),
                process_active=bool(process_active),
            )
        )

    assignment_rows = db.execute(
        select(EmployeeAssignment).order_by(EmployeeAssignment.id)
    ).scalars().all()
    assignments = [
        AssignmentRecord(
            employee_id=item.employee_id,
            brand_id=item.brand_id,
            process_id=item.process_id,
        )
        for item in assignment_rows
    ]

    requirement_rows = db.execute(
        select(StaffingRequirement)
        .where(
            StaffingRequirement.start_date <= end_date,
            StaffingRequirement.end_date >= start_date,
        )
        .order_by(StaffingRequirement.id)
    ).scalars().all()
    requirements = [
        RequirementRecord(
            requirement_id=item.id,
            brand_id=item.brand_id,
            process_id=item.process_id,
            start_date=item.start_date,
            end_date=item.end_date,
            required_count=item.required_count,
        )
        for item in requirement_rows
    ]

    holidays, weekly_offs, approved_leaves = _load_availability_records(
        db,
        start_date,
        end_date,
        employee_ids=sorted(entry_employee_ids),
    )

    return validate_roster(
        year=roster.year,
        month=roster.month,
        entries=entry_records,
        assignments=assignments,
        requirements=requirements,
        active_employee_ids=active_employee_ids,
        active_brand_ids=active_brand_ids,
        active_process_ids=active_process_ids,
        holidays=holidays,
        weekly_offs=weekly_offs,
        approved_leaves=approved_leaves,
        brand_names=brand_names,
        process_names=process_names,
        validated_at=datetime.now(),
    )


def _validation_response(result: ValidationResult) -> RosterValidationResponse:
    """Convert plain validation records into API response schemas."""
    return RosterValidationResponse(
        year=result.year,
        month=result.month,
        total_entries=result.total_entries,
        total_conflicts=result.total_conflicts,
        conflict_counts=result.conflict_counts,
        conflicts=[
            RosterValidationConflict(**asdict(item)) for item in result.conflicts
        ],
        total_shortages=result.total_shortages,
        staffing_shortages=[
            RosterStaffingCoverageItem(**asdict(item))
            for item in result.staffing_shortages
        ],
        staffing_coverage=[
            RosterStaffingCoverageItem(**asdict(item))
            for item in result.staffing_coverage
        ],
        overall_status=result.overall_status,
        validated_at=result.validated_at,
    )


def _generate(db: Session, payload: RosterGenerateRequest, *, regenerate: bool):
    """Generate and persist a month's roster in a single transaction."""
    start_date, end_date, _ = month_bounds(payload.year, payload.month)
    month_label = f"{calendar.month_name[payload.month]} {payload.year}"
    existing = _find_roster(db, payload.year, payload.month)

    if existing is not None and not regenerate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"A roster already exists for {month_label}. "
                "Use POST /api/rosters/regenerate to rebuild it."
            ),
        )

    # Active master records only. Brand/process names are read from all rows so
    # uncovered items can name even an inactive brand/process clearly.
    active_employee_ids = [
        row.id
        for row in db.execute(
            select(Employee).where(Employee.is_active.is_(True)).order_by(Employee.id)
        ).scalars().all()
    ]
    active_brand_ids = [
        row.id
        for row in db.execute(
            select(Brand).where(Brand.is_active.is_(True)).order_by(Brand.id)
        ).scalars().all()
    ]
    active_process_ids = [
        row.id
        for row in db.execute(
            select(Process).where(Process.is_active.is_(True)).order_by(Process.id)
        ).scalars().all()
    ]
    brand_names = {
        row.id: row.brand_name
        for row in db.execute(select(Brand)).scalars().all()
    }
    process_names = {
        row.id: row.process_name
        for row in db.execute(select(Process)).scalars().all()
    }

    # Steps 21/22: read only the existing weekly-off, holiday and leave tables.
    # No records are inserted, updated or deleted here.
    holidays, weekly_offs, approved_leaves = _load_availability_records(
        db, start_date, end_date, employee_ids=active_employee_ids
    )

    assignment_rows = db.execute(
        select(EmployeeAssignment).order_by(EmployeeAssignment.id)
    ).scalars().all()
    assignments = [
        AssignmentRecord(
            employee_id=item.employee_id,
            brand_id=item.brand_id,
            process_id=item.process_id,
        )
        for item in assignment_rows
    ]

    requirement_rows = db.execute(
        select(StaffingRequirement)
        .where(
            StaffingRequirement.start_date <= end_date,
            StaffingRequirement.end_date >= start_date,
        )
        .order_by(StaffingRequirement.id)
    ).scalars().all()
    if not requirement_rows:
        # Validation happens before any write, so an existing roster is intact.
        raise HTTPException(
            status_code=422,
            detail=f"No staffing requirements found for {month_label}.",
        )
    requirements = [
        RequirementRecord(
            requirement_id=item.id,
            brand_id=item.brand_id,
            process_id=item.process_id,
            start_date=item.start_date,
            end_date=item.end_date,
            required_count=item.required_count,
        )
        for item in requirement_rows
    ]

    result = generate_roster(
        year=payload.year,
        month=payload.month,
        active_employee_ids=active_employee_ids,
        assignments=assignments,
        requirements=requirements,
        active_brand_ids=active_brand_ids,
        active_process_ids=active_process_ids,
        brand_names=brand_names,
        process_names=process_names,
        holidays=holidays,
        weekly_offs=weekly_offs,
        approved_leaves=approved_leaves,
    )

    uncovered_json = json.dumps(
        [asdict(item) for item in result.uncovered], default=str
    )
    planning_json = json.dumps(
        {
            "holidays": [asdict(item) for item in result.holidays],
            "weekly_offs": [asdict(item) for item in result.weekly_offs],
            "approved_leaves": [asdict(item) for item in result.approved_leaves],
            "coverage": [asdict(item) for item in result.coverage],
        },
        default=str,
    )
    scheduled_employee_ids = {item.employee_id for item in result.assignments}

    try:
        if existing is not None:
            # Explicit regeneration: remove only this roster's old entries.
            db.execute(delete(RosterEntry).where(RosterEntry.roster_id == existing.id))
            roster = existing
        else:
            roster = Roster(year=payload.year, month=payload.month)
            db.add(roster)

        roster.generated_at = datetime.now()
        roster.days_in_month = result.days_in_month
        roster.eligible_employees = result.eligible_employees
        roster.total_requirements = result.total_requirements
        roster.total_required_staff = result.total_required_staff
        roster.total_entries = len(result.assignments)
        roster.total_employees = len(scheduled_employee_ids)
        roster.uncovered_count = len(result.uncovered)
        roster.uncovered_json = uncovered_json
        roster.planning_json = planning_json

        db.flush()  # obtain roster.id before inserting entries

        for item in result.assignments:
            db.add(
                RosterEntry(
                    roster_id=roster.id,
                    employee_id=item.employee_id,
                    brand_id=item.brand_id,
                    process_id=item.process_id,
                    roster_date=item.roster_date,
                    shift_details=None,
                )
            )

        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The roster could not be saved because it conflicts with existing data.",
        ) from exc
    except Exception:
        db.rollback()
        raise

    db.refresh(roster)
    return _build_response(db, roster)


@router.post(
    "/generate",
    response_model=RosterGenerationResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_monthly_roster(
    payload: RosterGenerateRequest, db: Session = Depends(get_db)
):
    """Generate a roster for a month; refuse if one already exists (409)."""
    return _generate(db, payload, regenerate=False)


@router.post("/regenerate", response_model=RosterGenerationResponse)
def regenerate_monthly_roster(
    payload: RosterGenerateRequest, db: Session = Depends(get_db)
):
    """Rebuild one month in place; manual edits in that month are replaced.

    The roster id is preserved, only entries of the selected month are removed,
    and rosters for every other month stay exactly as they were. A failure at
    any point rolls the transaction back so the previous roster remains intact.
    """
    response = _generate(db, payload, regenerate=True)
    response.message = (
        f"{response.message or 'Roster regenerated.'} "
        "Regeneration replaces any manual edits in this month; other months are unchanged."
    )
    return response


@router.post("/{year}/{month}/validate", response_model=RosterValidationResponse)
def validate_monthly_roster(
    year: int, month: int, db: Session = Depends(get_db)
):
    """Validate an existing month's roster without modifying any records."""
    if month < 1 or month > 12:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="month must be between 1 and 12",
        )
    if year < MIN_YEAR or year > MAX_YEAR:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"year must be between {MIN_YEAR} and {MAX_YEAR}",
        )

    roster = _find_roster(db, year, month)
    if roster is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No roster has been generated for this month.",
        )

    return _validation_response(_build_validation_report(db, roster))


# ---------------------------------------------------------------------------
# Step 24: entry editing and multiple roster views
# ---------------------------------------------------------------------------


@router.get("/entries/{entry_id}", response_model=RosterEntryResponse)
def get_roster_entry(entry_id: int, db: Session = Depends(get_db)):
    """Return one stored roster entry, or 404 when it does not exist."""
    row = db.execute(_entry_stmt().where(RosterEntry.id == entry_id)).one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Roster entry #{entry_id} was not found.",
        )
    return _entry_response(row)


@router.put("/entries/{entry_id}", response_model=RosterEntryResponse)
def update_roster_entry(
    entry_id: int,
    payload: RosterEntryUpdateRequest,
    db: Session = Depends(get_db),
):
    """Edit an entry after every assignment/availability rule passes.

    All validation runs before any write. The update, coverage refresh and
    commit share one transaction; any failure rolls the whole edit back.
    """
    entry = db.get(RosterEntry, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Roster entry #{entry_id} was not found.",
        )

    try:
        values = validate_roster_edit(
            db, entry, payload, provided_fields=payload.model_fields_set
        )
    except RosterEditError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    try:
        for field, value in values.items():
            setattr(entry, field, value)
        db.flush()
        _refresh_roster_snapshot(db, entry.roster)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The edited roster entry conflicts with existing data.",
        ) from exc
    except Exception:
        db.rollback()
        raise

    row = db.execute(_entry_stmt().where(RosterEntry.id == entry_id)).one_or_none()
    if row is None:  # pragma: no cover - defensive after a successful commit
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Roster entry #{entry_id} was not found after the edit.",
        )
    return _entry_response(row)


@router.get(
    "/{year}/{month}/entries", response_model=RosterEntriesViewResponse
)
def get_roster_entries_view(
    year: int,
    month: int,
    employee_id: int | None = Query(default=None),
    brand_id: int | None = Query(default=None),
    process_id: int | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Monthly View data: all entries of a roster with combined filters."""
    roster = _require_roster(db, year, month)
    filters = _filters_from_params(
        employee_id, brand_id, process_id, start_date, end_date
    )
    total_entries = db.execute(
        select(func.count(RosterEntry.id)).where(RosterEntry.roster_id == roster.id)
    ).scalar_one()
    rows = db.execute(
        _entry_stmt(roster_id=roster.id, filters=filters)
    ).all()
    return RosterEntriesViewResponse(
        year=year,
        month=month,
        month_name=calendar.month_name[month],
        roster_id=roster.id,
        total_entries=total_entries,
        filtered_count=len(rows),
        filters=filters,
        entries=[_entry_response(row) for row in rows],
    )


@router.get("/{year}/{month}/weekly", response_model=RosterWeeklyViewResponse)
def get_roster_weekly_view(
    year: int,
    month: int,
    week_start: date | None = Query(default=None),
    employee_id: int | None = Query(default=None),
    brand_id: int | None = Query(default=None),
    process_id: int | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Weekly View data: Monday-Sunday assignments across month boundaries.

    Entries are read by date (not by roster id), so the last days of the previous
    month and first days of the next month appear in the same week whenever
    those rosters exist. Days outside the selected month are flagged rather
    than dropped.
    """
    roster = _require_roster(db, year, month)
    filters = _filters_from_params(
        employee_id, brand_id, process_id, start_date, end_date
    )
    if week_start is None:
        first_of_month = date(year, month, 1)
        week_start = first_of_month - timedelta(days=first_of_month.weekday())
    else:
        # Always anchor the response to Monday, whatever date was supplied.
        week_start = week_start - timedelta(days=week_start.weekday())
    week_end = week_start + timedelta(days=6)

    rows = db.execute(_entry_stmt(filters=filters).where(
        RosterEntry.roster_date >= week_start,
        RosterEntry.roster_date <= week_end,
    )).all()
    entries_by_date: dict[date, list] = defaultdict(list)
    for row in rows:
        entries_by_date[row[0].roster_date].append(_entry_response(row))

    days = []
    for offset in range(7):
        current = week_start + timedelta(days=offset)
        days.append(
            RosterWeekDay(
                date=current,
                day_name=calendar.day_name[current.weekday()],
                in_selected_month=(current.year == year and current.month == month),
                entries=entries_by_date.get(current, []),
            )
        )

    return RosterWeeklyViewResponse(
        year=year,
        month=month,
        month_name=calendar.month_name[month],
        week_start=week_start,
        week_end=week_end,
        previous_week_start=week_start - timedelta(days=7),
        next_week_start=week_start + timedelta(days=7),
        days=days,
        entry_count=sum(len(day.entries) for day in days),
        filters=filters,
    )


@router.get(
    "/{year}/{month}/employee-wise", response_model=RosterEmployeeViewResponse
)
def get_employee_roster_view(
    year: int,
    month: int,
    employee_id: int = Query(..., gt=0),
    brand_id: int | None = Query(default=None),
    process_id: int | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Employee-wise View: assignments plus existing weekly-off/leave records."""
    roster = _require_roster(db, year, month)
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee #{employee_id} was not found.",
        )
    filters = _filters_from_params(
        employee_id, brand_id, process_id, start_date, end_date
    )
    rows = db.execute(
        _entry_stmt(roster_id=roster.id, filters=filters)
    ).all()

    start_date, end_date, _ = month_bounds(year, month)
    weekly_off_rows = db.execute(
        select(WeeklyOff)
        .where(WeeklyOff.employee_id == employee_id)
        .order_by(WeeklyOff.day_of_week, WeeklyOff.id)
    ).scalars().all()
    weekly_offs = []
    for row in weekly_off_rows:
        canonical_day = normalize_day_name(row.day_of_week)
        matching_dates = [
            date(year, month, day)
            for day in range(1, calendar.monthrange(year, month)[1] + 1)
            if canonical_day is not None
            and canonical_day == calendar.day_name[date(year, month, day).weekday()]
        ]
        weekly_offs.append(
            RosterEmployeeWeeklyOff(
                employee_id=employee_id,
                employee_code=employee.employee_code,
                employee_name=employee.full_name,
                day_of_week=canonical_day or row.day_of_week,
                dates=matching_dates,
            )
        )

    leave_rows = db.execute(
        select(Leave)
        .where(
            Leave.employee_id == employee_id,
            Leave.status == "Approved",
            Leave.start_date <= end_date,
            Leave.end_date >= start_date,
        )
        .order_by(Leave.start_date, Leave.id)
    ).scalars().all()
    def leave_days(leave: Leave) -> list[date]:
        """Intersect an approved leave span with the selected month."""
        days = []
        for offset in range((end_date - start_date).days + 1):
            current = start_date + timedelta(days=offset)
            if leave.start_date <= current <= leave.end_date:
                days.append(current)
        return days

    approved_leaves = [
        RosterEmployeeLeave(
            leave_id=row.id,
            start_date=row.start_date,
            end_date=row.end_date,
            leave_type=row.leave_type,
            status=row.status,
            dates=leave_days(row),
        )
        for row in leave_rows
    ]

    return RosterEmployeeViewResponse(
        year=year,
        month=month,
        month_name=calendar.month_name[month],
        roster_id=roster.id,
        employee_id=employee_id,
        employee_code=employee.employee_code,
        employee_name=employee.full_name,
        assignments=[_entry_response(row) for row in rows],
        weekly_offs=weekly_offs,
        approved_leaves=approved_leaves,
        filters=filters,
    )


@router.get("/{year}/{month}", response_model=RosterGenerationResponse)
def get_monthly_roster(
    year: int, month: int, db: Session = Depends(get_db)
):
    """Return an existing monthly roster without regenerating it."""
    roster = _require_roster(db, year, month)
    return _build_response(db, roster)
