"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  IdCard,
  Mail,
  GraduationCap,
  CalendarDays,
  Building2,
  MessageSquare,
  LogOut,
  UserCog,
  Pencil,
  KeyRound,
  FileText,
  HelpCircle,
  Clock,
  Loader2,
} from "lucide-react";
import {
  API_BASE_URL,
  clearSession,
  getAccountStats,
  getStoredToken,
  getStoredUser,
  logoutSession,
  parseApiErrorField,
  parseApiErrorMessage,
  toStoredUser,
  updateStoredUser,
  type AccountStats,
  type AuthApiUser,
  type StoredUser,
} from "@/lib/auth";
import { describeNetworkError } from "@/lib/errors";
import { buildQuickNavLinks } from "@/lib/navigation";
import ErrorBanner from "@/components/ui/ErrorBanner";

interface ProfileField {
  icon: LucideIcon;
  label: string;
  value: string;
}

const YEAR_OPTIONS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const MAX_BIO_LENGTH = 500;

interface ProfileFormState {
  fullName: string;
  department: string;
  year: string;
  hostel: string;
  bio: string;
}

function userToFormState(user: StoredUser | null): ProfileFormState {
  return {
    fullName: user?.name ?? "",
    department: user?.department ?? "",
    year: user?.year ?? "",
    hostel: user?.hostel ?? "",
    bio: user?.bio ?? "",
  };
}

