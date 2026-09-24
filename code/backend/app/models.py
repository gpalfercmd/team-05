# =============================================================================
# Proof of Aid — Team 05 — SQLAlchemy models: claims, evidence, roles, chain index
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Operational tables (spec P3.1, P3.4).

- `Claim` holds the offchain metadata; `claim_id_hex` is `keccak256(uuid)` and
  matches the onchain `bytes32 claimId` (memory.md: claim ID decision).
- `EvidenceFile` holds one row per uploaded file; the bytes live encrypted in
  `STORAGE_DIR`, only the SHA-256 of the *sanitized* bytes is stored here (F3).
  `root_index` is the file's bundle: its position in the onchain
  `evidenceRoots(claimId)` (0 = original evidence, n = supplementary proof n).
- `Participant` is the P3 local role resolver, now only the explicit
  `ROLE_SOURCE=local` fallback (memory.md: RolResolver local decision), as is
  `auditor_address` on the claim; in chain mode the access matrix reads
  `ChainParticipant` / `ChainClaim` instead (F3, P4).
- `Challenge` stores single-use wallet-login nonces (P3.4, anti-replay).
- P4 chain index: `ChainEvent` is every decoded registry event (unique per
  `(chain_id, tx_hash, log_index)`, so re-indexing a range is a no-op),
  `SyncState` the indexer cursor, and `ChainParticipant` / `ChainClaim` the
  projections the access matrix and the public API read. The indexer writes
  events, projections and cursor in one transaction. Everything is keyed by
  `chain_id` so one database can hold anvil and Arbitrum Sepolia side by side.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Final

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

ROLE_ORGANIZATION: Final[str] = "organization"
ROLE_INTERNAL_VERIFIER: Final[str] = "internal_verifier"
ROLE_AUDITOR: Final[str] = "auditor"

ADDRESS_LENGTH: Final[int] = 42
HASH_HEX_LENGTH: Final[int] = 66  # "0x" + 64 hex chars (bytes32)
EVENT_NAME_LENGTH: Final[int] = 40
STATUS_NAME_LENGTH: Final[int] = 24  # longest `ClaimStatus` name is "InternallyVerified"
CONTRACT_SET_LENGTH: Final[int] = 2 * ADDRESS_LENGTH + 1


