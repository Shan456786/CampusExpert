from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.schemas.auth import (
    AccountStats,
    AuthResponse,
    LoginRequest,
    PreferencesUpdateRequest,
    ProfileUpdateRequest,
    SignupRequest,
    UserPublic,
)
from app.services import auth_service
from app.services.auth_service import (
    AuthError,
    DuplicateEmailError,
    DuplicateRegistrationNumberError,
    InvalidCredentialsError,
    PublicUser,
    SessionInvalidError,
    ValidationError,
)
from app.services.rate_limit import enforce_rate_limit

router = APIRouter()


def _to_user_public(user: PublicUser) -> UserPublic:
    return UserPublic(
        id=user.id,
        full_name=user.full_name,
        registration_number=user.registration_number,
        email=user.email,
        created_at=user.created_at,
        department=user.department,
        year=user.year,
        hostel=user.hostel,
        bio=user.bio,
        preferences=user.preferences,
        last_login_at=user.last_login_at,
        is_demo=user.is_demo,
    )


def _error_detail(exc: AuthError) -> dict:
    # {field, message} instead of FastAPI's plain-string default detail, so
    # the frontend can route the message to the right form field (e.g.
    # "email" -> the email input's own error text) and fall back to a
    # general banner when field is None. See frontend/lib/auth.ts's
    # parseApiErrorField()/parseApiErrorMessage() - the consumers of this
    # exact shape.
    return {"field": exc.field, "message": exc.message}


def get_current_user(
    authorization: str | None = Header(default=None),
) -> PublicUser:
    """FastAPI dependency: reads `Authorization: Bearer <token>`, resolves
    it to the signed-in user via auth_service, or raises 401. Used by every
    route that needs to know who's calling - currently /api/auth/me, and
    available for any future authenticated route."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail={
                "field": None,
                "message": "Missing or malformed Authorization header.",
            },
        )

    token = authorization.removeprefix("Bearer ").strip()
    try:
        return auth_service.get_user_from_token(token)
    except SessionInvalidError as exc:
        raise HTTPException(status_code=401, detail=_error_detail(exc)) from exc


@router.post("/auth/signup", response_model=AuthResponse, status_code=201)
def signup(request: SignupRequest, http_request: Request):
    # Before any password hashing or DB write - see rate_limit.py's
    # docstring for why this has to run first, not after the real work.
    enforce_rate_limit("signup", http_request, max_requests=10, window_seconds=60)
    try:
        user, token = auth_service.signup(
            full_name=request.full_name,
            registration_number=request.registration_number,
            email=request.email,
            password=request.password,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=_error_detail(exc)) from exc
    except (DuplicateEmailError, DuplicateRegistrationNumberError) as exc:
        raise HTTPException(status_code=409, detail=_error_detail(exc)) from exc

    return AuthResponse(user=_to_user_public(user), token=token)


@router.post("/auth/login", response_model=AuthResponse)
def login(request: LoginRequest, http_request: Request):
    # Before password verification - the classic brute-force target.
    # Counts every attempt (success or failure) against the same client,
    # not just failures, which is deliberate: a correct password on
    # attempt #11 within the window still waits, exactly like a failed
    # one would, so this can't be used to distinguish "close" guesses
    # from wrong ones by timing how soon the limit kicks in.
    enforce_rate_limit("login", http_request, max_requests=10, window_seconds=60)
    try:
        user, token = auth_service.authenticate(request.email, request.password)
    except InvalidCredentialsError as exc:
        raise HTTPException(status_code=401, detail=_error_detail(exc)) from exc

    return AuthResponse(user=_to_user_public(user), token=token)


@router.post("/auth/demo", response_model=AuthResponse, status_code=201)
def start_demo(http_request: Request):
    """Creates a brand-new demo account (sample profile, sample settings,
    sample conversations, a real session token) and returns it in the
    exact same shape as /signup and /login - see
    auth_service.create_demo_session(). No request body: every visitor who
    clicks "Try Demo" gets their own fresh, isolated account, never a
    shared one."""
    # Tighter than signup/login: this endpoint needs no credentials at
    # all, and every call writes a real user row plus two seeded
    # conversations - the cheapest of the three to abuse into unbounded
    # database growth, so it gets the strictest limit.
    enforce_rate_limit("demo", http_request, max_requests=5, window_seconds=60)
    user, token = auth_service.create_demo_session()
    return AuthResponse(user=_to_user_public(user), token=token)


@router.get("/auth/me", response_model=UserPublic)
def me(current_user: PublicUser = Depends(get_current_user)):
    return _to_user_public(current_user)


@router.patch("/auth/me", response_model=UserPublic)
def update_me(
    request: ProfileUpdateRequest,
    current_user: PublicUser = Depends(get_current_user),
):
    try:
        user = auth_service.update_profile(
            current_user.id,
            full_name=request.full_name,
            department=request.department,
            year=request.year,
            hostel=request.hostel,
            bio=request.bio,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=_error_detail(exc)) from exc

    return _to_user_public(user)


@router.patch("/auth/preferences", response_model=UserPublic)
def update_preferences(
    request: PreferencesUpdateRequest,
    current_user: PublicUser = Depends(get_current_user),
):
    try:
        user = auth_service.update_preferences(
            current_user.id,
            theme=request.theme,
            font_size=request.font_size,
            notifications=request.notifications,
            sound_enabled=request.sound_enabled,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=_error_detail(exc)) from exc

    return _to_user_public(user)


@router.get("/auth/stats", response_model=AccountStats)
def stats(current_user: PublicUser = Depends(get_current_user)):
    counts = auth_service.get_account_stats(current_user.id)
    return AccountStats(
        conversation_count=counts["conversation_count"],
        question_count=counts["question_count"],
        member_since=current_user.created_at,
        last_login=current_user.last_login_at,
    )


@router.post("/auth/logout")
def logout(authorization: str | None = Header(default=None)):
    # Deliberately lenient: logging out with no token, or a token that's
    # already invalid/expired, is a no-op rather than an error - the end
    # state the caller wants (no active session) is already true.
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        auth_service.logout(token)
    return {"message": "Logged out."}
