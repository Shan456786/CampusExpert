# CampusExpert Pre-Demo QA Pass

Date: 2026-07-29
Method: ran the real app (FastAPI backend + Next.js dev server) in an isolated sandbox against a throwaway database, drove it with a headless browser through every page and workflow, and hit the API directly for the abuse/edge-case tests. Nothing in this pass touched your real `auth.db` or any of your actual data - it ran against a disposable copy.

## Bottom line

Found and fixed four real bugs, one of them serious (the core chat feature could crash under certain conditions). Everything else - every page, every auth flow, demo mode, navigation, rate limiting, input validation, session security - tested clean. The app is in good shape for tomorrow.

One thing to do yourself before the demo: run it once on your own machine and confirm you don't see a "You're offline" banner sitting at the top of the screen. I explain why below - it's very likely just an artifact of the sandboxed browser I tested with, not a real bug, but it's a 10-second check worth doing rather than taking my word for it.

---

## Bugs found and fixed

**1. Chat could crash with a 500 error instead of degrading gracefully (serious).**
Sending a real question to `/api/chat` failed with a raw server error. Root cause: the OpenRouter API call in `answer_generator.py` only caught three specific `httpx` exception types; anything outside those three was an unhandled crash instead of the graceful "fall back to a stored answer" behavior the app is designed to have. In my sandbox the trigger was a SOCKS proxy environment variable that doesn't exist on a normal machine, so this exact trigger won't reproduce for you - but the gap it exposed was real: *any* unexpected failure in that call (not just the three anticipated ones) would have crashed the request the same way. Fixed by catching every exception type there, not just the three, and normalizing all of them to the existing safe fallback. Re-tested: a real question now returns a correct, sourced answer every time.

**2. Missing space in resource "not linked yet" page.**
`/resources/coming-soon?title=X` rendered as "Xisn't linked yet" instead of "X isn't linked yet" - a JSX whitespace quirk where the interpolated title and the following text collapsed together with no space. Fixed by combining them into one template string.

**3. Dead "Change Password" button on the Profile page.**
The Settings page's identical button already showed an honest "password management isn't built yet" message (with a demo-specific version for demo accounts). The Profile page's copy of the same button had no `onClick` at all - clicking it did nothing, silently. Ported the same handler over so both buttons now behave identically. Swept the rest of the app for other buttons missing click handlers - found none.

