"use client";

import { memo, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Plus, MessageSquare, Settings, LogOut, Loader2, Trash2, X } from "lucide-react";
import type { ConversationSummary } from "@/lib/chat";
import { getStoredUser, logoutSession, type StoredUser } from "@/lib/auth";
import { ConversationSkeletonList } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import ErrorBanner from "@/components/ui/ErrorBanner";
import { getInitials } from "@/lib/format";

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  conversations: ConversationSummary[];
  activeConversationId: number | null;
  onSelectChat: (id: number) => void;
  onDeleteChat: (id: number) => void;
  // Initial GET /api/chats fetch still in flight - shows skeleton rows
  // instead of flashing "No conversations yet." at every student, even
  // one who has plenty of chat history, for the split second before the
  // real list arrives.
  isLoadingConversations?: boolean;
  // Id of the conversation currently being switched into (GET
  // /api/chats/{id} in flight) or deleted (DELETE /api/chats/{id} in
  // flight) - null when nothing is in progress. Used to show a per-item
  // spinner and block a second click on the same or another item until
  // the first request resolves, preventing duplicate requests.
  switchingChatId?: number | null;
  deletingChatId?: number | null;
  // Set when GET /api/chats itself failed (see app/chat/page.tsx's
  // refreshConversations) - shown instead of the empty state, since
  // "No chats yet" would be actively misleading if the real reason is
  // that the list couldn't be loaded at all.
  conversationsError?: string | null;
  onRetryConversations?: () => void;
}

function ChatSidebar({
  isOpen,
  onClose,
  onNewChat,
  conversations,
  activeConversationId,
  onSelectChat,
  onDeleteChat,
  isLoadingConversations = false,
  switchingChatId = null,
  deletingChatId = null,
  conversationsError = null,
  onRetryConversations,
}: ChatSidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden h-screen w-[280px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:flex">
        <SidebarBody
          onNewChat={onNewChat}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectChat={onSelectChat}
          onDeleteChat={onDeleteChat}
          isLoadingConversations={isLoadingConversations}
          switchingChatId={switchingChatId}
          deletingChatId={deletingChatId}
          conversationsError={conversationsError}
          onRetryConversations={onRetryConversations}
        />
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 md:hidden ${
          isOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!isOpen}
      >
        <div
          className={`absolute inset-0 bg-[#111827]/40 backdrop-blur-sm transition-opacity duration-300 ${
            isOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={onClose}
        />

        <aside
          className={`relative z-10 flex h-full w-[280px] max-w-[80vw] flex-col bg-[var(--surface)] shadow-xl transition-transform duration-300 ease-out ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-end px-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)]"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
          <SidebarBody
            onNewChat={onNewChat}
            onNavigate={onClose}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectChat={onSelectChat}
            onDeleteChat={onDeleteChat}
            isLoadingConversations={isLoadingConversations}
            switchingChatId={switchingChatId}
            deletingChatId={deletingChatId}
            conversationsError={conversationsError}
            onRetryConversations={onRetryConversations}
          />
        </aside>
      </div>
    </>
  );
}

// Memoized: this list re-renders on every keystroke of an in-flight
// assistant reply (chat/page.tsx's isTyping/streaming state changes), but
// the sidebar's own contents - the conversation list, active id, busy
// flags - don't change on those ticks. Skipping re-render when props are
// unchanged avoids re-rendering every conversation row for no reason.
export default memo(ChatSidebar);

interface SidebarBodyProps {
  onNewChat: () => void;
  onNavigate?: () => void;
  conversations: ConversationSummary[];
  activeConversationId: number | null;
  onSelectChat: (id: number) => void;
  onDeleteChat: (id: number) => void;
  conversationsError: string | null;
  onRetryConversations?: () => void;
  isLoadingConversations: boolean;
  switchingChatId: number | null;
  deletingChatId: number | null;
}

