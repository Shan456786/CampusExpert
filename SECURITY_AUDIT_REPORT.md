# CampusExpert Security Audit

Date: 2026-07-29
Scope: full backend (`backend/`) and frontend (`frontend/`) source trees.
Constraint honored: every fix below is behavior-preserving for legitimate use - nothing here changes what a real student experiences. Fixes only change behavior for malformed, abusive, or malicious requests.

## Summary

13 categories were audited. Most of the app's security fundamentals were already solid (parameterized SQL everywhere, PBKDF2 password hashing, no XSS sinks, ownership-scoped authorization). The real gaps were unbounded input, no rate limiting on the three unauthenticated endpoints, and a couple of low-cost hardening items (CORS, security headers, gitignore coverage) that had never been addressed. All of those are fixed below. One finding - a real, active OpenRouter API key sitting in `backend/.env` - needs a decision from you, not a code change.

---

## 1. Exposed secrets / hardcoded API keys

**Finding, needs your attention:** `backend/.env` contains a real, active `OPENROUTER_API_KEY`, used by `app/services/answer_generator.py` to call OpenRouter's chat completion API for every grounded chat answer. It is correctly loaded via `os.getenv()` and never hardcoded in source, never logged (verified every `print()` in that file - none include the key or the request headers), and never returned to the client even on error (OpenRouter error bodies are logged server-side only, truncated, and replaced with a generic safe message before reaching the frontend).

`backend/.gitignore` already excludes `.env` and `.env.*`, and this project isn't a git repository yet, so there's no commit history to worry about. The residual risk is purely "does this file ever leave your machine" - a screen share, a zip sent to someone, a backup tool that doesn't respect `.gitignore`. Recommend: confirm the key still has reasonable spend limits set on OpenRouter's side, and rotate it if you're ever unsure whether it's been seen by anyone else. Not something I can act on for you - only fixed the two related gaps below.

**Fixed:** `backend/.gitignore` didn't exclude the SQLite database files at all. `auth.db` holds every user's password hash, full name, registration number, and email - exactly the kind of file that should never be one `git init && git add .` away from being committed. Added `*.db`, `*.db-journal`, `*.db-wal`, `*.db-shm` to `backend/.gitignore`.

No other hardcoded secrets, API keys, or tokens were found anywhere in `frontend/` or `backend/` (checked for common key prefixes - `sk-`, `AKIA`, `ghp_` - and for any `print()`/log statement that could leak one).

## 2. Unsafe authentication flows

Already solid, no fix needed:
- Passwords are hashed with PBKDF2-HMAC-SHA256, 260,000 iterations, a random 16-byte salt per password (`app/services/security.py`) - in line with OWASP's 2023 minimum guidance.
- Password verification uses `hmac.compare_digest()` - constant-time, not vulnerable to a timing attack.
- Session tokens are `secrets.token_urlsafe(32)` - cryptographically random, opaque, and revocable server-side by deleting the row (not a JWT - see item 12).
- Login failures return the same "Incorrect email or password" message whether the email doesn't exist or the password is wrong, so the endpoint can't be used to enumerate which emails have accounts.

