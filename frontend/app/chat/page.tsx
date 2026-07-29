"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import ChatSidebar from "@/components/chat/ChatSidebar";
import ChatHeader from "@/components/chat/ChatHeader";
import ChatMessage, { type ChatMessageData } from "@/components/chat/ChatMessage";
import ChatInput from "@/components/chat/ChatInput";
import SuggestedPrompts from "@/components/chat/SuggestedPrompts";
import TypingIndicator from "@/components/chat/TypingIndicator";
import { MessageSkeletonList } from "@/components/ui/Skeleton";
import ErrorBanner from "@/components/ui/ErrorBanner";
import type { Source } from "@/components/chat/SourceCard";
import { API_BASE_URL, clearSession, getStoredToken } from "@/lib/auth";
import {
  ApiError,
  deleteConversation,
  getConversation,
  listConversations,
  type ConversationSummary,
} from "@/lib/chat";
import { describeRequestError } from "@/lib/errors";
import { getStoredSoundEnabled, playNotificationSound } from "@/lib/preferences";
import { createLocalId } from "@/lib/format";

// Which sidebar action most recently failed - drives the single retry
// banner shown above the message area. Keyed to the conversation id so
// the retry button can re-run the exact same action, and to a `kind` so
// it knows whether that means handleSelectChat or performDelete.
interface ActionError {
  kind: "switch" | "delete";
  id: number;
  message: string;
}

// Shape of the real JSON body returned by POST /api/chat - mirrors
// backend/app/schemas/chat.py's ChatResponse. Declared explicitly so the
// fetch response is never typed as `any`.
interface ChatApiResponse {
  answer: string;
  sources: Source[];
  conversation_id: number;
}

