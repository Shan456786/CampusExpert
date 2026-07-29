// Skeleton
// Reusable animated placeholder block for content that's still loading -
// the sidebar's conversation list, a conversation being switched into,
// or any future data-fetching view. Deliberately a plain shaped <div>
// (not real content in a "loading" style) so it can never be mistaken
// for actual data - see globals.css's @keyframes shimmer for the sweep
// animation.
interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export default function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-[var(--surface-subtle)] ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--surface-subtle) 25%, var(--border) 37%, var(--surface-subtle) 63%)",
        backgroundSize: "400% 100%",
        animation: "shimmer 1.6s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

/** Skeleton rows sized for one sidebar conversation-list item. */
export function ConversationSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <ul className="mt-3 space-y-1.5" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <li key={index} className="flex items-center gap-2.5 px-2.5 py-2">
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          <Skeleton className="h-4 flex-1 rounded" style={{ maxWidth: `${85 - index * 8}%` }} />
        </li>
      ))}
    </ul>
  );
}

/** Skeleton chat bubbles shown while a past conversation is being loaded
 *  in (see app/chat/page.tsx's handleSelectChat). */
export function MessageSkeletonList() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6" aria-hidden="true">
      <div className="flex items-start gap-3">
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-3/5 rounded" />
          <Skeleton className="h-4 w-2/5 rounded" />
        </div>
      </div>
      <div className="flex items-start justify-end gap-3">
        <div className="flex-1 space-y-2 pt-1 text-right">
          <Skeleton className="ml-auto h-4 w-2/5 rounded" />
        </div>
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      </div>
      <div className="flex items-start gap-3">
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-4/5 rounded" />
          <Skeleton className="h-4 w-3/5 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
        </div>
      </div>
    </div>
  );
}
