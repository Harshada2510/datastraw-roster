"""Read-only validation for stored monthly rosters.

Step 23 deliberately keeps validation separate from generation: this module
receives plain records and returns plain results without issuing database
queries or writes. The API route is responsible for loading current master data
from the existing tables and converting the result into response schemas.

Scheduling conflicts and staffing shortages are reported separately so a fully
populated requirement is never confused with an invalid roster entry.
"""

import calendar
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app.services.roster_generator import (
    ApprovedLeaveRecord,
    AssignmentRecord,
    HolidayRecord,
    RequirementRecord,
    WeeklyOffRecord,
    month_bounds,
    normalize_day_name,
    requirements_for_month,
)

DUPLICATE_EMPLOYEE_ASSIGNMENT = "DUPLICATE_EMPLOYEE_ASSIGNMENT"
APPROVED_LEAVE = "APPROVED_LEAVE"
WEEKLY_OFF = "WEEKLY_OFF"
ORGANISATION_HOLIDAY = "ORGANISATION_HOLIDAY"
INVALID_ASSIGNMENT = "INVALID_ASSIGNMENT"
INACTIVE_EMPLOYEE = "INACTIVE_EMPLOYEE"
INACTIVE_BRAND = "INACTIVE_BRAND"
INACTIVE_PROCESS = "INACTIVE_PROCESS"

CONFLICT_TYPES = (
    DUPLICATE_EMPLOYEE_ASSIGNMENT,
    APPROVED_LEAVE,
    WEEKLY_OFF,
    ORGANISATION_HOLIDAY,
    INVALID_ASSIGNMENT,
    INACTIVE_EMPLOYEE,
    INACTIVE_BRAND,
    INACTIVE_PROCESS,
)


@dataclass(frozen=True)
class RosterEntryRecord:
    """One persisted roster entry enriched with current master-data status."""

    entry_id: int
    roster_id: int
    employee_id: int
    employee_code: str
    employee_name: str
    brand_id: int
    brand_name: str
    process_id: int
    process_name: str
    roster_date: date
    employee_active: bool
    brand_active: bool
    process_active: bool


@dataclass(frozen=True)
class RosterConflict:
    """One scheduling conflict found in a roster entry."""

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
    leave_type: str | None = None
    holiday_name: str | None = None
    weekly_off_day: str | None = None
    conflicting_entry_ids: tuple[int, ...] = ()


@dataclass(frozen=True)
class StaffingCoverage:
    """Required versus actual scheduled employees for one date/requirement."""

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
    reason: str | None = None
    scheduled_employee_ids: tuple[int, ...] = ()


@dataclass(frozen=True)
class ValidationResult:
    """Complete read-only validation report for one monthly roster."""

    year: int
    month: int
    total_entries: int
    total_conflicts: int
    conflict_counts: dict[str, int]
    conflicts: list[RosterConflict]
    staffing_shortages: list[StaffingCoverage]
    staffing_coverage: list[StaffingCoverage]
    overall_status: str
    validated_at: datetime
    total_shortages: int = 0


def _employee_label(entry: RosterEntryRecord) -> str:
    return f"{entry.employee_name} (ID {entry.employee_id})"


def _requirement_label(entry: RosterEntryRecord) -> str:
    return f"{entry.brand_name} / {entry.process_name}"


