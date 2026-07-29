"""
Deterministic keyword/intent retrieval for the Campus Expert chat engine.

WHY THIS EXISTS, AND WHAT IT REPLACES
----------------------------------------
This project previously used hybrid retrieval: lexical (keyword) scoring
combined with sentence-embedding semantic similarity, plus a fairly
elaborate multi-rule confidence-gating system to decide when the blended
score was trustworthy enough to answer from. That system worked, but it
depended on a real, populated, embedded knowledge base (an ingestion
pipeline that crawled and embedded the live VIT-AP site), which never
actually got populated in practice - see app/data/knowledge.py's docstring
for the full history.

Per an explicit decision to prioritize a reliable, easy-to-reason-about
prototype over a research-grade RAG system, this module replaces that
whole stack with something much simpler:

  - No embeddings, no vector similarity, no ML model loaded at all.
  - A small, hand-authored, but now multi-category knowledge base
    (app/data/knowledge.py, loading every app/data/knowledge/*.json file -
    17 categories as of this writing, and growing without any code
    changes here - see that module's docstring), not a live crawl.
  - Pure keyword/phrase matching to decide what's relevant - the same
    core scoring signals the old hybrid_retriever.py used for its lexical
    half (exact phrase match, single-word keyword match, keyword/question
    token overlap, category-name hint), plus a matching set of signals
    for each entry's "aliases" (natural rephrasings, scored at a slightly
    lower weight - see the ALIAS_* constants) and an explicit
    category-ranking step (_rank_categories()) that decides which TOPICS
    a question is most about before picking individual entries.
  - A single, low bar to accept a match, and NO complex evidence-gating
    rules - per the "fallback only if absolutely no topic matches"
    requirement, this is deliberately permissive: real keyword evidence,
    however small, is treated as a match.

app/services/semantic_search.py and app/services/hybrid_retriever.py are
no longer imported by anything on the live request path after this
change - they're dead code, kept on disk rather than deleted (not
guaranteed to be safely deletable from every environment this project
runs in), in case a future, better-resourced iteration wants a real
semantic layer back.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.data.knowledge import CAMPUS_KNOWLEDGE

# ---------------------------------------------------------------------------
# Tunable constants
# ---------------------------------------------------------------------------

# Points awarded per signal when scoring one entry against the query.
# Same relative weighting the old lexical scorer used: an exact multi-word
# phrase match is the strongest possible signal, a single keyword is
# weaker, and generic token overlap / the category name appearing in the
# query are the weakest, "maybe relevant" signals.
EXACT_PHRASE_MATCH_WEIGHT = 4.0
SINGLE_WORD_KEYWORD_WEIGHT = 1.0
KEYWORD_TOKEN_OVERLAP_WEIGHT = 0.5
TITLE_TOKEN_OVERLAP_WEIGHT = 0.5
CATEGORY_HINT_WEIGHT = 1.0

# Aliases (natural rephrasings a student might actually type, e.g. "how do
# I get my transcripts" for an entry whose keywords are "coe"/"exam"/
# "transcripts") score on the same signals as keywords, at a slightly
# lower weight. Not because an alias match is less trustworthy - it's
# because aliases are looser, longer, hand-written paraphrases rather
# than tight domain terms, so an exact match on one is a very strong
# signal but token overlap is more likely to be coincidental (a common
# word shared between an alias sentence and the query, rather than the
# query actually being about that alias).
ALIAS_PHRASE_MATCH_WEIGHT = 3.0
ALIAS_SINGLE_WORD_WEIGHT = 0.75
ALIAS_TOKEN_OVERLAP_WEIGHT = 0.4

# The bar an entry's score has to clear to be considered a match at all.
# Deliberately low and permissive - requirement 6 is "only use the
# fallback if absolutely no topic matches", not "only answer when very
# confident". 1.0 means "at least one real single-word keyword hit, or
# equivalent" - essentially any non-accidental keyword overlap counts.
MIN_MATCH_SCORE = 1.0

# Hard ceiling on how many entries one answer can be grounded in - keeps
# the LLM prompt small and keeps the UI from showing a wall of source
# cards for one question. Only the single best-scoring entry PER CATEGORY
# is eligible, so this is really "at most N distinct topics per answer".
MAX_RESULTS = 3

# Print which entries matched and why, to the backend terminal, for every
# request. Never exposed to the frontend/API response. Much simpler output
# than the old hybrid debug trace, since there's much less to explain now.
DEBUG_RETRIEVAL = True

# ---------------------------------------------------------------------------
# Text normalization
# ---------------------------------------------------------------------------

# Words too generic to tell entries apart - grammatical glue plus a few
# domain words that appear across nearly every entry (so matching on them
# alone says nothing about which specific entry is meant). Unchanged from
# the old hybrid_retriever.py's list.
GENERIC_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "do", "does", "did",
    "i", "my", "me", "you", "your", "we", "our", "it", "its", "am", "be",
    "been", "and", "or", "of", "to", "for", "on", "in", "at", "by", "with",
    "what", "where", "when", "how", "who", "which", "can", "could",
    "should", "would", "please", "need", "want", "tell", "about",
    "there", "here", "this", "that", "these", "those",
    "campus", "student", "students", "university", "information", "info",
    "timing", "timings", "schedule", "details", "detail",
}

_TOKEN_PATTERN = re.compile(r"[a-z0-9']+")


def _normalize(text: str) -> str:
    return text.lower().strip()


def _tokenize(text: str) -> list[str]:
    return _TOKEN_PATTERN.findall(text.lower())


def _meaningful_tokens(text: str) -> set[str]:
    return {token for token in _tokenize(text) if token not in GENERIC_WORDS}


# ---------------------------------------------------------------------------
# Precomputed keyword profile per knowledge base entry - built once, at
# import time, same principle the old cached embeddings/lexical profiles
# used: no reason to re-tokenize the same ~20 entries on every request.
# ---------------------------------------------------------------------------

@dataclass
class _KeywordProfile:
    entry: dict
    multi_word_keywords: list[str]
    single_word_keywords: set[str]
    keyword_tokens: set[str]
    multi_word_aliases: list[str]
    single_word_aliases: set[str]
    alias_tokens: set[str]
    title_tokens: set[str]
    category: str
    # Individual, non-generic words in the category name, split on "_" -
    # e.g. "campus_services" -> {"campus", "services"}. Lets the category
    # hint (see _score()) work correctly for multi-word category names,
    # not just single-word ones like "hostel" or "mess".
    category_name_tokens: set[str]


def _split_phrases_and_words(terms: list[str]) -> tuple[list[str], set[str]]:
    """Shared by keywords and aliases: split a list of terms into
    multi-word phrases (kept as normalized strings, checked via substring
    match) and single words (kept as a set, checked via token
    membership)."""
    multi_word: list[str] = []
    single_word: set[str] = set()
    for term in terms:
        normalized_term = _normalize(term)
        if not normalized_term:
            continue
        if " " in normalized_term:
            multi_word.append(normalized_term)
        else:
            single_word.add(normalized_term)
    return multi_word, single_word


def _build_profile(entry: dict) -> _KeywordProfile:
    multi_word_keywords, single_word_keywords = _split_phrases_and_words(entry["keywords"])
    multi_word_aliases, single_word_aliases = _split_phrases_and_words(entry.get("aliases", []))

    all_keywords_text = " ".join(entry["keywords"])
    all_aliases_text = " ".join(entry.get("aliases", []))

    return _KeywordProfile(
        entry=entry,
        multi_word_keywords=multi_word_keywords,
        single_word_keywords=single_word_keywords,
        keyword_tokens=_meaningful_tokens(all_keywords_text),
        multi_word_aliases=multi_word_aliases,
        single_word_aliases=single_word_aliases,
        alias_tokens=_meaningful_tokens(all_aliases_text),
        # title_tokens plays the same role the old "question" field did:
        # a short, canonical label for the entry, worth rewarding overlap
        # with, without scoring against the full `content` body (that
        # would make near-any-word-in-a-long-paragraph count as a match,
        # which defeats the point of keyword-gated retrieval).
        title_tokens=_meaningful_tokens(entry["title"]),
        category=entry["category"],
        category_name_tokens=_meaningful_tokens(entry["category"].replace("_", " ")),
    )


_KEYWORD_PROFILES: list[_KeywordProfile] = [
    _build_profile(entry) for entry in CAMPUS_KNOWLEDGE
]


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _score(query: str, profile: _KeywordProfile) -> float:
    """How well one knowledge base entry matches the query, on keyword and
    phrase evidence alone. Every signal is additive; see the weight
    constants above for what each is worth."""
    normalized_query = _normalize(query)
    query_tokens = _meaningful_tokens(query)

    score = 0.0

    # Exact multi-word phrase match, e.g. the query literally contains
    # "gate timings". The strongest signal - a specific phrase like this
    # rarely means anything else.
    for phrase in profile.multi_word_keywords:
        if phrase in normalized_query:
            score += EXACT_PHRASE_MATCH_WEIGHT

    # Single-word keyword match, e.g. the query contains "attendance".
    for word in profile.single_word_keywords:
        if word in GENERIC_WORDS:
            continue
        if word in query_tokens:
            score += SINGLE_WORD_KEYWORD_WEIGHT

    # Broader token overlap against the entry's full keyword vocabulary -
    # catches partial matches that aren't exact phrases.
    score += len(query_tokens & profile.keyword_tokens) * KEYWORD_TOKEN_OVERLAP_WEIGHT

    # Aliases: same three signals as keywords, at reduced weights - see
    # the ALIAS_* weight constants for why. This is what lets a student's
    # own natural phrasing ("how do I get my transcripts") match an entry
    # whose keywords are tighter domain terms ("coe", "transcripts",
    # "revaluation") even when the phrasing itself doesn't overlap much.
    for phrase in profile.multi_word_aliases:
        if phrase in normalized_query:
            score += ALIAS_PHRASE_MATCH_WEIGHT

    for word in profile.single_word_aliases:
        if word in GENERIC_WORDS:
            continue
        if word in query_tokens:
            score += ALIAS_SINGLE_WORD_WEIGHT

    score += len(query_tokens & profile.alias_tokens) * ALIAS_TOKEN_OVERLAP_WEIGHT

    # Token overlap against the entry's own title - rewards queries worded
    # similarly to the fact's short label (e.g. "library hours").
    score += len(query_tokens & profile.title_tokens) * TITLE_TOKEN_OVERLAP_WEIGHT

    # Category hint: the query names (a meaningful word from) the entry's
    # category - e.g. "hostel", "library", or "services"/"campus" for the
    # multi-word "campus_services" category. Split on "_" and checked as a
    # token overlap (not a single-string equality) so this works for
    # every category name, not just single-word ones.
    if query_tokens & profile.category_name_tokens:
        score += CATEGORY_HINT_WEIGHT

    return score


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def _score_all(query: str) -> list[tuple[float, _KeywordProfile]]:
    all_scored = [
        (_score(query, profile), profile) for profile in _KEYWORD_PROFILES
    ]
    all_scored.sort(key=lambda pair: pair[0], reverse=True)
    return all_scored


def _rank_categories(scored: list[tuple[float, _KeywordProfile]]) -> list[str]:
    """Rank every DISTINCT category represented in `scored` by its single
    best-matching entry, best first.

    A category's rank is its best entry's score, not a sum across every
    entry in that category - deliberately, so a category that happens to
    have many entries in the knowledge base doesn't automatically outrank
    a category with just one, highly relevant entry. This is what makes
    category selection an explicit ranking step rather than an accident
    of how entries happen to be sorted: it directly answers "which
    TOPICS is this question most about", separate from "which single
    entries scored highest" (handled next, in _select_results())."""
    best_score_per_category: dict[str, float] = {}
    for score, profile in scored:
        current_best = best_score_per_category.get(profile.category)
        if current_best is None or score > current_best:
            best_score_per_category[profile.category] = score

    return sorted(
        best_score_per_category,
        key=lambda category: best_score_per_category[category],
        reverse=True,
    )


