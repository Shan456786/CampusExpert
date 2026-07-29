# CampusExpert Performance Audit

Date: 2026-07-29
Scope: full frontend (`frontend/`) and backend (`backend/`) source trees.
Constraint honored: every change below is behavior-preserving. Nothing that could change what a user sees or how the app responds was applied directly - anything with that risk is listed as a recommendation only, not executed.

## Summary

10 categories were audited: unused components, unused files, unused imports, duplicate code, duplicate CSS, duplicate API calls, memory leaks, unnecessary re-renders, large bundles, dead code.

Fixed directly (safe, zero behavior change): duplicate logic extracted into 3 shared modules, unused icon imports removed from 3 pages, 3 chat components memoized, 3 event handlers stabilized.

Flagged only, not executed (real risk, or outside what a code edit can do): duplicate button styling across 13 files, 5 unused SVGs, 1 already-neutralized stub file, 11 dead backend Python files, 2 duplicate multi-gigabyte Python virtual environments.

Confirmed clean, no action needed: memory leaks, duplicate/redundant API calls.

---

## 1. Duplicate code - fixed

Three exact duplications were found and collapsed into shared modules. Each was copy-pasted logic with identical behavior in every location, so extraction carries no risk.

**`getInitials()` - three copies, now one.**
The avatar-initials function (e.g. "Shanmayi Shree" -> "SS") was implemented identically in `ChatHeader.tsx`, `ChatSidebar.tsx`, and `settings/page.tsx`. Extracted to `frontend/lib/format.ts`. `profile/page.tsx` has a *different* initials algorithm (handles 3+-word names differently) - deliberately left alone, since unifying it would change what displays for some names.

**Quick-nav link arrays - three copies, now one.**
`settings/page.tsx`, `profile/page.tsx`, and `resources/page.tsx` each hardcoded the same 6-entry navigation array (Home, Chat, Resources, Profile, Settings, About) with only the "active" icon differing. Extracted to `frontend/lib/navigation.ts` as `buildQuickNavLinks(activeHref, overrides?)`, with an override parameter so each page can still swap in its own icon for the active link exactly as before.

**Click-outside-to-close dropdown logic - two copies, now one.**
`Navbar.tsx`'s "Menu" dropdown and `ChatHeader.tsx`'s account menu each had a byte-identical `useEffect` attaching `mousedown`/`keydown` listeners to close on outside-click or Escape. Extracted to `frontend/lib/hooks.ts` as `useDismissOnOutsideClick(isOpen, containerRef, onDismiss)`, and both components now call it instead. The dismiss callback in each is wrapped in `useCallback` with an empty dependency array so the hook's listeners aren't torn down and re-added on every render.

## 2. Unused imports - fixed

No project-wide unused-import problem (verified with pyflakes on the backend and a custom import/usage cross-reference on the frontend - `tsc` alone doesn't catch this, since `noUnusedLocals`/`noUnusedParameters` aren't enabled in `tsconfig.json`; see recommendation below). Three pages had leftover icon imports from earlier versions of their quick-nav arrays, removed as part of the nav-array extraction above:

- `settings/page.tsx`: removed `Home`, `MessageSquare`, `BookOpen`, `User`, `Settings as SettingsIcon`.
- `profile/page.tsx`: removed `Home`, `BookOpen`, `Info`, `Settings`.
- `resources/page.tsx`: removed `Home`, `MessageSquare`, `Info`, `User`, `Settings`.

## 3. Unnecessary re-renders - fixed

**Root cause:** `frontend/app/chat/page.tsx` toggles `isTyping` on every message send (drives the "Campus Expert is thinking..." indicator). Because `ChatSidebar`, `ChatHeader`, and every `ChatMessage` in the list were plain function components, each `isTyping` flip re-rendered the entire sidebar, header, and full message history, not just the typing indicator.

**Fix:** wrapped all three in `React.memo()`:
- `ChatMessage.tsx` - each message bubble now only re-renders when its own `message` object changes, not when a sibling ticks.
- `ChatSidebar.tsx` - the conversation list now only re-renders when its own props (conversations, active id, busy flags) change.
- `ChatHeader.tsx` - the account dropdown now only re-renders on its own state changes.

`React.memo()` only helps if prop identity is stable, so the parent (`chat/page.tsx`) needed matching changes:
- `handleNewChat` converted from a plain function to `useCallback(..., [])`.
- The inline `onClose={() => setIsSidebarOpen(false)}` passed to `ChatSidebar` replaced with a stable `handleCloseSidebar` (`useCallback`, empty deps).
- The inline `onMenuClick={() => setIsSidebarOpen(true)}` passed to `ChatHeader` replaced with a stable `handleOpenSidebar` (`useCallback`, empty deps).
- `onSelectChat`, `onDeleteChat`, and `onRetryConversations` were already `useCallback`-wrapped - no change needed there.

Net effect: sending a message or waiting for a reply no longer re-renders the sidebar, header, or already-rendered chat bubbles - only the typing indicator and the new message itself.

Verified with `tsc --noEmit` after all changes - clean, no type errors introduced.

## 4. Memory leaks - none found

