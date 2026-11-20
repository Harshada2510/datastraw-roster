"""SQLAlchemy models for the DataStraw Smart Roster database.

Importing this package registers every model on ``Base.metadata`` so that
``Base.metadata.create_all(engine)`` can create all tables.
"""

from app.database import Base

from .employee import Employee
from .brand import Brand
from .process import Process
from .pod import Pod
from .employee_assignment import EmployeeAssignment
from .leave import Leave
from .weekly_off import WeeklyOff
from .holiday import Holiday
from .staffing_requirement import StaffingRequirement
from .roster import Roster, RosterEntry

__all__ = [
    "Base",
    "Employee",
    "Brand",
    "Process",
    "Pod",
    "EmployeeAssignment",
    "Leave",
    "WeeklyOff",
    "Holiday",
    "StaffingRequirement",
    "Roster",
    "RosterEntry",
]
