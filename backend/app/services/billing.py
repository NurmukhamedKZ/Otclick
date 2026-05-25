"""CloudPayments billing: webhook HMAC verify + idempotent payment + plan activate.

Flow: frontend opens the CP widget with params from ``subscribe_params`` (recurrent
flag set). CP charges the card and POSTs a server-to-server notification to
``/api/webhooks/cloudpayments``. We verify the ``Content-HMAC`` header (HMAC-SHA256
over the raw body, base64), then record the payment idempotently (TransactionId →
payments.provider_payment_id UNIQUE) and, on a genuinely new payment, flip the
user's plan to paid. A duplicate webhook hits the UNIQUE conflict and activates
nothing twice.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import logging
import uuid
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.db.supabase import service_client
from app.schemas.billing import (
    BillingStatusResponse,
    PaymentEntry,
    SubscribeResponse,
)

logger = logging.getLogger(__name__)


def verify_hmac(raw_body: bytes, header_hmac: str | None) -> bool:
    """Constant-time check of CloudPayments' Content-HMAC over the raw body."""
    secret = settings.CLOUDPAYMENTS_API_SECRET
    if not secret or not header_hmac:
        return False
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, header_hmac)


def subscribe_params(user_id: str) -> SubscribeResponse:
    invoice_id = uuid.uuid4().hex
    return SubscribeResponse(
        public_id=settings.CLOUDPAYMENTS_PUBLIC_ID,
        amount=settings.PLAN_PRICE,
        currency=settings.PLAN_CURRENCY,
        description=settings.PLAN_NAME,
        account_id=user_id,
        invoice_id=invoice_id,
        interval=settings.PLAN_INTERVAL,
        period=settings.PLAN_PERIOD,
    )


def _period_end(now: datetime) -> datetime:
    """End of the paid period. Month ≈ 30 days (good enough for plan gating)."""
    days = 30 * settings.PLAN_PERIOD if settings.PLAN_INTERVAL == "Month" else settings.PLAN_PERIOD
    return now + timedelta(days=days)


def process_payment(fields: dict[str, str]) -> dict:
    """Handle a CloudPayments Pay/Recurrent notification (sync, runs in executor).

    ``fields`` is the parsed form body. Idempotent on TransactionId. Returns a
    summary dict; the webhook endpoint always answers CP with {"code": 0} once the
    HMAC is valid, regardless of duplicate/unknown-user, so CP stops retrying.
    """
    transaction_id = str(fields.get("TransactionId") or fields.get("Id") or "").strip()
    user_id = (fields.get("AccountId") or "").strip()
    if not transaction_id or not user_id:
        logger.warning("cp webhook missing TransactionId/AccountId: %s", fields)
        return {"status": "ignored", "reason": "missing_ids"}

    amount = _parse_amount(fields.get("Amount"))
    subscription_id = (fields.get("SubscriptionId") or "").strip() or None
    now = datetime.now(timezone.utc)
    expires_at = _period_end(now)

    row = {
        "user_id": user_id,
        "provider_payment_id": transaction_id,
        "amount": amount,
        "provider": "cloudpayments",
        "status": "completed",
        "subscription_id": subscription_id,
        "expires_at": expires_at.isoformat(),
    }
    # ignore_duplicates → data is non-empty only when this row was newly inserted.
    res = (
        service_client.table("payments")
        .upsert(row, on_conflict="provider_payment_id", ignore_duplicates=True)
        .execute()
    )
    if not res.data:
        logger.info("cp webhook duplicate, skipping activation: tx=%s", transaction_id)
        return {"status": "duplicate", "transaction_id": transaction_id}

    _activate_plan(user_id, expires_at, subscription_id)
    logger.info("cp payment activated plan for user=%s tx=%s", user_id, transaction_id)
    return {"status": "activated", "user_id": user_id, "transaction_id": transaction_id}


def _parse_amount(raw: str | None) -> int | None:
    if raw is None:
        return None
    try:
        return int(round(float(raw)))
    except (TypeError, ValueError):
        return None


def _activate_plan(user_id: str, expires_at: datetime, subscription_id: str | None) -> None:
    update = {
        "plan": "active",
        "plan_expires_at": expires_at.isoformat(),
    }
    if subscription_id:
        update["cp_subscription_id"] = subscription_id
    service_client.table("profiles").update(update).eq("id", user_id).execute()


async def get_status(user_id: str) -> BillingStatusResponse:
    loop = asyncio.get_running_loop()

    def _profile():
        return (
            service_client.table("profiles")
            .select("plan,trial_ends,plan_expires_at")
            .eq("id", user_id)
            .single()
            .execute()
        )

    def _payments():
        return (
            service_client.table("payments")
            .select("provider_payment_id,amount,status,created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )

    prof_res, pay_res = await asyncio.gather(
        loop.run_in_executor(None, _profile),
        loop.run_in_executor(None, _payments),
    )
    prof = prof_res.data or {}
    plan_expires = prof.get("plan_expires_at")
    return BillingStatusResponse(
        plan=prof.get("plan") or "trial",
        trial_ends=prof.get("trial_ends"),
        plan_expires_at=plan_expires,
        # Widget-recurrent: next charge ≈ end of current paid period.
        next_charge_at=plan_expires if (prof.get("plan") == "active") else None,
        history=[PaymentEntry(**p) for p in (pay_res.data or [])],
    )


async def cancel(user_id: str) -> dict:
    """Mark the plan cancelled locally. Access stays until plan_expires_at.

    MVP: actual CloudPayments subscription stop is handled manually via support
    (Subscriptions REST API not wired — see MVP_PLAN day 19). We only flip local
    state so the user stops being billed at the app level after period end."""
    loop = asyncio.get_running_loop()

    def _update():
        return (
            service_client.table("profiles")
            .update({"plan": "cancelled"})
            .eq("id", user_id)
            .execute()
        )

    await loop.run_in_executor(None, _update)
    logger.info("plan cancelled (local) for user=%s", user_id)
    return {"status": "cancelled"}
