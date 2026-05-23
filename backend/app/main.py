from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import settings
from app.db.supabase import service_client

app = FastAPI(title="AIautoclicker API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health():
    db_ok = False
    try:
        service_client.table("profiles").select("id").limit(1).execute()
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok", "db": db_ok}
