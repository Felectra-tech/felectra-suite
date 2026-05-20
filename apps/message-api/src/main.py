import logging
import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from src.core.config import settings
from src.core.database import init_db
from src.api.routes import auth, messages, groups, stats

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


# ── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s v%s", settings.APP_NAME, settings.APP_VERSION)
    init_db()
    # Ensure all download subfolders exist on startup
    media_root = os.path.abspath(settings.MEDIA_DIR)
    for sub in ("images", "audio", "videos", "documents", "stickers", "contacts", "others"):
        os.makedirs(os.path.join(media_root, sub), exist_ok=True)
    logger.info("Media directory ready: %s", media_root)
    yield
    logger.info("Shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Production-ready WhatsApp Automation Platform API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(messages.router, prefix=API_PREFIX)
app.include_router(groups.router, prefix=API_PREFIX)
app.include_router(stats.router, prefix=API_PREFIX)

# ── Static media serving ─────────────────────────────────────────────────────
# Downloaded files accessible at: GET /media/<subfolder>/<filename>
# Example: http://127.0.0.1:8000/media/images/20260519_Contact_abc12345.jpg
_media_root = os.path.abspath(settings.MEDIA_DIR)
os.makedirs(_media_root, exist_ok=True)
app.mount("/media", StaticFiles(directory=_media_root), name="media")


@app.get("/", tags=["Health"])
def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy"}
