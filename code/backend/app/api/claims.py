# =============================================================================
# Proof of Aid — Team 05 — Claim endpoints: create, read, upload evidence
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Claim lifecycle over HTTP (spec F2/F3, P3.4).

- `POST /claims` (org only): stores metadata, returns `claim_id_hex` and
  `metadata_hash_hex` for the wallet to anchor onchain (`anchorClaim`).
- `POST /claims/{id}/evidence` (owning org only): runs the P3.2 pipeline per
  file into bundle `root_index` (0 = original evidence, n = supplementary
  proof n) and returns that bundle's `evidence_root` ready to anchor. `public`
  applies to the batch; flip individual files via `PATCH /files/{id}`.
- `GET /claims/{id}`: metadata + one root per bundle (never bytes). Authorized
  viewers see full file detail; everyone else sees private files as
  fingerprints only (`api.views`).
- `GET /claims/{id}/bundles/{n}/manifest`: public per-bundle manifest in the
  `code/shared/manifest.schema.json` format.
"""

from __future__ import annotations

import re
import uuid
from typing import Final

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from poa_shared.result import Err

from app.api.auth import current_address
from app.api.views import authorized_claim_view, manifest_view, public_claim_view
from app.db import get_session
from app.models import Claim, EvidenceFile
from app.schemas import (
    ClaimCreate,
    ClaimResponse,
    EvidenceFileResponse,
    EvidenceManifest,
    EvidenceUploadResponse,
    PublicClaimResponse,
)
from app.services.access import can_view_private_evidence, require_organization
from app.services.bundles import (
    EvidenceBundle,
    build_bundles,
    bundle_root,
    check_bundle_target,
    highest_root_index,
)
from app.services.claims import claim_id_from_uuid, metadata_digest
from app.services.evidence import process_upload, safe_filename, store_packed
from app.settings import Settings

router = APIRouter(tags=["claims"])

MAX_UPLOAD_BYTES: Final[int] = 25 * 1024 * 1024
CLAIM_ID_PATTERN: Final[re.Pattern[str]] = re.compile(r"^0x[0-9a-f]{64}$")


def _claim_or_404(db: Session, claim_id_hex: str) -> Claim:
    """Fetch a claim by its hex id, or raise 404 (malformed ids are 404 too)."""
    if not CLAIM_ID_PATTERN.fullmatch(claim_id_hex):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "claim not found")
    claim = db.scalars(select(Claim).where(Claim.claim_id_hex == claim_id_hex)).first()
    if claim is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "claim not found")
    found: Claim = claim
    return found


def _files_of(db: Session, claim: Claim) -> list[EvidenceFile]:
    """Return every stored file of a claim, across all bundles."""
    files = list(db.scalars(select(EvidenceFile).where(EvidenceFile.claim_id == claim.id)).all())
    return files


def _bundles_of(db: Session, claim: Claim) -> list[EvidenceBundle]:
    """Return the claim's bundles with their roots (500 if a stored set is invalid)."""
    bundles = build_bundles(_files_of(db, claim))
    if isinstance(bundles, Err):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, bundles.message)
    grouped: list[EvidenceBundle] = bundles.value
    return grouped


@router.post("/claims", response_model=ClaimResponse, status_code=status.HTTP_201_CREATED)
def create_claim(
    request: Request, payload: ClaimCreate, db: Session = Depends(get_session)
) -> ClaimResponse:
    """Create a claim as the logged-in organization; return ids for anchoring."""
    viewer = current_address(request)
    if viewer is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "login required")
    authorized = require_organization(db, viewer)
    if isinstance(authorized, Err):
        raise HTTPException(status.HTTP_403_FORBIDDEN, authorized.message)
    claim_uuid = uuid.uuid4()
    claim_id = claim_id_from_uuid(claim_uuid)
    digest = metadata_digest(
        title=payload.title,
        description=payload.description,
        location_region=payload.location_region,
        claim_date=payload.claim_date,
        claim_id=claim_id,
    )
    if isinstance(digest, Err):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, digest.message)
    claim = Claim(
        id=claim_uuid,
        claim_id_hex=f"0x{claim_id.hex()}",
        title=payload.title.strip(),
        description=payload.description.strip(),
        location_region=payload.location_region.strip(),
        claim_date=payload.claim_date,
        metadata_hash_hex=f"0x{digest.value.hex()}",
        created_by=viewer,
    )
    db.add(claim)
    db.commit()
    db.refresh(claim)
    created: ClaimResponse = authorized_claim_view(claim, [])
    return created


