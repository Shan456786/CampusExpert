import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeInit from "@/components/ThemeInit";
import OfflineBanner from "@/components/ui/OfflineBanner";
import DemoBanner from "@/components/ui/DemoBanner";

// Runs synchronously in <head>, before hydration - reads the saved theme
// and font size straight out of localStorage and applies them immediately.
// Without this, the page would always paint in light mode first and then
// flash to dark a moment later once React mounts and ThemeInit's effect
// runs. Kept intentionally tiny and dependency-free since it has to run
// before anything else on the page.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem("campusExpert:theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var isDark = theme === "dark" || (theme !== "light" && prefersDark);
    if (isDark) document.documentElement.classList.add("dark");

    var fontSize = localStorage.getItem("campusExpert:fontSize");
    if (fontSize === "small") document.documentElement.style.fontSize = "14px";
    else if (fontSize === "large") document.documentElement.style.fontSize = "18px";
  } catch (e) {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Campus Expert",
  description: "Your AI-powered assistant for everything at VIT-AP.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // THEME_INIT_SCRIPT above intentionally mutates this element's
      // class/style before React hydrates (that's the whole point - it's
      // what avoids a light-mode flash for a returning dark-mode student).
      // React can't know that mismatch is deliberate, so it logs a
      // hydration-mismatch warning for <html> on every load once a
      // non-default theme or font size is saved - found in the console
      // during the pre-demo QA pass. suppressHydrationWarning here scopes
      // the silence to exactly this element; it doesn't hide real
      // hydration bugs anywhere else in the tree.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeInit />
        <OfflineBanner />
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
