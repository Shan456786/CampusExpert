"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Menu,
  Home,
  User,
  Settings as SettingsIcon,
  BookOpen,
  Info,
  LogOut,
  Loader2,
} from "lucide-react";
import { getStoredUser, logoutSession, type StoredUser } from "@/lib/auth";
import { getInitials } from "@/lib/format";
import { useDismissOnOutsideClick } from "@/lib/hooks";

interface ChatHeaderProps {
  onMenuClick: () => void;
}

function ChatHeader({ onMenuClick }: ChatHeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Loaded from the existing session store (frontend/lib/auth.ts) - the
  // same localStorage-backed user object signup/login already write and
  // the settings/profile pages already read. No new fetch added here.
  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  // Click-outside + Escape close, same pattern already used by the
  // Menu dropdown in components/layout/Navbar.tsx.
  const closeMenuDropdown = useCallback(() => setIsMenuOpen(false), []);
  useDismissOnOutsideClick(isMenuOpen, menuRef, closeMenuDropdown);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      // Invalidates the session server-side (see backend's POST
      // /api/auth/logout) before clearing the local token - same helper
      // frontend/app/settings/page.tsx uses.
      await logoutSession();
      setIsMenuOpen(false);
      router.push("/");
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Same "GU" fallback ChatSidebar.tsx uses - only shows before
  // getStoredUser() resolves on mount, never a stand-in for a real
  // student's initials.
  const initials = user ? getInitials(user.name) : "GU";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] md:hidden"
        >
          <Menu className="h-5 w-5" strokeWidth={2} />
        </button>

        <div>
          <h1 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
            Campus Expert
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">Ask anything about VIT AP</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Profile menu"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#DDD6FE] text-sm font-semibold text-[#6D28D9] transition-transform duration-200 hover:scale-105"
          >
            {initials}
          </button>

          {isMenuOpen && (
            <div
              role="menu"
              aria-label="Account menu"
              className="absolute right-0 top-full z-20 mt-2 w-64 origin-top-right animate-[fadeIn_0.15s_ease-out] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg shadow-[#111827]/10"
            >
              <div className="px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {user?.name ?? "Guest User"}
                </p>
                <p className="truncate text-xs text-[var(--text-secondary)]">{user?.email ?? ""}</p>
              </div>

              <div className="my-1 h-px bg-[var(--border)]" />

              <Link
                href="/"
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[#6D28D9]"
              >
                <Home className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Home
              </Link>
              <Link
                href="/profile"
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[#6D28D9]"
              >
                <User className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                My Profile
              </Link>
              <Link
                href="/settings"
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[#6D28D9]"
              >
                <SettingsIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Settings
              </Link>
              <Link
                href="/resources"
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[#6D28D9]"
              >
                <BookOpen className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Resources
              </Link>
              <Link
                href="/about"
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[#6D28D9]"
              >
                <Info className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                About
              </Link>

              <div className="my-1 h-px bg-[var(--border)]" />

              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                disabled={isLoggingOut}
                aria-busy={isLoggingOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors duration-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <LogOut className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                )}
                {isLoggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// Memoized: chat/page.tsx re-renders on every message/typing-indicator
// update, but this header's own output only depends on its props and its
// own internal state (user, menu open/close) - none of that changes when
// a new chat message streams in, so skipping re-render on unrelated parent
// re-renders is safe and avoids rebuilding this whole dropdown for nothing.
export default memo(ChatHeader);
