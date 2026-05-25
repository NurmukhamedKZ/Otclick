from fastapi import APIRouter

from app.api import auth, captcha, filters, internal, resumes, worker
from app.api import _debug
from app.config import settings

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(resumes.router)
api_router.include_router(filters.router)
api_router.include_router(worker.router)
api_router.include_router(captcha.router)
api_router.include_router(internal.router)

if settings.DEBUG_ENDPOINTS:
    api_router.include_router(_debug.router)
