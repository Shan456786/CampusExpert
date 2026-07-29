// Shared display-formatting helpers with no dependency on React or any
// particular page - safe to import from client components, server
// components, or other lib/ modules alike.

// Turns a full name into 1-2 initial letters for an avatar badge. Used by
// every place that shows a signed-in student's avatar without a real
// profile photo: the chat sidebar's profile card, the chat header's
// account menu, and the settings page's sidebar. Previously this exact
// function was copy-pasted in all three places - kept here once so a
// future tweak (e.g. supporting a middle name) only has to happen in one
// spot.
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Generates a locally-unique id for things like a chat message's React key
// - never sent to the backend, never needs to be cryptographically
// unguessable, just unique enough that two messages in the same session
// don't collide.
//
// app/chat/page.tsx used to call crypto.randomUUID() directly for this.
// That works over HTTPS or on localhost, but Crypto.randomUUID() is
// restricted to secure contexts - on a phone opened over plain HTTP via a
// LAN IP (http://192.168.x.x:3000, neither HTTPS nor localhost), the
// browser doesn't expose it at all, and calling it threw a TypeError
// inside handleSend()'s click handler. Since every message send route
// through that same handler, this alone was enough to make the chat page
// feel completely dead on a phone even after the API host was fixed.
// crypto.randomUUID() is still used when it's available (real UUIDs are
// nicer for debugging), with a plain fallback that works everywhere else.
export function createLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
