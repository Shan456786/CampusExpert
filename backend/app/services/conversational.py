"""
Lightweight, deterministic smalltalk detection for Campus Expert.

WHY THIS EXISTS
----------------
knowledge_retriever.py's keyword matching only knows about campus topics
(mess, hostel, library, ...). A student saying "hi", "thanks!", or "bye"
has zero keyword overlap with any of that, so before this module existed
every one of those messages fell all the way through to chat.py's
out-of-domain fallback ("I don't have verified information about that
yet...") - technically correct, but robotic and unfriendly for a plain
greeting or a "thanks" at the end of a conversation.

This module intercepts messages that are PURELY smalltalk (nothing else
in them worth answering) and returns a natural, varied, canned reply -
no LLM call, no retrieval, no cost, and no chance of hallucination, since
there is nothing to hallucinate about. See classify_smalltalk() /
smalltalk_reply().

It also flags messages that OPEN with a greeting but go on to ask a real
question ("Hi, what time does the library close?"). Those are NOT
intercepted here - the question still needs real retrieval + grounding -
but has_greeting_opener() lets answer_generator.py open its reply with a
brief warm greeting before answering, instead of silently ignoring the
"hi" the student actually typed.
"""

from __future__ import annotations

import random
import re

# ---------------------------------------------------------------------
# Normalization - lowercase, drop apostrophes entirely (so "what's" and
# "whats" normalize the same), replace every other punctuation character
# with a space, then collapse whitespace. Lets the phrase sets below be
# written once in plain, apostrophe-free words.
# ---------------------------------------------------------------------

_PUNCTUATION_PATTERN = re.compile(r"[^\w\s]")


def _normalize(text: str) -> str:
    text = text.lower().replace("'", "")
    text = _PUNCTUATION_PATTERN.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------------
# Category phrase sets - matched against the FULL normalized message, so
# "hi" matches but "hi what are the mess timings" does not (that's a real
# question that happens to open with a greeting - see has_greeting_opener
# below, handled separately).
# ---------------------------------------------------------------------

_GREETING_PHRASES = {
    "hi", "hii", "hiii", "hello", "hey", "heya", "heyy", "yo",
    "good morning", "good afternoon", "good evening", "morning", "evening",
    "namaste", "hola", "sup", "whats up",
}

_HOW_ARE_YOU_PHRASES = {
    "how are you", "how are you doing", "hows it going", "how s it going",
    "how you doing", "how do you do",
}

_THANKS_PHRASES = {
    "thanks", "thank you", "thanks a lot", "thank you so much", "thx",
    "ty", "tysm", "appreciate it", "much appreciated", "thanks so much",
    "great thanks", "ok thanks", "okay thanks",
}

_GOODBYE_PHRASES = {
    "bye", "goodbye", "bye bye", "see you", "see ya", "cya", "take care",
    "gtg", "got to go", "talk later", "see you later",
}

_ACKNOWLEDGEMENT_PHRASES = {
    "ok", "okay", "k", "kk", "cool", "nice", "got it", "gotcha",
    "alright", "great", "awesome", "sounds good", "perfect", "good",
    "fine", "understood", "noted",
}

_IDENTITY_PHRASES = {
    "who are you", "what are you", "what can you do", "what do you do",
    "help", "what is this",
}

_SMALLTALK_CATEGORIES: dict[str, set[str]] = {
    "greeting": _GREETING_PHRASES,
    "how_are_you": _HOW_ARE_YOU_PHRASES,
    "thanks": _THANKS_PHRASES,
    "goodbye": _GOODBYE_PHRASES,
    "acknowledgement": _ACKNOWLEDGEMENT_PHRASES,
    "identity": _IDENTITY_PHRASES,
}

# ---------------------------------------------------------------------
# Reply banks - a few natural variations per category so the assistant
# doesn't say the exact same sentence every single time. random.choice()
# picks one at call time.
# ---------------------------------------------------------------------

