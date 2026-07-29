"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { getStoredToken } from "@/lib/auth";

export default function Hero() {
  const router = useRouter();

  // Logged-in students go straight to the chat they actually want; anyone
  // else needs to log in first. getStoredToken() is the same session check
  // every other guarded page in this app already uses (see
  // app/chat/page.tsx, app/profile/page.tsx).
  const handleGetStarted = () => {
    router.push(getStoredToken() ? "/chat" : "/login");
  };

  // The landing page has no in-page "About" section to scroll to - About
  // is its own route (app/about/page.tsx). Per spec: navigate there
  // instead of scrolling to nothing.
  const handleLearnMore = () => {
    router.push("/about");
  };

  return (
    <section className="relative w-full overflow-hidden bg-[var(--surface)] px-6 py-28 lg:px-8 lg:py-36">
      {/* Ambient background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[480px] w-[780px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[#A78BFA]/20 blur-[120px]"
      />

      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        {/* Eyebrow badge */}
        <div className="mb-6 inline-flex animate-[fadeIn_0.6s_ease-out] items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-1.5 text-sm font-medium text-[#6D28D9]">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
          <span>AI-powered campus assistant</span>
        </div>

        {/* Headline */}
        <h1 className="text-balance text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl lg:text-6xl">
  Your AI Assistant for{" "}
  <span className="bg-linear-to-r from-[#6D28D9] to-[#A78BFA] bg-clip-text text-transparent">
    VIT AP University
  </span>
</h1>

        {/* Subheading */}
        <p className="mt-6 max-w-2xl text-balance text-lg leading-relaxed text-[var(--text-secondary)] sm:text-xl">
          Get instant answers about academics, hostels, faculty, campus
          facilities, clubs, transport, university procedures, and everything
          else at VIT AP.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleGetStarted}
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#6D28D9] px-7 py-3 text-sm font-medium text-white shadow-sm shadow-[#6D28D9]/25 transition-all duration-200 hover:scale-[1.03] hover:bg-[#7C3AED] active:scale-[0.98]"
          >
            Get Started
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </button>
          <button
            type="button"
            onClick={handleLearnMore}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-7 py-3 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-strong)] hover:bg-[var(--surface-subtle)] active:scale-[0.98]"
          >
            Learn More
          </button>
        </div>
      </div>
    </section>
  );
}
