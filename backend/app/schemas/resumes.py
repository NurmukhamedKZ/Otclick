from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ResumeResponse(BaseModel):
    id: str
    hh_resume_id: str
    title: str | None = None
    status: str | None = None
    synced_at: datetime | None = None


class ResumesListResponse(BaseModel):
    items: list[ResumeResponse]
