# =============================================================================
# Proof of Aid — Team 05 — Salted fingerprints of reviewer notes (justification, proof request, ...)
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Salted note fingerprints (P10.3), shared by the backend and the role screens.

The contract anchors a `bytes32` for every justification, proof request,
counter-evidence and dispute resolution. Since P10.3 that value is
`noteHash = keccak256(salt ‖ utf8(text))` with a random 32-byte salt chosen in
the browser, so a short note ("approved", "missing receipt") can no longer be
confirmed by hashing guesses. The salt has a fixed length, so the preimage
splits back into exactly one (salt, text) pair. The text is hashed exactly as
written (the app trims surrounding whitespace once, before hashing), with no
Unicode normalization; an empty text is rejected.

Notes anchored before P10.3 stay `keccak256(utf8(text))` (`legacy_note_hash`).
`note-vectors.json` (next to this package) freezes the recipe for Python and
TypeScript.
"""

from __future__ import annotations

from poa_shared.merkle import HASH_LENGTH, keccak256
from poa_shared.result import Err, Ok, Result


def note_preimage(salt: bytes, text: str) -> Result[bytes]:
    """Return `salt ‖ utf8(text)`, or `Err` for a salt that is not 32 bytes or an empty text."""
    if len(salt) != HASH_LENGTH:
        return Err(f"note salt must be {HASH_LENGTH} bytes")
    if not text:
        return Err("note text must not be empty")
    preimage: Result[bytes] = Ok(salt + text.encode("utf-8"))
    return preimage


def note_hash(salt: bytes, text: str) -> Result[bytes]:
    """Return the salted note fingerprint `keccak256(salt ‖ utf8(text))`, or `Err`."""
    preimage = note_preimage(salt, text)
    hashed: Result[bytes] = Ok(keccak256(preimage.value)) if isinstance(preimage, Ok) else preimage
    return hashed


def legacy_note_hash(text: str) -> bytes:
    """The unsalted fingerprint used before P10.3: `keccak256(utf8(text))` (guessable)."""
    hashed = keccak256(text.encode("utf-8"))
    return hashed
