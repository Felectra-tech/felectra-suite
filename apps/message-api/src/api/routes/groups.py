import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from src.core.database import get_db
from src.api.deps import get_current_user
from src.models.user import User
from src.schemas.group import GroupCreate, GroupOut, GroupListResponse
from src.services import group_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/groups", tags=["Groups"])


@router.post("", response_model=GroupOut, status_code=201)
def create_group(
    payload: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return group_service.create_or_update_group(db, current_user.id, payload)


@router.get("", response_model=GroupListResponse)
def list_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = group_service.get_groups(db, current_user.id)
    return GroupListResponse(items=items, total=total)


@router.get("/{group_id}", response_model=GroupOut)
def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = group_service.get_group_by_id(db, current_user.id, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group