**4. Console warning on every page load once a student has a saved dark-mode/font preference.**
React logged a hydration-mismatch warning because the no-flash theme script (which intentionally sets the dark-mode class before React hydrates, so returning students don't see a flash of light mode) wasn't marked as an intentional mismatch. Fixed with `suppressHydrationWarning` on the `<html>` tag - the standard fix for exactly this pattern. Confirmed clean console after the fix, with a dark-mode preference pre-set exactly like a returning student would have.

All four fixes verified with `tsc --noEmit` (clean) and `py_compile` (clean) plus live re-testing.

---

## Full checklist

**Pages load correctly**

| Page | Result |
|---|---|
| Home (`/`) | Pass |
| About | Pass |
| Resources | Pass |
| Resources - "not linked yet" page (default + with a resource title) | Pass (after fix #2) |
| Login | Pass |
| Signup | Pass |
| Chat (authenticated) | Pass |
| Profile | Pass |
| Settings | Pass |
| Demo entry (`/demo`) | Pass |
| Unknown URL | Correct 404 page |
| Retired `/admin` route | Renders the real 404 page (see note below) |
| `/chat`, `/profile`, `/settings` visited while logged out | All three correctly redirect to Login |

Note on `/admin`: this route was already retired in an earlier audit (it used to show fabricated document counts and dead buttons behind about a dozen non-functional controls). It now correctly shows the same not-found page a visitor would get anywhere else - confirmed visually indistinguishable from a real 404. One technical nitpick: in dev mode the HTTP status code for this specific route comes back as 200 instead of 404, even though the page content is correct. Invisible to anyone clicking around the app; only shows up if someone inspects raw response codes. Not worth touching before tomorrow.

**Auth flows**

| Test | Result |
|---|---|
| Signup - empty form | All 5 field errors shown, no network call made |
| Signup - passwords don't match | Correct error |
| Signup - password under 6 characters | Correct error |
| Signup - valid data | Account created, redirected to Chat, session stored |
| Signup - duplicate email | "An account with this email already exists." shown on the email field |
| Login - wrong password | "Incorrect email or password." |
| Login - correct credentials | Redirected to Chat, session stored |
| Logout | Token cleared, redirected home |

**Demo Mode**

| Test | Result |
|---|---|
| "Try Demo" creates a session | Pass - lands on Chat with a real, isolated demo account |
| Sample data present | Sample profile (name, department, year, hostel, bio), 2 sample conversations, sample settings all populated |
| Demo Mode banner | Shows correctly |
| Credential fields locked | Email and Student ID are read-only (true for every account, not just demo - there's no password-change endpoint yet for anyone) |
| Real chat message while in demo | Works, real sourced answer returned |
| Account stats | Real, computed numbers (chats, questions asked, member since, last login) - not fabricated |

**Chat**

| Test | Result |
|---|---|
| Ask a real question | Correct, sourced answer (verified after fix #1) |
| Empty message | Send button correctly stays disabled |
| Oversized message (5,000 characters) | Backend correctly rejects with 422; frontend shows a friendly "something went wrong, try again" message rather than a raw error or a crash |
| XSS payload (`<script>alert(1)</script>`) as a question | Treated as inert text throughout - not executed, not reflected back as markup |
| SQL-injection-shaped input | Handled safely (parameterized queries throughout), fell through to the honest "couldn't find that" response |

**Profile & Settings**

| Test | Result |
|---|---|
| Profile displays real account data | Pass |
| Edit Profile / Change Password / Logout buttons | All wired (Change Password fixed in this pass) |
| Settings - theme toggle to Dark | Applies immediately, persists after a full reload, no flash |
| Settings - Save | Confirms with a banner message |

**Navigation**

| Test | Result |
|---|---|
| Navbar links (Home, Chat, Resources, About) | All real routes, all load |
| Footer links, including mailto | All real, no dead `#` links anywhere in the app |
| Resource category cards | Route either to a real resource or to the honest "not linked yet" page - never a dead click |

**Security / abuse testing**

| Test | Result |
|---|---|
| 11 rapid login attempts | First 10 processed normally, 11th+ correctly rate-limited (429) |
| Expired/garbage session token | Clean 401, safe message, no stack trace |
| Missing auth header | Clean 401 |
| Token reused after logout | Correctly rejected (401) - confirms sessions really do revoke on logout |

**Content audit**

| Check | Result |
|---|---|
| Lorem ipsum / TODO / FIXME markers | None found anywhere in the codebase |
| Hardcoded fake names or test emails (John Doe, test@test.com, etc.) | None found |
| Fabricated statistics | None currently rendered - the old fake "15,000+ Students" landing-page stat and the fake admin dashboard numbers were already stripped out in an earlier audit; re-confirmed clean in this pass |
| Broken images | None possible - the app has no `<img>` tags anywhere, it's icon-only (lucide-react); favicon is present |
| Dead buttons (no click handler) | One found and fixed (#3 above); swept the rest of the app, no others found |

---

## Two things worth knowing before tomorrow (not bugs, just context)

**The "You're offline" banner in my test screenshots.** It showed up on every page during this pass. I checked the code (`OfflineBanner.tsx`) and it's correctly implemented - it just reads the browser's real `navigator.onLine` value. I confirmed directly that in this sandbox's headless browser, `navigator.onLine` reports `false` even though the network is actually fine - a known quirk of serverless/sandboxed Chromium, not a code bug. It's very unlikely to show up on a normal laptop with a normal internet connection, but since I can't test on your actual machine, do a quick real-browser check before you present.

**Google Fonts couldn't load in this sandbox** (no outbound access to fonts.googleapis.com), so `npm run dev` fell back to a system font automatically - harmless and invisible. But a full production build (`npm run build`) hard-fails without that font access. If your demo setup involves building the app fresh rather than running `npm run dev`, make sure that machine has normal internet access first.

## Files changed in this pass

- `backend/app/services/answer_generator.py` - catch-all exception handling around the OpenRouter call
- `frontend/app/resources/coming-soon/page.tsx` - fixed missing space
- `frontend/app/profile/page.tsx` - wired the Change Password button
- `frontend/app/layout.tsx` - suppressed the intentional theme-init hydration warning
