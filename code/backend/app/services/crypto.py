# =============================================================================
# Proof of Aid — Team 05 — AES-256-GCM encryption for evidence at rest
# Copyright (c) 2026 Guillermo Palau Fernández, Iago Rey Rey, Francisco Barbero Vázquez
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops · https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""File encryption at rest (spec F3, P3.2).

Each claim gets its own key derived from the master `EVIDENCE_ENCRYPTION_KEY`
via HKDF with the claim's `claim_id` as salt, so one leaked claim key never
exposes other claims. Every file uses a fresh random 96-bit nonce; the stored
blob is `nonce(12) | ciphertext | tag(16)`. Failures return `Err`, never raise.

Since P8.2 the claim key also seals each file's commitment salt, and a
separate per-claim HMAC key (derived from the claim key) tags the sanitized
bytes so duplicates are still detected although salted commitments differ.
"""

from __future__ import annotations

import hashlib
import hmac
import os
from typing import Final

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from poa_shared.result import Err, Ok, Result

AES_KEY_LENGTH: Final[int] = 32
NONCE_LENGTH: Final[int] = 12
TAG_LENGTH: Final[int] = 16
KDF_INFO: Final[bytes] = b"proof-of-aid evidence v1"
DEDUP_KEY_LABEL: Final[bytes] = b"proof-of-aid duplicate detection v1"


def derive_claim_key(master_key: bytes, claim_id: bytes) -> Result[bytes]:
    """Derive a 32-byte claim key: HKDF(master, salt=claim_id)."""
    if len(master_key) != AES_KEY_LENGTH:
        return Err(f"master key must be {AES_KEY_LENGTH} bytes")
    if len(claim_id) != AES_KEY_LENGTH:
        return Err(f"claim id must be {AES_KEY_LENGTH} bytes")
    kdf = HKDF(algorithm=hashes.SHA256(), length=AES_KEY_LENGTH, salt=claim_id, info=KDF_INFO)
    derived: Result[bytes] = Ok(kdf.derive(master_key))
    return derived


def encrypt_bytes(plaintext: bytes, key: bytes) -> Result[bytes]:
    """Encrypt with AES-GCM; return the packed `nonce | ciphertext | tag` blob."""
    if len(key) != AES_KEY_LENGTH:
        return Err(f"key must be {AES_KEY_LENGTH} bytes")
    nonce = os.urandom(NONCE_LENGTH)
    blob = AESGCM(key).encrypt(nonce, plaintext, None)
    packed: Result[bytes] = Ok(nonce + blob)
    return packed


def decrypt_bytes(packed: bytes, key: bytes) -> Result[bytes]:
    """Decrypt a packed blob; tampered or wrong-key input returns `Err`."""
    if len(key) != AES_KEY_LENGTH:
        return Err(f"key must be {AES_KEY_LENGTH} bytes")
    if len(packed) < NONCE_LENGTH + TAG_LENGTH + 1:
        return Err("packed blob is too short to hold nonce, data and tag")
    nonce = packed[:NONCE_LENGTH]
    blob = packed[NONCE_LENGTH:]
    try:
        plaintext = AESGCM(key).decrypt(nonce, blob, None)
    except InvalidTag as cause:
        return Err("decryption failed: wrong key or tampered data", cause)
    decrypted: Result[bytes] = Ok(plaintext)
    return decrypted


def dedup_tag(content: bytes, claim_key: bytes) -> Result[bytes]:
    """Return HMAC-SHA256(dedup_key, content), dedup_key = HMAC(claim_key, label).

    Keyed per claim, so the tag reveals nothing to someone without the claim
    key and two claims holding the same file get unrelated tags.
    """
    if len(claim_key) != AES_KEY_LENGTH:
        return Err(f"key must be {AES_KEY_LENGTH} bytes")
    dedup_key = hmac.new(claim_key, DEDUP_KEY_LABEL, hashlib.sha256).digest()
    tag: Result[bytes] = Ok(hmac.new(dedup_key, content, hashlib.sha256).digest())
    return tag
