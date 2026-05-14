from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
import os

app = FastAPI(title="WhatsApp Message Reader API", version="0.1.0")

MESSAGES_FILE = os.getenv("MESSAGES_FILE", "messages.json")


class Message(BaseModel):
    id: str
    contact: str
    text: str
    timestamp: str
    direction: str  # "inbound" | "outbound"


class SendRequest(BaseModel):
    contact: str
    text: str


def load_messages() -> list[dict]:
    if not os.path.exists(MESSAGES_FILE):
        return []
    with open(MESSAGES_FILE) as f:
        return json.load(f)


def save_messages(messages: list[dict]) -> None:
    with open(MESSAGES_FILE, "w") as f:
        json.dump(messages, f, indent=2)


@app.get("/messages", response_model=list[Message])
def get_messages(contact: Optional[str] = None, limit: int = 50):
    messages = load_messages()
    if contact:
        messages = [m for m in messages if m.get("contact") == contact]
    return messages[-limit:]


@app.get("/messages/{message_id}", response_model=Message)
def get_message(message_id: str):
    messages = load_messages()
    match = next((m for m in messages if m["id"] == message_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="Message not found")
    return match


@app.post("/messages", response_model=Message, status_code=201)
def ingest_message(message: Message):
    """Endpoint for the scraper apps to push messages into."""
    messages = load_messages()
    messages.append(message.model_dump())
    save_messages(messages)
    return message


@app.delete("/messages/{message_id}", status_code=204)
def delete_message(message_id: str):
    messages = load_messages()
    updated = [m for m in messages if m["id"] != message_id]
    if len(updated) == len(messages):
        raise HTTPException(status_code=404, detail="Message not found")
    save_messages(updated)
