"""Leave model for the DataStraw Smart Roster system."""

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Leave(Base):
    """A leave request submitted by an employee."""

    __tablename__ = "leaves"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)
    leave_type = Column(String(50), nullable=False, index=True)
    reason = Column(Text, nullable=True)
    status = Column(
        String(20),
        nullable=False,
        default="Pending",
        server_default=text("'Pending'"),
        index=True,
    )
    created_at = Column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"), index=True
    )

    __table_args__ = (
        Index("ix_leaves_employee_dates", "employee_id", "start_date", "end_date"),
    )

    employee = relationship("Employee", back_populates="leave_requests")

    def __repr__(self) -> str:
        return (
            f"<Leave(id={self.id}, employee_id={self.employee_id}, "
            f"start={self.start_date}, end={self.end_date}, status={self.status!r})>"
        )
