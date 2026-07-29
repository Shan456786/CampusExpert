// Shared error-message helpers - the single place that turns "what
// actually went wrong" (a network failure, an HTTP status code, the
// browser being offline) into the kind of plain-language sentence a
// student should see, instead of every page inventing its own wording or
// leaking a technical one ("TypeError: Failed to fetch", "Backend
// returned 500", a raw stack trace). Nothing here ever surfaces an
// exception's own .message or .stack to the UI.

import { ApiError } from "@/lib/chat";

// navigator.onLine is a best-effort signal (true doesn't guarantee real
// connectivity, but false reliably means "definitely offline") - good
// enough to give a more specific message than a generic connection error
// when the browser itself already knows it has no network.
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && "onLine" in navigator && !navigator.onLine;
}

// A fetch()/request that never got a response at all - the browser is
// offline, a connection couldn't be established, CORS blocked it, etc.
// Distinguishes the "offline" case (a more specific, more actionable
// message) from a generic "could not connect" one.
export function describeNetworkError(): string {
  if (isOffline()) {
    return "You're offline. Check your connection and try again.";
  }
  return "Couldn't connect to the server. Please try again.";
}

// A response that DID arrive, just with a non-2xx status. Maps the most
// common statuses to plain language; falls back to a server-provided
// message when it's already safe/friendly (e.g. backend/app/api/auth.py's
// field-specific validation errors), or a generic "something went wrong"
// otherwise - never the raw status code or a stack trace.
export function describeApiStatus(status: number, serverMessage?: string): string {
  if (status === 401) return "Your session has expired. Please log in again.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "We couldn't find that.";
  if (status === 429) return "You're doing that a bit too fast. Please wait a moment and try again.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  // 400/409/422 etc. - these are the statuses backend/app/api/auth.py
  // attaches an already-friendly {field, message} to (see
  // parseApiErrorMessage in lib/auth.ts), so trust it when present.
  if (serverMessage) return serverMessage;
  return "Something went wrong. Please try again.";
}

// One entry point for a catch block that doesn't already know whether it
// caught a network failure or an ApiError (see lib/chat.ts) - covers both
// without the caller needing its own instanceof check.
export function describeRequestError(error: unknown, serverMessage?: string): string {
  if (error instanceof ApiError) {
    return describeApiStatus(error.status, serverMessage);
  }
  return describeNetworkError();
}
