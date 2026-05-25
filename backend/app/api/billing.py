from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.schemas.billing import BillingStatusResponse, SubscribeResponse
from app.services import billing as billing_service

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.post("/subscribe", response_model=SubscribeResponse)
async def subscribe(user_id: str = Depends(get_current_user)):
    """Return CloudPayments widget params (recurrent). No charge happens here —
    the widget tokenizes the card and CP notifies us via the webhook."""
    return billing_service.subscribe_params(user_id)


@router.post("/cancel")
async def cancel(user_id: str = Depends(get_current_user)):
    return await billing_service.cancel(user_id)


@router.get("/status", response_model=BillingStatusResponse)
async def status(user_id: str = Depends(get_current_user)):
    return await billing_service.get_status(user_id)
