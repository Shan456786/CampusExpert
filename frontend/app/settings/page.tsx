"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Info,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Mail,
  Bot,
  Megaphone,
  Briefcase,
  Building2,
  Volume2,
  Pencil,
  KeyRound,
  Download,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  API_BASE_URL,
  clearSession,
  getStoredToken,
  getStoredUser,
  logoutSession,
  parseApiErrorMessage,
  toStoredUser,
  type AuthApiUser,
  type StoredUser,
} from "@/lib/auth";
import {
  applyFontSize,
  applyTheme,
  FONT_SIZE_PX,
  getStoredFontSize,
  getStoredTheme,
  isFontSize,
  isTheme,
  storeFontSize,
  storeTheme,
  type FontSize,
  type Theme,
} from "@/lib/theme";
import {
  getStoredNotifications,
  getStoredSoundEnabled,
  NOTIFICATIONS_STORAGE_KEY,
  SOUND_STORAGE_KEY,
  storeNotifications,
  storeSoundEnabled,
} from "@/lib/preferences";
import { getInitials } from "@/lib/format";
import { buildQuickNavLinks } from "@/lib/navigation";

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

const themeOptions: SegmentOption<Theme>[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System Default", icon: Monitor },
];

const fontSizeOptions: SegmentOption<FontSize>[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

interface ToggleItem {
  key: string;
  icon: LucideIcon;
  label: string;
  description: string;
}

const DEFAULT_NOTIFICATIONS: Record<string, boolean> = {
  email: true,
  aiReply: true,
  announcements: true,
  placement: false,
  hostel: true,
};

const notificationItems: ToggleItem[] = [
  { key: "email", icon: Mail, label: "Email Notifications", description: "Get updates delivered to your inbox." },
  { key: "aiReply", icon: Bot, label: "AI Reply Notifications", description: "Know when Campus Expert responds." },
  { key: "announcements", icon: Megaphone, label: "Campus Announcements", description: "University-wide notices and alerts." },
  { key: "placement", icon: Briefcase, label: "Placement Updates", description: "New drives and career opportunities." },
  { key: "hostel", icon: Building2, label: "Hostel Notifications", description: "Hostel rules, timings and updates." },
];

// Full 6-link navigation set required on every page: Home, Chat, Resources,
// About, Profile, Settings - so a student can always get back anywhere
// without touching the browser Back button. Shared list, see
// lib/navigation.ts.
const quickNavLinks = buildQuickNavLinks("/settings");

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid grid-cols-1 gap-2 sm:grid-cols-3"
    >
      {options.map(({ value: optionValue, label, icon: Icon }) => {
        const isActive = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(optionValue)}
            className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
              isActive
                ? "border-[#6D28D9] bg-[#6D28D9] text-white shadow-sm"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-tertiary)] hover:border-[#6D28D9] hover:text-[#6D28D9]"
            }`}
          >
            {Icon && <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  label: string;
}

function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6D28D9] focus-visible:ring-offset-2 ${
        checked ? "bg-[#6D28D9]" : "bg-[var(--border)]"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm transition-all duration-200 hover:shadow-md sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-subtle)] text-[#6D28D9]">
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{title}</h2>
      </div>
      {description && <p className="mt-2 text-sm text-[var(--text-secondary)]">{description}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();

  const [user, setUser] = useState<StoredUser | null>(null);
  const [theme, setTheme] = useState<Theme>("system");
  const [fontSize, setFontSize] = useState<FontSize>("medium");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifications, setNotifications] = useState<Record<string, boolean>>(DEFAULT_NOTIFICATIONS);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Load order: local values first (instant, works offline, matches what
  // the blocking script in app/layout.tsx already painted), then the
  // backend's copy overwrites them once /api/auth/me responds - the
  // backend is the source of truth for a logged-in student since it's
  // what lets preferences follow them to another device.
  useEffect(() => {
    setTheme(getStoredTheme());
    setFontSize(getStoredFontSize());
    setSoundEnabled(getStoredSoundEnabled());
    const localNotifications = getStoredNotifications();
    if (localNotifications) {
      setNotifications((prev) => ({ ...prev, ...localNotifications }));
    }

    const cachedUser = getStoredUser();
    if (cachedUser) setUser(cachedUser);

    const token = getStoredToken();
    if (!token) {
      router.push("/login");
      return;
    }

    fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        // Only a 401 means the session itself is invalid - any other
        // failure (a 500, a dropped connection) shouldn't sign the
        // student out, since every value on this page already has a
        // working local fallback (see the load order above).
        if (response.status === 401) {
          clearSession();
          router.push("/login");
          return;
        }
        if (!response.ok) {
          console.error(`Failed to load profile for settings: ${response.status}`);
          return;
        }
        const apiUser = (await response.json()) as AuthApiUser;
        setUser(toStoredUser(apiUser));

        const prefs = apiUser.preferences as Record<string, unknown> | undefined;
        if (prefs && typeof prefs === "object") {
          if (isTheme(prefs.theme)) setTheme(prefs.theme);
          if (isFontSize(prefs.font_size)) setFontSize(prefs.font_size);
          if (typeof prefs.sound_enabled === "boolean") setSoundEnabled(prefs.sound_enabled);
          if (prefs.notifications && typeof prefs.notifications === "object") {
            setNotifications((prev) => ({ ...prev, ...(prefs.notifications as Record<string, boolean>) }));
          }
        }
      })
      .catch((error) => {
        // Backend unreachable - keep showing local/cached values rather
        // than bouncing to /login over a network hiccup.
        console.error("Failed to load profile for settings:", error);
      });
  }, [router]);

  // Applies the theme/font size to the document any time they change,
  // whether from a click below or a value just loaded from the backend
  // above. The "system" live-media-query listener and cross-tab sync live
  // in components/ThemeInit.tsx (mounted once in the root layout) so they
  // work app-wide, not only while this page happens to be open.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyFontSize(fontSize);
  }, [fontSize]);

  const handleThemeChange = (value: Theme) => {
    setTheme(value);
    storeTheme(value);
  };

  const handleFontSizeChange = (value: FontSize) => {
    setFontSize(value);
    storeFontSize(value);
  };

  const handleSoundToggle = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      storeSoundEnabled(next);
      return next;
    });
  };

  const toggleNotification = (key: string) => {
    setNotifications((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      storeNotifications(next);
      return next;
    });
  };

  const handleSavePreferences = async () => {
    setBannerMessage(null);
    setSaveState("saving");

    // Theme, font size, sound, and each notification toggle already
    // persisted to localStorage the moment they were changed (see the
    // handlers above) - this button's job is syncing that same snapshot
    // to the signed-in student's account so it follows them to another
    // browser or device, with an explicit confirmation either way.
    const token = getStoredToken();
    if (!token) {
      setSaveState("success");
      setBannerMessage("Preferences saved on this device.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/preferences`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          theme,
          font_size: fontSize,
          notifications,
          sound_enabled: soundEnabled,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setSaveState("error");
        setBannerMessage(parseApiErrorMessage(body?.detail));
        return;
      }

      setSaveState("success");
      setBannerMessage("Preferences saved.");
    } catch {
      setSaveState("error");
      setBannerMessage(
        "Saved on this device, but couldn't sync to your account. Check your connection and try again."
      );
    }
  };

  const handleEditProfile = () => {
    router.push("/profile");
  };

  const handleChangePassword = () => {
    if (user?.isDemo) {
      // Demo accounts don't get a real password at all (see
      // backend/app/services/auth_service.py's create_demo_session()) -
      // there's nothing to change, by design, not because the feature
      // happens to be missing.
      window.alert(
        "Demo accounts can't change credentials. Sign up for a real account to manage your password."
      );
      return;
    }
    // No password-change endpoint exists yet on the backend. Honest
    // placeholder rather than a dead button that looks like it should work.
    window.alert(
      "Password management isn't available yet - it hasn't been built on the backend."
    );
  };

  const handleDownloadData = () => {
    const exportPayload = {
      profile: user,
      appearance: { theme, fontSize },
      notifications,
      soundEnabled,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "campus-expert-data.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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

  const handleDeleteAccount = async () => {
    if (user?.isDemo) {
      // A demo account has no separate "delete" step - it's already
      // designed to disappear entirely the moment the session ends (see
      // backend/app/services/auth_service.py's logout(), which
      // cascade-deletes a demo user's row, conversations, and messages).
      // Logging out here IS deleting the account, so that's what this
      // button does for a demo user instead of the generic local-only
      // flow below.
      const confirmed = window.confirm(
        "This ends your demo session and permanently deletes this demo account. Continue?"
      );
      if (!confirmed) return;
      if (isLoggingOut) return;
      setIsLoggingOut(true);
      try {
        await logoutSession();
        router.push("/");
      } finally {
        setIsLoggingOut(false);
      }
      return;
    }

    const confirmed = window.confirm(
      "This permanently deletes your locally stored account data. This cannot be undone. Continue?"
    );
    if (!confirmed) return;

    clearSession();
    try {
      localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
      localStorage.removeItem(SOUND_STORAGE_KEY);
    } catch {
      // Non-fatal - see storeTheme() in lib/theme.ts for the same pattern.
    }
    // Theme and font size are deliberately left alone - they're device
    // display preferences, not account data.
    router.push("/signup");
  };

  return (
    <div className="min-h-screen w-full bg-[var(--surface-subtle)] px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-6xl animate-[fadeIn_0.4s_ease-out] flex-col gap-8 lg:flex-row">
        {/* Left sidebar */}
        <aside className="w-full lg:w-1/4">
          <div className="flex flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-sm transition-all duration-200 hover:shadow-md lg:sticky lg:top-10">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#DDD6FE] text-xl font-semibold text-[#6D28D9]">
              {getInitials(user?.name ?? "")}
            </span>
            <h1 className="mt-3 text-base font-semibold text-[var(--text-primary)]">
              {user?.name ?? "Loading…"}
            </h1>

            <nav className="mt-7 w-full" aria-label="Quick navigation">
              <ul className="space-y-1">
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
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
              Settings
            </h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Personalize your Campus Expert experience.
            </p>
          </div>

          {/* Appearance */}
          <SettingsCard icon={Sun} title="Appearance">
            <div className="flex flex-col gap-6">
              <div>
                <p className="mb-3 text-sm font-medium text-[var(--text-primary)]">Theme</p>
                <SegmentedControl
                  options={themeOptions}
                  value={theme}
                  onChange={handleThemeChange}
                  ariaLabel="Theme"
                />
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-[var(--text-primary)]">
                  Font Size <span className="font-normal text-[var(--text-faint)]">({FONT_SIZE_PX[fontSize]})</span>
                </p>
                <SegmentedControl
                  options={fontSizeOptions}
                  value={fontSize}
                  onChange={handleFontSizeChange}
                  ariaLabel="Font size"
                />
              </div>
            </div>
          </SettingsCard>

          {/* Notifications & Sound */}
          <SettingsCard
            icon={Mail}
            title="Notifications & Sound"
            description="Sound plays for real when Campus Expert replies in chat. Campus Expert doesn't send push or email notifications yet, so the toggles below just save your preference for when that exists."
          >
            <ul className="divide-y divide-[var(--border)]">
              <li className="flex items-center justify-between gap-4 pb-3.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-[#6D28D9]">
                    <Volume2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">Message Sound</p>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      Play a sound when Campus Expert replies in chat.
                    </p>
                  </div>
                </div>
                <ToggleSwitch checked={soundEnabled} onChange={handleSoundToggle} label="Message Sound" />
              </li>
              {notificationItems.map(({ key, icon: Icon, label, description }) => (
                <li key={key} className="flex items-center justify-between gap-4 py-3.5 last:pb-0">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-[#6D28D9]">
                      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{description}</p>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={notifications[key]}
                    onChange={() => toggleNotification(key)}
                    label={label}
                  />
                </li>
              ))}
            </ul>
          </SettingsCard>

          {/* Save preferences */}
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Sync to your account</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Appearance and notification preferences already apply instantly on this device. Save to carry
                  them to any device you sign in on.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSavePreferences}
                disabled={saveState === "saving"}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#6D28D9] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:scale-[1.03] hover:bg-[#7C3AED] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                {saveState === "saving" ? "Saving…" : "Save Preferences"}
              </button>
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
          </section>

          {/* Account */}
          <SettingsCard
            icon={KeyRound}
            title="Account"
            description={
              user?.isDemo
                ? "This is a demo account - credentials can't be changed, and everything here disappears when you log out."
                : undefined
            }
          >
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleEditProfile}
                className="inline-flex items-center gap-2 rounded-full bg-[#6D28D9] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:scale-[1.03] hover:bg-[#7C3AED] active:scale-[0.98]"
              >
                <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Edit Profile
              </button>
              <button
                type="button"
                onClick={handleChangePassword}
                aria-disabled={user?.isDemo}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.98] ${
                  user?.isDemo
                    ? "cursor-not-allowed border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-faint)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:scale-[1.03] hover:border-[#6D28D9] hover:text-[#6D28D9]"
                }`}
              >
                <KeyRound className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Change Password
              </button>
              <button
                type="button"
                onClick={handleDownloadData}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:scale-[1.03] hover:border-[#6D28D9] hover:text-[#6D28D9] active:scale-[0.98]"
              >
                <Download className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Download My Data
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-red-600 transition-all duration-200 hover:scale-[1.03] hover:bg-red-50 active:scale-[0.98]"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                {user?.isDemo ? "End Demo" : "Delete Account"}
              </button>
            </div>
          </SettingsCard>

          {/* About */}
          <SettingsCard icon={Info} title="About">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] px-4 py-3.5">
                <dt className="text-xs font-medium text-[var(--text-secondary)]">Campus Expert Version</dt>
                <dd className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">v1.0.0</dd>
              </div>
              <div className="rounded-xl border border-[var(--border)] px-4 py-3.5">
                <dt className="text-xs font-medium text-[var(--text-secondary)]">Developer</dt>
                <dd className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">Campus Expert Team</dd>
              </div>
            </dl>
          </SettingsCard>

          {/* Danger zone */}
          <section className="rounded-2xl border-2 border-red-200 bg-[var(--surface)] p-6 shadow-sm transition-all duration-200 hover:shadow-md sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <AlertTriangle className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-red-600">Danger Zone</h2>
            </div>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              These actions are permanent or will sign you out of Campus Expert.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                aria-busy={isLoggingOut}
                className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-red-600 transition-all duration-200 hover:scale-[1.03] hover:bg-red-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                {isLoggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <LogOut className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                )}
                {isLoggingOut ? "Logging out..." : "Logout"}
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:scale-[1.03] hover:bg-red-700 active:scale-[0.98]"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                {user?.isDemo ? "End Demo" : "Delete Account"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
