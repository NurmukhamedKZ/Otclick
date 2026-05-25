from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class BlacklistCreate(BaseModel):
    employer_id: str
    employer_name: str | None = None
    reason: str | None = "manual"


class BlacklistResponse(BaseModel):
    id: str
    employer_id: str
    employer_name: str | None = None
    reason: str | None = None
    created_at: datetime | None = None
