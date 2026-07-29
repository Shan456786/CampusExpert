"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  Sparkles,
  LayoutGrid,
  CalendarDays,
  BookOpen,
  Bus,
  UtensilsCrossed,
  Stethoscope,
  Map,
  FileText,
  Briefcase,
  Megaphone,
  Download,
  ArrowRight,
  Star,
  SearchX,
} from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { buildQuickNavLinks } from "@/lib/navigation";

// Where "Open Resource" sends the student:
//   - "external": a real, confirmed official VIT-AP webpage - opens in a
//     new tab, since it's leaving Campus Expert.
//   - "document": a real document/PDF served by this app - also opens in
//     a new tab (the browser's own viewer lets the student read or save
//     it, rather than forcing an immediate download).
//   - "internal": no official page or document has been confirmed for
//     this resource yet. Per requirement 4, this navigates to
//     /resources/coming-soon instead of the button doing nothing - see
//     that page for what the student sees.
// Nothing here was guessed: the four "external" URLs below are the exact
// vitap.ac.in paths already used as seed URLs for the knowledge-base
// ingestion pipeline (see backend/urls.txt) - not invented for this page.
// No real document currently exists to link as "document" (the backend's
// knowledge_base/ folder only has empty placeholder PDFs), so none of the
// categories below use that type yet - swapping a category to
// { type: "document", href: "/documents/whatever.pdf" } once a real file
// exists is a one-line change.
type ResourceDestinationType = "external" | "document" | "internal";

interface ResourceDestination {
  type: ResourceDestinationType;
  // Real URL for "external"/"document". Unused for "internal" - that case
  // always routes to /resources/coming-soon with the resource's own title
  // attached, so there's nothing to fill in here.
  href: string;
}

interface ResourceCategory {
  icon: LucideIcon;
  title: string;
  description: string;
  destination: ResourceDestination;
}

const resourceCategories: ResourceCategory[] = [
  {
    icon: CalendarDays,
    title: "Academic Calendar",
    description: "View semester schedules and important academic dates.",
    destination: { type: "external", href: "https://vitap.ac.in/academiccalender" },
  },
  {
    icon: BookOpen,
    title: "Student Handbook",
    description: "University rules, regulations and student policies.",
    destination: { type: "internal", href: "" },
  },
  {
    icon: Bus,
    title: "Bus Routes",
    description: "Campus transportation schedules and routes.",
    destination: { type: "external", href: "https://vitap.ac.in/transport" },
  },
  {
    icon: UtensilsCrossed,
    title: "Mess Menu",
    description: "Check today's breakfast, lunch and dinner menu.",
    destination: { type: "external", href: "https://vitap.ac.in/cafeteria" },
  },
  {
    icon: Stethoscope,
    title: "Medical Centre",
    description: "Healthcare services and emergency contact information.",
    destination: { type: "external", href: "https://vitap.ac.in/healthcare" },
  },
  {
    icon: Map,
    title: "Campus Map",
    description: "Navigate classrooms, hostels and university buildings.",
    destination: { type: "internal", href: "" },
  },
  {
    icon: FileText,
    title: "Leave Forms",
    description: "Download hostel and academic leave applications.",
    destination: { type: "internal", href: "" },
  },
  {
    icon: Briefcase,
    title: "Placement Resources",
    description: "Interview preparation, resume templates and career resources.",
    destination: { type: "internal", href: "" },
  },
  {
    icon: Megaphone,
    title: "Circulars",
    description: "Latest notices and university announcements.",
    destination: { type: "internal", href: "" },
  },
  {
    icon: Download,
    title: "Software Downloads",
    description: "University licensed software and tools.",
    destination: { type: "internal", href: "" },
  },
];

const popularTitles = ["Academic Calendar", "Campus Map", "Mess Menu"];

// Full 6-link navigation set required on every page: Home, Chat, Resources,
// About, Profile, Settings - so a student can always get back anywhere
// without touching the browser Back button. Shared list, see
// lib/navigation.ts - this page overrides its own entry with a filled
// LayoutGrid icon, same as before.
const quickLinks = buildQuickNavLinks("/resources", {
  "/resources": { icon: LayoutGrid },
});

// Resolves a category's destination into a real href, string-typed either
// way so both the <Link> and <a> branches below can share one prop object.
// "internal" always points at the coming-soon page with this resource's
// own title attached, so that page can say what's missing by name instead
// of showing a generic message.
function resolveHref(title: string, destination: ResourceDestination): string {
  if (destination.type === "internal") {
    return `/resources/coming-soon?title=${encodeURIComponent(title)}`;
  }
  return destination.href;
}

