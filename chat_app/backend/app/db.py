import os
import sqlite3
import aiosqlite

DB_PATH = os.environ.get("DB_PATH", "app.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS chats (
    chat_id TEXT NOT NULL PRIMARY KEY,
    title TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    chat_id TEXT NOT NULL,
    message_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'model')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (chat_id, message_id),
    FOREIGN KEY (chat_id) REFERENCES chats (chat_id) ON DELETE CASCADE
);
"""

def get_connection() -> aiosqlite.Connection:
    return aiosqlite.connect(DB_PATH)


async def init_db() -> None:
    conn = await get_connection()
    try:
        await conn.execute("PRAGMA foreign_keys = ON")
        await conn.executescript(SCHEMA)
    finally:
        await conn.close()


async def get_chats(conn: aiosqlite.Connection):
    cursor = await conn.execute(
                """
                SELECT c.chat_id, c.title, MIN(m.created_at) AS created_at, MAX(m.created_at) AS updated_at
                FROM chats c
                JOIN messages m ON m.chat_id = c.chat_id
                GROUP BY c.chat_id
                ORDER BY updated_at DESC
                """
            )
    return await cursor.fetchall()


async def get_chat(conn: aiosqlite.Connection, chat_id: str) -> sqlite3.Row | None:
    cursor = await conn.execute(
        "SELECT chat_id, title, created_at FROM chats WHERE chat_id = ?",
        (chat_id,),
    )
    return await cursor.fetchone()


async def get_messages(conn: aiosqlite.Connection, chat_id: str) -> list[sqlite3.Row]:
    cursor = await conn.execute(
        "SELECT chat_id, message_id, role, content, created_at FROM messages "
        "WHERE chat_id = ? ORDER BY message_id ASC",
        (chat_id,),
    )
    return await cursor.fetchall()


async def delete_chat(conn: aiosqlite.Connection, chat_id: str) -> int:
    await conn.execute("PRAGMA foreign_keys = ON")
    cursor = await conn.execute("DELETE FROM chats WHERE chat_id = ?", (chat_id,))
    await conn.commit()
    return cursor.rowcount


async def add_message(conn: aiosqlite.Connection, chat_id: str, role: str, content: str, title: str = "New Chat") -> int:
    await conn.execute("PRAGMA foreign_keys = ON")
    await conn.execute(
        "INSERT INTO chats (chat_id, title) VALUES (?, ?) ON CONFLICT (chat_id) DO NOTHING",
        (chat_id, title),
    )
    cursor = await conn.execute(
        "SELECT COALESCE(MAX(message_id), -1) + 1 FROM messages WHERE chat_id = ?",
        (chat_id,),
    )
    row = await cursor.fetchone()
    next_id = row[0]
    await conn.execute(
        "INSERT INTO messages (chat_id, message_id, role, content) VALUES (?, ?, ?, ?)",
        (chat_id, next_id, role, content),
    )
    await conn.commit()
    return next_id
