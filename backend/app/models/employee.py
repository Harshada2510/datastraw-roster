"""Employee model for the DataStraw Smart Roster system."""

from sqlalchemy import Boolean, Column, DateTime, Integer, String, func, text
from sqlalchemy.orm import relationship

from app.database import Base


class Employee(Base):
    """A DataStraw employee who can be assigned to brand/process combinations."""

    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_code = Column(
        String(50), nullable=False, unique=True, index=True
    )
    full_name = Column(String(150), nullable=False, index=True)
    email = Column(String(255), nullable=True, index=True)
    phone = Column(String(30), nullable=True)
    designation = Column(String(100), nullable=True)
    is_active = Column(
        Boolean, nullable=False, default=True, server_default=text("1"), index=True
    )
    created_at = Column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=func.now(),
    )

    # An employee can lead multiple pods and hold multiple brand/process assignments.
    led_pods = relationship(
        "Pod",
        back_populates="lead",
        foreign_keys="[Pod.pod_lead_id]",
    )
    assignments = relationship(
        "EmployeeAssignment",
        back_populates="employee",
        cascade="all, delete-orphan",
    )
    leave_requests = relationship(
        "Leave",
        back_populates="employee",
        cascade="all, delete-orphan",
    )
    weekly_offs = relationship(
        "WeeklyOff",
        back_populates="employee",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Employee(id={self.id}, code={self.employee_code!r}, name={self.full_name!r})>"
