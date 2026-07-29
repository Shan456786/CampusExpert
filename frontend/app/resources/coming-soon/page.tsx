"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Construction, Sparkles } from "lucide-react";

// Destination for any /resources card that doesn't have a confirmed
// official VIT-AP page or a real document to link to yet (see
// resources/page.tsx's resourceCategories - every entry marked
// { type: "internal" } routes here instead of the button doing nothing).
// Reads which resource sent the student here via ?title=... so the
// message names the actual resource rather than saying something generic.
function ComingSoonContent() {
  const searchParams = useSearchParams();
  const resourceTitle = searchParams.get("title")?.trim() || "This resource";

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--surface-subtle)] px-4 py-10">
      <div className="w-full max-w-md animate-[fadeIn_0.4s_ease-out] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-sm sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-subtle)] text-[#6D28D9]">
          <Construction className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
        </span>

        <h1 className="mt-5 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          {`${resourceTitle} isn't linked yet`}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          We haven&apos;t confirmed an official VIT-AP page or document for
          this resource yet, so there&apos;s nothing real to open here.
          Check back soon, or ask Campus Expert directly in chat.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/resources"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:scale-[1.03] hover:border-[#6D28D9] hover:text-[#6D28D9] active:scale-[0.98]"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Back to Resources
          </Link>
          <Link
            href="/chat"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#6D28D9] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:scale-[1.03] hover:bg-[#7C3AED] active:scale-[0.98]"
          >
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Ask Campus Expert
          </Link>
        </div>
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary around whatever calls it
// in the App Router, same reason frontend/app/chat/page.tsx wraps its
// content component - see that file's comment on the same pattern.
export default function ResourceComingSoonPage() {
  return (
    <Suspense fallback={null}>
      <ComingSoonContent />
    </Suspense>
  );
}
