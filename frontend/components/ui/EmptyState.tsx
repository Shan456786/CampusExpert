import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// EmptyState
// The shared "nothing here yet" treatment for every empty list/section in
// Campus Expert (no chats, no matching resources, and any future empty
// view) - a small illustrated icon, a plain-language explanation of why
// it's empty, optionally a short list of things to try, and CTA
// button(s) to actually move forward. Replaces bare one-line text like
// "No conversations yet." which explained nothing and gave no next step.
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  // Short "try asking/searching" list rendered as plain bullets - for
  // contexts where the items aren't meant to be clickable themselves
  // (see resources page). For clickable suggestions, prefer passing real
  // buttons/links via `children` instead (see ChatSidebar / chat page).
  suggestions?: string[];
  suggestionsLabel?: string;
  children?: ReactNode;
  // Tighter spacing/sizing for constrained spaces like the 280px sidebar.
  compact?: boolean;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  suggestions,
  suggestionsLabel = "Try asking:",
  children,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "px-3 py-8" : "px-6 py-16"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-subtle)] text-[#6D28D9] ${
          compact ? "h-11 w-11" : "h-16 w-16"
        }`}
      >
        <Icon className={compact ? "h-5 w-5" : "h-7 w-7"} strokeWidth={2} />
      </span>

      <h3
        className={`mt-4 font-semibold text-[var(--text-primary)] ${
          compact ? "text-sm" : "text-lg"
        }`}
      >
        {title}
      </h3>

      <p
        className={`mt-1.5 max-w-sm leading-relaxed text-[var(--text-secondary)] ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        {description}
      </p>

      {suggestions && suggestions.length > 0 && (
        <div className={`mt-4 w-full ${compact ? "max-w-[220px]" : "max-w-xs"}`}>
          <p
            className={`font-medium text-[var(--text-tertiary)] ${compact ? "text-xs" : "text-sm"}`}
          >
            {suggestionsLabel}
          </p>
          <ul className={`mt-2 space-y-1 text-[var(--text-secondary)] ${compact ? "text-xs" : "text-sm"}`}>
            {suggestions.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      )}

      {children && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{children}</div>
      )}
    </div>
  );
}
