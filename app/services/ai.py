from __future__ import annotations

import requests
from flask import current_app


def ai_enabled() -> bool:
    return bool(
        current_app.config.get("AI_FALLBACK_ENABLED")
        and current_app.config.get("AI_API_BASE_URL")
        and current_app.config.get("AI_API_KEY")
    )


def generate_ai_reply(system_prompt: str, user_message: str, context: list[dict] | None = None) -> str | None:
    if not ai_enabled():
        return None

    base_url = current_app.config["AI_API_BASE_URL"].rstrip("/")
    url = f"{base_url}/chat/completions"
    messages = [{"role": "system", "content": system_prompt}]
    for item in context or []:
        role = item.get("role") if item.get("role") in {"user", "assistant"} else "user"
        messages.append({"role": role, "content": str(item.get("content", ""))[:2000]})
    messages.append({"role": "user", "content": user_message})
    payload = {
        "model": current_app.config.get("AI_MODEL", "gpt-4o-mini"),
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 450,
    }
    headers = {
        "Authorization": f"Bearer {current_app.config['AI_API_KEY']}",
        "Content-Type": "application/json",
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=current_app.config.get("AI_TIMEOUT_SECONDS", 20))
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception as exc:  # pragma: no cover - external dependency
        current_app.logger.warning("AI fallback failed: %s", exc)
        return None
