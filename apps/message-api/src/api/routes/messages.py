import math
import logging
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from src.core.database import get_db
from src.api.deps import get_current_user
from src.models.user import User
from src.schemas.message import (
    MessageCreate, MessageUpdate, MessageOut,
    MessageListResponse, MessageFilter,
)
from src.services import message_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/messages", tags=["Messages"])


@router.post("", response_model=MessageOut, status_code=201)
def create_message(
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return message_service.create_message(db, current_user.id, payload)


@router.get("", response_model=MessageListResponse)
def list_messages(
    contact: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    is_starred: Optional[bool] = Query(None),
    is_archived: Optional[bool] = Query(None),
    include_deleted: bool = Query(False),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    sort: str = Query("desc"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = MessageFilter(
        contact=contact, source=source, category=category,
        priority=priority, search=search, tags=tags,
        is_starred=is_starred, is_archived=is_archived,
        include_deleted=include_deleted, page=page, limit=limit,
        sort=sort, start_date=start_date, end_date=end_date,
    )
    items, total = message_service.get_messages(db, current_user.id, filters)
    pages = math.ceil(total / limit) if total > 0 else 1
    return MessageListResponse(items=items, total=total, page=page, limit=limit, pages=pages)


@router.get("/{message_id}", response_model=MessageOut)
def get_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = message_service.get_message_by_id(db, current_user.id, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    return msg


@router.put("/{message_id}", response_model=MessageOut)
def update_message(
    message_id: int,
    payload: MessageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = message_service.get_message_by_id(db, current_user.id, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    return message_service.update_message(db, msg, payload)


@router.delete("/{message_id}", status_code=204)
def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = message_service.get_message_by_id(db, current_user.id, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    message_service.soft_delete_message(db, msg)


@router.patch("/{message_id}/restore", response_model=MessageOut)
def restore_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = message_service.get_message_by_id(db, current_user.id, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    return message_service.restore_message(db, msg)


@router.patch("/{message_id}/star", response_model=MessageOut)
def star_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = message_service.get_message_by_id(db, current_user.id, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    return message_service.star_message(db, msg)


@router.patch("/{message_id}/archive", response_model=MessageOut)
def archive_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msg = message_service.get_message_by_id(db, current_user.id, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    return message_service.archive_message(db, msg)
