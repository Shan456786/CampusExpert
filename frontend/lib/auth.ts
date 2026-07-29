// Shared helpers for talking to Campus Expert's authentication API
// (backend/app/api/auth.py) and for reading/writing the signed-in session
// in localStorage. Used by the signup, login, profile, and settings pages.

// Previously derived from window.location.hostname (http://<current
// host>:8000) so the app could be reached from another device on the same
// local network without configuration. That doesn't extend to a real
// deployment: in production the frontend (Vercel) and backend (Railway)
// are two entirely different hosts, not "same machine, different port,"
// so no formula based on the frontend's own hostname can ever produce the
// right backend URL - and even if it guessed the right host, guessing
// "http://" would get blocked outright as mixed content on an https://
// page like Vercel's.
//
// Now sourced from NEXT_PUBLIC_API_BASE_URL, set per-environment (see the
// Vercel/Railway/local .env.local setup notes wherever this was changed) -
// the standard Next.js way to bake a build-time config value into the
// client bundle. Falls back to the deployed Railway backend if the env
// var is ever missing, so a misconfigured environment still points
// somewhere real instead of silently breaking every request.
//
// NEXT_PUBLIC_* vars are inlined at build time, so this works identically
// whether read during SSR or in the browser - no window/SSR guard needed
// the way the old hostname-based version required one.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://campusexpert-production.up.railway.app";

export const AUTH_TOKEN_STORAGE_KEY = "campusExpert:authToken";
export const AUTH_USER_STORAGE_KEY = "campusExpert:user";

export interface StoredUser {
  id: number;
  name: string;
  email: string;
  registrationNumber: string;
  department: string | null;
  year: string | null;
  hostel: string | null;
  bio: string | null;
  // True only for the account POST /api/auth/demo created (see
  // startDemoSession() below) - drives the app-wide "Demo Mode" indicator
  // (components/ui/DemoBanner.tsx) and the credential-editing lock on the
  // Settings page. Absent/false for every real signed-up/logged-in user.
  isDemo: boolean;
}

// Shape returned by the backend - see backend/app/schemas/auth.py's
// UserPublic/AuthResponse. snake_case because that's the Python/FastAPI
// convention on that side; toStoredUser() below is the one place that
// translates it into the frontend's camelCase StoredUser shape.
export interface AuthApiUser {
  id: number;
  full_name: string;
  registration_number: string;
  email: string;
  created_at: string;
  department: string | null;
  year: string | null;
  hostel: string | null;
  bio: string | null;
  // Settings page preferences (theme, font size, notifications, sound) -
  // {} until the user has ever saved settings. Deliberately untyped here
  // (Record<string, unknown>) since app/settings/page.tsx is the only
  // reader and it already narrows each field with lib/theme.ts's
  // isTheme()/isFontSize() type guards before trusting it.
  preferences: Record<string, unknown>;
  is_demo: boolean;
}

export interface AuthApiResponse {
  user: AuthApiUser;
  token: string;
}

// Shape returned by GET /api/auth/stats - see
// backend/app/schemas/auth.py's AccountStats. Every field is a real,
// computed value; there's deliberately no "resources viewed" or "saved
// conversations" field because Campus Expert doesn't track either yet -
// see app/profile/page.tsx's Account Statistics section for how that
// absence is handled (the stat just isn't shown, never faked).
export interface AccountStats {
  conversation_count: number;
  question_count: number;
  member_since: string;
  last_login: string | null;
}

// Fetches the signed-in student's real account statistics. Returns null on
// any failure (expired token, network error, non-200) - callers treat that
// the same as "not loaded yet" and simply don't render the stats section,
// rather than showing a zero that could be mistaken for a real count.
export async function getAccountStats(token: string): Promise<AccountStats | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as AccountStats;
  } catch {
    return null;
  }
}

// FastAPI's HTTPException(detail=...) can be a plain string (the
// framework's own default errors, e.g. a malformed request body) or the
// {field, message} shape backend/app/api/auth.py deliberately raises for
// every auth-specific failure (see that file's _error_detail()). Handling
// both keeps this resilient to an unexpected framework-level error too.
export interface ApiErrorDetail {
  field: string | null;
  message: string;
}

export function parseApiErrorMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (
    detail &&
    typeof detail === "object" &&
    "message" in detail &&
    typeof (detail as ApiErrorDetail).message === "string"
  ) {
    return (detail as ApiErrorDetail).message;
  }
  return "Something went wrong. Please try again.";
}

export function parseApiErrorField(detail: unknown): string | null {
  if (
    detail &&
    typeof detail === "object" &&
    "field" in detail &&
    typeof (detail as ApiErrorDetail).field === "string"
  ) {
    return (detail as ApiErrorDetail).field;
  }
  return null;
}

// Exported (not just used internally by storeSession() below) so
// app/profile/page.tsx can build the same StoredUser shape from both
// GET /api/auth/me and PATCH /api/auth/me responses without duplicating
// this mapping.
export function toStoredUser(apiUser: AuthApiUser): StoredUser {
  return {
    id: apiUser.id,
    name: apiUser.full_name,
    email: apiUser.email,
    registrationNumber: apiUser.registration_number,
    department: apiUser.department,
    year: apiUser.year,
    hostel: apiUser.hostel,
    bio: apiUser.bio,
    isDemo: apiUser.is_demo,
  };
}

// Persists a fresh signup/login response and returns the StoredUser shape
// callers can render immediately without waiting on a follow-up request.
export function storeSession(response: AuthApiResponse): StoredUser {
  const user = toStoredUser(response.user);
  try {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token);
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Non-fatal - the session still works for this page load, it just
    // won't survive a refresh if storage isn't writable (e.g. private
    // browsing with storage disabled).
  }
  return user;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === "string" && typeof parsed.email === "string") {
      return parsed as StoredUser;
    }
    return null;
  } catch {
    return null;
  }
}

// Overwrites just the cached user object - used after a successful
// PATCH /api/auth/me so the edited profile survives a refresh without
// forcing a fresh /api/auth/me round trip. The session token is untouched.
export function updateStoredUser(user: StoredUser): void {
  try {
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Non-fatal - see storeSession().
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  } catch {
    // Non-fatal - see storeSession().
  }
}

// Powers the "Try Demo" entry point (app/demo/page.tsx) - creates a brand
// new, fully isolated demo account server-side (sample profile, sample
// settings, sample conversations, a real session token; see
// backend/app/services/auth_service.py's create_demo_session()) and
// stores it exactly the way storeSession() stores a real signup/login
// response, so every other page in the app treats a demo session
// identically to a real one except where it explicitly checks
// StoredUser.isDemo. Throws (doesn't swallow) on failure so the caller
// can show a real error instead of silently landing on a broken page.
export async function startDemoSession(): Promise<StoredUser> {
  const response = await fetch(`${API_BASE_URL}/api/auth/demo`, {
    method: "POST",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(parseApiErrorMessage(data?.detail));
  }
  const data = (await response.json()) as AuthApiResponse;
  return storeSession(data);
}

// Best-effort: asks the backend to delete the session row (see
// backend/app/services/auth_service.py's logout()) so the token can't be
// reused even if it leaked. Always clears local storage regardless of
// whether the request succeeds - the user should end up logged out
// client-side even if the backend happens to be unreachable.
export async function logoutSession(): Promise<void> {
  const token = getStoredToken();
  if (token) {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Backend unreachable - fall through to clearing local state anyway.
    }
  }
  clearSession();
}
