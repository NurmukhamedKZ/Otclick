from __future__ import annotations

from typing import TypedDict


class AccessToken(TypedDict):
    access_token: str
    refresh_token: str
    access_expires_at: int  # Unix timestamp
