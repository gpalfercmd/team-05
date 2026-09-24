# =============================================================================
# Proof of Aid — Team 05 — Claim identity, metadata digest and evidence root
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Claim-level digests (spec F2/F4, P3.3).

- `claim_id_from_uuid`: the onchain `bytes32 claimId` is `keccak256(uuid)`
  (memory.md: claim ID decision). Ethereum keccak, same preimage the
  contracts hash — never a counter, so it reveals no ordering.
- `metadata_digest`: the anchored `metadataHash` is `keccak256` of the
  canonical field encoding below (`poa_shared.metadata`, P8.4), binding the
  metadata to its claim. The public page recomputes it from the served fields.
- `build_evidence_root`: the bundle root via the shared P1.3 Merkle recipe,
  so backend, contracts and frontend always agree (verified against
  `code/shared/merkle-vectors.json`).

Canonical metadata encoding (v1): the five fields joined by `"\n"` in this
order — title, description, location_region, claim_date (ISO), claim_id hex —
encoded as UTF-8. Changing any field, or the claim it belongs to, changes
the digest. Fields are trimmed here, then stored exactly as hashed; title and
location_region must be single-line so the encoding stays unambiguous
(`code/shared/metadata-vectors.json`).
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Final

from poa_shared.merkle import build_root as shared_build_root
from poa_shared.merkle import keccak256
from poa_shared.metadata import metadata_hash
from poa_shared.result import Err, Result

HASH_LENGTH: Final[int] = 32


def claim_id_from_uuid(claim_uuid: uuid.UUID) -> bytes:
    """Return `keccak256` of the canonical UUID string (36 chars, lowercase)."""
    digest = keccak256(str(claim_uuid).encode("utf-8"))
    return digest


def claim_id_hex(claim_uuid: uuid.UUID) -> str:
    """Return the claim id as a `0x`-prefixed 64-hex string for storage/API."""
    hexed = f"0x{claim_id_from_uuid(claim_uuid).hex()}"
    return hexed


def metadata_digest(
    *,
    title: str,
    description: str,
    location_region: str,
    claim_date: date,
    claim_id: bytes,
) -> Result[bytes]:
    """Return `keccak256` of the canonical encoding of the trimmed fields, or `Err`."""
    if not title.strip():
        return Err("title must not be empty")
    if not description.strip():
        return Err("description must not be empty")
    if not location_region.strip():
        return Err("location_region must not be empty")
    if len(claim_id) != HASH_LENGTH:
        return Err(f"claim id must be {HASH_LENGTH} bytes")
    digested: Result[bytes] = metadata_hash(
        title=title.strip(),
        description=description.strip(),
        location_region=location_region.strip(),
        claim_date=claim_date.isoformat(),
        claim_id=claim_id,
    )
    return digested


def build_evidence_root(file_hashes: list[bytes]) -> Result[bytes]:
    """Return the Merkle root of one bundle's file hashes (shared P1.3 recipe)."""
    root: Result[bytes] = shared_build_root(file_hashes)
    return root
