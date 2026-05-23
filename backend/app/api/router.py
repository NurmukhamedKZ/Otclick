from fastapi import APIRouter

from app.api import auth, filters, resumes, worker

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(resumes.router)
api_router.include_router(filters.router)
api_router.include_router(worker.router)