@router.get("/claims/{claim_id_hex}", response_model=ClaimResponse | PublicClaimResponse)
def read_claim(
    request: Request, claim_id_hex: str, db: Session = Depends(get_session)
) -> ClaimResponse | PublicClaimResponse:
    """Claim metadata and per-bundle roots (spec F6: no bytes, no login needed).

    The file detail depends on the viewer: the access matrix that guards
    private downloads also guards private names, types, sizes and uploaders.
    """
    claim = _claim_or_404(db, claim_id_hex)
    bundles = _bundles_of(db, claim)
    authorized = can_view_private_evidence(db, viewer=current_address(request), claim=claim)
    view: ClaimResponse | PublicClaimResponse = (
        authorized_claim_view(claim, bundles) if authorized else public_claim_view(claim, bundles)
    )
    return view


@router.get(
    "/claims/{claim_id_hex}/bundles/{root_index}/manifest",
    response_model=EvidenceManifest,
)
def read_bundle_manifest(
    claim_id_hex: str, root_index: int, db: Session = Depends(get_session)
) -> EvidenceManifest:
    """Public manifest of one bundle (`evidenceRoots(claimId)[root_index]`).

    Untrusted by design: the verifier page recomputes the root from the
    fingerprints and accepts the list only if it matches the chain.
    """
    claim = _claim_or_404(db, claim_id_hex)
    bundle = next(
        (item for item in _bundles_of(db, claim) if item.root_index == root_index), None
    )
    if bundle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "bundle not found")
    manifest = manifest_view(claim, bundle)
    if isinstance(manifest, Err):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, manifest.message)
    published: EvidenceManifest = manifest.value
    return published


@router.post(
    "/claims/{claim_id_hex}/evidence",
    response_model=EvidenceUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_evidence(
    request: Request,
    claim_id_hex: str,
    files: list[UploadFile] = File(...),
    public: bool = Form(False),
    root_index: int = Form(0, ge=0),
    db: Session = Depends(get_session),
) -> EvidenceUploadResponse:
    """Run the evidence pipeline for each file into bundle `root_index` (owning org only)."""
    viewer = current_address(request)
    if viewer is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "login required")
    claim = _claim_or_404(db, claim_id_hex)
    if claim.created_by != viewer:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the owning organization uploads here")
    if not files:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "at least one file is required")
    # Checked before any processing: a sealed or gapped bundle fails fast and
    # writes nothing to storage.
    target = check_bundle_target(highest_root_index(_files_of(db, claim)), root_index)
    if isinstance(target, Err):
        raise HTTPException(status.HTTP_409_CONFLICT, target.message)
    settings: Settings = request.app.state.settings
    claim_id = bytes.fromhex(claim.claim_id_hex.removeprefix("0x"))
    stored: list[EvidenceFile] = []
    for upload in files:
        data = await upload.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "file exceeds 25 MiB")
        processed = process_upload(data, master_key=settings.encryption_key_bytes, claim_id=claim_id)
        if isinstance(processed, Err):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, processed.message)
        sha_hex = f"0x{processed.value.file_hash.hex()}"
        duplicate = (
            db.scalars(
                select(EvidenceFile).where(
                    EvidenceFile.claim_id == claim.id, EvidenceFile.sha256_hex == sha_hex
                )
            ).first()
            is not None
        )
        # Same bytes twice in one request would otherwise hit the unique
        # constraint at commit time as a 500 instead of a clear 409.
        if duplicate or any(item.sha256_hex == sha_hex for item in stored):
            raise HTTPException(status.HTTP_409_CONFLICT, "file already uploaded to this claim")
        saved = store_packed(settings.storage_path, processed.value.packed)
        if isinstance(saved, Err):
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, saved.message)
        stored.append(
            EvidenceFile(
                claim_id=claim.id,
                sha256_hex=sha_hex,
                storage_name=saved.value,
                original_name=safe_filename(upload.filename),
                mime_type=upload.content_type or "application/octet-stream",
                size_bytes=processed.value.size_bytes,
                is_public=public,
                root_index=target.value,
                uploaded_by=viewer,
            )
        )
    db.add_all(stored)
    db.commit()
    for item in stored:
        db.refresh(item)
    bundle_files = [item for item in _files_of(db, claim) if item.root_index == target.value]
    root = bundle_root(bundle_files)
    if isinstance(root, Err):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, root.message)
    uploaded = EvidenceUploadResponse(
        root_index=target.value,
        files=[EvidenceFileResponse.model_validate(item) for item in stored],
        evidence_root=root.value,
    )
    return uploaded
