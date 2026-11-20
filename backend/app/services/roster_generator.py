"""Deterministic, testable monthly roster generation algorithm.

The functions here are deliberately independent of FastAPI and SQLAlchemy
sessions: callers pass plain data in and receive plain data back. That keeps the
fairness rules easy to unit-test. Availability rules are encapsulated in
``AvailabilityChecker``: Step 21 added organisation holidays and per-employee
weekly offs; Step 22 adds approved leaves. ``availability_filter`` remains as a
generic extension point.

No randomness is used. Employees are always selected in a stable order:
fewest assignments so far in this roster first, then lowest employee id.
"""

import calendar
from collections import defaultdict
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import date

MIN_YEAR = 2000
MAX_YEAR = 2100

# Optional generic predicate (employee_id, date) -> bool. Holidays, weekly offs
# and approved leaves are handled by AvailabilityChecker before this filter.
AvailabilityFilter = Callable[[int, date], bool]


@dataclass(frozen=True)
class AssignmentRecord:
    """A single employee-to-brand/process eligibility record."""

    employee_id: int
    brand_id: int
    process_id: int


@dataclass(frozen=True)
class RequirementRecord:
    """A staffing requirement as stored in ``staffing_requirements``."""

    requirement_id: int
    brand_id: int
    process_id: int
    start_date: date
    end_date: date
    required_count: int


@dataclass(frozen=True)
class WeeklyOffRecord:
    """A recurring employee day off, read from the existing weekly_offs table."""

    employee_id: int
    day_of_week: str


@dataclass(frozen=True)
class HolidayRecord:
    """An organisation-wide holiday, read from the existing holidays table."""

    holiday_date: date
    holiday_name: str


@dataclass(frozen=True)
class ApprovedLeaveRecord:
    """An approved leave span, read from the existing leaves table."""

    employee_id: int
    start_date: date
    end_date: date
    leave_type: str


@dataclass(frozen=True)
class AvailabilityDecision:
    """Result of checking one employee on one date."""

    available: bool
    reason: str | None = None


@dataclass(frozen=True)
class CoverageRecord:
    """Per-date, per-requirement staffing coverage for the generated roster."""

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
    holiday_name: str | None = None
    weekly_off_employee_ids: tuple[int, ...] = ()
    leave_employee_ids: tuple[int, ...] = ()


@dataclass(frozen=True)
class RosterAssignment:
    """A generated entry before it is persisted."""

    employee_id: int
    brand_id: int
    process_id: int
    roster_date: date


@dataclass(frozen=True)
class UncoveredRequirement:
    """A staffing slot that could not be filled."""

    roster_date: date
    brand_id: int
    brand_name: str
    process_id: int
    process_name: str
    required_count: int
    assigned_count: int
    shortage: int
    # Explains *why* the slot is uncovered, e.g. an inactive brand/process or
    # simply not enough eligible, available employees.
    reason: str = "Insufficient eligible employees"


@dataclass(frozen=True)
class GenerationResult:
    """Pure output of the algorithm; the route persists and enriches it."""

    assignments: list[RosterAssignment]
    uncovered: list[UncoveredRequirement]
    total_requirements: int
    total_required_staff: int
    eligible_employees: int
    days_in_month: int
    # Step 21 planning snapshot used by the API/UI.
    coverage: list[CoverageRecord] = field(default_factory=list)
    holidays: list[HolidayRecord] = field(default_factory=list)
    weekly_offs: list[WeeklyOffRecord] = field(default_factory=list)
    approved_leaves: list[ApprovedLeaveRecord] = field(default_factory=list)


def month_bounds(year: int, month: int) -> tuple[date, date, int]:
    """Return (first day, last day, number of days) for a month."""
    days_in_month = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, days_in_month), days_in_month


def build_eligibility_map(
    assignments: Iterable[AssignmentRecord],
    active_employee_ids: Iterable[int],
    active_brand_ids: Iterable[int] | None = None,
    active_process_ids: Iterable[int] | None = None,
) -> dict[tuple[int, int], tuple[int, ...]]:
    """Group eligible employee ids by (brand_id, process_id).

    Only active employees, active brands and active processes are eligible.
    Passing ``None`` for the brand/process sets keeps direct callers backward
    compatible; the API route always passes the real active sets.
    Ids are sorted so selection is deterministic regardless of row order.
    """
    active_employees = set(active_employee_ids)
    active_brands = (
        set(active_brand_ids) if active_brand_ids is not None else None
    )
    active_processes = (
        set(active_process_ids) if active_process_ids is not None else None
    )
    grouped: dict[tuple[int, int], set[int]] = {}
    for assignment in assignments:
        if assignment.employee_id not in active_employees:
            continue
        if active_brands is not None and assignment.brand_id not in active_brands:
            continue
        if (
            active_processes is not None
            and assignment.process_id not in active_processes
        ):
            continue
        grouped.setdefault((assignment.brand_id, assignment.process_id), set()).add(
            assignment.employee_id
        )
    return {pair: tuple(sorted(ids)) for pair, ids in grouped.items()}


