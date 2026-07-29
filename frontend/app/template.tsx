"use client";

// Next.js remounts template.tsx (unlike layout.tsx, which persists) on
// every route change, which is exactly the hook needed for a consistent
// page-transition animation app-wide without touching every individual
// page: each new route's content mounts fresh and picks up the same
// fadeIn animation already used elsewhere (see globals.css's @keyframes
// fadeIn), so navigating between pages gets a small, consistent
// fade/slide-in instead of an abrupt cut.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-[fadeIn_0.25s_ease-out]">{children}</div>;
}
