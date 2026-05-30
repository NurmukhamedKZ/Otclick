"""Recon: capture hh.ru robot-recruiter chat traffic to learn the quick-reply
answer endpoint + payload. READ ONLY — never clicks a button.

Usage:
    cd backend
    python recon_chat.py <user_id> <nid_or_full_chat_url>

Loads the user's stored web-session cookies (same ones form_filler uses),
opens the chat in a headless browser, logs every chat/api/graphql request
(method, url, postData) and saves response bodies + a screenshot + the page
HTML under ./recon_out/ for inspection.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

from app.services.form_filler import _load_cookies_encrypted
from app.services.hh_auth import decrypt_token

OUT = Path("recon_out")

# request URLs we care about (chat / messaging / graphql / api backends)
INTERESTING = ("chat", "negotiat", "chatik", "graphql", "/api/", "message", "shard")


def _url_interesting(url: str) -> bool:
    low = url.lower()
    return any(tok in low for tok in INTERESTING)


def _chat_url(nid_or_url: str) -> str:
    if nid_or_url.startswith("http"):
        return nid_or_url
    # default guess; the captured redirects/xhr will reveal the real route
    return f"https://hh.ru/applicant/negotiations?negotiationId={nid_or_url}"


async def main(user_id: str, nid_or_url: str) -> None:
    OUT.mkdir(exist_ok=True)
    enc = _load_cookies_encrypted(user_id)
    if not enc:
        print(f"no web cookies stored for user {user_id} — reconnect needed")
        return
    cookies = json.loads(decrypt_token(enc))
    print(f"loaded {len(cookies)} cookies")

    target = _chat_url(nid_or_url)
    print(f"navigating: {target}")

    log: list[dict] = []
    body_idx = 0

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        device = pw.devices["Galaxy A55"]
        context = await browser.new_context(**device)
        # cookies were captured from this same mobile context
        await context.add_cookies(cookies)
        page = await context.new_page()

        def on_request(req):
            if _url_interesting(req.url):
                entry = {"method": req.method, "url": req.url}
                if req.method in ("POST", "PUT", "PATCH"):
                    try:
                        entry["post_data"] = req.post_data
                    except Exception:
                        entry["post_data"] = "<unreadable>"
                log.append(entry)
                print(f"  {req.method} {req.url}")

        async def on_response(resp):
            nonlocal body_idx
            if not _url_interesting(resp.url):
                return
            ct = (resp.headers or {}).get("content-type", "")
            if "json" not in ct and "javascript" not in ct:
                return
            try:
                body = await resp.body()
            except Exception:
                return
            body_idx += 1
            fname = OUT / f"resp_{body_idx:03d}.json"
            fname.write_bytes(body)
            print(f"  -> saved {fname.name}  ({resp.status} {resp.url[:90]})")

        page.on("request", on_request)
        page.on("response", lambda r: asyncio.create_task(on_response(r)))

        await page.goto(target, timeout=45000, wait_until="networkidle")
        # let lazy chat XHRs settle
        await page.wait_for_timeout(6000)

        (OUT / "page.html").write_text(await page.content(), encoding="utf-8")
        await page.screenshot(path=str(OUT / "page.png"), full_page=True)
        (OUT / "requests.json").write_text(
            json.dumps(log, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"\nfinal url: {page.url}")
        print(f"captured {len(log)} interesting requests, {body_idx} bodies")
        print(f"output in {OUT.resolve()}")
        await browser.close()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python recon_chat.py <user_id> <nid_or_full_chat_url>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
