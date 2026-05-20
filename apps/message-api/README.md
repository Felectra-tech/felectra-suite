# WhatsApp Automation Platform — Backend API

A production-ready FastAPI backend that stores, organizes, searches, and analyzes WhatsApp messages scraped by the Playwright and Puppeteer automation clients.

---

## Architecture

```
backend/message-api/
├── app/
│   ├── core/           # Config, DB engine, JWT security
│   ├── models/         # SQLAlchemy ORM models (User, Message, Group)
│   ├── schemas/        # Pydantic v2 request/response schemas
│   ├── api/
│   │   ├── deps.py     # Auth dependency (get_current_user)
│   │   └── routes/     # auth, messages, groups, stats
│   └── services/       # Business logic (message_service, group_service)
├── run.py              # Uvicorn entry point
├── requirements.txt
└── .env.example
```

**Stack:** Python 3.11+, FastAPI, SQLite, SQLAlchemy 2.0, Pydantic v2, JWT (python-jose), bcrypt (passlib)

---

## Quick Start

```bash
# 1. Create and activate virtual environment
python -m venv venv

# Windows
venv\Scripts\activate
# Linux / macOS
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Copy and configure environment
copy .env.example .env        # Windows
cp .env.example .env          # Linux/macOS

# 4. Run the server
python run.py
```

Server starts at **http://localhost:8000**
Interactive docs at **http://localhost:8000/docs**

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | `change-this...` | JWT signing secret — **change in production** |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Token lifetime (24 h) |
| `DATABASE_URL` | `sqlite:///./whatsapp_platform.db` | SQLAlchemy DB URL |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `DEBUG` | `false` | Enable debug logging & auto-reload |

---

## Authentication Flow

```
POST /api/v1/auth/register   →  creates user, returns UserOut
POST /api/v1/auth/login      →  returns { access_token, token_type }
GET  /api/v1/auth/me         →  returns current user (requires Bearer token)
```

All other endpoints require `Authorization: Bearer <token>` header.

---

## API Reference

### Auth

```bash
# Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"changeme"}'

# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}'
# → {"access_token":"eyJ...","token_type":"bearer"}

# Store token
TOKEN="eyJ..."
```

### Messages

```bash
# Push a message (from scraper)
curl -X POST http://localhost:8000/api/v1/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "playwright",
    "contact": "College Project Team",
    "sender": "Arun Kumar",
    "receiver": "Me",
    "text": "Tomorrow submit the PPT",
    "timestamp": "2026-05-18T10:30:00Z",
    "direction": "incoming",
    "category": "group",
    "tags": ["whatsapp", "group"],
    "priority": "normal"
  }'

# List messages with filters
curl "http://localhost:8000/api/v1/messages?category=group&search=PPT&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"

# Star a message
curl -X PATCH http://localhost:8000/api/v1/messages/1/star \
  -H "Authorization: Bearer $TOKEN"

# Archive a message
curl -X PATCH http://localhost:8000/api/v1/messages/1/archive \
  -H "Authorization: Bearer $TOKEN"

# Soft-delete
curl -X DELETE http://localhost:8000/api/v1/messages/1 \
  -H "Authorization: Bearer $TOKEN"

# Restore deleted message
curl -X PATCH http://localhost:8000/api/v1/messages/1/restore \
  -H "Authorization: Bearer $TOKEN"
```

### Groups

```bash
# Create / update group
curl -X POST http://localhost:8000/api/v1/groups \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "group_name": "College Project Team",
    "description": "Final year project discussion",
    "participants": [{"name":"Arun","phone":"+91xxxxxxxxxx"}],
    "admins": [{"name":"Arun","phone":"+91xxxxxxxxxx"}],
    "source": "playwright"
  }'

# List groups
curl http://localhost:8000/api/v1/groups \
  -H "Authorization: Bearer $TOKEN"
```

### Statistics

```bash
curl http://localhost:8000/api/v1/stats/dashboard \
  -H "Authorization: Bearer $TOKEN"
```

---

## Message Filtering Query Parameters

| Param | Type | Description |
|---|---|---|
| `contact` | string | Filter by contact name (partial match) |
| `source` | string | `playwright` or `puppeteer` |
| `category` | string | `personal`, `group`, `broadcast` |
| `priority` | string | `low`, `normal`, `high`, `urgent` |
| `search` | string | Full-text search across text/contact/sender/subject |
| `tags` | string | Comma-separated tag filter |
| `is_starred` | bool | Filter starred messages |
| `is_archived` | bool | Filter archived messages |
| `include_deleted` | bool | Include soft-deleted messages |
| `start_date` | ISO datetime | Messages after this date |
| `end_date` | ISO datetime | Messages before this date |
| `page` | int | Page number (default 1) |
| `limit` | int | Items per page (default 50, max 500) |
| `sort` | string | `asc` or `desc` by timestamp |

---

## Docker

```bash
docker-compose up --build
```

API available at http://localhost:8000
