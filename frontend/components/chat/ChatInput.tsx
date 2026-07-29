"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--surface)]/90 px-4 py-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-sm transition-all duration-200 focus-within:border-[#6D28D9] focus-within:shadow-lg focus-within:shadow-[#6D28D9]/10 focus-within:ring-4 focus-within:ring-[#6D28D9]/10">
        <label htmlFor="chat-input" className="sr-only">
          Ask anything about VIT AP
        </label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Ask anything about VIT AP..."
          className="max-h-40 flex-1 resize-none bg-transparent py-2 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none disabled:cursor-not-allowed"
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          aria-label="Send message"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
            canSend
              ? "bg-[#6D28D9] text-white hover:scale-105 hover:bg-[#7C3AED] active:scale-95"
              : "cursor-not-allowed bg-[var(--surface-subtle)] text-[var(--text-secondary)]"
          }`}
        >
          <SendHorizontal className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>

      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-[var(--text-secondary)]">
        Campus Expert can make mistakes. Verify important information.
      </p>
    </div>
  );
}
