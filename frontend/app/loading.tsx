import { Sparkles } from "lucide-react";

export default function Loading() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[var(--surface)] px-6">
      {/* Subtle purple background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#A78BFA]/20 blur-[120px]"
      />

      <div
        role="status"
        aria-live="polite"
        className="relative flex flex-col items-center text-center"
      >
        {/* Logo */}
        <span className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-[#6D28D9] shadow-sm shadow-[#6D28D9]/25">
          <Sparkles className="h-7 w-7 text-white" strokeWidth={2} aria-hidden="true" />
        </span>

        {/* Wordmark */}
        <p className="mt-5 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
          Campus Expert
        </p>

        {/* Status text */}
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">Getting things ready...</p>

        {/* Animated loading indicator */}
        <div className="mt-6 flex items-center gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#6D28D9] [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#6D28D9] [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#6D28D9] [animation-delay:300ms]" />
        </div>

        <span className="sr-only">Loading Campus Expert</span>
      </div>
    </div>
  );
}
