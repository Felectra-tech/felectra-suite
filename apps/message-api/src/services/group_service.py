import json
import logging
from typing import Optional, List
from sqlalchemy.orm import Session
from src.models.group import Group
from src.schemas.group import GroupCreate

logger = logging.getLogger(__name__)


def _serialize(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    # Convert Pydantic models to dicts
    if isinstance(value, list):
        out = []
        for item in value:
            out.append(item.model_dump() if hasattr(item, "model_dump") else item)
        return json.dumps(out)
    return json.dumps(value)


def create_or_update_group(db: Session, user_id: int, payload: GroupCreate) -> Group:
    existing = (
        db.query(Group)
        .filter(Group.user_id == user_id, Group.group_name == payload.group_name)
        .first()
    )
    if existing:
        existing.description = payload.description or existing.description
        existing.participants = _serialize(payload.participants) or existing.participants
        existing.admins = _serialize(payload.admins) or existing.admins
        existing.source = payload.source
        db.commit()
        db.refresh(existing)
        logger.debug("Group updated: %s", existing.group_name)
        return existing

    group = Group(
        user_id=user_id,
        group_name=payload.group_name,
        description=payload.description,
        participants=_serialize(payload.participants),
        admins=_serialize(payload.admins),
        source=payload.source,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    logger.debug("Group created: %s", group.group_name)
    return group


def get_groups(db: Session, user_id: int) -> tuple[List[Group], int]:
    query = db.query(Group).filter(Group.user_id == user_id)
    total = query.count()
    items = query.order_by(Group.group_name.asc()).all()
    return items, total


def get_group_by_id(db: Session, user_id: int, group_id: int) -> Optional[Group]:
    return db.query(Group).filter(Group.id == group_id, Group.user_id == user_id).first()
