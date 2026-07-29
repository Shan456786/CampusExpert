from pydantic import BaseModel, Field


# Request body for POST /api/chat
class ChatRequest(BaseModel):
    # max_length is a hard backstop, not a UX limit - no real student
    # question is anywhere near 4000 characters (ChatInput.tsx doesn't
    # even impose one client-side, since it never needed to). Without it,
    # this field was unbounded: every message here is forwarded into the
    # prompt sent to OpenRouter (see
    # app/services/answer_generator.py's generate_grounded_answer()),
    # which is billed per token, so an unbounded message was both a
    # storage-bloat and a real-money-cost abuse vector, not just a
    # storage one.
    message: str = Field(min_length=1, max_length=4000)
    # None starts a brand-new conversation (see app/api/chat.py's chat()).
    # An existing id continues that conversation - the caller must own it,
    # enforced server-side by app/data/conversation_store.get_conversation().
    conversation_id: int | None = None


# Safe-to-display metadata for ONE retrieved CAMPUS_KNOWLEDGE entry.
# Deliberately narrow: only fields a student should see. No retrieval
# scores, no internal debug details.
#
# - title is the entry's own short label (e.g. "Library Hours") - never
#   fabricated, read straight from the knowledge base entry.
# - category and source_type are passed through exactly as stored.
#   source_type in particular is what the frontend uses to decide whether
#   to show a Verified/Official badge or an Unverified badge, so it must
#   be the entry's actual value, never something inferred from the fact
#   that retrieval matched it.
# - source_url is the real webpage or PDF this fact was pulled from -
#   rendered as a clickable link on the source card so a student can go
#   verify the fact themselves, not just trust the chat answer.
# - last_updated is when this fact was last confirmed against its source
#   (ISO date) - lets a student judge how fresh a fact is at a glance.
class Source(BaseModel):
    id: str
    title: str
    category: str
    source_type: str
    source_url: str
    last_updated: str


# Response body returned by POST /api/chat
class ChatResponse(BaseModel):
    answer: str
    # Empty when retrieval rejected the question (nothing was actually used
    # to answer, so there is nothing truthful to cite). Populated with the
    # exact entry used - whether the answer came from Gemma or from a
    # generation-failure fallback to the stored answer text.
    sources: list[Source] = []
    # The conversation this exchange was saved to - new if the request's
    # conversation_id was None, the same id otherwise. Always present so
    # the frontend can thread every future message in this chat to the
    # same conversation without guessing.
    conversation_id: int


# One row from conversation_messages, translated to API shape - see
# app/api/conversations.py.
class ConversationMessage(BaseModel):
    id: int
    role: str
    content: str
    sources: list[Source] = []
    created_at: str


# Sidebar-list shape: enough to render "Recent Chats" without fetching
# every message of every conversation. See GET /api/chats.
class ConversationSummary(BaseModel):
    id: int
    title: str
    updated_at: str


# Full conversation with messages, in send order - what clicking a chat in
# the sidebar restores. See GET /api/chats/{conversation_id}.
class ConversationDetail(BaseModel):
    id: int
    title: str
    created_at: str
    updated_at: str
    messages: list[ConversationMessage]
