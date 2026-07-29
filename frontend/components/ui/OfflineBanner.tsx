"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

// OfflineBanner
// App-wide "you have no network connection" notice - mounted once in the
// root layout (see app/layout.tsx) so it's visible no matter which page a
// student is on. Listens to the browser's real online/offline events
// rather than polling, and reflects the actual current state on mount
// (navigator.onLine) instead of assuming online. Purely informational -
// it doesn't block interaction, since some things (reading an already-
// loaded chat, typing a draft message) still work fine offline; the
// individual request error messages (see lib/errors.ts) handle what
// happens when a student actually tries to do something that needs the
// network while this is showing.
export default function OfflineBanner() {
  // Starts true (assume online) so server-rendered/first-paint markup
  // never flashes the banner before the browser's real state is known.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-[#111827] px-4 py-2 text-center text-sm font-medium text-white"
    >
      <WifiOff className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      You&apos;re offline. Some features won&apos;t work until you&apos;re reconnected.
    </div>
  );
}