**Fixed:** none of `/api/auth/login`, `/api/auth/signup`, or `/api/auth/demo` had any rate limiting - an unauthenticated caller could hammer login with password guesses, mass-create signup accounts, or (now that Demo Mode exists) spam `/api/auth/demo`, which creates a real database row plus two seeded conversations on every single call. Added a small dependency-free in-memory rate limiter (`app/services/rate_limit.py`, matching this project's existing stdlib-first approach - no new package) keyed on client IP: login and signup allow 10 requests/minute, demo allows 5/minute. Over the limit returns `429` with the same `{field, message}` shape every other auth error already uses, so the existing frontend error handling shows it as a normal message with no frontend changes needed. Verified: the 11th login attempt and the 6th demo request within a minute both correctly return 429; normal use (well under those limits) is unaffected.

## 3. Missing authorization checks

Already solid, no fix needed. Every route that touches user-owned data (`/api/chats`, `/api/chats/{id}`, `/api/chat`, `/api/auth/me`, `/api/auth/preferences`, `/api/auth/stats`) requires a valid session via the `get_current_user` dependency, and every data-layer query that reads or deletes a conversation filters by `WHERE id = ? AND user_id = ?` - never just `WHERE id = ?` (see `app/data/conversation_store.py`). Requesting or deleting a conversation that exists but belongs to someone else returns the same `404` as one that doesn't exist at all, so the endpoint can't be used to distinguish "not yours" from "doesn't exist."

## 4. Input validation

**Fixed:** `ChatRequest.message` (the actual text sent to `/api/chat`) had no length limit at all. Every message is forwarded into the prompt sent to OpenRouter, which is billed per token - an unbounded message was a real money-cost and storage-bloat abuse vector, not just a theoretical one. Added `Field(min_length=1, max_length=4000)` - 4000 characters is far beyond any real question a student would type (`ChatInput.tsx` never needed a client-side cap because nobody hits this in practice), so this only rejects abuse, not legitimate use. Verified an oversized message now returns `422`; a normal message still returns `200`.

**Fixed:** `full_name`, `registration_number`, `email`, and `password` on signup/login, and `full_name`, `department`, `year`, `hostel` on profile updates, had no upper bound either (`bio` already had one - a 500-character cap enforced in `auth_service.py` with its own friendly error message, left untouched). Added generous `max_length` values to each (100 for names, 254 for email per RFC 5321, 128 for password, 32 for registration number) - all comfortably above anything a real user would enter. Deliberately did **not** add a matching `min_length` everywhere: `full_name`, `department`, and `year` already get their own "X is required" message from `auth_service.py` when empty, and adding a stricter schema-level floor would have intercepted that with a generic error instead - so those three keep exactly their current behavior for legitimate use, and only gained a ceiling.

## 5. SQL injection risks

None found. Checked every query across `app/data/*.py` (auth, users, sessions, conversations, messages, knowledge base) - all are parameterized with `?` placeholders and a tuple of bound values; none build SQL by string concatenation or f-string interpolation of request data. This was true before this audit and remains true.

## 6. XSS risks

None found. `dangerouslySetInnerHTML` appears exactly once in the entire frontend (`app/layout.tsx`, the theme-init script) and its content is a hardcoded constant, never interpolated with user or API data. No `.innerHTML` assignment, no `eval()`/`new Function()` anywhere. The chat message renderer (`components/chat/ChatMessage.tsx`) parses its own limited markdown subset into React elements via string matching, not by converting to HTML - React's normal text-node escaping applies to every bit of chat content, including LLM-generated answers, so nothing rendered there can execute as markup.

## 7. CSRF considerations

Low residual risk by design, no fix needed. Every authenticated request in this app authenticates via an explicit `Authorization: Bearer <token>` header, set individually in each `fetch()` call (`lib/auth.ts`, `lib/chat.ts`) - never a cookie, and no request anywhere uses `credentials: "include"`. Classic CSRF relies on the browser *automatically* attaching credentials (cookies) to a cross-site request; a bearer token that JavaScript has to explicitly read from storage and attach isn't sent automatically by the browser to anyone, so a malicious third-party page can't forge an authenticated request just by getting a logged-in user to visit it.

**Fixed (defense in depth):** CORS had `allow_credentials=True` set, which is meaningless here since nothing uses cookie/credentialed requests - it was just unused attack surface. Set to `False` in `main.py`. Verified via test client: the CORS preflight response no longer includes `Access-Control-Allow-Credentials` at all.

## 8. Sensitive error messages

Already solid, no fix needed. FastAPI's app is never constructed with `debug=True`, and there's no `reload=True` in how it's run - an unhandled exception returns a generic `Internal Server Error`, not a stack trace (confirmed empirically while testing: a real bug during Demo Mode development produced exactly that generic response, nothing more). Every auth-specific error (`AuthError` and its subclasses) carries a pre-written, safe-to-show message - never a raw exception string. OpenRouter failures (timeout, HTTP error, malformed response) are all caught in `answer_generator.py` and replaced with generic, safe messages before reaching the client; the real error detail is only ever `print()`-ed server-side.

**Fixed:** added a small `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: same-origin` response-header middleware in `main.py`. These have no effect on any legitimate request/response but close off MIME-sniffing, clickjacking, and URL-leak-via-referrer as attack classes at zero functional cost.

## 9. Unsafe localStorage usage

**Documented, not changed.** The session token and user profile are stored in `localStorage` (`lib/auth.ts`), not an `httpOnly` cookie - meaning if an XSS vulnerability were ever introduced elsewhere in the app, an attacker's script could read the token directly. Given item 6 found zero XSS sinks anywhere in the current codebase, this isn't an active vulnerability today, but it's a real architectural trade-off worth naming rather than silently accepting: moving to `httpOnly` cookies would mean adding CSRF protection (item 7's current mitigation depends specifically on *not* using cookies) and changing how every `fetch()` call authenticates - a genuine backend/frontend architecture change, not a contained fix, and out of scope for "don't change user-facing functionality." Recommend keeping this in mind if the app ever adds a feature that renders less-trusted content (e.g. displaying raw HTML from an external source) without review.

## 10. CORS configuration

Already reasonably locked down - `allow_origins` is the single real frontend origin (`http://localhost:3000`), never `"*"`. Tightened `allow_credentials` to `False` (see item 7) since it was unused.

## 11. JWT validation

Not applicable - this app deliberately does not use JWTs. Sessions are opaque, random, server-side-revocable tokens (see item 2) looked up against a `sessions` table on every request. This sidesteps an entire class of JWT-specific bugs (algorithm confusion/`alg: none`, missing signature verification, accepting an expired token because `exp` wasn't checked) by construction, since there's no token structure or signature to mis-validate in the first place - expiry is checked server-side against the stored `expires_at` column, and an expired session is deleted on next use.

## 12. Secure password handling

Already solid, no fix needed - see item 2 for the hashing details. One related, deliberate design choice worth noting: `email` and `registration_number` are not editable through any endpoint (checked - no code path allows it), and there is currently no password-change endpoint at all (the Settings page's "Change Password" button shows an honest "not built yet" message rather than a dead control that looks functional). This means there is currently no attack surface at all for credential-mutation endpoints, demo accounts included - not because Demo Mode specifically blocks it, but because the feature doesn't exist yet for any account.

## Files changed in this pass

- `backend/.gitignore` - added `*.db`/`*.db-journal`/`*.db-wal`/`*.db-shm`
- `backend/main.py` - CORS `allow_credentials` tightened, added security-headers middleware
- `backend/app/schemas/chat.py` - `ChatRequest.message` length bounds
- `backend/app/schemas/auth.py` - length bounds on signup/login/profile fields
- `backend/app/services/rate_limit.py` (new) - in-memory rate limiter
- `backend/app/api/auth.py` - rate limiting wired into signup, login, demo

Verified with `python -m py_compile` on every changed backend file, and with an in-process test client exercising: security headers present, CORS credentials header absent, oversized/empty chat messages rejected with `422`, a normal chat message still succeeds, oversized signup fields rejected with `422`, and both the login and demo rate limits trigger `429` at exactly their configured thresholds while requests under the limit succeed normally. `tsc --noEmit` confirmed clean (no frontend files were changed in this pass).
