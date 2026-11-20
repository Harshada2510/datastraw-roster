"""Process model for the DataStraw Smart Roster system."""

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, text
from sqlalchemy.orm import relationship

from app.database import Base


class Process(Base):
    """A work process that employees can be assigned to."""

    __tablename__ = "processes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    process_name = Column(String(150), nullable=False, index=True)
    description = Column(Text, nullable=True)
    is_active = Column(
        Boolean, nullable=False, default=True, server_default=text("1"), index=True
    )
    created_at = Column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )

    assignments = relationship(
        "EmployeeAssignment",
        back_populates="process",
        cascade="all, delete-orphan",
    )
    staffing_requirements = relationship(
        "StaffingRequirement",
        back_populates="process",
    )

    def __repr__(self) -> str:
        return f"<Process(id={self.id}, name={self.process_name!r})>"
