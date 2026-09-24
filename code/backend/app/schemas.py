# =============================================================================
# Proof of Aid — Team 05 — Pydantic v2 boundary schemas for the HTTP API
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Request/response models (spec F2, P3.4). Everything entering over HTTP is
validated here; responses serialize from ORM rows (`from_attributes`).

Privacy note: file *contents* never appear in any schema — only hashes and
metadata. The public sees hashes and the roots (spec Q3), never bytes. Private
file metadata is split into its own models (`PrivateFileFingerprint`,
`ManifestPrivateFile`) so the outsider view is fingerprint-only by
construction, not by remembering to blank fields.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Final, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Lowercase on purpose: the backend always emits lowercase hex (manifest rule).
BYTES32_HEX_PATTERN: Final[str] = r"^0x[0-9a-f]{64}$"


class ClaimCreate(BaseModel):
    """Offchain claim metadata (spec F2: region level only, never coordinates)."""

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    location_region: str = Field(min_length=1, max_length=120)
    claim_date: date


class EvidenceFileResponse(BaseModel):
    """Full metadata of one stored file (no bytes, ever).

    Only for the uploader and the claim's authorized viewers (access matrix):
    `original_name` of a private file can carry beneficiaries' personal data.
    """

    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    sha256_hex: str
    original_name: str
    mime_type: str
    size_bytes: int
    is_public: bool
    root_index: int = Field(ge=0)
    uploaded_by: str
    uploaded_at: datetime


class PublicFileResponse(BaseModel):
    """A public file as anyone sees it: enough to download and re-hash it."""

    model_config = ConfigDict(extra="forbid")

    id: UUID
    sha256_hex: str
    original_name: str
    mime_type: str
    size_bytes: int
    is_public: Literal[True]
    root_index: int = Field(ge=0)


class PrivateFileFingerprint(BaseModel):
    """A private file as outsiders see it: its fingerprint and bundle, nothing else.

    A distinct model (not an optional-field variant) so name, type, size, id,
    uploader or upload time cannot leak through a forgotten `None` default.
    """

    model_config = ConfigDict(extra="forbid")

    sha256_hex: str
    is_public: Literal[False]
    root_index: int = Field(ge=0)


class EvidenceBundleResponse(BaseModel):
    """One onchain bundle (`evidenceRoots[root_index]`) with full file detail."""

    model_config = ConfigDict(extra="forbid")

    root_index: int = Field(ge=0)
    evidence_root: str
    files: list[EvidenceFileResponse]


class PublicEvidenceBundleResponse(BaseModel):
    """One onchain bundle as the public sees it (private files as fingerprints)."""

    model_config = ConfigDict(extra="forbid")

    root_index: int = Field(ge=0)
    evidence_root: str
    files: list[PublicFileResponse | PrivateFileFingerprint]


class ClaimFields(BaseModel):
    """Claim metadata shared by every view (all of it is public, spec F6)."""

    model_config = ConfigDict(extra="forbid")

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


class ClaimResponse(ClaimFields):
    """A claim for its authorized viewers: every bundle with full file detail."""

    bundles: list[EvidenceBundleResponse] = []


class PublicClaimResponse(ClaimFields):
    """A claim for anyone else: bundles with private files reduced to fingerprints."""

    bundles: list[PublicEvidenceBundleResponse] = []


class EvidenceUploadResponse(BaseModel):
    """Result of an upload: stored files plus their bundle's root, ready to anchor."""

    root_index: int = Field(ge=0)
    files: list[EvidenceFileResponse]
    evidence_root: str


class ManifestPublicFile(BaseModel):
    """Manifest entry of a public file; its name is a plain base name."""

    model_config = ConfigDict(extra="forbid")

    sha256: str = Field(pattern=BYTES32_HEX_PATTERN)
    public: Literal[True]
    name: str = Field(min_length=1, max_length=255, pattern=r"^[^/\\]+$")


class ManifestPrivateFile(BaseModel):
    """Manifest entry of a private file: fingerprint only, never a name."""

    model_config = ConfigDict(extra="forbid")

    sha256: str = Field(pattern=BYTES32_HEX_PATTERN)
    public: Literal[False]


class EvidenceManifest(BaseModel):
    """One bundle's file list, exactly `code/shared/manifest.schema.json` v1.

    Field names are camelCase on the wire because the schema is shared with
    the frontend verifier. Duplicate fingerprints are checked here because
    JSON Schema cannot express that uniqueness.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    version: Literal[1] = 1
    claim_id: str = Field(alias="claimId", pattern=BYTES32_HEX_PATTERN)
    root_index: int = Field(alias="rootIndex", ge=0)
    files: list[ManifestPublicFile | ManifestPrivateFile] = Field(min_length=1)

    @model_validator(mode="after")
    def _fingerprints_must_be_unique(self) -> EvidenceManifest:
        """Reject duplicate sha256 values (the Merkle recipe rejects them too)."""
        fingerprints = [item.sha256 for item in self.files]
        if len(set(fingerprints)) != len(fingerprints):
            raise ValueError("manifest files must have unique sha256 values")
        validated: EvidenceManifest = self
        return validated


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


# --- P4 public chain index (no login). camelCase on the wire, like the
# manifest, because the only consumer is the frontend. Everything here comes
# from public chain events: addresses, hashes, booleans, status names, blocks.


class _ChainModel(BaseModel):
    """Base for the public chain-index responses (aliases out, names in)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class PublicChainClaim(_ChainModel):
    """One claim as indexed from ClaimRegistry (verify status/roots onchain)."""

    claim_id: str = Field(alias="claimId", pattern=BYTES32_HEX_PATTERN)
    organization: str
    status: str
    anchored_block: int = Field(alias="anchoredBlock")
    anchored_at: datetime = Field(alias="anchoredAt")
    last_status_block: int = Field(alias="lastStatusBlock")
    last_status_at: datetime = Field(alias="lastStatusAt")


class PublicChainClaimList(_ChainModel):
    """A page of indexed claims, newest anchor first."""

    items: list[PublicChainClaim]
    total: int
    limit: int
    offset: int
    indexed_to_block: int | None = Field(alias="indexedToBlock")


class TimelineEvent(_ChainModel):
    """One registry event of a claim, in chain order."""

    block_number: int = Field(alias="blockNumber")
    tx_hash: str = Field(alias="txHash")
    log_index: int = Field(alias="logIndex")
    timestamp: datetime
    event: str
    args: dict[str, str | bool | int]


class ClaimTimeline(_ChainModel):
    """A claim's indexed history plus how fresh the index is.

    `status` and `evidenceRoots` are the indexer's projection: a convenience,
    not a proof. Integrity checks must read `statusOf` / `evidenceRoots` from
    the contract (the public page does).
    """

    claim_id: str = Field(alias="claimId", pattern=BYTES32_HEX_PATTERN)
    chain_id: int = Field(alias="chainId")
    claim_registry: str = Field(alias="claimRegistry")
    status: str | None
    evidence_roots: list[str] = Field(alias="evidenceRoots")
    events: list[TimelineEvent]
    indexed_to_block: int | None = Field(alias="indexedToBlock")


class IndexerStatus(_ChainModel):
    """Indexer freshness: `lag` = latest seen head − indexed block."""

    chain_id: int = Field(alias="chainId")
    participant_registry: str = Field(alias="participantRegistry")
    claim_registry: str = Field(alias="claimRegistry")
    deploy_block: int = Field(alias="deployBlock")
    indexed_to_block: int | None = Field(alias="indexedToBlock")
    head_block: int | None = Field(alias="headBlock")
    lag: int | None
    updated_at: datetime | None = Field(alias="updatedAt")