def requirements_for_month(
    requirements: Iterable[RequirementRecord],
    start_date: date,
    end_date: date,
) -> list[RequirementRecord]:
    """Return requirements whose inclusive range overlaps the month."""
    overlapping = [
        requirement
        for requirement in requirements
        if requirement.start_date <= end_date and requirement.end_date >= start_date
    ]
    return sorted(
        overlapping,
        key=lambda item: (
            item.brand_id,
            item.process_id,
            item.requirement_id,
            item.start_date,
        ),
    )


# WeeklyOff stores the human-readable weekday name used by calendar.day_name.
_DAY_NAME_BY_LOWER = {name.lower(): name for name in calendar.day_name}


def normalize_day_name(value: str | None) -> str | None:
    """Return the canonical Monday-Sunday name, or None when unrecognised."""
    if not isinstance(value, str):
        return None
    return _DAY_NAME_BY_LOWER.get(value.strip().lower())


class AvailabilityChecker:
    """Centralised availability rules for roster dates.

    Rules are applied in a fixed order so reasons are deterministic:

    1. Organisation holiday (blocks every employee on that date).
    2. Employee weekly off (blocks that employee on the matching weekday).
    3. Approved leave (blocks that employee for every inclusive leave date).
    4. Optional extra filter (a generic extension point).

    The class has no database or web-framework dependency; the route supplies
    plain records read from the existing ``holidays``, ``weekly_offs`` and
    ``leaves`` tables. Only already-approved leaves are passed in by the route.
    """

    def __init__(
        self,
        holidays: Iterable[HolidayRecord] | None = None,
        weekly_offs: Iterable[WeeklyOffRecord] | None = None,
        extra_filter: AvailabilityFilter | None = None,
        approved_leaves: Iterable[ApprovedLeaveRecord] | None = None,
    ) -> None:
        self._holidays = {
            item.holiday_date: item.holiday_name for item in (holidays or [])
        }
        self._weekly_off_by_day: dict[str, set[int]] = defaultdict(set)
        for item in weekly_offs or []:
            day_name = normalize_day_name(item.day_of_week)
            if day_name is not None:
                self._weekly_off_by_day[day_name].add(item.employee_id)
        self._approved_leaves = sorted(
            approved_leaves or [],
            key=lambda item: (item.start_date, item.end_date, item.employee_id),
        )
        self._extra_filter = extra_filter

    @staticmethod
    def day_name(day: date) -> str:
        """Canonical weekday name for a date, e.g. ``Sunday``."""
        return calendar.day_name[day.weekday()]

    def holiday_name(self, day: date) -> str | None:
        """Return the holiday name when the whole date is non-working."""
        return self._holidays.get(day)

    def weekly_off_employee_ids(self, day: date) -> frozenset[int]:
        """Employee ids whose weekly off falls on ``day``."""
        return frozenset(self._weekly_off_by_day.get(self.day_name(day), ()))

    def leave_employee_ids(self, day: date) -> frozenset[int]:
        """Employee ids on approved leave for ``day`` (inclusive boundaries)."""
        return frozenset(
            item.employee_id
            for item in self._approved_leaves
            if item.start_date <= day <= item.end_date
        )

    def check(self, employee_id: int, day: date) -> AvailabilityDecision:
        """Return whether ``employee_id`` may be scheduled on ``day``."""
        holiday = self.holiday_name(day)
        if holiday is not None:
            return AvailabilityDecision(
                False, f"Organisation holiday - {holiday}"
            )
        if employee_id in self.weekly_off_employee_ids(day):
            return AvailabilityDecision(
                False, f"Weekly off ({self.day_name(day)})"
            )
        if employee_id in self.leave_employee_ids(day):
            return AvailabilityDecision(False, "Approved leave")
        if self._extra_filter is not None and not self._extra_filter(
            employee_id, day
        ):
            return AvailabilityDecision(False, "Unavailable by additional filter")
        return AvailabilityDecision(True)


