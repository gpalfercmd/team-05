# =============================================================================
# Proof of Aid — Team 05 — Wallet login helpers: EIP-191 challenge/response
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""Wallet-signature login (spec P3.4). The backend never holds user keys: the
wallet signs a single-use nonce message and `eth-account` recovers the signer.

Anti-replay: each nonce is stored, expires after `CHALLENGE_TTL_MINUTES`, and
is marked `used` on first successful verification.
"""

from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Final

from eth_account import Account
from eth_account.messages import encode_defunct
from eth_keys.exceptions import BadSignature
from sqlalchemy import select
from sqlalchemy.orm import Session

from poa_shared.result import Err, Ok, Result

from app.models import Challenge

CHALLENGE_TTL_MINUTES: Final[int] = 10
ADDRESS_PATTERN: Final[re.Pattern[str]] = re.compile(r"^0x[0-9a-fA-F]{40}$")
SIGNATURE_PATTERN: Final[re.Pattern[str]] = re.compile(r"^0x[0-9a-fA-F]{130}$")


def normalize_address(value: str) -> Result[str]:
    """Validate `0x` + 40 hex chars and return the lowercase address."""
    if not ADDRESS_PATTERN.fullmatch(value):
        return Err("address must be 0x followed by 40 hex characters")
    normalized: Result[str] = Ok(value.lower())
    return normalized


def build_message(address: str, nonce: str, expires_at: datetime) -> str:
    """Build the exact EIP-191 text the wallet signs (must be byte-stable)."""
    message = (
        "Sign in to ClearTrust\n"
        f"\nAddress: {address}\nNonce: {nonce}\nExpires: {expires_at.isoformat()}"
    )
    return message


def create_challenge(db: Session, address: str) -> Challenge:
    """Store a fresh single-use challenge for `address` (address pre-validated)."""
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=CHALLENGE_TTL_MINUTES)
    nonce = secrets.token_hex(32)
    challenge = Challenge(
        address=address,
        nonce=nonce,
        message=build_message(address, nonce, expires_at),
        expires_at=expires_at,
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)
    stored: Challenge = challenge
    return stored


def find_valid_challenge(db: Session, address: str, now: datetime) -> Challenge | None:
    """Return the newest unused, unexpired challenge for `address`, if any.

    Expiry is filtered in Python (not SQL) because SQLite returns naive
    datetimes while PostgreSQL returns aware ones — `_as_aware` unifies both.
    """
    statement = (
        select(Challenge)
        .where(Challenge.address == address, Challenge.used.is_(False))
        .order_by(Challenge.expires_at.desc())
    )
    candidates = db.scalars(statement).all()
    valid = [item for item in candidates if _as_aware(item.expires_at) > now]
    found: Challenge | None = valid[0] if valid else None
    return found


def _as_aware(value: datetime) -> datetime:
    """Attach UTC when the database driver returns a naive datetime (SQLite)."""
    aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return aware


def verify_signature(*, message: str, signature: str, expected_address: str) -> Result[str]:
    """Recover the EIP-191 signer and compare it to `expected_address`."""
    if not SIGNATURE_PATTERN.fullmatch(signature):
        return Err("signature must be 0x followed by 130 hex characters")
    try:
        recovered = Account.recover_message(encode_defunct(text=message), signature=signature)
    except (BadSignature, ValueError, TypeError) as cause:
        return Err("signature recovery failed", cause)
    if recovered.lower() != expected_address:
        return Err("signature does not match the challenge address")
    verified: Result[str] = Ok(recovered.lower())
    return verified
