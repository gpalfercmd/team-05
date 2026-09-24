# =============================================================================
# Proof of Aid — Team 05 — Shared Merkle recipe used by every layer
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Shared Merkle recipe for Proof of Aid evidence roots.

The contracts, the backend and the public page must compute the same root for
the same evidence files; `merkle-vectors.json` (next to this package) freezes it.
"""

from poa_shared.merkle import (
    HASH_LENGTH,
    build_proof,
    build_root,
    file_hash,
    keccak256,
    leaf_from_file_hash,
    verify_proof,
)
from poa_shared.result import Err, Ok, Result

__all__ = [
    "HASH_LENGTH",
    "Err",
    "Ok",
    "Result",
    "build_proof",
    "build_root",
    "file_hash",
    "keccak256",
    "leaf_from_file_hash",
    "verify_proof",
]
