"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowUp } from "lucide-react";

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const router = useRouter();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = query.trim();
    if (!trimmed) return;

    // Hands the typed question off to the chat page via a query param -
    // app/chat/page.tsx reads `q` on mount and auto-sends it through the
    // same handleSend() path a manually typed message uses, so this
    // becomes the first real message in a new conversation.
    router.push(`/chat?q=${encodeURIComponent(trimmed)}`);
  };

  const hasQuery = query.trim().length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto w-full max-w-2xl"
      role="search"
      aria-label="Ask Campus Expert"
    >
      <label htmlFor="campus-search" className="sr-only">
        Ask anything about VIT AP
      </label>

      <div
        className={`flex items-center gap-3 rounded-2xl border bg-[var(--surface)] px-5 py-4 shadow-sm transition-all duration-200 ${
          isFocused
            ? "border-[#6D28D9] shadow-lg shadow-[#6D28D9]/15 ring-4 ring-[#6D28D9]/10"
            : "border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-md"
        }`}
      >
        <Search
          className={`h-5 w-5 shrink-0 transition-colors duration-200 ${
            isFocused ? "text-[#6D28D9]" : "text-[var(--text-secondary)]"
          }`}
          strokeWidth={2}
          aria-hidden="true"
        />

        <input
          id="campus-search"
          name="query"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Ask anything about VIT AP..."
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-base text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none sm:text-lg"
        />

        <button
          type="submit"
          disabled={!hasQuery}
          aria-label="Submit question"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
            hasQuery
              ? "bg-[#6D28D9] text-white shadow-sm hover:scale-105 hover:bg-[#7C3AED] active:scale-95"
              : "cursor-not-allowed bg-[var(--surface-subtle)] text-[var(--text-secondary)]"
          }`}
        >
          <ArrowUp className="h-4.5 w-4.5" strokeWidth={2.25} />
        </button>
      </div>
    </form>
  );
}
