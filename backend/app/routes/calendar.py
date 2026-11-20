"""Calendar API routes for month-based roster planning data.

Returns holidays, employee leaves and weekly-offs for a requested month/year,
plus a per-day summary that a React calendar grid can render directly.
"""

import calendar as calendar_module
from datetime import date

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, Holiday, Leave, WeeklyOff
from app.schemas.calendar import (
    CalendarDayItem,
    CalendarHolidayItem,
    CalendarLeaveItem,
    CalendarResponse,
    CalendarWeeklyOffItem,
)

router = APIRouter(prefix="/api", tags=["Calendar"])

MIN_YEAR = 2000
MAX_YEAR = 2100

# calendar.day_name is Monday-indexed; WeeklyOff stores the name as a string.
_WEEKDAY_BY_NAME = {
    name: index for index, name in enumerate(calendar_module.day_name)
}


def _build_calendar(db: Session, year: int, month: int) -> CalendarResponse:
    """Assemble the structured month response from the calendar data sources."""
    days_in_month = calendar_module.monthrange(year, month)[1]
    start_date = date(year, month, 1)
    end_date = date(year, month, days_in_month)

    holiday_rows = db.execute(
        select(Holiday)
        .where(Holiday.holiday_date >= start_date, Holiday.holiday_date <= end_date)
        .order_by(Holiday.holiday_date, Holiday.id)
    ).scalars().all()
    holidays = [
        CalendarHolidayItem.model_validate(holiday) for holiday in holiday_rows
    ]

    leave_rows = db.execute(
        select(Leave, Employee.employee_code, Employee.full_name)
        .join(Employee, Leave.employee_id == Employee.id)
        .where(Leave.start_date <= end_date, Leave.end_date >= start_date)
        .order_by(Leave.start_date, Leave.id)
    ).all()
    leaves = [
        CalendarLeaveItem(
            id=leave.id,
            employee_id=leave.employee_id,
            employee_code=employee_code,
            employee_name=employee_name,
            start_date=leave.start_date,
            end_date=leave.end_date,
            leave_type=leave.leave_type,
            status=leave.status,
            reason=leave.reason,
        )
        for leave, employee_code, employee_name in leave_rows
    ]

    weekly_off_rows = db.execute(
        select(WeeklyOff, Employee.employee_code, Employee.full_name)
        .join(Employee, WeeklyOff.employee_id == Employee.id)
        .order_by(WeeklyOff.day_of_week, WeeklyOff.employee_id)
    ).all()
    weekly_offs = [
        CalendarWeeklyOffItem(
            id=weekly_off.id,
            employee_id=weekly_off.employee_id,
            employee_code=employee_code,
            employee_name=employee_name,
            day_of_week=weekly_off.day_of_week,
        )
        for weekly_off, employee_code, employee_name in weekly_off_rows
    ]

    days = []
    for day_number in range(1, days_in_month + 1):
        current_date = date(year, month, day_number)
        day_holidays = [
            holiday for holiday in holidays if holiday.holiday_date == current_date
        ]
        current_day_name = calendar_module.day_name[current_date.weekday()]
        days.append(
            CalendarDayItem(
                date=current_date,
                day_of_week=current_day_name,
                holiday_ids=[holiday.id for holiday in day_holidays],
                holiday_names=[holiday.holiday_name for holiday in day_holidays],
                leave_employee_ids=[
                    leave.employee_id
                    for leave in leaves
                    if leave.start_date <= current_date <= leave.end_date
                ],
                weekly_off_employee_ids=[
                    item.employee_id
                    for item in weekly_offs
                    if item.day_of_week == current_day_name
                ],
            )
        )

    return CalendarResponse(
        year=year,
        month=month,
        month_name=calendar_module.month_name[month],
        start_date=start_date,
        end_date=end_date,
        days_in_month=days_in_month,
        holidays=holidays,
        leaves=leaves,
        weekly_offs=weekly_offs,
        days=days,
    )


@router.get("/calendar", response_model=CalendarResponse)
def get_calendar(
    month: int = Query(ge=1, le=12),
    year: int = Query(ge=MIN_YEAR, le=MAX_YEAR),
    db: Session = Depends(get_db),
):
    """Get calendar data from query parameters, e.g. ?month=1&year=2026."""
    return _build_calendar(db, year, month)


@router.get("/calendar/{year}/{month}", response_model=CalendarResponse)
def get_calendar_by_path(
    year: int = Path(ge=MIN_YEAR, le=MAX_YEAR),
    month: int = Path(ge=1, le=12),
    db: Session = Depends(get_db),
):
    """Get the same calendar data from path parameters, e.g. /2026/1."""
    return _build_calendar(db, year, month)
