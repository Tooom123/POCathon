from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.api.auth import router as auth_router
from server.api.shop import router as shop_router
from server.api.user import router as user_router
from server.api.webhook import router as webhook_router
from server.storage.db import get_connection


@asynccontextmanager
async def lifespan(application: FastAPI):
    application.state.db = get_connection()
    yield
    application.state.db.close()


app = FastAPI(title="App Tracker Server", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook_router)
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(shop_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check."""
    return {"status": "ok"}


def run() -> None:
    """Entry point for the `tracker-server` CLI script."""
    uvicorn.run("server.main:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":
    run()
