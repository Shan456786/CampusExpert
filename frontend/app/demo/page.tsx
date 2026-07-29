"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { startDemoSession } from "@/lib/auth";
import { describeNetworkError } from "@/lib/errors";
import ErrorBanner from "@/components/ui/ErrorBanner";

// /demo
// The single entry point every "Try Demo" link (Navbar, /login, /signup)
// points to, instead of each of them duplicating the demo-creation call.
// On mount, asks the backend for a brand-new demo account (see
// lib/auth.ts's startDemoSession(), which stores the result exactly like
// a real signup/login), then hands the visitor straight into /chat -
// already populated with a sample profile, sample settings, and sample
// conversations, ready to explore. A failure here (backend unreachable,
// etc.) shows the same friendly retry treatment as every other
// request-driven page in the app, never a raw error.
export default function DemoPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const createDemo = useCallback(
    async (isRetry: boolean) => {
      if (isRetry) setIsRetrying(true);
      setErrorMessage(null);
      try {
        await startDemoSession();
        router.replace("/chat");
      } catch (error) {
        console.error("Failed to start demo session:", error);
        setErrorMessage(error instanceof Error ? error.message : describeNetworkError());
        setIsRetrying(false);
      }
    },
    [router]
  );

  useEffect(() => {
    createDemo(false);
    // Runs once on mount only - createDemo is stable across re-renders
    // (its own useCallback deps never change after mount) and the Retry
    // button below calls it directly, so re-running this effect on every
    // render would just repeat the exact same request pointlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[var(--surface)] px-6">
      {/* Subtle purple background glow - same treatment as app/loading.tsx
          and app/not-found.tsx, so this reads as part of the same family
          of full-page states rather than a one-off design. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#A78BFA]/20 blur-[120px]"
      />

      <div className="relative flex w-full max-w-sm flex-col items-center text-center">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-[#6D28D9] shadow-sm shadow-[#6D28D9]/25 ${
            errorMessage ? "" : "animate-pulse"
          }`}
        >
          <Sparkles className="h-7 w-7 text-white" strokeWidth={2} aria-hidden="true" />
        </span>

        <p className="mt-5 text-lg font-semibold tracking-tight text-[var(--text-primary)]">
          Campus Expert
        </p>

        {errorMessage ? (
          <div className="mt-4 w-full">
            <ErrorBanner
              message={errorMessage}
              onRetry={() => createDemo(true)}
              retrying={isRetrying}
            />
          </div>
        ) : (
          <>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
              Setting up your demo account...
            </p>
            <div className="mt-6 flex items-center gap-1.5" role="status" aria-live="polite">
              <span className="h-2 w-2 animate-bounce rounded-full bg-[#6D28D9] [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[#6D28D9] [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[#6D28D9] [animation-delay:300ms]" />
              <span className="sr-only">Setting up your demo account</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
