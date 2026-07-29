"use client";

import { useEffect } from "react";
import {
  applyFontSize,
  applyTheme,
  FONT_SIZE_STORAGE_KEY,
  getStoredFontSize,
  getStoredTheme,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

// Mounted once in app/layout.tsx so appearance preferences apply on every
// page, not just while Settings happens to be open. The blocking inline
// script in layout.tsx's <head> already applies the stored theme/font size
// before first paint (avoiding a flash of the wrong theme); this component
// takes over afterward for the parts that need to stay reactive while the
// tab is open:
//   - "System" mode following a live OS theme change
//   - Another tab changing the theme/font size (the storage event only
//     fires in *other* tabs, which is exactly the case the inline script
//     and each page's own load can't cover)
export default function ThemeInit() {
  useEffect(() => {
    applyTheme(getStoredTheme());
    applyFontSize(getStoredFontSize());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      if (getStoredTheme() === "system") applyTheme("system");
    };
    media.addEventListener("change", handleMediaChange);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) applyTheme(getStoredTheme());
      if (event.key === FONT_SIZE_STORAGE_KEY) applyFontSize(getStoredFontSize());
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      media.removeEventListener("change", handleMediaChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return null;
}
