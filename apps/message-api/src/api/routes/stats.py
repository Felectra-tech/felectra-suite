import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from src.core.database import get_db
from src.api.deps import get_current_user
from src.models.user import User
from src.models.message import Message
from src.models.group import Group
from src.schemas.stats import DashboardStats

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/stats", tags=["Statistics"])


@router.get("/dashboard", response_model=DashboardStats)
def dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id
    base = db.query(Message).filter(Message.user_id == uid, Message.is_deleted == False)

    total = base.count()
    incoming = base.filter(Message.direction == "incoming").count()
    outgoing = base.filter(Message.direction == "outgoing").count()
    starred = base.filter(Message.is_starred == True).count()
    archived = base.filter(Message.is_archived == True).count()
    total_groups = db.query(Group).filter(Group.user_id == uid).count()

    # Distinct contacts
    total_contacts = (
        db.query(func.count(func.distinct(Message.contact)))
        .filter(Message.user_id == uid, Message.is_deleted == False)
        .scalar()
        or 0
    )

    # Messages by source
    by_source_rows = (
        db.query(Message.source, func.count(Message.id))
        .filter(Message.user_id == uid, Message.is_deleted == False)
        .group_by(Message.source)
        .all()
    )
    messages_by_source = {row[0]: row[1] for row in by_source_rows}

    # Messages by category
    by_cat_rows = (
        db.query(Message.category, func.count(Message.id))
        .filter(Message.user_id == uid, Message.is_deleted == False)
        .group_by(Message.category)
        .all()
    )
    messages_by_category = {row[0]: row[1] for row in by_cat_rows}

    # Messages by priority
    by_pri_rows = (
        db.query(Message.priority, func.count(Message.id))
        .filter(Message.user_id == uid, Message.is_deleted == False)
        .group_by(Message.priority)
        .all()
    )
    messages_by_priority = {row[0]: row[1] for row in by_pri_rows}

    # Top contacts
    top_contacts_rows = (
        db.query(Message.contact, func.count(Message.id).label("count"))
        .filter(Message.user_id == uid, Message.is_deleted == False)
        .group_by(Message.contact)
        .order_by(func.count(Message.id).desc())
        .limit(10)
        .all()
    )
    top_contacts = [{"contact": r[0], "count": r[1]} for r in top_contacts_rows]

    # Recent activity (last 10 messages)
    recent_rows = (
        db.query(Message.contact, Message.text, Message.timestamp, Message.direction)
        .filter(Message.user_id == uid, Message.is_deleted == False)
        .order_by(Message.timestamp.desc())
        .limit(10)
        .all()
    )
    recent_activity = [
        {
            "contact": r[0],
            "text": (r[1] or "")[:80],
            "timestamp": r[2].isoformat() if r[2] else None,
            "direction": r[3],
        }
        for r in recent_rows
    ]

    return DashboardStats(
        total_messages=total,
        incoming_messages=incoming,
        outgoing_messages=outgoing,
        total_groups=total_groups,
        total_contacts=total_contacts,
        starred_messages=starred,
        archived_messages=archived,
        messages_by_source=messages_by_source,
        messages_by_category=messages_by_category,
        messages_by_priority=messages_by_priority,
        top_contacts=top_contacts,
        recent_activity=recent_activity,
    )
