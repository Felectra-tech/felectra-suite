from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, field_validator
import json


class ParticipantInfo(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None


class GroupCreate(BaseModel):
    group_name: str
    description: Optional[str] = None
    participants: Optional[List[ParticipantInfo]] = None
    admins: Optional[List[ParticipantInfo]] = None
    source: str = "playwright"


class GroupOut(BaseModel):
    id: int
    user_id: int
    group_name: str
    description: Optional[str]
    participants: Optional[List[Any]]
    admins: Optional[List[Any]]
    source: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("participants", "admins", mode="before")
    @classmethod
    def parse_json_field(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (ValueError, TypeError):
                return []
        return v


class GroupListResponse(BaseModel):
    items: List[GroupOut]
    total: int
