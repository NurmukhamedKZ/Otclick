"""hh OAuth onboarding: Playwright job manager + Fernet + Supabase writes."""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from app.config import settings
from app.db.supabase import service_client
from app.hh.authorize import get_auth_code
from app.hh.client import ApiClient, OAuthClient
from app.hh.user_agent import generate_android_useragent

logger = logging.getLogger(__name__)

JobStatus = Literal["running", "captcha_required", "success", "failed"]


@dataclass
class JobState:
    user_id: str
    status: JobStatus = "running"
    captcha_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    screenshot_url: str | None = None
    error: str | None = None


_jobs: dict[str, JobState] = {}


def encrypt_token(plain: str) -> str:
    return settings.fernet.encrypt(plain.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    return settings.fernet.decrypt(encrypted.encode()).decode()


def get_job(job_id: str) -> JobState | None:
    return _jobs.get(job_id)


async def start_connect_job(user_id: str, username: str, password: str) -> str:
    job_id = str(uuid.uuid4())
    state = JobState(user_id=user_id)
    _jobs[job_id] = state
    asyncio.create_task(_run_oauth(job_id, username, password))
    return job_id


async def solve_captcha(job_id: str, solution: str) -> None:
    state = _jobs.get(job_id)
    if not state:
        raise KeyError(f"job {job_id} not found")
    await state.captcha_queue.put(solution)


async def _run_oauth(job_id: str, username: str, password: str) -> None:
    state = _jobs[job_id]
    try:
        async def on_captcha(screenshot_png: bytes) -> str:
            state.status = "captcha_required"
            path = f"{state.user_id}/{job_id}.png"
            service_client.storage.from_("captcha-screenshots").upload(
                path, screenshot_png,
                {"content-type": "image/png", "upsert": "true"},
            )
            signed = service_client.storage.from_(
                "captcha-screenshots"
            ).create_signed_url(path, 600)
            state.screenshot_url = signed.get("signedURL") or signed.get("signedUrl")
            solution = await state.captcha_queue.get()
            state.status = "running"
            return solution

        code = await get_auth_code(username, password, on_captcha=on_captcha)
        token = _exchange_and_fetch_user(code)
        _persist_credentials(state.user_id, token["access_token"],
                             token["refresh_token"],
                             token["access_expires_at"],
                             token["hh_user_id"])
        state.status = "success"
    except Exception as ex:
        logger.exception("hh oauth job %s failed", job_id)
        state.status = "failed"
        state.error = str(ex)


def _exchange_and_fetch_user(code: str) -> dict:
    ua = generate_android_useragent()
    oauth = OAuthClient(user_agent=ua)
    tok = oauth.authenticate(code)
    api = ApiClient(
        user_agent=ua,
        access_token=tok["access_token"],
        refresh_token=tok["refresh_token"],
        access_expires_at=tok["access_expires_at"],
    )
    me = api.get("me")
    return {
        "access_token": tok["access_token"],
        "refresh_token": tok["refresh_token"],
        "access_expires_at": tok["access_expires_at"],
        "hh_user_id": str(me["id"]),
    }


def _persist_credentials(user_id: str, access: str, refresh: str,
                         expires_at: int, hh_user_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    service_client.table("hh_credentials").upsert({
        "user_id": user_id,
        "access_token_encrypted": encrypt_token(access),
        "refresh_token_encrypted": encrypt_token(refresh),
        "expires_at": datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat(),
        "hh_user_id": hh_user_id,
        "last_refreshed_at": now,
    }).execute()


def get_credentials_status(user_id: str) -> dict:
    res = service_client.table("hh_credentials").select(
        "expires_at,last_refreshed_at,hh_user_id"
    ).eq("user_id", user_id).maybe_single().execute()
    data = res.data if res else None
    if not data:
        return {"connected": False}
    return {
        "connected": True,
        "expires_at": data.get("expires_at"),
        "last_refreshed_at": data.get("last_refreshed_at"),
        "hh_user_id": data.get("hh_user_id"),
    }


def disconnect(user_id: str) -> None:
    service_client.table("hh_credentials").delete().eq("user_id", user_id).execute()
