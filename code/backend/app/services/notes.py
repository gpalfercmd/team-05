# =============================================================================
# Proof of Aid — Team 05 — Reviewer notes: check the salted fingerprint, seal and open the text
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Notes behind anchored fingerprints (P10.3).

The author's browser picks a random 32-byte salt and computes
`noteHash = keccak256(salt ‖ utf8(text))` (`poa_shared.notes`); before the
transaction it sends text, salt and hash here. The hash is recomputed and must
match, then text and salt are sealed with the claim key (`services.crypto`).

Who reads a note: the claim's authorized viewers (the private-evidence access
matrix: owning organization, its internal verifiers, the assigned auditor) see
every note of the claim; any other signed-in wallet sees only the notes it
wrote itself. Anonymous visitors see none: the public only has the onchain
fingerprint. Like the evidence module, this module logs nothing.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from poa_shared.notes import note_hash
from poa_shared.result import Err, Ok, Result

from app.models import Claim, ClaimNote
from app.services.access import RoleSource, can_view_private_evidence
from app.services.crypto import decrypt_bytes, derive_claim_key, encrypt_bytes


@dataclass(frozen=True, slots=True)
class SealedNote:
    """A checked note ready for storage: its fingerprint plus sealed text and salt."""

    note_hash: bytes
    text_sealed: bytes
    salt_sealed: bytes


@dataclass(frozen=True, slots=True)
class OpenedNote:
    """A stored note decrypted for a reader."""

    text: str
    salt: bytes


def _claim_key(master_key: bytes, claim: Claim) -> Result[bytes]:
    """The claim's AES key (the same derivation as its evidence files)."""
    key = derive_claim_key(master_key, bytes.fromhex(claim.claim_id_hex.removeprefix("0x")))
    return key


def seal_note(
    *, text: str, salt: bytes, expected_hash: bytes, master_key: bytes, claim: Claim
) -> Result[SealedNote]:
    """Check `expected_hash` against the recipe, then seal text and salt with the claim key."""
    computed = note_hash(salt, text)
    if isinstance(computed, Err):
        return computed
    if computed.value != expected_hash:
        return Err("note_hash is not keccak256(salt ‖ utf8(text))")
    key = _claim_key(master_key, claim)
    if isinstance(key, Err):
        return key
    text_sealed = encrypt_bytes(text.encode("utf-8"), key.value)
    if isinstance(text_sealed, Err):
        return text_sealed
    salt_sealed = encrypt_bytes(salt, key.value)
    if isinstance(salt_sealed, Err):
        return salt_sealed
    sealed: Result[SealedNote] = Ok(
        SealedNote(note_hash=computed.value, text_sealed=text_sealed.value, salt_sealed=salt_sealed.value)
    )
    return sealed


def open_note(row: ClaimNote, *, master_key: bytes, claim: Claim) -> Result[OpenedNote]:
    """Decrypt a stored note; a tampered row or wrong key returns `Err`."""
    key = _claim_key(master_key, claim)
    if isinstance(key, Err):
        return key
    text = decrypt_bytes(row.text_sealed, key.value)
    if isinstance(text, Err):
        return text
    salt = decrypt_bytes(row.salt_sealed, key.value)
    if isinstance(salt, Err):
        return salt
    try:
        decoded = text.value.decode("utf-8")
    except UnicodeDecodeError as cause:
        return Err("stored note is not UTF-8", cause)
    opened: Result[OpenedNote] = Ok(OpenedNote(text=decoded, salt=salt.value))
    return opened


def readable_notes(
    db: Session, *, viewer: str, claim: Claim, roles: RoleSource
) -> list[ClaimNote]:
    """Every note for the claim's authorized viewers, otherwise only the viewer's own; oldest first."""
    statement = select(ClaimNote).where(ClaimNote.claim_id == claim.id)
    if not can_view_private_evidence(db, viewer=viewer, claim=claim, roles=roles):
        statement = statement.where(ClaimNote.author == viewer)
    notes = list(db.scalars(statement.order_by(ClaimNote.created_at, ClaimNote.id)).all())
    return notes
