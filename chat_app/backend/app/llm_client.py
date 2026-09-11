import json
import os
from collections.abc import AsyncIterator

import httpx

LLM_URL = os.environ.get("LLM_URL", "http://localhost:8080")


async def complete_chat(messages: list[dict]) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{LLM_URL}/v1/chat/completions",
            json={"messages": messages, "stream": False},
        )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


async def generate_chat_title(first_message: str) -> str:
    messages = [
        {
            "role": "user",
            "content": (
                "Generate a short, concise title (max 6 words) for a chat that starts "
                "with the following message. Reply with the title only, no quotes, "
                "no punctuation at the end.\n\n"
                f"Message: {first_message}"
            ),
        },
    ]
    title = (await complete_chat(messages)).strip()
    if len(title) > 30:
        title = title[:27] + "..."
    return title


async def stream_chat(messages: list[dict]) -> AsyncIterator[str]:
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            f"{LLM_URL}/v1/chat/completions",
            json={"messages": messages, "stream": True},
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line.removeprefix("data: ")
                if data == "[DONE]":
                    break
                delta = json.loads(data)["choices"][0]["delta"].get("content")
                if delta:
                    yield delta
