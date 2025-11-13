from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse
from typing import List
from app.routers import items, tabs, boxes, tags, field, statuses, issues, auth, users
from . import database, models, schemas
from pathlib import Path
import os

app = FastAPI(title="DSP-Ware API")
# --- UI (Frontend) ---
ui_path = Path(__file__).parent.parent / "frontend"
# 1️⃣ Раздаём /ui/api.js и другие статические файлы
# app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

if os.getenv("AUTO_CREATE_TABLES") == "1":
    models.Base.metadata.create_all(bind=database.engine)

# Разрешаем CORS (чтобы фронт мог обращаться к API)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # позже можно ограничить
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.get("/history")
async def serve_history():
    return FileResponse(os.path.join(FRONTEND_DIR, "history.html"))
