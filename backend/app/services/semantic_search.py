"""
Semantic matching for the Campus Expert knowledge base.

WHY THIS EXISTS
---------------
Keyword matching alone breaks the moment a student phrases a question
differently. "When do hostel gates close?" shares zero words with "hostel
closing", so keyword matching would never connect the two, even though
they mean the same thing.

Sentence embeddings fix this by converting text into a vector (a list of
numbers) that captures MEANING rather than exact wording. Two sentences
that mean similar things end up as vectors pointing in a similar direction
in that vector space, even if they share no words. We measure "how similar
the direction is" with cosine similarity: 1.0 = same meaning, 0.0 =
unrelated, negative = opposite meaning (for normalized vectors). Real
sentence pairs about the same topic usually land somewhere between 0.3 and
0.8.

HOW IT WORKS HERE (knowledge-base side)
-----------------------------------------
Every knowledge base entry's embedding is now computed ONCE, offline, by
the ingestion pipeline (ingest.py) when a page is crawled, and stored in
SQLite alongside its text (app/data/db.py, app/data/chunk_store.py).
app/data/knowledge.py loads those precomputed vectors at process startup
into CAMPUS_KNOWLEDGE_EMBEDDINGS.

This module does NOT compute knowledge-base embeddings anymore - it only
loads the already-computed matrix into memory once (see
_get_knowledge_embeddings() below) and reuses it for the lifetime of the
server process. That's a deliberate, important property: the chatbot must
never scrape or (re-)embed knowledge content while answering a live user
question - only the ingestion script, run offline ahead of time, does that.
See app/ingestion/ and ingest.py for that half of the pipeline.

HOW IT WORKS HERE (per-request side)
---------------------------------------
On each chat request we embed only the incoming user message (one
embedding call, using the exact same model the knowledge base was embedded
with) and compare it against the cached matrix of knowledge base vectors
using cosine similarity.
"""

from __future__ import annotations

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from app.data.knowledge import CAMPUS_KNOWLEDGE, CAMPUS_KNOWLEDGE_EMBEDDINGS

# A small, fast, well-regarded general-purpose sentence embedding model.
# Produces 384-dimensional vectors. Good accuracy/speed tradeoff for this
# project's scale, running on CPU. ingest.py imports this exact
# constant too (rather than hardcoding the model name a second time), so
# the knowledge base and the live query are always embedded with the same
# model - a mismatch there would silently make every similarity score
# meaningless.
_MODEL_NAME = "all-MiniLM-L6-v2"

# Below this cosine similarity score we treat the best match as "not
# confident enough" and fall back to the default "I don't know" response
# instead of returning a possibly-wrong answer. Only used by the legacy
# find_best_match() below - the live hybrid chat endpoint uses
# hybrid_retriever.py's evidence-aware confidence gating instead, which is
# considerably more nuanced than one flat threshold.
SIMILARITY_THRESHOLD = 0.45

# Cached at module level so we only pay the model-loading cost once per
# server run, not once per request. Starts as None and gets filled in
# lazily on first use (see _get_model below) or eagerly via warm_up().
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    """Load the embedding model once and reuse it (loading takes a few
    seconds; we don't want to pay that cost on every request). This is the
    ONLY embedding-related network/disk cost paid at runtime - it loads
    model weights, it does not compute any knowledge-base content."""
    global _model
    if _model is None:
        _model = SentenceTransformer(_MODEL_NAME)
    return _model


def _get_knowledge_embeddings():
    """Return the precomputed knowledge-base embedding matrix loaded by
    app/data/knowledge.py at import time. No computation happens here -
    this is a pure in-memory read, aligned index-for-index with
    CAMPUS_KNOWLEDGE (CAMPUS_KNOWLEDGE[i] <-> CAMPUS_KNOWLEDGE_EMBEDDINGS[i]),
    exactly the same alignment guarantee the old computed-at-startup cache
    provided."""
    return CAMPUS_KNOWLEDGE_EMBEDDINGS


def warm_up() -> None:
    """Force the embedding model to load immediately, and confirm the
    knowledge base has embeddings ready.

    Call this once at server startup (see main.py) so the *first real user
    request* isn't the one stuck waiting several seconds for the model to
    load from disk. The knowledge-base embeddings themselves are already
    loaded (from SQLite, not computed) by the time this module is
    imported - this just also loads the model and prints a diagnostic
    confirming both are ready.
    """
    _get_model()
    embeddings = _get_knowledge_embeddings()
    print(
        f"[Campus Expert] Semantic search ready: "
        f"{len(CAMPUS_KNOWLEDGE)} chunks loaded from the knowledge database, "
        f"embedding shape={getattr(embeddings, 'shape', 'unknown')}"
    )
    if len(CAMPUS_KNOWLEDGE) == 0:
        print(
            "[Campus Expert] WARNING: knowledge base is empty - every "
            "question will fall back to the out-of-domain response until "
            "ingest.py has been run."
        )


def get_semantic_similarities(user_message: str):
    """Return the cosine similarity between user_message and EVERY
    knowledge base entry, as a 1D numpy array aligned with
    CAMPUS_KNOWLEDGE's order (index 0 of the result = CAMPUS_KNOWLEDGE[0],
    and so on).

    This is the building block hybrid_retriever.py uses to get semantic
    scores for a whole candidate set, not just a single best match. Reuses
    the cached model and the cached (precomputed, loaded-from-SQLite)
    knowledge embeddings, so calling this does NOT reload the model,
    recompute knowledge base vectors, or touch the network.
    """
    model = _get_model()
    knowledge_embeddings = _get_knowledge_embeddings()

    if len(knowledge_embeddings) == 0:
        import numpy as np

        return np.zeros(0, dtype=np.float32)

    message_embedding = model.encode([user_message], normalize_embeddings=True)

    # cosine_similarity returns a 2D matrix (1 message x N entries);
    # we only embedded one message, so we take row 0.
    return cosine_similarity(message_embedding, knowledge_embeddings)[0]


def find_best_match(user_message: str) -> tuple[dict | None, float]:
    """Find the knowledge base entry closest in meaning to user_message.

    Returns (entry, score) where entry is None if nothing cleared
    SIMILARITY_THRESHOLD, or if the knowledge base is empty. score is
    always returned (even on a miss) so callers can log it for
    debugging/threshold-tuning if they want to.

    Kept for backward compatibility / standalone semantic-only use. The
    hybrid chat endpoint uses hybrid_retriever.retrieve_multi() instead,
    which calls get_semantic_similarities() above and combines it with
    lexical scoring.
    """
    similarities = get_semantic_similarities(user_message)
    if len(similarities) == 0:
        return None, 0.0

    best_index = int(similarities.argmax())
    best_score = float(similarities[best_index])

    if best_score >= SIMILARITY_THRESHOLD:
        return CAMPUS_KNOWLEDGE[best_index], best_score

    return None, best_score
