"""
Minimal in-memory rate limiting for Campus Expert's unauthenticated
endpoints - signup, login, and the demo-session endpoint. These three are
the only routes an anonymous caller can hit with no credentials at all, so
they're the ones a script can hammer in a tight loop: repeated password
guesses against login, mass fake accounts via signup, or (since POST
/api/auth/demo now creates a full real user row plus seeded conversations
on every single call - see auth_service.create_demo_session()) unbounded
database growth via demo.

Deliberately dependency-free (no slowapi/redis) to match this project's
stdlib-first approach elsewhere - see app/services/security.py's docstring
on choosing PBKDF2 over bcrypt for the same reason. A fixed client-IP
keyed sliding window in memory is enough for a single-process student
project; it resets on restart and doesn't coordinate across multiple
server workers, which is a real limitation for a production deployment
but not for how this app actually runs.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

# {(bucket, client_ip): deque[timestamp, ...]} - each deque holds the
# monotonic timestamp of every recent hit for that bucket+client, oldest
# first, so trimming expired entries off the left is O(expired count) not
# O(all history).
_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    # request.client is None in some ASGI test-client setups, never in a
    # real server request - falls back to a shared bucket key rather than
    # crashing, which just means those edge cases share one rate limit
    # instead of being tracked individually.
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(
    bucket: str,
    request: Request,
    *,
    max_requests: int,
    window_seconds: float,
) -> None:
    """Raises 429 if this client has already made >= max_requests to this
    bucket within the last window_seconds; otherwise records this request
    and returns normally. Call this FIRST in a route handler, before any
    real work - password hashing/verification and demo-account seeding
    are exactly the costs this is meant to short-circuit, not something to
    do first and throttle after.

    The 429 body uses the same {field, message} shape every other auth
    error in this app does (see app/api/auth.py's _error_detail()) so the
    frontend's existing parseApiErrorMessage()/parseApiErrorField() surface
    it as a normal form error with no frontend changes needed.
    """
    key = (bucket, _client_ip(request))
    now = time.monotonic()
    hits = _hits[key]

    while hits and now - hits[0] > window_seconds:
        hits.popleft()

    if len(hits) >= max_requests:
        raise HTTPException(
            status_code=429,
            detail={
                "field": None,
                "message": "Too many attempts. Please wait a moment and try again.",
            },
        )

    hits.append(now)
