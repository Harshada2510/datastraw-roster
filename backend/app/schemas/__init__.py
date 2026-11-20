"""Pydantic schemas for the DataStraw Smart Roster API."""

from .assignment import (
    EmployeeAssignmentCreate,
    EmployeeAssignmentResponse,
    EmployeeAssignmentUpdate,
)
from .brand import BrandCreate, BrandResponse, BrandUpdate
from .calendar import (
    CalendarDayItem,
    CalendarHolidayItem,
    CalendarLeaveItem,
    CalendarResponse,
    CalendarWeeklyOffItem,
)
from .employee import EmployeeCreate, EmployeeResponse, EmployeeUpdate
from .holiday import HolidayCreate, HolidayResponse, HolidayUpdate
from .leave import LeaveCreate, LeaveResponse, LeaveUpdate
from .pod import PodCreate, PodResponse, PodUpdate
from .weekly_off import WeeklyOffCreate, WeeklyOffResponse, WeeklyOffUpdate
from .process import ProcessCreate, ProcessResponse, ProcessUpdate
from .staffing_requirement import (
    StaffingRequirementCreate,
    StaffingRequirementResponse,
    StaffingRequirementUpdate,
)

__all__ = [
    "EmployeeAssignmentCreate",
    "EmployeeAssignmentResponse",
    "EmployeeAssignmentUpdate",
    "BrandCreate",
    "BrandResponse",
    "BrandUpdate",
    "CalendarDayItem",
    "CalendarHolidayItem",
    "CalendarLeaveItem",
    "CalendarResponse",
    "CalendarWeeklyOffItem",
    "EmployeeCreate",
    "EmployeeResponse",
    "EmployeeUpdate",
    "HolidayCreate",
    "HolidayResponse",
    "HolidayUpdate",
    "LeaveCreate",
    "LeaveResponse",
    "LeaveUpdate",
    "PodCreate",
    "PodResponse",
    "PodUpdate",
    "ProcessCreate",
    "ProcessResponse",
    "ProcessUpdate",
    "StaffingRequirementCreate",
    "StaffingRequirementResponse",
    "StaffingRequirementUpdate",
    "WeeklyOffCreate",
    "WeeklyOffResponse",
    "WeeklyOffUpdate",
]
