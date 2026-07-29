"use client";

import Link from "next/link";
import { Sparkles, AlertTriangle, RotateCw, Home } from "lucide-react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[var(--surface-subtle)] px-6 py-12">
      {/* Subtle purple background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#A78BFA]/20 blur-[120px]"
      />

      <div className="relative w-full max-w-md animate-[fadeIn_0.4s_ease-out]">
        <div className="flex flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-lg shadow-[#111827]/5 sm:p-10">
          {/* Logo */}
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#6D28D9] shadow-sm shadow-[#6D28D9]/20">
            <Sparkles className="h-6 w-6 text-white" strokeWidth={2} />
          </span>

          {/* Error icon */}
          <span className="mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
          </span>

          {/* Heading */}
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Something went wrong
          </h1>

          {/* Description */}
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            We couldn&apos;t complete that request. Please try again.
          </p>

          {/* Actions */}
          <div className="mt-7 flex w-full flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#6D28D9] px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-[#6D28D9]/25 transition-all duration-200 hover:scale-[1.03] hover:bg-[#7C3AED] active:scale-[0.98]"
            >
              <RotateCw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Try Again
            </button>
            <Link
              href="/"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-strong)] hover:bg-[var(--surface-subtle)] active:scale-[0.98]"
            >
              <Home className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Go Home
            </Link>
          </div>

          {/* Helper text */}
          <p className="mt-6 text-xs text-[var(--text-secondary)]">
            If the problem continues, return to Campus Expert and try again later.
          </p>
        </div>
      </div>
    </div>
  );
}
