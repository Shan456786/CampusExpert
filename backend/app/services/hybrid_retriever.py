"""
Hybrid retrieval for the Campus Expert chat engine.

WHY HYBRID
----------
Pure semantic search (semantic_search.py) is good at understanding
paraphrased questions, but it has a blind spot: it doesn't reliably tell
apart entries that share a *topic* but answer a different *intent*.
"library timings" and "where is the library" both land close together in
embedding space because they're both clearly "about the library" - so a
purely semantic system can rank the wrong one first.

Lexical (keyword) matching is the opposite: it's blind to paraphrasing, but
extremely good at picking up specific, literal phrases like "library
timings" - exactly the kind of signal that disambiguates "which library
entry did they actually mean?".

Hybrid retrieval combines both signals into one score, so paraphrased
questions still work (thanks to semantic similarity) AND specific phrases
still pull the ranking toward the exact right entry (thanks to lexical
evidence).

PIPELINE
--------
1. Build a candidate pool: the top N entries by semantic similarity, plus
   any entry that has a strong lexical hit even if it didn't make the
   semantic top N.
2. Score every candidate on both signals, normalize the lexical score to
   0-1, and combine them into one hybrid_score using fixed weights.
3. If the best hybrid_score clears HYBRID_CONFIDENCE_THRESHOLD, return that
   entry. Otherwise return None - the caller falls back to the "I don't
   have information" response.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.data.knowledge import CAMPUS_KNOWLEDGE
from app.services.semantic_search import get_semantic_similarities

# ---------------------------------------------------------------------------
# Tunable constants - change these and re-test, don't rewrite the logic.
# ---------------------------------------------------------------------------

# How much each signal counts toward the final hybrid score. Should add up
# to 1.0.
SEMANTIC_WEIGHT = 0.65
LEXICAL_WEIGHT = 0.35

# How many of the top semantic matches automatically become candidates.
SEMANTIC_TOP_K = 5

# A raw lexical score at or above this is, on its own, enough to pull an
# entry into the candidate pool even if it didn't make the semantic top K.
LEXICAL_CANDIDATE_MIN_SCORE = 1.0

# Points awarded per signal when building the raw (un-normalized) lexical
# score for one entry.
EXACT_PHRASE_MATCH_WEIGHT = 4.0
SINGLE_WORD_KEYWORD_WEIGHT = 1.0
KEYWORD_TOKEN_OVERLAP_WEIGHT = 0.5
QUESTION_TOKEN_OVERLAP_WEIGHT = 0.5
CATEGORY_HINT_WEIGHT = 1.0

# Raw lexical scores are capped at this value, then divided by it, so
# normalized_lexical_score always lands in [0, 1]. This is set equal to
# EXACT_PHRASE_MATCH_WEIGHT on purpose: ONE exact multi-word phrase match
# is enough, by itself, to reach full lexical confidence (1.0). That's what
# lets a specific phrase like "library timings" outrank a topically-close
# but wrong semantic result - see "strong exact match protection" below.
LEXICAL_SCORE_CAP = 4.0

# Below this hybrid score, we don't trust the best match enough to answer.
# This is a starting point, not a derived number - tune it against real
# questions the same way SIMILARITY_THRESHOLD was tuned in semantic_search.py.
HYBRID_CONFIDENCE_THRESHOLD = 0.42

# ---------------------------------------------------------------------------
# Evidence-aware confidence gating
# ---------------------------------------------------------------------------
#
# WHY THIS EXISTS
# A query like "I'm hungry" has zero keyword overlap with anything in the
# knowledge base (normalized_lexical_score = 0), so its hybrid score is just
# semantic_score * 0.65 - a real, measured example came back as
# semantic_score=0.277, hybrid_score=0.180, correctly ranked #1, but 0.180
# is nowhere near HYBRID_CONFIDENCE_THRESHOLD (0.42). That's not the
# semantic model failing - 0.277 is a perfectly reasonable similarity score
# for a paraphrase. It's the hybrid formula unfairly punishing a query that
# was NEVER going to have lexical evidence in the first place.
#
# So acceptance is no longer just "did hybrid_score clear one bar". A
# candidate is trusted if ANY of these hold:
#
#   1. HYBRID_ACCEPT: hybrid_score >= HYBRID_CONFIDENCE_THRESHOLD
#      (the original rule - lexical + semantic evidence together are enough)
#   2. STRONG_SEMANTIC_ACCEPT: semantic_score >= STRONG_SEMANTIC_THRESHOLD
#      (semantic similarity alone is high enough that we don't need
#      corroborating lexical evidence at all)
#   3. SEMANTIC_ACCEPT: semantic_score >= SEMANTIC_ONLY_THRESHOLD AND the
#      margin between this entry's semantic score and the next-best
#      entry's semantic score is at least SEMANTIC_MARGIN_THRESHOLD
#      (moderate similarity is only trusted if the model is clearly
#      pointing at ONE entry, not shrugging between several - see below)
#
# Rule 3 is what "I'm hungry" needs: 0.277 clears SEMANTIC_ONLY_THRESHOLD,
# and as long as mess_001 is meaningfully ahead of whatever scored second,
# that's real evidence of intent, not noise.
SEMANTIC_ONLY_THRESHOLD = 0.25
STRONG_SEMANTIC_THRESHOLD = 0.40

# How far ahead of the runner-up (by semantic score alone) the top entry
# must be for rule 3 to trust it. Kept small on purpose - entries in the
# same category (mess_001 vs mess_002, library_001 vs library_002) are
# expected to sit close together, and we don't want SEMANTIC_ACCEPT to
# reject a correct answer just because a same-topic sibling entry is a
# reasonable second choice.
SEMANTIC_MARGIN_THRESHOLD = 0.03

# Rule 4: COMBINED_EVIDENCE_ACCEPT.
#
# Real measured example that rules 1-3 all correctly reject: "I feel sick"
# against medical_001 came back semantic=0.189, normalized_lexical=0.375,
# hybrid=0.254, margin=0.072. Every individual number is too low to pass on
# its own - semantic is below SEMANTIC_ONLY_THRESHOLD (0.25), hybrid is well
# below HYBRID_CONFIDENCE_THRESHOLD (0.42) - but that's the wrong way to
# read it. TWO independent signals (semantic similarity AND keyword
# overlap) are both pointing at medical_001, and the margin says the model
# isn't confused between candidates either. Three weak-looking numbers that
# all agree with each other are more trustworthy than any one of them
# looked at in isolation.
#
# COMBINED_EVIDENCE_ACCEPT requires ALL of:
#   - semantic_score >= COMBINED_MIN_SEMANTIC (some real semantic relevance,
#     not just noise)
#   - normalized_lexical_score >= COMBINED_MIN_LEXICAL_NORM (some real
#     keyword evidence, not just an accidental token overlap)
#   - semantic_margin >= SEMANTIC_MARGIN_THRESHOLD (the model isn't
#     shrugging between two candidates - this also guarantees the top
#     hybrid candidate IS the top semantic candidate: if some other entry
#     scored higher on semantic alone, the margin would be zero or
#     negative and this check would fail)
#
# The lexical requirement is what keeps this rule from turning into "accept
# anything with semantic >= 0.15" - out-of-domain queries like "Explain
# quantum mechanics" have normalized_lexical_score = 0.0 (zero keyword
# overlap with anything), so they fail this rule immediately regardless of
# their semantic score.
COMBINED_MIN_SEMANTIC = 0.15
COMBINED_MIN_LEXICAL_NORM = 0.20

# Print a detailed scoring breakdown to the backend terminal for every
# request. Never exposed to the frontend/API response. Turn off once you're
# done tuning.
DEBUG_HYBRID = True

# ---------------------------------------------------------------------------
# Multi-evidence retrieval
# ---------------------------------------------------------------------------
#
# Most questions only need one entry. A few genuinely ask about more than one
# topic at once ("I'm hungry and also need to know when the bus leaves").
# retrieve_multi() (below) handles that WITHOUT adding a new signal: every
# additional candidate has to earn its place by clearing the exact same
# _decide_acceptance() gate the single best candidate already has to clear -
# being ranked #2 or #3 is never enough on its own. See retrieve_multi()'s
# docstring for the full reasoning.

# Hard ceiling on how many entries one answer can be grounded in. Keeps
# Gemma's prompt small and keeps the UI from ever showing a wall of source
# cards for one question.
MAX_EVIDENCE_ENTRIES = 3

# Same-category duplicate guard (see _is_redundant_with_accepted()). A
# second entry from a category already represented is only kept if its raw
# lexical score shows MORE than just the entry's category name appearing in
# the query - i.e. more than CATEGORY_HINT_WEIGHT alone. CATEGORY_HINT_WEIGHT
# (1.0) fires just from the query containing the word "library"/"hostel"/etc,
# which every same-category sibling gets "for free" and says nothing about
# which specific entry was actually asked about. Requiring evidence above
# that - one more keyword/question token overlap, at minimum - is real,
# entry-specific signal that a genuinely separate sub-question was asked.
#
# Deliberately NOT set to EXACT_PHRASE_MATCH_WEIGHT: real testing against
# "Where is the library and when does it close?" showed library_002's exact
# phrase "library close" doesn't literally appear (the query has "...library
# and when does it close" - the words are separated), so it never reaches
# EXACT_PHRASE_MATCH_WEIGHT even though the user clearly asked about library
# hours as a second, distinct topic. This threshold is set low enough to
# still recognize that case as genuine secondary evidence.
SAME_CATEGORY_SECONDARY_MIN_LEXICAL = CATEGORY_HINT_WEIGHT + KEYWORD_TOKEN_OVERLAP_WEIGHT


# ---------------------------------------------------------------------------
# Text normalization
# ---------------------------------------------------------------------------

# Words that are too generic to tell entries apart. If we counted these as
# "matches", almost every question would look relevant to almost every
# entry, since words like "timing" or "student" show up everywhere in the
# knowledge base.
GENERIC_WORDS = {
    # common English stopwords - grammatical glue, not topic content
    "a", "an", "the", "is", "are", "was", "were", "do", "does", "did",
    "i", "my", "me", "you", "your", "we", "our", "it", "its", "am", "be",
    "been", "and", "or", "of", "to", "for", "on", "in", "at", "by", "with",
    "what", "where", "when", "how", "who", "which", "can", "could",
    "should", "would", "please", "need", "want", "tell", "about",
    "there", "here", "this", "that", "these", "those",

    # domain words that show up across many unrelated entries, so matching
    # on them alone tells us nothing about which specific entry is meant
    "campus", "student", "students", "university", "information", "info",
    "timing", "timings", "schedule", "details", "detail",
}

_TOKEN_PATTERN = re.compile(r"[a-z0-9']+")


def _normalize(text: str) -> str:
    """Lowercase and strip, so phrase comparisons are on equal footing."""
    return text.lower().strip()


def _tokenize(text: str) -> list[str]:
    """Split text into lowercase word tokens, dropping punctuation."""
    return _TOKEN_PATTERN.findall(text.lower())


def _meaningful_tokens(text: str) -> set[str]:
    """Tokenize text and drop generic/stopword tokens, keeping only the
    words that actually carry topic meaning."""
    return {token for token in _tokenize(text) if token not in GENERIC_WORDS}


# ---------------------------------------------------------------------------
# Precomputed lexical profile per knowledge base entry.
#
# Built once, at import time - the same principle as the cached embeddings
# in semantic_search.py. There's no reason to re-tokenize the same 22
# entries on every single request.
# ---------------------------------------------------------------------------

@dataclass
class _LexicalProfile:
    multi_word_keywords: list[str]   # normalized keyword phrases, 2+ words
    single_word_keywords: set[str]   # normalized single-word keywords
    keyword_tokens: set[str]         # meaningful tokens from ALL keywords
    question_tokens: set[str]        # meaningful tokens from the question
    category: str


def _build_lexical_profile(entry: dict) -> _LexicalProfile:
    multi_word_keywords = []
    single_word_keywords = set()

    for keyword in entry["keywords"]:
        normalized_keyword = _normalize(keyword)
        if " " in normalized_keyword:
            multi_word_keywords.append(normalized_keyword)
        else:
            single_word_keywords.add(normalized_keyword)

    all_keywords_text = " ".join(entry["keywords"])

    return _LexicalProfile(
        multi_word_keywords=multi_word_keywords,
        single_word_keywords=single_word_keywords,
        keyword_tokens=_meaningful_tokens(all_keywords_text),
        question_tokens=_meaningful_tokens(entry["question"]),
        category=entry["category"],
    )


_LEXICAL_PROFILES: list[_LexicalProfile] = [
    _build_lexical_profile(entry) for entry in CAMPUS_KNOWLEDGE
]


# ---------------------------------------------------------------------------
# Lexical scoring
# ---------------------------------------------------------------------------

def _lexical_raw_score(query: str, profile: _LexicalProfile) -> float:
    """Score how well one knowledge base entry matches the query on
    keyword/phrase evidence alone (no embeddings involved here).

    Every signal below is additive and answers one plain-English question
    about the match; the weight is how many points that answer is worth.
    """
    normalized_query = _normalize(query)
    query_tokens = _meaningful_tokens(query)

    score = 0.0

    # 1. Exact multi-word keyword phrase match, e.g. the query contains
    # "library timings" verbatim. This is the strongest lexical signal -
    # a specific phrase like this rarely means anything else.
    for phrase in profile.multi_word_keywords:
        if phrase in normalized_query:
            score += EXACT_PHRASE_MATCH_WEIGHT

    # 2. Single-word keyword match, e.g. the query contains "faculty".
    # Weaker than a phrase match since one word is more ambiguous.
    for word in profile.single_word_keywords:
        if word in GENERIC_WORDS:
            continue  # a generic single-word "keyword" shouldn't count
        if word in query_tokens:
            score += SINGLE_WORD_KEYWORD_WEIGHT

    # 3. Meaningful token overlap against the entry's full keyword
    # vocabulary. Catches partial matches that aren't exact phrases.
    overlap_with_keywords = query_tokens & profile.keyword_tokens
    score += len(overlap_with_keywords) * KEYWORD_TOKEN_OVERLAP_WEIGHT

    # 4. Meaningful token overlap against the entry's canonical question.
    # Rewards queries worded similarly to the question itself.
    overlap_with_question = query_tokens & profile.question_tokens
    score += len(overlap_with_question) * QUESTION_TOKEN_OVERLAP_WEIGHT

    # 5. Category hint: if the query literally names the entry's category
    # (e.g. "library", "hostel"), that's a small extra vote of confidence.
    if profile.category in query_tokens:
        score += CATEGORY_HINT_WEIGHT

    return score


def _normalized_lexical_score(raw_score: float) -> float:
    """Squash the raw lexical score into [0, 1] so it can be combined with
    the semantic score (also [0, 1]) on equal footing."""
    return min(raw_score / LEXICAL_SCORE_CAP, 1.0)


def _matched_query_tokens(query: str, profile: _LexicalProfile) -> set:
    """Which meaningful query tokens actually contributed to this entry's
    lexical score - not how much evidence there was (that's
    _lexical_raw_score's job), but WHICH words in the query it came from.

    This exists for one purpose: telling apart two same-category entries
    that are both "relevant" for genuinely different reasons (library
    location vs library hours - see _is_redundant_with_accepted()) from two
    same-category entries that are both "relevant" for the SAME reason -
    e.g. attendance_001 and attendance_002 can both look like reasonable
    matches for a query that only ever says the word "attendance" once,
    with nothing in the query pointing specifically at one entry's
    information over the other's. If two same-category candidates were
    matched by the exact same query words, the second one isn't adding
    coverage of a new part of the question - it's just a second guess at
    the same part.

    Mirrors the branches of _lexical_raw_score() that are actually
    query-token-attributable (skips the category-hint bonus - naming the
    category isn't evidence of a specific sub-topic).
    """
    normalized_query = _normalize(query)
    query_tokens = _meaningful_tokens(query)

    matched: set = set()

    # Exact multi-word phrase match: credit whichever of ITS OWN tokens
    # also appear in the query's meaningful tokens.
    for phrase in profile.multi_word_keywords:
        if phrase in normalized_query:
            matched |= _meaningful_tokens(phrase) & query_tokens

    # Single-word keyword match.
    for word in profile.single_word_keywords:
        if word in GENERIC_WORDS:
            continue
        if word in query_tokens:
            matched.add(word)

    # Keyword-vocabulary and question-text token overlap.
    matched |= query_tokens & profile.keyword_tokens
    matched |= query_tokens & profile.question_tokens

    return matched


# ---------------------------------------------------------------------------
# Result object
# ---------------------------------------------------------------------------

@dataclass
class RetrievalResult:
    entry: dict
    index: int                       # position in CAMPUS_KNOWLEDGE - needed
                                      # to look up "everyone else's" semantic
                                      # score when computing the margin below
    semantic_score: float
    lexical_score: float             # raw, un-normalized
    normalized_lexical_score: float  # 0-1
    hybrid_score: float
    matched_query_tokens: frozenset  # which query words drove the lexical
                                      # score - see _matched_query_tokens()


# ---------------------------------------------------------------------------
# Candidate set
# ---------------------------------------------------------------------------

def _top_semantic_indices(semantic_scores) -> list[int]:
    return sorted(
        range(len(CAMPUS_KNOWLEDGE)),
        key=lambda i: semantic_scores[i],
        reverse=True,
    )[:SEMANTIC_TOP_K]


def _build_candidate_indices(query: str, semantic_scores) -> set[int]:
    """Union of: the top-K entries by semantic similarity, and any entry
    with a strong enough lexical hit on its own (see
    LEXICAL_CANDIDATE_MIN_SCORE) - so a specific keyword match can't be
    ignored just because the semantic model ranked it outside the top K."""
    candidates = set(_top_semantic_indices(semantic_scores))

    for index, profile in enumerate(_LEXICAL_PROFILES):
        if _lexical_raw_score(query, profile) >= LEXICAL_CANDIDATE_MIN_SCORE:
            candidates.add(index)

    return candidates


# ---------------------------------------------------------------------------
# Confidence gating - decide whether to trust the top hybrid-ranked result
# ---------------------------------------------------------------------------

def _second_best_semantic_score(semantic_scores, exclude_index: int) -> float:
    """Best semantic score among every entry EXCEPT exclude_index.

    Used to measure how far ahead the top candidate is from "everything
    else" - a query the model is genuinely confident about should have
    daylight between its best match and the runner-up; a query it's just
    guessing on tends to have several entries bunched together.
    """
    best = 0.0
    for i in range(len(CAMPUS_KNOWLEDGE)):
        if i == exclude_index:
            continue
        score = float(semantic_scores[i])
        if score > best:
            best = score
    return best


def _second_best_semantic_score_same_category(
    semantic_scores, top_index: int, category: str
) -> float:
    """Best semantic score among entries in the SAME category as top_index,
    excluding top_index itself. Returns 0.0 if top_index's category has no
    other entries (e.g. "medical" only has medical_001) - a singleton
    category has nothing to be confused with, so its margin is trivially
    as large as its own score.

    See _decide_acceptance()'s MULTI_TOPIC_ACCEPT rule for why this exists.
    """
    best = 0.0
    for i in range(len(CAMPUS_KNOWLEDGE)):
        if i == top_index:
            continue
        if CAMPUS_KNOWLEDGE[i]["category"] != category:
            continue
        score = float(semantic_scores[i])
        if score > best:
            best = score
    return best


def _decide_acceptance(
    top: RetrievalResult, semantic_scores
) -> tuple[bool, str, float, float]:
    """Decide whether to trust `top`, the entry hybrid ranking selected.

    Hybrid ranking still picks WHICH entry is the best candidate (unchanged
    - this function never changes the selection, only whether we act on
    it). This only decides whether the evidence behind that selection is
    strong enough to answer instead of falling back.

    Returns (accepted, rule_name, second_best_semantic, semantic_margin).
    rule_name is one of "HYBRID_ACCEPT", "STRONG_SEMANTIC_ACCEPT",
    "SEMANTIC_ACCEPT", "COMBINED_EVIDENCE_ACCEPT", "MULTI_TOPIC_ACCEPT",
    "FALLBACK" - also used directly in DEBUG_HYBRID output so the reason
    for every decision is visible.
    """
    second_best_semantic = _second_best_semantic_score(semantic_scores, top.index)
    semantic_margin = top.semantic_score - second_best_semantic

    # Rule 1: lexical + semantic evidence together already clear the bar.
    # This is the path "Where is the library?" and "When does the library
    # close?" take - strong lexical evidence is what tells those two apart,
    # so we always check this first and let it win when it applies.
    if top.hybrid_score >= HYBRID_CONFIDENCE_THRESHOLD:
        return True, "HYBRID_ACCEPT", second_best_semantic, semantic_margin

    # Rule 2: semantic similarity alone is high enough to trust without
    # needing a distinctiveness check - a strong enough absolute score is
    # evidence on its own.
    if top.semantic_score >= STRONG_SEMANTIC_THRESHOLD:
        return True, "STRONG_SEMANTIC_ACCEPT", second_best_semantic, semantic_margin

    # Rule 3: moderate semantic similarity, only trusted if it's clearly
    # ahead of the next-best entry - this is the paraphrase path
    # ("I'm hungry" -> mess_001).
    if (
        top.semantic_score >= SEMANTIC_ONLY_THRESHOLD
        and semantic_margin >= SEMANTIC_MARGIN_THRESHOLD
    ):
        return True, "SEMANTIC_ACCEPT", second_best_semantic, semantic_margin

    # Rule 4: COMBINED_EVIDENCE_ACCEPT - no single signal clears its own
    # bar, but semantic similarity, lexical overlap, AND a clean margin all
    # independently point the same direction. This is the path
    # "I feel sick" -> medical_001 needs (semantic=0.189, well under 0.25;
    # normalized_lexical=0.375; margin=0.072 - three numbers that are each
    # individually unconvincing but agree with each other).
    #
    # Requiring the lexical check here (not just semantic + margin) is what
    # keeps this from silently becoming a second, weaker SEMANTIC_ACCEPT
    # rule - an out-of-domain query has normalized_lexical_score = 0.0 and
    # fails this immediately, no matter how its semantic score looks.
    if (
        top.semantic_score >= COMBINED_MIN_SEMANTIC
        and top.normalized_lexical_score >= COMBINED_MIN_LEXICAL_NORM
        and semantic_margin >= SEMANTIC_MARGIN_THRESHOLD
    ):
        return True, "COMBINED_EVIDENCE_ACCEPT", second_best_semantic, semantic_margin

    # Rule 5: MULTI_TOPIC_ACCEPT - real bug found on "I was sick and missed
    # classes. What should I do?" (no literal "attendance" anywhere in the
    # query, so this is about medical/academics candidates specifically,
    # but the underlying flaw applies to any genuinely multi-topic query).
    #
    # Rule 4 above requires semantic_margin - computed against the best
    # score among ALL OTHER entries in the whole knowledge base - to be
    # >= SEMANTIC_MARGIN_THRESHOLD. That margin was designed to catch ONE
    # specific failure mode: the model shrugging between near-identical
    # SIBLING entries in the same category (mess_001 vs mess_002,
    # library_001 vs library_002 - see the SEMANTIC_MARGIN_THRESHOLD
    # comment above). It was never meant to punish a candidate for sitting
    # near a strong candidate from a COMPLETELY DIFFERENT topic - but
    # that's exactly what happens on a genuinely multi-intent query: if
    # medical_001 and academics_001 both score real, comparable semantic
    # similarity (because the query really is about both), medical_001's
    # GLOBAL margin against academics_001 can land under the threshold even
    # though nothing about medical_001's own evidence is weak. The result
    # was total fallback on a query the knowledge base clearly covers.
    #
    # Fix: only for this specific case - same semantic+lexical floors as
    # COMBINED_EVIDENCE_ACCEPT (so out-of-domain queries are exactly as
    # protected as before; a zero-lexical-evidence query like "Explain
    # quantum mechanics" still fails immediately) - recompute the margin
    # scoped to top's OWN category instead of the whole knowledge base.
    # This restores the rule's original intent: "is the model confused
    # about which SIBLING entry is right", not "is there ALSO a real
    # answer to a different question in this database". A singleton
    # category (medical has only medical_001) has no sibling to be
    # confused with at all, so its category-scoped margin is trivially
    # satisfied - which is correct: there's nothing to be unsure about.
    same_category_second_best = _second_best_semantic_score_same_category(
        semantic_scores, top.index, top.entry["category"]
    )
    same_category_margin = top.semantic_score - same_category_second_best

    if (
        top.semantic_score >= COMBINED_MIN_SEMANTIC
        and top.normalized_lexical_score >= COMBINED_MIN_LEXICAL_NORM
        and same_category_margin >= SEMANTIC_MARGIN_THRESHOLD
    ):
        return True, "MULTI_TOPIC_ACCEPT", second_best_semantic, semantic_margin

    return False, "FALLBACK", second_best_semantic, semantic_margin


# ---------------------------------------------------------------------------
# Hybrid retrieval - the public entry point
# ---------------------------------------------------------------------------

def _rank_candidates(query: str) -> tuple[list[RetrievalResult], "object"]:
    """Compute semantic scores, build the candidate pool, score every
    candidate on both signals, and return them sorted by hybrid_score
    descending.

    This is the common first half of both retrieve() and retrieve_multi() -
    pulled out unchanged from what used to be the body of retrieve(), so
    both functions rank candidates identically and only differ in how many
    of the ranked results they're willing to accept.
    """
    # Semantic similarity against every entry, using the cached model and
    # cached knowledge embeddings from semantic_search.py - no reloading,
    # no recomputing the knowledge base vectors.
    semantic_scores = get_semantic_similarities(query)

    candidate_indices = _build_candidate_indices(query, semantic_scores)

    results: list[RetrievalResult] = []
    for index in candidate_indices:
        entry = CAMPUS_KNOWLEDGE[index]
        profile = _LEXICAL_PROFILES[index]

        semantic_score = float(semantic_scores[index])
        raw_lexical = _lexical_raw_score(query, profile)
        normalized_lexical = _normalized_lexical_score(raw_lexical)

        hybrid_score = (
            semantic_score * SEMANTIC_WEIGHT
            + normalized_lexical * LEXICAL_WEIGHT
        )

        results.append(
            RetrievalResult(
                entry=entry,
                index=index,
                semantic_score=semantic_score,
                lexical_score=raw_lexical,
                normalized_lexical_score=normalized_lexical,
                hybrid_score=hybrid_score,
                matched_query_tokens=frozenset(_matched_query_tokens(query, profile)),
            )
        )

    results.sort(key=lambda r: r.hybrid_score, reverse=True)
    return results, semantic_scores


def retrieve(query: str) -> RetrievalResult | None:
    """Run single-evidence hybrid retrieval for one user query.

    Hybrid ranking (semantic + lexical) selects the best candidate, exactly
    as before. Whether we trust that candidate enough to answer is then
    decided by _decide_acceptance() using multiple forms of evidence, not
    just a single hybrid-score cutoff - see the "Evidence-aware confidence
    gating" comment block above the threshold constants for why.

    Kept around unchanged for backward compatibility / single-result callers.
    chat.py now calls retrieve_multi() instead, but retrieve()'s behavior is
    byte-for-byte the same as before the multi-evidence upgrade.

    Returns the best-scoring RetrievalResult if accepted, otherwise None
    (the caller should fall back to the "I don't have information"
    response).
    """
    results, semantic_scores = _rank_candidates(query)

    if not results:
        if DEBUG_HYBRID:
            _print_debug(query, semantic_scores, results, None)
        return None

    accepted, rule, second_best_semantic, semantic_margin = _decide_acceptance(
        results[0], semantic_scores
    )

    if DEBUG_HYBRID:
        _print_debug(
            query,
            semantic_scores,
            results,
            (accepted, rule, second_best_semantic, semantic_margin),
        )

    return results[0] if accepted else None


def _is_redundant_with_accepted(
    candidate: RetrievalResult, accepted: list[RetrievalResult]
) -> bool:
    """Guard against adding a second entry that's really just a weaker
    restatement of one already accepted.

    Different categories are never considered redundant here - "medical"
    and "attendance" are obviously different topics, no further check
    needed. The interesting case is TWO entries from the SAME category
    (library_001 location vs library_002 timing; attendance_001 vs
    attendance_002), where a purely score-based check isn't enough - a real
    test case showed why:

    "I was sick and missed classes. What should I do about my attendance?"
    accepted attendance_002 (raw lexical 6.0, an exact "my attendance"
    phrase match) as the best candidate, and attendance_001 (raw lexical
    3.0) ALSO cleared its own standalone lexical bar - both are, by score
    alone, legitimately strong matches. But the query only actually asks
    ONE attendance question. Compare to "Where is the library and when
    does it close?", which legitimately asks TWO library questions.

    A candidate lexical score alone can't tell these apart - it only says
    "this entry is relevant", not "relevant to a DIFFERENT part of the
    question than the entry we already accepted". So this now requires
    BOTH:

      1. Real standalone lexical evidence (unchanged - raw_lexical_score
         >= SAME_CATEGORY_SECONDARY_MIN_LEXICAL, more than just the
         category name appearing in the query).
      2. NEW query-token coverage - the candidate's matched_query_tokens
         (see _matched_query_tokens()) must include at least one
         meaningful query word that no already-accepted same-category
         entry's match also came from. library_002 clears this: it's
         matched by "close", which library_001 never matched. Both
         attendance entries fail this: they're both only ever matched by
         the single word "attendance" - neither brings evidence of a
         second, separate sub-question the way "close" does.

    This is entirely generic - it's just set arithmetic over tokens
    _lexical_raw_score() was already computing evidence from, not anything
    specific to this test sentence.
    """
    for existing in accepted:
        if candidate.entry["category"] != existing.entry["category"]:
            continue

        if candidate.lexical_score < SAME_CATEGORY_SECONDARY_MIN_LEXICAL:
            return True

        new_token_coverage = candidate.matched_query_tokens - existing.matched_query_tokens
        if not new_token_coverage:
            return True

    return False


def _second_best_semantic_score_excluding(semantic_scores, exclude_indices: set) -> float:
    """Same idea as _second_best_semantic_score(), but can exclude more
    than one index. Used only when gating a SECONDARY evidence candidate in
    retrieve_multi() - see _decide_acceptance_secondary() for why."""
    best = 0.0
    for i in range(len(CAMPUS_KNOWLEDGE)):
        if i in exclude_indices:
            continue
        score = float(semantic_scores[i])
        if score > best:
            best = score
    return best


def _decide_acceptance_secondary(
    candidate: RetrievalResult,
    semantic_scores,
    already_accepted_indices: set,
) -> tuple[bool, str, float, float]:
    """The same four rules as _decide_acceptance(), applied to a SECONDARY
    evidence candidate in retrieve_multi() - only the margin computation
    differs.

    _decide_acceptance()'s margin asks "is the model confused between this
    entry and the next-best alternative for the SAME question" - the right
    question for the single best candidate. But once an entry has already
    been accepted for a DIFFERENT part of a compound question (e.g.
    mess_001 already accepted for "I'm hungry"), it is no longer a
    meaningful competitor for a candidate answering the OTHER part
    ("...and when does the bus leave"). Comparing transport_002 against
    mess_001's semantic score would only ever tell us mess_001 was a
    stronger match for ITS OWN topic - never relevant to whether
    transport_002 is a trustworthy answer to the bus question. So already-
    accepted entries are excluded from the runner-up comparison here, in
    addition to the candidate's own index.

    Reuses every existing threshold constant and rule from
    _decide_acceptance() unchanged - this is the same gating logic, not a
    new signal.
    """
    exclude = set(already_accepted_indices)
    exclude.add(candidate.index)

    second_best_semantic = _second_best_semantic_score_excluding(semantic_scores, exclude)
    semantic_margin = candidate.semantic_score - second_best_semantic

    if candidate.hybrid_score >= HYBRID_CONFIDENCE_THRESHOLD:
        return True, "HYBRID_ACCEPT", second_best_semantic, semantic_margin

    if candidate.semantic_score >= STRONG_SEMANTIC_THRESHOLD:
        return True, "STRONG_SEMANTIC_ACCEPT", second_best_semantic, semantic_margin

    if (
        candidate.semantic_score >= SEMANTIC_ONLY_THRESHOLD
        and semantic_margin >= SEMANTIC_MARGIN_THRESHOLD
    ):
        return True, "SEMANTIC_ACCEPT", second_best_semantic, semantic_margin

    if (
        candidate.semantic_score >= COMBINED_MIN_SEMANTIC
        and candidate.normalized_lexical_score >= COMBINED_MIN_LEXICAL_NORM
        and semantic_margin >= SEMANTIC_MARGIN_THRESHOLD
    ):
        return True, "COMBINED_EVIDENCE_ACCEPT", second_best_semantic, semantic_margin

    return False, "FALLBACK", second_best_semantic, semantic_margin


def retrieve_multi(query: str) -> list[RetrievalResult]:
    """Run multi-evidence hybrid retrieval for one user query.

    Returns 0 to MAX_EVIDENCE_ENTRIES RetrievalResults. This is NOT "top 3
    matches" - it is single-evidence retrieve() with permission to keep
    looking for MORE independently-justified evidence once the first entry
    is trusted, biased toward covering DISTINCT categories/intents rather
    than piling up several entries from whichever category scored highest:

    1. The best-ranked candidate (results[0], same ranking as retrieve())
       must pass _decide_acceptance() exactly as retrieve() requires. If it
       doesn't, this returns [] immediately - identical to retrieve()
       returning None. Out-of-domain and single-topic-but-weak queries are
       therefore exactly as protected as before.

    2. DIVERSITY PASS - walk the remaining ranked candidates once, but only
       look at ones from a category NOT YET represented in accepted. The
       first candidate from each new category that independently clears
       _decide_acceptance_secondary() gets added. This is what makes
       "I was sick and missed classes. What should I do about my
       attendance?" pick up medical_001 instead of a second attendance
       entry - medical is a category nothing has claimed yet, so it gets
       first look, ahead of any additional attendance candidate.

    3. SAME-CATEGORY PASS - only now are candidates from an
       ALREADY-represented category considered, and only if
       _is_redundant_with_accepted() says they're not just a second guess
       at the same sub-question. That function requires the candidate to
       bring lexical evidence AND to be grounded in query words the
       already-accepted same-category entry wasn't - see its docstring.
       This is what still lets "Where is the library and when does it
       close?" return both library entries (library_002 is grounded in
       "close", which library_001 never matched) while blocking a second
       attendance entry for the sickness/attendance query (both attendance
       entries are only ever grounded in the single word "attendance").

    4. Accepted entries are capped at MAX_EVIDENCE_ENTRIES throughout.

    This is why "I feel sick" still returns medical_001 alone: nothing else
    in the knowledge base has enough of its OWN evidence to pass gating.
    And it's why "I'm hungry and I also need to know about campus buses"
    returns mess_001 + a transport entry: two different, uncontested
    categories, each independently justified.
    """
    results, semantic_scores = _rank_candidates(query)

    if not results:
        if DEBUG_HYBRID:
            _print_multi_debug(query, results, None, [], [])
        return []

    primary_accepted, primary_rule, _, _ = _decide_acceptance(
        results[0], semantic_scores
    )

    if not primary_accepted:
        if DEBUG_HYBRID:
            rejected = [(results[0], primary_rule)] + [
                (r, "NOT_EVALUATED (best candidate rejected)") for r in results[1:5]
            ]
            _print_multi_debug(query, results, None, [], rejected)
        return []

    accepted: list[RetrievalResult] = [results[0]]
    accepted_categories = {results[0].entry["category"]}
    rejected: list[tuple[RetrievalResult, str]] = []
    remaining = results[1:]

    # --- Pass 1: diversity - one entry per not-yet-represented category ---
    for candidate in remaining:
        if len(accepted) >= MAX_EVIDENCE_ENTRIES:
            rejected.append((candidate, "MAX_EVIDENCE_REACHED"))
            continue

        if candidate.entry["category"] in accepted_categories:
            continue  # deferred to pass 2, not rejected yet

        already_accepted_indices = {r.index for r in accepted}
        candidate_accepted, rule, _, _ = _decide_acceptance_secondary(
            candidate, semantic_scores, already_accepted_indices
        )

        if not candidate_accepted:
            rejected.append((candidate, f"{rule} (new-category candidate)"))
            continue

        accepted.append(candidate)
        accepted_categories.add(candidate.entry["category"])

    # --- Pass 2: same-category - only if genuinely distinct, non-redundant ---
    for candidate in remaining:
        if candidate in accepted:
            continue
        if len(accepted) >= MAX_EVIDENCE_ENTRIES:
            if candidate not in [r for r, _ in rejected]:
                rejected.append((candidate, "MAX_EVIDENCE_REACHED"))
            continue
        if candidate.entry["category"] not in accepted_categories:
            continue  # already handled (accepted or rejected) in pass 1

        if _is_redundant_with_accepted(candidate, accepted):
            rejected.append((candidate, "REDUNDANT_SAME_CATEGORY"))
            continue

        already_accepted_indices = {r.index for r in accepted}
        candidate_accepted, rule, _, _ = _decide_acceptance_secondary(
            candidate, semantic_scores, already_accepted_indices
        )

        if not candidate_accepted:
            rejected.append((candidate, f"{rule} (same-category candidate)"))
            continue

        accepted.append(candidate)

    if DEBUG_HYBRID:
        _print_multi_debug(query, results, results[0], accepted, rejected)

    return accepted


# ---------------------------------------------------------------------------
# Debugging
# ---------------------------------------------------------------------------

def _print_debug(
    query: str,
    semantic_scores,
    results: list[RetrievalResult],
    decision: tuple[bool, str, float, float] | None,
) -> None:
    print("\n--- Hybrid retrieval debug ---")
    print(f"Query: {query}")

    print("Top semantic candidates:")
    for index in _top_semantic_indices(semantic_scores):
        entry_id = CAMPUS_KNOWLEDGE[index]["id"]
        print(f"  {entry_id}: semantic={semantic_scores[index]:.3f}")

    print("Final hybrid ranking (top 5):")
    for result in results[:5]:
        print(
            f"  {result.entry['id']}: "
            f"semantic={result.semantic_score:.3f} "
            f"lexical={result.lexical_score:.3f} "
            f"lexical_norm={result.normalized_lexical_score:.3f} "
            f"hybrid={result.hybrid_score:.3f}"
        )

    if decision is None:
        print("Confidence gating: skipped (no candidates at all)")
        print("Selected entry: None")
        print("Confidence/fallback decision: FALLBACK (empty candidate set)")
        print("--- end debug ---\n")
        return

    accepted, rule, second_best_semantic, semantic_margin = decision
    top = results[0]

    print("Confidence gating:")
    print(f"  best_semantic={top.semantic_score:.3f} ({top.entry['id']})")
    print(f"  second_best_semantic={second_best_semantic:.3f}")
    print(f"  semantic_margin={semantic_margin:.3f}")
    print(f"  normalized_lexical={top.normalized_lexical_score:.3f}")
    print(f"  hybrid_score={top.hybrid_score:.3f}")
    print(
        f"  thresholds: HYBRID_CONFIDENCE={HYBRID_CONFIDENCE_THRESHOLD} "
        f"SEMANTIC_ONLY={SEMANTIC_ONLY_THRESHOLD} "
        f"STRONG_SEMANTIC={STRONG_SEMANTIC_THRESHOLD} "
        f"SEMANTIC_MARGIN={SEMANTIC_MARGIN_THRESHOLD} "
        f"COMBINED_MIN_SEMANTIC={COMBINED_MIN_SEMANTIC} "
        f"COMBINED_MIN_LEXICAL_NORM={COMBINED_MIN_LEXICAL_NORM}"
    )

    if accepted:
        print(f"Selected entry: {top.entry['id']}")
    else:
        print("Selected entry: None")
    print(f"Confidence/fallback decision: {rule}")

    print("--- end debug ---\n")


def _print_multi_debug(
    query: str,
    results: list[RetrievalResult],
    initial_candidate: RetrievalResult | None,
    accepted: list[RetrievalResult],
    rejected: list[tuple[RetrievalResult, str]],
) -> None:
    """Debug output for retrieve_multi(). Temporary/development output,
    never returned through the API. Never prints secrets, API keys, or
    auth headers - only entry ids, category names, matched query words,
    and the numeric retrieval scores already printed by _print_debug()."""
    print("\n--- Hybrid retrieval debug (multi-evidence) ---")
    print(f"Query: {query}")

    # "Category/intent signals" - deterministic, reusing only what's
    # already stored per entry (category + keywords): for each category
    # that has at least one candidate in the ranked pool, show its
    # strongest candidate. This is the generic stand-in for "which topics
    # does this query seem to touch" - no LLM classifier, just the same
    # hybrid scores grouped by category.
    print("Query category/intent signals:")
    if results:
        best_per_category: dict = {}
        for r in results:
            cat = r.entry["category"]
            if cat not in best_per_category or r.hybrid_score > best_per_category[cat].hybrid_score:
                best_per_category[cat] = r
        for cat, r in sorted(best_per_category.items(), key=lambda kv: kv[1].hybrid_score, reverse=True):
            tokens = ", ".join(sorted(r.matched_query_tokens)) or "(none)"
            print(
                f"  {cat}: best={r.entry['id']} hybrid={r.hybrid_score:.3f} "
                f"matched_query_tokens=[{tokens}]"
            )
    else:
        print("  (empty candidate pool)")

    print("Ranked candidates (top 5):")
    if results:
        for r in results[:5]:
            print(
                f"  {r.entry['id']} ({r.entry['category']}): "
                f"semantic={r.semantic_score:.3f} "
                f"lexical={r.lexical_score:.3f} "
                f"lexical_norm={r.normalized_lexical_score:.3f} "
                f"hybrid={r.hybrid_score:.3f}"
            )
    else:
        print("  (empty candidate pool)")

    print("Initial accepted candidate:")
    if initial_candidate is not None:
        print(f"  {initial_candidate.entry['id']} ({initial_candidate.entry['category']})")
    else:
        print("  none (best candidate rejected - fallback, Gemma not called)")

    print("Additional evidence decisions:")
    decisions = [(r, "ACCEPTED", None) for r in accepted[1:]] + [
        (r, "REJECTED", reason) for r, reason in rejected
    ]
    if decisions:
        decisions.sort(key=lambda item: -item[0].hybrid_score)
        for r, verdict, reason in decisions:
            tokens = ", ".join(sorted(r.matched_query_tokens)) or "(none)"
            if verdict == "ACCEPTED":
                print(
                    f"  {r.entry['id']} ({r.entry['category']}): ACCEPTED - "
                    f"cleared its own confidence gate, matched_query_tokens=[{tokens}]"
                )
            else:
                print(f"  {r.entry['id']} ({r.entry['category']}): REJECTED - {reason}")
    else:
        print("  none")

    print("Final accepted evidence:")
    if accepted:
        for position, r in enumerate(accepted, start=1):
            print(f"  {position}. {r.entry['id']} ({r.entry['category']})")
    else:
        print("  none")

    print(
        f"Generation: {len(accepted)} evidence entries will be sent to grounded generator"
        if accepted
        else "Generation: 0 evidence entries - grounded generator will not be called"
    )

    print("--- end debug (multi-evidence) ---\n")
