from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import get_current_user
from app.data import conversation_store
from app.schemas.chat import ChatRequest, ChatResponse, Source
from app.services.answer_generator import AnswerGenerationError, generate_grounded_answer
from app.services.auth_service import PublicUser
from app.services.conversational import classify_smalltalk, has_greeting_opener, smalltalk_reply
from app.services.knowledge_retriever import DEBUG_RETRIEVAL, retrieve, suggest_related_topics

router = APIRouter()


# Shown whenever retrieval finds no matching topic at all (requirement:
# "only use the fallback if absolutely no topic matches" - see
# knowledge_retriever.retrieve()'s docstring for exactly when that is).
# This exact sentence is the required lead-in - explains the gap plainly
# instead of a bare "I don't know", and is never itself a dead end: see
# _no_information_reply() for how it's always followed by either
# genuinely related topics or, failing that, the general topic list.
_NO_INFORMATION_LEAD = "I couldn't find verified information in the current knowledge base for that."

# Used only when suggest_related_topics() finds nothing even loosely
# related to the question - i.e. there's truly nothing "available" to
# offer instead (see the docstring below), so this falls back to naming
# what Campus Expert covers in general.
_NO_INFORMATION_GENERAL_TOPICS = (
    "I can help with topics like academics, attendance, exams, hostel, "
    "mess, transport, campus services, faculty, medical services, leave, "
    "clubs, or placements instead."
)


def _no_information_reply(query: str) -> str:
    """Builds the out-of-domain fallback message: the required lead
    sentence, plus real related topics when knowledge_retriever.py found
    any (near-miss entries that didn't clear the match threshold but
    share SOME genuine keyword/alias overlap with the question), or the
    general topic list when it didn't. Never fabricates a "related"
    topic - suggest_related_topics() only ever returns entries that
    actually exist in the knowledge base with a real, if insufficient,
    signal; nothing here is invented to fill the gap."""
    related = suggest_related_topics(query)
    if not related:
        return f"{_NO_INFORMATION_LEAD} {_NO_INFORMATION_GENERAL_TOPICS}"

    topic_list = ", ".join(f"**{entry['title']}**" for entry in related)
    return (
        f"{_NO_INFORMATION_LEAD} The closest related topics I do have are "
        f"{topic_list} - want me to share one of those, or try rephrasing "
        "your question?"
    )

# How much of the first user message becomes a saved conversation's title
# (chat history feature - see app/data/conversation_store.py). Titles
# never change after the conversation is created, same as most chat
# products: it's a label to find the conversation again, not a live
# summary of everything discussed in it.
_TITLE_MAX_CHARS = 48


def _derive_conversation_title(message: str) -> str:
    text = message.strip()
    if not text:
        return "New Chat"
    if len(text) <= _TITLE_MAX_CHARS:
        return text

    truncated = text[:_TITLE_MAX_CHARS]
    last_space = truncated.rfind(" ")
    if last_space > 0:
        truncated = truncated[:last_space]
    return truncated.rstrip() + "…"


def _build_source(entry: dict) -> Source:
    """Turn one CAMPUS_KNOWLEDGE entry into the Source metadata returned to
    the frontend. Every field is read straight from the entry - nothing
    here is guessed or upgraded. title is the entry's own short label,
    source_url is the real vitap.ac.in page or PDF the fact was pulled
    from (rendered as a clickable link - see SourceCard.tsx), and
    source_type is passed through as-is so "official" vs "unverified"
    entries are never conflated in the UI."""
    return Source(
        id=entry["id"],
        title=entry["title"],
        category=entry["category"],
        source_type=entry["source_type"],
        source_url=entry["source"],
        last_updated=entry["last_updated"],
    )


def _combine_stored_answers(entries: list[dict]) -> str:
    """Safe fallback text for when grounded generation fails.

    Single entry: just return that entry's own stored content, unchanged -
    it's already written as a natural sentence, nothing to add.

    Multiple entries: never asks anything to merge or paraphrase them (that
    would be generation, and generation is exactly what just failed).
    Instead each accepted entry's own content is listed under its own
    bold title (markdown the frontend actually renders - see
    ChatMessage.tsx), clearly separated, so nothing is blended into a new
    sentence that could misstate either fact, but it still reads like an
    answer instead of a raw data dump.
    """
    if len(entries) == 1:
        return entries[0]["content"]

    sections = [f"**{entry['title']}**\n{entry['content']}" for entry in entries]
    return "Here's what I found:\n\n" + "\n\n".join(sections)


