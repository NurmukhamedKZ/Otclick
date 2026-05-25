"""Internal cron endpoints. Guarded by X-Internal-Token (shared secret), not JWT.

Trigger from system cron, e.g. daily:
  curl -fsS -X POST http://127.0.0.1:8000/internal/cron/refresh-tokens \
    -H "X-Internal-Token: $INTERNAL_CRON_TOKEN"
"""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, status

from app.config import settings
from app.services import token_refresh

router = APIRouter(prefix="/internal/cron", tags=["internal"])


def _require_internal_token(x_internal_token: str | None) -> None:
    expected = settings.INTERNAL_CRON_TOKEN
    if not expected or x_internal_token != expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="invalid internal token",
        )


@router.post("/refresh-tokens")
async def refresh_tokens(x_internal_token: str | None = Header(default=None)):
    """Refresh hh tokens expiring within REFRESH_THRESHOLD_DAYS."""
    _require_internal_token(x_internal_token)
    return await token_refresh.refresh_due()
