from fastapi import FastAPI

from app.api.router import api_router
from app.db.supabase import service_client

app = FastAPI(title="AIautoclicker API", version="0.1.0")
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
