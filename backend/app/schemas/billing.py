from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SubscribeResponse(BaseModel):
    """Config the frontend passes to the CloudPayments JS widget.

    publicId is safe to expose; the widget tokenizes the card client-side and the
    recurrent block tells CloudPayments to charge every period automatically."""

    public_id: str
    amount: int
    currency: str
    description: str
    account_id: str  # = user_id, echoed back in webhooks as AccountId
    invoice_id: str
    interval: str
    period: int


class PaymentEntry(BaseModel):
    provider_payment_id: str
    amount: int | None = None
    status: str
    created_at: datetime | None = None


class BillingStatusResponse(BaseModel):
    plan: str
    trial_ends: datetime | None = None
    plan_expires_at: datetime | None = None
    next_charge_at: datetime | None = None
    has_access: bool = False  # plan currently grants worker access (trial/paid window)
    history: list[PaymentEntry]
