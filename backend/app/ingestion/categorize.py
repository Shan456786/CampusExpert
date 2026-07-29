"""
Automatic category assignment for a crawled page.

WHY THIS EXISTS
---------------
hybrid_retriever.py's multi-evidence selection (retrieve_multi()) groups
candidates by entry["category"] to decide whether a second piece of
evidence covers a genuinely different topic or is just a redundant second
guess at the same one (see _is_redundant_with_accepted() and the
diversity-first passes in retrieve_multi()). That logic is untouched by
this project - it just needs SOME category string per chunk to group by.

The old hardcoded knowledge base had hand-picked categories ("mess",
"hostel", "medical", ...). A crawled site has no such curation, so this
derives a category automatically from the page's URL path - e.g.
https://vitap.ac.in/hostels -> "hostels". It's a heuristic, not a
guarantee of a "correct" taxonomy: it only works well if the real site's
URL structure is organized by topic in its first path segment.

Checked against the real vitap.ac.in seed list in urls.txt: every
top-level page (hostels, transport, healthcare, cafeteria, ...) gets its
own distinct category with no changes needed. The one real collision was
/allschools/<SCHOOL> (SCOPE, SENSE, SAS, SMEC, VISH, VSB, VSL, SBST) -
without an override, all eight would land in a single "allschools"
category, which would make hybrid_retriever.py's diversity-aware
multi-evidence selection treat two DIFFERENT schools as redundant with
each other (see _is_redundant_with_accepted() in hybrid_retriever.py).
"allschools" -> None below fixes that: it's a pure grouping/index segment,
not a topic itself, so it's skipped in favor of the school-specific
segment after it. Revisit this list again after a real ingestion run if
the site's structure has more collections like this one.
"""

from __future__ import annotations

from urllib.parse import urlparse

# Manual overrides for path segments that don't make good category names
# on their own. A value of None means "this segment is just a
# grouping/index prefix - skip it and use the next path segment instead"
# (see the "allschools" case in the module docstring above). A string
# value means "rename this segment to something clearer".
CATEGORY_OVERRIDES: dict[str, str | None] = {
    "en": None,  # locale prefix, e.g. /en/hostel - skip and use the next segment
    "index.html": None,
    "index.php": None,
    "allschools": None,  # /allschools/SCOPE, /allschools/SENSE, ... - the
    # school name is the real topic, "allschools" is just the listing page
    # they all hang off of
    "allfaculty": "faculty",  # flat listing page, no child segment to fall
    # back to - rename rather than skip, so it isn't left in "general"
}

_FALLBACK_CATEGORY = "general"


def derive_category(url: str) -> str:
    """Return a lowercase, slug-like category derived from the first
    meaningful path segment of url, or _FALLBACK_CATEGORY for the site
    root or a segment with no useful signal (e.g. purely numeric IDs)."""
    path = urlparse(url).path.strip("/")
    if not path:
        return _FALLBACK_CATEGORY

    segments = path.split("/")

    for segment in segments:
        if not segment:
            continue

        override = CATEGORY_OVERRIDES.get(segment.lower())
        if override is None and segment.lower() in CATEGORY_OVERRIDES:
            continue  # explicitly skip this segment, look at the next one
        if override:
            return override

        slug = segment.lower().replace("-", "_").replace(".", "_")
        # Skip segments that are just numbers/IDs (e.g. /news/2024/03) or
        # too short to be a meaningful topic name.
        if slug.isdigit() or len(slug) < 3:
            continue

        return slug

    return _FALLBACK_CATEGORY
