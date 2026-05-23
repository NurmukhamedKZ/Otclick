from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator


class FilterCreate(BaseModel):
    resume_id: str | None = None
    text: str | None = None
    area: int | None = None
    salary_min: int | None = Field(default=None, ge=0)
    experience: str | None = None
    schedule: str | None = None
    employment: str | None = None
    professional_role: list[int] | None = None
    excluded_regex: str | None = None
    enabled: bool = True


class FilterUpdate(BaseModel):
    resume_id: str | None = None
    text: str | None = None
    area: int | None = None
    salary_min: int | None = Field(default=None, ge=0)
    experience: str | None = None
    schedule: str | None = None
    employment: str | None = None
    professional_role: list[int] | None = None
    excluded_regex: str | None = None
    enabled: bool | None = None

    @model_validator(mode="after")
    def _at_least_one(self):
        if not self.model_dump(exclude_unset=True):
            raise ValueError("at least one field required")
        return self


class FilterResponse(BaseModel):
    id: str
    resume_id: str | None = None
    text: str | None = None
    area: int | None = None
    salary_min: int | None = None
    experience: str | None = None
    schedule: str | None = None
    employment: str | None = None
    professional_role: list[int] | None = None
    excluded_regex: str | None = None
    enabled: bool = True
    created_at: datetime | None = None


class VacancyPreviewItem(BaseModel):
    id: str | None = None
    name: str | None = None
    employer: str | None = None
    area: str | None = None
    salary: dict[str, Any] | None = None
    url: str | None = None


class FilterPreviewResponse(BaseModel):
    found: int
    items: list[VacancyPreviewItem]
