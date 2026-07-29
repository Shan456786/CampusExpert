"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getStoredUser } from "@/lib/auth";

// DemoBanner
// App-wide "you're in Demo Mode" notice - mounted once in the root layout
// (see app/layout.tsx) right next to OfflineBanner, same reasoning: this
// should be visible no matter which page a demo visitor lands on, not
// just the ones that happen to render their own indicator.
//
// getStoredUser()?.isDemo is the same flag every other demo-aware check
// in the app reads (see app/settings/page.tsx's credential lock).
// Re-checked on every route change (usePathname()), not just once on
// mount - starting a demo (app/demo/page.tsx -> /chat) and ending one
// (Logout -> /) both happen via router.push() client-side navigation, not
// a full page reload, so a mount-once check would miss both transitions
// and either fail to show the banner after "Try Demo" or fail to hide it
// after logging out.
//
// Shares OfflineBanner's exact visual treatment (fixed top bar, same
// height, same z-index) for consistency, but drops below it - rather than
// on top of it - on the rare occasion both are true at once, so a demo
// visitor who loses connectivity still sees the (more actionable) offline
// notice instead of it being silently covered.
export default function DemoBanner() {
  const pathname = usePathname();
  const [isDemo, setIsDemo] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    setIsDemo(Boolean(getStoredUser()?.isDemo));
  }, [pathname]);

  useEffect(() => {
    setIsOffline(!navigator.onLine);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isDemo) return null;

  return (
    <div
      role="status"
      className={`fixed inset-x-0 z-[90] flex items-center justify-center gap-2 bg-[#6D28D9] px-4 py-2 text-center text-sm font-medium text-white ${
        isOffline ? "top-9" : "top-0"
      }`}
    >
      <Sparkles className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      You&apos;re exploring Campus Expert in Demo Mode - nothing here is saved
      permanently. Logging out ends the demo.
    </div>
  );
}
