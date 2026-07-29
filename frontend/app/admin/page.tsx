import { notFound } from "next/navigation";

// The admin dashboard that used to live here was entirely fabricated: fake
// document counts, a fake "1,284 questions answered" stat, five made-up
// documents in a table, and roughly a dozen buttons (upload, quick
// actions, notifications, sidebar nav items) with no onClick handlers at
// all. None of it was backed by a real endpoint - there is no admin API
// anywhere in backend/app. Building a real one (document upload, a
// knowledge-base editor, real analytics) is a substantial feature on its
// own, not a demo-prep bug fix, so per the "every visible feature either
// works or is removed" rule this route was retired instead of left
// showing invented data behind dead buttons.
//
// This sandbox's mounted filesystem doesn't allow deleting files, so the
// route can't be removed outright - calling notFound() makes it render
// the app's real not-found page (see app/not-found.tsx) instead, which is
// the same experience a deleted route would give a visitor. Safe to
// delete this whole app/admin/ directory once you have normal filesystem
// access.
export default function AdminDashboardPage(): never {
  notFound();
}
