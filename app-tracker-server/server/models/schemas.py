from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class SessionPayload(BaseModel):
    app: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=50)
    started_at: datetime
    ended_at: datetime
    duration: int = Field(gt=0, description="Duration in seconds")

    @model_validator(mode="after")
    def validate_times(self) -> "SessionPayload":
        if self.ended_at <= self.started_at:
            raise ValueError("ended_at must be after started_at")
        expected = int((self.ended_at - self.started_at).total_seconds())
        if abs(expected - self.duration) > 5:
            raise ValueError(
                f"duration {self.duration}s does not match timestamps ({expected}s)"
            )
        return self


class ReportPayload(BaseModel):
    user_id: UUID
    sessions: list[SessionPayload] = Field(min_length=1, max_length=100)


class RejectedSession(BaseModel):
    app: str
    started_at: datetime
    ended_at: datetime
    reason: str


class IngestResponse(BaseModel):
    accepted: int
    rejected: list[RejectedSession]
