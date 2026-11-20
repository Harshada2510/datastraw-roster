"""Holiday model for the DataStraw Smart Roster system."""

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)

from app.database import Base


class Holiday(Base):
    """An organisation-wide holiday on a specific calendar date."""

    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, autoincrement=True)
    holiday_name = Column(String(150), nullable=False, index=True)
    holiday_date = Column(Date, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"), index=True
    )

    __table_args__ = (
        UniqueConstraint("holiday_date", name="uq_holiday_date"),
    )

    def __repr__(self) -> str:
        return (
            f"<Holiday(id={self.id}, name={self.holiday_name!r}, "
            f"date={self.holiday_date})>"
        )
