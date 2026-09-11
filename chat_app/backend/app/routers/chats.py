from fastapi import APIRouter, HTTPException, Depends

from app.db import delete_chat, get_connection, get_messages, get_chats, get_chat

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get("")
async def list_chats(conn = Depends(get_connection)):
    async with conn:
        chats = await get_chats(conn)
        return [
                {
                    "chat_id": chat_row[0],
                    "title": chat_row[1],
                    "created_at": chat_row[2],
                    "updated_at": chat_row[3],
                }
                for chat_row in chats
            ]


@router.get("/{chat_id}")
async def list_messages(chat_id: str, conn = Depends(get_connection)):
    async with conn:
        chat_row = await get_chat(conn, chat_id)
        if not chat_row:
            raise HTTPException(status_code=404, detail="chat not found")
        rows = await get_messages(conn, chat_id)
        return {
                "chat_id": chat_row[0],
                "title": chat_row[1],
                "created_at": chat_row[2],
                "messages": [
                    {
                        "id": row[1],
                        "role": row[2],
                        "content": row[3],
                        "created_at": row[4],
                    }
                    for row in rows
                ],
            }


@router.delete("/{chat_id}")
async def remove_chat(chat_id: str, conn = Depends(get_connection)) -> dict:
    async with conn:
        deleted = await delete_chat(conn, chat_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="chat not found")
        return {"chat_id": chat_id}
