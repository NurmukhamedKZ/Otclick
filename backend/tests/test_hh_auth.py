import asyncio
import os

import pytest

# Set required env BEFORE importing app modules
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault(
    "FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc="
)


def test_encrypt_decrypt_roundtrip():
    from app.services.hh_auth import decrypt_token, encrypt_token

    plain = "USER_TOKEN_abc123"
    enc = encrypt_token(plain)
    assert enc != plain
    assert decrypt_token(enc) == plain


def test_job_state_lifecycle():
    from app.services.hh_auth import JobState, _jobs

    _jobs.clear()
    job_id = "test-job-id"
    state = JobState(user_id="user-1", status="running")
    _jobs[job_id] = state

    assert _jobs[job_id].status == "running"
    _jobs[job_id].status = "success"
    assert _jobs[job_id].status == "success"
    _jobs.clear()


@pytest.mark.asyncio
async def test_solve_captcha_unblocks_queue():
    from app.services.hh_auth import JobState, _jobs, solve_captcha

    _jobs.clear()
    job_id = "captcha-job"
    state = JobState(user_id="user-1", status="captcha_required")
    _jobs[job_id] = state

    solved = asyncio.create_task(state.captcha_queue.get())
    await solve_captcha(job_id, "abc123")
    result = await asyncio.wait_for(solved, timeout=1.0)
    assert result == "abc123"
    _jobs.clear()
