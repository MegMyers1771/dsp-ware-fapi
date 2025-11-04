from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse
from typing import List
from app.routers import items, tabs, boxes, tags, field
from . import database, models, schemas
from pathlib import Path
import os

app = FastAPI(title="DSP-Ware API")
app.include_router(items.router)
# --- UI (Frontend) ---
ui_path = Path(__file__).parent.parent / "frontend"
# 1️⃣ Раздаём /ui/api.js и другие статические файлы
# app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

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
app.include_router(tabs.router)
app.include_router(boxes.router)
app.include_router(items.router)
app.include_router(tags.router)
app.include_router(field.router)

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))