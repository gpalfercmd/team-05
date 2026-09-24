# =============================================================================
# Proof of Aid — Team 05 — Auth endpoints: challenge, verify, session
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Wallet login over HTTP (spec P3.4). Flow: `POST /auth/challenge` →
sign `message` in MetaMask → `POST /auth/verify` → session cookie.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from poa_shared.result import Err

from app.db import get_session
from app.schemas import (
    ChallengeRequest,
    ChallengeResponse,
    SessionResponse,
    VerifyRequest,
)
from app.services.auth import (
    create_challenge,
    find_valid_challenge,
    normalize_address,
    verify_signature,
)

router = APIRouter(tags=["auth"])


def current_address(request: Request) -> str | None:
    """Return the logged-in wallet address, or None for anonymous requests."""
    address = request.session.get("address")
    viewer: str | None = address if isinstance(address, str) else None
    return viewer


@router.post("/auth/challenge", response_model=ChallengeResponse)
def issue_challenge(payload: ChallengeRequest, db: Session = Depends(get_session)) -> ChallengeResponse:
    """Store and return a fresh login challenge for a well-formed address."""
    address = normalize_address(payload.address)
    if isinstance(address, Err):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, address.message)
    challenge = create_challenge(db, address.value)
    issued = ChallengeResponse(
        message=challenge.message, nonce=challenge.nonce, expires_at=challenge.expires_at
    )
    return issued


@router.post("/auth/verify", response_model=SessionResponse)
def verify_login(
    request: Request, payload: VerifyRequest, db: Session = Depends(get_session)
) -> SessionResponse:
    """Check the signature against the newest valid challenge and open a session."""
    address = normalize_address(payload.address)
    if isinstance(address, Err):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, address.message)
    challenge = find_valid_challenge(db, address.value, datetime.now(timezone.utc))
    if challenge is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no valid challenge for this address")
    verified = verify_signature(
        message=challenge.message, signature=payload.signature, expected_address=address.value
    )
    if isinstance(verified, Err):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, verified.message)
    challenge.used = True
    db.commit()
    request.session["address"] = verified.value
    logged_in = SessionResponse(address=verified.value)
    return logged_in


@router.get("/auth/me", response_model=SessionResponse)
def read_session(request: Request) -> SessionResponse:
    """Return the current session's address (401 when logged out)."""
    viewer = current_address(request)
    if viewer is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not logged in")
    session = SessionResponse(address=viewer)
    return session


@router.post("/auth/logout")
def logout(request: Request) -> dict[str, str]:
    """Clear the session cookie."""
    request.session.clear()
    done: dict[str, str] = {"status": "logged out"}
    return done
