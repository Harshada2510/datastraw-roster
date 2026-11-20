"""Staffing requirement model for the DataStraw Smart Roster system."""

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class StaffingRequirement(Base):
    """Required employee count for a brand/process over a date range.

    A single-day requirement is stored with ``start_date == end_date`` so that
    every record can be queried with the same inclusive date-range logic.
    """

    __tablename__ = "staffing_requirements"

    id = Column(Integer, primary_key=True, autoincrement=True)
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
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)
    required_count = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"), index=True
    )

    __table_args__ = (
        UniqueConstraint(
            "brand_id",
            "process_id",
            "start_date",
            "end_date",
            name="uq_staffing_brand_process_dates",
        ),
        Index(
            "ix_staffing_brand_process_dates",
            "brand_id",
            "process_id",
            "start_date",
            "end_date",
        ),
    )

    brand = relationship("Brand", back_populates="staffing_requirements")
    process = relationship("Process", back_populates="staffing_requirements")

    def __repr__(self) -> str:
        return (
            f"<StaffingRequirement(id={self.id}, brand_id={self.brand_id}, "
            f"process_id={self.process_id}, start={self.start_date}, "
            f"end={self.end_date}, required_count={self.required_count})>"
        )
