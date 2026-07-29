"""
Password hashing and session token generation for Campus Expert auth.

PASSWORD HASHING
----------------
Uses PBKDF2-HMAC-SHA256 from Python's stdlib `hashlib` - no bcrypt/argon2
dependency to add. This project already hit real friction installing
compiled dependencies for the ingestion pipeline (trafilatura's lxml
backend); PBKDF2 via hashlib is implemented in C through OpenSSL and ships
with every standard Python install, so signup/login work immediately after
`pip install -r requirements.txt` with nothing new to add there. It's also
NIST/OWASP-endorsed for password storage, provided the iteration count is
high enough - 260,000 here, in line with OWASP's 2023 minimum guidance for
PBKDF2-HMAC-SHA256.

Stored format: "pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>" - the
iteration count is embedded in the hash itself (Django uses the same
convention), so raising _ITERATIONS later doesn't break verification of
passwords hashed under the old count: verify_password() reads whatever
count is stored in each row rather than assuming the current constant.

SESSION TOKENS
---------------
generate_session_token() returns a cryptographically random, unguessable
string via the stdlib `secrets` module - not a JWT. See app/data/auth_db.py's
docstring for why an opaque, server-side-revocable token was chosen instead.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

_ALGORITHM = "pbkdf2_sha256"
_ITERATIONS = 260_000
_SALT_BYTES = 16


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, _ITERATIONS
    )
    return f"{_ALGORITHM}${_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Recompute the hash with the SAME salt and iteration count recorded in
    stored_hash, then compare in constant time. Returns False (never
    raises) for a malformed/foreign hash format, so a corrupted row fails
    closed instead of throwing a 500."""
    try:
        algorithm, iterations_str, salt_hex, digest_hex = stored_hash.split("$")
        if algorithm != _ALGORITHM:
            return False
        iterations = int(iterations_str)
        salt = bytes.fromhex(salt_hex)
        expected_digest = bytes.fromhex(digest_hex)
    except (ValueError, AttributeError):
        return False

    candidate_digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(candidate_digest, expected_digest)


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)
