# =============================================================================
# Proof of Aid — Team 05 — Projections: registry events → roles and claim state
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Fold decoded events into `chain_participants` and `chain_claims` (P4.1).

`sync` calls `apply_event` only for events it has just inserted, in chain
order, inside the same transaction as the event rows and the cursor, so a
projection always equals "all stored events folded in order".

ParticipantRegistry: register/accredit sets the role and `active=True`;
revoke sets `active=False` and keeps the role (identity is permanent onchain,
memory.md, so a revoked wallet never comes back). Note that revoking an
organization leaves its verifiers' rows active: the access matrix checks the
organization's own row too, mirroring `organizationOf()` returning zero.

ClaimRegistry: `ClaimAnchored` creates the claim with its original root,
`StatusChanged` moves the status, `InternalAttestation` records the
checkpoint-1 wallet, `AuditorAssigned` the current auditor, `ProofSubmitted`
appends the supplementary root at its `rootIndex`. The remaining events only
feed the timeline.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Final

from sqlalchemy.orm import Session

from poa_shared.result import Err, Ok, Result

from app.indexer.abi import DecodedEvent, EventCatalog
from app.models import (
    ROLE_AUDITOR,
    ROLE_INTERNAL_VERIFIER,
    ROLE_ORGANIZATION,
    ChainClaim,
    ChainParticipant,
)

ANCHORED_STATUS: Final[str] = "Anchored"

# event name → (address argument, role, active afterwards)
PARTICIPANT_EVENTS: Final[dict[str, tuple[str, str, bool]]] = {
    "OrganizationRegistered": ("organization", ROLE_ORGANIZATION, True),
    "OrganizationRevoked": ("organization", ROLE_ORGANIZATION, False),
    "InternalVerifierRegistered": ("verifier", ROLE_INTERNAL_VERIFIER, True),
    "InternalVerifierRevoked": ("verifier", ROLE_INTERNAL_VERIFIER, False),
    "AuditorAccredited": ("auditor", ROLE_AUDITOR, True),
    "AuditorRevoked": ("auditor", ROLE_AUDITOR, False),
}


def _text(event: DecodedEvent, name: str) -> str:
    """Return a string argument (addresses and hashes are normalized strings)."""
    value = event.args.get(name)
    text = value if isinstance(value, str) else ""
    return text


def _apply_participant(
    db: Session, chain_id: int, event: DecodedEvent, rule: tuple[str, str, bool]
) -> Result[None]:
    """Upsert the participant row an accreditation event talks about."""
    address_arg, role, active = rule
    address = _text(event, address_arg)
    if not address:
        return Err(f"{event.name} has no {address_arg} argument")
    row = db.get(ChainParticipant, (chain_id, address))
    if row is None:
        row = ChainParticipant(chain_id=chain_id, address=address, role=role)
        db.add(row)
    row.role = role
    row.active = active
    if role == ROLE_INTERNAL_VERIFIER:
        row.organization = _text(event, "organization") or row.organization
    row.updated_block = event.log.block_number
    # Flushed so a later event in the same transaction finds the row with `get`
    # (sessions run with autoflush off, and pending rows are not in the identity map).
    db.flush()
    applied: Result[None] = Ok(None)
    return applied


def _anchor(
    db: Session, chain_id: int, event: DecodedEvent, block_time: datetime, _: EventCatalog
) -> Result[None]:
    """Create the claim with its original evidence root."""
    claim_id = event.claim_id_hex or ""
    if db.get(ChainClaim, (chain_id, claim_id)) is not None:
        return Err("ClaimAnchored for a claim that already exists")
    db.add(
        ChainClaim(
            chain_id=chain_id,
            claim_id_hex=claim_id,
            organization=_text(event, "organization"),
            status=ANCHORED_STATUS,
            evidence_roots=[_text(event, "evidenceRoot")],
            metadata_hash=_text(event, "metadataHash"),
            anchored_block=event.log.block_number,
            anchored_at=block_time,
            last_status_block=event.log.block_number,
            last_status_at=block_time,
        )
    )
    db.flush()  # same reason as participants: `StatusChanged` follows in the same tx
    applied: Result[None] = Ok(None)
    return applied


def _status(
    claim: ChainClaim, event: DecodedEvent, block_time: datetime, catalog: EventCatalog
) -> Result[None]:
    """Move the claim to `to` and remember when."""
    name = catalog.status_name(event.args.get("to"))
    if name is None:
        return Err("StatusChanged carries an unknown status")
    claim.status = name
    claim.last_status_block = event.log.block_number
    claim.last_status_at = block_time
    applied: Result[None] = Ok(None)
    return applied


def _internal(claim: ChainClaim, event: DecodedEvent, *_: object) -> Result[None]:
    """Record the checkpoint-1 wallet (onchain `Claim.internalVerifier`)."""
    claim.internal_verifier = _text(event, "verifier")
    applied: Result[None] = Ok(None)
    return applied


def _auditor(claim: ChainClaim, event: DecodedEvent, *_: object) -> Result[None]:
    """Record the currently assigned auditor (reassignment replaces it)."""
    claim.auditor = _text(event, "auditor")
    applied: Result[None] = Ok(None)
    return applied


def _proof(claim: ChainClaim, event: DecodedEvent, *_: object) -> Result[None]:
    """Append the supplementary root at `rootIndex` (mirrors `evidenceRoots`)."""
    index = event.args.get("rootIndex")
    if index != len(claim.evidence_roots):
        return Err("ProofSubmitted rootIndex does not follow the stored roots")
    # A new list, because the JSON column does not track in-place mutation.
    claim.evidence_roots = [*claim.evidence_roots, _text(event, "supplementaryRoot")]
    applied: Result[None] = Ok(None)
    return applied


ClaimRule = Callable[[ChainClaim, DecodedEvent, datetime, EventCatalog], Result[None]]
CLAIM_UPDATES: Final[dict[str, ClaimRule]] = {
    "StatusChanged": _status,
    "InternalAttestation": _internal,
    "AuditorAssigned": _auditor,
    "ProofSubmitted": _proof,
}


def apply_event(
    db: Session, chain_id: int, event: DecodedEvent, block_time: datetime, catalog: EventCatalog
) -> Result[None]:
    """Fold one newly stored event into the projections (timeline-only events: no-op)."""
    participant_rule = PARTICIPANT_EVENTS.get(event.name)
    update = CLAIM_UPDATES.get(event.name)
    claim = (
        db.get(ChainClaim, (chain_id, event.claim_id_hex or "")) if update is not None else None
    )
    applied: Result[None]
    if participant_rule is not None:
        applied = _apply_participant(db, chain_id, event, participant_rule)
    elif event.name == "ClaimAnchored":
        applied = _anchor(db, chain_id, event, block_time, catalog)
    elif update is None:
        applied = Ok(None)
    elif claim is None:
        applied = Err(f"{event.name} for a claim that was never anchored")
    else:
        applied = update(claim, event, block_time, catalog)
    return applied