class Claim(Base):
    """Offchain claim metadata created by an organization (spec F2)."""

    __tablename__ = "claims"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    claim_id_hex: Mapped[str] = mapped_column(String(HASH_HEX_LENGTH), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    location_region: Mapped[str] = mapped_column(String(120))
    claim_date: Mapped[date] = mapped_column(Date)
    metadata_hash_hex: Mapped[str] = mapped_column(String(HASH_HEX_LENGTH))
    created_by: Mapped[str] = mapped_column(String(ADDRESS_LENGTH), index=True)
    auditor_address: Mapped[str | None] = mapped_column(String(ADDRESS_LENGTH), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    evidence_files: Mapped[list[EvidenceFile]] = relationship(
        back_populates="claim", cascade="all, delete-orphan"
    )


class EvidenceFile(Base):
    """One uploaded evidence file: hash + storage pointer (spec F3)."""

    __tablename__ = "evidence_files"
    __table_args__ = (
        UniqueConstraint("claim_id", "sha256_hex", name="uq_file_per_claim"),
        CheckConstraint("root_index >= 0", name="ck_evidence_root_index_nonnegative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    claim_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("claims.id", ondelete="CASCADE"), index=True
    )
    sha256_hex: Mapped[str] = mapped_column(String(HASH_HEX_LENGTH))
    storage_name: Mapped[str] = mapped_column(String(64))
    original_name: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(127))
    size_bytes: Mapped[int] = mapped_column(Integer)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    root_index: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    uploaded_by: Mapped[str] = mapped_column(String(ADDRESS_LENGTH))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    claim: Mapped[Claim] = relationship(back_populates="evidence_files")


class Participant(Base):
    """Local accreditation record (`ROLE_SOURCE=local` fallback; chain mode ignores it)."""

    __tablename__ = "participants"
    __table_args__ = (
        CheckConstraint(
            "role IN ('organization', 'internal_verifier', 'auditor')",
            name="ck_participant_role",
        ),
    )

    address: Mapped[str] = mapped_column(String(ADDRESS_LENGTH), primary_key=True)
    role: Mapped[str] = mapped_column(String(32))
    organization: Mapped[str | None] = mapped_column(String(ADDRESS_LENGTH), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Challenge(Base):
    """Single-use wallet-login nonce (spec P3.4)."""

    __tablename__ = "challenges"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    address: Mapped[str] = mapped_column(String(ADDRESS_LENGTH), index=True)
    nonce: Mapped[str] = mapped_column(String(128), unique=True)
    message: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class ChainEvent(Base):
    """One decoded ParticipantRegistry/ClaimRegistry event (spec F6, P4.1)."""

    __tablename__ = "chain_events"
    __table_args__ = (
        UniqueConstraint("chain_id", "tx_hash", "log_index", name="uq_chain_event_log"),
        Index("ix_chain_events_claim", "chain_id", "claim_id_hex", "block_number", "log_index"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    chain_id: Mapped[int] = mapped_column(BigInteger)
    block_number: Mapped[int] = mapped_column(BigInteger)
    tx_hash: Mapped[str] = mapped_column(String(HASH_HEX_LENGTH))
    log_index: Mapped[int] = mapped_column(Integer)
    contract: Mapped[str] = mapped_column(String(ADDRESS_LENGTH))
    event_name: Mapped[str] = mapped_column(String(EVENT_NAME_LENGTH))
    claim_id_hex: Mapped[str | None] = mapped_column(String(HASH_HEX_LENGTH), nullable=True)
    args: Mapped[dict[str, object]] = mapped_column(JSON)
    block_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SyncState(Base):
    """Indexer cursor per chain and contract pair (`participant,claim` addresses)."""

    __tablename__ = "sync_state"

    chain_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    contracts: Mapped[str] = mapped_column(String(CONTRACT_SET_LENGTH), primary_key=True)
    deploy_block: Mapped[int] = mapped_column(BigInteger)
    # Last block whose logs are fully stored; `None` until the first chunk commits.
    cursor_block: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    head_block: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ChainParticipant(Base):
    """Accreditation as the ParticipantRegistry events left it (role source in chain mode)."""

    __tablename__ = "chain_participants"
    __table_args__ = (
        CheckConstraint(
            "role IN ('organization', 'internal_verifier', 'auditor')",
            name="ck_chain_participant_role",
        ),
    )

    chain_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    address: Mapped[str] = mapped_column(String(ADDRESS_LENGTH), primary_key=True)
    role: Mapped[str] = mapped_column(String(32))
    organization: Mapped[str | None] = mapped_column(String(ADDRESS_LENGTH), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean)
    updated_block: Mapped[int] = mapped_column(BigInteger)


class ChainClaim(Base):
    """A claim as the ClaimRegistry events left it (public list + assigned auditor)."""

    __tablename__ = "chain_claims"
    __table_args__ = (Index("ix_chain_claims_anchored", "chain_id", "anchored_block"),)

    chain_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    claim_id_hex: Mapped[str] = mapped_column(String(HASH_HEX_LENGTH), primary_key=True)
    organization: Mapped[str] = mapped_column(String(ADDRESS_LENGTH))
    status: Mapped[str] = mapped_column(String(STATUS_NAME_LENGTH))
    internal_verifier: Mapped[str | None] = mapped_column(String(ADDRESS_LENGTH), nullable=True)
    auditor: Mapped[str | None] = mapped_column(String(ADDRESS_LENGTH), nullable=True)
    evidence_roots: Mapped[list[str]] = mapped_column(JSON)
    metadata_hash: Mapped[str] = mapped_column(String(HASH_HEX_LENGTH))
    anchored_block: Mapped[int] = mapped_column(BigInteger)
    anchored_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_status_block: Mapped[int] = mapped_column(BigInteger)
    last_status_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
