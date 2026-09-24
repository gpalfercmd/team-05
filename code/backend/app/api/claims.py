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

Salted commitments (P8.2): each upload is fingerprinted as SHA-256(salt ‖
bytes). Duplicates are caught by a per-claim HMAC of the sanitized bytes, and
by the plain SHA-256 against unsalted rows from before P8.2.
"""

from __future__ import annotations

import re
import uuid
from typing import Final

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from poa_shared.result import Err

from app.api.auth import current_address
from app.api.views import (
    Salts,
    authorized_claim_view,
    file_response,
    manifest_view,
    public_claim_view,
)
from app.db import get_session
from app.models import Claim, EvidenceFile
from app.schemas import (
    ClaimCreate,
    ClaimResponse,
    EvidenceManifest,
    EvidenceUploadResponse,
    PublicClaimResponse,
)
from app.services.access import RoleSource, can_view_private_evidence, require_organization
from app.services.bundles import (
    EvidenceBundle,
    build_bundles,
    bundle_root,
    check_bundle_target,
    highest_root_index,
)
from app.services.claims import claim_id_from_uuid, metadata_digest
from app.services.evidence import (
    ProcessedFile,
    process_upload,
    safe_filename,
    store_packed,
    unseal_salts,
)
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


def _salts_of(request: Request, claim: Claim, files: list[EvidenceFile]) -> Salts:
    """Unseal the salts of a claim's files (500 if a stored salt cannot be decrypted)."""
    settings: Settings = request.app.state.settings
    salts = unseal_salts(
        files,
        master_key=settings.encryption_key_bytes,
        claim_id=bytes.fromhex(claim.claim_id_hex.removeprefix("0x")),
    )
    if isinstance(salts, Err):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, salts.message)
    unsealed: Salts = salts.value
    return unsealed


def _is_duplicate(
    db: Session, claim: Claim, processed: ProcessedFile, pending: list[EvidenceFile]
) -> bool:
    """True when the same sanitized bytes are already in the claim or in this request.

    Salted rows match on the keyed tag; unsalted pre-P8.2 rows on their plain SHA-256.
    """
    tag_hex = f"0x{processed.dedup_tag.hex()}"
    plain_hex = f"0x{processed.plain_hash.hex()}"
    stored = db.scalars(
        select(EvidenceFile).where(
            EvidenceFile.claim_id == claim.id,
            or_(
                EvidenceFile.dedup_tag_hex == tag_hex,
                and_(EvidenceFile.salt_sealed.is_(None), EvidenceFile.sha256_hex == plain_hex),
            ),
        )
    ).first()
    duplicate = stored is not None or any(item.dedup_tag_hex == tag_hex for item in pending)
    return duplicate


@router.post("/claims", response_model=ClaimResponse, status_code=status.HTTP_201_CREATED)
def create_claim(
    request: Request, payload: ClaimCreate, db: Session = Depends(get_session)
) -> ClaimResponse:
    """Create a claim as the logged-in organization; return ids for anchoring."""
    viewer = current_address(request)
    if viewer is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "login required")
    roles: RoleSource = request.app.state.role_source
    authorized = require_organization(db, viewer, roles=roles)
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
    created: ClaimResponse = authorized_claim_view(claim, [], {})
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
    roles: RoleSource = request.app.state.role_source
    authorized = can_view_private_evidence(
        db, viewer=current_address(request), claim=claim, roles=roles
    )
    salts = _salts_of(request, claim, [item for bundle in bundles for item in bundle.files])
    view: ClaimResponse | PublicClaimResponse = (
        authorized_claim_view(claim, bundles, salts)
        if authorized
        else public_claim_view(claim, bundles, salts)
    )
    return view


@router.get(
    "/claims/{claim_id_hex}/bundles/{root_index}/manifest",
    response_model=EvidenceManifest,
    # An unsalted public entry omits `salt` instead of sending null (schema v1 has no salt).
    response_model_exclude_none=True,
)
def read_bundle_manifest(
    request: Request, claim_id_hex: str, root_index: int, db: Session = Depends(get_session)
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
    manifest = manifest_view(claim, bundle, _salts_of(request, claim, list(bundle.files)))
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
    # A revoked organization keeps ownership of its claims but may not add evidence.
    roles: RoleSource = request.app.state.role_source
    accredited = require_organization(db, viewer, roles=roles)
    if isinstance(accredited, Err):
        raise HTTPException(status.HTTP_403_FORBIDDEN, accredited.message)
    if not files:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "at least one file is required")
    # Lock the claim row first so two concurrent uploads cannot both read the same
    # highest bundle and both pass the seal/gap check; the lock is released at
    # commit. (SQLite ignores FOR UPDATE but serializes writers, so tests still pass.)
    db.execute(select(Claim).where(Claim.id == claim.id).with_for_update())
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
        # Same bytes twice in one request would otherwise hit the unique
        # constraint at commit time as a 500 instead of a clear 409.
        if _is_duplicate(db, claim, processed.value, stored):
            raise HTTPException(status.HTTP_409_CONFLICT, "file already uploaded to this claim")
        saved = store_packed(settings.storage_path, processed.value.packed)
        if isinstance(saved, Err):
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, saved.message)
        stored.append(
            EvidenceFile(
                claim_id=claim.id,
                sha256_hex=f"0x{processed.value.file_hash.hex()}",
                salt_sealed=processed.value.sealed_salt,
                dedup_tag_hex=f"0x{processed.value.dedup_tag.hex()}",
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
    # Only the uploading organization sees this response, so private salts are fine here.
    salts = _salts_of(request, claim, stored)
    bundle_files = [item for item in _files_of(db, claim) if item.root_index == target.value]
    root = bundle_root(bundle_files)
    if isinstance(root, Err):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, root.message)
    uploaded = EvidenceUploadResponse(
        root_index=target.value,
        files=[file_response(item, salts.get(item.id)) for item in stored],
        evidence_root=root.value,
    )
    return uploaded
