"""
SQLite storage for Campus Expert user accounts, authentication sessions,
and (as of the chat-history feature) each user's saved conversations.

Conversations live in this same file, not a separate one, because they
have a real foreign key to users(id) - SQLite doesn't support foreign keys
across separate database files without ATTACH, so "one row per
conversation, owned by one user" only works cleanly if both tables are in
the same database. The module is still named auth_db.py rather than
something more generic; a rename would touch every file that imports it
for a cosmetic reason, so it was left as-is - worth revisiting if more
user-owned data shows up later.

WHY A SEPARATE DATABASE FILE FROM knowledge.db
------------------------------------------------
app/data/db.py owns the crawled knowledge base (content chunks + embeddings)
- a dataset that only changes when ingest.py is re-run. User accounts and
login sessions are a completely different kind of data (written on every
signup/login, read on every authenticated request), so this keeps them in
their own file rather than mixing schemas in knowledge.db. Same "one file,
no server, stdlib sqlite3" reasoning as db.py - a student project's user
table is at most a few hundred rows.

SCHEMA
------
users: one row per account. email and registration_number both have a
UNIQUE index - that index is the real source of truth for "no duplicates",
not just an application-level check. app/services/auth_service.py checks
for an existing row first so it can return a friendly, specific error
message, but the index is what guarantees correctness even under a race
between two near-simultaneous signups.

sessions: one row per active login. token is an opaque, unguessable random
string (see app/services/security.py's generate_session_token()), issued
at signup/login and handed back to the frontend to store and send as
`Authorization: Bearer <token>`. Deleting a session's row IS what "logging
out" means server-side - no separate blocklist to maintain, which is the
main practical advantage of an opaque server-side token over a
self-contained JWT here: revocation is a plain DELETE.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

# One file, next to this module - same convention as app/data/db.py.
DB_PATH = Path(__file__).resolve().parent / "auth.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name           TEXT NOT NULL,
    registration_number TEXT NOT NULL,
    email               TEXT NOT NULL,
    password_hash       TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    department          TEXT,
    year                TEXT,
    hostel              TEXT,
    bio                 TEXT,
    preferences_json    TEXT NOT NULL DEFAULT '{}',
    last_login_at       TEXT,
    is_demo             INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
    ON users (email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_registration_number
    ON users (registration_number);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON sessions (user_id);

-- One row per saved chat. title is derived from the first user message
-- (see app/api/chat.py's _derive_conversation_title()) and never changes
-- after that - simple, predictable, matches how most chat products title
-- a conversation. updated_at is bumped every time a message is added
-- (app/data/conversation_store.py's touch_conversation()) and is what
-- "most recently updated" ordering in the sidebar sorts on.
CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users (id),
    title      TEXT NOT NULL DEFAULT 'New Chat',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
    ON conversations (user_id);

-- One row per message in a conversation, in both directions (role is
-- "user" or "assistant"). sources_json stores the same Source list the
-- frontend already renders as source cards, serialized with json.dumps()
-- so a restored conversation shows the exact citations it originally had
-- - never recomputed by re-running retrieval on old messages.
CREATE TABLE IF NOT EXISTS conversation_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations (id),
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    sources_json    TEXT NOT NULL DEFAULT '[]',
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id
    ON conversation_messages (conversation_id);
"""


# Nullable columns added to `users` after the original table shipped.
# CREATE TABLE IF NOT EXISTS in _SCHEMA above only helps a brand-new
# auth.db - it does nothing to a users table that already exists on disk
# from before these columns existed, since SQLite won't retroactively add
# columns for you. _migrate_user_columns() closes that gap: it inspects
# the real table and ALTERs in whatever is missing, so both a fresh
# database and the existing auth.db (already populated with real signups)
# end up with the same schema.
_USER_COLUMN_MIGRATIONS: dict[str, str] = {
    "department": "TEXT",
    "year": "TEXT",
    "hostel": "TEXT",
    "bio": "TEXT",
    # Settings page preferences (theme, font size, notifications, sound),
    # stored as one serialized JSON object rather than a column per setting
    # - the set of preferences is expected to keep growing, and a JSON blob
    # means adding a new one is a frontend/service-layer change only, no
    # further schema migration. NOT NULL DEFAULT '{}' so every existing row
    # (and every new one) always has *some* valid JSON to parse, never NULL.
    "preferences_json": "TEXT NOT NULL DEFAULT '{}'",
    # Set by auth_service.signup()/authenticate() on every successful
    # signup or login (see user_store.touch_last_login()) - the real,
    # server-recorded value the Profile page's Account Statistics section
    # shows as "Last Login". NULL only for a row that predates this column
    # and hasn't logged in again since.
    "last_login_at": "TEXT",
    # Marks a row created by POST /api/auth/demo (see
    # app/services/auth_service.py's create_demo_session()) rather than a
    # real signup. Every other column on a demo row is a normal, real
    # value - same types, same constraints - so nothing else in the app
    # has to treat a demo user as a special case; only the handful of
    # places that specifically need to know (logout's cascade-delete,
    # the frontend's "Demo Mode" indicator and credential-lock) check this
    # flag at all. 0/1 instead of a real boolean since that's what SQLite
    # stores a BOOLEAN column as anyway.
    "is_demo": "INTEGER NOT NULL DEFAULT 0",
}


def _migrate_user_columns(connection: sqlite3.Connection) -> None:
    existing = {row["name"] for row in connection.execute("PRAGMA table_info(users)")}
    for column, column_type in _USER_COLUMN_MIGRATIONS.items():
        if column not in existing:
            connection.execute(f"ALTER TABLE users ADD COLUMN {column} {column_type}")
    connection.commit()


def get_connection() -> sqlite3.Connection:
    """Open a connection to the auth database, creating the schema on first
    use if it doesn't exist yet. Row access by column name (sqlite3.Row),
    matching app/data/db.py's convention."""
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.executescript(_SCHEMA)
    _migrate_user_columns(connection)
    return connection


def init_db() -> None:
    """Explicit schema-creation entry point, e.g. `python -m app.data.auth_db`
    for first-time setup. get_connection() already does this lazily on the
    first real request, so this is a convenience, not a requirement."""
    connection = get_connection()
    connection.close()
    print(f"[auth_db] Auth database ready at {DB_PATH}")


if __name__ == "__main__":
    init_db()