def validate_roster(
    *,
    year: int,
    month: int,
    entries: Iterable[RosterEntryRecord],
    assignments: Iterable[AssignmentRecord],
    requirements: Iterable[RequirementRecord],
    active_employee_ids: Iterable[int],
    active_brand_ids: Iterable[int],
    active_process_ids: Iterable[int],
    holidays: Iterable[HolidayRecord] = (),
    weekly_offs: Iterable[WeeklyOffRecord] = (),
    approved_leaves: Iterable[ApprovedLeaveRecord] = (),
    brand_names: Mapping[int, str] | None = None,
    process_names: Mapping[int, str] | None = None,
    validated_at: datetime | None = None,
) -> ValidationResult:
    """Validate a stored roster without changing any source records.

    All inputs are plain records already loaded by the caller. Active status is
    supplied as id sets so an inactive employee/brand/process can be reported
    even though generation itself only considers active master records.
    """
    entry_list = sorted(
        entries,
        key=lambda item: (
            item.roster_date,
            item.employee_id,
            item.brand_id,
            item.process_id,
            item.entry_id,
        ),
    )
    active_employees = set(active_employee_ids)
    active_brands = set(active_brand_ids)
    active_processes = set(active_process_ids)

    assignment_pairs = {
        (item.employee_id, item.brand_id, item.process_id)
        for item in assignments
    }
    holiday_by_date = {item.holiday_date: item.holiday_name for item in holidays}

    weekly_off_days: dict[int, set[str]] = defaultdict(set)
    for item in weekly_offs:
        canonical_day = normalize_day_name(item.day_of_week)
        if canonical_day is not None:
            weekly_off_days[item.employee_id].add(canonical_day)

    leaves_by_employee: dict[int, list[ApprovedLeaveRecord]] = defaultdict(list)
    for item in approved_leaves:
        leaves_by_employee[item.employee_id].append(item)

    entries_by_employee_date: dict[tuple[int, date], list[RosterEntryRecord]] = (
        defaultdict(list)
    )
    scheduled_ids_by_pair_date: dict[tuple[date, int, int], set[int]] = (
        defaultdict(set)
    )
    for entry in entry_list:
        entries_by_employee_date[(entry.employee_id, entry.roster_date)].append(entry)
        scheduled_ids_by_pair_date[
            (entry.roster_date, entry.brand_id, entry.process_id)
        ].add(entry.employee_id)

    conflicts: list[RosterConflict] = []
    conflict_counts = {conflict_type: 0 for conflict_type in CONFLICT_TYPES}

    def add_conflict(
        entry: RosterEntryRecord,
        conflict_type: str,
        message: str,
        *,
        leave_type: str | None = None,
        holiday_name: str | None = None,
        weekly_off_day: str | None = None,
        conflicting_entry_ids: tuple[int, ...] = (),
    ) -> None:
        conflicts.append(
            RosterConflict(
                roster_entry_id=entry.entry_id,
                conflict_type=conflict_type,
                employee_id=entry.employee_id,
                employee_name=entry.employee_name,
                brand_id=entry.brand_id,
                brand_name=entry.brand_name,
                process_id=entry.process_id,
                process_name=entry.process_name,
                roster_date=entry.roster_date,
                message=message,
                leave_type=leave_type,
                holiday_name=holiday_name,
                weekly_off_day=weekly_off_day,
                conflicting_entry_ids=conflicting_entry_ids,
            )
        )
        conflict_counts[conflict_type] += 1

    for entry in entry_list:
        day_text = entry.roster_date.isoformat()
        employee_label = _employee_label(entry)
        requirement_label = _requirement_label(entry)

        duplicate_group = entries_by_employee_date[
            (entry.employee_id, entry.roster_date)
        ]
        if len(duplicate_group) > 1:
            others = sorted(
                (item for item in duplicate_group if item.entry_id != entry.entry_id),
                key=lambda item: item.entry_id,
            )
            other_labels = "; ".join(
                f"{_requirement_label(item)} (entry #{item.entry_id})"
                for item in others
            )
            add_conflict(
                entry,
                DUPLICATE_EMPLOYEE_ASSIGNMENT,
                f"{employee_label} is assigned more than once on {day_text}. "
                f"This entry ({requirement_label}) duplicates: {other_labels}.",
                conflicting_entry_ids=tuple(item.entry_id for item in others),
            )

        matching_leaves = sorted(
            (
                item
                for item in leaves_by_employee.get(entry.employee_id, ())
                if item.start_date <= entry.roster_date <= item.end_date
            ),
            key=lambda item: (item.start_date, item.end_date, item.leave_type),
        )
        if matching_leaves:
            leave_types = ", ".join(
                dict.fromkeys(item.leave_type for item in matching_leaves)
            )
            leave_ranges = "; ".join(
                f"{item.start_date.isoformat()} to {item.end_date.isoformat()}"
                for item in matching_leaves
            )
            add_conflict(
                entry,
                APPROVED_LEAVE,
                f"{employee_label} has approved leave ({leave_types}) covering "
                f"{day_text} [{leave_ranges}], but is scheduled for "
                f"{requirement_label}.",
                leave_type=leave_types,
            )

        weekday_name = calendar.day_name[entry.roster_date.weekday()]
        if weekday_name in weekly_off_days.get(entry.employee_id, ()):
            add_conflict(
                entry,
                WEEKLY_OFF,
                f"{employee_label} has a configured weekly off on "
                f"{weekday_name}, but is scheduled for {requirement_label} on "
                f"{day_text}.",
                weekly_off_day=weekday_name,
            )

        holiday_name = holiday_by_date.get(entry.roster_date)
        if holiday_name is not None:
            add_conflict(
                entry,
                ORGANISATION_HOLIDAY,
                f"Organisation holiday '{holiday_name}' is configured on "
                f"{day_text}; no employee should be scheduled for "
                f"{requirement_label}.",
                holiday_name=holiday_name,
            )

        pair = (entry.employee_id, entry.brand_id, entry.process_id)
        if pair not in assignment_pairs:
            add_conflict(
                entry,
                INVALID_ASSIGNMENT,
                f"No employee-brand-process assignment exists for "
                f"{employee_label} on {requirement_label}.",
            )

        if (
            not entry.employee_active
            or entry.employee_id not in active_employees
        ):
            add_conflict(
                entry,
                INACTIVE_EMPLOYEE,
                f"{employee_label} is inactive but appears in the roster on "
                f"{day_text} for {requirement_label}.",
            )

        if not entry.brand_active or entry.brand_id not in active_brands:
            add_conflict(
                entry,
                INACTIVE_BRAND,
                f"Brand {entry.brand_name} (ID {entry.brand_id}) is inactive "
                f"but is assigned to {employee_label} on {day_text}.",
            )

        if not entry.process_active or entry.process_id not in active_processes:
            add_conflict(
                entry,
                INACTIVE_PROCESS,
                f"Process {entry.process_name} (ID {entry.process_id}) is "
                f"inactive but is assigned to {employee_label} on {day_text}.",
            )

    start_date, end_date, _ = month_bounds(year, month)
    month_requirements = requirements_for_month(requirements, start_date, end_date)
    brand_name_by_id = dict(brand_names or {})
    process_name_by_id = dict(process_names or {})
    # Entries already carry resolved names, so they also cover any id missing
    # from the master-data maps supplied by the caller.
    for entry in entry_list:
        brand_name_by_id.setdefault(entry.brand_id, entry.brand_name)
        process_name_by_id.setdefault(entry.process_id, entry.process_name)
    staffing_coverage: list[StaffingCoverage] = []
    for current_date in (
        start_date + timedelta(days=offset)
        for offset in range((end_date - start_date).days + 1)
    ):
        for requirement in month_requirements:
            if not (
                requirement.start_date
                <= current_date
                <= requirement.end_date
            ):
                continue

            scheduled_ids = tuple(
                sorted(
                    scheduled_ids_by_pair_date.get(
                        (
                            current_date,
                            requirement.brand_id,
                            requirement.process_id,
                        ),
                        (),
                    )
                )
            )
            scheduled_count = len(scheduled_ids)
            shortage = requirement.required_count - scheduled_count
            holiday_name = holiday_by_date.get(current_date)
            if shortage > 0:
                status = "Understaffed"
                if holiday_name is not None:
                    reason = (
                        f"Organisation holiday - {holiday_name}: "
                        "no employees are scheduled for this requirement."
                    )
                else:
                    reason = (
                        f"Only {scheduled_count} of {requirement.required_count} "
                        "required employees are scheduled."
                    )
            else:
                status = "Fully Staffed"
                reason = None

            staffing_coverage.append(
                StaffingCoverage(
                    requirement_id=requirement.requirement_id,
                    roster_date=current_date,
                    brand_id=requirement.brand_id,
                    brand_name=brand_name_by_id.get(
                        requirement.brand_id, f"Brand #{requirement.brand_id}"
                    ),
                    process_id=requirement.process_id,
                    process_name=process_name_by_id.get(
                        requirement.process_id,
                        f"Process #{requirement.process_id}",
                    ),
                    required_count=requirement.required_count,
                    scheduled_count=scheduled_count,
                    uncovered_count=shortage,
                    status=status,
                    reason=reason,
                    scheduled_employee_ids=scheduled_ids,
                )
            )

    staffing_shortages = [
        item for item in staffing_coverage if item.uncovered_count > 0
    ]
    if conflicts:
        overall_status = "Conflicts"
    elif staffing_shortages:
        overall_status = "Shortages"
    else:
        overall_status = "Valid"

    return ValidationResult(
        year=year,
        month=month,
        total_entries=len(entry_list),
        total_conflicts=len(conflicts),
        conflict_counts=conflict_counts,
        conflicts=conflicts,
        staffing_shortages=staffing_shortages,
        staffing_coverage=staffing_coverage,
        overall_status=overall_status,
        validated_at=validated_at or datetime.now(),
        total_shortages=len(staffing_shortages),
    )
