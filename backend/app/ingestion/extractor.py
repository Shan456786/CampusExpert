"""
Main-content extraction for one crawled HTML page.

Uses trafilatura (https://trafilatura.readthedocs.io/) to decide what part
of a page's HTML is real content versus navigation/header/footer/cookie
banners/ads (requirement 4). That's a genuinely hard problem with a lot of
accumulated edge-case handling behind it, so this wraps a proven library
instead of hand-rolling boilerplate-stripping heuristics from scratch -
verified directly against a synthetic page with a nav bar, a cookie banner,
and a footer before writing this file; all three were correctly dropped
and only the <main> content survived.

trafilatura's XML output tags headings found within the kept content as
<head> elements, interleaved in document order with <p>/<item>/<cell>
elements - exactly the structure needed to split a page into
(section_heading, section_text) pairs (requirement 8) without a second,
separate heading-detection pass over the raw HTML.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from xml.etree import ElementTree

import trafilatura

# Tags trafilatura's XML output uses for anything that carries readable
# body text. "head" is handled separately below (it starts a new section
# rather than adding to one).
_TEXT_TAGS = {"p", "item", "cell", "quote"}


@dataclass
class ExtractedSection:
    heading: str  # "" if this text isn't under any heading (e.g. an intro
    #                paragraph appearing before the page's first heading)
    text: str


@dataclass
class ExtractedPage:
    url: str
    title: str
    sections: list[ExtractedSection]


def extract_page(url: str, html: str) -> ExtractedPage | None:
    """Return the page's title and its content split into heading-anchored
    sections, or None if there wasn't enough real content worth keeping
    (a page that's entirely navigation, a redirect stub, or an error page
    some sites return with a 200 status)."""
    xml_output = trafilatura.extract(
        html,
        url=url,
        output_format="xml",
        include_comments=False,
        include_tables=True,
        with_metadata=True,
        favor_precision=True,  # when in doubt, drop it rather than keep it -
        # a missed sentence costs less than a chunk of leftover nav-menu
        # text ending up in front of Gemma as "evidence"
    )
    if not xml_output:
        return None

    try:
        root = ElementTree.fromstring(xml_output)
    except ElementTree.ParseError:
        return None

    main = root.find("main")
    if main is None:
        return None

    title = root.get("title") or _fallback_title(html) or url

    sections: list[ExtractedSection] = []
    current_heading = ""
    current_paragraphs: list[str] = []

    def flush() -> None:
        text = "\n\n".join(p for p in current_paragraphs if p.strip())
        if text.strip():
            sections.append(ExtractedSection(heading=current_heading, text=text))

    for element in main.iter():
        tag = element.tag
        text = "".join(element.itertext()).strip()

        if tag == "head":
            flush()
            current_heading = text
            current_paragraphs = []
        elif tag in _TEXT_TAGS and text:
            current_paragraphs.append(text)

    flush()

    if not sections:
        return None

    return ExtractedPage(url=url, title=title, sections=sections)


def _fallback_title(html: str) -> str | None:
    """trafilatura usually fills in a title from the page's <title> tag or
    its top heading, but fall back to a bare regex scrape of <title> if it
    somehow didn't, so a real page is never left with an empty title."""
    match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if match:
        return re.sub(r"\s+", " ", match.group(1)).strip()
    return None
