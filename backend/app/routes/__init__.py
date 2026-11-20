"""API routers for the DataStraw Smart Roster API."""

from .assignment import router as assignment_router
from .brand import router as brand_router
from .calendar import router as calendar_router
from .employee import router as employee_router
from .holiday import router as holiday_router
from .leave import router as leave_router
from .pod import router as pod_router
from .process import router as process_router
from .roster import router as roster_router
from .staffing_requirement import router as staffing_requirement_router
from .weekly_off import router as weekly_off_router

__all__ = [
    "assignment_router",
    "brand_router",
    "calendar_router",
    "employee_router",
    "holiday_router",
    "leave_router",
    "pod_router",
    "process_router",
    "roster_router",
    "staffing_requirement_router",
    "weekly_off_router",
]
