"""
Data-access layer for the users and sessions tables (see auth_db.py for
schema).

Every function here does ONE thing to the database: insert, read, or
delete one row - the same "connection-injection with an owns_connection
fallback" convention app/data/chunk_store.py already uses, so a caller
that already has a connection open (not needed anywhere yet in this auth
flow, but kept for consistency) can reuse it instead of opening a second
one. app/services/auth_service.py is the only caller; it never sees raw
sqlite3.Row objects outside this module and chunk_store.py's sibling
pattern.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from app.data.auth_db import get_connection


def create_user(
    *,
    full_name: str,
    registration_number: str,
    email: str,
    password_hash: str,
    connection: sqlite3.Connection | None = None,
) -> sqlite3.Row:
    """Insert a new user row and return it. Raises sqlite3.IntegrityError if
    the (unique-indexed) email or registration_number already exists -
    auth_service.py checks for duplicates explicitly beforehand so this
    should only ever fire on a genuine race between two simultaneous
    signups; the unique index is what actually guarantees correctness
    either way."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        created_at = datetime.now(timezone.utc).isoformat()
        cursor = connection.execute(
            """
            INSERT INTO users (full_name, registration_number, email, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (full_name, registration_number, email, password_hash, created_at),
        )
        connection.commit()
        return connection.execute(
            "SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    finally:
        if owns_connection:
            connection.close()


def create_demo_user(
    *,
    full_name: str,
    registration_number: str,
    email: str,
    password_hash: str,
    department: str,
    year: str,
    hostel: str,
    bio: str,
    preferences_json: str,
    connection: sqlite3.Connection | None = None,
) -> sqlite3.Row:
    """Insert a demo account - same users row shape create_user() above
    makes for a real signup, plus is_demo=1 and every profile/preferences
    field pre-filled. A real signup leaves department/year/hostel/bio NULL
    and preferences_json '{}' until the student fills them in themselves;
    a demo account skips straight to a populated Profile and Settings page
    since the whole point is to show what an already-set-up account looks
    like without making a visitor do any setup first."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        created_at = datetime.now(timezone.utc).isoformat()
        cursor = connection.execute(
            """
            INSERT INTO users (
                full_name, registration_number, email, password_hash,
                created_at, department, year, hostel, bio,
                preferences_json, is_demo
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                full_name,
                registration_number,
                email,
                password_hash,
                created_at,
                department,
                year,
                hostel,
                bio,
                preferences_json,
            ),
        )
        connection.commit()
        return connection.execute(
            "SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    finally:
        if owns_connection:
            connection.close()


def delete_user_cascade(
    user_id: int, connection: sqlite3.Connection | None = None
) -> None:
    """Fully removes a user and everything owned by them - conversation
    messages, conversations, and sessions - then the user row itself.
    SQLite doesn't enforce foreign keys by default here (see auth_db.py's
    docstring), so each table is cleared explicitly in dependency order
    rather than relying on ON DELETE CASCADE. This is what makes a demo
    account 'disappear after logout': see
    app/services/auth_service.py's logout() and
    sweep_expired_demo_users() below, the only two callers."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        connection.execute(
            """
            DELETE FROM conversation_messages
            WHERE conversation_id IN (
                SELECT id FROM conversations WHERE user_id = ?
            )
            """,
            (user_id,),
        )
        connection.execute("DELETE FROM conversations WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
        connection.commit()
    finally:
        if owns_connection:
            connection.close()


def sweep_expired_demo_users(connection: sqlite3.Connection | None = None) -> None:
    """Best-effort cleanup for demo accounts whose visitor closed the tab
    instead of clicking Logout - the one case a normal logout can't catch,
    since there's no request to hook the cleanup onto. Called once at the
    start of every new demo-session request (see
    auth_service.create_demo_session()) rather than on a schedule: this is
    a single-process student project with no background job runner, so
    "clean up stale demo rows right before creating a new one" is the
    simplest correct trigger available - a demo row can only ever outlive
    its own session's expiry by, at most, the time until the next visitor
    clicks 'Try Demo'. A demo user counts as abandoned once every session
    row that ever pointed at it has expired (or it never had one, which
    shouldn't happen in practice but is handled the same way rather than
    left behind forever)."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        now = datetime.now(timezone.utc).isoformat()
        stale_ids = [
            row["id"]
            for row in connection.execute(
                """
                SELECT id FROM users
                WHERE is_demo = 1
                AND id NOT IN (
                    SELECT user_id FROM sessions WHERE expires_at > ?
                )
                """,
                (now,),
            )
        ]
        for user_id in stale_ids:
            delete_user_cascade(user_id, connection=connection)
    finally:
        if owns_connection:
            connection.close()


def get_user_by_email(
    email: str, connection: sqlite3.Connection | None = None
) -> sqlite3.Row | None:
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        return connection.execute(
            "SELECT * FROM users WHERE email = ?", (email,)
        ).fetchone()
    finally:
        if owns_connection:
            connection.close()


def get_user_by_registration_number(
    registration_number: str, connection: sqlite3.Connection | None = None
) -> sqlite3.Row | None:
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        return connection.execute(
            "SELECT * FROM users WHERE registration_number = ?",
            (registration_number,),
        ).fetchone()
    finally:
        if owns_connection:
            connection.close()


def get_user_by_id(
    user_id: int, connection: sqlite3.Connection | None = None
) -> sqlite3.Row | None:
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        return connection.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    finally:
        if owns_connection:
            connection.close()


def update_user_profile(
    user_id: int,
    *,
    full_name: str,
    department: str,
    year: str,
    hostel: str | None,
    bio: str | None,
    connection: sqlite3.Connection | None = None,
) -> sqlite3.Row:
    """Persist the editable profile fields for one user and return the
    updated row. email and registration_number are deliberately absent
    from both the parameters and the UPDATE below - see
    auth_service.update_profile()'s docstring for why those two stay
    read-only from this endpoint."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        connection.execute(
            """
            UPDATE users
            SET full_name = ?, department = ?, year = ?, hostel = ?, bio = ?
            WHERE id = ?
            """,
            (full_name, department, year, hostel, bio, user_id),
        )
        connection.commit()
        return connection.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    finally:
        if owns_connection:
            connection.close()