function SidebarBody({
  onNewChat,
  onNavigate,
  conversations,
  activeConversationId,
  onSelectChat,
  onDeleteChat,
  isLoadingConversations,
  switchingChatId,
  deletingChatId,
  conversationsError,
  onRetryConversations,
}: SidebarBodyProps) {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // True while any select/delete request for some conversation is
  // in-flight - blocks starting a second one from a different item so
  // two switches/deletes can never race each other.
  const isBusy = switchingChatId !== null || deletingChatId !== null;

  // Same session store every other authenticated page reads from - see
  // frontend/lib/auth.ts. Replaces the hardcoded "AR" / "Ananya Reddy"
  // placeholder that used to show for every real signed-in student.
  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const handleSettingsClick = () => {
    onNavigate?.();
    router.push("/settings");
  };

  const handleLogoutClick = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logoutSession();
      onNavigate?.();
      router.push("/");
    } finally {
      setIsLoggingOut(false);
    }
  };

  // "GU" ("Guest User") only ever shows before getStoredUser() resolves on
  // mount, or in the (practically unreachable, since this page redirects
  // unauthenticated visitors to /login) case where no session exists at
  // all - never a stand-in for a real student's initials.
  const initials = user ? getInitials(user.name) : "GU";

  return (
    <div className="flex h-full flex-col px-4 py-5">
      {/* Logo */}
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#6D28D9] shadow-sm shadow-[#6D28D9]/20">
          <Sparkles className="h-5 w-5 text-white" strokeWidth={2} />
        </span>
        <span className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
          Campus Expert
        </span>
      </Link>

      {/* New Chat - disabled while a switch/delete is still in flight, so
          it can't clear the active conversation out from under a
          getConversation() response that's about to land. */}
      <button
        type="button"
        onClick={() => {
          if (isBusy) return;
          onNewChat();
          onNavigate?.();
        }}
        disabled={isBusy}
        className="mt-6 flex items-center justify-center gap-2 rounded-full bg-[#6D28D9] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:scale-[1.02] hover:bg-[#7C3AED] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
      >
        <Plus className="h-4 w-4" strokeWidth={2.25} />
        New Chat
      </button>

      {/* Recent Chats */}
      <nav className="mt-8 flex-1 overflow-y-auto" aria-label="Recent chats">
        <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Recent Chats
        </h3>

        {isLoadingConversations ? (
          <ConversationSkeletonList />
        ) : conversationsError && conversations.length === 0 ? (
          <div className="mt-3 px-2 text-xs">
            <ErrorBanner message={conversationsError} onRetry={onRetryConversations} />
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState
            compact
            icon={MessageSquare}
            title="No chats yet"
            description="Start a conversation and it'll show up here so you can pick it back up anytime."
            suggestions={["Library timings", "Attendance rules", "Hostel rules", "Mess timings"]}
          >
            <button
              type="button"
              onClick={() => {
                onNewChat();
                onNavigate?.();
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#6D28D9] px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:scale-[1.03] hover:bg-[#7C3AED] active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
              Start a Chat
            </button>
          </EmptyState>
        ) : (
          <ul className="mt-3 space-y-1">
            {conversations.map((chat) => {
              const isActive = chat.id === activeConversationId;
              const isSwitchingToThis = switchingChatId === chat.id;
              const isDeletingThis = deletingChatId === chat.id;
              // Disabled while THIS item's own request is in flight, or
              // while any other switch/delete is in flight - a second
              // click can't fire a duplicate request for the same item,
              // and clicking a different item can't start a second
              // request racing the first.
              const isDisabled = isBusy;
              return (
                <li key={chat.id}>
                  <div
                    className={`group flex w-full items-center gap-1 rounded-lg pr-1.5 transition-colors duration-200 ${
                      isActive ? "bg-[var(--surface-subtle)] text-[#6D28D9]" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-subtle)] hover:text-[#6D28D9]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isDisabled) return;
                        onSelectChat(chat.id);
                        onNavigate?.();
                      }}
                      disabled={isDisabled}
                      aria-current={isActive ? "true" : undefined}
                      aria-busy={isSwitchingToThis}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSwitchingToThis ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#6D28D9]" strokeWidth={2} />
                      ) : (
                        <MessageSquare
                          className={`h-4 w-4 shrink-0 ${isActive ? "text-[#6D28D9]" : "text-[var(--text-secondary)]"}`}
                          strokeWidth={2}
                        />
                      )}
                      <span className="truncate">{chat.title}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isDisabled) return;
                        onDeleteChat(chat.id);
                      }}
                      disabled={isDisabled}
                      aria-label={`Delete "${chat.title}"`}
                      aria-busy={isDeletingThis}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition-all duration-200 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[var(--text-secondary)] ${
                        isDeletingThis ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {isDeletingThis ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Profile card */}
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DDD6FE] text-sm font-semibold text-[#6D28D9]">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {user?.name ?? "Guest User"}
          </p>
          {/* Real signed-in email, not a hardcoded "VIT AP Student" label -
              every visitor to this page has a real session (see the
              redirect-to-/login guard in app/chat/page.tsx), so this is
              never a placeholder for an actual student. */}
          <p className="truncate text-xs text-[var(--text-secondary)]">
            {user?.email ?? "Not signed in"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSettingsClick}
            aria-label="Settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[#6D28D9]"
          >
            <Settings className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={handleLogoutClick}
            disabled={isLoggingOut}
            aria-label="Log out"
            aria-busy={isLoggingOut}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <LogOut className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
