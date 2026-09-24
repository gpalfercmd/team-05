# =============================================================================
# Proof of Aid — Team 05 — Access matrix for private evidence
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Who may decrypt a claim's evidence (spec F3, P3.4).

- Public files: anyone, no login (feeds the F6 public page).
- Private files: the owning organization, its active internal verifiers, and
  the claim's assigned auditor — nobody else. Roles resolve through the local
  `participants` table until P4 reads accreditation onchain (memory.md).

Denied private reads look identical to missing files at the HTTP layer (404),
so file ids cannot be used as an existence oracle.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from poa_shared.result import Err, Ok, Result

from app.models import (
    ROLE_AUDITOR,
    ROLE_INTERNAL_VERIFIER,
    ROLE_ORGANIZATION,
    Claim,
    EvidenceFile,
    Participant,
)


def can_read_file(
    db: Session, *, viewer: str | None, claim: Claim, evidence_file: EvidenceFile
) -> bool:
    """Return True when `viewer` may download this file's decrypted bytes."""
    if evidence_file.is_public:
        return True
    if viewer is None:
        return False
    if claim.created_by == viewer:
        return True
    participant = db.get(Participant, viewer)
    if participant is None or not participant.active:
        return False
    if (
        participant.role == ROLE_INTERNAL_VERIFIER
        and participant.organization == claim.created_by
    ):
        return True
    if participant.role == ROLE_AUDITOR and claim.auditor_address == viewer:
        return True
    allowed = False
    return allowed


def require_organization(db: Session, address: str) -> Result[str]:
    """Return `Ok(address)` when it is an active accredited organization."""
    participant = db.get(Participant, address)
    if participant is None or not participant.active:
        return Err("wallet is not an accredited participant")
    if participant.role != ROLE_ORGANIZATION:
        return Err("only an accredited organization can perform this action")
    authorized: Result[str] = Ok(address)
    return authorized
