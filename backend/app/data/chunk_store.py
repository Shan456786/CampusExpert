"""
Data-access layer for the knowledge_chunks table (see db.py for schema).

Every function here does ONE thing to the database: insert, delete, or
read. Ingestion (app/ingestion/, ingest.py) is the only code that
calls the write functions; the runtime chat pipeline (app/data/knowledge.py,
semantic_search.py) only ever calls get_all_chunks(). That split is what
actually guarantees the chatbot can't scrape or write during a user
request - the write functions are simply never imported by anything on the
request path, not just "not called".
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

import numpy as np

from app.data.db import get_connection


def delete_chunks_for_url(connection: sqlite3.Connection, source_url: str) -> int:
    """Remove every chunk previously stored for one page. Ingestion calls
    this right before re-inserting a page's freshly-crawled chunks, so
    re-running ingestion on a page that changed replaces its old content
    instead of accumulating duplicates or leaving stale text alongside the
    new version (requirement 10: rerun to refresh)."""
    cursor = connection.execute(
        "DELETE FROM knowledge_chunks WHERE source_url = ?", (source_url,)
    )
    connection.commit()
    return cursor.rowcount


def insert_chunk(
    connection: sqlite3.Connection,
    *,
    source_url: str,
    page_title: str,
    section_heading: str,
    category: str,
    chunk_text: str,
    chunk_index: int,
    content_hash: str,
    embedding: np.ndarray,
    source_type: str = "official",
) -> bool:
    """Insert one chunk. Returns False (inserting nothing) if content_hash
    already exists - the UNIQUE index on content_hash is what actually
    enforces this; the resulting IntegrityError is caught here so a
    duplicate paragraph appearing on two different pages (e.g. a repeated
    disclaimer) doesn't crash ingestion, it's just silently skipped
    (requirement 4: ignore duplicate content).

    embedding is stored as raw float32 bytes rather than JSON text - a
    384-dim float32 vector is 1536 bytes as a BLOB, versus several times
    that as a JSON array of decimal strings, and reading it back is one
    np.frombuffer() call (see get_all_chunks() below).
    """
    embedding_f32 = np.asarray(embedding, dtype=np.float32)

    try:
        connection.execute(
            """
            INSERT INTO knowledge_chunks (
                source_url, page_title, section_heading, category,
                chunk_text, chunk_index, content_hash,
                embedding, embedding_dim, source_type, ingested_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source_url,
                page_title,
                section_heading,
                category,
                chunk_text,
                chunk_index,
                content_hash,
                embedding_f32.tobytes(),
                embedding_f32.shape[0],
                source_type,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        connection.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def get_all_chunks(connection: sqlite3.Connection | None = None) -> list[dict]:
    """Load every stored chunk as a plain dict, embedding decoded back into
    a numpy array. This is the ONLY function the runtime retrieval pipeline
    calls (via app/data/knowledge.py) - a pure read, no network access, no
    embedding model involved, which is what makes "never scrape or embed
    during a user query" true by construction rather than by convention.
    """
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()

    try:
        rows = connection.execute(
            "SELECT * FROM knowledge_chunks ORDER BY id"
        ).fetchall()
    finally:
        if owns_connection:
            connection.close()

    chunks = []
    for row in rows:
        embedding = np.frombuffer(row["embedding"], dtype=np.float32)
        chunks.append(
            {
                "id": row["id"],
                "source_url": row["source_url"],
                "page_title": row["page_title"],
                "section_heading": row["section_heading"],
                "category": row["category"],
                "chunk_text": row["chunk_text"],
                "content_hash": row["content_hash"],
                "source_type": row["source_type"],
                "embedding": embedding,
            }
        )
    return chunks


def count_chunks(connection: sqlite3.Connection | None = None) -> int:
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        row = connection.execute("SELECT COUNT(*) AS n FROM knowledge_chunks").fetchone()
        return int(row["n"])
    finally:
        if owns_connection:
            connection.close()


def distinct_source_urls(connection: sqlite3.Connection | None = None) -> list[str]:
    """Every page currently represented in the knowledge base."""
    owns_connection = connection is None
    if connection is None:
        connection = get_connection()
    try:
        rows = connection.execute(
            "SELECT DISTINCT source_url FROM knowledge_chunks"
        ).fetchall()
    finally:
        if owns_connection:
            connection.close()
    return [row["source_url"] for row in rows]
