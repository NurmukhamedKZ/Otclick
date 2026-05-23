"""Smoke-test cover letter generator end-to-end (real OpenAI, no hh).

Usage:
  cd /Users/nurma/vscode_projects/AIautoclicker
  .venv/bin/python -m backend.scripts.smoke_cover_letter

Needs: OPENAI_API_KEY in backend/.env (other Supabase vars must be set too,
since config.py validates them — but cache write is monkey-patched away).
"""

from __future__ import annotations

import asyncio
import sys
from unittest.mock import patch

# Make backend/ importable
sys.path.insert(0, "backend")


async def main() -> None:
    from app.config import settings
    from app.services import cover_letter as cl

    if not settings.OPENAI_API_KEY:
        print("❌ OPENAI_API_KEY not set in backend/.env")
        sys.exit(1)

    vacancy = {
        "id": "smoke-1",
        "name": "Senior Python Developer",
        "employer": {"name": "Acme Corp"},
        "description": "<p>We need a Python dev with FastAPI, asyncio, "
        "Postgres experience. Remote.</p>",
        "snippet": {
            "requirement": "5+ years Python, async, microservices",
            "responsibility": "Build backend APIs",
        },
    }
    resume = {"title": "Backend Engineer / Python / 6y"}

    # Stub out Supabase cache (read miss + write no-op)
    class _Stub:
        def table(self, _name):
            return self

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def maybe_single(self):
            return self

        def upsert(self, *_a, **_k):
            return self

        def execute(self):
            class R:
                data = None
            return R()

    with patch.object(cl, "service_client", _Stub()):
        print(f"→ Model: {settings.OPENAI_MODEL}")
        print(f"→ Base:  {settings.OPENAI_BASE_URL}")
        print("→ Generating...\n")
        text = await cl.generate(
            user_id="smoke-user",
            vacancy=vacancy,
            resume=resume,
            resume_uuid="smoke-resume-uuid",
        )
        print("=" * 60)
        print(text)
        print("=" * 60)
        print(f"\nLength: {len(text)} chars")


if __name__ == "__main__":
    asyncio.run(main())
