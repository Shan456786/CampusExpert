#!/usr/bin/env python3
"""
Knowledge ingestion CLI - the "update script".

Run this whenever you want to (re)build the knowledge base from the
configured official VIT-AP website URLs:

    cd backend
    python ingest.py

By default this reads its seed URLs from urls.txt (one URL per line, #
for comments) - NOT from anything hardcoded in this file or in
app/ingestion/crawler.py. To expand the knowledge base later, add a new
URL to urls.txt and rerun the command above; no code changes needed, and
the crawler picks up the new source automatically.

--url can also be passed on the command line (repeatable) for an ad-hoc
crawl of a URL not yet added to urls.txt - it's added to whatever's
already in the file, not a replacement for it. Use --urls-file to point
at a different config file entirely (e.g. for a staging list).

Whenever the website changes, just rerun the same command. Ingestion is
idempotent per page: each page's old chunks are deleted and replaced with
freshly-crawled ones, so rerunning refreshes content instead of piling up
duplicates.

PIPELINE
--------
crawl (app/ingestion/crawler.py, network I/O - httpx + BeautifulSoup for
  link discovery, restricted to the configured URLs' own domains)
  -> extract (app/ingestion/extractor.py, strip nav/header/footer/scripts/
     styles via trafilatura, split into heading-anchored sections)
  -> chunk (app/ingestion/chunker.py, split sections into embeddable pieces)
  -> embed (SentenceTransformer - the SAME model semantic_search.py uses
     at runtime, loaded here once for the whole batch)
  -> store (app/data/chunk_store.py, SQLite - dedup via content_hash)

This script is the ONLY place embeddings get computed for the knowledge
base. The FastAPI chat endpoint never re-embeds knowledge entries at
request time - it only embeds the incoming user message and compares it
against the vectors this script already stored (see
app/services/semantic_search.py). That split is what makes "never scrape
or embed during a user query" true.

This script does not run automatically and is never imported by the
FastAPI app - it only runs when you invoke it directly from a terminal.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
from pathlib import Path

# Allow `python ingest.py` to be run from backend/ by making sure backend/
# is on sys.path before importing `app.*` (it already is, in practice,
# since backend/ is this file's own directory - this just makes it
# explicit and robust regardless of how the script gets invoked).
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sentence_transformers import SentenceTransformer  # noqa: E402

from app.data.chunk_store import (  # noqa: E402
    count_chunks,
    delete_chunks_for_url,
    insert_chunk,
)
from app.data.db import get_connection  # noqa: E402
from app.ingestion.categorize import derive_category  # noqa: E402
from app.ingestion.chunker import chunk_sections  # noqa: E402
from app.ingestion.crawler import crawl  # noqa: E402
from app.ingestion.extractor import extract_page  # noqa: E402

# Reusing the exact model name semantic_search.py uses at runtime
# ("using the existing embedding model") rather than a second hardcoded
# string, so the two can never silently drift apart.
from app.services.semantic_search import _MODEL_NAME  # noqa: E402


# Default location of the URL config file - a plain text file, not a
# format requiring a new parser dependency (YAML was the other option on
# the table; txt was chosen since a flat list of URLs doesn't need YAML's
# structure, and it's trivially editable by hand - one URL per line).
DEFAULT_URLS_FILE = Path(__file__).resolve().parent / "urls.txt"


def _load_urls_from_file(path: Path) -> list[str]:
    """Read seed URLs from a config file: one URL per line, blank lines
    and lines starting with # ignored. Returns [] (not an error) if the
    file doesn't exist yet - main() decides whether an empty URL list is
    fatal, this function just reports what it found."""
    if not path.exists():
        return []

    urls = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        urls.append(line)
    return urls


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def _content_hash(text: str) -> str:
    """Stable fingerprint of a chunk's own text, used for de-duplication
    and to make re-ingestion idempotent. Hashing the raw chunk text (not
    the context-prefixed text sent to the embedding model, see
    _build_embedding_text below) means the same underlying fact only gets
    stored once even if it's phrased identically on two different pages."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _build_embedding_text(page_title: str, heading: str, chunk_text: str) -> str:
    """What actually gets embedded for one chunk - the chunk's own text,
    prefixed with its page title and section heading.

    Without this, a chunk like "Gates close at 9:30 PM on weekdays" is
    embedded with no idea it's about the HOSTEL - the embedding model has
    to guess from four words alone. Prepending the title/heading gives the
    same disambiguating context a human reader gets from seeing where the
    sentence sits on the page, which measurably improves how well the
    resulting vector matches on-topic questions.
    """
    parts = [p for p in (page_title, heading, chunk_text) if p]
    return ". ".join(parts)


