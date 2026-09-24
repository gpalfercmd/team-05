# =============================================================================
# Proof of Aid — Team 05 — Pydantic v2 boundary schemas for the HTTP API
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Request/response models (spec F2, P3.4). Everything entering over HTTP is
validated here; responses serialize from ORM rows (`from_attributes`).

Privacy note: file *contents* never appear in any schema — only hashes and
metadata. The public sees hashes and the root (spec Q3), never bytes.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ClaimCreate(BaseModel):
    """Offchain claim metadata (spec F2: region level only, never coordinates)."""

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    location_region: str = Field(min_length=1, max_length=120)
    claim_date: date


class EvidenceFileResponse(BaseModel):
    """Public metadata of one stored file (no bytes, ever)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sha256_hex: str
    original_name: str
    mime_type: str
    size_bytes: int
    is_public: bool
    uploaded_by: str
    uploaded_at: datetime


class ClaimResponse(BaseModel):
    """A claim with its file list and current evidence root (None if empty)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    claim_id_hex: str
    title: str
    description: str
    location_region: str
    claim_date: date
    metadata_hash_hex: str
    created_by: str
    auditor_address: str | None
    created_at: datetime
    evidence: list[EvidenceFileResponse] = []
    evidence_root: str | None = None


class EvidenceUploadResponse(BaseModel):
    """Result of an upload: stored files plus the root ready to anchor onchain."""

    files: list[EvidenceFileResponse]
    evidence_root: str


class ChallengeRequest(BaseModel):
    """Ask for a login nonce for `address`."""

    address: str


class ChallengeResponse(BaseModel):
    """Nonce message the wallet must sign (EIP-191)."""

    message: str
    nonce: str
    expires_at: datetime


class VerifyRequest(BaseModel):
    """Signed challenge proving control of `address`."""

    address: str
    signature: str


class SessionResponse(BaseModel):
    """The wallet address behind the current session."""

    address: str


class FileVisibilityUpdate(BaseModel):
    """Flip the per-file `public` flag (spec F3: private by default)."""

    is_public: bool
