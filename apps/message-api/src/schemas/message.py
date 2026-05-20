from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, field_validator
import json


class MessageCreate(BaseModel):
    source: str = "playwright"
    contact: str
    phone_number: Optional[str] = None
    sender: Optional[str] = None
    receiver: Optional[str] = None
    subject: Optional[str] = None
    text: Optional[str] = None
    content: Optional[str] = None
    timestamp: Optional[datetime] = None
    direction: str = "incoming"
    category: str = "personal"
    tags: Optional[List[str]] = None
    priority: str = "normal"
    attachments: Optional[List[Any]] = None


class MessageUpdate(BaseModel):
    contact: Optional[str] = None
    phone_number: Optional[str] = None
    sender: Optional[str] = None
    receiver: Optional[str] = None
    subject: Optional[str] = None
    text: Optional[str] = None
    content: Optional[str] = None
    timestamp: Optional[datetime] = None
    direction: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    priority: Optional[str] = None
    attachments: Optional[List[Any]] = None
    is_starred: Optional[bool] = None
    is_archived: Optional[bool] = None


class MessageOut(BaseModel):
    id: int
    user_id: int
    source: str
    contact: str
    phone_number: Optional[str]
    sender: Optional[str]
    receiver: Optional[str]
    subject: Optional[str]
    text: Optional[str]
    content: Optional[str]
    timestamp: Optional[datetime]
    direction: str
    category: str
    tags: Optional[List[str]]
    priority: str
    attachments: Optional[List[Any]]
    is_starred: bool
    is_archived: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("tags", "attachments", mode="before")
    @classmethod
    def parse_json_field(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (ValueError, TypeError):
                return []
        return v


class MessageListResponse(BaseModel):
    items: List[MessageOut]
    total: int
    page: int
    limit: int
    pages: int


class MessageFilter(BaseModel):
    contact: Optional[str] = None
    source: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    search: Optional[str] = None
    tags: Optional[str] = None          # comma-separated
    is_starred: Optional[bool] = None
    is_archived: Optional[bool] = None
    include_deleted: bool = False
    page: int = 1
    limit: int = 50
    sort: str = "desc"                  # asc | desc by timestamp
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
