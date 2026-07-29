import { AlertCircle, Loader2, RotateCw } from "lucide-react";

// ErrorBanner
// The shared inline "something failed" treatment - a plain-language
// message (never a raw exception, status code, or stack trace - see
// lib/errors.ts, which is what every caller should have already run the
// real error through) plus an optional Retry button that re-runs
// whatever failed. Used anywhere a background request can fail without
// taking over the whole page: loading the chat list, switching or
// deleting a conversation, loading a profile.
interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

export default function ErrorBanner({
  message,
  onRetry,
  retrying = false,
  className = "",
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={`flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span>{message}</span>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-busy={retrying}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors duration-200 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {retrying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden="true" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          )}
          {retrying ? "Retrying..." : "Retry"}
        </button>
      )}
    </div>
  );
}
