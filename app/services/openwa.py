from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests
from flask import current_app


@dataclass
class OpenWAResult:
    ok: bool
    data: Any = None
    error: str = ""
    status_code: int | None = None


class OpenWAClient:
    """Thin HTTP wrapper around OpenWA/EASY API.

    Stable v4 middleware accepts POST /sendText with {"args": [to, content]} or
    POST / with {"method": "sendText", "args": {...}}. This client uses the
    path style first and falls back to method style so the MVP works across most
    OpenWA deployments.
    """

    def __init__(self, base_url: str = "", api_key: str = "", timeout: int | None = None):
        self.base_url = (base_url or current_app.config.get("OPENWA_BASE_URL", "")).rstrip("/")
        self.api_key = api_key or current_app.config.get("OPENWA_API_KEY", "")
        self.timeout = timeout or int(current_app.config.get("OPENWA_TIMEOUT_SECONDS", 15))

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.api_key:
            # Different OpenWA gateway versions/configs accept different key names.
            headers.update(
                {
                    "api_key": self.api_key,
                    "api-key": self.api_key,
                    "X-API-KEY": self.api_key,
                    "Authorization": f"Bearer {self.api_key}",
                }
            )
        return headers

    def call_method(self, method: str, args: list[Any] | dict[str, Any]) -> OpenWAResult:
        if not self.base_url:
            return OpenWAResult(False, error="OPENWA_BASE_URL não configurado")

        attempts = [
            (f"{self.base_url}/{method}", {"args": args}),
            (self.base_url, {"method": method, "args": args}),
        ]
        last_error = ""
        for url, payload in attempts:
            try:
                response = requests.post(url, json=payload, headers=self._headers(), timeout=self.timeout)
                content_type = response.headers.get("content-type", "")
                data = response.json() if "application/json" in content_type else response.text
                if response.ok:
                    return OpenWAResult(True, data=data, status_code=response.status_code)
                last_error = f"HTTP {response.status_code}: {data}"
            except requests.RequestException as exc:
                last_error = str(exc)
        return OpenWAResult(False, error=last_error, status_code=None)

    def send_text(self, to: str, content: str) -> OpenWAResult:
        return self.call_method("sendText", [to, content])

    def send_file_from_url(self, to: str, url: str, filename: str, caption: str = "") -> OpenWAResult:
        return self.call_method("sendFileFromUrl", [to, url, filename, caption])

    def send_seen(self, chat_id: str) -> OpenWAResult:
        return self.call_method("sendSeen", [chat_id])

    def set_typing(self, chat_id: str) -> OpenWAResult:
        # ChatState TYPING = 0 in OpenWA docs.
        return self.call_method("setChatState", [0, chat_id])

    def metrics(self) -> OpenWAResult:
        return self.call_method("metrics", [])


def normalize_whatsapp_id(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return value
    if "@" in value:
        return value
    digits = "".join(ch for ch in value if ch.isdigit())
    return f"{digits}@c.us" if digits else value