def _select_results(scored: list[tuple[float, _KeywordProfile]]) -> list[dict]:
    """Rank categories by relevance (see _rank_categories()), then return
    the single best-scoring entry from each of the top MAX_RESULTS
    categories, in ranked order - so a question that only really asks one
    attendance question doesn't return two attendance entries, and the
    categories that DO appear are the most relevant ones to the question,
    not just whichever individual entries happened to score highest."""
    ranked_categories = _rank_categories(scored)[:MAX_RESULTS]

    best_entry_per_category: dict[str, dict] = {}
    for _score_value, profile in scored:
        best_entry_per_category.setdefault(profile.category, profile.entry)

    return [
        best_entry_per_category[category]
        for category in ranked_categories
        if category in best_entry_per_category
    ]


def retrieve(query: str, history_context: str = "") -> list[dict]:
    """Return the knowledge base entries (plain dicts, same shape as
    CAMPUS_KNOWLEDGE) that match `query`, best first.

    Deterministic, no ML: score every entry on keyword/phrase overlap
    only, keep the ones that clear MIN_MATCH_SCORE, then take the single
    best-scoring entry per DISTINCT category up to MAX_RESULTS categories.

    `history_context` (optional) is recent prior conversation text - e.g.
    the student's last question or two. It is NEVER used on its own and
    NEVER strengthens a query that already matched something; it is only
    consulted as a second attempt when `query` ALONE matches nothing at
    all. This is what lets a short follow-up like "what about on
    weekends?" (which alone has no keyword overlap with anything) still
    resolve correctly when it follows "what are the library hours?" -
    without letting stale context from three questions ago silently
    change what a fresh, unrelated question matches.

    Returns [] only when neither the query alone, nor the query combined
    with history_context, has any real keyword overlap with the knowledge
    base - that's the ONLY case the caller should fall back to the
    out-of-domain response for.
    """
    # Score EVERY entry, not just the ones that clear the bar - a query
    # that matches nothing still needs its near-misses visible in the
    # debug output (see _print_debug()) so "why did this fall back" has a
    # real answer instead of just "nothing matched".
    all_scored = _score_all(query)
    scored = [pair for pair in all_scored if pair[0] >= MIN_MATCH_SCORE]

    if DEBUG_RETRIEVAL:
        _print_debug(query, all_scored, scored)

    if not scored and history_context.strip():
        # Retry once, this time scoring the query combined with recent
        # conversation context - a pure follow-up ("what about weekends?")
        # has nothing of its own to match on, but combined with "library
        # hours" from the previous turn it matches the library entry the
        # same way a student re-asking the full question would have.
        combined_query = f"{history_context} {query}"
        combined_scored = _score_all(combined_query)
        combined_matches = [pair for pair in combined_scored if pair[0] >= MIN_MATCH_SCORE]

        if DEBUG_RETRIEVAL:
            print("--- Retry with conversation context (initial query matched nothing) ---")
            _print_debug(combined_query, combined_scored, combined_matches)

        if combined_matches:
            print(
                f"Retrieved {len(combined_matches)} chunk(s) via "
                "context-assisted retry"
            )
            return _select_results(combined_matches)

    print(f"Retrieved {len(scored)} chunk(s) above match threshold")

    if not scored:
        return []

    return _select_results(scored)


