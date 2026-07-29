"""
Splits one extracted page section into embeddable chunks.

WHY CHUNK AT ALL
----------------
The embedding model (all-MiniLM-L6-v2, see app/services/semantic_search.py)
works best on roughly sentence-to-paragraph-length text, not a whole page.
Embedding an entire "Hostel Rules" page as one vector would blur several
genuinely different facts (gate timings, mess timings, room allotment)
into one average meaning, making it a mediocre match for ANY specific
question about the page. Splitting into smaller, topically coherent chunks
- and embedding each one separately - lets retrieval point at the specific
paragraph that actually answers a question (requirement 5).

SIZE CHOICES
------------
Chunks target CHUNK_TARGET_CHARS (~1000 characters, roughly 150-200 words)
- comfortably inside all-MiniLM-L6-v2's usable input length while still
being long enough to read as a complete, coherent thought rather than a
fragment. A short section is kept as ONE chunk rather than artificially
split; a long section is broken on paragraph boundaries (never mid-
sentence) with a small overlap between consecutive chunks so a fact
straddling a chunk boundary isn't orphaned on one side of the cut.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.ingestion.extractor import ExtractedSection

# Target chunk size in characters. Not a hard cap - a single paragraph
# longer than this is kept whole rather than cut mid-sentence.
CHUNK_TARGET_CHARS = 1000

# How much of the end of one chunk gets repeated at the start of the next,
# when a section is long enough to need multiple chunks. Small on purpose -
# just enough to preserve context across the cut, not so much that it
# meaningfully duplicates content in the knowledge base.
CHUNK_OVERLAP_CHARS = 150

# Sections shorter than this after extraction aren't worth storing as their
# own chunk (e.g. a heading immediately followed by one short caption-like
# line) - not an error, just nothing substantive to retrieve.
MIN_CHUNK_CHARS = 40


@dataclass
class Chunk:
    heading: str
    text: str
    index: int  # position within this section's chunks, starting at 0


def chunk_section(section: ExtractedSection) -> list[Chunk]:
    """Split one section's text into one or more Chunks. Splits happen
    between paragraphs (the extractor already joins paragraphs with a
    blank line), never inside a sentence."""
    text = section.text.strip()
    if len(text) < MIN_CHUNK_CHARS:
        return []

    if len(text) <= CHUNK_TARGET_CHARS:
        return [Chunk(heading=section.heading, text=text, index=0)]

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[Chunk] = []
    current = ""

    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}" if current else paragraph

        if len(candidate) <= CHUNK_TARGET_CHARS or not current:
            current = candidate
            continue

        # Adding this paragraph would overflow the target - close out the
        # current chunk and start the next one with a small tail of the
        # previous chunk carried forward, for context continuity across
        # the cut.
        chunks.append(Chunk(heading=section.heading, text=current, index=len(chunks)))
        overlap = current[-CHUNK_OVERLAP_CHARS:]
        current = f"{overlap}\n\n{paragraph}"

    if current.strip() and len(current.strip()) >= MIN_CHUNK_CHARS:
        chunks.append(Chunk(heading=section.heading, text=current, index=len(chunks)))

    return chunks


def chunk_sections(sections: list[ExtractedSection]) -> list[Chunk]:
    """Chunk every section of a page and return them all in order."""
    all_chunks: list[Chunk] = []
    for section in sections:
        all_chunks.extend(chunk_section(section))
    return all_chunks
