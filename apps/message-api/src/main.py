"""
message-api — FastAPI backend for WhatsApp Playwright scraper
Run: uvicorn src.main:app --reload --port 8000
"""
 
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import json, os, uuid, threading
from dotenv import load_dotenv
 
load_dotenv()
 
# ── Config ────────────────────────────────────────────────────────────────────
MESSAGES_FILE = os.getenv("MESSAGES_FILE", "messages.json")
GROUPS_FILE   = os.getenv("GROUPS_FILE",   "groups.json")
API_USERNAME  = os.getenv("API_USERNAME",  "admin")
API_PASSWORD  = os.getenv("API_PASSWORD",  "changeme")
FAKE_TOKEN    = "local-dev-token"   # Simple token for local use
 
# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="WhatsApp Message API", version="1.0.0")
 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
 
security = HTTPBearer(auto_error=False)
_file_lock = threading.Lock()   # Prevent concurrent write corruption
 
# ── Auth ──────────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    username: str
    email:    Optional[str] = None
    password: str
 
class LoginRequest(BaseModel):
    username: str
    password: str
 
def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials or credentials.credentials != FAKE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    return credentials.credentials
 
@app.post("/api/v1/auth/register", status_code=201)
def register(req: RegisterRequest):
    if req.username == API_USERNAME and req.password == API_PASSWORD:
        return {"message": f"User '{req.username}' ready."}
    raise HTTPException(status_code=400, detail="Invalid credentials")
 
@app.post("/api/v1/auth/login")
def login(req: LoginRequest):
    if req.username == API_USERNAME and req.password == API_PASSWORD:
        return {"access_token": FAKE_TOKEN, "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Wrong username or password")
 
# ── Schemas ───────────────────────────────────────────────────────────────────
class Message(BaseModel):
    id:          Optional[str] = None   # Auto-generated if not provided
    source:      Optional[str] = None
    contact:     str
    sender:      Optional[str] = None
    receiver:    Optional[str] = None
    text:        str
    timestamp:   str
    direction:   Optional[str] = None
    category:    Optional[str] = None
    tags:        Optional[list] = []
    priority:    Optional[str] = "normal"
    attachments: Optional[list] = []
 
class Group(BaseModel):
    id:           Optional[str] = None
    group_name:   str
    description:  Optional[str] = None
    participants: Optional[list] = []
    admins:       Optional[list] = []
    source:       Optional[str] = None
 
# ── File helpers ──────────────────────────────────────────────────────────────
def _load(filepath: str) -> list:
    with _file_lock:
        if not os.path.exists(filepath):
            return []
        with open(filepath, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []
 
def _save(filepath: str, data: list) -> None:
    with _file_lock:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
 
# ── Messages ──────────────────────────────────────────────────────────────────
@app.get("/api/v1/messages")
def get_messages(
    contact: Optional[str] = None,
    limit: int = 50,
    _token: str = Depends(verify_token)
):
    messages = _load(MESSAGES_FILE)
    if contact:
        messages = [m for m in messages if m.get("contact") == contact]
    return messages[-limit:]
 
@app.get("/api/v1/messages/{message_id}")
def get_message(message_id: str, _token: str = Depends(verify_token)):
    messages = _load(MESSAGES_FILE)
    match = next((m for m in messages if m.get("id") == message_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="Message not found")
    return match
 
@app.post("/api/v1/messages", status_code=201)
def ingest_message(message: Message, _token: str = Depends(verify_token)):
    messages = _load(MESSAGES_FILE)
 
    # Auto-generate id if missing
    if not message.id:
        message.id = str(uuid.uuid4())
 
    # Deduplication: same contact + text + timestamp = duplicate
    dedup_key = f"{message.contact}::{message.sender}::{message.text}::{message.timestamp}"
    for existing in messages:
        existing_key = f"{existing.get('contact')}::{existing.get('sender')}::{existing.get('text')}::{existing.get('timestamp')}"
        if existing_key == dedup_key:
            return existing  # Return existing, don't store duplicate
 
    messages.append(message.model_dump())
    _save(MESSAGES_FILE, messages)
    return message
 
@app.delete("/api/v1/messages/{message_id}", status_code=204)
def delete_message(message_id: str, _token: str = Depends(verify_token)):
    messages = _load(MESSAGES_FILE)
    updated = [m for m in messages if m.get("id") != message_id]
    if len(updated) == len(messages):
        raise HTTPException(status_code=404, detail="Message not found")
    _save(MESSAGES_FILE, updated)
 
# ── Groups ────────────────────────────────────────────────────────────────────
@app.get("/api/v1/groups")
def get_groups(_token: str = Depends(verify_token)):
    return _load(GROUPS_FILE)
 
@app.post("/api/v1/groups", status_code=201)
def ingest_group(group: Group, _token: str = Depends(verify_token)):
    groups = _load(GROUPS_FILE)
 
    if not group.id:
        group.id = str(uuid.uuid4())
 
    # Update existing group by name, or add new
    for i, existing in enumerate(groups):
        if existing.get("group_name") == group.group_name:
            groups[i] = group.model_dump()
            _save(GROUPS_FILE, groups)
            return group
 
    groups.append(group.model_dump())
    _save(GROUPS_FILE, groups)
    return group
 
# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}
 