"""Pod model for the DataStraw Smart Roster system."""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Pod(Base):
    """A pod led by an employee."""

    __tablename__ = "pods"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pod_name = Column(String(150), nullable=False, index=True)
    description = Column(Text, nullable=True)
    pod_lead_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_active = Column(
        Boolean, nullable=False, default=True, server_default=text("1"), index=True
    )
    created_at = Column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )

    lead = relationship(
        "Employee",
        back_populates="led_pods",
        foreign_keys=[pod_lead_id],
    )

    def __repr__(self) -> str:
        return f"<Pod(id={self.id}, name={self.pod_name!r}, lead_id={self.pod_lead_id})>"
