# =============================================================================
# Proof of Aid — Team 05 — Shared Merkle recipe used by every layer
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Shared Merkle recipe for Proof of Aid evidence roots, and the claim metadata hash.

The contracts, the backend and the public page must compute the same root for
the same evidence files; `merkle-vectors.json` (next to this package) freezes it.
The backend and the public page must also compute the same `metadataHash` for
the same claim text; `metadata-vectors.json` freezes that recipe (P8.4).
"""

from __future__ import annotations

from poa_shared.merkle import (
    HASH_LENGTH,
    build_proof,
    build_root,
    file_hash,
    keccak256,
    leaf_from_file_hash,
    salted_file_hash,
    verify_proof,
)
from poa_shared.metadata import canonical_metadata, metadata_hash
from poa_shared.result import Err, Ok, Result

__all__ = [
    "HASH_LENGTH",
    "Err",
    "Ok",
    "Result",
    "build_proof",
    "build_root",
    "canonical_metadata",
    "file_hash",
    "keccak256",
    "leaf_from_file_hash",
    "metadata_hash",
    "salted_file_hash",
    "verify_proof",
]
