import Link from "next/link";
import { Sparkles, Home, MessageCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[var(--surface)] px-6 py-16">
      {/* Subtle purple background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#A78BFA]/20 blur-[120px]"
      />

      <div className="relative flex animate-[fadeIn_0.4s_ease-out] flex-col items-center text-center">
        {/* Logo */}
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#6D28D9] shadow-sm shadow-[#6D28D9]/25">
          <Sparkles className="h-7 w-7 text-white" strokeWidth={2} />
        </span>

        {/* 404 */}
        <p className="mt-8 text-7xl font-semibold tracking-tight text-[var(--border)] sm:text-8xl">
          404
        </p>

        {/* Heading */}
        <h1 className="mt-4 text-balance text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
          Looks like you&apos;re lost
        </h1>

        {/* Description */}
        <p className="mt-3 max-w-sm text-balance text-base leading-relaxed text-[var(--text-secondary)]">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>

        {/* Actions */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#6D28D9] px-6 py-3 text-sm font-medium text-white shadow-sm shadow-[#6D28D9]/25 transition-all duration-200 hover:scale-[1.03] hover:bg-[#7C3AED] active:scale-[0.98]"
          >
            <Home className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Go Home
          </Link>
          <Link
            href="/chat"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-6 py-3 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-strong)] hover:bg-[var(--surface-subtle)] active:scale-[0.98]"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Ask Campus Expert
          </Link>
        </div>

        {/* Helper text */}
        <p className="mt-8 text-sm text-[var(--text-secondary)]">
          Need help finding something? Campus Expert can help.
        </p>
      </div>
    </div>
  );
}