def touch_last_login(
    user_id: int, connection: sqlite3.Connection | None = None
) -> sqlite3.Row:
    """Stamps last_login_at to now and returns the updated row. Called by
    auth_service.signup() and authenticate() on every successful signup or
    login - this is the one real, server-recorded timestamp the Profile
    page's "Last Login" stat reads, never inferred from session rows
    (which get deleted on logout and don't preserve history)."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        now = datetime.now(timezone.utc).isoformat()
        connection.execute(
            "UPDATE users SET last_login_at = ? WHERE id = ?", (now, user_id)
        )
        connection.commit()
        return connection.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    finally:
        if owns_connection:
            connection.close()


def update_user_preferences(
    user_id: int,
    preferences_json: str,
    connection: sqlite3.Connection | None = None,
) -> sqlite3.Row:
    """Overwrite the stored preferences blob for one user and return the
    updated row. preferences_json is already-serialized JSON (see
    auth_service.update_preferences(), which owns validation and
    json.dumps()) - this layer just persists whatever string it's given,
    same as every other function here."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        connection.execute(
            "UPDATE users SET preferences_json = ? WHERE id = ?",
            (preferences_json, user_id),
        )
        connection.commit()
        return connection.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    finally:
        if owns_connection:
            connection.close()


def create_session(
    *,
    user_id: int,
    token: str,
    ttl_hours: int,
    connection: sqlite3.Connection | None = None,
) -> sqlite3.Row:
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=ttl_hours)
        connection.execute(
            """
            INSERT INTO sessions (token, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (token, user_id, now.isoformat(), expires_at.isoformat()),
        )
        connection.commit()
        return connection.execute(
            "SELECT * FROM sessions WHERE token = ?", (token,)
        ).fetchone()
    finally:
        if owns_connection:
            connection.close()


def get_session_with_user(
    token: str, connection: sqlite3.Connection | None = None
) -> sqlite3.Row | None:
    """One joined row carrying both the session's expiry and the user's
    fields, so auth_service.get_user_from_token() can check expiry and
    build the public user object from a single query instead of two round
    trips on every authenticated request (every /api/auth/me call, and
    implicitly every future route that adds the same dependency)."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        return connection.execute(
            """
            SELECT sessions.token AS session_token,
                   sessions.expires_at AS session_expires_at,
                   users.*
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()
    finally:
        if owns_connection:
            connection.close()


def delete_session(
    token: str, connection: sqlite3.Connection | None = None
) -> None:
    """Deleting the row is what logging out means server-side - see
    auth_db.py's docstring for why an opaque, revocable session token was
    chosen over a self-contained JWT."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        connection.execute("DELETE FROM sessions WHERE token = ?", (token,))
        connection.commit()
    finally:
        if owns_connection:
            connection.close()
