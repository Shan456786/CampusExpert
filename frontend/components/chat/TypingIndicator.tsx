import { Bot } from "lucide-react";

export default function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6D28D9] text-white">
        <Bot className="h-4 w-4" strokeWidth={2} />
      </span>

      <div
        className="flex items-center gap-2.5 rounded-2xl rounded-tl-sm border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 shadow-sm"
        role="status"
        aria-label="Campus Expert is thinking"
      >
        {/* Visible text, not just the aria-label above - a sighted student
            waiting on a response should see the same "thinking" state a
            screen reader announces, not just three silent dots. */}
        <span className="text-sm text-[var(--text-secondary)]">Campus Expert is thinking...</span>
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#A78BFA] [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#A78BFA] [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#A78BFA] [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  );
}
