from pydantic import BaseModel, Field


# Request body for POST /api/auth/signup. Plain `str` fields (not
# pydantic's EmailStr) on purpose - EmailStr needs the extra
# `email-validator` package, and app/services/auth_service.py already
# re-validates the email format itself (see that module's docstring on why
# client/schema-level validation isn't a substitute for the service-layer
# check). Keeping this dependency-free matches the same reasoning behind
# using stdlib PBKDF2 instead of bcrypt in app/services/security.py.
class SignupRequest(BaseModel):
    # Generous upper bounds, not a UX limit - no real student's name,
    # registration number, or email is anywhere near these, and
    # app/services/auth_service.py already does the real
    # format/uniqueness/strength validation with field-specific error
    # messages (see that module's docstring). These are only a backstop
    # against literally unbounded input reaching the database or the
    # password hasher (see security.py's hash_password() - PBKDF2's cost
    # scales with input size, so an unbounded password is a cheap way to
    # waste server time, not just a storage concern).
    # full_name has no min_length: auth_service.signup() already has its
    # own "Full name is required." message for an empty value, and a
    # schema-level floor would only intercept that exact case with a
    # generic 422 first.
    full_name: str = Field(max_length=100)
    registration_number: str = Field(min_length=1, max_length=32)
    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=128)


# Request body for POST /api/auth/login
class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=128)


# Safe-to-return user fields - no password_hash. Mirrors
# app/services/auth_service.PublicUser field-for-field. The last four are
# the editable Profile page fields - all optional/nullable because a
# freshly signed-up user hasn't filled them in yet.
class UserPublic(BaseModel):
    id: int
    full_name: str
    registration_number: str
    email: str
    created_at: str
    department: str | None = None
    year: str | None = None
    hostel: str | None = None
    bio: str | None = None
    # Settings page preferences as one JSON object - {} until the user has
    # ever saved settings. See auth_service.update_preferences()'s
    # docstring for why this is a blob instead of one column per setting.
    preferences: dict = Field(default_factory=dict)
    # Set on every successful signup/login (see user_store.touch_last_login()).
    # None only for a row created before this column existed that hasn't
    # logged in again since.
    last_login_at: str | None = None
    # True only for accounts created by POST /api/auth/demo - see
    # app/services/auth_service.py's create_demo_session(). Drives the
    # frontend's "Demo Mode" indicator and credential-editing lock.
    is_demo: bool = False


# Response body for both POST /api/auth/signup and POST /api/auth/login -
# the new/authenticated user plus the session token the frontend should
# store and send back as `Authorization: Bearer <token>`.
class AuthResponse(BaseModel):
    user: UserPublic
    token: str


# Request body for PATCH /api/auth/me. Deliberately excludes email and
# registration_number - see auth_service.update_profile()'s docstring for
# why those stay read-only from this endpoint. hostel and bio are
# optional; full_name, department, and year are required (validated again
# in auth_service.update_profile(), same client/schema-isn't-enough
# reasoning as SignupRequest above).
class ProfileUpdateRequest(BaseModel):
    # max_length only, deliberately no min_length here (unlike
    # SignupRequest above): auth_service.update_profile() already strips
    # and requires full_name/department/year with its own friendly,
    # field-specific "X is required" message, and bio gets its own
    # _MAX_BIO_LENGTH check there too. Adding a stricter schema-level
    # floor/cap on top would just intercept those cases with a generic
    # 422 instead, before the nicer existing message ever runs - these
    # max_lengths are a pure backstop against values nothing currently
    # checks at all, not a replacement for that layer.
    full_name: str = Field(max_length=100)
    department: str = Field(max_length=100)
    year: str = Field(max_length=20)
    hostel: str | None = Field(default=None, max_length=100)
    bio: str | None = None


# Request body for PATCH /api/auth/preferences. A separate endpoint/schema
# from ProfileUpdateRequest on purpose - these are Settings page fields
# (appearance + notification preferences), not identity fields, and always
# submitted as a full snapshot (see auth_service.update_preferences()).
class PreferencesUpdateRequest(BaseModel):
    theme: str
    font_size: str
    notifications: dict[str, bool] = Field(default_factory=dict)
    sound_enabled: bool = True


# Response body for GET /api/auth/stats - the Profile page's Account
# Statistics section. Every field here is a real, computed value (see
# auth_service.get_account_stats() and conversation_store.get_user_stats());
# there is no field for "resources viewed" or "saved conversations" because
# Campus Expert doesn't track either yet - the frontend simply doesn't
# render a stat for something this endpoint doesn't report, rather than
# this schema inventing a fake zero for it.
class AccountStats(BaseModel):
    conversation_count: int
    question_count: int
    member_since: str
    last_login: str | None = None
