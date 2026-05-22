"""Day 1 POC: hh.ru mobile OAuth password grant + POST /negotiations.

Usage:
    HH_LOGIN=... HH_PASSWORD=... python backend/poc_day1.py
    # с реальным откликом (осторожно — отправит отклик!):
    HH_LOGIN=... HH_PASSWORD=... python backend/poc_day1.py --apply --vacancy-id 123456789

Зависимости: pip install requests python-dotenv
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import uuid
from typing import Any

import requests

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


HH_OAUTH_URL = "https://hh.ru/oauth/token"
HH_API_URL = "https://api.hh.ru"

# Из hh-applicant-tool/src/hh_applicant_tool/api/client_keys.py
ANDROID_CLIENT_ID = "HIOMIAS39CA9DICTA7JIO64LQKQJF5AGIK74G9ITJKLNEDAOH5FHS5G1JI7FOEGD"
ANDROID_CLIENT_SECRET = "V9M870DE342BGHFRUJ5FTCGCUA1482AN0DI8C5TFI9ULMA89H10N60NOP8I4JMVS"

# Закомменченный "ключ прямой авторизации" из репо. Возможно работает с password grant.
DIRECT_AUTH_KEY = "K811HJNKQA8V1UN53I6PN1J1CMAD2L1M3LU6LPAU849BCT031KDSSM485FDPJ6UF"

MOBILE_MODELS = [
    "23053RN02A", "23077RABDC", "2411DRN47C", "2508CRN2BE",
    "SM-A165F", "SM-A165M", "24108PCE2I", "MZB0KE1IN",
]


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
    return {
        "User-Agent": user_agent,
        "X-HH-App-Active": "true",
    }


def pretty(label: str, data: Any) -> None:
    print(f"\n=== {label} ===")
    if isinstance(data, (dict, list)):
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(data)


def try_password_grant(
    session: requests.Session,
    user_agent: str,
    username: str,
    password: str,
    client_id: str,
    client_secret: str | None,
    label: str,
) -> dict[str, Any] | None:
    """Попытка получить access_token через grant_type=password."""
    payload = {
        "grant_type": "password",
        "client_id": client_id,
        "username": username,
        "password": password,
    }
    if client_secret:
        payload["client_secret"] = client_secret

    print(f"\n>>> Попытка [{label}] client_id={client_id[:8]}...")
    try:
        resp = session.post(
            HH_OAUTH_URL,
            data=payload,
            headers=default_headers(user_agent),
            timeout=15,
            allow_redirects=False,
        )
    except requests.RequestException as ex:
        print(f"    HTTP error: {ex}")
        return None

    print(f"    status={resp.status_code}")
    try:
        body = resp.json()
    except json.JSONDecodeError:
        body = {"_raw": resp.text[:500]}
    pretty(f"response [{label}]", body)

    if resp.status_code == 200 and body.get("access_token"):
        return body
    return None


def call_api(
    session: requests.Session,
    user_agent: str,
    access_token: str,
    method: str,
    endpoint: str,
    data: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    headers = default_headers(user_agent) | {
        "Authorization": f"Bearer {access_token}",
    }
    url = f"{HH_API_URL}{endpoint}"
    kwargs: dict[str, Any] = {"headers": headers, "timeout": 20, "allow_redirects": False}
    if method == "POST" and data is not None:
        kwargs["data"] = data

    resp = session.request(method, url, **kwargs)
    try:
        body = resp.json() if resp.text else {}
    except json.JSONDecodeError:
        body = {"_raw": resp.text[:500]}
    return resp.status_code, body


def main() -> int:
    parser = argparse.ArgumentParser(description="Day 1 POC: hh mobile OAuth + negotiations")
    parser.add_argument("--apply", action="store_true", help="Реально отправить отклик")
    parser.add_argument("--vacancy-id", help="vacancy_id для теста POST /negotiations")
    parser.add_argument("--resume-id", help="resume_id (по умолчанию — первое опубликованное)")
    parser.add_argument("--message", default="Здравствуйте! Готов обсудить вакансию.",
                        help="Текст cover letter")
    args = parser.parse_args()

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
    session = requests.Session()

    # --- ШАГ 1: password grant ---
    token = try_password_grant(
        session, user_agent, username, password,
        ANDROID_CLIENT_ID, ANDROID_CLIENT_SECRET, "Android client (с secret)",
    )

    if not token:
        token = try_password_grant(
            session, user_agent, username, password,
            ANDROID_CLIENT_ID, None, "Android client (без secret)",
        )

    if not token:
        token = try_password_grant(
            session, user_agent, username, password,
            DIRECT_AUTH_KEY, None, "Direct auth key (закомменченный в репо)",
        )

    if not token:
        print("\n" + "=" * 60)
        print("РЕЗУЛЬТАТ: password grant НЕ работает.")
        print("Нужен fallback на Playwright-флоу (см. hh-applicant-tool/operations/authorize.py)")
        print("=" * 60)
        return 1

    access_token = token["access_token"]
    refresh_token = token.get("refresh_token")
    expires_in = token.get("expires_in")
    print(f"\n✅ access_token получен (prefix={access_token[:8]}..., expires_in={expires_in})")
    print(f"   refresh_token: {'есть' if refresh_token else 'НЕТ'}")

    # --- ШАГ 2: GET /me ---
    status, me = call_api(session, user_agent, access_token, "GET", "/me")
    pretty(f"GET /me (status={status})", me)
    if status != 200:
        print("ERROR: /me не отвечает 200 — токен мёртвый.")
        return 1

    # --- ШАГ 3: GET /resumes/mine ---
    status, resumes = call_api(session, user_agent, access_token, "GET", "/resumes/mine")
    pretty(f"GET /resumes/mine (status={status})", resumes)
    if status != 200:
        print("WARN: /resumes/mine не отвечает 200.")

    items = (resumes or {}).get("items", []) if isinstance(resumes, dict) else []
    published = [r for r in items if r.get("status", {}).get("id") == "published"]
    print(f"\nРезюме всего: {len(items)}, опубликованных: {len(published)}")
    for r in items:
        print(f"  - {r.get('id')}  status={r.get('status', {}).get('id')}  title={r.get('title')}")

    # --- ШАГ 4: POST /negotiations (опционально) ---
    if not args.apply:
        print("\nℹ️  --apply не указан, отклик не отправлен. POC завершён успешно.")
        return 0

    resume_id = args.resume_id or (published[0]["id"] if published else None)
    if not resume_id:
        print("ERROR: --apply требует --resume-id или хотя бы одно published резюме.")
        return 1

    payload = {
        "resume_id": resume_id,
        "vacancy_id": args.vacancy_id,
        "message": args.message,
    }
    print(f"\n>>> POST /negotiations payload={payload}")
    status, body = call_api(session, user_agent, access_token, "POST", "/negotiations", payload)
    pretty(f"POST /negotiations (status={status})", body)

    if status == 201:
        print("\n✅ 201 — отклик отправлен. Mobile OAuth POC работает END-TO-END.")
        return 0
    if status == 303:
        print("\n⚠️  303 redirect — у вакансии есть тест/доп.форма (см. _solve_vacancy_test в репо).")
        return 0
    print(f"\n❌ Неожиданный статус {status}.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
