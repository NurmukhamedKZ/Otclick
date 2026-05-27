from __future__ import annotations

from pydantic import BaseModel


class SendDraftRequest(BaseModel):
    message: str | None = None


class OkResponse(BaseModel):
    ok: bool = True
