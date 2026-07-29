"""
SQLite storage for the Campus Expert knowledge base.

WHY SQLITE
----------
Campus Expert used to keep its knowledge base as a hardcoded Python list
(app/data/knowledge.py). That doesn't scale past a handful of hand-written
demo entries, and every content update meant editing code.

This module replaces that with a small SQLite database of content chunks
pulled from the official VIT-AP website by the ingestion pipeline
(app/ingestion/ + ingest.py). SQLite specifically, not Postgres or
similar - a single university's public website produces at most a few
thousand chunks, so a separate database server would be overkill. SQLite is
one file, needs no setup, and Python's stdlib talks to it directly.

WHAT LIVES HERE VS ELSEWHERE
-----------------------------
This file only knows about the SQLite file and its schema: connecting,
creating tables, enforcing the on-disk shape of a chunk row. Reading rows
back into the shape hybrid_retriever.py expects is chunk_store.py's job;
deciding what to crawl and how to chunk text is app/ingestion/'s job.
Keeping this file schema-only makes it easy to verify there's no scraping,
no embedding, and no retrieval logic anywhere in it.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

# One file, next to this module - not configurable via env var on purpose,
# so "where is the knowledge base" has a single obvious answer during
# development. Change this constant directly if a deployment needs a
# different path (e.g. a mounted volume).
DB_PATH = Path(__file__).resolve().parent / "knowledge.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_url      TEXT NOT NULL,
    page_title      TEXT NOT NULL DEFAULT '',
    section_heading TEXT NOT NULL DEFAULT '',
    category        TEXT NOT NULL DEFAULT 'general',
    chunk_text      TEXT NOT NULL,
    chunk_index     INTEGER NOT NULL DEFAULT 0,
    content_hash    TEXT NOT NULL,
    embedding       BLOB NOT NULL,
    embedding_dim   INTEGER NOT NULL,
    source_type     TEXT NOT NULL DEFAULT 'official',
    ingested_at     TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_chunks_content_hash
    ON knowledge_chunks (content_hash);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source_url
    ON knowledge_chunks (source_url);
"""


def get_connection() -> sqlite3.Connection:
    """Open a connection to the knowledge database, creating the schema on
    first use if it doesn't exist yet. Row access by column name
    (sqlite3.Row) so calling code reads row["chunk_text"] rather than a
    brittle positional index."""
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.executescript(_SCHEMA)
    return connection


def init_db() -> None:
    """Explicit schema-creation entry point for ops tooling / first-time
    setup. get_connection() already does this lazily, but having a named
    function makes `python -m app.data.db` a valid "just create the empty
    database file" command, useful before the first ingestion run."""
    connection = get_connection()
    connection.close()
    print(f"[db] Knowledge database ready at {DB_PATH}")


if __name__ == "__main__":
    init_db()
