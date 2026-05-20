import json
import logging
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from src.models.message import Message
from src.schemas.message import MessageCreate, MessageUpdate, MessageFilter

logger = logging.getLogger(__name__)


def _serialize(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value)


def create_message(db: Session, user_id: int, payload: MessageCreate) -> Message:
    msg = Message(
        user_id=user_id,
        source=payload.source,
        contact=payload.contact,
        phone_number=payload.phone_number,
        sender=payload.sender,
        receiver=payload.receiver,
        subject=payload.subject,
        text=payload.text,
        content=payload.content,
        timestamp=payload.timestamp or datetime.now(timezone.utc),
        direction=payload.direction,
        category=payload.category,
        tags=_serialize(payload.tags),
        priority=payload.priority,
        attachments=_serialize(payload.attachments),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    logger.debug("Message created id=%s contact=%s", msg.id, msg.contact)
    return msg


def get_messages(
    db: Session,
    user_id: int,
    filters: MessageFilter,
) -> tuple[List[Message], int]:
    query = db.query(Message).filter(Message.user_id == user_id)

    if not filters.include_deleted:
        query = query.filter(Message.is_deleted == False)

    if filters.contact:
        query = query.filter(Message.contact.ilike(f"%{filters.contact}%"))
    if filters.source:
        query = query.filter(Message.source == filters.source)
    if filters.category:
        query = query.filter(Message.category == filters.category)
    if filters.priority:
        query = query.filter(Message.priority == filters.priority)
    if filters.is_starred is not None:
        query = query.filter(Message.is_starred == filters.is_starred)
    if filters.is_archived is not None:
        query = query.filter(Message.is_archived == filters.is_archived)
    if filters.start_date:
        query = query.filter(Message.timestamp >= filters.start_date)
    if filters.end_date:
        query = query.filter(Message.timestamp <= filters.end_date)
    if filters.search:
        term = f"%{filters.search}%"
        query = query.filter(
            or_(
                Message.text.ilike(term),
                Message.contact.ilike(term),
                Message.sender.ilike(term),
                Message.subject.ilike(term),
            )
        )
    if filters.tags:
        for tag in filters.tags.split(","):
            tag = tag.strip()
            if tag:
                query = query.filter(Message.tags.ilike(f"%{tag}%"))

    total = query.count()

    order = Message.timestamp.desc() if filters.sort == "desc" else Message.timestamp.asc()
    query = query.order_by(order)

    offset = (filters.page - 1) * filters.limit
    items = query.offset(offset).limit(filters.limit).all()

    return items, total


def get_message_by_id(db: Session, user_id: int, message_id: int) -> Optional[Message]:
    return (
        db.query(Message)
        .filter(Message.id == message_id, Message.user_id == user_id)
        .first()
    )


def update_message(db: Session, message: Message, payload: MessageUpdate) -> Message:
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field in ("tags", "attachments"):
            value = _serialize(value)
        setattr(message, field, value)
    db.commit()
    db.refresh(message)
    return message


def soft_delete_message(db: Session, message: Message) -> Message:
    message.is_deleted = True
    db.commit()
    db.refresh(message)
    return message


def restore_message(db: Session, message: Message) -> Message:
    message.is_deleted = False
    db.commit()
    db.refresh(message)
    return message


def star_message(db: Session, message: Message) -> Message:
    message.is_starred = not message.is_starred
    db.commit()
    db.refresh(message)
    return message


def archive_message(db: Session, message: Message) -> Message:
    message.is_archived = not message.is_archived
    db.commit()
    db.refresh(message)
    return message
