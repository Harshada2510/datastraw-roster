"""Brand model for the DataStraw Smart Roster system."""

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, text
from sqlalchemy.orm import relationship

from app.database import Base


class Brand(Base):
    """A brand that employees can be assigned to."""

    __tablename__ = "brands"

    id = Column(Integer, primary_key=True, autoincrement=True)
    brand_name = Column(String(150), nullable=False, index=True)
    description = Column(Text, nullable=True)
    is_active = Column(
        Boolean, nullable=False, default=True, server_default=text("1"), index=True
    )
    created_at = Column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )

    assignments = relationship(
        "EmployeeAssignment",
        back_populates="brand",
        cascade="all, delete-orphan",
    )
    staffing_requirements = relationship(
        "StaffingRequirement",
        back_populates="brand",
    )

    def __repr__(self) -> str:
        return f"<Brand(id={self.id}, name={self.brand_name!r})>"
