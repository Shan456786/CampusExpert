// Shared "Quick Navigation" link list used by the sidebar on Profile,
// Settings, and Resources - the 3 pages with their own left-hand nav
// column (Chat has its own conversation-list sidebar instead; Home/About
// use the top Navbar). Previously each page defined its own copy of this
// same 6-entry array (Home, Chat, Resources, About, Profile, Settings),
// differing only in which entry was marked active and, for the page
// matching its own href, a slightly different "filled" icon/label for
// itself - kept here once so adding, reordering, or re-labeling a nav
// entry is a one-file change instead of three.

import type { LucideIcon } from "lucide-react";
import { Home, MessageSquare, BookOpen, Info, User, Settings } from "lucide-react";

export interface QuickNavLink {
  icon: LucideIcon;
  label: string;
  href: string;
  active: boolean;
}

interface QuickNavOverride {
  icon?: LucideIcon;
  label?: string;
}

const QUICK_NAV_BASE: Omit<QuickNavLink, "active">[] = [
  { icon: Home, label: "Home", href: "/" },
  { icon: MessageSquare, label: "Chat", href: "/chat" },
  { icon: BookOpen, label: "Resources", href: "/resources" },
  { icon: Info, label: "About", href: "/about" },
  { icon: User, label: "Profile", href: "/profile" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

// `activeHref` marks which entry renders as active. `overrides` lets the
// active page swap in its own icon/label for its own entry - e.g. the
// Resources page shows a filled LayoutGrid icon for itself where every
// other page links to it with a plain BookOpen icon; the Profile page
// shows "My Profile" with a UserCog icon for itself. Passing no override
// reproduces the plain entry exactly as every other page shows it.
export function buildQuickNavLinks(
  activeHref: string,
  overrides: Partial<Record<string, QuickNavOverride>> = {}
): QuickNavLink[] {
  return QUICK_NAV_BASE.map((link) => {
    const active = link.href === activeHref;
    const override = active ? overrides[link.href] : undefined;
    return { ...link, ...override, active };
  });
}