def generate_roster(
    *,
    year: int,
    month: int,
    active_employee_ids: Iterable[int],
    assignments: Iterable[AssignmentRecord],
    requirements: Iterable[RequirementRecord],
    active_brand_ids: Iterable[int] | None = None,
    active_process_ids: Iterable[int] | None = None,
    brand_names: Mapping[int, str] | None = None,
    process_names: Mapping[int, str] | None = None,
    holidays: Iterable[HolidayRecord] | None = None,
    weekly_offs: Iterable[WeeklyOffRecord] | None = None,
    approved_leaves: Iterable[ApprovedLeaveRecord] | None = None,
    availability_filter: AvailabilityFilter | None = None,
) -> GenerationResult:
    """Build a balanced roster for one month without touching the database.

    ``active_brand_ids``/``active_process_ids`` restrict scheduling to active
    master records. A requirement pointing at an inactive brand or process is
    never silently scheduled; it is returned in ``uncovered`` with an explicit
    reason instead.

    Step 21 added ``holidays`` (organisation-wide non-working dates) and
    ``weekly_offs`` (per-employee recurring days off). Step 22 adds
    ``approved_leaves`` (inclusive date ranges from the existing leaves table).
    All are evaluated by ``AvailabilityChecker`` before any candidate is
    selected. ``coverage`` in the result gives the UI required vs scheduled vs
    uncovered counts per date, including employees excluded by leave.

    ``availability_filter`` remains a generic extension point and is applied
    last by the checker.
    """
    start_date, end_date, days_in_month = month_bounds(year, month)
    names_for_brands = brand_names or {}
    names_for_processes = process_names or {}
    active_brands = set(active_brand_ids) if active_brand_ids is not None else None
    active_processes = (
        set(active_process_ids) if active_process_ids is not None else None
    )

    checker = AvailabilityChecker(
        holidays, weekly_offs, availability_filter, approved_leaves
    )
    month_holidays = sorted(
        [
            item
            for item in (holidays or [])
            if start_date <= item.holiday_date <= end_date
        ],
        key=lambda item: (item.holiday_date, item.holiday_name),
    )
    day_index = {name: index for index, name in enumerate(calendar.day_name)}
    month_weekly_offs = sorted(
        weekly_offs or [],
        key=lambda item: (
            day_index.get(normalize_day_name(item.day_of_week), len(day_index)),
            item.employee_id,
        ),
    )
    month_approved_leaves = sorted(
        [
            item
            for item in (approved_leaves or [])
            if item.start_date <= end_date and item.end_date >= start_date
        ],
        key=lambda item: (item.start_date, item.end_date, item.employee_id),
    )

    eligible_map = build_eligibility_map(
        assignments,
        active_employee_ids,
        active_brand_ids,
        active_process_ids,
    )
    month_requirements = requirements_for_month(requirements, start_date, end_date)

    # Only employees eligible for at least one required pair count as available.
    required_pairs = {
        (item.brand_id, item.process_id) for item in month_requirements
    }
    eligible_employees = {
        employee_id
        for pair in required_pairs
        for employee_id in eligible_map.get(pair, ())
    }

    assignments_out: list[RosterAssignment] = []
    uncovered: list[UncoveredRequirement] = []
    coverage: list[CoverageRecord] = []
    loads: dict[int, int] = {employee_id: 0 for employee_id in eligible_employees}
    total_required_staff = 0

    for day_number in range(1, days_in_month + 1):
        current_date = date(year, month, day_number)
        used_today: set[int] = set()
        day_holiday = checker.holiday_name(current_date)
        weekly_off_today = checker.weekly_off_employee_ids(current_date)

        for requirement in month_requirements:
            if not (requirement.start_date <= current_date <= requirement.end_date):
                continue

            total_required_staff += requirement.required_count
            brand_name = names_for_brands.get(
                requirement.brand_id, f"Brand #{requirement.brand_id}"
            )
            process_name = names_for_processes.get(
                requirement.process_id, f"Process #{requirement.process_id}"
            )

            def record_outcome(
                scheduled_count: int,
                reason: str | None,
                status: str,
                holiday_name: str | None = None,
                weekly_off_ids: tuple[int, ...] = (),
                leave_ids: tuple[int, ...] = (),
            ) -> None:
                """Store one coverage row and, when needed, one shortage row."""
                shortage = requirement.required_count - scheduled_count
                coverage.append(
                    CoverageRecord(
                        roster_date=current_date,
                        brand_id=requirement.brand_id,
                        brand_name=brand_name,
                        process_id=requirement.process_id,
                        process_name=process_name,
                        required_count=requirement.required_count,
                        scheduled_count=scheduled_count,
                        uncovered_count=shortage,
                        status=status,
                        reason=reason if shortage > 0 else None,
                        holiday_name=holiday_name,
                        weekly_off_employee_ids=tuple(weekly_off_ids),
                        leave_employee_ids=tuple(leave_ids),
                    )
                )
                if shortage > 0:
                    uncovered.append(
                        UncoveredRequirement(
                            roster_date=current_date,
                            brand_id=requirement.brand_id,
                            brand_name=brand_name,
                            process_id=requirement.process_id,
                            process_name=process_name,
                            required_count=requirement.required_count,
                            assigned_count=scheduled_count,
                            shortage=shortage,
                            reason=reason or "Insufficient eligible employees",
                        )
                    )

            # An inactive brand/process makes the whole requirement
            # unschedulable. Report it explicitly instead of picking anybody.
            unavailable_reasons = []
            if active_brands is not None and requirement.brand_id not in active_brands:
                unavailable_reasons.append(f"Brand #{requirement.brand_id} is inactive")
            if (
                active_processes is not None
                and requirement.process_id not in active_processes
            ):
                unavailable_reasons.append(
                    f"Process #{requirement.process_id} is inactive"
                )
            if unavailable_reasons:
                record_outcome(
                    0,
                    "Unavailable: " + "; ".join(unavailable_reasons),
                    "Understaffed",
                )
                continue

            # Holidays are organisation-wide non-working days: nobody is
            # scheduled, and every requirement on the date is reported uncovered.
            if day_holiday is not None:
                record_outcome(
                    0,
                    f"Unavailable: Organisation holiday - {day_holiday}",
                    "Holiday",
                    holiday_name=day_holiday,
                )
                continue

            pair_employees = eligible_map.get(
                (requirement.brand_id, requirement.process_id), ()
            )
            leave_today = checker.leave_employee_ids(current_date)
            weekly_off_excluded: list[int] = []
            leave_excluded: list[int] = []
            busy_excluded: list[int] = []
            other_excluded: list[int] = []
            candidates: list[int] = []

            for employee_id in pair_employees:
                if employee_id in used_today:
                    busy_excluded.append(employee_id)
                    continue
                if employee_id in weekly_off_today:
                    weekly_off_excluded.append(employee_id)
                    continue
                if employee_id in leave_today:
                    leave_excluded.append(employee_id)
                    continue
                if checker.check(employee_id, current_date).available:
                    candidates.append(employee_id)
                else:
                    other_excluded.append(employee_id)

            # Least-loaded first, then stable id tie-break: no randomness.
            candidates.sort(key=lambda employee_id: (loads[employee_id], employee_id))
            selected = candidates[: requirement.required_count]

            for employee_id in selected:
                used_today.add(employee_id)
                loads[employee_id] += 1
                assignments_out.append(
                    RosterAssignment(
                        employee_id=employee_id,
                        brand_id=requirement.brand_id,
                        process_id=requirement.process_id,
                        roster_date=current_date,
                    )
                )

            shortage = requirement.required_count - len(selected)
            reason = "Insufficient eligible employees"
            if leave_excluded:
                # Kept as a clear sentence for the UI and shortage reports.
                reason = "Insufficient available employees due to approved leave."
            details = []
            if weekly_off_excluded:
                details.append(f"{len(weekly_off_excluded)} on weekly off")
            if leave_excluded:
                details.append(f"{len(leave_excluded)} on approved leave")
            if busy_excluded:
                details.append(f"{len(busy_excluded)} already assigned on this date")
            if other_excluded:
                details.append(f"{len(other_excluded)} unavailable by additional filter")
            if details:
                joiner = " Details: " if reason.endswith(".") else ": "
                reason += joiner + ", ".join(details)

            if shortage == 0:
                status = "Fully Staffed"
            elif weekly_off_excluded:
                status = "Weekly Off"
            else:
                status = "Understaffed"

            record_outcome(
                len(selected),
                reason,
                status,
                weekly_off_ids=tuple(weekly_off_excluded),
                leave_ids=tuple(leave_excluded),
            )

    return GenerationResult(
        assignments=assignments_out,
        uncovered=uncovered,
        total_requirements=len(month_requirements),
        total_required_staff=total_required_staff,
        eligible_employees=len(eligible_employees),
        days_in_month=days_in_month,
        coverage=coverage,
        holidays=month_holidays,
        weekly_offs=month_weekly_offs,
        approved_leaves=month_approved_leaves,
    )
