# wa-puppeteer — WhatsApp Web Automation (Puppeteer)

Automates WhatsApp Web using Google Puppeteer (Chromium). Functionally identical to `wa-playwright` but uses the Puppeteer API. Run one or both simultaneously against the same backend.

---

## Features

- QR code login with terminal display
- Persistent session via `userDataDir`
- Reads personal and group chats
- Extracts sender, receiver, text, timestamp, direction
- Extracts group participants, admins, description
- Sends messages programmatically
- Pushes all data to FastAPI backend (JWT-authenticated)
- Real-time polling loop
- Deduplication and retry logic
- Structured logging

---

## Quick Start

```bash
npm install

copy .env.example .env      # Windows
cp .env.example .env        # Linux/macOS

npm start
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `API_BASE_URL` | `http://localhost:8000/api/v1` | Backend API URL |
| `API_USERNAME` | `admin` | Backend username |
| `API_PASSWORD` | `changeme` | Backend password |
| `SESSION_DIR` | `./session` | Chromium user data directory |
| `WA_URL` | `https://web.whatsapp.com` | WhatsApp Web URL |
| `HEADLESS` | `false` | Run headless |
| `POLL_INTERVAL` | `5000` | Polling interval in ms |
| `CHAT_SCAN_LIMIT` | `20` | Chats to scan on startup |
| `LOG_LEVEL` | `info` | Log verbosity |
| `TEST_SEND_CONTACT` | — | Optional test message recipient |
| `TEST_SEND_MESSAGE` | — | Optional test message text |

---

## Module Overview

| File | Responsibility |
|---|---|
| `src/auth.js` | Browser launch, QR login, session restore, `sleep()` helper |
| `src/scraper.js` | List/open chats, extract personal messages |
| `src/group-scraper.js` | Extract group messages, participants, admins |
| `src/sender.js` | Send messages, record for backend |
| `src/api-client.js` | JWT auth, pushMessage, pushGroup |
| `src/logger.js` | Structured console logger |
| `src/index.js` | Orchestrator: scan → push → poll |

---

## Playwright vs Puppeteer

Both clients are functionally equivalent and push to the same backend. The `source` field in each message distinguishes them (`"playwright"` vs `"puppeteer"`). You can run both simultaneously from different machines or user sessions.

---

## Troubleshooting

**Session not persisting**
— Check `SESSION_DIR` path in `.env` and ensure the directory is writable.

**Puppeteer can't find Chrome**
— Puppeteer bundles its own Chromium. If that fails, set `PUPPETEER_EXECUTABLE_PATH` to your Chrome binary path.

**Linux server (no display)**
— Set `HEADLESS=true`. Install required libs:
```bash
sudo apt-get install -y chromium-browser libgconf-2-4 libxss1
```