function OpenResourceButton({
  title,
  destination,
  variant,
}: {
  title: string;
  destination: ResourceDestination;
  variant: "solid" | "outline";
}) {
  const href = resolveHref(title, destination);
  const className =
    variant === "solid"
      ? "relative mt-5 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#6D28D9] px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.03] hover:bg-[#7C3AED] active:scale-[0.98]"
      : "mt-5 inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:scale-[1.03] hover:border-[#6D28D9] hover:bg-[var(--surface-subtle)] hover:text-[#6D28D9] active:scale-[0.98]";

  // External/document destinations leave the app (a different origin, or a
  // file to view/save) - a real navigation with a new tab is correct.
  // Internal destinations stay inside Campus Expert, so a Next.js <Link>
  // (client-side navigation, same tab) is the right one instead.
  if (destination.type === "internal") {
    return (
      <Link href={href} className={className}>
        Open Resource
        <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      Open Resource
      <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
    </a>
  );
}

export default function ResourcesPage() {
  const [query, setQuery] = useState("");

  // Real client-side filtering - matches against both title and
  // description, case-insensitively. Previously this input had no
  // onChange at all, so typing into it did nothing.
  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (resource: ResourceCategory) =>
    normalizedQuery.length === 0 ||
    resource.title.toLowerCase().includes(normalizedQuery) ||
    resource.description.toLowerCase().includes(normalizedQuery);

  const filteredCategories = useMemo(
    () => resourceCategories.filter(matchesQuery),
    [normalizedQuery]
  );
  const filteredPopular = useMemo(
    () =>
      resourceCategories.filter(
        (resource) => popularTitles.includes(resource.title) && matchesQuery(resource)
      ),
    [normalizedQuery]
  );

  return (
    <div className="flex min-h-screen w-full bg-[var(--surface-subtle)]">
      {/* Sidebar — desktop only */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] px-4 py-6 lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#6D28D9] shadow-sm shadow-[#6D28D9]/20">
            <Sparkles className="h-5 w-5 text-white" strokeWidth={2} />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
            Campus Expert
          </span>
        </Link>

        <nav className="mt-8" aria-label="Quick links">
          <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Quick Links
          </h2>
          <ul className="mt-3 space-y-1">
            {quickLinks.map(({ icon: Icon, label, href, active }) => (
              <li key={label}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-200 ${
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
          </ul>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="animate-[fadeIn_0.4s_ease-out] text-center lg:text-left">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              Student Resources
            </h1>
            <p className="mt-3 text-lg text-[var(--text-secondary)]">
              Everything you need in one place.
            </p>
          </div>

          {/* Search bar */}
          <div className="mx-auto mt-8 max-w-2xl lg:mx-0">
            <label htmlFor="resource-search" className="sr-only">
              Search resources
            </label>
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3.5 shadow-sm transition-all duration-200 focus-within:border-[#6D28D9] focus-within:shadow-md focus-within:ring-4 focus-within:ring-[#6D28D9]/10">
              <Search className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" strokeWidth={2} aria-hidden="true" />
              <input
                id="resource-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search resources..."
                className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
              />
            </div>
          </div>

          {/* Popular Resources */}
          {filteredPopular.length > 0 && (
          <section className="mt-12" aria-labelledby="popular-resources-heading">
            <h2
              id="popular-resources-heading"
              className="text-xl font-semibold tracking-tight text-[var(--text-primary)]"
            >
              Popular Resources
            </h2>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPopular.map(({ icon: Icon, title, description, destination }) => (
                <div
                  key={title}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6D28D9] hover:shadow-md"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-[#A78BFA]/25 to-[#6D28D9]/10 blur-2xl"
                  />
                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[#DDD6FE] px-2.5 py-1 text-xs font-semibold text-[#6D28D9]">
                    <Star className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                    Popular
                  </span>

                  <span className="relative mt-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-subtle)] text-[#6D28D9]">
                    <Icon className="h-6 w-6" strokeWidth={2} />
                  </span>
                  <h3 className="relative mt-4 text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
                  <p className="relative mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {description}
                  </p>

                  <OpenResourceButton title={title} destination={destination} variant="solid" />
                </div>
              ))}
            </div>
          </section>
          )}

          {/* All Resources */}
          <section className="mt-12 pb-16" aria-labelledby="all-resources-heading">
            <h2
              id="all-resources-heading"
              className="text-xl font-semibold tracking-tight text-[var(--text-primary)]"
            >
              All Resources
            </h2>

            {filteredCategories.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No resources found"
                description={`Nothing matches "${query}". Try a different search term, or pick one of the categories below.`}
              >
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:scale-[1.03] hover:border-[#6D28D9] hover:text-[#6D28D9] active:scale-[0.98]"
                >
                  Clear Search
                </button>
                <Link
                  href="/chat"
                  className="inline-flex items-center gap-2 rounded-full bg-[#6D28D9] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:scale-[1.03] hover:bg-[#7C3AED] active:scale-[0.98]"
                >
                  <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  Ask Campus Expert
                </Link>
              </EmptyState>
            ) : (
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {filteredCategories.map(({ icon: Icon, title, description, destination }) => (
                <div
                  key={title}
                  className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6D28D9] hover:shadow-md"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-subtle)] text-[#6D28D9]">
                    <Icon className="h-6 w-6" strokeWidth={2} />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">{title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {description}
                  </p>

                  <OpenResourceButton title={title} destination={destination} variant="outline" />
                </div>
              ))}
            </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
