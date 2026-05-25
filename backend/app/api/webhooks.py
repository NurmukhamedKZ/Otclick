"""Public payment webhooks. No JWT — authenticated by HMAC over the raw body.

Point the CloudPayments **Pay** notification URL here (initial + recurring charges
both arrive as Pay). Other notification types (Check/Fail/Refund) should use their
own URLs or stay disabled — this handler activates a plan on every HMAC-valid
payment and relies on TransactionId for idempotency.
"""

from __future__ import annotations

import asyncio
import json
import logging
from urllib.parse import parse_qs

from fastapi import APIRouter, HTTPException, Request, status

from app.services import billing as billing_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def _parse_fields(raw: bytes, content_type: str) -> dict[str, str]:
    """CloudPayments sends form-urlencoded by default, JSON if configured."""
    if "application/json" in content_type:
        try:
            data = json.loads(raw or b"{}")
            return {k: str(v) for k, v in data.items()}
        except (ValueError, AttributeError):
            return {}
    parsed = parse_qs(raw.decode("utf-8", "replace"), keep_blank_values=True)
    return {k: v[0] for k, v in parsed.items()}


@router.post("/cloudpayments")
async def cloudpayments(request: Request):
    raw = await request.body()
    header_hmac = request.headers.get("Content-HMAC") or request.headers.get(
        "X-Content-HMAC"
    )
    if not billing_service.verify_hmac(raw, header_hmac):
        logger.warning("cp webhook bad HMAC")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="bad hmac")

    fields = _parse_fields(raw, request.headers.get("content-type", ""))

    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, billing_service.process_payment, fields)
    except Exception:  # noqa: BLE001 — never 500 to CP, it would retry forever
        logger.exception("cp webhook processing failed")
        return {"code": 13}  # CP: retry later
    return {"code": 0}
