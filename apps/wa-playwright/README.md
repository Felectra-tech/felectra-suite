# wa-playwright — WhatsApp Web Automation (Playwright)

Automates WhatsApp Web using Microsoft Playwright (Chromium). Scrapes personal and group chats and pushes all data to the FastAPI backend.

---

## Features

- QR code login with terminal display
- Persistent session (no re-scan after first login)
- Reads personal chats and group chats
- Extracts sender, receiver, text, timestamp, direction
- Extracts group participants, admins, and description
- Sends messages programmatically
- Pushes all data to the FastAPI backend via JWT-authenticated HTTP
- Real-time polling for new messages
- Deduplication (no duplicate pushes)
- Retry logic on failures
- Structured logging

---

## Quick Start

```bash
# 1. Install Node dependencies
npm install

# 2. Install Chromium browser
npm run install:browsers

# 3. Configure environment
copy .env.example .env      # Windows
cp .env.example .env        # Linux/macOS

# Edit .env — set API_USERNAME and API_PASSWORD to match your backend user

# 4. Start (make sure backend is running first)
npm start
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `API_BASE_URL` | `http://localhost:8000/api/v1` | Backend API URL |
| `API_USERNAME` | `admin` | Backend login username |
| `API_PASSWORD` | `changeme` | Backend login password |
| `SESSION_DIR` | `./session` | Chromium persistent session directory |
| `WA_URL` | `https://web.whatsapp.com` | WhatsApp Web URL |
| `HEADLESS` | `false` | Run browser headless (set `true` for servers) |
| `POLL_INTERVAL` | `5000` | Polling interval in ms |
| `CHAT_SCAN_LIMIT` | `20` | Number of chats to scan on startup |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `TEST_SEND_CONTACT` | — | If set, sends a test message to this contact |
| `TEST_SEND_MESSAGE` | — | Text for the test message |

---

## How It Works

1. **Launch** — Chromium opens with a persistent profile (`SESSION_DIR`)
2. **Login** — If no session, displays QR in terminal; waits for scan
3. **Scan** — Opens each chat, extracts messages, detects personal vs group
4. **Group info** — For groups, extracts participant list + admins
5. **Push** — All messages and groups sent to FastAPI backend
6. **Poll** — Continues watching the active chat for new messages

---

## Module Overview

| File | Responsibility |
|---|---|
| `src/auth.js` | Browser launch, QR login, session restore |
| `src/scraper.js` | List chats, open chats, extract personal messages |
| `src/group-scraper.js` | Extract group messages, participants, admins |
| `src/sender.js` | Send messages, record outgoing for backend |
| `src/api-client.js` | JWT auth, pushMessage, pushGroup |
| `src/logger.js` | Structured console logger |
| `src/index.js` | Orchestrator: scan → push → poll |

---

## Troubleshooting

**QR not showing in terminal**
— Make sure `HEADLESS=false` so you can see the browser window directly.

**Login keeps asking for QR**
— Delete the `./session` directory and re-scan.

**Messages not reaching backend**
— Verify `API_BASE_URL`, `API_USERNAME`, `API_PASSWORD` in `.env` match the backend.

**Chromium won't launch on Linux server**
— Add `HEADLESS=true` and ensure these packages are installed:
```bash
sudo apt-get install -y libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1
```
