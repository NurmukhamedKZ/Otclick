"""OpenAI-compatible chat client. Ported from hh-applicant-tool/ai/openai.py.

Sync `requests`-based — wrap in `loop.run_in_executor` from async code.
"""

from __future__ import annotations

import logging
import time
from dataclasses import KW_ONLY, dataclass, field
from email.utils import parsedate_to_datetime
from threading import Lock

import requests

from app.ai.base import AIError

logger = logging.getLogger(__name__)


class OpenAIError(AIError):
    pass


@dataclass
class ChatOpenAI:
    api_key: str

    _: KW_ONLY

    base_url: str
    system_prompt: str | None = None
    timeout: float = 15.0
    max_retries: int = 5
    temperature: float = 0.4
    max_completion_tokens: int = 600
    model: str | None = None
    rate_limit: int = 40

    session: requests.Session = field(default_factory=requests.Session)

    _previous_request_time: float = field(default=0.0, init=False)
    _lock: Lock = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._lock = Lock()

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    @property
    def _min_request_interval(self) -> float:
        return 60.0 / self.rate_limit if self.rate_limit > 0 else 0.0

    def _request(self, payload: dict) -> requests.Response:
        with self._lock:
            if self._previous_request_time > 0:
                delay = (
                    self._min_request_interval
                    - time.monotonic()
                    + self._previous_request_time
                )
                if delay > 0:
                    time.sleep(delay)
            try:
                return self.session.post(
                    self.base_url,
                    json=payload,
                    headers=self._headers(),
                    timeout=self.timeout,
                )
            finally:
                self._previous_request_time = time.monotonic()

    def _retry_delay(self, response: requests.Response, attempt: int) -> float:
        min_interval = self._min_request_interval or 1.0
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                return max(float(retry_after), min_interval)
            except ValueError:
                try:
                    retry_at = parsedate_to_datetime(retry_after).timestamp()
                    return max(retry_at - time.time(), min_interval)
                except (TypeError, ValueError, OverflowError):
                    pass
        return max(min_interval * (attempt + 1), 1.0)

    def complete(self, message: str) -> str:
        messages: list[dict] = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.append({"role": "user", "content": message})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_completion_tokens": self.max_completion_tokens,
            "stream": False,
        }

        for attempt in range(self.max_retries + 1):
            try:
                response = self._request(payload)
            except requests.exceptions.RequestException as ex:
                raise OpenAIError(f"Network error: {ex}") from ex

            if response.status_code == 429:
                if attempt >= self.max_retries:
                    raise OpenAIError("OpenAI rate limit exceeded")
                delay = self._retry_delay(response, attempt)
                logger.warning("OpenAI 429, retry in %.2fs", delay)
                time.sleep(delay)
                continue

            try:
                response.raise_for_status()
                data = response.json()
            except requests.exceptions.RequestException as ex:
                raise OpenAIError(f"Network error: {ex}") from ex
            except ValueError as ex:
                raise OpenAIError(f"Invalid JSON response: {ex}") from ex

            if "error" in data:
                raise OpenAIError(data["error"]["message"])

            try:
                content = data["choices"][0]["message"]["content"]
                return content or ""
            except (KeyError, IndexError) as ex:
                raise OpenAIError(f"Invalid response format: {ex}") from ex

        raise OpenAIError("OpenAI request failed after retries")