_GREETING_REPLIES_FIRST = [
    "Hey! I'm Campus Expert - ask me anything about VIT-AP, from hostel timings to placements.",
    "Hi there! What would you like to know about campus today?",
    "Hello! Happy to help with anything VIT-AP related - academics, hostel, mess, transport, you name it.",
]

_GREETING_REPLIES_RETURNING = [
    "Hey again! What else can I help with?",
    "Hi! Ready for another question whenever you are.",
    "Hello again! What's next?",
]

_HOW_ARE_YOU_REPLIES = [
    "Doing well, thanks for asking! What can I help you with today?",
    "I'm good! What would you like to know about VIT-AP?",
]

_THANKS_REPLIES = [
    "You're welcome! Let me know if anything else comes up.",
    "Anytime! Happy to help with anything else about campus.",
    "Glad that helped - feel free to ask if you need more.",
]

_GOODBYE_REPLIES = [
    "Take care! Come back anytime you have a campus question.",
    "Bye! I'll be here whenever you need anything else.",
]

_ACKNOWLEDGEMENT_REPLIES = [
    "Sounds good! Anything else you'd like to know?",
    "Got it. Let me know if there's anything else I can help with.",
]

_IDENTITY_REPLY = (
    "I'm Campus Expert, an AI assistant for VIT-AP students. Ask me about "
    "academics, attendance, exams, hostel, mess, transport, campus "
    "services, faculty, medical services, leave, clubs, or placements, "
    "and I'll answer from verified campus information."
)

_REPLY_BANKS: dict[str, list[str]] = {
    "greeting": _GREETING_REPLIES_FIRST,
    "how_are_you": _HOW_ARE_YOU_REPLIES,
    "thanks": _THANKS_REPLIES,
    "goodbye": _GOODBYE_REPLIES,
    "acknowledgement": _ACKNOWLEDGEMENT_REPLIES,
    "identity": [_IDENTITY_REPLY],
}


def classify_smalltalk(message: str) -> str | None:
    """Returns the smalltalk category if `message`, normalized, is ENTIRELY
    one of the known phrases above and nothing else - so a message that
    merely contains a greeting word as part of a real question never
    matches here. Returns None for anything that isn't pure smalltalk,
    which callers should treat as a real question needing retrieval."""
    normalized = _normalize(message)
    if not normalized:
        return None

    for category, phrases in _SMALLTALK_CATEGORIES.items():
        if normalized in phrases:
            return category

    return None


def smalltalk_reply(category: str, *, is_first_message: bool) -> str:
    """Pick a natural reply for `category`. is_first_message tweaks the
    greeting bank slightly - a brand-new conversation's first "hi" gets a
    fuller "here's what I can help with" reply, while a "hi" said again
    mid-conversation gets a shorter "hey again" instead of re-introducing
    the assistant from scratch."""
    if category == "greeting" and not is_first_message:
        return random.choice(_GREETING_REPLIES_RETURNING)
    bank = _REPLY_BANKS.get(category, _GREETING_REPLIES_FIRST)
    return random.choice(bank)


# ---------------------------------------------------------------------
# Greeting-opener detection - for real questions that START with a
# greeting ("hi, what time does the library close?"). Not mutually
# exclusive with classify_smalltalk() returning a category; a caller
# checks classify_smalltalk() first and only checks this if that
# returned None (i.e. there's real question content beyond the greeting).
# ---------------------------------------------------------------------

_GREETING_OPENER_PATTERN = re.compile(
    r"^\s*(hi+|hello+|hey+|good morning|good afternoon|good evening)\b[\s,!.]*",
    re.IGNORECASE,
)


def has_greeting_opener(message: str) -> bool:
    """True if `message` starts with a greeting word followed by more
    content - e.g. "Hi, what are the mess timings?" - so
    answer_generator.py can open its reply with a brief warm greeting
    instead of ignoring the "hi" the student actually typed."""
    match = _GREETING_OPENER_PATTERN.match(message)
    if not match:
        return False
    return bool(_GREETING_OPENER_PATTERN.sub("", message, count=1).strip())
