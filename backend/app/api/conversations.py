from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import get_current_user
from app.data import conversation_store
from app.schemas.chat import ConversationDetail, ConversationMessage, ConversationSummary
from app.services.auth_service import PublicUser

router = APIRouter()


def _to_summary(row) -> ConversationSummary:
    return ConversationSummary(
        id=row["id"], title=row["title"], updated_at=row["updated_at"]
    )


def _to_message(row) -> ConversationMessage:
    try:
        sources = json.loads(row["sources_json"])
    except (TypeError, ValueError):
        # A corrupt/unexpected sources_json value shouldn't take down the
        # whole conversation - the message text itself is still shown,
        # just without source cards.
        sources = []

    return ConversationMessage(
        id=row["id"],
        role=row["role"],
        content=row["content"],
        sources=sources,
        created_at=row["created_at"],
    )


@router.get("/chats", response_model=list[ConversationSummary])
def list_chats(current_user: PublicUser = Depends(get_current_user)):
    """Sidebar's "Recent Chats" list - already ordered most-recently-updated
    first by conversation_store.list_conversations()."""
    rows = conversation_store.list_conversations(current_user.id)
    return [_to_summary(row) for row in rows]


@router.get("/chats/{conversation_id}", response_model=ConversationDetail)
def get_chat(
    conversation_id: int, current_user: PublicUser = Depends(get_current_user)
):
    """Restores one conversation - clicking a chat in the sidebar calls
    this. 404 covers both "doesn't exist" and "exists but belongs to
    someone else" identically, see conversation_store.get_conversation()."""
    conversation = conversation_store.get_conversation(
        conversation_id, current_user.id
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    messages = conversation_store.list_messages(conversation_id)
    return ConversationDetail(
        id=conversation["id"],
        title=conversation["title"],
        created_at=conversation["created_at"],
        updated_at=conversation["updated_at"],
        messages=[_to_message(row) for row in messages],
    )


@router.delete("/chats/{conversation_id}", status_code=204)
def delete_chat(
    conversation_id: int, current_user: PublicUser = Depends(get_current_user)
):
    deleted = conversation_store.delete_conversation(
        conversation_id, current_user.id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return None
