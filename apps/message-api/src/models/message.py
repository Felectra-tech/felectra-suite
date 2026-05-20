from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, ForeignKey
)
from src.core.database import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Source / routing
    source = Column(String(32), nullable=False, default="playwright", index=True)
    # playwright | puppeteer | manual

    # Contact info
    contact = Column(String(256), nullable=False, index=True)
    phone_number = Column(String(32), nullable=True)
    sender = Column(String(256), nullable=True)
    receiver = Column(String(256), nullable=True)

    # Content
    subject = Column(String(512), nullable=True)
    text = Column(Text, nullable=True)
    content = Column(Text, nullable=True)   # raw / HTML content
    timestamp = Column(DateTime(timezone=True), nullable=True, index=True)
    direction = Column(String(16), nullable=False, default="incoming", index=True)
    # incoming | outgoing

    # Classification
    category = Column(String(32), nullable=False, default="personal", index=True)
    # personal | group | broadcast
    tags = Column(Text, nullable=True)          # JSON array stored as text
    priority = Column(String(16), nullable=False, default="normal", index=True)
    # low | normal | high | urgent

    # Media
    attachments = Column(Text, nullable=True)   # JSON array stored as text

    # Flags
    is_starred = Column(Boolean, default=False, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

    # Audit
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
