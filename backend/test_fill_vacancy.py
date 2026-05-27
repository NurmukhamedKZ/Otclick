"""Manual end-to-end test: solve + submit a vacancy test through apply_one.

Runs the REAL apply path: fetch vacancy → has_test → FillerAgent.fill()
(web session + AI) → records status in `applications`. Submits to hh for real.

Prereq: the user must have reconnected hh AFTER cookie capture was added, i.e.
hh_credentials.web_cookies_encrypted is populated. Otherwise fill() returns
form_required (no web session).

Usage (from backend/, venv active, .env present):
    python test_fill_vacancy.py <user_id> <resume_row_id> <vacancy_id>
"""

from __future__ import annotations

import asyncio
import sys

from app.services import apply as apply_service
from app.services.form_filler import _load_cookies_encrypted


async def main(user_id: str, resume_row_id: str, vacancy_id: str) -> None:
    has_cookies = await asyncio.get_running_loop().run_in_executor(
        None, _load_cookies_encrypted, user_id
    )
    print(f"web session stored: {bool(has_cookies)}")
    if not has_cookies:
        print("!! no web cookies — reconnect hh in the app first, then re-run")

    status = await apply_service.apply_one(user_id, resume_row_id, vacancy_id)
    print(f"apply_one -> {status}")
    if status == "form_sent":
        print("OK: test solved + submitted, applications row = form_sent")
    elif status == "form_required":
        print("fill() declined — check logs (no session / parse fail / hh rejected)")
    else:
        print(f"other status: {status}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("usage: python test_fill_vacancy.py <user_id> <resume_row_id> <vacancy_id>")
        raise SystemExit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3]))
