"""Day 1 POC fallback: hh.ru OAuth через Playwright (Galaxy A55 emulation).

Повторяет флоу из hh-applicant-tool/operations/authorize.py:
  1. Запуск headless chromium с эмуляцией Galaxy A55
  2. Goto https://hh.ru/oauth/authorize?client_id=ANDROID...&response_type=code
  3. Ввод login/password
  4. Перехват redirect на hhandroid://oauthresponse?code=...
  5. Обмен code → access_token через POST https://hh.ru/oauth/token
  6. GET /me, GET /resumes/mine, опц. POST /negotiations

Usage:
    pip install playwright python-dotenv requests
    playwright install chromium
    python backend/poc_day1_playwright.py
    python backend/poc_day1_playwright.py --no-headless   # увидеть браузер
    python backend/poc_day1_playwright.py --apply --vacancy-id 123456789
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import sys
import uuid
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit

import requests
from playwright.async_api import async_playwright

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


HH_OAUTH_AUTHORIZE = "https://hh.ru/oauth/authorize"
HH_OAUTH_TOKEN = "https://hh.ru/oauth/token"
HH_API_URL = "https://api.hh.ru"
HH_ANDROID_SCHEME = "hhandroid"

ANDROID_CLIENT_ID = "HIOMIAS39CA9DICTA7JIO64LQKQJF5AGIK74G9ITJKLNEDAOH5FHS5G1JI7FOEGD"
ANDROID_CLIENT_SECRET = "V9M870DE342BGHFRUJ5FTCGCUA1482AN0DI8C5TFI9ULMA89H10N60NOP8I4JMVS"

MOBILE_MODELS = [
    "23053RN02A", "23077RABDC", "2411DRN47C", "2508CRN2BE",
    "SM-A165F", "SM-A165M", "24108PCE2I", "MZB0KE1IN",
]

SEL_LOGIN_INPUT_CANDIDATES = [
    'input[data-qa="login-input-username"]',  
]
SEL_EXPAND_PASSWORD_CANDIDATES = [
    'button:has-text("Войти с паролем")',
]
SEL_PASSWORD_INPUT_CANDIDATES = [
    'input[data-qa="login-input-password"]',
]
SEL_CAPTCHA_IMAGE = 'img[data-qa="account-captcha-picture"]'


def generate_user_agent() -> str:
    model = random.choice(MOBILE_MODELS)
    minor = random.randint(100, 150)
    patch = random.randint(10000, 15000)
    android = random.randint(11, 15)
    return (
        f"ru.hh.android/7.{minor}.{patch}, Device: {model}, "
        f"Android OS: {android} (UUID: {uuid.uuid4()})"
    )


def default_headers(user_agent: str) -> dict[str, str]:
    return {"User-Agent": user_agent, "X-HH-App-Active": "true"}


def pretty(label: str, data: Any) -> None:
    print(f"\n=== {label} ===")
    if isinstance(data, (dict, list)):
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(data)


def build_authorize_url() -> str:
    qs = urlencode({"client_id": ANDROID_CLIENT_ID, "response_type": "code"})
    return f"{HH_OAUTH_AUTHORIZE}?{qs}"


async def _try_click_first(page, selectors: list[str], timeout: int = 3000) -> str | None:
    """Кликает по первому найденному селектору. Возвращает имя или None."""
    for sel in selectors:
        try:
            el = await page.wait_for_selector(sel, timeout=timeout, state="visible")
            if el:
                await el.click()
                return sel
        except Exception:
            continue
    return None


async def _try_fill_first(
    page, selectors: list[str], value: str, timeout: int = 5000,
) -> str | None:
    for sel in selectors:
        try:
            el = await page.wait_for_selector(sel, timeout=timeout, state="visible")
            if el:
                await el.fill(value)
                return sel
        except Exception:
            continue
    return None


async def get_auth_code(
    username: str, password: str, headless: bool, manual: bool,
) -> str:
    """Поднимает chromium, логинится, возвращает OAuth code."""
    async with async_playwright() as pw:
        print(f"Запуск chromium (headless={headless}, manual={manual})...")
        browser = await pw.chromium.launch(headless=headless)
        try:
            device = pw.devices["Galaxy A55"]
            context = await browser.new_context(**device)
            page = await context.new_page()

            code_future: asyncio.Future[str | None] = asyncio.Future()

            def handle_request(request):
                url = request.url
                if url.startswith(f"{HH_ANDROID_SCHEME}://"):
                    print(f"  -> Перехвачен redirect: {url}")
                    if not code_future.done():
                        sp = urlsplit(url)
                        code = parse_qs(sp.query).get("code", [None])[0]
                        code_future.set_result(code)

            page.on("request", handle_request)

            authorize_url = build_authorize_url()
            print(f"Goto: {authorize_url}")
            await page.goto(authorize_url, timeout=30000, wait_until="load")

            if manual:
                print(
                    "\n*** MANUAL MODE *** Залогинься сам в открытом окне.\n"
                    "Скрипт ждёт hhandroot:// redirect (до 5 минут)...\n"
                )
                auth_code = await asyncio.wait_for(code_future, timeout=300.0)
                if not auth_code:
                    raise RuntimeError("OAuth code пустой")
                return auth_code

            # Шаг 1: ввод email/логина
            filled = await _try_fill_first(
                page, SEL_LOGIN_INPUT_CANDIDATES, username, timeout=10000,
            )
            if not filled:
                raise RuntimeError(
                    "Не нашёл поле логина. DOM формы изменился — "
                    "пришли свежий backend/login.html"
                )
            print(f"  -> логин введён в '{filled}'")

            # Шаг 2: кнопка "Войти с паролем" — сразу на той же странице
            clicked = await _try_click_first(
                page, SEL_EXPAND_PASSWORD_CANDIDATES, timeout=5000,
            )
            if not clicked:
                raise RuntimeError(
                    "Не нашёл кнопку 'Войти с паролем'. "
                    "Запусти --manual и реши вручную."
                )
            print(f"  -> клик по '{clicked}'")

            # Шаг 3: капча на странице пароля?
            try:
                await page.wait_for_selector(
                    SEL_CAPTCHA_IMAGE, timeout=2000, state="visible"
                )
                raise RuntimeError(
                    "Капча на login form. Запусти --manual --no-headless и реши вручную."
                )
            except Exception as ex:
                if "Капча" in str(ex):
                    raise

            # Шаг 4: ввод пароля
            pwd_filled = await _try_fill_first(
                page, SEL_PASSWORD_INPUT_CANDIDATES, password, timeout=10000,
            )
            if not pwd_filled:
                raise RuntimeError(
                    "Не нашёл поле пароля. Запусти --manual."
                )
            print(f"  -> пароль введён в '{pwd_filled}'")
            await page.keyboard.press("Enter")
            print("  -> пароль отправлен, ждём redirect или капчу...")

            # Капча после пароля? Дать время решить вручную в --no-headless.
            wait_timeout = 60.0
            try:
                await page.wait_for_selector(
                    SEL_CAPTCHA_IMAGE, timeout=3000, state="visible",
                )
                if headless:
                    raise RuntimeError(
                        "Капча после пароля. Headless не может решить. "
                        "Запусти --no-headless."
                    )
                print(
                    "\n*** КАПЧА *** Реши капчу в открытом окне и нажми кнопку.\n"
                    "Скрипт ждёт hhandroid:// redirect (до 5 минут)...\n"
                )
                wait_timeout = 300.0
            except Exception as ex:
                if "Капча" in str(ex) or "Headless" in str(ex):
                    raise
                # Капчи нет — обычный 60-сек таймаут
                pass

            auth_code = await asyncio.wait_for(code_future, timeout=wait_timeout)
            if not auth_code:
                raise RuntimeError("OAuth code не получен (пустой в redirect URL)")
            return auth_code
        finally:
            await browser.close()


def exchange_code_for_token(code: str, user_agent: str) -> dict[str, Any]:
    payload = {
        "grant_type": "authorization_code",
        "client_id": ANDROID_CLIENT_ID,
        "client_secret": ANDROID_CLIENT_SECRET,
        "code": code,
    }
    resp = requests.post(
        HH_OAUTH_TOKEN, data=payload,
        headers=default_headers(user_agent), timeout=15,
    )
    pretty(f"POST /oauth/token (status={resp.status_code})", resp.json())
    resp.raise_for_status()
    return resp.json()


def call_api(
    user_agent: str, access_token: str,
    method: str, endpoint: str, data: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    headers = default_headers(user_agent) | {"Authorization": f"Bearer {access_token}"}
    url = f"{HH_API_URL}{endpoint}"
    kwargs: dict[str, Any] = {"headers": headers, "timeout": 20, "allow_redirects": False}
    if method == "POST" and data is not None:
        kwargs["data"] = data
    resp = requests.request(method, url, **kwargs)
    try:
        body = resp.json() if resp.text else {}
    except json.JSONDecodeError:
        body = {"_raw": resp.text[:500]}
    return resp.status_code, body


async def main_async(args) -> int:
    username = os.environ.get("HH_LOGIN")
    password = os.environ.get("HH_PASSWORD")
    if not username or not password:
        print("ERROR: HH_LOGIN и HH_PASSWORD должны быть в env или .env")
        return 2

    if args.apply and not args.vacancy_id:
        args.vacancy_id = os.environ.get("HH_TEST_VACANCY_ID")
        if not args.vacancy_id:
            print("ERROR: --apply требует --vacancy-id или HH_TEST_VACANCY_ID в env")
            return 2

    user_agent = generate_user_agent()
    print(f"User-Agent: {user_agent}")

    # --- ШАГ 1: Playwright OAuth code ---
    try:
        code = await get_auth_code(
            username, password,
            headless=not args.no_headless,
            manual=args.manual,
        )
    except Exception as ex:
        print(f"\n❌ Playwright login провалился: {ex}")
        return 1
    print(f"\n✅ OAuth code получен: {code[:8]}...")

    # --- ШАГ 2: code → access_token ---
    token = exchange_code_for_token(code, user_agent)
    access_token = token["access_token"]
    refresh_token = token.get("refresh_token")
    expires_in = token.get("expires_in")
    print(f"\n✅ access_token (prefix={access_token[:8]}..., expires_in={expires_in}s)")
    print(f"   refresh_token: {'есть' if refresh_token else 'НЕТ'}")

    # --- ШАГ 3: GET /me ---
    status, me = call_api(user_agent, access_token, "GET", "/me")
    pretty(f"GET /me (status={status})", me)
    if status != 200:
        print("ERROR: /me не отвечает 200.")
        return 1

    # --- ШАГ 4: GET /resumes/mine ---
    status, resumes = call_api(user_agent, access_token, "GET", "/resumes/mine")
    pretty(f"GET /resumes/mine (status={status})", resumes)

    items = (resumes or {}).get("items", []) if isinstance(resumes, dict) else []
    published = [r for r in items if r.get("status", {}).get("id") == "published"]
    print(f"\nРезюме всего: {len(items)}, опубликованных: {len(published)}")
    for r in items:
        print(f"  - {r.get('id')}  status={r.get('status', {}).get('id')}  title={r.get('title')}")

    # --- ШАГ 5: POST /negotiations (опц.) ---
    if not args.apply:
        print("\nℹ️  --apply не указан. POC завершён успешно.")
        return 0

    resume_id = args.resume_id or (published[0]["id"] if published else None)
    if not resume_id:
        print("ERROR: --apply требует --resume-id или published резюме.")
        return 1

    payload = {
        "resume_id": resume_id,
        "vacancy_id": args.vacancy_id,
        "message": args.message,
    }
    print(f"\n>>> POST /negotiations {payload}")
    status, body = call_api(user_agent, access_token, "POST", "/negotiations", payload)
    pretty(f"POST /negotiations (status={status})", body)

    if status == 201:
        print("\n✅ 201 — отклик отправлен. END-TO-END работает.")
        return 0
    if status == 303:
        print("\n⚠️  303 — у вакансии тест/форма (см. _solve_vacancy_test в репо).")
        return 0
    print(f"\n❌ Неожиданный статус {status}.")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Day 1 POC: hh OAuth via Playwright")
    parser.add_argument("--no-headless", action="store_true", help="Показать окно браузера")
    parser.add_argument("--manual", action="store_true",
                        help="Ручной логин в окне (устойчив к смене UI hh)")
    parser.add_argument("--apply", action="store_true", help="Реально отправить отклик")
    parser.add_argument("--vacancy-id", help="vacancy_id для POST /negotiations")
    parser.add_argument("--resume-id", help="resume_id (по умолчанию — первое published)")
    parser.add_argument("--message", default="Здравствуйте! Готов обсудить вакансию.")
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
