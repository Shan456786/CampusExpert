import { ExternalLink, FileText, ShieldAlert, ShieldCheck } from "lucide-react";

// Mirrors backend/app/schemas/chat.py's Source model exactly. title is the
// knowledge entry's own short label, category and source_type are passed
// through as-is, source_url is the real vitap.ac.in page or PDF the fact
// was pulled from, and last_updated is when that fact was last confirmed
// against its source - all real retrieval metadata, never fabricated in
// the UI.
export interface Source {
  id: string;
  title: string;
  category: string;
  source_type: string;
  source_url: string;
  last_updated: string;
}

interface SourceCardProps {
  source: Source;
}

// Verification status is derived ONLY from source_type, never from the
// fact that retrieval matched this source at all. Matching a demo entry
// with high confidence still makes it a demo entry - confidence and
// verification are different questions. Anything not explicitly marked
// official/verified is shown as Unverified by default (fail-safe: an
// unrecognized source_type should never silently read as "Verified").
const VERIFIED_KEYWORDS = ["official", "verified"];

function getVerificationStatus(sourceType: string): {
  label: string;
  isVerified: boolean;
} {
  const normalized = sourceType.toLowerCase();
  const isVerified = VERIFIED_KEYWORDS.some((keyword) => normalized.includes(keyword));
  return isVerified ? { label: "Verified", isVerified: true } : { label: "Unverified", isVerified: false };
}

export default function SourceCard({ source }: SourceCardProps) {
  const status = getVerificationStatus(source.source_type);
  // Only render a clickable link when source_url actually looks like one -
  // fails safe to plain text rather than rendering a broken/empty href if
  // an entry is ever missing this field.
  const hasLink = /^https?:\/\//i.test(source.source_url);

  return (
    <div className="inline-flex max-w-full flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6D28D9] hover:shadow-sm">
      <div className="flex items-center gap-2 text-[var(--text-primary)]">
        <FileText className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" strokeWidth={2} aria-hidden="true" />
        <span className="truncate font-medium">{source.title}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs font-medium capitalize text-[var(--text-secondary)]">
          {source.category}
        </span>

        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            status.isVerified
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {status.isVerified ? (
            <ShieldCheck className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          ) : (
            <ShieldAlert className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          )}
          {status.label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-faint)]">
        {hasLink ? (
          <a
            href={source.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#6D28D9] hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            View source
            <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          </a>
        ) : (
          <span>{source.source_url}</span>
        )}
        {source.last_updated && <span>Updated {source.last_updated}</span>}
      </div>
    </div>
  );
}