def run_ingestion(
    seed_urls: list[str],
    *,
    max_pages: int,
    max_depth: int,
    delay_seconds: float,
    source_type: str,
) -> None:
    print(f"[ingest] Starting ingestion for {len(seed_urls)} seed URL(s):")
    for url in seed_urls:
        print(f"  - {url}")

    started_at = time.monotonic()

    print("\n[ingest] Loading embedding model...")
    model = SentenceTransformer(_MODEL_NAME)

    print(f"\n[ingest] Crawling (max_pages={max_pages}, max_depth={max_depth})...")
    pages = crawl(
        seed_urls,
        max_pages=max_pages,
        max_depth=max_depth,
        delay_seconds=delay_seconds,
    )
    print(f"[ingest] Crawl complete: {len(pages)} page(s) fetched.")

    connection = get_connection()

    pages_with_content = 0
    chunks_stored = 0
    chunks_skipped_duplicate = 0

    for page in pages:
        extracted = extract_page(page.url, page.html)
        if extracted is None:
            print(f"[ingest]   (no usable content) {page.url}")
            continue

        chunks = chunk_sections(extracted.sections)
        if not chunks:
            print(f"[ingest]   (no chunks after splitting) {page.url}")
            continue

        category = derive_category(page.url)

        # Refresh semantics: replace this page's previously-stored chunks
        # entirely before inserting the newly-crawled ones, so a page that
        # changed (or shrank) never leaves stale chunks behind.
        removed = delete_chunks_for_url(connection, page.url)
        if removed:
            print(f"[ingest]   Refreshing {page.url} ({removed} old chunk(s) removed)")

        embedding_texts = [
            _build_embedding_text(extracted.title, chunk.heading, chunk.text)
            for chunk in chunks
        ]
        embeddings = model.encode(embedding_texts, normalize_embeddings=True)

        page_chunks_stored = 0
        for chunk, embedding in zip(chunks, embeddings):
            content_hash = _content_hash(chunk.text)
            inserted = insert_chunk(
                connection,
                source_url=page.url,
                page_title=extracted.title,
                section_heading=chunk.heading,
                category=category,
                chunk_text=chunk.text,
                chunk_index=chunk.index,
                content_hash=content_hash,
                embedding=embedding,
                source_type=source_type,
            )
            if inserted:
                chunks_stored += 1
                page_chunks_stored += 1
            else:
                chunks_skipped_duplicate += 1

        if page_chunks_stored:
            pages_with_content += 1
        print(
            f"[ingest]   {page.url}: {len(chunks)} chunk(s) extracted, "
            f"{page_chunks_stored} stored, category={category!r}"
        )

    connection.close()

    elapsed = time.monotonic() - started_at
    total_chunks_now = count_chunks()

    print("\n[ingest] Done.")
    print(f"[ingest]   Pages crawled:            {len(pages)}")
    print(f"[ingest]   Pages with usable content: {pages_with_content}")
    print(f"[ingest]   Chunks stored this run:    {chunks_stored}")
    print(f"[ingest]   Chunks skipped (duplicate content): {chunks_skipped_duplicate}")
    print(f"[ingest]   Total chunks now in database: {total_chunks_now}")
    print(f"[ingest]   Elapsed: {elapsed:.1f}s")
    print(
        "\n[ingest] Restart the FastAPI backend (or call warm_up() again) so "
        "it picks up the refreshed knowledge base - embeddings are loaded "
        "once at startup, not re-read on every request."
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Crawl the configured official VIT-AP website URLs, extract and "
            "chunk their content, embed it, and store it in the SQLite "
            "knowledge base used by Campus Expert's retrieval pipeline."
        )
    )
    parser.add_argument(
        "--url",
        action="append",
        dest="urls",
        default=None,
        help=(
            "An extra seed URL to crawl, on top of whatever is already in "
            "the config file (default urls.txt). Repeatable. Optional - "
            "the normal workflow is to edit the config file instead of "
            "passing this."
        ),
    )
    parser.add_argument(
        "--urls-file",
        type=Path,
        default=DEFAULT_URLS_FILE,
        help=(
            "Path to the config file listing seed URLs, one per line "
            f"(default: {DEFAULT_URLS_FILE})."
        ),
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=200,
        help="Maximum total pages to crawl across all seed URLs (default: 200).",
    )
    parser.add_argument(
        "--max-depth",
        type=int,
        default=4,
        help="Maximum link-following depth from each seed URL (default: 4).",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.5,
        help="Seconds to wait between page fetches, for politeness (default: 0.5).",
    )
    parser.add_argument(
        "--source-type",
        default="official",
        help=(
            "Value stored as source_type for every chunk from this run "
            "(default: 'official'). The frontend shows a Verified badge "
            "when this contains 'official' or 'verified' - see "
            "SourceCard.tsx's getVerificationStatus()."
        ),
    )
    args = parser.parse_args()

    file_urls = _load_urls_from_file(args.urls_file)
    cli_urls = args.urls or []
    seed_urls = _dedupe_preserve_order(file_urls + cli_urls)

    if not seed_urls:
        parser.error(
            f"No URLs to crawl. Add some to {args.urls_file}, or pass "
            "--url at least once."
        )

    if file_urls:
        print(f"[ingest] Loaded {len(file_urls)} URL(s) from {args.urls_file}")
    if cli_urls:
        print(f"[ingest] Plus {len(cli_urls)} URL(s) from --url")

    run_ingestion(
        seed_urls,
        max_pages=args.max_pages,
        max_depth=args.max_depth,
        delay_seconds=args.delay,
        source_type=args.source_type,
    )


if __name__ == "__main__":
    main()
