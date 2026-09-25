# =============================================================================
# Proof of Aid — Team 05 — Note endpoints: store a salted note before anchoring, read notes back
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Notes behind anchored fingerprints (P10.3, `services.notes`).

- `POST /claims/{id}/notes` (any signed-in wallet, as author): text, salt and
  `note_hash`; the hash must be keccak256(salt ‖ utf8(text)). Stored sealed
  with the claim key; the same fingerprint twice in one claim is a 409.
- `GET /claims/{id}/notes` (signed in): every note for the claim's authorized
  viewers, the viewer's own notes for anyone else. Never public.

Whether a stored note was actually anchored is checked by the reader against
the claim's onchain history, not here.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from poa_shared.result import Err

from app.api.auth import current_address
from app.api.claims import _claim_or_404
from app.db import get_session
from app.models import Claim, ClaimNote
from app.schemas import NoteCreate, NoteList, NoteResponse
from app.services.access import RoleSource
from app.services.notes import open_note, readable_notes, seal_note
from app.settings import Settings

router = APIRouter(tags=["notes"])


def _signed_in(request: Request) -> str:
    """The session's wallet, or 401: notes are never served to anonymous visitors."""
    viewer = current_address(request)
    if viewer is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "login required")
    signed_in: str = viewer
    return signed_in


def _note_response(row: ClaimNote, claim: Claim, settings: Settings) -> NoteResponse:
    """Decrypt one row into its response (500 if a stored note cannot be opened)."""
    opened = open_note(row, master_key=settings.encryption_key_bytes, claim=claim)
    if isinstance(opened, Err):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, opened.message)
    response = NoteResponse(
        id=row.id,
        claim_id=claim.claim_id_hex,
        kind=row.kind,
        author=row.author,
        note_hash=row.note_hash_hex,
        text=opened.value.text,
        salt=f"0x{opened.value.salt.hex()}",
        created_at=row.created_at,
    )
    return response


@router.post(
    "/claims/{claim_id_hex}/notes", response_model=NoteResponse, status_code=status.HTTP_201_CREATED
)
def store_note(
    request: Request, claim_id_hex: str, payload: NoteCreate, db: Session = Depends(get_session)
) -> NoteResponse:
    """Check and seal a note the signed-in wallet is about to anchor."""
    author = _signed_in(request)
    claim = _claim_or_404(db, claim_id_hex)
    settings: Settings = request.app.state.settings
    sealed = seal_note(
        text=payload.text,
        salt=bytes.fromhex(payload.salt.removeprefix("0x")),
        expected_hash=bytes.fromhex(payload.note_hash.removeprefix("0x")),
        master_key=settings.encryption_key_bytes,
        claim=claim,
    )
    if isinstance(sealed, Err):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, sealed.message)
    duplicate = db.scalars(
        select(ClaimNote).where(
            ClaimNote.claim_id == claim.id, ClaimNote.note_hash_hex == payload.note_hash
        )
    ).first()
    if duplicate is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "this note fingerprint is already stored")
    row = ClaimNote(
        claim_id=claim.id,
        kind=payload.kind,
        author=author,
        note_hash_hex=payload.note_hash,
        text_sealed=sealed.value.text_sealed,
        salt_sealed=sealed.value.salt_sealed,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    stored = _note_response(row, claim, settings)
    return stored


@router.get("/claims/{claim_id_hex}/notes", response_model=NoteList)
def read_notes(request: Request, claim_id_hex: str, db: Session = Depends(get_session)) -> NoteList:
    """The claim's notes this session may read (see module docstring)."""
    viewer = _signed_in(request)
    claim = _claim_or_404(db, claim_id_hex)
    roles: RoleSource = request.app.state.role_source
    settings: Settings = request.app.state.settings
    rows = readable_notes(db, viewer=viewer, claim=claim, roles=roles)
    notes = NoteList(notes=[_note_response(row, claim, settings) for row in rows])
    return notes
