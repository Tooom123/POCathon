from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from server.api.auth import router as auth_router
from server.api.webhook import router as webhook_router
from server.storage.db import get_connection


@asynccontextmanager
async def lifespan(application: FastAPI):
    application.state.db = get_connection()
    yield
    application.state.db.close()


app = FastAPI(title="App Tracker Server", version="0.1.0", lifespan=lifespan)
app.include_router(webhook_router)
app.include_router(auth_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check."""
    return {"status": "ok"}


def run() -> None:
    """Entry point for the `tracker-server` CLI script."""
    uvicorn.run("server.main:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":
    run()
