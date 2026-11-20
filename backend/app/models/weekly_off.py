"""Weekly off model for the DataStraw Smart Roster system."""

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class WeeklyOff(Base):
    """A recurring day off for an employee, e.g. Sunday."""

    __tablename__ = "weekly_offs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    day_of_week = Column(String(10), nullable=False, index=True)
    created_at = Column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"), index=True
    )

    __table_args__ = (
        UniqueConstraint(
            "employee_id", "day_of_week", name="uq_weekly_off_employee_day"
        ),
    )

    employee = relationship("Employee", back_populates="weekly_offs")

    def __repr__(self) -> str:
        return (
            f"<WeeklyOff(id={self.id}, employee_id={self.employee_id}, "
            f"day={self.day_of_week!r})>"
        )
