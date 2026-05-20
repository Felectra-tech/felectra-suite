from pydantic import BaseModel
from typing import Dict


class DashboardStats(BaseModel):
    total_messages: int
    incoming_messages: int
    outgoing_messages: int
    total_groups: int
    total_contacts: int
    starred_messages: int
    archived_messages: int
    messages_by_source: Dict[str, int]
    messages_by_category: Dict[str, int]
    messages_by_priority: Dict[str, int]
    top_contacts: list
    recent_activity: list
