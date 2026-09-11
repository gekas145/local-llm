import json
import uuid

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.db import add_message, get_connection, get_messages
from app.llm_client import complete_chat, generate_chat_title, stream_chat

router = APIRouter(prefix="/completions", tags=["completions"])


class CompletionIn(BaseModel):
    chat_id: str | None = None
    content: str


class CompletionOut(BaseModel):
    chat_id: str
    content: str


@router.post("", response_model=None)
async def create_completion(
    request: CompletionIn, 
    stream: bool = True,
    conn = Depends(get_connection),
) -> CompletionOut | StreamingResponse:
    async with conn:
        if request.chat_id is not None:
            title = None
            chat_id = request.chat_id
            history = await get_messages(conn, chat_id)
            if not history:
                raise HTTPException(status_code=404, detail="chat not found")
        else:
            try:
                title = await generate_chat_title(request.content)
            except Exception:
                title = "New Chat"
            chat_id = str(uuid.uuid4())
            history = []

        await add_message(conn, chat_id, "user", request.content, title)

        api_messages = [
            {
                "role": row[2],
                "content": row[3], 
            }
            for row in history
        ]
        api_messages.append({"role": "user", "content": request.content})

        if not stream:
            response_content = await complete_chat(api_messages)
            await add_message(conn, chat_id, "model", response_content)
            return CompletionOut(chat_id=chat_id, content=response_content)

    return StreamingResponse(
        _stream_and_store(chat_id, api_messages),
        media_type="application/x-ndjson",
    )


async def _stream_and_store(chat_id: str, api_messages: list[dict]):
    chunks = []
    async for delta in stream_chat(api_messages):
        chunks.append(delta)
        yield json.dumps({"chat_id": chat_id, "content": delta}) + "\n"

    conn = get_connection()
    async with conn:
        await add_message(conn, chat_id, "model", "".join(chunks))
