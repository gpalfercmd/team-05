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
  file and returns the `evidence_root` ready to anchor. `public` applies to
  the batch; flip individual files via `PATCH /files/{id}`.
- `GET /claims/{id}`: public metadata + file hashes + root (never bytes).
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
from app.db import get_session
from app.models import Claim, EvidenceFile
from app.schemas import ClaimCreate, ClaimResponse, EvidenceFileResponse, EvidenceUploadResponse
from app.services.access import require_organization
from app.services.claims import build_evidence_root, claim_id_from_uuid, metadata_digest
from app.services.evidence import process_upload, store_packed
from app.settings import Settings

router = APIRouter(tags=["claims"])

MAX_UPLOAD_BYTES: Final[int] = 25 * 1024 * 1024
CLAIM_ID_PATTERN: Final[re.Pattern[str]] = re.compile(r"^0x[0-9a-f]{64}$")
FILENAME_SAFE_PATTERN: Final[re.Pattern[str]] = re.compile(r"[^A-Za-z0-9._-]+")


def _claim_or_404(db: Session, claim_id_hex: str) -> Claim:
    """Fetch a claim by its hex id, or raise 404 (malformed ids are 404 too)."""
    if not CLAIM_ID_PATTERN.fullmatch(claim_id_hex):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "claim not found")
    claim = db.scalars(select(Claim).where(Claim.claim_id_hex == claim_id_hex)).first()
    if claim is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "claim not found")
    found: Claim = claim
    return found


def _root_of(hashes: list[bytes]) -> str | None:
    """Return the `0x` evidence root, or None when the claim holds no files."""
    if not hashes:
        return None
    root = build_evidence_root(hashes)
    if isinstance(root, Err):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, root.message)
    hexed: str | None = f"0x{root.value.hex()}"
    return hexed


def _claim_response(db: Session, claim: Claim) -> ClaimResponse:
    """Serialize a claim with its files and current root."""
    files = db.scalars(select(EvidenceFile).where(EvidenceFile.claim_id == claim.id)).all()
    hashes = [bytes.fromhex(item.sha256_hex.removeprefix("0x")) for item in files]
    response = ClaimResponse(
        id=claim.id,
        claim_id_hex=claim.claim_id_hex,
        title=claim.title,
        description=claim.description,
        location_region=claim.location_region,
        claim_date=claim.claim_date,
        metadata_hash_hex=claim.metadata_hash_hex,
        created_by=claim.created_by,
        auditor_address=claim.auditor_address,
        created_at=claim.created_at,
        evidence=[EvidenceFileResponse.model_validate(item) for item in files],
        evidence_root=_root_of(hashes),
    )
    return response


def _safe_filename(name: str | None) -> str:
    """Strip paths and unsafe chars from an upload name (never logged anyway)."""
    if not name:
        return "upload.bin"
    base = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    cleaned = FILENAME_SAFE_PATTERN.sub("_", base).strip("._") or "upload.bin"
    trimmed: str = cleaned[:100]
    return trimmed


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
    created: ClaimResponse = _claim_response(db, claim)
    return created


@router.get("/claims/{claim_id_hex}", response_model=ClaimResponse)
def read_claim(claim_id_hex: str, db: Session = Depends(get_session)) -> ClaimResponse:
    """Public claim metadata, file hashes and root (spec F6: no bytes, no login)."""
    claim = _claim_or_404(db, claim_id_hex)
    public: ClaimResponse = _claim_response(db, claim)
    return public


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
    db: Session = Depends(get_session),
) -> EvidenceUploadResponse:
    """Run the evidence pipeline for each file (owning org only)."""
    viewer = current_address(request)
    if viewer is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "login required")
    claim = _claim_or_404(db, claim_id_hex)
    if claim.created_by != viewer:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the owning organization uploads here")
    if not files:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "at least one file is required")
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
        if duplicate:
            raise HTTPException(status.HTTP_409_CONFLICT, "file already uploaded to this claim")
        saved = store_packed(settings.storage_path, processed.value.packed)
        if isinstance(saved, Err):
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, saved.message)
        stored.append(
            EvidenceFile(
                claim_id=claim.id,
                sha256_hex=sha_hex,
                storage_name=saved.value,
                original_name=_safe_filename(upload.filename),
                mime_type=upload.content_type or "application/octet-stream",
                size_bytes=processed.value.size_bytes,
                is_public=public,
                uploaded_by=viewer,
            )
        )
    db.add_all(stored)
    db.commit()
    for item in stored:
        db.refresh(item)
    all_files = db.scalars(select(EvidenceFile).where(EvidenceFile.claim_id == claim.id)).all()
    root = _root_of([bytes.fromhex(item.sha256_hex.removeprefix("0x")) for item in all_files])
    if root is None:  # unreachable: we just stored files, but stay total
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "evidence root missing")
    uploaded = EvidenceUploadResponse(
        files=[EvidenceFileResponse.model_validate(item) for item in stored],
        evidence_root=root,
    )
    return uploaded
