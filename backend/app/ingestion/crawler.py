"""
Domain-restricted crawler for Campus Expert's knowledge ingestion pipeline.

Takes one or more seed URLs and does a breadth-first crawl, following only
links that stay within the SAME domain(s) as the seeds (requirement 2).
This is the only place in the whole project that fetches pages over the
network - it runs exclusively from ingest.py, never from the
FastAPI chat request path. See app/data/chunk_store.py's docstring for how
that separation is enforced on the read side.

Deliberately simple: synchronous requests with a politeness delay between
them, not async/concurrent. A university's public site is at most a few
hundred pages; the added complexity of concurrent crawling isn't worth it
for a run that happens occasionally, not on every request, and synchronous
code is much easier to debug when a crawl goes wrong partway through.
"""

from __future__ import annotations

import time
import urllib.robotparser
from collections import deque
from dataclasses import dataclass
from urllib.parse import urldefrag, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

USER_AGENT = "CampusExpertBot/1.0 (ingestion crawler; contact: project maintainer)"

# Resource types this crawler doesn't know how to extract text from, so
# there's no point fetching them at all. PDFs may hold real content (e.g.
# admission brochures) but PDF parsing is a separate concern intentionally
# left out of this first pass - see the final report for the follow-up note.
_SKIP_EXTENSIONS = (
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".ico", ".zip",
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".mp4", ".mp3",
    ".css", ".js", ".woff", ".woff2", ".ttf",
)


@dataclass
class CrawledPage:
    url: str
    html: str


def _normalize_url(url: str) -> str:
    """Strip the #fragment (page-internal anchors aren't separate pages)
    and a trailing slash, so the same page reached two different ways
    doesn't get queued or crawled twice."""
    url, _fragment = urldefrag(url)
    if url.endswith("/") and url.count("/") > 3:
        url = url[:-1]
    return url


def _is_allowed_domain(url: str, allowed_domains: set[str]) -> bool:
    return urlparse(url).netloc.lower() in allowed_domains


def _should_skip(url: str) -> bool:
    path = urlparse(url).path.lower()
    return any(path.endswith(ext) for ext in _SKIP_EXTENSIONS)


def _load_robots_parsers(
    allowed_domains: set[str],
) -> dict[str, urllib.robotparser.RobotFileParser]:
    """One robots.txt parser per domain, fetched once up front. If a
    domain's robots.txt can't be fetched, robotparser defaults to
    "crawling allowed" for that domain rather than blocking the whole run
    over a transient network hiccup - but every fetch still checks it, so
    an actual Disallow rule is honored the moment robots.txt IS reachable.
    """
    parsers: dict[str, urllib.robotparser.RobotFileParser] = {}
    for domain in allowed_domains:
        parser = urllib.robotparser.RobotFileParser()
        parser.set_url(f"https://{domain}/robots.txt")
        try:
            parser.read()
        except Exception as exc:  # noqa: BLE001 - robots.txt fetch is best-effort
            print(f"[crawler] Could not fetch robots.txt for {domain}: {exc}")
        parsers[domain] = parser
    return parsers


def crawl(
    seed_urls: list[str],
    *,
    max_pages: int = 200,
    max_depth: int = 4,
    delay_seconds: float = 0.5,
    timeout_seconds: float = 15.0,
) -> list[CrawledPage]:
    """Breadth-first crawl starting from seed_urls, restricted to the exact
    domain(s) of those seed URLs. Returns every successfully-fetched HTML
    page as a CrawledPage; extraction and chunking happen later in the
    pipeline (extractor.py, chunker.py) - this function's only job is
    "which pages exist and what is their raw HTML".
    """
    allowed_domains = {urlparse(url).netloc.lower() for url in seed_urls}
    robots_parsers = _load_robots_parsers(allowed_domains)

    queue: deque[tuple[str, int]] = deque(
        (_normalize_url(u), 0) for u in seed_urls
    )
    seen: set[str] = {url for url, _ in queue}
    pages: list[CrawledPage] = []

    with httpx.Client(
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
        timeout=timeout_seconds,
    ) as client:
        while queue and len(pages) < max_pages:
            url, depth = queue.popleft()

            domain = urlparse(url).netloc.lower()
            robots = robots_parsers.get(domain)
            if robots is not None and not robots.can_fetch(USER_AGENT, url):
                print(f"[crawler] robots.txt disallows: {url}")
                continue

            try:
                response = client.get(url)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                print(f"[crawler] Failed to fetch {url}: {exc}")
                continue

            content_type = response.headers.get("content-type", "")
            if "text/html" not in content_type:
                continue

            pages.append(CrawledPage(url=url, html=response.text))
            print(f"[crawler] ({len(pages)}/{max_pages}) fetched {url}")

            if depth < max_depth:
                for link in _extract_links(response.text, url):
                    link = _normalize_url(link)
                    if link in seen:
                        continue
                    if not _is_allowed_domain(link, allowed_domains):
                        continue
                    if _should_skip(link):
                        continue
                    seen.add(link)
                    queue.append((link, depth + 1))

            time.sleep(delay_seconds)

    return pages


def _extract_links(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    links = []
    for tag in soup.find_all("a", href=True):
        href = tag["href"].strip()
        if not href or href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        links.append(urljoin(base_url, href))
    return links