@router.post("/chat", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    current_user: PublicUser = Depends(get_current_user),
):
    # First line in the handler, before anything else runs. If this line
    # doesn't appear in the terminal for a request the user sent, the
    # request never reached this endpoint at all - a frontend/network/CORS
    # problem, not a retrieval or generation problem. If it DOES appear,
    # steps 1-3 (frontend sent something, endpoint was hit, backend
    # received the exact query) are all confirmed.
    print(f"\n[chat] Received Query: {request.message!r} (user_id={current_user.id})")

    # Chat history ("associate chats with the logged-in user") is why this
    # endpoint requires auth at all. Resolve which conversation this
    # message belongs to BEFORE running retrieval, so a bad/foreign
    # conversation_id fails fast with 404 instead of doing retrieval work
    # first and discarding it.
    if request.conversation_id is not None:
        conversation = conversation_store.get_conversation(
            request.conversation_id, current_user.id
        )
        if conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )
        conversation_id = conversation["id"]
    else:
        conversation = conversation_store.create_conversation(
            user_id=current_user.id,
            title=_derive_conversation_title(request.message),
        )
        conversation_id = conversation["id"]

    # Prior turns of this exact conversation, oldest first - empty for a
    # conversation that was just created above. Feeds three things: (1)
    # whether this is the student's very first message here, which tweaks
    # the smalltalk greeting reply below; (2) a fallback context
    # knowledge_retriever.retrieve() can use to resolve a short follow-up
    # question that has no keywords of its own; (3) real prior turns
    # handed to the LLM so it can keep tone/references consistent - see
    # generate_grounded_answer()'s conversation_history parameter.
    history_rows = conversation_store.list_messages(conversation_id)
    is_first_message = len(history_rows) == 0
    history_for_llm = [
        {"role": row["role"], "content": row["content"]} for row in history_rows
    ]
    last_user_message = next(
        (row["content"] for row in reversed(history_rows) if row["role"] == "user"),
        "",
    )

    # Smalltalk (greetings, thanks, goodbyes, "ok", "who are you"...) never
    # touches retrieval or the LLM - see conversational.py's docstring for
    # why: there's nothing to retrieve or ground an answer in, and a
    # varied canned reply is instant, free, and can never hallucinate.
    smalltalk_category = classify_smalltalk(request.message)
    if smalltalk_category is not None:
        if DEBUG_RETRIEVAL:
            print(
                f"[chat] Smalltalk detected: category={smalltalk_category!r} "
                "- skipping retrieval/generation"
            )

        answer_text = smalltalk_reply(smalltalk_category, is_first_message=is_first_message)
        sources: list[Source] = []

        conversation_store.add_message(
            conversation_id=conversation_id, role="user", content=request.message
        )
        conversation_store.add_message(
            conversation_id=conversation_id, role="assistant", content=answer_text
        )
        conversation_store.touch_conversation(conversation_id)

        print(
            f"[chat] Returning smalltalk reply to frontend: "
            f"conversation_id={conversation_id}\n"
        )

        return ChatResponse(
            answer=answer_text, sources=sources, conversation_id=conversation_id
        )

    # True only for a real question that opens with a greeting ("Hi, what
    # time does the library close?") - a pure greeting alone was already
    # handled above and never reaches here.
    greeted = has_greeting_opener(request.message)

    # Retrieval: deterministic keyword/intent matching against the small,
    # hand-authored knowledge base - see knowledge_retriever.py. Returns
    # 0-3 matching entries (plain dicts), best first, one per distinct
    # category; [] only when neither the question alone nor the question
    # combined with the last thing the student asked has any real keyword
    # overlap with the knowledge base.
    accepted_entries = retrieve(request.message, history_context=last_user_message)

    if not accepted_entries:
        # No topic matched at all. The LLM is never called here - there is
        # nothing to ground an answer in, so asking it to answer anyway
        # would defeat the entire point of retrieval-gated generation.
        if DEBUG_RETRIEVAL:
            print("Generation:")
            print("  accepted evidence: none")
            print("  OpenRouter not called")

        answer_text = _no_information_reply(request.message)
        sources: list[Source] = []
        no_match = True
    else:
        no_match = False
        # The LLM only ever sees the entries retrieval already selected -
        # it is a phrasing layer on top of retrieval, never a second
        # opinion on WHICH entry (or entries) are correct.
        evidence = accepted_entries

        # Built right after retrieval accepts these entries, so the exact
        # same entries are both what the LLM is grounded in AND what gets
        # cited back to the student - one Source per accepted entry,
        # regardless of whether generation below succeeds or falls back to
        # the stored answer text.
        sources = [_build_source(entry) for entry in accepted_entries]

        if DEBUG_RETRIEVAL:
            print("Generation:")
            ids = ", ".join(entry["id"] for entry in accepted_entries)
            print(f"  accepted evidence ({len(accepted_entries)}): {ids}")
            print("  calling grounded generator")

        try:
            answer_text = generate_grounded_answer(
                question=request.message,
                evidence=evidence,
                conversation_history=history_for_llm,
                greeted=greeted,
            )
            if DEBUG_RETRIEVAL:
                print("  generation successful")

        except AnswerGenerationError as exc:
            # Covers a missing/misconfigured API key as well as any
            # OpenRouter failure - timeout, HTTP error, malformed
            # response. A generation problem must never take down
            # /api/chat: falling back to the retrieved entries' own stored
            # answer text is always a safe, working response.
            print(
                "[chat] Grounded generation failed, using stored answer(s) "
                f"instead: {exc}"
            )
            if DEBUG_RETRIEVAL:
                print("  generation failed")
                print("  using retrieved-answer fallback")

            answer_text = _combine_stored_answers(accepted_entries)

    # Persist both sides of this turn - including a no-match question,
    # since that's still a real part of the conversation the student had.
    # sources_json mirrors exactly what's returned to the frontend below,
    # so restoring a conversation later shows the same source cards it
    # originally had, never recomputed.
    conversation_store.add_message(
        conversation_id=conversation_id,
        role="user",
        content=request.message,
    )
    conversation_store.add_message(
        conversation_id=conversation_id,
        role="assistant",
        content=answer_text,
        sources_json=json.dumps([source.model_dump() for source in sources]),
    )
    conversation_store.touch_conversation(conversation_id)

    # Last line before the response leaves this handler - confirms step 8
    # (the LLM/fallback response is actually returned to the frontend) and
    # gives an at-a-glance answer to "did this fall back or answer for
    # real", without having to scroll back up through the retrieval trace.
    print(
        f"[chat] Returning to frontend: conversation_id={conversation_id}, "
        f"{len(sources)} source(s), answer_len={len(answer_text)} chars, "
        f"fell_back={no_match}\n"
    )

    return ChatResponse(
        answer=answer_text,
        sources=sources,
        conversation_id=conversation_id,
    )
