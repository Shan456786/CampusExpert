// Shared helpers for Campus Expert's conversation history API
// (backend/app/api/conversations.py, plus the conversation_id field on
// POST /api/chat in backend/app/api/chat.py). Used by the chat page and
// its sidebar.

import { API_BASE_URL, getStoredToken } from "@/lib/auth";
import type { Source } from "@/components/chat/SourceCard";

export interface ConversationSummary {
  id: number;
  title: string;
  updated_at: string;
}

export interface ConversationMessageApi {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  created_at: string;
}

export interface ConversationDetail {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ConversationMessageApi[];
}

// Thrown by every helper below instead of a plain Error, so callers can
// tell "the session token is invalid/expired" (401 - should log the user
// out and redirect to /login) apart from any other failure.
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/chats`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, `Failed to load conversations (${response.status})`);
  }
  return response.json();
}

export async function getConversation(id: number): Promise<ConversationDetail> {
  const response = await fetch(`${API_BASE_URL}/api/chats/${id}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, `Failed to load conversation ${id} (${response.status})`);
  }
  return response.json();
}

export async function deleteConversation(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/chats/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  // A 404 here means the conversation is already gone (e.g. deleted from
  // another tab) - the caller's desired end state is already true, so
  // this is treated as success rather than an error to surface.
  if (!response.ok && response.status !== 404) {
    throw new ApiError(response.status, `Failed to delete conversation ${id} (${response.status})`);
  }
}
