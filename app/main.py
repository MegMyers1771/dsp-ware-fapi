from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from app.config import (
    API_BASE_URL,
    FRONTEND_DIR,
    UI_PATH
)
from app.routers import (
    items,
    tabs,
    boxes,
    tags,
    field,
    statuses,
    issues,
    auth,
    users,
    parser,
    system,
)
from . import database, models

import os
import json
import logging
from starlette.middleware.base import BaseHTTPMiddleware

NO_CACHE_EXTS = (".js", ".css", ".html", ".htm")

app = FastAPI(title="DSP-Ware API")
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # позже можно ограничить
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if os.getenv("AUTO_CREATE_TABLES") == "1":
    models.Base.metadata.create_all(bind=database.engine)


logging.getLogger("sqlalchemy.engine.Engine").disabled = True

if os.getenv("DEV_NO_CACHE") == "1":

    @app.middleware("http")
    async def disable_static_cache(request, call_next):
        response = await call_next(request)
        path = request.url.path.lower()
        if path.startswith("/static") and path.endswith(NO_CACHE_EXTS):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"
        return response

# подключаем роутеры
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tabs.router)
app.include_router(boxes.router)
app.include_router(items.router)
app.include_router(tags.router)
app.include_router(field.router)
app.include_router(statuses.router)
app.include_router(issues.router)
app.include_router(parser.router)
app.include_router(system.router)


def _build_frontend_config() -> dict:
    return {
        "API_URL": API_BASE_URL,
    }

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.get("/history")
async def serve_history():
    return FileResponse(os.path.join(FRONTEND_DIR, "history.html"))


@app.get("/parser")
async def serve_parser():
    return FileResponse(os.path.join(FRONTEND_DIR, "parser.html"))

@app.get("/instruction")
async def serve_instruction():
    return FileResponse(os.path.join(FRONTEND_DIR, "instruction.html"))


@app.get("/config.js")
async def serve_frontend_config():
    payload = json.dumps(_build_frontend_config())
    content = f"window.__APP_CONFIG = Object.freeze({payload});"
    return Response(content=content, media_type="application/javascript")
