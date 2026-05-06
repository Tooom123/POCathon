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


class CoinsBalance(BaseModel):
    user_id: str
    coins: float           # true balance (productivity + pets - spent)
    productive_seconds: int
    income_per_sec: float  # current passive income rate from owned pets


class UserProfile(BaseModel):
    user_id: str
    balance: float
    earned_productivity: float
    earned_pets: float
    earned_decors: float
    spent_pets: float
    spent_decors: float
    spent_island: float
    productive_seconds: int
    income_per_sec: float
    pets: list[str]
    decors: list[str]
    island_level: int
    island_capacity: int
    island_decor_capacity: int
    island_upgrade_cost: float | None


class IslandInfo(BaseModel):
    level: int
    capacity: int
    decor_capacity: int
    upgrade_cost: float | None
    pets_count: int
    decors_count: int
    balance: float


class ShopDecor(BaseModel):
    id: str
    name: str
    emoji: str
    cost: float
    income_per_sec: float
    unlock_seconds: int
    count: int       # how many the user already owns
    unlocked: bool
    can_buy: bool    # balance OK and decor slots available


class IslandUpgradeResponse(BaseModel):
    level: int
    capacity: int
    upgrade_cost: float | None
    balance: float


class ShopAnimal(BaseModel):
    id: str
    name: str
    emoji: str
    cost: float
    income_per_sec: float
    rarity: str
    unlock_seconds: int
    owned: bool
    unlocked: bool         # user has enough productive_seconds
    can_afford: bool       # balance OK, not owned, island not full


class BuyResponse(BaseModel):
    animal_id: str
    balance: float         # updated balance after purchase