# Minimum score for a near-miss to be worth surfacing as a "related
# topic" suggestion when a query didn't clear MIN_MATCH_SCORE at all.
# Intentionally just above zero: a single stray, coincidental token
# overlap shouldn't be offered as if it were a real lead, but any
# genuine (if ultimately insufficient) keyword signal is worth naming.
RELATED_TOPIC_MIN_SCORE = 0.5


def suggest_related_topics(query: str, limit: int = MAX_RESULTS) -> list[dict]:
    """Best-effort, near-miss suggestions for when `query` matched nothing
    via retrieve() - used only to make the out-of-domain fallback message
    more useful ("I couldn't find X, but here's Y and Z which might be
    related") instead of naming the entire fixed topic list every time.

    These are NEVER evidence and NEVER shown as Source cards - the whole
    point of MIN_MATCH_SCORE is that they weren't confident enough to
    answer from. They're only fit to be named as a "maybe try this
    instead" suggestion, never grounded content the LLM (or the stored-
    answer fallback) is allowed to state as fact.

    Returns up to `limit` knowledge entries, one per distinct category,
    ranked by the same category-ranking logic retrieve() itself uses for
    real matches (see _rank_categories()). Returns [] if literally
    nothing has any keyword/alias overlap with the query at all - the
    caller should treat that as "no related topics available" and fall
    back to a generic topic list instead.
    """
    near_misses = [pair for pair in _score_all(query) if pair[0] >= RELATED_TOPIC_MIN_SCORE]
    if not near_misses:
        return []
    return _select_results(near_misses)[:limit]


