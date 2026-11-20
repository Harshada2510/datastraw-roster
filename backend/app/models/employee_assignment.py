"""Employee assignment model for the DataStraw Smart Roster system."""

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class EmployeeAssignment(Base):
    """Links an employee to one brand/process combination.

    The same employee cannot be assigned to the same brand/process pair twice.
    """

    __tablename__ = "employee_assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    brand_id = Column(
        Integer,
        ForeignKey("brands.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    process_id = Column(
        Integer,
        ForeignKey("processes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(
        DateTime,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        index=True,
    )

    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "brand_id",
            "process_id",
            name="uq_employee_brand_process",
        ),
    )

    employee = relationship("Employee", back_populates="assignments")
    brand = relationship("Brand", back_populates="assignments")
    process = relationship("Process", back_populates="assignments")

    def __repr__(self) -> str:
        return (
            f"<EmployeeAssignment(id={self.id}, employee_id={self.employee_id}, "
            f"brand_id={self.brand_id}, process_id={self.process_id})>"
        )
