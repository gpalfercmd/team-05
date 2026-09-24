# =============================================================================
# Proof of Aid — Team 05 — Viewer-dependent claim views and bundle manifests
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""What each viewer may see of a claim's evidence (spec F3/F6, P5.4 manifest).

- Authorized viewers (access matrix: owning org, its internal verifiers, the
  assigned auditor) get every file with full metadata.
- Everyone else gets public files with id/name/type/size (enough to download
  and re-hash) and private files as `sha256 + bundle` only, because a private
  file's name, type, size or uploader can identify a beneficiary.
- Manifests follow `code/shared/manifest.schema.json`: names for public files
  only, re-sanitized so no path separator can reach the verifier page.

Views are assembled field by field into dedicated models instead of dumping
ORM rows, so adding a column never publishes it by accident.
"""

from __future__ import annotations

from pydantic import ValidationError

from poa_shared.result import Err, Ok, Result

from app.models import Claim, EvidenceFile
from app.schemas import (
    ClaimFields,
    ClaimResponse,
    EvidenceBundleResponse,
    EvidenceFileResponse,
    EvidenceManifest,
    ManifestPrivateFile,
    ManifestPublicFile,
    PrivateFileFingerprint,
    PublicClaimResponse,
    PublicEvidenceBundleResponse,
    PublicFileResponse,
)
from app.services.bundles import EvidenceBundle
from app.services.evidence import safe_filename


def authorized_claim_view(claim: Claim, bundles: list[EvidenceBundle]) -> ClaimResponse:
    """Serialize a claim with full file detail (authorized viewers only)."""
    view = ClaimResponse(
        **_claim_fields(claim),
        bundles=[
            EvidenceBundleResponse(
                root_index=bundle.root_index,
                evidence_root=bundle.evidence_root,
                files=[EvidenceFileResponse.model_validate(item) for item in bundle.files],
            )
            for bundle in bundles
        ],
    )
    return view


def public_claim_view(claim: Claim, bundles: list[EvidenceBundle]) -> PublicClaimResponse:
    """Serialize a claim for anonymous or unauthorized viewers."""
    view = PublicClaimResponse(
        **_claim_fields(claim),
        bundles=[
            PublicEvidenceBundleResponse(
                root_index=bundle.root_index,
                evidence_root=bundle.evidence_root,
                files=[_public_file(item) for item in bundle.files],
            )
            for bundle in bundles
        ],
    )
    return view


def manifest_view(claim: Claim, bundle: EvidenceBundle) -> Result[EvidenceManifest]:
    """Build the bundle manifest; `Err` if stored data breaks the shared schema."""
    try:
        manifest = EvidenceManifest(
            version=1,
            claimId=claim.claim_id_hex.lower(),
            rootIndex=bundle.root_index,
            files=[_manifest_entry(item) for item in bundle.files],
        )
    except ValidationError as cause:
        return Err("stored evidence does not fit the manifest schema", cause)
    built: Result[EvidenceManifest] = Ok(manifest)
    return built


def _claim_fields(claim: Claim) -> dict[str, object]:
    """Return the claim metadata every viewer may see (spec F6)."""
    fields: dict[str, object] = ClaimFields.model_validate(claim, from_attributes=True).model_dump()
    return fields


def _public_file(item: EvidenceFile) -> PublicFileResponse | PrivateFileFingerprint:
    """Public files keep download metadata; private ones shrink to a fingerprint."""
    if not item.is_public:
        return PrivateFileFingerprint(
            sha256_hex=item.sha256_hex, is_public=False, root_index=item.root_index
        )
    entry: PublicFileResponse | PrivateFileFingerprint = PublicFileResponse(
        id=item.id,
        sha256_hex=item.sha256_hex,
        original_name=item.original_name,
        mime_type=item.mime_type,
        size_bytes=item.size_bytes,
        is_public=True,
        root_index=item.root_index,
    )
    return entry


def _manifest_entry(item: EvidenceFile) -> ManifestPublicFile | ManifestPrivateFile:
    """Map one file to its manifest entry; a name only when the file is public."""
    fingerprint = item.sha256_hex.lower()
    if not item.is_public:
        return ManifestPrivateFile(sha256=fingerprint, public=False)
    entry: ManifestPublicFile | ManifestPrivateFile = ManifestPublicFile(
        sha256=fingerprint, public=True, name=safe_filename(item.original_name)
    )
    return entry
