// Shared appearance-preference helpers - theme and font size. Used by
// components/ThemeInit.tsx (applies on every page load, app-wide) and
// app/settings/page.tsx (the UI that lets a student change them). Kept in
// one place so both agree on the same storage keys and the same
// light/dark resolution logic instead of two copies drifting apart.

export type Theme = "light" | "dark" | "system";
export type FontSize = "small" | "medium" | "large";

export const THEME_STORAGE_KEY = "campusExpert:theme";
export const FONT_SIZE_STORAGE_KEY = "campusExpert:fontSize";

// Tailwind's rem-based text utilities (text-sm, text-base, ...) are all
// relative to the root <html> font-size, so scaling that one value is what
// makes "Font Size" affect the whole app immediately without editing every
// page's className list.
export const FONT_SIZE_PX: Record<FontSize, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
};

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

export function isFontSize(value: unknown): value is FontSize {
  return value === "small" || value === "medium" || value === "large";
}

export function getStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function getStoredFontSize(): FontSize {
  try {
    const value = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    return isFontSize(value) ? value : "medium";
  } catch {
    return "medium";
  }
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Toggles the "dark" class on <html> - the single hook every CSS variable
// override in app/globals.css's .dark block depends on.
export function applyTheme(theme: Theme): void {
  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", isDark);
}

export function applyFontSize(size: FontSize): void {
  document.documentElement.style.fontSize = FONT_SIZE_PX[size];
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme still applies for this page load via applyTheme(); it just
    // won't survive a refresh if storage isn't writable (e.g. private
    // browsing with storage disabled).
  }
}

export function storeFontSize(size: FontSize): void {
  try {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, size);
  } catch {
    // Non-fatal - see storeTheme().
  }
}