Checked every `useEffect` with a subscription, listener, or timer:
- `ThemeInit.tsx`: `media.removeEventListener` and `window.removeEventListener` both present in cleanup.
- `lib/preferences.ts`'s `playNotificationSound()`: the `window.setTimeout(() => context.close(), 500)` is a correct AudioContext teardown, not a leak.
- Every `document.addEventListener` found (Navbar, ChatHeader's dropdowns, now unified in `useDismissOnOutsideClick`) has a matching cleanup that only runs while the dropdown is actually open.

No action needed.

## 5. Duplicate / redundant API calls - none found

No page fires the same network request twice on a single user action. One dev-only observation, not a bug: React Strict Mode double-invokes effects in development, which can double-fire a mount-time fetch in the dev server only - this never happens in a production build and was left as-is.

## 6. Duplicate CSS - flagged, not executed

`components/ui/Button.tsx` is the canonical button component (variant/size system, loading state, icon slots). Searching for its signature Tailwind classes (`rounded-full` + the primary hover treatment) found the same hand-rolled button styling duplicated inline across 13 other files instead of using `Button`: `ChatMessage.tsx`, `ChatSidebar.tsx`, `Navbar.tsx`, `settings/page.tsx`, `profile/page.tsx`, `resources/page.tsx`, `ChatInput.tsx`, `home/SearchBar.tsx`, `home/Hero.tsx`, `resources/coming-soon/page.tsx`, `not-found.tsx`, `error.tsx`, `about/page.tsx`.

**Not fixed directly.** Swapping 13 files' worth of hand-rolled buttons for `<Button>` touches disabled states, loading spinners, icon placement, and hover/active timing in every one of them - a mechanical-looking change that is genuinely easy to get subtly wrong (e.g. a button that currently has no loading state silently gaining one, or icon spacing shifting a pixel or two). This is real, worthwhile cleanup, but it's a visual-regression risk, not a safe automatic refactor - recommend doing it file-by-file with a visual check after each one, not in one pass.

## 7. Unused files - flagged, not executed

- **5 unused SVGs** in `frontend/public/`: `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` - the default Next.js starter icons, never referenced anywhere in the app. Safe to delete.
- **`components/home/Stats.tsx`**: already an intentionally emptied stub (`export {};`) with a comment left in place explaining nothing imports it and it's safe to fully delete. No further action possible without file deletion.

Not deleted because this sandbox can only overwrite files, not remove them. Both are safe for you to delete directly.

## 8. Dead code - flagged, not executed

11 backend Python files are unreferenced from `main.py`'s live import chain - leftovers from an earlier semantic-search/embeddings pipeline that was replaced by the current deterministic JSON knowledge base:

`app/services/semantic_search.py`, `app/services/hybrid_retriever.py`, `app/data/db.py`, `app/data/chunk_store.py`, `app/ingestion/__init__.py`, `app/ingestion/categorize.py`, `app/ingestion/chunker.py`, `app/ingestion/crawler.py`, `app/ingestion/extractor.py`, `backend/ingest.py`, `backend/scripts/ingest.py`.

These cost nothing at runtime (Python only loads modules that are actually imported), so this isn't a performance issue today - it's a maintenance-burden issue: dead code that will confuse the next person who opens `app/services/` or `app/ingestion/` and assumes it's live. Recommend deleting once you've confirmed nothing external still calls into `scripts/ingest.py` manually.

## 9. Large bundles - flagged, not executed, highest-impact item in this audit

Both `backend/venv/` and `backend/venv313/` contain full installs of `torch` (2.13.0), `torchgen`, `functorch`, `sentence_transformers` (5.6.1), `scikit-learn`, and `numpy` - multi-gigabyte ML dependency trees from the same abandoned semantic-search pipeline in item 8. None of these are imported by any file main.py actually loads. `backend/requirements.txt` is already correctly trimmed (`fastapi`, `uvicorn[standard]`, `pydantic`, `httpx`, `python-dotenv` only, with the ML deps explicitly commented out and explained) - the problem is purely that the two local virtual environments were never rebuilt from the trimmed file.

This is the single biggest thing to act on from this whole audit, and it's outside what a code change can fix: recommend deleting both `backend/venv` and `backend/venv313` and rebuilding one clean venv from the current `requirements.txt` (`python -m venv venv && venv\Scripts\pip install -r requirements.txt` on Windows). Not touched directly - deleting your local Python environments is a consequential, irreversible action that belongs to you, not to an automated code edit.

## 10. Unused components - none found

Every component under `components/` has at least one real consumer. `components/ui/Card.tsx` is under-utilized (only `Features.tsx` imports it) but not unused - no action needed.

## Also worth doing (process recommendation, not a code change)

`frontend/tsconfig.json` doesn't have `noUnusedLocals` / `noUnusedParameters` enabled, which is why `tsc` alone didn't catch the unused icon imports in item 2 - a custom script and manual review had to do it instead. Turning both on would make `tsc --noEmit` catch this class of issue automatically going forward, at the cost of `tsc` failing the build until any currently-unused locals are cleaned up.

## Files changed in this pass

- `frontend/lib/format.ts` (new)
- `frontend/lib/navigation.ts` (new)
- `frontend/lib/hooks.ts` (new)
- `frontend/components/chat/ChatHeader.tsx`
- `frontend/components/chat/ChatSidebar.tsx`
- `frontend/components/chat/ChatMessage.tsx`
- `frontend/components/layout/Navbar.tsx`
- `frontend/app/settings/page.tsx`
- `frontend/app/profile/page.tsx`
- `frontend/app/resources/page.tsx`
- `frontend/app/chat/page.tsx`

Verified with `tsc --noEmit` after the full pass - no errors.
