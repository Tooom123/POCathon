import sqlite3

from fastapi import APIRouter, Depends, Request

from server.ingestion.pipeline import ingest_report
from server.models.schemas import IngestResponse, ReportPayload

router = APIRouter(prefix="/webhook", tags=["webhook"])


def _get_conn(request: Request) -> sqlite3.Connection:
    return request.app.state.db


@router.post("/report", response_model=IngestResponse, status_code=200)
def receive_report(
    payload: ReportPayload,
    conn: sqlite3.Connection = Depends(_get_conn),
) -> IngestResponse:
    """Receive a batch of sessions from a client and persist valid ones."""
    return ingest_report(conn, payload)
