"""
Data-access layer for the conversations and conversation_messages tables
(see auth_db.py for schema).

Same connection-injection-with-owns_connection-fallback convention as
user_store.py and chunk_store.py. The one thing every read/write function
here that takes a user_id enforces: a conversation can only be looked up,
restored, or deleted by the user who owns it - `WHERE id = ? AND user_id
= ?`, never just `WHERE id = ?`. That's what stops one student from
reading or deleting another student's chat history by guessing/incrementing
an id; it isn't a separate authorization layer bolted on top, it is the
query.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

from app.data.auth_db import get_connection


def create_conversation(
    *,
    user_id: int,
    title: str,
    connection: sqlite3.Connection | None = None,
) -> sqlite3.Row:
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        now = datetime.now(timezone.utc).isoformat()
        cursor = connection.execute(
            """
            INSERT INTO conversations (user_id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, title, now, now),
        )
        connection.commit()
        return connection.execute(
            "SELECT * FROM conversations WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    finally:
        if owns_connection:
            connection.close()


def get_conversation(
    conversation_id: int,
    user_id: int,
    connection: sqlite3.Connection | None = None,
) -> sqlite3.Row | None:
    """Returns None if the conversation doesn't exist OR belongs to a
    different user - the two cases are indistinguishable on purpose, so a
    caller can never learn "conversation 42 exists, it's just not yours"
    from the response."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        return connection.execute(
            "SELECT * FROM conversations WHERE id = ? AND user_id = ?",
            (conversation_id, user_id),
        ).fetchone()
    finally:
        if owns_connection:
            connection.close()


def list_conversations(
    user_id: int, connection: sqlite3.Connection | None = None
) -> list[sqlite3.Row]:
    """Every conversation belonging to user_id, most recently updated
    first - requirement 7 (order by most recently updated) is enforced
    here, not left to the caller to sort."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        return connection.execute(
            """
            SELECT * FROM conversations
            WHERE user_id = ?
            ORDER BY updated_at DESC
            """,
            (user_id,),
        ).fetchall()
    finally:
        if owns_connection:
            connection.close()


def touch_conversation(
    conversation_id: int, connection: sqlite3.Connection | None = None
) -> None:
    """Bump updated_at to now - called once per chat turn, right after both
    the user and assistant messages for that turn are stored, so a
    conversation with N turns moves to the top of the sidebar after each
    one."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        connection.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (datetime.now(timezone.utc).isoformat(), conversation_id),
        )
        connection.commit()
    finally:
        if owns_connection:
            connection.close()


def delete_conversation(
    conversation_id: int,
    user_id: int,
    connection: sqlite3.Connection | None = None,
) -> bool:
    """Deletes a conversation and every message in it. Returns False
    (deletes nothing) if conversation_id doesn't exist or isn't owned by
    user_id - same ownership check as get_conversation(), enforced by the
    WHERE clause on the conversations DELETE, not a separate lookup that
    could race with a concurrent request.

    SQLite's foreign keys aren't enforced by default (no ON DELETE CASCADE
    without PRAGMA foreign_keys=ON, which this project doesn't set), so
    conversation_messages rows are deleted explicitly first - otherwise
    they'd be silently orphaned instead of actually removed.
    """
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        owned = connection.execute(
            "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
            (conversation_id, user_id),
        ).fetchone()
        if owned is None:
            return False

        connection.execute(
            "DELETE FROM conversation_messages WHERE conversation_id = ?",
            (conversation_id,),
        )
        connection.execute(
            "DELETE FROM conversations WHERE id = ?", (conversation_id,)
        )
        connection.commit()
        return True
    finally:
        if owns_connection:
            connection.close()


def get_user_stats(
    user_id: int, connection: sqlite3.Connection | None = None
) -> dict:
    """Real, computed-on-read counts for the Profile page's Account
    Statistics section - never cached or denormalized onto the users row,
    so they can't drift from the actual conversations/conversation_messages
    data. question_count only counts role='user' messages (the student's
    own questions), deliberately different from conversation_count since
    one conversation usually holds several questions."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        conversation_count = connection.execute(
            "SELECT COUNT(*) FROM conversations WHERE user_id = ?", (user_id,)
        ).fetchone()[0]
        question_count = connection.execute(
            """
            SELECT COUNT(*)
            FROM conversation_messages
            JOIN conversations ON conversations.id = conversation_messages.conversation_id
            WHERE conversations.user_id = ? AND conversation_messages.role = 'user'
            """,
            (user_id,),
        ).fetchone()[0]
        return {
            "conversation_count": conversation_count,
            "question_count": question_count,
        }
    finally:
        if owns_connection:
            connection.close()


def add_message(
    *,
    conversation_id: int,
    role: str,
    content: str,
    sources_json: str = "[]",
    connection: sqlite3.Connection | None = None,
) -> sqlite3.Row:
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        cursor = connection.execute(
            """
            INSERT INTO conversation_messages
                (conversation_id, role, content, sources_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                conversation_id,
                role,
                content,
                sources_json,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        connection.commit()
        return connection.execute(
            "SELECT * FROM conversation_messages WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    finally:
        if owns_connection:
            connection.close()


def list_messages(
    conversation_id: int, connection: sqlite3.Connection | None = None
) -> list[sqlite3.Row]:
    """Every message in one conversation, oldest first (insertion/id order
    - autoincrement guarantees this matches send order)."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        return connection.execute(
            """
            SELECT * FROM conversation_messages
            WHERE conversation_id = ?
            ORDER BY id ASC
            """,
            (conversation_id,),
        ).fetchall()
    finally:
        if owns_connection:
            connection.close()
