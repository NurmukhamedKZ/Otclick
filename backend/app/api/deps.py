import asyncio

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db.supabase import anon_client

bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    """Validate Supabase JWT → return user_id (uuid string)."""
    loop = asyncio.get_running_loop()
    try:
        # anon_client is a sync Supabase client — run in executor to avoid blocking event loop
        res = await loop.run_in_executor(None, anon_client.auth.get_user, creds.credentials)
    except Exception as ex:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"invalid token: {ex}",
        ) from ex
    user = getattr(res, "user", None)
    if user is None or not getattr(user, "id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token: no user",
        )
    return user.id
