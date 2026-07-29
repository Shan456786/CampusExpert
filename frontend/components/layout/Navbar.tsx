"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Menu,
  X,
  ChevronDown,
  LogIn,
  UserPlus,
  PlayCircle,
  User,
  Settings,
  MessageSquare,
  BookOpen,
  Info,
  LogOut,
  Loader2,
} from "lucide-react";
import { getStoredUser, logoutSession, type StoredUser } from "@/lib/auth";
import { useDismissOnOutsideClick } from "@/lib/hooks";

interface NavLink {
  href: string;
  label: string;
  icon: typeof LogIn;
}

// Shown in the "Account" section of the Menu dropdown/mobile panel when no
// one is signed in. "Try Demo" routes to app/demo/page.tsx, which creates
// a fresh demo account server-side and drops the visitor straight into
// /chat - see that page's docstring. Plain Link like every other entry
// here rather than an onClick handler, since the actual demo-creation
// call lives on that page, not duplicated at every place this link
// appears.
const loggedOutAccountLinks: NavLink[] = [
  { href: "/login", label: "Login", icon: LogIn },
  { href: "/signup", label: "Signup", icon: UserPlus },
  { href: "/demo", label: "Try Demo", icon: PlayCircle },
];

// Shown instead once a real session exists - Login/Signup make no sense
// to offer someone who's already signed in, and there was previously no
// way to log out or even tell you were signed in from this nav at all.
const loggedInAccountLinks: NavLink[] = [
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

const pageLinks: NavLink[] = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/resources", label: "Resources", icon: BookOpen },
  { href: "/about", label: "About", icon: Info },
];

/**
 * Navbar
 * Sticky top navigation for Campus Expert.
 * Displays the product logo/name on the left and site navigation on the
 * right: direct links to Resources and About, plus a "Menu" dropdown that
 * groups account actions and the rest of the app's pages so the bar stays
 * uncluttered as it grows. The Account section switches between
 * Login/Signup and Profile/Settings/Logout depending on whether a real
 * session exists. Collapses into a hamburger menu with the same links on
 * small screens.
 */
export default function Navbar() {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Same localStorage-backed session every authenticated page already
  // reads from (frontend/lib/auth.ts) - lets this nav show Login/Signup
  // vs. Profile/Settings/Logout correctly instead of always showing both
  // states regardless of whether anyone is actually signed in.
  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logoutSession();
      closeAllMenus();
      setUser(null);
      router.push("/");
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Close the "Menu" dropdown on outside click or Escape - standard
  // dropdown behavior, and necessary since it isn't a native <select>.
  const closeMenuDropdown = useCallback(() => setIsMenuOpen(false), []);
  useDismissOnOutsideClick(isMenuOpen, menuRef, closeMenuDropdown);

  const closeAllMenus = () => {
    setIsMenuOpen(false);
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
        {/* Logo + Product name */}
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity duration-200 hover:opacity-80"
          onClick={closeAllMenus}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#6D28D9] shadow-sm shadow-[#6D28D9]/20">
            <Sparkles className="h-5 w-5 text-white" strokeWidth={2} />
          </span>

          <span className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
            Campus Expert
          </span>
        </Link>

        {/* Desktop navigation */}
        <div className="hidden items-center gap-1 md:flex">
          <Link
            href="/resources"
            className="rounded-full px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
          >
            Resources
          </Link>

          <Link
            href="/about"
            className="rounded-full px-4 py-2 text-sm font-medium text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
          >
            About
          </Link>

          {/* Menu dropdown */}
          <div ref={menuRef} className="relative ml-2">
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
              className="flex items-center gap-1.5 rounded-full bg-[#6D28D9] px-5 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:scale-[1.03] hover:bg-[#7C3AED] active:scale-[0.98]"
            >
              Menu
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  isMenuOpen ? "rotate-180" : ""
                }`}
                strokeWidth={2.25}
              />
            </button>

            {isMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] py-2 shadow-lg shadow-black/5"
              >
                <NavSection
                  title="Account"
                  links={user ? loggedInAccountLinks : loggedOutAccountLinks}
                  onNavigate={closeAllMenus}
                />
                <NavSection title="Pages" links={pageLinks} onNavigate={closeAllMenus} isLast={!user} />
                {user && (
                  <div className="px-2 py-1.5">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      aria-busy={isLoggingOut}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-red-600 transition-colors duration-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoggingOut ? (
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                      ) : (
                        <LogOut className="h-4 w-4" strokeWidth={2} />
                      )}
                      {isLoggingOut ? "Logging out..." : "Logout"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] md:hidden"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? (
            <X className="h-5 w-5" strokeWidth={2} />
          ) : (
            <Menu className="h-5 w-5" strokeWidth={2} />
          )}
        </button>
      </nav>

      {/* Mobile menu panel - same links as desktop's Resources/About + Menu
          dropdown, flattened into one scrollable list grouped by section. */}
      {isMobileMenuOpen && (
        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            <MobileSection title="Pages" links={pageLinks} onNavigate={closeAllMenus} />
            <MobileSection
              title="Account"
              links={user ? loggedInAccountLinks : loggedOutAccountLinks}
              onNavigate={closeAllMenus}
            />
            {user && (
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                aria-busy={isLoggingOut}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors duration-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                ) : (
                  <LogOut className="h-4 w-4" strokeWidth={2} />
                )}
                {isLoggingOut ? "Logging out..." : "Logout"}
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

interface NavSectionProps {
  title: string;
  links: NavLink[];
  onNavigate: () => void;
  isLast?: boolean;
}

/** One labeled group of links inside the desktop "Menu" dropdown. */
function NavSection({ title, links, onNavigate, isLast = false }: NavSectionProps) {
  return (
    <div className={`px-2 py-1.5 ${isLast ? "" : "border-b border-[var(--surface-subtle)]"}`}>
      <p className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">
        {title}
      </p>
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          role="menuitem"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
        >
          <Icon className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={2} />
          {label}
        </Link>
      ))}
    </div>
  );
}

interface MobileSectionProps {
  title: string;
  links: NavLink[];
  onNavigate: () => void;
}

/** One labeled group of links inside the mobile hamburger panel. */
function MobileSection({ title, links, onNavigate }: MobileSectionProps) {
  return (
    <div>
      <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">
        {title}
      </p>
      <div className="flex flex-col gap-1">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
          >
            <Icon className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={2} />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
