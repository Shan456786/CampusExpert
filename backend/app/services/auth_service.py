"""
Business logic for signup, login, session lookup, and logout.

Sits between app/api/auth.py (HTTP layer) and app/data/user_store.py
(SQLite access) - the same layering hybrid_retriever.py/knowledge.py
already use for chat. This module raises small, specific exceptions
(ValidationError, DuplicateEmailError, ...) that app/api/auth.py catches
and turns into the right HTTP status code; nothing here knows about
FastAPI, HTTP, or request/response objects, so it's directly unit-testable
on its own.
"""

from __future__ import annotations

import json
import re
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.data import conversation_store, user_store
from app.services.security import generate_session_token, hash_password, verify_password

# Same rules the frontend already validates client-side (signup/login
# pages). Re-checked here because client-side validation is a UX
# convenience, never a security boundary - a request that bypasses the
# frontend entirely (curl, Postman, a modified page) must still be
# rejected by the same rules.
_EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_REGISTRATION_PATTERN = re.compile(r"^[A-Za-z0-9]{6,}$")
_MIN_PASSWORD_LENGTH = 6

# How long an issued session stays valid before /api/auth/me starts
# rejecting it. A student project doesn't need refresh tokens - a week is
# long enough that a student isn't re-logging-in constantly, short enough
# that a stolen/leaked token doesn't stay useful indefinitely.
_SESSION_TTL_HOURS = 24 * 7

# Demo sessions get a much shorter leash than a real login - a visitor
# trying the product in one sitting doesn't need a week-long token, and a
# short TTL is also the backstop that eventually reclaims a demo account
# whose visitor closed the tab instead of logging out (see
# user_store.sweep_expired_demo_users(), which treats "every session for
# this demo user has expired" as "this demo user is abandoned").
_DEMO_SESSION_TTL_HOURS = 4


class AuthError(Exception):
    """Base class for expected auth failures. Always carries `field` (a
    frontend FormErrors key, or None for a form-level/general error) and
    `message` (safe to show the user), which app/api/auth.py reads to
    build the HTTP error response."""

    field: str | None
    message: str

    def __init__(self, field: str | None, message: str):
        super().__init__(message)
        self.field = field
        self.message = message


class ValidationError(AuthError):
    pass


class DuplicateEmailError(AuthError):
    def __init__(self):
        super().__init__("email", "An account with this email already exists.")


class DuplicateRegistrationNumberError(AuthError):
    def __init__(self):
        super().__init__(
            "registrationNumber",
            "An account with this registration number already exists.",
        )


class InvalidCredentialsError(AuthError):
    def __init__(self):
        # Deliberately the same message whether the email doesn't exist or
        # the password is wrong - telling a caller which one is true is an
        # account-enumeration leak.
        super().__init__(None, "Incorrect email or password.")


class SessionInvalidError(AuthError):
    def __init__(self):
        super().__init__(None, "Session is invalid or has expired.")


@dataclass
class PublicUser:
    """Everything about a user that's safe to hand back to the frontend -
    notably, no password_hash. department/year/hostel/bio are the editable
    profile fields added for the Profile page; all four are nullable
    because a freshly signed-up user hasn't filled them in yet."""

    id: int
    full_name: str
    registration_number: str
    email: str
    created_at: str
    department: str | None = None
    year: str | None = None
    hostel: str | None = None
    bio: str | None = None
    preferences: dict = field(default_factory=dict)
    last_login_at: str | None = None
    # True only for accounts created by POST /api/auth/demo. The frontend
    # uses this to show a "Demo Mode" indicator and to lock the couple of
    # account actions that don't make sense for a throwaway account (see
    # app/settings/page.tsx's handleChangePassword/handleDeleteAccount) -
    # everything else (chat, profile edits, settings) works identically to
    # a real account, since a demo user IS a real, fully authenticated row
    # for the duration of its session.
    is_demo: bool = False


