# =============================================================================
# Proof of Aid — Team 05 — Access matrix for private evidence
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Who may decrypt a claim's evidence (spec F3, P3.4, P4).

- Public files: anyone, no login (feeds the F6 public page).
- Private files: the owning organization, its active internal verifiers, and
  the claim's assigned auditor — nobody else.

Roles come from one of two sources (`RoleSource`, set from `ROLE_SOURCE`):

- `chain` (default when a deployment is configured): the P4 indexer's
  projections of the registries. Organization and verifier rows must be
  active (revocation removes access); a verifier also needs its organization
  to be active, mirroring `organizationOf()` returning zero after the
  organization is revoked; the assigned auditor is `chain_claims.auditor`,
  and only while the claim is anchored onchain by the organization that
  created it here (a claimId anchored first by someone else must not hand
  this organization's private files to that claim's auditor).
- `local`: the hand-seeded `participants` table plus `claims.auditor_address`
  (the P3 resolver), kept only as an explicit fallback for development and the
  P3 tests.

The same matrix decides who sees private file *metadata* (name, type, size,
uploader) on claim reads; everyone else gets fingerprints only.

Denied private reads look identical to missing files at the HTTP layer (404),
so file ids cannot be used as an existence oracle.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from sqlalchemy.orm import Session

from poa_shared.result import Err, Ok, Result

from app.models import (
    ROLE_AUDITOR,
    ROLE_INTERNAL_VERIFIER,
    ROLE_ORGANIZATION,
    ChainClaim,
    ChainParticipant,
    Claim,
    EvidenceFile,
    Participant,
)
from app.settings import ROLE_SOURCE_CHAIN, ROLE_SOURCE_LOCAL


@dataclass(frozen=True, slots=True)
class RoleSource:
    """Where roles are resolved: the indexed chain (with its id) or the local table."""

    mode: str
    chain_id: int | None = None

    @property
    def is_chain(self) -> bool:
        """True when roles come from the indexed registries."""
        chain = self.mode == ROLE_SOURCE_CHAIN
        return chain


LOCAL_ROLES: Final[RoleSource] = RoleSource(mode=ROLE_SOURCE_LOCAL)


def _active_chain_participant(db: Session, chain_id: int, address: str) -> ChainParticipant | None:
    """Return the indexed participant row when it is active, else None."""
    row = db.get(ChainParticipant, (chain_id, address))
    active: ChainParticipant | None = row if row is not None and row.active else None
    return active


def _chain_can_view(db: Session, chain_id: int, viewer: str, claim: Claim) -> bool:
    """The access matrix over the indexed registries (see module docstring)."""
    participant = _active_chain_participant(db, chain_id, viewer)
    if participant is None:
        return False
    if participant.role == ROLE_ORGANIZATION:
        return claim.created_by == viewer
    if participant.role == ROLE_INTERNAL_VERIFIER:
        own_org = participant.organization == claim.created_by
        return own_org and _active_chain_participant(db, chain_id, claim.created_by) is not None
    chain_claim = db.get(ChainClaim, (chain_id, claim.claim_id_hex))
    allowed = (
        participant.role == ROLE_AUDITOR
        and chain_claim is not None
        and chain_claim.organization == claim.created_by
        and chain_claim.auditor == viewer
    )
    return allowed


def _local_can_view(db: Session, viewer: str, claim: Claim) -> bool:
    """The P3 matrix over the local `participants` table (fallback mode)."""
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
    allowed = participant.role == ROLE_AUDITOR and claim.auditor_address == viewer
    return allowed


def can_view_private_evidence(
    db: Session, *, viewer: str | None, claim: Claim, roles: RoleSource
) -> bool:
    """Return True when `viewer` may see this claim's private evidence.

    The single source of the matrix: it gates both private downloads and the
    private file metadata (names can carry beneficiaries' personal data).
    """
    if viewer is None:
        return False
    if roles.is_chain:
        # A chain source without a chain id is a wiring bug: deny rather than guess.
        return roles.chain_id is not None and _chain_can_view(db, roles.chain_id, viewer, claim)
    allowed = _local_can_view(db, viewer, claim)
    return allowed


def can_read_file(
    db: Session,
    *,
    viewer: str | None,
    claim: Claim,
    evidence_file: EvidenceFile,
    roles: RoleSource,
) -> bool:
    """Return True when `viewer` may download this file's decrypted bytes."""
    allowed = evidence_file.is_public or can_view_private_evidence(
        db, viewer=viewer, claim=claim, roles=roles
    )
    return allowed


def require_organization(db: Session, address: str, *, roles: RoleSource) -> Result[str]:
    """Return `Ok(address)` when it is an active accredited organization."""
    participant: ChainParticipant | Participant | None
    if roles.is_chain:
        participant = (
            db.get(ChainParticipant, (roles.chain_id, address))
            if roles.chain_id is not None
            else None
        )
    else:
        participant = db.get(Participant, address)
    if participant is None or not participant.active:
        return Err("wallet is not an accredited participant")
    if participant.role != ROLE_ORGANIZATION:
        return Err("only an accredited organization can perform this action")
    authorized: Result[str] = Ok(address)
    return authorized