def warm_up() -> None:
    """Called once at server startup (see main.py). There's no ML model to
    load anymore, so this is just a sanity check that the knowledge base
    actually loaded - printed loudly so an empty/missing knowledge_base.json
    is obvious in the startup log instead of silently causing every
    question to fall back."""
    categories = sorted({entry["category"] for entry in CAMPUS_KNOWLEDGE})
    print(
        f"[Campus Expert] Keyword retrieval ready: {len(CAMPUS_KNOWLEDGE)} "
        f"entries across {len(categories)} categories: {', '.join(categories)}"
    )
    if not CAMPUS_KNOWLEDGE:
        print(
            "[Campus Expert] WARNING: knowledge base is empty - every "
            "question will fall back to the out-of-domain response until "
            "app/data/knowledge_base.json has entries."
        )


def _print_debug(
    query: str,
    all_scored: list[tuple[float, "_KeywordProfile"]],
    scored: list[tuple[float, "_KeywordProfile"]],
) -> None:
    """all_scored is EVERY entry with its raw score, already sorted best
    first, regardless of whether it cleared MIN_MATCH_SCORE - this is what
    makes a fallback explainable: "closest entry scored 0.5, needed 1.0"
    is a real diagnosis, "nothing matched" is not.

    Note on terminology: this project no longer uses embeddings, so these
    are keyword/phrase match scores, not semantic similarity scores - the
    two are unrelated calculations. Labeled "Match scores" here rather
    than "Similarity scores" so this log can never be misread as evidence
    a vector-similarity system is still running.
    """
    print("\n--- Keyword retrieval debug ---")
    print(f"Received Query: {query!r}")

    if not all_scored:
        print("Knowledge base is empty - nothing to score at all.")
        print("--- end debug ---\n")
        return

    print(f"Match scores (top {min(10, len(all_scored))} of {len(all_scored)} entries):")
    for score, profile in all_scored[:10]:
        cleared = "MATCH" if score >= MIN_MATCH_SCORE else "below threshold"
        print(f"  {score:5.2f}  {profile.entry['id']:<18} ({profile.category:<13}) - {cleared}")

    if not scored:
        best_score, best_profile = all_scored[0]
        print(
            f"No entry cleared MIN_MATCH_SCORE={MIN_MATCH_SCORE} - falling back. "
            f"Closest was {best_profile.entry['id']} at {best_score:.2f} "
            f"({'no keyword/phrase overlap with the query at all' if best_score == 0 else 'some overlap, but not enough'})."
        )
    print("--- end debug ---\n")
