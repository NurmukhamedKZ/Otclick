"""Load/persist user's hh API credentials (decrypt → ApiClient → re-encrypt on refresh)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.db.supabase import service_client
from app.hh.client import ApiClient
from app.hh.user_agent import generate_android_useragent
from app.services.hh_auth import decrypt_token, encrypt_token

logger = logging.getLogger(__name__)


def _load_row(user_id: str) -> dict:
    res = (
        service_client.table("hh_credentials")
        .select("access_token_encrypted,refresh_token_encrypted,expires_at")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    data = res.data if res else None
    if not data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="hh account not connected",
        )
    return data


def _build_client(row: dict) -> ApiClient:
    expires_at = row.get("expires_at")
    if isinstance(expires_at, str):
        expires_ts = int(datetime.fromisoformat(expires_at).timestamp())
    else:
        expires_ts = 0
    return ApiClient(
        user_agent=generate_android_useragent(),
        access_token=decrypt_token(row["access_token_encrypted"]),
        refresh_token=decrypt_token(row["refresh_token_encrypted"]),
        access_expires_at=expires_ts,
    )


def _persist_refreshed(user_id: str, client: ApiClient) -> None:
    service_client.table("hh_credentials").update({
        "access_token_encrypted": encrypt_token(client.access_token),
        "refresh_token_encrypted": encrypt_token(client.refresh_token),
        "expires_at": datetime.fromtimestamp(
            client.access_expires_at, tz=timezone.utc
        ).isoformat(),
        "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("user_id", user_id).execute()


async def load_api_client(user_id: str) -> ApiClient:
    """Build ApiClient from stored creds. Persists tokens if ApiClient auto-refreshes."""
    loop = asyncio.get_running_loop()
    row = await loop.run_in_executor(None, _load_row, user_id)
    return await loop.run_in_executor(None, _build_client, row)


async def persist_if_refreshed(
    user_id: str, client: ApiClient, original_access: str
) -> None:
    if client.access_token != original_access:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _persist_refreshed, user_id, client)
