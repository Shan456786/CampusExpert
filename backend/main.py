import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.conversations import router as conversations_router
from app.services.knowledge_retriever import warm_up


# Create the FastAPI application
app = FastAPI(
    title="Campus Expert API",
    description="Backend API for the Campus Expert VIT AP student assistant",
    version="1.0.0",
)


# Allow the Next.js frontend to communicate with FastAPI. Still locked
# down (never "*") since every request already proves who it's from via
# the Authorization: Bearer <token> header - see app/services/security.py's
# session tokens - but the allow-list covers three separate cases now:
#
#   1. http://localhost:3000 and http://127.x.x.x:3000 - running the
#      frontend locally with `npm run dev`.
#   2. http://<private-LAN-IP>:3000 (192.168.0.0/16, 10.0.0.0/8,
#      172.16.0.0/12) - opening that same local dev server from another
#      device on the network, e.g. a phone, for testing on a real screen.
#   3. https://campus-expert.vercel.app - the deployed production
#      frontend on Vercel talking to this deployed backend on Railway.
#      Added after finding the two only had case 1 originally allowed, so
#      every request from the real deployed frontend was being silently
#      rejected before it ever reached a route - the frontend and backend
#      could each be reached directly, but never talk to each other.
#
# allow_origin_regex matches all three. Anything else - the public
# internet generally, any other port, plain http:// to the Vercel host -
# is still rejected.
_ALLOWED_ORIGIN_PATTERN = re.compile(
    r"^("
    r"http://localhost:3000"
    r"|http://127(?:\.\d{1,3}){3}:3000"
    r"|http://192\.168(?:\.\d{1,3}){2}:3000"
    r"|http://10(?:\.\d{1,3}){3}:3000"
    r"|http://172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}:3000"
    r"|https://campus-expert\.vercel\.app"
    r")$"
)

# allow_credentials is deliberately False: it controls whether the browser
# is allowed to send/receive cookies and other "ambient" credentials on a
# cross-origin request, and this app has none of those to send - every
# frontend/lib/auth.ts and lib/chat.ts call authenticates with an explicit
# Authorization header, never `credentials: "include"`. Leaving it True
# would just be unused attack surface (and would additionally forbid ever
# using allow_origins=["*"] later, should that ever be wanted for a public
# read-only route).
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=_ALLOWED_ORIGIN_PATTERN.pattern,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# A handful of standard response headers that cost nothing and have no
# effect on any legitimate request/response this app makes, but close off
# a few well-known browser-side attack classes:
# - X-Content-Type-Options stops a browser from "helpfully" reinterpreting
#   a JSON response as HTML/JS if it ever guesses the content type wrong.
# - X-Frame-Options stops this API's responses from being embedded in a
#   hidden <iframe> on another site (clickjacking).
# - Referrer-Policy keeps the full request URL (which, for this app, never
#   contains secrets - everything sensitive is in the body or an
#   Authorization header, never a query string) from being leaked to a
#   third-party site a response happens to link to.
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


# Register the chat API
app.include_router(
    chat_router,
    prefix="/api",
    tags=["Chat"],
)

# Register the authentication API (signup, login, session lookup, logout)
app.include_router(
    auth_router,
    prefix="/api",
    tags=["Auth"],
)

# Register the chat history API (list/restore/delete saved conversations)
app.include_router(
    conversations_router,
    prefix="/api",
    tags=["Conversations"],
)


# Confirm the knowledge base loaded correctly at server startup, rather
# than silently discovering it's empty on the first real question. No ML
# model to load anymore - retrieval is deterministic keyword matching
# (see app/services/knowledge_retriever.py), so this is just a sanity
# check, not a slow warm-up.
@app.on_event("startup")
def preload_knowledge_base() -> None:
    warm_up()


# Root endpoint
@app.get("/")
def read_root():
    return {
        "message": "Campus Expert API is running",
        "status": "healthy",
    }


# Health check endpoint
@app.get("/health")
def health_check():
    return {"status": "ok"}