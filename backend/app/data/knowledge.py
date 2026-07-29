# Campus Expert - Knowledge Base Loader
#
# HISTORY / WHY THIS FILE LOOKS THE WAY IT DOES
# ------------------------------------------------
# v1: hardcoded Python list.
# v2: SQLite database of chunks pulled from the real VIT-AP website by a
#     crawl-and-embed ingestion pipeline (app/ingestion/, ingest.py). That
#     pipeline never actually ran successfully - the database stayed empty.
# v3: replaced with a single hand-authored knowledge_base.json (22 demo
#     entries, source_type="demo") for a reliable keyword-matched prototype.
# v4: real facts fetched live from vitap.ac.in and cited, split into one
#     JSON file per topic under app/data/knowledge/ instead of one flat
#     file, so the knowledge base can be extended one category at a time
#     without touching this loader or the retrieval code. 12 categories,
#     {id, title, keywords, content, source, source_type, last_updated}
#     schema - category was derived purely from the filename and never
#     stored in the JSON itself.
# v5 (current): expanded to 17 categories (added faculty, contacts,
#     student_resources, campus_map, important_dates) and widened the
#     entry schema with two fields: "aliases" (natural rephrasings of a
#     question, scored alongside keywords - see
#     app/services/knowledge_retriever.py) and an explicit "category"
#     field stored directly on each entry. category is still auto-derived
#     from the filename as a fallback (so the "just add a file" workflow
#     from v4 still works with zero code changes), but an entry's own
#     "category" value - if present and non-empty - now wins. This lets a
#     category be reassigned by editing one field instead of moving the
#     entry to a different file, and lets one file hold entries for more
#     than one category if that's ever useful.
#
# app/ingestion/, ingest.py, app/data/db.py, app/data/chunk_store.py, and
# app/services/semantic_search.py still exist on disk but are not imported
# by anything on the live request path.
#
# DIRECTORY LAYOUT
# ------------------
# app/data/knowledge/<category>.json - one file per topic: academics,
# attendance, library, hostel, mess, transport, examinations, fees,
# medical, clubs, placements, faculty, campus_services, contacts,
# student_resources, campus_map, important_dates. The <category> part of
# the filename is the DEFAULT category for every entry in that file -
# see "category" below for how an entry can override it.
#
# Each file holds a JSON array of entries shaped:
#   {id, title, keywords, aliases, content, category, source, source_type,
#    last_updated}
# - id: unique across the whole knowledge base (not just within one file).
# - title: short label for the fact (used for retrieval + shown as the
#   Source card's title in the UI).
# - keywords: list of words/phrases used for keyword/topic matching - see
#   app/services/knowledge_retriever.py.
# - aliases: list of natural rephrasings a student might actually type
#   ("how do I get my transcripts" for an entry whose keywords are more
#   like "coe", "exam", "transcripts") - scored alongside keywords, at a
#   slightly lower weight since aliases are looser paraphrases rather than
#   exact domain terms. Optional in spirit but required in the schema (an
#   empty list [] is valid - it's fine for a term-heavy entry to have
#   nothing meaningfully different to add here).
# - content: the actual fact, in plain sentences. This is what gets shown
#   to the student (directly, or rephrased by the LLM) and what the LLM is
#   grounded in - never invent content here that isn't traceable to the
#   `source` URL.
# - category: which topic this entry belongs to. May be omitted or left
#   empty, in which case it defaults to the filename (<category>.json) -
#   this is what keeps the "drop in a new file, zero code changes" story
#   intact. If set to a non-empty value, that value wins over the
#   filename, so an entry can belong to a different category than the
#   file it physically lives in when that's genuinely clearer.
# - source: the real URL (or PDF link) this fact was pulled from. Shown to
#   the student as a clickable source card - see Source.source_url in
#   app/schemas/chat.py and frontend/components/chat/SourceCard.tsx.
# - source_type: "official" for facts confirmed on vitap.ac.in, "unverified"
#   for entries that are honest about a gap in public information rather
#   than a confirmed fact (see attendance.json) - never "official" just
#   because it sounds authoritative.
# - last_updated: the date this fact was last confirmed against its source
#   (ISO format, YYYY-MM-DD). For vitap.ac.in pages this is the page's own
#   "Last updated on ..." footer date at the time it was fetched, not an
#   arbitrary today's-date stamp.
#
# ADDING MORE FACTS
# --------------------
# To extend coverage: add more entries to an existing category file, or
# create a new <category>.json file. No code changes needed - this loader
# picks up every *.json file in the directory automatically, and every
# category is auto-registered for retrieval and ranking (see
# app/services/knowledge_retriever.py) purely from what's on disk.
#
# RUNTIME BEHAVIOR
# -----------------
# CAMPUS_KNOWLEDGE is read from disk ONCE, at import time. No network
# access, no scraping, no embedding-model calls happen on the request path.

