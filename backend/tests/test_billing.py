import base64
import hashlib
import hmac
import os
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")

SECRET = "cp-secret"


def _fluent(final_data):
    chain = MagicMock()
    for m in ("select", "insert", "update", "upsert", "delete", "eq", "order", "limit", "single"):
        getattr(chain, m).return_value = chain
    chain.execute.return_value = SimpleNamespace(data=final_data)
    return chain


def _sign(body: bytes, secret: str = SECRET) -> str:
    return base64.b64encode(
        hmac.new(secret.encode(), body, hashlib.sha256).digest()
    ).decode()


# ─── HMAC ────────────────────────────────────────────────────

def test_verify_hmac_valid():
    from app.services import billing

    body = b"TransactionId=1&Amount=999&AccountId=u1"
    with patch.object(billing.settings, "CLOUDPAYMENTS_API_SECRET", SECRET):
        assert billing.verify_hmac(body, _sign(body)) is True


def test_verify_hmac_wrong_signature():
    from app.services import billing

    body = b"TransactionId=1"
    with patch.object(billing.settings, "CLOUDPAYMENTS_API_SECRET", SECRET):
        assert billing.verify_hmac(body, _sign(body, "other")) is False


def test_verify_hmac_missing_secret_or_header():
    from app.services import billing

    body = b"x"
    with patch.object(billing.settings, "CLOUDPAYMENTS_API_SECRET", ""):
        assert billing.verify_hmac(body, _sign(body)) is False
    with patch.object(billing.settings, "CLOUDPAYMENTS_API_SECRET", SECRET):
        assert billing.verify_hmac(body, None) is False


# ─── process_payment ─────────────────────────────────────────

def _table_router(payments_chain, profiles_chain):
    def _route(name):
        return payments_chain if name == "payments" else profiles_chain
    return _route


def test_process_payment_new_activates_plan():
    from app.services import billing

    payments = _fluent([{"id": "p1"}])  # newly inserted → non-empty
    profiles = _fluent([{"id": "u1"}])
    with patch.object(
        billing.service_client, "table", side_effect=_table_router(payments, profiles)
    ):
        out = billing.process_payment(
            {"TransactionId": "tx1", "AccountId": "u1", "Amount": "999", "SubscriptionId": "sc1"}
        )
    assert out["status"] == "activated"
    # plan activation issued an update on profiles
    profiles.update.assert_called_once()
    update_arg = profiles.update.call_args[0][0]
    assert update_arg["plan"] == "active"
    assert update_arg["cp_subscription_id"] == "sc1"
    profiles.eq.assert_any_call("id", "u1")


def test_process_payment_duplicate_skips_activation():
    from app.services import billing

    payments = _fluent([])  # ignore_duplicates → conflict returns no rows
    profiles = _fluent([{"id": "u1"}])
    with patch.object(
        billing.service_client, "table", side_effect=_table_router(payments, profiles)
    ):
        out = billing.process_payment(
            {"TransactionId": "tx1", "AccountId": "u1", "Amount": "999"}
        )
    assert out["status"] == "duplicate"
    profiles.update.assert_not_called()


def test_process_payment_missing_ids_ignored():
    from app.services import billing

    with patch.object(billing.service_client, "table") as t:
        out = billing.process_payment({"Amount": "999"})
    assert out["status"] == "ignored"
    t.assert_not_called()


# ─── status / cancel ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_status_returns_plan_and_history():
    from app.services import billing

    profiles = _fluent({"plan": "active", "trial_ends": None, "plan_expires_at": "2026-06-25T00:00:00+00:00"})
    payments = _fluent([
        {"provider_payment_id": "tx1", "amount": 999, "status": "completed", "created_at": "2026-05-25T00:00:00+00:00"},
    ])
    with patch.object(
        billing.service_client, "table", side_effect=_table_router(payments, profiles)
    ):
        out = await billing.get_status("u1")
    assert out.plan == "active"
    assert out.next_charge_at is not None
    assert len(out.history) == 1
    assert out.history[0].provider_payment_id == "tx1"


@pytest.mark.asyncio
async def test_cancel_sets_plan_cancelled():
    from app.services import billing

    profiles = _fluent([{"id": "u1"}])
    with patch.object(billing.service_client, "table", return_value=profiles):
        out = await billing.cancel("u1")
    assert out["status"] == "cancelled"
    assert profiles.update.call_args[0][0]["plan"] == "cancelled"


# ─── webhook endpoint ────────────────────────────────────────

@pytest.fixture
def client():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api import webhooks

    app = FastAPI()
    app.include_router(webhooks.router)
    return TestClient(app)


def test_webhook_bad_hmac_403(client):
    from app.services import billing

    body = b"TransactionId=tx1&AccountId=u1&Amount=999"
    with patch.object(billing.settings, "CLOUDPAYMENTS_API_SECRET", SECRET):
        res = client.post(
            "/api/webhooks/cloudpayments",
            content=body,
            headers={"Content-Type": "application/x-www-form-urlencoded", "Content-HMAC": "nope"},
        )
    assert res.status_code == 403


def test_webhook_valid_hmac_processes_and_returns_code_0(client):
    from app.services import billing

    body = b"TransactionId=tx1&AccountId=u1&Amount=999"
    with patch.object(billing.settings, "CLOUDPAYMENTS_API_SECRET", SECRET), patch.object(
        billing, "process_payment", return_value={"status": "activated"}
    ) as proc:
        res = client.post(
            "/api/webhooks/cloudpayments",
            content=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-HMAC": _sign(body),
            },
        )
    assert res.status_code == 200
    assert res.json() == {"code": 0}
    fields = proc.call_args[0][0]
    assert fields["TransactionId"] == "tx1"
    assert fields["AccountId"] == "u1"
