# =============================================================================
# Proof of Aid — Team 05 — File endpoints: authorized download + visibility
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Evidence file access (spec F3, P3.4).

- `GET /files/{id}`: public files stream to anyone; private files decrypt
  only for the owning org, its verifiers and the assigned auditor
  (`services.access`). Denied reads return 404, indistinguishable from a
  missing file, so ids are not an existence oracle.
- `PATCH /files/{id}`: the owning org flips the per-file `public` flag.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from poa_shared.result import Err

from app.api.auth import current_address
from app.db import get_session
from app.models import EvidenceFile
from app.schemas import EvidenceFileResponse, FileVisibilityUpdate
from app.services.access import can_read_file
from app.services.crypto import decrypt_bytes, derive_claim_key
from app.services.evidence import load_packed
from app.settings import Settings

router = APIRouter(tags=["files"])


@router.get("/files/{file_id}")
def download_file(
    request: Request, file_id: uuid.UUID, db: Session = Depends(get_session)
) -> Response:
    """Stream the decrypted bytes when the access matrix allows it."""
    stored = db.get(EvidenceFile, file_id)
    if stored is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "file not found")
    viewer = current_address(request)
    if not can_read_file(db, viewer=viewer, claim=stored.claim, evidence_file=stored):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "file not found")
    settings: Settings = request.app.state.settings
    claim_id = bytes.fromhex(stored.claim.claim_id_hex.removeprefix("0x"))
    key = derive_claim_key(settings.encryption_key_bytes, claim_id)
    if isinstance(key, Err):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, key.message)
    packed = load_packed(settings.storage_path, stored.storage_name)
    if isinstance(packed, Err):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, packed.message)
    plain = decrypt_bytes(packed.value, key.value)
    if isinstance(plain, Err):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, plain.message)
    return Response(
        content=plain.value,
        media_type=stored.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{stored.original_name}"'},
    )


@router.patch("/files/{file_id}", response_model=EvidenceFileResponse)
def set_visibility(
    request: Request,
    file_id: uuid.UUID,
    payload: FileVisibilityUpdate,
    db: Session = Depends(get_session),
) -> EvidenceFileResponse:
    """Flip `is_public` (owning organization only)."""
    viewer = current_address(request)
    if viewer is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "login required")
    stored = db.get(EvidenceFile, file_id)
    if stored is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "file not found")
    if stored.claim.created_by != viewer:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the owning organization changes visibility")
    stored.is_public = payload.is_public
    db.commit()
    db.refresh(stored)
    updated = EvidenceFileResponse.model_validate(stored)
    return updated
