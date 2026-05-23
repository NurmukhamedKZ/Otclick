"""Per-user asyncio.Queue + ApplyJob dataclass for the auto-apply worker."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ApplyJob:
    user_id: str
    resume_id: str
    vacancy_id: str
    filter_id: str | None = None


_queues: dict[str, asyncio.Queue[ApplyJob]] = {}


def get_user_queue(user_id: str) -> asyncio.Queue[ApplyJob]:
    q = _queues.get(user_id)
    if q is None:
        q = asyncio.Queue()
        _queues[user_id] = q
    return q


def drop_user_queue(user_id: str) -> None:
    _queues.pop(user_id, None)


def reset_queues() -> None:
    """Test hook."""
    _queues.clear()