function buildViewFields(user: StoredUser | null): ProfileField[] {
  return [
    { icon: UserCog, label: "Full Name", value: user?.name ?? "Loading…" },
    { icon: Mail, label: "Email", value: user?.email ?? "Loading…" },
    {
      icon: IdCard,
      label: "Student ID",
      value: user?.registrationNumber ?? "Loading…",
    },
    { icon: GraduationCap, label: "Department", value: user?.department || "Not set" },
    { icon: CalendarDays, label: "Year", value: user?.year || "Not set" },
    { icon: Building2, label: "Hostel", value: user?.hostel || "Not set" },
  ];
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Full 6-link navigation set required on every page: Home, Chat, Resources,
// About, Profile, Settings - so a student can always get back anywhere
// without touching the browser Back button. Shared list, see
// lib/navigation.ts - this page overrides its own entry with the filled
// UserCog icon and "My Profile" label, same as before.
const quickNavLinks = buildQuickNavLinks("/profile", {
  "/profile": { icon: UserCog, label: "My Profile" },
});

const inputClassName =
  "mt-1 w-full rounded-xl border border-[var(--border)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] transition-colors duration-200 focus:border-[#6D28D9] focus:outline-none focus:ring-1 focus:ring-[#6D28D9]";
const readOnlyInputClassName =
  "mt-1 w-full cursor-not-allowed rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-secondary)]";
const labelClassName = "text-xs font-medium text-[var(--text-secondary)]";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<ProfileFormState>(userToFormState(null));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Only ever set when /api/auth/me fails AND there's no cached user to
  // fall back to showing - i.e. the page would otherwise have nothing at
  // all to display. See loadProfile() below.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetryingLoad, setIsRetryingLoad] = useState(false);

  // Fetches the authoritative profile from GET /api/auth/me. Only a 401
  // means the session itself is invalid - any other failure (a 500, a
  // dropped connection) is a load failure, not a reason to sign the
  // student out, so it's handled separately from the auth guard above.
  const loadProfile = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setIsRetryingLoad(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        clearSession();
        router.push("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const apiUser = (await response.json()) as AuthApiUser;
      setUser(toStoredUser(apiUser));
      setLoadError(null);
    } catch (error) {
      console.error("Failed to load profile:", error);
      // A cached copy (from signup/login, or a previous successful load)
      // is a perfectly good fallback for a network hiccup - only block
      // the page with an error when there's truly nothing to show.
      if (!getStoredUser()) {
        setLoadError(describeNetworkError());
      }
    } finally {
      setIsRetryingLoad(false);
    }
  }, [router]);

  // Auth guard + live data load. Runs once on mount: if there's no stored
  // token at all, there's nothing to even try - redirect straight to
  // /login. A cached copy of the user (from signup/login) is shown
  // immediately via getStoredUser() so the page doesn't flash empty while
  // the network request is in flight, then loadProfile()'s response
  // overwrites it with the authoritative value.
  useEffect(() => {
    const cached = getStoredUser();
    if (cached) setUser(cached);

    loadProfile();

    const token = getStoredToken();
    if (!token) return;
    // Account Statistics section below only ever renders real, computed
    // values from GET /api/auth/stats (see backend/app/schemas/auth.py's
    // AccountStats). getAccountStats() returns null on any failure, and a
    // null stats stays null - never replaced with a placeholder number.
    getAccountStats(token).then(setStats);
  }, [loadProfile]);

  // Keeps the edit form in sync with the authoritative user object -
  // whenever the user data changes (initial load, or right after a save)
  // and we're not actively editing, the form should reflect it.
  useEffect(() => {
    if (!isEditing) setForm(userToFormState(user));
  }, [user, isEditing]);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logoutSession();
      router.push("/");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleEditToggle = () => {
    setBannerMessage(null);
    setFieldErrors({});
    setForm(userToFormState(user));
    setIsEditing(true);
  };

  // Same handler as app/settings/page.tsx's handleChangePassword() - kept
  // in sync deliberately, since this page has its own copy of the button
  // (found missing an onClick entirely during the pre-demo QA pass, which
  // made it a dead control here even though the Settings page version
  // already worked). No password-change endpoint exists on the backend
  // yet, so this is an honest "not built" message rather than a silent
  // no-op; demo accounts get their own explanation since they have no
  // real password to begin with (see auth_service.create_demo_session()).
  const handleChangePassword = () => {
    if (user?.isDemo) {
      window.alert(
        "Demo accounts can't change credentials. Sign up for a real account to manage your password."
      );
      return;
    }
    window.alert(
      "Password management isn't available yet - it hasn't been built on the backend."
    );
  };

  const handleCancel = () => {
    setForm(userToFormState(user));
    setFieldErrors({});
    setBannerMessage(null);
    setSaveState("idle");
    setIsEditing(false);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBannerMessage(null);

    const errors: Record<string, string> = {};
    if (!form.fullName.trim()) errors.fullName = "Full name is required.";
    if (!form.department.trim()) errors.department = "Department is required.";
    if (!form.year.trim()) errors.year = "Year is required.";
    if (form.bio.length > MAX_BIO_LENGTH) {
      errors.bio = `Bio must be ${MAX_BIO_LENGTH} characters or fewer.`;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const token = getStoredToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setSaveState("saving");
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: form.fullName.trim(),
          department: form.department.trim(),
          year: form.year.trim(),
          hostel: form.hostel.trim() || null,
          bio: form.bio.trim() || null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail;
        const field = parseApiErrorField(detail);
        const message = parseApiErrorMessage(detail);
        if (field) setFieldErrors({ [field]: message });
        setSaveState("error");
        setBannerMessage(message);
        return;
      }

      const apiUser = (await response.json()) as AuthApiUser;
      const updated = toStoredUser(apiUser);
      setUser(updated);
      updateStoredUser(updated);
      setIsEditing(false);
      setSaveState("success");
      setBannerMessage("Profile updated successfully.");
    } catch (error) {
      console.error("Failed to save profile:", error);
      setSaveState("error");
      setBannerMessage(describeNetworkError());
    }
  };

  const viewFields = buildViewFields(user);
  const initials = user
    ? user.name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "?"
    : "…";

  // Nothing cached and the live fetch failed - there's genuinely no
  // profile data to render, so this replaces the whole page with the
  // error + Retry rather than showing empty/broken form fields.
  if (loadError && !user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[var(--surface-subtle)] px-4 py-10">
        <div className="w-full max-w-md">
          <ErrorBanner message={loadError} onRetry={loadProfile} retrying={isRetryingLoad} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[var(--surface-subtle)] px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-6xl animate-[fadeIn_0.4s_ease-out] flex-col gap-8 lg:flex-row">
        {/* Left sidebar */}
        <aside className="w-full lg:w-1/4">
          <div className="flex flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-sm transition-all duration-200 hover:shadow-md lg:sticky lg:top-10">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#DDD6FE] text-2xl font-semibold text-[#6D28D9]">
              {initials}
            </span>
            <h1 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">
              {user?.name ?? "Loading…"}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {user?.registrationNumber ?? ""}
            </p>

            {!isEditing && (
              <button
                type="button"
                onClick={handleEditToggle}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#6D28D9] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:scale-[1.02] hover:bg-[#7C3AED] active:scale-[0.98]"
              >
                <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Edit Profile
              </button>
            )}

            <nav className="mt-8 w-full" aria-label="Quick navigation">
              <h2 className="px-1 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Quick Navigation
              </h2>
              <ul className="mt-3 space-y-1">
                {quickNavLinks.map(({ icon: Icon, label, href, active }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors duration-200 ${
                        active
                          ? "bg-[var(--surface-subtle)] text-[#6D28D9]"
                          : "text-[var(--text-tertiary)] hover:bg-[var(--surface-subtle)] hover:text-[#6D28D9]"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                      {label}
                    </Link>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    aria-busy={isLoggingOut}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoggingOut ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                    )}
                    {isLoggingOut ? "Logging out..." : "Logout"}
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </aside>

        {/* Right section */}
        <div className="flex w-full flex-col gap-8 lg:w-3/4">
          {/* Profile details */}
          <section
            aria-labelledby="profile-details-heading"
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8"
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                id="profile-details-heading"
                className="text-lg font-semibold tracking-tight text-[var(--text-primary)]"
              >
                Profile Information
              </h2>
              {!isEditing && (
                <button
                  type="button"
                  onClick={handleEditToggle}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#6D28D9] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[#6D28D9] transition-all duration-200 hover:bg-[var(--surface-subtle)] active:scale-[0.98]"
                >
                  <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  Edit
                </button>
              )}
            </div>

            {bannerMessage && (
              <div
                role="status"
                className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                  saveState === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-green-200 bg-green-50 text-green-700"
                }`}
              >
                {bannerMessage}
              </div>
            )}

            {isEditing ? (
              <form onSubmit={handleSave} className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2" noValidate>
                <div>
                  <label htmlFor="fullName" className={labelClassName}>
                    Full Name
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={form.fullName}
                    onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                    className={inputClassName}
                    disabled={saveState === "saving"}
                  />
                  {fieldErrors.fullName && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.fullName}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="email" className={labelClassName}>
                    Email
                  </label>
                  <input
                    id="email"
                    type="text"
                    value={user?.email ?? ""}
                    disabled
                    readOnly
                    className={readOnlyInputClassName}
                  />
                </div>

                <div>
                  <label htmlFor="studentId" className={labelClassName}>
                    Student ID
                  </label>
                  <input
                    id="studentId"
                    type="text"
                    value={user?.registrationNumber ?? ""}
                    disabled
                    readOnly
                    className={readOnlyInputClassName}
                  />
                </div>

                <div>
                  <label htmlFor="department" className={labelClassName}>
                    Department
                  </label>
                  <input
                    id="department"
                    type="text"
                    placeholder="e.g. Computer Science & Engineering"
                    value={form.department}
                    onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))}
                    className={inputClassName}
                    disabled={saveState === "saving"}
                  />
                  {fieldErrors.department && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.department}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="year" className={labelClassName}>
                    Year
                  </label>
                  <select
                    id="year"
                    value={form.year}
                    onChange={(event) => setForm((prev) => ({ ...prev, year: event.target.value }))}
                    className={inputClassName}
                    disabled={saveState === "saving"}
                  >
                    <option value="">Select year</option>
                    {YEAR_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.year && <p className="mt-1 text-xs text-red-600">{fieldErrors.year}</p>}
                </div>

                <div>
                  <label htmlFor="hostel" className={labelClassName}>
                    Hostel <span className="text-[var(--text-faint)]">(optional)</span>
                  </label>
                  <input
                    id="hostel"
                    type="text"
                    placeholder="e.g. Block D"
                    value={form.hostel}
                    onChange={(event) => setForm((prev) => ({ ...prev, hostel: event.target.value }))}
                    className={inputClassName}
                    disabled={saveState === "saving"}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="bio" className={labelClassName}>
                    Bio <span className="text-[var(--text-faint)]">(optional)</span>
                  </label>
                  <textarea
                    id="bio"
                    rows={3}
                    maxLength={MAX_BIO_LENGTH}
                    value={form.bio}
                    onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))}
                    className={inputClassName}
                    disabled={saveState === "saving"}
                  />
                  <div className="mt-1 flex items-center justify-between">
                    {fieldErrors.bio ? (
                      <p className="text-xs text-red-600">{fieldErrors.bio}</p>
                    ) : (
                      <span />
                    )}
                    <p className="text-xs text-[var(--text-faint)]">
                      {form.bio.length}/{MAX_BIO_LENGTH}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-6 sm:col-span-2 sm:flex-row">
                  <button
                    type="submit"
                    disabled={saveState === "saving"}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#6D28D9] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:scale-[1.03] hover:bg-[#7C3AED] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                  >
                    {saveState === "saving" ? "Saving…" : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={saveState === "saving"}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-medium text-[var(--text-tertiary)] transition-all duration-200 hover:bg-[var(--surface-subtle)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <dl className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {viewFields.map(({ icon: Icon, label, value }) => (
                    <div
                      key={label}
                      className="flex items-start gap-3 rounded-xl border border-[var(--border)] px-4 py-3.5 transition-all duration-200 hover:border-[#6D28D9] hover:shadow-sm"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-[#6D28D9]">
                        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <dt className="text-xs font-medium text-[var(--text-secondary)]">{label}</dt>
                        <dd className="mt-0.5 truncate text-sm font-medium text-[var(--text-primary)]">{value}</dd>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] px-4 py-3.5 transition-all duration-200 hover:border-[#6D28D9] hover:shadow-sm sm:col-span-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-[#6D28D9]">
                      <FileText className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-xs font-medium text-[var(--text-secondary)]">Bio</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-sm font-medium text-[var(--text-primary)]">
                        {user?.bio || "Not set"}
                      </dd>
                    </div>
                  </div>
                </dl>

                <div className="mt-7 flex flex-col gap-3 border-t border-[var(--border)] pt-6 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleEditToggle}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#6D28D9] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:scale-[1.03] hover:bg-[#7C3AED] active:scale-[0.98]"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    Edit Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleChangePassword}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#6D28D9] bg-[var(--surface)] px-5 py-2.5 text-sm font-medium text-[#6D28D9] transition-all duration-200 hover:scale-[1.03] hover:bg-[var(--surface-subtle)] active:scale-[0.98]"
                  >
                    <KeyRound className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    Change Password
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    aria-busy={isLoggingOut}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:scale-[1.03] hover:bg-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 sm:ml-auto"
                  >
                    {isLoggingOut ? (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <LogOut className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    )}
                    {isLoggingOut ? "Logging out..." : "Logout"}
                  </button>
                </div>
              </>
            )}
          </section>

          {/* Account statistics - only renders once GET /api/auth/stats
              actually returns real numbers; stays absent otherwise rather
              than showing a zero or placeholder that could be mistaken for
              a real count. */}
          {stats && (
            <section aria-labelledby="account-stats-heading">
              <h2
                id="account-stats-heading"
                className="text-lg font-semibold tracking-tight text-[var(--text-primary)]"
              >
                Account Statistics
              </h2>

              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { icon: MessageSquare, value: String(stats.conversation_count), label: "Chats" },
                  { icon: HelpCircle, value: String(stats.question_count), label: "Questions Asked" },
                  { icon: CalendarDays, value: formatDate(stats.member_since), label: "Member Since" },
                  {
                    icon: Clock,
                    value: stats.last_login ? formatDateTime(stats.last_login) : "Not set",
                    label: "Last Login",
                  },
                ].map(({ icon: Icon, value, label }) => (
                  <div
                    key={label}
                    className="relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6D28D9] hover:shadow-md"
                  >
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -right-5 -top-5 h-20 w-20 rounded-full bg-gradient-to-br from-[#A78BFA]/25 to-[#6D28D9]/10 blur-2xl"
                    />
                    <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-subtle)] text-[#6D28D9]">
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <span className="relative mt-4 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                      {value}
                    </span>
                    <span className="relative mt-1 text-sm font-medium text-[var(--text-secondary)]">{label}</span>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-xs text-[var(--text-faint)]">
                Resources viewed and saved conversations aren&apos;t tracked yet, so they aren&apos;t shown here.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