from __future__ import annotations

import json
from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"

# "category" is deliberately NOT in this set - it's optional per-entry
# (falls back to the filename, see _load_category_file()), so requiring
# it here would reject perfectly valid entries that rely on that
# fallback. "aliases" IS required, matching the documented schema, but an
# empty list satisfies it - the point is that the key must be present and
# a list, not that every entry must actually have alternate phrasings.
_REQUIRED_FIELDS = {
    "id", "title", "keywords", "aliases", "content", "source",
    "source_type", "last_updated",
}


def _load_category_file(path: Path) -> list[dict]:
    """Load and validate one <category>.json file. Fails safe: a malformed
    file is skipped with a warning rather than crashing the whole server,
    same principle as the rest of this loader."""
    default_category = path.stem

    try:
        with path.open("r", encoding="utf-8") as f:
            entries = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[knowledge] ERROR: could not read {path}: {exc}")
        return []

    if not isinstance(entries, list):
        print(
            f"[knowledge] ERROR: {path} must contain a JSON array of "
            "entries - got something else. Skipping this category."
        )
        return []

    valid_entries = []
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict) or not _REQUIRED_FIELDS.issubset(entry.keys()):
            print(
                f"[knowledge] WARNING: skipping entry at index {index} in "
                f"{path.name} - missing one of {sorted(_REQUIRED_FIELDS)}."
            )
            continue
        if not isinstance(entry.get("aliases"), list):
            print(
                f"[knowledge] WARNING: skipping entry at index {index} in "
                f"{path.name} - 'aliases' must be a list (use [] if there "
                "are none)."
            )
            continue

        # An entry's own "category" wins if it's a non-empty string;
        # otherwise fall back to the filename - see the module docstring's
        # "category" field description for why both paths are supported.
        own_category = entry.get("category")
        category = own_category if isinstance(own_category, str) and own_category.strip() else default_category
        entry = {**entry, "category": category}
        valid_entries.append(entry)

    return valid_entries


def _load_knowledge_base() -> list[dict]:
    if not KNOWLEDGE_DIR.exists() or not KNOWLEDGE_DIR.is_dir():
        print(
            f"[knowledge] WARNING: {KNOWLEDGE_DIR} not found. Every "
            "question will fall back to the out-of-domain response until "
            "this directory exists with at least one <category>.json file."
        )
        return []

    category_files = sorted(KNOWLEDGE_DIR.glob("*.json"))
    if not category_files:
        print(
            f"[knowledge] WARNING: {KNOWLEDGE_DIR} exists but contains no "
            ".json files. Knowledge base is empty."
        )
        return []

    all_entries: list[dict] = []
    seen_ids: set[str] = set()
    for path in category_files:
        for entry in _load_category_file(path):
            if entry["id"] in seen_ids:
                print(
                    f"[knowledge] WARNING: duplicate entry id "
                    f"{entry['id']!r} in {path.name} - skipping the "
                    "duplicate. Entry ids must be unique across every "
                    "category file."
                )
                continue
            seen_ids.add(entry["id"])
            all_entries.append(entry)

    return all_entries


# Loaded once at import time.
CAMPUS_KNOWLEDGE: list[dict] = _load_knowledge_base()
