# =============================================================================
# Proof of Aid — Team 05 — Canonical claim metadata encoding and its onchain metadataHash
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Canonical claim metadata (v1) shared by the backend and the public page (P8.4).

`metadataHash = keccak256(utf8(title "\\n" description "\\n" location_region
"\\n" claim_date "\\n" claim_id_hex))`, where `claim_date` is `YYYY-MM-DD` and
`claim_id_hex` is the 32-byte claim id as 64 lowercase hex characters without
`0x`. The strings are hashed exactly as the API serves them (the backend trims
them once, before storing and hashing), with no Unicode normalization.

`title` and `location_region` must not contain a line feed: `description` is
the only field that may span lines, so splitting the preimage on `"\\n"` from
both ends gives back exactly one set of fields. Without that rule a server could
move text between title and description and keep the same hash.
`metadata-vectors.json` (next to this package) freezes the recipe for Python
and TypeScript.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Final

from poa_shared.merkle import HASH_LENGTH, keccak256
from poa_shared.result import Err, Ok, Result

FIELD_SEPARATOR: Final[str] = "\n"
ISO_DATE_PATTERN: Final[re.Pattern[str]] = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _field_problem(title: str, description: str, location_region: str) -> str | None:
    """Why the text fields cannot be encoded, or None when they can."""
    problem: str | None = None
    if not title or not description or not location_region:
        problem = "title, description and location_region must not be empty"
    elif FIELD_SEPARATOR in title:
        problem = "title must be a single line"
    elif FIELD_SEPARATOR in location_region:
        problem = "location_region must be a single line"
    return problem


def _is_iso_date(value: str) -> bool:
    """True for a real calendar date written as YYYY-MM-DD."""
    valid = False
    if ISO_DATE_PATTERN.match(value) is not None:
        try:
            date.fromisoformat(value)
            valid = True
        except ValueError:
            valid = False
    return valid


def canonical_metadata(
    *,
    title: str,
    description: str,
    location_region: str,
    claim_date: str,
    claim_id: bytes,
) -> Result[bytes]:
    """Return the UTF-8 preimage of `metadataHash`, or `Err` if the fields break the rules."""
    problem = _field_problem(title, description, location_region)
    if problem is not None:
        return Err(problem)
    if not _is_iso_date(claim_date):
        return Err("claim_date must be a YYYY-MM-DD date")
    if len(claim_id) != HASH_LENGTH:
        return Err(f"claim id must be {HASH_LENGTH} bytes")
    preimage = FIELD_SEPARATOR.join([title, description, location_region, claim_date, claim_id.hex()])
    encoded: Result[bytes] = Ok(preimage.encode("utf-8"))
    return encoded


def metadata_hash(
    *,
    title: str,
    description: str,
    location_region: str,
    claim_date: str,
    claim_id: bytes,
) -> Result[bytes]:
    """Return `keccak256` of the canonical metadata encoding, or `Err`."""
    canonical = canonical_metadata(
        title=title,
        description=description,
        location_region=location_region,
        claim_date=claim_date,
        claim_id=claim_id,
    )
    hashed: Result[bytes] = Ok(keccak256(canonical.value)) if isinstance(canonical, Ok) else canonical
    return hashed
