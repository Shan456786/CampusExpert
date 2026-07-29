import Link from "next/link";
import { Sparkles, Mail } from "lucide-react";

interface FooterLink {
  label: string;
  href: string;
}

// Previously pointed at #features/#resources/#about/#support - hash anchors
// that don't exist anywhere in the app, so every link here silently did
// nothing on any page but "/". Replaced with the app's real routes.
const quickLinks: FooterLink[] = [
  { label: "Home", href: "/" },
  { label: "Chat", href: "/chat" },
  { label: "Resources", href: "/resources" },
  { label: "About", href: "/about" },
];

// Previously all pointed at "#" (literally nowhere) - no dedicated page
// exists yet for any of these specific topics, so they route to the real
// Resources page, which covers all of them, rather than doing nothing.
const studentResourceLinks: FooterLink[] = [
  { label: "Academic Calendar", href: "/resources" },
  { label: "Faculty Directory", href: "/resources" },
  { label: "Hostel Information", href: "/resources" },
  { label: "Bus Routes", href: "/resources" },
];

export default function Footer() {
  return (
    <footer className="w-full border-t border-[var(--border)] bg-[var(--surface)] px-6 py-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#6D28D9] shadow-sm shadow-[#6D28D9]/20">
                <Sparkles className="h-5 w-5 text-white" strokeWidth={2} />
              </span>

              <span className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
                Campus Expert
              </span>
            </Link>

            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--text-secondary)]">
              Your AI-powered assistant for everything at VIT AP.
            </p>
          </div>

          {/* Quick Links */}
          <nav aria-label="Quick links">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Quick Links
            </h3>

            <ul className="mt-4 space-y-3">
              {quickLinks.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="text-sm text-[var(--text-secondary)] transition-colors duration-200 hover:text-[#6D28D9]"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Student Resources */}
          <nav aria-label="Student resources">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Student Resources
            </h3>

            <ul className="mt-4 space-y-3">
              {studentResourceLinks.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="text-sm text-[var(--text-secondary)] transition-colors duration-200 hover:text-[#6D28D9]"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Contact</h3>

            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href="mailto:hello@campusexpert.app"
                  className="flex items-center gap-2 text-sm text-[var(--text-secondary)] transition-colors duration-200 hover:text-[#6D28D9]"
                >
                  <Mail
                    className="h-4 w-4"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  hello@campusexpert.app
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col items-center gap-2 border-t border-[var(--border)] pt-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-sm text-[var(--text-secondary)]">
            © {new Date().getFullYear()} Campus Expert. All rights reserved.
          </p>

          <p className="text-sm text-[var(--text-secondary)]">
            Made with <span aria-hidden="true">❤️</span> for VIT AP Students
          </p>
        </div>
      </div>
    </footer>
  );
}