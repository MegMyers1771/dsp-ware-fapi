from fastapi import FastAPI
from app.api import router
from app.db import init_db

app = FastAPI(title="Warehouse API")

app.include_router(router, prefix="/api")

@app.on_event("startup")
async def on_startup():
    await init_db()
