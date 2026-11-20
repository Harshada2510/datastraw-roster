"""Monthly roster storage model for the DataStraw Smart Roster system.

A ``Roster`` is the generated header for one calendar month. Each
``RosterEntry`` is a single employee assignment on one date. The tables are
created additively (see ``backend/create_roster_tables.py``); existing tables
and data are never dropped or modified.
"""

import json

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Roster(Base):
    """One generated monthly roster and a snapshot of its generation stats."""

    __tablename__ = "rosters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    generated_at = Column(
        DateTime,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        index=True,
    )

    # Snapshot values captured when the roster was generated/regenerated.
    days_in_month = Column(Integer, nullable=False, default=0)
    eligible_employees = Column(Integer, nullable=False, default=0)
    total_requirements = Column(Integer, nullable=False, default=0)
    total_required_staff = Column(Integer, nullable=False, default=0)
    total_entries = Column(Integer, nullable=False, default=0)
    total_employees = Column(Integer, nullable=False, default=0)
    uncovered_count = Column(Integer, nullable=False, default=0)
    uncovered_json = Column(Text, nullable=False, default="[]")
    # Step 21 snapshot: holidays, weekly offs and per-date coverage recorded at
    # generation time. Nullable so older Step 20 rows remain readable.
    planning_json = Column(Text, nullable=True, default="{}")

    __table_args__ = (
        UniqueConstraint("year", "month", name="uq_roster_year_month"),
    )

    entries = relationship(
        "RosterEntry",
        back_populates="roster",
        cascade="all, delete-orphan",
        order_by="RosterEntry.roster_date, RosterEntry.id",
    )

    def get_uncovered(self) -> list[dict]:
        """Decode the stored uncovered-requirements snapshot."""
        try:
            value = json.loads(self.uncovered_json or "[]")
        except (TypeError, ValueError):
            return []
        return value if isinstance(value, list) else []

    def get_planning(self) -> dict:
        """Decode the Step 21 holiday/weekly-off/coverage snapshot."""
        try:
            value = json.loads(self.planning_json or "{}")
        except (TypeError, ValueError):
            return {}
        return value if isinstance(value, dict) else {}

    def __repr__(self) -> str:
        return f"<Roster(id={self.id}, year={self.year}, month={self.month})>"


class RosterEntry(Base):
    """A single employee scheduled on one date for a brand/process pair."""

    __tablename__ = "roster_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    roster_id = Column(
        Integer,
        ForeignKey("rosters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
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
    roster_date = Column(Date, nullable=False, index=True)
    # Existing staffing requirements carry no shift information, so this is
    # reserved for future use and remains null for Step 20 generated rosters.
    shift_details = Column(String(100), nullable=True)
    created_at = Column(
        DateTime,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    __table_args__ = (
        # An employee can hold only one assignment per date in a roster.
        UniqueConstraint(
            "roster_id",
            "employee_id",
            "roster_date",
            name="uq_roster_employee_date",
        ),
        Index(
            "ix_roster_entry_date_pair",
            "roster_id",
            "roster_date",
            "brand_id",
            "process_id",
        ),
    )

    roster = relationship("Roster", back_populates="entries")
    employee = relationship("Employee")
    brand = relationship("Brand")
    process = relationship("Process")

    def __repr__(self) -> str:
        return (
            f"<RosterEntry(id={self.id}, date={self.roster_date}, "
            f"employee_id={self.employee_id}, brand_id={self.brand_id}, "
            f"process_id={self.process_id})>"
        )