function ChatPageContent() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  // True only until the initial GET /api/chats resolves - see the mount
  // effect below. Never re-set to true on later refreshes (e.g. after
  // sending a message), so the sidebar's skeleton only ever shows once,
  // on first load, not on every list refresh.
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  // Id of the conversation currently being switched into or deleted -
  // see handleSelectChat/handleDeleteChat below. Drives both the
  // sidebar's per-item spinner/disabled state and the message area's
  // skeleton while a past conversation is loading in.
  const [switchingChatId, setSwitchingChatId] = useState<number | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<number | null>(null);
  // Set only when the initial (or a retried) GET /api/chats fails - a
  // background refresh failing while a list is already showing is left
  // alone (stale data beats an alarming banner over something that still
  // mostly works); see refreshConversations below.
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  // Guards the landing-page handoff (/chat?q=...) so the initial query only
  // ever gets auto-sent once per page load. Without this, React 18 Strict
  // Mode's dev-only double-invoke of effects (mount -> cleanup -> mount
  // again) would send it twice. A ref survives that synthetic
  // cleanup/remount cycle - it isn't a real unmount - so flipping it to
  // true the first time reliably blocks the second invocation.
  const hasAutoSentRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Chat history now belongs to a real signed-in user (see
  // backend/app/api/chat.py, which requires auth), so this page needs a
  // login guard it didn't have before - same pattern as
  // frontend/app/profile/page.tsx. Also loads the sidebar's conversation
  // list once a token is confirmed present.
  const refreshConversations = useCallback(async () => {
    try {
      const list = await listConversations();
      setConversations(list);
      setConversationsError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        router.push("/login");
        return;
      }
      console.error("Failed to load conversations:", error);
      // Only surface a banner when there's nothing to show at all - a
      // refresh failing after, say, sending a message shouldn't alarm a
      // student over a list that's already visible and just slightly
      // stale.
      setConversations((prev) => {
        if (prev.length === 0) setConversationsError(describeRequestError(error));
        return prev;
      });
    }
  }, [router]);

  useEffect(() => {
    if (!getStoredToken()) {
      router.push("/login");
      return;
    }
    refreshConversations().finally(() => setIsLoadingConversations(false));
  }, [router, refreshConversations]);

  // Does the actual POST /api/chat call - split out from handleSend so a
  // Retry click (see the failed message's own Retry button in
  // ChatMessage.tsx) can re-run just the request, without pushing a
  // second duplicate user bubble for the same question. `failedMessageId`
  // is only passed on a retry, so the earlier error bubble can be removed
  // right as the new attempt starts rather than sitting there stale while
  // "Campus Expert is thinking..." shows underneath it.
  const sendToBackend = useCallback(
    async (content: string, failedMessageId?: string) => {
      if (failedMessageId) {
        setMessages((prev) => prev.filter((message) => message.id !== failedMessageId));
      }
      setIsTyping(true);

      try {
        const token = getStoredToken();
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: content,
            conversation_id: conversationId,
          }),
        });

        if (response.status === 401) {
          clearSession();
          router.push("/login");
          return;
        }

        if (!response.ok) {
          throw new ApiError(response.status, `Backend returned ${response.status}`);
        }

        const data: ChatApiResponse = await response.json();

        const assistantMessage: ChatMessageData = {
          id: createLocalId(),
          role: "assistant",
          content: data.answer,
          timestamp: new Date().toISOString(),
          // Only ever real metadata from the backend's retrieval result -
          // empty when retrieval fell back, so no source card renders for
          // out-of-domain answers. Never hardcoded on the frontend.
          sources: data.sources ?? [],
        };

        setMessages((prev) => [...prev, assistantMessage]);
        // Settings page's Sound toggle's one real effect - see
        // lib/preferences.ts's docstring for why this is the only
        // notification-related preference wired to an actual behavior.
        if (getStoredSoundEnabled()) playNotificationSound();
        // Same id on every message in an already-continuing conversation,
        // so this is a no-op re-render most of the time; only actually
        // changes identity the moment a brand-new conversation is created
        // (null -> real id) on the first message of a chat.
        setConversationId(data.conversation_id);
        // Cheap (a student's own chat list is small) and simplest way to
        // keep the sidebar's title/ordering correct - a new conversation
        // needs to appear, and any conversation just messaged in needs to
        // move to the top (requirement: order by most recently updated).
        refreshConversations();
      } catch (error) {
        console.error("Chat API error:", error);

        const errorId = createLocalId();
        const errorMessage: ChatMessageData = {
          id: errorId,
          role: "assistant",
          content: describeRequestError(error),
          timestamp: new Date().toISOString(),
          isError: true,
          onRetry: () => sendToBackend(content, errorId),
        };

        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsTyping(false);
      }
    },
    [conversationId, refreshConversations, router]
  );

  const handleSend = useCallback(
    (content: string) => {
      const userMessage: ChatMessageData = {
        id: createLocalId(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      sendToBackend(content);
    },
    [sendToBackend]
  );

  // Landing-page handoff: SearchBar navigates here as /chat?q=<question>.
  // Runs once on mount, reads `q`, and sends it through the exact same
  // handleSend() path a manually typed message uses - it becomes the first
  // user message and gets the same backend call, typing indicator, and
  // response handling as any other message.
  useEffect(() => {
    if (hasAutoSentRef.current) return;

    const initialQuery = searchParams.get("q")?.trim();
    if (!initialQuery) return;

    hasAutoSentRef.current = true;
    handleSend(initialQuery);
  }, [searchParams, handleSend]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setIsTyping(false);
    // Clearing this is what makes the NEXT handleSend() create a fresh
    // conversation server-side instead of continuing the old one - no
    // conversation row is created just from clicking "New Chat" with
    // nothing typed yet, so the sidebar never fills up with empty chats.
    setConversationId(null);
  }, []);

  // Stabilized so the now-memoized ChatSidebar/ChatHeader (see
  // components/chat/ChatSidebar.tsx and ChatHeader.tsx) don't see a new
  // function identity - and therefore re-render - on every unrelated
  // parent tick (e.g. the isTyping indicator toggling).
  const handleCloseSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const handleOpenSidebar = useCallback(() => setIsSidebarOpen(true), []);

  const handleSelectChat = useCallback(
    async (id: number) => {
      // Blocks a second switch (or a delete) from starting while this one
      // is still in flight - see ChatSidebar's isBusy, which disables
      // every item's buttons for the same reason. Re-selecting the
      // already-active conversation is also a no-op; nothing to fetch.
      if (switchingChatId !== null || deletingChatId !== null || id === conversationId) return;

      setActionError(null);
      setSwitchingChatId(id);
      try {
        const conversation = await getConversation(id);
        const restoredMessages: ChatMessageData[] = conversation.messages.map((message) => ({
          id: `${message.id}`,
          role: message.role,
          content: message.content,
          timestamp: message.created_at,
          sources: message.sources,
        }));
        setMessages(restoredMessages);
        setConversationId(conversation.id);
        setIsTyping(false);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          router.push("/login");
          return;
        }
        console.error("Failed to load conversation:", error);
        setActionError({ kind: "switch", id, message: describeRequestError(error) });
      } finally {
        setSwitchingChatId(null);
      }
    },
    [conversationId, switchingChatId, deletingChatId, router]
  );

  // The actual DELETE /api/chats/{id} call, split out from handleDeleteChat
  // so the error banner's Retry button can re-run it directly without
  // showing the confirm() dialog a second time - the student already
  // confirmed their intent once.
  const performDelete = useCallback(
    async (id: number) => {
      if (switchingChatId !== null || deletingChatId !== null) return;

      setActionError(null);
      setDeletingChatId(id);
      try {
        await deleteConversation(id);
        setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
        if (conversationId === id) {
          setMessages([]);
          setConversationId(null);
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          router.push("/login");
          return;
        }
        console.error("Failed to delete conversation:", error);
        setActionError({ kind: "delete", id, message: describeRequestError(error) });
      } finally {
        setDeletingChatId(null);
      }
    },
    [conversationId, switchingChatId, deletingChatId, router]
  );

  const handleDeleteChat = useCallback(
    (id: number) => {
      if (switchingChatId !== null || deletingChatId !== null) return;

      const confirmed = window.confirm("Delete this conversation? This can't be undone.");
      if (!confirmed) return;

      performDelete(id);
    },
    [performDelete, switchingChatId, deletingChatId]
  );

  const handleRetryAction = useCallback(() => {
    if (!actionError) return;
    if (actionError.kind === "switch") {
      handleSelectChat(actionError.id);
    } else {
      performDelete(actionError.id);
    }
  }, [actionError, handleSelectChat, performDelete]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface-subtle)]">
      <ChatSidebar
        isOpen={isSidebarOpen}
        onClose={handleCloseSidebar}
        onNewChat={handleNewChat}
        conversations={conversations}
        activeConversationId={conversationId}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        isLoadingConversations={isLoadingConversations}
        switchingChatId={switchingChatId}
        deletingChatId={deletingChatId}
        conversationsError={conversationsError}
        onRetryConversations={refreshConversations}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader onMenuClick={handleOpenSidebar} />

        <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
          {actionError && (
            <div className="mx-auto mb-6 max-w-3xl">
              <ErrorBanner
                message={actionError.message}
                onRetry={handleRetryAction}
                retrying={
                  switchingChatId === actionError.id || deletingChatId === actionError.id
                }
              />
            </div>
          )}

          {switchingChatId !== null ? (
            // A past conversation is being loaded in (GET /api/chats/{id}
            // in flight) - show its shape loading rather than either the
            // still-stale previous messages or an empty state that would
            // incorrectly suggest this is a brand-new chat.
            <MessageSkeletonList />
          ) : messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#6D28D9] shadow-lg shadow-[#6D28D9]/25">
                <Sparkles className="h-8 w-8 text-white" strokeWidth={2} />
              </span>

              <h2 className="mt-6 text-balance text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                How can I help you today?
              </h2>

              <p className="mt-3 max-w-xl text-balance text-[var(--text-secondary)]">
                Ask anything about academics, hostels, faculty, clubs,
                transport, placements or campus life.
              </p>

              <div className="mt-10 w-full">
                <SuggestedPrompts onSelect={handleSend} />
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}

              {isTyping && <TypingIndicator />}

              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <ChatInput onSend={handleSend} disabled={isTyping || switchingChatId !== null} />
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary around whatever calls it,
// otherwise Next.js's App Router build fails with "useSearchParams() should
// be wrapped in a suspense boundary". The actual page logic lives in
// ChatPageContent above; this default export just supplies that boundary.
export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageContent />
    </Suspense>
  );
}