def _parse_preferences(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        # Corrupt/unparseable JSON already in the database (should never
        # happen through update_preferences() below, which always writes
        # json.dumps() output) - fail safe to "no preferences" rather than
        # 500ing every /api/auth/me call for this user.
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _row_to_public_user(row) -> PublicUser:
    return PublicUser(
        id=row["id"],
        full_name=row["full_name"],
        registration_number=row["registration_number"],
        email=row["email"],
        created_at=row["created_at"],
        department=row["department"],
        year=row["year"],
        hostel=row["hostel"],
        bio=row["bio"],
        preferences=_parse_preferences(row["preferences_json"]),
        last_login_at=row["last_login_at"],
        is_demo=bool(row["is_demo"]),
    )


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _normalize_registration_number(registration_number: str) -> str:
    return registration_number.strip().upper()


def signup(
    full_name: str, registration_number: str, email: str, password: str
) -> tuple[PublicUser, str]:
    full_name = full_name.strip()
    email = _normalize_email(email)
    registration_number = _normalize_registration_number(registration_number)

    if not full_name:
        raise ValidationError("fullName", "Full name is required.")
    if not _REGISTRATION_PATTERN.match(registration_number):
        raise ValidationError(
            "registrationNumber", "Enter a valid registration number."
        )
    if not _EMAIL_PATTERN.match(email):
        raise ValidationError("email", "Enter a valid email address.")
    if len(password) < _MIN_PASSWORD_LENGTH:
        raise ValidationError(
            "password",
            f"Password must be at least {_MIN_PASSWORD_LENGTH} characters.",
        )

    # Checked explicitly (not just relying on the UNIQUE index + catching
    # IntegrityError) so each case gets its own field-specific message -
    # see auth_db.py's docstring: the index is still the real guarantee
    # against a race between two simultaneous signups.
    if user_store.get_user_by_email(email) is not None:
        raise DuplicateEmailError()
    if user_store.get_user_by_registration_number(registration_number) is not None:
        raise DuplicateRegistrationNumberError()

    password_hash = hash_password(password)
    row = user_store.create_user(
        full_name=full_name,
        registration_number=registration_number,
        email=email,
        password_hash=password_hash,
    )
    # Signing up counts as the first login - stamps last_login_at instead
    # of leaving it NULL until some later explicit login.
    row = user_store.touch_last_login(row["id"])
    user = _row_to_public_user(row)
    token = _issue_session(user.id)
    return user, token


def authenticate(email: str, password: str) -> tuple[PublicUser, str]:
    email = _normalize_email(email)
    row = user_store.get_user_by_email(email)

    if row is None or not verify_password(password, row["password_hash"]):
        raise InvalidCredentialsError()

    row = user_store.touch_last_login(row["id"])
    user = _row_to_public_user(row)
    token = _issue_session(user.id)
    return user, token


def _issue_session(user_id: int, ttl_hours: int = _SESSION_TTL_HOURS) -> str:
    token = generate_session_token()
    user_store.create_session(user_id=user_id, token=token, ttl_hours=ttl_hours)
    return token


# Seed content for a fresh demo account's conversation history - built from
# the same real, sourced VIT-AP facts the live knowledge base itself would
# answer with (see backend/app/data/knowledge/library.json and
# hostel.json), so a visitor's sidebar shows realistic, already-finished
# conversations with real source citations the moment "Try Demo" lands
# them in /chat, rather than an empty state. Any NEW question a demo
# visitor types still goes through the real POST /api/chat pipeline and
# real retrieval exactly like any other signed-in user - this only seeds
# the scrollback, never the live chat behavior, which is what actually
# demonstrates "knowledge base access" as a working feature rather than a
# canned response.
_DEMO_CONVERSATIONS: list[dict] = [
    {
        "title": "Library timings",
        "turns": [
            ("user", "What time does the library open?", []),
            (
                "assistant",
                "The VIT-AP University Library is open from 9:00 AM to 7:30 PM "
                "on working days, and from 9:00 AM to 5:00 PM on Sundays, "
                "Mondays, and other holidays.",
                [
                    {
                        "id": "library_hours",
                        "title": "Library Hours",
                        "category": "library",
                        "source_type": "official",
                        "source_url": "https://vitap.ac.in/newlibrary",
                        "last_updated": "2026-07-28",
                    }
                ],
            ),
            ("user", "Is it open on Sundays too?", []),
            (
                "assistant",
                "Yes - on Sundays, Mondays, and other holidays it's open "
                "9:00 AM to 5:00 PM, a shorter window than the 9:00 AM-7:30 PM "
                "hours on regular working days.",
                [
                    {
                        "id": "library_hours",
                        "title": "Library Hours",
                        "category": "library",
                        "source_type": "official",
                        "source_url": "https://vitap.ac.in/newlibrary",
                        "last_updated": "2026-07-28",
                    }
                ],
            ),
        ],
    },
    {
        "title": "Hostel facilities",
        "turns": [
            ("user", "What are the hostel rooms like?", []),
            (
                "assistant",
                "VIT-AP hostels are secured, warden-staffed facilities for "
                "VITians only. Rooms include a cot, chair, study table, and "
                "cupboard, with both AC and non-AC options allotted "
                "first-come-first-served. Hostels also have a night canteen, "
                "indoor games, Wi-Fi, laundry service, and provision stores.",
                [
                    {
                        "id": "hostel_overview",
                        "title": "Hostel Facilities",
                        "category": "hostel",
                        "source_type": "official",
                        "source_url": "https://vitap.ac.in/hostels",
                        "last_updated": "2026-07-25",
                    }
                ],
            ),
            ("user", "How much does it cost?", []),
            (
                "assistant",
                "There's a non-refundable hostel admission fee of Rs. 15,000, "
                "plus a refundable caution deposit of Rs. 15,000. The hostel "
                "fee covers room, mess, and laundry (up to 44 washes over 10 "
                "months) and is paid online.",
                [
                    {
                        "id": "hostel_fees",
                        "title": "Hostel and Mess Fee Structure",
                        "category": "hostel",
                        "source_type": "official",
                        "source_url": "https://vitap.ac.in/hostels",
                        "last_updated": "2026-07-25",
                    }
                ],
            ),
        ],
    },
]

# Sample Settings-page state for a fresh demo account - a real signup
# leaves preferences_json as '{}' (see auth_db.py's docstring) until the
# student saves Settings for the first time; a demo account skips straight
# to a populated, "lived-in" Settings page instead, matching the "load
# sample settings" requirement. Keys/shape mirror exactly what
# auth_service.update_preferences() itself writes, so there's no
# special-case parsing anywhere else in the app.
_DEMO_PREFERENCES: dict = {
    "theme": "dark",
    "font_size": "medium",
    "notifications": {
        "email": True,
        "aiReply": True,
        "announcements": True,
        "placement": True,
        "hostel": True,
    },
    "sound_enabled": True,
}


def _seed_demo_conversations(user_id: int) -> None:
    for conversation in _DEMO_CONVERSATIONS:
        row = conversation_store.create_conversation(
            user_id=user_id, title=conversation["title"]
        )
        for role, content, sources in conversation["turns"]:
            conversation_store.add_message(
                conversation_id=row["id"],
                role=role,
                content=content,
                sources_json=json.dumps(sources),
            )
        conversation_store.touch_conversation(row["id"])


def create_demo_session() -> tuple[PublicUser, str]:
    """Creates a brand-new, fully self-contained demo account - a real
    users row (is_demo=1), a populated sample profile, sample settings,
    a couple of seeded sample conversations, and a session token - and
    returns the same (PublicUser, token) shape signup()/authenticate() do,
    so app/api/auth.py's POST /api/auth/demo can return the exact same
    AuthResponse shape as /signup and /login and the frontend can reuse
    storeSession() unchanged.

    Runs a best-effort sweep of abandoned demo accounts first (see
    user_store.sweep_expired_demo_users()) - cheap cleanup opportunity
    that keeps auth.db from accumulating demo rows from visitors who
    closed the tab instead of logging out."""
    user_store.sweep_expired_demo_users()

    # secrets.token_hex(6) is plenty of entropy to make a collision with
    # any other still-live demo account practically impossible, so this
    # doesn't need a retry-on-IntegrityError loop the way a real signup
    # form's email/registration-number fields would.
    suffix = secrets.token_hex(6)
    email = f"demo-{suffix}@demo.campusexpert.local"
    registration_number = f"DEMO{suffix.upper()}"
    # Nobody ever needs to type this password - it only exists because
    # password_hash is NOT NULL - so it's a random value nobody is ever
    # told, not a real credential.
    password_hash = hash_password(secrets.token_urlsafe(24))

    row = user_store.create_demo_user(
        full_name="Demo Student",
        registration_number=registration_number,
        email=email,
        password_hash=password_hash,
        department="Computer Science & Engineering",
        year="3rd Year",
        hostel="On-campus Hostel",
        bio="Just exploring Campus Expert in demo mode!",
        preferences_json=json.dumps(_DEMO_PREFERENCES),
    )
    row = user_store.touch_last_login(row["id"])
    user = _row_to_public_user(row)

    _seed_demo_conversations(user.id)

    token = _issue_session(user.id, ttl_hours=_DEMO_SESSION_TTL_HOURS)
    return user, token


_MAX_BIO_LENGTH = 500


def update_profile(
    user_id: int,
    full_name: str,
    department: str,
    year: str,
    hostel: str | None,
    bio: str | None,
) -> PublicUser:
    """Update the editable Profile page fields for an already-authenticated
    user. Email and registration_number are NOT parameters here on
    purpose: email is the login identifier and registration_number is
    checked for uniqueness at signup (see the DuplicateRegistrationNumberError
    it can raise there) - letting either change silently through a profile
    edit would be a bigger feature (re-verifying uniqueness, and for email,
    probably re-confirming ownership) than "edit your profile" asked for.
    Hostel and bio are optional per the Profile page spec; full_name,
    department, and year are required the same way they are at signup."""
    full_name = full_name.strip()
    department = department.strip()
    year = year.strip()
    hostel = hostel.strip() if hostel else None
    bio = bio.strip() if bio else None

    if not full_name:
        raise ValidationError("fullName", "Full name is required.")
    if not department:
        raise ValidationError("department", "Department is required.")
    if not year:
        raise ValidationError("year", "Year is required.")
    if bio and len(bio) > _MAX_BIO_LENGTH:
        raise ValidationError(
            "bio", f"Bio must be {_MAX_BIO_LENGTH} characters or fewer."
        )

    row = user_store.update_user_profile(
        user_id,
        full_name=full_name,
        department=department,
        year=year,
        hostel=hostel or None,
        bio=bio or None,
    )
    return _row_to_public_user(row)


_VALID_THEMES = {"light", "dark", "system"}
_VALID_FONT_SIZES = {"small", "medium", "large"}


def update_preferences(
    user_id: int,
    theme: str,
    font_size: str,
    notifications: dict,
    sound_enabled: bool,
) -> PublicUser:
    """Update the Settings page preferences for an already-authenticated
    user. Unlike update_profile() above, this always writes a complete
    preferences object - the frontend Settings page always submits its
    full current state (see ProfileUpdateRequest's sibling
    PreferencesUpdateRequest), so there's no partial-update case to
    reconcile here."""
    if theme not in _VALID_THEMES:
        raise ValidationError("theme", f"Theme must be one of {sorted(_VALID_THEMES)}.")
    if font_size not in _VALID_FONT_SIZES:
        raise ValidationError(
            "fontSize", f"Font size must be one of {sorted(_VALID_FONT_SIZES)}."
        )
    if not isinstance(notifications, dict) or not all(
        isinstance(value, bool) for value in notifications.values()
    ):
        raise ValidationError("notifications", "Notifications must be true/false values.")

    preferences = {
        "theme": theme,
        "font_size": font_size,
        "notifications": notifications,
        "sound_enabled": bool(sound_enabled),
    }
    row = user_store.update_user_preferences(user_id, json.dumps(preferences))
    return _row_to_public_user(row)


def get_account_stats(user_id: int) -> dict:
    """Real counts for the Profile page's Account Statistics section -
    conversation_count and question_count come straight from
    conversation_store's tables, computed on every call rather than
    cached, so they're always correct and never a fabricated/placeholder
    number. See conversation_store.get_user_stats()'s docstring for why
    "chats" and "questions asked" are two different numbers."""
    return conversation_store.get_user_stats(user_id)


def get_user_from_token(token: str) -> PublicUser:
    """Resolve a bearer token to the signed-in user, or raise
    SessionInvalidError if it doesn't exist or has expired. An expired
    session is deleted here (lazy cleanup on next use) rather than left
    behind."""
    row = user_store.get_session_with_user(token)
    if row is None:
        raise SessionInvalidError()

    expires_at = datetime.fromisoformat(row["session_expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) >= expires_at:
        user_store.delete_session(token)
        raise SessionInvalidError()

    return _row_to_public_user(row)


def logout(token: str) -> None:
    """Deletes the session row - the token stops working immediately for
    every future request, not just on this device. Idempotent: deleting a
    token that's already gone is a silent no-op, not an error.

    If this token belonged to a demo account, the whole account is
    removed too - users row, sessions, conversations, and messages (see
    user_store.delete_user_cascade()) - which is what makes a demo account
    'disappear after logout' rather than just becoming an unreachable
    orphan row. Looked up before the session is deleted so there's still a
    row to check is_demo on."""
    row = user_store.get_session_with_user(token)
    user_store.delete_session(token)
    if row is not None and row["is_demo"]:
        user_store.delete_user_cascade(row["id"])
